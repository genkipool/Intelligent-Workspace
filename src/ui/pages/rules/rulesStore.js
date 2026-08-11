import { writable, get } from 'svelte/store';
import { getRuleStorage, setRuleStorage, getSettings, saveSettings } from './modules/rules-api.js';

export const rulesStore = writable([]);
export const expandedStatesStore = writable(new Map());
export const sortStatesStore = writable(new Map());
export const isAllExpandedStore = writable(false);
export const sortAlphaStore = writable(false);
export const searchQueryStore = writable('');

export async function initializeRules() {
    const [syncData, expansionData] = await Promise.all([getRuleStorage(), getSettings(['isAllExpanded'])]);

    const rules = syncData?.customRules || [];
    rulesStore.set(rules);
    isAllExpandedStore.set(expansionData?.isAllExpanded || false);

    if (rules.length > 0) {
        const sortStateKeys = rules.map((rule) => `sortState_${rule.name}`);
        const sortStateData = await getSettings(sortStateKeys);
        const sortMap = new Map();
        for (const rule of rules) {
            sortMap.set(rule.name, sortStateData[`sortState_${rule.name}`] || false);
        }
        sortStatesStore.set(sortMap);
    }
}

export async function saveRulesToStorage(rules) {
    rulesStore.set(rules);
    await setRuleStorage(rules);
}
