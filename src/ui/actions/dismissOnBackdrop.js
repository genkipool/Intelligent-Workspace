/**
 * Dismisses an overlay only when the pointer is both pressed and released on the
 * backdrop itself.
 *
 * A plain `click` handler is not enough: the click event fires on the nearest common
 * ancestor of the press and the release, so dragging a text selection out of an input
 * and letting go over the backdrop closed the overlay and threw the edit away. This
 * mirrors what the native `closedby="any"` light dismiss does for `<dialog>`.
 *
 * @param {HTMLElement} node - The backdrop element.
 * @param {() => void} onDismiss - Called when the backdrop is genuinely clicked.
 */
export function dismissOnBackdrop(node, onDismiss) {
    let pressedOnBackdrop = false;
    let dismiss = onDismiss;

    const handleDown = (event) => {
        pressedOnBackdrop = event.target === node && event.button === 0;
    };

    const handleUp = (event) => {
        const dismissed = pressedOnBackdrop && event.target === node;
        pressedOnBackdrop = false;
        if (dismissed) dismiss?.();
    };

    node.addEventListener('mousedown', handleDown);
    node.addEventListener('mouseup', handleUp);

    return {
        update(next) {
            dismiss = next;
        },
        destroy() {
            node.removeEventListener('mousedown', handleDown);
            node.removeEventListener('mouseup', handleUp);
        },
    };
}
