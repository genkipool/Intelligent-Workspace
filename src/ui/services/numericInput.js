/**
 * The two things every `<input type="number">` in the settings needs.
 *
 * A number input accepts more than a number: `e`, `E`, `+` and `-` are all legal
 * characters in it, and typing one leaves `value` an empty string with no way to
 * tell it apart from a field the user cleared. The keydown guard stops them at the
 * source, and the clamp keeps the field and the state in step.
 *
 * The clamp writes the bounded value back into the element on purpose. Chrome does
 * not enforce `min`/`max` while typing — they only bite on form submission, and
 * these fields are never in a form — so without it a pasted `99999` would sit in
 * the box while the state held 1440.
 */

/** Keeps `e`, `E`, `+` and `-` out of a number field. */
export function blockNumericKeys(e) {
    if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
        e.preventDefault();
    }
}

/**
 * Bounds what was just typed and returns the value the state should hold.
 *
 * @param {InputEvent} e - The `oninput` event; its `currentTarget` is corrected in place.
 * @param {object} options
 * @param {number} options.min - Lower bound, and what an out-of-range low value becomes.
 * @param {number} options.max - Upper bound, likewise.
 * @param {boolean} [options.integer] - Parse with `parseInt` rather than `parseFloat`.
 * @param {number} [options.whenEmpty] - What a cleared field means. Defaults to `min`.
 * @returns {number}
 */
export function clampNumericInput(e, { min, max, integer = false, whenEmpty = min }) {
    const el = e.currentTarget;
    const val = el.value;
    const parse = (raw) => (integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw));

    if (val !== '') {
        const num = parse(val);
        if (!Number.isNaN(num) && num > max) {
            el.value = String(max);
            return max;
        }
        if (!Number.isNaN(num) && num < min) {
            el.value = String(min);
            return min;
        }
    }

    // `|| whenEmpty` also catches NaN from a field holding only a stray separator.
    return val === '' ? whenEmpty : parse(val) || whenEmpty;
}
