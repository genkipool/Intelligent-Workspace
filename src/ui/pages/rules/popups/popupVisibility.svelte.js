/**
 * The opening and closing animation the header popups had before the migration.
 *
 * The stylesheet describes it in full: the popups sit at `opacity: 0` and
 * `scaleY(0)` and `.open` brings them up over 0.25s. Below 600px — the width of
 * the side panel — it also centres them with `left: 50%` and a
 * `translateX(-50%)` that every one of those transforms carries. That is why the
 * animation cannot be written in JavaScript: setting `transform` from a
 * transition replaces the whole property, dropping the centring, so the popup
 * animated half its width to the right and jumped into place when the
 * stylesheet took over again at the end.
 *
 * So the class is what drives it, the way the original did: its markup lived in a
 * <template>, the clone went into the page without `.open`, and the class was
 * added a frame later so there was a collapsed state to expand from. Closing
 * removes the class and waits for the transition before taking the node out.
 *
 * @param {() => boolean} isOpen - Reads the popup's `show` prop.
 * @param {() => {x: number, y: number}} [getPosition] - Reads the `position` prop.
 *   It is held while the popup closes: the owner moves that object when another
 *   popup opens, and without this the one on its way out would jump across the
 *   page during its last frames.
 * @param {number} [duration] - Must match the transition in the stylesheet.
 */
export function popupVisibility(isOpen, getPosition = () => ({ x: 0, y: 0 }), duration = 250) {
    let render = $state(false);
    let open = $state(false);
    let position = $state({ x: 0, y: 0 });
    // Plain mirror of `render`: the effect writes it, so reading the state itself
    // to decide would make the effect depend on its own output.
    let mounted = false;
    let closeTimer = null;
    let frame = null;

    $effect(() => {
        if (isOpen()) {
            clearTimeout(closeTimer);
            closeTimer = null;
            mounted = true;
            render = true;
            position = getPosition();
            // Two frames: the first paints the node collapsed, the second adds the
            // class. With only one the browser can coalesce both into a single
            // style change and there is nothing to transition from.
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                frame = requestAnimationFrame(() => (open = true));
            });
        } else if (mounted) {
            cancelAnimationFrame(frame);
            open = false;
            closeTimer = setTimeout(() => {
                mounted = false;
                render = false;
            }, duration);
        }

        return () => {
            clearTimeout(closeTimer);
            cancelAnimationFrame(frame);
        };
    });

    return {
        /** Whether the node is in the page at all. */
        get render() {
            return render;
        },
        /** Whether it carries `.open`, which is what animates it. */
        get open() {
            return open;
        },
        /** Where it was opened, unchanged for as long as it is closing. */
        get position() {
            return position;
        },
    };
}
