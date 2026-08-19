<script>
    import { onMount } from 'svelte';
    import { t, tt } from '../../stores/i18nStore.js';
    import { downloadsStore, formatBytes, getFilename, getFileCategory } from '../../stores/downloadsStore.js';
    import { showNotification } from '../../../utils/i18n.js';

    let { item } = $props();

    let filename = $derived(getFilename(item));
    let category = $derived(getFileCategory(filename, item.mime));
    let isInProgress = $derived(item.state === 'in_progress' && !item.paused);
    let isPaused = $derived(item.paused || (item.state === 'in_progress' && item.canResume));
    let isComplete = $derived(item.state === 'complete');
    let isInterrupted = $derived(item.state === 'interrupted' && !item.paused);

    let percentage = $derived.by(() => {
        if (isComplete) return 100;
        if (item.totalBytes > 0 && item.bytesReceived >= 0) {
            return Math.min(100, Math.max(0, Math.round((item.bytesReceived / item.totalBytes) * 100)));
        }
        return 0;
    });

    let progressText = $derived.by(() => {
        if (isInProgress || isPaused) {
            const received = formatBytes(item.bytesReceived);
            const total = item.totalBytes > 0 ? formatBytes(item.totalBytes) : '?';
            return `${received} / ${total} (${percentage}%)`;
        }
        if (isComplete) {
            const size = item.fileSize || item.totalBytes || item.bytesReceived;
            return size > 0 ? formatBytes(size) : '';
        }
        if (isInterrupted) {
            return item.error ? item.error.replace(/_/g, ' ') : $t('downloadStatusFailed');
        }
        return '';
    });

    let formattedTime = $derived.by(() => {
        const timeVal = item.endTime || item.startTime;
        if (!timeVal) return '';
        const d = new Date(timeVal);
        const p = (n) => String(n).padStart(2, '0');
        return `${p(d.getHours())}:${p(d.getMinutes())}`;
    });

    let faviconUrl = $derived.by(() => {
        if (item.url && (item.url.startsWith('http:') || item.url.startsWith('https:'))) {
            return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=16`;
        }
        return null;
    });

    let removing = $state(false);
    let isMenuVisible = $state(false);
    let menuBtnEl = $state(null);
    let menuEl = $state(null);
    let menuTop = $state(0);
    let menuLeft = $state(0);
    let hideTimeout = null;

    function portal(node) {
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    }

    function updateMenuPosition() {
        if (!menuBtnEl) return;
        const rect = menuBtnEl.getBoundingClientRect();
        const menuWidth = 180;
        const menuHeight = menuEl ? menuEl.offsetHeight : 150;

        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        let top = rect.bottom + 2;
        if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
            top = rect.top - menuHeight - 2;
        }

        let left = rect.right - menuWidth;
        if (left < 10) left = 10;

        menuTop = top;
        menuLeft = left;
    }

    function showMenu() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
        isMenuVisible = true;
        requestAnimationFrame(() => {
            updateMenuPosition();
        });
    }

    function scheduleHideMenu() {
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            isMenuVisible = false;
        }, 150);
    }

    function onMenuEnter() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
        isMenuVisible = true;
    }

    function onMenuLeave() {
        scheduleHideMenu();
    }

    function closeMenu() {
        if (hideTimeout) clearTimeout(hideTimeout);
        isMenuVisible = false;
    }

    onMount(() => {
        const onScrollOrResize = () => {
            if (isMenuVisible) {
                updateMenuPosition();
            }
        };
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        return () => {
            if (hideTimeout) clearTimeout(hideTimeout);
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
        };
    });

    function dismiss(action) {
        if (removing) return;
        removing = true;
        setTimeout(action, 200);
    }

    function handlePause(e) {
        e.stopPropagation();
        closeMenu();
        downloadsStore.pauseDownload(item.id);
    }

    function handleResume(e) {
        e.stopPropagation();
        closeMenu();
        downloadsStore.resumeDownload(item.id);
    }

    function handleCancel(e) {
        e.stopPropagation();
        closeMenu();
        downloadsStore.cancelDownload(item.id);
    }

    function handleRetry(e) {
        e.stopPropagation();
        closeMenu();
        downloadsStore.retryDownload(item);
    }

    function handleOpen(e) {
        e.stopPropagation();
        closeMenu();
        downloadsStore.openFile(item.id);
    }

    function handleShow(e) {
        e.stopPropagation();
        closeMenu();
        downloadsStore.showInFolder(item.id);
    }

    function handleCopyUrl(e) {
        e.stopPropagation();
        closeMenu();
        if (item.url) {
            navigator.clipboard.writeText(item.url);
            showNotification(chrome.i18n.getMessage('linkCopied') || 'Link copied to clipboard', false);
        }
    }

    function handleDelete(e) {
        e.stopPropagation();
        e.preventDefault();
        closeMenu();
        dismiss(() => downloadsStore.eraseDownload(item.id));
    }

    function handleQuickClose(e) {
        e.stopPropagation();
        e.preventDefault();
        closeMenu();
        if (isInProgress || isPaused) {
            handleCancel(e);
        } else {
            handleDelete(e);
        }
    }

    function handleItemClick(e) {
        if (e.target.closest('.download-actions') || e.target.closest('.download-item-menu')) return;
        if (isComplete) {
            downloadsStore.openFile(item.id);
        } else if (isPaused) {
            downloadsStore.resumeDownload(item.id);
        } else if (isInterrupted) {
            downloadsStore.retryDownload(item);
        }
    }
</script>

<div
    class="generic-item download-item tab-item"
    class:is-in-progress={isInProgress}
    class:is-paused={isPaused}
    class:is-complete={isComplete}
    class:is-interrupted={isInterrupted}
    class:menu-open={isMenuVisible}
    role="button"
    tabindex="0"
    style:opacity={removing ? '0' : null}
    style:transform={removing ? 'translateX(10px)' : null}
    onclick={handleItemClick}
    onkeydown={(e) => e.key === 'Enter' && handleItemClick(e)}
    title={item.filename || item.url || ''}
>
    <!-- Left Category / Favicon Badge -->
    <div class="download-icon-wrapper" data-category={category}>
        {#if faviconUrl}
            <img src={faviconUrl} alt="" class="download-favicon" />
        {:else}
            <svg class="download-type-svg" width="18" height="18" aria-hidden="true" focusable="false">
                <use href="#icon-download"></use>
            </svg>
        {/if}
    </div>

    <!-- Center Info Column -->
    <div class="item-info download-info">
        <div class="download-title-row">
            <span class="item-title download-filename">{filename}</span>
            {#if isInProgress}
                <span class="download-badge badge-in-progress">{$t('downloadStatusInProgress')}</span>
            {:else if isPaused}
                <span class="download-badge badge-paused">{$t('downloadStatusPaused')}</span>
            {:else if isInterrupted}
                <span class="download-badge badge-interrupted">
                    {item.error === 'USER_CANCELED' ? $t('downloadStatusCancelled') : $t('downloadStatusFailed')}
                </span>
            {/if}
        </div>

        <!-- Progress Bar for Downloading or Paused Files -->
        {#if isInProgress || isPaused}
            <div class="download-progress-container">
                <div class="download-progress-track">
                    <div class="download-progress-fill" class:paused={isPaused} style:width="{percentage}%"></div>
                </div>
            </div>
        {/if}

        <div class="download-meta-row">
            <span class="download-progress-text">{progressText}</span>
            {#if formattedTime}
                <span class="download-time-text">• {formattedTime}</span>
            {/if}
            {#if item.url}
                <span class="download-url-domain">• {new URL(item.url).hostname || item.url}</span>
            {/if}
        </div>
    </div>

    <!-- Right Action Buttons: Hover Tab Actions matching list groups -->
    <div class="tab-actions download-actions">
        <!-- Close 'X' Button -->
        <div
            class="delete-tab-btn action-btn delete-download-btn"
            role="button"
            tabindex="0"
            title={isInProgress || isPaused ? $tt('cancelDownload') : $tt('deleteDownloadTooltip')}
            onclick={handleQuickClose}
            onkeydown={(e) => e.key === 'Enter' && handleQuickClose(e)}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false">
                <use href="#icon-close"></use>
            </svg>
        </div>

        <!-- 3-Dots Menu Button -->
        <div class="download-menu-container">
            <div
                bind:this={menuBtnEl}
                class="download-menu-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('moreOptions') || 'Opciones'}
                onmouseenter={showMenu}
                onmouseleave={scheduleHideMenu}
                onclick={(e) => {
                    e.stopPropagation();
                    if (isMenuVisible) closeMenu();
                    else showMenu();
                }}
            >
                <svg width="16" height="16" aria-hidden="true" focusable="false">
                    <use href="#icon-more-vertical"></use>
                </svg>
            </div>
        </div>
    </div>
</div>

{#if isMenuVisible}
    <!-- Detached dropdown attached directly to document.body, escaping all details / scroll containers -->
    <div
        use:portal
        bind:this={menuEl}
        class="download-item-menu download-item-detached-menu"
        role="menu"
        tabindex="-1"
        style:top="{menuTop}px"
        style:left="{menuLeft}px"
        onmouseenter={onMenuEnter}
        onmouseleave={onMenuLeave}
    >
        {#if isComplete}
            <button type="button" class="menu-item" onclick={handleOpen}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-external"></use></svg>
                <span>{$t('openFile')}</span>
            </button>
            <button type="button" class="menu-item" onclick={handleShow}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-folder-open"></use></svg>
                <span>{$t('showInFolder')}</span>
            </button>
            <button type="button" class="menu-item" onclick={handleCopyUrl}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-copy"></use></svg>
                <span>{$t('copyDownloadLink')}</span>
            </button>
            <button type="button" class="menu-item" onclick={handleRetry}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-download"></use></svg>
                <span>{$t('retryDownload')}</span>
            </button>
        {:else if isInProgress}
            <button type="button" class="menu-item" onclick={handlePause}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-pause"></use></svg>
                <span>{$t('pauseDownload')}</span>
            </button>
            <button type="button" class="menu-item" onclick={handleCopyUrl}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-copy"></use></svg>
                <span>{$t('copyDownloadLink')}</span>
            </button>
        {:else if isPaused}
            <button type="button" class="menu-item" onclick={handleResume}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-resume"></use></svg>
                <span>{$t('resumeDownload')}</span>
            </button>
            <button type="button" class="menu-item" onclick={handleCopyUrl}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-copy"></use></svg>
                <span>{$t('copyDownloadLink')}</span>
            </button>
        {:else if isInterrupted}
            <button type="button" class="menu-item" onclick={handleRetry}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-rotate-ccw"></use></svg>
                <span>{$t('retryDownload')}</span>
            </button>
            <button type="button" class="menu-item" onclick={handleCopyUrl}>
                <svg width="16" height="16" aria-hidden="true"><use href="#icon-copy"></use></svg>
                <span>{$t('copyDownloadLink')}</span>
            </button>
        {/if}
    </div>
{/if}

<style>
    .download-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        overflow: visible !important;
        transform: none !important;
        transition: opacity 0.2s ease;
    }

    .download-item:hover,
    .download-item:focus-within,
    .download-item:has(.download-menu-container:hover) {
        z-index: 10000 !important;
    }

    .download-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        background: var(--bg-hover-color, rgba(255, 255, 255, 0.08));
        flex-shrink: 0;
    }

    .download-icon-wrapper[data-category='pdf'] {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.12);
    }
    .download-icon-wrapper[data-category='archive'] {
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.12);
    }
    .download-icon-wrapper[data-category='image'] {
        color: #3b82f6;
        background: rgba(59, 130, 246, 0.12);
    }
    .download-icon-wrapper[data-category='video'] {
        color: #8b5cf6;
        background: rgba(139, 92, 246, 0.12);
    }
    .download-icon-wrapper[data-category='audio'] {
        color: #ec4899;
        background: rgba(236, 72, 153, 0.12);
    }
    .download-icon-wrapper[data-category='code'] {
        color: #10b981;
        background: rgba(16, 185, 129, 0.12);
    }
    .download-icon-wrapper[data-category='executable'] {
        color: #06b6d4;
        background: rgba(6, 182, 212, 0.12);
    }

    .download-favicon {
        width: 18px;
        height: 18px;
        object-fit: contain;
    }

    .download-info {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .download-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
    }

    .download-filename {
        font-weight: 600;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-color);
    }

    .download-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 10px;
        white-space: nowrap;
        line-height: 1.3;
    }

    .badge-in-progress {
        background: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
    }

    .badge-paused {
        background: rgba(245, 158, 11, 0.2);
        color: #f59e0b;
    }

    .badge-interrupted {
        background: rgba(239, 68, 68, 0.2);
        color: var(--error-color, #ef4444) !important;
    }

    .download-item.is-interrupted .download-progress-text {
        color: var(--error-color, #ef4444);
    }

    .download-progress-container {
        width: 100%;
        margin-top: 2px;
        margin-bottom: 2px;
    }

    .download-progress-track {
        width: 100%;
        height: 4px;
        background: var(--border-color, rgba(255, 255, 255, 0.15));
        border-radius: 2px;
        overflow: hidden;
    }

    .download-progress-fill {
        height: 100%;
        background: var(--interactive-color, #3b82f6);
        border-radius: 2px;
        transition: width 0.2s ease;
    }

    .download-progress-fill.paused {
        background: #f59e0b;
    }

    .download-meta-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--text-muted-color, rgba(255, 255, 255, 0.6));
        overflow: hidden;
        white-space: nowrap;
    }

    .download-url-domain {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Tab Actions: matching TabItem / GroupCard design */
    .download-actions {
        display: none;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        flex-shrink: 0;
        position: relative;
    }

    .download-item:hover .download-actions,
    .download-item:focus-within .download-actions,
    .download-item:has(.download-menu-container:hover) .download-actions,
    .download-actions:hover {
        display: flex !important;
    }

    .download-actions .action-btn {
        opacity: 0.6;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        transition:
            opacity 0.15s ease,
            background-color 0.15s ease;
    }

    .download-actions .action-btn:hover {
        opacity: 1;
        background-color: var(--bg-hover-color, rgba(255, 255, 255, 0.12));
    }

    .delete-download-btn:hover {
        color: var(--error-color) !important;
        opacity: 1;
    }

    .delete-download-btn:hover svg path {
        stroke: var(--error-color) !important;
    }

    .download-menu-container {
        position: relative;
        display: inline-flex;
    }

    .download-item.menu-open .download-actions {
        display: flex !important;
    }

    :global(.download-item-detached-menu) {
        position: fixed !important;
        min-width: 180px;
        background: var(--bg-panel-color, #1e1e1e);
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        padding: 4px;
        z-index: 99999999 !important;
        display: flex;
        flex-direction: column;
        gap: 2px;
        user-select: none;
    }

    /* Invisible bridge extending around detached menu to prevent premature pointer leave */
    :global(.download-item-detached-menu::before) {
        content: '';
        position: absolute;
        top: -14px;
        left: -10px;
        right: -10px;
        height: 16px;
        background: transparent;
    }

    :global(.download-item-detached-menu .menu-item) {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 8px;
        border: none;
        background: transparent;
        color: var(--text-color, #eee);
        font-size: 12px;
        border-radius: 4px;
        cursor: pointer;
        text-align: left;
        transition:
            background 0.15s ease,
            color 0.15s ease;
    }

    :global(.download-item-detached-menu .menu-item svg) {
        flex-shrink: 0;
        color: var(--text-muted-color, inherit);
    }

    :global(.download-item-detached-menu .menu-item:hover) {
        background: var(--bg-hover-color, rgba(255, 255, 255, 0.1));
        color: var(--text-on-color, #fff);
    }

    :global(.download-item-detached-menu .menu-item:hover svg) {
        color: var(--text-on-color, #fff);
    }
</style>
