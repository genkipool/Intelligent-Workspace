/**
 * Writes a label into an element that has to keep it on one line, and swaps it for a
 * fallback (the English name) when the translation does not fit the room there is.
 *
 * The room changes — a popup is narrower than a side panel, and a side panel can be
 * dragged — so the choice is made again whenever the element is resized: a name that
 * was swapped for the fallback comes back as soon as it fits. When neither fits, the
 * fallback stays, cut with an ellipsis by the element's own CSS.
 *
 * Use it on an element with no children of its own: it owns the element's text.
 *
 *     <span use:fitLabel={{ label: $t('viridian'), fallback: english.viridian }}></span>
 *
 * @param {HTMLElement} node
 * @param {{ label: string, fallback?: string }} params
 */
export function fitLabel(node, params) {
    let { label, fallback } = params;

    const overflows = () => node.scrollWidth > node.clientWidth;

    function fit() {
        node.textContent = label ?? '';
        if (fallback && fallback !== label && overflows()) node.textContent = fallback;
    }

    const observer = new ResizeObserver(fit);
    observer.observe(node);
    // The first measurement can run before the extension's font has loaded, when the
    // text is drawn in a fallback face of a different width.
    document.fonts?.ready.then(fit);
    fit();

    return {
        update(next) {
            ({ label, fallback } = next);
            fit();
        },
        destroy() {
            observer.disconnect();
        },
    };
}
