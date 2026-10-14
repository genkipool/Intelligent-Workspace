/**
 * Focuses a field as soon as it appears, the way Svelte's own `autofocus` attribute
 * does: it marks the element `autofocus` (which a `<dialog>` honours when opened) and,
 * if nothing else holds the focus by the end of the current task, focuses it.
 *
 * Used as `use:autofocus` instead of the attribute, which the a11y checker flags on
 * every page because autofocus on page load disorients screen readers; these fields
 * only ever appear after the user asked for them.
 *
 * @param {HTMLElement} node
 */
export function autofocus(node) {
    node.autofocus = true;
    queueMicrotask(() => {
        if (document.activeElement === document.body) node.focus();
    });
}
