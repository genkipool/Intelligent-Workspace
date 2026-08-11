<script>
    // The page can be opened straight into this view, and the URL says so before any
    // store is set. Laying it out from the first frame stops the group shell being
    // painted and swapped a few frames later. The boot still drives it afterwards.
    const startsVisible = new URLSearchParams(window.location.search).get('view') === 'reading';

    import { readingStore, readingLoaded } from '../../stores/readingStore.js';
    import GenericItem from '../shared/GenericItem.svelte';

    function handleDelete(item) {
        readingStore.deleteReadingItem(item.url);
    }
</script>

<div id="reading-list-view-container" class="view-container" style:display={startsVisible ? null : 'none'}>
    <div class="list-content">
        {#each $readingStore as item (item.url)}
            <GenericItem {item} type="reading" ondelete={handleDelete} />
        {:else}
            {#if $readingLoaded}
                <p class="no-items-message">Reading list empty or unavailable.</p>
            {/if}
        {/each}
    </div>
</div>
