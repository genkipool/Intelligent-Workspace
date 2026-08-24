<script>
    /**
     * [AI INSTRUCTION]
     * THE CHROME BOTH RULE DIALOGS WEAR.
     *
     * Deliberately the plain modal chrome the rest of the extension uses — the same
     * head, body and footer as the Gemini schedule dialog — rather than a shape of
     * its own. A dashboard is not a different product from the group list, and a
     * dialog that announces itself with its own header is how it starts looking like
     * one.
     *
     * There is no cancel button. The close cross is the way out of every dialog in
     * the extension, and a second control that does exactly the same thing only
     * makes the confirming action harder to find. That leaves one button, which
     * fills the row.
     */
    import { dismissOnBackdrop } from '../../../actions/dismissOnBackdrop.js';
    import ModalSaveButton from '../../../components/common/ModalSaveButton.svelte';
    import ModalHeader from '../../../components/common/ModalHeader.svelte';

    let {
        titleId,
        title,
        applyLabel,
        errorMessage = '',
        disabled = false,
        danger = false,
        /** An extra class on the dialog, for the one that needs a height of its own. */
        variant = '',
        onApply,
        onClose,
        children,
    } = $props();
</script>

<div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    use:dismissOnBackdrop={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
>
    <div class="modal-content wa-modal {variant}" role="none" onclick={(e) => e.stopPropagation()}>
        <ModalHeader {titleId} {title} {onClose} />

        <div class="modal-body wa-modal-body">
            {@render children()}
        </div>

        <div class="modal-actions wa-modal-actions">
            {#if variant !== 'wa-password-modal'}
                <p class="wa-modal-warning" aria-live="polite">{errorMessage || ''}</p>
            {/if}
            <ModalSaveButton
                label={applyLabel}
                danger={danger || !!errorMessage}
                disabled={disabled || !!errorMessage}
                onclick={onApply}
            />
        </div>
    </div>
</div>
