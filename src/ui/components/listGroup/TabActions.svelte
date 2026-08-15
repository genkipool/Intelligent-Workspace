<script>
    import { tt } from '../../stores/i18nStore.js';
    import { createPageModePopup } from '../../services/groupsService.js';
    import { createOverflowMenu } from '../../services/contextMenuService.js';
    import { actionVisibilitySettings } from '../../stores/appStore.svelte.js';

    let {
        tabEl,
        isSplitGroup = false,
        isSplitActive = false,
        pageModes = {},
        onSplitScreen = () => {},
        onOpenInPanel = () => {},
        onGeminiSummary = () => {},
        onShowQr = () => {},
        onEditCookies = () => {},
        onTakeScreenshot = () => {},
        onAddToBookmarks = () => {},
        onShowDownloads = () => {},
        onCopyUrl = () => {},
        onDeleteTab = () => {},
        onOpenPip = () => {},
        onOpenVideoPip = () => {},
        onOpenPopupWindow = () => {},
        onPrefetchTab = () => {},
    } = $props();

    let actionVisibility = $derived($actionVisibilitySettings);
    let pageModeContainer = $state(null);
    let tabActionsEl = $state(null);

    $effect(() => {
        if (pageModeContainer && tabEl) {
            createPageModePopup(pageModeContainer, tabEl, pageModes);
        }
    });

    $effect(() => {
        if (tabActionsEl && tabEl) {
            actionVisibility; // reactive dependency
            createOverflowMenu(tabActionsEl, 'tab-item-template', tabEl);
        }
    });
</script>

<div class="tab-actions" bind:this={tabActionsEl}>
    {#if !isSplitGroup}
        <div
            class="split-screen-btn action-btn"
            class:active={isSplitActive}
            role="button"
            tabindex="0"
            title={$tt('splitScreen')}
            onclick={onSplitScreen}
        >
            <svg width="14" height="14"><use href="#icon-split-screen"></use></svg>
        </div>
    {/if}
    <div
        class="open-in-panel-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('openInPanel')}
        onclick={onOpenInPanel}
        onmouseenter={onPrefetchTab}
    >
        <svg width="14" height="14"><use href="#icon-open-panel"></use></svg>
    </div>
    <div
        class="gemini-summary-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('summarizeWithGemini')}
        onclick={onGeminiSummary}
    >
        <svg width="14" height="14"><use href="#icon-summary"></use></svg>
    </div>
    <div class="page-mode-container" bind:this={pageModeContainer}>
        <div class="page-mode-btn action-btn" role="button" tabindex="0" title={$tt('changePageMode')}>
            <svg width="14" height="14"><use href="#icon-page-mode"></use></svg>
        </div>
    </div>
    <div class="qr-code-btn action-btn" role="button" tabindex="0" title={$tt('showQrCode')} onclick={onShowQr}>
        <svg width="14" height="14"><use href="#icon-qr"></use></svg>
    </div>
    <div
        class="edit-cookies-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('editCookies')}
        onclick={onEditCookies}
    >
        <svg width="14" height="14"><use href="#icon-cookie"></use></svg>
    </div>
    <div
        class="screenshot-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('captureWebpage')}
        onclick={onTakeScreenshot}
    >
        <svg width="14" height="14"><use href="#icon-screenshot"></use></svg>
    </div>
    <div
        class="bookmark-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('addToBookmarks')}
        onclick={onAddToBookmarks}
    >
        <svg width="14" height="14"><use href="#icon-bookmark"></use></svg>
    </div>
    <div
        class="download-files-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('showDownloads')}
        onclick={onShowDownloads}
    >
        <svg width="14" height="14"><use href="#icon-download"></use></svg>
    </div>
    <div class="copy-tab-url-btn action-btn" role="button" tabindex="0" title={$tt('copyUrl')} onclick={onCopyUrl}>
        <svg width="14" height="14"><use href="#icon-copy"></use></svg>
    </div>
    <div class="delete-tab-btn action-btn" role="button" tabindex="0" title={$tt('closeTab')} onclick={onDeleteTab}>
        <svg width="14" height="14"><use href="#icon-close"></use></svg>
    </div>
    <div
        class="pip-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('openAsPipTitle')}
        onclick={onOpenPip}
        onmouseenter={onPrefetchTab}
    >
        <svg width="14" height="14"><use href="#icon-pip"></use></svg>
    </div>
    <div
        class="video-pip-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('omnibarPrefixVideoPipTitle')}
        onclick={onOpenVideoPip}
        onmouseenter={onPrefetchTab}
    >
        <svg width="14" height="14"><use href="#icon-video-pip"></use></svg>
    </div>
    <div
        class="popup-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('openAsPopupTitle')}
        onclick={onOpenPopupWindow}
        onmouseenter={onPrefetchTab}
    >
        <svg width="14" height="14"><use href="#icon-popup"></use></svg>
    </div>
</div>
