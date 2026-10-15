/**
 * [AI INSTRUCTION]
 * MOVES A NODE TO THE END OF THE BODY AND PUTS IT BACK WHEN IT GOES.
 *
 * For the floating things — a picker, a menu, a popup — that are declared inside the
 * component they belong to but must not *live* there. Two reasons, and both have
 * already bitten:
 *
 * 1. PAGE CSS. A page styles its own dialog with descendant rules like
 *    `.wa-modal input[type='text']`, which are not wrong, and a shared popup rendered
 *    inside that dialog inherits them. That is how the web activity time picker ended
 *    up with 12px digits in a 32px box while the very same component looked right on
 *    the themes page. Out at the body, only the component's own scoped rules and the
 *    theme tokens reach it, so one component really does mean one design.
 * 2. CLIPPING AND STACKING. `overflow: hidden` or a `transform` anywhere up the tree
 *    traps a `position: fixed` child; at the body there is nothing above it.
 *
 * Svelte's scoping is a class on the element, so moving the node keeps its styles.
 *
 * 3. MODAL `<dialog>`s. While one opened with `showModal()` is up (the settings drawer),
 *    everything outside it is inert and drawn underneath it, so a dialog, picker or
 *    confirmation opened from inside it has to live inside it too. With no target given
 *    the node goes to the topmost such dialog, and to the body when there is none.
 *
 * @param {HTMLElement} node
 * @param {HTMLElement} [target] Where to move it. Defaults to `modalHost()`.
 */
export function portal(node, target = undefined) {
    let host = target || modalHost();
    host.appendChild(node);

    return {
        update(next) {
            const wanted = next || modalHost();
            if (wanted === host) return;
            host = wanted;
            host.appendChild(node);
        },
        destroy() {
            // Svelte removes the node itself when the block is torn down; this only
            // matters when the action is destroyed while the node is still in place.
            node.remove();
        },
    };
}

/**
 * Where something that floats over the page has to be put to be seen and used: the
 * topmost modal `<dialog>` that is open, or the body.
 *
 * @returns {HTMLElement}
 */
export function modalHost() {
    const open = document.querySelectorAll('dialog[open]');
    for (let i = open.length - 1; i >= 0; i--) {
        if (open[i].matches(':modal')) return open[i];
    }
    return document.body;
}
