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
    getScreenshotsFromDb,
    deleteScreenshotFromDb,
    getAllScreenshotIdsFromDb,
    getAllNoteIdsFromDb,
    getNoteFromDb,
} from '../../utils/db.js';

import { STORAGE_KEYS, screenshotConfig } from './constants.js';
import { imagesToPdfBlob, toPdfFileName } from '../../utils/pdf.js';
import { encodeImage, toImageFileName, ImageTooLargeError } from '../../utils/imageFormats.js';
import { openModal, showDownloadFormatModal } from '../stores/modalStore.js';
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
        await captureTabArea(tabToCapture);
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

    const screenshotIds = await resolveScreenshotIdsForContext(type, id, secondaryId);
    if (!screenshotIds || screenshotIds.length === 0) {
        showNotification('noScreenshotsToDownload', true);
        return;
    }

    const screenshots = (await Promise.all(screenshotIds.map((sid) => getScreenshotFromDb(sid)))).filter(Boolean);
    askDownloadFormat(screenshots);
}

/** How many images the gallery holds in total, captured and uploaded together. */
const MAX_SCREENSHOTS = 100;

/* ------------------------------------------------------------ pictures from disk */

/**
 * Where an upload is filed when the gallery on screen belongs to no group.
 *
 * The orphan gallery is the one place with no group behind it, and every context key
 * a group produces starts `g_` or `s_`. This one starts with neither, so an image
 * filed under it can never be mistaken for a group's and stays where it was put.
 */
const UPLOAD_ORPHAN_CONTEXT_KEY = 'uploads';

/** How deep into a chosen folder to look, and how many pictures to take from it. */
const UPLOAD_MAX_DEPTH = 4;
const UPLOAD_MAX_FILES = 200;

/** The formats a browser can be relied on to decode. */
const UPLOAD_ACCEPT = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp', '.svg', '.ico'];

function isImageFile(file) {
    if (file?.type?.startsWith('image/')) return true;
    // A folder handed over by the file input can carry files with no type at all,
    // and the extension is then the only thing left to go on.
    return !file?.type && UPLOAD_ACCEPT.some((extension) => file?.name?.toLowerCase().endsWith(extension));
}

/**
 * Asks for pictures and adds them to the gallery on screen.
 *
 * The File System Access pickers are the way in wherever they exist, because the
 * `<input type=file webkitdirectory>` behind them makes Chrome ask "upload N files to
 * this site?" — the wrong question for something that never leaves the browser. The
 * inputs stay in the toolbar as the fallback, and as what the picker falls back to
 * when it is refused.
 */
export async function pickImageFiles() {
    if (typeof window.showOpenFilePicker === 'function') {
        try {
            const handles = await window.showOpenFilePicker({
                id: 'itg-gallery-images',
                multiple: true,
                startIn: 'pictures',
                types: [{ description: 'Images', accept: { 'image/*': UPLOAD_ACCEPT } }],
            });
            const files = await Promise.all(handles.map((handle) => handle.getFile()));
            await uploadImagesToGallery(files);
            return;
        } catch (error) {
            // Closing the picker is an answer, not a failure.
            if (error?.name === 'AbortError') return;
        }
    }
    document.getElementById('gallery-upload-files-input')?.click();
}

/** The same, for a whole folder: every picture in it, subfolders included. */
export async function pickImageFolder() {
    if (typeof window.showDirectoryPicker === 'function') {
        try {
            const handle = await window.showDirectoryPicker({
                id: 'itg-gallery-folder',
                mode: 'read',
                startIn: 'pictures',
            });
            const files = [];
            await collectImages(handle, files, 0);
            await uploadImagesToGallery(files);
            return;
        } catch (error) {
            if (error?.name === 'AbortError') return;
        }
    }
    document.getElementById('gallery-upload-folder-input')?.click();
}

/** Walks a chosen folder, keeping only what is a picture. */
async function collectImages(directory, files, depth) {
    for await (const entry of directory.values()) {
        if (files.length >= UPLOAD_MAX_FILES) return;
        if (entry.kind === 'directory') {
            if (depth < UPLOAD_MAX_DEPTH) await collectImages(entry, files, depth + 1);
            continue;
        }
        const file = await entry.getFile();
        if (isImageFile(file)) files.push(file);
    }
}

/** The keys an upload is filed under, given the gallery it is being added to. */
async function resolveUploadKeys(context) {
    if (context.type === 'orphan') {
        return { contextKey: UPLOAD_ORPHAN_CONTEXT_KEY, sessionGroupKey: null, sessionSubgroupKey: null };
    }
    // The tab is only ever read for the warning this may log, and an upload has none.
    return resolveScreenshotKeys({ id: 'upload' }, context);
}

/**
 * Reads the chosen pictures into the gallery that is open.
 *
 * They are stored exactly as captures are — same table, same session index, same
 * limit — so everything the gallery already does to a capture works on them too: the
 * pin, the reader, the download in any of the four formats. The one difference is
 * that the bytes are whatever was on disk rather than a PNG, which is why the
 * download dialog re-encodes rather than renaming.
 *
 * @param {File[]} files
 */
export async function uploadImagesToGallery(files) {
    const context = get(currentGalleryContext);
    if (!context) return;

    const images = Array.from(files || []).filter(isImageFile);
    if (images.length === 0) {
        if (files?.length) showNotification('noImagesInSelection', true);
        return;
    }

    const totalCount = await getTotalScreenshotCount();
    const room = Math.max(0, MAX_SCREENSHOTS - totalCount);
    if (room === 0) {
        showNotification('screenshotLimitReached', true);
        return;
    }
    const kept = images.slice(0, room);

    const keys = await resolveUploadKeys(context);
    if (!keys) return;

    const progress =
        kept.length > 1 ? await showPersistentProgressNotification('uploadingImages', [0, kept.length]) : null;

    const addedIds = [];
    let failed = 0;
    try {
        for (const [position, file] of kept.entries()) {
            try {
                const record = {
                    id: Date.now() + Math.random(),
                    dataUrl: await readFileAsDataUrl(file),
                    // The extension is noise in a caption and wrong in a file name the
                    // download is about to give an extension of its own.
                    title: file.name.replace(/\.[^.]+$/, '') || file.name,
                    url: '',
                    contextKey: keys.contextKey,
                    isPersistent: false,
                    isFullPage: false,
                };
                await saveScreenshotToDb(record);
                addedIds.push(record.id);
            } catch (error) {
                failed++;
                console.error(`Error reading ${file?.name}:`, error);
            }
            await progress?.updateProgress([position + 1, kept.length]);
        }
    } finally {
        progress?.close();
    }

    if (addedIds.length > 0 && keys.sessionGroupKey) {
        const { [STORAGE_KEYS.SCREENSHOTS]: indexes = {} } = await chrome.storage.session.get(STORAGE_KEYS.SCREENSHOTS);
        (indexes[keys.sessionGroupKey] ||= []).push(...addedIds);
        if (keys.sessionSubgroupKey) (indexes[keys.sessionSubgroupKey] ||= []).push(...addedIds);
        await chrome.storage.session.set({ [STORAGE_KEYS.SCREENSHOTS]: indexes });
    }

    if (failed > 0) showNotification('errorUploadingImages', true, [failed]);
    if (kept.length < images.length) showNotification('screenshotLimitReached', true);
    if (addedIds.length === 0) return;

    showNotification('imagesUploaded', false, [addedIds.length]);
    await refreshGalleryAfterUpload(context, addedIds);
    await updateOrphanIndicators();
    await renderGroups();
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('The file could not be read'));
        reader.readAsDataURL(file);
    });
}

/**
 * Puts the new pictures on screen.
 *
 * A gallery opened with a list of its own — the orphan section hands one over — is
 * redrawn from that list plus what was just added, for the same reason deleting from
 * one is: re-deriving the list asks a different question and gets a different set.
 */
async function refreshGalleryAfterUpload(context, addedIds) {
    if (!get(isGalleryViewActive)) return;
    const { type, id, secondaryId, explicitIds } = context;
    if (explicitIds) {
        const combined = [...explicitIds, ...addedIds];
        currentGalleryContext.set({ type, id, secondaryId, explicitIds: combined });
        await showScreenshotGallery(
            type,
            id,
            secondaryId,
            combined.map((galleryId) => ({ id: galleryId })),
        );
        return;
    }
    await showScreenshotGallery(type, id, secondaryId);
}

/**
 * Brings a tab forward, runs something on it, and puts the browser back as it was.
 *
 * @param {chrome.tabs.Tab} tab
 * @param {() => Promise<any>} actionCallback
 * @param {{keepFocus?: boolean}} [options] `keepFocus` leaves the browser looking at
 *   whatever it ended on. A batch of captures sets it: without it every single tab
 *   bounced back to the tab the user was on before the next one was brought forward,
 *   which is a whole group's worth of flicker for no reason. The caller that sets it
 *   owns putting the focus back, once, at the end.
 */
export async function withTabActivation(tab, actionCallback, options = {}) {
    if (!tab || !tab.id) {
        console.error('withTabActivation: A valid tab object is required.');
        showNotification('errorTakingScreenshot', true);
        return null;
    }

    let originalActiveTab = null;
    let originalTargetWindowState = null;
    const originalSidePanelWindowId = chrome.windows.WINDOW_ID_CURRENT;
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

        // Never `return` from here: a return inside a finally throws away whatever the
        // try block was returning, which in this case is the capture itself.
        if (!options.keepFocus) {
            await restoreFocusAfterCapture(
                originalActiveTab,
                tab,
                originalTargetWindowState,
                originalSidePanelWindowId,
            );
        }
    }
}

/** Puts back the tab, the window state and the focus a capture borrowed. */
async function restoreFocusAfterCapture(originalActiveTab, tab, originalTargetWindowState, sidePanelWindowId) {
    if (originalActiveTab && (!tab || originalActiveTab.id !== tab.id || originalActiveTab.windowId !== tab.windowId)) {
        try {
            await chrome.windows.update(originalActiveTab.windowId, { focused: true });
            await chrome.tabs.update(originalActiveTab.id, { active: true });
        } catch (restoreError) {
            console.warn('Could not restore the original active tab:', restoreError.message);
        }
    }
    if (originalTargetWindowState === 'minimized' && tab) {
        try {
            await chrome.windows.update(tab.windowId, { state: 'minimized' });
        } catch (restoreError) {
            console.warn('Could not restore the target window state:', restoreError.message);
        }
    }
    try {
        await chrome.windows.update(sidePanelWindowId ?? chrome.windows.WINDOW_ID_CURRENT, { focused: true });
    } catch (focusError) {
        console.warn('Could not refocus the side panel window:', focusError.message);
    }
}

/**
 * Where a capture of this tab belongs, in both the stable index and the session one.
 *
 * Pulled out of the capture itself because a full page taken in parts files several
 * images under the very same keys, and working them out once per image was both
 * wasteful and a chance for two parts to disagree.
 *
 * @returns {Promise<{contextKey: string, sessionGroupKey: string, sessionSubgroupKey: string|null}|null>}
 */
async function resolveScreenshotKeys(tab, context) {
    const { type, id, secondaryId } = context;
    const isUngroupedContext = (type === 'group' && id === -100) || (type === 'subgroup' && secondaryId === -100);

    if (isUngroupedContext) {
        if (type === 'group') {
            return { contextKey: 'g_ungrouped', sessionGroupKey: 'g_ungrouped', sessionSubgroupKey: null };
        }
        return {
            contextKey: `s_ungrouped_${id}`,
            sessionGroupKey: 'g_ungrouped',
            sessionSubgroupKey: `s_ungrouped_${id}`,
        };
    }

    const groupInfoMap = await getGroupInfoMap();
    const groupId = type === 'group' ? id : secondaryId;
    const groupInfo = groupInfoMap.get(groupId);

    if (!groupInfo || !groupInfo.key) {
        console.warn(`Could not find a stable key for the group of tab ${tab.id}.`);
        showNotification('errorNoGroupForScreenshot', true);
        return null;
    }

    if (type === 'group') {
        return { contextKey: `g_${groupInfo.key}`, sessionGroupKey: `g_${groupId}`, sessionSubgroupKey: null };
    }
    return {
        contextKey: `s_${groupInfo.key}_${id}`,
        sessionGroupKey: `g_${groupId}`,
        sessionSubgroupKey: `s_${groupId}_${id}`,
    };
}

/** Writes one image to the database and files its id under both session keys. */
async function storeScreenshot(record, keys) {
    await saveScreenshotToDb(record);

    const { [STORAGE_KEYS.SCREENSHOTS]: indexes = {} } = await chrome.storage.session.get(STORAGE_KEYS.SCREENSHOTS);
    (indexes[keys.sessionGroupKey] ||= []).push(record.id);
    if (keys.sessionSubgroupKey) (indexes[keys.sessionSubgroupKey] ||= []).push(record.id);
    await chrome.storage.session.set({ [STORAGE_KEYS.SCREENSHOTS]: indexes });

    const countKey = keys.sessionSubgroupKey || keys.sessionGroupKey;
    return indexes[countKey]?.length || 0;
}

/**
 * Takes the picture, or pictures, of one tab.
 *
 * The three modes are the three things "capture" can mean, and the worker does the
 * walking for the two that need it: it is the only side that can scroll a tab and
 * capture it in the same turn.
 *
 * @returns {Promise<string[]>} One data URL per image the mode produces.
 */
async function captureImagesFor(tab, mode) {
    if (mode === 'visible') {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        return dataUrl ? [dataUrl] : [];
    }

    const response = await chrome.runtime.sendMessage({
        action: 'captureFullPage',
        tabId: tab.id,
        mode: mode === 'fullPageParts' ? 'parts' : 'stitched',
    });
    if (!response?.success) throw new Error(response?.error || 'Full page capture failed');
    return mode === 'fullPageParts' ? response.dataUrls || [] : [response.dataUrl];
}

/**
 * Captures one tab and files it under a gallery context.
 *
 * @param {chrome.tabs.Tab} tab
 * @param {{type: string, id: number|string, secondaryId?: number|string}} context
 * @param {{mode?: 'visible'|'fullPage'|'fullPageParts', silent?: boolean, keepFocus?: boolean}} [options]
 *   `silent` skips the clipboard copy and the per-capture notification, which is what
 *   a batch of tabs wants; `keepFocus` leaves the browser on the tab it ended on, for
 *   a caller that is about to capture another one.
 * @returns {Promise<number>} How many images were saved.
 */
export async function handleScreenshotRequest(tab, context, options = {}) {
    const { mode = 'visible', silent = false, keepFocus = false } = options;
    const totalCount = await getTotalScreenshotCount();

    if (totalCount >= MAX_SCREENSHOTS) {
        showNotification('screenshotLimitReached', true);
        return 0;
    }

    if (!context) {
        console.warn('Screenshot context is undefined, using fallback.');
        context = { type: 'group', id: tab.groupId || -100 };
    }

    isPerformingProgrammaticUpdate.set(true);
    try {
        const keys = await resolveScreenshotKeys(tab, context);
        if (!keys) return 0;

        const images = await withTabActivation(tab, () => captureImagesFor(tab, mode), { keepFocus });
        if (!images || images.length === 0) return 0;

        // The limit counts images, not captures: a long page taken in parts must not
        // be the thing that overruns it.
        const room = Math.max(0, MAX_SCREENSHOTS - totalCount);
        const kept = images.slice(0, room);
        if (kept.length < images.length) showNotification('screenshotLimitReached', true);

        let newCount = 0;
        for (const [position, dataUrl] of kept.entries()) {
            newCount = await storeScreenshot(
                {
                    id: Date.now() + Math.random(),
                    dataUrl,
                    title: tab.title,
                    url: tab.url,
                    contextKey: keys.contextKey,
                    isPersistent: false,
                    // What tells the gallery how to label this one: a whole page is a
                    // different kind of thing from a screenful of it, and a page taken
                    // in parts says which part it is. The label is built where it is
                    // shown, so that it follows the language the reader picked rather
                    // than the one in force when the capture was taken.
                    isFullPage: mode !== 'visible',
                    ...(kept.length > 1 ? { part: position + 1, partsTotal: kept.length } : {}),
                },
                keys,
            );
        }

        // Only a single image goes to the clipboard; a handful of them would leave
        // whichever happened to be last, which is not what anybody asked for.
        if (!silent && kept.length === 1) {
            try {
                const blob = await dataUrlToBlob(kept[0]);
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showNotification('screenshotSavedAndCopied');
            } catch (clipboardError) {
                console.error('Error copying screenshot to clipboard:', clipboardError);
                showNotification('screenshotSavedNoCopy', true);
            }
        } else if (!silent) {
            showNotification('screenshotSavedAndCopied');
        }

        updateScreenshotCountBadge(context, newCount);
        return kept.length;
    } catch (error) {
        console.error('Error processing screenshot:', error);
        if (
            error &&
            error.message &&
            (error.message.includes('QUOTA_BYTES') || error.message.includes('storage quota'))
        ) {
            showNotification('screenshotStorageFull', true);
        } else {
            showNotification(mode === 'visible' ? 'errorTakingScreenshot' : 'errorCapturingFullPage', true);
        }
        return 0;
    } finally {
        isPerformingProgrammaticUpdate.set(false);
    }
}

/**
 * The area picker over one tab.
 *
 * The selector is injected into the tab and the cropped image comes back as a
 * broadcast rather than as a response, because the selection happens long after the
 * request returns — which is why this waits on a one-off listener. The header button,
 * the tab card and the overflow menu all used to carry their own copy of this dance.
 *
 * @param {chrome.tabs.Tab} tab
 */
export async function captureTabArea(tab) {
    if (!tab?.id) return;

    let areaDataUrl = null;
    await withTabActivation(
        tab,
        () =>
            new Promise((resolve) => {
                const listener = (message) => {
                    // Escape closes the selector without capturing anything, and it
                    // says so: without that branch this waited for a crop that was
                    // never coming, and the listener stayed behind with it.
                    if (message.action === 'areaSelectionCancelled') {
                        chrome.runtime.onMessage.removeListener(listener);
                        resolve();
                        return;
                    }
                    if (message.action !== 'areaScreenshotProcessFinished') return;
                    chrome.runtime.onMessage.removeListener(listener);
                    if (message.success) areaDataUrl = message.dataUrl || null;
                    else showNotification('errorTakingScreenshot', true);
                    resolve();
                };
                chrome.runtime.onMessage.addListener(listener);
                chrome.runtime.sendMessage({ action: 'injectAreaSelector', tabId: tab.id });
            }),
    );

    // The badge on the card counts what the gallery holds, and it just changed.
    await renderGroups();

    if (!areaDataUrl) return;
    try {
        const blob = await dataUrlToBlob(areaDataUrl);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showNotification('screenshotCopied');
    } catch (error) {
        console.error('Clipboard copy failed:', error);
        showNotification('screenshotSavedNoCopy', true);
    }
}

/** Pages a capture can actually be taken from; Chrome refuses its own and the store. */
export function isCapturableUrl(url) {
    return typeof url === 'string' && /^(https?|file):/i.test(url);
}

/**
 * Captures every tab of a group, one after another.
 *
 * They cannot go in parallel: each capture brings its tab to the front, and Chrome
 * only ever captures the tab that is actually visible. What they must not do either
 * is bounce back to where the user was between each one — that is why every capture
 * is asked to keep the focus, and the browser is put back once, here, at the end.
 *
 * @param {chrome.tabs.Tab[]} tabs
 * @param {{type: string, id: number|string, secondaryId?: number|string}} context
 * @param {{mode?: 'visible'|'fullPage'|'fullPageParts'}} [options]
 */
export async function captureGroupTabs(tabs, context, options = {}) {
    const capturable = (tabs || []).filter((tab) => tab && isCapturableUrl(tab.url));
    if (capturable.length === 0) {
        showNotification('noTabsToCapture', true);
        return;
    }

    // Where the browser was looking before the walk started, so it can be put back.
    const [originalActiveTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    const progress = await showPersistentProgressNotification('capturingGroupTabs', [0, capturable.length]);
    let saved = 0;
    let lastTab = null;
    try {
        for (const [position, tab] of capturable.entries()) {
            await progress.updateProgress([position + 1, capturable.length]);
            // A tab closed while the batch was running is skipped, not fatal.
            const stillOpen = await chrome.tabs.get(tab.id).catch(() => null);
            if (!stillOpen) continue;
            lastTab = stillOpen;
            saved += await handleScreenshotRequest(stillOpen, context, { ...options, silent: true, keepFocus: true });
        }
    } finally {
        progress.close();
        await restoreFocusAfterCapture(originalActiveTab, lastTab, null, chrome.windows.WINDOW_ID_CURRENT);
    }

    await renderGroups();
    if (saved > 0) showNotification('groupTabsCaptured', false, [saved]);
}

/**
 * Captures a group the caller only knows by its id — the overflow menu holds a card,
 * not the tab list the group card itself already has.
 *
 * @param {number|string} groupId
 * @param {{mode?: 'visible'|'fullPage'|'fullPageParts'}} [options]
 */
export async function captureGroupTabsById(groupId, options = {}) {
    const numericId = Number(groupId);
    if (!Number.isFinite(numericId)) return;
    const tabs = await chrome.tabs.query({ groupId: numericId });
    await captureGroupTabs(tabs, { type: 'group', id: numericId }, options);
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
        if (orphanScreenshots) {
            return orphanScreenshots.map((s) => s.id);
        }
        // Which list to show comes from synced storage, the list itself from IndexedDB,
        // and neither answer depends on the other. Asked one after the other, the wait
        // for a sync read — which is the slow one, and slower still on a profile that
        // is actually syncing — sat in front of the gallery for no reason.
        const [{ [STORAGE_KEYS.ORPHAN_SECTION_DISPLAY]: displayMode = 'always' }, allIds] = await Promise.all([
            chrome.storage.sync.get(STORAGE_KEYS.ORPHAN_SECTION_DISPLAY),
            getAllScreenshotIdsFromDb(),
        ]);
        if (displayMode === 'always') {
            return allIds;
        }
        const orphans = await getOrphanScreenshots();
        return orphans.map((s) => s.id);
    }

    // Three reads that know nothing about each other: the session's index of what was
    // captured this run, the archived list, and the map from live group ids to the
    // stable keys the archive files things under. They are started together and the
    // group map — a tab-group query, cheap beside two storage round trips — is only
    // waited for if there is anything archived to match against it.
    const sessionPromise = chrome.storage.session.get(STORAGE_KEYS.SCREENSHOTS);
    const persistentPromise = chrome.storage.local.get(STORAGE_KEYS.PERSISTENT_SCREENSHOTS);
    // Started before anyone knows whether it will be needed, so it carries its own
    // failure: an unwatched promise that rejects is an unhandled rejection, and there
    // is nothing to do about a group map that cannot be read but treat it as empty.
    const groupInfoPromise = getGroupInfoMap().catch(() => new Map());

    const { [STORAGE_KEYS.SCREENSHOTS]: screenshotData = {} } = await sessionPromise;
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

    const { [STORAGE_KEYS.PERSISTENT_SCREENSHOTS]: persistentIdsArray = [] } = await persistentPromise;

    if (persistentIdsArray.length > 0) {
        const groupInfoMap = await groupInfoPromise;
        const groupId = type === 'group' ? id : secondaryId;
        const groupInfo = groupInfoMap.get(groupId);

        if (groupInfo && groupInfo.key) {
            const stableGroupKey = groupInfo.key;

            // One transaction rather than one per archived image: only the context key
            // of each is wanted here, and there can be a great many of them.
            const allPersistentScreenshots = [...(await getScreenshotsFromDb(persistentIdsArray)).values()];

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
    // A gallery opened with a list of its own — the orphan section hands one over —
    // is remembered as that list and not only as its context. Without it a redraw
    // after a delete had to guess what the gallery had been showing, and it guessed
    // by asking what counts as orphaned now, which is a different question and a
    // different set of images.
    const explicitIds = orphanScreenshots ? orphanScreenshots.map((item) => item.id) : null;
    currentGalleryContext.set({ type, id, secondaryId, explicitIds });

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
        currentGalleryContext: { type, id, secondaryId, explicitIds },
    });

    // Before the grid, not after it: whether there is anything to download is already
    // known here, and making the button wait for every picture to be read out of the
    // database is what made it turn up late — long after the header it belongs to.
    updateHeaderButtonsVisibility({ screenshotsExistInGallery: screenshotIds.length > 0 });

    await renderGalleryGrid(screenshotIds);

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

    // Every card is put on the page first, empty, and then filled. The grid therefore
    // has its final shape before a single picture has been read, so nothing jumps
    // around as they arrive.
    const cards = new Map();
    for (const screenshotId of screenshotIds) {
        const galleryItem = itemTemplate.content.cloneNode(true).firstElementChild;
        grid.appendChild(galleryItem);
        cards.set(screenshotId, galleryItem);
    }

    // One transaction for the lot, filling each card the moment its record lands.
    await getScreenshotsFromDb(screenshotIds, (screenshotId, fullScreenshot) => {
        const galleryItem = cards.get(screenshotId);
        if (!galleryItem) return;
        if (!fullScreenshot) {
            galleryItem.remove();
            return;
        }
        fillGalleryItem(galleryItem, fullScreenshot);
    });
}

/** The drawing board the edit button hands the capture over to. */
const EXCALIDRAW_URL = 'https://excalidraw.com/';

/**
 * Opens one capture in a tab of its own.
 *
 * Chrome refuses to navigate to a `data:` URL, so the image is handed over as a blob
 * belonging to this page — which is why the handle is only released a minute later,
 * once the tab has certainly read it.
 *
 * @param {string} dataUrl
 */
async function openScreenshotInTab(dataUrl) {
    try {
        const url = URL.createObjectURL(await dataUrlToBlob(dataUrl));
        await chrome.tabs.create({ url });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        console.error('Error opening the screenshot in a tab:', error);
        showNotification('errorOpeningScreenshot', true);
    }
}

/** Puts one screenshot into one card and wires the five things that can be done to it. */
function fillGalleryItem(galleryItem, fullScreenshot) {
    const img = galleryItem.querySelector('.gallery-image');
    const pinBtn = galleryItem.querySelector('.gallery-pin-btn');

    img.src = fullScreenshot.dataUrl;
    img.alt = `Screenshot of ${fullScreenshot.title}`;
    galleryItem.querySelector('.gallery-item-title').textContent = fullScreenshot.title;

    // The card used to open a drawing board wherever it was clicked, which is not what
    // clicking a picture means anywhere else: it opens the picture, and the board has
    // a button of its own below the reader. The listener stays on the card because the
    // image is the card — everything else on it is an overlay, and every one of those
    // stops the click from getting here.
    galleryItem.addEventListener('click', () => openScreenshotInTab(fullScreenshot.dataUrl));
    galleryItem.querySelector('.copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        copyScreenshot(fullScreenshot.dataUrl);
    });
    // One download button, and it asks what shape the image should leave in.
    galleryItem.querySelector('.download-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        askDownloadFormat([fullScreenshot]);
    });

    // A capture of a whole page says so, now that it no longer has a button of its own
    // to set it apart from a capture of one screenful — and one taken in parts says
    // which part it is instead. `applyTranslations` resolves both at the end of this
    // function, so the badge follows the language the reader picked.
    const badge = galleryItem.querySelector('.gallery-full-page-badge');
    if (badge && fullScreenshot.part && fullScreenshot.partsTotal) {
        badge.setAttribute('data-i18n', 'fullPagePartBadge');
        badge.dataset.params = JSON.stringify([String(fullScreenshot.part), String(fullScreenshot.partsTotal)]);
    }
    galleryItem.classList.toggle('is-full-page', Boolean(fullScreenshot.isFullPage));
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

    const editBtn = galleryItem.querySelector('.gallery-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.tabs.create({ url: EXCALIDRAW_URL });
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
}

export async function clearAllContextDataUI(contextToDelete, config) {
    if (!contextToDelete || !config) {
        console.error('clearAllContextDataUI was called without a valid context or configuration.');
        return;
    }

    if (contextToDelete.type === 'orphan') {
        try {
            const { [STORAGE_KEYS.ORPHAN_SECTION_DISPLAY]: displayMode = 'always' } = await chrome.storage.sync.get(
                STORAGE_KEYS.ORPHAN_SECTION_DISPLAY,
            );

            let itemsToDelete = [];
            if (displayMode === 'always') {
                if (config.name === 'Notes') {
                    const allNoteIds = await getAllNoteIdsFromDb();
                    const notePromises = allNoteIds.map((id) => getNoteFromDb(id));
                    itemsToDelete = (await Promise.all(notePromises)).filter(Boolean);
                } else {
                    const allScreenshotIds = await getAllScreenshotIdsFromDb();
                    const screenshotPromises = allScreenshotIds.map((id) => getScreenshotFromDb(id));
                    itemsToDelete = (await Promise.all(screenshotPromises)).filter(Boolean);
                }
            } else {
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
                                    } catch {
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
                                } catch {
                                    return null;
                                }
                            })
                            .filter(Boolean),
                    );
                    domainsInGroup.forEach((domain) => existingContextKeys.add(`s_${groupInfo.key}_${domain}`));
                }

                existingContextKeys.add('g_pomodoro');

                let allStoredItems = [];
                if (config.name === 'Notes') {
                    const allNoteIds = await getAllNoteIdsFromDb();
                    const notePromises = allNoteIds.map((id) => getNoteFromDb(id));
                    allStoredItems = (await Promise.all(notePromises)).filter(Boolean);
                } else {
                    const allScreenshotIds = await getAllScreenshotIdsFromDb();
                    const screenshotPromises = allScreenshotIds.map((id) => getScreenshotFromDb(id));
                    allStoredItems = (await Promise.all(screenshotPromises)).filter(Boolean);
                }

                itemsToDelete = allStoredItems.filter(
                    (item) => item.contextKey && !existingContextKeys.has(item.contextKey),
                );
            }

            if (itemsToDelete.length === 0) {
                showNotification(config.notificationNoOrphans, true);
                return;
            }

            const itemIdsToDelete = itemsToDelete.map((item) => item.id);
            await Promise.all(itemIdsToDelete.map((id) => config.deleteItemFromDbFunction(id)));

            const { [config.persistentKey]: currentIds = [] } = await chrome.storage.local.get(config.persistentKey);
            const updatedPersistentSet = new Set(currentIds);
            itemIdsToDelete.forEach((id) => updatedPersistentSet.delete(id));
            await chrome.storage.local.set({ [config.persistentKey]: Array.from(updatedPersistentSet) });

            const sessionResult = await chrome.storage.session.get(config.sessionKey);
            const allIndexes = sessionResult[config.sessionKey] || {};
            const deletedIdSet = new Set(itemIdsToDelete);
            let hasSessionChanges = false;
            for (const key in allIndexes) {
                if (Array.isArray(allIndexes[key])) {
                    const filtered = allIndexes[key].filter((id) => !deletedIdSet.has(id));
                    if (filtered.length !== allIndexes[key].length) {
                        allIndexes[key] = filtered;
                        hasSessionChanges = true;
                    }
                }
            }
            if (hasSessionChanges) {
                await chrome.storage.session.set({ [config.sessionKey]: allIndexes });
            }

            showNotification(config.notificationOrphanSuccess, false, [itemIdsToDelete.length]);

            if (config.name === 'Notes') closeNotesView();
            if (config.name === 'Screenshots') closeScreenshotGallery();
            await updateOrphanIndicators();
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
    // The bundle is UMD. Loaded from a <script> it would assign `self.Tesseract`,
    // but the bundler wraps it for CommonJS interop, so it takes its
    // `module.exports` branch and the global is never set — reading it gave
    // undefined and every OCR run stopped with "could not extract text" before it
    // began. What the import hands back is the engine.
    const mod = await import('../../lib/tesseract.min.js');
    const Tesseract = mod?.default ?? mod?.Tesseract ?? window.Tesseract;
    if (Tesseract) window.Tesseract = Tesseract;
    return Tesseract;
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
        } catch {
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

/**
 * Asks which shape the images should leave in, then writes them.
 *
 * One dialog serves the download button of a single card and the one in the gallery
 * header, because the question is the same either way: the picture as it was taken,
 * or a document. Choosing PDF for several captures makes one document of them all
 * rather than a folder full of one-page files.
 *
 * @param {Array<{dataUrl: string, title: string}>} screenshots
 */
export function askDownloadFormat(screenshots) {
    const images = (screenshots || []).filter((item) => item?.dataUrl);
    if (images.length === 0) {
        showNotification('noScreenshotsToDownload', true);
        return;
    }
    openModal(showDownloadFormatModal, {
        screenshots: images,
        onConfirm: (formats) => downloadScreenshots(images, formats),
    });
}

/** Chrome drops downloads that arrive in the same tick, hence the stagger. */
const DOWNLOAD_STAGGER_MS = 300;

/**
 * Writes the images in whichever formats were asked for — all of them, if all were.
 *
 * The three picture formats go through the same loop because only the encoder differs:
 * a PNG capture asked for as a PNG is handed over untouched, and everything else is
 * re-encoded one image at a time. One at a time on purpose — a gallery's worth of AV1
 * keyframes started at once would take the page with it.
 *
 * @param {Array<'png'|'webp'|'avif'|'pdf'>} formats
 */
export async function downloadScreenshots(images, formats) {
    const wanted = new Set(Array.isArray(formats) ? formats : [formats]);

    let written = 0;
    for (const format of ['png', 'webp', 'avif']) {
        if (wanted.has(format)) written += await downloadImagesAs(images, format);
    }
    // One count at the end rather than one per format: three formats of three
    // pictures is nine files, and saying "3" three times says none of that.
    if (written > 1) showNotification('allScreenshotsDownloading', false, [written]);

    if (!wanted.has('pdf')) return;

    showNotification('generatingPdf');
    try {
        const blob = await imagesToPdfBlob(images.map((screenshot) => screenshot.dataUrl));
        saveBlob(blob, toPdfFileName(images.length > 1 ? 'gallery' : images[0].title));
        showNotification('pdfDownloaded');
    } catch (error) {
        console.error('Error building the PDF:', error);
        showNotification('errorGeneratingPdf', true);
    }
}

/** Hands one already-encoded file to the browser under a name of our choosing. */
function saveBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on a later turn: doing it straight away can beat the download.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Every image in one picture format, in order.
 *
 * A whole gallery re-encoded to AVIF is slow enough to look like nothing is happening,
 * so anything longer than a single image says how far along it is. An image the format
 * cannot hold — a full-page capture is taller than WebP can count to — is counted and
 * reported at the end rather than stopping the rest.
 *
 * @returns {Promise<number>} How many files were actually written.
 */
async function downloadImagesAs(images, format) {
    const progress =
        images.length > 1
            ? await showPersistentProgressNotification('convertingImages', [0, images.length, format.toUpperCase()])
            : null;

    let tooLarge = 0;
    let failed = 0;
    try {
        for (const [position, image] of images.entries()) {
            try {
                saveBlob(await encodeImage(image.dataUrl, format), toImageFileName(image.title, format));
            } catch (error) {
                if (error instanceof ImageTooLargeError) tooLarge++;
                else failed++;
                console.error(`Error converting a screenshot to ${format}:`, error);
            }
            await progress?.updateProgress([position + 1, images.length, format.toUpperCase()]);
            if (position < images.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_STAGGER_MS));
            }
        }
    } finally {
        progress?.close();
    }

    if (tooLarge > 0) showNotification('imageTooLargeForFormat', true, [tooLarge, format.toUpperCase()]);
    if (failed > 0) showNotification('errorConvertingImages', true, [failed, format.toUpperCase()]);
    return images.length - tooLarge - failed;
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
        const { type, id, secondaryId, explicitIds } = get(currentGalleryContext);
        // Only an empty gallery goes back to the group list; while images are left the
        // view stays where it is, redrawn without the one that just went. A gallery
        // showing a list of its own is redrawn from that same list minus the deleted
        // image: re-deriving it emptied a gallery of every capture there is down to
        // the handful that happen to be orphaned.
        const remaining = explicitIds
            ? explicitIds.filter((existingId) => existingId !== screenshotId)
            : await resolveScreenshotIdsForContext(type, id, secondaryId);

        if (remaining.length === 0) {
            await closeScreenshotGallery();
        } else if (explicitIds) {
            await showScreenshotGallery(
                type,
                id,
                secondaryId,
                remaining.map((remainingId) => ({ id: remainingId })),
            );
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
    // The two inputs behind the upload menu, used only where the File System Access
    // pickers are missing or refused. Cleared after each pick so that choosing the
    // same folder twice in a row still counts as a change.
    for (const inputId of ['gallery-upload-files-input', 'gallery-upload-folder-input']) {
        const input = document.getElementById(inputId);
        if (!input) continue;
        input.addEventListener('change', async (event) => {
            const files = Array.from(event.currentTarget.files || []);
            event.currentTarget.value = '';
            await uploadImagesToGallery(files);
        });
    }
}
