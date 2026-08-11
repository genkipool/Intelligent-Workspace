import { createRemoteList } from './remoteList.js';

const list = createRemoteList(async () => {
    const response = await chrome.runtime.sendMessage({ action: 'getRecentlyClosed' });
    return response?.success ? response.results : [];
});

export const recentLoaded = list.loaded;

export const recentStore = {
    subscribe: list.items.subscribe,
    loadRecent: () => list.load(),
    /** Closed sessions cannot be deleted through the API, they are only hidden. */
    removeItem: (item) => list.remove((i) => i === item),
};
