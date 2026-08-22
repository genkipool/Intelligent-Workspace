<script>
    import { t } from '../../../stores/i18nStore.js';

    let {
        isCollapseTimerEnabled = $bindable(false),
        timerInactiveTime = $bindable(1),
        timerActiveTime = $bindable(15),
        onreset = () => {},
    } = $props();

    function handleNumericKeydown(e) {
        if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
            e.preventDefault();
        }
    }

    function handleInactiveInput(e) {
        let val = e.currentTarget.value;
        if (val !== '') {
            const num = Number.parseFloat(val);
            if (!Number.isNaN(num) && num > 1440) {
                e.currentTarget.value = '1440';
                timerInactiveTime = 1440;
                return;
            }
            if (!Number.isNaN(num) && num < 0) {
                e.currentTarget.value = '0';
                timerInactiveTime = 0;
                return;
            }
        }
        timerInactiveTime = val === '' ? 0 : Number.parseFloat(val) || 0;
    }

    function handleActiveInput(e) {
        let val = e.currentTarget.value;
        if (val !== '') {
            const num = Number.parseFloat(val);
            if (!Number.isNaN(num) && num > 1440) {
                e.currentTarget.value = '1440';
                timerActiveTime = 1440;
                return;
            }
            if (!Number.isNaN(num) && num < 0) {
                e.currentTarget.value = '0';
                timerActiveTime = 0;
                return;
            }
        }
        timerActiveTime = val === '' ? 0 : Number.parseFloat(val) || 0;
    }
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
        <label class="switch" translate="no">
            <input type="checkbox" class="input-settings-container" bind:checked={isCollapseTimerEnabled} />
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
                    fill="var(--text-on-color)"
                    translate="no">{isCollapseTimerEnabled ? 'ON' : 'OFF'}</text
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
                max="1440"
                maxlength="6"
                value={timerInactiveTime}
                onkeydown={handleNumericKeydown}
                oninput={handleInactiveInput}
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
                onkeydown={handleNumericKeydown}
                oninput={handleActiveInput}
            />
            <small>{$t('noteactiveGroupsTime') || 'Minutes of active period'}</small>
        </label>
        <div class="popup-actions">
            <button id="modal-reset-timer-btn" type="button" class="popup-reset-btn" translate="no" onclick={onreset}
                >{$t('resetClusterDefaults') || 'Reset to defaults'}</button
            >
        </div>
    </div>
</div>
