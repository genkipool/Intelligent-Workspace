<script>
    /**
     * [AI INSTRUCTION]
     * THE CONFIRMING BUTTON OF A DIALOG.
     *
     * The look is the one the API key dialog established and the rest of the group
     * list follows: a solid `--action-color` at rest, and on hover it hollows out to
     * the page background with an accent glow. It was written once in
     * `listGroup.css`, which meant every dialog on a page that does not load that
     * stylesheet — the dashboards, the block screen — had a differently shaped
     * button doing the same job.
     *
     * The styles are scoped, so they follow the component onto any page, and the
     * `.modal-btn-save` class is kept on the element so the page rules that already
     * target it keep matching. Scoped rules outrank them, so the look is the same
     * everywhere.
     *
     * A dialog has one of these and no cancel beside it: the close cross is the way
     * out, and a lone button fills the width of the row.
     */
    let {
        label = '',
        title = '',
        disabled = false,
        /** Turns the button red — for a confirmation that destroys something. */
        danger = false,
        onclick,
        children,
    } = $props();
</script>

<button type="button" class="modal-btn-save" class:is-danger={danger} {title} {disabled} onclick={() => onclick?.()}>
    {#if children}{@render children()}{/if}
    {label}
</button>

<style>
    .modal-btn-save {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        width: 100%;
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        background-color: var(--action-color);
        color: var(--text-color);
        font-family: inherit;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        transition:
            background-color 0.2s,
            box-shadow 0.2s,
            color 0.2s;
    }

    .modal-btn-save:hover:not(:disabled) {
        background-color: var(--bg-color);
        color: var(--text-on-color);
        box-shadow: 0 0 5px 1px var(--interactive-color);
    }

    .modal-btn-save.is-danger {
        background-color: var(--error-color);
        color: #fff;
    }

    .modal-btn-save.is-danger:hover:not(:disabled) {
        background-color: var(--bg-color);
        color: var(--error-color);
        box-shadow: 0 0 5px 1px var(--error-color);
    }

    .modal-btn-save:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .modal-btn-save.is-danger:disabled {
        background-color: var(--error-color);
        color: #fff;
        opacity: 0.6;
        cursor: not-allowed;
    }

    .modal-btn-save:focus-visible {
        outline: 2px solid var(--interactive-color);
        outline-offset: 2px;
    }
</style>
