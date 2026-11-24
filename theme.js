(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

    // Lets the stylesheet lay out what the scripts will enhance before the first paint, rather than
    // shifting it once they run.
    document.documentElement.classList.add("js");

    // iOS Safari only applies :active styles (the buttons' press scaling) while a touch listener
    // exists. Every page loads this script, so the hook lives here.
    document.addEventListener("touchstart", () => {}, { passive: true });

    // The site once let visitors pick a theme; it now always follows the system, so a choice saved
    // back then is cleared rather than left to linger.
    try {
        localStorage.removeItem("novelwave-theme");
    } catch {
        // Nothing was saved where storage is unavailable.
    }

    // The page follows the system's appearance, as the screenshots' <source> media queries do.
    function applyTheme() {
        const theme = systemTheme.matches ? "dark" : "light";
        document.documentElement.dataset.theme = theme;

        // The browser's own bar matches the espresso header band, which dark mode darkens (the
        // --band token in styles.css). This script runs in the head, before the first paint.
        document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
            meta.content = theme === "dark" ? "#120F0C" : "#221C16";
        });

        // Lets canvas-drawn parts of the page (the dot grid) repaint in the new colors.
        document.dispatchEvent(new CustomEvent("novelwave:themechange", { detail: { theme } }));
    }

    applyTheme();
    systemTheme.addEventListener("change", applyTheme);
})();
