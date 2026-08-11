/**
 * Backs up all inactive tab groups into IndexedDB and closes their tabs.
 * Delegates to side panel first for superior title-cleaning and in-memory state management.
 */
async function handleBackupAllGroupsFromKey(message, sendResponse) {
    const { groupIds } = message || {};
    try {
        // Try delegating to the side panel first (it handles baseName extraction, DOM index, and state.backedUpGroupData)
        const delegatedAction = groupIds ? 'backupGroupsById' : 'backupAllGroupsFromBackground';
        const delegatedMessage = groupIds ? { action: delegatedAction, groupIds } : { action: delegatedAction };
        const delegated = await new Promise((resolve) => {
            chrome.runtime.sendMessage(delegatedMessage, (res) => {
                if (chrome.runtime.lastError || !res || !res.success) {
                    resolve(false);
                } else {
                    resolve(res);
                }
            });
        });

        if (delegated) {
            if (sendResponse) sendResponse(delegated);
            return;
        }

        // Fallback: side panel is closed or specific groups requested, execute natively in background
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const activeGroupId = activeTab ? activeTab.groupId : -1;

        const rawGroups = await chrome.tabGroups.query({});
        const allGroups = enhanceGroupsWithRealTitles(rawGroups);
        const allTabs = await chrome.tabs.query({});

        const groupsMap = new Map();
        const targetGroupIds = groupIds ? new Set(groupIds) : null;
        allGroups.forEach((g) => {
            if (!targetGroupIds || targetGroupIds.has(g.id)) {
                groupsMap.set(g.id, {
                    group: { id: g.id, title: g.title, color: g.color },
                    tabs: [],
                });
            }
        });

        allTabs.forEach((t) => {
            if (t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                const groupObj = groupsMap.get(t.groupId);
                if (groupObj) {
                    groupObj.tabs.push(t);
                }
            }
        });

        let groupsToBackup;
        if (targetGroupIds) {
            groupsToBackup = Array.from(groupsMap.values()).filter((item) => item.tabs.length > 0);
        } else {
            const backups = await getAllBackupsFromDb();
            const backedUpGroupIds = new Set(backups.map((b) => b.group?.id).filter((id) => id !== undefined));
            groupsToBackup = Array.from(groupsMap.values()).filter(
                (item) =>
                    item.group.id !== activeGroupId && !backedUpGroupIds.has(item.group.id) && item.tabs.length > 0,
            );
        }

        if (groupsToBackup.length === 0) {
            const noGroupsMsg = getI18nMsg('noGroupsToBackup', [], 'No hay grupos inactivos para respaldar.');
            chrome.notifications.create(`backup-notify-${Date.now()}`, {
                type: 'basic',
                iconUrl: '/assets/icons/icon128.png',
                title: 'Intelligent Tab Group',
                message: noGroupsMsg,
            });
            if (sendResponse) sendResponse({ success: false, error: 'No groups to backup' });
            return;
        }

        const allTabIdsToRemove = [];
        const savePromises = groupsToBackup.map(async (item) => {
            const groupIndex = item.tabs.reduce((min, t) => Math.min(min, t.index), Infinity);
            const backupObject = {
                group: {
                    ...item.group,
                },
                tabs: item.tabs.map((t) => ({
                    url: t.url,
                    title: t.title,
                    favIconUrl: t.favIconUrl,
                    pinned: t.pinned,
                })),
                index: groupIndex,
                createdAt: Date.now(),
            };

            item.tabs.forEach((t) => allTabIdsToRemove.push(t.id));
            await saveBackupToDb(backupObject);
        });

        await Promise.all(savePromises);

        if (allTabIdsToRemove.length > 0) {
            await chrome.tabs.remove(allTabIdsToRemove);

            const successMsgPattern = getI18nMsg('allGroupsBackedUp', [], '$1 grupos inactivos han sido respaldados.');
            const successMsg = successMsgPattern.replace('$1', String(groupsToBackup.length));

            chrome.notifications.create(`backup-notify-${Date.now()}`, {
                type: 'basic',
                iconUrl: '/assets/icons/icon128.png',
                title: 'Intelligent Tab Group',
                message: successMsg,
            });

            chrome.runtime.sendMessage({ action: 'groupsUpdatedFromBackground' }).catch(() => {});
        }

        if (sendResponse) sendResponse({ success: true, count: groupsToBackup.length });
    } catch (error) {
        console.error('Error backing up all groups from shortcut:', error);
        if (sendResponse) sendResponse({ success: false, error: error.message });
    }
}

/**
 * Restores all group backups from IndexedDB.
 */
async function handleRestoreAllGroupsFromKey(message, sendResponse) {
    const { groupIds } = message || {};
    try {
        // If specific groupIds are provided, skip delegation (omnibar use case)
        if (!groupIds) {
            // Try delegating to the side panel first (it handles state cleanup and optimistic UI)
            const delegated = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'restoreAllGroupsFromBackground' }, (res) => {
                    if (chrome.runtime.lastError || !res || !res.success) {
                        resolve(false);
                    } else {
                        resolve(res);
                    }
                });
            });

            if (delegated) {
                if (sendResponse) sendResponse(delegated);
                return;
            }
        }

        // Fallback: side panel is closed or specific groups requested, execute natively in background
        const allBackups = await getAllBackupsFromDb();
        const backups = groupIds ? allBackups.filter((b) => groupIds.includes(b.group?.id)) : allBackups;

        if (backups.length === 0) {
            const noBackupsMsg = getI18nMsg('noGroupsToRestore', [], 'No hay grupos respaldados para restaurar.');
            chrome.notifications.create(`restore-notify-${Date.now()}`, {
                type: 'basic',
                iconUrl: '/assets/icons/icon128.png',
                title: 'Intelligent Tab Group',
                message: noBackupsMsg,
            });
            if (sendResponse) sendResponse({ success: false, error: 'No backups to restore' });
            return;
        }

        for (const backup of backups) {
            if (!backup.tabs || backup.tabs.length === 0) continue;

            const createdTabs = [];
            for (const tabInfo of backup.tabs) {
                const newTab = await chrome.tabs.create({
                    url: tabInfo.url,
                    active: false,
                    pinned: tabInfo.pinned || false,
                });
                createdTabs.push(newTab);
            }

            const newTabIds = createdTabs.map((t) => t.id);
            const newGroupId = await chrome.tabs.group({ tabIds: newTabIds });
            await chrome.tabGroups.update(newGroupId, {
                title: backup.group.title,
                color: backup.group.color,
            });

            await deleteBackupFromDb(backup.group.id);
        }

        const successMsgPattern = getI18nMsg('allGroupsRestored', [], '$1 grupos han sido restaurados con éxito.');
        const successMsg = successMsgPattern.replace('$1', String(backups.length));

        chrome.notifications.create(`restore-notify-${Date.now()}`, {
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: 'Intelligent Tab Group',
            message: successMsg,
        });

        chrome.runtime.sendMessage({ action: 'groupsUpdatedFromBackground' }).catch(() => {});

        if (sendResponse) sendResponse({ success: true, count: backups.length });
    } catch (error) {
        console.error('Error restoring all groups from shortcut:', error);
        if (sendResponse) sendResponse({ success: false, error: error.message });
    }
}

/**
 * Retrieves all backed up groups.
 */
async function handleGetBackups(sendResponse) {
    try {
        const backups = await getAllBackupsFromDb();
        sendResponse({ success: true, backups });
    } catch (error) {
        console.error('Error getting backups:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Backs up specific tab groups by their IDs.
 */
/**
 * Restores a specific backed up group.
 */
async function handleRestoreBackupGroup(message, sendResponse) {
    const { groupId } = message;
    try {
        const backup = await getBackupFromDb(groupId);
        if (!backup) {
            if (sendResponse) sendResponse({ success: false, error: 'Backup not found' });
            return;
        }

        const createdTabs = [];
        for (const tabInfo of backup.tabs) {
            const newTab = await chrome.tabs.create({
                url: tabInfo.url,
                active: false,
                pinned: tabInfo.pinned || false,
            });
            createdTabs.push(newTab);
        }

        const newTabIds = createdTabs.map((t) => t.id);
        const newGroupId = await chrome.tabs.group({ tabIds: newTabIds });
        await chrome.tabGroups.update(newGroupId, {
            title: backup.group.title,
            color: backup.group.color,
        });

        await deleteBackupFromDb(groupId);

        // Notify other views
        chrome.runtime.sendMessage({ action: 'pageModeChanged' }).catch(() => {});
        chrome.runtime.sendMessage({ action: 'groupsUpdatedFromBackground' }).catch(() => {});

        // Show nice notification
        const successMsgPattern = getI18nMsg('groupRestored', [], 'El grupo "$1" ha sido restaurado.');
        const successMsg = successMsgPattern.replace('$1', backup.group.title);

        chrome.notifications.create(`restore-group-notify-${Date.now()}`, {
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: 'Intelligent Tab Group',
            message: successMsg,
        });

        if (sendResponse) sendResponse({ success: true });
    } catch (error) {
        console.error('Error restoring backup group:', error);
        if (sendResponse) sendResponse({ success: false, error: error.message });
    }
}

/**
 * Restores a specific tab from a backed up group.
 */
async function handleRestoreBackupTab(message, sendResponse) {
    const { groupId, tabUrl, tabTitle } = message;
    try {
        // Try to delegate to active side panel first to preserve perfect UI and state mapping
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                {
                    action: 'restoreBackupTabFromOmnibar',
                    groupId,
                    tabUrl,
                    tabTitle,
                },
                (res) => {
                    if (chrome.runtime.lastError || !res || !res.success) {
                        resolve({ success: false });
                    } else {
                        resolve({ success: true });
                    }
                },
            );
        });

        if (response.success) {
            if (sendResponse) sendResponse({ success: true });
            return;
        }

        // Fallback: Perform native restore in background if side panel is closed
        const backup = await getBackupFromDb(groupId);
        if (!backup) {
            if (sendResponse) sendResponse({ success: false, error: 'Backup not found' });
            return;
        }

        const tabIndex = backup.tabs.findIndex((t) => t.url === tabUrl);
        if (tabIndex === -1) {
            if (sendResponse) sendResponse({ success: false, error: 'Tab not found in backup' });
            return;
        }

        const tabToRestore = backup.tabs[tabIndex];
        const newTab = await chrome.tabs.create({ url: tabToRestore.url, active: true });

        // Look for active group with same title and color, or use existing session group
        if (!self.omnibarLinkedGroups) {
            self.omnibarLinkedGroups = new Map();
        }

        let targetGroupId = self.omnibarLinkedGroups.get(groupId);
        if (targetGroupId) {
            try {
                await chrome.tabGroups.get(targetGroupId);
            } catch (e) {
                targetGroupId = null;
                self.omnibarLinkedGroups.delete(groupId);
            }
        }

        if (!targetGroupId) {
            const rawGroups = await chrome.tabGroups.query({});
            const enhancedGroups = enhanceGroupsWithRealTitles(rawGroups);
            const activeGroups = enhancedGroups.filter((g) => g.title === backup.group.title);
            targetGroupId = activeGroups.length > 0 ? activeGroups[0].id : null;
        }

        if (!targetGroupId) {
            targetGroupId = await chrome.tabs.group({ tabIds: [newTab.id] });
            await chrome.tabGroups.update(targetGroupId, {
                title: backup.group.title,
                color: backup.group.color,
            });
            self.omnibarLinkedGroups.set(groupId, targetGroupId);
        } else {
            await chrome.tabs.group({ groupId: targetGroupId, tabIds: [newTab.id] });
        }

        // Remove tab from backup list
        backup.tabs.splice(tabIndex, 1);

        if (backup.tabs.length === 0) {
            await deleteBackupFromDb(groupId);
            self.omnibarLinkedGroups.delete(groupId);
        } else {
            await saveBackupToDb(backup);
        }

        // Notify other views
        chrome.runtime.sendMessage({ action: 'pageModeChanged' }).catch(() => {});
        chrome.runtime.sendMessage({ action: 'groupsUpdatedFromBackground' }).catch(() => {});

        // Show nice notification
        const successMsgPattern = getI18nMsg('singleTabRestored', [], 'Pestaña "$1" restaurada.');
        const successMsg = successMsgPattern.replace('$1', tabToRestore.title || tabToRestore.url);

        chrome.notifications.create(`restore-tab-notify-${Date.now()}`, {
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: 'Intelligent Tab Group',
            message: successMsg,
        });

        if (sendResponse) sendResponse({ success: true });
    } catch (error) {
        console.error('Error restoring backup tab:', error);
        if (sendResponse) sendResponse({ success: false, error: error.message });
    }
}
