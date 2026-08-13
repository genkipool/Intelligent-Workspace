<script>
    import { t } from '../../../stores/i18nStore.js';

    let {
        isPrefixesEnabled = $bindable(true),
        currentUserPrefixes = $bindable({ lock: '🔒', openKey: '🗝️', loupe: '🔍', checked: '', warning: '⚠️' }),
        onreset = () => {},
    } = $props();
</script>

<div class="settings-section" id="modal-prefixes-section">
    <div class="settings-entry-general" class:switch-on={isPrefixesEnabled}>
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
                    <use href="#icon-prefixes"></use>
                </svg>
            </span>
            <span class="setting-text-label">{$t('togglePrefixes') || 'Prefixes'}</span>
        </div>
        <label class="switch">
            <input type="checkbox" class="input-settings-container" bind:checked={isPrefixesEnabled} />
            <span class="slider">
                <span class="switch-text-on">on</span>
                <span class="switch-text-off">off</span>
                <span class="switch-handle"><span class="switch-light"></span></span>
            </span>
        </label>
        <button
            type="button"
            class="svg-toggle-button"
            aria-pressed={isPrefixesEnabled}
            onclick={() => (isPrefixesEnabled = !isPrefixesEnabled)}
        >
            <svg width="20" height="20" viewBox="0 0 24 24"
                ><text
                    class="svg-toggle-text"
                    x="50%"
                    y="55%"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill="var(--text-on-color)">{isPrefixesEnabled ? 'ON' : 'OFF'}</text
                ></svg
            >
        </button>
    </div>
    <div class="prefix-config-popup">
        <h3>{$t('configurePrefixesTitle')}</h3>
        <div class="prefix-entry">
            <label for="modal-prefix-lock-input">{$t('prefixLockLabel') || 'Lock'}</label>
            <input
                type="text"
                autocomplete="off"
                class="prefix-input"
                id="modal-prefix-lock-input"
                placeholder=""
                bind:value={currentUserPrefixes.lock}
            />
        </div>
        <div class="prefix-entry">
            <label for="modal-prefix-openKey-input">{$t('prefixKeyLabel') || 'Open Key'}</label>
            <input
                type="text"
                autocomplete="off"
                class="prefix-input"
                id="modal-prefix-openKey-input"
                placeholder=""
                bind:value={currentUserPrefixes.openKey}
            />
        </div>
        <div class="prefix-entry">
            <label for="modal-prefix-loupe-input">{$t('prefixLoupeLabel') || 'Loupe'}</label>
            <input
                type="text"
                autocomplete="off"
                class="prefix-input"
                id="modal-prefix-loupe-input"
                placeholder=""
                bind:value={currentUserPrefixes.loupe}
            />
        </div>
        <div class="prefix-entry">
            <label for="modal-prefix-checked-input">{$t('prefixEmptyLabel') || 'Checked'}</label>
            <input
                type="text"
                autocomplete="off"
                class="prefix-input"
                id="modal-prefix-checked-input"
                placeholder=""
                bind:value={currentUserPrefixes.checked}
            />
        </div>
        <div class="prefix-entry">
            <label for="modal-prefix-warning-input">{$t('prefixWarningLabel') || 'Warning'}</label>
            <input
                type="text"
                autocomplete="off"
                class="prefix-input"
                id="modal-prefix-warning-input"
                placeholder=""
                bind:value={currentUserPrefixes.warning}
            />
        </div>
        <div class="popup-actions">
            <button id="modal-reset-prefixes-btn" type="button" class="popup-reset-btn" onclick={onreset}
                >{$t('resetClusterDefaults') || 'Reset to defaults'}</button
            >
        </div>
    </div>
</div>
