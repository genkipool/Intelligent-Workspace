import { confirmAction } from '../../stores/confirmStore.js';
import { getStorageAreaName } from '../../services/storage.js';
import { get } from 'svelte/store';
import { listGroupState } from '../../stores/listGroupStore.js';

import { applyTranslations, showNotification } from '../../../utils/i18n.js';
import { renderNoteEntry as renderNoteEntryFromModule } from '../../content-renderer/content-renderer.js';
import { initializeKeyboardNavigation } from '../../../utils/keyboardNav.js';
import { initAgentUI } from '../../../utils/agent-ui.js';
import { exportBookmarkFolder } from '../../../utils/importExport.js';
import '../../../lib/marked.js';
import { initializeBookmarksView } from '../../bookmarks/bookmarks.js';
import { getProvider } from '../../../config/donationProviders.js';
import { saveGeminiEntryToDb, getNoteFromDb } from '../../../utils/db.js';

import {
    STORAGE_KEYS,
    noteConfig,
    screenshotConfig,
    lightThemeColors,
    darkThemeColors,
} from '../../services/constants.js';

import {
    restoreMainView,
    updateSplitButtonsUI,
    switchMainView,
    renderHistoryView,
    renderRecentlyClosedView,
    renderReadingListView,
    initCustomCalendar,
    handleIframeMessage,
    openUrlInPanel,
    openPaymentInPanel,
    closeUrlInPanel,
    hideYoutubeView,
    getActiveScrollableElement,
    updateScrollButtons,
    updateExpandAllButtonState,
    updateHeaderButtonsVisibility,
    initViewEvents,
    registerViewService,
} from '../../services/viewsService.js';
import { openAddToBookmarkModal, showAddToRuleModal, initBookmarkEvents } from '../../services/bookmarksService.js';
import {
    updateCombinedConversationDisplay,
    updateScheduledConversationBadge,
    switchToGeminiView,
    updateGeminiButtonState,
    loadConversationFromDb,
    addGeminiEntryToDOM,
    geminiConversationHistory,
    geminiCurrentCombinedIndex,
    geminiCombinedConversations,
    geminiPersistentConversations,
    geminiSessionConversations,
    initGeminiEvents,
} from '../../services/geminiService.js';
import {
    clearAllContextDataUI,
    closeScreenshotGallery,
    initScreenshotEvents,
    showScreenshotGallery,
} from '../../services/screenshotsService.js';
import {
    getNoteHandlers,
    showNotesView,
    closeNotesView,
    openNoteModal,
    initNotesEvents,
} from '../../services/notesService.js';
import {
    updateMuteButtonState,
    handleRuleActionClick,
    updateDuplicateCountBadge,
    renderGroups,
    makeGroupTitleEditable,
    handleTabActivation,
    toggleColorPopup,
    closeColorPopup,
    initGroupsEvents,
} from '../../services/groupsService.js';
import { initSearchEvents } from '../../services/searchService.js';
import {
    loadActionVisibilitySettings,
    loadBookmarkActionVisibilitySettings,
    syncIndexedDbWithSession,
    loadState,
    loadVisibilitySettings,
    applyVisibilitySettings,
    setupVisibilityControls,
    updateSubButtonVisibility,
    initSettingsEvents,
} from '../../services/settingsService.js';
import { createOverflowMenu, initContextMenuEvents } from '../../services/contextMenuService.js';

import {
    isGeminiViewActive,
    isBookmarksViewActive,
    isUrlViewActive,
    isNotesViewActive,
    isGalleryViewActive,
    overlayViewOpening,
    standaloneOverlayView,
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
} from '../../stores/appStore.svelte.js';

import { geminiStore, conversationHistory } from '../../stores/geminiStore.js';

/** Whether the strip of view buttons is on screen. */
const isViewStripOpen = () => !document.getElementById('view-toggle-panel')?.classList.contains('hidden');

/**
 * [AI INSTRUCTION]
 * THE VIEWS OF THIS PAGE A SHORTCUT CAN ASK FOR, AND HOW TO TELL YOU ARE THERE.
 *
 * The worker maps a keyboard command to a page and a view (`SIDE_PANEL_TARGETS`); this
 * is the other half — what "show me the gallery" means once the page is already open.
 * `is` is what makes the command a toggle rather than a no-op: asking for the view you
 * are already looking at closes the panel, and only the page can answer that.
 *
 * Every view of this page belongs here. The assistant, the gallery and the notes are
 * not main views — they are painted over the group list — which is exactly why the
 * worker cannot work any of this out from a URL.
 */
const PANEL_VIEWS = {
    groups: {
        is: () => get(currentMainView) === 'groups' && !isSpecialViewActive() && !isViewStripOpen(),
        show: async () => {
            await switchMainView('groups', false);
            document.getElementById('view-toggle-panel')?.classList.add('hidden');
        },
    },
    views: {
        is: () => get(currentMainView) === 'groups' && !isSpecialViewActive() && isViewStripOpen(),
        show: async () => {
            await switchMainView('groups', false);
            document.getElementById('view-toggle-panel')?.classList.remove('hidden');
        },
    },
    gemini: {
        is: () => get(isGeminiViewActive),
        show: (options) =>
            openOverlayView(
                'gemini',
                async () => {
                    isStandaloneGemini.set(true);
                    geminiStore.switchToView();
                    // The other two openers repaint the header themselves; the
                    // assistant's does not, so it is asked for here.
                    updateHeaderButtonsVisibility();
                },
                options,
            ),
    },
    notes: {
        is: () => get(isNotesViewActive),
        // The 'orphan' context is the one the section under the groups uses: with no
        // list given it resolves the collection itself, honouring the user's
        // "always / only on delete" preference.
        show: (options) => openOverlayView('notes', () => showNotesView({ type: 'orphan' }), options),
    },
    gallery: {
        is: () => get(isGalleryViewActive),
        show: (options) => openOverlayView('gallery', () => showScreenshotGallery('orphan', null, null), options),
    },
    /**
     * The donation form. It rides on the same framed-view machinery the web view uses
     * — `isUrlViewActive`, the same header, the same back button — because it is the
     * same thing: an iframe filling the panel. What it does NOT share is the DNR
     * header stripping; see `openPaymentInPanel`.
     *
     * Which gateway to show comes from the query string, the way `?view=url` already
     * passes its target. An unknown or missing provider falls through to the group
     * list rather than opening an empty frame.
     */
    payment: {
        is: () => get(isUrlViewActive),
        show: async () => {
            const provider = getProvider(new URLSearchParams(window.location.search).get('provider'));
            if (!provider || provider.kind !== 'payment') {
                await switchMainView('groups', false);
                return;
            }
            await switchMainView('groups', false);
            await openPaymentInPanel(provider);
        },
    },
};

/**
 * Opens one of the views that are painted over the group list.
 *
 * Two steps that have to look like one: put the page in the state the view sits on,
 * then open the view. `overlayViewOpening` is what makes the header name the right
 * thing for the whole of it — without it the title read "Listar Grupos" between the
 * two, which is the last of the flash people were seeing when they opened the notes
 * or the gallery from the popup.
 *
 * `skipReveal` keeps `switchMainView` from putting the group list on screen and from
 * naming it, for the same reason.
 */
/**
 * @param {() => Promise<void>} open Opens the view *and* repaints the header. Each
 *   opener does the second part itself because only it knows what to say: the gallery
 *   passes `updateHeaderButtonsVisibility` whether there are any screenshots, and a
 *   bare call from here would answer "no" on its behalf — which is how the gallery lost
 *   its download button.
 */
async function openOverlayView(name, open, { standalone = false } = {}) {
    overlayViewOpening.set(name);
    /**
     * The group chrome goes now, in the same breath as the request.
     *
     * `body.groups-view-active` is what the stylesheet hangs the pomodoro panel, the
     * music panel and the hidden search bar off, and `switchMainView` cannot be trusted
     * to take it off here: asked for the view it is already on it returns at the first
     * line and never reaches its own class handling. That is why switching to the notes
     * *from* the group list left the pomodoro panel sitting under them.
     */
    document.body.classList.remove('groups-view-active', 'bookmarks-view-active');
    try {
        /**
         * `skipHeaderButtons` for all three, which is what the assistant has always
         * done and the other two did not.
         *
         * These views sit *on top of* the group list, so `currentMainView` is still
         * 'groups' while one is open. Letting `switchMainView` paint the header at this
         * point therefore paints the group list's toolbar — regroup, the backups, the
         * view buttons — because the view being opened has not raised its flag yet. The
         * opener raises it a few milliseconds later and the header is repainted
         * correctly, and those few milliseconds are the flash.
         */
        await switchMainView('groups', false, { skipReveal: true, skipHeaderButtons: true });
        // After `switchMainView`, which clears it: this page was opened *into* this
        // view, so back means the page it came from and not the group list underneath.
        standaloneOverlayView.set(standalone ? name : null);
        await open();
    } finally {
        overlayViewOpening.set(null);
    }
}

/** Whether anything is painted over the main view right now. */
const isSpecialViewActive = () =>
    get(isGeminiViewActive) || get(isNotesViewActive) || get(isGalleryViewActive) || get(isUrlViewActive);

/**
 * Leaves a view the page was opened straight into, by going back where it came from.
 *
 * Only when nothing has been navigated since: once there is history, back means the
 * previous view and this page is where "back where it came from" already led.
 *
 * @param {'notes'|'gallery'|'gemini'} name
 * @returns {Promise<boolean>} Whether it handled the press.
 */
async function leaveStandaloneOverlay(name) {
    if (get(standaloneOverlayView) !== name || get(navigationHistory).length > 0) return false;
    const { navSource } = await chrome.storage.local.get('navSource');
    if (!navSource) return false;
    window.location.href = navSource;
    return true;
}

/**
 * What the main back button does. It was 65 lines inline inside
 * initializeAllEvents; it captures nothing from that scope.
 */
async function handleMainBackClick() {
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
        if (await leaveStandaloneOverlay('notes')) return;
        closeNotesView();
        return;
    }
    if (get(isGalleryViewActive)) {
        if (await leaveStandaloneOverlay('gallery')) return;
        closeScreenshotGallery();
        return;
    }

    if (get(isGeminiViewActive)) {
        if (await leaveStandaloneOverlay('gemini')) return;
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
}

/**
 * Wiring of the "delete all" button of the context panel (64 lines inline).
 */
function initDeleteAllContextButton() {
    const deleteAllContextBtn = document.getElementById('delete-all-context-btn');
    if (!deleteAllContextBtn) return;
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
        } else if (view === 'downloads') {
            if (await confirmAction({ messageKey: 'confirmDeleteAllDownloads' })) {
                const { downloadsStore } = await import('../../stores/downloadsStore.js');
                await downloadsStore.eraseAll();
                showNotification('downloadsCleared');
            }
        }
    });
}

/**
 * Messages the side panel reacts to (75 lines inline).
 */
function initRuntimeMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        /**
         * A keyboard command asked for one of this page's views while the page is
         * already open. Switching here rather than reloading the panel is the whole
         * point: `pa` then `pl` used to close the panel instead of going back to the
         * group list, because from the worker's side both are `listGroup.html`.
         */
        if (message.action === 'panelShowView') {
            const view = PANEL_VIEWS[message.view];
            if (!view) {
                sendResponse({ switched: false });
                return false;
            }
            // Already there: the worker turns that into the toggle the shortcut has
            // always been and closes the panel.
            if (view.is()) {
                sendResponse({ switched: false });
                return false;
            }
            // Answered now, not when the view has finished painting. All the worker is
            // waiting to hear is whether this page took the request — the gallery and
            // the notes read a database and can take seconds, and a worker holding a
            // message channel open for that is a worker that eventually gives up and
            // opens a second panel on top of the one that was already switching.
            sendResponse({ switched: true });
            view.show();
            return false;
        }

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
            // This page keeps its own copy of the bookmark tree for a fast first paint,
            // and the view prefers it over asking the browser. Clearing the copy in the
            // background was not enough: a deleted bookmark came straight back on the
            // next repaint, and only reloading the page got rid of it.
            prefetchCache.update((c) => ({ ...c, bookmarks: null }));
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
}

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
        }
        // A 'setHintsState' branch used to live here calling createLinkHints() and
        // clearAllStates(). Neither function exists in this page — they belong to the
        // hint content scripts — and nothing in the extension sends that command, so
        // the branch could never run.
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
    if (requestedView === 'url') {
        const targetUrl = urlParams.get('url');
        await switchMainView('groups', false);
        if (targetUrl) {
            await openUrlInPanel(decodeURIComponent(targetUrl));
        }
    } else if (PANEL_VIEWS[requestedView]) {
        // Opened straight into it, so `standalone`: see `standaloneOverlayView`.
        // The same table a running page uses, so opening straight into the gallery and
        // switching to it later cannot end up meaning two different things. The 'orphan'
        // context the openers pass is the one the section under the groups uses: with no
        // list given it resolves the collection itself, honouring the user's
        // "always / only on delete" preference.
        await PANEL_VIEWS[requestedView].show({ standalone: true });
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
    document.getElementById('main-back-btn').addEventListener('click', handleMainBackClick);

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

    // Escape key blurs any active input element
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const active = document.activeElement;
            if (active && (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable)) {
                active.blur();
                try {
                    if (document.body && typeof document.body.click === 'function') {
                        document.body.click();
                    } else if (document.documentElement && typeof document.documentElement.click === 'function') {
                        document.documentElement.click();
                    }
                } catch {}
            }
        }
    });

    // Alt sequence: Alt + [groupPrefix] + [tabNum] + Enter
    let altSequenceBuffer = '';
    let altSequenceTimer = null;
    let isAltHeld = false;

    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key === 'Alt') {
                isAltHeld = true;
            }
            if (e.altKey || isAltHeld || (altSequenceBuffer && (e.key === 'Enter' || e.code === 'Enter'))) {
                if (e.key === 'Enter' || e.code === 'Enter') {
                    if (altSequenceBuffer) {
                        // The digits are optional: the letters alone name the group and
                        // land on its first tab, and `0` is the shorthand for its last
                        // one — the two tabs anybody reaches for without counting.
                        const match = altSequenceBuffer.match(/^([a-zA-Z\u00C0-\u024F\s_-]+)(\d*)$/);
                        if (match) {
                            const groupPrefix = match[1].trim();
                            const tabIndex = match[2] === '' ? 1 : parseInt(match[2], 10);
                            chrome.runtime.sendMessage({
                                action: 'navigateToGroupTab',
                                groupPrefix,
                                tabIndex,
                            });
                            altSequenceBuffer = '';
                            if (altSequenceTimer) clearTimeout(altSequenceTimer);
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                        }
                    }
                } else if (e.key === 'Backspace') {
                    if (altSequenceBuffer) {
                        altSequenceBuffer = altSequenceBuffer.slice(0, -1);
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                } else if (e.key !== 'Alt' && !e.ctrlKey && !e.metaKey) {
                    let char = '';
                    if (e.code && e.code.startsWith('Key')) {
                        char = e.code.slice(3).toLowerCase();
                    } else if (e.code && e.code.startsWith('Digit')) {
                        char = e.code.slice(5);
                    } else if (e.code && e.code.startsWith('Numpad') && !isNaN(e.code.slice(6))) {
                        char = e.code.slice(6);
                    } else if (e.key && e.key.length === 1 && /[a-zA-Z0-9_\-\s]/.test(e.key)) {
                        char = e.key.toLowerCase();
                    }
                    if (char) {
                        altSequenceBuffer += char;
                        if (altSequenceTimer) clearTimeout(altSequenceTimer);
                        altSequenceTimer = setTimeout(() => {
                            altSequenceBuffer = '';
                        }, 3000);
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
            }
        },
        true,
    );

    document.addEventListener(
        'keyup',
        (e) => {
            if (e.key === 'Alt') {
                isAltHeld = false;
                if (altSequenceTimer) clearTimeout(altSequenceTimer);
                altSequenceTimer = setTimeout(() => {
                    altSequenceBuffer = '';
                }, 1500);
            }
        },
        true,
    );

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
        'downloads-view-container',
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

    initDeleteAllContextButton();

    initRuntimeMessageListener();

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
