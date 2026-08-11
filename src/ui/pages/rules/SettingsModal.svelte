<script>
    import { onMount } from 'svelte';
    import ClusterConfigSection from './popups/ClusterConfigSection.svelte';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import { t, tt } from '../../stores/i18nStore.js';
    import { getSettings, saveSettings, getRuleStorage, setRuleStorage, groupTabs } from './modules/rules-api.js';
    import {
        defaultClusterConfig,
        mergeClusterConfig,
        isAnyClusterSwitchOn,
        applyMasterSwitch,
    } from './modules/clusterDefaults.js';

    let { isOpen = false, onclose } = $props();

    // State keys and defaults shared with the background rule engine
    let isClusterEnabled = $state(true);
    let clusterConfig = $state(defaultClusterConfig());
    let isSortGroupsEnabled = $state(true);
    let miscSortOption = $state('start');
    let isPrefixesEnabled = $state(true);
    let currentUserPrefixes = $state({ lock: '🔒', openKey: '🗝️', loupe: '🔍', checked: '', warning: '⚠️' });
    let isCollapseTimerEnabled = $state(false);
    let timerInactiveTime = $state(1);
    let timerActiveTime = $state(15);
    let isDiscardingEnabled = $state(true);
    let discardingTime = $state(60);
    let allRulesActive = $state(false);
    let ruleStorageArea = $state('sync');

    let loaded = $state(false);

    // The value written under the shared setting keys. Held in one place so the
    // baseline taken after loading and the autosave compare exactly the same shape.
    function syncSnapshot() {
        return {
            clusteringEnabled: isClusterEnabled,
            clusterConfig: $state.snapshot(clusterConfig),
            sortGroupsAlphabetically: isSortGroupsEnabled,
            miscGroupSortOption: miscSortOption,
            enablePrefixes: isPrefixesEnabled,
            userPrefixes: $state.snapshot(currentUserPrefixes),
            enableCollapseTimer: isCollapseTimerEnabled,
            inactiveCollapseTime: timerInactiveTime,
            activeCollapseTime: timerActiveTime,
        };
    }

    function localSnapshot() {
        return { discardingEnabled: isDiscardingEnabled, discardingTimeMinutes: discardingTime };
    }

    async function loadAll() {
        const data = await getSettings([
            'clusteringEnabled',
            'clusterConfig',
            'sortGroupsAlphabetically',
            'miscGroupSortOption',
            'enablePrefixes',
            'userPrefixes',
            'enableCollapseTimer',
            'inactiveCollapseTime',
            'activeCollapseTime',
        ]);
        isClusterEnabled = data.clusteringEnabled ?? true;
        clusterConfig = mergeClusterConfig(data.clusterConfig || {});
        isSortGroupsEnabled = data.sortGroupsAlphabetically ?? true;
        miscSortOption = data.miscGroupSortOption || 'start';
        isPrefixesEnabled = data.enablePrefixes ?? true;
        currentUserPrefixes = { ...currentUserPrefixes, ...(data.userPrefixes || {}) };
        isCollapseTimerEnabled = data.enableCollapseTimer ?? false;
        timerInactiveTime = data.inactiveCollapseTime ?? 1;
        timerActiveTime = data.activeCollapseTime ?? 15;

        const localData = await chrome.storage.local.get([
            'discardingEnabled',
            'discardingTimeMinutes',
            'ruleStorageArea',
        ]);
        isDiscardingEnabled = localData.discardingEnabled !== false;
        discardingTime = localData.discardingTimeMinutes ?? 60;
        ruleStorageArea = localData.ruleStorageArea || 'sync';

        const { customRules = [] } = await getRuleStorage();
        allRulesActive = customRules.length > 0 && customRules.every((r) => r.active);

        // Taking the baseline from the loaded values means a reload can never swallow
        // the user's next edit, however it interleaves with the autosave effect.
        lastSavedSync = JSON.stringify(syncSnapshot());
        lastSavedLocal = JSON.stringify(localSnapshot());
        loaded = true;
    }

    // Loaded once per opening: two overlapping loads used to race each other.
    let wasOpen = false;
    $effect(() => {
        if (isOpen && !wasOpen) loadAll();
        wasOpen = isOpen;
    });

    onMount(loadAll);

    // Autosaves under the shared setting keys. Writes only when the serialized value
    // really changed, which keeps the effect↔storage.onChanged loop closed and stays
    // under the MAX_WRITE_OPERATIONS_PER_MINUTE quota of chrome.storage.sync.
    let lastSavedSync = '';
    let lastSavedLocal = '';

    $effect(() => {
        const snapshot = syncSnapshot();
        const serialized = JSON.stringify(snapshot);
        if (loaded && isOpen && serialized !== lastSavedSync) {
            lastSavedSync = serialized;
            saveSettings(snapshot);
        }
    });

    $effect(() => {
        const local = localSnapshot();
        const serialized = JSON.stringify(local);
        if (loaded && isOpen && serialized !== lastSavedLocal) {
            lastSavedLocal = serialized;
            chrome.storage.local.set(local);
        }
    });

    function resetClusterDefaults() {
        clusterConfig = defaultClusterConfig();
        onClusterChanged();
    }

    /** Any grouping change re-syncs the master switch and regroups the tabs. */
    function onClusterChanged() {
        isClusterEnabled = isAnyClusterSwitchOn(clusterConfig);
        groupTabs();
    }

    /** The master switch turns every grouping on or off at once. */
    function setClusterEnabled(enabled) {
        isClusterEnabled = enabled;
        clusterConfig = applyMasterSwitch($state.snapshot(clusterConfig), enabled);
        groupTabs();
    }

    function resetPrefixesDefaults() {
        currentUserPrefixes = { lock: '🔒', openKey: '🗝️', loupe: '🔍', checked: '', warning: '⚠️' };
    }

    function resetTimerDefaults() {
        timerInactiveTime = 1;
        timerActiveTime = 15;
    }

    function resetDiscardingDefaults() {
        discardingTime = 60;
    }

    function setMiscSort(option) {
        miscSortOption = option;
    }

    function setStorageArea(area) {
        ruleStorageArea = area;
        chrome.storage.local.set({ ruleStorageArea: area });
    }

    async function toggleAllRules() {
        const newState = !allRulesActive;
        const { customRules = [] } = await getRuleStorage();
        if (customRules.length === 0) return;
        const updated = customRules.map((r) => ({ ...r, active: newState }));
        await setRuleStorage(updated);
        allRulesActive = newState;
    }

    let dialogEl = $state(null);

    // The dialog stays in the DOM and only its `open` state changes: removing it
    // would cut the closing transition short.
    $effect(() => {
        if (!dialogEl) return;
        if (isOpen && !dialogEl.open) dialogEl.showModal();
        if (!isOpen && dialogEl.open) dialogEl.close();
    });

    function close() {
        onclose?.();
    }

    // A backdrop click only dismisses when the press *and* the release happen on the
    // backdrop, so dragging a selection out of the dialog does not close it.

    function openThemeSelector() {
        chrome.runtime.sendMessage({ action: 'openSidePanelThemes' });
        close();
    }
</script>

<dialog id="settings-modal" class="import-modal" bind:this={dialogEl} onclose={close} use:dismissOnBackdrop={close}>
    <div class="modal-content-import" id="settings-modal-content">
        <div class="modal-header">
            <h2 class="title-modal">{$t('settingsActions') || 'Settings'}</h2>
            <span
                id="close-settings-modal"
                class="close"
                tabindex="0"
                role="button"
                title={$tt('closeModal')}
                aria-label={$t('closeModal')}
                onclick={close}
                onkeydown={(e) => e.key === 'Enter' && close()}>x</span
            >
        </div>
        <div class="settings-modal-body">
            <!-- SECTION 1: CLUSTER -->
            <div class="settings-section" id="modal-cluster-section">
                <div class="settings-entry-general" class:switch-on={isClusterEnabled}>
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
                                <use href="#icon-cluster"></use>
                            </svg>
                        </span>
                        <span class="setting-text-label">{$t('toggleCluster') || 'Create Groups'}</span>
                    </div>
                    <label class="switch">
                        <input
                            type="checkbox"
                            class="input-settings-container"
                            checked={isClusterEnabled}
                            onchange={(e) => setClusterEnabled(e.currentTarget.checked)}
                        />
                        <span class="slider">
                            <span class="switch-text-on">on</span>
                            <span class="switch-text-off">off</span>
                            <span class="switch-handle"><span class="switch-light"></span></span>
                        </span>
                    </label>
                    <button
                        type="button"
                        class="svg-toggle-button"
                        aria-pressed={isClusterEnabled}
                        onclick={() => setClusterEnabled(!isClusterEnabled)}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24"
                            ><text
                                class="svg-toggle-text"
                                x="50%"
                                y="55%"
                                text-anchor="middle"
                                dominant-baseline="middle"
                                fill="var(--text-on-color)">{isClusterEnabled ? 'ON' : 'OFF'}</text
                            ></svg
                        >
                    </button>
                </div>
                <div class="cluster-config-popup">
                    <ClusterConfigSection
                        bind:clusterConfig
                        idPrefix="modal-"
                        onchange={onClusterChanged}
                        onreset={resetClusterDefaults}
                    />
                </div>
            </div>

            <!-- SECTION 2: SORT -->
            <div class="settings-section" id="modal-sort-section">
                <div class="settings-entry-general" class:switch-on={isSortGroupsEnabled}>
                    <div class="setting-label-group">
                        <span class="svg-settings-container button-rules-header">
                            <svg
                                width="30"
                                height="30"
                                viewBox="-51.2 -51.2 614.4 614.4"
                                style="color: var(--text-color); --icon-bg: var(--bg-panel-color);"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <use href="#icon-sort-groups"></use>
                            </svg>
                        </span>
                        <span class="setting-text-label">{$t('toggleSortGroups') || 'Sort Groups'}</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" class="input-settings-container" bind:checked={isSortGroupsEnabled} />
                        <span class="slider">
                            <span class="switch-text-on">on</span>
                            <span class="switch-text-off">off</span>
                            <span class="switch-handle"><span class="switch-light"></span></span>
                        </span>
                    </label>
                    <button
                        type="button"
                        class="svg-toggle-button"
                        aria-pressed={isSortGroupsEnabled}
                        onclick={() => (isSortGroupsEnabled = !isSortGroupsEnabled)}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24"
                            ><text
                                class="svg-toggle-text"
                                x="50%"
                                y="55%"
                                text-anchor="middle"
                                dominant-baseline="middle"
                                fill="var(--text-on-color)">{isSortGroupsEnabled ? 'ON' : 'OFF'}</text
                            ></svg
                        >
                    </button>
                </div>
                <div class="misc-sort-popup">
                    <h3>{$t('miscSortTitle')}</h3>
                    <div class="misc-sort-options-container">
                        <button
                            type="button"
                            class="option-button"
                            data-value="start"
                            class:selected={miscSortOption === 'start'}
                            onclick={() => setMiscSort('start')}>{$t('miscSortStart') || 'Start'}</button
                        >
                        <button
                            type="button"
                            class="option-button"
                            data-value="end"
                            class:selected={miscSortOption === 'end'}
                            onclick={() => setMiscSort('end')}>{$t('miscSortEnd') || 'End'}</button
                        >
                        <button
                            type="button"
                            class="option-button"
                            data-value="alpha"
                            class:selected={miscSortOption === 'alpha'}
                            onclick={() => setMiscSort('alpha')}>{$t('miscSortAlpha') || 'Alphabetical'}</button
                        >
                    </div>
                </div>
            </div>

            <!-- SECTION 3: PREFIXES -->
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
                        <button id="modal-reset-prefixes-btn" class="popup-reset-btn" onclick={resetPrefixesDefaults}
                            >{$t('resetClusterDefaults') || 'Reset to defaults'}</button
                        >
                    </div>
                </div>
            </div>

            <!-- SECTION 4: TIMER -->
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
                        <button id="modal-reset-timer-btn" class="popup-reset-btn" onclick={resetTimerDefaults}
                            >{$t('resetClusterDefaults') || 'Reset to defaults'}</button
                        >
                    </div>
                </div>
            </div>

            <!-- SECTION 5: DISCARDING -->
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
                    <label class="switch">
                        <input type="checkbox" class="input-settings-container" bind:checked={isDiscardingEnabled} />
                        <span class="slider">
                            <span class="switch-text-on">on</span>
                            <span class="switch-text-off">off</span>
                            <span class="switch-handle"><span class="switch-light"></span></span>
                        </span>
                    </label>
                    <button
                        type="button"
                        class="svg-toggle-button"
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
                                fill="var(--text-on-color)">{isDiscardingEnabled ? 'ON' : 'OFF'}</text
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
                            class="popup-reset-btn"
                            onclick={resetDiscardingDefaults}
                            >{$t('resetClusterDefaults') || 'Reset to defaults'}</button
                        >
                    </div>
                </div>
            </div>

            <!-- SECTION 6: STORAGE -->
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
                        <input
                            type="checkbox"
                            class="input-settings-container"
                            checked={allRulesActive}
                            onchange={toggleAllRules}
                        />
                        <span class="slider">
                            <span class="switch-text-on">on</span>
                            <span class="switch-text-off">off</span>
                            <span class="switch-handle"><span class="switch-light"></span></span>
                        </span>
                    </label>
                    <button
                        type="button"
                        class="svg-toggle-button"
                        aria-pressed={allRulesActive}
                        onclick={toggleAllRules}
                    >
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
                            onclick={() => setStorageArea('sync')}
                            title={$tt('storageSyncDesc') || 'Sync storage'}>{$t('storageSync') || 'Sync'}</button
                        >
                        <button
                            type="button"
                            class="option-button"
                            data-value="local"
                            class:selected={ruleStorageArea === 'local'}
                            onclick={() => setStorageArea('local')}
                            title={$tt('storageLocalDesc') || 'Local storage'}>{$t('storageLocal') || 'Local'}</button
                        >
                    </div>
                </div>
            </div>

            <!-- SECTION 7: THEME -->
            <div class="settings-section" id="modal-theme-section">
                <button
                    type="button"
                    class="option-button theme-action-button"
                    id="modal-select-theme-btn"
                    title={$tt('openThemeSelector')}
                    onclick={openThemeSelector}
                >
                    <div class="setting-label-group">
                        <span class="svg-settings-container">
                            <svg width="30" height="30" viewBox="0 0 48 48" style="color: var(--text-on-color);">
                                <use href="#icon-theme"></use>
                            </svg>
                        </span>
                        <span class="setting-text-label">{$t('openThemeSelector') || 'Open Theme Selector'}</span>
                    </div>
                </button>
            </div>
        </div>
    </div>
</dialog>
