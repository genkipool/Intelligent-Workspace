<script>
    import { get } from 'svelte/store';
    import { t, tt } from '../../stores/i18nStore.js';
    import { listGroupState } from '../../stores/listGroupStore.js';
    import { showNotification } from '../../../utils/i18n.js';
    import { isProgrammaticActivation, splitScreenState } from '../../stores/appStore.svelte.js';
    import {
        createPageModePopup,
        openCookieEditorModal,
        showQrCodeModal,
        updateMuteButtonState,
        handleTabActivation,
        handleRestoreSingleTab,
        moveSplitGroup,
        unGroupAndRemoveAllTabsInGroup,
        updateCounters,
    } from '../../services/groupsService.js';
    import { openUrlInPanel, openUrlInPip, openUrlInPopup } from '../../services/viewsService.js';
    import { showDownloadPopup, handleGeminiSummaryRequest } from '../../services/downloadsService.js';
    import { openAddToBookmarkModal } from '../../services/bookmarksService.js';
    import { handleScreenshotRequest, withTabActivation } from '../../services/screenshotsService.js';
    import { loadSplitScreenState } from '../../services/settingsService.js';
    import { prefetchUrl } from '../../services/prefetchService.js';
    import { dataUrlToBlob, animateAndRemove } from '../../services/utils.js';
    import { createOverflowMenu } from '../../services/contextMenuService.js';
    import { actionVisibilitySettings } from '../../stores/appStore.svelte.js';

    let actionVisibility = $derived($actionVisibilitySettings);

    let { tab, isBackup = false, groupContext = {}, renderContext = {}, subgroupContext = null } = $props();

    let context = $derived(subgroupContext || groupContext);

    // Derived values from renderContext
    let seenTabIds = $derived(renderContext.seenTabIds || new Set());
    let duplicateUrlSet = $derived(renderContext.duplicateUrlSet || new Set());
    let pageModes = $derived(renderContext.pageModes || {});
    let groupInfoMap = $derived(renderContext.groupInfoMap || new Map());

    let isDuplicate = $derived(duplicateUrlSet.has(tab.url));
    let isSeen = $derived(seenTabIds.has(tab.id));

    let tabEl = $state(null);

    let faviconUrl = $derived(
        !tab.favIconUrl || tab.favIconUrl.startsWith('chrome://') || tab.favIconUrl.startsWith('about:')
            ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=16`
            : tab.favIconUrl,
    );

    let displayTitle = $derived.by(() => {
        let title = tab.title || tab.url;
        if (title === tab.url && tab.url.startsWith('http')) {
            try {
                return new URL(tab.url).hostname;
            } catch (e) {}
        }
        return title;
    });

    // A subgroup carries its group in secondaryId; a group or a backup card is the
    // group itself. Reading only the subgroup shape left backup tabs without a group.
    let groupId = $derived(context.secondaryId ?? context.id);
    let groupInfo = $derived(groupInfoMap.get(groupId));
    let isSplitGroup = $derived(groupInfo && groupInfo.type === 'manual' && groupInfo.key === 'Split');
    let isSplitActive = $derived($splitScreenState.isActive && $splitScreenState.splitTabs[tab.id]);

    let isHttpUrl = $derived(tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:')));

    function prefetchTab() {
        if (isHttpUrl) prefetchUrl(tab.url);
    }

    function activateTab(e) {
        if (
            e.target.closest(
                '.delete-tab-btn, .copy-tab-url-btn, .download-files-btn, .split-screen-btn, .gemini-summary-btn, .open-in-panel-btn, .pip-btn, .video-pip-btn, .popup-btn, .audible-indicator, .page-mode-container, .qr-code-btn, .edit-cookies-btn, .screenshot-btn, .bookmark-btn',
            )
        ) {
            return;
        }

        // A backed-up tab has no live tab behind it: clicking it brings that one tab
        // back, into the group the backup is linked to.
        if (isBackup) {
            e.stopPropagation();
            if (e.detail > 0) {
                if (document.activeElement && tabEl?.contains(document.activeElement)) document.activeElement.blur();
                tabEl?.blur();
            }
            handleRestoreSingleTab(groupId, tab);
            return;
        }

        // e.detail > 0 means a mouse click: drop focus so it does not block keyboard
        // navigation; e.detail === 0 = Enter/Space: keep it.
        if (e.detail > 0 && tabEl) {
            if (document.activeElement && tabEl.contains(document.activeElement)) {
                document.activeElement.blur();
            }
            tabEl.blur();
        }

        const handled = tabEl ? handleTabActivation(e, tabEl) : false;

        const currentActive = document.querySelector('.tab-item.active');
        if (currentActive && currentActive !== tabEl) {
            currentActive.classList.remove('active');
            if (duplicateUrlSet.has(currentActive.dataset.url)) {
                const title = currentActive.querySelector('.tab-title');
                if (title) title.style.opacity = '0.6';
            }
        }
        if (tabEl) {
            tabEl.classList.add('active');
            tabEl.classList.add('seen');
            if (isDuplicate) {
                const title = tabEl.querySelector('.tab-title');
                if (title) title.style.opacity = '1';
            }
            updateCounters(tabEl);
        }
        seenTabIds.add(tab.id);

        if (handled) return;

        if (!isNaN(tab.id)) {
            isProgrammaticActivation.set(true);
            setTimeout(() => isProgrammaticActivation.set(false), 1000);

            chrome.tabs.update(tab.id, { active: true });
            if (!isNaN(tab.windowId)) {
                chrome.windows.update(tab.windowId, { focused: true });
            }
        }
    }

    function handleKeydown(e) {
        if (e.key === 'Enter') activateTab(e);
    }

    // Tab Actions
    let isMuted = $derived(!!(tab.mutedInfo && tab.mutedInfo.muted));

    function toggleMute(e) {
        e.stopPropagation();
        const willMute = !isMuted;
        chrome.tabs.update(tab.id, { muted: willMute }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error toggling mute:', chrome.runtime.lastError);
            }
            if (typeof updateMuteButtonState === 'function') updateMuteButtonState();
        });
    }

    function deleteTab(e) {
        e.stopPropagation();
        if (isBackup) return;

        const groupElement = tabEl?.closest('.group-item');
        const tabsInGroup = groupElement ? groupElement.querySelectorAll('.tab-item').length : 0;
        const isLastTab = tabsInGroup === 1;

        if (isLastTab && isSplitGroup) {
            unGroupAndRemoveAllTabsInGroup(groupId);
        } else {
            chrome.tabs.remove(tab.id).catch((error) => {
                if (!error.message.toLowerCase().includes('no tab with id')) {
                    console.error(`Error processing tab closure ${tab.id}:`, error);
                }
            });
        }

        const subgroupElement = tabEl?.closest('.domain-subgroup');
        if (subgroupElement) {
            const tabsInSubgroup = subgroupElement.querySelectorAll('.tab-item').length;
            if (tabsInSubgroup === 1) {
                animateAndRemove(subgroupElement, true);
            } else {
                animateAndRemove(tabEl, false);
            }
        } else if (groupElement) {
            if (isLastTab) {
                animateAndRemove(groupElement, true);
            } else {
                animateAndRemove(tabEl, false);
            }
        }
    }

    function copyUrl(e) {
        e.stopPropagation();
        navigator.clipboard.writeText(tab.url).then(() => {
            showNotification('urlCopied');
        });
    }

    function showQr(e) {
        e.stopPropagation();
        showQrCodeModal(tab.url);
    }

    function editCookies(e) {
        e.stopPropagation();
        openCookieEditorModal(tab.url);
    }

    function openInPanel(e) {
        e.stopPropagation();
        if (isHttpUrl) openUrlInPanel(tab.url, context);
    }

    function openPip(e) {
        e.stopPropagation();
        if (isHttpUrl) openUrlInPip(tab.url, 450, 600, tab.id, tab.windowId);
    }

    async function openVideoPip(e) {
        e.stopPropagation();
        if (!isHttpUrl) return;
        let originalWindowId = null;
        let originalTabId = null;
        try {
            const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTabs && activeTabs.length > 0) {
                originalTabId = activeTabs[0].id;
                originalWindowId = activeTabs[0].windowId;
            }
        } catch (err) {
            console.warn('Could not record original window/tab focus:', err);
        }
        chrome.runtime.sendMessage({
            action: 'openVideoPipWindow',
            tabId: tab.id,
            windowId: tab.windowId,
            url: tab.url,
            originalTabId,
            originalWindowId,
        });
    }

    function openPopupWindow(e) {
        e.stopPropagation();
        if (isHttpUrl) openUrlInPopup(tab.url);
    }

    function geminiSummary(e) {
        e.stopPropagation();
        handleGeminiSummaryRequest(tab.url);
    }

    async function takeScreenshot(e) {
        e.stopPropagation();
        e.preventDefault();

        if (e.ctrlKey || e.metaKey) {
            let areaDataUrl = null;
            await withTabActivation(tab, () => {
                return new Promise((resolve) => {
                    const listener = (message) => {
                        if (message.action === 'areaScreenshotProcessFinished') {
                            chrome.runtime.onMessage.removeListener(listener);
                            if (message.success) {
                                areaDataUrl = message.dataUrl || null;
                            } else {
                                showNotification('errorTakingScreenshot', true);
                            }
                            resolve();
                        }
                    };
                    chrome.runtime.onMessage.addListener(listener);
                    chrome.runtime.sendMessage({ action: 'injectAreaSelector', tabId: tab.id });
                });
            });

            if (areaDataUrl) {
                try {
                    const blob = await dataUrlToBlob(areaDataUrl);
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    showNotification('screenshotCopied');
                } catch (err) {
                    console.error('Clipboard copy failed:', err);
                    showNotification('screenshotSavedNoCopy', true);
                }
            }
        } else {
            handleScreenshotRequest(tab, context);
        }
    }

    function addToBookmarks(e) {
        e.stopPropagation();
        openAddToBookmarkModal(tab);
    }

    function showDownloads(e) {
        e.stopPropagation();
        showDownloadPopup(e.currentTarget, tab.url);
    }

    async function handleSplitScreen(e) {
        e.stopPropagation();
        try {
            const button = e.currentTarget;
            const isActivating = !button.classList.contains('active');

            if (isActivating && tabEl) {
                tabEl.classList.add('seen');
            }

            await chrome.runtime.sendMessage({
                action: 'toggleSplitScreen',
                tabId: tab.id,
                url: tab.url,
            });

            if (isActivating) {
                await moveSplitGroup(groupId);
            } else {
                await loadSplitScreenState();
                const remainingTabIds = Object.keys(get(splitScreenState).splitTabs);
                if (get(splitScreenState).isActive && remainingTabIds.length > 0) {
                    const firstRemainingTabId = parseInt(remainingTabIds[0], 10);
                    try {
                        const tabInfo = await chrome.tabs.get(firstRemainingTabId);
                        if (tabInfo && tabInfo.groupId !== -1) {
                            await moveSplitGroup(tabInfo.groupId);
                        }
                    } catch (err) {
                        console.warn(
                            `Could not find remaining active tab (${firstRemainingTabId}) to move Split group.`,
                        );
                    }
                }
            }
        } catch (error) {
            console.error('Error sending toggleSplitScreen message:', error);
        }
    }

    let pageModeContainer = $state(null);
    let tabActionsEl = $state(null);

    $effect(() => {
        if (pageModeContainer && tabEl && !isBackup) {
            createPageModePopup(pageModeContainer, tabEl, pageModes);
        }
    });

    $effect(() => {
        // Adds the overflow button that groups the hidden actions; it reacts to the
        // action visibility settings.
        if (tabActionsEl && tabEl && !isBackup) {
            actionVisibility; // reactive dependency
            createOverflowMenu(tabActionsEl, 'tab-item-template', tabEl);
        }
    });

    $effect(() => {
        // The overflow menu and Ctrl+click activation read the context off the node
        if (tabEl) tabEl._context = context;
    });
</script>

<div
    bind:this={tabEl}
    class="tab-item"
    class:backup-tab-item={isBackup}
    class:seen={isSeen}
    class:duplicate-tab={isDuplicate}
    class:active={!!tab.active}
    role="link"
    onclick={activateTab}
    onkeydown={handleKeydown}
    onmouseenter={prefetchTab}
    data-tab-id={tab.id}
    data-window-id={tab.windowId}
    data-url={tab.url}
>
    <img src={faviconUrl} alt="" class="favicon" />
    <!--
        Same as tab-item-template in original: the indicator always exists in the
        DOM and is only hidden with the `hidden` class; the speaker/muted icon is
        decided by CSS based on the `muted` class.
    -->
    <span
        class="audible-indicator"
        class:hidden={!tab.audible || isBackup}
        class:muted={isMuted}
        role="button"
        title={$tt(isMuted ? 'toggleMuteUnmute' : 'toggleMuteMute')}
        tabindex="0"
        onclick={toggleMute}
    >
        <svg class="icon-audible" width="16" height="16">
            <use href="#icon-speaker"></use>
        </svg>
        <svg class="icon-muted" width="16" height="16">
            <use href="#icon-speaker-muted"></use>
        </svg>
    </span>

    <span
        class="tab-title"
        tabindex="0"
        data-original-text={displayTitle}
        style:color={isDuplicate ? 'var(--error-color)' : null}
        style:opacity={isDuplicate && !tab.active ? '0.6' : '1'}>{displayTitle}</span
    >

    {#if !isBackup}
        <div class="tab-actions" bind:this={tabActionsEl}>
            {#if !isSplitGroup}
                <div
                    class="split-screen-btn action-btn"
                    class:active={isSplitActive}
                    role="button"
                    tabindex="0"
                    title={$tt('splitScreen')}
                    onclick={handleSplitScreen}
                >
                    <svg width="14" height="14"><use href="#icon-split-screen"></use></svg>
                </div>
            {/if}
            <div
                class="open-in-panel-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('openInPanel')}
                onclick={openInPanel}
                onmouseenter={prefetchTab}
            >
                <svg width="14" height="14"><use href="#icon-open-panel"></use></svg>
            </div>
            <div
                class="gemini-summary-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('summarizeWithGemini')}
                onclick={geminiSummary}
            >
                <svg width="14" height="14"><use href="#icon-summary"></use></svg>
            </div>
            <div class="page-mode-container" bind:this={pageModeContainer}>
                <div class="page-mode-btn action-btn" role="button" tabindex="0" title={$tt('changePageMode')}>
                    <svg width="14" height="14"><use href="#icon-page-mode"></use></svg>
                </div>
            </div>
            <div class="qr-code-btn action-btn" role="button" tabindex="0" title={$tt('showQrCode')} onclick={showQr}>
                <svg width="14" height="14"><use href="#icon-qr"></use></svg>
            </div>
            <div
                class="edit-cookies-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('editCookies')}
                onclick={editCookies}
            >
                <svg width="14" height="14"><use href="#icon-cookie"></use></svg>
            </div>
            <div
                class="screenshot-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('captureWebpage')}
                onclick={takeScreenshot}
            >
                <svg width="14" height="14"><use href="#icon-screenshot"></use></svg>
            </div>
            <div
                class="bookmark-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('addToBookmarks')}
                onclick={addToBookmarks}
            >
                <svg width="14" height="14"><use href="#icon-bookmark"></use></svg>
            </div>
            <div
                class="download-files-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('showDownloads')}
                onclick={showDownloads}
            >
                <svg width="14" height="14"><use href="#icon-download"></use></svg>
            </div>
            <div
                class="copy-tab-url-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('copyUrl')}
                onclick={copyUrl}
            >
                <svg width="14" height="14"><use href="#icon-copy"></use></svg>
            </div>
            <div
                class="delete-tab-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('closeTab')}
                onclick={deleteTab}
            >
                <svg width="14" height="14"><use href="#icon-close"></use></svg>
            </div>
            <div
                class="pip-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('openAsPipTitle')}
                onclick={openPip}
                onmouseenter={prefetchTab}
            >
                <svg width="14" height="14"><use href="#icon-pip"></use></svg>
            </div>
            <div
                class="video-pip-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('omnibarPrefixVideoPipTitle')}
                onclick={openVideoPip}
                onmouseenter={prefetchTab}
            >
                <svg width="14" height="14"><use href="#icon-video-pip"></use></svg>
            </div>
            <div
                class="popup-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('openAsPopupTitle')}
                onclick={openPopupWindow}
                onmouseenter={prefetchTab}
            >
                <svg width="14" height="14"><use href="#icon-popup"></use></svg>
            </div>
        </div>
    {/if}
</div>
