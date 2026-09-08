import { get } from 'svelte/store';
import { prefetchCache } from '../stores/appStore.svelte.js';

import { SITE_DOCUMENT_TITLES, siteUrl } from '../../config/site.js';

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

    hint('prefetch', url);
}

/** One `<link>` per address, added once. */
function hint(rel, href) {
    if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
}

/**
 * Fetches one of the site's own documents ahead of the click that will frame it.
 *
 * `prefetchUrl` refuses anything that is not an extension page, and deliberately: it is
 * called from the tab cards, where prefetching whatever a tab happens to be showing would
 * reach out to sites nobody asked us to touch. This one is not general — it takes a page
 * name from the closed list the panel is allowed to frame and builds the address itself —
 * so there is nothing here to leak.
 *
 * The document is fetched, not merely resolved: `warmPaymentOrigin` already opens the
 * socket to this host when the popup mounts, so what is left to buy is the response.
 *
 * @param {'privacy'|'support'|'terms'} page
 */
export function prefetchSiteDocument(page) {
    if (!SITE_DOCUMENT_TITLES[page]) return;
    hint('prefetch', siteUrl(page));
}
