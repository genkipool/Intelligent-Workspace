/**
 * How the header popups appear, where they sit, and how they go away.
 *
 * ── The animation ─────────────────────────────────────────────────────────────
 * The stylesheet describes it in full: the popups sit at `opacity: 0` and
 * `scaleY(0)` and `.open` brings them up over 0.25s. Below 600px — the width of
 * the side panel — it also centres them with `left: 50%` and a
 * `translateX(-50%)` that every one of those transforms carries. That is why the
 * animation cannot be written in JavaScript: setting `transform` replaces the
 * whole property, dropping the centring, so the popup animated half its width to
 * the right and jumped into place when the stylesheet took the property back.
 *
 * So the class drives it, the way the original did: its markup lived in a
 * <template>, the clone went into the page without `.open`, and the class was
 * added a frame later so there was a collapsed state to expand from.
 *
 * ── The position ──────────────────────────────────────────────────────────────
 * Measured from the button that opened it rather than stored once, so a window
 * resize — which reflows the header and moves the button — does not leave the
 * popup behind. It opens rightwards from the button's left edge, and when it
 * would not fit there it is pinned to the button's right edge and grows leftwards
 * instead, which is what urlTooltip.js already does for the URL panel.
 *
 * Below 600px none of that applies: `left: 50% !important` wins and the popup is
 * centred whatever this computes.
 */
const GAP = 4; // Between the button and the popup, as it always was.
const MARGIN = 8; // Breathing room against the window edge.

/**
 * @param {object} options
 * @param {() => boolean} options.isOpen - Reads the popup's `show` prop.
 * @param {() => Element|null} options.getTrigger - The button it belongs to.
 * @param {() => Element|null} options.getElement - The popup's own node.
 * @param {number} [options.duration] - Must match the transition in the stylesheet.
 */
export function popupVisibility({ isOpen, getTrigger, getElement, duration = 250 }) {
    let render = $state(false);
    let open = $state(false);
    let position = $state({ x: 0, y: 0 });
    // Plain mirror of `render`: the effect writes it, so reading the state itself
    // to decide would make the effect depend on its own output.
    let mounted = false;
    let closeTimer = null;
    let frame = null;

    function place() {
        const trigger = getTrigger();
        const el = getElement();
        if (!trigger || !el || !document.body.contains(trigger)) return;

        const anchor = trigger.getBoundingClientRect();
        // Layout size, so it can be measured while the popup is still collapsed —
        // a transform does not change it.
        const width = el.offsetWidth;

        let left = anchor.left;
        if (left + width > window.innerWidth - MARGIN) left = anchor.right - width;
        position = { x: Math.max(MARGIN, left), y: anchor.bottom + GAP };
    }

    $effect(() => {
        if (isOpen()) {
            clearTimeout(closeTimer);
            closeTimer = null;
            mounted = true;
            render = true;
            cancelAnimationFrame(frame);
            // Two frames: the first paints the node collapsed and lets it be
            // measured, the second adds the class. With only one the browser can
            // coalesce both into a single style change and there is nothing to
            // transition from.
            frame = requestAnimationFrame(() => {
                place();
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

    // Only while it is on screen: the popup that is closing keeps the spot it was
    // opened at, so it does not slide away during its last frames.
    $effect(() => {
        if (!open) return;
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
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
        get position() {
            return position;
        },
    };
}
