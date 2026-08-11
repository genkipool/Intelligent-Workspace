function applyTheme(theme) {
    const root = document.documentElement;

    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        root.style.cssText = '';
    } else {
        root.setAttribute('data-theme', theme);
        // When it's not a custom or system theme, we clear the inline styles.
        if (theme !== 'custom') {
            root.style.cssText = '';
        }
    }
}

// Function to apply a custom theme using CSS variables
function applyCustomTheme(customThemeColors) {
    const root = document.documentElement;
    if (!customThemeColors) return;

    // Set the data-theme to 'custom' to ensure these styles take precedence.
    root.setAttribute('data-theme', 'custom');

    const vars = Object.entries(customThemeColors).map(
        ([key, val]) => `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${val}`,
    );
    root.style.cssText = vars.join(';');
}

// Mirror theme to localStorage for synchronous access (prevents white flash)
function mirrorThemeToLocalStorage(theme) {
    try {
        if (typeof theme === 'string') {
            localStorage.setItem('theme-mirror', theme);
        } else if (theme && theme.name) {
            localStorage.setItem('theme-mirror', theme.name);
            if (theme.colors) {
                localStorage.setItem('theme-custom-colors', JSON.stringify(theme.colors));
            } else {
                localStorage.removeItem('theme-custom-colors');
            }
        }
    } catch (e) {
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
    } catch (e) {
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

async function initializeActiveTheme() {
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
