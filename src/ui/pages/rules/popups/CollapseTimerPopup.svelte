<script>
    import AnchoredPopup from './AnchoredPopup.svelte';
    import { blockNumericKeys, clampNumericInput } from '../../../services/numericInput.js';
    import { t } from '../../../stores/i18nStore.js';

    let {
        show = false,
        trigger = null,
        inactiveTime = $bindable(0),
        activeTime = $bindable(0),
        onclose,
        onreset,
    } = $props();

    // Both fields are minutes, fractional, and capped at a day.
    const BOUNDS = { min: 0, max: 1440 };

    function resetToDefaults() {
        onreset?.();
    }
</script>

<AnchoredPopup {show} {trigger} {onclose} class="collapse-timer-popup">
    <h3>{$t('configureCollapseTimer')}</h3>
    <label>
        <span>{$t('inactiveTime')}</span>
        <input
            type="number"
            class="collapse-time timer-inactive-input"
            id="inactive-time"
            min="0"
            step="0.1"
            max="1440"
            maxlength="6"
            value={inactiveTime}
            onkeydown={blockNumericKeys}
            oninput={(e) => (inactiveTime = clampNumericInput(e, BOUNDS))}
        />
        <small>{$t('inactiveTimeDesc')}</small>
    </label>
    <label>
        <span>{$t('activeTime')}</span>
        <input
            type="number"
            class="collapse-time timer-active-input"
            id="active-time"
            min="0"
            step="0.1"
            max="1440"
            maxlength="6"
            value={activeTime}
            onkeydown={blockNumericKeys}
            oninput={(e) => (activeTime = clampNumericInput(e, BOUNDS))}
        />
        <small>{$t('activeTimeDesc')}</small>
    </label>
    <button type="button" class="popup-reset-btn" id="reset-timer-btn" translate="no" onclick={resetToDefaults}
        >{$t('resetTimer')}</button
    >
</AnchoredPopup>
