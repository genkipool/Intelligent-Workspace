/**
 * ColorPickerService — one call that returns the colour under the cursor.
 *
 * The extension brings its own magnifier and uses it on every platform, rather than
 * Chrome's EyeDropper where that exists. Two reasons, and the second is the one that
 * settles it:
 *
 * - The same pipette everywhere. The lens, the hex readout, the copy to the
 *   clipboard, Escape and the arrow keys behave identically on Linux, Windows and
 *   macOS, which is not something a mix of two pickers can promise.
 * - Chrome's eyedropper is drawn by the browser window that hosts the page asking
 *   for it, and a side panel — where the theme editor lives — is not hosted by one.
 *   `window.EyeDropper` is undefined on Linux to begin with, and where the class does
 *   exist there is good reason to expect `open()` to end immediately instead of
 *   showing anything. Relying on it would mean shipping a path that cannot be
 *   exercised from this side of the fence.
 *
 * What it costs: ours reads the visible tab, so it cannot sample the browser's own
 * chrome, another window or the desktop, and it cannot open on the pages an
 * extension may not touch (`chrome://`, the Web Store). Chrome's could, on the
 * platforms that have it. That is the trade the consistency is bought with.
 *
 * The lens itself is src/utils/screen-color-picker.js, injected over the active tab.
 */

/**
 * @returns {Promise<{ color: string|null, copied?: boolean, reason?: string }>}
 *          The picked colour in `#rrggbb`, or null with a reason when nothing was
 *          picked. `copied` says whether it also reached the clipboard.
 */
export function pickScreenColor() {
    return pickWithOverlay();
}

function pickWithOverlay() {
    return new Promise((resolve) => {
        let settled = false;
        let pickerTabId = null;

        const done = (result) => {
            if (settled) return;
            settled = true;
            chrome.runtime.onMessage.removeListener(onMessage);
            window.removeEventListener('keydown', onKeyDown, true);
            resolve(result);
        };

        function onMessage(message) {
            if (message?.action === 'screenColorPicked') {
                done({ color: message.color || null, copied: message.copied === true });
            } else if (message?.action === 'screenColorPickCanceled') {
                done({ color: null, reason: message.reason || 'canceled' });
            }
        }

        /**
         * Escape while the lens is up. The overlay listens for it too, but only the
         * page it lives on can hear it: right after the pipette is clicked the focus
         * is still here, so the key never reaches the tab and the lens would look
         * stuck. Told directly, it takes itself down.
         *
         * On `window` and stopped dead, because the page's own Escape handler — the
         * one that closes any open modal — captures on `document` and was registered
         * first. Left to run, calling off the pick also shut the theme editor.
         */
        function onKeyDown(e) {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (pickerTabId !== null) {
                chrome.tabs.sendMessage(pickerTabId, { action: 'cancelScreenColorPicker' }).catch(() => {});
            }
            done({ color: null, reason: 'canceled' });
        }

        chrome.runtime.onMessage.addListener(onMessage);
        window.addEventListener('keydown', onKeyDown, true);

        chrome.runtime
            .sendMessage({ action: 'startScreenColorPicker' })
            .then((response) => {
                if (!response?.success) {
                    done({ color: null, reason: response?.reason || 'unsupportedPage' });
                    return;
                }
                pickerTabId = response.tabId ?? null;
            })
            .catch(() => done({ color: null, reason: 'unsupportedPage' }));
    });
}
