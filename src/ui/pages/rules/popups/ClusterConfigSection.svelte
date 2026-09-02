<script>
    import { t, tt } from '../../../stores/i18nStore.js';
    import { getThemeColors } from '../../../services/constants.js';
    import { blockNumericKeys } from '../../../services/numericInput.js';
    import ColorPopup from './ColorPopup.svelte';

    /**
     * The Configure Groups panel. The header popup and the settings modal are two
     * faces of the same settings, so they render this one component and only differ
     * in the id prefix, exactly as the original does.
     *
     * @typedef {object} Props
     * @property {object} clusterConfig - Bound configuration.
     * @property {string} [idPrefix] - `''` for the popup, `'modal-'` for the modal.
     * @property {() => void} [onchange] - Called (debounced) after every edit.
     * @property {() => void} [onreset] - Called when the defaults are restored.
     */
    let { clusterConfig = $bindable(), idPrefix = '', onchange, onreset } = $props();

    const themeColors = getThemeColors();

    // Groupings without a name or a colour of their own.
    const PLAIN_ENTRIES = [
        {
            key: 'compactMode',
            labelKey: 'enableCompactMode',
            descKey: 'enableCompactModeTooltip',
            switchId: 'cluster-compact-enabled',
            thresholdId: 'compact-threshold',
            thresholdLabelKey: 'compactThreshold',
        },
        {
            key: 'domains',
            labelKey: 'enableDomainGroups',
            descKey: 'domainGroupingDesc',
            switchId: 'cluster-domains-enabled',
            thresholdId: 'domain-threshold',
            thresholdLabelKey: 'domainThreshold',
        },
        {
            key: 'subdomains',
            labelKey: 'enableSubdomainGroups',
            descKey: 'subDomainGroupingDesc',
            switchId: 'cluster-subdomains-enabled',
            thresholdId: 'subdomain-threshold',
            thresholdLabelKey: 'subdomainThreshold',
        },
        {
            key: 'ipAddress',
            labelKey: 'enableIpAddressGroups',
            descKey: 'ipGroupingDesc',
            switchId: 'enabled-ipAddress',
            thresholdId: 'ip-threshold',
            thresholdLabelKey: 'ipThreshold',
        },
    ];

    // Groupings the user can rename and recolour.
    const NAMED_ENTRIES = [
        {
            key: 'chrome',
            labelKey: 'renameChromeLabel',
            descKey: 'renameChromeDesc',
            thresholdLabelKey: 'chromeThreshold',
        },
        { key: 'files', labelKey: 'renameFilesLabel', descKey: 'renameFilesDesc', thresholdLabelKey: 'filesThreshold' },
        {
            key: 'extensions',
            labelKey: 'renameExtensionsLabel',
            descKey: 'renameExtensionsDesc',
            thresholdLabelKey: 'extensionsThreshold',
        },
        { key: 'misc', labelKey: 'renameMiscLabel', descKey: 'renameMiscDesc', thresholdLabelKey: 'miscThreshold' },
    ];

    // Each grouping keeps its switch and its threshold in a different place of the
    // stored shape, so reads and writes go through these two maps.
    function isEnabled(key) {
        if (key === 'compactMode') return clusterConfig.compactMode.enabled;
        if (key === 'domains') return clusterConfig.domainsEnabled;
        if (key === 'subdomains') return clusterConfig.subdomainsEnabled ?? false;
        return clusterConfig.specialGroups[key].enabled;
    }

    function writeEnabled(key, value) {
        if (key === 'compactMode') clusterConfig.compactMode.enabled = value;
        else if (key === 'domains') clusterConfig.domainsEnabled = value;
        else if (key === 'subdomains') clusterConfig.subdomainsEnabled = value;
        else clusterConfig.specialGroups[key].enabled = value;
    }

    function thresholdOf(key) {
        if (key === 'compactMode') return clusterConfig.compactMode.threshold;
        if (key === 'domains') return clusterConfig.domainThreshold;
        if (key === 'subdomains') return clusterConfig.subdomainThreshold ?? 2;
        return clusterConfig.specialGroups[key].threshold;
    }

    function setThreshold(key, raw) {
        let value = Number.parseInt(raw, 10);
        if (Number.isNaN(value)) return;
        if (value > 100) value = 100;
        if (value < 1) value = 1;
        if (key === 'compactMode') clusterConfig.compactMode.threshold = value;
        else if (key === 'domains') clusterConfig.domainThreshold = value;
        else if (key === 'subdomains') clusterConfig.subdomainThreshold = value;
        else clusterConfig.specialGroups[key].threshold = value;
        scheduleChange();
    }

    function handleThresholdInput(e, key) {
        let val = e.currentTarget.value;
        if (val !== '') {
            const num = Number.parseInt(val, 10);
            if (!Number.isNaN(num) && num > 100) {
                e.currentTarget.value = '100';
                val = '100';
            }
        }
        setThreshold(key, val);
    }

    /** Domain and subdomain grouping are mutually exclusive: enabling one disables the other. */
    function setEnabled(key, value) {
        writeEnabled(key, value);
        if (value && key === 'domains') writeEnabled('subdomains', false);
        if (value && key === 'subdomains') writeEnabled('domains', false);
        scheduleChange();
    }

    function setName(key, value) {
        clusterConfig.specialGroups[key].name = value;
        scheduleChange();
    }

    // The switch has to finish its animation before the configuration is written and
    // the tabs are regrouped. Regrouping keeps the browser process busy for a few
    // hundred milliseconds, and while it is, this page gets no frames at all: with
    // 120 tabs the slider froze mid-travel for 130-350 ms on every click, because
    // the old 60 ms delay landed right in the middle of the transition.
    // Keep in sync with the transition on `.slider` in rules.css.
    // It also coalesces typing in the threshold and name fields.
    const SWITCH_TRANSITION_MS = 150;
    let changeTimer = null;
    function scheduleChange() {
        clearTimeout(changeTimer);
        changeTimer = setTimeout(() => onchange?.(), SWITCH_TRANSITION_MS + 30);
    }

    let colorPickerFor = $state(null);
    let colorPickerPos = $state({ x: 0, y: 0 });

    function openColorPicker(e, groupKey) {
        e.stopPropagation();
        // Placed inside the panel that owns the indicator, to its right and level with
        // it. Coordinates are relative to that panel so the popup travels with the row.
        const host = e.currentTarget.offsetParent ?? document.body;
        const rect = e.currentTarget.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        colorPickerPos = {
            x: rect.right - hostRect.left + host.scrollLeft + 5,
            y: rect.top - hostRect.top + host.scrollTop - 6,
        };
        colorPickerFor = groupKey;
    }

    function pickColor(color) {
        if (!colorPickerFor) return;
        clusterConfig.specialGroups[colorPickerFor].color = color;
        scheduleChange();
    }
</script>

{#snippet toggle(key, switchId)}
    <label
        class="switch"
        translate="no"
        title={$tt(isEnabled(key) ? 'disableThisGrouping' : 'enableThisGrouping')}
        for={switchId}
    >
        <input
            type="checkbox"
            id={switchId}
            name={switchId}
            class="input-settings-container"
            checked={isEnabled(key)}
            onchange={(e) => setEnabled(key, e.currentTarget.checked)}
        />
        <span class="slider" translate="no"
            ><span class="switch-text-on" translate="no">on</span><span class="switch-text-off" translate="no">off</span
            ><span class="switch-handle"><span class="switch-light"></span></span></span
        >
    </label>
    <button
        type="button"
        class="svg-toggle-button"
        translate="no"
        title={$tt(isEnabled(key) ? 'disableThisGrouping' : 'enableThisGrouping')}
        aria-pressed={isEnabled(key)}
        onclick={() => setEnabled(key, !isEnabled(key))}
    >
        <svg width="20" height="20" viewBox="0 0 24 24"
            ><text
                class="svg-toggle-text"
                x="50%"
                y="55%"
                text-anchor="middle"
                dominant-baseline="middle"
                fill="var(--text-on-color)"
                translate="no">{isEnabled(key) ? 'ON' : 'OFF'}</text
            ></svg
        >
    </button>
{/snippet}

<h3>{$t('configureClusterTitle')}</h3>

<div class="cluster-config-section">
    {#each PLAIN_ENTRIES as entry (entry.key)}
        <div class="cluster-config-entry" data-group-key={entry.key}>
            <span></span>
            <label for="{idPrefix}{entry.switchId}" title={$tt(entry.descKey)}>{$t(entry.labelKey)}</label>
            <input
                type="number"
                id="{idPrefix}{entry.thresholdId}"
                min="1"
                max="100"
                aria-label={$t(entry.thresholdLabelKey)}
                title={$tt('groupThresholdDesc')}
                value={thresholdOf(entry.key)}
                onkeydown={blockNumericKeys}
                oninput={(e) => handleThresholdInput(e, entry.key)}
            />
            {@render toggle(entry.key, `${idPrefix}${entry.switchId}`)}
        </div>
    {/each}
</div>

{#each NAMED_ENTRIES as entry (entry.key)}
    <div class="cluster-config-entry" data-group-key={entry.key}>
        <span
            class="cluster-color-indicator"
            data-group={entry.key}
            role="button"
            tabindex="0"
            translate="no"
            title={$tt('changeGroupColor')}
            style="background-color: {themeColors[clusterConfig.specialGroups[entry.key].color] || themeColors.grey};"
            onclick={(e) => openColorPicker(e, entry.key)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openColorPicker(e, entry.key)}
        ></span>
        <label for="{idPrefix}enabled-{entry.key}" title={$tt(entry.descKey)}>{$t(entry.labelKey)}</label>
        <input
            type="text"
            id="{idPrefix}rename-{entry.key}"
            name="{idPrefix}rename-{entry.key}"
            maxlength="16"
            autocomplete="off"
            spellcheck="false"
            translate="no"
            value={clusterConfig.specialGroups[entry.key].name}
            oninput={(e) => setName(entry.key, e.currentTarget.value)}
        />
        <input
            type="number"
            id="{idPrefix}{entry.key}-threshold"
            min="1"
            max="100"
            aria-label={$t(entry.thresholdLabelKey)}
            title={$tt('groupThresholdDesc')}
            value={thresholdOf(entry.key)}
            onkeydown={blockNumericKeys}
            oninput={(e) => handleThresholdInput(e, entry.key)}
        />
        {@render toggle(entry.key, `${idPrefix}enabled-${entry.key}`)}
    </div>
{/each}

<div class="popup-actions">
    <button
        type="button"
        class="popup-reset-btn"
        id="{idPrefix}reset-cluster-btn"
        translate="no"
        onclick={() => onreset?.()}>{$t('resetClusterDefaults')}</button
    >
</div>

<ColorPopup
    absolute
    show={!!colorPickerFor}
    groupKey={colorPickerFor}
    position={colorPickerPos}
    onselect={({ color }) => pickColor(color)}
    onclose={(key) => {
        if (colorPickerFor === key) colorPickerFor = null;
    }}
/>
