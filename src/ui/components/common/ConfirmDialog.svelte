<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { confirmRequest } from '../../stores/confirmStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let confirmButton = $state(null);

    // The confirming action is the one the user came for, so it takes focus — the same
    // thing the native dialog did, without taking over the page.
    $effect(() => {
        if ($confirmRequest && confirmButton) confirmButton.focus();
    });

    function accept() {
        $confirmRequest?.resolve(true);
    }

    function reject() {
        $confirmRequest?.resolve(false);
    }

    function text(request) {
        return request.message ?? $t(request.messageKey, request.params ?? []);
    }
</script>

{#if $confirmRequest}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabindex="-1"
        use:dismissOnBackdrop={reject}
        onkeydown={(e) => e.key === 'Escape' && reject()}
    >
        <div class="modal-content confirm-dialog" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 id="confirm-dialog-title">{$t($confirmRequest.titleKey)}</h2>
                <button type="button" class="close-modal-btn" title={$tt('close')} onclick={reject}>&times;</button>
            </div>
            <div class="modal-body">
                <p>{text($confirmRequest)}</p>
            </div>
            <div class="modal-actions">
                <button
                    type="button"
                    bind:this={confirmButton}
                    class={$confirmRequest.danger ? 'modal-btn-delete' : 'modal-btn-save'}
                    onclick={accept}
                >
                    {$t($confirmRequest.confirmKey)}
                </button>
                <button type="button" class="modal-btn-cancel" onclick={reject}>{$t('cancel')}</button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Scoped to the component on purpose: this dialog is mounted on pages whose
       stylesheets do not all define the shared modal classes, so it would render
       unstyled there. Everything is expressed with the theme variables, so it follows
       whichever theme the user has selected. */
    .modal-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10001;
    }

    .modal-content {
        background-color: var(--bg-panel-color);
        color: var(--text-color);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
        width: 380px;
        max-width: min(90vw, 380px);
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 18px;
        border-bottom: 1px solid var(--border-color);
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--header-color);
    }

    .close-modal-btn {
        background: none;
        border: none;
        color: var(--text-color);
        font-size: 1.4rem;
        line-height: 1;
        cursor: pointer;
        padding: 0 4px;
        border-radius: 4px;
    }

    .close-modal-btn:hover {
        color: var(--interactive-color);
    }

    .modal-body {
        padding: 18px;
    }

    .modal-body p {
        margin: 0;
        line-height: 1.5;
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 0 18px 18px;
    }

    .modal-actions button {
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 0.9rem;
        cursor: pointer;
        background-color: var(--action-color);
        color: var(--text-color);
    }

    .modal-actions button:hover {
        border-color: var(--interactive-color);
    }

    /* Qualified so they outrank the shared `.modal-actions button` rule above. These
       mirror the app's own delete/save buttons so the dialog does not invent a
       different colour pairing. */
    .modal-actions .modal-btn-delete {
        background-color: var(--error-color);
        color: var(--text-color);
        border-color: transparent;
    }

    .modal-actions .modal-btn-delete:hover {
        filter: brightness(1.1);
        border-color: transparent;
    }

    .modal-actions .modal-btn-save {
        background-color: var(--action-color);
        color: var(--text-color);
        border-color: transparent;
    }

    .modal-actions .modal-btn-save:hover {
        background-color: var(--bg-color);
        color: var(--text-on-color);
        box-shadow: 0 0 5px 1px var(--interactive-color);
    }

    .modal-actions .modal-btn-cancel {
        background-color: var(--bg-color);
        color: var(--text-color);
        border-color: var(--border-color);
    }

    .modal-actions .modal-btn-cancel:hover {
        background-color: var(--border-color);
    }

    /* In the side panel every modal is capped so it fits. */
    @media (max-width: 600px) {
        .modal-content {
            width: 100%;
            max-width: min(350px, calc(100vw - 16px));
        }
    }

    .modal-actions button:focus-visible {
        outline: 2px solid var(--interactive-color);
        outline-offset: 2px;
    }
</style>
