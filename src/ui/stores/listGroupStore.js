import { getStorageArea } from '../services/storage.js';
import { writable, get } from 'svelte/store';
import { STORAGE_KEYS } from '../services/constants.js';

export const listGroupState = writable({
    themeColors: {},
    currentColorPopup: null,
    currentDownloadModal: null,
    lastClickedIndicator: null,
    isPerformingProgrammaticUpdate: false,
    userDefinedOrder: [],
    renderedGroups: [],
    hiddenGroupsData: [],
    renderContext: {},
    pinnedGroupIds: new Set(),
    hiddenGroupIds: new Set(),
    pinnedAtLastPositionId: null,
    isUrlViewActive: false,
    isGeminiViewActive: false,
    isStandaloneGemini: false,
    isGalleryViewActive: false,
    currentGalleryContext: null,
    isNotesViewActive: false,
    currentNotesContext: null,
    expandedGroupStates: new Map(),
    expandedSubgroupStates: new Map(),
    expandedBookmarkFolderStates: new Map(),
    isInitialRender: true,
    hiddenYoutubeView: null,
    splitScreenState: {},
    currentPanelUrl: null,
    currentPanelContext: null,
    previousIframeUrl: null,
    settings: {},
    elementToFocusAfterRender: null,
    searchState: { results: [], currentIndex: -1 },
    lastSearchTerm: '',
    conversationHistory: [],
    currentSpeechUtterance: null,
    currentlySpeakingEntryId: null,
    speechKeepAliveInterval: null,
    isSpeechPaused: false,
    pendingDeletionGroupIds: new Set(),
    activeNoteFilters: { cat: null, context: null, type: null, pomo: null },
    lastIframeSearchResultCount: 0,
    persistentNoteIds: new Set(),
    availableGeminiModels: [],
    selectedGeminiModel: 'gemini-2.5-flash',
    agentModeEnabled: false,
    agentConversationContents: [],
    pendingAttachments: [],
    persistentConversations: [],
    combinedConversations: [],
    currentCombinedIndex: -1,
    sessionConversations: [],
    currentSessionConversationIndex: -1,
    geminiModelDropdown: null,
    isGlobalPlaybackActive: false,
    globalPlaybackChunks: [],
    currentGlobalChunkIndex: 0,
    isBookmarksViewActive: false,
    isPopupWindow: false,
    activeContextMenu: null,
    backedUpGroupData: {},
    restoredGroupIds: new Set(),
    currentlyEditingInput: null,
    currentBookmarkSort: 'dateAdded',
    isAllExpanded: true,
    isRenderingBookmarks: false,
    isHandlingBookmarkChange: false,
    currentHistoryDateFilter: null,
    bookmarkActionVisibilitySettings: {},
    calCurrentDate: new Date(),
    calSelectedDate: null,
    navigationHistory: [],
    currentMainView: 'groups', // 'groups', 'bookmarks', 'history', etc
    viewExpandStates: {
        groups: true,
        bookmarks: true,
        gemini: true,
        notes: true,
    },
    visibilitySettings: {
        showGroupActions: false,
        showSubgroupActions: false,
        showTabActions: false,
        showDomainHeaders: false,
        showFolderActions: false,
        showChildFolders: true,
        showChildFolderActions: false,
        showBookmarkActions: false,
    },
    actionVisibilitySettings: {},
    isProgrammaticActivation: false,
    geminiScheduleEditorState: {
        mode: 'add',
        scheduleIndex: -1,
    },
    prefetchCache: {
        bookmarks: null,
        history: null,
        recent: null,
        reading: null,
    },
    historyRenderLimit: 150,
    isRenderingHistory: false,
    lastHistoryParams: { startTime: null, endTime: null, searchTerm: '' },
});

let initPromise = null;

/** Writes the ordering keys to whichever area holds the rules, as loadState() reads. */
async function persistOrder(items) {
    const storage = await getStorageArea('ruleStorageArea');
    await storage.set(items);
}

export const listGroupStore = {
    subscribe: listGroupState.subscribe,
    updateState: (updates) => {
        listGroupState.update((state) => ({ ...state, ...updates }));
    },
    // Started from the page entry point so its storage round-trip overlaps mounting,
    // and awaited again on mount; caching the promise keeps that a single load.
    init: () => (initPromise ??= listGroupStore._load()),

    _load: async () => {
        // Load settings from storage
        const keys = [
            STORAGE_KEYS.ORDER,
            STORAGE_KEYS.PINS,
            STORAGE_KEYS.HIDDEN,
            STORAGE_KEYS.SETTINGS,
            STORAGE_KEYS.PINNED_AT_LAST,
            STORAGE_KEYS.API_KEY,
            STORAGE_KEYS.SPLIT_SCREEN,
            STORAGE_KEYS.VISIBILITY,
            STORAGE_KEYS.ACTION_VISIBILITY,
            STORAGE_KEYS.BOOKMARK_ACTION_VISIBILITY,
        ];

        const data = await chrome.storage.local.get(keys);

        listGroupStore.updateState({
            userDefinedOrder: data[STORAGE_KEYS.ORDER] || [],
            pinnedGroupIds: new Set(data[STORAGE_KEYS.PINS] || []),
            hiddenGroupIds: new Set(data[STORAGE_KEYS.HIDDEN] || []),
            settings: data[STORAGE_KEYS.SETTINGS] || {},
            pinnedAtLastPositionId: data[STORAGE_KEYS.PINNED_AT_LAST] || null,
            splitScreenState: data[STORAGE_KEYS.SPLIT_SCREEN] || {},
            visibilitySettings: { ...listGroupState.visibilitySettings, ...(data[STORAGE_KEYS.VISIBILITY] || {}) },
            actionVisibilitySettings: data[STORAGE_KEYS.ACTION_VISIBILITY] || {},
            bookmarkActionVisibilitySettings: data[STORAGE_KEYS.BOOKMARK_ACTION_VISIBILITY] || {},
        });
    },
    actions: {
        togglePinState: async (groupId) => {
            listGroupState.update((state) => {
                const numericId = parseInt(groupId, 10);
                if (state.pinnedGroupIds.has(numericId)) {
                    state.pinnedGroupIds.delete(numericId);
                    if (state.pinnedAtLastPositionId === numericId) {
                        state.pinnedAtLastPositionId = null;
                    }
                    state.userDefinedOrder = state.userDefinedOrder.filter((id) => id !== numericId);
                    if (state.pinnedGroupIds.size === 0) {
                        state.userDefinedOrder = [];
                        state.pinnedAtLastPositionId = null;
                    }
                } else {
                    state.pinnedGroupIds.add(numericId);
                }

                // Save to storage
                chrome.storage.local.set({
                    [STORAGE_KEYS.PINS]: Array.from(state.pinnedGroupIds),
                    [STORAGE_KEYS.ORDER]: state.userDefinedOrder,
                    [STORAGE_KEYS.PINNED_AT_LAST]: state.pinnedAtLastPositionId,
                });

                return state;
            });

            // The order the cards are laid out in is decided when the groups are
            // fetched, so pinning (or letting a card go) only moves it once the list
            // is rebuilt — without this an unpinned card kept the pinned slot.
            const { groupStore } = await import('./groupStore.js');
            await groupStore.fetchGroups();
        },
        reorderGroup: async (draggedGroupId, targetId, isOverTop) => {
            listGroupState.update((state) => {
                const numericDraggedId = parseInt(draggedGroupId, 10);
                const numericTargetId = parseInt(targetId, 10);

                let currentOrder = [...state.userDefinedOrder];
                if (currentOrder.length === 0) {
                    // `renderedGroups` belongs to the old imperative renderer and is
                    // always empty here, which left the new order holding a single id.
                    // The cards on screen are the order to start from, and reading them
                    // avoids importing the group store back into this one.
                    currentOrder = [...document.querySelectorAll('#groups-list .group-item')]
                        .map((el) => Number.parseInt(el.dataset.groupId, 10))
                        .filter((id) => Number.isFinite(id));
                }

                currentOrder = currentOrder.filter((id) => id !== numericDraggedId);
                const targetIndex = currentOrder.indexOf(numericTargetId);

                if (targetIndex !== -1) {
                    if (isOverTop) {
                        currentOrder.splice(targetIndex, 0, numericDraggedId);
                    } else {
                        currentOrder.splice(targetIndex + 1, 0, numericDraggedId);
                    }
                } else {
                    currentOrder.push(numericDraggedId);
                }

                state.userDefinedOrder = currentOrder;
                state.pinnedGroupIds.add(numericDraggedId);

                if (currentOrder.length > 0) {
                    const lastId = currentOrder[currentOrder.length - 1];
                    state.pinnedAtLastPositionId = state.pinnedGroupIds.has(lastId) ? lastId : null;
                } else {
                    state.pinnedAtLastPositionId = null;
                }

                // loadState() reads these from the configured rule area (sync by
                // default); writing them to local meant the order was never read back.
                return state;
            });

            // Persisted outside the update: the write is asynchronous and a rejection
            // inside a store updater is swallowed, which is why the order was never
            // saved even though the list had already moved.
            const snapshot = get(listGroupState);
            try {
                await persistOrder({
                    [STORAGE_KEYS.ORDER]: snapshot.userDefinedOrder,
                    [STORAGE_KEYS.PINS]: Array.from(snapshot.pinnedGroupIds),
                    [STORAGE_KEYS.PINNED_AT_LAST]: snapshot.pinnedAtLastPositionId,
                });
            } catch (err) {
                console.error('[listGroupStore] could not save the group order:', err);
            }

            // The visible list is rebuilt from the group store; ask for a refresh.
            const { groupStore } = await import('./groupStore.js');
            await groupStore.fetchGroups();
        },
        hideGroup: async (groupId) => {
            const numericId = parseInt(groupId, 10);
            listGroupState.update((state) => {
                const nextHidden = new Set(state.hiddenGroupIds);
                nextHidden.add(numericId);
                return { ...state, hiddenGroupIds: nextHidden };
            });
            const snapshot = get(listGroupState);
            const hiddenArray = Array.from(snapshot.hiddenGroupIds);
            chrome.storage.local.set({ [STORAGE_KEYS.HIDDEN]: hiddenArray });
            try {
                await persistOrder({ [STORAGE_KEYS.HIDDEN]: hiddenArray });
            } catch (err) {
                console.error('[listGroupStore] could not persist hidden groups:', err);
            }
            try {
                const { hiddenGroupIds } = await import('../services/groupsService.js');
                hiddenGroupIds.set(snapshot.hiddenGroupIds);
            } catch (e) {}
        },
        unhideGroup: async (groupId) => {
            const numericId = parseInt(groupId, 10);
            listGroupState.update((state) => {
                const nextHidden = new Set(state.hiddenGroupIds);
                nextHidden.delete(numericId);
                return { ...state, hiddenGroupIds: nextHidden };
            });
            const snapshot = get(listGroupState);
            const hiddenArray = Array.from(snapshot.hiddenGroupIds);
            chrome.storage.local.set({ [STORAGE_KEYS.HIDDEN]: hiddenArray });
            try {
                await persistOrder({ [STORAGE_KEYS.HIDDEN]: hiddenArray });
            } catch (err) {
                console.error('[listGroupStore] could not persist hidden groups:', err);
            }
            try {
                const { hiddenGroupIds } = await import('../services/groupsService.js');
                hiddenGroupIds.set(snapshot.hiddenGroupIds);
            } catch (e) {}
        },
        deleteAllTabsInGroup: async (groupId, tabs) => {
            if (!tabs) return;
            const tabIds = tabs.map((t) => t.id);
            if (tabIds.length > 0) {
                await chrome.tabs.remove(tabIds);
            }
        },
        deleteAllTabsInSubgroup: async (tabs) => {
            if (!tabs) return;
            const tabIds = tabs.map((t) => t.id);
            if (tabIds.length > 0) {
                await chrome.tabs.remove(tabIds);
            }
        },
        deleteAllUngroupedTabs: async (tabs) => {
            if (!tabs) return;
            const tabIds = tabs.map((t) => t.id);
            if (tabIds.length > 0) {
                await chrome.tabs.remove(tabIds);
            }
        },
        handleTabActivation: async (tab) => {
            try {
                if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
                await chrome.tabs.update(tab.id, { active: true });
            } catch (err) {
                console.error('Failed to activate tab:', err);
            }
        },
    },
};
