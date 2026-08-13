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
async function handleDeleteOtherGroups(message, sendResponse) {
    try {
        const keepId = Number.parseInt(message.groupId, 10);
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
