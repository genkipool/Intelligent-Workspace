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
