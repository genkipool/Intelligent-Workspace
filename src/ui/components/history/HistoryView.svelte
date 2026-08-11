<script>
    // The page can be opened straight into this view, and the URL says so before any
    // store is set. Laying it out from the first frame stops the group shell being
    // painted and swapped a few frames later. The boot still drives it afterwards.
    const startsVisible = new URLSearchParams(window.location.search).get('view') === 'history';

    import { historyStore, historyLoaded } from '../../stores/historyStore.js';
    import { t } from '../../stores/i18nStore.js';
    import { currentHistoryDateFilter } from '../../stores/appStore.svelte.js';
    import HistoryGroup from './HistoryGroup.svelte';

    // The date filter is applied from the header calendar (#custom-calendar-popup);
    // here it only selects the
    // mensaje de "sin resultados" correspondiente.
    let emptyMessage = $derived(
        $currentHistoryDateFilter
            ? $t('noHistoryForDate', [new Date($currentHistoryDateFilter.start).toLocaleDateString()])
            : $t('noHistoryFound'),
    );
</script>

<div id="history-view-container" class="view-container" style:display={startsVisible ? null : 'none'}>
    <div class="list-content">
        {#each $historyStore as group (group.timestamp)}
            <HistoryGroup {group} />
        {:else}
            {#if $historyLoaded}
                <p class="no-items-message">{emptyMessage}</p>
            {/if}
        {/each}
    </div>
</div>
