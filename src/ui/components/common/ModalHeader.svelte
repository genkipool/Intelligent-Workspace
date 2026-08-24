<script>
    /**
     * [AI INSTRUCTION]
     * THE HEADER EVERY MODAL IN THE EXTENSION WEARS.
     *
     * One title, one cross, a hairline under both — the cookie editor's header, which
     * is the one the rest were meant to look like. It had been written out by hand in
     * every dialog, so they had drifted: the rules page closed with a `<span>x</span>`,
     * the theme scheduler with a `<button>x</button>` of its own, the cookie editor
     * with a `&times;`, and the three had different paddings and no rule under two of
     * them.
     *
     * WHY IT CARRIES ITS OWN CLASS NAMES. `itg-modal-header` and `itg-modal-close` are
     * styled here and nowhere else, so no page can reach in and change them. Reusing
     * `.modal-header` would have inherited whatever each page already says about that
     * class — which is exactly how the three of them drifted apart in the first place.
     * The styles below therefore state everything, including what a bare element would
     * have done anyway.
     *
     * The `×` is `--error-color` on hover, which is the convention everywhere here: the
     * cross is the way out of every dialog, and there is no Cancel button beside it.
     */
    import { t, tt } from '../../stores/i18nStore.js';

    let {
        title,
        /** For the dialog's `aria-labelledby`. */
        titleId = undefined,
        /** An extra class on the bar, for a dialog that needs to say something about it. */
        className = '',
        onClose,
        /** Anything that belongs in the bar between the title and the cross. */
        children = undefined,
    } = $props();
</script>

<div class="itg-modal-header {className}">
    <h2 id={titleId}>{title}</h2>
    {#if children}<div class="itg-modal-header-extra">{@render children()}</div>{/if}
    <button
        type="button"
        class="itg-modal-close"
        title={$tt('close')}
        aria-label={$t('close')}
        onclick={onClose}
        translate="no">&times;</button
    >
</div>

<style>
    .itg-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0;
        /* A stated height rather than one that falls out of the title's line box and
           the cross's font size, which differ with the page's type scale.
           `box-sizing` is stated with it and not left to the page: the rules page sets
           `content-box`, which added the padding *on top of* the 48 and made that one
           dialog's header half again as tall as everybody else's. */
        box-sizing: border-box;
        min-height: 48px;
        padding: 10px 16px;
        border: none;
        border-bottom: 1px solid var(--border-color);
        border-radius: 8px 8px 0 0;
        background-color: var(--bg-panel-color);
        color: var(--text-color);
        flex-shrink: 0;
    }

    .itg-modal-header h2 {
        margin: 0;
        flex: 1 1 auto;
        min-width: 0;
        font-family: inherit;
        font-size: 1.1rem;
        font-weight: 500;
        line-height: 1.3;
        color: var(--text-on-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .itg-modal-header-extra {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .itg-modal-close {
        background: none;
        border: none;
        color: var(--text-color);
        font-family: inherit;
        font-size: 1.6rem;
        line-height: 1;
        padding: 0 4px;
        margin: 0;
        cursor: pointer;
        opacity: 0.6;
        border-radius: 50%;
        flex-shrink: 0;
        transition:
            opacity 0.2s,
            color 0.2s;
    }

    .itg-modal-close:hover {
        opacity: 1;
        color: var(--error-color);
    }

    .itg-modal-close:focus-visible {
        outline: 2px solid var(--interactive-color);
        outline-offset: 2px;
        opacity: 1;
    }
</style>
