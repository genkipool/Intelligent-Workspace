<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import RulesToolbarControls from './components/RulesToolbarControls.svelte';

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
        <RulesToolbarControls
            {isClusterEnabled}
            {isSortGroupsEnabled}
            {isPrefixesEnabled}
            {isCollapseTimerEnabled}
            {isAllRulesActive}
            {hasRules}
            {areAllExpanded}
            {expandableRuleNamesCount}
            {onOpenContextMenu}
            {onToggleCluster}
            {onSetClusterEnabled}
            {onToggleSortGroups}
            {onToggleExpandAll}
            {onTogglePrefixes}
            {onToggleCollapseTimer}
            {onToggleAllRules}
        />
    </div>
</section>
