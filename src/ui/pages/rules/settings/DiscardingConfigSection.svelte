<script>
    import SettingsToggleSection from './SettingsToggleSection.svelte';
    import { blockNumericKeys, clampNumericInput } from '../../../services/numericInput.js';
    import { t, tt } from '../../../stores/i18nStore.js';

    let { isDiscardingEnabled = $bindable(true), discardingTime = $bindable(60), onreset = () => {} } = $props();

    // Whole minutes, at least one — the same bounds the toolbar popup uses.
    const BOUNDS = { min: 1, max: 1440, integer: true };
</script>

<SettingsToggleSection
    id="modal-discarding-section"
    icon="#icon-memory"
    viewBox="0 0 265.523 265.523"
    iconTitle={$tt('configureDiscarding')}
    label={$t('configureDiscarding') || 'Discard Tabs'}
    bind:checked={isDiscardingEnabled}
>
    <div class="discarding-config-popup">
        <h3>{$t('configureDiscarding')}</h3>
        <label for="modal-discarding-time">
            <span>{$t('discardingTime') || 'Discarding time'}</span>
            <input
                type="number"
                class="collapse-time discarding-time-input"
                id="modal-discarding-time"
                min="1"
                step="1"
                max="1440"
                maxlength="4"
                value={discardingTime}
                onkeydown={blockNumericKeys}
                oninput={(e) => (discardingTime = clampNumericInput(e, BOUNDS))}
            />
            <small>{$t('noteDiscardingTime') || 'Minutes before tabs are discarded'}</small>
        </label>
        <div class="popup-actions">
            <button
                id="modal-reset-discarding-btn"
                type="button"
                class="popup-reset-btn"
                translate="no"
                onclick={onreset}>{$t('resetClusterDefaults') || 'Reset to defaults'}</button
            >
        </div>
    </div>
</SettingsToggleSection>
