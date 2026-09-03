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
    // means the tab was asleep and had to be brought to the front to be read at all;
    // `selection` means the page had text selected, which the reader takes as an
    // explicit "read this" and reads instead of the page.
    if (response.state === 'stopped') showNotification('stopReadingPage');
    else if (response.switched) showNotification('readAloudSwitchedTab');
    else showNotification(response.selection ? 'readAloudStartingSelection' : 'readAloudStarting');
}

/**
 * The tabs that are being read out loud right now.
 *
 * Speech synthesis does not go through the tab's audio, so a reading tab is not
 * `audible` and nothing in `chrome.tabs` gives it away. The worker keeps the list
 * because the reader reports to it from inside the page.
 *
 * @returns {Promise<Array<{tabId:number, windowId:number, title:string, url:string,
 *   favIconUrl:string, paused:boolean}>>}
 */
export async function getReadAloudReadings() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getReadAloudReadings' });
        return response?.readings || [];
    } catch {
        return [];
    }
}

/**
 * Pauses, resumes or stops one reading.
 *
 * @param {number} tabId
 * @param {'pause'|'resume'|'toggle'|'stop'} command
 */
export async function controlReadAloud(tabId, command) {
    try {
        return await chrome.runtime.sendMessage({ action: 'controlReadAloud', tabId, command });
    } catch {
        return { success: false };
    }
}

/** Silences — or brings back — every reading at once. */
export async function setAllReadAloudPaused(paused) {
    const readings = await getReadAloudReadings();
    await Promise.all(readings.map((r) => controlReadAloud(r.tabId, paused ? 'pause' : 'resume')));
    return readings.length;
}

/** The tab a `.tab-item` card stands for, in the shape `startReadAloud` wants. */
export function readAloudTargetOf(tabItemEl) {
    return {
        tabId: parseInt(tabItemEl?.dataset?.tabId, 10),
        url: tabItemEl?.dataset?.url,
    };
}
