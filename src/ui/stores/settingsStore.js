/* global chrome */
import { writable } from 'svelte/store';

export const hintsEnabled = writable(true);
export const allRulesActive = writable(false);
export const hasRules = writable(false);
export const visibilitySettings = writable({});
export const actionVisibilitySettings = writable({});

const HINTS_KEY = 'hintsEnabled';

// Rules live in sync or local storage depending on what the rules page has configured,
// so every read and write has to resolve the area first.
async function getRulesStorage() {
    const { ruleStorageArea = 'sync' } = await chrome.storage.local.get('ruleStorageArea');
    return ruleStorageArea === 'local' ? chrome.storage.local : chrome.storage.sync;
}

/** The master switch is on only when every rule is active, exactly as in the rules page. */
function computeAllActive(rules) {
    return Array.isArray(rules) && rules.length > 0 && rules.every((r) => r.active);
}

function applyRules(rules) {
    const list = Array.isArray(rules) ? rules : [];
    hasRules.set(list.length > 0);
    allRulesActive.set(computeAllActive(list));
}

async function refreshAllRulesActive() {
    const storage = await getRulesStorage();
    const { customRules = [] } = await storage.get('customRules');
    applyRules(customRules);
}

// Both switches are two views of the same stored value, so changes made anywhere
// (this popup, the rules page, the background) have to reach the other side live.
let isListening = false;
function startStorageListener() {
    if (isListening || !chrome?.storage?.onChanged) return;
    isListening = true;
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.customRules) applyRules(changes.customRules.newValue || []);
        // Switching the storage area swaps the whole rule set underneath us.
        if (changes.ruleStorageArea) refreshAllRulesActive();
        if (changes[HINTS_KEY]) hintsEnabled.set(changes[HINTS_KEY].newValue !== false);
    });
}

export const settingsStore = {
    init: async () => {
        startStorageListener();
        const [{ [HINTS_KEY]: hints = true }] = await Promise.all([
            chrome.storage.sync.get(HINTS_KEY),
            refreshAllRulesActive(),
        ]);
        hintsEnabled.set(hints !== false);
    },
    toggleHints: async (enabled) => {
        hintsEnabled.set(enabled);
        await chrome.storage.sync.set({ [HINTS_KEY]: enabled });
    },
    toggleRules: async (active) => {
        const storage = await getRulesStorage();
        const { customRules = [] } = await storage.get('customRules');
        if (customRules.length === 0) {
            // Nothing to activate: the switch cannot stay on without rules.
            applyRules([]);
            return;
        }
        const updated = customRules.map((rule) => ({ ...rule, active }));
        await storage.set({ customRules: updated });
        applyRules(updated);
        try {
            await chrome.runtime.sendMessage({ action: 'groupTabs' });
        } catch {
            /* the background may be asleep; the storage change alone already applies */
        }
    },
};
