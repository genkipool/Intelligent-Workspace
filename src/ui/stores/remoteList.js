import { writable } from 'svelte/store';

/**
 * List fetched from the service worker on demand (history, recently closed,
 * reading list).
 *
 * `loaded` tells "not requested yet" apart from "requested and empty", so the views
 * do not flash the empty-list message before the first response arrives.
 */
export function createRemoteList(fetcher) {
    const items = writable([]);
    const loaded = writable(false);

    return {
        items,
        loaded,
        /** Optimistically removes every item matching the predicate. */
        remove(predicate) {
            items.update((list) => list.filter((item) => !predicate(item)));
        },
        async load(...args) {
            try {
                items.set((await fetcher(...args)) || []);
            } catch (err) {
                console.error('[remoteList] load failed:', err);
                items.set([]);
            } finally {
                loaded.set(true);
            }
        },
    };
}
