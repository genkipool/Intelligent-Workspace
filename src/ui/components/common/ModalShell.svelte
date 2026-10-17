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
     * does; both default to closing on the same callback as the cross.
     */
    import { tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let {
        titleId = undefined,
        title = '',
        contentClass = '',
        onclose,
        ondismiss = undefined,
        onkeydown = undefined,
        children,
    } = $props();

    const dismiss = () => (ondismiss ?? onclose)?.();
    const keydown = (e) => (onkeydown ? onkeydown(e) : e.key === 'Escape' && onclose?.());
</script>

<div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    use:dismissOnBackdrop={dismiss}
    onkeydown={keydown}
>
    <div class="modal-content {contentClass}" role="none" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" class="close-modal-btn" title={$tt('close')} onclick={() => onclose?.()}
                >&times;</button
            >
        </div>
        {@render children?.()}
    </div>
</div>
