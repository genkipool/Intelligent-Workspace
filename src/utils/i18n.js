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
            if (!response.ok) return lang === 'en' ? {} : await loadMessages('en');
            const data = await response.json();

            // Keep the synchronous cache in sync for the next language swap.
            localStorage.setItem('i18n-cache-messages', JSON.stringify(data));
            localStorage.setItem('i18n-cache-lang', lang);

            return data;
        } catch (error) {
            console.error(`Error fetching messages for ${lang}:`, error);
            messagesCache.delete(lang);
            if (lang !== 'en') return await loadMessages('en');
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

export function getCurrentLang() {
    langPromise ??= (async () => {
        try {
            const result = await chrome.storage.local.get('preferred-language');
            const lang = result['preferred-language'] || (chrome.i18n.getUILanguage().startsWith('es') ? 'es' : 'en');

            // Keep the synchronous cache in step for the next language swap.
            localStorage.setItem('i18n-cache-lang', lang);

            return lang;
        } catch (error) {
            console.error("[i18n.js] Error getting language from storage, defaulting to 'en':", error);
            langPromise = null;
            return 'en';
        }
    })();
    return langPromise;
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['preferred-language']) langPromise = null;
});

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
        const messageObj = messages[key];
        let titleText = '';

        if (messageObj) {
            const field = messageObj.description?.trim() ? 'description' : 'message';
            titleText = resolveMessage(messageObj, readParams(element, 'i18nTitleParams', key), field) || key;
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

export async function initializeTranslations(languageToggle, langEn, langEs) {
    const initialLang = await getCurrentLang();
    if (languageToggle && langEn && langEs) {
        languageToggle.checked = initialLang === 'es';
        updateLanguageIndicator(initialLang, langEn, langEs);
    }
    await applyTranslations();
}

export function updateLanguageIndicator(lang, langEn, langEs) {
    if (!langEn || !langEs) return;
    langEn.style.fontWeight = lang === 'en' ? 'bold' : 'normal';
    langEs.style.fontWeight = lang === 'es' ? 'bold' : 'normal';
}

// Variables to manage the import notification queue
let importNotificationQueue = [];
let isNotificationVisible = false;

export async function showNotification(messageKey, isError = false, params = [], notificationQueue = false) {
    const lang = await getCurrentLang();
    const messages = await loadMessages(lang);

    let messageTemplate = messages[messageKey]?.message || 'Message not found';

    if (params.length > 0) {
        messageTemplate = replacePlaceholders(messageTemplate, params);
    }

    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'notification-error' : 'notification-success'}`;
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

    const showNotificationNow = () => {
        targetParent.appendChild(notification);
        const notificationHeight = notification.offsetHeight;
        notification.style.setProperty('--notification-height', `${notificationHeight}px`);
        isNotificationVisible = true;

        notification.addEventListener(
            'animationend',
            () => {
                if (notification.parentNode) {
                    notification.remove();
                }
                isNotificationVisible = false;
                // Show the next import notification if any in the queue
                if (importNotificationQueue.length > 0) {
                    const nextNotification = importNotificationQueue.shift();
                    nextNotification();
                }
            },
            { once: true },
        );
    };

    if (notificationQueue) {
        // Add to the queue and execute if no notification is visible
        importNotificationQueue.push(showNotificationNow);
        if (!isNotificationVisible) {
            const nextNotification = importNotificationQueue.shift();
            nextNotification();
        }
    } else {
        // Show immediately for non-import related notifications
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
