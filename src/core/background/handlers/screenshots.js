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
            if (saveToGallery) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '/assets/icons/icon128.png',
                    title: 'Intelligent Tab Group',
                    message: getI18nMsg('screenshotSavedAndCopied', [], 'Captura guardada y copiada'),
                });
            }
        } catch (error) {
            console.error('Error capturing screen area:', error);
            const finishErrMsg = { action: 'areaScreenshotProcessFinished', success: false };
            chrome.runtime.sendMessage(finishErrMsg);
            if (tab && tab.id) {
                chrome.tabs.sendMessage(tab.id, finishErrMsg).catch(() => {});
            }
            if (saveToGallery) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '/assets/icons/icon128.png',
                    title: 'Intelligent Tab Group',
                    message: getI18nMsg('errorTakingScreenshot', [], 'Error al realizar la captura'),
                });
            }
        }
    })();
}

/**
 * Captures the full visible page as a screenshot.
 */
async function handleCaptureFullPageScreenshot(sender, sendResponse) {
    try {
        const tab = await resolveTabForScreenshot(sender);
        if (!tab) throw new Error('No tab found to capture');

        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        if (!dataUrl) throw new Error('The capture returned an empty result.');

        // Save to database and update session index
        const screenshotId = Date.now();
        const newScreenshot = {
            id: screenshotId,
            dataUrl: dataUrl,
            title: tab.title,
            url: tab.url,
            contextKey: getScreenshotContextKey(tab),
            isPersistent: false,
        };
        await saveScreenshotToDb(newScreenshot);
        await updateScreenshotSessionIndex(tab, screenshotId);

        // Broadcast finish message
        const finishMsg = {
            action: 'fullPageScreenshotFinished',
            success: true,
        };
        chrome.runtime.sendMessage(finishMsg);
        if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, finishMsg).catch(() => {});
        }
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: 'Intelligent Tab Group',
            message: getI18nMsg('screenshotSavedAndCopied', [], 'Captura guardada y copiada'),
        });

        sendResponse({ success: true, dataUrl });
    } catch (error) {
        console.error('Error capturing full page:', error);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: 'Intelligent Tab Group',
            message: getI18nMsg('errorTakingScreenshot', [], 'Error al realizar la captura'),
        });
        sendResponse({ success: false, error: error.message });
    }
}

function handleCaptureFullPageFromShortcut(message, sender, sendResponse) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: '/assets/icons/icon128.png',
        title: 'Intelligent Tab Group',
        message: getI18nMsg('capturingFullPageNotify', [], 'Capturando página completa...'),
    });
    handleCaptureFullPageScreenshot(sender, sendResponse);
}

function handleInjectAreaSelector(message, sender, sendResponse) {
    const tabId = message.tabId;
    const saveToGallery = message.saveToGallery !== false;
    if (tabId) {
        chrome.scripting
            .executeScript({
                target: { tabId },
                func: (save) => {
                    window._areaSelectorSaveToGallery = save;
                },
                args: [saveToGallery],
                world: 'ISOLATED',
            })
            .then(() => {
                chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['src/utils/area-selector.js'],
                    world: 'ISOLATED',
                });
                chrome.scripting.insertCSS({
                    target: { tabId },
                    files: ['src/utils/area-selector.css'],
                });
            })
            .catch((err) => {
                console.error('Error injecting area selector script:', err);
            });
    }
    sendResponse({ success: true });
}

function handleCaptureAreaFromShortcut(message, sender, sendResponse) {
    const tab = sender.tab;
    if (tab && tab.id) {
        chrome.scripting.executeScript({
            target: {
                tabId: tab.id,
            },
            files: ['src/utils/area-selector.js'],
            world: 'ISOLATED',
        });
        chrome.scripting.insertCSS({
            target: {
                tabId: tab.id,
            },
            files: ['src/utils/area-selector.css'],
        });
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: 'Intelligent Tab Group',
            message: getI18nMsg('capturingAreaNotify', [], 'Selecciona el área a capturar'),
        });
    }
    sendResponse({
        success: true,
    });
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
