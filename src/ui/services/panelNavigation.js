/**
 * [AI INSTRUCTION]
 * MOVING FROM THE POPUP TO ONE OF THE PANEL'S PAGES.
 *
 * REUSE: anything that has to send the user from the popup to a page that can also be
 * the side panel calls `navigateToPanel`. There is exactly one copy of this decision,
 * and it belongs here.
 *
 * It used to exist twice: `Popup.svelte` had it as a local `handleNavigation`, and
 * `DonationSection.svelte` had its own hand-written version for the PayPal link — the
 * same four checks in a different order, with `chrome.tabs.create` as a fallback the
 * other one did not have. A third copy sat in the dead `src/utils/donation.js`.
 *
 * WHAT THE FOUR CHECKS ARE FOR. The popup markup is also served as the side panel, so
 * "where am I" cannot be answered from the URL alone:
 *   - already the side panel        → navigate in place, and tell the worker the path
 *                                      changed, or a pinned panel reopens on the old one
 *   - a side panel is open anywhere → navigate in place rather than opening a second
 *   - we are a detached popup window → same, there is nothing to open a panel beside
 *   - ctrl-click                     → the user asked to stay put
 * Otherwise: point the side panel at the page, open it, and close the popup.
 */

/**
 * Resolved once per page. `chrome.runtime.getContexts` is a worker round-trip, and
 * every donation icon would otherwise pay for it again.
 */
let contextsCache = null;

function inSidePanel() {
    return new URLSearchParams(window.location.search).get('context') === 'sidepanel';
}

/**
 * @param {object} options
 * @param {Event|null} options.event Click that started it, if any. Ctrl-click keeps the
 *   user on the current surface; the event is also what gets `preventDefault`ed.
 * @param {string} options.popupUrl Path relative to the current page.
 * @param {string} options.sidePanelUrl Path from the extension root.
 * @param {string} [options.sourcePath] Where the back button should return to.
 */
export async function navigateToPanel({ event = null, popupUrl, sidePanelUrl, sourcePath = null }) {
    if (event) event.preventDefault();

    if (contextsCache === null) {
        contextsCache =
            typeof chrome.runtime.getContexts === 'function'
                ? await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }).catch(() => [])
                : [];
    }

    const isSidePanel = inSidePanel();
    const hasSidePanel = contextsCache.length > 0;
    const joinPopup = popupUrl.includes('?') ? '&' : '?';
    const joinSide = sidePanelUrl.includes('?') ? '&' : '?';

    if (sourcePath) {
        await chrome.storage.local.set({
            navSource: `${sourcePath}${sourcePath.includes('?') ? '&' : '?'}context=sidepanel`,
        });
    }

    const currentWin = await chrome.windows.getCurrent().catch(() => null);
    const isPopupWindow = currentWin?.type === 'popup';

    if (isSidePanel || hasSidePanel || isPopupWindow || (event && event.ctrlKey)) {
        window.location.href = `${popupUrl}${joinPopup}context=sidepanel`;
        if (isSidePanel) {
            chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: popupUrl });
        }
        return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab) return;
        chrome.sidePanel.setOptions({
            path: `${sidePanelUrl}${joinSide}context=sidepanel`,
            enabled: true,
        });
        chrome.sidePanel.open({ windowId: tab.windowId });
        window.close();
    });
}

/**
 * Invalidates the cached answer. The popup resolves the contexts itself during boot,
 * so it hands the result over rather than making the first click pay for a second
 * round-trip.
 */
export function primePanelContexts(contexts) {
    contextsCache = contexts || [];
}
