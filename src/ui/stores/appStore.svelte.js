import { writable, derived } from 'svelte/store';

// ─── View Management ─────────────────────────────────────────────
export const currentMainView = writable('groups');
export const isGeminiViewActive = writable(false);
export const isBookmarksViewActive = writable(false);
export const isUrlViewActive = writable(false);
export const isNotesViewActive = writable(false);
export const isGalleryViewActive = writable(false);
export const isStandaloneGemini = writable(false);
export const currentGalleryContext = writable(null);
export const currentNotesContext = writable(null);
export const hiddenYoutubeView = writable(null);
export const currentPanelUrl = writable(null);
export const currentPanelContext = writable(null);
export const previousIframeUrl = writable(null);
export const navigationHistory = writable([]);

// ─── Group State ──────────────────────────────────────────────────
export const expandedGroupStates = writable(new Map());
export const expandedSubgroupStates = writable(new Map());
export const isAllExpanded = writable(true);
export const pendingDeletionGroupIds = writable(new Set());
export const backedUpGroupData = writable({});
export const restoredGroupIds = writable(new Set());
export const elementToFocusAfterRender = writable(null);
export const isPerformingProgrammaticUpdate = writable(false);

// ─── Search State ─────────────────────────────────────────────────
export const searchState = writable({ results: [], currentIndex: -1 });
export const lastSearchTerm = writable('');
export const lastIframeSearchResultCount = writable(0);

// ─── Notes Filters ────────────────────────────────────────────────
export const activeNoteFilters = writable({ cat: null, context: null, type: null, pomo: null });

// ─── UI State ────────────────────────────────────────────────────
export const currentColorPopup = writable(null);
export const currentDownloadModal = writable(null);
export const lastClickedIndicator = writable(null);
export const activeContextMenu = writable(null);
export const currentlyEditingInput = writable(null);
export const isRenderingBookmarks = writable(false);
export const isHandlingBookmarkChange = writable(false);
export const currentBookmarkSort = writable('dateAdded');
export const currentHistoryDateFilter = writable(null);
export const calCurrentDate = writable(new Date());
export const calSelectedDate = writable(null);
export const isPopupWindow = writable(false);
export const isProgrammaticActivation = writable(false);
export const geminiScheduleEditorState = writable({ mode: 'add', scheduleIndex: -1 });
export const prefetchCache = writable({ bookmarks: null, history: null, recent: null, reading: null });
export const historyRenderLimit = writable(150);
export const isRenderingHistory = writable(false);
export const lastHistoryParams = writable({ startTime: null, endTime: null, searchTerm: '' });

// ─── Text-to-Speech State ─────────────────────────────────────────
export const currentSpeechUtterance = writable(null);
export const currentlySpeakingEntryId = writable(null);
export const speechKeepAliveInterval = writable(null);
export const isSpeechPaused = writable(false);
export const isGlobalPlaybackActive = writable(false);
export const globalPlaybackChunks = writable([]);
export const currentGlobalChunkIndex = writable(0);

// ─── Derived / Computed ───────────────────────────────────────────
export const activeView = derived(
    [
        currentMainView,
        isGeminiViewActive,
        isBookmarksViewActive,
        isUrlViewActive,
        isNotesViewActive,
        isGalleryViewActive,
    ],
    ([
        $currentMainView,
        $isGeminiViewActive,
        $isBookmarksViewActive,
        $isUrlViewActive,
        $isNotesViewActive,
        $isGalleryViewActive,
    ]) => {
        if ($isGeminiViewActive) return 'gemini';
        if ($isBookmarksViewActive) return 'bookmarks';
        if ($isUrlViewActive) return 'url';
        if ($isNotesViewActive) return 'notes';
        if ($isGalleryViewActive) return 'gallery';
        return $currentMainView || 'groups';
    },
);

export const pinnedAtLastPositionId = writable(null);
// Defaults must not be empty: classList.toggle(class, undefined) would switch on
// every show-* class on the body.
export const visibilitySettings = writable({
    showGroupActions: false,
    showSubgroupActions: false,
    showTabActions: false,
    showDomainHeaders: false,
    showFolderActions: false,
    showChildFolders: true,
    showChildFolderActions: false,
    showBookmarkActions: false,
});
export const actionVisibilitySettings = writable({});
export const bookmarkActionVisibilitySettings = writable({});
// Defaults must not be empty: with {}, applySearchAndFilter would collapse every
// group (open = undefined).
export const viewExpandStates = writable({
    groups: true,
    bookmarks: true,
    gemini: true,
    notes: true,
});
export const persistentNoteIds = writable(new Set());
export const settings = writable({});
export const splitScreenState = writable({ isActive: false, splitTabs: {} });

export const isInputFocused = writable(false);

// ─── Reset helper ─────────────────────────────────────────────────
export function resetViewStates() {
    isGeminiViewActive.set(false);
    isBookmarksViewActive.set(false);
    isUrlViewActive.set(false);
    isNotesViewActive.set(false);
    isGalleryViewActive.set(false);
    isStandaloneGemini.set(false);
    currentGalleryContext.set(null);
    currentNotesContext.set(null);
    hiddenYoutubeView.set(null);
    currentPanelUrl.set(null);
    currentPanelContext.set(null);
}
