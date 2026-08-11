/**
 * I18nService — internationalization domain logic.
 *
 * Handles language detection, message loading, and translation.
 */

import { storageService } from './storage.js';
import { messaging, ACTIONS } from './messaging.js';
import { resolveMessage, loadMessages } from '../../utils/i18n.js';

export const i18nService = {
    /**
     * Detect the current language from storage or browser UI.
     */
    async detectLanguage() {
        const { 'preferred-language': lang } = await storageService.get(['preferred-language'], 'local');
        if (lang) return lang;
        return chrome.i18n.getUILanguage().startsWith('es') ? 'es' : 'en';
    },

    /**
     * Load messages for a given language.
     *
     * Delegates to the shared loader in utils/i18n.js so the imperative DOM and the
     * Svelte stores read from one cache and one fetch.
     */
    loadMessages(lang) {
        return loadMessages(lang);
    },

    /**
     * Replace $1, $2 placeholders with actual params.
     */
    replacePlaceholders(message, params = []) {
        if (!params || params.length === 0) return message;
        return message.replace(/\$(\d+)/g, (match, idx) => {
            const i = parseInt(idx, 10) - 1;
            return params[i] !== undefined ? params[i] : match;
        });
    },

    /**
     * Translate a key with optional params.
     */
    translate(messages, key, params = []) {
        const entry = messages[key];
        // Like chrome.i18n.getMessage: a missing key yields an empty string, so a
        // placeholder or title stays blank instead of showing the raw key.
        if (!entry) return '';
        return resolveMessage(entry, params, 'message');
    },

    /**
     * Translates a tooltip (title attribute).
     *
     * Tooltips use the `description` field of messages.json when present and fall
     * back to `message`. This is the same resolution `applyTranslations()` applies
     * to `data-i18n-title` attributes, so Svelte components and the imperative DOM
     * always show the same text.
     */
    translateTitle(messages, key, params = []) {
        const entry = messages[key];
        if (!entry) return key;
        const field = entry.description?.trim() ? 'description' : 'message';
        return resolveMessage(entry, params, field) || key;
    },

    /**
     * Change language and persist.
     */
    async changeLanguage(lang) {
        await storageService.set({ 'preferred-language': lang }, 'local');
        messaging.notify(ACTIONS.LANGUAGE_CHANGED);
        return i18nService.loadMessages(lang);
    },

    /**
     * Initialize: detect lang and load messages.
     */
    async init() {
        // Reading the stored preference and fetching the dictionary used to run one
        // after the other. The preference nearly always matches the browser UI
        // language, so the matching file is fetched in parallel and the read only has
        // to confirm it; a mismatch costs one extra fetch of a local file.
        const uiLang = chrome.i18n.getUILanguage().startsWith('es') ? 'es' : 'en';
        const optimistic = i18nService.loadMessages(uiLang);
        const lang = await i18nService.detectLanguage();
        const msgs = lang === uiLang ? await optimistic : await i18nService.loadMessages(lang);
        return { lang, messages: msgs };
    },

    /**
     * Subscribe to language changes from other contexts.
     */
    subscribe(callback) {
        storageService.onChanged((changes) => {
            if (changes['preferred-language']) {
                const newLang = changes['preferred-language'].newValue;
                if (newLang) {
                    callback(newLang);
                }
            }
        });
    },
};
