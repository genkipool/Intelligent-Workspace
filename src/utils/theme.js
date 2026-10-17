function applyTheme(theme) {
    const root = document.documentElement;

    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const targetTheme = prefersDark ? 'dark' : 'light';
        if (root.getAttribute('data-theme') !== targetTheme) {
            root.setAttribute('data-theme', targetTheme);
        }
        if (root.style.cssText) {
            root.style.cssText = '';
        }
    } else {
        if (root.getAttribute('data-theme') !== theme) {
            root.setAttribute('data-theme', theme);
        }
        // When it's not a custom or system theme, we clear the inline styles.
        if (theme !== 'custom' && root.style.cssText) {
            root.style.cssText = '';
        }
    }
}

/**
 * Whether a theme value is a plain CSS colour.
 *
 * Every theme key is a colour, and themes arrive from imported files, sync storage and
 * the agent, so a value is untrusted text. Without this check a value such as
 * `#0af; background-image:url(https://…)` would be spliced into the root element's
 * inline style and add arbitrary declarations (tracking requests, hidden content) to
 * every extension page that applies the theme.
 *
 * @param {unknown} val
 * @returns {boolean}
 */
function isThemeColor(val) {
    if (typeof val !== 'string' || !val.trim() || val.length > 200) return false;
    // A colour never needs these; refusing them keeps the value a single declaration
    // even where CSS.supports is unavailable (tests, old engines).
    if (/[;{}<>\\]/.test(val)) return false;
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
        return CSS.supports('color', val);
    }
    return true;
}

/**
 * Returns a copy of a theme's colours keeping only well-formed keys whose value is a
 * CSS colour (see isThemeColor); anything else is dropped so the page falls back to the
 * stylesheet's own value for that variable.
 *
 * @param {Record<string, unknown>} colors
 * @returns {Record<string, string>}
 */
function sanitizeThemeColors(colors) {
    const clean = {};
    if (!colors || typeof colors !== 'object') return clean;
    for (const [key, val] of Object.entries(colors)) {
        if (/^[A-Za-z][A-Za-z0-9]*$/.test(key) && isThemeColor(val)) clean[key] = val;
    }
    return clean;
}

// Function to apply a custom theme using CSS variables
function applyCustomTheme(customThemeColors) {
    const root = document.documentElement;
    if (!customThemeColors) return;

    // Set the data-theme to 'custom' to ensure these styles take precedence.
    root.setAttribute('data-theme', 'custom');

    // Clear the previous theme's variables, then set each one through setProperty with a
    // validated colour: building a cssText string would let a value carry extra
    // declarations of its own.
    root.style.cssText = '';
    for (const [key, val] of Object.entries(sanitizeThemeColors(customThemeColors))) {
        root.style.setProperty(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, val);
    }
}

// Mirror theme to localStorage for synchronous access (prevents white flash)
function mirrorThemeToLocalStorage(theme) {
    try {
        if (typeof theme === 'string') {
            localStorage.setItem('theme-mirror', theme);
        } else if (theme && theme.name) {
            localStorage.setItem('theme-mirror', theme.name);
            if (theme.colors) {
                // theme-init.js applies the mirror before any module loads, so only the
                // validated colours are mirrored for it.
                localStorage.setItem('theme-custom-colors', JSON.stringify(sanitizeThemeColors(theme.colors)));
            } else {
                localStorage.removeItem('theme-custom-colors');
            }
        }
    } catch {
        // Silently fail if localStorage is not available
    }
}

/**
 * Applies the theme held in the localStorage mirror.
 *
 * chrome.storage is asynchronous, so the saved theme cannot be known before the first
 * paint — which is why every save also mirrors it here. Reading it back synchronously
 * is the half that was missing: without it the page paints with the default palette
 * and re-colours itself once the async read lands.
 *
 * @returns {boolean} Whether a mirrored theme was found and applied.
 */
function applyMirroredTheme() {
    try {
        const name = localStorage.getItem('theme-mirror');
        if (!name) return false;
        const colors = localStorage.getItem('theme-custom-colors');
        if (colors) applyCustomTheme(JSON.parse(colors));
        else applyTheme(name);
        return true;
    } catch {
        return false;
    }
}

// Function to save the theme preference
function saveThemePreference(theme) {
    chrome.storage.local.set({ 'preferred-theme': theme });
    mirrorThemeToLocalStorage(theme);
}

// Function to load the theme preference
async function loadThemePreference() {
    return new Promise((resolve) => {
        chrome.storage.local.get('preferred-theme', (data) => {
            const theme = data['preferred-theme'] || 'viridian';
            mirrorThemeToLocalStorage(theme);
            resolve(theme);
        });
    });
}

// Initialize the theme when the page loads
async function initializeTheme() {
    const preferredTheme = await loadThemePreference();
    applyTheme(preferredTheme);
}

async function saveActiveTheme(theme) {
    try {
        await chrome.storage.local.set({ activeTheme: theme });
        mirrorThemeToLocalStorage(theme);
        chrome.runtime.sendMessage({ action: 'themeChanged' });
    } catch (error) {
        console.error('Error saving active theme:', error);
    }
}

let watchingActiveTheme = false;

/**
 * Follows the active theme wherever it is changed from. A schedule switches it from the
 * worker, and its `themeChanged` notice only reached the pages that listen for it: the
 * themes page showed the new theme ticked and kept the old colours until reloaded.
 */
function watchActiveTheme() {
    if (watchingActiveTheme || !chrome.storage?.onChanged) return;
    watchingActiveTheme = true;
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.activeTheme) initializeActiveTheme();
    });
}

async function initializeActiveTheme() {
    watchActiveTheme();
    const { activeTheme } = await chrome.storage.local.get(['activeTheme']);
    if (activeTheme && activeTheme.name) {
        mirrorThemeToLocalStorage(activeTheme);
        // Apply custom colors if they exist, otherwise just set the theme name
        if (activeTheme.colors) {
            applyCustomTheme(activeTheme.colors);
        } else {
            applyTheme(activeTheme.name);
        }
    } else {
        // Fallback for first use or if no active theme is saved.
        const preferredTheme = await loadThemePreference();
        applyTheme(preferredTheme);
    }
}

async function getActiveTheme() {
    const { activeTheme } = await chrome.storage.local.get('activeTheme');
    return activeTheme || null;
}

// Export functions to use in other files
export {
    isThemeColor,
    sanitizeThemeColors,
    applyTheme,
    applyMirroredTheme,
    applyCustomTheme,
    saveThemePreference,
    loadThemePreference,
    initializeTheme,
    saveActiveTheme,
    getActiveTheme,
    initializeActiveTheme,
};
