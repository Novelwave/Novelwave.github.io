(() => {
    setUpInPageLinks();

    // Scrolls to in-page sections and records them in the URL, so Back returns to where the reader
    // was and a section's address can be copied. Browsers restore the scroll position on reload, so
    // a refresh stays put rather than jumping to the section.
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

            if (location.hash !== link.hash) {
                history.pushState(null, "", link.hash);
            }

            target.scrollIntoView();
            target.focus({ preventScroll: true });
        });
    }
})();
