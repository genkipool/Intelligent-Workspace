/**
 * [AI INSTRUCTION]
 * This module handles all the analytical logic for tab groups:
 * - Inferring group types from tab contents
 * - Repairing empty titles
 * - Updating prefix markers based on tab states
 */

function determineWarningStatesForGroupsInWindow(groupsInWindow, isCompactActive) {
    if (isCompactActive || !groupsInWindow || groupsInWindow.length === 0) return {};

    const baseNameCounts = {};
    for (const group of groupsInWindow) {
        const baseName = getBaseGroupName(group.title);
        baseNameCounts[baseName] = (baseNameCounts[baseName] || 0) + 1;
    }

    const needsWarning = {};
    for (const group of groupsInWindow) {
        const info = groupInfoMap.get(group.id);
        if (info && !info.isCompact) {
            const baseName = getBaseGroupName(group.title);
            needsWarning[group.id] = baseNameCounts[baseName] > 1;
        } else if (!info) {
            needsWarning[group.id] = false;
        }
    }

    return needsWarning;
}

function syncGroupState(group, newState, groupPrefixStateRef, groupIdentifierMapRef, groupInfoMapRef, isCompactActive) {
    const newCleanTitle = getBaseGroupName(group.title);

    const oldIdentifierById = groupIdentifierMapRef.get(group.id);
    const oldState = oldIdentifierById ? groupPrefixStateRef.get(oldIdentifierById) : null;

    if (oldState && oldState.title) {
        const oldBaseTitle = getBaseGroupName(oldState.title);

        if (oldBaseTitle !== newCleanTitle && !isCompactActive && !newState.isCompact && newCleanTitle.length >= 4) {
            logMessage(
                `[syncGroupState] User rename detected for group ${group.id}: from "${oldBaseTitle}" to "${newCleanTitle}".`,
            );

            if (isTitleInvalidForUpdate(newCleanTitle)) {
                console.warn(
                    `[syncGroupState] Title update blocked for group ${group.id} because the new title "${newCleanTitle}" is invalid.`,
                );
            } else {
                // Only if the title is valid, we proceed to update the state.
                newState.title = newCleanTitle;

                const info = groupInfoMapRef.get(group.id);
                if (info && !isCompactActive && !info.isCompact && newCleanTitle.length >= 4) {
                    info.title = newCleanTitle;
                    groupInfoMapRef.set(group.id, info);
                }
            }

            const oldIdentifierByCount = generateGroupIdentifier(oldBaseTitle, oldState.tabCount);
            groupPrefixStateRef.delete(oldIdentifierById);
            groupPrefixStateRef.delete(oldIdentifierByCount);
        }
    }

    const newIdentifierById = generateGroupIdentifier(newCleanTitle, null, group.id);
    const newIdentifierByCount = generateGroupIdentifier(newCleanTitle, newState.tabCount);

    groupIdentifierMapRef.set(group.id, newIdentifierById);
    groupPrefixStateRef.set(newIdentifierById, newState);
    groupPrefixStateRef.set(newIdentifierByCount, newState);
}

function inferGroupTypeFromTabs(groupId, tabsInGroup, groupTitle, customRules, config) {
    if (shouldIgnoreEventDuringInitialization('inferGroupTypeFromTabs', tabsInGroup)) return;

    // ADDED: Security check for the config object.
    if (!config) {
        console.warn(`[inferGroupTypeFromTabs] Function called without a valid config object. Using the default.`);
        config = DEFAULT_CLUSTER_CONFIG;
    }

    logMessage(
        `[inferGroupTypeFromTabs] Starting REVISED inference for group "${groupTitle}" with ${tabsInGroup.length} tabs.`,
    );

    const groupBaseTitle = getBaseGroupName(groupTitle);
    if (!groupBaseTitle || groupBaseTitle.trim() === '') {
        logMessage(`[inferGroupTypeFromTabs] -> SUCCESS (Empty Title): Group title is empty. Forcing 'manual' type.`);
        return {
            type: 'manual',
            key: groupBaseTitle,
        };
    }

    const eligibleTabs = tabsInGroup.filter((tab) => tab.url && tab.url !== 'chrome://newtab/');

    if (eligibleTabs.length < tabsInGroup.length) {
        logMessage(
            `[inferGroupTypeFromTabs] Ignored ${tabsInGroup.length - eligibleTabs.length} 'chrome://newtab/' tabs. Processing ${eligibleTabs.length} eligible tabs.`,
        );
    }

    if (eligibleTabs.length === 0) {
        logMessage(`[inferGroupTypeFromTabs] -> No eligible tabs left after filtering. Returning 'manual'.`);
        return {
            type: 'manual',
            key: getBaseGroupName(groupTitle),
        };
    }

    // FIXED: eligibleTabs is used instead of tabsInGroup.
    const matchingRuleName = getMatchingRule(eligibleTabs, customRules);
    if (matchingRuleName) {
        logMessage(
            `[inferGroupTypeFromTabs] -> SUCCESS (Content): All tabs match rule '${matchingRuleName}'. Type: 'rule'.`,
        );
        return {
            type: 'rule',
            key: matchingRuleName,
        };
    }

    // FIXED: eligibleTabs[0] is used instead of tabsInGroup[0] to avoid errors with groups containing only newtabs.
    const firstTab = eligibleTabs[0];
    let inferredSpecialKey = null;
    let categoryChecker;

    if (firstTab.url.startsWith('chrome://')) {
        inferredSpecialKey = 'chrome';
        categoryChecker = (tabUrl) => tabUrl.startsWith('chrome://');
    } else if (firstTab.url.startsWith('file://')) {
        inferredSpecialKey = 'files';
        categoryChecker = (tabUrl) => tabUrl.startsWith('file://');
    } else if (firstTab.url.startsWith('chrome-extension://')) {
        inferredSpecialKey = 'extensions';
        categoryChecker = (tabUrl) => tabUrl.startsWith('chrome-extension://');
    }

    if (inferredSpecialKey && categoryChecker && eligibleTabs.every((tab) => categoryChecker(tab.url))) {
        const specialConfig = config.specialGroups[inferredSpecialKey];
        if (specialConfig) {
            logMessage(
                `[inferGroupTypeFromTabs] -> SUCCESS (Content): All tabs are homogeneous special category '${inferredSpecialKey}'. Type: 'special'.`,
            );
            return {
                type: 'special',
                key: specialConfig.key,
            };
        }
    }
    const getIpLikeKey = (tabUrl) => {
        try {
            const { hostname, port } = new URL(tabUrl);
            const portPrefix = port ? `:${port}` : '';
            if (isLocalhost(hostname)) return `Localhost${portPrefix}`;
            if (isIPAddress(hostname)) return formatIPGroupName(hostname, portPrefix);
        } catch (e) {}
        return null;
    };

    const firstIpKey = getIpLikeKey(firstTab.url);
    if (firstIpKey && eligibleTabs.every((tab) => getIpLikeKey(tab.url) === firstIpKey)) {
        logMessage(
            `[inferGroupTypeFromTabs] -> SUCCESS (Content): All tabs are homogeneous IP/Localhost category '${firstIpKey}'. Type: 'special'.`,
        );
        return {
            type: 'special',
            key: firstIpKey,
        };
    }

    const useSubdomain = config?.subdomainsEnabled ?? false;
    const commonDomain = getCommonDomain(eligibleTabs, useSubdomain);
    if (commonDomain) {
        logMessage(
            `[inferGroupTypeFromTabs] -> SUCCESS (Content): All tabs share common domain '${commonDomain}'. Type: 'domain'.`,
        );
        return {
            type: 'domain',
            key: commonDomain,
        };
    }

    logMessage(`[inferGroupTypeFromTabs] -> INFO: Tab content is heterogeneous. Falling back to title-based checks.`);

    if (config.specialGroups) {
        for (const key in config.specialGroups) {
            const specialGroupConfig = config.specialGroups[key];
            if (specialGroupConfig.name && specialGroupConfig.name.toLowerCase() === groupBaseTitle.toLowerCase()) {
                logMessage(
                    `[inferGroupTypeFromTabs] -> SUCCESS (Title Fallback): Title "${groupBaseTitle}" matches configured special group '${specialGroupConfig.name}'. Type: 'special'.`,
                );
                return {
                    type: 'special',
                    key: specialGroupConfig.key,
                };
            }
        }
    }

    logMessage(`[inferGroupTypeFromTabs] -> FINAL: No automatic type could be inferred. Group is 'manual'.`);
    return {
        type: 'manual',
        key: groupBaseTitle,
    };
}

async function repairEmptyGroupTitles(groupsInWindow, isEdit = false, tabsInWindow = null) {
    let wasTitleRestored = false;

    // The tabs of the whole window are already in hand at the only call site that
    // matters, so index them once instead of issuing a query per group.
    let tabsByGroupId = null;
    if (tabsInWindow) {
        tabsByGroupId = new Map();
        for (const tab of tabsInWindow) {
            if (tab.groupId === -1) continue;
            if (!tabsByGroupId.has(tab.groupId)) tabsByGroupId.set(tab.groupId, []);
            tabsByGroupId.get(tab.groupId).push(tab);
        }
    }
    const tabsOfGroup = async (groupId) =>
        tabsByGroupId ? tabsByGroupId.get(groupId) || [] : await chrome.tabs.query({ groupId });

    for (const group of groupsInWindow) {
        let needsRepair = !group.title || group.title.trim() === '';

        if (needsRepair) {
            logMessage(
                `[repairEmptyGroupTitles] Detected group ${group.id} with an empty title. Starting restoration.`,
            );

            let identifiedInfo = groupInfoMap.get(group.id);

            if (!identifiedInfo || !identifiedInfo.type || !identifiedInfo.key) {
                const tabsInGroup = await tabsOfGroup(group.id);
                if (tabsInGroup.length > 0) {
                    const allTabsLoaded = tabsInGroup.every(
                        (tab) => tab.url !== '' && tab.url !== 'about:blank' && tab.url !== 'chrome://blank',
                    );
                    if (allTabsLoaded) {
                        const customRules = extensionSettings.customRules || (await getRulesFromStorage());
                        const config = extensionSettings.clusterConfig || DEFAULT_CLUSTER_CONFIG;
                        const inferredInfo = inferGroupTypeFromTabs(
                            group.id,
                            tabsInGroup,
                            group.title,
                            customRules,
                            config,
                        );

                        if (inferredInfo) {
                            identifiedInfo = inferredInfo;
                            groupInfoMap.set(group.id, { ...groupInfoMap.get(group.id), ...inferredInfo });
                            await saveGroupInfoMap();
                            logMessage(
                                `[repairEmptyGroupTitles] Identity inferred from tabs for group ${group.id}. Type: '${inferredInfo.type}'.`,
                            );
                        }
                    } else {
                        logMessage(
                            `[repairEmptyGroupTitles] Deferring title restoration for group ${group.id} because its tabs are still loading.`,
                        );
                    }
                }
            }

            if (identifiedInfo && identifiedInfo.key && !isEdit) {
                const restoredTitle = reconstructFullTitleFromInfo(identifiedInfo.key, group.id);

                const finalInfo = groupInfoMap.get(group.id);
                if (finalInfo) {
                    finalInfo.title = restoredTitle;
                    groupInfoMap.set(group.id, finalInfo);
                }

                const success = await executeWithRetries(
                    async () => await chrome.tabGroups.update(group.id, { title: restoredTitle }),
                    `restoring title for group ${group.id} to "${restoredTitle}"`,
                );

                if (success) {
                    logMessage(
                        `[repairEmptyGroupTitles] Successfully restored title for group ${group.id} to "${restoredTitle}".`,
                    );
                    wasTitleRestored = true;
                    group.title = restoredTitle;
                }
            } else if (!isEdit) {
                if (identifiedInfo?.type === 'manual') {
                    console.warn(
                        `[repairEmptyGroupTitles] Group ${group.id} is manual and has an empty title. It will not be dissolved.`,
                    );
                } else {
                    console.warn(
                        `[repairEmptyGroupTitles] FAILED: Could not determine identity for non-manual group ${group.id}. Dissolving group.`,
                    );
                    const tabsToUngroup = await tabsOfGroup(group.id);
                    if (tabsToUngroup.length > 0) {
                        await executeWithRetries(
                            async () => await chrome.tabs.ungroup(tabsToUngroup.map((t) => t.id)),
                            `dissolving unidentifiable group ${group.id}`,
                        );
                    }
                }
            }
        }
    }

    return wasTitleRestored;
}

async function updateAllGroupPrefixes(
    windowId,
    targetGroupId = null,
    isEdit = false,
    // Cached parameters. If not provided, the query is made as before.
    cachedGroupsInWindow = null,
    cachedTabsInWindow = null,
    groupNeedsWarning = false,
) {
    logMessage(
        `[updateAllGroupPrefixes START] Executing for windowId: ${windowId}. TargetGroupId: ${targetGroupId ?? 'All'}. IsEdit: ${isEdit}.`,
    );

    if (shouldIgnoreEventDuringInitialization('updateAllGroupPrefixes', targetGroupId)) {
        logMessage(`[updateAllGroupPrefixes] Execution skipped during initialization.`);
        return;
    }

    // If we don't receive cached data, we query it (maintains compatibility)
    let allGroupsInWindow, tabsInWindow;

    if (cachedGroupsInWindow && cachedTabsInWindow) {
        allGroupsInWindow = cachedGroupsInWindow;
        tabsInWindow = cachedTabsInWindow;
        logMessage(
            `[updateAllGroupPrefixes] Using cached data. Groups: ${allGroupsInWindow.length}, Tabs: ${tabsInWindow.length}.`,
        );
    } else {
        logMessage(`[updateAllGroupPrefixes] Fetching fresh data from Chrome API.`);
        allGroupsInWindow = await chrome.tabGroups.query({ windowId });
        tabsInWindow = await chrome.tabs.query({ windowId });
        logMessage(
            `[updateAllGroupPrefixes] Fetched data. Groups: ${allGroupsInWindow.length}, Tabs: ${tabsInWindow.length}.`,
        );
    }

    const wasTitleRestored = await repairEmptyGroupTitles(allGroupsInWindow, isEdit, tabsInWindow);
    if (wasTitleRestored) {
        logMessage(`[updateAllGroupPrefixes] Titles were restored. Re-fetching groups to get latest state.`);
        allGroupsInWindow = await chrome.tabGroups.query({ windowId });
    }

    const prefixesEnabled = extensionSettings.enablePrefixes ?? false;
    logMessage(`[updateAllGroupPrefixes] Prefixes are currently ${prefixesEnabled ? 'ENABLED' : 'DISABLED'}.`);

    const isCompactActive = isCompactModeActive(allGroupsInWindow);
    logMessage(`[updateAllGroupPrefixes] Compact mode is ${isCompactActive ? 'ACTIVE' : 'INACTIVE'} for this window.`);

    const needsWarningMap = determineWarningStatesForGroupsInWindow(allGroupsInWindow, isCompactActive);
    logMessage(
        `[updateAllGroupPrefixes] Warning states calculated: ${JSON.stringify(Object.fromEntries(Object.entries(needsWarningMap).filter(([k, v]) => v)))}.`,
    );

    const updatePromises = allGroupsInWindow.map(async (group) => {
        if (targetGroupId && group.id !== targetGroupId) return;

        logMessage(`[updateAllGroupPrefixes -> Loop] Processing Group ID: ${group.id}, Title: "${group.title}".`);

        const groupInfo = groupInfoMap.get(group.id);
        if (!groupInfo) {
            console.warn(`[updateAllGroupPrefixes -> Loop] No info found for group ${group.id}. Skipping.`);
            return;
        }

        const oldIdentifier = groupIdentifierMap.get(group.id);
        const oldState = oldIdentifier ? groupPrefixState.get(oldIdentifier) : null;

        const groupTabs = tabsInWindow.filter((tab) => tab.groupId === group.id);
        let newUiTitle = group.title;
        const baseNameFromInfoTitle = getBaseGroupName(groupInfo.title);
        const baseNameFromInfoKey = groupInfo.key;
        const definitiveBaseName = baseNameFromInfoTitle || baseNameFromInfoKey;
        logMessage(
            `[updateAllGroupPrefixes -> Loop] Group ${group.id}: Definitive base name is "${definitiveBaseName}".`,
        );

        const isCurrentlyExpanded = !group.collapsed;
        const wasEverExpanded = groupExpandedEver.get(group.id) || isCurrentlyExpanded;
        const anyTabInGroupEverActive = groupTabs.some((tab) => tabsEverActive.has(tab.id));

        logMessage(
            `[updateAllGroupPrefixes -> Loop] Group ${group.id} State: isCurrentlyExpanded=${isCurrentlyExpanded}, wasEverExpanded=${wasEverExpanded}, anyTabInGroupEverActive=${anyTabInGroupEverActive}`,
        );

        if (isCompactActive) {
            logMessage(`[updateAllGroupPrefixes -> Loop] Group ${group.id}: Applying COMPACT mode logic.`);
            let titleCore;
            if (prefixesEnabled) {
                const finalPrefix = determinePotentialPrefix(
                    group.id,
                    groupTabs,
                    !group.collapsed,
                    isEdit,
                    groupNeedsWarning,
                );
                const prefixMarker = finalPrefix.trim();
                titleCore = prefixMarker.length >= 4 ? prefixMarker : definitiveBaseName.charAt(0).toUpperCase();
                logMessage(
                    `[updateAllGroupPrefixes -> Loop] Group ${group.id} (Compact): Prefixes enabled. finalPrefix="${finalPrefix.trim()}", titleCore="${titleCore}".`,
                );
            } else {
                titleCore = definitiveBaseName.charAt(0).toUpperCase();
                logMessage(
                    `[updateAllGroupPrefixes -> Loop] Group ${group.id} (Compact): Prefixes disabled. titleCore="${titleCore}".`,
                );
            }
            newUiTitle = reconstructFullTitleFromInfo(titleCore, group.id);
        } else {
            logMessage(`[updateAllGroupPrefixes -> Loop] Group ${group.id}: Applying NORMAL mode logic.`);
            let fullBaseNameWithMarkers = groupInfo.type === 'manual' ? groupInfo.key : groupInfo.title;
            if (prefixesEnabled) {
                const finalPrefix = determinePotentialPrefix(
                    group.id,
                    groupTabs,
                    !group.collapsed,
                    isEdit,
                    groupNeedsWarning,
                );
                const warningPrefix = needsWarningMap[group.id] ? CURRENT_PREFIX_WARNING : '';
                newUiTitle = warningPrefix + finalPrefix + fullBaseNameWithMarkers;
                logMessage(
                    `[updateAllGroupPrefixes -> Loop] Group ${group.id} (Normal): Prefixes enabled. warningPrefix="${warningPrefix.trim()}", finalPrefix="${finalPrefix.trim()}", baseName="${fullBaseNameWithMarkers}".`,
                );
            } else {
                newUiTitle = fullBaseNameWithMarkers;
                logMessage(
                    `[updateAllGroupPrefixes -> Loop] Group ${group.id} (Normal): Prefixes disabled. baseName="${fullBaseNameWithMarkers}".`,
                );
            }
        }

        const activeTabsInGroup = groupTabs.filter((tab) => tabsEverActive.has(tab.id));
        const finalPrefixForState = determinePotentialPrefix(
            group.id,
            groupTabs,
            !group.collapsed,
            isEdit,
            groupNeedsWarning,
        );

        // PROTECTION LOGIC AGAINST EMPTY STATE DURING INITIALIZATION
        const activeTabIdsToSave =
            tabsEverActive.size > 0
                ? activeTabsInGroup.map((tab) => tab.id)
                : isInitializing && oldState
                  ? oldState.activeTabIds
                  : [];

        const activeTabIndicesToSave =
            tabsEverActive.size > 0
                ? activeTabsInGroup
                      .map((activeTab) => groupTabs.findIndex((tab) => tab.id === activeTab.id))
                      .filter((index) => index !== -1)
                : isInitializing && oldState
                  ? oldState.activeTabIndices
                  : [];

        const newState = {
            prefix: finalPrefixForState,
            tabCount: groupTabs.length,
            expandedEver: groupExpandedEver.get(group.id) || !group.collapsed,
            activeTabIds: activeTabIdsToSave,
            activeTabIndices: activeTabIndicesToSave,
            type: groupInfo.type,
            key: groupInfo.key,
            title: definitiveBaseName,
            isCompact: groupInfo.isCompact,
        };

        syncGroupState(group, newState, groupPrefixState, groupIdentifierMap, groupInfoMap, isCompactActive);

        if (group.title !== newUiTitle && newUiTitle !== '') {
            logMessage(
                `[updateAllGroupPrefixes -> Loop] Group ${group.id}: Title update needed. From: "${group.title}" To: "${newUiTitle}".`,
            );
            await executeWithRetries(
                async () => await chrome.tabGroups.update(group.id, { title: newUiTitle }),
                `updating group title ${group.id} to "${newUiTitle}"`,
            );
        } else {
            logMessage(
                `[updateAllGroupPrefixes -> Loop] Group ${group.id}: No title update needed. Title is already "${group.title}".`,
            );
        }
        groupInfo.isCompact = isCompactActive;
    });

    await Promise.all(updatePromises);
    await saveGroupPrefixState();
    logMessage(`[updateAllGroupPrefixes END] Finished execution for windowId: ${windowId}.`);
}

function getCommonDomain(tabs, useSubdomain = false) {
    logMessage(
        `[getCommonDomain] Starting strict domain check for ${tabs?.length || 0} tabs. Use subdomains: ${useSubdomain}.`,
    );

    // If there are no tabs or only one, there can be no "common domain".
    if (!tabs || tabs.length < 1) {
        logMessage('[getCommonDomain] -> Not enough tabs to determine a common domain.');
        return null;
    }

    // Now, tabs are not filtered. All must be eligible and match.
    const firstTab = tabs[0];
    if (!isEligibleForDomainGrouping(firstTab.url)) {
        logMessage(`[getCommonDomain] -> First tab URL "${firstTab.url}" is not eligible for domain grouping.`);
        return null;
    }

    const firstDomain = getDomain(firstTab.url, useSubdomain);

    // If the first domain is already null, we cannot continue.
    if (firstDomain === null) {
        logMessage(`[getCommonDomain] -> Could not extract a valid domain from the first tab.`);
        return null;
    }

    // Check that ALL other tabs are eligible and have the SAME domain.
    for (let i = 1; i < tabs.length; i++) {
        const currentTab = tabs[i];
        if (!isEligibleForDomainGrouping(currentTab.url)) {
            logMessage(
                `[getCommonDomain] -> FAILURE: Tab URL "${currentTab.url}" is not eligible. Group is not homogeneous.`,
            );
            return null;
        }
        const currentDomain = getDomain(currentTab.url, useSubdomain);
        if (currentDomain !== firstDomain) {
            logMessage(
                `[getCommonDomain] -> FAILURE: Domain mismatch. Expected "${firstDomain}", found "${currentDomain}".`,
            );
            return null;
        }
    }

    // If the loop completes, it means all tabs are eligible and share the same domain.
    logMessage(`[getCommonDomain] -> SUCCESS: All tabs share the common domain: "${firstDomain}".`);
    return firstDomain;
}

function getMatchingRule(tabs, customRules) {
    if (!Array.isArray(customRules) || tabs.length === 0) {
        return null;
    }

    logMessage(`[getMatchingRule] Starting rule search for ${tabs.length} tab(s).`);

    // Iterate over each rule to find one that covers all tabs
    for (const rule of customRules) {
        logMessage(`[getMatchingRule] Checking rule: '${rule.name}'.`);

        if (!rule.active) {
            logMessage(`[getMatchingRule] Skipping inactive rule.`);
            continue; // Skip to the next rule if it is not active
        }

        // Check if ALL tabs ('every') in the group meet the condition for THIS rule
        const allTabsMatchThisRule = tabs.every((tab) => {
            if (!tab.url) return false; // A tab without URL cannot match
            // The condition is that AT LEAST ONE ('some') of the rule's URLs is included in the tab's URL
            return rule.urls.some((url) => tab.url.includes(url));
        });

        // Record the check result for this specific rule
        logMessage(
            `[getMatchingRule] ----> Do all tabs match rule '${rule.name}'? -> ${allTabsMatchThisRule ? 'YES' : 'NO'}.`,
        );

        if (allTabsMatchThisRule) {
            logMessage(`[getMatchingRule] SUCCESS! 100% match found. The rule is '${rule.name}'. Returning result.`);
            return rule.name;
        }
    }

    // If the loop ends, it means no individual rule could cover all tabs in the group.
    logMessage(`[getMatchingRule] -> FINISHED: No single rule was found that covers all tabs in the group.`);
    return null;
}
