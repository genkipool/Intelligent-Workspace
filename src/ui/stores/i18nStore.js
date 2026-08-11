import { writable, derived } from 'svelte/store';
import { i18nService } from '../services/i18nService.js';

export const currentLang = writable('en');
export const messages = writable({});

export const t = derived(messages, ($messages) => {
    return (key, params = []) => i18nService.translate($messages, key, params);
});

/** Tooltip translator: uses `description`, falling back to `message`. */
export const tt = derived(messages, ($messages) => {
    return (key, params = []) => i18nService.translateTitle($messages, key, params);
});

// Pages await the dictionary before mounting and components also init on mount;
// caching the promise keeps that a single load with a single subscription.
let initPromise = null;

export const i18nStore = {
    subscribe: currentLang.subscribe,
    init: () => {
        initPromise ??= (async () => {
            const { lang, messages: msgs } = await i18nService.init();
            currentLang.set(lang);
            messages.set(msgs);

            i18nService.subscribe(async (newLang) => {
                const newMsgs = await i18nService.loadMessages(newLang);
                currentLang.set(newLang);
                messages.set(newMsgs);
            });
        })();
        return initPromise;
    },
    changeLanguage: async (lang) => {
        const msgs = await i18nService.changeLanguage(lang);
        currentLang.set(lang);
        messages.set(msgs);
    },
};
