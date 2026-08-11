import { showNotification } from './i18n.js';

/**
 * Utility function to copy text to the clipboard and show a standard notification.
 *
 * @param {string} text - The text to copy to the clipboard.
 * @param {string} successKey - The i18n translation key for the success message.
 * @param {string} errorKey - The i18n translation key for the error message.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function copyToClipboard(text, successKey = 'addressCopied', errorKey = 'errorCopyingAddress') {
    if (!text) return false;

    try {
        await navigator.clipboard.writeText(text);
        showNotification(successKey);
        return true;
    } catch (err) {
        console.error('Failed to copy text to clipboard: ', err);
        showNotification(errorKey, true);
        return false;
    }
}
