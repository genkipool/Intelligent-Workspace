<script>
    import { onMount } from 'svelte';
    import ClusterConfigSection from './popups/ClusterConfigSection.svelte';
    import MiscSortSection from './settings/MiscSortSection.svelte';
    import PrefixConfigSection from './settings/PrefixConfigSection.svelte';
    import CollapseTimerSection from './settings/CollapseTimerSection.svelte';
    import DiscardingConfigSection from './settings/DiscardingConfigSection.svelte';
    import StorageConfigSection from './settings/StorageConfigSection.svelte';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import { t, tt } from '../../stores/i18nStore.js';
    import { getSettings, saveSettings, getRuleStorage, setRuleStorage, groupTabs } from './modules/rules-api.js';
    import { hasDuplicateMarkers } from './modules/prefixMarkers.js';
    import { showNotification } from '../../../utils/i18n.js';
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

    function handleStorageChanged(changes) {
        if (changes.ruleStorageArea) {
            const newArea = changes.ruleStorageArea.newValue || 'sync';
            if (newArea !== ruleStorageArea) {
                ruleStorageArea = newArea;
                getRuleStorage().then(({ customRules = [] }) => {
                    allRulesActive = customRules.length > 0 && customRules.every((r) => r.active);
                });
            }
        }
    }

    onMount(() => {
        loadAll();
        chrome.storage.onChanged.addListener(handleStorageChanged);
        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChanged);
        };
    });

    // Autosaves under the shared setting keys. Writes only when the serialized value
    // really changed, which keeps the effect↔storage.onChanged loop closed and stays
    // under the MAX_WRITE_OPERATIONS_PER_MINUTE quota of chrome.storage.sync.
    let lastSavedSync = '';
    let lastSavedLocal = '';

    $effect(() => {
        const snapshot = syncSnapshot();
        const serialized = JSON.stringify(snapshot);
        if (loaded && isOpen && serialized !== lastSavedSync) {
            // Two groups marked with the same character cannot be told apart, so a
            // clashing set is flagged in the form and never written.
            if (hasDuplicateMarkers(snapshot.userPrefixes)) {
                showNotification('duplicatePrefixesError', true);
                return;
            }
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

    function yieldForAnimation(ms = 350) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /** Any grouping change re-syncs the master switch and regroups the tabs. */
    async function onClusterChanged() {
        isClusterEnabled = isAnyClusterSwitchOn(clusterConfig);
        groupTabs();
    }

    /** The master switch turns every grouping on or off at once. */
    async function setClusterEnabled(enabled) {
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

    async function setStorageArea(area) {
        if (!area || area === ruleStorageArea) return;
        ruleStorageArea = area;
        await chrome.storage.local.set({ ruleStorageArea: area });
        const { customRules = [] } = await getRuleStorage();
        allRulesActive = customRules.length > 0 && customRules.every((r) => r.active);
        showNotification('storageModeSet', false, [area.toUpperCase()]);
        showNotification('storageChangeWarning', true);
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
            <MiscSortSection bind:isSortGroupsEnabled bind:miscSortOption onset={setMiscSort} />

            <!-- SECTION 3: PREFIXES -->
            <PrefixConfigSection bind:isPrefixesEnabled bind:currentUserPrefixes onreset={resetPrefixesDefaults} />

            <!-- SECTION 4: TIMER -->
            <CollapseTimerSection
                bind:isCollapseTimerEnabled
                bind:timerInactiveTime
                bind:timerActiveTime
                onreset={resetTimerDefaults}
            />

            <!-- SECTION 5: DISCARDING -->
            <DiscardingConfigSection bind:isDiscardingEnabled bind:discardingTime onreset={resetDiscardingDefaults} />

            <!-- SECTION 6: STORAGE -->
            <StorageConfigSection
                bind:allRulesActive
                bind:ruleStorageArea
                ontoggleall={toggleAllRules}
                onsetstorage={setStorageArea}
            />

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
