import { writable, derived } from 'svelte/store';
import { STORAGE_KEYS } from '../services/constants.js';
import { getGroupInfoMap, getGroupPrefixState } from '../services/utils.js';

/**
 * renderContextStore — Provides the shared "render context" data
 * that GroupCard, TabItem, and Subgroup components need.
 *
 * This replaces the old performRender() Phase 1 data collection
 * that was done in groups-renderer.js before Svelte migration.
 */

const _renderContext = writable({
    seenTabIds: new Set(),
    duplicateUrlSet: new Set(),
    screenshotData: {},
    notesData: {},
    pageModes: {},
    groupInfoMap: new Map(),
    groupPrefixState: new Map(),
    customRules: [],
});

export const renderContext = { subscribe: _renderContext.subscribe };

// A group's displayed name depends on the stored prefix, which lives in this context.
// Rendering a card before it has loaded therefore shows one name and swaps it for
// another as soon as the load lands, so the list waits for this flag instead.
export const renderContextReady = writable(false);

// Concurrent callers used to be dropped with an early return, so an `await` could
// continue against the still-default context and render names that changed a moment
// later. They now share the in-flight load instead.
let loading = null;

/**
 * Fetch all contextual data needed for group/tab rendering.
 * Called once on init and then periodically or on tab events.
 */
export function loadRenderContext() {
    loading ??= doLoadRenderContext().finally(() => {
        loading = null;
    });
    return loading;
}

async function doLoadRenderContext() {
    try {
        // 1. Page modes
        let pageModes = {};
        try {
            pageModes = await chrome.runtime.sendMessage({ action: 'getPageModes' });
        } catch (e) {
            // Silently ignore if background is not available
        }

        // 2. Seen tabs (tabs that were ever active)
        let seenTabIds = new Set();
        try {
            const sessionData = await chrome.storage.session.get('tabsEverActive');
            seenTabIds = new Set(sessionData.tabsEverActive || []);
        } catch (e) {}

        // 3. Screenshots and notes index
        let screenshotData = {};
        let notesData = {};
        try {
            const screenshotResult = await chrome.storage.session.get(STORAGE_KEYS.SCREENSHOTS);
            screenshotData = screenshotResult[STORAGE_KEYS.SCREENSHOTS] || {};

            const notesResult = await chrome.storage.session.get(STORAGE_KEYS.NOTES);
            notesData = notesResult[STORAGE_KEYS.NOTES] || {};
        } catch (e) {}

        // 4. Group info map and prefix state
        let groupInfoMap = new Map();
        let groupPrefixState = new Map();
        try {
            groupInfoMap = await getGroupInfoMap();
            groupPrefixState = await getGroupPrefixState();
        } catch (e) {}

        // 5. Custom rules (for matching tabs to rules)
        let customRules = [];
        try {
            const { customTabGroupingRules = [] } = await chrome.storage.local.get('customTabGroupingRules');
            customRules = customTabGroupingRules;
        } catch (e) {}

        // 6. Compute duplicate URLs
        let duplicateUrlSet = new Set();
        try {
            const allTabs = await chrome.tabs.query({});
            const urlCounts = {};
            for (const tab of allTabs) {
                const url = tab.url || tab.pendingUrl || '';
                if (url && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://')) {
                    urlCounts[url] = (urlCounts[url] || 0) + 1;
                }
            }
            for (const [url, count] of Object.entries(urlCounts)) {
                if (count > 1) {
                    duplicateUrlSet.add(url);
                }
            }
        } catch (e) {}

        _renderContext.set({
            seenTabIds,
            duplicateUrlSet,
            screenshotData,
            notesData,
            pageModes,
            groupInfoMap,
            groupPrefixState,
            customRules,
        });
        renderContextReady.set(true);
    } catch (e) {
        console.error('[renderContextStore] Error loading context:', e);
    }
}

/**
 * Listen for Chrome events that should trigger a context refresh.
 */
export function initRenderContextListeners() {
    // Refresh on tab changes
    const debounce = (fn, ms) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    };

    const debouncedLoad = debounce(loadRenderContext, 300);

    chrome.tabs.onUpdated.addListener(debouncedLoad);
    chrome.tabs.onRemoved.addListener(debouncedLoad);
    chrome.tabs.onActivated.addListener(debouncedLoad);

    // Listen for storage changes that affect our context
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'session') {
            if (changes.tabsEverActive || changes[STORAGE_KEYS.SCREENSHOTS] || changes[STORAGE_KEYS.NOTES]) {
                debouncedLoad();
            }
        }
        if (areaName === 'local') {
            if (changes.customTabGroupingRules) {
                debouncedLoad();
            }
        }
    });
}
