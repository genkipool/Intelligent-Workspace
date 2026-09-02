/**
 * [AI INSTRUCTION]
 * SCREENSHOTS HANDLER — Screenshot capture and session indexing.
 *
 * REUSE: Both area and full-page screenshots share session index logic via
 * `updateScreenshotSessionIndex()`. When adding new screenshot capture types,
 * use this function instead of duplicating the session storage update pattern.
 *
 * Dependencies: saveScreenshotToDb() (from db.js), groupInfoMap (from state.js),
 *               SCREENSHOT_STORAGE_KEY (from state.js), getI18nMsg() (from utils.js)
 */

// --- Shared Screenshot Infrastructure ---

/**
 * Resolves the active tab from a sender, with fallback to active tab query.
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function resolveTabForScreenshot(sender) {
    if (sender.tab) return sender.tab;

    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return activeTabs.length > 0 ? activeTabs[0] : null;
}

/**
 * Computes the context key for storing a screenshot based on the tab's group.
 * @param {chrome.tabs.Tab} tab
 * @returns {string} Context key like 'g_ungrouped' or 'g_GroupName'
 */
function getScreenshotContextKey(tab) {
    if (tab.groupId !== -1 && tab.groupId !== -100) {
        const info = groupInfoMap.get(tab.groupId);
        if (info && info.key) {
            return `g_${info.key}`;
        }
        return `g_${tab.groupId}`;
    }
    return 'g_ungrouped';
}

/**
 * Updates the session storage index for screenshots (group and subgroup keys).
 * This is the SINGLE source of truth for screenshot session indexing.
 * DO NOT duplicate this logic elsewhere.
 *
 * @param {chrome.tabs.Tab} tab - The tab the screenshot was taken from
 * @param {number} screenshotId - The ID of the saved screenshot
 */
async function updateScreenshotSessionIndex(tab, screenshotId) {
    const { [SCREENSHOT_STORAGE_KEY]: storedScreenshotIndexes = {} } =
        await chrome.storage.session.get(SCREENSHOT_STORAGE_KEY);

    // Group-level index
    const groupKey = tab.groupId === -1 || tab.groupId === -100 ? 'g_ungrouped' : `g_${tab.groupId}`;
    if (!storedScreenshotIndexes[groupKey]) storedScreenshotIndexes[groupKey] = [];
    storedScreenshotIndexes[groupKey].push(screenshotId);

    // Subgroup-level index (by domain within group)
    try {
        const domain = new URL(tab.url).hostname.replace(/^www\./, '');
        const subgroupKey =
            tab.groupId === -1 || tab.groupId === -100 ? `s_ungrouped_${domain}` : `s_${tab.groupId}_${domain}`;
        if (!storedScreenshotIndexes[subgroupKey]) storedScreenshotIndexes[subgroupKey] = [];
        storedScreenshotIndexes[subgroupKey].push(screenshotId);
    } catch {
        /* Not a valid URL */
    }

    await chrome.storage.session.set({ [SCREENSHOT_STORAGE_KEY]: storedScreenshotIndexes });
}

// --- Full page capture ---
//
// `chrome.tabs.captureVisibleTab()` only ever returns what is on screen, so a whole
// page has to be walked: scroll one viewport, capture, repeat, and paste the strips
// onto a single canvas. Two details are what separate this from a naive loop:
//
//  - Chrome rate-limits captureVisibleTab to about two calls a second and rejects
//    the rest with MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND, hence the pause between
//    strips. It is also what gives the page time to paint what was just scrolled to.
//  - Anything `position: fixed` (cookie bars, sticky headers) would otherwise be
//    stamped onto every single strip, so it is hidden after the first one.

/** Chrome's own limit is 2 calls/second; the margin also covers the repaint. */
const FULL_PAGE_CAPTURE_INTERVAL_MS = 600;
/** A canvas taller than this is refused by Chrome, and the capture would be lost. */
const MAX_FULL_PAGE_CANVAS_PX = 30000;
/** A runaway infinite-scroll page would otherwise capture until the tab is closed. */
const MAX_FULL_PAGE_SEGMENTS = 60;

const captureDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs one of the page functions below in the target tab and returns its result. */
async function runInTab(tabId, func, args = []) {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func, args, world: 'ISOLATED' });
    return injection?.result;
}

/**
 * Page side of the capture. All three run in the tab, so they share nothing with the
 * worker but the object they hang on `window`.
 */
function itgFullPagePrepare() {
    const state = {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        htmlBehavior: document.documentElement.style.scrollBehavior,
        bodyBehavior: document.body ? document.body.style.scrollBehavior : '',
        hidden: [],
    };
    document.documentElement.style.scrollBehavior = 'auto';
    if (document.body) document.body.style.scrollBehavior = 'auto';

    const style = document.createElement('style');
    style.id = 'itg-full-page-capture-style';
    style.textContent = '::-webkit-scrollbar { display: none !important; }';
    document.documentElement.appendChild(style);

    window.__itgFullPageCapture = state;
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        totalHeight: Math.max(
            document.documentElement.scrollHeight,
            document.body ? document.body.scrollHeight : 0,
            window.innerHeight,
        ),
        devicePixelRatio: window.devicePixelRatio || 1,
    };
}

/**
 * Scrolls to one strip and reports where the page actually landed — the last strip
 * is always short of what was asked for, and drawing it at the requested offset
 * instead of the real one is what leaves a duplicated band at the bottom.
 */
function itgFullPageScrollTo(y, hideFixed) {
    const state = window.__itgFullPageCapture;
    if (!state) return { y: window.scrollY };

    if (hideFixed && state.hidden.length === 0) {
        document.querySelectorAll('body *').forEach((element) => {
            const position = getComputedStyle(element).position;
            if (position !== 'fixed' && position !== 'sticky') return;
            state.hidden.push([element, element.style.visibility]);
            element.style.setProperty('visibility', 'hidden', 'important');
        });
    }

    window.scrollTo(0, y);
    return { y: window.scrollY };
}

function itgFullPageRestore() {
    const state = window.__itgFullPageCapture;
    document.getElementById('itg-full-page-capture-style')?.remove();
    if (!state) return;
    state.hidden.forEach(([element, visibility]) => {
        if (visibility) element.style.visibility = visibility;
        else element.style.removeProperty('visibility');
    });
    document.documentElement.style.scrollBehavior = state.htmlBehavior;
    if (document.body) document.body.style.scrollBehavior = state.bodyBehavior;
    window.scrollTo(state.scrollX, state.scrollY);
    delete window.__itgFullPageCapture;
}

/**
 * Walks the page one screenful at a time and hands each strip to the caller.
 *
 * This is the part both full page modes share: whether the strips end up pasted onto
 * one tall canvas or kept as separate images, they are gathered exactly the same way.
 *
 * @param {chrome.tabs.Tab} tab
 * @param {(dataUrl: string, y: number, metrics: object) => Promise<void>|void} onStrip
 * @returns {Promise<object>} The metrics the page reported.
 */
async function walkFullPage(tab, onStrip) {
    const metrics = await runInTab(tab.id, itgFullPagePrepare);
    if (!metrics) throw new Error('The page did not report its size.');

    try {
        const segments = Math.min(MAX_FULL_PAGE_SEGMENTS, Math.max(1, Math.ceil(metrics.totalHeight / metrics.height)));
        let lastDrawnY = -1;

        for (let index = 0; index < segments; index++) {
            const { y } = await runInTab(tab.id, itgFullPageScrollTo, [index * metrics.height, index > 0]);
            // The page has stopped moving: every further strip would repeat this one.
            if (y === lastDrawnY) break;
            lastDrawnY = y;

            // The very first strip needs no pause: nothing has been captured yet.
            if (index > 0) await captureDelay(FULL_PAGE_CAPTURE_INTERVAL_MS);

            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
            if (!dataUrl) throw new Error('The capture returned an empty result.');

            const keepGoing = await onStrip(dataUrl, y, metrics);
            if (keepGoing === false) break;
        }
        return metrics;
    } finally {
        // The page is put back even when the capture failed half way through it.
        await runInTab(tab.id, itgFullPageRestore).catch(() => {});
    }
}

/** Reads an OffscreenCanvas back as a PNG data URL. */
async function canvasToDataUrl(canvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

/**
 * The whole page as one tall PNG data URL.
 * @param {chrome.tabs.Tab} tab
 * @returns {Promise<string>}
 */
async function captureFullPageDataUrl(tab) {
    let canvas = null;
    let context = null;
    let canvasHeight = 0;

    await walkFullPage(tab, async (dataUrl, y, metrics) => {
        if (!canvas) {
            const ratio = metrics.devicePixelRatio;
            canvasHeight = Math.min(MAX_FULL_PAGE_CANVAS_PX, Math.round(metrics.totalHeight * ratio));
            canvas = new OffscreenCanvas(Math.round(metrics.width * ratio), canvasHeight);
            context = canvas.getContext('2d');
        }

        const ratio = metrics.devicePixelRatio;
        const strip = await createImageBitmap(await (await fetch(dataUrl)).blob());
        context.drawImage(strip, 0, Math.round(y * ratio));
        strip.close();

        // Nothing below the canvas can be drawn, so there is nothing left to capture.
        return Math.round((y + metrics.height) * ratio) < canvasHeight;
    });

    if (!canvas) throw new Error('The capture produced no image.');
    return await canvasToDataUrl(canvas);
}

/**
 * The whole page as one image per screenful.
 *
 * The same walk, kept apart instead of pasted together: a long page read as a series
 * of screens is easier to look through in a gallery than one image the height of a
 * building, and each piece keeps the resolution it was captured at.
 *
 * @param {chrome.tabs.Tab} tab
 * @returns {Promise<string[]>}
 */
async function captureFullPageParts(tab) {
    const parts = [];
    await walkFullPage(tab, (dataUrl) => {
        parts.push(dataUrl);
        return parts.length < MAX_FULL_PAGE_SEGMENTS;
    });
    if (parts.length === 0) throw new Error('The capture produced no image.');
    return parts;
}

/**
 * Full page capture on behalf of an extension page.
 *
 * It only hands the image back; the side panel owns where a capture is filed, and
 * duplicating that here is what used to leave shortcut captures in the wrong group.
 */
async function handleCaptureFullPage(message, sender, sendResponse) {
    try {
        const tab = message.tabId ? await chrome.tabs.get(message.tabId) : await resolveTabForScreenshot(sender);
        if (!tab) throw new Error('No tab found to capture');

        if (message.mode === 'parts') {
            sendResponse({ success: true, dataUrls: await captureFullPageParts(tab) });
            return;
        }
        sendResponse({ success: true, dataUrl: await captureFullPageDataUrl(tab) });
    } catch (error) {
        console.error('Error capturing the full page:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// --- Screenshot Handlers ---

/**
 * Captures a selected area of the page as a screenshot.
 */
async function handleCaptureAreaScreenshot(message, sender) {
    (async () => {
        const { area, devicePixelRatio, saveToGallery = true } = message.data;
        const tab = await resolveTabForScreenshot(sender);

        if (!tab) {
            console.error('No tab found to capture');
            return;
        }

        try {
            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
            if (!dataUrl) throw new Error('The capture returned an empty result.');

            const imageBlob = await (await fetch(dataUrl)).blob();
            const image = await createImageBitmap(imageBlob);

            const canvas = new OffscreenCanvas(area.width * devicePixelRatio, area.height * devicePixelRatio);
            const ctx = canvas.getContext('2d');

            ctx.drawImage(
                image,
                area.x * devicePixelRatio,
                area.y * devicePixelRatio,
                area.width * devicePixelRatio,
                area.height * devicePixelRatio,
                0,
                0,
                area.width * devicePixelRatio,
                area.height * devicePixelRatio,
            );

            const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
            const croppedDataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(croppedBlob);
            });

            // Save to database and update session index ONLY if saveToGallery is true
            if (saveToGallery) {
                const screenshotId = Date.now();
                const newScreenshot = {
                    id: screenshotId,
                    dataUrl: croppedDataUrl,
                    title: `${tab.title} (selection)`,
                    url: tab.url,
                    contextKey: getScreenshotContextKey(tab),
                    isPersistent: false,
                };
                await saveScreenshotToDb(newScreenshot);
                await updateScreenshotSessionIndex(tab, screenshotId);
            }

            // Send detailed message to the UI and active tab about the result
            const finishMsg = {
                action: 'areaScreenshotProcessFinished',
                success: true,
                dataUrl: croppedDataUrl,
                saveToGallery,
            };
            chrome.runtime.sendMessage(finishMsg);
            if (tab && tab.id) {
                chrome.tabs.sendMessage(tab.id, finishMsg).catch(() => {});
            }
            startNextAreaCapture();
            if (saveToGallery) {
                notifyCapture('screenshotSavedAndCopied');
            }
        } catch (error) {
            console.error('Error capturing screen area:', error);
            const finishErrMsg = { action: 'areaScreenshotProcessFinished', success: false };
            chrome.runtime.sendMessage(finishErrMsg);
            if (tab && tab.id) {
                chrome.tabs.sendMessage(tab.id, finishErrMsg).catch(() => {});
            }
            startNextAreaCapture();
            if (saveToGallery) {
                notifyCapture('errorTakingScreenshot');
            }
        }
    })();
}

// --- Captures asked for from a page: the keyboard shortcuts and the omnibar ---
//
// The panel files its own captures — it knows which group the image belongs to — but
// a shortcut and the omnibar have no panel behind them, so the worker saves the image
// itself. The modes are the ones the panel's camera menu offers, and they differ only
// in which walker produces the images and in the notice that goes up meanwhile.

/**
 * The tray notice the worker puts up on its own behalf; they all look the same.
 *
 * `getI18nMsg` falls back to the key itself, so there is no literal to pass here —
 * the four copies of this block each carried one that never reached anything.
 */
function notifyCapture(key) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: '/assets/icons/icon128.png',
        title: 'Intelligent Tab Group',
        message: getI18nMsg(key),
    });
}

/** What is on screen, which is all `captureVisibleTab` ever returns. */
async function captureVisibleTabImages(tab) {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if (!dataUrl) throw new Error('The capture returned an empty result.');
    return [dataUrl];
}

/**
 * The capture modes a page can ask for. Adding one is adding an entry here and the
 * key or prefix that sends it — nothing else in this file knows how many there are.
 */
const CAPTURE_MODES = {
    visible: { notice: 'capturingVisibleNotify', capture: captureVisibleTabImages },
    fullPage: { notice: 'capturingFullPageNotify', capture: async (tab) => [await captureFullPageDataUrl(tab)] },
    fullPageParts: { notice: 'capturingFullPagePartsNotify', capture: captureFullPageParts },
};

/** How long a tab needs after being brought to the front before it has painted. */
const TAB_ACTIVATION_MS = 750;

/** What the gallery holds at most; the panel refuses a capture past this too. */
const MAX_SCREENSHOTS = 100;

/** How many images the gallery is holding, counted off the session index. */
async function countStoredScreenshots() {
    const { [SCREENSHOT_STORAGE_KEY]: index = {} } = await chrome.storage.session.get(SCREENSHOT_STORAGE_KEY);
    return Object.entries(index).reduce((total, [key, ids]) => (key.startsWith('g_') ? total + ids.length : total), 0);
}

/**
 * Brings one tab to the front, because `captureVisibleTab` only ever returns the tab
 * that is on screen.
 */
async function bringTabToFront(tab) {
    const targetWindow = await chrome.windows.get(tab.windowId);
    if (targetWindow.state === 'minimized') await chrome.windows.update(tab.windowId, { state: 'normal' });
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    await captureDelay(TAB_ACTIVATION_MS);
}

/**
 * Captures one tab in one mode and files every image it produced.
 *
 * @param {chrome.tabs.Tab} tab
 * @param {'visible'|'fullPage'|'fullPageParts'} mode
 * @returns {Promise<string[]>} The images that were filed, so that a caller of a
 *   single capture can offer it to the clipboard.
 */
async function captureAndFileTab(tab, mode) {
    const images = await CAPTURE_MODES[mode].capture(tab);
    const contextKey = getScreenshotContextKey(tab);

    // The ceiling counts images, not captures: a long page taken in parts must not be
    // the thing that overruns it. This is the rule the panel already follows.
    const room = Math.max(0, MAX_SCREENSHOTS - (await countStoredScreenshots()));
    const kept = images.slice(0, room);
    if (kept.length < images.length) notifyCapture('screenshotLimitReached');

    for (const [position, dataUrl] of kept.entries()) {
        const screenshotId = Date.now() + position;
        await saveScreenshotToDb({
            id: screenshotId,
            dataUrl,
            title: tab.title,
            url: tab.url,
            contextKey,
            isPersistent: false,
            // What tells the gallery how to label this one: a whole page is a different
            // kind of thing from a screenful of it, and a page taken in parts says which
            // part it is. The label itself is built where it is shown, so that it
            // follows the language the reader picked rather than the one in force when
            // the capture was taken.
            isFullPage: mode !== 'visible',
            ...(kept.length > 1 ? { part: position + 1, partsTotal: kept.length } : {}),
        });
        await updateScreenshotSessionIndex(tab, screenshotId);
    }
    return kept;
}

/** Tells the panel that the gallery has something new in it. */
function broadcastCaptureFinished(tab) {
    const finishMsg = { action: 'fullPageScreenshotFinished', success: true };
    chrome.runtime.sendMessage(finishMsg);
    if (tab?.id) chrome.tabs.sendMessage(tab.id, finishMsg).catch(() => {});
}

/** The mode a message asked for, or the one that needs no scrolling. */
function resolveCaptureMode(mode) {
    return CAPTURE_MODES[mode] ? mode : 'visible';
}

/**
 * Captures the active tab from a page shortcut and files what comes back.
 *
 * @param {{mode?: 'visible'|'fullPage'|'fullPageParts'}} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response: object) => void} sendResponse Answers with the single image the
 *   caller may put on the clipboard, or none at all when the page came back in parts.
 */
async function handleCaptureFromShortcut(message, sender, sendResponse) {
    const mode = resolveCaptureMode(message.mode);
    notifyCapture(CAPTURE_MODES[mode].notice);

    try {
        const tab = await resolveTabForScreenshot(sender);
        if (!tab) throw new Error('No tab found to capture');

        const images = await captureAndFileTab(tab, mode);
        if (images.length === 0) {
            sendResponse({ success: false, error: 'The gallery is full' });
            return;
        }
        broadcastCaptureFinished(tab);

        // Only a lone image is offered to the clipboard: a page taken in parts would
        // leave whichever piece happened to be last on it, which is nobody's intent.
        const single = images.length === 1;
        notifyCapture(single ? 'screenshotSavedAndCopied' : 'screenshotSaved');
        sendResponse({ success: true, dataUrl: single ? images[0] : null, count: images.length });
    } catch (error) {
        console.error('Error capturing from a shortcut:', error);
        notifyCapture('errorTakingScreenshot');
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Captures the tabs the omnibar picked, one after another.
 *
 * They cannot go in parallel: every capture has to bring its tab to the front, and
 * Chrome only ever captures the one that is visible. The browser is put back where it
 * was once, at the end, rather than after each tab.
 *
 * @param {{mode?: string, tabIds?: number[]}} message
 */
async function handleCaptureTabs(message, sender, sendResponse) {
    const tabIds = (Array.isArray(message.tabIds) ? message.tabIds : []).map(Number).filter(Number.isInteger);
    if (tabIds.length === 0) {
        sendResponse({ success: false, error: 'No tabs to capture' });
        return;
    }

    // The area picker is the one mode the user has to answer, so it is not a loop but
    // a queue: each tab's turn starts when the one before it is done.
    if (message.mode === 'area') {
        startAreaCaptureQueue(tabIds);
        sendResponse({ success: true, count: tabIds.length });
        return;
    }

    const mode = resolveCaptureMode(message.mode);
    notifyCapture(CAPTURE_MODES[mode].notice);

    const [origin] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    let saved = 0;
    let lastTab = null;
    let galleryFull = false;

    for (const tabId of tabIds) {
        try {
            const tab = await chrome.tabs.get(tabId);
            // Chrome refuses its own pages and the store, and so does the panel.
            if (!canInjectIntoPage(tab.url)) continue;
            await bringTabToFront(tab);
            const kept = await captureAndFileTab(tab, mode);
            // Nothing was filed because there is no room left: the tabs after this one
            // would fare no better, and each of them would say so again.
            if (kept.length === 0) {
                galleryFull = true;
                break;
            }
            saved += kept.length;
            lastTab = tab;
        } catch (error) {
            console.error(`Error capturing tab ${tabId}:`, error);
        }
    }

    if (origin?.id) {
        await chrome.windows.update(origin.windowId, { focused: true }).catch(() => {});
        await chrome.tabs.update(origin.id, { active: true }).catch(() => {});
    }

    if (saved > 0) {
        broadcastCaptureFinished(lastTab);
        notifyCapture('screenshotSaved');
    } else if (!galleryFull) {
        // A full gallery has already said so; anything else has not.
        notifyCapture('errorTakingScreenshot');
    }
    sendResponse({ success: saved > 0, count: saved });
}

/**
 * Puts the area selector over one tab.
 *
 * The flag has to be planted before the script runs: it is what tells the selector
 * whether the crop is destined for the gallery or for whoever asked (the QR reader
 * asks for one it does not want filed).
 */
async function injectAreaSelector(tabId, saveToGallery = true) {
    await chrome.scripting.executeScript({
        target: { tabId },
        func: (save) => {
            window._areaSelectorSaveToGallery = save;
        },
        args: [saveToGallery],
        world: 'ISOLATED',
    });
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/utils/area-selector.js'],
        world: 'ISOLATED',
    });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['src/utils/area-selector.css'] });
}

function handleInjectAreaSelector(message, sender, sendResponse) {
    if (message.tabId) {
        injectAreaSelector(message.tabId, message.saveToGallery !== false).catch((error) => {
            console.error('Error injecting area selector script:', error);
        });
    }
    sendResponse({ success: true });
}

function handleCaptureAreaFromShortcut(message, sender, sendResponse) {
    const tab = sender.tab;
    if (tab && tab.id) {
        injectAreaSelector(tab.id).catch((error) => {
            console.error('Error injecting area selector script:', error);
        });
        notifyCapture('capturingAreaNotify');
    }
    sendResponse({ success: true });
}

// --- The queue behind an area capture of several tabs ---
//
// Every other mode is a loop the worker runs on its own. This one cannot be: the crop
// is drawn by hand, so a tab's turn only ends when the person has answered, and the
// next one starts from that answer — whether it was a selection or an Escape.

/** Tabs still waiting their turn with the area selector, in the order they were given. */
let areaCaptureQueue = [];

/** Starts an area capture of `tabIds`, replacing any batch still in progress. */
function startAreaCaptureQueue(tabIds) {
    areaCaptureQueue = [...tabIds];
    notifyCapture('capturingAreaNotify');
    startNextAreaCapture();
}

/** Hands the selector to the next tab of the batch, if there is one left. */
async function startNextAreaCapture() {
    while (areaCaptureQueue.length > 0) {
        const tabId = areaCaptureQueue.shift();
        try {
            const tab = await chrome.tabs.get(tabId);
            if (!canInjectIntoPage(tab.url)) continue;
            await bringTabToFront(tab);
            await injectAreaSelector(tab.id);
            return;
        } catch (error) {
            console.error(`Error starting the area capture of tab ${tabId}:`, error);
        }
    }
}

/** The selector was closed with Escape: nothing was captured, and the batch goes on. */
function handleAreaSelectionCancelled(message, sender, sendResponse) {
    startNextAreaCapture();
    sendResponse({ success: true });
}

// --- Screen colour picker ---
//
// `window.EyeDropper` only exists on Windows, macOS and ChromeOS. On Linux Chrome
// does not expose the interface at all, so the pipette button of the theme editor
// had nothing to open and did nothing at all. These two handlers back a fallback
// built out of what an extension does have: a capture of the visible tab and an
// overlay injected over it (src/utils/screen-color-picker.js).

/**
 * Pages an extension may inject into at all. Chrome's own pages, the Web Store and
 * the new tab reject every injection, so the callers check before they try.
 * Shared with the page reader, which has exactly the same limitation.
 */
function canInjectIntoPage(url) {
    return typeof url === 'string' && /^(https?|file):/i.test(url);
}

/**
 * Opens the magnifier over the active tab. Called from an extension page (the theme
 * editor lives in the side panel, which has no tab of its own), so the target has to
 * be looked up rather than taken from the sender.
 */
async function handleStartScreenColorPicker(message, sender, sendResponse) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab || !tab.id || !canInjectIntoPage(tab.url)) {
            sendResponse({ success: false, reason: 'unsupportedPage' });
            return;
        }

        // No insertCSS here: the overlay lives in a shadow root and fetches its own
        // stylesheet, which is why both files are web-accessible resources.
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/utils/screen-color-picker.js'],
            world: 'ISOLATED',
        });
        sendResponse({ success: true, tabId: tab.id });
    } catch (error) {
        console.error('Error injecting the screen colour picker:', error);
        sendResponse({ success: false, reason: 'injectionFailed', message: String(error) });
    }
}

/**
 * The still the lens magnifies. Asked for by the overlay itself, before it is on
 * screen, so that the capture does not include it.
 */
function handleCaptureForColorPicker(sender, sendResponse) {
    const windowId = sender?.tab?.windowId;
    if (windowId === undefined) {
        sendResponse({ success: false, message: 'The request did not come from a tab.' });
        return;
    }
    chrome.tabs
        .captureVisibleTab(windowId, { format: 'png' })
        .then((dataUrl) => sendResponse({ success: true, dataUrl }))
        .catch((error) => sendResponse({ success: false, message: String(error) }));
}
