/**
 * [AI INSTRUCTION]
 * GROUPS HANDLER — Handles tab grouping actions.
 */

function handleGroupTabs(message, sendResponse) {
    (async () => {
        try {
            logMessage(`[onMessage] Action: ${message.action} - Executing grouping.`);
            debounceGroupTabs();
            sendResponse({
                status: 'done',
            });
        } catch (error) {
            console.error(`[onMessage] Error during (${message.action}):`, error);
            sendResponse({
                status: 'error',
                error: error.message,
            });
        }
    })();
}

function handleForceSync(sendResponse) {
    (async () => {
        logMessage('[onMessage] Force sync request received from UI.');
        try {
            await initializeExtensionStates();
            logMessage('[onMessage] Forced sync completed.');
            sendResponse({
                status: 'sync_complete',
            });
        } catch (error) {
            console.error('[onMessage] Error during forced sync:', error);
            sendResponse({
                status: 'sync_error',
                error: error.message,
            });
        }
    })();
}

function handleUpdateGroupColor(message, sendResponse) {
    (async () => {
        try {
            const groupsToUpdate = message.groups || [
                {
                    groupId: message.groupId,
                    specialGroupKey: message.specialGroupKey,
                    color: message.color,
                },
            ];
            let clusterConfigUpdated = false;
            let clusterConfig = {};
            let customRulesUpdated = false;
            let customRules = null;
            const storage = await getSettingsStorage();
            for (const { groupId, specialGroupKey, color } of groupsToUpdate) {
                if (groupId) {
                    await chrome.tabGroups.update(groupId, {
                        color,
                    });
                    if (typeof groupInfoMap !== 'undefined') {
                        const info = groupInfoMap.get(groupId);
                        if (info) {
                            if (info.type === 'special') {
                                if (!clusterConfigUpdated) {
                                    const data = await storage.get('clusterConfig');
                                    clusterConfig = data.clusterConfig || {};
                                    if (!clusterConfig.specialGroups) clusterConfig.specialGroups = {};
                                }
                                const sgKey = Object.keys(clusterConfig.specialGroups).find(
                                    (k) => clusterConfig.specialGroups[k].key === info.key,
                                );
                                if (sgKey && clusterConfig.specialGroups[sgKey]) {
                                    clusterConfig.specialGroups[sgKey].color = color;
                                    clusterConfigUpdated = true;
                                }
                            } else if (info.type === 'rule') {
                                if (!customRulesUpdated) {
                                    customRules = await getRulesFromStorage();
                                }
                                const rule = customRules.find((r) => r.name === info.key);
                                if (rule) {
                                    rule.color = color;
                                    customRulesUpdated = true;
                                }
                            }
                        }
                    }
                }
                if (specialGroupKey) {
                    if (!clusterConfigUpdated) {
                        const data = await storage.get('clusterConfig');
                        clusterConfig = data.clusterConfig || {};
                        if (!clusterConfig.specialGroups) clusterConfig.specialGroups = {};
                    }
                    if (clusterConfig.specialGroups[specialGroupKey]) {
                        clusterConfig.specialGroups[specialGroupKey].color = color;
                        clusterConfigUpdated = true;
                    }
                }
            }
            let needsGrouping = false;
            if (customRulesUpdated) {
                await storage.set({
                    customRules,
                });
                if (typeof extensionSettings !== 'undefined') {
                    extensionSettings.customRules = customRules;
                }
                needsGrouping = true;
            }
            if (clusterConfigUpdated) {
                await storage.set({
                    clusterConfig,
                });
                if (typeof extensionSettings !== 'undefined') {
                    extensionSettings.clusterConfig = clusterConfig;
                }
                needsGrouping = true;
            }
            if (needsGrouping) {
                chrome.runtime.sendMessage({
                    action: 'rulesUpdated',
                });
                await groupTabs();
            }
            sendResponse({
                success: true,
            });
        } catch (e) {
            sendResponse({
                success: false,
                error: e.message,
            });
        }
    })();
}

function handleGetClusterConfig(message, sendResponse) {
    (async () => {
        try {
            const storage = await getSettingsStorage();
            const data = await storage.get('clusterConfig');
            const clusterConfig = data.clusterConfig || {};
            sendResponse({
                success: true,
                config: clusterConfig,
            });
        } catch (e) {
            sendResponse({
                success: false,
                error: e.message,
            });
        }
    })();
}

/**
 * The name a group is known by, as the group list shows it.
 *
 * The title Chrome holds is not it: compact mode reduces it to a single letter and the
 * prefixes (lock, key, loupe…) are part of the stored string. The full name lives in
 * the session map, and `cleanGroupTitle` takes the prefixes off.
 */
function displayGroupTitle(group) {
    let name = '';
    if (typeof groupInfoMap !== 'undefined') {
        const info = groupInfoMap.get(group.id);
        if (info) name = info.title || info.key || '';
    }
    if (!name) name = group.title || '';
    if (typeof getBaseGroupName === 'function') name = getBaseGroupName(name);
    name = name.replace(/\u200B/g, '').trim();

    // A title typed by hand can carry the prefix character without the invisible
    // markers the extension adds, and it is not part of the name either.
    const prefixes = (typeof extensionSettings !== 'undefined' && extensionSettings.userPrefixes) || {};
    for (const mark of Object.values(prefixes)) {
        if (mark && name.startsWith(mark)) {
            name = name.slice(mark.length).trim();
            break;
        }
    }
    return name;
}

/**
 * Lists the browser's tab groups for the omnibar.
 *
 * The `dg:`, `ccg:` and `bg:` prefixes all ask for this, and every one of them was
 * coming back empty: the message was routed to a handler that did not exist.
 */
async function handleGetTabGroups(sendResponse) {
    try {
        const groups = await chrome.tabGroups.query({});
        const results = await Promise.all(
            groups.map(async (group) => {
                const tabs = await chrome.tabs.query({ groupId: group.id });
                return {
                    id: group.id,
                    title: displayGroupTitle(group),
                    rawTitle: group.title || '',
                    color: group.color,
                    collapsed: group.collapsed,
                    windowId: group.windowId,
                    tabCount: tabs.length,
                };
            }),
        );
        sendResponse({
            success: true,
            results,
        });
    } catch (error) {
        console.error('Error listing tab groups:', error);
        sendResponse({
            success: false,
            error: error.message,
        });
    }
}

/** Closes every tab of a group, which is how a group is removed. */
async function closeGroups(groupIds) {
    let closed = 0;
    for (const groupId of groupIds) {
        const id = Number.parseInt(groupId, 10);
        if (!Number.isFinite(id)) continue;
        const tabs = await chrome.tabs.query({ groupId: id });
        const tabIds = tabs.map((tab) => tab.id);
        if (tabIds.length === 0) continue;
        await chrome.tabs.remove(tabIds);
        closed += tabIds.length;
    }
    return closed;
}

async function handleDeleteTabGroup(message, sendResponse) {
    try {
        const closed = await closeGroups([message.groupId]);
        sendResponse({
            success: true,
            closed,
        });
    } catch (error) {
        console.error('Error deleting tab group:', error);
        sendResponse({
            success: false,
            error: error.message,
        });
    }
}

async function handleDeleteTabGroups(message, sendResponse) {
    try {
        const closed = await closeGroups(message.groupIds || []);
        sendResponse({
            success: true,
            closed,
        });
    } catch (error) {
        console.error('Error deleting tab groups:', error);
        sendResponse({
            success: false,
            error: error.message,
        });
    }
}

/** Closes the group the calling tab belongs to (keyboard command). */
async function handleDeleteCurrentTabGroup(sender) {
    try {
        const tab =
            sender?.tab || (await chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]));
        if (!tab || tab.groupId === undefined || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return;
        await closeGroups([tab.groupId]);
    } catch (error) {
        console.error('Error deleting the current tab group:', error);
    }
}

/** Closes every group except the one named in the message. */
/**
 * Closes every group but one — the active tab's, unless the caller names another.
 *
 * Callers that left `groupId` out got `NaN`, which no group id ever equals, so the
 * group the user was working in was closed along with the rest. Resolving the active
 * tab here covers both the context-menu entry and the toolbar button, which are the
 * two ways in and both promise to spare the active group.
 */
async function handleDeleteOtherGroups(message, sendResponse) {
    try {
        let keepId = Number.parseInt(message?.groupId, 10);
        if (!Number.isFinite(keepId)) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            keepId = activeTab?.groupId ?? chrome.tabGroups.TAB_GROUP_ID_NONE;
        }
        const groups = await chrome.tabGroups.query({});
        const others = groups.map((group) => group.id).filter((id) => id !== keepId);
        const closed = await closeGroups(others);
        sendResponse({
            success: true,
            closed,
        });
    } catch (error) {
        console.error('Error deleting the other groups:', error);
        sendResponse({
            success: false,
            error: error.message,
        });
    }
}

/**
 * Checks if needle is a subsequence of haystack (in order).
 */
function isSubsequence(needle, haystack) {
    if (!needle || !haystack) return false;
    let nIdx = 0;
    let hIdx = 0;
    while (nIdx < needle.length && hIdx < haystack.length) {
        if (needle[nIdx] === haystack[hIdx]) {
            nIdx++;
        }
        hIdx++;
    }
    return nIdx === needle.length;
}

/**
 * Navigates to a specific tab within a tab group matching a prefix/name query.
 * Sequence: Alt + [groupPrefix] + [tabIndex] + Enter (e.g. Alt+gog4+Enter)
 * Works both in standard mode and compact mode.
 */
async function handleNavigateToGroupTab(message, sender, sendResponse) {
    try {
        const { groupPrefix, tabIndex } = message;
        if (!groupPrefix || typeof tabIndex !== 'number' || tabIndex < 1) {
            if (sendResponse) sendResponse({ success: false, error: 'Invalid parameters' });
            return;
        }

        let windowId = sender?.tab?.windowId;
        if (!windowId) {
            const currentWin = await chrome.windows.getLastFocused({ populate: false }).catch(() => null);
            windowId = currentWin?.id;
        }

        let groups = windowId ? await chrome.tabGroups.query({ windowId }) : [];
        if (!groups || groups.length === 0) {
            groups = await chrome.tabGroups.query({});
        }

        if (!groups || groups.length === 0) {
            if (sendResponse) sendResponse({ success: false, error: 'No groups found' });
            return;
        }

        const cleanStr = (s) =>
            (s || '')
                .toString()
                .toLowerCase()
                .trim()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

        const targetQuery = cleanStr(groupPrefix);

        const candidates = groups.map((g) => {
            const dispTitle = typeof displayGroupTitle === 'function' ? displayGroupTitle(g) : g.title || '';
            const rawTitle = g.title || '';
            return {
                group: g,
                cleanDisp: cleanStr(dispTitle),
                cleanRaw: cleanStr(rawTitle),
            };
        });

        // 1. Exact match
        let matched = candidates.find((c) => c.cleanDisp === targetQuery || c.cleanRaw === targetQuery);

        // 2. Starts with query
        if (!matched) {
            matched = candidates.find(
                (c) =>
                    (c.cleanDisp && c.cleanDisp.startsWith(targetQuery)) ||
                    (c.cleanRaw && c.cleanRaw.startsWith(targetQuery)),
            );
        }

        // 3. Contains query as substring
        if (!matched) {
            matched = candidates.find(
                (c) =>
                    (c.cleanDisp && c.cleanDisp.includes(targetQuery)) ||
                    (c.cleanRaw && c.cleanRaw.includes(targetQuery)),
            );
        }

        // 4. Subsequence / fuzzy match (e.g. "gog" in "google")
        if (!matched) {
            matched = candidates.find(
                (c) => isSubsequence(targetQuery, c.cleanDisp) || isSubsequence(targetQuery, c.cleanRaw),
            );
        }

        if (!matched) {
            if (sendResponse) sendResponse({ success: false, error: `Group matching "${groupPrefix}" not found` });
            return;
        }

        const targetGroup = matched.group;
        const tabs = await chrome.tabs.query({ groupId: targetGroup.id });
        if (!tabs || tabs.length === 0) {
            if (sendResponse) sendResponse({ success: false, error: 'No tabs in matching group' });
            return;
        }

        // 1-based index clamped to available tab count
        const clampedIndex = Math.min(Math.max(tabIndex, 1), tabs.length) - 1;
        const targetTab = tabs[clampedIndex];

        if (targetGroup.collapsed) {
            await chrome.tabGroups.update(targetGroup.id, { collapsed: false }).catch(() => {});
        }
        await chrome.tabs.update(targetTab.id, { active: true });
        if (targetTab.windowId) {
            await chrome.windows.update(targetTab.windowId, { focused: true }).catch(() => {});
        }

        if (sendResponse) {
            sendResponse({ success: true, tabId: targetTab.id, groupId: targetGroup.id, tabIndex });
        }
    } catch (error) {
        console.error('Error navigating to group tab:', error);
        if (sendResponse) sendResponse({ success: false, error: error.message });
    }
}
