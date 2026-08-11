/**
 * StorageService — unified abstraction over chrome.storage.local / sync / session.
 *
 * Why a service instead of direct chrome.storage calls:
 * - Single place to handle migration between storage areas
 * - Auto-JSON serialization/deserialization
 * - Consistent error handling
 * - Testable: swap implementation for testing
 */

const STORAGE_AREAS = {
    local: chrome.storage.local,
    sync: chrome.storage.sync,
    session: chrome.storage.session,
};

// Which area holds the rules (or the themes) is consulted before almost every read,
// so resolving it from chrome.storage each time doubled the round-trips. The lookup
// is cached per key and invalidated by the listener below.
const areaNameCache = new Map();

export function getStorageAreaName(ruleKey = 'ruleStorageArea') {
    let pending = areaNameCache.get(ruleKey);
    if (!pending) {
        pending = chrome.storage.local.get(ruleKey).then(({ [ruleKey]: area = 'sync' }) => area);
        areaNameCache.set(ruleKey, pending);
    }
    return pending;
}

export async function getStorageArea(ruleKey = 'ruleStorageArea') {
    return STORAGE_AREAS[await getStorageAreaName(ruleKey)] || chrome.storage.sync;
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    for (const key of [...areaNameCache.keys()]) {
        if (changes[key]) areaNameCache.delete(key);
    }
});

// Warmed on import: every page resolves the rule area during boot, and doing it here
// overlaps the round-trip with module evaluation instead of stalling the first read.
getStorageAreaName('ruleStorageArea');

export const storageService = {
    get: async (keys, area = 'local') => {
        try {
            const storage = STORAGE_AREAS[area];
            return await storage.get(keys);
        } catch (err) {
            console.error(`[StorageService] get failed (${area}):`, err);
            return {};
        }
    },

    set: async (items, area = 'local') => {
        try {
            const storage = STORAGE_AREAS[area];
            await storage.set(items);
        } catch (err) {
            console.error(`[StorageService] set failed (${area}):`, err);
        }
    },

    remove: async (keys, area = 'local') => {
        try {
            const storage = STORAGE_AREAS[area];
            await storage.remove(keys);
        } catch (err) {
            console.error(`[StorageService] remove failed (${area}):`, err);
        }
    },

    getRuleStorage: async () => getStorageArea('ruleStorageArea'),

    getThemeStorage: async () => getStorageArea('themeStorageArea'),

    onChanged: (callback) => {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            callback(changes, areaName);
        });
    },

    // Convenience: get a single value with fallback
    getValue: async (key, fallback = null, area = 'local') => {
        const result = await storageService.get([key], area);
        return result[key] !== undefined ? result[key] : fallback;
    },

    // Convenience: set a single value
    setValue: async (key, value, area = 'local') => {
        await storageService.set({ [key]: value }, area);
    },
};
