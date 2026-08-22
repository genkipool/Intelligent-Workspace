<script>
    /**
     * [AI INSTRUCTION]
     * AN ON/OFF SETTING AS A BUTTON, NOT A TICK BOX.
     *
     * A checkbox is a small target with a label that has to be read to know which way
     * round it is. A button that stays pressed says its own state, is the same size as
     * everything else on the row, and can hold an icon. `aria-pressed` is what carries
     * the state to a screen reader, so the label never has to change wording.
     */
    let { pressed = false, label = '', title = '', disabled = false, onchange, children } = $props();
</script>

<button
    type="button"
    class="toggle-button"
    class:pressed
    aria-pressed={pressed}
    {disabled}
    {title}
    onclick={() => onchange?.(!pressed)}
>
    {#if children}{@render children()}{/if}
    <span>{label}</span>
</button>

<style>
    .toggle-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border: 1px solid var(--border-color);
        border-radius: 999px;
        background: transparent;
        color: var(--text-color);
        font-family: inherit;
        font-size: 11px;
        line-height: 1.4;
        cursor: pointer;
        transition:
            background 0.15s ease,
            border-color 0.15s ease,
            color 0.15s ease;
    }

    .toggle-button:hover:not(:disabled) {
        border-color: var(--interactive-color);
    }

    /* Pressed is a tint plus an accent border, not a solid accent fill.
       No text variable is readable on a solid `--interactive-color` in every theme:
       `--text-on-color` is the accent itself in the light and viridian palettes, and
       `--text-color` is a mid grey on the dark palette's mid-grey accent. On a tint
       the ordinary text colour always reads, and this matches the selected chips and
       the active sidebar rows. */
    .toggle-button.pressed {
        background: color-mix(in srgb, var(--interactive-color) 22%, transparent);
        border-color: var(--interactive-color);
        color: var(--text-color);
        font-weight: 600;
    }

    .toggle-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .toggle-button:focus-visible {
        outline: 2px solid var(--interactive-color);
        outline-offset: 2px;
    }
</style>
