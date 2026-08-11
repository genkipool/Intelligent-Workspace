<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let { show = false, dateLabel = '', urlsToDelete = [], onClose, onDeleted } = $props();

    let input = $state('');
    let deleting = $state(false);
    let requiredWord = $state('');

    $effect(() => {
        if (show) {
            const word = chrome.i18n.getMessage('delete') || 'delete';
            requiredWord = word.trim().toLowerCase();
            input = '';
            deleting = false;
        }
    });

    let canDelete = $derived(input.trim().toLowerCase() === requiredWord);

    function handleClose() {
        if (deleting) return;
        input = '';
        onClose?.();
    }

    async function handleDelete() {
        if (!canDelete || deleting) return;
        deleting = true;

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'deleteHistoryUrls',
                urls: urlsToDelete,
            });

            if (response?.success) {
                onDeleted?.();
            }
        } catch (e) {
            console.error(e);
        } finally {
            deleting = false;
            handleClose();
        }
    }

    let confirmTitle = $derived(chrome.i18n.getMessage('deleteHistoryForDate') || 'Delete History');
    let confirmDesc = $derived(
        chrome.i18n.getMessage('deleteHistoryConfirmDesc') || 'Are you sure you want to delete all history items for:',
    );
    let warningText = $derived(chrome.i18n.getMessage('actionCannotBeUndone') || 'This action cannot be undone.');
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-history-title"
        tabindex="-1"
        use:dismissOnBackdrop={handleClose}
        onkeydown={(e) => e.key === 'Escape' && handleClose()}
    >
        <div class="modal-content delete-bookmarks-confirm-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 id="delete-history-title">{confirmTitle}</h2>
                <button class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button>
            </div>
            <div class="modal-body">
                <p>
                    {confirmDesc} <strong>{dateLabel}</strong>?<br />
                    <span class="modal-warning-text">{warningText}</span>
                </p>
                <div class="modal-input-container">
                    <label for="delete-confirm-input">{$t('deleteAllBookmarksConfirmLabel')}</label>
                    <input
                        type="text"
                        id="delete-confirm-input"
                        autocomplete="off"
                        spellcheck="false"
                        translate="no"
                        bind:value={input}
                        disabled={deleting}
                        onkeydown={(e) => e.key === 'Enter' && canDelete && handleDelete()}
                    />
                </div>
            </div>
            <div class="modal-actions">
                <button
                    id="final-delete-bookmarks-btn"
                    class="modal-btn-delete"
                    disabled={!canDelete || deleting}
                    onclick={handleDelete}
                >
                    {deleting ? '...' : $t('delete')}
                </button>
            </div>
        </div>
    </div>
{/if}
