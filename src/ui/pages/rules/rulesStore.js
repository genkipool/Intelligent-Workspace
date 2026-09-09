import { writable } from 'svelte/store';
import { getRuleStorage, setRuleStorage, getSettings, groupTabs } from './modules/rules-api.js';

export const rulesStore = writable([]);
export const expandedStatesStore = writable(new Map());
export const sortStatesStore = writable(new Map());
export const isAllExpandedStore = writable(false);
export const sortAlphaStore = writable(false);
export const searchQueryStore = writable('');

export async function initializeRules() {
    const [syncData, expansionData] = await Promise.all([
        getRuleStorage(),
        getSettings(['isAllExpanded', 'sortAlphaPreference']),
    ]);

    const rules = syncData?.customRules || [];
    rulesStore.set(rules);
    isAllExpandedStore.set(expansionData?.isAllExpanded || false);
    sortAlphaStore.set(expansionData?.sortAlphaPreference || false);

    if (rules.length > 0) {
        const sortStateKeys = rules.map((rule) => `sortState_${rule.name}`);
        const sortStateData = (await getSettings(sortStateKeys)) || {};
        const sortMap = new Map();
        for (let i = 0; i < rules.length; i++) {
            const name = rules[i].name;
            sortMap.set(name, sortStateData[`sortState_${name}`] || false);
        }
        sortStatesStore.set(sortMap);
    }
}

export async function saveRulesToStorage(rules) {
    rulesStore.set(rules);
    await setRuleStorage(rules);
    await groupTabs();
}
