/**
 * Searches browsing history.
 */
async function handleGetHistory(message, sendResponse) {
    try {
        const query = message.query || '';

        // Base configuration
        const searchOptions = {
            text: query,
            maxResults: 1000,
        };

        // If UI sends dates, use them strictly
        if (message.startTime !== undefined && message.endTime !== undefined && message.startTime !== null) {
            searchOptions.startTime = message.startTime;
            searchOptions.endTime = message.endTime;
        } else {
            // Search all history by default
            searchOptions.startTime = 0;
        }

        const historyItems = await chrome.history.search(searchOptions);
        sendResponse({ success: true, results: historyItems });
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

/**
 * Gets recently closed tabs.
 */
async function handleGetRecentlyClosed(message, sendResponse) {
    try {
        const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });

        // Map to include lastModified from Session object, not just tab data
        const results = sessions
            .map((session) => {
                const entry = session.tab || session.window;
                if (!entry) return null;

                return {
                    ...entry, // Tab or window data (title, url, favicon...)
                    lastModified: session.lastModified, // Actual closure date
                    sessionId: entry.sessionId,
                    type: session.tab ? 'tab' : 'window',
                };
            })
            .filter((item) => item !== null); // Filter nulls just in case

        // Filter by search if query exists
        const matchingResults = message.query
            ? results.filter((item) => {
                  // Folded on both sides: history titles are where accents live, and
                  // `dia` has to find `día`. See `foldForSearch` in utils.js.
                  const needle = foldForSearch(message.query);
                  return (
                      foldForSearch(item.title || '').includes(needle) || foldForSearch(item.url || '').includes(needle)
                  );
              })
            : results;

        sendResponse({ success: true, results: matchingResults });
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

/**
 * Normalizes URL for intelligent matching.
 */
function normalizeUrlForMatch(urlString) {
    if (!urlString || typeof urlString !== 'string') return null;
    let raw = urlString.trim();
    if (!raw) return null;
    if (!/^[a-zA-Z]+:\/\//.test(raw)) {
        raw = 'https://' + raw;
    }
    try {
        const parsed = new URL(raw);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
        return {
            raw,
            protocol: parsed.protocol,
            host,
            pathname,
            search: parsed.search,
            hash: parsed.hash,
            isDomainOnly: pathname === '/' && !parsed.search && !parsed.hash,
        };
    } catch {
        return null;
    }
}

/**
 * Checks if a tab URL matches the target URL.
 */
function isTabMatchingUrl(tabUrl, targetNorm) {
    if (!tabUrl || !targetNorm) return false;
    const tabNorm = normalizeUrlForMatch(tabUrl);
    if (!tabNorm) return false;

    // Both hostnames must match (e.g. youtube.com === youtube.com)
    if (tabNorm.host !== targetNorm.host) return false;

    // If target URL is domain-only (e.g. "youtube.com" or "https://youtube.com/"), match any tab on that domain
    if (targetNorm.isDomainOnly) {
        return true;
    }

    // If target URL has a specific path (e.g. "/r/javascript"), tab path must match or start with it
    if (tabNorm.pathname === targetNorm.pathname) {
        if (targetNorm.search) {
            return tabNorm.search === targetNorm.search;
        }
        return true;
    }

    if (
        tabNorm.pathname.startsWith(targetNorm.pathname.endsWith('/') ? targetNorm.pathname : targetNorm.pathname + '/')
    ) {
        return true;
    }

    return false;
}

/**
 * Opens a URL intelligently:
 * If the web is already open in a tab, switches to the first matching tab.
 * Otherwise, opens the URL in a new tab.
 */
async function handleOpenUrl(message, sender = null) {
    const rawUrl = message?.url;
    if (!rawUrl || typeof rawUrl !== 'string') return;

    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) return;

    const fullUrl = /^[a-zA-Z]+:\/\//.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;

    try {
        const tabs = await chrome.tabs.query({});
        const targetNorm = normalizeUrlForMatch(trimmedUrl);

        if (targetNorm && tabs && tabs.length > 0) {
            const currentWindowId = sender?.tab?.windowId;

            // Separate matching tabs into current window vs other windows
            const currentWindowMatches = [];
            const otherWindowMatches = [];

            for (const tab of tabs) {
                if (isTabMatchingUrl(tab.url, targetNorm) || isTabMatchingUrl(tab.pendingUrl, targetNorm)) {
                    if (currentWindowId !== undefined && tab.windowId === currentWindowId) {
                        currentWindowMatches.push(tab);
                    } else {
                        otherWindowMatches.push(tab);
                    }
                }
            }

            // Sort each list by tab.index ascending to get the first one
            currentWindowMatches.sort((a, b) => a.index - b.index);
            otherWindowMatches.sort((a, b) =>
                a.windowId !== b.windowId ? a.windowId - b.windowId : a.index - b.index,
            );

            const bestTab = currentWindowMatches[0] || otherWindowMatches[0];

            if (bestTab) {
                await chrome.tabs.update(bestTab.id, { active: true });
                if (bestTab.windowId) {
                    try {
                        await chrome.windows.update(bestTab.windowId, { focused: true });
                    } catch {}
                }
                return;
            }
        }

        // If no matching tab was found, open in a new tab
        await chrome.tabs.create({ url: fullUrl, active: true });
    } catch (e) {
        console.error('[handleOpenUrl] Error opening URL:', e);
        try {
            chrome.tabs.create({ url: fullUrl, active: true });
        } catch {}
    }
}

/**
 * Duplicates sender's tab.
 */
function handleDuplicateTab(sender) {
    if (sender.tab && sender.tab.url && !sender.tab.url.startsWith('chrome://')) {
        chrome.tabs.create({ url: sender.tab.url, active: true });
    }
}

/**
 * Applies a viewing mode (dark, sepia, etc.) to a tab or all.
 */
async function handleSetPageMode(message, sender, sendResponse) {
    const { mode, scope, tabId: targetTabId } = message;
    const tabId = targetTabId || sender.tab.id;
    let customColors = null;

    if (!tabId) {
        console.error('[Page Mode] No target tab ID found in message or sender.');
        sendResponse({ success: false, error: 'No target tab ID.' });
        return;
    }

    // Special handling for new 'custom' mode.
    if (mode === 'custom') {
        const { activeTheme } = await chrome.storage.local.get('activeTheme');
        if (activeTheme && activeTheme.colors) {
            customColors = activeTheme.colors;
        } else {
            console.warn('Custom theme mode requested, but no active theme with colors was found.');
            sendResponse({ success: false, error: 'No active custom theme found.' });
            return;
        }
    }

    if (scope === 'global') {
        const { [GLOBAL_MODE_KEY]: currentGlobalMode } = await chrome.storage.local.get(GLOBAL_MODE_KEY);
        // If new mode is the same as current global mode, we're deactivating it.
        const newGlobalMode = currentGlobalMode === mode ? null : mode;

        await chrome.storage.local.set({ [GLOBAL_MODE_KEY]: newGlobalMode });

        // Clear all tab-specific overrides when setting a new global mode.
        tabModes.clear();
        await saveTabModes();

        const allTabs = await chrome.tabs.query({});
        const updatePromises = allTabs
            .filter((t) => t.url && (t.url.startsWith('http') || t.url.startsWith('file')))
            .map((t) => {
                // If new mode is 'custom', we need to pass the colors object.
                // If deactivating the mode (newGlobalMode is null), customColors should also be null.
                const colorsForApply = newGlobalMode === 'custom' ? customColors : null;
                return applyPageMode(t.id, newGlobalMode, colorsForApply);
            });

        await Promise.all(updatePromises);
        logMessage(`[Page Mode] Global mode '${newGlobalMode || 'none'}' applied to ${updatePromises.length} tabs.`);
    } else {
        // Tab-specific scope
        const { [GLOBAL_MODE_KEY]: globalMode } = await chrome.storage.local.get(GLOBAL_MODE_KEY);
        // Determines current effective mode for this tab before change.
        const effectiveCurrentMode = tabModes.has(tabId) ? tabModes.get(tabId) : globalMode;
        // If new mode is same as currently active, deactivate it.
        const newTabMode = effectiveCurrentMode === mode ? null : mode;

        if (newTabMode === null) {
            tabModes.delete(tabId); // Reverts to global mode.
        } else {
            tabModes.set(tabId, newTabMode); // Sets a tab-specific override.
        }

        await saveTabModes();

        // If new mode is 'custom', pass the colors.
        // If deactivated, newTabMode is null, so pass null for colors.
        const colorsForApply = newTabMode === 'custom' ? customColors : null;
        await applyPageMode(tabId, newTabMode, colorsForApply);

        if (newTabMode === null) {
            logMessage(`[Page Mode]Mode deactivated for tab ${tabId}.`);
        } else {
            logMessage(`[Page Mode] Tab ${tabId} overridden to mode '${newTabMode}'.`);
        }
    }

    chrome.runtime.sendMessage({ action: 'pageModeChanged' });
    sendResponse({ success: true, mode: mode, scope: scope });
}

/**
 * Notifies all tabs about a hint status change.
 */
function handleHintStatusChanged(message) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
            chrome.tabs
                .sendMessage(tab.id, {
                    action: 'updateHintStatus',
                    enabled: message.enabled,
                })
                .catch(() => {
                    /* Ignore error: content script might not be in this tab */
                });
        });
    });
}

/**
 * Notifies all tabs that hint commands have been updated.
 */
function handleHintCommandsUpdated() {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, { action: 'hintCommandsUpdated' }).catch(() => {
                /* Ignore error: content script might not be in this tab */
            });
        });
    });
}

/**
 * Notifies all tabs that the active theme has changed.
 */
function handleThemeChanged() {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, { action: 'themeChanged' }).catch(() => {
                /* Ignore error: content script might not be in this tab */
            });
        });
    });
}

async function printHtmlAsPdf(message, sendResponse) {
    (async () => {
        const { htmlContent, title } = message;
        if (!htmlContent) {
            sendResponse({ success: false, error: 'No HTML content received.' });
            return;
        }

        try {
            const printPageUrl = chrome.runtime.getURL('src/utils/print.html');
            const printTab = await chrome.tabs.create({
                url: printPageUrl,
                active: true,
            });

            const onTabUpdated = (tabId, changeInfo) => {
                if (tabId === printTab.id && changeInfo.status === 'complete') {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'injectContentForPrinting',
                        htmlContent: htmlContent,
                        title: title,
                    });

                    chrome.tabs.onUpdated.removeListener(onTabUpdated);
                }
            };

            const onPrintingComplete = (message, sender) => {
                if (message.action === 'printingComplete' && sender.tab.id === printTab.id) {
                    chrome.tabs
                        .remove(printTab.id)
                        .catch((e) => console.warn(`Failed to close temporary print tab: ${e.message} `));
                    chrome.runtime.onMessage.removeListener(onPrintingComplete);
                }
            };

            chrome.tabs.onUpdated.addListener(onTabUpdated);
            chrome.runtime.onMessage.addListener(onPrintingComplete);

            sendResponse({ success: true });
        } catch (error) {
            console.error('Error creating print tab:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
}

async function handleGetPageModes(message, sendResponse) {
    try {
        const sessionData = await chrome.storage.session.get('tabModes');
        const localData = await chrome.storage.local.get('globalPageMode');

        sendResponse({
            success: true,
            tabModes: sessionData.tabModes || {},
            globalMode: localData.globalPageMode || null,
        });
    } catch (error) {
        console.error('Error getting page modes:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Cancels (deactivates) active page mode when user presses ESC.
 *
 * Scope logic:
 *  - If tab has its own override -> only cancel that tab
 *    (global mode, if exists, remains on other tabs).
 *  - If mode comes from global mode -> cancel global mode
 *    and remove it from ALL open tabs,
 *    same as pressing the global button a second time.
 */
async function handleCancelTabPageMode(sender, sendResponse) {
    try {
        const tabId = sender.tab?.id;
        if (!tabId) {
            sendResponse({ success: false, cancelled: false });
            return;
        }

        const { [GLOBAL_MODE_KEY]: globalMode } = await chrome.storage.local.get(GLOBAL_MODE_KEY);
        const hasTabOverride = tabModes.has(tabId);
        const effectiveMode = hasTabOverride ? tabModes.get(tabId) : globalMode;

        if (!effectiveMode) {
            // No active mode on this tab
            sendResponse({ success: true, cancelled: false });
            return;
        }

        if (hasTabOverride) {
            // -- Case 1: tab override --
            // Only cancel this tab; global mode is untouched.
            tabModes.delete(tabId);
            await saveTabModes();
            await applyPageMode(tabId, null, null);
            logMessage(`[Page Mode] ESC: Tab override '${effectiveMode}' cancelled for tab ${tabId}.`);
        } else {
            // -- Case 2: active global mode --
            // Clear global mode and remove from ALL tabs.
            await chrome.storage.local.set({ [GLOBAL_MODE_KEY]: null });
            tabModes.clear();
            await saveTabModes();

            const allTabs = await chrome.tabs.query({});
            const updatePromises = allTabs
                .filter((t) => t.url && (t.url.startsWith('http') || t.url.startsWith('file')))
                .map((t) => applyPageMode(t.id, null, null));

            await Promise.all(updatePromises);
            logMessage(`[Page Mode] ESC: Global mode '${globalMode}' cancelled across ${updatePromises.length} tabs.`);
        }

        chrome.runtime.sendMessage({ action: 'pageModeChanged' });
        sendResponse({ success: true, cancelled: true, mode: effectiveMode });
    } catch (error) {
        console.error('Error cancelling page mode:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function checkUrlStatus(url) {
    try {
        const controller = new AbortController();
        // Increase timeout to 5 seconds for slow connections
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // Try with HEAD first (faster, downloads less data)
        let response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-cache',
            credentials: 'omit', // Helps avoid CORS/cookie issues in some cases
        });

        clearTimeout(timeoutId);

        // Some servers block HEAD (405 Method Not Allowed) or give 403 Forbidden.
        // In those cases, try a normal GET request to be sure.
        if (response.status === 405 || response.status === 403) {
            const controllerGet = new AbortController();
            const timeoutIdGet = setTimeout(() => controllerGet.abort(), 5000);

            response = await fetch(url, {
                method: 'GET',
                signal: controllerGet.signal,
                cache: 'no-cache',
                credentials: 'omit',
            });
            clearTimeout(timeoutIdGet);
        }

        // IMPORTANT: Return the status code number (e.g., 200, 404, 500)
        // Do not return text strings like "broken" or "ok".
        return response.status;
    } catch (error) {
        if (error.name === 'AbortError') {
            return 'timeout';
        }
        // TypeError usually occurs due to DNS errors, server down, or strict CORS blocking
        console.warn(`Error checking ${url}: `, error);
        return 'error';
    }
}

function handleRegroupAllTabs(sendResponse) {
    (async () => {
        try {
            await regroupAllTabsCommand();
            sendResponse({ success: true });
        } catch (e) {
            console.error('Error regrouping tabs:', e);
            sendResponse({ success: false, error: e.message });
        }
    })();
}

async function handleGetReadingList(sendResponse) {
    try {
        if (chrome.readingList) {
            const items = await chrome.readingList.query({});
            sendResponse({ success: true, items: items });
        } else {
            sendResponse({ success: false, error: 'Reading List API not available' });
        }
    } catch (error) {
        console.error('Error getting reading list:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleDeleteHistoryUrls(message, sendResponse) {
    try {
        const urls = message.urls;
        if (!urls || !Array.isArray(urls)) {
            throw new Error('Invalid URLs provided');
        }
        const deletePromises = urls.map((url) => chrome.history.deleteUrl({ url: url }));
        await Promise.all(deletePromises);
        sendResponse({ success: true });
    } catch (error) {
        console.error('Error deleting history URLs:', error);
        sendResponse({ success: false, error: error.message });
    }
}
