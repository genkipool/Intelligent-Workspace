import { showNotification } from '../../../../utils/i18n.js';
// EN: Gets the appropriate storage area (sync or local).

// EN: Gets settings from the determined storage area.

// EN: Saves settings to the determined storage area.

// EN: Gets the 'customRules' from the correct storage area.

// EN: Saves the 'customRules' to the correct storage area with error handling.
export async function getSettingsStorage() {
    const { ruleStorageArea = 'sync' } = await chrome.storage.local.get('ruleStorageArea');
    return ruleStorageArea === 'local' ? chrome.storage.local : chrome.storage.sync;
}
export async function getSettings(keys) {
    const storage = await getSettingsStorage();
    return await storage.get(keys);
}
export async function saveSettings(items) {
    const storage = await getSettingsStorage();
    return await storage.set(items);
}
export async function getRuleStorage() {
    const storage = await getSettingsStorage();
    return await storage.get('customRules');
}
export async function setRuleStorage(rules) {
    const storage = await getSettingsStorage();
    return new Promise((resolve, reject) => {
        storage.set(
            {
                customRules: rules,
            },
            () => {
                if (chrome.runtime.lastError) {
                    const errorMessage = chrome.runtime.lastError.message.toLowerCase();
                    console.error('Error saving rules to storage:', errorMessage);
                    if (errorMessage.includes('quota_bytes')) {
                        showNotification('errorQuotaExceeded', true);
                        reject(new Error('Storage quota exceeded'));
                    } else if (errorMessage.includes('max_write_operations')) {
                        showNotification('errorRateLimitExceeded', true);
                        reject(new Error('Write rate limit exceeded'));
                    } else {
                        showNotification('errorSavingRule', true);
                        reject(chrome.runtime.lastError);
                    }
                } else {
                    resolve();
                }
            },
        );
    });
}

// EN: Sends a message to the background script to regroup all tabs.
export function groupTabs() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            {
                action: 'groupTabs',
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        'Error sending groupTabs message Error al enviar mensaje groupTabs:',
                        chrome.runtime.lastError,
                    );
                } else if (response && response.error) {
                    console.error(
                        'Error from background script during groupTabs Error del script de fondo en groupTabs:',
                        response.error,
                    );
                }
                resolve();
            },
        );
    });
}
