<script>
    import { onMount } from 'svelte';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';

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
     * The ceiling is enforced as the value is typed, because a box that accepts 900
     * and silently means 100 is worse than one that will not let 900 be typed. The
     * floor is not, and must not be: a number is typed one digit at a time, and the
     * first digit of 300 is 3. Snapping that up to a minimum of 15 rewrote the box
     * mid-word, so the next keystroke made 150 and the one after that 1500 — capped
     * to 900. Typing 300 into a box whose minimum was 15 was simply impossible, and
     * whatever came out of the attempt was saved. The floor is applied on blur.
     */
    let {
        value = $bindable(0),
        min = 0,
        max = 999,
        step = 1,
        /**
         * Fills the column it is given instead of sizing to `digits`. The width of
         * this box is normally its own business — a row of them has to line up — but
         * in a two-field row the split belongs to the row, and a page rule cannot win
         * that argument reliably against a scoped one of equal weight.
         */
        wide = false,
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
        // An empty box is a legitimate half-typed state; nothing is reported until
        // there is a number in it, and leaving it empty settles on the minimum.
        if (input.value === '') return;
        const parsed = Number.parseFloat(input.value);
        if (Number.isNaN(parsed)) return;
        const capped = Math.min(max, parsed);
        if (capped !== parsed) input.value = String(capped);
        value = capped;
        // A number still on its way up to the floor is half-typed, not an answer, so
        // it is not handed to the caller — which is what would store it.
        if (capped >= min) onchange?.(capped);
    }

    /** Leaving the box is where a half-typed number becomes an answer. */
    function handleBlur(event) {
        const input = event.currentTarget;
        const parsed = Number.parseFloat(input.value);
        const settled = Number.isNaN(parsed) ? min : Math.min(max, Math.max(min, parsed));
        input.value = String(settled);
        if (settled === value) return;
        value = settled;
        onchange?.(settled);
    }

    onMount(() => {
        return initNumberSpinnerArrows();
    });
</script>

<input
    class="number-field"
    class:is-wide={wide}
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
    onblur={handleBlur}
/>

<style>
    /* Scoped on purpose: this is used on pages whose stylesheets define different
       token sets, so it carries its own sizing and only borrows the theme colours. */
    .number-field {
        width: calc(var(--number-field-digits) * 1ch + 2.6em);
        height: 32px;
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

    .number-field.is-wide {
        width: 100%;
    }

    /*
     * The browser's own spinner, out of the way so the themed arrows can be seen.
     *
     * `utils/numberSpinner.js` paints an arrow pair as a background image in the
     * theme's colour, and says in its own comment that it expects the stylesheet to
     * have hidden the native control first. The rules page does that; the dashboards
     * never did, so the image landed *behind* Chrome's default arrows and what showed
     * was the default arrows. Doing it here means it travels with the component
     * instead of once per page that happens to remember.
     */
    .number-field::-webkit-inner-spin-button,
    .number-field::-webkit-outer-spin-button {
        -webkit-appearance: none;
        appearance: none;
        margin: 0;
        outline: none;
        padding: 0;
        cursor: pointer;
        background-color: transparent;
        background-size: contain;
        background-repeat: no-repeat;
        background-position: right;
        height: 26px;
        width: 23px;
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
