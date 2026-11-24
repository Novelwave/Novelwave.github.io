(() => {
    // The mini player goes last: it leans on the most browser features, so if one of them throws,
    // the menu is already set up.
    setUpMenu();
    setUpReviews();
    setUpDeviceLean();
    setUpMiniPlayer();

    // Following a chapter closes the menu, then the page scrolls to it (gallery.js).
    function setUpMenu() {
        const menu = document.getElementById("menu");

        menu?.addEventListener("click", (event) => {
            if (event.target.closest("a")) {
                menu.hidePopover();
            }
        });
    }

    // Previous and next buttons for the review row, for a mouse, which can't swipe it. They show only
    // while the row holds more than fits, and each press moves by as many cards as fit, landing
    // exactly on a card's start. (Scrolling by the row's width falls one gap short of the next card,
    // and Safari doesn't always snap the rest of the way, leaving a card cut at the edge.)
    function setUpReviews() {
        const row = document.querySelector("[data-reviews]");
        const nav = document.querySelector("[data-reviews-nav]");

        if (!row || !nav) {
            return;
        }

        const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
        const [previous, next] = nav.querySelectorAll("[data-reviews-step]");
        const cards = [...row.children];

        nav.addEventListener("click", (event) => {
            const button = event.target.closest("[data-reviews-step]");

            if (button) {
                row.scrollTo({ left: stopAfter(Number(button.dataset.reviewsStep)) });
            }
        });

        // Each card's start, measured from the first; the card nearest the current position, moved
        // on by a page of cards; and never past the last position the row can reach.
        function stopAfter(direction) {
            const first = cards[0].getBoundingClientRect();
            const starts = cards.map((card) => card.getBoundingClientRect().left - first.left);
            const style = getComputedStyle(row);
            const gap = parseFloat(style.columnGap) || 0;
            const inner = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const perPage = Math.max(1, Math.floor((inner + gap + 1) / (first.width + gap)));
            const end = row.scrollWidth - row.clientWidth;
            const current = starts.reduce(
                (closest, start, index) =>
                    Math.abs(start - row.scrollLeft) < Math.abs(starts[closest] - row.scrollLeft) ? index : closest,
                0,
            );
            const target = Math.min(Math.max(current + direction * perPage, 0), cards.length - 1);

            return Math.min(starts[target], end);
        }

        function update() {
            const overflow = row.scrollWidth - row.clientWidth;
            nav.hidden = !finePointer.matches || overflow < 2;
            previous.disabled = row.scrollLeft < 2;
            next.disabled = row.scrollLeft > overflow - 2;
        }

        row.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        finePointer.addEventListener("change", update);
        update();
    }

    // Each screenshot below the hero leans a little toward a mouse over it and lifts, then settles
    // when the mouse leaves: one device moves at a time, a quieter echo of the hero's tilt, eased
    // the same way, a share of the way each frame. Touch and Reduce Motion leave them still (the
    // CSS gates the motion the same way).
    function setUpDeviceLean() {
        const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const devices = document.querySelectorAll(".phones picture, .watches picture, .library-showcase picture, .car-screen");

        // The hero's smoothing (hero.js), as the fraction covered per 60 fps frame.
        const easing = 0.08;

        devices.forEach((device) => {
            const lean = { x: 0, y: 0, lift: 0 };
            const target = { x: 0, y: 0, lift: 0 };
            let bounds = null;
            let frame = 0;
            let lastTime = 0;

            device.classList.add("leans");

            // Measured once per visit, before it leans, so its own tilt doesn't move the pointer's
            // place on it; scrolling measures it again.
            function measure() {
                bounds ||= device.getBoundingClientRect();
                return bounds;
            }

            function isSettled() {
                return Math.abs(target.x - lean.x) < 0.001
                    && Math.abs(target.y - lean.y) < 0.001
                    && Math.abs(target.lift - lean.lift) < 0.001;
            }

            function tick(time) {
                const frames = lastTime ? (time - lastTime) / (1000 / 60) : 1;
                const step = 1 - (1 - easing) ** frames;
                lastTime = time;
                lean.x += (target.x - lean.x) * step;
                lean.y += (target.y - lean.y) * step;
                lean.lift += (target.lift - lean.lift) * step;
                device.style.setProperty("--lean-x", lean.x.toFixed(4));
                device.style.setProperty("--lean-y", lean.y.toFixed(4));
                device.style.setProperty("--lean", lean.lift.toFixed(4));

                if (isSettled()) {
                    frame = 0;
                    lastTime = 0;
                } else {
                    frame = requestAnimationFrame(tick);
                }
            }

            function start() {
                frame ||= requestAnimationFrame(tick);
            }

            device.addEventListener("pointermove", (event) => {
                if (event.pointerType !== "mouse" || !finePointer.matches || reducedMotion.matches) {
                    return;
                }

                const rect = measure();
                target.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
                target.y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
                target.lift = 1;
                start();
            });

            device.addEventListener("pointerleave", () => {
                bounds = null;
                target.x = 0;
                target.y = 0;
                target.lift = 0;
                start();
            });

            window.addEventListener("scroll", () => {
                bounds = null;
            }, { passive: true });
        });
    }

    // The page reads like a book in the app: once the hero's badge scrolls away, a mini player follows
    // you down with the chapter you're in, how far through the page you are, and the App Store badge,
    // so a phone always has one badge in reach (the home's header carries none). It steps aside only
    // once the closing's own badge rises above the bar's height (80px: rootMargin takes only px or %),
    // and stays away over the footer after it, so there's no stretch of scrolling with no badge in
    // view. Computers with a mouse don't get it: there it would sit over the centred copy, and the
    // hero and the closing (with its QR code) carry the badge.
    function setUpMiniPlayer() {
        const bar = document.querySelector("[data-mini-player]");
        const heroBadge = document.querySelector(".hero-actions");
        const desktop = window.matchMedia("(min-width: 60.0625rem) and (pointer: fine)");
        const closingBadge = document.querySelector(".closing .app-store-button");
        const chapters = [...document.querySelectorAll("[data-chapter]")];
        const chapterLabel = document.querySelector("[data-mini-player-chapter]");
        const progress = document.querySelector("[data-mini-player-progress]");
        const menuLinks = [...document.querySelectorAll("[data-menu-chapters] a")];

        if (!bar || !heroBadge || !closingBadge || chapters.length === 0) {
            return;
        }

        bar.hidden = false;
        let heroVisible = true;
        let closingVisible = false;
        let current = -1;

        function setVisible() {
            const visible = !desktop.matches && !heroVisible && !closingVisible;
            bar.classList.toggle("is-visible", visible);
            bar.inert = !visible;
        }

        new IntersectionObserver(([entry]) => {
            heroVisible = entry.isIntersecting;
            setVisible();
        }).observe(heroBadge);

        // Past the badge (scrolled off the top, over the footer) counts as reached too.
        new IntersectionObserver(([entry]) => {
            closingVisible = entry.isIntersecting || entry.boundingClientRect.top < 0;
            setVisible();
        }, { rootMargin: "0px 0px -80px 0px" }).observe(closingBadge);

        desktop.addEventListener("change", setVisible);

        function update() {
            const line = window.innerHeight * 0.4;
            let index = 0;

            chapters.forEach((chapter, candidate) => {
                if (chapter.getBoundingClientRect().top <= line) {
                    index = candidate;
                }
            });

            if (index !== current) {
                current = index;
                chapterLabel.textContent = chapters[index].dataset.chapter;
                menuLinks.forEach((link, linkIndex) => {
                    if (linkIndex === index) {
                        link.setAttribute("aria-current", "true");
                    } else {
                        link.removeAttribute("aria-current");
                    }
                });
            }

            const scrollable = document.documentElement.scrollHeight - window.innerHeight;
            progress.style.transform = `scaleX(${scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0})`;
        }

        // Scroll events already arrive at most once a frame.
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        update();
    }
})();
