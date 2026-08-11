// Inject translations from localStorage synchronous cache instantly
document.addEventListener('DOMContentLoaded', () => {
    try {
        const cachedLang = localStorage.getItem('i18n-cache-lang');
        const cachedMessagesStr = localStorage.getItem('i18n-cache-messages');

        if (cachedMessagesStr && cachedLang) {
            const messages = JSON.parse(cachedMessagesStr);

            // 1. Direct texts (textContent)
            document.querySelectorAll('[data-i18n]').forEach((el) => {
                const key = el.getAttribute('data-i18n');
                if (messages[key] && messages[key].message && !el.textContent) {
                    let text = messages[key].message;
                    // The fast init skips complex placeholders so parameters are not mangled
                    if (!text.includes('$')) {
                        el.textContent = text;
                    }
                }
            });

            // 2. Titles / Tooltips
            document.querySelectorAll('[data-i18n-title]').forEach((el) => {
                const key = el.getAttribute('data-i18n-title');
                if (messages[key] && !el.title) {
                    const text = messages[key].description || messages[key].message || key;
                    if (!text.includes('$')) {
                        el.title = text;
                    }
                }
            });

            // 3. Placeholders
            document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (messages[key] && messages[key].message && !el.getAttribute('placeholder')) {
                    if (el.tagName === 'DIV' && el.isContentEditable) {
                        el.setAttribute('data-i18n-placeholder', messages[key].message);
                    } else {
                        el.setAttribute('placeholder', messages[key].message);
                    }
                }
            });

            // 4. Aria Labels
            document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
                const key = el.getAttribute('data-i18n-aria-label');
                if (messages[key] && messages[key].message && !el.getAttribute('aria-label')) {
                    el.setAttribute('aria-label', messages[key].message);
                }
            });
        }
    } catch (error) {
        console.error('[i18n-init.js] Error aplicando traducciones cacheadas:', error);
    }
});
