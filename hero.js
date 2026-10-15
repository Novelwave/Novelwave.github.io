(() => {
    const motionAllowed = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const root = document.documentElement;
    const hero = document.querySelector(".hero");
    const canvas = document.querySelector(".dot-grid");
    const context = canvas?.getContext("2d");

    if (!motionAllowed.matches || !hero) {
        return;
    }

    // Matches the CSS dot grid in body::before exactly, so the canvas takes over seamlessly.
    const gridSize = 32;
    const dotRadius = 0.875;
    const fullCircle = Math.PI * 2;

    // Dots around the pointer swell slightly and take on the accent color, fading out as the
    // hero scrolls away.
    const cursorRadius = 140;
    const cursorSwell = 1.8;

    // How far the dot right under the pointer blends toward the accent color (0 to 1).
    const cursorTint = 0.35;

    // Smoothing for the tilt and cursor swell, as the fraction covered per 60 fps frame.
    const easing = 0.08;

    let width = 0;
    let height = 0;
    let gridColor = "";
    let accentColor = "";
    let heroBottom = 1;
    let heroVisible = true;
    let pointer = null;
    let pointerInside = false;
    let cursorStrength = 0;
    let lastSwell = 0;
    let tilt = { x: 0, y: 0 };
    let tiltTarget = { x: 0, y: 0 };
    let frame = 0;
    let lastTime = 0;

    // Pointer effects need a precise pointer and a canvas.
    const pointerEffects = finePointer.matches && Boolean(context);

    // Returns false while the stylesheet hasn't applied yet: an empty color would make the canvas
    // fall back to drawing every dot black.
    function readColors() {
        const styles = getComputedStyle(root);
        gridColor = styles.getPropertyValue("--grid-color").trim();
        accentColor = styles.getPropertyValue("--accent").trim();
        return Boolean(gridColor && accentColor);
    }

    function measure() {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        heroBottom = Math.max(hero.getBoundingClientRect().bottom + window.scrollY, 1);
    }

    function currentSwell() {
        const scrollFade = Math.min(Math.max(1 - window.scrollY / heroBottom, 0), 1);
        return pointer ? cursorStrength * scrollFade : 0;
    }

    function draw() {
        const swell = currentSwell();
        const reach = 2 * cursorRadius * cursorRadius;
        const accents = [];
        lastSwell = swell;

        context.clearRect(0, 0, width, height);
        context.fillStyle = gridColor;
        context.beginPath();

        for (let y = gridSize / 2; y < height; y += gridSize) {
            for (let x = gridSize / 2; x < width; x += gridSize) {
                let influence = 0;

                if (swell > 0) {
                    const offsetX = x - pointer.x;
                    const offsetY = y - pointer.y;
                    influence = Math.exp(-(offsetX * offsetX + offsetY * offsetY) / reach) * swell;
                }

                const radius = dotRadius * (1 + influence * cursorSwell);
                context.moveTo(x + radius, y);
                context.arc(x, y, radius, 0, fullCircle);

                if (influence > 0.02) {
                    accents.push(x, y, radius, influence);
                }
            }
        }

        context.fill();

        // Swollen dots are painted over in the accent color, as strongly as they're swollen.
        context.fillStyle = accentColor;

        for (let index = 0; index < accents.length; index += 4) {
            context.globalAlpha = accents[index + 3] * cursorTint;
            context.beginPath();
            context.arc(accents[index], accents[index + 1], accents[index + 2], 0, fullCircle);
            context.fill();
        }

        context.globalAlpha = 1;
    }

    function updatePointerEffects(time) {
        const frames = lastTime ? (time - lastTime) / (1000 / 60) : 1;
        const step = 1 - (1 - easing) ** frames;
        lastTime = time;

        cursorStrength += ((pointerInside ? 1 : 0) - cursorStrength) * step;
        tilt.x += (tiltTarget.x - tilt.x) * step;
        tilt.y += (tiltTarget.y - tilt.y) * step;
        hero.style.setProperty("--pointer-x", tilt.x.toFixed(4));
        hero.style.setProperty("--pointer-y", tilt.y.toFixed(4));
    }

    function isSettled() {
        return Math.abs(tiltTarget.x - tilt.x) < 0.001
            && Math.abs(tiltTarget.y - tilt.y) < 0.001
            && Math.abs((pointerInside ? 1 : 0) - cursorStrength) < 0.001;
    }

    // Runs only while the tilt or swell is still easing; a still pointer leaves the last frame.
    function tick(time) {
        frame = 0;
        updatePointerEffects(time);
        draw();

        if (isSettled()) {
            lastTime = 0;
        } else {
            frame = requestAnimationFrame(tick);
        }
    }

    function start() {
        frame ||= requestAnimationFrame(tick);
    }

    function redraw() {
        if (!frame) {
            draw();
        }
    }

    function setUpPointerEffects() {
        // The canvas only takes over from the CSS grid once it can paint in the right colors.
        if (!readColors()) {
            window.addEventListener("load", () => {
                if (readColors()) {
                    setUpPointerEffects();
                }
            }, { once: true });
            return;
        }

        root.classList.add("has-dot-grid");

        new IntersectionObserver(([entry]) => {
            heroVisible = entry.isIntersecting;
        }).observe(hero);

        function remeasure() {
            measure();
            redraw();
        }

        window.addEventListener("resize", remeasure);
        new ResizeObserver(remeasure).observe(hero);
        document.fonts?.ready.then(remeasure);

        document.addEventListener("novelwave:themechange", () => {
            readColors();
            redraw();
        });

        // The swell fades with scrolling, so repaint while it's visible and once more as it ends.
        window.addEventListener("scroll", () => {
            if (lastSwell > 0 || currentSwell() > 0) {
                start();
            }
        }, { passive: true });

        window.addEventListener("pointermove", (event) => {
            if (event.pointerType !== "mouse") {
                return;
            }

            pointer = { x: event.clientX, y: event.clientY };
            pointerInside = true;
            tiltTarget = heroVisible
                ? { x: (event.clientX / width) * 2 - 1, y: (event.clientY / height) * 2 - 1 }
                : { x: 0, y: 0 };

            if (heroVisible || lastSwell > 0) {
                start();
            }
        }, { passive: true });

        root.addEventListener("pointerleave", () => {
            pointerInside = false;
            tiltTarget = { x: 0, y: 0 };
            start();
        });

        measure();
        draw();
    }

    if (pointerEffects) {
        setUpPointerEffects();
    }
})();
