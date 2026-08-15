<script>
    import { t, tt } from '../../../stores/i18nStore.js';

    // Read-only: every change leaves through one of the callbacks below, so these
    // are plain props even though the toolbar above declares its own as bindable.
    let {
        isClusterEnabled = true,
        isSortGroupsEnabled = true,
        isPrefixesEnabled = true,
        isCollapseTimerEnabled = false,
        isAllRulesActive = false,
        hasRules = false,
        areAllExpanded = false,
        expandableRuleNamesCount = 0,
        onOpenContextMenu = () => {},
        onToggleCluster = () => {},
        onSetClusterEnabled = () => {},
        onToggleSortGroups = () => {},
        onToggleExpandAll = () => {},
        onTogglePrefixes = () => {},
        onToggleCollapseTimer = () => {},
        onToggleAllRules = () => {},
    } = $props();
</script>

<!--
    The six controls are roots of the component, not children of a wrapper: the
    toolbar that renders them lays its children out with flex, and below 600px with
    `grid-template-columns: repeat(9, 1fr)`, so anything wrapping them would collapse
    the six into a single cell. This file used to carry a `.rules-controls` div that
    no stylesheet ever mentioned, which is why it could not be used as it stood.
-->
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
    <label class="switch" for="toggle-cluster">
        <input
            type="checkbox"
            id="toggle-cluster"
            class="input-settings-container"
            checked={isClusterEnabled}
            onchange={(e) => onSetClusterEnabled(e.currentTarget.checked)}
        />
        <span class="slider slider-header-controls" title={$tt(isClusterEnabled ? 'disableCluster' : 'enableCluster')}>
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
    <label class="switch" for="toggle-sort-groups">
        <input
            class="input-settings-container"
            type="checkbox"
            id="toggle-sort-groups"
            tabindex="0"
            title={$tt(isSortGroupsEnabled ? 'disableSortGroups' : 'enableSortGroups')}
            checked={isSortGroupsEnabled}
            onchange={onToggleSortGroups}
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
    <label class="switch" for="toggle-prefixes">
        <input
            type="checkbox"
            id="toggle-prefixes"
            class="input-settings-container"
            checked={isPrefixesEnabled}
            onchange={onTogglePrefixes}
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
    <label class="switch" for="toggle-collapse-timer" title={$tt('toggleCollapseTimerWithTimes') || 'Collapse timer'}>
        <input
            class="input-settings-container"
            type="checkbox"
            id="toggle-collapse-timer"
            tabindex="0"
            checked={isCollapseTimerEnabled}
            onchange={onToggleCollapseTimer}
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
    <label class="switch" for="toggle-all-rules">
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
