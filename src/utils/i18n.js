import './languages.js';

const Languages = globalThis.ItgLanguages;
export const SUPPORTED_LANGUAGES = Languages.SUPPORTED_LANGUAGES;
export const DEFAULT_LANGUAGE = Languages.DEFAULT_LANGUAGE;
export const LANGUAGE_STORAGE_KEY = Languages.STORAGE_KEY;
export const { resolveLanguage, pickLanguage, localeOf } = Languages;
export const isSupportedLanguage = Languages.isSupported;

export function replacePlaceholders(message, params) {
    if (!params || params.length === 0) return message;
    return message.replace(/\$(\d+)/g, (match, indexStr) => {
        const index = parseInt(indexStr, 10) - 1; // $1 maps to params[0]
        return params[index] !== undefined ? params[index] : match;
    });
}

/**
 * Resolves a messages.json entry the same way `chrome.i18n.getMessage()` does.
 *
 * Besides the positional `$1…$9` arguments, entries may declare named
 * placeholders (`"$URL$"` plus a `placeholders` map whose `content` points at a
 * positional argument). Reading `message` directly would leave the raw `$URL$`
 * visible, which is why every translation has to go through this function.
 */
export function resolveMessage(entry, params = [], field = 'message') {
    if (!entry) return '';
    const text = entry[field] || '';
    if (!text) return '';

    // Fast path: if there are no placeholders defined, no parameters provided,
    // and no special '$' symbols, return the raw string directly without regex passes.
    if (!entry.placeholders && (!params || params.length === 0) && !text.includes('$')) {
        return text;
    }

    let result = text;
    if (entry.placeholders) {
        result = result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$/g, (match, name) => {
            const placeholder = entry.placeholders[name] || entry.placeholders[name.toLowerCase()];
            return placeholder?.content ?? match;
        });
    }

    result = replacePlaceholders(result, params);
    return result.includes('$$') ? result.replace(/\$\$/g, '$') : result;
}

/**
 * The entry a tooltip is read from: `<key>_tooltip` when the control has hover text
 * of its own, otherwise the label itself. `description` is left to translators, as
 * Chrome intends; it is never shown to the user.
 */
export function tooltipEntry(messages, key) {
    return messages?.[`${key}_tooltip`] || messages?.[key];
}

/** Reads a JSON array of substitutions from a data attribute, tolerating bad input. */
function readParams(element, datasetKey, messageKey) {
    const raw = element.dataset?.[datasetKey];
    if (!raw) return [];
    try {
        const params = JSON.parse(raw);
        return Array.isArray(params) ? params : [];
    } catch (e) {
        console.error(`Error parsing ${datasetKey} for ${messageKey}: ${raw}`, e);
        return [];
    }
}

// Loads are cached by promise, not by result: a page kicks off several translation
// consumers at once, and caching only the resolved value made every one of them fire
// its own fetch for the same file.
const messagesCache = new Map();

export function loadMessages(lang) {
    const cached = messagesCache.get(lang);
    if (cached) return cached;

    const request = (async () => {
        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
        try {
            const response = await fetch(url);
            if (!response.ok) return lang === DEFAULT_LANGUAGE ? {} : await loadMessages(DEFAULT_LANGUAGE);
            const data = await response.json();
            let finalData = data;
            // A translation may lag behind: whatever it lacks is shown in the default language.
            if (lang !== DEFAULT_LANGUAGE) {
                try {
                    const fallback = await loadMessages(DEFAULT_LANGUAGE);
                    finalData = { ...fallback, ...data };
                } catch {
                    finalData = data;
                }
            }

            return finalData;
        } catch (error) {
            console.error(`Error fetching messages for ${lang}:`, error);
            messagesCache.delete(lang);
            if (lang !== DEFAULT_LANGUAGE) return await loadMessages(DEFAULT_LANGUAGE);
            return {};
        }
    })();

    messagesCache.set(lang, request);
    return request;
}

// The language is read on every applyTranslations() call, so hitting storage each
// time turned a synchronous DOM update into a round-trip. It is cached here and
// invalidated by the storage listener below.
let langPromise = null;

/**
 * The language in use: the one picked with the switch, or — until the user picks
 * one — the browser's, so a fresh install opens in the language Chrome is in.
 */
export function getCurrentLang() {
    langPromise ??= (async () => {
        try {
            const result = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
            const lang = pickLanguage(result[LANGUAGE_STORAGE_KEY]);

            return lang;
        } catch (error) {
            console.error('[i18n.js] Error getting language from storage, using the browser language:', error);
            langPromise = null;
            return Languages.detectBrowserLanguage();
        }
    })();
    return langPromise;
}

/*
 * The dictionary of the language the user picked, for synchronous reads.
 *
 * `chrome.i18n.getMessage()` always answers in the browser's language, not in the one
 * chosen with the extension's en/es switch, so anything built imperatively in a page
 * came out in the other language whenever the two differed. `msg()` reads this
 * dictionary instead and only falls back to Chrome while it is still loading.
 */
let activeLang = null;
let activeMessages = null;

export function setActiveMessages(lang, messages) {
    if (!lang || !messages) return;
    // applyTranslations() runs for every item a list renders, so this is called
    // thousands of times with the same dictionary. Everything below touches the
    // document, and writing `<html lang>` — even the same value — invalidates the
    // style of the whole page: done per bookmark it turned a 0.3 s view into 4 s.
    if (lang === activeLang && messages === activeMessages) return;
    activeLang = lang;
    activeMessages = messages;
    if (typeof document === 'undefined' || !document.documentElement) return;

    // The document says which language it is in (screen readers, speech, hyphenation)
    // and its tab title follows the switch too.
    const tag = lang.replace('_', '-');
    if (document.documentElement.lang !== tag) document.documentElement.lang = tag;
    const title = document.querySelector('title[data-i18n]');
    const titleText = title && resolveMessage(messages[title.dataset.i18n], [], 'message');
    if (titleText && title.textContent !== titleText) title.textContent = titleText;

    // The synchronous cache i18n-init.js paints the first frame from. Only the
    // language actually in use is written, never a dictionary loaded speculatively.
    try {
        localStorage.setItem('i18n-cache-messages', JSON.stringify(messages));
        localStorage.setItem('i18n-cache-lang', lang);
    } catch {
        // Storage full or unavailable: the first frame just waits for the fetch.
    }
}

/** Loads the dictionary of the current language and makes it the one `msg()` reads. */
export async function primeActiveMessages() {
    const lang = await getCurrentLang();
    const messages = await loadMessages(lang);
    setActiveMessages(lang, messages);
    return messages;
}

/**
 * Drop-in replacement for `chrome.i18n.getMessage()` that follows the extension's
 * language setting. Same contract: a missing key yields an empty string.
 */
export function msg(key, substitutions) {
    const entry = activeMessages?.[key];
    if (entry) {
        const params =
            substitutions === undefined || substitutions === null
                ? []
                : Array.isArray(substitutions)
                  ? substitutions.map(String)
                  : [String(substitutions)];
        return resolveMessage(entry, params, 'message');
    }
    if (typeof chrome === 'undefined' || !chrome.i18n?.getMessage) return '';
    return chrome.i18n.getMessage(key, substitutions);
}

/**
 * The message key for `count` items: `<key>_one`, `<key>_other`… chosen by the
 * language's CLDR plural rules rather than by `count === 1`, which is wrong for
 * other languages and for zero in some of them. Falls back to `<key>_other`.
 */
export function pluralKey(key, count, locale = activeLocale(), messages = activeMessages) {
    const category = new Intl.PluralRules(locale).select(Number(count));
    const candidate = `${key}_${category}`;
    // Only fall back when the language lacks this form but has the general one
    // (Spanish has no "few"); a dictionary without the key at all keeps the exact form.
    return messages && !messages[candidate] && messages[`${key}_other`] ? `${key}_other` : candidate;
}

/** `msg()` for a counted phrase: `$1` is the count, further substitutions follow. */
export function plural(key, count, substitutions = []) {
    return msg(pluralKey(key, count), [String(count), ...[].concat(substitutions)]);
}

/** The code of the language in use, e.g. `es`, available synchronously. */
export function activeLanguage() {
    return activeLang || Languages.detectBrowserLanguage();
}

/** BCP 47 locale for dates and numbers, matching the extension's language. */
export function activeLocale() {
    return localeOf(activeLanguage());
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[LANGUAGE_STORAGE_KEY]) {
            langPromise = null;
            if (typeof window !== 'undefined') primeActiveMessages().catch(() => {});
        }
    });
}

if (typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime?.id) {
    primeActiveMessages().catch(() => {});
}

/**
 * Applies translations to the provided container (defaults to document).
 * Uses cached messages for maximum performance.
 * @param {HTMLElement|Document} container - The root element to start searching for translatable items.
 */
export async function applyTranslations(container = document) {
    // Callers hand us elements looked up by id or bound by the framework, which may
    // legitimately be absent while a view is unmounted; that is not an error.
    if (!container) return;

    const lang = await getCurrentLang();
    const messages = await loadMessages(lang);
    setActiveMessages(lang, messages);

    // 1. Handle elements with data-i18n (textContent)
    const i18nElements = container.querySelectorAll ? container.querySelectorAll('[data-i18n]') : [];

    // Also check the container itself if it's an element
    const targets =
        container !== document && container.hasAttribute && container.hasAttribute('data-i18n')
            ? [container, ...i18nElements]
            : i18nElements;

    targets.forEach((element) => {
        const key = element.getAttribute('data-i18n');
        const messageObj = messages[key];
        if (messageObj && messageObj.message) {
            element.textContent = resolveMessage(messageObj, readParams(element, 'params', key), 'message');
        } else {
            // Only set key as text if it doesn't look like an empty/placeholder tag
            if (key) element.textContent = key;
        }
    });

    // 2. Handle placeholders
    const placeholderElements = container.querySelectorAll ? container.querySelectorAll('[data-i18n-placeholder]') : [];
    const pTargets =
        container !== document && container.hasAttribute && container.hasAttribute('data-i18n-placeholder')
            ? [container, ...placeholderElements]
            : placeholderElements;

    pTargets.forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        const message = resolveMessage(messages[key], [], 'message');
        if (message) {
            if (el.tagName === 'DIV' && el.isContentEditable) {
                el.setAttribute('data-i18n-placeholder', message);
            } else {
                el.setAttribute('placeholder', message);
            }
        }
    });

    // 3. Handle titles (tooltips)
    const titleElements = container.querySelectorAll ? container.querySelectorAll('[data-i18n-title]') : [];
    const tTargets =
        container !== document && container.hasAttribute && container.hasAttribute('data-i18n-title')
            ? [container, ...titleElements]
            : titleElements;

    tTargets.forEach((element) => {
        const key = element.getAttribute('data-i18n-title');
        const messageObj = tooltipEntry(messages, key);
        let titleText = '';

        if (messageObj) {
            titleText = resolveMessage(messageObj, readParams(element, 'i18nTitleParams', key), 'message') || key;
        } else {
            titleText = key;
        }
        element.title = titleText;
    });

    // 4. Handle aria-labels
    const ariaElements = container.querySelectorAll ? container.querySelectorAll('[data-i18n-aria-label]') : [];
    const aTargets =
        container !== document && container.hasAttribute && container.hasAttribute('data-i18n-aria-label')
            ? [container, ...ariaElements]
            : ariaElements;

    aTargets.forEach((element) => {
        const key = element.getAttribute('data-i18n-aria-label');
        const message = resolveMessage(messages[key], [], 'message');
        if (message) {
            element.setAttribute('aria-label', message);
        }
    });
}

export async function initializeTranslations() {
    await applyTranslations();
}

// Variables to manage the notification queue
let notificationQueueList = [];
let isNotificationVisible = false;

export async function showNotification(messageKey, isError = false, params = [], notificationQueue = false) {
    const isErr = isError === true || isError === 'error';
    const lang = await getCurrentLang();
    const messages = await loadMessages(lang);

    const messageObj = messages[messageKey];
    const messageTemplate = messageObj
        ? resolveMessage(messageObj, params, 'message')
        : messageKey || 'Message not found';

    const notification = document.createElement('div');
    notification.className = `notification ${isErr ? 'notification-error' : 'notification-success'}`;
    notification.textContent = messageTemplate;

    const openDialog = document.querySelector('dialog[open]');
    const targetParent = openDialog || document.body;

    let completeNotification = null;

    if (openDialog) {
        notification.classList.add('in-dialog');
        openDialog.addEventListener(
            'close',
            () => {
                if (notification.parentNode === openDialog) {
                    if (completeNotification) {
                        completeNotification();
                    } else {
                        notification.remove();
                    }
                }
            },
            { once: true },
        );
    }

    const showNotificationNow = () => {
        targetParent.appendChild(notification);
        const notificationHeight = notification.offsetHeight;
        notification.style.setProperty('--notification-height', `${notificationHeight}px`);
        isNotificationVisible = true;

        let completed = false;
        let fallbackTimer = null;
        completeNotification = () => {
            if (completed) return;
            completed = true;
            if (fallbackTimer) clearTimeout(fallbackTimer);
            if (notification.parentNode) {
                notification.remove();
            }
            isNotificationVisible = false;
            // Show the next notification if any in the queue
            if (notificationQueueList.length > 0) {
                const nextNotification = notificationQueueList.shift();
                nextNotification();
            }
        };

        notification.addEventListener('animationend', completeNotification, { once: true });
        fallbackTimer = setTimeout(completeNotification, 4000);
    };

    const useQueue = typeof notificationQueue === 'boolean' ? notificationQueue : !!notificationQueue?.queue;

    if (useQueue) {
        // Add to the queue and execute if no notification is visible
        notificationQueueList.push(showNotificationNow);
        if (!isNotificationVisible) {
            const nextNotification = notificationQueueList.shift();
            nextNotification();
        }
    } else {
        // Show immediately for non-queued notifications
        showNotificationNow();
    }
}

export async function showPersistentProgressNotification(messageKey, params = []) {
    const lang = await getCurrentLang();
    const messages = await loadMessages(lang);

    let messageTemplate = messages[messageKey]?.message || 'Message not found';
    if (params.length > 0) {
        messageTemplate = replacePlaceholders(messageTemplate, params);
    }

    const notification = document.createElement('div');
    notification.className = 'notification notification-success notification-persistent';
    notification.textContent = messageTemplate;

    const openDialog = document.querySelector('dialog[open]');
    const targetParent = openDialog || document.body;

    if (openDialog) {
        notification.classList.add('in-dialog');
        openDialog.addEventListener(
            'close',
            () => {
                if (notification.parentNode === openDialog) {
                    notification.remove();
                }
            },
            { once: true },
        );
    }

    targetParent.appendChild(notification);

    return {
        element: notification,
        updateProgress: async (newParams) => {
            let template = messages[messageKey]?.message || 'Message not found';
            notification.textContent = replacePlaceholders(template, newParams);
        },
        close: () => {
            if (notification.parentNode) {
                notification.remove();
            }
        },
    };
}

export function capitalizeFirstLetter(input) {
    if (input.value) {
        input.value = input.value.charAt(0).toUpperCase() + input.value.slice(1);
    }
    return input;
}

export function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Normalizes a URL for comparisons
export function normalizeUrl(url) {
    return url
        .toLowerCase()
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .replace(/\/$/, '');
}
