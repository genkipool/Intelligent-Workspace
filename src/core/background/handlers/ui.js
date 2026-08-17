/**
 * [AI INSTRUCTION]
 * UI HANDLER — UI-related features (Side Panel, Fullscreen, Split Screen)
 */

function handleOpenSidePanelThemes(sendResponse) {
    (() => {
        try {
            const themesPath = `src/ui/pages/savedThemes/savedThemes.html?t=${Date.now()}`;
            chrome.tabs.query(
                {
                    active: true,
                    currentWindow: true,
                },
                ([tab]) => {
                    chrome.sidePanel.setOptions({
                        path: themesPath,
                        enabled: true,
                    });
                    chrome.sidePanel.open({
                        windowId: tab.windowId,
                    });
                    isSidePanelActive = true;
                    sendResponse({
                        status: 'ok',
                    });
                },
            );
            activeSidePanelPath = 'src/ui/pages/savedThemes/savedThemes.html';
        } catch (e) {
            console.error('Failed to open side panel from background:', e);
            sendResponse({
                status: 'error',
                message: e.message,
            });
        }
    })();
}

function handleSidePanelPathUpdated(message) {
    activeSidePanelPath = message.path;
    chrome.storage.session.set({
        activeSidePanelPath: message.path,
    });
    logMessage(`Active side panel path updated to: ${activeSidePanelPath}`);
}

function handleFullscreenChanged(message, sender, sendResponse) {
    const windowId = sender?.tab?.windowId;
    if (!windowId) {
        if (sendResponse) {
            sendResponse({ status: 'error', message: 'No windowId found' });
        }
        return;
    }

    if (message.isFullscreen) {
        // Use getContexts to check if the side panel is ACTUALLY open right now.
        // This is the only reliable way because activeSidePanelPath can be stale
        // after a service worker restart (the port disconnect that would have
        // cleared it ran in the old worker and never fired in this one).
        const detectAndClose = (isSidePanelReallyOpen, detectedPath) => {
            logMessage(
                `[Fullscreen] Entered fullscreen in window ${windowId}. Panel actually open: ${isSidePanelReallyOpen}, path: ${detectedPath}`,
            );

            if (isSidePanelReallyOpen) {
                lastSidePanelPathBeforeFullscreen = detectedPath || 'src/ui/pages/rules/rules.html';
                chrome.sidePanel.setOptions({ enabled: false });
                activeSidePanelPath = null;
                chrome.storage.session.set({ activeSidePanelPath: null });
                logMessage(
                    `[Fullscreen] Panel CLOSED for fullscreen. Saved path: ${lastSidePanelPathBeforeFullscreen}`,
                );
            } else {
                lastSidePanelPathBeforeFullscreen = null;
                activeSidePanelPath = null;
                chrome.storage.session.set({ activeSidePanelPath: null });
                logMessage('[Fullscreen] Panel was NOT open. Nothing to do.');
            }

            if (sendResponse) {
                sendResponse({ status: 'ok' });
            }
        };

        if (typeof chrome.runtime.getContexts === 'function') {
            chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }).then(
                (contexts) => {
                    const isSidePanelReallyOpen = !!(contexts && contexts.length > 0);
                    let detectedPath = activeSidePanelPath;

                    // Extract path from the live context if available
                    if (isSidePanelReallyOpen && contexts[0].documentUrl) {
                        try {
                            const u = new URL(contexts[0].documentUrl);
                            const p = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
                            if (p) detectedPath = p;
                        } catch {
                            /* keep activeSidePanelPath as fallback */
                        }
                    }

                    detectAndClose(isSidePanelReallyOpen, detectedPath);
                },
                () => {
                    // getContexts failed — fall back to activeSidePanelPath
                    detectAndClose(!!activeSidePanelPath, activeSidePanelPath);
                },
            );
        } else {
            // getContexts not available — fall back to activeSidePanelPath
            detectAndClose(!!activeSidePanelPath, activeSidePanelPath);
        }
    } else {
        // Exiting fullscreen
        logMessage(
            `[Fullscreen] Exit fullscreen in window ${windowId}. Restore path: ${lastSidePanelPathBeforeFullscreen}`,
        );

        if (lastSidePanelPathBeforeFullscreen) {
            const pathToRestore = lastSidePanelPathBeforeFullscreen;
            lastSidePanelPathBeforeFullscreen = null;

            chrome.sidePanel.setOptions({ path: pathToRestore, enabled: true });
            chrome.sidePanel.open({ windowId: windowId });

            activeSidePanelPath = pathToRestore.split('?')[0];
            chrome.storage.session.set({ activeSidePanelPath: activeSidePanelPath });
            logMessage(`[Fullscreen] Panel restored to: ${pathToRestore}`);
        } else {
            logMessage('[Fullscreen] No panel to restore.');
        }

        if (sendResponse) {
            sendResponse({ status: 'ok' });
        }
    }
}

function handleToggleSplitScreen(message, sendResponse) {
    (async () => {
        try {
            logMessage(`[Split Screen LOG] Received toggleSplitScreen action.`);
            const { tabId, url } = message;
            const data = await chrome.storage.session.get(SPLIT_SCREEN_STATE_KEY);
            let state = data[SPLIT_SCREEN_STATE_KEY] || {
                isActive: false,
                originalWindowId: null,
                originalWindowState: null,
                splitWindowId: null,
                splitGroupId: null,
                splitTabs: {},
            };
            if (state.isActive) {
                try {
                    if (state.originalWindowId) await chrome.windows.get(state.originalWindowId);
                    if (state.splitWindowId) await chrome.windows.get(state.splitWindowId);
                } catch {
                    logMessage(`[Split Screen LOG] Resetting stale state.`);
                    state = {
                        isActive: false,
                        originalWindowId: null,
                        originalWindowState: null,
                        splitWindowId: null,
                        splitGroupId: null,
                        splitTabs: {},
                    };
                }
            }
            const isTabAlreadySplit = state.isActive && state.splitTabs[tabId];
            if (isTabAlreadySplit) {
                const tabsInSplitGroup = await chrome.tabs.query({
                    groupId: state.splitGroupId,
                });
                const tabToCloseId = state.splitTabs[tabId];
                if (tabsInSplitGroup.length === 1 && tabsInSplitGroup[0].id === tabToCloseId) {
                    await handleSplitScreenClosure(state);
                } else {
                    await chrome.tabs.remove(tabToCloseId);
                    delete state.splitTabs[tabId];
                    await chrome.storage.session.set({
                        [SPLIT_SCREEN_STATE_KEY]: state,
                    });
                }
            } else {
                logMessage(`[Split Screen LOG] Activating for tab ${tabId}. Marking as seen.`);
                tabsEverActive.add(tabId);
                await saveSessionState();
                if (!state.isActive) {
                    const [activeTab] = await chrome.tabs.query({
                        active: true,
                        currentWindow: true,
                    });
                    const windowDetails = await chrome.windows.get(activeTab.windowId);
                    logMessage(`[Split Screen LOG] Original window details:`, windowDetails);

                    // Get information of all screens
                    const displays = await chrome.system.display.getInfo();
                    logMessage(`[Split Screen LOG] Detected ${displays.length} display(s).`);
                    displays.forEach((d, i) => logMessage(`[Split Screen LOG] Display ${i} bounds:`, d.bounds));

                    // Find the screen where the active window is
                    let activeDisplay = displays.find((display) => {
                        return (
                            windowDetails.left >= display.bounds.left &&
                            windowDetails.left < display.bounds.left + display.bounds.width &&
                            windowDetails.top >= display.bounds.top &&
                            windowDetails.top < display.bounds.top + display.bounds.height
                        );
                    });
                    if (activeDisplay) {
                        logMessage(
                            `[Split Screen LOG] Active display found successfully. Bounds:`,
                            activeDisplay.bounds,
                        );
                    } else {
                        console.warn(
                            `[Split Screen LOG] Could not find active display. Falling back to primary display (displays[0]).`,
                        );
                        activeDisplay = displays[0];
                    }
                    const {
                        left: displayLeft,
                        top: displayTop,
                        width: displayWidth,
                        height: displayHeight,
                    } = activeDisplay.bounds;
                    const newWindowWidth = Math.floor(displayWidth * 0.45); // 40% for the new window
                    const originalWindowWidth = displayWidth - newWindowWidth; // 60% for the original window

                    const platformInfo = await chrome.runtime.getPlatformInfo();
                    let addsize = 0;
                    if (platformInfo.os === 'win' || platformInfo.os === 'mac') {
                        addsize = Math.round(displayWidth * 0.01);
                    } else if (platformInfo.os === 'linux') {
                        addsize = Math.round(displayWidth * 0.02);
                    } else {
                        // Default value for other systems (ChromeOS, etc.)
                        addsize = Math.round(displayWidth * 0.01);
                    }
                    logMessage(`[Split Screen LOG] OS: ${platformInfo.os}, Calculated addsize: ${addsize}`);
                    logMessage(
                        `[Split Screen LOG] Calculated values: newWidth=${newWindowWidth}, originalWidth=${originalWindowWidth}, displayLeft=${displayLeft}, displayTop=${displayTop}, displayHeight=${displayHeight}`,
                    );
                    state.originalWindowId = windowDetails.id;
                    state.originalWindowState = {
                        left: windowDetails.left,
                        top: windowDetails.top,
                        width: windowDetails.width,
                        height: windowDetails.height,
                        state: windowDetails.state,
                    };
                    if (windowDetails.state === 'maximized') {
                        await chrome.windows.update(windowDetails.id, {
                            state: 'normal',
                        });
                    }
                    const originalWindowUpdate = {
                        left: displayLeft + newWindowWidth,
                        top: displayTop,
                        width: originalWindowWidth,
                        height: displayHeight,
                    };
                    logMessage(`[Split Screen LOG] Updating original window with:`, originalWindowUpdate);
                    await chrome.windows.update(windowDetails.id, originalWindowUpdate);
                    const newWindowCreate = {
                        url: url,
                        left: displayLeft - addsize,
                        top: displayTop - addsize,
                        width: newWindowWidth + addsize,
                        height: displayHeight + addsize * 3,
                        type: 'normal',
                    };
                    logMessage(`[Split Screen LOG] Creating new window with:`, newWindowCreate);
                    const newWindow = await chrome.windows.create(newWindowCreate);
                    const newTab = newWindow.tabs[0];
                    const newGroupId = await chrome.tabs.group({
                        tabIds: [newTab.id],
                        createProperties: {
                            windowId: newWindow.id,
                        },
                    });
                    await chrome.tabGroups.update(newGroupId, {
                        title: 'Split',
                        color: 'green',
                    });
                    groupInfoMap.set(newGroupId, {
                        key: 'Split',
                        title: 'Split',
                        type: 'manual',
                        isCompact: false,
                    });
                    await saveGroupInfoMap();
                    state.isActive = true;
                    state.splitWindowId = newWindow.id;
                    state.splitGroupId = newGroupId;
                    state.splitTabs[tabId] = newTab.id;
                } else {
                    const newTab = await chrome.tabs.create({
                        windowId: state.splitWindowId,
                        url: url,
                        active: true,
                    });
                    await chrome.tabs.group({
                        groupId: state.splitGroupId,
                        tabIds: [newTab.id],
                    });
                    state.splitTabs[tabId] = newTab.id;
                    await chrome.windows.update(state.splitWindowId, {
                        focused: true,
                    });
                }
                logMessage(`[Split Screen LOG] Saving final state to session:`, state);
                await chrome.storage.session.set({
                    [SPLIT_SCREEN_STATE_KEY]: state,
                });
            }
            sendResponse({
                success: true,
                newState: state,
            });
        } catch (error) {
            console.error('[Split Screen ERROR] Error managing split screen:', error);
            sendResponse({
                success: false,
                error: error.message,
            });
        }
    })();
}

function handleCloseSplitScreen(message, sendResponse) {
    (async () => {
        const data = await chrome.storage.session.get(SPLIT_SCREEN_STATE_KEY);
        const splitState = data[SPLIT_SCREEN_STATE_KEY] || {};
        const splitInfo = splitState[message.originalTabId];

        // If there is no state information for this tab, there is nothing to do.
        if (!splitInfo) {
            sendResponse({
                success: false,
                error: 'No split screen state found for this tab.',
            });
            return;
        }
        try {
            // 1. Find the tab in the split screen group.
            const tabsInGroup = await chrome.tabs.query({
                groupId: splitInfo.newGroupId,
            });
            if (tabsInGroup.length > 0) {
                const tabIds = tabsInGroup.map((t) => t.id);
                // 2. Ungroup the tab.
                await chrome.tabs.ungroup(tabIds);
            }

            // 3. Close the window.
            await chrome.windows.remove(splitInfo.newWindowId);
        } catch (error) {
            // Ignore common errors if the user already closed the window or the group manually.
            if (
                !error.message.toLowerCase().includes('no window with id') &&
                !error.message.toLowerCase().includes('no group with id')
            ) {
                console.error('Error closing split screen:', error);
            }
        } finally {
            // 4. Clear the session state, regardless of whether there were errors.
            delete splitState[message.originalTabId];
            await chrome.storage.session.set({
                [SPLIT_SCREEN_STATE_KEY]: splitState,
            });
            sendResponse({
                success: true,
                newState: splitState,
            });
        }
    })();
}

function handleOpenPopupWindow(message, sendResponse) {
    chrome.windows.create({
        url: message.url,
        type: 'popup',
        width: message.width,
        height: message.height,
        left: message.left,
        top: message.top,
    });
    sendResponse({
        success: true,
    });
}

function handleToggleLinkPreview(message, sendResponse) {
    toggleLinkPreviewOption(message.enabled).then(() =>
        sendResponse({
            success: true,
        }),
    );
}

function handleToggleLinkPreviewFromKey(message, sendResponse) {
    toggleLinkPreviewOption().then(() => {
        chrome.storage.local.get(['linkPreviewEnabled'], (res) => {
            const enabled = res.linkPreviewEnabled !== false;
            const msgStr = enabled
                ? getI18nMsg('linkPreviewEnabledNotify', [], 'Vista previa de enlaces activada')
                : getI18nMsg('linkPreviewDisabledNotify', [], 'Vista previa de enlaces desactivada');
            chrome.notifications.create({
                type: 'basic',
                iconUrl: '/assets/icons/icon128.png',
                title: 'Intelligent Tab Group',
                message: msgStr,
            });
            sendResponse({
                success: true,
                enabled,
            });
        });
    });
}

/**
 * Flips one of the automatic picture-in-picture triggers from a keyboard command.
 *
 * The flag is the same one the button's hover menu and the navigation settings page
 * write, so wherever it is changed the other two follow.
 */
function handleToggleAutoPipFromKey(message, sendResponse) {
    const key = message.trigger === 'scroll' ? 'itgAutoPipOnScroll' : 'itgAutoPipOnHidden';
    chrome.storage.local.get([key], (res) => {
        const enabled = res[key] !== true;
        chrome.storage.local.set({ [key]: enabled }, () => {
            const scroll = message.trigger === 'scroll';
            const msgStr = enabled
                ? getI18nMsg(scroll ? 'autoPipOnScrollEnabledNotify' : 'autoPipOnHiddenEnabledNotify', [], 'On')
                : getI18nMsg(scroll ? 'autoPipOnScrollDisabledNotify' : 'autoPipOnHiddenDisabledNotify', [], 'Off');
            chrome.notifications.create({
                type: 'basic',
                iconUrl: '/assets/icons/icon128.png',
                title: 'Intelligent Tab Group',
                message: msgStr,
            });
            sendResponse({ success: true, enabled });
        });
    });
}

function handleShowOmnibarNotification(message, sender, sendResponse) {
    chrome.notifications.create(`omnibar - notify - ${Date.now()} `, {
        type: 'basic',
        iconUrl: '/assets/icons/icon128.png',
        title: message.title || 'Intelligent Workspace',
        message: message.message || '',
    });
}

function handleOpenSidePanel(message, sender, sendResponse) {
    const validPaths = {
        themes: 'src/ui/pages/savedThemes/savedThemes.html',
        listgroup: 'src/ui/pages/listGroup/listGroup.html',
        'listgroup-ia': 'src/ui/pages/listGroup/listGroup.html?view=gemini',
        rules: 'src/ui/pages/rules/rules.html',
        'customize-hint': 'src/ui/pages/customize_hints/customize_hints.html',
    };
    const targetPath = validPaths[message.type];
    if (targetPath) {
        openOrToggleSidePanel(targetPath, sendResponse);
    } else {
        sendResponse({
            success: false,
            error: 'Invalid side panel type',
        });
    }
}
