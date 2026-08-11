function handleCreateNewTab() {
    chrome.tabs.create({});
}

async function handleMuteAllTabs() {
    const allTabs = await chrome.tabs.query({});
    const audibleUnmuted = allTabs.filter((t) => t.audible && !(t.mutedInfo && t.mutedInfo.muted));

    if (audibleUnmuted.length > 0) {
        // Mute all audible tabs
        const audibleTabs = allTabs.filter((t) => t.audible);
        for (const t of audibleTabs) {
            await chrome.tabs.update(t.id, { muted: true });
        }
    } else {
        // Unmute all explicitly muted tabs
        const explicitlyMuted = allTabs.filter((t) => t.mutedInfo && t.mutedInfo.muted);
        for (const t of explicitlyMuted) {
            await chrome.tabs.update(t.id, { muted: false });
        }
    }
}

async function handleToggleMuteCurrentTab(sender) {
    if (sender.tab && sender.tab.id) {
        const tabId = sender.tab.id;
        try {
            const tab = await chrome.tabs.get(tabId);
            const isMuted = tab.mutedInfo && tab.mutedInfo.muted;
            await chrome.tabs.update(tabId, { muted: !isMuted });
        } catch (e) {
            console.error('[Background] Error toggling mute for current tab:', e);
        }
    }
}

/**
 * Handles request to close current tab.
 * @param {chrome.runtime.MessageSender} sender - Message sender info.
 */
function handleCloseCurrentTab(sender) {
    // Ensure message comes from a tab with an ID
    if (sender.tab && sender.tab.id) {
        chrome.tabs.remove(sender.tab.id);
    }
}

/**
 * Generic tab switch handler.
 * @param {number} direction - 1 for next, -1 for previous.
 * @param {chrome.runtime.MessageSender} sender - Message sender info.
 */
function handleSwitchTab(direction, sender) {
    if (!sender.tab) return;
    switchTab(direction, sender.tab);
}

/**
 * Adjacent tab switch logic.
 * @param {number} direction - 1 for next, -1 for previous.
 * @param {chrome.tabs.Tab} currentTab - Originating tab.
 */
function switchTab(direction, currentTab) {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        // If only one tab, do nothing.
        if (tabs.length <= 1) return;

        // Find current tab index in the tabs array.
        const currentIndex = tabs.findIndex((tab) => tab.id === currentTab.id);
        if (currentIndex === -1) return; // Tab not found, something weird happened.

        let newIndex = currentIndex + direction;

        // Logic for circular tab selection:
        // If at last tab and next is requested, go to first.
        if (newIndex >= tabs.length) {
            newIndex = 0;
        }
        // If at first tab and previous is requested, go to last.
        else if (newIndex < 0) {
            newIndex = tabs.length - 1;
        }

        // Activate the new tab.
        chrome.tabs.update(tabs[newIndex].id, { active: true });
    });
}

/**
 * Handles switching to previously active tab.
 */
function handleSwapToPreviousTab(sendResponse) {
    if (previousActiveTabId !== null) {
        chrome.tabs.get(previousActiveTabId, (tab) => {
            if (chrome.runtime.lastError || !tab) {
                console.warn(`[Tab Swap] The previous tab (ID: ${previousActiveTabId}) no longer exists.`);
                sendResponse({
                    success: false,
                    error: 'Previous tab not found.',
                });
            } else {
                chrome.windows.update(
                    tab.windowId,
                    {
                        focused: true,
                    },
                    () => {
                        chrome.tabs.update(previousActiveTabId, {
                            active: true,
                        });
                        sendResponse({
                            success: true,
                        });
                    },
                );
            }
        });
    } else {
        logMessage('[Tab Swap] No previous tab in history.');
        sendResponse({
            success: false,
            error: 'No previous tab in history.',
        });
    }
}

/**
 * Gets all open tabs.
 */
async function handleGetOpenTabs(sendResponse) {
    try {
        const allWindows = await chrome.windows.getAll({
            populate: true,
        });
        const validWindows = allWindows.filter((win) => win.type === 'normal' && !win.alwaysOnTop);
        const tabs = validWindows.flatMap((win) => win.tabs || []);
        sendResponse({
            success: true,
            tabs: tabs,
        });

        // Pre-warm / wake up discarded YouTube tabs in the background
        for (const tab of tabs) {
            if (tab.discarded && tab.url && (tab.url.includes('youtube.com') || tab.url.includes('youtu.be'))) {
                try {
                    chrome.tabs.reload(tab.id);
                } catch (e) {
                    console.warn('Failed to pre-warm discarded tab:', e);
                }
            }
        }
    } catch (error) {
        sendResponse({
            success: false,
            error: error.message,
        });
    }
}

/**
 * Switches to a specific tab, focusing its window first.
 */
async function handleSwitchToTab(message, sendResponse) {
    try {
        await chrome.windows.update(message.windowId, {
            focused: true,
        });
        await chrome.tabs.update(message.tabId, {
            active: true,
        });
        sendResponse({
            success: true,
        });
    } catch (error) {
        sendResponse({
            success: false,
            error: error.message,
        });
    }
}

async function handleDeactivateAllPageModes(sendResponse) {
    // 1. Set global state to 'null' (disabled) for future tabs.
    await chrome.storage.local.set({
        [GLOBAL_MODE_KEY]: null,
    });

    // 2. Clear the map that stores tab mode overrides.
    //    This is the key line that fixes the problem.
    tabModes.clear();

    // 3. Get ALL tabs in ALL windows.
    const allTabs = await chrome.tabs.query({});

    // 4. Create an array of promises to remove styles from all valid tabs in parallel.
    const removalPromises = allTabs
        .filter((tab) => tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file')))
        .map((tab) => applyPageMode(tab.id, null)); // `null` tells applyPageMode to remove styles.

    // 5. Wait for all style removal operations to finish.
    await Promise.all(removalPromises);
    chrome.runtime.sendMessage({
        action: 'pageModeChanged',
    });
    // 6. Send a confirmation response.
    if (sendResponse)
        sendResponse({
            success: true,
            mode: null,
        });
    logMessage('[Page Mode] All page modes have been deactivated globally.');
}

function handleRemoveDuplicateTabs(sendResponse) {
    (async () => {
        try {
            await removeDuplicateTabsCommand();
            sendResponse({
                status: 'done',
            });
        } catch (error) {
            console.error(`[onMessage] Error during removeDuplicateTabs:`, error);
            sendResponse({
                status: 'error',
                error: error.message,
            });
        }
    })();
}

function handleFetchPageContent(message, sendResponse) {
    (async () => {
        try {
            const response = await fetch(message.url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const content = await response.text();
            sendResponse({
                success: true,
                content,
            });
        } catch (error) {
            console.error(`[background.js] Error fetching page content for ${message.url}:`, error);
            sendResponse({
                success: false,
                error: error.message,
            });
        }
    })();
}

function handleGetActiveTab(message, sendResponse) {
    (async () => {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            if (tab) {
                sendResponse({
                    url: tab.url,
                    title: tab.title,
                    id: tab.id,
                });
            } else {
                sendResponse(null);
            }
        } catch (e) {
            sendResponse(null);
        }
    })();
}

function handleOpenMultipleUrls(message, sendResponse) {
    if (Array.isArray(message.urls)) {
        message.urls.forEach((url) => {
            chrome.tabs.create({
                url,
                active: false,
            });
        });
    }
    sendResponse({
        success: true,
    });
}

function handleOpenFileUrl(message, sendResponse) {
    const { url, active } = message;
    chrome.tabs.create(
        {
            url: url,
            active: active,
        },
        (tab) => {
            if (chrome.runtime.lastError) {
                console.error('[onMessage] Error opening file:// URL.', chrome.runtime.lastError.message);
                trySendResponse(
                    {
                        error: chrome.runtime.lastError.message,
                    },
                    sendResponse,
                );
            } else {
                trySendResponse(
                    {
                        status: 'done',
                        tabId: tab.id,
                    },
                    sendResponse,
                );
            }
        },
    );
}
