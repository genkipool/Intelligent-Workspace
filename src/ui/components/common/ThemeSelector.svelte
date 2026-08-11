<script>
    import { t, currentLang, i18nStore, tt } from '../../stores/i18nStore.js';
    import { activeTheme, themeStore } from '../../stores/themeStore.js';

    let { onNavigate } = $props();

    const themes = ['light', 'dark', 'system', 'viridian', 'custom'];

    function handleThemeClick(themeName) {
        if (themeName === 'custom') {
            if (onNavigate) onNavigate(themeName);
            return;
        }
        themeStore.setTheme(themeName);
    }

    function toggleLanguage(e) {
        const selectedLang = e.target.checked ? 'es' : 'en';
        i18nStore.changeLanguage(selectedLang);
    }

    function setLanguage(lang) {
        i18nStore.changeLanguage(lang);
    }
</script>

<section class="theme-selector">
    <div class="theme-selector-header">
        <div class="theme-title">{$t('selectTheme')}</div>
        <menu class="language-selector">
            <button
                id="lang-en"
                type="button"
                title={$tt('selectLangEn')}
                style="font-weight: {$currentLang === 'en' ? 'bold' : 'normal'}"
                onclick={() => setLanguage('en')}>en</button
            >
            <label class="switch" title={$tt('toggleLanguage')}>
                <input
                    type="checkbox"
                    id="language-toggle"
                    tabindex="0"
                    checked={$currentLang === 'es'}
                    onchange={toggleLanguage}
                />
                <span class="slider"></span>
            </label>
            <button
                id="lang-es"
                type="button"
                title={$tt('selectLangEs')}
                style="font-weight: {$currentLang === 'es' ? 'bold' : 'normal'}"
                onclick={() => setLanguage('es')}>es</button
            >
        </menu>
    </div>
    <div class="theme-options">
        {#each themes as theme (theme)}
            <div class="theme-option" data-theme={theme} class:active={$activeTheme === theme}>
                <button
                    id="theme-{theme}-btn"
                    class="theme-button"
                    type="button"
                    aria-pressed={$activeTheme === theme}
                    title={$tt(`select${theme.charAt(0).toUpperCase() + theme.slice(1)}Theme`)}
                    onclick={() => handleThemeClick(theme)}
                >
                    <span>{$t(theme)}</span>
                </button>
            </div>
        {/each}
    </div>
</section>
