import { get } from 'svelte/store';
import { prefetchCache } from '../stores/appStore.svelte.js';

const prefetchInProgress = new Map();

export async function prefetchData(type, force = false) {
    const cache = get(prefetchCache);
    if (!force && cache[type]) {
        return cache[type];
    }

    if (prefetchInProgress.has(type)) {
        return prefetchInProgress.get(type);
    }

    const fetchPromise = (async () => {
        let action;
        switch (type) {
            case 'bookmarks':
                action = 'getBookmarks';
                break;
            case 'history':
                action = 'getHistory';
                break;
            case 'recent':
                action = 'getRecentlyClosed';
                break;
            case 'reading':
                action = 'getReadingList';
                break;
            case 'downloads':
                action = 'getDownloads';
                break;
            default:
                return null;
        }

        try {
            const response = await chrome.runtime.sendMessage({ action });
            if (response && response.success) {
                prefetchCache.update((current) => {
                    if (type === 'bookmarks') {
                        current.bookmarks = {
                            tree: response.bookmarks,
                            duplicateUrlSet: response.duplicateUrlSet,
                        };
                    } else if (type === 'history' || type === 'recent' || type === 'downloads') {
                        current[type] = response.results;
                    } else if (type === 'reading') {
                        current.reading = response.items;
                    }
                    return current;
                });
                return get(prefetchCache)[type];
            }
        } catch (error) {
            console.error(`[Prefetch] Error fetching ${type}:`, error);
        } finally {
            prefetchInProgress.delete(type);
        }
        return null;
    })();

    prefetchInProgress.set(type, fetchPromise);
    return fetchPromise;
}

export function prefetchAll() {
    prefetchData('bookmarks');
    prefetchData('history');
    prefetchData('recent');
    prefetchData('reading');
}

export function prefetchUrl(url) {
    if (!url) return;

    if (!url.startsWith(chrome.runtime.getURL(''))) return;

    if (document.querySelector(`link[rel="prefetch"][href="${url}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
}
