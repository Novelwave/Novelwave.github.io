(() => {
    const storageKey = "novelwave-theme";
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let preference;

    // iOS Safari only applies :active styles (the buttons' press scaling) while a touch listener
    // exists. Every page loads this script, so the hook lives here.
    document.addEventListener("touchstart", () => {}, { passive: true });

    try {
        preference = localStorage.getItem(storageKey);
    } catch {
        // Theme switching still works when browser storage is unavailable.
    }

    if (preference !== "light" && preference !== "dark") {
        preference = null;
    }

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;

        document.querySelectorAll("[data-theme-option]").forEach((option) => {
            option.setAttribute("aria-pressed", String(option.dataset.themeOption === theme));
        });

        // Sources default to the system theme in HTML, so only a manual override downloads the other variant.
        document.querySelectorAll("source[data-theme-source]").forEach((source) => {
            source.media = source.dataset.themeSource === theme ? "all" : "not all";
        });

        // Lets canvas-drawn parts of the page (the hero's dot grid) repaint in the new colors.
        document.dispatchEvent(new CustomEvent("novelwave:themechange", { detail: { theme } }));
    }

    // Spreads the new theme outward from the toggle in a growing circle, where view transitions
    // are supported and motion is welcome; otherwise switches instantly.
    function switchTheme(theme, origin) {
        const root = document.documentElement;

        if (!document.startViewTransition || reducedMotion.matches || root.dataset.theme === theme) {
            applyTheme(theme);
            return;
        }

        const bounds = origin.getBoundingClientRect();
        const x = bounds.left + bounds.width / 2;
        const y = bounds.top + bounds.height / 2;
        const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

        root.classList.add("is-switching-theme");
        const transition = document.startViewTransition(() => applyTheme(theme));

        transition.ready.then(() => {
            root.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: 700, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
            );
        }).catch(() => {
            // The theme is already applied; only the reveal animation was skipped.
        });

        transition.finished.finally(() => root.classList.remove("is-switching-theme"));
    }

    applyTheme(preference ?? (systemTheme.matches ? "dark" : "light"));

    systemTheme.addEventListener("change", (event) => {
        if (!preference) {
            applyTheme(event.matches ? "dark" : "light");
        }
    });

    document.addEventListener("DOMContentLoaded", () => {
        applyTheme(document.documentElement.dataset.theme);
        document.querySelector(".theme-toggle").hidden = false;

        document.querySelectorAll("[data-theme-option]").forEach((option) => {
            option.addEventListener("click", () => {
                preference = option.dataset.themeOption;
                switchTheme(preference, option);

                try {
                    localStorage.setItem(storageKey, preference);
                } catch {
                    // Keep the selected theme for this page when storage is unavailable.
                }
            });
        });
    });
})();
