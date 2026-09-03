/**
 * [AI INSTRUCTION]
 * READ ALOUD HANDLER — Puts the page reader into a tab.
 *
 * The reader itself is src/utils/readAloud.js, injected on demand rather than
 * declared as a content script: it only ever runs on the tab somebody asked for, and
 * a second injection stops the reading instead of starting a second one. That toggle
 * is what makes the button, the `ar` keyboard command, the `ar:` omnibar prefix and
 * the browser's own context menu all behave the same way.
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

/**
 * Which tabs are reading, and whether each one is paused.
 *
 * The reader lives inside the page, so nothing outside that page can tell that a
 * voice is coming out of it — the tab is not even `audible`, because speech
 * synthesis does not go through the tab's audio. The side panel's speaker button
 * needs to know, so the reader reports in here and this is kept in session storage:
 * it has to outlive the worker going to sleep, and it means nothing once the browser
 * has been closed.
 */
const READ_ALOUD_TABS_KEY = 'readAloudTabs';

async function getReadAloudTabs() {
    const stored = await chrome.storage.session.get(READ_ALOUD_TABS_KEY);
    return stored?.[READ_ALOUD_TABS_KEY] || {};
}

async function setReadAloudTab(tabId, state) {
    const readings = await getReadAloudTabs();
    if (state) readings[tabId] = state;
    else delete readings[tabId];
    await chrome.storage.session.set({ [READ_ALOUD_TABS_KEY]: readings });
}

/**
 * The readings that are really still going.
 *
 * A tab can stop reading without saying so — it was closed while the worker slept,
 * or the page navigated away — so every entry is checked against the browser and the
 * dead ones are dropped before answering.
 */
async function listActiveReadings() {
    const readings = await getReadAloudTabs();
    const entries = await Promise.all(
        Object.entries(readings).map(async ([id, state]) => {
            const tab = await chrome.tabs.get(Number(id)).catch(() => null);
            if (!tab) return null;
            return {
                tabId: tab.id,
                windowId: tab.windowId,
                title: tab.title || tab.url || '',
                url: tab.url || '',
                favIconUrl: tab.favIconUrl || '',
                paused: !!state.paused,
            };
        }),
    );
    const alive = entries.filter(Boolean);
    if (alive.length !== Object.keys(readings).length) {
        await chrome.storage.session.set({
            [READ_ALOUD_TABS_KEY]: Object.fromEntries(alive.map((r) => [r.tabId, { paused: r.paused }])),
        });
    }
    return alive;
}

/** The reader in a page telling us it started, paused, resumed or went away. */
async function handleReadAloudStateChanged(message, sender, sendResponse) {
    const tabId = sender?.tab?.id;
    if (!tabId) {
        sendResponse({ success: false });
        return;
    }
    await setReadAloudTab(tabId, message.reading ? { paused: !!message.paused } : null);
    sendResponse({ success: true });
}

async function handleGetReadAloudReadings(_message, _sender, sendResponse) {
    sendResponse({ readings: await listActiveReadings() });
}

/**
 * Pauses, resumes or stops a reading from outside the page it is happening in.
 *
 * A tab that does not answer is a tab whose reader is gone — the page navigated, or
 * Chrome discarded it — so it is struck off the list rather than reported as an error.
 */
async function handleControlReadAloud(message, _sender, sendResponse) {
    const tabId = Number(message?.tabId);
    if (!tabId) {
        sendResponse({ success: false });
        return;
    }
    try {
        const state = await chrome.tabs.sendMessage(tabId, {
            action: 'readAloudControl',
            command: message.command,
        });
        await setReadAloudTab(tabId, state?.reading ? { paused: !!state.paused } : null);
        sendResponse({ success: true, ...state });
    } catch {
        await setReadAloudTab(tabId, null);
        sendResponse({ success: false, reading: false });
    }
}

/** Forgets a tab that was reading when it closes. */
function forgetReadAloudTab(tabId) {
    setReadAloudTab(tabId, null).catch(() => {});
}

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
        // The whole answer, not just its state: the reader also says whether it took a
        // selection instead of the page, which is what the callers put in their message.
        return injection?.result?.state ? injection.result : null;
    } catch (error) {
        // A page the extension is not allowed into is an answer, not a crash: the
        // caller decides whether to wake the tab up and try again, or to say so.
        if (READER_NOT_SCRIPTABLE.test(error?.message || '')) return null;
        throw error;
    }
}

/** What to tell the user the reader just did, as `notifyReader` arguments. */
function readerStartedMessage(state, selection) {
    if (state === 'stopped') return ['stopReadingPage', 'Stop reading the page'];
    if (selection) return ['readAloudStartingSelection', 'Reading the selection…'];
    return ['readAloudStarting', 'Reading the page…'];
}

/**
 * Starts the reader on a tab, or stops it if that tab is already reading.
 *
 * `notify` is set by the callers that have nowhere to show a message of their own —
 * the keyboard command, the omnibar and the context menu, which closes on the click —
 * so a browser notification reports the outcome instead.
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
        let result = tab.discarded || tab.status !== 'complete' ? null : await injectReader(tab.id);

        if (!result) {
            const ready = await focusTabForReader(tab);
            if (ready) {
                switched = true;
                result = await injectReader(ready.id);
            }
        }

        if (!result) {
            if (message?.notify) notifyReader('readAloudUnsupportedPage', 'This page cannot be read out loud');
            sendResponse({ success: false, reason: 'unsupportedPage' });
            return;
        }

        const { state, selection = false } = result;

        if (state === 'empty') {
            if (message?.notify) notifyReader('readAloudNoContent', 'No readable text was found on this page');
            sendResponse({ success: false, reason: 'empty' });
            return;
        }

        const readingTabId = switched ? (await resolveTabForReader(message, sender))?.id || tab.id : tab.id;
        await setReadAloudTab(readingTabId, state === 'started' ? { paused: false } : null);

        if (message?.notify) {
            notifyReader(...readerStartedMessage(state, selection));
        }
        sendResponse({ success: true, state, selection, switched });
    } catch (error) {
        console.error('Error starting the page reader:', error);
        if (message?.notify) notifyReader('readAloudUnsupportedPage', 'This page cannot be read out loud');
        sendResponse({ success: false, reason: 'injectionFailed', message: String(error) });
    }
}
