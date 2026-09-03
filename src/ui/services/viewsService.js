/**
 * viewsService.js — Service extracted from views.js
 *
 * Functions: showWelcomeMessage, restoreMainView, closeBookmarksView, toggleViews, updateSplitButtonsUI, manageViewVisibility, switchMainView, openDeleteHistoryConfirmModal, updateMainPanelButtons, renderHistoryView, showNoHistoryMessage, renderRecentlyClosedView, renderReadingListView, initCustomCalendar, createGenericListItem, handleIframeMessage, openUrlInPip, openUrlInPopup, openUrlInPanel, fetchContentForReaderView, showReaderView, showErrorView, closeUrlInPanel, hideYoutubeView, restoreYoutubeView, discardYoutubeView, adjustScrollButtonsForGeminiView, getActiveScrollableElement, updateScrollButtons, updateBackButtonTooltip, updateExpandAllButtonState, toggleExpandAll, updateHeaderButtonsVisibility, initViewEvents
 */

import { get } from 'svelte/store';
import { updateScrollButtons } from '../components/common/ScrollButtons.svelte';

import { applyTranslations, showNotification } from '../../utils/i18n.js';

import { extractYouTubeVideoId, createYouTubeEmbed } from '../../utils/youtubeEmbed.js';

import { initializeBookmarksView } from '../bookmarks/bookmarks.js';

import { linkifyHtml } from './utils.js';
import { attachFrameScrollbar, detachFrameScrollbar } from './frameScrollbar.js';
import {
    mintPaymentNonce,
    buildPaymentUrl,
    attachPaymentBridge,
    PAYMENT_VIEW_SANDBOX,
    PAYMENT_VIEW_ALLOW,
} from './paymentService.js';
import { prefetchUrl, prefetchData } from './prefetchService.js';
import { openModal, showDeleteHistoryConfirmModal } from '../stores/modalStore.js';

// ─── Svelte Stores (appStore) ────────────────────────────────────
import {
    currentMainView,
    isBookmarksViewActive,
    isRenderingBookmarks,
    currentBookmarkSort,
    isGeminiViewActive,
    isNotesViewActive,
    currentNotesContext,
    isGalleryViewActive,
    isUrlViewActive,
    isStandaloneGemini,
    navigationHistory,
    standaloneOverlayView,
    currentHistoryDateFilter,
    currentPanelUrl,
    currentPanelContext,
    previousIframeUrl,
    calCurrentDate,
    calSelectedDate,
    hiddenYoutubeView,
    isPopupWindow,
    expandedGroupStates,
    expandedSubgroupStates,
} from '../stores/appStore.svelte.js';

// ─── Svelte Stores (other) ───────────────────────────────────────
import { geminiStore, conversationHistory } from '../stores/geminiStore.js';
import { listGroupStore } from '../stores/listGroupStore.js';
import { downloadsDateFilter } from '../stores/downloadsStore.js';

// ─── Legacy state (transitional — for properties not yet in Svelte stores) ──
import { state as legacyState } from './constants.js';

// ─── Direct Function Imports (replacing fn.X) ────────────────────
import { applySearchAndFilter } from './searchService.js';
import { applyActionVisibility, updateSubButtonVisibility, loadSplitScreenState } from './settingsService.js';
import {
    updateDuplicateCountBadge,
    updateMuteButtonState,
    renderGroups,
    createTabsInBatches,
} from './groupsService.js';
import { updateScheduledConversationBadge, switchToGeminiView } from './geminiService.js';
import { closeNotesView, showNotesView } from './notesService.js';
import { closeScreenshotGallery } from './screenshotsService.js';
import { closeOverflowMenu, createOverflowMenu } from './contextMenuService.js';
import { showAddToRuleModal, openAddToBookmarkModal } from './bookmarksService.js';
import { exportBookmarkFolder } from '../../utils/importExport.js';

// ─── External registry for functions that can't be imported directly ──
const _ext = {};
export function registerViewService(key, fn) {
    _ext[key] = fn;
}
function ext(key) {
    return _ext[key];
}

// The reader, the error box and the url panel are built by hand and marked
// .active-view, but so are the views Svelte mounts. Ripping a component-owned node
// out of the DOM leaves its store thinking the view is still open, which is how the
// notes list disappeared for good after deleting a single note.
const COMPONENT_OWNED_VIEWS = ':not(#notes-view):not(#screenshot-gallery-view)';

/**
 * Removes the payment frame's message listener. Held here rather than inside the
 * opener because `closeUrlInPanel` is what actually takes the frame off screen, and a
 * listener left behind would keep answering for a frame that no longer exists.
 */
let detachPaymentBridge = null;

function getTransientActiveView(container) {
    return container?.querySelector(`.active-view${COMPONENT_OWNED_VIEWS}`) || null;
}

// ─── Exported Functions ──────────────────────────────────────────

export function showWelcomeMessage(container, viewType) {
    if (!container || !['notes', 'gemini'].includes(viewType)) return;

    if (container.querySelector(`.${viewType}-welcome-message`)) return;

    container.innerHTML = '';

    const welcomeContainer = document.createElement('div');
    welcomeContainer.className = `${viewType}-welcome-message`;

    const title = document.createElement('h3');
    title.setAttribute('data-i18n', `${viewType}WelcomeTitle`);

    const body = document.createElement('p');
    body.setAttribute('data-i18n', `${viewType}WelcomeBody`);

    welcomeContainer.appendChild(title);
    welcomeContainer.appendChild(body);

    container.appendChild(welcomeContainer);
    applyTranslations(welcomeContainer);
}

export async function restoreMainView() {
    const _mainHeaderTitle = document.getElementById('main-header-title');
    const _hiddenGroupsContainer = document.getElementById('hidden-groups-container');
    const _hiddenContextContainer = document.getElementById('hidden-context-container');
    const _searchInput = document.getElementById('search-input');

    if (_mainHeaderTitle) {
        const titles = {
            groups: 'listTabGroups',
            bookmarks: 'bookmarksViewTitle',
            history: 'historyViewTitle',
            recent: 'recentlyClosedViewTitle',
            reading: 'readingListViewTitle',
            downloads: 'downloadsViewTitle',
        };
        const i18nKey = titles[get(currentMainView)] || 'listTabGroups';
        _mainHeaderTitle.setAttribute('data-i18n', i18nKey);
        applyTranslations(_mainHeaderTitle);
    }

    const views = {
        groups: document.getElementById('groups-list'),
        bookmarks: document.getElementById('bookmarks-view-container'),
        history: document.getElementById('history-view-container'),
        recent: document.getElementById('recent-view-container'),
        reading: document.getElementById('reading-list-view-container'),
        downloads: document.getElementById('downloads-view-container'),
    };

    Object.values(views).forEach((el) => {
        if (el) el.style.display = 'none';
    });

    if (views[get(currentMainView)]) {
        views[get(currentMainView)].style.display = get(currentMainView) === 'groups' ? '' : 'flex';
    }

    if (get(currentMainView) === 'groups') {
        if (_hiddenGroupsContainer) {
            _hiddenGroupsContainer.style.display = '';
            _hiddenGroupsContainer.classList.toggle('hidden', _hiddenGroupsContainer.childElementCount === 0);
        }
        if (_hiddenContextContainer) _hiddenContextContainer.style.display = '';
    } else {
        if (_hiddenGroupsContainer) _hiddenGroupsContainer.style.display = 'none';
        if (_hiddenContextContainer) _hiddenContextContainer.style.display = 'none';
    }

    isBookmarksViewActive.set(get(currentMainView) === 'bookmarks');

    if (_searchInput) _searchInput.value = '';

    if (typeof applySearchAndFilter === 'function') applySearchAndFilter();

    if (typeof applyActionVisibility === 'function') applyActionVisibility();

    updateExpandAllButtonState();
    updateSubButtonVisibility();
    updateHeaderButtonsVisibility();
    updateScrollButtons();
    updateDuplicateCountBadge();

    if (get(currentMainView) === 'groups' && typeof updateScheduledConversationBadge === 'function') {
        await updateScheduledConversationBadge();
    }

    applyTranslations();
    updateBackButtonTooltip();
    const _rpu = ext('refreshPinUI');
    if (typeof _rpu === 'function') await _rpu();
}

export function closeBookmarksView(isSwitchingView = false) {
    isBookmarksViewActive.set(false);
    const _toggleBookmarksViewBtn = document.getElementById('toggle-bookmarks-view-btn');
    if (_toggleBookmarksViewBtn) {
        _toggleBookmarksViewBtn.setAttribute('aria-pressed', 'false');
    }
    const bookmarksViewContainer = document.getElementById('bookmarks-view-container');
    if (bookmarksViewContainer) {
        bookmarksViewContainer.style.display = 'none';
    }

    if (!isSwitchingView) {
        restoreMainView();
    }
}

export async function toggleViews() {
    const _viewTogglePanel = document.getElementById('view-toggle-panel');
    const _toggleBookmarksViewBtn = document.getElementById('toggle-bookmarks-view-btn');
    const _visibilityControlsPanel = document.getElementById('visibility-controls-panel');
    const _actionVisibilityControlsPanel = document.getElementById('action-visibility-controls-panel');
    const _mainHeaderTitle = document.getElementById('main-header-title');
    const _backupAllBtn = document.getElementById('backup-all-btn');
    const _restoreAllBtn = document.getElementById('restore-all-btn');
    const _regroupBtn = document.getElementById('regroup-btn');
    const _exportBookmarksBtn = document.getElementById('export-bookmarks-btn');
    const _importBookmarksBtn = document.getElementById('import-bookmarks-btn');
    const _deleteAllBookmarksBtn = document.getElementById('delete-all-bookmarks-btn');
    const _toggleBookmarksSortPanelBtn = document.getElementById('toggle-bookmarks-sort-panel-btn');
    const _toggleVisibilityControlsBtn = document.getElementById('toggle-visibility-controls-btn');
    const _groupListContainer = document.getElementById('groups-list');
    const _hiddenGroupsContainer = document.getElementById('hidden-groups-container');
    const _hiddenContextContainer = document.getElementById('hidden-context-container');

    const wasViewTogglePanelVisible = _viewTogglePanel && !_viewTogglePanel.classList.contains('hidden');

    const currentBookmarksActive = !get(isBookmarksViewActive);
    isBookmarksViewActive.set(currentBookmarksActive);
    _toggleBookmarksViewBtn.setAttribute('aria-pressed', String(currentBookmarksActive));

    geminiStore.closeView(true);
    closeNotesView(true);
    closeScreenshotGallery(true);
    closeUrlInPanel(true);
    if (typeof closeOverflowMenu === 'function') {
        closeOverflowMenu();
    }

    if (_visibilityControlsPanel) {
        _visibilityControlsPanel.classList.add('hidden');
    }
    if (_actionVisibilityControlsPanel) {
        _actionVisibilityControlsPanel.classList.add('hidden');
    }

    const bookmarksViewContainer = document.getElementById('bookmarks-view-container');

    if (_backupAllBtn) _backupAllBtn.classList.toggle('hidden', currentBookmarksActive);
    if (_restoreAllBtn) _restoreAllBtn.classList.toggle('hidden', currentBookmarksActive);
    if (_regroupBtn) _regroupBtn.classList.toggle('hidden', currentBookmarksActive);
    if (_exportBookmarksBtn) _exportBookmarksBtn.classList.toggle('hidden', !currentBookmarksActive);
    if (_importBookmarksBtn) _importBookmarksBtn.classList.toggle('hidden', !currentBookmarksActive);
    if (_deleteAllBookmarksBtn) _deleteAllBookmarksBtn.classList.toggle('hidden', !currentBookmarksActive);

    if (_toggleBookmarksSortPanelBtn) _toggleBookmarksSortPanelBtn.classList.toggle('hidden', !currentBookmarksActive);
    if (_toggleVisibilityControlsBtn) {
        _toggleVisibilityControlsBtn.classList.remove('hidden');
    }
    if (currentBookmarksActive) {
        if (_mainHeaderTitle) {
            _mainHeaderTitle.setAttribute('data-i18n', 'bookmarksViewTitle');
        }
        if (get(isRenderingBookmarks)) return;
        isRenderingBookmarks.set(true);

        try {
            if (_mainHeaderTitle) {
                _mainHeaderTitle.setAttribute('data-i18n', 'bookmarksViewTitle');
            }

            document.body.classList.remove('groups-view-active');
            document.body.classList.add('bookmarks-view-active');

            applyActionVisibility();

            _groupListContainer.style.display = 'none';
            _hiddenGroupsContainer.style.display = 'none';
            if (_hiddenContextContainer) _hiddenContextContainer.style.display = 'none';

            bookmarksViewContainer.style.display = 'flex';

            updateHeaderButtonsVisibility();
            applyTranslations();

            const bookmarksList = bookmarksViewContainer.querySelector('#bookmarks-list');
            if (bookmarksList) {
                const { bookmarkSortOrder = 'dateAdded' } = await chrome.storage.local.get('bookmarkSortOrder');
                currentBookmarkSort.set(bookmarkSortOrder);

                document.querySelectorAll('.sort-option-btn').forEach((btn) => {
                    btn.classList.toggle('active', btn.dataset.sortBy === get(currentBookmarkSort));
                });

                await initializeBookmarksView(
                    bookmarksList,
                    {
                        showNotification,
                        applyTranslations,
                        updateScrollButtons,
                        updateExpandAllButtonState,
                        createOverflowMenu,
                        showAddToRuleModal,
                        openAddToBookmarkModal,
                        openUrlInPanel,
                    },
                    get(currentBookmarkSort),
                    legacyState.viewExpandStates.bookmarks,
                );
            }

            updateDuplicateCountBadge();
            updateExpandAllButtonState();
        } finally {
            isRenderingBookmarks.set(false);
        }
    } else {
        if (_mainHeaderTitle) {
            _mainHeaderTitle.setAttribute('data-i18n', 'listTabGroups');
        }
        closeBookmarksView();
        document.body.classList.add('groups-view-active');
        document.body.classList.remove('bookmarks-view-active');

        applyActionVisibility();

        updateHeaderButtonsVisibility();
        applyTranslations();
    }

    if (wasViewTogglePanelVisible) {
        if (_viewTogglePanel) _viewTogglePanel.classList.remove('hidden');
    }

    updateScrollButtons();
}

export async function updateSplitButtonsUI() {
    await loadSplitScreenState();
    document.querySelectorAll('.split-screen-btn').forEach((btn) => {
        const tabItem = btn.closest('.tab-item');
        if (tabItem) {
            const tabId = parseInt(tabItem.dataset.tabId, 10);
            const isActive = legacyState.splitScreenState.isActive && legacyState.splitScreenState.splitTabs[tabId];
            btn.classList.toggle('active', !!isActive);
        }
    });
}

export function manageViewVisibility(activeViewSelector = '#groups-list') {
    const allViews = {
        '#groups-list': document.getElementById('groups-list'),
        '#hidden-groups-container': document.getElementById('hidden-groups-container'),
        '#hidden-context-container': document.getElementById('hidden-context-container'),
        '#gemini-conversation-view': document.getElementById('gemini-conversation-view'),
        '#bookmarks-view-container': document.getElementById('bookmarks-view-container'),
        '#history-view-container': document.getElementById('history-view-container'),
        '#recent-view-container': document.getElementById('recent-view-container'),
        '#reading-list-view-container': document.getElementById('reading-list-view-container'),
        '#downloads-view-container': document.getElementById('downloads-view-container'),
        '#notes-view': document.getElementById('notes-view'),
        '#screenshot-gallery-view': document.getElementById('screenshot-gallery-view'),
        '#side-panel-iframe-viewer': document.getElementById('side-panel-iframe-viewer'),
        '.reader-view': document.querySelector('.reader-view'),
        '.error-message-container': document.querySelector('.error-message-container'),
    };

    const _container = document.querySelector('.container');
    if (_container) {
        _container.classList.toggle('reader-mode-active', activeViewSelector === '.reader-view');
    }

    for (const selector in allViews) {
        if (allViews[selector]) {
            allViews[selector].style.display = 'none';
        }
    }

    const activeView = activeViewSelector ? allViews[activeViewSelector] : null;
    if (activeView) {
        activeView.style.display = 'block';
    }

    if (activeViewSelector === '#groups-list') {
        if (allViews['#groups-list']) allViews['#groups-list'].style.display = 'flex';
        if (allViews['#hidden-groups-container']) {
            allViews['#hidden-groups-container'].style.display = 'flex';
            allViews['#hidden-groups-container'].classList.toggle(
                'hidden',
                allViews['#hidden-groups-container'].childElementCount === 0,
            );
        }
        if (allViews['#hidden-context-container']) {
            allViews['#hidden-context-container'].style.display = 'flex';
            allViews['#hidden-context-container'].classList.toggle(
                'hidden',
                allViews['#hidden-context-container'].childElementCount === 0,
            );
        }
    }
}

/** Buttons whose visibility is decided by tab data, not by the active view. */
const DATA_DRIVEN_BUTTONS = new Set(['remove-duplicates-btn', 'mute-all-tabs-btn']);

/**
 * @param {string} viewName
 * @param {boolean} addToHistory
 * @param {{ skipHeaderButtons?: boolean }} [options] - `skipHeaderButtons` is for the
 *   boot, which renders the base view and then opens the assistant on top of it.
 *   Laying the header out for the base view first made the control bar show the group
 *   buttons for a couple of frames before swapping to the assistant's. The assistant's
 *   own showGeminiView() updates them straight after, so nothing is left stale.
 */
/**
 * Which header controls each main view uses.
 *
 * Lifted to module scope so the first render can lay the header out for the requested
 * view from the same source of truth the boot uses, instead of painting the group
 * shell and swapping it a few frames later.
 */
const viewConfig = {
    groups: [
        'toggle-bookmarks-view-btn',
        'view-history-btn',
        'view-recent-btn',
        'view-reading-list-btn',
        'view-downloads-btn',
        'backup-all-btn',
        'restore-all-btn',
        'toggle-visibility-controls-btn',
        'regroup-btn',
        'open-gemini-view-btn',
        'open-pomodoro-btn',
        'open-music-player-btn',
        'pin-toggle',
        'mute-all-tabs-btn',
        'remove-duplicates-btn',
        'expand-all-btn',
        'toggle-view-panel-btn',
        'delete-all-context-btn',
        'search-toggle-btn',
    ],
    bookmarks: [
        'view-groups-btn',
        'view-history-btn',
        'view-recent-btn',
        'view-reading-list-btn',
        'view-downloads-btn',
        'export-bookmarks-btn',
        'import-bookmarks-btn',
        'toggle-visibility-controls-btn',
        'toggle-bookmarks-sort-panel-btn',
        'delete-all-bookmarks-btn',
        'remove-duplicates-btn',
        'toggle-view-panel-btn',
        'expand-all-btn',
    ],
    history: [
        'view-groups-btn',
        'toggle-bookmarks-view-btn',
        'view-recent-btn',
        'view-reading-list-btn',
        'view-downloads-btn',
        'history-date-filter-btn',
        'delete-all-context-btn',
        'toggle-view-panel-btn',
        'expand-all-btn',
    ],
    recent: [
        'view-groups-btn',
        'toggle-bookmarks-view-btn',
        'view-history-btn',
        'view-reading-list-btn',
        'view-downloads-btn',
        'delete-all-context-btn',
        'toggle-view-panel-btn',
    ],
    reading: [
        'view-groups-btn',
        'toggle-bookmarks-view-btn',
        'view-history-btn',
        'view-recent-btn',
        'view-downloads-btn',
        'delete-all-context-btn',
        'toggle-view-panel-btn',
    ],
    downloads: [
        'view-groups-btn',
        'toggle-bookmarks-view-btn',
        'view-history-btn',
        'view-recent-btn',
        'view-reading-list-btn',
        'history-date-filter-btn',
        'downloads-filter-btn',
        'open-downloads-folder-btn',
        'delete-all-context-btn',
        'toggle-view-panel-btn',
        'expand-all-btn',
    ],
    /**
     * [AI INSTRUCTION]
     * THE THREE VIEWS PAINTED OVER THE GROUP LIST GET AN ENTRY TOO.
     *
     * They are not main views — `currentMainView` stays 'groups' while one is open —
     * but the page can be opened straight into any of them, and the toolbar has to be
     * right on the very first frame. Without an entry here the list fell back to the
     * group list's, so opening the notes from the popup painted the group toolbar and
     * swapped it for the notes' own a few frames later. That is the flash; the
     * assistant never had it because it had a hand-written list of its own, and this is
     * that list, generalised.
     *
     * These must agree with what `updateHeaderButtonsVisibility` settles on a moment
     * later, or the difference between the two *is* the flash. Which is why the notes
     * and the gallery do not list `search-toggle-btn`: `updateMainPanelButtons` takes
     * it away from both of them by name.
     *
     * Buttons that depend on data rather than on the view — whether there are any
     * screenshots to download, how many duplicates there are — belong in
     * `DATA_DRIVEN_CONTROLS`, not here: showing one and taking it back is the same
     * flash by another route.
     */
    notes: ['add-note-view-btn', 'delete-all-context-btn', 'expand-all-btn'],
    gallery: ['delete-all-context-btn'],
    gemini: ['search-toggle-btn', 'expand-all-btn', 'pin-toggle', 'add-api-key-btn', 'schedule-gemini-btn'],
};

const allButtonIds = [
    'view-groups-btn',
    'toggle-bookmarks-view-btn',
    'view-history-btn',
    'view-recent-btn',
    'view-reading-list-btn',
    'view-downloads-btn',
    'downloads-filter-btn',
    'open-downloads-folder-btn',
    'backup-all-btn',
    'restore-all-btn',
    'pin-toggle',
    'export-bookmarks-btn',
    'import-bookmarks-btn',
    'toggle-visibility-controls-btn',
    'history-date-filter-btn',
    'toggle-bookmarks-sort-panel-btn',
    'delete-all-bookmarks-btn',
    'regroup-btn',
    'open-gemini-view-btn',
    'mute-all-tabs-btn',
    'open-pomodoro-btn',
    'open-music-player-btn',
    'remove-duplicates-btn',
    'expand-all-btn',
    'toggle-view-panel-btn',
    'delete-all-context-btn',
    'search-toggle-btn',
];

/**
 * The controls that should start hidden for a given view.
 *
 * @param {string} view
 * @returns {Set<string>}
 */
export function hiddenControlsForView(view) {
    const visible = visibleControlsForView(view);
    return new Set(allButtonIds.filter((id) => !visible.has(id)));
}

/**
 * The controls a view shows, as a set.
 *
 * The complement of `hiddenControlsForView`, and the one to ask when the question is
 * about a control that is not in `allButtonIds` — the note button, the assistant's key
 * button. Those are hidden by default in the markup and revealed by name, so "is it in
 * this view's list" is the only thing that can answer for them.
 */
export function visibleControlsForView(view) {
    return new Set(viewConfig[view] || viewConfig.groups);
}

/**
 * @param {object} [options]
 * @param {boolean} [options.skipHeaderButtons] The caller is going to paint the header
 *   itself, so it is not worth doing twice.
 * @param {boolean} [options.skipReveal] Do the stores and the header, but neither put
 *   the view on screen nor name it. For the views that are painted *over* the group
 *   list — the notes, the gallery, the assistant: revealing the groups first and
 *   covering them a frame later is exactly the flash their callers are trying to
 *   avoid, and **the title is part of that**. Naming this "Listar Grupos" and letting
 *   the caller rename it a frame later is what was left of the flash once the list
 *   itself stopped appearing: the header read the wrong view for about 30ms, which is
 *   short enough to look like a glitch and long enough to see.
 */
export async function switchMainView(
    viewName,
    addToHistory = true,
    { skipHeaderButtons = false, skipReveal = false } = {},
) {
    const _mainHeaderTitle = document.getElementById('main-header-title');
    const _groupListContainer = document.getElementById('groups-list');
    const _visibilityControlsPanel = document.getElementById('visibility-controls-panel');
    const _actionVisibilityControlsPanel = document.getElementById('action-visibility-controls-panel');

    if (typeof closeOverflowMenu === 'function') {
        closeOverflowMenu();
    }

    const isTrulySpecialView =
        get(isGeminiViewActive) || get(isNotesViewActive) || get(isGalleryViewActive) || get(isUrlViewActive);
    if (get(currentMainView) === viewName && !isTrulySpecialView) return;

    isStandaloneGemini.set(false);

    if (_mainHeaderTitle && !skipReveal) {
        const titles = {
            groups: 'listTabGroups',
            bookmarks: 'bookmarksViewTitle',
            history: 'historyViewTitle',
            recent: 'recentlyClosedViewTitle',
            reading: 'readingListViewTitle',
            downloads: 'downloadsViewTitle',
            gemini: 'geminiViewTitle',
        };

        const i18nKey = titles[viewName] || 'listTabGroups';
        _mainHeaderTitle.setAttribute('data-i18n', i18nKey);
        applyTranslations(_mainHeaderTitle);
    }

    if (addToHistory) {
        navigationHistory.update((arr) => [...arr, get(currentMainView)]);
    }

    currentMainView.set(viewName);

    const views = {
        groups: document.getElementById('groups-list'),
        bookmarks: document.getElementById('bookmarks-view-container'),
        history: document.getElementById('history-view-container'),
        recent: document.getElementById('recent-view-container'),
        reading: document.getElementById('reading-list-view-container'),
        downloads: document.getElementById('downloads-view-container'),
    };

    geminiStore.closeView(true);
    closeNotesView(true);
    closeScreenshotGallery(true);
    closeUrlInPanel(true);

    Object.values(views).forEach((el) => {
        if (el) el.style.display = 'none';
    });

    const buttons = {
        groups: document.getElementById('view-groups-btn'),
        bookmarks: document.getElementById('toggle-bookmarks-view-btn'),
        history: document.getElementById('view-history-btn'),
        recent: document.getElementById('view-recent-btn'),
        reading: document.getElementById('view-reading-list-btn'),
        downloads: document.getElementById('view-downloads-btn'),
    };

    Object.values(buttons).forEach((btn) => {
        if (btn) {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
        }
    });

    if (views[viewName] && !skipReveal) views[viewName].style.display = 'flex';

    if (buttons[viewName]) {
        buttons[viewName].classList.add('active');
    }

    isBookmarksViewActive.set(viewName === 'bookmarks');

    /**
     * Not under `skipReveal`: the caller is about to paint one of the views that sit
     * *over* the group list, and claiming the group list here — for the one frame
     * before that view raises its own flag — is enough to do visible damage.
     * `body.groups-view-active` hides the search bar (see `listGroup.css`), so the bar
     * vanished and came back, and the `ResizeObserver` watching its width latched
     * "narrow" on the way through and painted the compact bar for another frame.
     *
     * `main.js` already sets this class from the URL before the first paint, so leaving
     * it alone here keeps what it got right.
     */
    if (skipReveal) {
        // Taken off rather than left alone: switching to the notes *from* the group
        // list would otherwise keep the class, and with it the group chrome the
        // stylesheet hangs off it — the pomodoro and music panels among other things,
        // which would sit there under the notes.
        document.body.classList.remove('groups-view-active', 'bookmarks-view-active');
    } else {
        document.body.classList.toggle('groups-view-active', viewName === 'groups');
        document.body.classList.toggle('bookmarks-view-active', viewName === 'bookmarks');
    }

    if (_visibilityControlsPanel) _visibilityControlsPanel.classList.add('hidden');
    if (_actionVisibilityControlsPanel) _actionVisibilityControlsPanel.classList.add('hidden');

    updateExpandAllButtonState();
    updateBackButtonTooltip();

    if (!skipHeaderButtons) updateHeaderButtonsVisibility();

    (async () => {
        if (
            skipReveal ||
            get(isGeminiViewActive) ||
            get(isNotesViewActive) ||
            get(isGalleryViewActive) ||
            get(isUrlViewActive)
        ) {
            return;
        }

        if (viewName === 'groups') {
            _groupListContainer.style.display = 'flex';
            if (document.getElementById('hidden-groups-container'))
                document.getElementById('hidden-groups-container').style.display = '';
            if (document.getElementById('hidden-context-container'))
                document.getElementById('hidden-context-container').style.display = '';
            applyActionVisibility();
            await renderGroups();
        } else {
            if (document.getElementById('hidden-groups-container'))
                document.getElementById('hidden-groups-container').style.display = 'none';
            if (document.getElementById('hidden-context-container'))
                document.getElementById('hidden-context-container').style.display = 'none';
            if (viewName === 'bookmarks') {
                const bookmarksList = document.getElementById('bookmarks-list');
                if (bookmarksList) {
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
                            createTabsInBatches,
                            openUrlInPanel,
                        },
                        get(currentBookmarkSort),
                        legacyState.viewExpandStates.bookmarks,
                    );
                }
                applyActionVisibility();
            } else if (viewName === 'history') {
                await renderHistoryView(get(currentHistoryDateFilter)?.start, get(currentHistoryDateFilter)?.end);
            } else if (viewName === 'recent') {
                await renderRecentlyClosedView();
            } else if (viewName === 'reading') {
                await renderReadingListView();
            } else if (viewName === 'downloads') {
                await renderDownloadsView();
            }

            if (_mainHeaderTitle) {
                const titleKeys = {
                    groups: 'listTabGroups',
                    bookmarks: 'bookmarksViewTitle',
                    history: 'historyViewTitle',
                    recent: 'recentlyClosedViewTitle',
                    reading: 'readingListViewTitle',
                    downloads: 'downloadsViewTitle',
                };
                const key = titleKeys[viewName] || 'listTabGroups';
                _mainHeaderTitle.setAttribute('data-i18n', key);
                applyTranslations(_mainHeaderTitle);
            }

            if (views[viewName]) {
                applyTranslations(views[viewName]);
            }
            updateScrollButtons();
            updateDuplicateCountBadge();
            const _rpu = ext('refreshPinUI');
            if (typeof _rpu === 'function') _rpu();
        }
    })();
}

export function openDeleteHistoryConfirmModal(dateLabel, urlsToDelete) {
    openModal(showDeleteHistoryConfirmModal, {
        dateLabel,
        urlsToDelete,
        onDeleted: () => {
            const successMsg = chrome.i18n.getMessage('historyDeletedSuccess') || 'History deleted';
            showNotification(successMsg, false, [urlsToDelete.length]);
            renderHistoryView(get(currentHistoryDateFilter)?.start, get(currentHistoryDateFilter)?.end);
        },
    });
}

export function updateMainPanelButtons(currentView) {
    const visibleIds = new Set(viewConfig[currentView] || []);

    const isTrulySpecialView =
        get(isGeminiViewActive) || get(isNotesViewActive) || get(isGalleryViewActive) || get(isUrlViewActive);

    allButtonIds.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) {
            const isAlwaysVisibleInSpecial = id === 'search-toggle-btn';

            let shouldHide = (isTrulySpecialView && !isAlwaysVisibleInSpecial) || !visibleIds.has(id);
            if (id === 'search-toggle-btn' && (get(isNotesViewActive) || get(isGalleryViewActive))) {
                shouldHide = true;
            }

            // The view only says whether a button applies at all. For these two,
            // whether it is actually shown depends on the tabs — the duplicate count
            // and whether anything is playing audio — and that answer arrives a moment
            // later. Hiding them here is safe; showing them is not, because it would
            // flash a button that the count then takes straight back.
            if (!shouldHide && DATA_DRIVEN_BUTTONS.has(id)) return;

            btn.classList.toggle('hidden', shouldHide);
        }
    });

    if (currentView === 'groups' && typeof updateMuteButtonState === 'function') {
        updateMuteButtonState();
    }

    const viewBtnMap = {
        groups: 'view-groups-btn',
        bookmarks: 'toggle-bookmarks-view-btn',
        history: 'view-history-btn',
        recent: 'view-recent-btn',
        reading: 'view-reading-list-btn',
        downloads: 'view-downloads-btn',
    };
    Object.entries(viewBtnMap).forEach(([view, btnId]) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.setAttribute('aria-pressed', view === currentView ? 'true' : 'false');
        }
    });
}

export async function renderHistoryView(startTime = null, endTime = null) {
    const _searchInput = document.getElementById('search-input');
    const searchTerm = _searchInput ? _searchInput.value : '';

    import('../stores/historyStore.js').then(({ historyStore }) => {
        historyStore.loadHistory(startTime, endTime, searchTerm);
    });
}

export async function renderDownloadsView() {
    const _searchInput = document.getElementById('search-input');
    const searchTerm = _searchInput ? _searchInput.value : '';

    import('../stores/downloadsStore.js').then(({ downloadsStore }) => {
        downloadsStore.loadDownloads(searchTerm);
    });
}

export function showNoHistoryMessage(container, dateFilter) {
    const el = document.getElementById('history-view-container');
    const target = container || (el ? el.querySelector('.list-content') : null);
    if (!target) return;
    const noMsg = document.createElement('p');
    noMsg.className = 'no-items-message';
    if (dateFilter) {
        const dateStr = new Date(dateFilter).toLocaleDateString();
        const msg = chrome.i18n.getMessage('noHistoryForDate', [dateStr]) || `No history for ${dateStr}`;
        noMsg.textContent = msg;
    } else {
        noMsg.textContent = chrome.i18n.getMessage('noHistoryFound') || 'No history found.';
    }
    target.appendChild(noMsg);
}

export async function renderRecentlyClosedView() {
    import('../stores/recentStore.js').then(({ recentStore }) => {
        recentStore.loadRecent();
    });
}

export async function renderReadingListView() {
    import('../stores/readingStore.js').then(({ readingStore }) => {
        readingStore.loadReadingList();
    });
}

export function initCustomCalendar() {
    const calendarPopup = document.getElementById('custom-calendar-popup');
    const monthYearEl = document.getElementById('cal-month-year');
    const gridEl = document.getElementById('calendar-days-grid');
    const prevBtn = document.getElementById('cal-prev-btn');
    const nextBtn = document.getElementById('cal-next-btn');
    const clearBtn = document.getElementById('cal-clear-btn');
    const toggleBtn = document.getElementById('history-date-filter-btn');

    if (!calendarPopup || !toggleBtn) return;
    if (toggleBtn.dataset.calendarBound === 'true') return;
    toggleBtn.dataset.calendarBound = 'true';

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = calendarPopup.classList.contains('hidden');

        if (isHidden) {
            calendarPopup.classList.remove('hidden');
            renderCalendar();
        } else {
            calendarPopup.classList.add('hidden');
        }
    });

    calendarPopup.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
        if (!calendarPopup.classList.contains('hidden')) {
            calendarPopup.classList.add('hidden');
        }
    });

    prevBtn.addEventListener('click', () => {
        calCurrentDate.update((d) => {
            const nd = new Date(d);
            nd.setMonth(nd.getMonth() - 1);
            return nd;
        });
        renderCalendar();
    });

    nextBtn.addEventListener('click', () => {
        calCurrentDate.update((d) => {
            const nd = new Date(d);
            nd.setMonth(nd.getMonth() + 1);
            return nd;
        });
        renderCalendar();
    });

    clearBtn.addEventListener('click', () => {
        calSelectedDate.set(null);
        currentHistoryDateFilter.set(null);
        downloadsDateFilter.set(null);
        toggleBtn.classList.remove('active');
        toggleBtn.removeAttribute('aria-pressed');
        calendarPopup.classList.add('hidden');
        if (get(currentMainView) === 'history') {
            renderHistoryView();
        }
    });

    function renderCalendar() {
        const d = get(calCurrentDate);
        const year = d.getFullYear();
        const month = d.getMonth();

        const monthNames = [
            chrome.i18n.getMessage('monthJanuary') || 'January',
            chrome.i18n.getMessage('monthFebruary') || 'February',
            chrome.i18n.getMessage('monthMarch') || 'March',
            chrome.i18n.getMessage('monthApril') || 'April',
            chrome.i18n.getMessage('monthMay') || 'May',
            chrome.i18n.getMessage('monthJune') || 'June',
            chrome.i18n.getMessage('monthJuly') || 'July',
            chrome.i18n.getMessage('monthAugust') || 'August',
            chrome.i18n.getMessage('monthSeptember') || 'September',
            chrome.i18n.getMessage('monthOctober') || 'October',
            chrome.i18n.getMessage('monthNovember') || 'November',
            chrome.i18n.getMessage('monthDecember') || 'December',
        ];
        const monthName = chrome.i18n.getMessage(`month${month + 1}`) || monthNames[month];
        monthYearEl.textContent = `${monthName} ${year}`;

        gridEl.innerHTML = '';

        const firstDayIndex = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const today = new Date();

        for (let i = 0; i < firstDayIndex; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day empty';
            gridEl.appendChild(emptyCell);
        }

        const mainView = get(currentMainView);
        let activeDateFilter = null;
        if (mainView === 'history') {
            activeDateFilter = get(currentHistoryDateFilter);
        } else if (mainView === 'downloads') {
            activeDateFilter = get(downloadsDateFilter);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = day;

            if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayEl.classList.add('today');
            }

            if (activeDateFilter && activeDateFilter.start) {
                const selD = new Date(activeDateFilter.start);
                if (day === selD.getDate() && month === selD.getMonth() && year === selD.getFullYear()) {
                    dayEl.classList.add('selected');
                }
            } else {
                const sel = get(calSelectedDate);
                if (sel && day === sel.getDate() && month === sel.getMonth() && year === sel.getFullYear()) {
                    dayEl.classList.add('selected');
                }
            }

            dayEl.addEventListener('click', () => {
                calSelectedDate.set(new Date(year, month, day));

                const startOfDay = new Date(year, month, day, 0, 0, 0, 0);
                const endOfDay = new Date(year, month, day, 23, 59, 59, 999);

                toggleBtn.classList.add('active');
                toggleBtn.setAttribute('aria-pressed', 'true');
                calendarPopup.classList.add('hidden');

                if (get(currentMainView) === 'history') {
                    currentHistoryDateFilter.set({
                        start: startOfDay.getTime(),
                        end: endOfDay.getTime(),
                    });
                    renderHistoryView(startOfDay.getTime(), endOfDay.getTime());
                } else if (get(currentMainView) === 'downloads') {
                    downloadsDateFilter.set({
                        start: startOfDay.getTime(),
                        end: endOfDay.getTime(),
                    });
                }
            });

            gridEl.appendChild(dayEl);
        }
    }
}

export function createGenericListItem(item, type) {
    const template = document.getElementById('generic-list-item-template');
    const el = template.content.cloneNode(true).firstElementChild;

    const favicon = el.querySelector('.favicon');
    let url = item.url;

    if (type === 'recent' && item.type === 'window' && item.tabs && item.tabs.length > 0) {
        url = item.tabs[0].url || '';
        el.classList.add('is-window-item');
    }
    if (url) {
        favicon.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=16`;
    } else {
        favicon.src = '../../../assets/icons/icon16.png';
    }
    const titleEl = el.querySelector('.item-title');
    const urlEl = el.querySelector('.item-url');
    const metaEl = el.querySelector('.item-meta');
    const deleteBtn = el.querySelector('.delete-item-btn');
    if (deleteBtn) {
        const tooltipMap = {
            history: 'deleteFromHistoryTooltip',
            recent: 'deleteFromRecentTooltip',
            reading: 'deleteFromReadingListTooltip',
        };
        if (tooltipMap[type]) {
            deleteBtn.setAttribute('data-i18n-title', tooltipMap[type]);
        }
    }
    if (type === 'recent' && item.type === 'window') {
        const tabCount = item.tabs ? item.tabs.length : 0;
        titleEl.textContent = `${chrome.i18n.getMessage('recentWindow') || 'Window'} (${tabCount} ${chrome.i18n.getMessage('recentTabs') || 'tabs'})`;
        urlEl.textContent = chrome.i18n.getMessage('recentRestoreWindow') || 'Restore full window';
    } else {
        titleEl.textContent = item.title || item.url || chrome.i18n.getMessage('untitled') || 'Untitled';
        urlEl.textContent = item.url || '';
    }
    let timestamp = 0;
    if (type === 'history') {
        timestamp = item.lastVisitTime;
    } else if (type === 'recent') {
        timestamp = item.lastModified > 1000000000000 ? item.lastModified : item.lastModified * 1000;
    }
    if (timestamp) {
        const dateObj = new Date(timestamp);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        metaEl.textContent = `${day}-${month}-${year} ${hours}:${minutes}`;
    } else if (type === 'reading') {
        metaEl.textContent = item.hasBeenRead ? 'Read' : 'Unread';
        if (!item.hasBeenRead) titleEl.style.fontWeight = 'bold';
    } else {
        metaEl.style.display = 'none';
    }
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        el.style.opacity = '0';
        el.style.transform = 'translateX(10px)';
        if (type === 'history') {
            await chrome.runtime.sendMessage({
                action: 'deleteHistoryUrls',
                urls: [item.url],
            });
        } else if (type === 'recent') {
        } else if (type === 'reading') {
        }
        setTimeout(() => el.remove(), 200);
    });
    el.addEventListener('mouseenter', () => {
        if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
            prefetchUrl(url);
        }
    });

    el.addEventListener('click', (e) => {
        if (e.target.closest('.delete-item-btn')) return;

        const isCtrlClick = e.ctrlKey || e.metaKey;
        const url = item.url;
        const isWebUrl = url && (url.startsWith('http:') || url.startsWith('https:'));

        if (get(isPopupWindow)) {
            e.preventDefault();
            if (isWebUrl) {
                openUrlInPanel(url);
            } else if (type === 'recent' && item.sessionId) {
                chrome.sessions.restore(item.sessionId);
                el.remove();
            } else {
                chrome.tabs.create({ url: url, active: true });
            }
            return;
        }

        if (isCtrlClick && isWebUrl) {
            e.preventDefault();
            openUrlInPanel(url);
            return;
        }

        if (type === 'history' || type === 'reading') {
            chrome.tabs.create({ url: url, active: true });
        } else if (type === 'recent') {
            if (item.sessionId) {
                chrome.sessions.restore(item.sessionId);
                el.remove();
            }
        }
    });
    return el;
}

export function handleIframeMessage(event) {
    const { type, payload } = event.data;

    if (type === 'iframe-search-result') {
        legacyState.lastIframeSearchResultCount = payload.count;
    }
}

export async function openUrlInPip(url, defaultWidth = 450, defaultHeight = 600, tabId = null, windowId = null) {
    if (tabId && windowId && !isNaN(tabId) && !isNaN(windowId)) {
        let originalWindowId = null;
        let originalTabId = null;
        try {
            const currWin = await chrome.windows.getCurrent();
            if (currWin) originalWindowId = currWin.id;
            const activeTabs = await chrome.tabs.query({ active: true, windowId: originalWindowId });
            if (activeTabs && activeTabs.length > 0) originalTabId = activeTabs[0].id;
        } catch (e) {
            console.warn('Could not record original window/tab focus:', e);
        }

        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'openPipWindow',
                        tabId: Number(tabId),
                        windowId: Number(windowId),
                        url: url,
                        width: defaultWidth,
                        height: defaultHeight,
                        originalTabId: originalTabId,
                        originalWindowId: originalWindowId,
                    },
                    resolve,
                );
            });
            if (response && response.success) {
                return true;
            }
        } catch (e) {
            console.warn('openPipWindow background call failed:', e);
        }
    }

    openUrlInPopup(url, defaultWidth, defaultHeight);
    return false;
}

export function openUrlInPopup(url, defaultWidth = 450, defaultHeight = 600) {
    const left = Math.round(window.screenX + (window.outerWidth - defaultWidth) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - defaultHeight) / 2);
    chrome.runtime.sendMessage({
        action: 'openPopupWindow',
        url: url,
        width: defaultWidth,
        height: defaultHeight,
        left: left,
        top: top,
    });
}

/**
 * Everything on this page that has to go away when a frame takes the panel over.
 */
const VIEWS_HIDDEN_BY_A_FRAME =
    '#hidden-groups-container, #hidden-context-container, #groups-list, #drag-announcer, #gemini-conversation-view, #notes-view, #screenshot-gallery-view, #bookmarks-view-container, #history-view-container, #recent-view-container, #reading-list-view-container, #downloads-view-container';

/**
 * A framed site behaves like a real tab only if it is allowed to do what a tab does:
 * open windows, download, show modals, ask for storage access. Trimming this list is
 * what leaves x.com or WhatsApp Web stuck on a blank shell.
 */
const WEB_VIEW_SANDBOX =
    'allow-scripts allow-same-origin allow-popups allow-forms allow-downloads allow-modals allow-storage-access-by-user-activation allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation';

const WEB_VIEW_ALLOW = [
    'fullscreen',
    'clipboard-read',
    'clipboard-write',
    'encrypted-media',
    'autoplay',
    'picture-in-picture',
    'camera',
    'microphone',
    'display-capture',
    'geolocation',
]
    .map((feature) => `${feature} *`)
    .join('; ');

/**
 * [AI NOTE] The payment frame gets a deliberately shorter list than the web view.
 *
 * No downloads, no modals, no top-level navigation, no camera — a donation form needs
 * none of them, and every one of them is something a payment page should not be able
 * to do to the panel. `allow-popups` stays because PayPal cannot complete a login in
 * a frame and has to open its own window; `allow-same-origin` stays because without it
 * the frame is an opaque origin and Stripe.js will not start.
 *
 * `payment` with no origin list is the shorthand for `payment 'src'`: the permission is
 * granted to the frame's own origin and is dropped the moment it navigates elsewhere.
 */
/**
 * The panel's framed viewer. Written out three times before this existed, which is how
 * the file view ended up without the styling the other two had.
 */
function createPanelIframe({ src, sandbox = null, allow = null, referrerPolicy = null }) {
    const iframe = document.createElement('iframe');
    iframe.id = 'side-panel-iframe-viewer';
    iframe.className = 'active-view';
    iframe.style.height = 'calc(100% - 55px)';
    iframe.style.width = '100%';
    iframe.style.border = 'none';
    if (sandbox) iframe.sandbox = sandbox;
    if (allow) iframe.allow = allow;
    if (referrerPolicy) iframe.referrerPolicy = referrerPolicy;
    iframe.src = src;
    return iframe;
}

/**
 * Puts the panel into the state a framed view sits on: every other view closed, the
 * group chrome hidden, the header renamed. Returns the container to append into.
 */
function enterFramedView(titleKey, context = null) {
    isUrlViewActive.set(true);
    currentPanelContext.set(context);
    geminiStore.closeView(true);
    if (!context || !context.fromNotes) {
        closeNotesView(true);
    } else {
        isNotesViewActive.set(false);
        listGroupStore.updateState({
            isNotesViewActive: false,
        });
    }
    closeScreenshotGallery();
    closeUrlInPanel(true);
    currentPanelContext.set(context);

    const mainHeaderTitle = document.getElementById('main-header-title');
    if (mainHeaderTitle) mainHeaderTitle.setAttribute('data-i18n', titleKey);

    const container = document.querySelector('.container');
    container.querySelectorAll(VIEWS_HIDDEN_BY_A_FRAME).forEach((el) => {
        if (el) el.style.display = 'none';
    });

    return { container, mainHeaderTitle };
}

/** Repaints the header chrome once the frame is on screen. */
function settleFramedView(mainHeaderTitle) {
    isUrlViewActive.set(true);
    updateHeaderButtonsVisibility();
    updateScrollButtons();
    updateBackButtonTooltip();
    applyTranslations(mainHeaderTitle);
}

export async function openUrlInPanel(url, context = null) {
    const isFileView =
        url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('file:') || (context && context.fromNotes);

    const { container, mainHeaderTitle } = enterFramedView(isFileView ? 'viewFilesTitle' : 'webViewTitle', context);
    currentPanelUrl.set(url);

    if (url.startsWith('data:') || url.startsWith('blob:')) {
        const iframe = createPanelIframe({ src: url });
        attachFrameScrollbar(iframe);
        container.appendChild(iframe);
        settleFramedView(mainHeaderTitle);
        return;
    }

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'prepareUrlForSidePanel',
            url: url,
        });

        if (response && response.success) {
            const iframe = createPanelIframe({
                src: url,
                sandbox: WEB_VIEW_SANDBOX,
                allow: WEB_VIEW_ALLOW,
                referrerPolicy: 'no-referrer',
            });
            // Before the frame is in the document, so the palette is already on offer
            // when the framed page announces itself.
            attachFrameScrollbar(iframe);
            container.appendChild(iframe);
            settleFramedView(mainHeaderTitle);
        } else {
            fetchContentForReaderView(url);
        }
    } catch {
        fetchContentForReaderView(url);
    }
}

/**
 * [AI INSTRUCTION]
 * WHAT THE PANEL SHOWS WHILE THE SHEET IS STILL ON ITS WAY.
 *
 * The frame is requested about 100 ms after the click and its markup lands about 300 ms
 * later; until then the panel was a rectangle of background colour with a title over it,
 * which reads as a page that failed rather than one that is loading. On a slow
 * connection it is much longer than that.
 *
 * So the panel draws the sheet's own shape first — a heading, the three amount chips,
 * the "other amount" field and the two buttons — in the panel's colours, and swaps it
 * for the real thing the moment the frame reports in. It is deliberately the same
 * layout: a skeleton that does not match what replaces it is a second layout shift, and
 * shifting the layout is the thing this is here to stop.
 *
 * The shimmer is `background-position`, which the compositor can run on its own, and it
 * is switched off under `prefers-reduced-motion` in the stylesheet.
 */
function createPaymentSkeleton() {
    const skeleton = document.createElement('div');
    skeleton.className = 'pay-skeleton';
    skeleton.setAttribute('role', 'status');
    skeleton.setAttribute('aria-label', chrome.i18n.getMessage('donationLoading') || 'Loading');
    skeleton.innerHTML = `
        <div class="pay-sk-line pay-sk-title"></div>
        <div class="pay-sk-line pay-sk-label"></div>
        <div class="pay-sk-chips">
            <div class="pay-sk-block"></div><div class="pay-sk-block"></div><div class="pay-sk-block"></div>
        </div>
        <div class="pay-sk-line pay-sk-label"></div>
        <div class="pay-sk-block pay-sk-field"></div>
        <div class="pay-sk-chips">
            <div class="pay-sk-block pay-sk-tall"></div><div class="pay-sk-block pay-sk-tall"></div>
        </div>
        <div class="pay-sk-line pay-sk-note"></div>`;
    return skeleton;
}

/**
 * [AI INSTRUCTION]
 * OPENS THE DONATION FORM IN THE PANEL.
 *
 * DO NOT route this through `prepareUrlForSidePanel`. That handler strips
 * X-Frame-Options and CSP so a hostile-to-framing site can be read in the panel; doing
 * it to a payment page is clickjacking and breaks the SCA redirect. The hosted page
 * grants us framing rights itself with `frame-ancestors`, and `handlers/dnr.js`
 * refuses payment hosts by name so this cannot be undone by accident.
 */
export async function openPaymentInPanel(provider) {
    const { container, mainHeaderTitle } = enterFramedView('donation');

    /*
     * The search row goes, and only here.
     *
     * `VIEWS_HIDDEN_BY_A_FRAME` deliberately leaves it alone, because the web view uses
     * it: typing there navigates the frame, and the tooltip says so. A donation sheet has
     * nothing to search and nothing to navigate, so the row was two dozen controls sitting
     * above a payment form doing nothing — the assistant toggle, the regex switch, the
     * pomodoro, the screenshot button. `closeUrlInPanel` puts it back.
     */
    const searchRow = container.querySelector('.search-and-controls');
    if (searchRow) searchRow.style.display = 'none';

    const nonce = mintPaymentNonce();
    const src = buildPaymentUrl(provider, { nonce });
    currentPanelUrl.set(src);

    const iframe = createPanelIframe({
        src,
        sandbox: PAYMENT_VIEW_SANDBOX,
        allow: PAYMENT_VIEW_ALLOW,
        referrerPolicy: 'no-referrer',
    });

    /*
     * The frame starts transparent and the skeleton sits under it, so there is no moment
     * where a half-painted sheet and a skeleton are both on screen. Two things take the
     * skeleton down, and whichever comes first wins:
     *
     *   - `pay:ready`, which is the sheet saying its elements are up. That is the honest
     *     signal and the one `attachPaymentBridge` was built to carry, but the hosted
     *     page does not send it on every route, so it cannot be the only one.
     *   - the frame's `load` event, which is the document having parsed — the point at
     *     which the sheet's own markup (heading, amounts, buttons) is on screen.
     *
     * And a deadline, because a skeleton that never goes away is worse than no skeleton:
     * if neither arrives the frame is revealed anyway, showing whatever it does have.
     */
    const skeleton = createPaymentSkeleton();
    iframe.classList.add('is-loading');

    let revealed = false;
    const reveal = () => {
        if (revealed) return;
        revealed = true;
        clearTimeout(revealTimer);
        iframe.classList.remove('is-loading');
        skeleton.remove();
    };
    const revealTimer = setTimeout(reveal, 8000);
    iframe.addEventListener('load', reveal, { once: true });

    /**
     * `showNotification` and not `notificationStore`: this page never mounts the
     * `<Notification />` component — it paints its own node into the document — so a
     * store write here would have gone nowhere. The popup and the about page are the
     * ones that use the store.
     */
    /**
     * [AI INSTRUCTION]
     * WHERE A FINISHED DONATION LEAVES THE READER — AND THE GROUP LIST IS NOT AN OPTION.
     *
     * DO NOT ADD A `closeUrlInPanel()` FALLBACK HERE. It used to have two, and both did
     * the same unwelcome thing: money leaves someone's account and the panel answers by
     * throwing them onto a list of tab groups. Nothing about that says the payment
     * worked, and it happens while the thank-you is still on screen.
     *
     * The rule is that this function only ever moves the panel when it can put the reader
     * back exactly where they came from — the popup, which `donationService` recorded as
     * `navSource`. Anything else and the panel stays on the donation view, which is by
     * then showing "thank you" and is the most informative thing it could be showing.
     * The way out is the back button, pressed on purpose, which is the only place a
     * decision to leave should be made.
     *
     * `delay` gives the thank-you notification time to be read before the page changes
     * under it.
     */
    const leaveDonation = async (delay = 0) => {
        if (get(standaloneOverlayView) !== 'payment') return;

        const { navSource } = await chrome.storage.local.get('navSource');
        if (!navSource) return;

        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        window.location.href = navSource;
    };

    /**
     * The hand-off window, so it can be closed when the payment it was opened for is done.
     *
     * The page cannot close itself: `window.close()` only works on a window a script
     * opened, and `chrome.windows.create` is not that. So the id is kept here and the
     * panel does it — which is also the only place that knows the payment finished, since
     * the window reports back through the sheet.
     */
    let handoffWindowId = null;

    const closeHandoffWindow = () => {
        if (handoffWindowId === null) return;
        const id = handoffWindowId;
        handoffWindowId = null;
        // Already gone if the reader closed it themselves; that is not an error.
        chrome.windows.remove(id).catch(() => {});
    };

    detachPaymentBridge = attachPaymentBridge(iframe, nonce, {
        onReady: reveal,
        onSuccess: ({ amount }) => {
            // Before the notification: the thank-you belongs in the panel, and a paid-for
            // window still sitting on screen behind it reads as something left undone.
            closeHandoffWindow();
            if (amount) showNotification('donationThanksAmount', false, [String(amount)]);
            else showNotification('donationThanks');
            void leaveDonation(1800);
        },
        onError: (message) => {
            // The frame's own wording when it gave one; ours when it did not.
            if (message) showNotification(message, true);
            else showNotification('donationFailed', true);
        },
        onClose: () => void leaveDonation(),
        onExternal: (url) => {
            /*
             * A WINDOW, AND THE PANEL STAYS PUT.
             *
             * Two kinds of payment come through here. PayPal, Klarna and Amazon Pay
             * authenticate on their own pages and refuse to be framed. Card and Revolut
             * Pay are not offered in the frame at all: Chrome judges a payment form's
             * security by the TOP-LEVEL document's scheme, the panel's is
             * `chrome-extension:`, and a card field framed under it is declared to be on
             * an insecure connection — see `config/payments.js`. Both end up in a window
             * whose own URL is https, where neither problem exists.
             *
             * A popup window rather than a tab: it is what a payment hand-off looks like
             * everywhere else, it keeps the reader's tabs as they were, and closing it
             * puts them back where they started.
             *
             * The panel is NOT closed. It used to be, which sent the reader to the group
             * list the moment they chose Revolut Pay — the sheet vanished mid-payment and
             * the panel showed something unrelated. It stays on the donation view while
             * they pay, and the back button still returns to the popup afterwards.
             */
            chrome.windows
                .create({ url, type: 'popup', width: 480, height: 720, focused: true })
                .then((created) => {
                    handoffWindowId = created?.id ?? null;
                })
                .catch(() => {});
        },
    });

    // The skeleton first, so it is already painted when the frame lands on top of it.
    container.appendChild(skeleton);
    container.appendChild(iframe);
    settleFramedView(mainHeaderTitle);
}

export async function fetchContentForReaderView(url) {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'fetchPageContent',
            url: url,
        });
        if (response.success) {
            showReaderView(response.content, url);
        } else {
            showErrorView(response.error, url);
        }
    } catch (e) {
        console.error('Error communicating with background script:', e);
        showErrorView(e.message);
    }
}

export function showReaderView(htmlContent, baseUrl) {
    const _container = document.querySelector('.container');
    const _mainHeaderTitle = document.getElementById('main-header-title');

    const existingActiveView = getTransientActiveView(_container);
    if (existingActiveView) {
        existingActiveView.remove();
    }

    if (_mainHeaderTitle) {
        _mainHeaderTitle.setAttribute('data-i18n', 'readerViewTitle');
    }

    const readerViewTemplate = document.getElementById('reader-view-template');
    const readerEl = readerViewTemplate.content.cloneNode(true).firstElementChild;

    readerEl.addEventListener('scroll', updateScrollButtons);

    readerEl.classList.add('active-view');
    const readerContentEl = readerEl.querySelector('.reader-content');
    const readerTitleEl = readerEl.querySelector('.reader-title');
    const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
    const videoId = extractYouTubeVideoId(doc);
    readerTitleEl.textContent = doc.querySelector('h1, title, h2')?.textContent || 'Content';
    const contentNode = doc.querySelector('article, main, .post-content, .entry-content, #content, #main') || doc.body;
    const cleanContent = contentNode.cloneNode(true);
    cleanContent.querySelectorAll('script, style, iframe, noscript, link, svg').forEach((el) => el.remove());

    cleanContent.querySelectorAll('a').forEach((a) => {
        try {
            const href = a.getAttribute('href');
            if (!href) {
                a.remove();
                return;
            }
            const absoluteUrl = new URL(href, baseUrl).href;
            a.href = absoluteUrl;
            a.removeAttribute('target');

            a.addEventListener('mouseenter', () => {
                if (a.href && (a.href.startsWith('http:') || a.href.startsWith('https:'))) {
                    prefetchUrl(a.href);
                }
            });

            a.addEventListener('click', (event) => {
                event.preventDefault();
                if (event.ctrlKey || event.metaKey) {
                    chrome.tabs.create({
                        url: a.href,
                        active: true,
                    });
                } else {
                    currentPanelUrl.set(a.href);
                    fetchContentForReaderView(a.href);
                }
            });
        } catch (e) {
            console.warn('Could not process link, it will be removed:', a.getAttribute('href'), e);
            a.remove();
        }
    });

    cleanContent.querySelectorAll('img').forEach((img) => {
        try {
            img.src = new URL(img.getAttribute('src'), baseUrl).href;
        } catch {}
    });
    readerContentEl.appendChild(cleanContent);
    if (videoId) {
        const videoEmbed = createYouTubeEmbed(videoId);
        readerContentEl.prepend(videoEmbed);
        readerEl.dataset.containsYoutube = 'true';
    }
    _container.appendChild(readerEl);
    isUrlViewActive.set(true);

    applyTranslations(_mainHeaderTitle);
    updateHeaderButtonsVisibility();
    updateScrollButtons();
    updateBackButtonTooltip();
}

export function showErrorView(errorMessage, url) {
    const _container = document.querySelector('.container');
    const _geminiConversationView = document.getElementById('gemini-conversation-view');
    const _geminiInputContainer = document.getElementById('gemini-input-container');
    const _geminiModelSelectorContainer = document.getElementById('gemini-model-selector-container');
    const _hiddenGroupsContainer = document.getElementById('hidden-groups-container');
    const _hiddenContextContainer = document.getElementById('hidden-context-container');

    isUrlViewActive.set(false);
    isGeminiViewActive.set(false);
    isNotesViewActive.set(false);
    isGalleryViewActive.set(false);

    const mainViews = [
        document.getElementById('groups-list'),
        document.getElementById('side-panel-iframe-viewer'),
        document.querySelector('.reader-view'),
        document.getElementById('notes-view'),
        document.getElementById('screenshot-gallery-view'),
    ];
    mainViews.forEach((view) => {
        if (view) view.style.display = 'none';
    });

    if (_geminiInputContainer) _geminiInputContainer.classList.add('hidden');
    if (_geminiModelSelectorContainer) _geminiModelSelectorContainer.classList.add('hidden');
    if (_hiddenGroupsContainer) _hiddenGroupsContainer.style.display = 'none';
    if (_hiddenContextContainer) _hiddenContextContainer.style.display = 'none';

    if (_geminiConversationView) {
        // The cards in this view are rendered by Svelte. Emptying it by hand detached
        // the nodes it keeps writing into, so after closing an error every later answer
        // was added to a view that no longer existed and nothing showed up. A class
        // hides the conversation while the error is up and leaves the DOM alone.
        _geminiConversationView.classList.add('showing-error');
        _geminiConversationView.style.display = 'block';
    }

    const existingActiveView = getTransientActiveView(_container);
    if (existingActiveView) {
        existingActiveView.remove();
    }

    const errorMessageTemplate = document.getElementById('error-message-template');
    const errorEl = errorMessageTemplate.content.cloneNode(true).firstElementChild;
    errorEl.classList.add('active-view');

    const closeErrorBtn = errorEl.querySelector('.close-error-btn');
    const closeError = () => {
        const errorView = _container.querySelector('.error-message-container.active-view');
        if (errorView) {
            errorView.remove();
        }
        _geminiConversationView?.classList.remove('showing-error');
        switchToGeminiView();
    };

    if (closeErrorBtn) {
        closeErrorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeError();
        });
    }

    errorEl.addEventListener('click', (e) => {
        if (!e.target.closest('a')) {
            closeError();
        }
    });

    const titleEl = errorEl.querySelector('h2');
    titleEl.setAttribute('data-i18n', 'errorLoadingPageTitle');

    const detailsEl = errorEl.querySelector('.error-details');
    const detailsLabel = chrome.i18n.getMessage('errorDetailsLabel') || 'Details:';

    const fullErrorMessageHtml = linkifyHtml(`${detailsLabel} ${errorMessage}`);

    detailsEl.innerHTML = fullErrorMessageHtml;

    errorEl.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.href) {
            e.preventDefault();
            e.stopPropagation();
            chrome.tabs.create({ url: link.href, active: true });
        }
    });

    if (_geminiConversationView) {
        _geminiConversationView.appendChild(errorEl);
    } else {
        _container.appendChild(errorEl);
    }

    isGeminiViewActive.set(true);

    updateHeaderButtonsVisibility();
    updateScrollButtons();
    applyTranslations(errorEl);
}

export async function closeUrlInPanel(isSwitchingView = false) {
    const _container = document.querySelector('.container');

    /*
     * Before the early return, so that switching straight from the donation sheet into
     * another framed view gets the row back: `enterFramedView` calls this with
     * `isSwitchingView`, and the next view hides again whatever it needs to.
     * `restoreMainView` does not touch this element, so nobody else would.
     */
    const searchRow = _container?.querySelector('.search-and-controls');
    if (searchRow) searchRow.style.display = '';

    isUrlViewActive.set(false);
    currentPanelUrl.set(null);
    previousIframeUrl.set(null);
    detachFrameScrollbar();
    detachPaymentBridge?.();
    detachPaymentBridge = null;
    // Not an `.active-view`, so `getTransientActiveView` below does not take it with the
    // frame. Left behind, it sits under whatever the panel shows next.
    _container?.querySelector('.pay-skeleton')?.remove();

    chrome.runtime.sendMessage(
        {
            action: 'cleanupSidePanelRules',
        },
        (response) => {
            if (chrome.runtime.lastError) {
                console.warn('Error sending cleanup message:', chrome.runtime.lastError.message);
            }
        },
    );

    discardYoutubeView();

    const activeView = getTransientActiveView(_container);
    if (activeView) activeView.remove();

    if (isSwitchingView) {
        return;
    }

    const context = get(currentPanelContext);
    const targetNotesContext = (context && context.noteContext) || get(currentNotesContext);
    if (context && context.fromNotes && targetNotesContext) {
        currentPanelContext.set(null);
        await showNotesView(targetNotesContext);
        return;
    }

    currentPanelContext.set(null);
    restoreMainView();
}

/**
 * Parks the player instead of closing it: the view is taken off screen and the bar of
 * hidden groups grows a circle that brings it back. Setting the store is all this has
 * to do about that circle — `HiddenGroupsBar.svelte` renders it from there.
 *
 * @param {HTMLElement} viewToHide
 */
export function hideYoutubeView(viewToHide) {
    const _container = document.querySelector('.container');
    const _mainHeaderTitle = document.getElementById('main-header-title');

    hiddenYoutubeView.set(viewToHide);
    viewToHide.style.display = 'none';
    viewToHide.classList.remove('active-view');

    _container
        .querySelectorAll('.search-and-controls, #hidden-groups-container, #groups-list, #drag-announcer')
        .forEach((el) => {
            el.style.display = '';
        });

    isUrlViewActive.set(false);

    if (_mainHeaderTitle) {
        _mainHeaderTitle.setAttribute('data-i18n', 'listTabGroups');
    }

    applyActionVisibility();

    updateHeaderButtonsVisibility();

    updateScrollButtons();
    updateBackButtonTooltip();
    updateDuplicateCountBadge();
    applyTranslations(_mainHeaderTitle);
}

/** Puts the parked player back on screen. */
export function restoreYoutubeView() {
    const hv = get(hiddenYoutubeView);
    if (!hv) return;

    const _container = document.querySelector('.container');

    _container
        .querySelectorAll(
            '.search-and-controls, #hidden-groups-container, #groups-list, #drag-announcer, #gemini-conversation-view',
        )
        .forEach((el) => {
            el.style.display = 'none';
        });

    hv.style.display = '';
    hv.classList.add('active-view');
    isUrlViewActive.set(true);
    hiddenYoutubeView.set(null);
}

/** Throws the parked player away: what the circle's delete badge does. */
export function discardYoutubeView() {
    const hv = get(hiddenYoutubeView);
    if (!hv) return;
    hv.remove();
    hiddenYoutubeView.set(null);
}

export function adjustScrollButtonsForGeminiView() {
    const _geminiInputContainer = document.getElementById('gemini-input-container');
    const _geminiModelSelectorContainer = document.getElementById('gemini-model-selector-container');
    const _geminiConversationView = document.getElementById('gemini-conversation-view');
    const _scrollButtons = document.getElementById('scroll-buttons');

    if (!_geminiInputContainer) return;

    if (get(isGeminiViewActive)) {
        const inputContainerHeight = _geminiInputContainer.offsetHeight || 52;
        if (_geminiModelSelectorContainer) {
            _geminiModelSelectorContainer.style.bottom = `${inputContainerHeight + 3}px`;
        }
        const modelSelectorHeight = _geminiModelSelectorContainer
            ? _geminiModelSelectorContainer.offsetHeight || 30
            : 0;
        if (_geminiConversationView) {
            _geminiConversationView.style.paddingBottom = `${inputContainerHeight + modelSelectorHeight + 15}px`;
        }
        if (_scrollButtons) {
            _scrollButtons.style.bottom = `${inputContainerHeight + modelSelectorHeight + 4}px`;
        }
    } else {
        if (_geminiModelSelectorContainer) _geminiModelSelectorContainer.style.bottom = '';
        if (_geminiConversationView) _geminiConversationView.style.paddingBottom = '';
        if (_scrollButtons) _scrollButtons.style.bottom = '';
    }
}

export function getActiveScrollableElement() {
    const _geminiConversationView = document.getElementById('gemini-conversation-view');
    const _groupListContainer = document.getElementById('groups-list');

    if (get(isBookmarksViewActive)) {
        return document.getElementById('bookmarks-view-container');
    }
    if (get(isNotesViewActive)) {
        return document.getElementById('notes-view');
    }
    if (get(isGalleryViewActive)) {
        return document.getElementById('screenshot-gallery-view');
    }
    if (get(isGeminiViewActive)) {
        return _geminiConversationView;
    } else if (get(isUrlViewActive)) {
        const readerView = document.querySelector('.reader-view.active-view');
        return readerView || null;
    } else {
        if (get(currentMainView) === 'bookmarks') return document.getElementById('bookmarks-view-container');
        if (get(currentMainView) === 'history') return document.getElementById('history-view-container');
        if (get(currentMainView) === 'recent') return document.getElementById('recent-view-container');
        if (get(currentMainView) === 'reading') return document.getElementById('reading-list-view-container');
        if (get(currentMainView) === 'downloads') return document.getElementById('downloads-view-container');
        return _groupListContainer;
    }
}

/**
 * The scroll buttons drive themselves from `ScrollButtons.svelte`, which the side
 * panel mounts with `getActiveScrollableElement` as its target. This is re-exported
 * so the callers all over the panel keep asking the same way.
 */
export { updateScrollButtons };

export async function updateBackButtonTooltip() {
    const _container = document.querySelector('.container');
    const _backButton = document.getElementById('main-back-btn');

    if (!_backButton) return;

    let tooltipKey = 'backToHome';

    const errorView = _container.querySelector('.error-message-container.active-view');
    if (errorView) {
        tooltipKey = get(isGeminiViewActive) ? 'backToGemini' : 'backToHome';
    } else if (get(isUrlViewActive)) {
        const panelCtx = get(currentPanelContext);
        tooltipKey = panelCtx && panelCtx.fromNotes ? 'backToNotes' : 'closeUrlPanel';
    } else if (get(isNotesViewActive)) {
        const viewToKeyMap = {
            groups: 'backToGroups',
            bookmarks: 'backToBookmarks',
            history: 'backToHistory',
            recent: 'backToRecent',
            reading: 'backToReading',
            downloads: 'backToDownloads',
        };
        tooltipKey = viewToKeyMap[get(currentMainView)] || 'backToGroups';
    } else if (get(isGalleryViewActive)) {
        tooltipKey = 'backToGroups';
    } else if (get(isGeminiViewActive)) {
        tooltipKey = 'backToGroups';
    } else {
        const nav = get(navigationHistory);
        if (nav.length > 0) {
            const previousView = nav[nav.length - 1];
            const viewToKeyMap = {
                groups: 'backToGroups',
                bookmarks: 'backToBookmarks',
                notes: 'backToNotes',
                gemini: 'backToGemini',
                history: 'backToHistory',
                recent: 'backToRecent',
                reading: 'backToReading',
                downloads: 'backToDownloads',
            };
            tooltipKey = viewToKeyMap[previousView] || 'backToHome';
        } else {
            try {
                const { navSource } = await chrome.storage.local.get('navSource');
                if (navSource && (navSource.includes('rules.html') || navSource.includes('returnTo=listGroup'))) {
                    tooltipKey = 'backToRules';
                } else {
                    tooltipKey = 'backToHome';
                }
            } catch {
                tooltipKey = 'backToHome';
            }
        }
    }

    _backButton.setAttribute('data-i18n-title', tooltipKey);
    applyTranslations(_backButton);
}

export function updateExpandAllButtonState() {
    const _expandAllBtn = document.getElementById('expand-all-btn');

    let activeContainer = null;
    let viewKey = 'groups';
    let tooltipPrefix = 'AllGroups';

    if (get(isGeminiViewActive)) {
        activeContainer = document.getElementById('gemini-conversation-view');
        viewKey = 'gemini';
        tooltipPrefix = 'AllGemini';
    } else if (get(isNotesViewActive)) {
        activeContainer = document.getElementById('notes-view');
        viewKey = 'notes';
        tooltipPrefix = 'AllNotes';
    } else {
        const containerMap = {
            groups: '#groups-list',
            bookmarks: '#bookmarks-list',
            history: '#history-view-container',
            recent: '#recent-view-container',
            reading: '#reading-list-view-container',
            downloads: '#downloads-view-container',
        };
        activeContainer = document.querySelector(containerMap[get(currentMainView)]);
        viewKey = get(currentMainView);

        const prefixMap = {
            groups: 'AllGroups',
            bookmarks: 'AllBookmarks',
            history: 'AllHistory',
            recent: 'AllRecent',
            reading: 'AllReading',
            downloads: 'AllDownloads',
        };
        tooltipPrefix = prefixMap[get(currentMainView)] || 'AllGroups';
    }

    if (!activeContainer) return;

    const expandableItems = Array.from(
        activeContainer.querySelectorAll('details, .group-item, .bookmark-folder'),
    ).filter((el) => {
        const style = getComputedStyle(el);
        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            (el.tagName === 'DETAILS' ||
                el.classList.contains('group-item') ||
                el.classList.contains('bookmark-folder'))
        );
    });

    let allAreExpanded = true;
    if (expandableItems.length > 0) {
        allAreExpanded = expandableItems.every((item) => item.open);
    }

    legacyState.viewExpandStates[viewKey] = allAreExpanded;

    const tooltipKey = (allAreExpanded ? 'collapse' : 'expand') + tooltipPrefix;
    _expandAllBtn.setAttribute('aria-pressed', String(allAreExpanded));
    _expandAllBtn.setAttribute('data-i18n-title', tooltipKey);
    applyTranslations(_expandAllBtn);
}

export function toggleExpandAll() {
    const _expandAllBtn = document.getElementById('expand-all-btn');

    let activeContainer = null;
    let viewKey = 'groups';

    if (get(isGeminiViewActive)) {
        activeContainer = document.getElementById('gemini-conversation-view');
        viewKey = 'gemini';
    } else if (get(isNotesViewActive)) {
        activeContainer = document.getElementById('notes-view');
        viewKey = 'notes';
    } else {
        const containerMap = {
            groups: '#groups-list',
            bookmarks: '#bookmarks-list',
            history: '#history-view-container',
            recent: '#recent-view-container',
            reading: '#reading-list-view-container',
            downloads: '#downloads-view-container',
        };
        activeContainer = document.querySelector(containerMap[get(currentMainView)]);
        viewKey = get(currentMainView);
    }

    if (!activeContainer) return;

    const currentIsExpanded = _expandAllBtn.getAttribute('aria-pressed') === 'true';
    const shouldExpand = !currentIsExpanded;

    const expandableItems = Array.from(
        activeContainer.querySelectorAll('details, .group-item, .bookmark-folder'),
    ).filter((el) => {
        const style = getComputedStyle(el);
        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            (el.tagName === 'DETAILS' ||
                el.classList.contains('group-item') ||
                el.classList.contains('bookmark-folder'))
        );
    });

    const groupUpdates = new Map();
    const subgroupUpdates = new Map();

    expandableItems.forEach((item) => {
        item.open = shouldExpand;

        if (viewKey === 'groups' && item.classList.contains('group-item')) {
            const groupId = item.dataset.groupId ? parseInt(item.dataset.groupId, 10) : NaN;
            if (!isNaN(groupId)) groupUpdates.set(groupId, shouldExpand);

            item.querySelectorAll('.domain-subgroup').forEach((detail) => {
                detail.open = shouldExpand;
                const domain = detail.querySelector('.domain-title')?.textContent;
                if (domain && !isNaN(groupId)) subgroupUpdates.set(`${groupId}_${domain}`, shouldExpand);
            });
        }
    });

    // Written through the stores rather than into the maps behind their backs: the
    // cards render from these, so a silent mutation left all but the first group
    // springing back open.
    if (groupUpdates.size > 0) {
        expandedGroupStates.update((states) => {
            for (const [id, value] of groupUpdates) states.set(id, value);
            return states;
        });
    }
    if (subgroupUpdates.size > 0) {
        expandedSubgroupStates.update((states) => {
            for (const [key, value] of subgroupUpdates) states.set(key, value);
            return states;
        });
    }

    updateExpandAllButtonState();
    updateScrollButtons();
}

/**
 * Whether the gallery on screen has anything in it.
 *
 * Only `showScreenshotGallery` can answer that — the list comes out of IndexedDB — and
 * it does, once, when it opens. Every other caller of the function below arrives with
 * no data at all: a view switch, a store subscription, the assistant's history landing.
 * Reading `contextualData` straight meant each of those answered "no" on the gallery's
 * behalf, and the download button appeared and then vanished a moment later. So the
 * answer is kept here for as long as the gallery is the view, and only the gallery ever
 * writes it.
 */
let _galleryHasScreenshots = false;

export function updateHeaderButtonsVisibility(contextualData = {}) {
    const _visibilityControlsPanel = document.getElementById('visibility-controls-panel');
    const _copyGeminiBtn = document.getElementById('copy-gemini-btn');
    const _readerViewBtn = document.getElementById('reader-view-btn');
    const _downloadAllScreenshotsBtn = document.getElementById('download-all-screenshots-btn');
    const _headerScreenshotBtn = document.getElementById('header-screenshot-btn');
    const _scheduleGeminiBtn = document.getElementById('schedule-gemini-btn');
    const _addNoteViewBtn = document.getElementById('add-note-view-btn');
    const _deleteAllContextBtn = document.getElementById('delete-all-context-btn');
    const _saveGeminiConversationBtn = document.getElementById('save-gemini-conversation-btn');
    const _persistentConversationControls = document.getElementById('persistent-conversation-controls');
    const _newGeminiConversationBtn = document.getElementById('new-gemini-conversation-btn');
    const _mainReadAloudBtn = document.querySelector('.controls-container .read-aloud-btn');
    const _downloadGeminiBtn = document.getElementById('download-gemini-btn');
    const _addApiKeyBtn = document.getElementById('add-api-key-btn');
    const _listGroupsBtn = document.getElementById('list-groups-btn');
    const _toggleViewPanelBtn = document.getElementById('toggle-view-panel-btn');
    const _expandAllBtn = document.getElementById('expand-all-btn');
    const _pinToggle = document.getElementById('pin-toggle');

    const isTrulySpecialView =
        get(isGeminiViewActive) || get(isNotesViewActive) || get(isGalleryViewActive) || get(isUrlViewActive);

    updateMainPanelButtons(get(currentMainView));

    const mainViewTogglePanel = document.getElementById('view-toggle-panel');

    if (mainViewTogglePanel && isTrulySpecialView) {
        mainViewTogglePanel.classList.add('hidden');
    }

    if (_visibilityControlsPanel && isTrulySpecialView) {
        _visibilityControlsPanel.classList.add('hidden');
    }

    const pomodoroPanel = document.getElementById('pomodoro-panel');
    if (pomodoroPanel) {
        const isReaderViewActive = !!document.querySelector('.reader-view.active-view');
        if (isTrulySpecialView || isReaderViewActive || get(currentMainView) !== 'groups') {
            pomodoroPanel.classList.add('hidden');
        } else {
            chrome.storage.local.get(['pomodoroPanelOpen'], (result) => {
                if (result.pomodoroPanelOpen) {
                    pomodoroPanel.classList.remove('hidden');
                }
            });
        }
    }

    const geminiConvHistory = get(conversationHistory);
    const gState = get(geminiStore);
    const hasGeminiHistory = geminiConvHistory && geminiConvHistory.length > 0;
    const hasPersistentConversations = gState.persistentConversations && gState.persistentConversations.length > 0;

    const allContextualButtons = [
        _copyGeminiBtn,
        _readerViewBtn,
        _downloadAllScreenshotsBtn,
        _headerScreenshotBtn,
        _scheduleGeminiBtn,
        _addNoteViewBtn,
        _deleteAllContextBtn,
        _saveGeminiConversationBtn,
        _persistentConversationControls,
        _newGeminiConversationBtn,
        _mainReadAloudBtn,
        _downloadGeminiBtn,
        _addApiKeyBtn,
    ];

    allContextualButtons.forEach((btn) => {
        if (btn) btn.classList.add('hidden');
    });
    if (_listGroupsBtn) {
        const shouldShowListGroups = isTrulySpecialView || get(currentMainView) !== 'groups';
        _listGroupsBtn.classList.toggle('hidden', !shouldShowListGroups);
    }
    if (_toggleViewPanelBtn) _toggleViewPanelBtn.classList.toggle('hidden', isTrulySpecialView);

    document.body.classList.toggle('notes-view-active', get(isNotesViewActive));
    document.body.classList.toggle('gallery-view-active', get(isGalleryViewActive));
    // Left the gallery: the next one that opens says for itself what it holds.
    if (!get(isGalleryViewActive)) _galleryHasScreenshots = false;

    if (get(isNotesViewActive)) {
        // The orphan list is a notes view like any other, so it keeps the button that
        // writes a note; what it has no group for is where to file it, and that is
        // resolved when the modal opens.
        if (_addNoteViewBtn) _addNoteViewBtn.classList.remove('hidden');
        if (_deleteAllContextBtn) {
            _deleteAllContextBtn.classList.remove('hidden');
            _deleteAllContextBtn.setAttribute('data-i18n-title', 'deleteAllNotes');
        }
        if (_expandAllBtn) _expandAllBtn.classList.remove('hidden');
    } else if (get(isGalleryViewActive)) {
        if (contextualData.screenshotsExistInGallery !== undefined) {
            _galleryHasScreenshots = !!contextualData.screenshotsExistInGallery;
        }
        if (_downloadAllScreenshotsBtn) _downloadAllScreenshotsBtn.classList.toggle('hidden', !_galleryHasScreenshots);
        if (_deleteAllContextBtn) {
            _deleteAllContextBtn.classList.remove('hidden');
            _deleteAllContextBtn.setAttribute('data-i18n-title', 'deleteAllScreenshots');
        }
    } else if (get(isUrlViewActive)) {
        const isReaderViewActive = !!document.querySelector('.reader-view.active-view');
        if (_readerViewBtn) _readerViewBtn.classList.toggle('hidden', isReaderViewActive);
        if (_headerScreenshotBtn) _headerScreenshotBtn.classList.toggle('hidden', isReaderViewActive);
    } else if (get(isGeminiViewActive)) {
        if (hasGeminiHistory) {
            if (_copyGeminiBtn) _copyGeminiBtn.classList.remove('hidden');
            if (_downloadGeminiBtn) _downloadGeminiBtn.classList.remove('hidden');
            if (_deleteAllContextBtn) {
                _deleteAllContextBtn.classList.remove('hidden');
                _deleteAllContextBtn.setAttribute('data-i18n-title', 'clearAllGeminiQueries');
            }
            if (_saveGeminiConversationBtn) _saveGeminiConversationBtn.classList.remove('hidden');
            if (_newGeminiConversationBtn) _newGeminiConversationBtn.classList.remove('hidden');
            if (_mainReadAloudBtn) _mainReadAloudBtn.classList.remove('hidden');
        } else {
            if (_addApiKeyBtn) _addApiKeyBtn.classList.remove('hidden');
        }
        if ((hasPersistentConversations || gState.sessionConversations.length > 0) && _persistentConversationControls) {
            _persistentConversationControls.classList.remove('hidden');
        }
        if (_scheduleGeminiBtn) _scheduleGeminiBtn.classList.remove('hidden');
        if (_pinToggle) _pinToggle.classList.remove('hidden');
        if (_expandAllBtn) _expandAllBtn.classList.remove('hidden');
    } else {
        updateDuplicateCountBadge();

        if (_deleteAllContextBtn) {
            const mainView = get(currentMainView);
            const viewsWithTrash = ['groups', 'history', 'recent', 'reading', 'downloads'];

            if (viewsWithTrash.includes(mainView)) {
                _deleteAllContextBtn.classList.remove('hidden');
                let i18nKey = 'deleteAll';
                if (mainView === 'groups') i18nKey = 'closeAllButActiveGroup';
                else if (mainView === 'history') i18nKey = 'clearAllHistory';
                else if (mainView === 'recent') i18nKey = 'clearRecentList';
                else if (mainView === 'reading') i18nKey = 'clearReadingList';
                else if (mainView === 'downloads') i18nKey = 'clearAllDownloads';

                _deleteAllContextBtn.setAttribute('data-i18n-title', i18nKey);
            }
        }

        const isGroupsView = get(currentMainView) === 'groups';

        const _hiddenContextContainer = document.getElementById('hidden-context-container');
        if (_hiddenContextContainer) {
            _hiddenContextContainer.style.display = isGroupsView ? 'flex' : 'none';
        }

        if (isGroupsView && _deleteAllContextBtn) {
            _deleteAllContextBtn.classList.remove('hidden');
            _deleteAllContextBtn.setAttribute('data-i18n-title', 'closeAllButActiveGroup');
        }

        const dateFilterBtn = document.getElementById('history-date-filter-btn');
        if (dateFilterBtn) {
            const isHistoryFiltered = get(currentMainView) === 'history' && get(currentHistoryDateFilter) !== null;
            const isDownloadsFiltered = get(currentMainView) === 'downloads' && get(downloadsDateFilter) !== null;
            if (isHistoryFiltered || isDownloadsFiltered) {
                dateFilterBtn.classList.add('active');
                dateFilterBtn.setAttribute('aria-pressed', 'true');
            } else {
                dateFilterBtn.classList.remove('active');
                dateFilterBtn.removeAttribute('aria-pressed');
            }
        }
    }
    applyTranslations(document.querySelector('.controls-container') || document.body);
}

export function initViewEvents() {
    const _viewGroupsBtn = document.getElementById('view-groups-btn');
    const _listGroupsBtn = document.getElementById('list-groups-btn');
    const _viewHistoryBtn = document.getElementById('view-history-btn');
    const _viewRecentBtn = document.getElementById('view-recent-btn');
    const _viewReadingListBtn = document.getElementById('view-reading-list-btn');
    const _viewDownloadsBtn = document.getElementById('view-downloads-btn');
    const _openDownloadsFolderBtn = document.getElementById('open-downloads-folder-btn');
    const _toggleBookmarksViewBtn = document.getElementById('toggle-bookmarks-view-btn');
    const _rulesToggle = document.getElementById('rules-toggle');
    const _homeBtn = document.getElementById('home-btn');
    const _backButton = document.getElementById('main-back-btn');
    const _readerViewBtn = document.getElementById('reader-view-btn');

    if (_viewGroupsBtn) _viewGroupsBtn.addEventListener('click', () => switchMainView('groups'));
    if (_listGroupsBtn) _listGroupsBtn.addEventListener('click', () => switchMainView('groups'));
    if (_viewHistoryBtn) {
        _viewHistoryBtn.addEventListener('click', () => switchMainView('history'));
        _viewHistoryBtn.addEventListener('mouseenter', () => prefetchData('history', true));
    }
    if (_viewRecentBtn) {
        _viewRecentBtn.addEventListener('click', () => switchMainView('recent'));
        _viewRecentBtn.addEventListener('mouseenter', () => prefetchData('recent', true));
    }
    if (_viewReadingListBtn) {
        _viewReadingListBtn.addEventListener('click', () => switchMainView('reading'));
        _viewReadingListBtn.addEventListener('mouseenter', () => prefetchData('reading', true));
    }
    if (_viewDownloadsBtn) {
        _viewDownloadsBtn.addEventListener('click', () => switchMainView('downloads'));
        _viewDownloadsBtn.addEventListener('mouseenter', () => prefetchData('downloads', true));
    }
    if (_openDownloadsFolderBtn) {
        _openDownloadsFolderBtn.addEventListener('click', () => {
            import('../stores/downloadsStore.js').then(({ downloadsStore }) => {
                downloadsStore.openDownloadsFolder();
            });
        });
    }
    if (_toggleBookmarksViewBtn) {
        _toggleBookmarksViewBtn.addEventListener('click', () => switchMainView('bookmarks'));
        _toggleBookmarksViewBtn.addEventListener('mouseenter', () => prefetchData('bookmarks', true));
    }

    initCustomCalendar();

    if (_rulesToggle) {
        _rulesToggle.addEventListener('mouseenter', () =>
            prefetchUrl(chrome.runtime.getURL('src/ui/pages/rules/rules.html')),
        );
        _rulesToggle.addEventListener('click', async () => {
            const currentPage = window.location.pathname.split('/').pop();
            await chrome.storage.local.set({
                navSource: `../listGroup/${currentPage}?view=${get(currentMainView)}`,
            });
            window.location.href = '../rules/rules.html?context=sidepanel&returnTo=listGroup';
            chrome.runtime.sendMessage({
                action: 'sidePanelPathUpdated',
                path: '../rules/rules.html',
            });
        });
    }

    if (_homeBtn) {
        _homeBtn.addEventListener('mouseenter', () =>
            prefetchUrl(chrome.runtime.getURL('src/ui/pages/popup/popup.html')),
        );
        _homeBtn.addEventListener('click', async () => {
            window.location.href = '../popup/popup.html?context=sidepanel';
            chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: '../popup/popup.html' });
        });
    }

    if (_backButton) {
        _backButton.addEventListener('mouseenter', () =>
            prefetchUrl(chrome.runtime.getURL('src/ui/pages/popup/popup.html')),
        );
    }

    const aboutLink = document.getElementById('about-link-list-group');
    if (aboutLink) {
        aboutLink.addEventListener('mouseenter', () =>
            prefetchUrl(chrome.runtime.getURL('src/ui/pages/about/about.html')),
        );
    }

    if (_readerViewBtn) {
        _readerViewBtn.addEventListener('click', async () => {
            if (get(isUrlViewActive) && get(currentPanelUrl)) {
                previousIframeUrl.set(get(currentPanelUrl));
                await fetchContentForReaderView(get(currentPanelUrl));
            }
        });
    }
}
