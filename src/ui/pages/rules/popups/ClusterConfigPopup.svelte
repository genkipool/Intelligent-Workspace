<script>
    import { popupVisibility } from './popupVisibility.svelte.js';
    import { onMount } from 'svelte';
    import { defaultClusterConfig } from '../modules/clusterDefaults.js';
    import ClusterConfigSection from './ClusterConfigSection.svelte';

    let {
        show = false,
        trigger = null,
        clusterConfig = $bindable(defaultClusterConfig()),
        onclose,
        onreset,
        onchange,
    } = $props();

    let popupEl = $state(null);

    const popup = popupVisibility({
        isOpen: () => show,
        getTrigger: () => trigger,
        getElement: () => popupEl,
    });

    function handleClickOutside(e) {
        // Only the primary button dismisses. A right click is what opens these, and
        // mousedown runs before contextmenu, so closing here would undo the toggle
        // before openPopupOnContextMenu ever saw the popup as open.
        if (e.button !== 0) return;
        // A click on the colour sub-popup, or on the indicator that opens it, belongs
        // to the panel even though it sits outside its box.
        if (e.target.closest('.color-popup, .cluster-color-indicator')) return;
        if (popupEl && !popupEl.contains(e.target)) onclose?.();
    }

    // A right click elsewhere still dismisses, but the trigger buttons get the last
    // word: openPopupOnContextMenu calls preventDefault, so when it has handled the
    // event this stays out of the way and lets its toggle decide.
    function handleContextMenuOutside(e) {
        if (e.defaultPrevented) return;
        if (popupEl && !popupEl.contains(e.target)) onclose?.();
    }

    function handleKeydown(e) {
        if (e.key !== 'Escape') return;
        // The colour sub-popup takes the first Escape for itself.
        if (document.querySelector('.color-popup')) return;
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
        class="cluster-config-popup"
        class:open={popup.open}
        style="left: {popup.position.x}px; top: {popup.position.y}px;"
        bind:this={popupEl}
    >
        <ClusterConfigSection bind:clusterConfig {onchange} {onreset} />
    </div>
{/if}
