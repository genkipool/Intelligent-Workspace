/**
 * The opening and closing animation the header popups had before the migration.
 *
 * The stylesheet still describes it — the popups start at `opacity: 0` and
 * `scaleY(0)` with `transform-origin: top center`, and `.open` brings them to full
 * size over 0.25s. That works when the element is already in the page and a class
 * is toggled, which is what the original did: the markup lived in a <template>,
 * the clone went in without `.open`, and the class was added a frame later.
 *
 * Rendering them with `{#if show}` broke both halves. The node is inserted with
 * `.open` already on it, so there is no earlier state for the transition to run
 * from, and on close it is removed outright, so the collapse never plays and
 * `.hiding` is never reached.
 *
 * A transition function restores both: Svelte animates the node in after inserting
 * it and keeps it alive until the outro finishes. The values match the stylesheet
 * so the popups look the way they always did.
 */
const DURATION_MS = 250;

export function popupScale(node, { duration = DURATION_MS } = {}) {
    return {
        duration,
        easing: (t) => 1 - Math.pow(1 - t, 3), // ease-out, as in the stylesheet
        css: (t) => `opacity: ${t}; transform: scaleY(${t}); transform-origin: top center;`,
    };
}
