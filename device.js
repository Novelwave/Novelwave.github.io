(() => {
    const storageKey = "novelwave-device";
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let preference;

    try {
        preference = localStorage.getItem(storageKey);
    } catch {
        // The switch still works for this page when browser storage is unavailable.
    }

    // iPadOS reports a Mac user agent by default, so a touch screen tells the two apart.
    const isIPad = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

    if (preference !== "iphone" && preference !== "ipad") {
        preference = isIPad ? "ipad" : "iphone";
    }

    function applyDevice(device) {
        root.dataset.device = device;

        document.querySelectorAll("[data-device-option]").forEach((option) => {
            option.setAttribute("aria-pressed", String(option.dataset.deviceOption === device));
        });

        // Lets the gallery start over at its first screenshot.
        document.dispatchEvent(new CustomEvent("novelwave:devicechange", { detail: { device } }));
    }

    // Swapping showcases changes the height of every chapter above the switch, so the page is
    // scrolled to keep the switch that was pressed where it was.
    function switchDevice(device, origin) {
        if (root.dataset.device === device) {
            return;
        }

        const apply = () => {
            const before = origin.getBoundingClientRect().top;
            applyDevice(device);
            const after = origin.getBoundingClientRect().top;
            window.scrollBy({ top: after - before, behavior: "instant" });
        };

        if (!document.startViewTransition || reducedMotion.matches) {
            apply();
            return;
        }

        document.startViewTransition(apply);
    }

    root.dataset.device = preference;

    document.addEventListener("DOMContentLoaded", () => {
        applyDevice(root.dataset.device);

        document.querySelectorAll("[data-device-switch]").forEach((group) => {
            group.hidden = false;
        });

        document.querySelectorAll("[data-device-option]").forEach((option) => {
            option.addEventListener("click", () => {
                preference = option.dataset.deviceOption;
                switchDevice(preference, option);

                try {
                    localStorage.setItem(storageKey, preference);
                } catch {
                    // Keep the selected device for this page when storage is unavailable.
                }
            });
        });
    });
})();
