/**
 * The languages the extension ships, in one place.
 *
 * Every context reads this list: the pages import it, the content scripts get it
 * from the manifest ahead of `hint_common.js`, and the worker loads it with
 * `importScripts`. That is why it is a plain script publishing `globalThis.ItgLanguages`
 * rather than an ES module — the worker's helpers and the content scripts cannot
 * import one.
 *
 * Adding a language:
 *   1. Add `_locales/<code>/messages.json` with every key of the English file.
 *   2. Add one entry below.
 * `pnpm check:release` fails if the two disagree. Nothing else in the code names a
 * language: detection, the switch in the popup, dates, numbers and plurals all
 * derive from this list.
 */
(function (root) {
    /**
     * `code` is the `_locales` folder, `locale` the BCP 47 tag used with `Intl`,
     * `nativeName` what the language selector shows. English comes first: it is the
     * default and the fallback for any key a translation is missing.
     */
    const SUPPORTED_LANGUAGES = Object.freeze([
        Object.freeze({ code: 'en', locale: 'en-US', nativeName: 'English' }),
        Object.freeze({ code: 'es', locale: 'es-ES', nativeName: 'Español' }),
        Object.freeze({ code: 'de', locale: 'de-DE', nativeName: 'Deutsch' }),
        Object.freeze({ code: 'fr', locale: 'fr-FR', nativeName: 'Français' }),
        Object.freeze({ code: 'it', locale: 'it-IT', nativeName: 'Italiano' }),
        Object.freeze({ code: 'pt_BR', locale: 'pt-BR', nativeName: 'Português (Brasil)' }),
        Object.freeze({ code: 'ru', locale: 'ru-RU', nativeName: 'Русский' }),
        Object.freeze({ code: 'hi', locale: 'hi-IN', nativeName: 'हिन्दी' }),
        Object.freeze({ code: 'ja', locale: 'ja-JP', nativeName: '日本語' }),
        Object.freeze({ code: 'zh_CN', locale: 'zh-CN', nativeName: '中文（简体）' }),
        Object.freeze({ code: 'ko', locale: 'ko-KR', nativeName: '한국어' }),
    ]);

    const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0].code;

    /** Normalises `pt-BR`, `pt_BR` and `PT-br` to the `_locales` spelling `pt_BR`. */
    function normalize(tag) {
        const [lang, region] = String(tag || '')
            .trim()
            .split(/[-_]/);
        return region ? `${lang.toLowerCase()}_${region.toUpperCase()}` : lang.toLowerCase();
    }

    function isSupported(code) {
        return SUPPORTED_LANGUAGES.some((l) => l.code === code);
    }

    /**
     * The supported language that best matches a browser tag: the exact regional
     * variant if the extension has it, else the base language, else the default.
     * `es-419` and `es-MX` both land on `es`; `nl` lands on English, which the
     * extension does not ship in Dutch.
     */
    function resolveLanguage(tag) {
        const full = normalize(tag);
        if (isSupported(full)) return full;
        const base = full.split('_')[0];
        if (isSupported(base)) return base;
        // `pt-PT` or a bare `pt` still read Brazilian Portuguese better than English,
        // and `zh-TW` Simplified Chinese: the closest variant the extension ships.
        const variant = SUPPORTED_LANGUAGES.find((l) => l.code.split('_')[0] === base);
        return variant ? variant.code : DEFAULT_LANGUAGE;
    }

    /** The language of the browser's UI, which is what a fresh install starts in. */
    function detectBrowserLanguage() {
        const ui = typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage ? chrome.i18n.getUILanguage() : '';
        return resolveLanguage(ui);
    }

    /**
     * The language to use: the one the user picked with the switch, if it is still
     * supported, otherwise the browser's.
     */
    function pickLanguage(stored) {
        return stored && isSupported(stored) ? stored : detectBrowserLanguage();
    }

    function localeOf(code) {
        return (SUPPORTED_LANGUAGES.find((l) => l.code === code) || SUPPORTED_LANGUAGES[0]).locale;
    }

    /**
     * The two languages the switch flips between: `[left, right]`.
     *
     * English always holds the right-hand side and the user's language the left, so
     * a fresh install offers the browser's language next to English without asking.
     * Either side can be replaced from the switch; what the user picked is `stored`.
     * A browser in English has no "own" language to put on the left, so it gets
     * Spanish, the second language the extension was written in.
     */
    function languagePair(stored) {
        const valid =
            Array.isArray(stored) && stored.length === 2 && stored.every(isSupported) && stored[0] !== stored[1];
        if (valid) return [...stored];
        const detected = detectBrowserLanguage();
        const left = detected === DEFAULT_LANGUAGE ? 'es' : detected;
        return [isSupported(left) ? left : SUPPORTED_LANGUAGES[1]?.code, DEFAULT_LANGUAGE];
    }

    root.ItgLanguages = Object.freeze({
        SUPPORTED_LANGUAGES,
        DEFAULT_LANGUAGE,
        /** Key in `chrome.storage.local` holding the user's choice. */
        STORAGE_KEY: 'preferred-language',
        /** Key in `chrome.storage.local` holding the two languages on the switch. */
        PAIR_STORAGE_KEY: 'language-switch-pair',
        isSupported,
        languagePair,
        resolveLanguage,
        detectBrowserLanguage,
        pickLanguage,
        localeOf,
    });
})(globalThis);
