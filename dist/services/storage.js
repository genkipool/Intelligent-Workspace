/**
 * [AI INSTRUCTION]
 * CENTRALIZED STORAGE SERVICE
 * Use this service for all chrome.storage operations. Do NOT use chrome.storage.local.get/set directly in new code!
 * This handles dynamic storage areas (sync vs local) automatically for themes and rules.
 */

const StorageService = {
    /**
     * Gets the active storage area for themes and rules based on user settings.
     * @returns {Promise<chrome.storage.StorageArea>}
     */
    async getThemeStorageArea() {
        const { themeStorageArea = 'sync' } = await chrome.storage.local.get('themeStorageArea');
        return chrome.storage[themeStorageArea];
    },

    /**
     * Gets data from local storage.
     * @param {string|string[]|Object|null} keys
     * @returns {Promise<Object>}
     */
    async getLocal(keys) {
        return await chrome.storage.local.get(keys);
    },

    /**
     * Sets data in local storage.
     * @param {Object} items
     * @returns {Promise<void>}
     */
    async setLocal(items) {
        return await chrome.storage.local.set(items);
    },

    /**
     * Gets custom rules from the appropriate storage area.
     * @returns {Promise<Array>} Array of custom rules
     */
    async getCustomRules() {
        const storage = await this.getThemeStorageArea();
        const data = await storage.get('customRules');
        return data.customRules || [];
    },

    /**
     * Saves custom rules to the appropriate storage area.
     * @param {Array} rules
     * @returns {Promise<void>}
     */
    async saveCustomRules(rules) {
        const storage = await this.getThemeStorageArea();
        return await storage.set({ customRules: rules });
    },

    /**
     * Gets saved themes from the appropriate storage area.
     * @returns {Promise<Array>} Array of saved themes
     */
    async getSavedThemes() {
        const storage = await this.getThemeStorageArea();
        const data = await storage.get('savedThemes');
        return data.savedThemes || [];
    },

    /**
     * Saves themes to the appropriate storage area.
     * @param {Array} themes
     * @returns {Promise<void>}
     */
    async saveSavedThemes(themes) {
        const storage = await this.getThemeStorageArea();
        return await storage.set({ savedThemes: themes });
    },

    /**
     * Gets the active theme configuration.
     * @returns {Promise<Object>} Active theme object
     */
    async getActiveTheme() {
        const data = await this.getLocal('activeTheme');
        return data.activeTheme || null;
    },

    /**
     * Saves the active theme configuration.
     * @param {Object} theme
     * @returns {Promise<void>}
     */
    async saveActiveTheme(theme) {
        return await this.setLocal({ activeTheme: theme });
    },

    /**
     * Clears the active theme configuration.
     * @returns {Promise<void>}
     */
    async clearActiveTheme() {
        return await chrome.storage.local.remove('activeTheme');
    },

    /**
     * Gets extension settings.
     * @returns {Promise<Object>} Settings object
     */
    async getSettings() {
        const data = await this.getLocal('extensionSettings');
        return data.extensionSettings || {};
    },
};

// Make it available globally in Service Worker context
if (typeof self !== 'undefined') {
    self.StorageService = StorageService;
}
