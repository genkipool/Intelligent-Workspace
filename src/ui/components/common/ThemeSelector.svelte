<script>
    import { t, currentLang, i18nStore, tt } from '../../stores/i18nStore.js';
    import { activeTheme, themeStore } from '../../stores/themeStore.js';
    import { SUPPORTED_LANGUAGES, LANGUAGE_PAIR_STORAGE_KEY, languagePair, loadMessages } from '../../../utils/i18n.js';
    import { fitLabel } from '../../actions/fitLabel.js';
    import { readMirror, writeMirror } from '../../../utils/firstPaintMirror.js';
    import LanguagePicker from './LanguagePicker.svelte';

    let { onNavigate } = $props();

    const themes = ['light', 'dark', 'system', 'viridian', 'custom'];

    /**
     * The theme names in English: a translation too long for its button (Spanish
     * "Viridiano" in a narrow side panel) is shown in English rather than cut short.
     */
    let english = $state({});
    loadMessages('en').then((messages) => (english = messages));

    function handleThemeClick(themeName) {
        if (themeName === 'custom') {
            if (onNavigate) onNavigate(themeName);
            return;
        }
        themeStore.setTheme(themeName);
    }

    /*
     * The switch flips between two languages: the user's on the left, English on the
     * right (`languagePair`). Clicking either name opens the list of every language,
     * so any two can sit on the switch and be swapped with one click from then on.
     * A click and not a hover: the list is how anyone finds out there are more than two
     * languages, and a hover opened it by accident on the way across the header while
     * never opening at all on a touch screen.
     */
    // Started from the pair shown last time, like the rules switch: read from
    // chrome.storage alone, the switch was drawn on the default pair and then slid
    // across in front of the user every time the home page was opened.
    let pair = $state(languagePair(readMirror(LANGUAGE_PAIR_STORAGE_KEY, null)));
    let pairLoaded = $state(false);
    let pickerSide = $state(null);
    let selectorEl = $state(null);

    const byCode = new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language]));
    const shortCode = (code) => code.split('_')[0];

    chrome.storage?.local?.get(LANGUAGE_PAIR_STORAGE_KEY).then((stored) => {
        pair = languagePair(stored?.[LANGUAGE_PAIR_STORAGE_KEY]);
        writeMirror(LANGUAGE_PAIR_STORAGE_KEY, pair);
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
        writeMirror(LANGUAGE_PAIR_STORAGE_KEY, next);
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

    function togglePicker(side) {
        pickerSide = pickerSide === side ? null : side;
    }

    /** A click anywhere outside the two names and their lists puts the list away. */
    function handleOutsideClick(event) {
        if (pickerSide !== null && !selectorEl?.contains(event.target)) pickerSide = null;
    }

    function handlePickerKey(event) {
        if (event.key !== 'Escape' || pickerSide === null) return;
        event.stopPropagation();
        pickerSide = null;
        // The keyboard goes back to the name that opened the list.
        event.currentTarget.querySelector('.language-option')?.focus();
    }
</script>

<svelte:window onclickcapture={handleOutsideClick} />

<section class="theme-selector">
    <div class="theme-selector-header">
        <div class="theme-title">{$t('selectTheme')}</div>
        <menu class="language-selector" bind:this={selectorEl}>
            {#each [0, null, 1] as side, i (i)}
                {#if side !== null}
                    {@const language = byCode.get(pair[side])}
                    <div class="language-slot" role="presentation" onkeydown={handlePickerKey}>
                        <button
                            class="language-option"
                            data-lang={language.code}
                            type="button"
                            lang={language.code}
                            title={$tt('languageChooseTitle')}
                            aria-pressed={$currentLang === language.code}
                            aria-haspopup="listbox"
                            aria-expanded={pickerSide === side}
                            onclick={() => togglePicker(side)}>{shortCode(language.code)}</button
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
                    <span use:fitLabel={{ label: $t(theme), fallback: english[theme]?.message }}></span>
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
