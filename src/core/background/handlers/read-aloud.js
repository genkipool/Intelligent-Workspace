/**
 * [AI INSTRUCTION]
 * READ ALOUD HANDLER — Puts the page reader into a tab.
 *
 * The reader itself is src/utils/readAloud.js, injected on demand rather than
 * declared as a content script: it only ever runs on the tab somebody asked for, and
 * a second injection stops the reading instead of starting a second one. That toggle
 * is what makes the button, the `ar` keyboard command and the `ar:` omnibar prefix
 * all behave the same way.
 *
 * Dependencies: canInjectIntoPage() (from handlers/screenshots.js),
 *               getI18nMsg() (from utils.js)
 */

/**
 * What Chrome says when a tab cannot be scripted where it stands.
 *
 * It does not only mean "forbidden page". A tab Chrome has discarded to save memory
 * keeps its URL but has no document behind it, and a tab that has not committed its
 * first navigation is still on about:blank however its title reads — both answer with
 * this, and both are fixed by bringing the tab to the front and asking again.
 */
const READER_NOT_SCRIPTABLE = /cannot access|must request permission|cannot be scripted|no tab with id/i;

/** How long to wait for a tab that had to be woken up before giving up on it. */
const READER_TAB_READY_TIMEOUT_MS = 6000;

/** The tab a reading was asked for: the one named, the sender's, or the active one. */
async function resolveTabForReader(message, sender) {
    if (message?.tabId) return await chrome.tabs.get(message.tabId).catch(() => null);
    if (sender?.tab) return sender.tab;
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return activeTab || null;
}

function notifyReader(messageKey, fallback) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: '/assets/icons/icon128.png',
        title: 'Intelligent Tab Group',
        message: getI18nMsg(messageKey, [], fallback),
    });
}

/** Brings a tab to the front and waits until it has a document to talk to. */
async function focusTabForReader(tab) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});

    const deadline = Date.now() + READER_TAB_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const current = await chrome.tabs.get(tab.id).catch(() => null);
        if (!current) return null;
        if (!current.discarded && current.status === 'complete') return current;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return await chrome.tabs.get(tab.id).catch(() => null);
}

/** One attempt. Returns the reader's own answer, or null when it could not be run. */
async function injectReader(tabId) {
    try {
        const [injection] = await chrome.scripting.executeScript({
            target: { tabId },
            files: ['src/utils/readAloud.js'],
            world: 'ISOLATED',
        });
        return injection?.result?.state || null;
    } catch (error) {
        // A page the extension is not allowed into is an answer, not a crash: the
        // caller decides whether to wake the tab up and try again, or to say so.
        if (READER_NOT_SCRIPTABLE.test(error?.message || '')) return null;
        throw error;
    }
}

/**
 * Starts the reader on a tab, or stops it if that tab is already reading.
 *
 * `notify` is set by the callers that have nowhere to show a message of their own —
 * the keyboard command and the omnibar — so the page itself reports the outcome.
 */
async function handleStartReadAloud(message, sender, sendResponse) {
    try {
        const tab = await resolveTabForReader(message, sender);
        if (!tab || !canInjectIntoPage(tab.url)) {
            if (message?.notify) notifyReader('readAloudUnsupportedPage', 'This page cannot be read out loud');
            sendResponse({ success: false, reason: 'unsupportedPage' });
            return;
        }

        // A tab that is asleep in the background cannot be scripted where it lies, so
        // it is brought to the front first — which is also where the reading is worth
        // watching, since the panel and the highlight are on that page.
        let switched = false;
        let state = tab.discarded || tab.status !== 'complete' ? null : await injectReader(tab.id);

        if (!state) {
            const ready = await focusTabForReader(tab);
            if (ready) {
                switched = true;
                state = await injectReader(ready.id);
            }
        }

        if (!state) {
            if (message?.notify) notifyReader('readAloudUnsupportedPage', 'This page cannot be read out loud');
            sendResponse({ success: false, reason: 'unsupportedPage' });
            return;
        }

        if (state === 'empty') {
            if (message?.notify) notifyReader('readAloudNoContent', 'No readable text was found on this page');
            sendResponse({ success: false, reason: 'empty' });
            return;
        }

        if (message?.notify) {
            notifyReader(
                state === 'stopped' ? 'stopReadingPage' : 'readAloudStarting',
                state === 'stopped' ? 'Stop reading the page' : 'Reading the page…',
            );
        }
        sendResponse({ success: true, state, switched });
    } catch (error) {
        console.error('Error starting the page reader:', error);
        if (message?.notify) notifyReader('readAloudUnsupportedPage', 'This page cannot be read out loud');
        sendResponse({ success: false, reason: 'injectionFailed', message: String(error) });
    }
}
