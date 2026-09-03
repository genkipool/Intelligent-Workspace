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

    // What the group was called before. The stored state is asked first, but it is
    // reached through an identifier built from the group's *current* name, and
    // rebuildGroupIdentifierMap refreshes that map from the tab strip — so the moment
    // it runs after a rename, the lookup goes to a key that does not exist yet, the
    // rename goes unnoticed, and the extension keeps writing its own name over the
    // one the user typed. The group's own record is the fallback: it holds the name
    // the extension last put there.
    const infoForRename = groupInfoMapRef.get(group.id);
    const previousTitle = oldState?.title || (infoForRename?.title ? getBaseGroupName(infoForRename.title) : '');

    if (previousTitle) {
        const oldBaseTitle = getBaseGroupName(previousTitle);

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
                // Remembered so that nothing writes an automatic name back over it.
                newState.userNamed = true;

                const info = groupInfoMapRef.get(group.id);
                if (info && !isCompactActive && !info.isCompact && newCleanTitle.length >= 4) {
                    // The new name is stored with the type marker still on it. Storing
                    // the bare name used to strip the marker off the group for good —
                    // the title written back to the tab strip is this very string — and
                    // that marker is what tells a restored group what it is. Without it
                    // a renamed "Misc" comes back as a manual group.
                    info.title = constructFullTitle(
                        info.type,
                        info.key,
                        newCleanTitle,
                        extensionSettings.clusterConfig || DEFAULT_CLUSTER_CONFIG,
                    );
                    info.userNamed = true;
                    groupInfoMapRef.set(group.id, info);
                }
            }

            if (oldState) {
                groupPrefixStateRef.delete(generateGroupIdentifier(oldBaseTitle, oldState.tabCount));
            }
            groupPrefixStateRef.delete(generateGroupIdentifier(oldBaseTitle, newState.tabCount));
            if (oldIdentifierById) groupPrefixStateRef.delete(oldIdentifierById);
            groupPrefixStateRef.delete(generateGroupIdentifier(oldBaseTitle, null, group.id));
            groupPrefixStateRef.delete(generateGroupNameIdentifier(oldBaseTitle));
        }
    }

    const newIdentifierById = generateGroupIdentifier(newCleanTitle, null, group.id);
    const newIdentifierByCount = generateGroupIdentifier(newCleanTitle, newState.tabCount);

    groupIdentifierMapRef.set(group.id, newIdentifierById);
    groupPrefixStateRef.set(newIdentifierById, newState);
    groupPrefixStateRef.set(newIdentifierByCount, newState);
    const newIdentifierByName = generateGroupNameIdentifier(newCleanTitle);
    if (newIdentifierByName) groupPrefixStateRef.set(newIdentifierByName, newState);
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
        } catch {}
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

/**
 * What a group is, read from its pages but with the marker in its title having the
 * last word.
 *
 * Reading the pages is the only way to recognise a group whose identity was lost,
 * and it is right about a domain or a rule group. It cannot be right about a group
 * the user renamed: "Misc" holds pages with nothing in common — that is what it is
 * for — so the pages say "no automatic type here" and the group comes back as a
 * manual one. The only thing that still remembers is the invisible marker the
 * extension writes into the title, which Chrome restores along with the name.
 */
function identifyGroupFromTitleAndTabs(group, tabsInGroup, customRules, config) {
    const inferred = inferGroupTypeFromTabs(group.id, tabsInGroup, group.title, customRules, config);
    if (!inferred) return inferred;

    const typeFromTitle = getGroupType(group.title);
    if (typeFromTitle === inferred.type || typeFromTitle === 'manual') return inferred;

    const baseTitle = getBaseGroupName(group.title);

    if (typeFromTitle === 'special') {
        const byName = Object.values(config.specialGroups || {}).find(
            (c) => c.name && c.name.toLowerCase() === baseTitle.toLowerCase(),
        );
        // A special group whose pages share nothing is the miscellaneous one.
        const key = byName ? byName.key : config.specialGroups?.misc?.key || 'Misc';
        logMessage(
            `[identifyGroupFromTitleAndTabs] Group ${group.id}: its pages read as '${inferred.type}', but its title marks it special. Keeping 'special' (key '${key}').`,
        );
        return { type: 'special', key };
    }

    if (typeFromTitle === 'rule') {
        const rule = (customRules || []).find((r) => r.name === baseTitle);
        if (rule) {
            logMessage(
                `[identifyGroupFromTitleAndTabs] Group ${group.id}: its pages read as '${inferred.type}', but its title marks it as rule '${rule.name}'. Keeping 'rule'.`,
            );
            return { type: 'rule', key: rule.name };
        }
    }

    // A domain group is recognised from its pages whenever it still holds one domain,
    // so when they disagree the pages are the newer truth and are left to decide.
    return inferred;
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
        let needsRepair = hasNoVisibleName(group.title);

        // Renaming a group in the browser writes the title on every keystroke, so
        // clearing the old name to type a new one leaves it empty for a moment.
        // Putting the old name back right then lands it in the box the user is typing
        // into, and the two get mixed into a name nobody wrote. A title that has only
        // just been emptied is left alone; if it is still empty once the grace period
        // is over, the group really was left nameless and gets its name back.
        // A group that already has a name of its own waits a short moment; one that
        // never had a name is being typed into the browser's naming box, and waits
        // the full grace period.
        const restoreDelay = groupInfoMap.get(group.id)?.key ? TITLE_RESTORE_DELAY_MS : GROUP_NAMING_GRACE_MS;
        if (needsRepair && isTitleJustCleared(group, restoreDelay)) {
            logMessage(`[repairEmptyGroupTitles] Group ${group.id} may be mid-rename. Leaving its title alone.`);
            needsRepair = false;
            // Come back once that moment has passed. Any pass can run while a name is
            // being typed, and without this the one chance to repair the title would
            // be spent on a group that was only halfway through a rename.
            debounceUpdateAllGroupPrefixes(group.windowId, { targetGroupId: null }, restoreDelay + 300);
        }

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
    // Which group the "edit" applies to. Renaming one group can change what the
    // others should show — a duplicate-name warning appears or goes away — so the
    // pass has to cover the whole window, but only the group being typed into is
    // left without a marker. Null keeps the old meaning: the edit covers them all.
    isEditGroupId = null,
) {
    logMessage(
        `[updateAllGroupPrefixes START] Executing for windowId: ${windowId}. TargetGroupId: ${targetGroupId ?? 'All'}. IsEdit: ${isEdit}.`,
    );

    if (shouldIgnoreEventDuringInitialization('updateAllGroupPrefixes', targetGroupId)) {
        logMessage(`[updateAllGroupPrefixes] Execution skipped during initialization.`);
        return;
    }

    // Nothing is written to a title while a name is being typed. The browser stores
    // the group title on every keystroke, so a pass that runs in the middle reads the
    // half-typed text as the group's name, writes it back with the marker glued in
    // front — letters nobody typed — and records that fragment as the group's name,
    // which is then what a later repair would restore instead of the real one. The
    // pass is put off until the typing has stopped.
    if (Date.now() < groupRenameSettlesAt) {
        const waitMs = groupRenameSettlesAt - Date.now() + 300;
        logMessage(`[updateAllGroupPrefixes] A name is being typed; putting the pass off ${waitMs} ms.`);
        debounceUpdateAllGroupPrefixes(windowId, { targetGroupId, isEdit, groupNeedsWarning, isEditGroupId }, waitMs);
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

        // A group the browser is still asking the user to name gets no title from
        // us: writing one closes the naming box, and the name it would get is a
        // bare marker, since a brand-new group has no base name to build on.
        if (isBeingNamed(group)) {
            logMessage(`[updateAllGroupPrefixes -> Loop] Group ${group.id} is being named. Leaving its title alone.`);
            return;
        }

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

        // Only the group the user is actually renaming is treated as "being edited".
        const groupIsEdit = isEdit && (isEditGroupId === null || group.id === isEditGroupId);

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
                    groupIsEdit,
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
                    groupIsEdit,
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
            groupIsEdit,
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
            userNamed: groupInfo.userNamed || oldState?.userNamed || false,
        };

        syncGroupState(group, newState, groupPrefixState, groupIdentifierMap, groupInfoMap, isCompactActive);

        // A group whose name box is empty right now is off limits to this loop. The
        // name it would write comes from what was last stored, and while someone is
        // deleting a name letter by letter that store holds a fragment of it — "C"
        // for a group called "Codigo" — so the loop kept putting the fragment back
        // into the box the user was emptying. Only `repairEmptyGroupTitles`, which
        // rebuilds the whole name from the group's key, fills an empty title, and it
        // has already run by this point.
        if (hasNoVisibleName(group.title) && !hasNoVisibleName(newUiTitle)) {
            logMessage(
                `[updateAllGroupPrefixes -> Loop] Group ${group.id} has no name in the box; not writing "${newUiTitle}" over it.`,
            );
        } else if (group.title !== newUiTitle && newUiTitle !== '') {
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
