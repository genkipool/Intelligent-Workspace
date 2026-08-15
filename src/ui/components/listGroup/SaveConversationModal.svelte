<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    /** @type {{ show: boolean, onClose: () => void, onSave: (title: string) => void }} */
    let { show = false, onClose, onSave } = $props();

    let title = $state('');
    let error = $state('');
    let saving = $state(false);

    function handleClose() {
        title = '';
        error = '';
        saving = false;
        onClose?.();
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            handleClose();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
    }

    function handleInput() {
        if (error) {
            error = '';
        }
    }

    async function handleSave() {
        const trimmed = title.trim();
        if (!trimmed) {
            error = $t('errorEmptyTitle');
            return;
        }

        saving = true;
        error = '';

        try {
            await onSave(trimmed);
            title = '';
            error = '';
        } catch (e) {
            error = e.message || $t('errorDuplicateConversationTitle');
        } finally {
            saving = false;
        }
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-conversation-title"
        tabindex="-1"
        use:dismissOnBackdrop={handleClose}
        onkeydown={handleKeydown}
    >
        <div class="modal-content save-conversation-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 id="save-conversation-title">{$t('saveConversationTitle')}</h2>
                <button type="button" class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button
                >
            </div>

            <div class="modal-body">
                <p>{$t('saveConversationDescription')}</p>
                <div class="modal-input-container">
                    <label for="save-conversation-name-input" class="visually-hidden">{$t('conversationTitle')}</label>
                    <div class="modal-input-container" class:input-error={!!error}>
                        <input
                            type="text"
                            id="save-conversation-name-input"
                            placeholder={$t('conversationTitlePlaceholder')}
                            autocomplete="off"
                            spellcheck="false"
                            translate="no"
                            maxlength="50"
                            bind:value={title}
                            oninput={handleInput}
                            onkeydown={handleKeydown}
                        />
                    </div>
                    {#if error}
                        <p class="error-message">{error}</p>
                    {/if}
                </div>
            </div>

            <div class="modal-actions">
                <button
                    type="button"
                    class="modal-btn-save"
                    class:error-state={!!error}
                    disabled={saving}
                    onclick={handleSave}
                >
                    {saving ? $t('saving') : $t('save')}
                </button>
            </div>
        </div>
    </div>
{/if}
