import { tick } from 'svelte';
import { listGroupState } from './listGroupStore.js';
import { backedUpGroupData } from './appStore.svelte.js';
import { writable, derived, get } from 'svelte/store';
import { fetchData } from '../services/groupsService.js';
import { linkedGroupIds } from '../services/utils.js';

/**
 * The search filter hides cards by adding a class to them by hand, and rebuilding the
 * list throws those classes away. Every refresh therefore has to run the filter again,
 * or an open search silently turns itself off as soon as a tab changes.
 */
async function reapplyActiveSearch() {
    const input = document.getElementById('search-input');
    if (!input || !input.value) return;
    const [{ tick }, { applySearchAndFilter }] = await Promise.all([
        import('svelte'),
        import('../services/searchService.js'),
    ]);
    await tick();
    applySearchAndFilter();
}

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
    // Which tab is the active one is part of what the list draws, and it is what the
    // scroll follows.
    chrome.tabs.onActivated.addListener(scheduleRefetch);
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
 * put away, so it can be restored from there. The card lists the tabs already brought
 * back — real tabs again, at full opacity — followed by the ones still stored. They are
 * only ever a view concern, which is why they are added here rather than in fetchData().
 *
 * @param {Array} liveGroups
 * @param {Record<string, object>} backups
 * @returns {Array}
 */
function withBackups(liveGroups, backups) {
    const stored = Object.values(backups || {}).filter((data) => data?.group);
    if (stored.length === 0) return liveGroups;

    const liveById = new Map(liveGroups.map((item) => [item.group?.id, item]));
    const linked = linkedGroupIds(backups);
    const merged = liveGroups.filter((item) => !linked.has(item.group?.id));

    const pending = stored
        .filter((data) => !liveById.has(data.group.id))
        .map((data) => {
            const liveTabs = liveById.get(data.linkedGroupId)?.tabs ?? [];
            return { ...data, isBackup: true, liveTabs, rows: backupRows(data, liveTabs) };
        })
        .sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity));

    for (const backup of pending) {
        merged.splice(Math.min(backup.index ?? merged.length, merged.length), 0, backup);
    }
    return merged;
}

/**
 * The rows of a backup card, in the order the group had when it was put away.
 *
 * A tab that is brought back keeps its row and its key: it only stops being dimmed.
 * Rebuilding the list around it would unmount the row and mount another one, which is
 * seen as a blink.
 *
 * @param {object} data - The stored backup.
 * @param {Array} liveTabs - Tabs of the group holding what has been restored.
 * @returns {Array<{ tab: object, isBackup: boolean, key: string }>}
 */
function backupRows(data, liveTabs) {
    const stillStored = new Map();
    for (const tab of data.tabs) {
        if (!stillStored.has(tab.url)) stillStored.set(tab.url, []);
        stillStored.get(tab.url).push(tab);
    }
    const live = new Map();
    for (const tab of liveTabs) {
        if (!live.has(tab.url)) live.set(tab.url, []);
        live.get(tab.url).push(tab);
    }

    // Backups stored before the order was recorded fall back to their current contents.
    const order = Array.isArray(data.order)
        ? data.order
        : [...liveTabs.map((t) => t.url), ...data.tabs.map((t) => t.url)];

    const rows = order.map((url, index) => {
        const restored = live.get(url)?.shift();
        if (restored) return { tab: restored, isBackup: false, key: `${index}-${url}` };
        const backedUp = stillStored.get(url)?.shift();
        return backedUp ? { tab: backedUp, isBackup: true, key: `${index}-${url}` } : null;
    });

    // Anything else the linked group holds: tabs opened there after the restore.
    const extra = [...live.values()].flat().map((tab) => ({ tab, isBackup: false, key: `viva-${tab.id}` }));
    return [...rows.filter(Boolean), ...extra];
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
    /**
     * Puts a tab just restored from a backup into its group, without waiting for the
     * refetch that the browser event will trigger. The row on the card then stops being
     * dimmed in the same update that removes it from the backup, instead of vanishing
     * for a moment and coming back.
     */
    adoptRestoredTab: (group, tab) => {
        liveGroupsStore.update((groups) => {
            const index = groups.findIndex((item) => item.group?.id === group.id);
            if (index === -1) return [...groups, { group, tabs: [tab] }];
            const item = groups[index];
            if (item.tabs.some((t) => t.id === tab.id)) return groups;
            const next = [...groups];
            next[index] = { ...item, tabs: [...item.tabs, tab] };
            return next;
        });
    },
    fetchGroups: async () => {
        try {
            const result = await fetchData();
            if (Array.isArray(result)) {
                // Deleting a group leaves its notes and screenshots without a home, and
                // the indicators at the top are how they are reached; re-creating the
                // group takes them back. The original refreshed them on every render.
                const { updateOrphanIndicators, syncContentSessionKeys } = await import('../services/notesService.js');
                // A group that comes back has a new numeric id; its notes and images are
                // filed under the old one until this re-files them, which is what makes
                // them show up on the card again instead of staying up top as orphans.
                // It runs before the cards are drawn, because the notes and gallery
                // buttons on them are built from that same index.
                await syncContentSessionKeys();
                liveGroupsStore.set(applyUserOrder(result));
                await reapplyActiveSearch();
                await updateOrphanIndicators();
                // Switching tabs in the browser re-renders this list; bringing the
                // active one into view is what the original does at the end of a render.
                // The row it looks for is the one Svelte is about to paint, so the scroll
                // has to wait for that paint or it measures the tab that just stopped
                // being active and decides nothing needs to move.
                await tick();
                const { scrollToActiveGroupIfNeeded } = await import('../services/groupsService.js');
                scrollToActiveGroupIfNeeded();
                const { updateScrollButtons } = await import('../components/common/ScrollButtons.svelte');
                updateScrollButtons();
            }
        } catch (err) {
            console.error('[groupStore] fetch error:', err);
        }
    },
};
