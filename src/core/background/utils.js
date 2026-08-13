function logMessage(...args) {
    if (isModeDebug) {
        console.log(...args);
    }
}

function isCompactModeActive(groupsInWindow) {
    const compactModeConfig = extensionSettings.clusterConfig?.compactMode;

    if (!compactModeConfig || !compactModeConfig.enabled) {
        return false;
    }

    const threshold = compactModeConfig.threshold ?? 12;
    const groupCount = groupsInWindow.length;

    return groupCount >= threshold;
}

async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return await response.blob();
}

function sendMessageToUI(message) {
    try {
        chrome.runtime.sendMessage(message, () => {
            // The chrome.runtime.lastError check is still useful here
            if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message;
                if (
                    !msg.includes('The message port closed before a response was received.') &&
                    !msg.includes('Could not establish connection. Receiving end does not exist.')
                ) {
                    console.warn('sendMessageToUI warning:', msg);
                }
            }
        });
    } catch (error) {
        console.warn(`Failed to send message to UI, it might be closed. Error: ${error.message}`);
    }
}

/**
 * Broadcasts a message to all open tabs.
 * Useful for themes, hint states, etc.
 */
function broadcastToAllTabs(action, extraData = {}) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, { action, ...extraData }).catch(() => {
                /* Ignore error: content script might not be in this tab */
            });
        });
    });
}

function normalizeUrl(url) {
    if (!url) return '';
    return url
        .toLowerCase()
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .replace(/\/$/, '');
}

function isValidUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') return false;
    const trimmedUrl = urlString.trim();
    if (trimmedUrl.includes(' ')) return false;
    const isHttp = trimmedUrl.startsWith('http://');
    const isHttps = trimmedUrl.startsWith('https://');
    const isFile = trimmedUrl.startsWith('file:///');
    const isChrome = trimmedUrl.startsWith('chrome://');
    const isChromeExtensions = trimmedUrl.startsWith('chrome-extension://');

    if (!(isHttp || isHttps || isFile || isChrome || isChromeExtensions)) return false;
    try {
        const url = new URL(trimmedUrl);
        if (isFile) return true;
        if (isChrome) return true;
        if (isChromeExtensions) return true;
        if ((isHttp || isHttps) && url.hostname && url.hostname.length > 0) {
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function regroupAllTabsCommand() {
    if (isGrouping) {
        logMessage('[regroupAllTabs] Cannot start regrouping, another operation is in progress.');
        return;
    }
    isGrouping = true;

    try {
        logMessage('[regroupAllTabs] DESTRUCTION phase: Ungrouping all tabs and clearing state.');

        const allTabs = await chrome.tabs.query({});
        const tabIdsToUngroup = allTabs.filter((tab) => tab.groupId !== -1).map((tab) => tab.id);

        if (tabIdsToUngroup.length > 0) {
            logMessage(`[regroupAllTabs] Ungrouping ${tabIdsToUngroup.length} tabs.`);
            await executeWithRetries(
                async () => await chrome.tabs.ungroup(tabIdsToUngroup),
                `ungrouping all tabs for regroup command`,
            );
            await new Promise((resolve) => setTimeout(resolve, 300));
        }

        logMessage('[regroupAllTabs] Clearing groupInfoMap and groupPrefixState.');
        groupInfoMap.clear();
        groupPrefixState.clear();
        groupIdentifierMap.clear();
        groupExpandedEver.clear();
        lastActivity = {};

        await saveGroupInfoMap();
        await setupContextMenus();
    } catch (error) {
        console.error('Catastrophic error during regroup destruction phase:', error);
        isGrouping = false;
        return;
    } finally {
        // IMPORTANT: Release the lock BEFORE calling groupTabs.
        // The groupTabs function will handle its own locking for the creation phase.
        isGrouping = false;
    }

    logMessage('[regroupAllTabs] CREATION phase: Calling groupTabs() to rebuild from scratch.');
    debounceGroupTabs();
    logMessage('[regroupAllTabs] Full regrouping process completed.');
}

async function loadI18nMessages() {
    try {
        const result = await chrome.storage.local.get('preferred-language');
        currentLang = result['preferred-language'] || (chrome.i18n.getUILanguage().startsWith('es') ? 'es' : 'en');

        const url = chrome.runtime.getURL(`_locales/${currentLang}/messages.json`);
        const response = await fetch(url);
        if (response.ok) {
            currentLangMessages = await response.json();
            logMessage(`[i18n] Loaded messages for: ${currentLang}`);
        } else {
            console.error(`[i18n] Failed to load messages for ${currentLang}`);
            // Fallback to internal i18n if fetch fails
        }
    } catch (error) {
        console.error('[i18n] Error loading messages:', error);
    }
}

function getI18nMsg(key, params = []) {
    const msgObj = currentLangMessages[key];
    let message = msgObj ? msgObj.message : chrome.i18n.getMessage(key, params);

    if (!message) return key;

    if (params.length > 0) {
        message = message.replace(/\$(\d+)/g, (match, indexStr) => {
            const index = parseInt(indexStr, 10) - 1;
            return params[index] !== undefined ? params[index] : match;
        });
    }
    return message;
}

const setupContextMenus = async () => {
    if (isCreatingMenus) {
        logMessage('[ContextMenu] Creation already in progress. Skipping.');
        return;
    }
    isCreatingMenus = true;

    try {
        await loadI18nMessages();
        await chrome.contextMenus.removeAll();
        const customRules = extensionSettings.customRules || [];

        // --- Pre-calculations for optimal performance ---
        const allTabs = await chrome.tabs.query({});

        // Map: groupId -> [tab, tab, ...]
        const tabsByGroupId = new Map();
        for (const tab of allTabs) {
            if (tab.groupId !== -1) {
                if (!tabsByGroupId.has(tab.groupId)) {
                    tabsByGroupId.set(tab.groupId, []);
                }
                tabsByGroupId.get(tab.groupId).push(tab);
            }
        }

        // Map: ruleName -> groupId
        const groupIdByRuleName = new Map();
        for (const [groupId, info] of groupInfoMap.entries()) {
            if (info.type === 'rule') {
                groupIdByRuleName.set(info.key, groupId);
            }
        }

        // --- GROUP 1: Rules Management ---
        chrome.contextMenus.create({
            id: 'create-rule-parent',
            title: getI18nMsg('contextMenuCreateRuleForPage'),
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'create-rule-root',
            parentId: 'create-rule-parent',
            title: getI18nMsg('contextMenuAddSiteRoot'),
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'create-rule-full',
            parentId: 'create-rule-parent',
            title: getI18nMsg('contextMenuAddFullUrl'),
            contexts: ['page'],
        });

        const activeRulesForAdding = customRules.filter((rule) => rule.active);
        if (activeRulesForAdding.length > 0) {
            chrome.contextMenus.create({
                id: 'add-to-rule-parent',
                title: getI18nMsg('contextMenuAddToRule'),
                contexts: ['page'],
            });
            for (const rule of activeRulesForAdding) {
                const ruleParentId = `add-to-rule-parent_${rule.name}`;
                chrome.contextMenus.create({
                    id: ruleParentId,
                    parentId: 'add-to-rule-parent',
                    title: rule.name,
                    contexts: ['page'],
                });
                chrome.contextMenus.create({
                    id: `add-site-root_${rule.name}`,
                    parentId: ruleParentId,
                    title: getI18nMsg('contextMenuAddSiteRoot'),
                    contexts: ['page'],
                });
                chrome.contextMenus.create({
                    id: `add-full-url_${rule.name}`,
                    parentId: ruleParentId,
                    title: getI18nMsg('contextMenuAddFullUrl'),
                    contexts: ['page'],
                });
            }
        }

        if (customRules.length > 0) {
            chrome.contextMenus.create({
                id: 'separator-before-rules-menu',
                type: 'separator',
                contexts: ['page'],
            });
        }

        if (customRules.length > 0) {
            chrome.contextMenus.create({
                id: 'manage-rules-parent',
                title: getI18nMsg('rules'),
                contexts: ['page'],
            });

            chrome.contextMenus.create({
                id: 'toggle-all-rules',
                parentId: 'manage-rules-parent',
                title: getI18nMsg('toggleAllRules'),
                type: 'checkbox',
                checked: customRules.length > 0 && customRules.every((r) => r.active),
                contexts: ['page'],
            });

            chrome.contextMenus.create({
                id: 'rules-separator-after-toggle-all',
                parentId: 'manage-rules-parent',
                type: 'separator',
                contexts: ['page'],
            });

            for (const rule of customRules) {
                const ruleSubMenuId = `rule-submenu_${rule.name}`;
                chrome.contextMenus.create({
                    id: ruleSubMenuId,
                    parentId: 'manage-rules-parent',
                    title: rule.name,
                    contexts: ['page'],
                });

                // Option: Enable/Disable Rule
                chrome.contextMenus.create({
                    id: `toggle-rule-active_${rule.name}`,
                    parentId: ruleSubMenuId,
                    title: getI18nMsg('contextMenuToggleRule'),
                    type: 'checkbox',
                    checked: rule.active,
                    contexts: ['page'],
                });

                chrome.contextMenus.create({
                    id: `separator-after-toggle_${rule.name}`,
                    parentId: ruleSubMenuId,
                    type: 'separator',
                    contexts: ['page'],
                });

                chrome.contextMenus.create({
                    id: `open-all-urls_${rule.name}`,
                    parentId: ruleSubMenuId,
                    title: getI18nMsg('openAllUrls'),
                    contexts: ['page'],
                });

                if (rule.urls && rule.urls.length > 0) {
                    chrome.contextMenus.create({
                        id: `separator-for-rule-urls-${rule.name}`,
                        parentId: ruleSubMenuId,
                        type: 'separator',
                        contexts: ['page'],
                    });

                    const groupIdForRule = groupIdByRuleName.get(rule.name);
                    const tabsInThisGroup = groupIdForRule ? tabsByGroupId.get(groupIdForRule) || [] : [];

                    for (const [index, url] of rule.urls.entries()) {
                        const cleanUrl = cleanUrlForDisplay(url);

                        const tabCount = tabsInThisGroup.filter((t) => t.url && t.url.includes(url)).length;

                        const displayUrl = cleanUrl.length > 50 ? cleanUrl.substring(0, 50) + '...' : cleanUrl;

                        const urlActionParentId = `url-actions_${rule.name}_${index}`;
                        chrome.contextMenus.create({
                            id: urlActionParentId,
                            parentId: ruleSubMenuId,
                            title: displayUrl,
                            contexts: ['page'],
                        });

                        chrome.contextMenus.create({
                            id: `open-url_${rule.name}_${index}`,
                            parentId: urlActionParentId,
                            title: getI18nMsg('contextMenuOpenUrl'),
                            contexts: ['page'],
                        });

                        chrome.contextMenus.create({
                            id: `close-tabs-for-url_${rule.name}_${index}`,
                            parentId: urlActionParentId,
                            title: getI18nMsg('contextMenuCloseTabsForUrl', [tabCount.toString()]),
                            contexts: ['page'],
                            enabled: tabCount > 0,
                        });
                    }
                }
            }
        }

        // --- SEPARATOR 1 ---
        chrome.contextMenus.create({
            id: 'separator-1',
            type: 'separator',
            contexts: ['page'],
        });

        // --- GROUP 2: Tab cleanup actions ---
        const duplicateUrlMap = new Map();
        for (const tab of allTabs) {
            if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
                if (!duplicateUrlMap.has(tab.url)) {
                    duplicateUrlMap.set(tab.url, []);
                }
                duplicateUrlMap.get(tab.url).push(tab);
            }
        }
        let duplicatesFoundCount = 0;
        for (const tabs of duplicateUrlMap.values()) {
            if (tabs.length > 1) {
                duplicatesFoundCount += tabs.length - 1;
            }
        }

        const duplicateTitle = `${getI18nMsg('contextMenuRemoveDuplicateTabs')} [${duplicatesFoundCount}]`;
        chrome.contextMenus.create({
            id: 'remove-duplicate-tabs',
            title: duplicateTitle,
            contexts: ['page'],
            enabled: duplicatesFoundCount > 0,
        });

        const domainCountMap = new Map();
        for (const tab of allTabs) {
            try {
                if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
                    let domain = new URL(tab.url).hostname;
                    if (domain.startsWith('www.')) {
                        domain = domain.substring(4);
                    }
                    domainCountMap.set(domain, (domainCountMap.get(domain) || 0) + 1);
                }
            } catch (e) {
                /* Ignore invalid URLs */
            }
        }

        chrome.contextMenus.create({
            id: 'remove-domain-tabs-parent',
            title: getI18nMsg('contextMenuRemoveTabsByDomain'),
            contexts: ['page'],
        });

        const sortedDomains = [...domainCountMap.keys()].sort();

        if (sortedDomains.length > 0) {
            for (const domain of sortedDomains) {
                const count = domainCountMap.get(domain);
                chrome.contextMenus.create({
                    id: `remove-domain_${domain}`,
                    parentId: 'remove-domain-tabs-parent',
                    title: `${domain} [${count}]`,
                    contexts: ['page'],
                });
            }
        } else {
            chrome.contextMenus.create({
                id: 'no-domains-to-remove',
                parentId: 'remove-domain-tabs-parent',
                title: getI18nMsg('contextMenuNoDomainsToRemove'),
                contexts: ['page'],
                enabled: false,
            });
        }

        chrome.contextMenus.create({
            id: 'delete-other-groups-ctx',
            title: getI18nMsg('closeAllButActiveGroup'),
            contexts: ['page'],
        });

        chrome.contextMenus.create({
            id: 'regroup-all-tabs',
            title: getI18nMsg('contextMenuRegroupAll'),
            contexts: ['page'],
        });

        const audibleUnmuted = allTabs.filter((t) => t.audible && !(t.mutedInfo && t.mutedInfo.muted));
        const explicitlyMuted = allTabs.filter((t) => t.mutedInfo && t.mutedInfo.muted);

        if (audibleUnmuted.length > 0) {
            chrome.contextMenus.create({
                id: 'mute-all-tabs-ctx',
                title: getI18nMsg('muteAllTabs'),
                contexts: ['page'],
            });
        }

        if (explicitlyMuted.length > 0) {
            chrome.contextMenus.create({
                id: 'unmute-all-tabs-ctx',
                title: getI18nMsg('unmuteAllTabs'),
                contexts: ['page'],
            });
        }

        // --- SEPARATOR 2 ---
        chrome.contextMenus.create({
            id: 'separator-2',
            type: 'separator',
            contexts: ['page'],
        });

        // --- GROUP 3: Open Extension ---
        chrome.contextMenus.create({
            id: 'open-extension-parent',
            title: getI18nMsg('contextOpenActions'),
            contexts: ['page', 'selection', 'image', 'link'],
        });
        chrome.contextMenus.create({
            id: 'open-page-in-pip',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openAsPipTitle'),
            contexts: ['page', 'selection', 'image', 'link'],
        });
        chrome.contextMenus.create({
            id: 'open-page-in-popup',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openAsPopupTitle'),
            contexts: ['page', 'selection', 'image', 'link'],
        });
        chrome.contextMenus.create({
            id: 'open-selection-in-pip',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openSelectionInPip'),
            contexts: ['selection'],
        });
        chrome.contextMenus.create({
            id: 'open-selection-in-popup',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openSelectionInPopup'),
            contexts: ['selection'],
        });
        chrome.contextMenus.create({
            id: 'open-image-in-pip',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openImageInPip'),
            contexts: ['image'],
        });
        chrome.contextMenus.create({
            id: 'open-image-in-popup',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openImageInPopup'),
            contexts: ['image'],
        });
        chrome.contextMenus.create({
            id: 'separator-open-actions',
            parentId: 'open-extension-parent',
            type: 'separator',
            contexts: ['page', 'selection', 'image', 'link'],
        });
        chrome.contextMenus.create({
            id: 'open-extension-popup',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openPopup'),
            contexts: ['page', 'selection', 'image', 'link'],
        });
        chrome.contextMenus.create({
            id: 'open-extension-web',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openSettingsRules'),
            contexts: ['page', 'selection', 'image', 'link'],
        });
        chrome.contextMenus.create({
            id: 'open-extension-sidepanel',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openSidePanel'),
            contexts: ['page', 'selection', 'image', 'link'],
        });

        chrome.contextMenus.create({
            id: 'open-list-group-sidepanel',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openListGroupSidePanel'),
            contexts: ['page', 'selection', 'image', 'link'],
        });

        chrome.contextMenus.create({
            id: 'open-themes-sidepanel',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openThemesSidePanel'),
            contexts: ['page', 'selection', 'image', 'link'],
        });

        chrome.contextMenus.create({
            id: 'open-gemini-sidepanel',
            parentId: 'open-extension-parent',
            title: getI18nMsg('contextMenuOpenGeminiSidePanel'),
            contexts: ['page', 'selection', 'image', 'link'],
        });

        chrome.contextMenus.create({
            id: 'open-customize-hints-sidepanel',
            parentId: 'open-extension-parent',
            title: getI18nMsg('openCustomizeHintsSidePanel'),
            contexts: ['page', 'selection', 'image', 'link'],
        });

        // --- SEPARATOR 3 ---
        chrome.contextMenus.create({
            id: 'separator-3',
            type: 'separator',
            contexts: ['page'],
        });

        // --- GROUP 4: Settings ---
        chrome.contextMenus.create({
            id: 'main-actions-parent',
            title: getI18nMsg('contextMenuSettings'),
            contexts: ['page'],
        });

        // Settings Submenu: Group Management
        chrome.contextMenus.create({
            id: 'group-management-parent',
            parentId: 'main-actions-parent',
            title: getI18nMsg('contextMenuGroupManagement'),
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-current-group',
            parentId: 'group-management-parent',
            title: getI18nMsg('toggleCurrentGroup'),
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-all-groups',
            parentId: 'group-management-parent',
            title: getI18nMsg('toggleAllGroups'),
            contexts: ['page'],
        });

        // Settings Submenu: Grouping Options
        const config = extensionSettings.clusterConfig || DEFAULT_CLUSTER_CONFIG;
        chrome.contextMenus.create({
            id: 'grouping-options-parent',
            parentId: 'main-actions-parent',
            title: getI18nMsg('contextGroupingOptions'),
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-clustering',
            parentId: 'grouping-options-parent',
            title: getI18nMsg('toggleClustering'),
            type: 'checkbox',
            checked: extensionSettings.clusteringEnabled ?? true,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'grouping-separator-1',
            parentId: 'grouping-options-parent',
            type: 'separator',
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-compact-mode',
            parentId: 'grouping-options-parent',
            title: getI18nMsg('toggleCompactMode'),
            type: 'checkbox',
            checked: config.compactMode?.enabled ?? true,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-domain-grouping',
            parentId: 'grouping-options-parent',
            title: getI18nMsg('toggleDomainGrouping'),
            type: 'checkbox',
            checked: config.domainsEnabled ?? true,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-subdomain-grouping',
            parentId: 'grouping-options-parent',
            title: getI18nMsg('toggleSubdomainGrouping'),
            type: 'checkbox',
            checked: config.subdomainsEnabled ?? false,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'grouping-separator-2',
            parentId: 'grouping-options-parent',
            type: 'separator',
            contexts: ['page'],
        });
        const specialGroups = config.specialGroups || {};
        chrome.contextMenus.create({
            id: 'toggle-chrome-grouping',
            parentId: 'grouping-options-parent',
            title: getI18nMsg('toggleChromeGrouping'),
            type: 'checkbox',
            checked: specialGroups.chrome?.enabled ?? true,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-files-grouping',
            parentId: 'grouping-options-parent',
            title: getI18nMsg('toggleFilesGrouping'),
            type: 'checkbox',
            checked: specialGroups.files?.enabled ?? true,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-extensions-grouping',
            parentId: 'grouping-options-parent',
            title: getI18nMsg('toggleExtensionsGrouping'),
            type: 'checkbox',
            checked: specialGroups.extensions?.enabled ?? true,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-misc-grouping',
            parentId: 'grouping-options-parent',
            title: getI18nMsg('toggleMiscGrouping'),
            type: 'checkbox',
            checked: specialGroups.misc?.enabled ?? true,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-ip-address-grouping',
            parentId: 'grouping-options-parent',
            title: getI18nMsg('toggleIpAddressGrouping'),
            type: 'checkbox',
            checked: specialGroups.ipAddress?.enabled ?? true,
            contexts: ['page'],
        });

        // Settings Submenu: General Options
        chrome.contextMenus.create({
            id: 'general-options-parent',
            parentId: 'main-actions-parent',
            title: getI18nMsg('contextGeneralOptions'),
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-sort-alpha',
            parentId: 'general-options-parent',
            title: getI18nMsg('toggleSortAlpha'),
            type: 'checkbox',
            checked: extensionSettings.sortGroupsAlphabetically ?? true,
            contexts: ['page'],
        });
        if (extensionSettings.sortGroupsAlphabetically ?? true) {
            const miscSortOption = extensionSettings.miscGroupSortOption || 'start';
            chrome.contextMenus.create({
                id: 'misc-group-placement-parent',
                parentId: 'general-options-parent',
                title: getI18nMsg('contextMenuMiscGroupPlacement'),
                contexts: ['page'],
            });
            chrome.contextMenus.create({
                id: 'misc-sort-start',
                parentId: 'misc-group-placement-parent',
                title: getI18nMsg('miscGroupSortStart'),
                type: 'radio',
                checked: miscSortOption === 'start',
                contexts: ['page'],
            });
            chrome.contextMenus.create({
                id: 'misc-sort-end',
                parentId: 'misc-group-placement-parent',
                title: getI18nMsg('miscGroupSortEnd'),
                type: 'radio',
                checked: miscSortOption === 'end',
                contexts: ['page'],
            });
            chrome.contextMenus.create({
                id: 'misc-sort-alpha',
                parentId: 'misc-group-placement-parent',
                title: getI18nMsg('miscGroupSortAlpha'),
                type: 'radio',
                checked: miscSortOption === 'alpha' || miscSortOption === 'alphabetical',
                contexts: ['page'],
            });
        }
        chrome.contextMenus.create({
            id: 'toggle-collapse-timer',
            parentId: 'general-options-parent',
            title: getI18nMsg('toggleCollapseTimer'),
            type: 'checkbox',
            checked: extensionSettings.enableCollapseTimer ?? false,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-prefixes',
            parentId: 'general-options-parent',
            title: getI18nMsg('togglePrefixes'),
            type: 'checkbox',
            checked: extensionSettings.enablePrefixes ?? false,
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'toggle-link-preview',
            parentId: 'general-options-parent',
            title: getI18nMsg('enableLinkPreview'),
            type: 'checkbox',
            checked: extensionSettings.linkPreviewEnabled !== false,
            contexts: ['page'],
        });
        // "Toggle All Rules" has been moved. It's no longer here.
    } catch (error) {
        console.error('Error setting up context menus:', error);
    } finally {
        isCreatingMenus = false;
    }
};

const debounceSetupContextMenus = () => {
    if (setupContextMenusTimer) clearTimeout(setupContextMenusTimer);
    setupContextMenusTimer = setTimeout(() => {
        setupContextMenus();
    }, 500);
};

function handleGetCookiesForUrl(message, sendResponse) {
    (async () => {
        try {
            const cookies = await chrome.cookies.getAll({ url: message.url });
            sendResponse({ success: true, cookies: cookies });
        } catch (error) {
            console.error(`Error getting cookies for ${message.url}:`, error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}

function handleSetCookie(message, sendResponse) {
    (async () => {
        const cookieDetails = message.cookie;
        const url = message.url;

        try {
            const cookieToSet = {
                url: url,
                name: cookieDetails.name,
                value: cookieDetails.value,
                path: cookieDetails.path || '/',
                secure: !!cookieDetails.secure,
                httpOnly: !!cookieDetails.httpOnly,
            };

            if (!cookieDetails.hostOnly && cookieDetails.domain) {
                cookieToSet.domain = cookieDetails.domain;
            }

            if (
                cookieDetails.expirationDate &&
                typeof cookieDetails.expirationDate === 'number' &&
                !isNaN(cookieDetails.expirationDate)
            ) {
                cookieToSet.expirationDate = cookieDetails.expirationDate;
            }

            const validSameSiteValues = ['no_restriction', 'lax', 'strict'];
            const sameSiteValue = String(cookieDetails.sameSite || '').toLowerCase();
            if (validSameSiteValues.includes(sameSiteValue)) {
                cookieToSet.sameSite = sameSiteValue;
            }

            const result = await chrome.cookies.set(cookieToSet);

            if (result) {
                sendResponse({ success: true, cookie: result });
            } else {
                throw new Error(
                    `Failed to set cookie named "${cookieDetails.name}". The browser rejected the request.`,
                );
            }
        } catch (error) {
            console.error('Error setting cookie:', error.message, '| Details:', { received_cookie: message.cookie });
            sendResponse({ success: false, error: `Failed to parse or set cookie named "${cookieDetails.name}".` });
        }
    })();
}
function handleRemoveCookie(message, sendResponse) {
    (async () => {
        try {
            const result = await chrome.cookies.remove({
                url: message.url,
                name: message.cookie.name,
                storeId: message.cookie.storeId,
            });
            if (result) {
                sendResponse({ success: true, details: result });
            } else {
                sendResponse({ success: true, details: null, message: 'Cookie not found.' });
            }
        } catch (error) {
            console.error('Error removing cookie:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}

async function openUrlsCommand(urls) {
    if (!Array.isArray(urls)) return;
    for (const url of urls) {
        let trimmedUrl = url.trim();
        if (!trimmedUrl) continue;
        // Ensure URL has a protocol to avoid chrome-extension:// prefix issue
        if (!/^(https?:\/\/|file:\/\/\/|chrome:\/\/|chrome-extension:\/\/)/.test(trimmedUrl)) {
            trimmedUrl = 'https://' + trimmedUrl;
        }
        await chrome.tabs.create({ url: trimmedUrl, active: false });
    }
}

async function addUrlToRuleAndNotify(urlBlock, targetRuleName) {
    const storage = await getSettingsStorage();
    const customRules = extensionSettings.customRules || (await getRulesFromStorage());
    const targetRule = customRules.find((r) => r.name === targetRuleName);

    if (!targetRule) return;

    // 1. Split the text block into individual URLs
    const urlsToAdd = urlBlock
        .split('\n')
        .map((u) => u.trim())
        .filter((u) => u && isValidUrl(u)); // Only valid and non-empty URLs

    if (urlsToAdd.length === 0) {
        showNotification('errorInvalidUrlFormat', true);
        return;
    }

    let addedCount = 0;
    let movedCount = 0;

    // 2. Process each URL
    for (const url of urlsToAdd) {
        const normalizedUrl = normalizeUrl(url);

        // Check if it already exists in the target rule
        const alreadyInTarget = targetRule.urls.some((u) => normalizeUrl(u) === normalizedUrl);
        if (alreadyInTarget) continue;

        // Look for it in another rule to move it
        let sourceRule = customRules.find((r) => r.urls.some((u) => normalizeUrl(u) === normalizedUrl));

        if (sourceRule) {
            if (sourceRule.name !== targetRuleName) {
                // Move rule
                sourceRule.urls = sourceRule.urls.filter((u) => normalizeUrl(u) !== normalizedUrl);
                targetRule.urls.push(url);
                movedCount++;
            }
        } else {
            // Add new
            targetRule.urls.push(url);
            addedCount++;
        }
    }

    // 3. Save changes
    await storage.set({ customRules });

    // 4. Dynamic notifications
    if (addedCount > 0 || movedCount > 0) {
        const total = addedCount + movedCount;
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: getI18nMsg('urlAddedSuccessTitle'),
            message: getI18nMsg('urlAddedSuccessMessageWithUrl', [total.toString(), targetRuleName]),
        });

        // Update UI and Regroup
        chrome.runtime.sendMessage({ action: 'rulesUpdated' });
        await groupTabs();
    } else {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: getI18nMsg('validationErrorTitle'),
            message: getI18nMsg('errorUrlAlreadyInTargetRule', ['...', targetRuleName]),
        });
    }
}

function debounceUpdateAllGroupPrefixes(windowId, options = {}, delay = 250) {
    const existingPendingUpdate = pendingPrefixUpdates.get(windowId);

    if (existingPendingUpdate && existingPendingUpdate.timer) {
        clearTimeout(existingPendingUpdate.timer);
    }

    const existingOptions = existingPendingUpdate ? existingPendingUpdate.options : {};

    const mergedOptions = { ...existingOptions, ...options };

    const newTimer = setTimeout(async () => {
        try {
            logMessage(`[Debounced Update] Executing updateAllGroupPrefixes for window ${windowId}.`);

            await updateAllGroupPrefixes(
                windowId,
                mergedOptions.targetGroupId,
                mergedOptions.isEdit,
                mergedOptions.cachedGroups,
                mergedOptions.cachedTabs,
                mergedOptions.groupNeedsWarning,
            );
        } finally {
            // The map entry is removed once the operation has been executed.
            pendingPrefixUpdates.delete(windowId);
        }
    }, delay);

    // The new timer and the full set of options are stored for the next call.
    pendingPrefixUpdates.set(windowId, { timer: newTimer, options: mergedOptions });
}

function debounceGroupTabs(delay = 250) {
    if (groupTabsTimer) {
        clearTimeout(groupTabsTimer);
    }
    groupTabsTimer = setTimeout(async () => {
        logMessage('[debounceGroupTabs] Executing groupTabs() after pause.');
        await groupTabs();
        chrome.runtime.sendMessage({ action: 'refreshUI' }, () => {
            // Callback function to handle the error if no UI is listening.
            if (chrome.runtime.lastError) {
                logMessage('Could not send refreshUI message. UI is likely closed.');
            }
        });
        groupTabsTimer = null;
    }, delay);
}

async function getRulesFromStorage() {
    const storage = await getSettingsStorage();
    const { customRules = [] } = await storage.get('customRules');
    return customRules;
}

async function getSortAlphabeticallySetting() {
    try {
        logMessage('Querying storage area...');
        const storage = await getSettingsStorage();
        logMessage(`Storage area determined: ${storage === chrome.storage.sync ? 'sync' : 'local'}.`);

        logMessage("Requesting 'sortGroupsAlphabetically' from API with default value 'true'.");
        const data = await storage.get({ sortGroupsAlphabetically: true });
        const sortValue = data.sortGroupsAlphabetically;

        logMessage(`SUCCESS: Value for 'sortGroupsAlphabetically' from API is: ${sortValue}.`);

        return sortValue;
    } catch (error) {
        console.error("ERROR: Failed to query 'sortGroupsAlphabetically' from API.", error);
        logMessage("Returning safe default value 'true' due to an error.");
        return true;
    }
}

async function getSettingsStorage() {
    const { ruleStorageArea = 'sync' } = await chrome.storage.local.get('ruleStorageArea');
    return ruleStorageArea === 'local' ? chrome.storage.local : chrome.storage.sync;
}

function generateGroupIdentifier(cleanTitle, tabCount, groupId = null) {
    if (groupId !== null) {
        const identifier = `${cleanTitle}_${groupId}`;
        return identifier;
    }
    const identifier = `${cleanTitle}_${tabCount}`;
    return identifier;
}

async function clearAllGroupPrefixes(windowId) {
    const groups = await chrome.tabGroups.query({ windowId });
    for (const group of groups) {
        const info = groupInfoMap.get(group.id);

        if (!info) {
            console.warn(`[clearAllGroupPrefixes] No info found for group ${group.id}, skipping.`);
            continue;
        }

        const baseName = getBaseGroupName(info.title);

        if (info.isCompact) {
            const compactTitle = (baseName.charAt(0) || '?').toUpperCase();
            if (group.title !== compactTitle) {
                await executeWithRetries(
                    async () => await chrome.tabGroups.update(group.id, { title: compactTitle }),
                    `clearing group prefix for compact group ${group.id} to "${compactTitle}"`,
                );
            }
        } else {
            if (group.title !== baseName) {
                await executeWithRetries(
                    async () => await chrome.tabGroups.update(group.id, { title: baseName }),
                    `clearing group prefix for normal group ${group.id} to "${baseName}"`,
                );
            }
        }
    }
}

function getRandomColor() {
    const colors = ['red', 'yellow', 'green', 'blue', 'purple', 'pink', 'orange', 'cyan'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function capitalizeFirstLetter(string) {
    return string ? string.charAt(0).toUpperCase() + string.slice(1) : string;
}

function cleanGroupTitle(title) {
    if (!title) return '';
    let cleanedTitle = title;

    // Sort prefixes by length descending to avoid partial replacements.
    // Sort prefixes by length descending to avoid partial replacements.
    const prefixes = new Set([
        CURRENT_PREFIX_WARNING,
        CURRENT_PREFIX_WARNING.trim(),
        CURRENT_PREFIX_LOCK,
        CURRENT_PREFIX_LOCK.trim(),
        CURRENT_PREFIX_OPENKEY,
        CURRENT_PREFIX_OPENKEY.trim(),
        CURRENT_PREFIX_LOUPE,
        CURRENT_PREFIX_LOUPE.trim(),
        CURRENT_PREFIX_CHECKED,
        CURRENT_PREFIX_CHECKED.trim(),
    ]);

    const currentPrefixesForCleaning = [...prefixes]
        .filter((p) => typeof p === 'string' && p.length > 0)
        .sort((a, b) => b.length - a.length);

    if (currentPrefixesForCleaning.length === 0) {
        return cleanedTitle.trim();
    }

    let wasCleanedInThisIteration;
    do {
        wasCleanedInThisIteration = false;
        for (const prefix of currentPrefixesForCleaning) {
            if (cleanedTitle.startsWith(prefix)) {
                cleanedTitle = cleanedTitle.substring(prefix.length);
                wasCleanedInThisIteration = true;
            }
        }
    } while (wasCleanedInThisIteration);

    return cleanedTitle.trim();
}

function containsManagedPrefix(title) {
    return ALL_MANAGED_PREFIXES.some((prefix) => prefix && title.startsWith(prefix));
}

function rebuildPrefixManagementVariables() {
    ALL_MANAGED_PREFIXES = [
        CURRENT_PREFIX_LOCK,
        CURRENT_PREFIX_OPENKEY,
        CURRENT_PREFIX_LOUPE,
        CURRENT_PREFIX_CHECKED,
        CURRENT_PREFIX_WARNING,
    ];

    NON_EMPTY_PREFIXES_FOR_REGEX = ALL_MANAGED_PREFIXES.filter((p) => p.trim() !== '');
    const regexPattern =
        NON_EMPTY_PREFIXES_FOR_REGEX.length > 0
            ? `^(?:${NON_EMPTY_PREFIXES_FOR_REGEX.map((p) => p.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(
                  '|',
              )})`
            : '^()$';
    PREFIX_REGEX = new RegExp(regexPattern, 'g');

    CURRENT_PREFIX_PRIORITIES = {
        [CURRENT_PREFIX_LOCK]: BASE_CURRENT_PREFIX_PRIORITIES.lock,
        [CURRENT_PREFIX_OPENKEY]: BASE_CURRENT_PREFIX_PRIORITIES.openKey,
        [CURRENT_PREFIX_LOUPE]: BASE_CURRENT_PREFIX_PRIORITIES.loupe,
        [CURRENT_PREFIX_CHECKED]: BASE_CURRENT_PREFIX_PRIORITIES.checked,
    };
    logMessage('[rebuildPrefixManagementVariables] Variables rebuilt.');
}

function loadUserDefinedPrefixes() {
    const loadedPrefixes = extensionSettings.userPrefixes || DEFAULT_USER_PREFIXES;

    CURRENT_PREFIX_LOCK = loadedPrefixes.lock ? '\u200B\u200B' + loadedPrefixes.lock + ' ' : '\u200B\u200B';
    CURRENT_PREFIX_OPENKEY = loadedPrefixes.openKey ? '\u200B\u200B' + loadedPrefixes.openKey + ' ' : '\u200B\u200B';
    CURRENT_PREFIX_LOUPE = loadedPrefixes.loupe ? '\u200B\u200B' + loadedPrefixes.loupe + ' ' : '\u200B\u200B';
    CURRENT_PREFIX_CHECKED = loadedPrefixes.checked ? '\u200B\u200B' + loadedPrefixes.checked + ' ' : '\u200B\u200B';
    CURRENT_PREFIX_WARNING = loadedPrefixes.warning ? '\u200B\u200B' + loadedPrefixes.warning + ' ' : '\u200B\u200B';

    rebuildPrefixManagementVariables();
    logMessage('[loadUserDefinedPrefixes] Prefixes loaded and rebuilt successfully.');
}

const COMPOUND_TLDS_SET = new Set([
    'co.uk',
    'com.br',
    'co.jp',
    'co.za',
    'gov.ar',
    'edu.es',
    'ac.uk',
    'net.au',
    'org.uk',
    'com.au',
]);

function getDomain(url, useSubdomain = false) {
    try {
        const hostname = new URL(url).hostname;

        if (isIPAddress(hostname) || isLocalhost(hostname)) {
            return null;
        }

        const parts = hostname.split('.');

        // First, try to get the subdomain if the option is enabled.
        if (useSubdomain) {
            const isCompound = parts.length > 2 && COMPOUND_TLDS_SET.has(parts.slice(-2).join('.'));
            const minPartsForSubdomain = isCompound ? 4 : 3;

            if (parts.length >= minPartsForSubdomain) {
                if (parts[0].toLowerCase() === 'www') {
                    if (parts.length >= minPartsForSubdomain + 1) {
                        return capitalizeFirstLetter(parts[1]) + '\u200B';
                    }
                } else {
                    return capitalizeFirstLetter(parts[0]) + '\u200B';
                }
            }
        }

        // Main domain logic (used if useSubdomain is false OR if no subdomain was found).
        if (parts.length > 2) {
            const possibleCompoundTLD = parts.slice(-2).join('.');
            if (COMPOUND_TLDS_SET.has(possibleCompoundTLD)) {
                return capitalizeFirstLetter(parts.slice(-3, -2)[0]) + '\u200B';
            }
        }
        if (parts.length >= 2) {
            return capitalizeFirstLetter(parts.slice(-2, -1)[0]) + '\u200B';
        }

        return null;
    } catch {
        return null;
    }
}

function isTitleInvalidForUpdate(newTitle) {
    // Condition 1: The title is null, undefined, empty, or only contains whitespace.
    // This doesn't change.
    if (!newTitle || newTitle.trim() === '') {
        console.warn('[Validation] Blocked title: it is empty or only contains spaces.');
        return true;
    }

    const trimmedTitle = newTitle.trim();

    // --- DEFENSE LAYER 1: Validate against user's "raw" prefixes ---
    // We get the prefixes as defined by the user from the active configuration.
    const rawUserPrefixes = Object.values(extensionSettings.userPrefixes || DEFAULT_USER_PREFIXES).filter(
        (p) => p && p.trim() !== '',
    );

    // We check if the title (without spaces) is exactly equal to one of these prefixes.
    if (rawUserPrefixes.some((prefix) => trimmedTitle === prefix.trim())) {
        console.warn(`[Validation] Blocked title: "${trimmedTitle}" is identical to a defined user prefix.`);
        return true;
    }

    // --- DEFENSE LAYER 2: Validate against "managed" system prefixes ---
    // We use ALL_MANAGED_PREFIXES, which contains the prefixes with invisible markers and spaces.
    // We filter those that are empty.
    const managedSystemPrefixes = ALL_MANAGED_PREFIXES.filter((p) => p && p.trim() !== '');

    // We check if the received title is identical to one of the prefixes the system uses internally.
    // Here we don't use trim() on the system prefix, since the final space is part of its identity.
    if (managedSystemPrefixes.some((prefix) => newTitle === prefix)) {
        console.warn(`[Validation] Blocked title: "${newTitle}" is identical to a system-managed prefix.`);
        return true;
    }

    // If it passes all validations, the title is valid.
    return false;
}

function cleanUrlForDisplay(url) {
    return normalizeUrl(url);
}

/**
 * Toggles the active state of a specific rule.
 */
async function toggleRuleActiveState(ruleName) {
    const storage = await getSettingsStorage();
    const customRules = extensionSettings.customRules || (await getRulesFromStorage());
    const ruleToUpdate = customRules.find((r) => r.name === ruleName);

    if (ruleToUpdate) {
        ruleToUpdate.active = !ruleToUpdate.active;
        await storage.set({ customRules: [...customRules] });

        // UI updates and regrouping are centrally managed.
        sendMessageToUI({ action: 'rulesUpdated' });
        await groupTabs();
        await setupContextMenus();
    } else {
        console.warn(`[toggleRuleActiveState] Rule "${ruleName}" not found.`);
    }
}

/**
 * Closes all tabs matching a URL, after verifying it doesn't belong to another active rule.
 */
async function closeTabsForUrlCommand(urlToClose, originatingRuleName, groupId) {
    logMessage(
        `[closeTabsForUrlCommand] Initiated for URL "${urlToClose}" in rule "${originatingRuleName}" within group ${groupId}.`,
    );

    if (groupId === -1 || groupId === undefined) {
        logMessage(`[closeTabsForUrlCommand] Aborted: Invalid groupId received.`);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: getI18nMsg('errorTitle') || 'Error',
            message: `No se pudo encontrar un grupo para la regla '${originatingRuleName}'.`,
        });
        return;
    }

    // 1. Get ONLY the tabs that are within the specified group.
    const tabsInGroup = await chrome.tabs.query({ groupId: groupId });

    // 2. Filter those tabs to find the ones that match the URL to close.
    const tabsToClose = tabsInGroup.filter((tab) => tab.url && tab.url.includes(urlToClose));
    const tabIdsToClose = tabsToClose.map((tab) => tab.id);

    if (tabIdsToClose.length > 0) {
        await chrome.tabs.remove(tabIdsToClose);
        logMessage(`[closeTabsForUrlCommand] Successfully closed ${tabIdsToClose.length} tabs.`);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: getI18nMsg('tabsClosedForUrlSuccessTitle'),
            message: getI18nMsg('tabsClosedForUrlSuccessMessage', [
                tabIdsToClose.length.toString(),
                cleanUrlForDisplay(urlToClose),
            ]),
        });
    } else {
        logMessage(`[closeTabsForUrlCommand] No tabs found matching the URL within the group.`);
    }
}

async function removeDuplicateTabsCommand() {
    logMessage('[removeDuplicateTabsCommand] Starting process to remove duplicate tabs.');

    // 1. Get all tabs from all windows.
    const allTabs = await chrome.tabs.query({});

    // 2. Group tabs by their exact URL.
    const urlMap = new Map();
    for (const tab of allTabs) {
        // We only process tabs with valid URLs to avoid closing internal or blank tabs.
        if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
            if (!urlMap.has(tab.url)) {
                urlMap.set(tab.url, []);
            }
            urlMap.get(tab.url).push(tab);
        }
    }

    // 3. Identify and collect the IDs of the tabs to be closed.
    const tabIdsToRemove = [];
    let duplicatesFoundCount = 0;

    for (const tabs of urlMap.values()) {
        // If there is more than one tab for the same URL, they are duplicates.
        if (tabs.length > 1) {
            // We keep the first tab found (tabs[0]) and prepare to close the rest.
            const tabsToClose = tabs.slice(1);
            const idsToClose = tabsToClose.map((tab) => tab.id);
            tabIdsToRemove.push(...idsToClose);
            duplicatesFoundCount += idsToClose.length;
        }
    }

    // 4. Close all duplicate tabs at once.
    if (tabIdsToRemove.length > 0) {
        logMessage(`[removeDuplicateTabsCommand] Found ${duplicatesFoundCount} duplicate tabs. Closing them.`);
        await chrome.tabs.remove(tabIdsToRemove);

        // 5. Notify the user about the action taken.
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: getI18nMsg('removeDuplicatesSuccessTitle'),
            message: getI18nMsg('removeDuplicatesSuccessMessage', [duplicatesFoundCount.toString()]),
        });
    } else {
        logMessage('[removeDuplicateTabsCommand] No duplicate tabs found.');
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: getI18nMsg('removeDuplicatesNoneFoundTitle'),
            message: getI18nMsg('removeDuplicatesNoneFoundMessage'),
        });
    }
}

async function removeTabsByDomainCommand(domain) {
    logMessage(`[removeTabsByDomainCommand] Starting process to remove tabs for domain: ${domain}.`);

    // 1. Get all tabs from all windows.
    const allTabs = await chrome.tabs.query({});

    // 2. Filter the tabs that belong to the selected domain.
    const tabsToRemove = allTabs.filter((tab) => {
        // We only process tabs with valid URLs.
        if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
            try {
                const tabDomain = new URL(tab.url).hostname;
                return tabDomain === domain;
            } catch (e) {
                // Ignore URLs that cannot be parsed.
                return false;
            }
        }
        return false;
    });

    const tabIdsToRemove = tabsToRemove.map((tab) => tab.id);
    const tabsRemovedCount = tabIdsToRemove.length;

    // 3. Close all identified tabs at once.
    if (tabsRemovedCount > 0) {
        logMessage(`[removeTabsByDomainCommand] Found ${tabsRemovedCount} tabs for domain ${domain}. Closing them.`);
        await chrome.tabs.remove(tabIdsToRemove);

        // 4. Notify the user about the action taken.
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: getI18nMsg('removeTabsByDomainSuccessTitle') || 'Tabs removed',
            message:
                getI18nMsg('removeTabsByDomainSuccessMessage', [tabsRemovedCount.toString(), domain]) ||
                `${tabsRemovedCount} tabs from domain ${domain} have been removed.`,
        });
    } else {
        logMessage(`[removeTabsByDomainCommand] No tabs found for domain ${domain}.`);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: getI18nMsg('removeTabsByDomainNoneFoundTitle') || 'No tabs to remove',
            message:
                getI18nMsg('removeTabsByDomainNoneFoundMessage', [domain]) ||
                `No tabs were found for domain ${domain}.`,
        });
    }
}

function faviconURL(u) {
    try {
        const url = new URL(chrome.runtime.getURL('/_favicon/'));
        url.searchParams.set('pageUrl', u);
        url.searchParams.set('size', '16');
        return url.toString();
    } catch (error) {
        console.warn('Invalid URL for favicon:', error);
        return null;
    }
}

function calculateDistance(color1, color2) {
    const dr = color1.r - color2.r;
    const dg = color1.g - color2.g;
    const db = color1.b - color2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function quantize(r, g, b, granularity = 15) {
    return {
        r: Math.round(r / granularity) * granularity,
        g: Math.round(g / granularity) * granularity,
        b: Math.round(b / granularity) * granularity,
    };
}

const faviconColorCache = new Map();

async function getFaviconColor(faviconUrl) {
    if (!faviconUrl) return null;
    if (faviconColorCache.has(faviconUrl)) {
        return faviconColorCache.get(faviconUrl);
    }

    const colors = [
        { name: 'blue', rgb: { r: 20, g: 100, b: 255 } },
        { name: 'red', rgb: { r: 255, g: 40, b: 30 } },
        { name: 'yellow', rgb: { r: 255, g: 170, b: 0 } },
        { name: 'green', rgb: { r: 20, g: 130, b: 50 } },
        { name: 'pink', rgb: { r: 200, g: 20, b: 130 } },
        { name: 'purple', rgb: { r: 160, g: 60, b: 240 } },
        { name: 'cyan', rgb: { r: 0, g: 130, b: 128 } },
        { name: 'orange', rgb: { r: 255, g: 140, b: 60 } },
    ];

    const isIgnoredPixel = (r, g, b, a) => a === 0 || (r === 255 && g === 255 && b === 255);
    const isGray = (r, g, b, threshold = 15) =>
        Math.abs(r - g) <= threshold && Math.abs(r - b) <= threshold && Math.abs(g - b) <= threshold;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120);
        const response = await fetch(faviconUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) return null;

        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        const colorHistogram = {};
        for (let i = 0; i < imageData.length; i += 8) {
            const r = imageData[i],
                g = imageData[i + 1],
                b = imageData[i + 2],
                a = imageData[i + 3];
            if (!isIgnoredPixel(r, g, b, a) && !isGray(r, g, b)) {
                const quantizedColor = quantize(r, g, b);
                const colorKey = `${quantizedColor.r}-${quantizedColor.g}-${quantizedColor.b}`;
                colorHistogram[colorKey] = (colorHistogram[colorKey] || 0) + 1;
            }
        }

        if (!Object.keys(colorHistogram).length) return null;

        const dominantColorKey = Object.keys(colorHistogram).reduce((a, b) =>
            colorHistogram[a] > colorHistogram[b] ? a : b,
        );
        const [rAvg, gAvg, bAvg] = dominantColorKey.split('-').map(Number);

        let closestColor = colors[0];
        let minDistance = calculateDistance({ r: rAvg, g: gAvg, b: bAvg }, closestColor.rgb);
        for (let i = 1; i < colors.length; i++) {
            const distance = calculateDistance({ r: rAvg, g: gAvg, b: bAvg }, colors[i].rgb);
            if (distance < minDistance) {
                minDistance = distance;
                closestColor = colors[i];
            }
        }
        faviconColorCache.set(faviconUrl, closestColor.name);
        return closestColor.name;
    } catch (error) {
        console.warn('Error fetching favicon color:', error);
        faviconColorCache.set(faviconUrl, null);
        return null;
    }
}

/**
 * Enhances raw Chrome tab groups with their true display titles from groupInfoMap.
 */
function enhanceGroupsWithRealTitles(rawGroups) {
    return rawGroups.map((g) => {
        let realTitle = g.title || '';
        if (typeof groupInfoMap !== 'undefined') {
            const info = groupInfoMap.get(g.id);
            if (info) {
                if (info.type === 'manual' && info.key) {
                    realTitle = info.key.replace(/\u200B/g, '');
                } else if (info.title) {
                    realTitle = info.title.replace(/\u200B/g, '');
                } else {
                    realTitle = (info.key || g.title || '').replace(/\u200B/g, '');
                }
            }
        }
        return {
            ...g,
            title: realTitle,
        };
    });
}

function openCreateRuleModalForUrl(pageUrl, windowId, isFullUrl = false) {
    const rulesPath = 'src/ui/pages/rules/rules.html';
    let targetUrl = pageUrl;
    if (!isFullUrl) {
        try {
            targetUrl = new URL(pageUrl).origin;
        } catch (e) {
            console.warn('Could not parse origin from URL:', pageUrl);
        }
    }

    chrome.sidePanel.setOptions({ path: rulesPath, enabled: true });
    chrome.sidePanel.open({ windowId: windowId });
    activeSidePanelPath = rulesPath;

    setTimeout(() => {
        chrome.runtime.sendMessage({
            action: 'create-rule-from-context',
            url: targetUrl,
        });
    }, 500);
}

function openAddToRuleModalForUrl(pageUrl, baseTitle, windowId) {
    const listGroupPath = 'src/ui/pages/listGroup/listGroup.html';

    chrome.sidePanel.setOptions({ path: listGroupPath, enabled: true });
    chrome.sidePanel.open({ windowId: windowId });
    activeSidePanelPath = listGroupPath;

    setTimeout(() => {
        chrome.runtime.sendMessage({
            action: 'open-add-to-rule-modal-shortcut',
            url: pageUrl,
            title: baseTitle || '',
        });
    }, 500);
}
