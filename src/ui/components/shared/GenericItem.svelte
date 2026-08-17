<script>
    /**
     * List item shared by the History / Recently closed / Reading list views.
     *
     * Uses the `.generic-item.tab-item` markup with `.item-info` and a
     * `.delete-item-btn.action-btn` carrying an SVG icon, so it inherits the same
     * styling as a tab row.
     */
    import { t, tt } from '../../stores/i18nStore.js';
    import { isPopupWindow } from '../../stores/appStore.svelte.js';
    import { openUrlInPanel } from '../../services/viewsService.js';
    import { prefetchUrl } from '../../services/prefetchService.js';

    let { item, type = 'history', ondelete = () => {} } = $props();

    const DELETE_TOOLTIP = {
        history: 'deleteFromHistoryTooltip',
        recent: 'deleteFromRecentTooltip',
        reading: 'deleteFromReadingListTooltip',
    };

    let isWindowItem = $derived(type === 'recent' && item.type === 'window' && item.tabs?.length > 0);
    let url = $derived(isWindowItem ? item.tabs[0].url || '' : item.url || '');
    let isWebUrl = $derived(url.startsWith('http:') || url.startsWith('https:'));

    let faviconUrl = $derived(
        url
            ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=16`
            : '../../../assets/icons/icon16.png',
    );

    let title = $derived.by(() => {
        if (isWindowItem) {
            const count = item.tabs?.length || 0;
            const w = chrome.i18n.getMessage('recentWindow') || 'Window';
            const tabsLabel = chrome.i18n.getMessage('recentTabs') || 'tabs';
            return `${w} (${count} ${tabsLabel})`;
        }
        return item.title || item.url || chrome.i18n.getMessage('untitled') || 'Untitled';
    });

    let subtitle = $derived(
        isWindowItem ? chrome.i18n.getMessage('recentRestoreWindow') || 'Restore full window' : item.url || '',
    );

    // DD-MM-YYYY HH:MM
    let meta = $derived.by(() => {
        let timestamp = 0;
        if (type === 'history') timestamp = item.lastVisitTime;
        else if (type === 'recent')
            timestamp = item.lastModified > 1000000000000 ? item.lastModified : item.lastModified * 1000;

        if (timestamp) {
            const d = new Date(timestamp);
            const p = (n) => String(n).padStart(2, '0');
            return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
        }
        // These two were the only labels in the list left in English.
        if (type === 'reading') return item.hasBeenRead ? $t('readingListItemRead') : $t('readingListItemUnread');
        return null;
    });

    let isUnread = $derived(type === 'reading' && !item.hasBeenRead);

    // Exit animation before the store drops the item from the list, without
    // touching the DOM directly.
    let removing = $state(false);

    function dismiss() {
        if (removing) return;
        removing = true;
        setTimeout(() => ondelete(item), 200);
    }

    function handleDelete(e) {
        e.stopPropagation();
        e.preventDefault();
        dismiss();
    }

    function handleHover() {
        if (isWebUrl) prefetchUrl(url);
    }

    function handleClick(e) {
        if (e.target.closest('.delete-item-btn')) return;

        if ($isPopupWindow) {
            e.preventDefault();
            if (isWebUrl) {
                openUrlInPanel(url);
            } else if (type === 'recent' && item.sessionId) {
                chrome.sessions.restore(item.sessionId);
                dismiss();
            } else {
                chrome.tabs.create({ url, active: true });
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && isWebUrl) {
            e.preventDefault();
            openUrlInPanel(url);
            return;
        }

        if (type === 'history' || type === 'reading') {
            chrome.tabs.create({ url, active: true });
        } else if (type === 'recent' && item.sessionId) {
            chrome.sessions.restore(item.sessionId);
            dismiss();
        }
    }
</script>

<div
    class="generic-item tab-item"
    class:is-window-item={isWindowItem}
    role="link"
    tabindex="0"
    style:opacity={removing ? '0' : null}
    style:transform={removing ? 'translateX(10px)' : null}
    onclick={handleClick}
    onkeydown={(e) => e.key === 'Enter' && handleClick(e)}
    onmouseenter={handleHover}
>
    <img src={faviconUrl} alt="" class="favicon" />
    <div class="item-info">
        <span class="item-title" style:font-weight={isUnread ? 'bold' : null}>{title}</span>
        <span class="item-url">{subtitle}</span>
        <span class="item-meta" style:display={meta ? null : 'none'}>{meta ?? ''}</span>
    </div>
    <button
        type="button"
        class="delete-item-btn action-btn"
        title={$tt(DELETE_TOOLTIP[type] ?? 'deleteButton')}
        onclick={handleDelete}
    >
        <svg width="20" height="20" aria-hidden="true" focusable="false">
            <use href="#icon-close-stroke"></use>
        </svg>
    </button>
</div>
