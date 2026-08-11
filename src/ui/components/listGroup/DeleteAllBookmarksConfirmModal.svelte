<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let { show = false, onClose } = $props();

    let input = $state('');
    let deleting = $state(false);
    let requiredWord = $state('delete');

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
            await chrome.runtime.sendMessage({ action: 'deleteAllBookmarks' }, (response) => {
                if (chrome.runtime.lastError || !response?.success) {
                    console.error('Error deleting bookmarks:', chrome.runtime.lastError?.message);
                }
            });
        } catch (e) {
            console.error(e);
        } finally {
            deleting = false;
            handleClose();
        }
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-bookmarks-title"
        tabindex="-1"
        use:dismissOnBackdrop={handleClose}
        onkeydown={(e) => e.key === 'Escape' && handleClose()}
    >
        <div class="modal-content delete-bookmarks-confirm-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 id="delete-bookmarks-title">{$t('deleteAllBookmarksConfirmTitle')}</h2>
                <button class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button>
            </div>
            <div class="modal-body">
                <p>{$t('deleteAllBookmarksConfirmDesc')}</p>
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
