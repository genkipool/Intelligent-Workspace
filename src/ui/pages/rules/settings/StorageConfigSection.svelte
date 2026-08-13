<script>
    import { t, tt } from '../../../stores/i18nStore.js';

    let {
        allRulesActive = $bindable(false),
        ruleStorageArea = $bindable('sync'),
        ontoggleall = () => {},
        onsetstorage = () => {},
    } = $props();
</script>

<div class="settings-section" id="modal-storage-section">
    <div class="settings-entry-general" class:switch-on={allRulesActive}>
        <div class="setting-label-group">
            <span
                class="svg-settings-container all-rules-checks button-rules-header"
                title={$tt('configureStorageCtrlClick')}
            >
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 48 48"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-all-rules"></use>
                </svg>
            </span>
            <span class="setting-text-label">{$t('toggleAllRules') || 'All Rules'}</span>
        </div>
        <label class="switch">
            <input type="checkbox" class="input-settings-container" checked={allRulesActive} onchange={ontoggleall} />
            <span class="slider">
                <span class="switch-text-on">on</span>
                <span class="switch-text-off">off</span>
                <span class="switch-handle"><span class="switch-light"></span></span>
            </span>
        </label>
        <button type="button" class="svg-toggle-button" aria-pressed={allRulesActive} onclick={ontoggleall}>
            <svg width="20" height="20" viewBox="0 0 24 24"
                ><text
                    class="svg-toggle-text"
                    x="50%"
                    y="55%"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill="var(--text-on-color)">{allRulesActive ? 'ON' : 'OFF'}</text
                ></svg
            >
        </button>
    </div>
    <div class="storage-config-popup misc-sort-popup">
        <h3>{$t('configureStorageTitle')}</h3>
        <div class="misc-sort-options-container">
            <button
                type="button"
                class="option-button"
                data-value="sync"
                class:selected={ruleStorageArea === 'sync'}
                onclick={() => onsetstorage('sync')}
                title={$tt('storageSyncDesc') || 'Sync storage'}>{$t('storageSync') || 'Sync'}</button
            >
            <button
                type="button"
                class="option-button"
                data-value="local"
                class:selected={ruleStorageArea === 'local'}
                onclick={() => onsetstorage('local')}
                title={$tt('storageLocalDesc') || 'Local storage'}>{$t('storageLocal') || 'Local'}</button
            >
        </div>
    </div>
</div>
