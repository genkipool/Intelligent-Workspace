<script>
    // The page can be opened straight into this view, and the URL says so before any
    // store is set. Laying it out from the first frame stops the group shell being
    // painted and swapped a few frames later. The boot still drives it afterwards.
    const startsVisible = new URLSearchParams(window.location.search).get('view') === 'recent';

    import { recentStore, recentLoaded } from '../../stores/recentStore.js';
    import GenericItem from '../shared/GenericItem.svelte';
</script>

<div id="recent-view-container" class="view-container" style:display={startsVisible ? null : 'none'}>
    <div class="list-content">
        {#each $recentStore as item (item.sessionId || item.url)}
            <GenericItem {item} type="recent" ondelete={recentStore.removeItem} />
        {:else}
            {#if $recentLoaded}
                <p class="no-items-message">No recently closed tabs.</p>
            {/if}
        {/each}
    </div>
</div>
