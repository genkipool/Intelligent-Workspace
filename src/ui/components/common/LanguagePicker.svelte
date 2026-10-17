<script>
    /*
     * The list of the extension's languages, each with its short code on the right.
     *
     * Shared by the language switch in the popup, which opens it beside either side of
     * the switch, and by the OCR button in the gallery, which offers it after a run that
     * read nothing useful. Where it appears is the caller's business: this draws the box
     * and reports the choice, and the caller positions it and decides what to do then.
     */
    import { SUPPORTED_LANGUAGES } from '../../../utils/i18n.js';

    let { title, selected = null, onSelect } = $props();

    const shortCode = (code) => code.split('_')[0];
</script>

<div class="language-picker" role="listbox" aria-label={title}>
    <div class="language-picker-title">{title}</div>
    {#each SUPPORTED_LANGUAGES as option (option.code)}
        <button
            type="button"
            role="option"
            class="language-picker-option"
            class:is-selected={option.code === selected}
            aria-selected={option.code === selected}
            lang={option.code}
            onclick={(event) => {
                event.stopPropagation();
                onSelect?.(option.code);
            }}
        >
            <span class="language-picker-name">{option.nativeName}</span>
            <span class="language-picker-code">{shortCode(option.code)}</span>
        </button>
    {/each}
</div>

<style>
    .language-picker {
        width: max-content;
        min-width: 140px;
        max-width: 190px;
        /* No max-height: eleven rows fit, and a list this short reads better whole than
           behind a scrollbar. */
        padding: 4px;
        text-align: start; /* not whatever the page around it centres */
        background: var(--bg-panel-color);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }

    /* A long heading wraps rather than widening the list past its names. */
    .language-picker-title {
        padding: 4px 8px 6px;
        font-size: 11px;
        line-height: 1.3;
        color: var(--text-color);
        opacity: 0.7;
    }

    .language-picker-option {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 8px;
        border: none;
        border-radius: 5px;
        background: none;
        color: var(--text-color);
        font-size: 13px;
        text-align: start;
        cursor: pointer;
    }

    .language-picker-option:hover,
    .language-picker-option:focus-visible {
        outline: none;
        background-color: var(--action-color);
    }

    /* The language in use stands out at a glance: a tinted row with an accent bar at
       its edge, and bold. */
    .language-picker-option.is-selected {
        position: relative;
        font-weight: bold;
        background-color: color-mix(in srgb, var(--interactive-color) 22%, transparent);
        color: var(--text-color);
    }

    .language-picker-option.is-selected::before {
        content: '';
        position: absolute;
        left: 0;
        top: 4px;
        bottom: 4px;
        width: 3px;
        border-radius: 2px;
        background-color: var(--interactive-color);
    }

    .language-picker-option.is-selected .language-picker-code {
        opacity: 1;
    }

    .language-picker-code {
        display: inline-flex;
        align-items: center;
        font-size: 11px;
        opacity: 0.6;
        text-transform: lowercase;
        white-space: nowrap;
    }
</style>
