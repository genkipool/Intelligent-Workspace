/**
 * windowsService.js
 *
 * Manages window resolution and window-scoped context for extension UI pages
 * (especially the side panel). In Chrome, each browser window has its own
 * isolated side panel instance.
 */

import { writable, get } from 'svelte/store';

// Reactive store holding the current window ID for this UI instance
export const currentWindowIdStore = writable(null);

// Reactive store holding the Set of all currently open normal window IDs
export const openWindowIdsStore = writable(new Set());

let cachedWindowId = null;

/**
 * Resolves the window ID that hosts this extension page.
 *
 * Resolution order:
 * 1. URL search parameter (?windowId=...)
 * 2. In-memory cached window ID
 * 3. chrome.windows.getCurrent()
 * 4. chrome.windows.getLastFocused({ windowTypes: ['normal'] })
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<number|null>}
 */
export async function getCurrentWindowId(forceRefresh = false) {
    if (!forceRefresh && cachedWindowId !== null) {
        return cachedWindowId;
    }

    // 1. Check URL query parameters
    try {
        if (typeof window !== 'undefined' && window.location?.search) {
            const params = new URLSearchParams(window.location.search);
            const winParam = params.get('windowId');
            if (winParam !== null) {
                const parsed = parseInt(winParam, 10);
                if (Number.isFinite(parsed)) {
                    cachedWindowId = parsed;
                    currentWindowIdStore.set(parsed);
                    return parsed;
                }
            }
        }
    } catch {}

    // 2. Query chrome.windows.getCurrent()
    try {
        if (typeof chrome !== 'undefined' && chrome.windows?.getCurrent) {
            const currentWin = await chrome.windows.getCurrent().catch(() => null);
            if (currentWin && typeof currentWin.id === 'number') {
                // If it's a normal browser window, this is directly our window ID
                if (currentWin.type === 'normal') {
                    cachedWindowId = currentWin.id;
                    currentWindowIdStore.set(cachedWindowId);
                    return cachedWindowId;
                }

                // If it's a popup or other non-normal window, fallback to the last focused normal window
                if (chrome.windows.getLastFocused) {
                    const normalWin = await chrome.windows
                        .getLastFocused({ windowTypes: ['normal'] })
                        .catch(() => null);
                    if (normalWin && typeof normalWin.id === 'number') {
                        cachedWindowId = normalWin.id;
                        currentWindowIdStore.set(cachedWindowId);
                        return cachedWindowId;
                    }
                }

                // Fallback to currentWin.id if no normal window found
                cachedWindowId = currentWin.id;
                currentWindowIdStore.set(cachedWindowId);
                return cachedWindowId;
            }
        }
    } catch (err) {
        console.warn('[windowsService] Could not get current window:', err);
    }

    // 3. Fallback: getLastFocused
    try {
        if (typeof chrome !== 'undefined' && chrome.windows?.getLastFocused) {
            const lastWin = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
            if (lastWin && typeof lastWin.id === 'number') {
                cachedWindowId = lastWin.id;
                currentWindowIdStore.set(cachedWindowId);
                return cachedWindowId;
            }
        }
    } catch {}

    return null;
}

/**
 * Explicitly sets the current window ID (useful for initialization or testing).
 * @param {number|null} windowId
 */
export function setCurrentWindowId(windowId) {
    cachedWindowId = windowId;
    currentWindowIdStore.set(windowId);
}

/**
 * Resets the cached window ID (useful for tests).
 */
export function resetCurrentWindowId() {
    cachedWindowId = null;
    currentWindowIdStore.set(null);
}

/**
 * Checks whether a given windowId belongs to the current window.
 * If either currentWindowId or targetWindowId is null/undefined, returns true.
 * @param {number|null|undefined} targetWindowId
 * @returns {boolean}
 */
export function isCurrentWindow(targetWindowId) {
    if (targetWindowId === null || targetWindowId === undefined) {
        return true;
    }
    const current = cachedWindowId ?? get(currentWindowIdStore);
    if (current === null || current === undefined) {
        return true;
    }
    return current === targetWindowId;
}

/**
 * Retrieves the Set of IDs for all currently open normal browser windows.
 * @returns {Promise<Set<number>>}
 */
export async function getOpenWindowIds() {
    try {
        if (typeof chrome !== 'undefined' && chrome.windows?.getAll) {
            const wins = await chrome.windows.getAll({ windowTypes: ['normal'] }).catch(() => []);
            return new Set((wins || []).map((w) => w.id).filter((id) => typeof id === 'number'));
        }
    } catch {}
    return new Set();
}

/**
 * Updates the openWindowIdsStore with the currently open normal window IDs.
 * @returns {Promise<Set<number>>}
 */
export async function syncOpenWindows() {
    const openSet = await getOpenWindowIds();
    openWindowIdsStore.set(openSet);
    return openSet;
}
