<script>
    import { onMount } from 'svelte';
    import { t } from '../../stores/i18nStore.js';
    import { downloadsStore, downloadsLoaded } from '../../stores/downloadsStore.js';
    import DownloadGroup from './DownloadGroup.svelte';

    const startsVisible = new URLSearchParams(window.location.search).get('view') === 'downloads';

    onMount(() => {
        if (startsVisible) {
            downloadsStore.loadDownloads();
        }
    });
</script>

<div id="downloads-view-container" class="view-container" style:display={startsVisible ? null : 'none'}>
    <!-- Groups Content by Date -->
    <div class="list-content downloads-list-content">
        {#each $downloadsStore as group (group.timestamp)}
            <DownloadGroup {group} />
        {:else}
            {#if $downloadsLoaded}
                <p class="no-items-message">{$t('noDownloadsFound')}</p>
            {/if}
        {/each}
    </div>
</div>

<style>
    .downloads-list-content {
        flex: 1 1 0;
        overflow-y: auto;
        overflow-x: visible;
        padding: 4px;
    }
</style>
