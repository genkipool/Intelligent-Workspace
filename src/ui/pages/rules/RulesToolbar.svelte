<script>
    import { t, tt } from '../../stores/i18nStore.js';

    let {
        showTutorial = false,
        storageMode = 'sync',
        isSyncing = false,
        isAlphaSort = false,
        areAllExpanded = false,
        expandableRuleNamesCount = 0,
        isClusterEnabled = $bindable(true),
        isSortGroupsEnabled = $bindable(true),
        isPrefixesEnabled = $bindable(true),
        isCollapseTimerEnabled = $bindable(false),
        isAllRulesActive = false,
        hasRules = false,
        onToggleTutorial = () => {},
        onOpenResize = () => {},
        onForceSync = () => {},
        onOpenContextMenu = () => {},
        onToggleSortAlpha = () => {},
        onToggleExpandAll = () => {},
        onSearch = () => {},
        onToggleCluster = () => {},
        onSetClusterEnabled = () => {},
        onToggleSortGroups = () => {},
        onTogglePrefixes = () => {},
        onToggleCollapseTimer = () => {},
        onToggleAllRules = () => {},
    } = $props();
</script>

<section class="rules-header">
    <div class="rules-header-content" id="rules-title-container">
        <button
            id="rules-title-button"
            class="rules-title-button"
            type="button"
            tabindex="0"
            aria-expanded={showTutorial}
            aria-label={$t('rules') || 'Rules'}
            onclick={onToggleTutorial}
        >
            <h2 id="h2-rule-name">{$t('rules') || 'Rules'}</h2>
        </button>
        <button
            id="resizeButton"
            type="button"
            class="resize-button"
            onclick={onOpenResize}
            title={$tt('openSettingsRules') || 'Open in tab'}
            aria-label={$t('openWebConfigRules') || 'Open web config'}
            aria-pressed="false"
        >
            <svg
                width="30"
                height="30"
                viewBox="-2 -2 24 24"
                style="color: var(--text-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-resize"></use>
            </svg>
        </button>
        <button
            type="button"
            id="storage-status-icon-container"
            class="storage-status-icon button-rules-header"
            class:syncing={isSyncing}
            data-storage-mode={storageMode}
            title={$tt(storageMode === 'sync' ? 'storageModeSyncDescClick' : 'storageModeLocalDesc')}
            oncontextmenu={(e) => {
                e.preventDefault();
                onOpenContextMenu('storage', e);
            }}
            onclick={onForceSync}
            aria-label={$t('storageSyncStatus') || 'Storage status'}
        >
            {#if storageMode === 'sync'}
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-sync"></use>
                </svg>
            {:else}
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-local"></use>
                </svg>
            {/if}
        </button>
        <button
            id="sort-alpha-btn"
            type="button"
            class="sort-btn button-rules-header"
            class:active={isAlphaSort}
            onclick={onToggleSortAlpha}
            title={$tt(isAlphaSort ? 'viewOriginalOrder' : 'sortAlphabetically')}
            aria-label={$t(isAlphaSort ? 'viewOriginalOrder' : 'sortAlphabetically')}
            aria-pressed={isAlphaSort}
        >
            <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                style="color: var(--text-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-sort"></use>
            </svg>
        </button>
        <button
            id="expand-all-btn"
            class="expand-btn button-rules-header"
            type="button"
            onclick={onToggleExpandAll}
            disabled={expandableRuleNamesCount === 0}
            title={$tt(areAllExpanded ? 'collapseAllRules' : 'expandAllRules')}
            aria-label={$t(areAllExpanded ? 'collapseAllRules' : 'expandAllRules')}
            aria-pressed={areAllExpanded}
        >
            <svg
                width="30"
                height="30"
                viewBox="0 0 32 32"
                style="color: var(--text-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-expand-all"></use>
            </svg>
        </button>
        <div class="search-container">
            <label for="search-rules-input" class="visually-hidden">{$t('searchRulePlaceholder') || 'Search'}</label>
            <input
                type="search"
                id="search-rules-input"
                placeholder={$t('searchRulePlaceholder') || 'Search rules by name or URL.'}
                class="search-input"
                autocomplete="off"
                spellcheck="false"
                translate="no"
                oninput={onSearch}
            />
        </div>
        <div class="settings-container">
            <button
                type="button"
                class="svg-settings-container button-rules-header"
                title={$tt('configureClusterCtrlClick')}
                oncontextmenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu('cluster', e);
                }}
                onclick={onToggleCluster}
            >
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
            </button>
            <label class="switch">
                <input
                    type="checkbox"
                    id="toggle-cluster"
                    class="input-settings-container"
                    checked={isClusterEnabled}
                    onchange={(e) => onSetClusterEnabled(e.currentTarget.checked)}
                />
                <span
                    class="slider slider-header-controls"
                    title={$tt(isClusterEnabled ? 'disableCluster' : 'enableCluster')}
                >
                    <span class="switch-text-on">on</span>
                    <span class="switch-text-off">off</span>
                    <span class="switch-handle"><span class="switch-light"></span></span>
                </span>
            </label>
        </div>
        <div class="settings-container">
            <button
                type="button"
                class="svg-settings-container toggle-groups button-rules-header"
                title={$tt('miscSortCtrlClick')}
                oncontextmenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu('sortGroups', e);
                }}
                onclick={onToggleSortGroups}
            >
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
            </button>
            <label class="switch">
                <input
                    class="input-settings-container"
                    type="checkbox"
                    id="toggle-sort-groups"
                    tabindex="0"
                    title={$tt(isSortGroupsEnabled ? 'disableSortGroups' : 'enableSortGroups')}
                    bind:checked={isSortGroupsEnabled}
                />
                <span
                    class="slider slider-header-controls"
                    title={$tt(isSortGroupsEnabled ? 'disableSortGroups' : 'enableSortGroups')}
                >
                    <span class="switch-text-on">on</span>
                    <span class="switch-text-off">off</span>
                    <span class="switch-handle"><span class="switch-light"></span></span>
                </span>
            </label>
        </div>
        <div class="settings-container expand-small-container">
            <button
                id="expand-all-small-btn"
                class="expand-btn-small button-rules-header"
                type="button"
                onclick={onToggleExpandAll}
                disabled={expandableRuleNamesCount === 0}
                title={$tt(areAllExpanded ? 'collapseAllRules' : 'expandAllRules')}
                aria-label={$t(areAllExpanded ? 'collapseAllRules' : 'expandAllRules')}
                aria-pressed={areAllExpanded}
            >
                <svg
                    width="30"
                    height="30"
                    viewBox="3 6 18 12"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-chevron-down"></use>
                </svg>
            </button>
        </div>
        <div class="settings-container">
            <button
                type="button"
                class="svg-settings-container button-rules-header"
                title={$tt('configurePrefixesCtrlClick')}
                oncontextmenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu('prefixes', e);
                }}
                onclick={onTogglePrefixes}
            >
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 512 512"
                    style="color: var(--text-color); transform: rotate(180deg);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-prefixes"></use>
                </svg>
            </button>
            <label class="switch">
                <input
                    type="checkbox"
                    id="toggle-prefixes"
                    class="input-settings-container"
                    bind:checked={isPrefixesEnabled}
                />
                <span
                    class="slider slider-header-controls"
                    title={$tt(isPrefixesEnabled ? 'disablePrefixes' : 'enablePrefixes')}
                >
                    <span class="switch-text-on">on</span>
                    <span class="switch-text-off">off</span>
                    <span class="switch-handle"><span class="switch-light"></span></span>
                </span>
            </label>
        </div>
        <div class="settings-container">
            <button
                type="button"
                class="svg-settings-container button-rules-header"
                title={$tt('toggleCollapseTimerWithTimes') || 'Collapse timer'}
                oncontextmenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu('timer', e);
                }}
                onclick={onToggleCollapseTimer}
            >
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
            </button>
            <label class="switch" title={$tt('toggleCollapseTimerWithTimes') || 'Collapse timer'}>
                <input
                    class="input-settings-container"
                    type="checkbox"
                    id="toggle-collapse-timer"
                    tabindex="0"
                    bind:checked={isCollapseTimerEnabled}
                />
                <span
                    class="slider slider-header-controls"
                    title={$tt(isCollapseTimerEnabled ? 'disableToggleCollapseTimer' : 'enableToggleCollapseTimer')}
                >
                    <span class="switch-text-on">on</span>
                    <span class="switch-text-off">off</span>
                    <span class="switch-handle"><span class="switch-light"></span></span>
                </span>
            </label>
        </div>
        <div class="settings-container">
            <button
                type="button"
                class="svg-settings-container all-rules-checks button-rules-header"
                title={$tt('configureStorageCtrlClick')}
                oncontextmenu={(e) => {
                    e.preventDefault();
                    onOpenContextMenu('storage', e);
                }}
                onclick={onToggleAllRules}
            >
                <svg
                    class="svg-all-rules"
                    width="30"
                    height="30"
                    viewBox="0 0 38 38"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-all-rules"></use>
                </svg>
            </button>
            <label class="switch">
                <input
                    class="input-settings-container"
                    type="checkbox"
                    id="toggle-all-rules"
                    tabindex="0"
                    checked={isAllRulesActive}
                    disabled={!hasRules}
                    onchange={onToggleAllRules}
                />
                <span
                    class="slider slider-header-controls"
                    title={$tt(isAllRulesActive ? 'disableAllRules' : 'enableAllRules')}
                >
                    <span class="switch-text-on">on</span>
                    <span class="switch-text-off">off</span>
                    <span class="switch-handle"><span class="switch-light"></span></span>
                </span>
            </label>
        </div>
    </div>
</section>
