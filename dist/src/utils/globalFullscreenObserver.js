(function () {
    // Avoid multiple injections
    if (window.__itgGlobalFullscreenObserver) {
        return;
    }
    window.__itgGlobalFullscreenObserver = true;

    function handleFullscreenChange() {
        const isFullscreen = document.fullscreenElement !== null;

        if (chrome.runtime && chrome.runtime.sendMessage) {
            try {
                chrome.runtime.sendMessage({
                    action: 'fullscreenChanged',
                    isFullscreen: isFullscreen,
                });
            } catch (e) {
                // Extension context invalidated, remove listener to clean up
                document.removeEventListener('fullscreenchange', handleFullscreenChange);
                window.__itgGlobalFullscreenObserver = false;
            }
        }
    }

    // Listen to the native DOM event for the entire page
    document.addEventListener('fullscreenchange', handleFullscreenChange);
})();
