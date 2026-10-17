<script>
    /**
     * The overlay, box and header that the older modals wrote out by hand: backdrop
     * click and Escape close it, clicks inside the box stay inside, and the cross sits
     * in the header next to the title.
     *
     * It has no <style> of its own on purpose. The look comes from the shared modal
     * rules (listGroup.css, dashboard.css), and a style block here would add a scoped
     * class to these elements and change which rules apply.
     *
     * `ondismiss` is what the backdrop does and `onkeydown` what a key on the overlay
     * does; both default to closing on the same callback as the cross. The rest only
     * cover what some of the modals do differently, and change nothing when left out:
     *
     * - `visible`: for a modal that stays mounted and is shown by the overlay's
     *   `visible` class rather than by being added.
     * - `closeOnEscape={false}`: no key handler on the overlay at all, unless
     *   `onkeydown` is given.
     * - `swallowClicks={false}`: clicks inside the box reach the overlay as usual.
     * - `overlayId`, `closeId`, `titleClass`: attributes the hybrid code looks for.
     * - `headerExtra`: controls between the title and the cross.
     * - `bare`: the overlay only, for a modal that swaps its whole box; `children` is
     *   then everything inside the overlay.
     */
    import { tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let {
        titleId = undefined,
        title = '',
        titleClass = undefined,
        contentClass = '',
        overlayId = undefined,
        closeId = undefined,
        visible = false,
        swallowClicks = true,
        bare = false,
        onclose,
        ondismiss = undefined,
        onkeydown = undefined,
        closeOnEscape = true,
        headerExtra = undefined,
        children,
    } = $props();

    const dismiss = () => (ondismiss ?? onclose)?.();
    const keydown = (e) => (onkeydown ? onkeydown(e) : e.key === 'Escape' && onclose?.());
</script>

{#snippet box()}
    <div class="modal-header">
        <h2 id={titleId} class={titleClass}>{title}</h2>
        {@render headerExtra?.()}
        <button type="button" id={closeId} class="close-modal-btn" title={$tt('close')} onclick={() => onclose?.()}
            >&times;</button
        >
    </div>
    {@render children?.()}
{/snippet}

<div
    id={overlayId}
    class="modal-overlay"
    class:visible
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    use:dismissOnBackdrop={dismiss}
    onkeydown={onkeydown || closeOnEscape ? keydown : undefined}
>
    {#if bare}
        {@render children?.()}
    {:else if swallowClicks}
        <div class="modal-content {contentClass}" role="none" onclick={(e) => e.stopPropagation()}>
            {@render box()}
        </div>
    {:else}
        <div class="modal-content {contentClass}">
            {@render box()}
        </div>
    {/if}
</div>
