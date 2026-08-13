import { confirmAction } from '../../stores/confirmStore.js';
import { getStorageAreaName } from '../../services/storage.js';
import { get } from 'svelte/store';
import { listGroupState } from '../../stores/listGroupStore.js';

import {
    initializeTranslations,
    applyTranslations,
    showNotification,
    getCurrentLang,
    loadMessages,
} from '../../../utils/i18n.js';
import { initializeActiveTheme } from '../../../utils/theme.js';
import { extractYouTubeVideoId, createYouTubeEmbed } from '../../../utils/youtubeEmbed.js';
import {
    renderGeminiResponse,
    renderNoteEntry as renderNoteEntryFromModule,
} from '../../content-renderer/content-renderer.js';
import { initializeKeyboardNavigation } from '../../../utils/keyboardNav.js';
import {
    initAgentUI,
    handleAgentQuery,
    setSendButtonBusy,
    setAgentButtonRunning,
    cancelAgentQuery,
} from '../../../utils/agent-ui.js';
import {
    exportCookies,
    processCookieFile,
    exportBookmarks,
    exportBookmarkFolder,
    addImportedBookmarks,
    overwriteBookmarks,
} from '../../../utils/importExport.js';
import '../../../lib/marked.js';
import { initializeBookmarksView, clearBookmarkCache } from '../../bookmarks/bookmarks.js';
import {
    saveScreenshotToDb,
    getScreenshotFromDb,
    deleteScreenshotFromDb,
    getAllScreenshotIdsFromDb,
    saveGeminiEntryToDb,
    getAllGeminiEntriesFromDb,
    deleteGeminiEntryFromDb,
    clearScreenshotsForContext,
    getNoteFromDb,
    getAllGeminiIdsFromDb,
    saveNoteToDb,
    deleteNoteFromDb,
    clearNotesForContext,
    getAllNoteIdsFromDb,
    saveBackupToDb,
    getAllBackupsFromDb,
    deleteBackupFromDb,
    savePomoStatsToDb,
    getAllPomoStatsFromDb,
    getPomoStatsByProjectFromDb,
    deletePomoStatsFromDb,
    clearPomoStatsFromDb,
} from '../../../utils/db.js';

import {
    STORAGE_KEYS,
    noteConfig,
    screenshotConfig,
    lightThemeColors,
    darkThemeColors,
} from '../../services/constants.js';
import {
    sanitizeFilename,
    normalizeUrl,
    isDomainInAnyRule,
    correctFaviconUrl,
    animateAndRemove,
    dataUrlToBlob,
    copyRichTextToClipboard,
    unhighlight,
    highlight,
    getGroupInfoMap,
    getGroupPrefixState,
    getTotalScreenshotCount,
    fmt,
    fmtDur,
    fmtDate,
    fmtTime,
    fmtHMS,
    getModeDuration,
    isBreak,
    formatDateYMD,
    groupHistoryByDate,
    autolink,
    escapeHtml,
    linkifyHtml,
    getRelativeTime,
    debounce,
} from '../../services/utils.js';

import {
    showWelcomeMessage,
    restoreMainView,
    closeBookmarksView,
    toggleViews,
    updateSplitButtonsUI,
    manageViewVisibility,
    switchMainView,
    openDeleteHistoryConfirmModal,
    updateMainPanelButtons,
    renderHistoryView,
    showNoHistoryMessage,
    renderRecentlyClosedView,
    renderReadingListView,
    initCustomCalendar,
    createGenericListItem,
    handleIframeMessage,
    openUrlInPip,
    openUrlInPopup,
    openUrlInPanel,
    fetchContentForReaderView,
    showReaderView,
    showErrorView,
    closeUrlInPanel,
    hideYoutubeView,
    createYoutubeIndicator,
    restoreYoutubeView,
    adjustScrollButtonsForGeminiView,
    getActiveScrollableElement,
    updateScrollButtons,
    updateBackButtonTooltip,
    updateExpandAllButtonState,
    toggleExpandAll,
    updateHeaderButtonsVisibility,
    initViewEvents,
    registerViewService,
} from '../../services/viewsService.js';
import {
    getAllBookmarksFlat,
    handleShowOldBookmarks,
    handleShowBrokenBookmarks,
    updateBrokenBookmarksCache,
    deleteSpecialItem,
    deleteAllSpecialItems,
    resetSpecialScan,
    closeImportModalWithAnimation,
    openDeleteAllBookmarksConfirmModal,
    openAddToBookmarkModal,
    showImportBookmarksPopup,
    hideImportBookmarksPopup,
    showBookmarkDragDropPanel,
    hideBookmarkDragDropPanel,
    triggerBookmarkImport,
    showAddToRuleModal,
    saveAddToRule,
    initBookmarkEvents,
} from '../../services/bookmarksService.js';
import {
    handleDownloadConversation,
    updateCombinedConversationDisplay,
    loadSelectedConversation,
    updateScheduledConversationBadge,
    switchToGeminiView,
    htmlToSpeechText,
    createApiKeyModal,
    updateGeminiButtonState,
    updateGeminiConversationButtonState,
    loadConversationFromDb,
    addGeminiEntryToDOM,
    handleClearCurrentConversation,
    handleGeminiQuery,
    geminiConversationHistory,
    geminiCurrentCombinedIndex,
    geminiCombinedConversations,
    geminiPersistentConversations,
    geminiSessionConversations,
    initGeminiEvents,
} from '../../services/geminiService.js';
import {
    handleHeaderScreenshot,
    toggleScreenshotPersistence,
    handleDownloadAllScreenshots,
    withTabActivation,
    handleScreenshotRequest,
    showScreenshotGallery,
    clearAllContextDataUI,
    closeScreenshotGallery,
    copyScreenshot,
    downloadScreenshot,
    deleteScreenshot,
    updateScreenshotCountBadge,
    handleOcrScreenshot,
    initScreenshotEvents,
} from '../../services/screenshotsService.js';
import {
    updateOrphanIndicators,
    toggleNotePersistence,
    handleOrphanNotesClick,
    handleOrphanScreenshotsClick,
    getNoteHandlers,
    showNotesView,
    closeNotesView,
    deleteNote,
    validateNoteForm,
    handleNoteFilter,
    openNoteModal,
    closeNoteModal,
    handleSaveNote,
    initNotesEvents,
} from '../../services/notesService.js';
import {
    createPageModePopup,
    showQrCodeModal,
    isLikelyDomain,
    getValidStandardTabs,
    updateMuteButtonState,
    updateAudibleIndicatorTooltip,
    syncAllTabIndicators,
    handleRuleActionClick,
    openCookieEditorModal,
    saveCookieChanges,
    deleteAllUngroupedTabs,
    updateDuplicateCountBadge,
    scrollToActiveGroupIfNeeded,
    renderNotesButton,
    renderScreenshotButton,
    renderGroupTitle,
    renderTabCount,
    handleFocusAfterRender,
    showCookieImportPanel,
    hideCookieImportPanel,
    handleCookieFileImport,
    exportCookiesFromModal,
    handleBackupAllGroups,
    handleRestoreAllGroups,
    handleRestoreSingleTab,
    handleBackupGroup,
    createTabsInBatches,
    handleRestoreGroup,
    renderGroups,
    unGroupAndRemoveAllTabsInGroup,
    fetchData,
    makeGroupTitleEditable,
    handleTabActivation,
    deleteAllTabsInGroup,
    deleteAllTabsInSubgroup,
    hideGroup,
    unhideGroup,
    togglePinState,
    initDragAndDrop,
    updateCounters,
    toggleColorPopup,
    positionColorPopup,
    closeColorPopup,
    moveSplitGroup,
    changeGroupColor,
    handleRemoveDuplicates,
    initGroupsEvents,
} from '../../services/groupsService.js';
import {
    handleSearchToggle,
    handleSearchEnter,
    findNextHighlight,
    applySearchAndFilter,
    initSearchEvents,
} from '../../services/searchService.js';
import {
    showDownloadPopup,
    updateModalUI,
    closeDownloadModal,
    handleGeminiSummaryRequest,
    downloadFiles,
} from '../../services/downloadsService.js';
import { prefetchAll, prefetchData, prefetchUrl } from '../../services/prefetchService.js';
import {
    loadActionVisibilitySettings,
    loadBookmarkActionVisibilitySettings,
    saveActionVisibilitySettings,
    saveBookmarkActionVisibilitySettings,
    applyActionVisibility,
    rebuildAllOverflowMenus,
    syncIndexedDbWithSession,
    getStorage,
    loadState,
    loadVisibilitySettings,
    saveVisibilitySettings,
    applyVisibilitySettings,
    updateSubgroupActionsButtonState,
    updateVisibilityPanelButtons,
    setupVisibilityControls,
    updateChildFolderActionsButtonState,
    updateOverflowButtonState,
    setupActionVisibilityControls,
    updateSubButtonVisibility,
    saveState,
    saveListGroupSettings,
    loadSplitScreenState,
    initSettingsEvents,
} from '../../services/settingsService.js';
import {
    createMenuItem,
    showContextMenu,
    createOverflowMenu,
    populateAndShowOverflowPopup,
    populateGroupOverflowPopup,
    populateBookmarkOverflowPopup,
    closeOverflowMenu,
    initContextMenuEvents,
} from '../../services/contextMenuService.js';

import {
    isGeminiViewActive,
    isBookmarksViewActive,
    isUrlViewActive,
    isNotesViewActive,
    isGalleryViewActive,
    isStandaloneGemini,
    currentMainView,
    currentNotesContext,
    currentGalleryContext,
    previousIframeUrl,
    navigationHistory,
    prefetchCache,
    isHandlingBookmarkChange,
    currentBookmarkSort,
    viewExpandStates,
    isProgrammaticActivation,
    isPopupWindow,
    isRenderingBookmarks,
} from '../../stores/appStore.svelte.js';

import { geminiStore, conversationHistory } from '../../stores/geminiStore.js';

export async function initializeAllEvents() {
    initSearchEvents();
    initNotesEvents();
    initScreenshotEvents();
    initViewEvents();
    initBookmarkEvents();
    initContextMenuEvents();
    initGeminiEvents();
    initGroupsEvents();
    initSettingsEvents();

    const port = chrome.runtime.connect({ name: 'sidepanel-connection' });
    port.onMessage.addListener((message) => {
        if (message.command === 'focusContent') {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        } else if (message.command === 'setHintsState') {
            if (message.active && typeof createLinkHints === 'function') createLinkHints();
            else if (!message.active && typeof clearAllStates === 'function') clearAllStates();
        }
    });

    chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: 'src/ui/pages/listGroup/listGroup.html' });

    // Resolved without blocking the boot; the listener awaits it on its first call.
    let ruleStorageArea = getStorageAreaName('ruleStorageArea');
    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area === 'local' && (changes.isListGroupPinned || changes.isGeminiPinned)) {
            refreshPinUI();
        }
        if (changes.ruleStorageArea) ruleStorageArea = changes.ruleStorageArea.newValue || 'sync';
        const rulesArea = await ruleStorageArea;
        if (area !== rulesArea && !(area === 'local' && changes.ruleStorageArea)) return;
        if (changes.enablePrefixes || changes.ruleStorageArea) {
            await loadState();
            await renderGroups();
        }
    });

    document.body.addEventListener('click', (event) => {
        const aboutLink = event.target.closest('#about-link-list-group');
        if (aboutLink) {
            event.preventDefault();
            chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/about/about.html') });
        }
    });

    // Resolve the requested view before loading any data: switchMainView only touches
    // the DOM and the stores, so doing it first lets the right view paint immediately
    // instead of waiting behind the storage and IndexedDB reads below.
    const urlParams = new URLSearchParams(window.location.search);
    const requestedView = urlParams.get('view') || 'groups';
    // Set to null to force switchMainView to always run (even for default 'groups' view)
    currentMainView.set(null);
    if (requestedView === 'gemini') {
        const { geminiStore: gs } = await import('../../stores/geminiStore.js');
        await switchMainView('groups', false, { skipHeaderButtons: true });
        isStandaloneGemini.set(true);
        gs.switchToView();
    } else {
        await switchMainView(requestedView, false);
    }
    // The conversation controls (new, save, download, copy) are revealed by the header
    // routine according to whether there is a conversation, and that is imperative:
    // without this the buttons stayed hidden after the assistant answered.
    conversationHistory.subscribe(() => updateHeaderButtonsVisibility());

    // Which buttons the header shows is decided by these preferences alone, and they
    // are plain storage reads. Settling them before the reveal keeps the control bar
    // from painting one set of buttons and swapping it a frame later.
    await Promise.all([
        loadVisibilitySettings(),
        loadActionVisibilitySettings(),
        loadBookmarkActionVisibilitySettings(),
        updateGeminiButtonState(),
    ]);
    applyVisibilitySettings();
    updateSubButtonVisibility();
    await updateSplitButtonsUI();
    // The duplicates button is part of the same header chrome, and it needs the view
    // to be resolved first, so its count is settled here rather than popping in a
    // few frames after the page is already on screen.
    await updateDuplicateCountBadge();

    // Everything below feeds content into the already-visible shell, so it is free to
    // keep loading in the background.
    await Promise.all([syncIndexedDbWithSession(), loadState(), loadConversationFromDb()]);

    listGroupState.update((s) => {
        s.themeColors = window.matchMedia('(prefers-color-scheme: dark)').matches ? darkThemeColors : lightThemeColors;
        return s;
    });
    initCustomCalendar();

    const updatePinState = (isPinned) => {
        const pinToggle = document.getElementById('pin-toggle');
        if (!pinToggle) return;
        pinToggle.classList.toggle('pinned', isPinned);
        pinToggle.setAttribute('aria-pressed', String(isPinned));
        pinToggle.setAttribute('data-i18n-title', isPinned ? 'pinTooltipPinned' : 'pinTooltipUnpinned');
        applyTranslations(pinToggle);
    };

    const refreshPinUI = async () => {
        const key = get(isGeminiViewActive) ? STORAGE_KEYS.IS_GEMINI_PINNED : STORAGE_KEYS.IS_LIST_GROUP_PINNED;
        const result = await chrome.storage.local.get(key);
        updatePinState(!!result[key]);
    };
    registerViewService('refreshPinUI', refreshPinUI);

    if (requestedView === 'groups') updateMuteButtonState();

    await updateCombinedConversationDisplay();
    await updateScheduledConversationBadge();
    await refreshPinUI();

    const pinToggle = document.getElementById('pin-toggle');
    if (pinToggle) {
        pinToggle.addEventListener('click', async () => {
            const currentState = pinToggle.classList.contains('pinned');
            const newState = !currentState;
            const key = get(isGeminiViewActive) ? STORAGE_KEYS.IS_GEMINI_PINNED : STORAGE_KEYS.IS_LIST_GROUP_PINNED;
            try {
                if (newState) {
                    const otherKeys = get(isGeminiViewActive)
                        ? { [STORAGE_KEYS.IS_LIST_GROUP_PINNED]: false, isPinned: false }
                        : { [STORAGE_KEYS.IS_GEMINI_PINNED]: false, isPinned: false };
                    await chrome.storage.local.set(otherKeys);
                }
                await chrome.storage.local.set({ [key]: newState });
                updatePinState(newState);
                const nk = get(isGeminiViewActive)
                    ? newState
                        ? 'geminiPagePinned'
                        : 'geminiPageUnpinned'
                    : newState
                      ? 'listGroupPagePinned'
                      : 'listGroupPageUnpinned';
                showNotification(nk);
            } catch (e) {
                console.error('Error handling pin state:', e);
            }
        });
    }
    document.getElementById('main-back-btn').addEventListener('click', async () => {
        const errorView = document.querySelector('.container')?.querySelector('.error-message-container.active-view');
        if (errorView) {
            errorView.remove();
            switchToGeminiView();
            return;
        }

        if (get(isUrlViewActive)) {
            const activeView = document.querySelector('.container')?.querySelector('.active-view');
            if (activeView?.dataset.containsYoutube === 'true') {
                hideYoutubeView(activeView);
                return;
            }
            if (get(previousIframeUrl)) {
                const url = get(previousIframeUrl);
                previousIframeUrl.set(null);
                await openUrlInPanel(url);
                return;
            }
            closeUrlInPanel();
            return;
        }

        if (get(isNotesViewActive)) {
            closeNotesView();
            return;
        }
        if (get(isGalleryViewActive)) {
            closeScreenshotGallery();
            return;
        }

        if (get(isGeminiViewActive)) {
            if (get(isStandaloneGemini) && get(navigationHistory).length === 0) {
                const { navSource } = await chrome.storage.local.get('navSource');
                if (navSource) {
                    window.location.href = navSource;
                    return;
                }
            }
            geminiStore.closeView(true);
            isGeminiViewActive.set(false);
            await restoreMainView();
            return;
        }

        if (get(navigationHistory).length > 0) {
            const hist = get(navigationHistory);
            const previousView = hist.pop();
            navigationHistory.set(hist);
            await switchMainView(previousView, false);
            return;
        }

        const { navSource } = await chrome.storage.local.get('navSource');
        const currentPage = window.location.pathname.split('/').pop();
        await chrome.storage.local.set({ navSource: `../listGroup/${currentPage}?context=sidepanel` });
        if (navSource) {
            window.location.href = navSource;
        } else {
            window.location.href = '../rules/rules.html?context=sidepanel';
            chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: '../rules/rules.html' });
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Control' || e.key === 'Meta') {
            const activeButton = document.querySelector('.read-aloud-btn.reading');
            if (activeButton) activeButton.classList.add('ctrl-held');
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control' || e.key === 'Meta') {
            const activeButton = document.querySelector('.read-aloud-btn.reading.ctrl-held');
            if (activeButton) activeButton.classList.remove('ctrl-held');
        }
    });

    window.addEventListener('resize', updateScrollButtons);

    const groupsList = document.getElementById('groups-list');
    if (groupsList) groupsList.addEventListener('scroll', updateScrollButtons);
    const geminiConvView = document.getElementById('gemini-conversation-view');
    if (geminiConvView) geminiConvView.addEventListener('scroll', updateScrollButtons);

    [
        'bookmarks-view-container',
        'history-view-container',
        'recent-view-container',
        'reading-list-view-container',
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('scroll', updateScrollButtons);
    });

    const bookmarksViewContainer = document.getElementById('bookmarks-view-container');
    if (bookmarksViewContainer) bookmarksViewContainer.addEventListener('click', handleRuleActionClick);

    document.getElementById('scroll-up').addEventListener('click', () => {
        const el = getActiveScrollableElement();
        if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.getElementById('scroll-down').addEventListener('click', () => {
        const el = getActiveScrollableElement();
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });

    window.addEventListener('message', handleIframeMessage);

    const deleteAllContextBtn = document.getElementById('delete-all-context-btn');
    if (deleteAllContextBtn) {
        deleteAllContextBtn.addEventListener('click', async () => {
            const view = get(currentMainView);
            if (get(isGeminiViewActive)) {
                // The store holds the conversation on screen; the service copy of this
                // reads the legacy stores and always reported "nothing to delete".
                await geminiStore.deleteConversation();
            } else if (get(isGalleryViewActive)) {
                clearAllContextDataUI(get(currentGalleryContext), screenshotConfig);
            } else if (get(isNotesViewActive)) {
                clearAllContextDataUI(get(currentNotesContext), noteConfig);
            } else if (view === 'groups') {
                if (await confirmAction({ messageKey: 'confirmDeleteOtherGroups' })) {
                    chrome.runtime.sendMessage({ action: 'deleteOtherGroups' }, (response) => {
                        if (response.success) {
                            showNotification('otherGroupsDeleted');
                            renderGroups();
                        }
                    });
                }
            } else if (view === 'bookmarks') {
                const visibilityPanel = document.getElementById('visibility-controls-panel');
                if (visibilityPanel) {
                    const isPanelVisible = !visibilityPanel.classList.contains('hidden');
                    const isDeleteActive = !!visibilityPanel.querySelector('.delete-option-btn:not(.hidden)');
                    if (isPanelVisible && isDeleteActive) {
                        visibilityPanel.classList.add('hidden');
                    } else {
                        visibilityPanel.classList.remove('hidden');
                        document
                            .querySelectorAll(
                                '#toggle-group-actions-btn, #toggle-domain-headers-btn, #toggle-subgroup-actions-btn, #toggle-tab-actions-btn, #toggle-folder-actions-btn, #toggle-child-folders-btn, #toggle-child-folder-actions-btn, #toggle-bookmark-actions-btn',
                            )
                            .forEach((b) => b?.classList.add('hidden'));
                        document.querySelectorAll('.sort-option-btn').forEach((b) => b?.classList.add('hidden'));
                        visibilityPanel
                            .querySelectorAll('.delete-option-btn')
                            .forEach((b) => b?.classList.remove('hidden'));
                    }
                }
            } else if (view === 'history') {
                if (await confirmAction({ messageKey: 'confirmDeleteAllHistory' })) {
                    chrome.history.deleteAll(() => {
                        showNotification('historyDeleted');
                        renderHistoryView();
                    });
                }
            } else if (view === 'recent') {
                prefetchCache.update((c) => {
                    c.recent = [];
                    return c;
                });
                renderRecentlyClosedView();
                showNotification('recentCleared');
            } else if (view === 'reading') {
                if (await confirmAction({ messageKey: 'confirmDeleteAllReadingList' })) {
                    const items = await chrome.readingList.query({});
                    for (const item of items) await chrome.readingList.removeEntry({ url: item.url });
                    renderReadingListView();
                    showNotification('readingListCleared');
                }
            }
        });
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'refreshUI') {
            if (window.isBulkOpening || get(isBookmarksViewActive)) return;
            if (get(isProgrammaticActivation)) {
                isProgrammaticActivation.set(false);
                return;
            }
            renderGroups();
        }

        if (message.action === 'bookmarksChanged') {
            if (get(isHandlingBookmarkChange)) return;
            isHandlingBookmarkChange.set(true);
            chrome.runtime.sendMessage({ action: 'forceClearBookmarkCache' }, () => {
                if (get(isBookmarksViewActive)) {
                    (async () => {
                        await new Promise((r) => setTimeout(r, 50));
                        const bookmarksList = document.getElementById('bookmarks-list');
                        if (bookmarksList) {
                            await initializeBookmarksView(
                                bookmarksList,
                                {
                                    applyTranslations,
                                    updateScrollButtons,
                                    updateExpandAllButtonState,
                                    createOverflowMenu,
                                    showAddToRuleModal,
                                    exportBookmarkFolder,
                                    showNotification,
                                    openAddToBookmarkModal,
                                },
                                get(currentBookmarkSort),
                                get(viewExpandStates).bookmarks,
                            );
                        }
                        updateDuplicateCountBadge();
                    })();
                }
            });
            if (message.notification?.key) showNotification(message.notification.key);
            setTimeout(() => isHandlingBookmarkChange.set(false), 300);
        }

        if (message.action === 'noteUpdatedFromOmnibar') {
            const updatedId = message.id;
            if (!updatedId) return;
            (async () => {
                try {
                    const freshNote = await getNoteFromDb(updatedId);
                    if (!freshNote) return;
                    const noteEl = document.querySelector(`.note-entry[data-note-id="${updatedId}"]`);
                    if (!noteEl) return;
                    const context = get(currentNotesContext) || {
                        type: 'group',
                        id: -1,
                        title: chrome.i18n.getMessage('note') || 'Note',
                    };
                    const handlers = getNoteHandlers(context);
                    const newNoteEl = renderNoteEntryFromModule(freshNote, context, handlers);
                    if (newNoteEl) noteEl.replaceWith(newNoteEl);
                } catch (e) {
                    console.warn('noteUpdatedFromOmnibar: error refreshing note', e);
                }
            })();
            return true;
        }

        if (message.action === 'focusContent') {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });

    initAgentUI({
        getConversationHistory: () => get(geminiConversationHistory),
        currentCombinedIndex: get(geminiCurrentCombinedIndex),
        combinedConversations: get(geminiCombinedConversations),
        persistentConversations: get(geminiPersistentConversations),
        sessionConversations: get(geminiSessionConversations),
        geminiConversationView: document.getElementById('gemini-conversation-view'),
        PERSISTENT_GEMINI_KEY: STORAGE_KEYS.PERSISTENT_GEMINI,
        GEMINI_SESSION_CONVERSATIONS_KEY: STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS,
        switchToGeminiView,
        saveGeminiEntryToDb,
        addGeminiEntryToDOM,
        applyTranslations,
        updateCombinedConversationDisplay,
        geminiAgentModeBtn: document.getElementById('gemini-agent-mode-btn'),
        geminiSendBtn: document.getElementById('gemini-send-btn'),
    });

    setupVisibilityControls();

    initializeKeyboardNavigation({
        '.color-popup-item': {
            Escape: (event, element) => {
                event.preventDefault();
                event.stopPropagation();
                closeColorPopup();
                return true;
            },
        },
        '.group-title': {
            Enter: (event, element) => {
                event.preventDefault();
                makeGroupTitleEditable(element, true);
                return true;
            },
            ' ': (event, element) => {
                event.preventDefault();
                makeGroupTitleEditable(element, true);
                return true;
            },
        },
        '.color-indicator': {
            Enter: async (event, element) => {
                event.preventDefault();
                const id = element.closest('.group-item')?.dataset.groupId;
                if (id) await toggleColorPopup(element, id);
                return true;
            },
            ' ': async (event, element) => {
                event.preventDefault();
                const id = element.closest('.group-item')?.dataset.groupId;
                if (id) await toggleColorPopup(element, id);
                return true;
            },
        },
        '.tab-title': {
            Enter: (event, element) => {
                const tabItem = element.closest('.tab-item');
                return tabItem ? handleTabActivation(event, tabItem) : false;
            },
            ' ': (event, element) => {
                const tabItem = element.closest('.tab-item');
                return tabItem ? handleTabActivation(event, tabItem) : false;
            },
        },
    });

    window._pomoInternal = {
        openNoteModal: (ctx, note, opts) => openNoteModal(ctx, note, opts),
        showNotesView: (ctx, opts) => showNotesView(ctx, opts),
        getNotesContext: () => get(currentNotesContext),
        isNotesActive: () => get(isNotesViewActive),
    };
}
