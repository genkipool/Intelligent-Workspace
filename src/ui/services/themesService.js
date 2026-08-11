/**
 * ThemesService — domain logic for theme management.
 *
 * Handles theme application, persistence, and custom theme colors.
 */

import { storageService } from './storage.js';

export const themesService = {
    /**
     * Apply a theme by name to the document root.
     */
    apply(themeName) {
        const root = document.documentElement;
        if (themeName === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
            root.style.cssText = '';
        } else {
            root.setAttribute('data-theme', themeName);
            if (themeName !== 'custom') {
                root.style.cssText = '';
            }
        }
    },

    /**
     * Apply custom theme colors as CSS variables.
     */
    applyCustom(colors) {
        if (!colors) return;
        const root = document.documentElement;
        root.setAttribute('data-theme', 'custom');
        const vars = Object.entries(colors).map(
            ([key, val]) => `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${val}`,
        );
        root.style.cssText = vars.join(';');
    },

    /**
     * Extract current computed CSS variable colors.
     */
    extractColors() {
        const cs = getComputedStyle(document.documentElement);
        const keys = [
            'bgColor',
            'bgPanelColor',
            'textColor',
            'textOnColor',
            'actionColor',
            'interactiveColor',
            'borderColor',
            'errorColor',
            'headerColor',
        ];
        const colors = {};
        keys.forEach((key) => {
            const val = cs.getPropertyValue(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`).trim();
            colors[key] = val ? rgbToHex(val) : val;
        });
        return colors;
    },

    /**
     * Load the active theme from storage.
     */
    async getActive() {
        const { activeTheme } = await storageService.get(['activeTheme'], 'local');
        return activeTheme || null;
    },

    /**
     * Save the active theme to storage.
     */
    async saveActive(theme) {
        await storageService.set({ activeTheme: theme }, 'local');
        chrome.runtime.sendMessage({ action: 'themeChanged' });
    },

    /**
     * Set and persist a theme.
     */
    async setTheme(themeName) {
        themesService.apply(themeName);
        const colors = themesService.extractColors();
        await themesService.saveActive({ name: themeName, colors });
    },

    /**
     * Initialize theme from storage.
     */
    async init() {
        const active = await themesService.getActive();
        if (active && active.name) {
            if (active.colors) {
                themesService.applyCustom(active.colors);
            } else {
                themesService.apply(active.name);
            }
            return active.name;
        }
        themesService.apply('viridian');
        return 'viridian';
    },

    /**
     * Subscribe to theme storage changes.
     */
    subscribe(callback) {
        const handler = (changes) => {
            if (changes.activeTheme) {
                const theme = changes.activeTheme.newValue;
                if (theme && theme.name) {
                    callback(theme);
                }
            }
        };
        storageService.onChanged(handler);
        return () => {};
    },
};

function rgbToHex(rgb) {
    if (!rgb || !rgb.startsWith('rgb')) return rgb;
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toLowerCase();
}
