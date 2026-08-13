<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { allRulesActive, hasRules, hintsEnabled, settingsStore } from '../../stores/settingsStore.js';

    let { onOpenRules, onOpenListGroup, onOpenGemini } = $props();

    function toggleRules(e) {
        settingsStore.toggleRules(e.target.checked);
    }
    function toggleHints(e) {
        settingsStore.toggleHints(e.target.checked);
    }
</script>

<div class="settings-rules-actions">
    <div class="button-wrapper">
        <div class="title-with-toggle">
            <div class="section-title">{$t('managerRules')}</div>
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
        </div>
        <button
            id="open-rules-manager-btn"
            class="button"
            type="button"
            data-action="open-rules"
            tabindex="0"
            title={$tt('openSettingsRules')}
            onclick={onOpenRules}
        >
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"><use href="#icon-rules"></use></svg
            >
            <span>{$t('settingsRules')}</span>
        </button>
    </div>

    <div class="button-wrapper">
        <div class="section-title">{$t('managerGroups')}</div>
        <button
            id="list-group-inline-btn"
            class="button"
            type="button"
            tabindex="0"
            title={$tt('listTabGroups')}
            onclick={onOpenListGroup}
        >
            <svg width="16" height="16" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" focusable="false"
                ><use href="#icon-list-group"></use></svg
            >
            <span>{$t('listTabGroups')}</span>
        </button>
    </div>

    <div class="button-wrapper">
        <div class="title-with-toggle">
            <div class="section-title">{$t('customizeCommandsTooltip')}</div>
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
        </div>
        <button
            id="customize-hints-btn"
            class="button"
            type="button"
            tabindex="0"
            title={$tt('customizeNavKeyboardTitle')}
            onclick={() => (window.location.href = '../customize_hints/customize_hints.html')}
        >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
                ><use href="#icon-hints"></use></svg
            >
            <span>{$t('customizeCommandsTooltip')}</span>
        </button>
    </div>

    <div class="button-wrapper">
        <div class="section-title">{$t('openGeminiSidePanel')}</div>
        <button
            id="open-gemini-btn"
            class="button"
            type="button"
            tabindex="0"
            title={$tt('openSettingsGemini')}
            onclick={onOpenGemini}
        >
            <svg width="16" height="16" viewBox="0 0 471 471" aria-hidden="true" focusable="false"
                ><use href="#icon-gemini"></use></svg
            >
            <span>{$t('geminiQuery')}</span>
        </button>
    </div>
</div>
