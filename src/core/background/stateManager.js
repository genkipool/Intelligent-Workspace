async function saveGroupPrefixState() {
    if (isInitializing) {
        logMessage('[saveGroupPrefixState] State save deferred: Extension is currently initializing.');
        return;
    }
    try {
        const prefixStateObj = {};
        for (const [key, value] of groupPrefixState) {
            prefixStateObj[key] = {
                prefix: value.prefix,
                tabCount: value.tabCount,
                expandedEver: value.expandedEver,
                activeTabIndices: value.activeTabIndices || [],
                activeTabIds: value.activeTabIds || [],
                type: value.type,
                key: value.key,
                isCompact: value.isCompact,
                title: value.title,
            };
        }
        // The following line determines whether to use chrome.storage.local or chrome.storage.sync

        await chrome.storage.local.set({
            groupPrefixState: prefixStateObj,
        });
    } catch (error) {
        console.error('Error saving group prefix state to local storage:', error);
    }
}
async function loadGroupPrefixState() {
    try {
        const data = await chrome.storage.local.get('groupPrefixState');
        if (data.groupPrefixState) {
            groupPrefixState = new Map();
            for (const [key, value] of Object.entries(data.groupPrefixState)) {
                groupPrefixState.set(key, value);
            }
            logMessage(`[loadGroupPrefixState] Loaded ${groupPrefixState.size} entries from persistent storage.`);
        } else {
            console.warn('[loadGroupPrefixState] No groupPrefixState found in storage.');
        }
    } catch (error) {
        console.error('Error loading groupPrefixState:', error);
    }
    return groupPrefixState;
}
async function rebuildGroupIdentifierMap() {
    logMessage('[rebuildGroupIdentifierMap] Rebuilding session identifier map...');
    try {
        groupIdentifierMap.clear();
        const allGroups = await chrome.tabGroups.query({});
        for (const group of allGroups) {
            const cleanTitle = getBaseGroupName(group.title);
            const identifierGroupId = generateGroupIdentifier(cleanTitle, null, group.id);
            groupIdentifierMap.set(group.id, identifierGroupId);
        }
    } catch (error) {
        console.error('Error rebuilding group identifier map:', error);
    }
}
async function saveSessionState() {
    try {
        const tabsEverActiveArray = [...tabsEverActive];
        const groupExpandedEverObject = Object.fromEntries(groupExpandedEver);
        logMessage(
            `%c[saveSessionState] SAVING tabsEverActive to session storage. Size: ${tabsEverActiveArray.length}. Content: [${tabsEverActiveArray.join(', ')}]`,
            'color: blue;',
        );
        await chrome.storage.session.set({
            tabsEverActive: tabsEverActiveArray,
            groupExpandedEver: groupExpandedEverObject,
            activeSidePanelPath: activeSidePanelPath,
        });
    } catch (error) {
        console.error('Error saving session state:', error);
    }
}
async function loadSessionState() {
    try {
        logMessage(
            `%c[loadSessionState] ATTEMPTING to load state from session storage.`,
            'color: purple; font-weight: bold;',
        );
        const data = await chrome.storage.session.get(['tabsEverActive', 'groupExpandedEver', 'activeSidePanelPath']);

        // Restore activeSidePanelPath if available
        if (data.activeSidePanelPath !== undefined) {
            activeSidePanelPath = data.activeSidePanelPath;
            logMessage(`[loadSessionState] Restored activeSidePanelPath: ${activeSidePanelPath}`);
        }
        logMessage(`[loadSessionState] Data received from session:`, data);
        if (data.tabsEverActive && Array.isArray(data.tabsEverActive) && data.tabsEverActive.length > 0) {
            logMessage(
                `%c[loadSessionState] SUCCESS: Found valid session data. Loading ${data.tabsEverActive.length} active tabs.`,
                'color: green;',
            );
            // Merged, not replaced: an event handler can add a tab while this load
            // is still in flight (the initialization runs on every worker start, and
            // the event that woke the worker races it), and replacing the set would
            // drop what the handler just recorded.
            for (const tabId of data.tabsEverActive) tabsEverActive.add(tabId);
            if (data.groupExpandedEver && typeof data.groupExpandedEver === 'object') {
                const entries = Object.entries(data.groupExpandedEver).map(([key, value]) => [
                    parseInt(key, 10),
                    value,
                ]);
                groupExpandedEver = new Map(entries);
            } else {
                groupExpandedEver = new Map();
            }
            logMessage(
                `[loadSessionState] Session state loaded. tabsEverActive: ${tabsEverActive.size}, groupExpandedEver: ${groupExpandedEver.size}.`,
            );
        } else {
            logMessage(
                `[loadSessionState] No active session data found. This is normal on extension startup or first run.`,
            );
            const persistentData = await chrome.storage.local.get('groupPrefixState');
            if (!persistentData.groupPrefixState) {
                logMessage('[loadSessionState] No persistent state found to rebuild from.');
                return;
            }

            // ONLY clear if we know we have data to rebuild
            tabsEverActive.clear();
            groupExpandedEver.clear();
            const groupPrefixState = new Map(Object.entries(persistentData.groupPrefixState));
            const allGroups = await chrome.tabGroups.query({});
            const allTabs = await chrome.tabs.query({});
            const tabsByGroup = new Map();
            for (const tab of allTabs) {
                if (tab.groupId !== -1) {
                    if (!tabsByGroup.has(tab.groupId)) {
                        tabsByGroup.set(tab.groupId, []);
                    }
                    tabsByGroup.get(tab.groupId).push(tab);
                }
            }
            for (const group of allGroups) {
                const groupTabs = tabsByGroup.get(group.id) || [];
                if (groupTabs.length === 0) continue;
                const currentBaseTitle = getBaseGroupName(group.title);
                let persistentState = null;
                const idBasedIdentifier = generateGroupIdentifier(currentBaseTitle, null, group.id);
                if (groupPrefixState.has(idBasedIdentifier)) {
                    persistentState = groupPrefixState.get(idBasedIdentifier);
                } else {
                    const countBasedIdentifier = generateGroupIdentifier(currentBaseTitle, groupTabs.length);
                    if (groupPrefixState.has(countBasedIdentifier)) {
                        persistentState = groupPrefixState.get(countBasedIdentifier);
                    }
                }
                if (persistentState) {
                    if (persistentState.expandedEver) {
                        groupExpandedEver.set(group.id, true);
                    }
                    if (persistentState.activeTabIndices && Array.isArray(persistentState.activeTabIndices)) {
                        for (const index of persistentState.activeTabIndices) {
                            if (index < groupTabs.length) {
                                const tabIdFromIndex = groupTabs[index].id;
                                tabsEverActive.add(tabIdFromIndex);
                            }
                        }
                    }
                }
            }
            logMessage(
                `%c[loadSessionState] REBUILD FINISHED. Final tabsEverActive size: ${tabsEverActive.size}.`,
                'color: green; font-weight: bold;',
            );
        }
        logMessage('[loadSessionState] State flagged as LOADED.');
    } catch (error) {
        console.error('Error loading or rebuilding session state, initializing to empty:', error);
    }
}
async function saveGroupInfoMap() {
    try {
        const mapAsObject = Object.fromEntries(groupInfoMap);
        await chrome.storage.session.set({
            groupInfoMap: mapAsObject,
        });
    } catch (error) {
        console.error('Error saving groupInfoMap to session:', error);
    }
}
async function rebuildGroupInfoMap() {
    logMessage('[rebuildGroupInfoMap] Rebuilding groupInfoMap with prioritized logic...');
    try {
        // --- PHASE 0: PREPARATION (No changes) ---
        const customRules = extensionSettings.customRules || [];
        const config = extensionSettings.clusterConfig || DEFAULT_CLUSTER_CONFIG;
        const allGroups = await chrome.tabGroups.query({});
        const allTabs = await chrome.tabs.query({});
        const tabsByGroupId = new Map();
        for (const tab of allTabs) {
            if (tab.groupId !== -1) {
                if (!tabsByGroupId.has(tab.groupId)) {
                    tabsByGroupId.set(tab.groupId, []);
                }
                tabsByGroupId.get(tab.groupId).push(tab);
            }
        }

        // --- PHASE 1: CLEANING OLD GROUPS (No changes) ---
        const currentGroupIds = new Set(allGroups.map((g) => g.id));
        for (const groupId of groupInfoMap.keys()) {
            if (!currentGroupIds.has(groupId)) {
                groupInfoMap.delete(groupId);
            }
        }

        // --- PHASE 2: RECONSTRUCTION AND SYNCHRONIZATION ---
        for (const group of allGroups) {
            const groupId = group.id;
            const currentUiTitle = group.title;
            const baseUiTitle = getBaseGroupName(currentUiTitle);
            const tabsInGroup = tabsByGroupId.get(groupId) || [];
            if (tabsInGroup.length === 0) {
                if (groupInfoMap.has(groupId)) groupInfoMap.delete(groupId);
                continue;
            }
            if (groupInfoMap.has(groupId)) {
                // ... (compact mode update logic, no changes)
                const existingInfo = groupInfoMap.get(groupId);
                const isCompactModeActive =
                    config.compactMode?.enabled && allGroups.length >= config.compactMode?.threshold;
                if (existingInfo.isCompact !== isCompactModeActive) {
                    existingInfo.isCompact = isCompactModeActive;
                    groupInfoMap.set(groupId, existingInfo);
                }
                continue;
            }

            // Identification logic
            let identifiedInfo = null;
            const identifier = generateGroupIdentifier(baseUiTitle, null, group.id);
            // Chrome hands out new group ids when it restores a session, so the
            // identifier built from the id cannot match once the browser has been
            // closed. The state is written under a second identifier — the name plus
            // the number of tabs — which does not depend on the id, so it is worth
            // asking for it before falling back to guessing the group from its tabs.
            const persistentState =
                groupPrefixState.get(identifier) ||
                groupPrefixState.get(generateGroupIdentifier(baseUiTitle, tabsInGroup.length));
            if (persistentState && persistentState.type && persistentState.key) {
                identifiedInfo = {
                    type: persistentState.type,
                    key: persistentState.key,
                };
            } else if (baseUiTitle !== '') {
                identifiedInfo = inferGroupTypeFromTabs(group.id, tabsInGroup, currentUiTitle, customRules, config);
            }
            if (!identifiedInfo) {
                const typeFromTitle = getGroupType(currentUiTitle);
                let keyFromTitle = baseUiTitle;
                if (typeFromTitle === 'special') {
                    const configEntry = Object.values(config.specialGroups).find((c) => c.name === baseUiTitle);
                    if (configEntry) keyFromTitle = configEntry.key;
                }
                identifiedInfo = {
                    type: typeFromTitle,
                    key: keyFromTitle,
                };
            }

            // --- NEW TITLE DECISION LOGIC ---
            if (identifiedInfo) {
                let definitiveBaseTitle;

                // PRIORITY 1: Use the title from the persistent state if it exists and is valid.
                // This preserves user renames.
                if (persistentState && persistentState.title && persistentState.title.trim() !== '') {
                    definitiveBaseTitle = persistentState.title;
                    logMessage(
                        `[Rebuild] Group ${groupId}: Using title from persistent state: "${definitiveBaseTitle}"`,
                    );
                }
                // PRIORITY 2: If the group is special, use its config name as a fallback.
                else if (identifiedInfo.type === 'special') {
                    const specialConfig = Object.values(config.specialGroups).find((c) => c.key === identifiedInfo.key);
                    definitiveBaseTitle = specialConfig ? specialConfig.name : identifiedInfo.key;
                    logMessage(`[Rebuild] Group ${groupId}: Using title from special config: "${definitiveBaseTitle}"`);
                }
                // PRIORITY 3: As a last resort, use the identified key (for domains, rules, etc.)
                else {
                    definitiveBaseTitle = identifiedInfo.key;
                    logMessage(`[Rebuild] Group ${groupId}: Using key as title: "${definitiveBaseTitle}"`);
                }
                const isCompact =
                    persistentState?.isCompact ||
                    (config.compactMode?.enabled && allGroups.length >= config.compactMode?.threshold);

                // Pass the definitive title to the format function.
                const fullTitle = constructFullTitle(
                    identifiedInfo.type,
                    identifiedInfo.key,
                    definitiveBaseTitle,
                    config,
                );
                groupInfoMap.set(groupId, {
                    type: identifiedInfo.type,
                    key: identifiedInfo.key,
                    title: fullTitle,
                    isCompact: isCompact,
                });
            }
        }
        await saveGroupInfoMap();
        logMessage(`[rebuildGroupInfoMap] Map updated with ${groupInfoMap.size} groups.`);
    } catch (error) {
        console.error('Catastrophic error in rebuildGroupInfoMap:', error);
    }
}
async function syncWithExistingGroups() {
    try {
        const allCurrentGroups = await chrome.tabGroups.query({});
        const currentGroupIds = new Set(allCurrentGroups.map((g) => g.id));
        logMessage(
            `%c[syncWithExistingGroups] Starting sync. groupPrefixState size BEFORE filtering: ${groupPrefixState.size}.`,
            'color: #D35400; font-weight: bold;',
        );
        // One query for every tab instead of one query per group: with many groups
        // this loop was the single biggest source of round trips to the browser.
        const tabCountByGroupId = new Map();
        for (const tab of await chrome.tabs.query({})) {
            if (tab.groupId === -1) continue;
            tabCountByGroupId.set(tab.groupId, (tabCountByGroupId.get(tab.groupId) || 0) + 1);
        }

        const validIdentifiers = new Set();
        for (const group of allCurrentGroups) {
            const cleanTitle = getBaseGroupName(group.title);
            validIdentifiers.add(generateGroupIdentifier(cleanTitle, null, group.id));
            validIdentifiers.add(generateGroupIdentifier(cleanTitle, tabCountByGroupId.get(group.id) || 0));
        }
        for (const groupId of groupIdentifierMap.keys()) {
            if (!currentGroupIds.has(groupId)) {
                groupIdentifierMap.delete(groupId);
                groupInfoMap.delete(groupId);
            }
        }
        const validGroupPrefixState = new Map();
        for (const [identifier, state] of groupPrefixState) {
            if (validIdentifiers.has(identifier)) {
                validGroupPrefixState.set(identifier, state);
            }
        }
        if (validGroupPrefixState.size >= 0 && !windowsRemove) {
            groupPrefixState = validGroupPrefixState;
        }
        logMessage(
            `[syncWithExistingGroups] Sync finished. groupPrefixState size AFTER filtering: ${groupPrefixState.size}.`,
        );
        await saveGroupPrefixState();
    } catch (error) {
        console.error('Error syncing states with existing groups:', error);
    }
}
function shouldIgnoreEventDuringInitialization(listenerName, itemId) {
    if (isInitializing) {
        logMessage(`[shouldIgnoreEvent] Event in ${listenerName} for item ${itemId} ignored during initialization.`);
        return true;
    }
    return false;
}
async function loadOrRebuildGroupInfoMap() {
    try {
        const sessionData = await chrome.storage.session.get('groupInfoMap');
        if (sessionData.groupInfoMap && Object.keys(sessionData.groupInfoMap).length > 0) {
            const entries = Object.entries(sessionData.groupInfoMap).map(([key, value]) => [parseInt(key, 10), value]);
            groupInfoMap = new Map(entries);
            logMessage(`[Init] groupInfoMap loaded from session with ${groupInfoMap.size} entries.`);
        } else {
            console.warn('[Init] No groupInfoMap in session. Rebuilding...');
            await rebuildGroupInfoMap();
        }
    } catch (error) {
        console.error('Error loading or rebuilding groupInfoMap. Rebuilding as a fallback.', error);
        await rebuildGroupInfoMap();
    }
}
async function loadExtensionSettings() {
    try {
        const { ruleStorageArea = 'sync' } = await chrome.storage.local.get('ruleStorageArea');
        const storage = ruleStorageArea === 'local' ? chrome.storage.local : chrome.storage.sync;
        const settingsKeys = [
            'userPrefixes',
            'sortGroupsAlphabetically',
            'enableCollapseTimer',
            'inactiveCollapseTime',
            'activeCollapseTime',
            'miscGroupSortOption',
            'enablePrefixes',
            'clusterConfig',
            'clusteringEnabled',
            'customRules',
            'linkPreviewEnabled',
            'linkPreviewTriggerKey',
        ];
        const data = await storage.get(settingsKeys);
        const storedConfig = data.clusterConfig || {};
        const mergedSpecialGroups = {};
        for (const key in DEFAULT_CLUSTER_CONFIG.specialGroups) {
            mergedSpecialGroups[key] = {
                ...DEFAULT_CLUSTER_CONFIG.specialGroups[key],
                ...(storedConfig.specialGroups?.[key] || {}),
            };
        }
        extensionSettings = {
            userPrefixes: data.userPrefixes || DEFAULT_USER_PREFIXES,
            sortGroupsAlphabetically: data.sortGroupsAlphabetically ?? true,
            enableCollapseTimer: data.enableCollapseTimer ?? false,
            inactiveCollapseTime: data.inactiveCollapseTime ?? INACTIVITY_THRESHOLD_INACTIVE_GROUP,
            activeCollapseTime: data.activeCollapseTime ?? INACTIVITY_THRESHOLD_ACTIVE_GROUP,
            miscGroupSortOption: data.miscGroupSortOption ?? 'start',
            enablePrefixes: data.enablePrefixes ?? false,
            clusterConfig: {
                ...DEFAULT_CLUSTER_CONFIG,
                ...storedConfig,
                specialGroups: mergedSpecialGroups,
                compactMode: {
                    ...DEFAULT_CLUSTER_CONFIG.compactMode,
                    ...(storedConfig.compactMode || {}),
                },
            },
            clusteringEnabled: data.clusteringEnabled ?? true,
            customRules: data.customRules || [],
            linkPreviewEnabled: data.linkPreviewEnabled ?? true,
            linkPreviewTriggerKey: data.linkPreviewTriggerKey || '',
        };
        lastAppliedClusterConfig = JSON.parse(JSON.stringify(extensionSettings.clusterConfig));
    } catch (error) {
        console.error('Error loading extension settings:', error);
    }
}
async function ensureSessionStateLoaded() {
    // If we have data, we assume it's loaded
    if (tabsEverActive.size > 0 || groupExpandedEver.size > 0) {
        return;
    }

    // If empty, it could be a cold start. Force load.
    logMessage('[Safety Check] Memory state empty inside event handler. Forcing load.');
    await loadSessionState();
}
async function initializeExtensionStates(isFirstInstall = false) {
    logMessage('Initializing extension states...');
    isInitializing = true;
    try {
        //await injectContentScriptsInAllTabs();
        // Loading all configuration.
        await loadTabModes();
        checkSchedules();
        await loadExtensionSettings();
        await updatePinState();

        // The rest of the initialization continues as before,
        // using the values already loaded in 'extensionSettings'.
        loadUserDefinedPrefixes();
        await loadGroupPrefixState();
        await rebuildGroupIdentifierMap();
        await loadOrRebuildGroupInfoMap();
        await cleanupOrphanScreenshots();
        await loadSessionState();
        await syncWithExistingGroups();
        if (isFirstInstall) {
            logMessage('First install: triggering full regroup command.');
            await regroupAllTabsCommand(); // Destructive function call
        }
        await setupContextMenus();
        const windows = await chrome.windows.getAll();
        for (const window of windows) {
            await updateAllGroupPrefixes(window.id, null);
        }
    } catch (error) {
        console.error('Error during extension state initialization:', error);
    } finally {
        setTimeout(async () => {
            isInitializing = false;
            logMessage('States synchronized.');
            groupTabs();
        }, 1000);
    }
}
async function setupDefaultSettings() {
    logMessage('First install detected. Saving default settings.');
    const defaultSettings = {
        userPrefixes: DEFAULT_USER_PREFIXES,
        sortGroupsAlphabetically: true,
        enableCollapseTimer: false,
        inactiveCollapseTime: INACTIVITY_THRESHOLD_INACTIVE_GROUP,
        activeCollapseTime: INACTIVITY_THRESHOLD_ACTIVE_GROUP,
        miscGroupSortOption: 'start',
        enablePrefixes: false,
        clusterConfig: DEFAULT_CLUSTER_CONFIG,
        clusteringEnabled: true,
        customRules: [],
        isAllExpanded: false,
        realTimeValidation: false,
        sortAlphaPreference: false,
        activeTheme: DEFAULT_SYSTEM_THEME,
        rulesNavSidePanel: true,
        discardingEnabled: true,
        discardingTimeMinutes: 60,
        linkPreviewEnabled: true,
        linkPreviewTriggerKey: '',
    };
    try {
        await chrome.storage.sync.set(defaultSettings);
        await chrome.storage.local.set(defaultSettings);
        await chrome.storage.local.set({
            ruleStorageArea: 'sync',
        });
        logMessage('Default settings have been successfully saved.');
    } catch (error) {
        console.error('Failed to save default settings on install:', error);
    }
}
async function checkSchedules() {
    let {
        schedules = {},
        activeScheduledThemeName,
        themeToRevertTo,
        activeTheme,
    } = await chrome.storage.local.get(['schedules', 'activeScheduledThemeName', 'themeToRevertTo', 'activeTheme']);
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

    let themeNameToActivate = null;
    let activeScheduleInfo = null;
    let storageNeedsUpdate = false;
    for (const themeName in schedules) {
        const originalCount = schedules[themeName].length;
        schedules[themeName] = schedules[themeName].filter((schedule) => {
            return schedule.type !== 'onetime' || new Date(schedule.endDateTime) > now;
        });
        if (schedules[themeName].length < originalCount) {
            storageNeedsUpdate = true;
        }
        if (schedules[themeName].length === 0) {
            delete schedules[themeName];
            continue;
        }
        for (const schedule of schedules[themeName]) {
            let isActiveNow = false;
            if (schedule.type === 'onetime') {
                isActiveNow = now >= new Date(schedule.startDateTime) && now < new Date(schedule.endDateTime);
            } else {
                // repeating
                const dayMatch = schedule.days.includes(currentDay);
                const timeMatch = currentTime >= schedule.startTime && currentTime < schedule.endTime;
                isActiveNow = dayMatch && timeMatch;
            }
            if (isActiveNow) {
                themeNameToActivate = themeName;
                activeScheduleInfo = schedule; // Save active schedule info
                break;
            }
        }
        if (themeNameToActivate) {
            break;
        }
    }
    if (storageNeedsUpdate) {
        await chrome.storage.local.set({
            schedules,
        });
    }
    if (themeNameToActivate) {
        if (themeNameToActivate !== activeScheduledThemeName) {
            logMessage(`[Background] Activating scheduled theme: ${themeNameToActivate}`);
            let themeData;

            // FIX: Use storageArea from schedule if available
            if (activeScheduleInfo && activeScheduleInfo.storageArea) {
                if (activeScheduleInfo.storageArea === 'local') {
                    const { savedThemes = [] } = await chrome.storage.local.get('savedThemes');
                    themeData = savedThemes.find((t) => t.name === themeNameToActivate);
                } else {
                    const { savedThemes = [] } = await chrome.storage.sync.get('savedThemes');
                    themeData = savedThemes.find((t) => t.name === themeNameToActivate);
                }
            } else {
                // Legacy behavior: search both, prioritize sync
                const { savedThemes: syncThemes = [] } = await chrome.storage.sync.get('savedThemes');
                const { savedThemes: localThemes = [] } = await chrome.storage.local.get('savedThemes');
                themeData = [...syncThemes, ...localThemes].find((t) => t.name === themeNameToActivate);
            }
            if (themeData) {
                if (!activeScheduledThemeName) {
                    await chrome.storage.local.set({
                        themeToRevertTo: activeTheme || null,
                    });
                }
                await chrome.storage.local.set({
                    activeTheme: themeData,
                    activeScheduledThemeName: themeNameToActivate,
                });
                chrome.runtime.sendMessage({
                    action: 'themeChanged',
                });
                // A scheduled theme changes the look of every page on its own, so it
                // says so. The reminder the user wrote takes the place of the default
                // line when there is one; before, no reminder meant no notice at all
                // and the theme just changed with nothing to explain it.
                const reminder = activeScheduleInfo?.reminder;
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '/assets/icons/icon128.png',
                    title: reminder
                        ? getI18nMsg('themeReminderNotificationTitle', [themeNameToActivate]) ||
                          `Theme Reminder: ${themeNameToActivate}`
                        : getI18nMsg('themeScheduleActivated') || 'Scheduled theme applied',
                    message:
                        reminder ||
                        getI18nMsg('themeScheduleActivatedBody', [themeNameToActivate]) ||
                        `${themeNameToActivate} is now in use`,
                });
            }
        }
    } else {
        if (activeScheduledThemeName) {
            logMessage(`[Background] Deactivating scheduled theme. Reverting to:`, themeToRevertTo);
            await chrome.storage.local.set({
                activeTheme: themeToRevertTo || null,
            });
            await chrome.storage.local.remove(['activeScheduledThemeName', 'themeToRevertTo']);
            chrome.runtime.sendMessage({
                action: 'themeChanged',
            });
            // The end of the window changes the look back, which is just as worth
            // saying as the start.
            chrome.notifications.create({
                type: 'basic',
                iconUrl: '/assets/icons/icon128.png',
                title: getI18nMsg('themeScheduleDeactivated') || 'Scheduled theme ended',
                message: getI18nMsg('themeScheduleDeactivatedBody') || 'Back to your previous theme',
            });
        }
    }
}

// ============================================================
// AUTOMATIC TAB DISCARDING / RAM MEMORY SAVER (1 Hour Inactivity)
// ============================================================
async function suspendInactiveTabsIntelligently() {
    try {
        const data = await chrome.storage.local.get(['discardingEnabled', 'discardingTimeMinutes']);
        const enabled = data.discardingEnabled !== false; // default true
        if (!enabled) return;
        const minutes = typeof data.discardingTimeMinutes === 'number' ? data.discardingTimeMinutes : 60;
        const timeoutMs = minutes * 60 * 1000;
        const allTabs = await chrome.tabs.query({});
        const now = Date.now();
        for (const tab of allTabs) {
            if (tab.active || tab.audible || tab.pinned || tab.discarded) continue;
            let lastActiveTime = tab.lastAccessed;
            if (!lastActiveTime && tab.groupId !== -1 && tab.groupId !== undefined) {
                lastActiveTime = lastActivity[tab.groupId];
            }
            if (lastActiveTime && now - lastActiveTime >= timeoutMs) {
                logMessage(
                    `[MemorySaver] Suspending inactive tab ${tab.id} (${tab.title}) after ${minutes}m to free RAM.`,
                );
                try {
                    await chrome.tabs.discard(tab.id);
                } catch (e) {
                    console.warn(`[MemorySaver] Error discarding tab ${tab.id}:`, e);
                }
            }
        }
    } catch (error) {
        console.warn('[MemorySaver] Error during tab suspension interval:', error);
    }
}
async function executeWithRetries(action, operationDescription, maxRetries = MAX_RETRIES, retryDelay = RETRY_DELAY) {
    let retries = 0;
    let result;
    while (retries < maxRetries) {
        try {
            result = await action();
            if (operationDescription === 'loadGroupPrefixState in init' && (!result || result.size === 0)) {
                retries++;
                logMessage(
                    `[executeWithRetries] Attempt ${retries}/${maxRetries} for "${operationDescription}" failed (undefined result). Retrying...`,
                );
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
                continue;
            }
            return result;
        } catch (error) {
            const errorMessage = error.message || '';
            // Retry if a user is dragging tabs, as this locks the UI.
            // Retry if a user is dragging tabs, as this locks the UI.
            if (errorMessage.includes('dragging')) {
                retries++;
                logMessage(
                    `[executeWithRetries] Attempt ${retries}/${maxRetries} for "${operationDescription}" failed due to dragging. Retrying...`,
                );
                if (retries < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                } else {
                    console.warn(
                        `[executeWithRetries] Failed to execute "${operationDescription}" after ${maxRetries} retries due to persistent dragging.`,
                    );
                    return false;
                }
            } else if (
                errorMessage.includes('No group with id') ||
                errorMessage.includes('Invalid tab group ID') ||
                errorMessage.includes('No tab with id')
            ) {
                console.warn(`[executeWithRetries] Cannot execute "${operationDescription}": Target does not exist.`);
                return false;
            } else {
                console.error(`[executeWithRetries] Unrecoverable error during "${operationDescription}":`, error);
                throw error;
            }
        }
    }
    return false;
}
function clearBackgroundBookmarkCache(notifyUI = true) {
    bookmarkTreeCache = null;
    duplicateUrlSetCache = null;
    logMessage('Bookmark cache in background invalidated due to a change.');
    // Optional: Notify the UI if it is open so it can update.
    if (notifyUI) {
        chrome.runtime.sendMessage({
            action: 'bookmarksChanged',
        });
    }
}

// We listen to all events that may modify bookmarks
