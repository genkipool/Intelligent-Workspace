<script>
    /**
     * History group for a single date: a collapsible `<details>` reusing the group
     * classes (`group-item`, `group-header`, `group-title`, `group-tab-count`,
     * `tab-list-container`).
     */
    import { tt } from '../../stores/i18nStore.js';
    import { historyStore } from '../../stores/historyStore.js';
    import { openDeleteHistoryConfirmModal } from '../../services/viewsService.js';
    import GenericItem from '../shared/GenericItem.svelte';

    let { group } = $props();

    function deleteGroup(e) {
        e.stopPropagation();
        e.preventDefault();
        const urls = [...new Set(group.items.map((i) => i.url))];
        if (urls.length > 0) openDeleteHistoryConfirmModal(group.label, urls);
    }

    function deleteItem(item) {
        historyStore.deleteHistoryUrl(item.url);
    }
</script>

<details class="history-group group-item" data-group-key={group.timestamp} open>
    <summary class="history-group-header group-header">
        <h3 class="history-group-title group-title">{group.label}</h3>
        <span class="history-group-count group-tab-count">{group.items.length}</span>
        <span
            class="delete-history-group-btn action-btn"
            role="button"
            tabindex="0"
            title={$tt('deleteHistoryForDate')}
            onclick={deleteGroup}
            onkeydown={(e) => e.key === 'Enter' && deleteGroup(e)}
        >
            <svg width="20" height="20" aria-hidden="true" focusable="false">
                <use href="#icon-trash"></use>
            </svg>
        </span>
    </summary>
    <div class="history-list-container tab-list-container">
        {#each group.items as item (item.id || item.url + item.lastVisitTime)}
            <GenericItem {item} type="history" ondelete={deleteItem} />
        {/each}
    </div>
</details>
