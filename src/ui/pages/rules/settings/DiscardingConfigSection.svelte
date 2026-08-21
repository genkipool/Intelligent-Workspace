<script>
    import { t, tt } from '../../../stores/i18nStore.js';

    let { isDiscardingEnabled = $bindable(true), discardingTime = $bindable(60), onreset = () => {} } = $props();
</script>

<div class="settings-section" id="modal-discarding-section">
    <div class="settings-entry-general" class:switch-on={isDiscardingEnabled}>
        <div class="setting-label-group">
            <span class="svg-settings-container button-rules-header" title={$tt('configureDiscarding')}>
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 265.523 265.523"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-memory"></use>
                </svg>
            </span>
            <span class="setting-text-label">{$t('configureDiscarding') || 'Discard Tabs'}</span>
        </div>
        <label class="switch" translate="no">
            <input type="checkbox" class="input-settings-container" bind:checked={isDiscardingEnabled} />
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
            aria-pressed={isDiscardingEnabled}
            onclick={() => (isDiscardingEnabled = !isDiscardingEnabled)}
        >
            <svg width="20" height="20" viewBox="0 0 24 24"
                ><text
                    class="svg-toggle-text"
                    x="50%"
                    y="55%"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill="var(--text-on-color)"
                    translate="no">{isDiscardingEnabled ? 'ON' : 'OFF'}</text
                ></svg
            >
        </button>
    </div>
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
                max="9999"
                maxlength="4"
                bind:value={discardingTime}
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
</div>
