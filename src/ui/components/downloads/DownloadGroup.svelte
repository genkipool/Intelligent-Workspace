<script>
    /**
     * Download group for a single date: collapsible `<details>` reusing the group
     * classes (`group-item`, `group-header`, `group-title`, `group-tab-count`,
     * `tab-list-container`) to match the exact design of History view.
     */
    import { tt } from '../../stores/i18nStore.js';
    import { downloadsStore } from '../../stores/downloadsStore.js';
    import { confirmAction } from '../../stores/confirmStore.js';
    import DownloadItem from './DownloadItem.svelte';

    let { group } = $props();

    async function deleteGroup(e) {
        e.stopPropagation();
        e.preventDefault();
        const confirmed = await confirmAction({
            messageKey: 'deleteDownloadsGroupConfirm',
            message: `${chrome.i18n.getMessage('deleteDownloadsForDate') || 'Borrar descargas de esta fecha'}: ${group.label}?`,
            danger: true,
        });
        if (confirmed) {
            downloadsStore.eraseGroup(group.items);
        }
    }
</script>

<details class="downloads-group group-item" data-group-key={group.timestamp} open>
    <summary class="downloads-group-header group-header">
        <h3 class="downloads-group-title group-title">{group.label}</h3>
        <span class="downloads-group-count group-tab-count">{group.items.length}</span>
        <span
            class="delete-downloads-group-btn action-btn"
            role="button"
            tabindex="0"
            title={$tt('deleteDownloadsForDate')}
            onclick={deleteGroup}
            onkeydown={(e) => e.key === 'Enter' && deleteGroup(e)}
        >
            <svg width="20" height="20" aria-hidden="true" focusable="false">
                <use href="#icon-trash"></use>
            </svg>
        </span>
    </summary>
    <div class="downloads-list-container tab-list-container">
        {#each group.items as item (item.id)}
            <DownloadItem {item} />
        {/each}
    </div>
</details>
