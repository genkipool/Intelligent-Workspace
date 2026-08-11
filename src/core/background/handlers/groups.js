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
