/* global chrome */
import { writable } from 'svelte/store';

/**
 * The switches start from what they showed last time, mirrored in localStorage, which
 * can be read before the first paint. chrome.storage is asynchronous: starting from a
 * fixed `false`, the rules switch was drawn off and then slid on in front of the user
 * every time the home page was opened.
 */
const SWITCH_MIRROR_KEY = 'settings-switch-mirror';

function readSwitchMirror() {
    try {
        return JSON.parse(localStorage.getItem(SWITCH_MIRROR_KEY)) || {};
    } catch {
        return {};
    }
}

const mirrored = readSwitchMirror();

export const hintsEnabled = writable(mirrored.hintsEnabled ?? true);
export const allRulesActive = writable(mirrored.allRulesActive ?? false);
export const hasRules = writable(mirrored.hasRules ?? false);

function mirrorSwitch(key) {
    return (value) => {
        try {
            const current = readSwitchMirror();
            if (current[key] === value) return;
            localStorage.setItem(SWITCH_MIRROR_KEY, JSON.stringify({ ...current, [key]: value }));
        } catch {
            // No localStorage: the switches only lose their head start.
        }
    };
}

hintsEnabled.subscribe(mirrorSwitch('hintsEnabled'));
allRulesActive.subscribe(mirrorSwitch('allRulesActive'));
hasRules.subscribe(mirrorSwitch('hasRules'));
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
    chrome.storage.onChanged.addListener((changes, areaName) => {
        // `customRules` exists in both areas and only one of them is the active set, so
        // the change is not taken at face value: the active area is read again.
        // Switching the storage area swaps the whole rule set underneath us too.
        if (changes.customRules || changes.ruleStorageArea) refreshAllRulesActive();
        if (changes[HINTS_KEY] && areaName === 'sync') hintsEnabled.set(changes[HINTS_KEY].newValue !== false);
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
