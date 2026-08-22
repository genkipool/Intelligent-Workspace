/**
 * ColorPickerService — one call that returns the colour under the cursor.
 *
 * Chrome's own EyeDropper is the first choice, but it only exists on Windows, macOS
 * and ChromeOS: on Linux `window.EyeDropper` is undefined, which is why the pipette
 * of the theme editor silently did nothing there. When it is missing (or refuses to
 * open, as it does in contexts Chrome does not host in a browser window) the
 * extension opens its own magnifier over the active tab instead — a still capture of
 * the viewport with a zoom lens, see src/utils/screen-color-picker.js.
 *
 * The fallback reads the page, not the whole desktop: that is as far as an extension
 * can see without asking for a screen-share prompt on every pick.
 *
 * Either way the picked colour ends up on the clipboard.
 */

import { copyText } from '../../utils/copyText.js';

/**
 * @returns {Promise<{ color: string|null, copied?: boolean, reason?: string }>}
 *          The picked colour in `#rrggbb`, or null with a reason when nothing was
 *          picked. `copied` says whether it also reached the clipboard.
 */
export async function pickScreenColor() {
    const EyeDropperClass = globalThis.EyeDropper;
    if (EyeDropperClass) {
        try {
            const result = await new EyeDropperClass().open();
            if (!result?.sRGBHex) {
                return { color: null, reason: 'canceled' };
            }
            // Chrome's eyedropper hands the focus back to this page, so the copy can
            // be made from here.
            return { color: result.sRGBHex, copied: await copyText(result.sRGBHex) };
        } catch (error) {
            // AbortError is the user pressing Escape; anything else means Chrome could
            // not show the eyedropper here, and the overlay is worth trying.
            if (error?.name === 'AbortError') {
                return { color: null, reason: 'canceled' };
            }
        }
    }

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
