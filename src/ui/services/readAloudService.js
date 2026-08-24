/**
 * The panel's side of the page reader.
 *
 * The reader itself lives in the page (src/utils/readAloud.js): it is the only place
 * that can see the text, highlight the sentence being spoken and scroll along with
 * it. All this side does is ask the worker to put it there, and say why not when the
 * page is one Chrome will not let an extension into.
 */

import { showNotification } from '../../utils/i18n.js';

/** Pages the reader can be injected into; chrome:// and the Web Store reject it. */
export function isReadablePage(url) {
    return typeof url === 'string' && /^(https?|file):/i.test(url);
}

/**
 * Starts — or, on a tab that is already talking, stops — the reader.
 *
 * @param {{tabId?: number, url?: string}} target
 */
export async function startReadAloud(target = {}) {
    const tabId = Number(target.tabId);
    if (!Number.isFinite(tabId)) {
        showNotification('readAloudUnsupportedPage', true);
        return;
    }

    const url = target.url || (await chrome.tabs.get(tabId).catch(() => null))?.url;
    if (!isReadablePage(url)) {
        showNotification('readAloudUnsupportedPage', true);
        return;
    }

    const response = await chrome.runtime.sendMessage({ action: 'startReadAloud', tabId });
    if (!response?.success) {
        const reason = response?.reason;
        const key =
            reason === 'empty'
                ? 'readAloudNoContent'
                : reason === 'unsupportedPage'
                  ? 'readAloudUnsupportedPage'
                  : 'errorReadingAloud';
        showNotification(key, true);
        return;
    }
    // 'stopped' means the click landed on a tab that was already reading; `switched`
    // means the tab was asleep and had to be brought to the front to be read at all.
    if (response.state === 'stopped') showNotification('stopReadingPage');
    else showNotification(response.switched ? 'readAloudSwitchedTab' : 'readAloudStarting');
}

/** The tab a `.tab-item` card stands for, in the shape `startReadAloud` wants. */
export function readAloudTargetOf(tabItemEl) {
    return {
        tabId: parseInt(tabItemEl?.dataset?.tabId, 10),
        url: tabItemEl?.dataset?.url,
    };
}
