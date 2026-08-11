import { derived } from 'svelte/store';
import { groupHistoryByDate } from '../services/utils.js';
import { createRemoteList } from './remoteList.js';

const list = createRemoteList(async (startTime, endTime, searchTerm) => {
    const response = await chrome.runtime.sendMessage({
        action: 'getHistory',
        query: searchTerm,
        startTime,
        endTime,
    });
    if (!response?.success || !response.results) return [];
    // Filtrado estricto en cliente: chrome.history puede devolver visitas fuera del rango.
    if (startTime && endTime) {
        return response.results.filter((i) => i.lastVisitTime >= startTime && i.lastVisitTime <= endTime);
    }
    return response.results;
});

export const historyLoaded = list.loaded;

export const historyStore = {
    subscribe: derived(list.items, ($items) => groupHistoryByDate($items)).subscribe,
    loadHistory: (startTime = null, endTime = null, searchTerm = '') => list.load(startTime, endTime, searchTerm),
    deleteHistoryUrl: (url) => {
        list.remove((i) => i.url === url);
        return chrome.runtime.sendMessage({ action: 'deleteHistoryUrls', urls: [url] });
    },
    deleteHistoryGroup: (urls) => chrome.runtime.sendMessage({ action: 'deleteHistoryUrls', urls }),
};
