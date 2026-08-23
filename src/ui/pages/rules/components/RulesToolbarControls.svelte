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

    /**
     * The five switch controls, in the order the toolbar lays them out.
     *
     * Each is an icon button that opens a popup on right click, plus a switch. They
     * were written out five times; the only things that ever differed are gathered
     * here, and the snippet below draws the rest.
     *
     * `onchange` and `onclick` are separate on purpose. The cluster control is the odd
     * one out: its switch reports the checkbox's new state, because turning it on has
     * to fan out to every grouping, while its icon button just toggles. The other four
     * ignore the value and toggle either way, which is what they always did.
     *
     * `titleFor` builds the switch's tooltip from the current state, so it reads
     * "enable…" or "disable…" as the original did.
     *
     * The list is split in two because the expand-all button sits in the middle of it
     * and belongs to neither half — see the note by the markup.
     */
    const CONTROLS_BEFORE_EXPAND = $derived([
        {
            popup: 'cluster',
            switchId: 'toggle-cluster',
            icon: '#icon-cluster',
            viewBox: '0 0 512 512',
            iconTitle: $tt('configureClusterCtrlClick'),
            checked: isClusterEnabled,
            titleFor: (on) => $tt(on ? 'disableCluster' : 'enableCluster'),
            onclick: onToggleCluster,
            onchange: (e) => onSetClusterEnabled(e.currentTarget.checked),
        },
        {
            popup: 'sortGroups',
            switchId: 'toggle-sort-groups',
            icon: '#icon-sort-groups',
            viewBox: '-51.2 -51.2 614.4 614.4',
            iconStyle: 'color: var(--text-color); --icon-bg: var(--bg-panel-color);',
            iconClass: 'svg-settings-container toggle-groups button-rules-header',
            iconTitle: $tt('miscSortCtrlClick'),
            checked: isSortGroupsEnabled,
            // Alone among these, the sort switch also carries the tooltip on the input.
            inputTitle: $tt(isSortGroupsEnabled ? 'disableSortGroups' : 'enableSortGroups'),
            tabindex: 0,
            titleFor: (on) => $tt(on ? 'disableSortGroups' : 'enableSortGroups'),
            onclick: onToggleSortGroups,
            onchange: onToggleSortGroups,
        },
    ]);

    const CONTROLS_AFTER_EXPAND = $derived([
        {
            popup: 'prefixes',
            switchId: 'toggle-prefixes',
            icon: '#icon-prefixes',
            viewBox: '0 0 512 512',
            // Upside down, so it reads as a tag hanging off the group name.
            iconStyle: 'color: var(--text-color); transform: rotate(180deg);',
            iconTitle: $tt('configurePrefixesCtrlClick'),
            checked: isPrefixesEnabled,
            titleFor: (on) => $tt(on ? 'disablePrefixes' : 'enablePrefixes'),
            onclick: onTogglePrefixes,
            onchange: onTogglePrefixes,
        },
        {
            popup: 'timer',
            switchId: 'toggle-collapse-timer',
            icon: '#icon-timer',
            viewBox: '0 0 512 512',
            iconTitle: $tt('toggleCollapseTimerWithTimes') || 'Collapse timer',
            // The label repeats the icon's tooltip rather than the on/off one below it.
            labelTitle: $tt('toggleCollapseTimerWithTimes') || 'Collapse timer',
            checked: isCollapseTimerEnabled,
            tabindex: 0,
            titleFor: (on) => $tt(on ? 'disableToggleCollapseTimer' : 'enableToggleCollapseTimer'),
            onclick: onToggleCollapseTimer,
            onchange: onToggleCollapseTimer,
        },
        {
            popup: 'storage',
            switchId: 'toggle-all-rules',
            icon: '#icon-all-rules',
            viewBox: '0 0 38 38',
            svgClass: 'svg-all-rules',
            iconClass: 'svg-settings-container all-rules-checks button-rules-header',
            iconTitle: $tt('configureStorageCtrlClick'),
            checked: isAllRulesActive,
            // Nothing to turn on when there are no rules yet.
            disabled: !hasRules,
            tabindex: 0,
            titleFor: (on) => $tt(on ? 'disableAllRules' : 'enableAllRules'),
            onclick: onToggleAllRules,
            onchange: onToggleAllRules,
        },
    ]);
</script>

{#snippet control(entry)}
    <div class="settings-container">
        <button
            type="button"
            class={entry.iconClass ?? 'svg-settings-container button-rules-header'}
            translate="no"
            title={entry.iconTitle}
            oncontextmenu={(e) => {
                e.preventDefault();
                onOpenContextMenu(entry.popup, e);
            }}
            onclick={entry.onclick}
        >
            <svg
                class={entry.svgClass}
                width="30"
                height="30"
                viewBox={entry.viewBox}
                style={entry.iconStyle ?? 'color: var(--text-color);'}
                aria-hidden="true"
                focusable="false"
            >
                <use href={entry.icon}></use>
            </svg>
        </button>
        <label class="switch" for={entry.switchId} translate="no" title={entry.labelTitle}>
            <input
                class="input-settings-container"
                type="checkbox"
                id={entry.switchId}
                tabindex={entry.tabindex}
                title={entry.inputTitle}
                checked={entry.checked}
                disabled={entry.disabled}
                onchange={entry.onchange}
            />
            <span class="slider slider-header-controls" translate="no" title={entry.titleFor(entry.checked)}>
                <span class="switch-text-on" translate="no">on</span>
                <span class="switch-text-off" translate="no">off</span>
                <span class="switch-handle"><span class="switch-light"></span></span>
            </span>
        </label>
    </div>
{/snippet}

<!--
    The controls are roots of the component, not children of a wrapper: the toolbar
    that renders them lays its children out with flex, and below 600px with
    `grid-template-columns: repeat(9, 1fr)`, so anything wrapping them would collapse
    them all into a single cell. This file used to carry a `.rules-controls` div that
    no stylesheet ever mentioned, which is why it could not be used as it stood.

    Expand-all sits between sort and prefixes and is written out on its own: it has no
    switch, no popup and a disabled state, so folding it into the list above would have
    cost more branches than it saved.
-->
{#each CONTROLS_BEFORE_EXPAND as entry (entry.popup)}
    {@render control(entry)}
{/each}
<div class="settings-container expand-small-container">
    <button
        id="expand-all-small-btn"
        class="expand-btn-small button-rules-header"
        type="button"
        translate="no"
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
{#each CONTROLS_AFTER_EXPAND as entry (entry.popup)}
    {@render control(entry)}
{/each}
