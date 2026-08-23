<script>
    import AnchoredPopup from './AnchoredPopup.svelte';
    import { blockNumericKeys, clampNumericInput } from '../../../services/numericInput.js';
    import { t } from '../../../stores/i18nStore.js';

    let { show = false, trigger = null, discardingTime = $bindable(10), onclose, onreset } = $props();

    // Whole minutes, and at least one: discarding a tab the user is still on would
    // reload it under them.
    const BOUNDS = { min: 1, max: 1440, integer: true };

    function resetToDefaults() {
        onreset?.();
    }
</script>

<AnchoredPopup {show} {trigger} {onclose} class="discarding-config-popup">
    <h3>{$t('configureDiscarding')}</h3>
    <label>
        <span>{$t('discardingTime')}</span>
        <input
            type="number"
            class="collapse-time discarding-time-input"
            id="discarding-time"
            min="1"
            step="1"
            max="1440"
            maxlength="4"
            value={discardingTime}
            onkeydown={blockNumericKeys}
            oninput={(e) => (discardingTime = clampNumericInput(e, BOUNDS))}
        />
        <small>{$t('discardingTimeDesc')}</small>
    </label>
    <button type="button" class="popup-reset-btn" id="reset-discarding-btn" translate="no" onclick={resetToDefaults}
        >{$t('resetDiscarding')}</button
    >
</AnchoredPopup>
