<script>
    import { t, currentLang, i18nStore, tt } from '../../stores/i18nStore.js';
    import { activeTheme, themeStore } from '../../stores/themeStore.js';
    import { SUPPORTED_LANGUAGES } from '../../../utils/i18n.js';

    let { onNavigate } = $props();

    const themes = ['light', 'dark', 'system', 'viridian', 'custom'];

    function handleThemeClick(themeName) {
        if (themeName === 'custom') {
            if (onNavigate) onNavigate(themeName);
            return;
        }
        themeStore.setTheme(themeName);
    }

    /*
     * Built from the supported languages, so adding one needs no change here. With
     * two it is the familiar switch between their codes; a third turns it into a
     * select, since a switch has only two positions.
     */
    const [firstLanguage, secondLanguage] = SUPPORTED_LANGUAGES;
    const useSwitch = SUPPORTED_LANGUAGES.length === 2;

    function setLanguage(lang) {
        if (lang !== $currentLang) i18nStore.changeLanguage(lang);
    }
</script>

<section class="theme-selector">
    <div class="theme-selector-header">
        <div class="theme-title">{$t('selectTheme')}</div>
        <menu class="language-selector">
            {#if useSwitch}
                {#each [firstLanguage, null, secondLanguage] as language, i (i)}
                    {#if language}
                        <button
                            class="language-option"
                            data-lang={language.code}
                            type="button"
                            lang={language.code}
                            title={$tt('languageOptionTitle', [language.nativeName])}
                            aria-pressed={$currentLang === language.code}
                            onclick={() => setLanguage(language.code)}>{language.code}</button
                        >
                    {:else}
                        <label class="switch" title={$tt('languageSwitchTitle')}>
                            <input
                                type="checkbox"
                                id="language-toggle"
                                tabindex="0"
                                checked={$currentLang === secondLanguage.code}
                                onchange={(e) =>
                                    setLanguage(e.currentTarget.checked ? secondLanguage.code : firstLanguage.code)}
                            />
                            <span class="slider"></span>
                        </label>
                    {/if}
                {/each}
            {:else}
                <select
                    class="language-select"
                    aria-label={$t('languageSelectLabel')}
                    value={$currentLang}
                    onchange={(e) => setLanguage(e.currentTarget.value)}
                >
                    {#each SUPPORTED_LANGUAGES as language (language.code)}
                        <option value={language.code} lang={language.code}>{language.nativeName}</option>
                    {/each}
                </select>
            {/if}
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
