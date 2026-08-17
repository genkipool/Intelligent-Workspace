/**
 * Reads the content of an extension file securely in background context to avoid CSP blocks.
 */
async function handleGetExtensionFileContent(message, sendResponse) {
    try {
        const url = chrome.runtime.getURL(message.path);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        if (sendResponse)
            sendResponse({
                success: true,
                text,
            });
    } catch (error) {
        console.error('Error reading extension file content:', error);
        if (sendResponse)
            sendResponse({
                success: false,
                error: error.message,
            });
    }
}
chrome.commands.onCommand.addListener(async (command) => {
    logMessage(`[onCommand] Received command: ${command}.`);
    switch (command) {
        case 'toggle-current-group':
            await toggleCurrentGroupCommand();
            break;
        case 'toggle-all-groups':
            await toggleAllGroupsCommand();
            break;
        case 'toggle-sort-alpha':
            if (typeof toggleSortGroupsAlpha === 'function') await toggleSortGroupsAlpha();
            break;
        case 'toggle-collapse-timer':
            if (typeof toggleCollapseTimerOption === 'function') await toggleCollapseTimerOption();
            break;
        case 'toggle-all-rules':
            if (typeof toggleAllRules === 'function') await toggleAllRules();
            break;
        case 'toggle-hints':
            await toggleHintsCommand();
            break;
        case 'toggle-expand-all':
            chrome.runtime.sendMessage({
                action: 'toggleAllExpand',
            });
            break;
        case 'rules-manager':
            await openRulesManagerCommand();
            break;
        case 'open-popup':
            await toggleExtensionPopupCommand();
            break;
        case 'toggle-prefixes':
            await togglePrefixesCommand();
            break;
        case 'toggle-clustering':
            await toggleClusteringCommand();
            break;
        case 'toggle-domain-grouping':
            await handleClusterToggle('domainsEnabled');
            break;
        case 'toggle-subdomain-grouping':
            await handleClusterToggle('subdomainsEnabled');
            break;
        case 'toggle-compact-mode':
            await handleClusterToggle('compactMode.enabled');
            break;
        case 'toggle-chrome-grouping':
            await handleClusterToggle('specialGroups.chrome.enabled');
            break;
        case 'toggle-files-grouping':
            await handleClusterToggle('specialGroups.files.enabled');
            break;
        case 'toggle-extensions-grouping':
            await handleClusterToggle('specialGroups.extensions.enabled');
            break;
        case 'toggle-misc-grouping':
            await handleClusterToggle('specialGroups.misc.enabled');
            break;
        case 'toggle-ip-address-grouping':
            await handleClusterToggle('specialGroups.ipAddress.enabled');
            break;
        case 'regroup-all-tabs':
            await regroupAllTabsCommand();
            break;
        case 'toggle-current-group':
            await toggleCurrentGroupCommand();
            break;
        case 'remove-duplicate-tabs':
            await removeDuplicateTabsCommand();
            break;
        case 'open-side-panel':
            const rulesBasePath = 'src/ui/pages/rules/rules.html';
            if (activeSidePanelPath === rulesBasePath) {
                // If panel is already showing rules page, close it.
                chrome.sidePanel.setOptions({
                    path: rulesBasePath,
                    enabled: false,
                });
                activeSidePanelPath = null;
            } else {
                // If not, open it with a unique URL to force reload.
                const dynamicRulesPath = `${rulesBasePath}?t=${Date.now()}`;
                chrome.sidePanel.setOptions({
                    path: dynamicRulesPath,
                    enabled: true,
                });
                chrome.tabs.query(
                    {
                        active: true,
                        currentWindow: true,
                    },
                    ([tab]) => {
                        if (tab) {
                            chrome.sidePanel.open({
                                windowId: tab.windowId,
                            });
                            // Save base path for future toggle checks.
                            activeSidePanelPath = rulesBasePath;
                        }
                    },
                );
            }
            break;
        case 'open-theme-selector':
            const themesBasePath = 'src/ui/pages/savedThemes/savedThemes.html';
            if (activeSidePanelPath === themesBasePath) {
                chrome.sidePanel.setOptions({
                    path: themesBasePath,
                    enabled: false,
                });
                activeSidePanelPath = null;
            } else {
                const dynamicThemesPath = `${themesBasePath}?t=${Date.now()}`;
                chrome.sidePanel.setOptions({
                    path: dynamicThemesPath,
                    enabled: true,
                });
                chrome.tabs.query(
                    {
                        active: true,
                        currentWindow: true,
                    },
                    ([tab]) => {
                        if (tab) {
                            chrome.sidePanel.open({
                                windowId: tab.windowId,
                            });
                            activeSidePanelPath = themesBasePath;
                        }
                    },
                );
            }
            break;
        case 'open-list-group-sidepanel-command':
            const listGroupBasePath = 'src/ui/pages/listGroup/listGroup.html';
            if (activeSidePanelPath === listGroupBasePath) {
                chrome.sidePanel.setOptions({
                    path: listGroupBasePath,
                    enabled: false,
                });
                activeSidePanelPath = null;
            } else {
                await chrome.storage.local.set({
                    navSource: '../rules/rules.html?context=sidepanel',
                });
                const dynamicListGroupPath = `${listGroupBasePath}?t=${Date.now()}`;
                chrome.sidePanel.setOptions({
                    path: dynamicListGroupPath,
                    enabled: true,
                });
                chrome.tabs.query(
                    {
                        active: true,
                        currentWindow: true,
                    },
                    ([tab]) => {
                        if (tab) {
                            chrome.sidePanel.open({
                                windowId: tab.windowId,
                            });
                            activeSidePanelPath = listGroupBasePath;
                        }
                    },
                );
            }
            break;
        default:
            console.warn(`[onCommand] Unhandled command: ${command}.`);
    }
});
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'popup-connection') {
        isPopupCurrentlyOpen = true;
        port.onDisconnect.addListener(() => {
            isPopupCurrentlyOpen = false;
        });
    }
    if (port.name === 'sidepanel-connection') {
        logMessage('Side panel connected.');

        // When the panel sends its path on connection.
        port.onMessage.addListener((message) => {
            if (message.path) {
                activeSidePanelPath = message.path;
                logMessage(`Active side panel path updated to: ${activeSidePanelPath}`);
            }
        });
        port.onDisconnect.addListener(() => {
            activeSidePanelPath = null;
            chrome.storage.session.set({
                activeSidePanelPath: null,
            });
            logMessage('Side panel disconnected. Path cleared.');
        });
    }
});
function openOrToggleSidePanel(basePath, sendResponse) {
    const cleanBasePath = basePath.split('?')[0];
    chrome.tabs.query(
        {
            active: true,
            lastFocusedWindow: true,
        },
        ([tab]) => {
            if (!tab) {
                console.warn('openOrToggleSidePanel: No active tab found.');
                if (sendResponse)
                    sendResponse({
                        success: false,
                        error: 'No active tab found.',
                    });
                return;
            }
            if (activeSidePanelPath && activeSidePanelPath.includes(cleanBasePath)) {
                logMessage(`[openOrToggleSidePanel] Panel is already open with ${cleanBasePath}. Closing it.`);
                chrome.sidePanel.setOptions(
                    {
                        path: cleanBasePath,
                        enabled: false,
                    },
                    () => {
                        activeSidePanelPath = null;
                        if (sendResponse)
                            sendResponse({
                                success: true,
                                closed: true,
                            });
                    },
                );
            } else {
                logMessage(`[openOrToggleSidePanel] Opening panel with path: ${basePath}`);
                const dynamicPath = basePath.includes('?')
                    ? `${basePath}&t=${Date.now()}`
                    : `${basePath}?t=${Date.now()}`;
                chrome.sidePanel.setOptions({
                    path: dynamicPath,
                    enabled: true,
                });
                chrome.sidePanel.open(
                    {
                        windowId: tab.windowId,
                    },
                    () => {
                        activeSidePanelPath = cleanBasePath;
                        if (sendResponse)
                            sendResponse({
                                success: true,
                                alreadyOpen: false,
                            });
                    },
                );
            }
        },
    );
}
function handleFocusSidePanel(sendResponse) {
    openOrToggleSidePanel('src/ui/pages/popup/popup.html', sendResponse);
}

const MESSAGE_HANDLERS = {
    /**
     * The Rules page asks for a regroup after changing the clustering settings.
     * There was no handler for it, so every switch logged "Receiving end does not
     * exist" and the regroup happened only because the settings write raised
     * chrome.storage.onChanged — which is skipped while isInstallActive is set, so
     * on a freshly installed profile the switches changed the setting and regrouped
     * nothing at all.
     *
     * Debounced on purpose: the storage change fires its own regroup a moment later
     * and both have to collapse into a single pass. handlers/groups.js has held the
     * handler all along; it was simply never reachable, and it is the one that
     * reports a failure back as { error }, which is what the Rules page reads.
     */
    groupTabs: (message, sender, sendResponse) => {
        handleGroupTabs(message, sendResponse);
        return true;
    },
    clearFaviconCache: (message, sender, sendResponse) => {
        if (typeof clearFaviconColorCache === 'function') {
            clearFaviconColorCache();
        }
        sendResponse({ success: true, message: 'Favicon color cache cleared' });
        return true;
    },
    snippetsUpdated: (message, sender, sendResponse) => {
        // Forward to all content scripts
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
                chrome.tabs
                    .sendMessage(tab.id, {
                        action: 'snippetsUpdated',
                    })
                    .catch(() => {
                        // Ignore errors if tab has no content script
                    });
            });
        });
        sendResponse({
            success: true,
        });
        return true;
    },
    sidePanelPathUpdated: (message, sender, sendResponse) => {
        handleSidePanelPathUpdated(message);
        sendResponse({
            success: true,
        });
        return true;
    },
    schedulesUpdated: (message, sender, sendResponse) => {
        handleSchedulesUpdated(message, sendResponse);
        return true;
    },
    geminiSchedulesUpdated: (message, sender, sendResponse) => {
        handleGeminiSchedulesUpdated(message, sendResponse);
        return true;
    },
    searchGoogle: (message, sender, sendResponse) => {
        handleSearchGoogle(message, sendResponse);
        return true;
    },
    // The site prefixes (y:, d:, w:, gm:, x:, am:, ams:) all end here. handleSearchAction
    // knew every one of these sites, but no route reached it, so those prefixes did
    // nothing at all.
    searchYoutube: (message) => {
        handleSearchAction(message);
        return false;
    },
    searchDuckDuckGo: (message) => {
        handleSearchAction(message);
        return false;
    },
    searchWikipedia: (message) => {
        handleSearchAction(message);
        return false;
    },
    searchGoogleMaps: (message) => {
        handleSearchAction(message);
        return false;
    },
    searchX: (message) => {
        handleSearchAction(message);
        return false;
    },
    searchAmazon: (message) => {
        handleSearchAction(message);
        return false;
    },
    searchAmazonEs: (message) => {
        handleSearchAction(message);
        return false;
    },
    openPopupWindow: (message, sender, sendResponse) => {
        handleOpenPopupWindow(message, sendResponse);
        return true;
    },
    openPipWindow: (message, sender, sendResponse) => {
        handleOpenPipWindow(message, sender, sendResponse);
        return true;
    },
    openVideoPipWindow: (message, sender, sendResponse) => {
        handleOpenVideoPipWindow(message, sender, sendResponse);
        return true;
    },
    validateApiKey: (message, sender, sendResponse) => {
        handleValidateApiKey(message, sendResponse);
        return true;
    },
    togglePrefixes: (message, sender, sendResponse) => {
        handleTogglePrefixes(message, sendResponse);
        return true;
    },
    toggleLinkPreview: (message, sender, sendResponse) => {
        handleToggleLinkPreview(message, sendResponse);
        return true;
    },
    toggleLinkPreviewFromKey: (message, sender, sendResponse) => {
        handleToggleLinkPreviewFromKey(message, sendResponse);
        return true;
    },
    toggleAutoPipFromKey: (message, sender, sendResponse) => {
        handleToggleAutoPipFromKey(message, sendResponse);
        return true;
    },
    removeDuplicateTabs: (message, sender, sendResponse) => {
        handleRemoveDuplicateTabs(sendResponse);
        return true;
    },
    openFileUrl: (message, sender, sendResponse) => {
        handleOpenFileUrl(message, sendResponse);
        return true;
    },
    forceSync: (message, sender, sendResponse) => {
        handleForceSync(sendResponse);
        return true;
    },
    rulesUpdated: (message, sender, sendResponse) => {
        handleRulesUpdated(sendResponse);
        return true;
    },
    createRuleFromShortcut: (message, sender, sendResponse) => {
        handleCreateRuleFromShortcut(message, sender, sendResponse);
        return true;
    },
    openAddToRuleFromShortcut: (message, sender, sendResponse) => {
        handleOpenAddToRuleFromShortcut(message, sender, sendResponse);
        return true;
    },
    openCreateRuleFromOmnibar: (message, sender, sendResponse) => {
        handleOpenCreateRuleFromOmnibar(message, sender, sendResponse);
        return true;
    },
    openAddToRuleFromOmnibar: (message, sender, sendResponse) => {
        handleOpenAddToRuleFromOmnibar(message, sender, sendResponse);
        return true;
    },
    addCurrentUrlToExistingRule: (message, sender, sendResponse) => {
        handleAddCurrentUrlToExistingRule(message, sendResponse);
        return true;
    },
    getRules: (message, sender, sendResponse) => {
        handleGetRules(sendResponse);
        return true;
    },
    createRuleFromOmnibar: (message, sender, sendResponse) => {
        handleCreateRuleFromOmnibar(message, sendResponse);
        return true;
    },
    deleteRulesFromOmnibar: (message, sender, sendResponse) => {
        handleDeleteRulesFromOmnibar(message, sendResponse);
        return true;
    },
    addUrlsToRule: (message, sender, sendResponse) => {
        handleAddUrlsToRule(message, sendResponse);
        return true;
    },
    updateRuleColor: (message, sender, sendResponse) => {
        handleUpdateRuleColor(message, sendResponse);
        return true;
    },
    updateRuleName: (message, sender, sendResponse) => {
        handleUpdateRuleName(message, sendResponse);
        return true;
    },
    updateRuleDomain: (message, sender, sendResponse) => {
        handleUpdateRuleDomain(message, sendResponse);
        return true;
    },
    updateGroupColor: (message, sender, sendResponse) => {
        handleUpdateGroupColor(message, sendResponse);
        return true;
    },
    getClusterConfig: (message, sender, sendResponse) => {
        handleGetClusterConfig(message, sendResponse);
        return true;
    },
    getActiveTab: (message, sender, sendResponse) => {
        handleGetActiveTab(message, sendResponse);
        return true;
    },
    openMultipleUrls: (message, sender, sendResponse) => {
        handleOpenMultipleUrls(message, sendResponse);
        return true;
    },
    backupAllGroupsFromKey: (message, sender, sendResponse) => {
        handleBackupAllGroupsFromKey(message, sendResponse);
        return true;
    },
    restoreAllGroupsFromKey: (message, sender, sendResponse) => {
        handleRestoreAllGroupsFromKey(message, sendResponse);
        return true;
    },
    getBackups: (message, sender, sendResponse) => {
        handleGetBackups(sendResponse);
        return true;
    },
    restoreBackupGroup: (message, sender, sendResponse) => {
        handleRestoreBackupGroup(message, sendResponse);
        return true;
    },
    restoreBackupTab: (message, sender, sendResponse) => {
        handleRestoreBackupTab(message, sendResponse);
        return true;
    },
    getExtensionFileContent: (message, sender, sendResponse) => {
        handleGetExtensionFileContent(message, sendResponse);
        return true;
    },
    openSidePanelThemes: (message, sender, sendResponse) => {
        handleOpenSidePanelThemes(sendResponse);
        return true;
    },
    cleanupSidePanelRules: (message, sender, sendResponse) => {
        handleCleanupSidePanelRules(sendResponse);
        return true;
    },
    fetchPageContent: (message, sender, sendResponse) => {
        handleFetchPageContent(message, sendResponse);
        return true;
    },
    getAvailableGeminiModels: (message, sender, sendResponse) => {
        fetchAvailableModels().then(sendResponse);
        return true;
    },
    searchGemini: (message, sender, sendResponse) => {
        handleSearchGemini(message, sendResponse);
        return true;
    },
    geminiAgentStep: (message, sender, sendResponse) => {
        handleGeminiAgentStep(message, sendResponse);
        return true;
    },
    geminiAgentToolCall: (message, sender, sendResponse) => {
        handleGeminiAgentToolCall(message, sendResponse);
        return true;
    },
    getOmnibarConversations: (message, sender, sendResponse) => {
        handleGetOmnibarConversations(sendResponse);
        return true;
    },
    getOmnibarScreenshots: (message, sender, sendResponse) => {
        handleGetOmnibarScreenshots(sendResponse);
        return true;
    },
    getOmnibarImageById: (message, sender, sendResponse) => {
        handleGetOmnibarImageById(message, sendResponse);
        return true;
    },
    getOmnibarAllMessages: (message, sender, sendResponse) => {
        handleGetOmnibarAllMessages(sendResponse);
        return true;
    },
    getOmnibarNotes: (message, sender, sendResponse) => {
        handleGetOmnibarNotes(sendResponse);
        return true;
    },
    deleteOtherGroups: (message, sender, sendResponse) => {
        handleDeleteOtherGroups(message, sendResponse);
        return true;
    },
    updateOmnibarNote: (message, sender, sendResponse) => {
        handleUpdateOmnibarNote(message, sendResponse);
        return true;
    },
    getOmnibarConversationContent: (message, sender, sendResponse) => {
        handleGetOmnibarConversationContent(message, sendResponse);
        return true;
    },
    showOmnibarNotification: (message, sender, sendResponse) => {
        handleShowOmnibarNotification(message, sender, sendResponse);
        return false;
    },
    prepareUrlForSidePanel: (message, sender, sendResponse) => {
        handlePrepareUrlForSidePanel(message, sendResponse);
        return true;
    },
    prepareVideoUrlForPip: (message, sender, sendResponse) => {
        handlePrepareVideoUrlForPip(message, sendResponse);
        return true;
    },
    registerPipWindow: (message, sender, sendResponse) => {
        handleRegisterPipWindow(message, sender, sendResponse);
        return true;
    },
    minimizePipWindow: (message, sender, sendResponse) => {
        handleMinimizePipWindow(message, sender, sendResponse);
        return true;
    },
    getDownloadableFiles: (message, sender, sendResponse) => {
        handleGetDownloadableFiles(message, sendResponse);
        return true;
    },
    downloadFilesBatch: (message, sender, sendResponse) => {
        handleDownloadFilesBatch(message, sendResponse);
        return true;
    },
    fullscreenChanged: (message, sender, sendResponse) => {
        handleFullscreenChanged(message, sender, sendResponse);
        return true;
    },
    toggleSplitScreen: (message, sender, sendResponse) => {
        handleToggleSplitScreen(message, sendResponse);
        return true;
    },
    closeSplitScreen: (message, sender, sendResponse) => {
        handleCloseSplitScreen(message, sendResponse);
        return true;
    },
    captureAreaScreenshot: (message, sender) => {
        handleCaptureAreaScreenshot(message, sender);
        return false;
    },
    captureFullPageFromShortcut: (message, sender, sendResponse) => {
        handleCaptureFullPageFromShortcut(message, sender, sendResponse);
        return true;
    },
    injectAreaSelector: (message, sender, sendResponse) => {
        handleInjectAreaSelector(message, sender, sendResponse);
        return true;
    },
    captureAreaFromShortcut: (message, sender, sendResponse) => {
        handleCaptureAreaFromShortcut(message, sender, sendResponse);
        return true;
    },
    addUrlToRule: (message, sender, sendResponse) => {
        handleAddUrlToRule(message, sendResponse);
        return true;
    },
    getCookiesForUrl: (message, sender, sendResponse) => {
        handleGetCookiesForUrl(message, sendResponse);
        return true;
    },
    setCookie: (message, sender, sendResponse) => {
        handleSetCookie(message, sendResponse);
        return true;
    },
    removeCookie: (message, sender, sendResponse) => {
        handleRemoveCookie(message, sendResponse);
        return true;
    },
    regroupAllTabs: (message, sender, sendResponse) => {
        handleRegroupAllTabs(sendResponse);
        return true;
    },
    getActiveTheme: (message, sender, sendResponse) => {
        handleGetActiveTheme(sendResponse);
        return true;
    },
    createNewTab: (message, sender, sendResponse) => {
        handleCreateNewTab();
        return false;
    },
    closeCurrentTab: (message, sender, sendResponse) => {
        handleCloseCurrentTab(sender);
        return false;
    },
    nextTab: (message, sender, sendResponse) => {
        handleSwitchTab(1, sender);
        return false;
    },
    previousTab: (message, sender, sendResponse) => {
        handleSwitchTab(-1, sender);
        return false;
    },
    deleteCurrentTabGroup: (message, sender, sendResponse) => {
        handleDeleteCurrentTabGroup(sender);
        return false;
    },
    getTabGroups: (message, sender, sendResponse) => {
        handleGetTabGroups(sendResponse);
        return true;
    },
    deleteTabGroup: (message, sender, sendResponse) => {
        handleDeleteTabGroup(message, sendResponse);
        return true;
    },
    deleteTabGroups: (message, sender, sendResponse) => {
        handleDeleteTabGroups(message, sendResponse);
        return true;
    },
    deleteTabs: (message, sender, sendResponse) => {
        handleDeleteTabs(message, sendResponse);
        return true;
    },
    focusSidePanel: (message, sender, sendResponse) => {
        handleFocusSidePanel(sendResponse);
        return true;
    },
    openSidePanel: (message, sender, sendResponse) => {
        handleOpenSidePanel(message, sender, sendResponse);
        return true;
    },
    swapToPreviousTab: (message, sender, sendResponse) => {
        handleSwapToPreviousTab(sendResponse);
        return true;
    },
    getOpenTabs: (message, sender, sendResponse) => {
        handleGetOpenTabs(sendResponse);
        return true;
    },
    switchToTab: (message, sender, sendResponse) => {
        handleSwitchToTab(message, sendResponse);
        return true;
    },
    searchBookmarks: (message, sender, sendResponse) => {
        handleSearchBookmarks(message, sendResponse);
        return true;
    },
    getBookmarks: (message, sender, sendResponse) => {
        handleGetBookmarks(sendResponse);
        return true;
    },
    createBookmark: (message, sender, sendResponse) => {
        handleCreateBookmark(message.payload, sendResponse);
        return true;
    },
    getHistory: (message, sender, sendResponse) => {
        handleGetHistory(message, sendResponse);
        return true;
    },
    getRecentlyClosed: (message, sender, sendResponse) => {
        handleGetRecentlyClosed(message, sendResponse);
        return true;
    },
    openUrl: (message, sender, sendResponse) => {
        handleOpenUrl(message);
        return false;
    },
    duplicateTab: (message, sender, sendResponse) => {
        handleDuplicateTab(sender);
        return false;
    },
    setPageMode: (message, sender, sendResponse) => {
        handleSetPageMode(message, sender, sendResponse);
        return true;
    },
    deactivateAllPageModes: (message, sender, sendResponse) => {
        handleDeactivateAllPageModes(sendResponse);
        return true;
    },
    hintStatusChanged: (message, sender, sendResponse) => {
        handleHintStatusChanged(message);
        // Sólo un aviso: nadie espera respuesta.
        return false;
    },
    muteAllTabs: (message, sender, sendResponse) => {
        handleMuteAllTabs();
        return false;
    },
    toggleMuteCurrentTab: (message, sender, sendResponse) => {
        handleToggleMuteCurrentTab(sender);
        return false;
    },
    hintCommandsUpdated: (message, sender, sendResponse) => {
        handleHintCommandsUpdated();
        // Sólo un aviso: nadie espera respuesta.
        return false;
    },
    themeChanged: (message, sender, sendResponse) => {
        handleThemeChanged();
        // Sólo un aviso: nadie espera respuesta.
        return false;
    },
    printHtmlAsPdf: (message, sender, sendResponse) => {
        printHtmlAsPdf(message, sendResponse);
        return true;
    },
    getPageModes: (message, sender, sendResponse) => {
        handleGetPageModes(message, sendResponse);
        return true;
    },
    cancelTabPageMode: (message, sender, sendResponse) => {
        handleCancelTabPageMode(sender, sendResponse);
        return true;
    },
    updateBookmark: (message, sender, sendResponse) => {
        handleUpdateBookmark(message.payload, sendResponse);
        return true;
    },
    deleteBookmarkTree: (message, sender, sendResponse) => {
        handleDeleteBookmarkTree(message.payload, sendResponse);
        return true;
    },
    moveBookmark: (message, sender, sendResponse) => {
        handleMoveBookmark(message.payload, sendResponse);
        return true;
    },
    getDuplicateBookmarkCount: (message, sender, sendResponse) => {
        getDuplicateBookmarks(false).then((result) =>
            sendResponse({
                success: true,
                count: result.count,
            }),
        );
        return true; // Indicates that the response will be asynchronous
    },
    removeDuplicateBookmarks: (message, sender, sendResponse) => {
        getDuplicateBookmarks(true).then((result) =>
            sendResponse({
                success: true,
                count: result.count,
                removedIds: result.removedIds,
            }),
        );
        return true; // The response is asynchronous
    },
    deleteAllBookmarks: (message, sender, sendResponse) => {
        handleDeleteAllBookmarks(message, sendResponse);
        return true; // Indicates that the response will be asynchronous
    },
    addImportedBookmarks: (message, sender, sendResponse) => {
        handleAddImportedBookmarks(message, sendResponse);
        return true; // Indicates that the response will be asynchronous
    },
    overwriteBookmarks: (message, sender, sendResponse) => {
        handleOverwriteBookmarks(message, sendResponse);
        return true; // Indicates that the response will be asynchronous
    },
    forceClearBookmarkCache: (message, sender, sendResponse) => {
        clearBackgroundBookmarkCache(false); // UI already knows, don't notify back
        sendResponse({
            success: true,
        });
        return true;
    },
    checkUrlStatus: (message, sender, sendResponse) => {
        checkUrlStatus(message.url).then((status) => {
            sendResponse({
                status,
            });
        });
        return true; // Asynchronous
    },
    getOldBookmarks: (message, sender, sendResponse) => {
        handleGetOldBookmarks(sendResponse);
        return true; // Asynchronous
    },
    getHistory: (message, sender, sendResponse) => {
        handleGetHistory(message, sendResponse);
        return true;
    },
    getRecentlyClosed: (message, sender, sendResponse) => {
        handleGetRecentlyClosed(message, sendResponse);
        return true;
    },
    getReadingList: (message, sender, sendResponse) => {
        handleGetReadingList(sendResponse);
        return true;
    },
    deleteHistoryUrls: (message, sender, sendResponse) => {
        handleDeleteHistoryUrls(message, sendResponse);
        return true; // Asynchronous
    },

    // --- Pomodoro Handlers ---
    pomodoroGetState: (message, sender, sendResponse) => {
        handlePomodoroGetState(sendResponse);
        return true;
    },
    pomodoroStart: (message, sender, sendResponse) => {
        handlePomodoroStart(sendResponse);
        return true;
    },
    pomodoroPause: (message, sender, sendResponse) => {
        handlePomodoroPause(sendResponse);
        return true;
    },
    pomodoroReset: (message, sender, sendResponse) => {
        handlePomodoroReset(sendResponse);
        return true;
    },
    pomodoroSkip: (message, sender, sendResponse) => {
        handlePomodoroSkip(sendResponse);
        return true;
    },
    pomodoroSetMode: (message, sender, sendResponse) => {
        handlePomodoroSetMode(message, sendResponse);
        return true;
    },
    pomodoroSaveSettings: (message, sender, sendResponse) => {
        handlePomodoroSaveSettings(message, sendResponse);
        return true;
    },
    pomodoroClearStats: (message, sender, sendResponse) => {
        handlePomodoroClearStats(sendResponse);
        return true;
    },
    addLinkPreviewBlacklist: (message, sender, sendResponse) => {
        addLinkPreviewBlacklistDomain(message.domain).then(() =>
            sendResponse({
                success: true,
            }),
        );
        return true;
    },
    removeLinkPreviewBlacklist: (message, sender, sendResponse) => {
        removeLinkPreviewBlacklistDomain(message.domain).then(() =>
            sendResponse({
                success: true,
            }),
        );
        return true;
    },
    editLinkPreviewBlacklist: (message, sender, sendResponse) => {
        editLinkPreviewBlacklistDomain(message.oldDomain, message.newDomain).then(() =>
            sendResponse({
                success: true,
            }),
        );
        return true;
    },
    setLinkPreviewTriggerKey: (message, sender, sendResponse) => {
        handleSetLinkPreviewTriggerKey(message.triggerKey, sendResponse);
        return true;
    },
    // Only the worker may create the offscreen document, so the player asks for it
    // here before sending it anything.
    musicEnsureOffscreen: (message, sender, sendResponse) => {
        ensureOffscreenDocument('Play the music folder the player was given')
            .then((created) => sendResponse({ success: true, created }))
            .catch((error) => sendResponse({ success: false, error: String(error) }));
        return true;
    },
    // The offscreen player cannot reach storage, so what it reports is filed here.
    // A page opened later reads this and shows what is playing straight away.
    musicState: (message) => {
        chrome.storage.session.set({ musicPlayerState: message.state }).catch(() => {});
        return false;
    },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = MESSAGE_HANDLERS[message.action];
    if (handler) {
        // The channel is only held open when the handler asks for it by returning true.
        // It used to be held open for anything that did not return false — including the
        // handlers that answer nothing — and the sender was left waiting for a reply
        // that never came: "a listener indicated an asynchronous response ... but the
        // message channel closed before a response was received".
        return handler(message, sender, sendResponse) === true;
    }
    // Actions broadcast to every page so the UI can keep in step. The worker is not
    // meant to answer them — the list was here from the start but nothing read it, so
    // each one still printed "not handled" and the console filled with warnings about
    // messages that were never addressed to the worker.
    const ignoredBroadcastActions = [
        'geminiConversationUpdated',
        'geminiQueryCompleted',
        'bookmarksChanged',
        'rulesUpdated',
        'refreshUI',
        'pageModeChanged',
        'snippetsUpdated',
        'noteUpdatedFromOmnibar',
        'pomodoroPlaySound',
        'toggleAllExpand',
        'linkPreviewStatusChanged',
        'linkPreviewBlacklistUpdated',
        'linkPreviewTriggerKeyUpdated',
    ];
    if (!ignoredBroadcastActions.includes(message.action)) {
        console.warn(`[onMessage] Action "${message.action}" not handled.`);
    }
    return false;
});

function handleAddUrlToRule(message, sendResponse) {
    const { url, ruleName } = message.payload;
    addUrlToRuleAndNotify(url, ruleName)
        .then(() => {
            sendResponse({
                success: true,
            });
        })
        .catch((error) => {
            console.error('Error in addUrlToRuleAndNotify:', error);
            sendResponse({
                success: false,
                error: {
                    messageKey: 'errorSavingRule',
                },
            });
        });
}
function handleSchedulesUpdated(message, sendResponse) {
    logMessage('Schedules updated. Checking immediately.');
    checkSchedules();
    sendResponse({
        status: 'received',
    });
}
function handleGeminiSchedulesUpdated(message, sendResponse) {
    logMessage('Gemini schedules updated. Checking immediately.');
    checkGeminiSchedules();
    sendResponse({
        status: 'received',
    });
}

function handleTogglePrefixes(message, sendResponse) {
    (async () => {
        try {
            await togglePrefixesCommand(message.enabled);
            sendResponse({
                status: 'done_toggle_prefixes_visual_update',
            });
        } catch (e) {
            console.error('Error processing togglePrefixes in background.', e);
            sendResponse({
                status: 'error_processing_togglePrefixes',
                error: e.message,
            });
        }
    })();
}
function trySendResponse(response, sendResponseCallback) {
    try {
        if (sendResponseCallback && typeof sendResponseCallback === 'function') {
            sendResponseCallback(response);
        }
    } catch (e) {
        console.warn('Error sending response (port might have closed):', e.message);
    }
}
