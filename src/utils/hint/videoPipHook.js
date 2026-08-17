/**
 * NATIVE PICTURE-IN-PICTURE TAKEOVER (main world)
 *
 * Runs in the page's own JavaScript context, not the extension's isolated one, so
 * it can replace `HTMLVideoElement.prototype.requestPictureInPicture`.
 *
 * This is what makes videos detectable everywhere. Injecting a button only works on
 * players we know how to find, and plenty of sites bury theirs in a shadow root, a
 * canvas overlay or a custom element — but nearly all of them end up calling this
 * one method from their own picture-in-picture button. Hooking it means every such
 * button opens our floating player instead, with no per-site selector to maintain.
 *
 * If our window cannot be opened the call falls through to the browser's own
 * implementation, so a site that relied on it is never left with a broken button.
 *
 * The takeover can be switched off: the isolated world sets `data-itg-no-pip-hook`
 * on <html>, which is read on every call rather than once at install time.
 */
(() => {
    const nativeRequest = HTMLVideoElement.prototype.requestPictureInPicture;
    if (!nativeRequest || window.__itgPipHookInstalled) return;
    window.__itgPipHookInstalled = true;

    let nextId = 0;

    HTMLVideoElement.prototype.requestPictureInPicture = function () {
        if (document.documentElement.hasAttribute('data-itg-no-pip-hook')) {
            return nativeRequest.call(this);
        }

        const id = ++nextId;
        const video = this;
        // The DOM is shared between worlds, so an attribute is enough to tell the
        // content script which element the page asked for.
        video.setAttribute('data-itg-pip-target', '1');

        return new Promise((resolve, reject) => {
            const fallBack = () => nativeRequest.call(video).then(resolve, reject);

            const onResponse = (event) => {
                if (event.source !== window || event.data?.__itgPip !== 'response' || event.data.id !== id) return;
                window.removeEventListener('message', onResponse);
                clearTimeout(timer);
                // Resolving with the window keeps callers that read width/height working.
                if (event.data.ok) resolve(window);
                else fallBack();
            };

            // The extension may be disabled on this site, in which case nobody answers.
            const timer = setTimeout(() => {
                window.removeEventListener('message', onResponse);
                video.removeAttribute('data-itg-pip-target');
                fallBack();
            }, 1500);

            window.addEventListener('message', onResponse);
            window.postMessage({ __itgPip: 'request', id }, '*');
        });
    };
})();
