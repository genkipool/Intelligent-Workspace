/**
 * [AI INSTRUCTION]
 * SINGLE SOURCE OF TRUTH FOR DASHBOARD CHART THEMING.
 *
 * Every dashboard page (pomodoro, web activity, whatever comes next) paints its
 * charts with the palette the user picked, which lives in CSS custom properties on
 * `<html>`. Chart.js cannot read those, so each value has to be resolved to a real
 * colour first — and mixed, faded and turned into gradients by hand.
 *
 * All of that used to live inside the pomodoro dashboard component. Do NOT copy it
 * into a new page: import from here, and if a new page needs another shade, add it
 * here so both pages keep the same look.
 */

/** Resolves a CSS custom property to its computed value. Accepts `x`, `--x`, `var(--x)`. */
export function cssVar(v) {
    const name = v.startsWith('var(') ? v.slice(4, -1) : v.startsWith('--') ? v : '--' + v;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name;
}

const FALLBACK_RGB = { r: 52, g: 152, b: 219, a: 1 };

/**
 * Turns any CSS colour — hex, rgb(), or a keyword/`color-mix()` the browser knows —
 * into channel numbers. The canvas fallback is what makes `color-mix()` work: the
 * browser resolves it while painting a single pixel.
 */
function parseRgba(color) {
    if (!color) return { ...FALLBACK_RGB };
    const str = String(color).trim();

    const short = str.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
    if (short) {
        return {
            r: parseInt(short[1] + short[1], 16),
            g: parseInt(short[2] + short[2], 16),
            b: parseInt(short[3] + short[3], 16),
            a: 1,
        };
    }

    if (/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/.test(str)) {
        return {
            r: parseInt(str.slice(1, 3), 16),
            g: parseInt(str.slice(3, 5), 16),
            b: parseInt(str.slice(5, 7), 16),
            a: 1,
        };
    }

    const rgbMatch = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/);
    if (rgbMatch) {
        return {
            r: parseFloat(rgbMatch[1]),
            g: parseFloat(rgbMatch[2]),
            b: parseFloat(rgbMatch[3]),
            a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
        };
    }

    try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 1;
        testCanvas.height = 1;
        const testCtx = testCanvas.getContext('2d');
        testCtx.fillStyle = str;
        testCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = testCtx.getImageData(0, 0, 1, 1).data;
        return { r, g, b, a: a / 255 };
    } catch {
        return { ...FALLBACK_RGB };
    }
}

/** The same colour at a given opacity, as a string Chart.js accepts. */
export function colorMix(color, alpha = 1) {
    const rgba = parseRgba(color);
    return `rgba(${rgba.r},${rgba.g},${rgba.b},${alpha})`;
}

/** Mixes two colours, `pct1` being how much of the first one survives. */
export function blendColors(c1, c2, pct1 = 50) {
    const rgb1 = parseRgba(c1);
    const rgb2 = parseRgba(c2);
    const w1 = pct1 / 100;
    const w2 = 1 - w1;
    return `rgb(${Math.round(rgb1.r * w1 + rgb2.r * w2)},${Math.round(rgb1.g * w1 + rgb2.g * w2)},${Math.round(
        rgb1.b * w1 + rgb2.b * w2,
    )})`;
}

/** Vertical fade of a theme colour, for bar and area fills. */
export function createVerticalGradient(ctx, chartArea, varName, alphaStart = 0.8, alphaEnd = 0.2) {
    if (!chartArea || !ctx) return colorMix(cssVar(varName), (alphaStart + alphaEnd) / 2);
    const { top = 0, bottom = 100 } = chartArea;
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    const baseColor = cssVar(varName) || '#3498db';
    gradient.addColorStop(0, colorMix(baseColor, alphaStart));
    gradient.addColorStop(1, colorMix(baseColor, alphaEnd));
    return gradient;
}

/**
 * A categorical palette derived from the active theme, so a chart with a dozen
 * series still reads as one design instead of a box of crayons.
 */
function getThemeSeriesColors() {
    const cInteractive = cssVar('--interactive-color') || '#3498db';
    const cAction = cssVar('--action-color') || '#3498db';
    const cTextOn = cssVar('--text-on-color') || '#ffffff';
    const cText = cssVar('--text-color') || '#000000';
    const cError = cssVar('--error-color') || '#e74c3c';
    const cHeader = cssVar('--header-color') || cAction;

    return [
        cInteractive,
        cAction,
        blendColors(cInteractive, cTextOn, 75),
        blendColors(cAction, cTextOn, 75),
        blendColors(cInteractive, cError, 65),
        blendColors(cAction, cError, 65),
        blendColors(cHeader, cInteractive, 60),
        blendColors(cError, cAction, 60),
        blendColors(cInteractive, cText, 70),
        blendColors(cAction, cText, 70),
        blendColors(cHeader, cTextOn, 70),
        blendColors(cError, cTextOn, 70),
    ];
}

/** The nth series colour, wrapping around the palette. */
export function getSeriesColor(idx) {
    const palette = getThemeSeriesColors();
    return palette[idx % palette.length];
}

/** Green-to-red scale for a 0-100 score, expressed in theme colours. */
export function getThemeScoreColor(pct) {
    const cInteractive = cssVar('--interactive-color') || '#3498db';
    const cAction = cssVar('--action-color') || '#3498db';
    const cTextOn = cssVar('--text-on-color') || '#ffffff';
    const cError = cssVar('--error-color') || '#e74c3c';

    if (pct >= 80) return blendColors(cInteractive, cTextOn, 75);
    if (pct >= 60) return cInteractive;
    if (pct >= 40) return blendColors(cInteractive, cAction, 60);
    return cError;
}

const MONO_FONT = "'Roboto Mono', monospace";

/** Chart.js globals. Call once per page, after the palette is on `<html>`. */
export function applyChartDefaults(Chart) {
    Chart.defaults.color = cssVar('--text-color');
    if (Chart.defaults.font) Chart.defaults.font.family = MONO_FONT;
}

/** Tooltip styling shared by every chart on every dashboard. */
export const tooltipDef = () => ({
    backgroundColor: cssVar('--bg-panel-color'),
    borderColor: cssVar('--border-color'),
    borderWidth: 1,
    titleColor: cssVar('--text-on-color'),
    bodyColor: cssVar('--text-color'),
    padding: 10,
    cornerRadius: 8,
    titleFont: { family: MONO_FONT, size: 12, weight: '600' },
    bodyFont: { family: MONO_FONT, size: 11 },
    displayColors: true,
    boxPadding: 4,
});

export const scaleDef = () => ({
    grid: { color: cssVar('--border-color'), drawBorder: false },
    border: { display: false },
});

export const tickDef = () => ({
    color: cssVar('--text-color'),
    font: { family: MONO_FONT, size: 11 },
});
