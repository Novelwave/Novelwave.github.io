(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const buttons = [...document.querySelectorAll(".roadmap-stop-button")];
    let latestTransition = null;

    // The page ships with every changelog open, so it still reads in full without this script.
    // Once it runs, only the version a link points at (roadmap.html#v3-3), or else the one marked
    // to open by default, stays open.
    const linked = buttons.find((button) => location.hash && button.closest(".roadmap-stop").id === location.hash.slice(1));

    buttons.forEach((button) => {
        setOpen(button, linked ? button === linked : button.hasAttribute("data-open-by-default"));

        button.addEventListener("click", () => {
            // Reads the state when the switch runs rather than on click, as a view transition
            // applies it a frame later and a quick second click must see the first one's result.
            switchVersion(() => {
                const willOpen = button.getAttribute("aria-expanded") !== "true";
                const topBefore = button.getBoundingClientRect().top;

                buttons.forEach((other) => setOpen(other, other === button && willOpen));

                // Closing a taller changelog above would pull this stop upward; scrolling by the
                // same distance keeps it under the pointer.
                window.scrollBy({ top: button.getBoundingClientRect().top - topBefore, behavior: "instant" });
            });
        });
    });

    // The jump links at the top (#v3-4, #vlater) change only the hash, so the version they point at
    // opens here. Closing a taller changelog above moves the stop up, so it's scrolled back into
    // view (smoothly only where the stylesheet allows motion).
    window.addEventListener("hashchange", () => {
        const target = buttons.find((button) => button.closest(".roadmap-stop").id === location.hash.slice(1));

        if (!target || target.getAttribute("aria-expanded") === "true") {
            return;
        }

        buttons.forEach((other) => setOpen(other, other === target));
        target.closest(".roadmap-stop").scrollIntoView();
    });

    // The summary under each version opens it too, unless the click ended a text selection. It
    // stays a plain paragraph, so the button's accessible name is still just the version.
    document.querySelectorAll(".roadmap-summary").forEach((summary) => {
        summary.addEventListener("click", () => {
            if (!window.getSelection()?.isCollapsed) {
                return;
            }

            summary.closest(".roadmap-stop").querySelector(".roadmap-stop-button").click();
        });
    });

    // Until now the stylesheet kept the other versions closed, so nothing moved on the first paint.
    document.documentElement.classList.add("roadmap-ready");

    function setOpen(button, isOpen) {
        button.setAttribute("aria-expanded", String(isOpen));
        document.getElementById(button.getAttribute("aria-controls")).hidden = !isOpen;
    }

    // Glides the stops into their new places while the changelogs cross-fade, where view
    // transitions are supported and motion is welcome; otherwise switches instantly.
    function switchVersion(update) {
        const root = document.documentElement;

        if (!document.startViewTransition || reducedMotion.matches) {
            update();
            return;
        }

        // Each stop glides on its own; named only for the switch, like the note and footer in CSS.
        const stops = buttons.map((button) => button.closest(".roadmap-stop"));
        stops.forEach((stop, index) => (stop.style.viewTransitionName = `roadmap-stop-${index + 1}`));

        root.classList.add("is-switching-version");
        const transition = document.startViewTransition(update);
        latestTransition = transition;

        transition.ready.catch(() => {
            // The browser skipped the animation, for example in a hidden tab; the version still switches.
        });

        // A quick second click skips this transition, which then finishes early; only the latest one
        // clears the names, so the one still running keeps them.
        transition.finished.finally(() => {
            if (transition !== latestTransition) {
                return;
            }

            root.classList.remove("is-switching-version");
            stops.forEach((stop) => stop.style.removeProperty("view-transition-name"));
        });
    }
})();
