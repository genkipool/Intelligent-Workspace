<script>
    /**
     * [AI INSTRUCTION]
     * THE SHELL EVERY HEADER POPUP SITS IN.
     *
     * The six popups the rules toolbar opens — cluster, sort, prefixes, timer,
     * storage, discarding — differ only in their class and their contents. Everything
     * around that was the same forty lines pasted six times: the `popupVisibility`
     * wiring, the three document listeners that dismiss it, and the positioned `<div>`
     * with `class:open` on it.
     *
     * That is all here now. A caller passes its class and its body, and gets the
     * animation, the placement and the dismissal for free.
     *
     * ── What must not be simplified further ───────────────────────────────────────
     * The three listeners look interchangeable but each guards a different mistake,
     * and all three were arrived at by fixing a real one:
     *
     *  - `mousedown` only dismisses on button 0. A right click is what *opens* these,
     *    and mousedown runs before contextmenu, so dismissing on any button undid the
     *    toggle before `openPopupOnContextMenu` ever saw the popup as open.
     *  - `contextmenu` stands down when the event was already handled
     *    (`defaultPrevented`). The trigger buttons call `preventDefault`, so this
     *    leaves the last word to their toggle rather than racing it.
     *  - `keydown` closes on Escape.
     *
     * `keepOpenFor` and `deferEscape` exist for the cluster popup, which owns a colour
     * sub-popup that renders outside its box: a click on the sub-popup still belongs to
     * the panel, and the first Escape belongs to the sub-popup. Both are plain
     * selectors so a caller with no sub-popup passes nothing and behaves exactly as
     * the hand-written version did.
     */
    import { onMount } from 'svelte';
    import { popupVisibility } from './popupVisibility.svelte.js';

    let {
        show = false,
        /** The toolbar button the popup is measured from. */
        trigger = null,
        /** The popup's own class — the stylesheet keys its look and its animation off it. */
        class: className = '',
        /** A selector for nodes that count as inside even though they render outside. */
        keepOpenFor = null,
        /** A selector whose presence means something else should take this Escape. */
        deferEscape = null,
        onclose,
        children,
    } = $props();

    let popupEl = $state(null);

    const popup = popupVisibility({
        isOpen: () => show,
        getTrigger: () => trigger,
        getElement: () => popupEl,
    });

    /** Whether the event landed outside the popup's own box. */
    function isOutside(target) {
        return !!popupEl && !popupEl.contains(target);
    }

    function handleClickOutside(e) {
        if (e.button !== 0) return;
        // Only the primary press consults `keepOpenFor`. The right-click path below
        // deliberately does not: dismissing on a right click anywhere but the trigger
        // is what the hand-written popups did, sub-popup included.
        if (keepOpenFor && e.target.closest?.(keepOpenFor)) return;
        if (isOutside(e.target)) onclose?.();
    }

    function handleContextMenuOutside(e) {
        if (e.defaultPrevented) return;
        if (isOutside(e.target)) onclose?.();
    }

    function handleKeydown(e) {
        if (e.key !== 'Escape') return;
        if (deferEscape && document.querySelector(deferEscape)) return;
        onclose?.();
    }

    onMount(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('contextmenu', handleContextMenuOutside);
        document.addEventListener('keydown', handleKeydown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('contextmenu', handleContextMenuOutside);
            document.removeEventListener('keydown', handleKeydown);
        };
    });
</script>

{#if popup.render}
    <div
        class={className}
        class:open={popup.open}
        style="left: {popup.position.x}px; top: {popup.position.y}px;"
        bind:this={popupEl}
    >
        {@render children?.()}
    </div>
{/if}
