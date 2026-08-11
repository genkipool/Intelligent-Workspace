import { writable } from 'svelte/store';

/**
 * Promise-based confirmation, so nothing in the UI has to fall back to the browser's
 * own `confirm()` box.
 *
 * A native dialog blocks the whole page, ignores the extension's theme and cannot be
 * dismissed the way the rest of the UI is. Callers `await confirmAction(...)` exactly
 * as they used to call `confirm()`, and a single mounted <ConfirmDialog> renders it in
 * the app's own style.
 */
export const confirmRequest = writable(null);

/**
 * @param {{ messageKey?: string, message?: string, params?: string[],
 *           titleKey?: string, confirmKey?: string, danger?: boolean }} options
 * @returns {Promise<boolean>} Whether the user confirmed.
 */
export function confirmAction(options) {
    return new Promise((resolve) => {
        confirmRequest.set({
            titleKey: 'confirmActionTitle',
            confirmKey: 'confirm',
            danger: true,
            ...options,
            resolve: (accepted) => {
                confirmRequest.set(null);
                resolve(accepted);
            },
        });
    });
}
