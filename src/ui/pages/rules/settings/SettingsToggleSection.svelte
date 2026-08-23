<script>
    /**
     * [AI INSTRUCTION]
     * ONE SECTION OF THE SETTINGS MODAL.
     *
     * Every section has the same head: an icon, a label, the sliding switch, and the
     * ON/OFF button that does the same thing as the switch for anyone who cannot drag
     * it. Six sections carried their own copy of those forty lines, differing only in
     * the icon, the label and the id.
     *
     * The body below the head is the part that actually differs, so it arrives as
     * `children` and this component makes no assumption about it.
     *
     * ── Why the switch and the button are both here ───────────────────────────────
     * They are not redundant. `.svg-toggle-button` is what the stylesheet shows below
     * 600px, where the slider is too small a target to hit; above it the slider shows
     * and the button is hidden. Rendering only one of them would break one of the two
     * layouts, so both are always in the markup and CSS decides.
     *
     * `switch-on` on the row is likewise load-bearing: the section tints itself from
     * that class, not from the `:checked` state, because the tint is on an ancestor
     * of the input and CSS cannot walk upwards.
     */
    let {
        /** The section's own id, e.g. `modal-timer-section`. */
        id = undefined,
        /** Sprite reference for the icon, e.g. `#icon-timer`. */
        icon,
        viewBox,
        iconStyle = 'color: var(--text-color);',
        /** The storage section adds `all-rules-checks` to pick up its own rule. */
        iconClass = 'svg-settings-container button-rules-header',
        iconTitle = undefined,
        /** The row's text, already translated. */
        label = '',
        checked = $bindable(false),
        /**
         * Called with the new boolean instead of writing `checked`. The cluster and
         * storage rows do more than flip a flag — they regroup tabs, or rewrite every
         * rule — so they take the event rather than let the binding settle it.
         */
        onchange = null,
        children,
    } = $props();

    function setChecked(value) {
        if (onchange) onchange(value);
        else checked = value;
    }
</script>

<div class="settings-section" {id}>
    <div class="settings-entry-general" class:switch-on={checked}>
        <div class="setting-label-group">
            <span class={iconClass} title={iconTitle}>
                <svg width="30" height="30" {viewBox} style={iconStyle} aria-hidden="true" focusable="false">
                    <use href={icon}></use>
                </svg>
            </span>
            <span class="setting-text-label">{label}</span>
        </div>
        <label class="switch" translate="no">
            <input
                type="checkbox"
                class="input-settings-container"
                {checked}
                onchange={(e) => setChecked(e.currentTarget.checked)}
            />
            <span class="slider" translate="no">
                <span class="switch-text-on" translate="no">on</span>
                <span class="switch-text-off" translate="no">off</span>
                <span class="switch-handle"><span class="switch-light"></span></span>
            </span>
        </label>
        <button
            type="button"
            class="svg-toggle-button"
            translate="no"
            aria-pressed={checked}
            onclick={() => setChecked(!checked)}
        >
            <svg width="20" height="20" viewBox="0 0 24 24"
                ><text
                    class="svg-toggle-text"
                    x="50%"
                    y="55%"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill="var(--text-on-color)"
                    translate="no">{checked ? 'ON' : 'OFF'}</text
                ></svg
            >
        </button>
    </div>
    {@render children?.()}
</div>
