import { writable } from 'svelte/store';
import { saveListGroupSettings } from '../services/settingsService.js';

export const hintsEnabled = writable(true);
export const allRulesActive = writable(false);
export const visibilitySettings = writable({});
export const actionVisibilitySettings = writable({});

export const settingsStore = {
    init: async () => {
        const toggleBtn = document.getElementById('web-search-toggle-btn');
        if (toggleBtn) {
            hintsEnabled.set(toggleBtn.getAttribute('aria-pressed') === 'true');
        }
    },
    toggleHints: async (enabled) => {
        hintsEnabled.set(enabled);
    },
    toggleRules: async (active) => {
        allRulesActive.set(active);
    },
};
