/**
 * Binds save/add button: normal click saves and closes; Ctrl/Cmd+click saves and keeps modal open.
 * @param {HTMLElement} btn
 * @param {{ onSave: (e: MouseEvent) => boolean|Promise<boolean>, close?: () => void, i18nTitleKey?: string }} options
 */
export function bindModalSaveButton(btn, { onSave, close, i18nTitleKey = 'modalSaveCloseHint' }) {
    if (!btn) return;

    const hint = chrome.i18n.getMessage(i18nTitleKey);
    if (hint) btn.title = hint;

    btn.addEventListener('click', async (e) => {
        const keepOpen = e.ctrlKey || e.metaKey;
        const ok = await onSave(e);
        if (ok && !keepOpen && typeof close === 'function') {
            close();
        }
    });
}
