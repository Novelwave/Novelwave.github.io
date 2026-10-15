(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    startAtTopOnRefresh();
    setUpInPageLinks();
    setUpTourPlayer();
    setUpSpeedDemo();
    setUpCoverDemo();
    setUpGallery();

    // Every refresh opens on the hero, so its opening sequence always plays: the browser stops
    // restoring the previous scroll position, and a reload of a #section link drops the section.
    function startAtTopOnRefresh() {
        history.scrollRestoration = "manual";

        const navigation = performance.getEntriesByType("navigation")[0];

        if (navigation?.type === "reload" && location.hash) {
            history.replaceState(null, "", location.pathname + location.search);
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
    }

    // Scrolls to in-page sections without writing them into the URL, so a refresh starts at the
    // top of the page instead of jumping back to wherever a link last pointed. Shared links that
    // already carry a #section still open there, as the browser handles those on load.
    function setUpInPageLinks() {
        document.addEventListener("click", (event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }

            const link = event.target.closest('a[href^="#"]');
            const target = link && document.getElementById(decodeURIComponent(link.hash.slice(1)));

            if (!target) {
                return;
            }

            event.preventDefault();

            // Moves keyboard and screen reader focus to the section, as following the link would.
            if (!target.matches("a[href], button, input, select, textarea, [tabindex]")) {
                target.setAttribute("tabindex", "-1");
            }

            target.scrollIntoView();
            target.focus({ preventScroll: true });
            refreshRevealsAfterScroll(target);
        });
    }

    // Safari sometimes leaves a scroll-driven reveal where it stood before a link's smooth scroll,
    // so the section it lands on stays hidden or half revealed. Once the scroll settles, restarting
    // the section's reveals has the browser measure them again at the new position.
    function refreshRevealsAfterScroll(section) {
        let timer = 0;

        const settle = () => {
            clearTimeout(timer);

            timer = setTimeout(() => {
                window.removeEventListener("scroll", settle);

                section.querySelectorAll(".reveal").forEach((element) => {
                    element.style.animation = "none";
                    void element.offsetWidth;
                    element.style.removeProperty("animation");
                });
            }, 150);
        };

        window.addEventListener("scroll", settle, { passive: true });
        settle();
    }

    // Mirrors the app's mini player: shows the chapter in view, skips between chapters and fills
    // its progress line as the tour is read.
    function setUpTourPlayer() {
        const player = document.querySelector(".tour-player");
        const tour = document.querySelector(".tour");
        const contents = document.getElementById("tour");
        const epilogue = document.getElementById("download");
        // Every numbered section of the tour, the gallery (chapter VII) included.
        const chapters = tour ? [...tour.querySelectorAll("[data-numeral]")] : [];

        if (!player || !tour || !contents || !epilogue || chapters.length === 0) {
            return;
        }

        const stops = [contents, ...chapters, epilogue];
        const numeral = player.querySelector("[data-tour-numeral]");
        const label = player.querySelector("[data-tour-label]");
        const title = player.querySelector("[data-tour-title]");
        const previous = player.querySelector("[data-tour-previous]");
        const next = player.querySelector("[data-tour-next]");
        const intersecting = new Set();

        player.hidden = false;

        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    intersecting.add(entry.target);
                } else {
                    intersecting.delete(entry.target);
                }
            }

            const active = stops.find((stop) => intersecting.has(stop));
            showChapter(chapters.includes(active) ? active : null);
        }, { rootMargin: "-50% 0px -50% 0px" });

        stops.forEach((stop) => observer.observe(stop));

        function stopName(stop) {
            if (stop === contents) {
                return "Contents";
            }

            if (stop === epilogue) {
                return "Download";
            }

            return `Chapter ${stop.dataset.numeral}: ${stop.dataset.title}`;
        }

        function linkTo(link, stop, direction) {
            link.href = `#${stop.id}`;
            link.setAttribute("aria-label", `${direction}: ${stopName(stop)}`);
        }

        function showChapter(chapter) {
            player.classList.toggle("is-visible", chapter !== null);
            player.inert = chapter === null;

            if (!chapter) {
                return;
            }

            const index = stops.indexOf(chapter);
            numeral.textContent = chapter.dataset.numeral;
            label.textContent = `Chapter ${chapter.dataset.numeral}`;
            title.textContent = chapter.dataset.title;
            linkTo(previous, stops[index - 1], "Previous");
            linkTo(next, stops[index + 1], "Next");
        }

        let frame = 0;

        function updateProgress() {
            frame = 0;
            const bounds = tour.getBoundingClientRect();
            const read = (window.innerHeight / 2 - bounds.top) / bounds.height;
            player.style.setProperty("--tour-progress", Math.min(Math.max(read, 0), 1).toFixed(4));
        }

        window.addEventListener("scroll", () => {
            frame ||= requestAnimationFrame(updateProgress);
        }, { passive: true });

        updateProgress();
    }

    // Lets visitors drag the playback speed and see how much listening time is left at that pace.
    function setUpSpeedDemo() {
        const slider = document.getElementById("speed-input");
        const value = document.querySelector("[data-speed-value]");
        const remaining = document.querySelector("[data-speed-remaining]");
        const bookMinutes = 21 * 60 + 4;

        if (!slider || !value || !remaining) {
            return;
        }

        const speedFormat = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

        function formatDuration(minutes) {
            const total = Math.round(minutes);
            const hours = Math.floor(total / 60);
            return hours > 0 ? `${hours}h ${total % 60}m` : `${total}m`;
        }

        function update() {
            const speed = Number(slider.value);
            const min = Number(slider.min);
            const max = Number(slider.max);
            const speedText = `${speedFormat.format(speed)}×`;
            const remainingText = formatDuration(bookMinutes / speed);

            value.value = speedText;
            remaining.textContent = remainingText;
            slider.setAttribute("aria-valuetext", `${speedText}, ${remainingText} left`);
            slider.style.setProperty("--speed-progress", `${((speed - min) / (max - min)) * 100}%`);
        }

        slider.addEventListener("input", update);

        document.querySelectorAll("[data-speed-step]").forEach((button) => {
            button.addEventListener("click", () => {
                if (button.dataset.speedStep === "1") {
                    slider.stepUp();
                } else {
                    slider.stepDown();
                }

                update();
            });
        });

        update();
    }

    // Cycles the example cover through alternate artwork, the way the edit screen swaps covers.
    function setUpCoverDemo() {
        const button = document.querySelector("[data-cover-cycle]");
        const cover = button?.querySelector("[data-cover]");

        if (!button || !cover) {
            return;
        }

        const variants = ["", "1", "2"];
        let index = 0;

        button.addEventListener("click", () => {
            index = (index + 1) % variants.length;

            if (variants[index]) {
                cover.dataset.variant = variants[index];
            } else {
                delete cover.dataset.variant;
            }

            if (!reducedMotion.matches) {
                cover.animate(
                    [
                        { transform: "scale(0.92) rotate(3deg)", opacity: 0.4 },
                        { transform: "none", opacity: 1 }
                    ],
                    { duration: 450, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
                );
            }
        });
    }

    // A snapping row of screenshots: the arrow buttons step one screen at a time, and on desktop
    // the row can be dragged with the mouse, settling on the nearest screen when released.
    function setUpGallery() {
        const track = document.getElementById("gallery-track");
        const previous = document.querySelector("[data-gallery-previous]");
        const next = document.querySelector("[data-gallery-next]");

        if (!track || !previous || !next) {
            return;
        }

        const behavior = () => (reducedMotion.matches ? "auto" : "smooth");

        function itemSpan() {
            const item = track.querySelector(".gallery-item");
            const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
            return item ? item.getBoundingClientRect().width + gap : track.clientWidth;
        }

        function maxScroll() {
            return track.scrollWidth - track.clientWidth;
        }

        function updateButtons() {
            previous.disabled = track.scrollLeft <= 1;
            next.disabled = track.scrollLeft >= maxScroll() - 1;
        }

        previous.addEventListener("click", () => track.scrollBy({ left: -itemSpan(), behavior: behavior() }));
        next.addEventListener("click", () => track.scrollBy({ left: itemSpan(), behavior: behavior() }));
        track.addEventListener("scroll", updateButtons, { passive: true });
        window.addEventListener("resize", updateButtons);
        updateButtons();

        let drag = null;

        track.addEventListener("pointerdown", (event) => {
            if (event.pointerType !== "mouse" || event.button !== 0) {
                return;
            }

            drag = { startX: event.clientX, startScroll: track.scrollLeft, moved: false };
            track.setPointerCapture(event.pointerId);
        });

        track.addEventListener("pointermove", (event) => {
            if (!drag) {
                return;
            }

            const distance = event.clientX - drag.startX;

            // A few pixels of slack keeps an ordinary click from turning into a drag.
            if (!drag.moved && Math.abs(distance) < 4) {
                return;
            }

            drag.moved = true;
            track.classList.add("is-dragging");
            track.scrollLeft = drag.startScroll - distance;
        });

        function endDrag() {
            if (!drag) {
                return;
            }

            const moved = drag.moved;
            drag = null;
            track.classList.remove("is-dragging");

            if (moved) {
                const span = itemSpan();
                const target = Math.min(Math.round(track.scrollLeft / span) * span, maxScroll());
                track.scrollTo({ left: target, behavior: behavior() });
            }
        }

        track.addEventListener("pointerup", endDrag);
        track.addEventListener("pointercancel", endDrag);
    }
})();
