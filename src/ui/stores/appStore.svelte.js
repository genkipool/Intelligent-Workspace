import { writable, derived } from 'svelte/store';
import { SvelteMap, SvelteSet, SvelteDate } from 'svelte/reactivity';

// ─── View Management ─────────────────────────────────────────────
export const currentMainView = writable('groups');
export const isGeminiViewActive = writable(false);
export const isBookmarksViewActive = writable(false);
export const isUrlViewActive = writable(false);
export const isNotesViewActive = writable(false);
export const isGalleryViewActive = writable(false);
/**
 * [AI INSTRUCTION]
 * WHICH VIEW IS CLAIMING THE HEADER WHILE IT OPENS: 'notes' | 'gallery' | 'gemini' | null.
 *
 * The notes, the gallery and the assistant are painted *over* the group list, and
 * opening one is two steps: `switchMainView('groups')` puts the page in the state they
 * sit on, and then the view itself opens. Between those two the header had nothing to
 * go on but `currentMainView`, so it read "Listar Grupos" for about thirty
 * milliseconds — long enough to see, short enough to look like a glitch, and the whole
 * of what was left of the flash once the group list itself stopped appearing.
 *
 * Set before the first step and cleared once the view's own flag is up. The header
 * reads it first, so the handover is stated rather than left to how fast two awaits
 * happen to resolve.
 */
export const overlayViewOpening = writable(null);
/**
 * [AI INSTRUCTION]
 * WHETHER THE VIEW ON SCREEN IS THE ONE THE PAGE WAS OPENED INTO.
 *
 * The notes, the gallery and the assistant can all be reached two ways: by switching to
 * one while the page is already open, or by opening the page straight into it from the
 * popup or a keyboard command. Back means two different things in those two cases —
 * "the view I came from" and "the page I came from" — and taking the first for the
 * second is why opening the notes and pressing back landed on the group list, which
 * nobody had asked for.
 *
 * `isStandaloneGemini` is the assistant's own copy of this, kept because its store's
 * state carries it; this is the general one the back button reads.
 */
export const standaloneOverlayView = writable(null);
export const isStandaloneGemini = writable(false);
export const currentGalleryContext = writable(null);
export const currentNotesContext = writable(null);
export const hiddenYoutubeView = writable(null);
export const currentPanelUrl = writable(null);
export const currentPanelContext = writable(null);
export const previousIframeUrl = writable(null);
export const navigationHistory = writable([]);

// ─── Group State ──────────────────────────────────────────────────
export const expandedGroupStates = writable(new SvelteMap());
export const expandedSubgroupStates = writable(new SvelteMap());
export const isAllExpanded = writable(true);
export const pendingDeletionGroupIds = writable(new SvelteSet());
export const backedUpGroupData = writable({});
export const restoredGroupIds = writable(new SvelteSet());
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
export const calCurrentDate = writable(new SvelteDate());
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
export const persistentNoteIds = writable(new SvelteSet());
export const settings = writable({});

/**
 * The three switches of the search bar.
 *
 * They used to live only in the DOM as `aria-pressed`, which the toolbar re-rendered
 * back to its hard-coded defaults: leaving the page with the assistant search off and
 * coming back found it on again. The stored value now feeds the markup.
 */
export const searchToggles = writable({ gemini: false, web: true, regex: false });
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
