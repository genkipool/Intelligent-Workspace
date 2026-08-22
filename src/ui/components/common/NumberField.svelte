<script>
    /**
     * [AI INSTRUCTION]
     * THE NUMBER INPUT THE WHOLE EXTENSION SHOULD USE.
     *
     * The rules page grew four copies of the same twenty lines — block `e`/`E`/`+`/`-`,
     * clamp to the range while typing, keep an empty box usable — once per panel with
     * a numeric setting. This is that behaviour in one place, with the look those
     * panels already have: a bordered box on the page background, centred digits, and
     * the browser's own arrows tinted by `utils/numberSpinner.js`, which the host page
     * initialises once.
     *
     * Clamping happens as the value is typed, not on blur, because a box that accepts
     * 900 and silently means 100 is worse than one that will not let 900 be typed.
     */
    let {
        value = $bindable(0),
        min = 0,
        max = 999,
        step = 1,
        /** Digits the box is sized for, so a row of them lines up. */
        digits = 3,
        ariaLabel = '',
        title = '',
        disabled = false,
        /** Called with the clamped number after every accepted edit. */
        onchange,
    } = $props();

    function blockExponent(event) {
        if (['e', 'E', '+', '-'].includes(event.key)) event.preventDefault();
    }

    function handleInput(event) {
        const input = event.currentTarget;
        // An empty box is a legitimate half-typed state, and reads as the minimum.
        if (input.value === '') {
            value = min;
            onchange?.(min);
            return;
        }
        const parsed = Number.parseFloat(input.value);
        if (Number.isNaN(parsed)) return;
        const clamped = Math.min(max, Math.max(min, parsed));
        if (clamped !== parsed) input.value = String(clamped);
        value = clamped;
        onchange?.(clamped);
    }
</script>

<input
    class="number-field"
    type="number"
    {min}
    {max}
    {step}
    {disabled}
    {title}
    aria-label={ariaLabel}
    style="--number-field-digits:{digits}"
    {value}
    onkeydown={blockExponent}
    oninput={handleInput}
/>

<style>
    /* Scoped on purpose: this is used on pages whose stylesheets define different
       token sets, so it carries its own sizing and only borrows the theme colours. */
    .number-field {
        width: calc(var(--number-field-digits) * 1ch + 2.6em);
        height: 26px;
        padding: 4px;
        box-sizing: border-box;
        border: 1px solid var(--border-color);
        /* The rules page resolves `--small-border-radius` to 6–8px at desktop widths,
           so this sits inside that range and matches the selects it stands next to. */
        border-radius: 7px;
        background-color: var(--bg-color);
        color: var(--text-color);
        caret-color: var(--text-on-color);
        /* Not `inherit`: dropped into a table cell it would pick up the monospace
           face and stop matching the boxes on the rules page. */
        font-family: var(--sans, 'Roboto Flex', system-ui, sans-serif);
        font-size: 12px;
        text-align: center;
        margin: 0;
    }

    .number-field:focus {
        outline: none;
        border-color: var(--text-on-color);
    }

    .number-field:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--text-on-color) 60%, var(--border-color));
    }

    .number-field:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
</style>
