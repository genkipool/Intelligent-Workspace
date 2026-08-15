<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let {
        show = false,
        titleKey = '',
        descriptionKey = '',
        type = 'old',
        items: initialItems = [],
        isLoading = false,
        emptyMessageKey = '',
        scanProgress = { current: 0, total: 0 },
        onClose,
        onDeleteAll,
        onDeleteItem,
        onReset,
    } = $props();

    let filterType = $state('all');
    let internalItems = $state([]);

    $effect(() => {
        if (show) {
            internalItems = initialItems;
            filterType = 'all';
        }
    });

    let filteredItems = $derived.by(() => {
        if (type !== 'broken' || filterType === 'all') return internalItems;
        return internalItems.filter((item) => {
            const status = item.status;
            if (filterType === '4xx') return !isNaN(status) && status >= 400 && status < 500;
            if (filterType === '5xx') return !isNaN(status) && status >= 500;
            if (filterType === 'timeout') return status === 'timeout';
            if (filterType === 'other')
                return status === 'error' || status === 'broken' || (isNaN(status) && status !== 'timeout');
            return true;
        });
    });

    let progressPercent = $derived(
        scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0,
    );

    function handleClose() {
        onClose?.();
    }

    function getMetaText(item) {
        if (type === 'old') {
            const date = item.dateLastUsed || item.dateAdded;
            return `${chrome.i18n.getMessage('lastVisit') || 'Last visit'}: ${new Date(date).toLocaleDateString()}`;
        } else if (type === 'broken') {
            if (typeof item.status === 'number') return `Status: ${item.status}`;
            if (item.status === 'timeout') return chrome.i18n.getMessage('filterTimeouts') || 'Timeout';
            return chrome.i18n.getMessage('connectionError') || 'Connection Error';
        }
        return '';
    }

    function formatErrorStyle(metaText) {
        const lower = String(metaText).toLowerCase();
        return lower.includes('status') || lower.includes('error') || lower.includes('timeout');
    }

    async function handleItemClick(item, e) {
        if (e.target.closest('.delete-item-action-btn')) return;
        if (!e.target.closest('a')) {
            window.open(item.url, '_blank');
        }
    }

    async function handleTrashClick(item) {
        if (onDeleteItem) {
            await onDeleteItem(item);
        }
        internalItems = internalItems.filter((i) => i.id !== item.id);
    }

    async function handleDeleteAll() {
        const ids = filteredItems.map((item) => item.id);
        if (onDeleteAll) {
            await onDeleteAll(ids);
        }
        onClose?.();
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        use:dismissOnBackdrop={handleClose}
        onkeydown={(e) => e.key === 'Escape' && handleClose()}
    >
        <div class="modal-content special-delete-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 class="modal-title">{$t(titleKey)}</h2>
                {#if type === 'broken' && onReset}
                    <button
                        type="button"
                        class="restart-scan-btn control-btn"
                        title={$tt('restartScan')}
                        onclick={onReset}
                    >
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-refresh"></use>
                        </svg>
                    </button>
                {/if}
                <button type="button" class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button
                >
            </div>
            <div class="modal-body">
                <p class="modal-description">{$t(descriptionKey)}</p>

                {#if type === 'broken' && !isLoading && filteredItems.length > 0}
                    <div class="modal-filters">
                        <button
                            type="button"
                            class="filter-btn"
                            class:active={filterType === 'all'}
                            onclick={() => (filterType = 'all')}>{$t('filterAll')}</button
                        >
                        <button
                            type="button"
                            class="filter-btn"
                            class:active={filterType === '4xx'}
                            onclick={() => (filterType = '4xx')}>{$t('filter4xx')}</button
                        >
                        <button
                            type="button"
                            class="filter-btn"
                            class:active={filterType === '5xx'}
                            onclick={() => (filterType = '5xx')}>{$t('filterTimeouts')}</button
                        >
                        <button
                            type="button"
                            class="filter-btn"
                            class:active={filterType === 'timeout'}
                            onclick={() => (filterType = 'timeout')}>{$t('filterTimeouts')}</button
                        >
                        <button
                            type="button"
                            class="filter-btn"
                            class:active={filterType === 'other'}
                            onclick={() => (filterType = 'other')}>{$t('filterOther')}</button
                        >
                    </div>
                {/if}

                {#if isLoading}
                    <div class="scanning-progress-container">
                        <div class="progress-labels">
                            <span class="progress-count-current">{scanProgress.current}</span>
                            <span>/</span>
                            <span class="progress-count-total">{scanProgress.total}</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill" style="width: {progressPercent}%">
                                <span class="progress-percentage">{progressPercent}%</span>
                            </div>
                        </div>
                        <p class="scanning-status-text">
                            {$t('scanningBookmarks') || 'Scanning...'} ({filteredItems.length}
                            {$t('itemsFound') || 'found'})
                        </p>
                    </div>
                {:else if filteredItems.length > 0}
                    <div class="bookmarks-delete-list-container">
                        <ul class="bookmarks-delete-list">
                            {#each filteredItems as item (item.id)}
                                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
                                <li
                                    class="delete-list-item card-style"
                                    data-id={item.id}
                                    data-status={item.status || 'unknown'}
                                    style="cursor: pointer;"
                                    title={item.url}
                                    onclick={(e) => handleItemClick(item, e)}
                                >
                                    <div class="delete-item-info">
                                        <a
                                            href={item.url}
                                            target="_blank"
                                            class="delete-item-title"
                                            rel="noopener noreferrer"
                                            onclick={(e) => e.stopPropagation()}>{item.title || item.url}</a
                                        >
                                        <span class="delete-item-url">{item.url}</span>
                                        <span
                                            class="delete-item-error"
                                            style="color: {formatErrorStyle(getMetaText(item))
                                                ? 'var(--error-color)'
                                                : 'var(--text-color)'}; font-weight: {formatErrorStyle(
                                                getMetaText(item),
                                            )
                                                ? 'bold'
                                                : 'normal'}; opacity: {formatErrorStyle(getMetaText(item)) ? 1 : 0.7};"
                                            >{getMetaText(item)}</span
                                        >
                                    </div>
                                    <button
                                        type="button"
                                        class="delete-item-action-btn"
                                        title={$tt('deleteButton')}
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleTrashClick(item);
                                        }}
                                    >
                                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                                            <use href="#icon-trash"></use>
                                        </svg>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    </div>
                {:else}
                    <div class="bookmarks-delete-list-container">
                        <ul class="bookmarks-delete-list">
                            <li style="padding: 20px; text-align: center; opacity: 0.7;">{$t(emptyMessageKey)}</li>
                        </ul>
                    </div>
                {/if}
            </div>

            {#if !isLoading}
                <div class="modal-footer">
                    <span class="items-count-label">
                        {filteredItems.length}
                        {$t('items') || 'items'}
                    </span>
                    <button
                        type="button"
                        class="modal-btn-delete-all-listed error-state"
                        disabled={filteredItems.length === 0}
                        onclick={handleDeleteAll}>{$t('deleteAllListed')}</button
                    >
                </div>
            {/if}
        </div>
    </div>
{/if}
