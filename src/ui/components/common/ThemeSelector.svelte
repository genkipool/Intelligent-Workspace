<script>
    import { t, currentLang, i18nStore, tt } from '../../stores/i18nStore.js';
    import { activeTheme, themeStore } from '../../stores/themeStore.js';
    import { SUPPORTED_LANGUAGES, LANGUAGE_PAIR_STORAGE_KEY, languagePair } from '../../../utils/i18n.js';
    import LanguagePicker from './LanguagePicker.svelte';

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
     * The switch flips between two languages: the user's on the left, English on the
     * right (`languagePair`). Hovering either name opens the list of every language,
     * so any two can sit on the switch and be swapped with one click from then on.
     */
    let pair = $state(languagePair(null));
    let pairLoaded = $state(false);
    let pickerSide = $state(null);
    let closeTimer = null;

    const byCode = new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language]));
    const shortCode = (code) => code.split('_')[0];

    chrome.storage?.local?.get(LANGUAGE_PAIR_STORAGE_KEY).then((stored) => {
        pair = languagePair(stored?.[LANGUAGE_PAIR_STORAGE_KEY]);
        pairLoaded = true;
    });

    // A language chosen somewhere else (another page, the omnibar) that is on neither
    // side takes the left one, so the switch always shows the language in use.
    $effect(() => {
        if (pairLoaded && $currentLang && !pair.includes($currentLang) && byCode.has($currentLang)) {
            savePair($currentLang === pair[1] ? pair : [$currentLang, pair[1]]);
        }
    });

    function savePair(next) {
        pair = next;
        chrome.storage?.local?.set({ [LANGUAGE_PAIR_STORAGE_KEY]: next });
    }

    function setLanguage(lang) {
        if (lang !== $currentLang) i18nStore.changeLanguage(lang);
    }

    function chooseForSide(side, code) {
        const other = 1 - side;
        const next = [...pair];
        // Picking the language already on the other side swaps the two.
        if (next[other] === code) next[other] = next[side];
        next[side] = code;
        savePair(next);
        setLanguage(code);
        pickerSide = null;
    }

    function openPicker(side) {
        clearTimeout(closeTimer);
        pickerSide = side;
    }

    // A short grace period lets the pointer travel from the name into the list.
    function closePickerSoon() {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => (pickerSide = null), 250);
    }

    function handlePickerKey(event) {
        if (event.key === 'Escape') pickerSide = null;
    }
</script>

<section class="theme-selector">
    <div class="theme-selector-header">
        <div class="theme-title">{$t('selectTheme')}</div>
        <menu class="language-selector">
            {#each [0, null, 1] as side, i (i)}
                {#if side !== null}
                    {@const language = byCode.get(pair[side])}
                    <div
                        class="language-slot"
                        role="presentation"
                        onmouseenter={() => openPicker(side)}
                        onmouseleave={closePickerSoon}
                        onfocusin={() => openPicker(side)}
                        onfocusout={closePickerSoon}
                        onkeydown={handlePickerKey}
                    >
                        <button
                            class="language-option"
                            data-lang={language.code}
                            type="button"
                            lang={language.code}
                            title={$tt('languageOptionTitle', [language.nativeName])}
                            aria-pressed={$currentLang === language.code}
                            aria-haspopup="listbox"
                            aria-expanded={pickerSide === side}
                            onclick={() => setLanguage(language.code)}>{shortCode(language.code)}</button
                        >
                        {#if pickerSide === side}
                            <div class="language-picker-anchor">
                                <LanguagePicker
                                    title={$t('languagePairPickerTitle')}
                                    selected={pair[side]}
                                    onSelect={(code) => chooseForSide(side, code)}
                                />
                            </div>
                        {/if}
                    </div>
                {:else}
                    <label class="switch" title={$tt('languageSwitchTitle')}>
                        <input
                            type="checkbox"
                            id="language-toggle"
                            tabindex="0"
                            checked={$currentLang === pair[1]}
                            onchange={(e) => setLanguage(e.currentTarget.checked ? pair[1] : pair[0])}
                        />
                        <span class="slider"></span>
                    </label>
                {/if}
            {/each}
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

<style>
    .language-slot {
        position: relative;
        display: flex;
    }

    /* The switch sits at the right edge of the header, so both lists open leftwards,
       into the room there is. */
    .language-picker-anchor {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        z-index: 1000;
    }
</style>
