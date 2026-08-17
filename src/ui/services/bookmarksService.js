/**
 * bookmarksService.js — Service layer for bookmarks UI operations.
 *
 * Migrated from bookmarks-ui.js. Replaces state.X, dom.X, and fn.X()
 * references with direct imports and document.getElementById() calls.
 *
 * Functions: getAllBookmarksFlat, handleShowOldBookmarks, handleShowBrokenBookmarks, updateBrokenBookmarksCache, deleteSpecialItem, deleteAllSpecialItems, resetSpecialScan, closeImportModalWithAnimation, openDeleteAllBookmarksConfirmModal, openAddToBookmarkModal, showImportBookmarksPopup, hideImportBookmarksPopup, showBookmarkDragDropPanel, hideBookmarkDragDropPanel, triggerBookmarkImport, showAddToRuleModal, saveAddToRule, initBookmarkEvents
 */

import { applyTranslations, showNotification } from '../../utils/i18n.js';
import {
    openModal,
    showAddToRuleModal as showAddToRuleModalStore,
    showSpecialDeleteModal,
    showDeleteAllBookmarksConfirmModal,
    showAddToBookmarkModal,
    modalData,
    closeModal as closeModalStore,
} from '@/ui/stores/modalStore.js';
import { get } from 'svelte/store';

import {
    overwriteBookmarks,
    addImportedBookmarks,
    exportBookmarks,
    exportBookmarkFolder,
} from '../../utils/importExport.js';

import { STORAGE_KEYS } from './constants.js';

import { currentBookmarkSort, isBookmarksViewActive, isAllExpanded } from '../stores/appStore.svelte.js';

import { updateScrollButtons, updateExpandAllButtonState } from './viewsService.js';
import { createOverflowMenu } from './contextMenuService.js';
import { getStorage } from './settingsService.js';

import { initializeBookmarksView } from '../bookmarks/bookmarks.js';

export async function getAllBookmarksFlat() {
    const response = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
    if (!response.success || !response.bookmarks) return [];

    const bookmarks = [];
    const traverse = (nodes) => {
        for (const node of nodes) {
            if (node.url) {
                bookmarks.push(node);
            }
            if (node.children) {
                traverse(node.children);
            }
        }
    };
    traverse(response.bookmarks);
    return bookmarks;
}

export async function handleShowOldBookmarks() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getOldBookmarks' });

        if (response && response.success) {
            openModal(showSpecialDeleteModal, {
                titleKey: 'deleteOldBookmarksTitle',
                descriptionKey: 'deleteOldBookmarksDesc',
                items: response.bookmarks,
                type: 'old',
                emptyMessageKey: 'noOldBookmarksFound',
                isLoading: false,
                scanProgress: { current: 0, total: 0 },
            });
        } else {
            console.error('Error retrieving old bookmarks:', response?.error);
            showNotification('errorFetchingBookmarks', true);
        }
    } catch (error) {
        console.error('Communication error:', error);
    }
}

let scanAborted = false;
/**
 * Which scan is the current one.
 *
 * Closing the modal mid-scan leaves requests in flight — each can take up to the
 * five-second timeout — and reopening it starts a fresh scan. Both were then painting
 * the same modal, so the count jumped about and the list flickered. A scan only paints
 * while its own number is the latest.
 */
let scanRun = 0;

export async function handleShowBrokenBookmarks() {
    const sessionData = await chrome.storage.session.get(STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION);
    const cachedBrokenBookmarks = sessionData[STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION];

    if (cachedBrokenBookmarks && Array.isArray(cachedBrokenBookmarks)) {
        openModal(showSpecialDeleteModal, {
            titleKey: 'deleteBrokenBookmarksTitle',
            descriptionKey: 'deleteBrokenBookmarksDesc',
            items: cachedBrokenBookmarks,
            type: 'broken',
            emptyMessageKey: 'noBrokenBookmarksFound',
            isLoading: false,
            scanProgress: { current: 0, total: 0 },
        });
        return;
    }

    const bookmarks = await getAllBookmarksFlat();
    startBrokenBookmarksScan(bookmarks);
}

async function startBrokenBookmarksScan(items) {
    scanAborted = false;
    const run = ++scanRun;

    openModal(showSpecialDeleteModal, {
        titleKey: 'deleteBrokenBookmarksTitle',
        descriptionKey: 'deleteBrokenBookmarksDesc',
        items: [],
        type: 'broken',
        emptyMessageKey: 'noBrokenBookmarksFound',
        isLoading: true,
        scanProgress: { current: 0, total: items.length },
    });

    const brokenBookmarks = [];
    /**
     * How many links are in flight at once.
     *
     * They used to go in batches of 15 awaited together, so a batch only advanced when
     * its slowest link answered: one dead address held up fourteen live ones for the
     * whole five-second timeout. Measured over 45 bookmarks with five dead ones spread
     * out, that was 15.2 s. Here each worker takes the next link the moment it is free.
     */
    const CONCURRENCY = 15;
    /** The progress bar is refreshed on a timer rather than on every single answer. */
    const PROGRESS_MS = 120;

    let nextIndex = 0;
    let processedCount = 0;
    const totalCount = items.length;
    /** Answers already obtained, so the same address is never asked about twice. */
    const seen = new Map();
    let lastPaint = 0;

    const stillWanted = () => {
        if (scanAborted || run !== scanRun) return false;
        const current = get(modalData);
        return Boolean(current && current.isLoading);
    };

    const paintProgress = (force = false) => {
        if (!stillWanted()) return;
        const now = Date.now();
        if (!force && now - lastPaint < PROGRESS_MS) return;
        lastPaint = now;
        modalData.set({
            ...get(modalData),
            items: [...brokenBookmarks],
            scanProgress: { current: processedCount, total: totalCount },
        });
    };

    const statusOf = async (url) => {
        if (seen.has(url)) return seen.get(url);
        const pending = (async () => {
            try {
                const response = await chrome.runtime.sendMessage({ action: 'checkUrlStatus', url });
                return response?.status;
            } catch {
                return 'error';
            }
        })();
        seen.set(url, pending);
        return pending;
    };

    const isBroken = (status) =>
        status === 'error' ||
        status === 'broken' ||
        status === 'timeout' ||
        (typeof status === 'number' && status >= 400);

    const worker = async () => {
        while (stillWanted()) {
            const index = nextIndex++;
            if (index >= totalCount) return;
            const bookmark = items[index];
            if (bookmark.url && bookmark.url.startsWith('http')) {
                const status = await statusOf(bookmark.url);
                // Checked again on the way back: waiting for an answer can take the whole
                // timeout, and in the meantime the modal may have been closed and a new
                // scan started. Without this, every worker still in flight painted one
                // last time over the new scan's numbers.
                if (!stillWanted()) return;
                if (isBroken(status)) brokenBookmarks.push({ ...bookmark, status });
            }
            processedCount++;
            paintProgress();
        }
    };

    // The bar is also refreshed on a beat, not only as answers arrive: the quick links
    // all land inside one refresh window, so without this the count sat frozen at the
    // first one while the slow addresses ran down their timeout.
    const beat = setInterval(() => {
        if (stillWanted()) paintProgress(true);
    }, PROGRESS_MS);
    try {
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalCount) }, worker));
    } finally {
        clearInterval(beat);
    }

    if (!stillWanted()) return;

    await chrome.storage.session.set({ [STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION]: brokenBookmarks });
    modalData.set({
        ...get(modalData),
        items: brokenBookmarks,
        isLoading: false,
        scanProgress: { current: totalCount, total: totalCount },
    });
}

export async function updateBrokenBookmarksCache(deletedId) {
    const sessionData = await chrome.storage.session.get(STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION);
    let cached = sessionData[STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION];
    if (cached) {
        cached = cached.filter((bm) => bm.id !== deletedId);
        await chrome.storage.session.set({ [STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION]: cached });
    }
}

export async function deleteSpecialItem(item) {
    await chrome.bookmarks.remove(item.id);
    showNotification('bookmarkDeleted');
    chrome.runtime.sendMessage({ action: 'bookmarksChanged' });
    if (item.status) updateBrokenBookmarksCache(item.id);
}

export async function deleteAllSpecialItems(ids, type) {
    for (const id of ids) {
        await new Promise((resolve) => chrome.bookmarks.remove(id, resolve));
    }
    if (type === 'broken') {
        const sessionData = await chrome.storage.session.get(STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION);
        let cached = sessionData[STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION] || [];
        cached = cached.filter((bm) => !ids.includes(bm.id));
        await chrome.storage.session.set({ [STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION]: cached });
    }
    showNotification('bookmarksDeleted', false, [ids.length]);
    chrome.runtime.sendMessage({ action: 'bookmarksChanged' });
}

export async function resetSpecialScan() {
    scanAborted = true;
    await chrome.storage.session.remove(STORAGE_KEYS.BROKEN_BOOKMARKS_SESSION);
    closeModalStore(showSpecialDeleteModal);
    handleShowBrokenBookmarks();
}

export function closeImportModalWithAnimation() {
    const importBookmarksPopup = document.getElementById('import-bookmarks-popup');
    if (!importBookmarksPopup) return;

    importBookmarksPopup.classList.add('closing');

    importBookmarksPopup.addEventListener(
        'transitionend',
        () => {
            importBookmarksPopup.classList.remove('closing');
            importBookmarksPopup.close();
        },
        { once: true },
    );
}

export function openDeleteAllBookmarksConfirmModal() {
    showDeleteAllBookmarksConfirmModal.set(true);
}

export function openAddToBookmarkModal(tab, mode = 'add', bookmarkData = null) {
    openModal(showAddToBookmarkModal, { tab, mode, bookmarkData });
}

export function showImportBookmarksPopup() {
    const importBookmarksPopup = document.getElementById('import-bookmarks-popup');
    if (!importBookmarksPopup) return;
    importBookmarksPopup.returnValue = '';
    importBookmarksPopup.showModal();
    applyTranslations(importBookmarksPopup);
}

export function hideImportBookmarksPopup() {
    const importBookmarksPopup = document.getElementById('import-bookmarks-popup');
    if (!importBookmarksPopup) return;
    importBookmarksPopup.close();
}

export function showBookmarkDragDropPanel(importAction) {
    const importBookmarksPopup = document.getElementById('import-bookmarks-popup');
    const container = document.querySelector('.container');
    const bookmarkDragDropPanel = document.getElementById('bookmark-drag-drop-panel');
    const bookmarkFileInput = document.getElementById('bookmark-file-input');

    if (importBookmarksPopup) importBookmarksPopup.close();
    if (container) {
        container.style.display = 'none';
    }
    if (bookmarkDragDropPanel) {
        bookmarkDragDropPanel.style.display = 'flex';
        bookmarkDragDropPanel.dataset.importAction = importAction;
        applyTranslations(bookmarkDragDropPanel);
        if (bookmarkFileInput) {
            setTimeout(() => {
                bookmarkFileInput.click();
            }, 100);
        }
    }
}

export function hideBookmarkDragDropPanel() {
    const bookmarkDragDropPanel = document.getElementById('bookmark-drag-drop-panel');
    const bookmarkFileInput = document.getElementById('bookmark-file-input');
    const container = document.querySelector('.container');

    if (bookmarkDragDropPanel) {
        bookmarkDragDropPanel.style.display = 'none';
        bookmarkDragDropPanel.removeAttribute('data-import-action');
        if (bookmarkFileInput) {
            bookmarkFileInput.value = '';
        }
    }
    if (container) {
        container.style.display = 'flex';
    }
    updateScrollButtons();
}

export function triggerBookmarkImport(overwrite) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (overwrite) await overwriteBookmarks(file);
            else await addImportedBookmarks(file);
        }
    };
    input.click();
}

export async function showAddToRuleModal(urlToAdd, baseTitle) {
    const storage = await getStorage();
    const { customRules = [] } = await storage.get('customRules');
    const activeRules = customRules.filter((rule) => rule.active);
    openModal(showAddToRuleModalStore, { url: urlToAdd, rules: activeRules, title: baseTitle });
}

export async function saveAddToRule(url, ruleName) {
    chrome.runtime.sendMessage({ action: 'addUrlToRule', payload: { url, ruleName } }, (response) => {
        if (response && response.success) {
            showNotification('urlAddedToRule');
        }
    });
}

export function initBookmarkEvents() {
    const exportBookmarksBtn = document.getElementById('export-bookmarks-btn');
    const importBookmarksBtn = document.getElementById('import-bookmarks-btn');
    const importBookmarksPopup = document.getElementById('import-bookmarks-popup');
    const addBookmarksBtn = document.getElementById('add-bookmarks-btn');
    const overwriteBookmarksBtn = document.getElementById('overwrite-bookmarks-btn');
    const cancelImportBookmarksBtn = document.getElementById('cancel-import-bookmarks-btn');
    const bookmarkDragDropPanel = document.getElementById('bookmark-drag-drop-panel');
    const bookmarkDropZone = bookmarkDragDropPanel?.querySelector('.drop-zone');
    const bookmarkFileInput = document.getElementById('bookmark-file-input');
    const backFromBookmarkImportBtn = document.getElementById('back-from-bookmark-import-btn');
    const cancelBookmarkImportDropBtn = document.getElementById('cancel-bookmark-import-drop-btn');
    const deleteAllBookmarksBtn = document.getElementById('delete-all-bookmarks-btn');
    const visibilityControlsPanel = document.getElementById('visibility-controls-panel');
    const actionVisibilityControlsPanel = document.getElementById('action-visibility-controls-panel');
    const toggleBookmarksSortPanelBtn = document.getElementById('toggle-bookmarks-sort-panel-btn');
    const sortOptionBtns = document.querySelectorAll('.sort-option-btn');
    const deleteOptionBtns = document.querySelectorAll('.delete-option-btn');
    const deleteModeAllBtn = document.getElementById('delete-mode-all-btn');
    const deleteModeOldBtn = document.getElementById('delete-mode-old-btn');
    const deleteModeBrokenBtn = document.getElementById('delete-mode-broken-btn');

    function getVisibilityToggleBtns() {
        return [
            document.getElementById('toggle-group-actions-btn'),
            document.getElementById('toggle-domain-headers-btn'),
            document.getElementById('toggle-subgroup-actions-btn'),
            document.getElementById('toggle-tab-actions-btn'),
            document.getElementById('toggle-folder-actions-btn'),
            document.getElementById('toggle-child-folders-btn'),
            document.getElementById('toggle-child-folder-actions-btn'),
            document.getElementById('toggle-bookmark-actions-btn'),
        ];
    }

    if (exportBookmarksBtn) {
        exportBookmarksBtn.addEventListener('click', () => {
            exportBookmarks();
        });
    }

    if (importBookmarksBtn) {
        importBookmarksBtn.addEventListener('click', showImportBookmarksPopup);
    }

    if (importBookmarksPopup) {
        importBookmarksPopup.addEventListener('close', () => {
            const returnValue = importBookmarksPopup.returnValue;
            const isDragDropVisible = bookmarkDragDropPanel && bookmarkDragDropPanel.style.display !== 'none';
            if (!isDragDropVisible) {
                if (returnValue === 'add' || returnValue === 'overwrite') {
                    showBookmarkDragDropPanel(returnValue);
                }
            }
        });

        importBookmarksPopup.addEventListener('click', (e) => {
            if (e.target === importBookmarksPopup) {
                closeImportModalWithAnimation();
            }
        });

        importBookmarksPopup.addEventListener('cancel', (e) => {
            e.preventDefault();
            closeImportModalWithAnimation();
        });
    }

    if (addBookmarksBtn) {
        addBookmarksBtn.addEventListener('click', (e) => {
            e.preventDefault();
            importBookmarksPopup.returnValue = 'add';
            closeImportModalWithAnimation();
        });
    }

    if (overwriteBookmarksBtn) {
        overwriteBookmarksBtn.addEventListener('click', (e) => {
            e.preventDefault();
            importBookmarksPopup.returnValue = 'overwrite';
            closeImportModalWithAnimation();
        });
    }

    if (cancelImportBookmarksBtn) {
        cancelImportBookmarksBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeImportModalWithAnimation();
        });
    }

    if (bookmarkDropZone) {
        bookmarkDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            bookmarkDropZone.classList.add('drag-over');
        });
        bookmarkDropZone.addEventListener('dragleave', () => {
            bookmarkDropZone.classList.remove('drag-over');
        });
        bookmarkDropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            bookmarkDropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                const action = bookmarkDragDropPanel.dataset.importAction;
                const success = action === 'add' ? await addImportedBookmarks(file) : await overwriteBookmarks(file);
                if (success) hideBookmarkDragDropPanel();
            }
        });
        bookmarkDropZone.addEventListener('click', () => {
            if (bookmarkFileInput) bookmarkFileInput.click();
        });
    }

    if (bookmarkFileInput) {
        bookmarkFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const action = bookmarkDragDropPanel.dataset.importAction;
                const success = action === 'add' ? await addImportedBookmarks(file) : await overwriteBookmarks(file);
                if (success) hideBookmarkDragDropPanel();
                e.target.value = '';
            }
        });
    }

    if (backFromBookmarkImportBtn) {
        backFromBookmarkImportBtn.addEventListener('click', () => {
            hideBookmarkDragDropPanel();
            showImportBookmarksPopup();
        });
    }
    if (cancelBookmarkImportDropBtn) {
        cancelBookmarkImportDropBtn.addEventListener('click', hideBookmarkDragDropPanel);
    }

    if (deleteAllBookmarksBtn) {
        deleteAllBookmarksBtn.addEventListener('click', () => {
            if (!visibilityControlsPanel) return;

            const isPanelVisible = !visibilityControlsPanel.classList.contains('hidden');
            const isDeleteModeActive = !!visibilityControlsPanel.querySelector('.delete-option-btn:not(.hidden)');

            if (isPanelVisible && isDeleteModeActive) {
                visibilityControlsPanel.classList.add('hidden');
            } else {
                getVisibilityToggleBtns().forEach((btn) => btn && btn.classList.add('hidden'));
                sortOptionBtns.forEach((btn) => btn.classList.add('hidden'));
                deleteOptionBtns.forEach((btn) => btn.classList.remove('hidden'));
                visibilityControlsPanel.classList.remove('hidden');
                if (actionVisibilityControlsPanel) {
                    actionVisibilityControlsPanel.classList.add('hidden');
                }
            }
        });
    }

    if (toggleBookmarksSortPanelBtn) {
        toggleBookmarksSortPanelBtn.addEventListener('click', () => {
            if (!visibilityControlsPanel) return;

            const isPanelVisible = !visibilityControlsPanel.classList.contains('hidden');
            const isSortModeActive = !!visibilityControlsPanel.querySelector('.sort-option-btn:not(.hidden)');

            if (isPanelVisible && isSortModeActive) {
                visibilityControlsPanel.classList.add('hidden');
            } else {
                getVisibilityToggleBtns().forEach((btn) => btn && btn.classList.add('hidden'));
                deleteOptionBtns.forEach((btn) => btn.classList.add('hidden'));
                sortOptionBtns.forEach((btn) => btn.classList.remove('hidden'));
                visibilityControlsPanel.classList.remove('hidden');
                if (actionVisibilityControlsPanel) {
                    actionVisibilityControlsPanel.classList.add('hidden');
                }
            }
        });
    }

    if (deleteModeAllBtn) {
        deleteModeAllBtn.addEventListener('click', openDeleteAllBookmarksConfirmModal);
    }

    if (deleteModeOldBtn) {
        deleteModeOldBtn.addEventListener('click', handleShowOldBookmarks);
    }

    if (deleteModeBrokenBtn) {
        deleteModeBrokenBtn.addEventListener('click', handleShowBrokenBookmarks);
    }

    sortOptionBtns.forEach((btn) => {
        btn.addEventListener('click', async () => {
            sortOptionBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            currentBookmarkSort.set(btn.dataset.sortBy);
            await chrome.storage.local.set({ bookmarkSortOrder: get(currentBookmarkSort) });

            const bookmarksList = document.getElementById('bookmarks-list');
            if (bookmarksList && get(isBookmarksViewActive)) {
                await initializeBookmarksView(
                    bookmarksList,
                    {
                        showNotification,
                        applyTranslations,
                        updateScrollButtons,
                        updateExpandAllButtonState,
                        createOverflowMenu,
                        showAddToRuleModal,
                        exportBookmarkFolder,
                        openAddToBookmarkModal,
                    },
                    get(currentBookmarkSort),
                    get(isAllExpanded),
                );
            }
        });
    });
}
