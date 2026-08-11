/**
 * RulesService — domain logic for custom grouping rules.
 *
 * Encapsulates all CRUD operations and storage area management.
 */

import { storageService, getStorageAreaName } from './storage.js';
import { messaging, ACTIONS } from './messaging.js';

let cachedRules = null;

function getStorage() {
    return getStorageAreaName('ruleStorageArea');
}

export const rulesService = {
    /**
     * Load all custom rules from storage.
     */
    async getAll() {
        const area = await getStorage();
        const { customRules = [] } = await storageService.get(['customRules'], area);
        cachedRules = customRules;
        return customRules;
    },

    /**
     * Get rules from cache if available, otherwise fetch.
     */
    async getCached() {
        if (cachedRules !== null) {
            return cachedRules;
        }
        return rulesService.getAll();
    },

    /**
     * Add a new rule.
     */
    async add(rule) {
        const rules = await rulesService.getAll();
        const updated = [...rules, { ...rule, id: Date.now().toString(), active: true }];
        await rulesService._save(updated);
        await messaging.send(ACTIONS.GROUP_TABS);
        return updated;
    },

    /**
     * Update an existing rule.
     */
    async update(ruleId, changes) {
        const rules = await rulesService.getAll();
        const updated = rules.map((r) => (r.id === ruleId ? { ...r, ...changes } : r));
        await rulesService._save(updated);
        return updated;
    },

    /**
     * Delete a rule by id.
     */
    async remove(ruleId) {
        const rules = await rulesService.getAll();
        const updated = rules.filter((r) => r.id !== ruleId);
        await rulesService._save(updated);
        return updated;
    },

    /**
     * Reorder rules (drag and drop).
     */
    async reorder(fromIndex, toIndex) {
        const rules = await rulesService.getAll();
        const [moved] = rules.splice(fromIndex, 1);
        rules.splice(toIndex, 0, moved);
        await rulesService._save(rules);
        return rules;
    },

    /**
     * Toggle a single rule's active state.
     */
    async toggle(ruleId) {
        const rules = await rulesService.getAll();
        const updated = rules.map((r) => (r.id === ruleId ? { ...r, active: !r.active } : r));
        await rulesService._save(updated);
        await messaging.send(ACTIONS.GROUP_TABS);
        return updated;
    },

    /**
     * Toggle ALL rules active/inactive.
     */
    async toggleAll(active) {
        const rules = await rulesService.getAll();
        const updated = rules.map((r) => ({ ...r, active }));
        await rulesService._save(updated);
        messaging.notify(ACTIONS.GROUP_TABS);
        return updated;
    },

    /**
     * Check whether all rules are active.
     */
    areAllActive(rules) {
        return rules.length > 0 && rules.every((r) => r.active);
    },

    /**
     * Subscribe to rule storage changes.
     */
    subscribe(callback) {
        const handler = (changes, areaName) => {
            if (changes.customRules) {
                cachedRules = changes.customRules.newValue || [];
                callback(cachedRules);
            }
        };
        storageService.onChanged(handler);
        return () => {
            // Can't fully unsubscribe from chrome.storage.onChanged
            // but we can ignore the handler. For cleanup, store ref.
        };
    },

    /** Internal: save rules to the correct storage area. */
    _save: async (rules) => {
        const area = await getStorage();
        await storageService.set({ customRules: rules }, area);
        cachedRules = rules;
    },
};
