<script>
    import { t } from '../../stores/i18nStore.js';
    import { allRulesActive, hasRules, hintsEnabled, settingsStore } from '../../stores/settingsStore.js';
    import ActionButtonGrid from './ActionButtonGrid.svelte';

    let { onOpenRules, onOpenListGroup, onOpenGemini } = $props();

    function toggleRules(e) {
        settingsStore.toggleRules(e.target.checked);
    }
    function toggleHints(e) {
        settingsStore.toggleHints(e.target.checked);
    }

    // The four entries only differ in their icon, their labels and what they open, so
    // the wrapper markup lives in ActionButtonGrid and this is just the data.
    const items = [
        {
            id: 'open-rules-manager-btn',
            titleKey: 'managerRules',
            labelKey: 'settingsRules',
            tooltipKey: 'openSettingsRules',
            icon: '#icon-rules',
            viewBox: '0 0 24 24',
            svgAttrs: {
                fill: 'none',
                stroke: 'currentColor',
                'stroke-width': '2',
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
            },
            onClick: onOpenRules,
        },
        {
            id: 'list-group-inline-btn',
            titleKey: 'managerGroups',
            labelKey: 'listTabGroups',
            tooltipKey: 'listTabGroups',
            icon: '#icon-list-group',
            viewBox: '0 0 512 512',
            svgAttrs: { fill: 'currentColor' },
            onClick: onOpenListGroup,
        },
        {
            id: 'customize-hints-btn',
            titleKey: 'customizeCommandsTooltip',
            labelKey: 'customizeCommandsTooltip',
            tooltipKey: 'customizeNavKeyboardTitle',
            icon: '#icon-hints',
            viewBox: '0 0 24 24',
            onClick: () => (window.location.href = '../customize_hints/customize_hints.html'),
        },
        {
            id: 'open-gemini-btn',
            titleKey: 'openGeminiSidePanel',
            labelKey: 'geminiQuery',
            tooltipKey: 'openSettingsGemini',
            icon: '#icon-gemini',
            viewBox: '0 0 471 471',
            onClick: onOpenGemini,
        },
    ];
</script>

{#snippet rulesToggle()}
    <label
        class="switch mini-switch"
        id="rules-nav-toggle-label"
        title={$t($allRulesActive ? 'disableAllRules' : 'enableAllRules')}
    >
        <input
            type="checkbox"
            id="rules-nav-toggle"
            tabindex="0"
            disabled={!$hasRules}
            bind:checked={$allRulesActive}
            onchange={toggleRules}
        />
        <span class="slider"></span>
    </label>
{/snippet}

{#snippet hintsToggle()}
    <label
        id="hints-slider-label"
        class="switch mini-switch"
        title={$t($hintsEnabled ? 'disableNavKeyboard' : 'enableNavKeyboard')}
    >
        <input
            type="checkbox"
            id="hints-enabled-toggle"
            tabindex="0"
            bind:checked={$hintsEnabled}
            onchange={toggleHints}
        />
        <span class="slider"></span>
    </label>
{/snippet}

<ActionButtonGrid {items} toggles={{ 'open-rules-manager-btn': rulesToggle, 'customize-hints-btn': hintsToggle }} />
