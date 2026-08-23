<script>
    import SettingsToggleSection from './SettingsToggleSection.svelte';
    import { blockNumericKeys, clampNumericInput } from '../../../services/numericInput.js';
    import { t } from '../../../stores/i18nStore.js';

    let {
        isCollapseTimerEnabled = $bindable(false),
        timerInactiveTime = $bindable(1),
        timerActiveTime = $bindable(15),
        onreset = () => {},
    } = $props();

    // Minutes, fractional, capped at a day — the same bounds the toolbar popup uses.
    const BOUNDS = { min: 0, max: 1440 };
</script>

<SettingsToggleSection
    id="modal-timer-section"
    icon="#icon-timer"
    viewBox="0 0 512 512"
    label={$t('toggleCollapseTimer') || 'Collapse Timer'}
    bind:checked={isCollapseTimerEnabled}
>
    <div class="collapse-timer-popup">
        <h3>{$t('configureCollapseTimer')}</h3>
        <label for="modal-inactive-time">
            <span>{$t('inactiveGroupsTime') || 'Inactive groups time'}</span>
            <input
                type="number"
                class="collapse-time timer-inactive-input"
                id="modal-inactive-time"
                min="0"
                step="0.1"
                max="1440"
                maxlength="6"
                value={timerInactiveTime}
                onkeydown={blockNumericKeys}
                oninput={(e) => (timerInactiveTime = clampNumericInput(e, BOUNDS))}
            />
            <small>{$t('noteInactiveGroupsTime') || 'Minutes of inactivity before collapse'}</small>
        </label>
        <label for="modal-active-time">
            <span>{$t('activeGroupsTime') || 'Active groups time'}</span>
            <input
                type="number"
                class="collapse-time timer-active-input"
                id="modal-active-time"
                min="0"
                step="0.1"
                max="1440"
                maxlength="6"
                value={timerActiveTime}
                onkeydown={blockNumericKeys}
                oninput={(e) => (timerActiveTime = clampNumericInput(e, BOUNDS))}
            />
            <small>{$t('noteactiveGroupsTime') || 'Minutes of active period'}</small>
        </label>
        <div class="popup-actions">
            <button id="modal-reset-timer-btn" type="button" class="popup-reset-btn" translate="no" onclick={onreset}
                >{$t('resetClusterDefaults') || 'Reset to defaults'}</button
            >
        </div>
    </div>
</SettingsToggleSection>
