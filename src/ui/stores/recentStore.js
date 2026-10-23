import { get } from 'svelte/store';
import { createRemoteList } from './remoteList.js';
import { STORAGE_KEYS } from '../services/constants.js';

const list = createRemoteList(async () => {
    const response = await chrome.runtime.sendMessage({ action: 'getRecentlyClosed' });
    return response?.success ? response.results : [];
});

/** Closing times come in seconds. */
const closedAtMs = (item) => (item.lastModified > 1000000000000 ? item.lastModified : item.lastModified * 1000);

/**
 * Closed sessions cannot be deleted through the API, only hidden, and the hiding has to
 * be remembered: the worker leaves out what is recorded here, so the entries do not come
 * back the next time the list loads.
 */
async function updateHidden(change) {
    const { [STORAGE_KEYS.RECENT_HIDDEN]: hidden = {} } = await chrome.storage.local.get(STORAGE_KEYS.RECENT_HIDDEN);
    await chrome.storage.local.set({ [STORAGE_KEYS.RECENT_HIDDEN]: change(hidden) });
}

export const recentLoaded = list.loaded;

export const recentStore = {
    subscribe: list.items.subscribe,
    loadRecent: () => list.load(),
    removeItem: async (item) => {
        list.remove((i) => i === item);
        if (!item?.sessionId) return;
        await updateHidden((hidden) => ({ ...hidden, ids: [...new Set([...(hidden.ids || []), item.sessionId])] }));
    },
    /**
     * Hides everything on the list now. Measured from the newest entry rather than the
     * clock, so a tab closed straight afterwards still shows up.
     */
    clearAll: async () => {
        const newest = Math.max(0, ...get(list.items).map(closedAtMs));
        list.remove(() => true);
        await updateHidden((hidden) => ({ ...hidden, clearedAt: Math.max(newest, hidden.clearedAt || 0) }));
    },
};
