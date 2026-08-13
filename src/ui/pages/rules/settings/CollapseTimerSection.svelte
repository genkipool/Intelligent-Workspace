<script>
    import { t } from '../../../stores/i18nStore.js';

    let {
        isCollapseTimerEnabled = $bindable(false),
        timerInactiveTime = $bindable(1),
        timerActiveTime = $bindable(15),
        onreset = () => {},
    } = $props();
</script>

<div class="settings-section" id="modal-timer-section">
    <div class="settings-entry-general" class:switch-on={isCollapseTimerEnabled}>
        <div class="setting-label-group">
            <span class="svg-settings-container button-rules-header">
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 512 512"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-timer"></use>
                </svg>
            </span>
            <span class="setting-text-label">{$t('toggleCollapseTimer') || 'Collapse Timer'}</span>
        </div>
        <label class="switch">
            <input type="checkbox" class="input-settings-container" bind:checked={isCollapseTimerEnabled} />
            <span class="slider">
                <span class="switch-text-on">on</span>
                <span class="switch-text-off">off</span>
                <span class="switch-handle"><span class="switch-light"></span></span>
            </span>
        </label>
        <button
            type="button"
            class="svg-toggle-button"
            aria-pressed={isCollapseTimerEnabled}
            onclick={() => (isCollapseTimerEnabled = !isCollapseTimerEnabled)}
        >
            <svg width="20" height="20" viewBox="0 0 24 24"
                ><text
                    class="svg-toggle-text"
                    x="50%"
                    y="55%"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill="var(--text-on-color)">{isCollapseTimerEnabled ? 'ON' : 'OFF'}</text
                ></svg
            >
        </button>
    </div>
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
                max="99999"
                maxlength="5"
                bind:value={timerInactiveTime}
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
                max="99999"
                maxlength="5"
                bind:value={timerActiveTime}
            />
            <small>{$t('noteactiveGroupsTime') || 'Minutes of active period'}</small>
        </label>
        <div class="popup-actions">
            <button id="modal-reset-timer-btn" type="button" class="popup-reset-btn" onclick={onreset}
                >{$t('resetClusterDefaults') || 'Reset to defaults'}</button
            >
        </div>
    </div>
</div>
