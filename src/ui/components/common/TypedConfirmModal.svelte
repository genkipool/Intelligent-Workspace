<script>
    import ModalShell from './ModalShell.svelte';
    import { t } from '../../stores/i18nStore.js';

    /**
     * Confirmation modal that only enables its action once the user types a word.
     * Two copies of this existed (delete all bookmarks, delete history) that differed
     * only in their title, their body and the action they ran.
     *
     * The word to type is taken from the translation, never hardcoded: the bookmarks
     * copy asked for "delete" while the Spanish label told the user to write
     * "eliminar", so that modal could not be completed in Spanish.
     *
     * @typedef {object} Props
     * @property {boolean} [show]
     * @property {string} titleId - Id for the heading, referenced by aria-labelledby.
     * @property {string} title - Heading text.
     * @property {() => Promise<void>|void} onConfirm - Runs when the word matches.
     * @property {() => void} [onClose]
     * @property {import('svelte').Snippet} [body] - Contents of the modal body.
     */
    let { show = false, titleId, title, onConfirm, onClose, body } = $props();

    let input = $state('');
    let deleting = $state(false);

    // The expected word follows the interface language.
    let requiredWord = $derived(($t('delete') || 'delete').trim().toLowerCase());
    let canDelete = $derived(input.trim().toLowerCase() === requiredWord);

    // Reset whenever it is opened, so a previous attempt is never left behind.
    $effect(() => {
        if (show) {
            input = '';
            deleting = false;
        }
    });

    function handleClose() {
        if (deleting) return;
        input = '';
        onClose?.();
    }

    async function handleDelete() {
        if (!canDelete || deleting) return;
        deleting = true;
        try {
            await onConfirm?.();
        } catch (e) {
            console.error(e);
        } finally {
            deleting = false;
            handleClose();
        }
    }
</script>

{#if show}
    <ModalShell {titleId} {title} contentClass="delete-bookmarks-confirm-modal" onclose={handleClose}>
        <div class="modal-body">
            {@render body?.()}
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
                type="button"
                id="final-delete-bookmarks-btn"
                class="modal-btn-delete"
                disabled={!canDelete || deleting}
                onclick={handleDelete}
            >
                {deleting ? '...' : $t('delete')}
            </button>
        </div>
    </ModalShell>
{/if}
