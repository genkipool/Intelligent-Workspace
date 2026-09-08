/**
 * [AI INSTRUCTION]
 * COLOUR MATHS FOR THE PICKERS.
 *
 * Everything the extension stores is a hex string — a theme's slots, a rule's tint,
 * whatever the eyedropper reads off the screen. HSV, RGB and HSL only exist while a
 * picker is open: a square of saturation and brightness with a hue bar under it is
 * the only shape that lets someone *find* a colour rather than type one, and the
 * numbers beside it are for the people who already know the colour they want. All of
 * them are converted back to hex the moment a value leaves the picker.
 *
 * ALPHA. A colour is `#rrggbb` while it is opaque and `#rrggbbaa` when it is not, so
 * nothing that was written before transparency existed changes shape. CSS reads both.
 *
 * Kept out of the components so the next picker does not grow its own copy.
 */

/**
 * Anything a user or a CSS variable may offer -> `#rrggbb` / `#rrggbbaa`.
 *
 * `#fff` is a colour a theme really uses (see `styles/themes.css`), a hex typed by
 * hand arrives without its `#` as often as with it, and `#fff8` is the short form of
 * a translucent one.
 *
 * @param {unknown} input
 * @returns {string | null} The normalised colour, or null when it is not one.
 */
export function normalizeHex(input) {
    const text = String(input ?? '').trim();
    const hex = (text.startsWith('#') ? text.slice(1) : text).toLowerCase();
    if (/^[0-9a-f]{3,4}$/.test(hex)) return `#${[...hex].map((c) => c + c).join('')}`;
    if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{8}$/.test(hex)) return `#${hex}`;
    return null;
}

/**
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }} Channels 0-255. Black for anything
 *   that is not a colour, so callers never have to guard a null.
 */
export function hexToRgb(hex) {
    const value = normalizeHex(hex) ?? '#000000';
    const n = Number.parseInt(value.slice(1, 7), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * @param {string} hex
 * @returns {number} Opacity 0-1. A colour without an alpha pair is opaque.
 */
export function hexAlpha(hex) {
    const value = normalizeHex(hex) ?? '#000000';
    if (value.length !== 9) return 1;
    return Math.round((Number.parseInt(value.slice(7, 9), 16) / 255) * 100) / 100;
}

/**
 * @param {{ r: number, g: number, b: number }} rgb Channels 0-255, rounded and clamped.
 * @returns {string} `#rrggbb`.
 */
export function rgbToHex({ r, g, b }) {
    const channel = (c) =>
        Math.round(Math.min(Math.max(c, 0), 255))
            .toString(16)
            .padStart(2, '0');
    return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Puts an opacity on a colour, and takes the pair off again when it is opaque: an
 * opaque colour is written the way it always was.
 *
 * @param {string} hex
 * @param {number} alpha 0-1.
 * @returns {string} `#rrggbb` or `#rrggbbaa`.
 */
export function withAlpha(hex, alpha = 1) {
    const value = (normalizeHex(hex) ?? '#000000').slice(0, 7);
    const a = Math.min(Math.max(Number(alpha), 0), 1);
    if (a >= 1) return value;
    return `${value}${Math.round(a * 255)
        .toString(16)
        .padStart(2, '0')}`;
}

/**
 * @param {string} hex
 * @returns {{ h: number, s: number, v: number }} Hue in degrees, saturation and value
 *   as 0-1. A grey has no hue of its own and comes back as 0.
 */
export function hexToHsv(hex) {
    const { r, g, b } = hexToRgb(hex);
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    let h = 0;
    if (delta) {
        if (max === rn) h = ((gn - bn) / delta) % 6;
        else if (max === gn) h = (bn - rn) / delta + 2;
        else h = (rn - gn) / delta + 4;
        h = (h * 60 + 360) % 360;
    }

    return { h, s: max ? delta / max : 0, v: max };
}

/**
 * @param {number} h Hue in degrees; any number, wrapped.
 * @param {number} s 0-1.
 * @param {number} v 0-1.
 * @returns {string} `#rrggbb`.
 */
export function hsvToHex(h, s, v) {
    const hue = ((h % 360) + 360) % 360;
    const sat = Math.min(Math.max(s, 0), 1);
    const val = Math.min(Math.max(v, 0), 1);

    const c = val * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = val - c;
    const [r, g, b] = [
        [c, x, 0],
        [x, c, 0],
        [0, c, x],
        [0, x, c],
        [x, 0, c],
        [c, 0, x],
    ][Math.floor(hue / 60) % 6];

    return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

/**
 * @param {string} hex
 * @returns {{ h: number, s: number, l: number }} Hue in degrees, saturation and
 *   lightness as percentages, all rounded: HSL is shown to be read and typed.
 */
export function hexToHsl(hex) {
    const { r, g, b } = hexToRgb(hex);
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;
    if (delta) {
        s = delta / (1 - Math.abs(2 * l - 1));
        if (max === rn) h = ((gn - bn) / delta) % 6;
        else if (max === gn) h = (bn - rn) / delta + 2;
        else h = (rn - gn) / delta + 4;
        h = (h * 60 + 360) % 360;
    }

    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * @param {number} h Hue in degrees.
 * @param {number} s Saturation 0-100.
 * @param {number} l Lightness 0-100.
 * @returns {string} `#rrggbb`.
 */
export function hslToHex(h, s, l) {
    const hue = ((h % 360) + 360) % 360;
    const sat = Math.min(Math.max(s, 0), 100) / 100;
    const light = Math.min(Math.max(l, 0), 100) / 100;

    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = light - c / 2;
    const [r, g, b] = [
        [c, x, 0],
        [x, c, 0],
        [0, c, x],
        [0, x, c],
        [x, 0, c],
        [c, 0, x],
    ][Math.floor(hue / 60) % 6];

    return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

/**
 * Whether a colour is light enough that black draws on it better than white. Used for
 * the ring on the picker's cursor, which sits on top of the colour itself and would
 * otherwise disappear at one end of the square.
 *
 * @param {string} hex
 * @returns {boolean}
 */
export function isLightColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    // Rec. 601 luma: cheap, and it is a legibility hint, not a contrast ratio.
    return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/**
 * The notations a picker can show. Adding one here, with its channels below, is all
 * it takes: the picker builds its fields from these two tables.
 */
export const COLOR_FORMATS = ['hex', 'rgb', 'hsla'];

/**
 * The numeric fields each notation is made of. `hex` has none — it is one text field —
 * so it is absent on purpose.
 *
 * @type {Record<string, Array<{ key: string, label: string, title: string, min: number, max: number, step: number, decimals: number }>>}
 */
export const COLOR_CHANNELS = {
    rgb: [
        { key: 'r', label: 'R', title: 'Red', min: 0, max: 255, step: 1, decimals: 0 },
        { key: 'g', label: 'G', title: 'Green', min: 0, max: 255, step: 1, decimals: 0 },
        { key: 'b', label: 'B', title: 'Blue', min: 0, max: 255, step: 1, decimals: 0 },
        { key: 'a', label: 'A', title: 'Alpha', min: 0, max: 1, step: 0.05, decimals: 2 },
    ],
    hsla: [
        { key: 'h', label: 'H', title: 'Hue', min: 0, max: 360, step: 1, decimals: 0 },
        { key: 's', label: 'S', title: 'Saturation', min: 0, max: 100, step: 1, decimals: 0 },
        { key: 'l', label: 'L', title: 'Lightness', min: 0, max: 100, step: 1, decimals: 0 },
        { key: 'a', label: 'A', title: 'Alpha', min: 0, max: 1, step: 0.05, decimals: 2 },
    ],
};

/**
 * A colour split into the fields of a notation.
 *
 * @param {string} hex
 * @param {'rgb' | 'hsla'} format
 * @returns {Record<string, number>}
 */
export function hexToChannels(hex, format) {
    const a = hexAlpha(hex);
    if (format === 'hsla') return { ...hexToHsl(hex), a };
    return { ...hexToRgb(hex), a };
}

/**
 * And back. Missing fields fall back to what the colour already has, so a half-filled
 * form never turns into black.
 *
 * @param {Record<string, number>} channels
 * @param {'rgb' | 'hsla'} format
 * @param {string} [base] The colour being edited.
 * @returns {string} `#rrggbb` or `#rrggbbaa`.
 */
export function channelsToHex(channels, format, base = '#000000') {
    const current = hexToChannels(base, format);
    const value = { ...current, ...channels };
    const clamp = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);
    const rgb =
        format === 'hsla'
            ? hslToHex(clamp(value.h, 0, 360), clamp(value.s, 0, 100), clamp(value.l, 0, 100))
            : rgbToHex({ r: clamp(value.r, 0, 255), g: clamp(value.g, 0, 255), b: clamp(value.b, 0, 255) });
    return withAlpha(rgb, clamp(value.a, 0, 1));
}

/**
 * How a colour is written for the user to read and copy. Always valid CSS, and the
 * `a` is only there when the colour is actually translucent.
 *
 * @param {string} hex
 * @param {'hex' | 'rgb' | 'hsla'} [format]
 * @returns {string}
 */
export function formatColor(hex, format = 'hex') {
    const value = normalizeHex(hex) ?? '#000000';
    const a = hexAlpha(value);
    if (format === 'rgb') {
        const { r, g, b } = hexToRgb(value);
        return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
    }
    if (format === 'hsla') {
        const { h, s, l } = hexToHsl(value);
        return a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)`;
    }
    return value.toUpperCase();
}

/**
 * Whatever was typed or pasted -> `#rrggbb` / `#rrggbbaa`.
 *
 * Every notation is read whichever one is on show, because pasting a hex into a field
 * labelled RGB is a thing people do, and `rgb(...)`, `255 0 0` and `255,0,0` are the
 * same three numbers.
 *
 * @param {string} text
 * @returns {string | null} null when it is not a colour.
 */
export function parseColor(text) {
    const raw = String(text ?? '').trim();
    const hex = normalizeHex(raw);
    if (hex) return hex;

    const isHsl = /^hsla?\s*\(/i.test(raw);
    const numbers = raw
        .replace(/^(?:rgba?|hsla?)\s*\(/i, '')
        .replace(/\)\s*$/, '')
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map((n) => Number(n.replace('%', '').replace(/deg$/i, '')));
    if (numbers.length < 3 || numbers.some((n) => !Number.isFinite(n))) return null;

    const alpha = numbers.length > 3 ? Math.min(Math.max(numbers[3], 0), 1) : 1;
    if (isHsl) return withAlpha(hslToHex(numbers[0], numbers[1], numbers[2]), alpha);
    if (numbers.slice(0, 3).some((n) => n < 0 || n > 255)) return null;
    return withAlpha(rgbToHex({ r: numbers[0], g: numbers[1], b: numbers[2] }), alpha);
}
