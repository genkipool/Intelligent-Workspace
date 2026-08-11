import { createRemoteList } from './remoteList.js';

const list = createRemoteList(async () => {
    const response = await chrome.runtime.sendMessage({ action: 'getReadingList' });
    return response?.success ? response.items : [];
});

export const readingLoaded = list.loaded;

export const readingStore = {
    subscribe: list.items.subscribe,
    loadReadingList: () => list.load(),
    deleteReadingItem: (url) => {
        list.remove((i) => i.url === url);
        return chrome.runtime.sendMessage({ action: 'deleteReadingListItem', payload: { url } });
    },
};
