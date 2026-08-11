<script>
    import { onMount } from 'svelte';
    import { defaultClusterConfig } from '../modules/clusterDefaults.js';
    import ClusterConfigSection from './ClusterConfigSection.svelte';

    let {
        show = false,
        position = { x: 0, y: 0 },
        clusterConfig = $bindable(defaultClusterConfig()),
        onclose,
        onreset,
        onchange,
    } = $props();

    let popupEl = $state(null);

    function handleClickOutside(e) {
        // A click on the colour sub-popup, or on the indicator that opens it, belongs
        // to the panel even though it sits outside its box.
        if (e.target.closest('.color-popup, .cluster-color-indicator')) return;
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
        document.addEventListener('keydown', handleKeydown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeydown);
        };
    });
</script>

{#if show}
    <div class="cluster-config-popup open" style="left: {position.x}px; top: {position.y}px;" bind:this={popupEl}>
        <ClusterConfigSection bind:clusterConfig {onchange} {onreset} />
    </div>
{/if}
