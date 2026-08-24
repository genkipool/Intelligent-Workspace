// @ts-nocheck
/**
 * [AI INSTRUCTION]
 * REORDERING A LIST OF BLOCKS BY DRAGGING ONE OF THEM.
 *
 * Put it on the container; every direct child that carries `data-sort-id` becomes a
 * card that can be moved, and `onReorder` is handed the ids in their new order. It
 * moves nothing itself: the caller owns the order, whether that means Svelte state or
 * a run of `insertBefore`. A drag that ends outside the container changes nothing.
 *
 * WHY A HANDLE, AND WHY `draggable` IS SET SO LATE. A dashboard card holds charts you
 * can hover, tables you can select and buttons you can press; `draggable` on the card
 * itself turns every one of those into the start of a drag. So the card is only made
 * draggable while the pointer is actually resting on its handle, and it stops being
 * draggable the moment the pointer comes up. Everything inside behaves normally.
 *
 * WHY IT ONLY DRAWS A LINE. Moving the nodes as the pointer passes over them is the
 * livelier effect, but half of this is inside Svelte `{#each}` blocks, which own their
 * children and will not have them moved from underneath. An insertion line says the
 * same thing and leaves the DOM to whoever is responsible for it.
 *
 * The axis is measured rather than configured: two cards on the same row are read left
 * to right, a stack of sections top to bottom. A section list and a two-column grid of
 * panels therefore both work with no argument at all.
 */

const MARKS = ['is-drop-before', 'is-drop-after'];

export function sortable(node, options = {}) {
    let opts = {
        /** Which children can move. They must be direct children of `node`. */
        items: '[data-sort-id]',
        /** What has to be under the pointer for a drag to start. */
        handle: '[data-sort-handle]',
        onReorder: () => {},
        disabled: false,
        ...options,
    };

    /** The card being dragged, and the one the line is currently drawn against. */
    let dragged = null;
    let marked = null;
    let dropAfter = false;

    const items = () => Array.from(node.children).filter((el) => el.matches?.(opts.items));
    const idsOf = () => items().map((el) => el.dataset.sortId);

    /** The card an event happened in, but only if it belongs to this container. */
    function itemFrom(target) {
        const el = target?.closest?.(opts.items);
        return el && el.parentElement === node ? el : null;
    }

    /**
     * The card a *grip* belongs to — the nearest movable block of any kind, not the
     * nearest one this container happens to own.
     *
     * These lists nest: a grid of panels sits inside a section, and both are sortable.
     * Asking `closest(opts.items)` from a panel's grip gave the section back, so
     * pressing a panel's grip made the section draggable and dropping the panel
     * somewhere moved the whole section instead. A grip belongs to exactly one block,
     * and it is the innermost one.
     */
    function ownerOf(handle) {
        const el = handle?.closest?.('[data-sort-id]');
        if (!el || el.parentElement !== node) return null;
        return el.matches(opts.items) ? el : null;
    }

    /** Two cards sharing a top edge are a row; anything else is a column. */
    function isRow() {
        const [first, second] = items();
        if (!first || !second) return false;
        return Math.abs(first.getBoundingClientRect().top - second.getBoundingClientRect().top) < 8;
    }

    function clearMark() {
        marked?.classList.remove(...MARKS);
        marked = null;
    }

    function finish() {
        dragged?.classList.remove('is-dragging');
        if (dragged) dragged.draggable = false;
        dragged = null;
        clearMark();
        node.classList.remove('is-sorting');
    }

    function onPointerDown(event) {
        if (opts.disabled || event.button !== 0) return;
        const handle = event.target.closest?.(opts.handle);
        const item = ownerOf(handle);
        if (!handle || !item) return;
        item.draggable = true;
        // Nothing else may keep it draggable: a click that never became a drag has to
        // leave the card exactly as it found it.
        const release = () => {
            if (item !== dragged) item.draggable = false;
            window.removeEventListener('pointerup', release, true);
            window.removeEventListener('pointercancel', release, true);
        };
        window.addEventListener('pointerup', release, true);
        window.addEventListener('pointercancel', release, true);
    }

    function onDragStart(event) {
        const item = itemFrom(event.target);
        if (opts.disabled || !item || !item.draggable) return;
        dragged = item;
        item.classList.add('is-dragging');
        node.classList.add('is-sorting');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            // Firefox refuses to start a drag with nothing on the transfer.
            try {
                event.dataTransfer.setData('text/plain', item.dataset.sortId || '');
            } catch {
                /* some browsers refuse during a synthetic event */
            }
        }
    }

    function onDragOver(event) {
        if (!dragged) return;
        const item = itemFrom(event.target);
        if (!item) return;
        // Saying "yes, you may drop here" is what `preventDefault` means on dragover.
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (item === dragged) {
            clearMark();
            return;
        }
        const rect = item.getBoundingClientRect();
        dropAfter = isRow() ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2;
        if (marked !== item) clearMark();
        marked = item;
        item.classList.toggle('is-drop-before', !dropAfter);
        item.classList.toggle('is-drop-after', dropAfter);
    }

    function onDrop(event) {
        if (!dragged) return;
        event.preventDefault();
        const movingId = dragged.dataset.sortId;
        const markedId = marked?.dataset.sortId;
        finish();
        if (!markedId || markedId === movingId) return;

        const ids = idsOf();
        const from = ids.indexOf(movingId);
        if (from < 0) return;
        ids.splice(from, 1);
        let index = ids.indexOf(markedId);
        index = index < 0 ? ids.length : index + (dropAfter ? 1 : 0);
        ids.splice(index, 0, movingId);
        opts.onReorder(ids);
    }

    /** Leaving the container entirely takes the line with it. */
    function onDragLeave(event) {
        if (!dragged) return;
        if (!node.contains(event.relatedTarget)) clearMark();
    }

    node.addEventListener('pointerdown', onPointerDown, true);
    node.addEventListener('dragstart', onDragStart);
    node.addEventListener('dragover', onDragOver);
    node.addEventListener('drop', onDrop);
    node.addEventListener('dragend', finish);
    node.addEventListener('dragleave', onDragLeave);

    return {
        update(next) {
            opts = { ...opts, ...next };
            if (opts.disabled) finish();
        },
        destroy() {
            finish();
            node.removeEventListener('pointerdown', onPointerDown, true);
            node.removeEventListener('dragstart', onDragStart);
            node.removeEventListener('dragover', onDragOver);
            node.removeEventListener('drop', onDrop);
            node.removeEventListener('dragend', finish);
            node.removeEventListener('dragleave', onDragLeave);
        },
    };
}
