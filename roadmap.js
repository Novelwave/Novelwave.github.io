(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const buttons = [...document.querySelectorAll(".roadmap-stop-button")];
    let latestTransition = null;

    // The page ships with every changelog open, so it still reads in full without this script.
    // Once it runs, only the version marked to open by default stays open.
    buttons.forEach((button) => {
        setOpen(button, button.hasAttribute("data-open-by-default"));

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
