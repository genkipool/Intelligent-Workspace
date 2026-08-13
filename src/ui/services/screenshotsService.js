/**
 * screenshotsService.js — Refactored from screenshots.js
 *
 * Contains ALL exported functions from screenshots.js with:
 * - state.X → store imports from appStore.svelte.js (via get())
 * - dom.X → direct document.getElementById/querySelector
 * - fn.X() → direct function imports
 * - STORAGE_KEYS from state.js
 */

import { get } from 'svelte/store';
import { tick } from 'svelte';

/** Waits for a node that a Svelte view mounts in response to a store change. */
async function waitForElement(selector, attempts = 30) {
    for (let i = 0; i < attempts; i++) {
        const el = document.querySelector(selector);
        if (el) return el;
        await tick();
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return null;
}

import { applyTranslations, showNotification, showPersistentProgressNotification } from '../../utils/i18n.js';

import {
    saveScreenshotToDb,
    getScreenshotFromDb,
    deleteScreenshotFromDb,
    getAllScreenshotIdsFromDb,
} from '../../utils/db.js';

import { STORAGE_KEYS, screenshotConfig } from './constants.js';
import { getGroupInfoMap, getTotalScreenshotCount, dataUrlToBlob } from './utils.js';

import {
    isUrlViewActive,
    currentPanelUrl,
    currentPanelContext,
    isPerformingProgrammaticUpdate,
    isGalleryViewActive,
    currentGalleryContext,
    isNotesViewActive,
    currentNotesContext,
} from '../stores/appStore.svelte.js';

import { listGroupStore } from '../stores/listGroupStore.js';

import { fetchData, renderGroups, updateDuplicateCountBadge } from './groupsService.js';
import {
    closeUrlInPanel,
    restoreMainView,
    updateHeaderButtonsVisibility,
    updateScrollButtons,
} from './viewsService.js';
import { updateOrphanIndicators, closeNotesView, showNotesView, getOrphanScreenshots } from './notesService.js';

export async function handleHeaderScreenshot(e) {
    if (!get(isUrlViewActive) || !get(currentPanelUrl)) return;

    const tabs = await chrome.tabs.query({ url: get(currentPanelUrl) });
    if (tabs.length === 0) {
        showNotification('errorFindingTabForScreenshot', true);
        console.warn(`Could not find an open tab with URL: ${get(currentPanelUrl)}`);
        return;
    }
    const tabToCapture = tabs[0];

    if (e.ctrlKey || e.metaKey) {
        let areaDataUrl = null;
        await withTabActivation(tabToCapture, () => {
            return new Promise((resolve) => {
                const listener = (message) => {
                    if (message.action === 'areaScreenshotProcessFinished') {
                        chrome.runtime.onMessage.removeListener(listener);
                        if (message.success) {
                            areaDataUrl = message.dataUrl || null;
                            renderGroups();
                        } else {
                            showNotification('errorTakingScreenshot', true);
                        }
                        resolve();
                    }
                };
                chrome.runtime.onMessage.addListener(listener);

                chrome.runtime.sendMessage({ action: 'injectAreaSelector', tabId: tabToCapture.id });
            });
        });

        if (areaDataUrl) {
            try {
                const blob = await dataUrlToBlob(areaDataUrl);
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showNotification('screenshotCopied');
            } catch (e) {
                console.error('Clipboard copy failed:', e);
                showNotification('screenshotSavedNoCopy', true);
            }
        }
    } else {
        const window = await chrome.windows.get(tabToCapture.windowId);
        const originalState = {
            width: window.width,
            height: window.height,
            left: window.left,
            top: window.top,
            state: window.state,
        };

        try {
            if (originalState.state === 'maximized') {
                await chrome.windows.update(window.id, { state: 'normal' });
                await new Promise((resolve) => setTimeout(resolve, 200));
            }

            const newWidth = Math.round(originalState.width * 0.5);
            const newLeft = originalState.left + originalState.width - newWidth;

            await chrome.windows.update(window.id, {
                width: newWidth,
                left: newLeft,
            });

            await new Promise((resolve) => setTimeout(resolve, 500));

            await handleScreenshotRequest(tabToCapture, get(currentPanelContext));
        } catch (error) {
            console.error('An error occurred during the capture process with resizing:', error);
            showNotification('errorTakingScreenshot', true);
        } finally {
            if (originalState.state === 'maximized') {
                await chrome.windows.update(window.id, { state: 'maximized' });
            } else {
                await chrome.windows.update(window.id, {
                    width: originalState.width,
                    height: originalState.height,
                    left: originalState.left,
                    top: originalState.top,
                    state: originalState.state,
                });
            }
        }
    }
}

export async function toggleScreenshotPersistence(screenshotToToggle, buttonEl) {
    if (!screenshotToToggle || !screenshotToToggle.id) return;

    const isCurrentlyPersistent = screenshotToToggle.isPersistent || false;
    screenshotToToggle.isPersistent = !isCurrentlyPersistent;
    await saveScreenshotToDb(screenshotToToggle);

    const { [STORAGE_KEYS.PERSISTENT_SCREENSHOTS]: currentIds = [] } = await chrome.storage.local.get(
        STORAGE_KEYS.PERSISTENT_SCREENSHOTS,
    );
    const persistentSet = new Set(currentIds);

    if (screenshotToToggle.isPersistent) {
        persistentSet.add(screenshotToToggle.id);
        showNotification('screenshotArchived');
    } else {
        persistentSet.delete(screenshotToToggle.id);
        showNotification('screenshotUnarchived');
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.PERSISTENT_SCREENSHOTS]: Array.from(persistentSet) });

    if (buttonEl) {
        buttonEl.classList.toggle('active', screenshotToToggle.isPersistent);
        const tooltipKey = screenshotToToggle.isPersistent ? 'unpinScreenshot' : 'pinScreenshot';
        buttonEl.setAttribute('data-i18n-title', tooltipKey);
        applyTranslations(buttonEl);
    }

    await updateOrphanIndicators();
}

export async function handleDownloadAllScreenshots() {
    const ctx = get(currentGalleryContext);
    if (!ctx) return;
    const { type, id, secondaryId } = ctx;
    const { [STORAGE_KEYS.SCREENSHOTS]: screenshotData = {} } = await chrome.storage.session.get(
        STORAGE_KEYS.SCREENSHOTS,
    );

    let key = type === 'group' ? `g_${id}` : `s_${secondaryId}_${id}`;
    const screenshots = screenshotData[key] || [];

    if (screenshots.length === 0) {
        showNotification('noScreenshotsToDownload', true);
        return;
    }

    screenshots.forEach((screenshot, index) => {
        setTimeout(() => {
            downloadScreenshot(screenshot.dataUrl, screenshot.title);
        }, index * 300);
    });
    showNotification('allScreenshotsDownloading', false, [screenshots.length]);
}

export async function withTabActivation(tab, actionCallback) {
    if (!tab || !tab.id) {
        console.error('withTabActivation: A valid tab object is required.');
        showNotification('errorTakingScreenshot', true);
        return null;
    }

    let originalActiveTab = null;
    let originalTargetWindowState = null;
    const originalSidePanelWindowId = chrome.windows.WINDOW_ID_CURRENT;
    const CSS_INJECTION_KEY = 'ITG_HIDE_SCROLLBARS';
    const HIDE_SCROLLBAR_CSS = {
        css: `
            body::-webkit-scrollbar { display: none !important; }
            html::-webkit-scrollbar { display: none !important; }
            ::-webkit-scrollbar { display: none !important; }
        `,
    };

    try {
        const activeTabs = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
        });
        if (activeTabs.length > 0) originalActiveTab = activeTabs[0];

        const targetWindow = await chrome.windows.get(tab.windowId);
        let needsStateChange = false;
        if (targetWindow.state === 'minimized') {
            originalTargetWindowState = 'minimized';
            await chrome.windows.update(tab.windowId, {
                state: 'normal',
            });
            needsStateChange = true;
        }

        if (!tab.active || targetWindow.id !== originalActiveTab?.windowId) {
            await chrome.windows.update(tab.windowId, {
                focused: true,
            });
            await chrome.tabs.update(tab.id, {
                active: true,
            });
            needsStateChange = true;
        }

        if (needsStateChange) {
            await new Promise((resolve) => setTimeout(resolve, 750));
        }

        await chrome.scripting.insertCSS({
            target: {
                tabId: tab.id,
            },
            css: HIDE_SCROLLBAR_CSS.css,
            origin: 'USER',
        });

        await new Promise((resolve) => setTimeout(resolve, 50));

        return await actionCallback();
    } catch (error) {
        console.error('Error during tab activation or capture action:', error);

        if (
            error &&
            error.message &&
            (error.message.includes('QUOTA_BYTES') || error.message.includes('storage quota'))
        ) {
            showNotification('screenshotStorageFull', true);
        } else {
            showNotification('errorTakingScreenshot', true);
        }
        return null;
    } finally {
        try {
            await chrome.scripting.removeCSS({
                target: { tabId: tab.id },
                css: HIDE_SCROLLBAR_CSS.css,
                origin: 'USER',
            });
        } catch (cssError) {
            if (!cssError.message.includes('No tab with id')) {
                console.warn('Could not remove scrollbar CSS:', cssError.message);
            }
        }

        if (originalActiveTab && (originalActiveTab.id !== tab.id || originalActiveTab.windowId !== tab.windowId)) {
            try {
                await chrome.windows.update(originalActiveTab.windowId, {
                    focused: true,
                });
                await chrome.tabs.update(originalActiveTab.id, {
                    active: true,
                });
            } catch (restoreError) {
                console.warn('Could not restore the original active tab:', restoreError.message);
            }
        }
        if (originalTargetWindowState === 'minimized') {
            try {
                await chrome.windows.update(tab.windowId, {
                    state: 'minimized',
                });
            } catch (restoreError) {
                console.warn('Could not restore the target window state:', restoreError.message);
            }
        }
        try {
            await chrome.windows.update(originalSidePanelWindowId, {
                focused: true,
            });
        } catch (focusError) {
            console.warn('Could not refocus the side panel window:', focusError.message);
        }
    }
}

export async function handleScreenshotRequest(tab, context) {
    const totalCount = await getTotalScreenshotCount();
    const MAX_SCREENSHOTS = 100;

    if (totalCount >= MAX_SCREENSHOTS) {
        showNotification('screenshotLimitReached', true);
        return;
    }

    isPerformingProgrammaticUpdate.set(true);
    try {
        const dataUrl = await withTabActivation(tab, async () => {
            return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        });

        if (!dataUrl) {
            return;
        }

        const screenshotId = Date.now() + Math.random();

        if (!context) {
            console.warn('Screenshot context is undefined, using fallback.');
            context = { type: 'group', id: tab.groupId || -100 };
        }

        const { type, id, secondaryId } = context;
        let screenshotContextKey;
        let sessionGroupKey;
        let sessionSubgroupKey = null;

        const isUngroupedContext = (type === 'group' && id === -100) || (type === 'subgroup' && secondaryId === -100);

        if (isUngroupedContext) {
            sessionGroupKey = 'g_ungrouped';
            if (type === 'group') {
                screenshotContextKey = 'g_ungrouped';
            } else {
                screenshotContextKey = `s_ungrouped_${id}`;
                sessionSubgroupKey = screenshotContextKey;
            }
        } else {
            const groupInfoMap = await getGroupInfoMap();
            const groupId = type === 'group' ? id : secondaryId;
            const groupInfo = groupInfoMap.get(groupId);

            if (!groupInfo || !groupInfo.key) {
                console.warn(`Could not find a stable key for the group of tab ${tab.id}.`);
                showNotification('errorNoGroupForScreenshot', true);
                return;
            }
            const stableGroupKey = groupInfo.key;

            sessionGroupKey = `g_${groupId}`;
            if (type === 'group') {
                screenshotContextKey = `g_${stableGroupKey}`;
            } else {
                screenshotContextKey = `s_${stableGroupKey}_${id}`;
                sessionSubgroupKey = `s_${groupId}_${id}`;
            }
        }

        const newScreenshot = {
            id: screenshotId,
            dataUrl: dataUrl,
            title: tab.title,
            url: tab.url,
            contextKey: screenshotContextKey,
            isPersistent: false,
        };

        await saveScreenshotToDb(newScreenshot);

        const { [STORAGE_KEYS.SCREENSHOTS]: storedScreenshotIndexes = {} } = await chrome.storage.session.get(
            STORAGE_KEYS.SCREENSHOTS,
        );

        if (!storedScreenshotIndexes[sessionGroupKey]) storedScreenshotIndexes[sessionGroupKey] = [];
        storedScreenshotIndexes[sessionGroupKey].push(newScreenshot.id);

        if (sessionSubgroupKey) {
            if (!storedScreenshotIndexes[sessionSubgroupKey]) storedScreenshotIndexes[sessionSubgroupKey] = [];
            storedScreenshotIndexes[sessionSubgroupKey].push(newScreenshot.id);
        }

        await chrome.storage.session.set({ [STORAGE_KEYS.SCREENSHOTS]: storedScreenshotIndexes });

        try {
            const blob = await dataUrlToBlob(dataUrl);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            showNotification('screenshotSavedAndCopied');
        } catch (clipboardError) {
            console.error('Error copying screenshot to clipboard:', clipboardError);
            showNotification('screenshotSavedNoCopy', true);
        }

        const keyForCount = sessionSubgroupKey || sessionGroupKey;
        const newCount = storedScreenshotIndexes[keyForCount]?.length || 0;
        updateScreenshotCountBadge(context, newCount);
    } catch (error) {
        console.error('Error processing screenshot:', error);
        if (
            error &&
            error.message &&
            (error.message.includes('QUOTA_BYTES') || error.message.includes('storage quota'))
        ) {
            showNotification('screenshotStorageFull', true);
        } else {
            showNotification('errorTakingScreenshot', true);
        }
    } finally {
        isPerformingProgrammaticUpdate.set(false);
    }
}

/**
 * The images a gallery context holds: the ones the session index files under it plus
 * the archived ones whose stable context key points at it.
 *
 * Deleting an image used to count only the session index to decide whether anything
 * was left, so a gallery of archived images closed itself on the first delete. Both
 * the view and that decision read the same list from here.
 */
export async function resolveScreenshotIdsForContext(type, id, secondaryId, orphanScreenshots = null) {
    if (type === 'orphan') {
        const orphans = orphanScreenshots ?? (await getOrphanScreenshots());
        return orphans.map((s) => s.id);
    }

    const { [STORAGE_KEYS.SCREENSHOTS]: screenshotData = {} } = await chrome.storage.session.get(
        STORAGE_KEYS.SCREENSHOTS,
    );
    const sessionScreenshotIds = [];
    if (type === 'group') {
        const groupKey = id === -100 ? 'g_ungrouped' : `g_${id}`;
        if (screenshotData[groupKey]) {
            sessionScreenshotIds.push(...screenshotData[groupKey]);
        }
        const subgroupPrefix = id === -100 ? 's_ungrouped_' : `s_${id}_`;
        for (const key in screenshotData) {
            if (key.startsWith(subgroupPrefix)) {
                sessionScreenshotIds.push(...screenshotData[key]);
            }
        }
    } else {
        const key = `s_${secondaryId}_${id}`;
        if (screenshotData[key]) {
            sessionScreenshotIds.push(...screenshotData[key]);
        }
    }
    const finalScreenshotIds = new Set(sessionScreenshotIds);

    const { [STORAGE_KEYS.PERSISTENT_SCREENSHOTS]: persistentIdsArray = [] } = await chrome.storage.local.get(
        STORAGE_KEYS.PERSISTENT_SCREENSHOTS,
    );

    if (persistentIdsArray.length > 0) {
        const groupInfoMap = await getGroupInfoMap();
        const groupId = type === 'group' ? id : secondaryId;
        const groupInfo = groupInfoMap.get(groupId);

        if (groupInfo && groupInfo.key) {
            const stableGroupKey = groupInfo.key;

            const persistentPromises = persistentIdsArray.map((pid) => getScreenshotFromDb(pid));
            const allPersistentScreenshots = (await Promise.all(persistentPromises)).filter(Boolean);

            allPersistentScreenshots.forEach((screenshot) => {
                if (!screenshot.contextKey) return;

                let isMatch = false;
                if (type === 'group') {
                    const groupContextKey = `g_${stableGroupKey}`;
                    const subgroupPrefix = `s_${stableGroupKey}_`;
                    if (screenshot.contextKey === groupContextKey || screenshot.contextKey.startsWith(subgroupPrefix)) {
                        isMatch = true;
                    }
                } else {
                    const subgroupContextKey = `s_${stableGroupKey}_${id}`;
                    if (screenshot.contextKey === subgroupContextKey) {
                        isMatch = true;
                    }
                }

                if (isMatch) {
                    finalScreenshotIds.add(screenshot.id);
                }
            });
        }
    }

    return Array.from(finalScreenshotIds);
}

export async function showScreenshotGallery(type, id, secondaryId, orphanScreenshots = null) {
    closeUrlInPanel(true);
    isGalleryViewActive.set(true);
    currentGalleryContext.set({ type, id, secondaryId });

    const groupListContainer = document.getElementById('groups-list');
    const hiddenGroupsContainer = document.getElementById('hidden-groups-container');
    const hiddenContextContainer = document.getElementById('hidden-context-container');
    if (groupListContainer) groupListContainer.style.display = 'none';
    if (hiddenGroupsContainer) hiddenGroupsContainer.style.display = 'none';
    if (hiddenContextContainer) hiddenContextContainer.style.display = 'none';

    // #screenshot-gallery-view is mounted and unmounted from listGroupState.

    const mainHeaderTitle = document.getElementById('main-header-title');
    if (mainHeaderTitle) {
        // The attribute alone does not repaint the title; it has to be translated now.
        mainHeaderTitle.setAttribute('data-i18n', 'screenshotGalleryTitle');
        applyTranslations(mainHeaderTitle);
    }

    const screenshotIds = await resolveScreenshotIdsForContext(type, id, secondaryId, orphanScreenshots);

    listGroupStore.updateState({
        isGalleryViewActive: true,
        currentGalleryContext: { type, id, secondaryId },
    });

    await renderGalleryGrid(screenshotIds);

    updateHeaderButtonsVisibility({ screenshotsExistInGallery: screenshotIds.length > 0 });
    updateDuplicateCountBadge();
    updateScrollButtons();
}

/**
 * Fills the gallery grid from `gallery-item-template`, wiring pin, OCR, copy,
 * download and delete on each card. The grid element is mounted by
 * ScreenshotGalleryView, so we wait a tick before writing into it.
 */
async function renderGalleryGrid(screenshotIds) {
    const grid = await waitForElement('#screenshot-gallery-view .gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (screenshotIds.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = chrome.i18n.getMessage('noScreenshots') || '';
        grid.appendChild(empty);
        return;
    }

    const itemTemplate = document.getElementById('gallery-item-template');
    if (!itemTemplate) return;

    for (const screenshotId of screenshotIds) {
        const galleryItem = itemTemplate.content.cloneNode(true).firstElementChild;
        const img = galleryItem.querySelector('.gallery-image');
        const pinBtn = galleryItem.querySelector('.gallery-pin-btn');
        grid.appendChild(galleryItem);

        getScreenshotFromDb(screenshotId).then((fullScreenshot) => {
            if (!fullScreenshot) {
                galleryItem.remove();
                return;
            }
            img.src = fullScreenshot.dataUrl;
            img.alt = `Screenshot of ${fullScreenshot.title}`;
            galleryItem.querySelector('.gallery-item-title').textContent = fullScreenshot.title;

            galleryItem.addEventListener('click', () => chrome.tabs.create({ url: 'https://excalidraw.com/' }));
            galleryItem.querySelector('.copy-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                copyScreenshot(fullScreenshot.dataUrl);
            });
            galleryItem.querySelector('.download-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                downloadScreenshot(fullScreenshot.dataUrl, fullScreenshot.title);
            });
            galleryItem.querySelector('.delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteScreenshot(fullScreenshot.id);
            });

            if (pinBtn) {
                const isPersistent = fullScreenshot.isPersistent || false;
                pinBtn.classList.toggle('active', isPersistent);
                pinBtn.setAttribute('data-i18n-title', isPersistent ? 'unpinScreenshot' : 'pinScreenshot');
                pinBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleScreenshotPersistence(fullScreenshot, pinBtn);
                });
            }

            const ocrBtn = galleryItem.querySelector('.gallery-ocr-btn');
            if (ocrBtn) {
                ocrBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleOcrScreenshot(fullScreenshot.dataUrl, ocrBtn);
                });
            }
            applyTranslations(galleryItem);
        });
    }
}

export async function clearAllContextDataUI(contextToDelete, config) {
    if (!contextToDelete || !config) {
        console.error('clearAllContextDataUI was called without a valid context or configuration.');
        return;
    }

    if (contextToDelete.type === 'orphan') {
        try {
            const allGroupDataRaw = await fetchData();
            const groupInfoMap = await getGroupInfoMap();

            const existingContextKeys = new Set();
            for (const item of allGroupDataRaw) {
                if (item.group.id === -100) {
                    existingContextKeys.add('g_ungrouped');
                    const domainsInUngrouped = new Set(
                        item.tabs
                            .map((tab) => {
                                try {
                                    return new URL(tab.url).hostname.replace(/^www\./, '');
                                } catch (e) {
                                    return null;
                                }
                            })
                            .filter(Boolean),
                    );
                    domainsInUngrouped.forEach((domain) => existingContextKeys.add(`s_ungrouped_${domain}`));
                    continue;
                }
                const groupInfo = groupInfoMap.get(item.group.id);
                if (!groupInfo || !groupInfo.key) continue;
                existingContextKeys.add(`g_${groupInfo.key}`);
                const domainsInGroup = new Set(
                    item.tabs
                        .map((tab) => {
                            try {
                                return new URL(tab.url).hostname.replace(/^www\./, '');
                            } catch (e) {
                                return null;
                            }
                        })
                        .filter(Boolean),
                );
                domainsInGroup.forEach((domain) => existingContextKeys.add(`s_${groupInfo.key}_${domain}`));
            }

            const allPersistentItems = await config.getPersistentItemsFunction();
            const orphanItems = allPersistentItems.filter(
                (item) => item.contextKey && !existingContextKeys.has(item.contextKey),
            );

            if (orphanItems.length === 0) {
                showNotification(config.notificationNoOrphans, true);
                return;
            }

            const orphanItemIds = orphanItems.map((item) => item.id);
            await Promise.all(orphanItemIds.map((id) => config.deleteItemFromDbFunction(id)));

            const { [config.persistentKey]: currentIds = [] } = await chrome.storage.local.get(config.persistentKey);
            const updatedPersistentSet = new Set(currentIds);
            orphanItemIds.forEach((id) => updatedPersistentSet.delete(id));
            await chrome.storage.local.set({ [config.persistentKey]: Array.from(updatedPersistentSet) });

            showNotification(config.notificationOrphanSuccess, false, [orphanItemIds.length]);

            if (config.name === 'Notes') closeNotesView();
            if (config.name === 'Screenshots') closeScreenshotGallery();
            await renderGroups();

            return;
        } catch (error) {
            console.error(`Error deleting orphan ${config.name}:`, error);
            showNotification(config.notificationError, true);
            return;
        }
    }

    const { type, id, secondaryId } = contextToDelete;
    let dbContextKey;
    let numericContextKey = null;
    let sessionKeysToDelete = new Set();

    const isUngroupedContext = (type === 'group' && id === -100) || (type === 'subgroup' && secondaryId === -100);

    if (isUngroupedContext) {
        dbContextKey = type === 'group' ? 'g_ungrouped' : `s_ungrouped_${id}`;
        sessionKeysToDelete.add(dbContextKey);
    } else {
        const groupInfoMap = await getGroupInfoMap();
        const groupId = type === 'group' ? id : secondaryId;
        const groupInfo = groupInfoMap.get(groupId);

        const stableKey = groupInfo && groupInfo.key ? groupInfo.key : String(groupId);
        dbContextKey = type === 'group' ? `g_${stableKey}` : `s_${stableKey}_${id}`;
        numericContextKey = type === 'group' ? `g_${groupId}` : `s_${groupId}_${id}`;
        sessionKeysToDelete.add(type === 'group' ? `g_${groupId}` : `s_${groupId}_${id}`);
    }

    const { deletedCount, deletedPersistentIds } = await config.dbClearFunction(dbContextKey, numericContextKey);

    if (deletedPersistentIds && deletedPersistentIds.length > 0) {
        const { [config.persistentKey]: currentIds = [] } = await chrome.storage.local.get(config.persistentKey);
        const persistentSet = new Set(currentIds);
        deletedPersistentIds.forEach((persistentId) => persistentSet.delete(persistentId));
        await chrome.storage.local.set({ [config.persistentKey]: Array.from(persistentSet) });
    }

    const sessionResult = await chrome.storage.session.get(config.sessionKey);
    const allIndexes = sessionResult[config.sessionKey] || {};

    if (type === 'group') {
        const subgroupPrefix = id === -100 ? 's_ungrouped_' : `s_${id}_`;
        for (const key in allIndexes) {
            if (key.startsWith(subgroupPrefix)) {
                sessionKeysToDelete.add(key);
            }
        }
    }

    if (type === 'subgroup') {
        const groupId = secondaryId;
        const sessionGroupKey = groupId === -100 ? 'g_ungrouped' : `g_${groupId}`;
        const deletedSessionIds = new Set(allIndexes[sessionKeysToDelete.values().next().value] || []);

        if (allIndexes[sessionGroupKey] && deletedSessionIds.size > 0) {
            allIndexes[sessionGroupKey] = allIndexes[sessionGroupKey].filter((id) => !deletedSessionIds.has(id));
            if (allIndexes[sessionGroupKey].length === 0) {
                delete allIndexes[sessionGroupKey];
            }
        }
    }

    sessionKeysToDelete.forEach((key) => {
        delete allIndexes[key];
    });
    await chrome.storage.session.set({ [config.sessionKey]: allIndexes });

    if (deletedCount > 0) {
        showNotification(config.notificationSuccess, false, [deletedCount]);
    }

    if (
        config.name === 'Notes' &&
        get(isNotesViewActive) &&
        get(currentNotesContext) &&
        get(currentNotesContext).id === id &&
        get(currentNotesContext).type === type
    ) {
        await showNotesView(get(currentNotesContext));
    } else if (
        config.name === 'Screenshots' &&
        get(isGalleryViewActive) &&
        get(currentGalleryContext) &&
        get(currentGalleryContext).id === id &&
        get(currentGalleryContext).type === type
    ) {
        await closeScreenshotGallery();
    }

    await renderGroups();
}

export function closeScreenshotGallery(isSwitchingView = false) {
    isGalleryViewActive.set(false);
    currentGalleryContext.set(null);

    listGroupStore.updateState({
        isGalleryViewActive: false,
        currentGalleryContext: null,
    });

    if (!isSwitchingView) {
        restoreMainView();
    }
}

export async function copyScreenshot(dataUrl) {
    try {
        const blob = await dataUrlToBlob(dataUrl);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showNotification('screenshotCopied');
    } catch (e) {
        console.error('Error copying screenshot:', e);
        showNotification('errorCopyingScreenshot', true);
    }
}

/**
 * Loads the OCR engine on demand.
 *
 * It is a 250 KB UMD bundle that only this feature needs, and nothing was loading it,
 * so every OCR attempt failed before it started.
 */
async function loadTesseract() {
    if (window.Tesseract) return window.Tesseract;
    await import('../../lib/tesseract.min.js');
    return window.Tesseract;
}

export async function handleOcrScreenshot(dataUrl, buttonEl) {
    const Tesseract = await loadTesseract();
    if (!Tesseract) {
        showNotification('ocrError', true);
        return;
    }

    buttonEl.disabled = true;
    buttonEl.classList.add('running');
    const progressNotice = await showPersistentProgressNotification('ocrProcessing', ['0']);

    try {
        const worker = await Tesseract.createWorker('spa+eng', 1, {
            workerBlobURL: false,
            workerPath: chrome.runtime.getURL('src/lib/worker.min.js'),
            corePath: chrome.runtime.getURL('src/lib/tesseract-core.wasm.js'),
            logger: (m) => {
                if (m.status === 'recognizing text' && m.progress != null) {
                    const pct = Math.round(m.progress * 100);
                    buttonEl.title = `OCR... ${pct}%`;
                    progressNotice.updateProgress([String(pct)]);
                }
            },
        });
        const ret = await worker.recognize(dataUrl);
        await worker.terminate();

        progressNotice.close();

        const text = ret.data?.text?.trim();
        if (!text) {
            showNotification('ocrNoText', true);
            return;
        }

        try {
            if (navigator.hasFocus && navigator.hasFocus() && navigator.clipboard) {
                await navigator.clipboard.writeText(text);
            } else {
                throw new Error('No focus or clipboard writeText failed');
            }
        } catch (clipErr) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }

        showNotification('ocrSuccess');
    } catch (e) {
        console.error('OCR Error:', e);
        progressNotice.close();
        showNotification('ocrError', true);
    } finally {
        buttonEl.disabled = false;
        buttonEl.classList.remove('running');
        buttonEl.setAttribute('data-i18n-title', 'ocrScreenshot');
        applyTranslations(buttonEl);
    }
}

export function downloadScreenshot(dataUrl, title) {
    const link = document.createElement('a');
    link.href = dataUrl;
    const safeTitle = (title || 'screenshot').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.download = `${safeTitle}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function deleteScreenshot(screenshotId) {
    const screenshotToDelete = await getScreenshotFromDb(screenshotId);

    await deleteScreenshotFromDb(screenshotId);

    if (screenshotToDelete && screenshotToDelete.isPersistent) {
        const { [STORAGE_KEYS.PERSISTENT_SCREENSHOTS]: currentIds = [] } = await chrome.storage.local.get(
            STORAGE_KEYS.PERSISTENT_SCREENSHOTS,
        );
        const persistentSet = new Set(currentIds);
        if (persistentSet.has(screenshotId)) {
            persistentSet.delete(screenshotId);
            await chrome.storage.local.set({
                [STORAGE_KEYS.PERSISTENT_SCREENSHOTS]: Array.from(persistentSet),
            });
        }
    }

    const { [STORAGE_KEYS.SCREENSHOTS]: storedScreenshotIndexes = {} } = await chrome.storage.session.get(
        STORAGE_KEYS.SCREENSHOTS,
    );
    let foundAndDeleted = false;
    for (const key in storedScreenshotIndexes) {
        const initialLength = storedScreenshotIndexes[key].length;
        storedScreenshotIndexes[key] = storedScreenshotIndexes[key].filter((id) => id !== screenshotId);
        if (storedScreenshotIndexes[key].length < initialLength) {
            foundAndDeleted = true;
        }
        if (storedScreenshotIndexes[key].length === 0) {
            delete storedScreenshotIndexes[key];
        }
    }

    if (foundAndDeleted) {
        await chrome.storage.session.set({
            [STORAGE_KEYS.SCREENSHOTS]: storedScreenshotIndexes,
        });
    }

    // An archived image is not in the session index at all, so gating the redraw on
    // having removed it from there left the gallery showing a card that no longer
    // exists.
    if (get(isGalleryViewActive) && get(currentGalleryContext)) {
        const { type, id, secondaryId } = get(currentGalleryContext);
        // Only an empty gallery goes back to the group list; while images are left the
        // view stays where it is, redrawn without the one that just went.
        const remaining = await resolveScreenshotIdsForContext(type, id, secondaryId);

        if (remaining.length === 0) {
            await closeScreenshotGallery();
        } else if (type === 'orphan') {
            await showScreenshotGallery(type, id, secondaryId, await getOrphanScreenshots());
        } else {
            await showScreenshotGallery(type, id, secondaryId);
        }
    }

    await updateOrphanIndicators();
    await renderGroups();
}

export async function updateScreenshotCountBadge(context, newCount) {
    const { type, id, secondaryId } = context;
    let actionsContainer = null;
    let groupElement = null;

    if (type === 'group') {
        groupElement = document.querySelector(`.group-item[data-group-id="${id}"]`);
        if (groupElement) {
            actionsContainer = groupElement.querySelector('.group-actions');
        }
    } else {
        groupElement = document.querySelector(`.group-item[data-group-id="${secondaryId}"]`);
        if (groupElement) {
            const subgroups = groupElement.querySelectorAll('.domain-subgroup');
            for (const sg of subgroups) {
                const titleEl = sg.querySelector('.domain-title');
                if (titleEl && titleEl.textContent === id) {
                    actionsContainer = sg.querySelector('.subgroup-actions');
                    break;
                }
            }
        }
    }

    if (!actionsContainer) {
        console.warn('Could not find action container to update badge.', context);
        return;
    }

    let galleryBtn = actionsContainer.querySelector('.view-screenshots-btn');

    if (newCount > 0) {
        if (!galleryBtn) {
            const galleryBtnTemplate = document.getElementById('view-screenshots-btn-template');
            galleryBtn = galleryBtnTemplate.content.cloneNode(true).firstElementChild;

            galleryBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupTitle = groupElement.querySelector('.group-title')?.dataset.baseName || secondaryId || id;
                showScreenshotGallery(type, id, secondaryId || groupTitle);
            });

            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'delete-screenshots-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = chrome.i18n.getMessage('deleteAllScreenshotsContext') || 'Eliminar todas las capturas';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await clearAllContextDataUI({ type, id, secondaryId }, screenshotConfig);
            });
            galleryBtn.appendChild(deleteBtn);
            actionsContainer.prepend(galleryBtn);
            applyTranslations(galleryBtn);
        }

        galleryBtn.classList.remove('hidden');
        const badge = galleryBtn.querySelector('.screenshot-count-badge');
        badge.textContent = newCount;
        badge.classList.add('updated');
        badge.addEventListener('animationend', () => badge.classList.remove('updated'), { once: true });
    } else if (galleryBtn) {
        galleryBtn.remove();
    }
}

export function initScreenshotEvents() {
    const headerScreenshotBtn = document.getElementById('header-screenshot-btn');
    if (headerScreenshotBtn) {
        headerScreenshotBtn.addEventListener('click', handleHeaderScreenshot);
    }
    const downloadAllScreenshotsBtn = document.getElementById('download-all-screenshots-btn');
    if (downloadAllScreenshotsBtn) {
        downloadAllScreenshotsBtn.addEventListener('click', handleDownloadAllScreenshots);
    }
}
