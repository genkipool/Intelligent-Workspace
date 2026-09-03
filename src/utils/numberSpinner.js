/**
 * Draws the up/down arrows of `<input type="number">`.
 *
 * The stylesheet hides the browser's own spinner (`appearance: none`) and expects a
 * background image in its place, but a stylesheet cannot tint that image with the
 * active theme. The arrows are therefore injected here as an inline SVG coloured with
 * the theme's own variable, and refreshed whenever the theme changes.
 */
const STYLE_ID = 'dynamic-spinner-styles';

function arrowsFor(color) {
    const encoded = color.replace('#', '%23');
    return (
        `url("data:image/svg+xml,<svg viewBox='0 0 1024 1024' xmlns='http://www.w3.org/2000/svg'>` +
        `<path fill='${encoded}' d='m620.6 562.3 36.2 36.2L512 743.3 367.2 598.5l36.2-36.2L512 670.9zM512 353.1l108.6 108.6 36.2-36.2L512 280.7 367.2 425.5l36.2 36.2z'/></svg>")`
    );
}

/** Paints the arrows with the current theme colour. Safe to call repeatedly. */
export function applyNumberSpinnerArrows() {
    if (typeof document === 'undefined') return false;
    const color =
        getComputedStyle(document.documentElement).getPropertyValue('--text-on-color').trim() ||
        getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() ||
        '#888888';

    let styleTag = document.getElementById(STYLE_ID);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = STYLE_ID;
        document.head.appendChild(styleTag);
    }
    styleTag.textContent = `
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button,
        .number-field::-webkit-inner-spin-button,
        .number-field::-webkit-outer-spin-button {
            background-image: ${arrowsFor(color)};
        }
    `;
    return true;
}

let activeObservers = 0;
let sharedObserver = null;

/**
 * Applies the arrows now and keeps them in step with theme changes.
 *
 * @returns {() => void} Stops observing.
 */
export function initNumberSpinnerArrows() {
    if (typeof document === 'undefined') return () => {};
    applyNumberSpinnerArrows();

    activeObservers++;
    if (!sharedObserver) {
        sharedObserver = new MutationObserver(() => applyNumberSpinnerArrows());
        sharedObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'style'],
        });
    }
    return () => {
        activeObservers--;
        if (activeObservers <= 0 && sharedObserver) {
            sharedObserver.disconnect();
            sharedObserver = null;
            activeObservers = 0;
        }
    };
}
