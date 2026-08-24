<script>
    /**
     * [AI INSTRUCTION]
     * THE THREE THINGS THAT CAN BE DONE TO HALF A RULE.
     *
     * Edit it, pause it, clear it — for the allowance and for the hours alike, and in
     * all three places the two halves are listed: the dashboard's log, the settings
     * table and the side panel. One component, so a control that gains a state or a
     * tooltip gains it everywhere at once.
     *
     * The pause is per half. Pausing tonight's window should not also hand back a
     * daily allowance that is already spent, and the record has carried the two flags
     * separately since (see `normalizeLimit`).
     */
    import { t, tt } from '../../../stores/i18nStore.js';

    /** The one size the three glyphs are drawn at. */
    const ICON = 13;

    let {
        /** Whether this half of the rule has anything to act on. */
        isSet = false,
        /** Whether this half is running, as opposed to kept but paused. */
        enabled = true,
        editTitle = '',
        /** i18n key roots, so the tooltips can say which half they mean. */
        enableKey = 'webActivityEnableLimit',
        disableKey = 'webActivityDisableLimit',
        clearKey = 'webActivityRemoveLimit',
        onEdit,
        onToggle,
        onClear,
    } = $props();

    /**
     * The tooltip says what the click will do, and when there is nothing to do it
     * says that instead — a disabled control with a tooltip promising an action is
     * the most confusing state a button can be in.
     */
    const toggleTitle = $derived(!isSet ? $tt('webActivityNothingToToggle') : $tt(enabled ? disableKey : enableKey));
</script>

<!--
    One size for all three glyphs. They sit in a row of identical 22px boxes and are
    read as one control with three parts, so a pencil a pixel bigger than the cross
    beside it is the sort of thing nobody can name and everybody sees. `ICON` is the
    single number; changing it changes all three.
-->
<span class="wa-rule-controls">
    <button class="wa-icon-btn wa-edit-btn" type="button" title={editTitle} aria-label={editTitle} onclick={onEdit}>
        <svg width={ICON} height={ICON} aria-hidden="true" focusable="false"><use href="#wa-edit"></use></svg>
    </button>
    <button
        class="wa-icon-btn wa-power-btn"
        class:is-off={isSet && !enabled}
        type="button"
        disabled={!isSet}
        title={toggleTitle}
        aria-label={toggleTitle}
        aria-pressed={isSet && enabled}
        onclick={() => onToggle(!enabled)}
    >
        <svg width={ICON} height={ICON} aria-hidden="true" focusable="false"><use href="#wa-power"></use></svg>
    </button>
    <button
        class="wa-icon-btn wa-icon-btn-danger"
        type="button"
        disabled={!isSet}
        title={$tt(clearKey)}
        aria-label={$t(clearKey)}
        onclick={onClear}
    >
        <svg width={ICON} height={ICON} aria-hidden="true" focusable="false"><use href="#wa-close"></use></svg>
    </button>
</span>
