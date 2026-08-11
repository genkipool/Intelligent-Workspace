import { listGroupState } from './listGroupStore.js';
import { backedUpGroupData } from './appStore.svelte.js';
import { writable, derived, get } from 'svelte/store';
import { fetchData } from '../services/groupsService.js';

// Live groups, exactly as Chrome reports them.
const liveGroupsStore = writable([]);
export const ungroupedTabsStore = writable([]);

let listenersRegistered = false;
let refetchTimer = null;

// Keeps the store in sync with Chrome's real tab/group state. The background
// sometimes groups tabs without emitting refreshUI (for instance groupTabs() after
// a settings change while the isGrouping guard is on), so browser events are
// observed directly, debounced to coalesce bursts.
function scheduleRefetch() {
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
        refetchTimer = null;
        groupStore.fetchGroups();
    }, 250);
}

function registerChromeListeners() {
    if (listenersRegistered) return;
    listenersRegistered = true;

    chrome.tabGroups.onCreated.addListener(scheduleRefetch);
    chrome.tabGroups.onUpdated.addListener(scheduleRefetch);
    chrome.tabGroups.onRemoved.addListener(scheduleRefetch);
    chrome.tabGroups.onMoved.addListener(scheduleRefetch);
    chrome.tabs.onCreated.addListener(scheduleRefetch);
    chrome.tabs.onRemoved.addListener(scheduleRefetch);
    chrome.tabs.onMoved.addListener(scheduleRefetch);
    chrome.tabs.onAttached.addListener(scheduleRefetch);
    chrome.tabs.onDetached.addListener(scheduleRefetch);
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (
            changeInfo.groupId !== undefined ||
            changeInfo.url ||
            changeInfo.title ||
            changeInfo.pinned !== undefined ||
            changeInfo.status === 'complete'
        ) {
            scheduleRefetch();
        }
    });
}

/**
 * Applies the order the user set by dragging.
 *
 * fetchData() returns the groups in Chrome's own order; without this the list ignored
 * the saved arrangement, so a drag appeared to do nothing.
 *
 * @param {Array} groups
 * @returns {Array}
 */
function applyUserOrder(groups) {
    const order = get(listGroupState).userDefinedOrder;
    if (!Array.isArray(order) || order.length === 0) return groups;

    const position = new Map(order.map((id, index) => [id, index]));
    return [...groups].sort((a, b) => {
        const ai = position.has(a.group?.id) ? position.get(a.group.id) : Number.MAX_SAFE_INTEGER;
        const bi = position.has(b.group?.id) ? position.get(b.group.id) : Number.MAX_SAFE_INTEGER;
        return ai - bi;
    });
}

/**
 * Merges the backed-up groups into the live list.
 *
 * A backup keeps its own card in the list, at the position the group had when it was
 * put away, so it can be restored from there. They are only ever a view concern, which
 * is why they are added here rather than in fetchData().
 *
 * @param {Array} liveGroups
 * @param {Record<string, object>} backups
 * @returns {Array}
 */
function withBackups(liveGroups, backups) {
    const liveIds = new Set(liveGroups.map((item) => item.group?.id));
    const pending = Object.values(backups)
        .filter((data) => data?.group && !liveIds.has(data.group.id))
        .map((data) => ({ ...data, isBackup: true }))
        .sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity));

    if (pending.length === 0) return liveGroups;

    const merged = [...liveGroups];
    for (const backup of pending) {
        merged.splice(Math.min(backup.index ?? merged.length, merged.length), 0, backup);
    }
    return merged;
}

// The rendered list is the live groups plus the backed-up ones. Deriving it means a
// backup that is created, restored or read from the database reaches the list on its
// own, with no extra fetch and no chance of arriving before the list is first built.
export const groupsStore = derived([liveGroupsStore, backedUpGroupData], ([$live, $backups]) =>
    withBackups($live, $backups),
);

export const groupStore = {
    subscribe: groupsStore.subscribe,
    init: async () => {
        registerChromeListeners();
        await groupStore.fetchGroups();
    },
    fetchGroups: async () => {
        try {
            const result = await fetchData();
            if (Array.isArray(result)) {
                liveGroupsStore.set(applyUserOrder(result));
            }
        } catch (err) {
            console.error('[groupStore] fetch error:', err);
        }
    },
};
