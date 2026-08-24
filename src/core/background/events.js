chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!tab) {
        return;
    }
    if (
        changeInfo.status === 'complete' &&
        tab.url &&
        (tab.url.startsWith('http') || tab.url.startsWith('file')) // Stricter condition
    ) {
        const { [GLOBAL_MODE_KEY]: globalMode } = await chrome.storage.local.get(GLOBAL_MODE_KEY);
        if (globalMode) {
            await applyPageMode(tabId, globalMode);
        }
    }
    if (shouldIgnoreEventDuringInitialization('tabs.onUpdated', tabId)) return;
    if (isGrouping) return;

    // Which group a tab belongs to is decided by its URL, so only these can change
    // it. A title or an audible change cannot: a page that updates its title (an
    // unread counter, a clock, a player) was regrouping every tab in the browser
    // every couple of seconds, one full pass per title change, for as long as the
    // page kept ticking. Measured with pages that retitle themselves: a single
    // click on the grouping switch chained 11 regroups; with static pages, 1.
    const affectsGrouping =
        changeInfo.url ||
        changeInfo.pinned !== undefined ||
        changeInfo.groupId !== undefined ||
        changeInfo.status === 'complete';

    // A title or sound change is deliberately ignored here. Routing it to the prefix
    // update instead was worse than useless: updateAllGroupPrefixes writes group
    // titles, those writes raise tabGroups.onUpdated, and that handler asks for
    // another prefix update — a loop that used to be held back only because the
    // regroup running alongside it set isGrouping and made the handler bail out.
    // The markers are refreshed by the next real event (a navigation, a group
    // change, a regroup), which is soon enough and cannot feed itself.
    if (affectsGrouping && tab.url && tab.title) {
        logMessage(`[tabs.onUpdated] Relevant change on tab ${tabId}. Triggering debounced regroup and prefix update.`);
        debounceGroupTabs();
        debounceUpdateAllGroupPrefixes(tab.windowId, {
            targetGroupId: null,
        });
        await syncWithExistingGroups();
    }
    if (changeInfo.audible !== undefined || changeInfo.mutedInfo !== undefined) {
        debounceSetupContextMenus();
    }
});
chrome.windows.onCreated.addListener(async (window) => {
    logMessage(`[onCreated] Window ${window.id} created. Initializing states.`);
    setTimeout(async () => {
        await rebuildGroupInfoMap();
        await syncWithExistingGroups();
    }, 500);
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await ensureSessionStateLoaded();

    // Noting that the tab has been seen comes before the initialization guard on
    // purpose. In MV3 the worker starts again on any event and re-runs the whole
    // initialization each time, so the very activation that woke it always fell
    // inside that window and was thrown away — and nothing ever replays it, so the
    // tab stayed missing from the seen/total counter next to the group name for the
    // rest of the session. Recording it is cheap and idempotent, unlike the grouping
    // work the guard is there to defer.
    if (tabsEverActive.has(activeInfo.tabId)) {
        logMessage(
            `[tabs.onActivated] Tab ${activeInfo.tabId} was already active. tabsEverActive size: ${tabsEverActive.size}.`,
        );
    } else {
        logMessage(
            `%c[tabs.onActivated] ADDING Tab ${activeInfo.tabId} to tabsEverActive. Old size: ${tabsEverActive.size}.`,
            'color: green; font-weight: bold;',
        );
        tabsEverActive.add(activeInfo.tabId);
        logMessage(`[tabs.onActivated] ADDED Tab ${activeInfo.tabId}. New size: ${tabsEverActive.size}.`);
        await saveSessionState();
    }

    if (shouldIgnoreEventDuringInitialization('tabs.onActivated', activeInfo.tabId)) return;
    logMessage(`[onActivated] Tab ${activeInfo.tabId} activated.`);
    if (activeInfo.tabId !== currentActiveTabId) {
        previousActiveTabId = currentActiveTabId;
        currentActiveTabId = activeInfo.tabId;
        logMessage(
            `[Tab Swap Tracker] History updated. Previous: ${previousActiveTabId}, Current: ${currentActiveTabId}`,
        );
    }
    getTypeGroup = false;
    let tab;
    try {
        tab = await chrome.tabs.get(activeInfo.tabId);
    } catch {
        logMessage(`[onActivated] Tab ${activeInfo.tabId} not found.`);
        return;
    }
    if (tab.groupId !== -1 && tab.groupId !== undefined) {
        const groupsInWindow = await chrome.tabGroups.query({
            windowId: tab.windowId,
        });
        const tabsInWindow = await chrome.tabs.query({
            windowId: tab.windowId,
        });
        debounceUpdateAllGroupPrefixes(tab.windowId, {
            targetGroupId: tab.groupId,
            isEdit: false,
            cachedGroups: groupsInWindow,
            cachedTabs: tabsInWindow,
        });
    }
    setTimeout(async () => {
        try {
            const currentTab = await chrome.tabs.get(activeInfo.tabId);
            if (currentTab.groupId !== -1 && currentTab.groupId !== undefined) {
                activeGroupId = currentTab.groupId;
                lastActivity[currentTab.groupId] = Date.now();
                const groupInfo = await chrome.tabGroups.get(currentTab.groupId);
                if (groupInfo.collapsed) {
                    logMessage(`[onActivated] Expanding group ${groupInfo.id} due to tab activation.`);
                    await executeWithRetries(
                        async () =>
                            await chrome.tabGroups.update(currentTab.groupId, {
                                collapsed: false,
                            }),
                        `tabs activate ${groupInfo.id} collapsed ${groupInfo.collapsed}`,
                    );
                }
                enableCollapseTimer = extensionSettings.enableCollapseTimer;
                if (!enableCollapseTimer && !justClosedTab) {
                    await collapseInactiveGroups(activeInfo.tabId);
                }
            } else {
                activeGroupId = -1;
            }
            justClosedTab = false;
        } catch (error) {
            if (!error.message.includes('No tab with id') && !error.message.includes('No group with id')) {
                console.warn('[onActivated] Error updating active group:', error);
            }
        }
    }, 50);
});
chrome.tabGroups.onUpdated.addListener(async (group) => {
    if (shouldIgnoreEventDuringInitialization('tabGroups.onUpdated', group.id)) return;
    if (isGrouping) return;
    // A group must never be left nameless. Renaming one to blank used to stop right
    // here, so the group kept an empty title until some unrelated event happened to
    // run a prefix pass. The repair inside that pass rebuilds the title from the
    // group's key, so all this has to do is ask for the pass.
    //
    // The pass is asked for *after* the naming grace period, not now: the browser
    // writes the title on every keystroke, so an empty title usually means the old
    // name has just been cleared to type a new one, and restoring it at that moment
    // would drop the old name into what the user is typing. By the time the pass
    // runs, either a real name has arrived — and there is nothing to repair — or the
    // group was genuinely left without one.
    if (hasNoVisibleName(group.title)) {
        const restoreDelay = groupInfoMap.get(group.id)?.key ? TITLE_RESTORE_DELAY_MS : GROUP_NAMING_GRACE_MS;
        // Deleting the name letter by letter is part of the same rename, so the
        // strip stays as it is and no pass writes anything until the typing stops.
        groupRenameSettlesAt = Date.now() + RENAME_SETTLE_MS;
        // Starts the clock from the moment the name disappeared. Without this it
        // would only start when the pass below looks at the group, which would find
        // the wait untouched and postpone the repair for ever.
        isTitleJustCleared(group, restoreDelay);
        logMessage(`[tabGroups.onUpdated] Group ${group.id} has no name. Will ask for it back once naming settles.`);
        debounceUpdateAllGroupPrefixes(group.windowId, { targetGroupId: null }, restoreDelay + 300);
        return;
    }
    const allGroupsInWindow = await chrome.tabGroups.query({
        windowId: group.windowId,
    });
    // The tabs of the window are only needed to prime the prefix update below, and
    // that one is debounced: querying them here meant a full scan of every tab in
    // the window on every single group update. Measured on a 283-tab profile that
    // was 56 queries adding up to 85 s. The debounced update fetches what it needs
    // once, when it actually runs, and gets fresher data than this snapshot.
    lastActivity[group.id] = Date.now();
    let info = groupInfoMap.get(group.id);
    const identifier = groupIdentifierMap.get(group.id);
    const persistentState = groupPrefixState.get(identifier);
    const currentBaseName = getBaseGroupName(group.title);

    // 2. Use the cached array to call the synchronous function.
    const isCompactActive = isCompactModeActive(allGroupsInWindow);
    let groupEdit = false;
    let isGroupExpanded = false;
    let nameChanged = false;
    if (info) {
        const storedBaseName = getBaseGroupName(info.title);
        if (storedBaseName !== currentBaseName) {
            nameChanged = currentBaseName !== '';
            if (currentBaseName === '') {
                logMessage(
                    `[onUpdated] Title update blocked for group ${group.id} because the new title "${currentBaseName}" is invalid (empty or prefix-only).`,
                );
            } else {
                // Only if the title is valid, we proceed to update the internal state.
                if (info.type === 'manual') {
                    if (currentBaseName.toLowerCase() !== currentBaseName.charAt(0).toLowerCase()) {
                        info.key = currentBaseName;
                        if (persistentState) {
                            persistentState.title = currentBaseName;
                            logMessage(`[onUpdated] Title in groupPrefixState updated for identifier: ${identifier}`);
                            await saveGroupPrefixState();
                        }
                    }
                    groupEdit = true;
                    info.title = currentBaseName;
                } else {
                    if (!isCompactActive) {
                        info.title = currentBaseName;
                        groupInfoMap.set(group.id, info);
                    }
                }
            }
        }
    }
    if (!group.collapsed && group.collapsed !== undefined) {
        if (!groupExpandedEver.get(group.id)) {
            logMessage(
                `[tabGroups.onUpdated] Group ${group.id} expanded for the first time. Triggering prefix update.`,
            );
            // 3. Pass the cached data to the main update call.
            groupExpandedEver.set(group.id, true);
            isGroupExpanded = true;
            await saveSessionState();
        }
    }

    // The warning logic now uses the cached array through updateAllGroupPrefixes
    const needsWarningMap = determineWarningStatesForGroupsInWindow(allGroupsInWindow, isCompactActive);
    const groupNeedsWarning = needsWarningMap[group.id] === true;
    const groupHasWarning = group.title.startsWith(CURRENT_PREFIX_WARNING);
    const isWarningStateChanging = groupNeedsWarning !== groupHasWarning;
    const otherReasonsForUpdate =
        getTypeGroup === false || (!containsManagedPrefix(group.title) && getTypeGroup === true);
    const needsPrefixRecalcWhileWarningIsStable = groupNeedsWarning && !groupHasWarning;
    if (isWarningStateChanging) {
        logMessage(
            `[tabGroups.onUpdated] Warning state change for group ${group.id}. Triggering full window prefix update.`,
        );
        debounceUpdateAllGroupPrefixes(group.windowId, {
            targetGroupId: null,
            isEdit: groupEdit,
            isEditGroupId: group.id,
            groupNeedsWarning: true,
        });
    } else if (nameChanged && !isCompactActive) {
        groupRenameSettlesAt = Date.now() + RENAME_SETTLE_MS;
        // The rename may have settled a clash between two other names: the group that
        // kept the repeated name is still wearing a warning about a duplicate that no
        // longer exists, and nothing else was going to look at it. Only the group
        // being renamed counts as edited, so the rest keep the marker their state
        // calls for.
        logMessage(
            `[tabGroups.onUpdated] Group ${group.id} was renamed. Re-checking the whole window for stale warnings.`,
        );
        debounceUpdateAllGroupPrefixes(
            group.windowId,
            { targetGroupId: null, isEdit: groupEdit, isEditGroupId: group.id },
            RENAME_SETTLE_MS + 300,
        );
    } else if (
        (otherReasonsForUpdate && groupEdit && !isCompactActive && info && info.type !== 'manual') ||
        (needsPrefixRecalcWhileWarningIsStable && groupEdit && !isCompactActive && info && info.type !== 'manual') ||
        (isGroupExpanded && info && info.type !== 'manual')
    ) {
        logMessage(
            `[tabGroups.onUpdated] Non-warning prefix update for group ${group.id}. Triggering single group prefix update.`,
        );
        debounceUpdateAllGroupPrefixes(group.windowId, {
            targetGroupId: group.id,
            isEdit: groupEdit,
        });
    }
    logMessage(`[tabGroups.onUpdated] Syncing state for group ${group.id} after update.`);
    // While a name is being typed the pass is pushed back instead of running on every
    // keystroke: it is the pass that reorders the strip, and reordering under the
    // naming box moves the group the user is writing in. Each keystroke pushes it
    // further, so the strip is sorted once, when the typing stops.
    if (nameChanged) {
        groupRenameSettlesAt = Date.now() + RENAME_SETTLE_MS;
        debounceGroupTabs(RENAME_SETTLE_MS + 300);
    } else {
        debounceGroupTabs();
    }
    // Rebuilding the menus and writing the map are whole-window jobs. Doing them per
    // group update meant one full rebuild (plus a query of every tab) and one storage
    // write for each of the updates a regroup produces.
    debounceSetupContextMenus();
    await debounceSaveGroupInfoMap();
});
/**
 * Coalesces the writes of groupInfoMap. A regroup fires one group update per group,
 * and each of them used to write the whole map to session storage: on a 283-tab
 * profile that was 37 writes taking 101 s in total.
 *
 * Awaited by its callers on purpose: a bare timer does not keep a service worker
 * alive, so the pending write could be lost when the worker is torn down.
 */
let pendingGroupInfoMapSave = null;

function debounceSaveGroupInfoMap() {
    if (pendingGroupInfoMapSave) return pendingGroupInfoMapSave;
    pendingGroupInfoMapSave = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        pendingGroupInfoMapSave = null;
        try {
            await saveGroupInfoMap();
        } catch (error) {
            console.error('[saveGroupInfoMap] Coalesced save failed:', error);
        }
    })();
    return pendingGroupInfoMapSave;
}

// Groups disappear in bursts (switching the domain/subdomain grouping destroys
// every group at once). The in-memory cleanup below is per group and cheap, but
// persisting the state, rebuilding the context menus and re-syncing are whole-window
// jobs: doing them once per removed group meant hundreds of queries and storage
// writes for a single switch. They now run once for the whole burst.
//
// The listener awaits the shared flush on purpose. A bare setTimeout does not keep
// a service worker alive, so the worker could be torn down before the pending flush
// ran and the state would never be persisted; while an event listener is awaiting,
// the worker stays up.
let pendingGroupRemovalFlush = null;
const windowsWithRemovedGroups = new Set();

function flushGroupRemovals(windowId) {
    windowsWithRemovedGroups.add(windowId);
    if (pendingGroupRemovalFlush) return pendingGroupRemovalFlush;

    pendingGroupRemovalFlush = (async () => {
        // Short window to collect the rest of the burst.
        await new Promise((resolve) => setTimeout(resolve, 120));
        // Released before the work, so removals arriving during it get their own flush.
        pendingGroupRemovalFlush = null;

        const windowIds = [...windowsWithRemovedGroups];
        windowsWithRemovedGroups.clear();
        try {
            await saveSessionState();
            await setupContextMenus();
            await syncWithExistingGroups();
            for (const id of windowIds) {
                debounceUpdateAllGroupPrefixes(id, { targetGroupId: null });
            }
            await saveGroupInfoMap();
        } catch (error) {
            console.error('[onRemoved] Error flushing removed group state:', error);
        }
    })();
    return pendingGroupRemovalFlush;
}

chrome.tabGroups.onRemoved.addListener(async (group) => {
    logMessage(`[onRemoved] Group ${group.id} removed.`);
    getTypeGroup = false;
    delete lastActivity[group.id];
    untitledGroupFirstSeen.delete(group.id);
    if (activeGroupId === group.id) activeGroupId = -1;
    const identifier = groupIdentifierMap.get(group.id);
    if (identifier) {
        groupPrefixState.delete(identifier);
    }
    groupIdentifierMap.delete(group.id);
    groupExpandedEver.delete(group.id);
    groupInfoMap.delete(group.id);
    await flushGroupRemovals(group.windowId);
});
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    logMessage(`[onRemoved] Tab ${tabId} removed.`);
    await ensureSessionStateLoaded();
    if (tabModes.has(tabId)) {
        tabModes.delete(tabId);
        await saveTabModes();
    }
    getTypeGroup = false;
    logMessage(
        `%c[tabs.onRemoved] REMOVING Tab ${tabId} from tabsEverActive. Old size: ${tabsEverActive.size}.`,
        'color: orange; font-weight: bold;',
    );
    tabsEverActive.delete(tabId);
    logMessage(`[tabs.onRemoved] REMOVED Tab ${tabId}. New size: ${tabsEverActive.size}.`);
    if (tabsEverActive.has(tabId)) {
        // Extra check for security
        logMessage(`%c[tabs.onRemoved] REMOVING Tab ${tabId}...`, 'color: orange; font-weight: bold;');
        tabsEverActive.delete(tabId);
        logMessage(`[tabs.onRemoved] REMOVED Tab ${tabId}. New size: ${tabsEverActive.size}.`);
        await saveSessionState(); // Now we save valid data minus 1, not empty data
    }
    debounceGroupTabs();
    debounceUpdateAllGroupPrefixes(removeInfo.windowId, {
        targetGroupId: null,
    });
    await syncWithExistingGroups();
    justClosedTab = true;
    setTimeout(() => {
        justClosedTab = false;
    }, 500);
    if (removeInfo.isWindowClosing) {
        logMessage(`[onRemoved] Tab ${tabId} removed because window is closing. Skipping split-screen logic.`);
        return;
    }
    try {
        const data = await chrome.storage.session.get(SPLIT_SCREEN_STATE_KEY);
        const state = data[SPLIT_SCREEN_STATE_KEY];
        if (!state || !state.isActive || !state.splitTabs) {
            return;
        }
        const originalTabId = Object.keys(state.splitTabs).find((key) => state.splitTabs[key] === tabId);
        if (!originalTabId) {
            return;
        }
        logMessage(
            `[onRemoved] A split-screen tab (ID: ${tabId}) associated with original tab (ID: ${originalTabId}) was closed. Updating state.`,
        );
        delete state.splitTabs[originalTabId];
        const remainingTabsInGroup = await chrome.tabs.query({
            groupId: state.splitGroupId,
        });
        if (remainingTabsInGroup.length === 0) {
            logMessage(`[onRemoved] The split-screen group is now empty. Closing the entire split session.`);
            await handleSplitScreenClosure(state);
        } else {
            logMessage(
                `[onRemoved] Split-screen group still has ${remainingTabsInGroup.length} tab(s). Saving updated state.`,
            );
            await chrome.storage.session.set({
                [SPLIT_SCREEN_STATE_KEY]: state,
            });
        }
    } catch (error) {
        if (error.message && !error.message.toLowerCase().includes('no group with id')) {
            console.error('[onRemoved] Error processing split-screen tab removal:', error);
        }
    }
});
chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
    if (shouldIgnoreEventDuringInitialization('tabs.onAttached', tabId)) return;
    getTypeGroup = false;
    logMessage(`[onAttached] Tab ${tabId} attached to window ${attachInfo.newWindowId}.`);
    await updateAllGroupPrefixes(attachInfo.newWindowId, null);
});
chrome.tabs.onDetached.addListener(async (tabId, detachInfo) => {
    if (shouldIgnoreEventDuringInitialization('tabs.onDetached', tabId)) return;
    getTypeGroup = false;
    logMessage(`[onDetached] Tab ${tabId} detached from window ${detachInfo.oldWindowId}.`);
    await updateAllGroupPrefixes(detachInfo.oldWindowId, null);
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const menuItemId = info.menuItemId.toString();
    const parseRuleActionId = (id, prefix) => {
        if (!id.startsWith(prefix)) return null;
        const dataPart = id.substring(prefix.length);
        const lastUnderscoreIndex = dataPart.lastIndexOf('_');
        if (lastUnderscoreIndex === -1) return null;
        const ruleName = dataPart.substring(0, lastUnderscoreIndex);
        const indexStr = dataPart.substring(lastUnderscoreIndex + 1);
        const index = parseInt(indexStr, 10);
        if (isNaN(index)) return null;
        return {
            ruleName,
            index,
        };
    };
    const openUrlData = parseRuleActionId(menuItemId, 'open-url_');
    if (openUrlData) {
        const { ruleName, index } = openUrlData;
        const rules = extensionSettings.customRules || [];
        const rule = rules.find((r) => r.name === ruleName);
        if (rule && rule.urls && rule.urls[index]) {
            await openUrlsCommand([rule.urls[index]]);
        }
        return;
    }
    const closeTabsData = parseRuleActionId(menuItemId, 'close-tabs-for-url_');
    if (closeTabsData) {
        const { ruleName, index } = closeTabsData;
        const rules = extensionSettings.customRules || [];
        const rule = rules.find((r) => r.name === ruleName);
        if (rule && rule.urls && rule.urls[index]) {
            let groupId = -1;
            for (const [id, groupInfo] of groupInfoMap.entries()) {
                if (groupInfo.type === 'rule' && groupInfo.key === ruleName) {
                    groupId = id;
                    break;
                }
            }
            await closeTabsForUrlCommand(rule.urls[index], rule.name, groupId);
        }
        return;
    }
    if (menuItemId.startsWith('toggle-rule-active_')) {
        const ruleName = menuItemId.substring('toggle-rule-active_'.length);
        await toggleRuleActiveState(ruleName);
        return;
    }
    if (menuItemId.startsWith('open-all-urls_')) {
        const ruleName = menuItemId.substring('open-all-urls_'.length);
        const rules = extensionSettings.customRules || [];
        const rule = rules.find((r) => r.name === ruleName);
        if (rule && rule.urls) {
            await openUrlsCommand(rule.urls);
        }
        return;
    }
    if (menuItemId.startsWith('open-url_')) {
        const parts = menuItemId.split('_');
        if (parts.length >= 3) {
            const urlIndex = parseInt(parts.pop(), 10);
            parts.shift(); // Remove "open"
            const ruleName = parts.join('_');
            const rules = extensionSettings.customRules || [];
            const rule = rules.find((r) => r.name === ruleName);
            if (rule && rule.urls && !isNaN(urlIndex) && rule.urls[urlIndex]) {
                await openUrlsCommand([rule.urls[urlIndex]]);
            }
        }
        return;
    }
    if (menuItemId.startsWith('remove-domain_')) {
        const domainToRemove = menuItemId.substring('remove-domain_'.length);
        if (domainToRemove) {
            await removeTabsByDomainCommand(domainToRemove);
        }
        return;
    }
    if (menuItemId === 'create-rule-root') {
        openCreateRuleModalForUrl(info.pageUrl, tab.windowId, false);
        return;
    }
    if (menuItemId === 'create-rule-full') {
        openCreateRuleModalForUrl(info.pageUrl, tab.windowId, true);
        return;
    }
    if (menuItemId.startsWith('add-site-root_')) {
        const ruleName = menuItemId.substring('add-site-root_'.length);
        try {
            const siteRootUrl = new URL(info.pageUrl).origin;
            await addUrlToRuleAndNotify(siteRootUrl, ruleName);
        } catch (e) {
            console.error('Could not parse URL to extract site root:', info.pageUrl, e);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: '/assets/icons/icon128.png',
                title: getI18nMsg('validationErrorTitle'),
                message: getI18nMsg('errorInvalidUrlFormat', [info.pageUrl]),
            });
        }
        return;
    }
    if (menuItemId.startsWith('add-full-url_')) {
        const ruleName = menuItemId.substring('add-full-url_'.length);
        const fullUrl = info.pageUrl;
        await addUrlToRuleAndNotify(fullUrl, ruleName);
        return;
    }
    if (menuItemId.startsWith('add-to-group-')) {
        const groupId = parseInt(menuItemId.substring('add-to-group-'.length), 10);
        if (!isNaN(groupId) && tab.id) {
            try {
                await chrome.tabs.group({
                    groupId: groupId,
                    tabIds: [tab.id],
                });
            } catch (error) {
                console.error(`Error adding tab to group ${groupId}:`, error);
            }
        }
        return;
    }
    switch (menuItemId) {
        case 'toggle-current-group':
            await toggleCurrentGroupCommand();
            break;
        case 'toggle-all-groups':
            await toggleAllGroupsCommand();
            break;
        case 'delete-other-groups-ctx':
            // The entry reads "close every group except the active one", and the
            // group to spare has to be named: an empty message left `keepId` as NaN,
            // which matches nothing, so the active group was closed along with the
            // rest. When the active tab is in no group there is nothing to spare and
            // every group goes, which is what the entry then means.
            await handleDeleteOtherGroups({ groupId: tab?.groupId ?? chrome.tabGroups.TAB_GROUP_ID_NONE }, () => {});
            break;
        case 'regroup-all-tabs':
            await regroupAllTabsCommand();
            break;
        case 'mute-all-tabs-ctx':
            const tabsToMute = await chrome.tabs.query({
                audible: true,
                muted: false,
            });
            for (const t of tabsToMute) {
                await chrome.tabs.update(t.id, {
                    muted: true,
                });
            }
            break;
        case 'unmute-all-tabs-ctx':
            const tabsToUnmute = await chrome.tabs.query({
                muted: true,
            });
            for (const t of tabsToUnmute) {
                await chrome.tabs.update(t.id, {
                    muted: false,
                });
            }
            break;
        case 'remove-duplicate-tabs':
            await removeDuplicateTabsCommand();
            break;
        case 'toggle-sort-alpha':
            await toggleSortGroupsAlpha();
            break;
        case 'toggle-collapse-timer':
            await toggleCollapseTimerOption();
            break;
        case 'toggle-all-rules':
            await toggleAllRules();
            debounceGroupTabs();
            break;
        case 'open-page-in-pip':
            if (tab && tab.id) {
                // --- TikTok Native PiP: Use browser's native PiP API ---
                const isTiktokPage = tab.url && (tab.url.includes('tiktok.com') || tab.url.includes('tiktok.'));
                if (isTiktokPage) {
                    try {
                        await chrome.scripting.executeScript({
                            target: {
                                tabId: tab.id,
                            },
                            injectImmediately: true,
                            func: async () => {
                                try {
                                    // Try to click the native TikTok "Reproductor flotante" (mini-player) button
                                    let miniPlayerBtn = document.querySelector(
                                        '[data-e2e="more-menu-popover_mini-player"]',
                                    );
                                    if (miniPlayerBtn) {
                                        miniPlayerBtn.click();
                                        return true;
                                    }
                                    // If popover is not open, open the "more" menu first
                                    const moreBtn = document.querySelector('[data-e2e="more-menu-icon"]');
                                    if (moreBtn) {
                                        moreBtn.click();
                                        await new Promise((resolve) => setTimeout(resolve, 300));
                                        miniPlayerBtn = document.querySelector(
                                            '[data-e2e="more-menu-popover_mini-player"]',
                                        );
                                        if (miniPlayerBtn) {
                                            miniPlayerBtn.click();
                                            return true;
                                        }
                                    }
                                } catch (e) {
                                    console.warn('Failed to trigger TikTok native mini-player:', e);
                                }
                                return false;
                            },
                        });
                    } catch (execErr) {
                        console.warn('Context menu TikTok native PiP executeScript failed:', execErr);
                    }
                    break;
                }
                try {
                    await chrome.scripting.executeScript({
                        target: {
                            tabId: tab.id,
                        },
                        injectImmediately: true,
                        func: async () => {
                            if ('documentPictureInPicture' in window) {
                                if (window.documentPictureInPicture.window) {
                                    window.documentPictureInPicture.window.close();
                                    return true;
                                }

                                // If the document is still loading, wait a maximum of 600ms for DOMContentLoaded
                                if (document.readyState === 'loading') {
                                    await new Promise((resolve) => {
                                        document.addEventListener('DOMContentLoaded', resolve, {
                                            once: true,
                                        });
                                        setTimeout(resolve, 600);
                                    });
                                }
                                try {
                                    let targetUrl = window.location.href;
                                    try {
                                        const video = document.querySelector('video');
                                        if (video && video.currentTime > 0) {
                                            const urlObj = new URL(targetUrl);
                                            const secs = Math.floor(video.currentTime);
                                            urlObj.searchParams.set('t', secs);
                                            targetUrl = urlObj.toString();
                                        }
                                    } catch (timeErr) {
                                        console.warn('Failed to append time to targetUrl:', timeErr);
                                    }
                                    document.querySelectorAll('video').forEach((v) => {
                                        try {
                                            v.pause();
                                        } catch {}
                                    });
                                    const width = Math.round(window.innerWidth * 0.8) || 800;
                                    const height = Math.round(window.innerHeight * 0.8) || 600;
                                    const pipWindow = await window.documentPictureInPicture.requestWindow({
                                        width: width,
                                        height: height,
                                    });
                                    pipWindow.document.body.style.margin = '0';
                                    pipWindow.document.body.style.padding = '0';
                                    pipWindow.document.body.style.overflow = 'hidden';
                                    pipWindow.document.body.style.backgroundColor = '#1e1e1e';
                                    const iframe = document.createElement('iframe');
                                    iframe.src = targetUrl;
                                    iframe.style.width = '100vw';
                                    iframe.style.height = '100vh';
                                    iframe.style.border = 'none';
                                    iframe.allow = 'fullscreen; clipboard-write; encrypted-media;';
                                    pipWindow.document.body.appendChild(iframe);
                                    let lastKnownTime = 0;
                                    const originalPauseInterval = setInterval(() => {
                                        document.querySelectorAll('video').forEach((v) => {
                                            try {
                                                if (!v.paused) {
                                                    v.pause();
                                                }
                                            } catch {}
                                        });
                                    }, 100);
                                    const timeTrackerInterval = setInterval(() => {
                                        try {
                                            if (!pipWindow || pipWindow.closed) {
                                                clearInterval(timeTrackerInterval);
                                                clearInterval(originalPauseInterval);
                                                return;
                                            }
                                            const pipIframe = pipWindow.document.querySelector('iframe');
                                            if (pipIframe) {
                                                const innerDoc =
                                                    pipIframe.contentDocument || pipIframe.contentWindow?.document;
                                                const pipVideo = innerDoc?.querySelector('video');
                                                if (
                                                    pipVideo &&
                                                    !isNaN(pipVideo.currentTime) &&
                                                    pipVideo.currentTime > 0
                                                ) {
                                                    lastKnownTime = pipVideo.currentTime;
                                                }
                                            }
                                        } catch {}
                                    }, 250);
                                    let didResume = false;
                                    const resumeOriginalVideo = (shouldPlay) => {
                                        if (didResume) return;
                                        didResume = true;
                                        clearInterval(timeTrackerInterval);
                                        clearInterval(originalPauseInterval);
                                        try {
                                            const localVideo = document.querySelector('video');
                                            if (localVideo) {
                                                if (lastKnownTime > 0) {
                                                    localVideo.currentTime = lastKnownTime;
                                                }
                                                if (shouldPlay) {
                                                    localVideo.play().catch((e) => {
                                                        console.warn(
                                                            'Failed to autoplay original video on PiP close:',
                                                            e,
                                                        );
                                                    });
                                                } else {
                                                    localVideo.pause();
                                                }
                                            }
                                        } catch (e) {
                                            console.warn('Error resuming original video:', e);
                                        }
                                    };
                                    pipWindow.addEventListener('pagehide', () => {
                                        resumeOriginalVideo(!document.hidden);
                                    });
                                    pipWindow.addEventListener('unload', () => {
                                        resumeOriginalVideo(!document.hidden);
                                    });
                                    return true;
                                } catch (err) {
                                    console.warn('Context menu PiP requestWindow failed:', err);
                                    return false;
                                }
                            }
                            return false;
                        },
                    });
                } catch (execErr) {
                    console.warn('Context menu PiP executeScript failed:', execErr);
                }
            }
            break;
        case 'open-page-in-popup':
            if (info && info.pageUrl) {
                const width = Math.round((tab?.width || 1000) * 0.8);
                const height = Math.round((tab?.height || 800) * 0.8);
                await chrome.windows.create({
                    url: info.pageUrl,
                    type: 'popup',
                    width: width || 800,
                    height: height || 600,
                });
            }
            break;
        case 'open-selection-in-pip':
            if (tab && tab.id && info && info.selectionText) {
                try {
                    await chrome.scripting.executeScript({
                        target: {
                            tabId: tab.id,
                        },
                        func: async (selectedText) => {
                            if ('documentPictureInPicture' in window) {
                                if (window.documentPictureInPicture.window) {
                                    window.documentPictureInPicture.window.close();
                                }
                                try {
                                    const width = Math.min(Math.round(window.innerWidth * 0.7), 600) || 600;
                                    const height = Math.min(Math.round(window.innerHeight * 0.7), 600) || 600;
                                    const pipWindow = await window.documentPictureInPicture.requestWindow({
                                        width: width,
                                        height: height,
                                    });
                                    pipWindow.document.body.style.margin = '0';
                                    pipWindow.document.body.style.padding = '32px';
                                    pipWindow.document.body.style.boxSizing = 'border-box';
                                    pipWindow.document.body.style.backgroundColor = '#121212';
                                    pipWindow.document.body.style.color = '#e0e0e0';
                                    pipWindow.document.body.style.fontFamily =
                                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
                                    pipWindow.document.body.style.overflow = 'auto';
                                    const header = document.createElement('div');
                                    header.style.display = 'flex';
                                    header.style.justifyContent = 'space-between';
                                    header.style.alignItems = 'center';
                                    header.style.marginBottom = '20px';
                                    header.style.borderBottom = '1px solid #333';
                                    header.style.paddingBottom = '16px';
                                    header.innerHTML = `<span style="font-size: 16px; font-weight: 600; color: #a0a0a0;">📝 Recorte de Texto</span>`;
                                    const copyBtn = document.createElement('button');
                                    copyBtn.innerText = 'Copiar';
                                    copyBtn.style.background = '#007acc';
                                    copyBtn.style.color = '#fff';
                                    copyBtn.style.border = 'none';
                                    copyBtn.style.borderRadius = '6px';
                                    copyBtn.style.padding = '6px 14px';
                                    copyBtn.style.cursor = 'pointer';
                                    copyBtn.style.fontSize = '14px';
                                    copyBtn.style.fontWeight = '500';
                                    copyBtn.onclick = () => {
                                        navigator.clipboard.writeText(selectedText);
                                        copyBtn.innerText = '¡Copiado!';
                                        setTimeout(() => (copyBtn.innerText = 'Copiar'), 2000);
                                    };
                                    header.appendChild(copyBtn);
                                    const card = document.createElement('div');
                                    card.style.backgroundColor = '#1e1e1e';
                                    card.style.border = '1px solid #333';
                                    card.style.borderRadius = '16px';
                                    card.style.padding = '28px';
                                    card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
                                    card.style.lineHeight = '1.6';
                                    card.style.fontSize = '18px';
                                    card.style.whiteSpace = 'pre-wrap';
                                    card.style.wordBreak = 'break-word';
                                    card.innerText = selectedText;
                                    pipWindow.document.body.appendChild(header);
                                    pipWindow.document.body.appendChild(card);
                                    return true;
                                } catch (err) {
                                    console.warn('Selection PiP requestWindow failed:', err);
                                    return false;
                                }
                            }
                            return false;
                        },
                        args: [info.selectionText],
                    });
                } catch (execErr) {
                    console.warn('Selection PiP executeScript failed:', execErr);
                }
            }
            break;
        case 'open-image-in-pip':
            if (tab && tab.id && info && info.srcUrl) {
                try {
                    await chrome.scripting.executeScript({
                        target: {
                            tabId: tab.id,
                        },
                        func: async (imgUrl) => {
                            if ('documentPictureInPicture' in window) {
                                if (window.documentPictureInPicture.window) {
                                    window.documentPictureInPicture.window.close();
                                }
                                try {
                                    const width = Math.min(Math.round(window.innerWidth * 0.7), 600) || 600;
                                    const height = Math.min(Math.round(window.innerHeight * 0.7), 600) || 600;
                                    const pipWindow = await window.documentPictureInPicture.requestWindow({
                                        width: width,
                                        height: height,
                                    });
                                    pipWindow.document.body.style.margin = '0';
                                    pipWindow.document.body.style.padding = '0';
                                    pipWindow.document.body.style.overflow = 'hidden';
                                    pipWindow.document.body.style.backgroundColor = '#0e0e0e';
                                    pipWindow.document.body.style.display = 'flex';
                                    pipWindow.document.body.style.justifyContent = 'center';
                                    pipWindow.document.body.style.alignItems = 'center';
                                    const img = document.createElement('img');
                                    img.src = imgUrl;
                                    img.style.maxWidth = '100vw';
                                    img.style.maxHeight = '100vh';
                                    img.style.objectFit = 'contain';
                                    pipWindow.document.body.appendChild(img);
                                    return true;
                                } catch (err) {
                                    console.warn('Image PiP requestWindow failed:', err);
                                    return false;
                                }
                            }
                            return false;
                        },
                        args: [info.srcUrl],
                    });
                } catch (execErr) {
                    console.warn('Image PiP executeScript failed:', execErr);
                }
            }
            break;
        case 'open-selection-in-popup':
            if (info && info.selectionText) {
                const previewId = Date.now().toString();
                await chrome.storage.session.set({
                    [`preview_${previewId}`]: {
                        type: 'selection',
                        text: info.selectionText,
                    },
                });
                const url = chrome.runtime.getURL(`src/ui/pages/selection-preview/preview.html?id=${previewId}`);
                const width = Math.round((tab?.width || 1000) * 0.7);
                const height = Math.round((tab?.height || 800) * 0.7);
                await chrome.windows.create({
                    url: url,
                    type: 'popup',
                    width: width || 800,
                    height: height || 600,
                });
            }
            break;
        case 'open-image-in-popup':
            if (info && info.srcUrl) {
                const previewId = Date.now().toString();
                await chrome.storage.session.set({
                    [`preview_${previewId}`]: {
                        type: 'image',
                        srcUrl: info.srcUrl,
                    },
                });
                const url = chrome.runtime.getURL(`src/ui/pages/selection-preview/preview.html?id=${previewId}`);
                const width = Math.round((tab?.width || 1000) * 0.7);
                const height = Math.round((tab?.height || 800) * 0.7);
                await chrome.windows.create({
                    url: url,
                    type: 'popup',
                    width: width || 800,
                    height: height || 600,
                });
            }
            break;
        case 'open-extension-popup':
            await toggleExtensionPopupCommand(tab);
            break;
        case 'open-extension-web':
            await openRulesManagerCommand();
            break;
        case 'open-extension-sidepanel':
            chrome.sidePanel.setOptions({
                path: 'src/ui/pages/rules/rules.html',
                enabled: true,
            });
            isSidePanelActive = true;
            chrome.sidePanel.open({
                windowId: tab.windowId,
            });
            break;
        case 'open-list-group-sidepanel':
            await chrome.storage.local.set({
                navSource: '../rules/rules.html?context=sidepanel',
            });
            chrome.sidePanel.setOptions({
                path: 'src/ui/pages/listGroup/listGroup.html',
                enabled: true,
            });
            isSidePanelActive = true;
            chrome.sidePanel.open({
                windowId: tab.windowId,
            });
            break;
        case 'open-themes-sidepanel':
            chrome.sidePanel.setOptions({
                path: 'src/ui/pages/savedThemes/savedThemes.html',
                enabled: true,
            });
            isSidePanelActive = true;
            chrome.sidePanel.open({
                windowId: tab.windowId,
            });
            break;
        case 'open-gemini-sidepanel':
            chrome.sidePanel.setOptions({
                path: 'src/ui/pages/listGroup/listGroup.html?view=gemini',
                enabled: true,
            });
            isSidePanelActive = true;
            chrome.sidePanel.open({
                windowId: tab.windowId,
            });
            break;
        case 'open-customize-hints-sidepanel':
            chrome.sidePanel.setOptions({
                path: 'src/ui/pages/customize_hints/customize_hints.html',
                enabled: true,
            });
            isSidePanelActive = true;
            chrome.sidePanel.open({
                windowId: tab.windowId,
            });
            break;
        case 'toggle-prefixes':
            await togglePrefixesCommand();
            break;
        case 'toggle-link-preview':
            await toggleLinkPreviewOption(info.checked);
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
        case 'misc-sort-start':
        case 'misc-sort-end':
        case 'misc-sort-alpha':
            const newSortOption = menuItemId.replace('misc-sort-', '');
            const storageArea = await getSettingsStorage();
            await storageArea.set({
                miscGroupSortOption: newSortOption,
            });
            break;
    }
});

// ============================================================
// AUTOMATIC TAB DISCARDING / RAM MEMORY SAVER (1 Hour Inactivity)
// ============================================================

/**
 * The minute tick that drives tab suspension, scheduled themes and scheduled
 * assistant queries.
 *
 * These three ran on `setInterval`, which does not survive in a service worker:
 * the browser stops it after about thirty seconds of inactivity, so a schedule set
 * for a time when nothing else was happening simply never fired. An alarm wakes the
 * worker instead — the same mechanism the pomodoro timer already uses.
 */
const PERIODIC_TASKS_ALARM = 'itg-periodic-tasks';

chrome.alarms.create(PERIODIC_TASKS_ALARM, { periodInMinutes: 1 });

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(PERIODIC_TASKS_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== PERIODIC_TASKS_ALARM) return;
    // Each one is independent: a failure in the first must not stop the others.
    // waSync is what keeps the web activity clock honest while nothing else happens:
    // it banks the open segment, so a long read is not one huge lump at the end, and
    // it is also when a blocking schedule that just opened takes effect.
    await Promise.allSettled([
        suspendInactiveTabsIntelligently(),
        checkSchedules(),
        checkGeminiSchedules(),
        waSync(),
        waPruneOldDays(),
        // A no-op unless the user asked for a synced copy, and even then only every
        // ten minutes — see waSyncPushDue.
        waSyncPushDue(),
    ]);
});
chrome.runtime.onStartup.addListener(initializeExtensionStates);
chrome.runtime.onInstalled.addListener(async (details) => {
    logMessage('chrome.runtime.onInstalled event fired.');
    await updatePinState();
    if (details.reason === 'install') {
        logMessage('Extension installed. Setting up default settings.');
        isInstallActive = true;
        await setupDefaultSettings();
        await initializeExtensionStates(true);
    }
    if (details.reason === 'update') {
        logMessage('Extension updated. Initializing states.');
        isInstallActive = false;
        await initializeExtensionStates(false);
    }
    await injectContentScriptsInAllTabs();
});
chrome.windows.onRemoved.addListener(async (windowId) => {
    logMessage(`Window ${windowId} removed. Syncing states.`);
    windowsRemove = true;
    try {
        // Get current split-screen state from session
        const data = await chrome.storage.session.get(SPLIT_SCREEN_STATE_KEY);
        const state = data[SPLIT_SCREEN_STATE_KEY];

        // If no active state, do nothing
        if (!state || !state.isActive) {
            return;
        }

        // Check if the removed window is the split window
        if (state.splitWindowId === windowId) {
            logMessage(`Split-screen window closed. Restoring original window and cleaning state.`);
            const { originalWindowId, originalWindowState } = state;

            // Try to restore original window to its saved state
            if (originalWindowId && originalWindowState) {
                try {
                    // If it was maximized, restore it as maximized
                    if (originalWindowState.state === 'maximized') {
                        await chrome.windows.update(originalWindowId, {
                            state: 'maximized',
                            focused: true,
                        });
                    } else {
                        // Otherwise, restore its dimensions and position
                        await chrome.windows.update(originalWindowId, {
                            left: originalWindowState.left,
                            top: originalWindowState.top,
                            width: originalWindowState.width,
                            height: originalWindowState.height,
                            focused: true,
                        });
                    }
                } catch (e) {
                    // This error is normal if the user closed the original window first
                    console.warn('Could not restore original window, it might have been already closed:', e.message);
                }
            }

            // CRITICAL: Clean session state to "remove" the split group
            await chrome.storage.session.remove(SPLIT_SCREEN_STATE_KEY);
        }
    } catch (error) {
        console.error('Error cleaning split-screen state on window removal:', error);
    }
});
chrome.storage.onChanged.addListener(async (changes, area) => {
    if (shouldIgnoreEventDuringInitialization('onChanged', area)) return;
    logMessage('chrome.storage.onChanged.addListener triggered.');
    if (area === 'local') {
        // Only one view can be pinned, so whichever was just pinned turns the rest off.
        if (changes.isPinned && changes.isPinned.newValue === true) {
            chrome.storage.local.set({
                isListGroupPinned: false,
                isGeminiPinned: false,
                isWebActivityPinned: false,
            });
        } else if (changes.isListGroupPinned && changes.isListGroupPinned.newValue === true) {
            chrome.storage.local.set({
                isPinned: false,
                isGeminiPinned: false,
                isWebActivityPinned: false,
            });
        } else if (changes.isGeminiPinned && changes.isGeminiPinned.newValue === true) {
            chrome.storage.local.set({
                isPinned: false,
                isListGroupPinned: false,
                isWebActivityPinned: false,
            });
        } else if (changes.isWebActivityPinned && changes.isWebActivityPinned.newValue === true) {
            chrome.storage.local.set({
                isPinned: false,
                isListGroupPinned: false,
                isGeminiPinned: false,
            });
        }
        if (changes.isPinned || changes.isListGroupPinned || changes.isGeminiPinned || changes.isWebActivityPinned) {
            logMessage('Pin state change detected, updating memory cache.');
            await updatePinState();
        }
        if (changes['preferred-language']) {
            logMessage('[i18n] Language change detected. Recreating context menus.');
            await loadI18nMessages(true); // Drop the cached locale before rebuilding.
            await setupContextMenus();
        }
    }
    let configuredArea = cachedConfiguredRuleStorageArea;
    if (!configuredArea) {
        const { ruleStorageArea: currentArea = 'sync' } = await chrome.storage.local.get('ruleStorageArea');
        cachedConfiguredRuleStorageArea = currentArea;
        configuredArea = currentArea;
    }
    if (changes.ruleStorageArea && area === 'local') {
        const oldValue = changes.ruleStorageArea.oldValue || 'sync';
        const newValue = changes.ruleStorageArea.newValue || 'sync';
        cachedConfiguredRuleStorageArea = newValue;
        logMessage(`[Storage Changed] Storage area switched from '${oldValue}' to '${newValue}'. Re-initializing...`);
        if (!isInstallActive) {
            await initializeExtensionStates();
        }
        isInstallActive = false;
        return;
    }
    if (area !== configuredArea) {
        return;
    }
    let needsRegroup = false;
    let needsPrefixUpdate = false;
    for (const [key, { newValue }] of Object.entries(changes)) {
        let optionChanged = true;
        switch (key) {
            case 'clusterConfig':
                const storedConfig = newValue || {};
                const mergedSpecialGroups = {};
                for (const groupKey in DEFAULT_CLUSTER_CONFIG.specialGroups) {
                    mergedSpecialGroups[groupKey] = {
                        ...DEFAULT_CLUSTER_CONFIG.specialGroups[groupKey],
                        ...(storedConfig.specialGroups?.[groupKey] || {}),
                    };
                }
                extensionSettings.clusterConfig = {
                    ...DEFAULT_CLUSTER_CONFIG,
                    ...storedConfig,
                    specialGroups: mergedSpecialGroups,
                    compactMode: {
                        ...DEFAULT_CLUSTER_CONFIG.compactMode,
                        ...(storedConfig.compactMode || {}),
                    },
                };
                needsRegroup = true;
                break;
            case 'clusteringEnabled':
                extensionSettings.clusteringEnabled = newValue ?? true;
                needsRegroup = true;
                optionChanged = true;
                break;
            case 'enablePrefixes':
                extensionSettings.enablePrefixes = newValue ?? false;
                needsPrefixUpdate = true;
                break;
            case 'userPrefixes':
                extensionSettings.userPrefixes = newValue || DEFAULT_USER_PREFIXES;
                needsPrefixUpdate = true;
                break;
            case 'customRules':
                if (Array.isArray(newValue)) {
                    extensionSettings.customRules = newValue;
                } else {
                    console.warn(`[Storage Changed] Invalid value ignored for customRules:`, newValue);
                    optionChanged = false;
                }
                needsRegroup = true;
                break;
            case 'miscGroupSortOption':
                extensionSettings[key] = newValue;
                needsRegroup = true;
                break;
            case 'sortGroupsAlphabetically':
                if (typeof newValue === 'boolean') {
                    extensionSettings.sortGroupsAlphabetically = newValue;
                } else {
                    console.warn(`[Storage Changed] Invalid value ignored for sortGroupsAlphabetically:`, newValue);
                    optionChanged = false; // Do not notify UI
                }
                needsRegroup = true;
                break;
            default:
                if (extensionSettings.hasOwnProperty(key)) {
                    extensionSettings[key] = newValue;
                } else {
                    optionChanged = false;
                }
                break;
        }
        if (optionChanged) {
            sendMessageToUI({
                action: 'optionChanged',
                option: key,
                value: newValue,
            });
        }
    }
    if (needsPrefixUpdate) {
        logMessage('[Storage Changed] Triggering prefix update.');
        const updateAllPrefixesForAllWindow = async () => {
            if (changes.userPrefixes || changes.enablePrefixes) {
                loadUserDefinedPrefixes();
            }
            const windows = await chrome.windows.getAll();
            await Promise.all(windows.map((window) => updateAllGroupPrefixes(window.id, null)));
        };
        updateAllPrefixesForAllWindow();
    }
    if (needsRegroup && !isInstallActive) {
        logMessage('[Storage Changed] Triggering debounced groupTabs() due to configuration changes.');
        debounceGroupTabs(50);
    }
    debounceSetupContextMenus();
});
chrome.action.onClicked.addListener((tab) => {
    // We read directly from the variables in memory, which are updated by onChanged.
    // This must be synchronous to preserve the 'user gesture' required by sidePanel.open().
    if (isGeminiPinned) {
        chrome.sidePanel.setOptions({
            path: 'src/ui/pages/listGroup/listGroup.html?view=gemini',
            enabled: true,
        });
        chrome.sidePanel.open({
            windowId: tab.windowId,
        });
    } else if (isRulesPinned) {
        chrome.sidePanel.setOptions({
            path: 'src/ui/pages/rules/rules.html',
            enabled: true,
        });
        chrome.sidePanel.open({
            windowId: tab.windowId,
        });
    } else if (isListGroupPinned) {
        chrome.sidePanel.setOptions({
            path: 'src/ui/pages/listGroup/listGroup.html',
            enabled: true,
        });
        chrome.sidePanel.open({
            windowId: tab.windowId,
        });
    } else if (isWebActivityPinned) {
        chrome.sidePanel.setOptions({
            path: 'src/ui/pages/web-activity/web-activity.html?context=sidepanel',
            enabled: true,
        });
        chrome.sidePanel.open({
            windowId: tab.windowId,
        });
    } else {
        // If nothing is pinned, open the web popup.html in the SIDE PANEL.
        chrome.sidePanel.setOptions({
            path: 'src/ui/pages/popup/popup.html',
            enabled: true,
        });
        chrome.sidePanel.open({
            windowId: tab.windowId,
        });
    }
});
setInterval(async () => {
    const enableTimer = extensionSettings.enableCollapseTimer;
    if (enableTimer) {
        const now = Date.now();
        const inactiveThreshold = getInactiveCollapseThreshold();
        const activeThreshold = getActiveCollapseThreshold();
        try {
            const groups = await chrome.tabGroups.query({});
            for (const group of groups) {
                const lastActiveTime = lastActivity[group.id];
                if (!lastActiveTime) continue;
                const threshold = group.id === activeGroupId ? activeThreshold : inactiveThreshold;
                if (threshold > 0 && now - lastActiveTime > threshold && !group.collapsed) {
                    logMessage(`[AutoCollapse] Collapsing group ${group.id} (${group.title}) due to inactivity.`);
                    await executeWithRetries(
                        async () =>
                            await chrome.tabGroups.update(group.id, {
                                collapsed: true,
                            }),
                        `auto-collapsing group ${group.id} (${group.title})`,
                    );
                }
            }
        } catch (error) {
            console.warn('[AutoCollapse] Error in auto-collapse interval:', error);
        }
    }
}, 5 * 1000);
// We listen to all events that may modify bookmarks
chrome.bookmarks.onCreated.addListener(clearBackgroundBookmarkCache);
chrome.bookmarks.onRemoved.addListener(clearBackgroundBookmarkCache);
chrome.bookmarks.onChanged.addListener(clearBackgroundBookmarkCache);
chrome.bookmarks.onMoved.addListener(clearBackgroundBookmarkCache);
chrome.bookmarks.onImportEnded.addListener(clearBackgroundBookmarkCache);

// ============================================================
// POMODORO TIMER - Background Persistent Logic (v2)
// ============================================================
