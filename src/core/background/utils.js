/**
 * [AI INSTRUCTION]
 * HOW EVERY SEARCH IN THE WORKER COMPARES TEXT. Use `foldForSearch` on BOTH sides of a
 * comparison against something a person typed.
 *
 * Nobody reaches for the accent key while searching, and what is being searched — page
 * titles, group names, the names of their own rules — is full of them. Lowercasing
 * alone leaves `dia` and `día` as different strings, so a search that should obviously
 * match quietly finds nothing.
 *
 * `NFD` splits an accented letter into the letter and its mark; dropping the marks
 * leaves the letter. `ñ` becomes `n` as a side effect, which is what a Spanish reader
 * expects of a search box anyway. Folding is for COMPARING only — what is displayed is
 * always the original text.
 *
 * The UI bundle has its own copy in `src/ui/services/utils.js` and the hint content
 * scripts a third: three bundles that cannot import from each other, not three
 * different rules.
 */
function deaccent(str) {
    return String(str ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function foldForSearch(str) {
    return deaccent(str).toLowerCase();
}

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
    } catch {
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

// The messages file never changes while the worker is alive, but the context menus
// are rebuilt on every group change and each rebuild used to re-read the language
// from storage and re-fetch and re-parse the whole locale file.
let loadedI18nLang = null;
let loadI18nMessagesPromise = null;

async function loadI18nMessages(force = false) {
    if (force) {
        loadedI18nLang = null;
        loadI18nMessagesPromise = null;
    }
    if (loadedI18nLang && currentLang === loadedI18nLang) return;
    if (loadI18nMessagesPromise) return loadI18nMessagesPromise;

    loadI18nMessagesPromise = (async () => {
        try {
            const result = await chrome.storage.local.get('preferred-language');
            currentLang = result['preferred-language'] || (chrome.i18n.getUILanguage().startsWith('es') ? 'es' : 'en');

            const url = chrome.runtime.getURL(`_locales/${currentLang}/messages.json`);
            const response = await fetch(url);
            if (response.ok) {
                currentLangMessages = await response.json();
                loadedI18nLang = currentLang;
                logMessage(`[i18n] Loaded messages for: ${currentLang}`);
            } else {
                console.error(`[i18n] Failed to load messages for ${currentLang}`);
                // Fallback to internal i18n if fetch fails
            }
        } catch (error) {
            console.error('[i18n] Error loading messages:', error);
        } finally {
            loadI18nMessagesPromise = null;
        }
    })();
    return loadI18nMessagesPromise;
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

// --- Where a note or a capture taken from a page gets filed ---
//
// Two kinds of content are made out of a tab — a capture and a note — and both are
// filed the same way: the record carries the group's *stable* key, which survives
// Chrome renumbering groups between sessions, and a session index lists the id under
// the numeric ids of this session. These three are that rule, in one place.

/**
 * The key a record of `tab` is stored under.
 * @param {chrome.tabs.Tab} tab
 * @returns {string} 'g_ungrouped', or 'g_' and the group's stable key.
 */
function getContentContextKey(tab) {
    if (tab.groupId !== -1 && tab.groupId !== -100) {
        const info = groupInfoMap.get(tab.groupId);
        return info && info.key ? `g_${info.key}` : `g_${tab.groupId}`;
    }
    return 'g_ungrouped';
}

/**
 * The session keys that record is listed under: the group it is in, and the domain it
 * came from inside that group. A tab with no readable URL has no subgroup.
 *
 * @param {chrome.tabs.Tab} tab
 * @returns {{group: string, subgroup: string|null}}
 */
function getContentSessionKeys(tab) {
    const ungrouped = tab.groupId === -1 || tab.groupId === -100;
    const group = ungrouped ? 'g_ungrouped' : `g_${tab.groupId}`;
    try {
        // `new URL` swallows `about:blank` and friends without complaint and hands back
        // an empty hostname, which used to be filed under a key ending in nothing.
        const domain = new URL(tab.url).hostname.replace(/^www\./, '');
        if (!domain) return { group, subgroup: null };
        return { group, subgroup: ungrouped ? `s_ungrouped_${domain}` : `s_${tab.groupId}_${domain}` };
    } catch {
        return { group, subgroup: null };
    }
}

/**
 * Adds one id to a session index. The SINGLE source of truth for that index; do not
 * duplicate this pattern elsewhere.
 *
 * @param {string} storageKey Which index — captures and notes keep their own.
 * @param {Array<string|null>} keys The keys to list it under; empty ones are skipped.
 * @param {number} id
 */
async function addToContentSessionIndex(storageKey, keys, id) {
    const { [storageKey]: index = {} } = await chrome.storage.session.get(storageKey);
    for (const key of keys) {
        if (!key) continue;
        if (!index[key]) index[key] = [];
        // Adding the same id twice would show the same note or capture twice in the
        // list it is filed under; a note that is added to arrives here again.
        if (!index[key].includes(id)) index[key].push(id);
    }
    await chrome.storage.session.set({ [storageKey]: index });
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
            } catch {
                /* Ignore invalid URLs */
            }
        }

        chrome.contextMenus.create({
            id: 'remove-domain-tabs-parent',
            title: getI18nMsg('contextMenuRemoveTabsByDomain'),
            contexts: ['page'],
        });

        // Ordered for a person to read down the menu, not by code point.
        const sortedDomains = [...domainCountMap.keys()].sort((a, b) =>
            String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }),
        );

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

        // The page reader, one click from anywhere on the page. It is the same toggle
        // as the panel button, the `ar` command and the `ar:` omnibar prefix — a second
        // click stops the reading — so the entry keeps a single title and lets the
        // notification say which of the two just happened.
        //
        // There are two of them because the reader takes a selection as an explicit
        // "read this" and reads only that, so an entry opened over selected text would
        // be lying if it said "the page". Both do the very same thing; only the title
        // differs, and Chrome shows whichever matches the context the menu was opened
        // in.
        chrome.contextMenus.create({
            id: 'read-page-aloud',
            title: getI18nMsg('readPageAloud'),
            contexts: ['page', 'image', 'link'],
        });
        chrome.contextMenus.create({
            id: 'read-selection-aloud',
            title: getI18nMsg('readSelectionAloud'),
            contexts: ['selection'],
        });
        chrome.contextMenus.create({
            id: 'note-from-selection',
            title: getI18nMsg('contextMenuNoteFromSelection'),
            contexts: ['selection'],
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
        // showNotification lives in src/utils/i18n.js, which the worker never loads:
        // this path threw ReferenceError instead of warning. The success path of this
        // same function already notifies the right way.
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: getI18nMsg('errorInvalidUrlFormat'),
            message: getI18nMsg('errorInvalidUrlFormat'),
        });
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
                mergedOptions.isEditGroupId ?? null,
            );
        } finally {
            // The map entry is removed once the operation has been executed.
            pendingPrefixUpdates.delete(windowId);
        }
    }, delay);

    // The new timer and the full set of options are stored for the next call.
    pendingPrefixUpdates.set(windowId, { timer: newTimer, options: mergedOptions });
}

/**
 * Coalesces the second look at the colours of the groups still waiting for one.
 * Several tabs report their favicon within a few milliseconds of each other, and
 * the whole point of the pass is to be cheaper than a regroup.
 */
let pendingGroupColorsTimer = null;

function debounceRefreshPendingGroupColors(delay = 600) {
    clearTimeout(pendingGroupColorsTimer);
    pendingGroupColorsTimer = setTimeout(async () => {
        pendingGroupColorsTimer = null;
        try {
            await refreshPendingGroupColors();
        } catch (e) {
            logMessage('[Favicon] The pending colour pass failed.', e);
        }
    }, delay);
}

/** Whether any group is still showing a stand-in colour. Cheap enough to ask often. */
function hasGroupsAwaitingFaviconColor() {
    for (const info of groupInfoMap.values()) {
        if (info?.colorPending) return true;
    }
    return false;
}

let hasPendingRegroup = false;

function debounceGroupTabs(delay = 250) {
    if (isGrouping) {
        hasPendingRegroup = true;
        return;
    }
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

/**
 * The identity key that survives a session restore.
 *
 * The other two keys do not. The one built from the group id dies the moment the
 * browser hands out new ids, which it does on every restore; the one built from the
 * number of tabs dies as soon as that number changes — a tab closed just before the
 * crash, a restore that has not finished bringing the group's tabs back — and it
 * also collides between two groups that share a name. When both miss, the group's
 * type and the name the user gave it are gone, and the group has to be guessed from
 * its pages: a renamed "Misc" then comes back as a manual group, and a renamed
 * domain group gets the domain's name written back over the user's.
 *
 * The name alone is the only part of a group that Chrome does restore verbatim, so
 * it is what the identity is filed under as a last resort.
 */
function generateGroupNameIdentifier(cleanTitle) {
    // In compact mode the tab strip shows a single letter instead of the name, and a
    // single letter is not an identity: every group starting with it would answer to
    // the same key. Those groups keep the other two keys and go without this one.
    if (!cleanTitle || cleanTitle.trim().length < 2) return null;
    return `${cleanTitle}_@name`;
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

const DOMAIN_PALETTE = ['blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'purple', 'pink'];

function getDeterministicColor(str) {
    if (!str) return 'blue';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return DOMAIN_PALETTE[Math.abs(hash) % DOMAIN_PALETTE.length];
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
            } catch {
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

/**
 * Converts RGB values to HSL representation.
 * @param {number} r (0-255)
 * @param {number} g (0-255)
 * @param {number} b (0-255)
 * @returns {{ h: number, s: number, l: number }} h in [0, 360), s and l in [0, 1]
 */
function rgbToHsl(r, g, b) {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const d = max - min;
    const l = (max + min) / 2;

    if (d === 0) {
        return { h: 0, s: 0, l };
    }

    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    switch (max) {
        case rNorm:
            h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
            break;
        case gNorm:
            h = (bNorm - rNorm) / d + 2;
            break;
        case bNorm:
            h = (rNorm - gNorm) / d + 4;
            break;
    }
    h = Math.round(h * 60);
    return { h, s, l };
}

/**
 * Maps HSL values to one of Chrome's official tab group colors:
 * 'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'.
 */
function classifyHslToChromeGroupColor(h, s, l) {
    // Low saturation or extreme lightness is treated as neutral/grey
    if (s < 0.14 || l < 0.08 || l > 0.94) {
        return 'grey';
    }

    // Precise hue boundaries based on perceptual color appearance:
    // - Orange: 15° to 44° (e.g. Reddit, SoundCloud, Substack, GitLab, Cloudflare)
    // - Yellow: 45° to 68° (e.g. Snapchat, Google Keep, IMDb)
    // - Green:  69° to 164°
    // - Cyan:   165° to 194°
    // - Blue:   195° to 254°
    // - Purple: 255° to 294°
    // - Pink:   295° to 344°
    // - Red:    345° to 360° and 0° to 14°
    if (h >= 15 && h < 45) return 'orange';
    if (h >= 45 && h < 69) return 'yellow';
    if (h >= 69 && h < 165) return 'green';
    if (h >= 165 && h < 195) return 'cyan';
    if (h >= 195 && h < 255) return 'blue';
    if (h >= 255 && h < 295) return 'purple';
    if (h >= 295 && h < 345) return 'pink';
    return 'red';
}

/**
 * Where a group's colour comes from, and why it used to be wrong.
 *
 * The icon is read from Chrome's own `_favicon` endpoint, which hands back exactly
 * what the browser paints on the tab strip: already rasterised to PNG, read off disk
 * in 1-3 ms, and never a request to anybody. Asking it for the origin rather than the
 * page address gets the same icon for every page of a site, so one lookup answers for
 * all of them.
 *
 * The obvious alternative is the address the page itself declared, on `favIconUrl`.
 * It was what this used to ask for first, and it was the wrong choice three times
 * over: it costs a network round trip naming a page the user is reading (measured
 * between 3 ms and 285 ms, against 1-3 ms here); `createImageBitmap` has no SVG
 * decoder inside a worker, so it fails outright on GitHub, Stack Overflow, MDN and
 * Hacker News — precisely the sites with the most recognisable colour; and Chrome has
 * already rasterised that same icon anyway. Measured against the endpoint below it
 * never once produced an answer the endpoint had not already given, so it is gone.
 *
 * The one catch is that while a site is still unknown to the favicon database the
 * endpoint answers with a placeholder globe rather than failing. The placeholder is
 * grey, so it classifies as "no colour" — and that answer was filed away as final. A
 * group created in the gap between the page loading and its favicon arriving
 * therefore kept a fallback colour for the rest of the session, which is what made
 * the colour look right sometimes and wrong other times for the same site. So "no
 * colour" is only believed when it came from a real icon: the placeholder is
 * recognised by its own bytes, read once from a domain that cannot be visited, since
 * hard-coding them would not survive a Chrome release or a change of theme. An
 * answer that is not believed is asked for again, which is what `colorPending` on a
 * group is for.
 */
const FAVICON_REQUEST_SIZE = 32;
const FAVICON_MAX_SAMPLE_SIDE = 64;
const FAVICON_LOCAL_TIMEOUT_MS = 500;
const FAVICON_RETRY_DELAY_MS = 4000;
const FAVICON_MAX_TRIES = 8;

const faviconColorCache = new Map(); // origin -> { color, definitive, ts, tries }
const faviconColorInFlight = new Map(); // origin -> Promise
const FAVICON_COLOR_CACHE_KEY = 'faviconColorCache_v3';
let faviconColorCacheLoaded = false;
let faviconColorSaveTimer = null;
let placeholderFaviconSignature = null;
let placeholderFaviconProbe = null;

/** The `_favicon` address for a site, keyed by origin so every page shares it. */
function faviconURL(u, size = FAVICON_REQUEST_SIZE) {
    try {
        const url = new URL(chrome.runtime.getURL('/_favicon/'));
        let pageUrl = u;
        try {
            pageUrl = new URL(u).origin;
        } catch {
            // Not a parseable address (a file path, say): let the endpoint decide.
        }
        url.searchParams.set('pageUrl', pageUrl);
        url.searchParams.set('size', String(size));
        return url.toString();
    } catch (error) {
        console.warn('Invalid URL for favicon:', error);
        return null;
    }
}

/** Survives the service worker being torn down between grouping runs. */
async function ensureFaviconColorCacheLoaded() {
    if (faviconColorCacheLoaded) return;
    faviconColorCacheLoaded = true;
    try {
        const stored = await chrome.storage.session.get(FAVICON_COLOR_CACHE_KEY);
        for (const [key, value] of Object.entries(stored[FAVICON_COLOR_CACHE_KEY] || {})) {
            if (!faviconColorCache.has(key) && value && typeof value === 'object') {
                faviconColorCache.set(key, value);
            }
        }
    } catch (e) {
        logMessage('[Favicon] Could not restore the colour cache from session storage.', e);
    }
}

function scheduleFaviconColorCacheSave() {
    clearTimeout(faviconColorSaveTimer);
    faviconColorSaveTimer = setTimeout(() => {
        chrome.storage.session
            .set({ [FAVICON_COLOR_CACHE_KEY]: Object.fromEntries(faviconColorCache) })
            .catch(() => {});
    }, 1000);
}

function clearFaviconColorCache() {
    faviconColorCache.clear();
    faviconColorInFlight.clear();
    placeholderFaviconSignature = null;
    placeholderFaviconProbe = null;
    chrome.storage.session.remove(FAVICON_COLOR_CACHE_KEY).catch(() => {});
    logMessage('[Favicon] Favicon color cache cleared successfully.');
}

/** Enough of the bytes to tell two icons apart without keeping either. */
function faviconSignature(bytes) {
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) {
        hash = ((hash << 5) - hash + bytes[i]) | 0;
    }
    return `${bytes.length}:${hash}`;
}

/**
 * The bytes Chrome answers with when it has never seen the site's favicon.
 * Read once, from a domain that cannot resolve, so nothing can ever have been
 * stored for it.
 */
async function getPlaceholderFaviconSignature() {
    if (placeholderFaviconSignature !== null) return placeholderFaviconSignature;
    if (!placeholderFaviconProbe) {
        placeholderFaviconProbe = (async () => {
            const answer = await fetchFaviconBytes(
                faviconURL('https://never-visited.invalid/'),
                FAVICON_LOCAL_TIMEOUT_MS,
            );
            // Without it the placeholder simply counts as a colourless icon, which is
            // how this behaved before: a fallback colour, and no retry.
            placeholderFaviconSignature = answer ? faviconSignature(answer.bytes) : '';
            return placeholderFaviconSignature;
        })();
    }
    return placeholderFaviconProbe;
}

/**
 * `no-store` because the whole point of asking again is to find out whether Chrome
 * has learned the site's icon since last time; a cached answer would be the
 * placeholder for ever.
 */
async function fetchFaviconBytes(url, timeoutMs) {
    if (!url) return null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob || blob.size === 0) return null;
        return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
    } catch {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * The dominant colour of an icon, as one of Chrome's tab group colours, or null
 * when the icon has no colour to speak of (a black and white logo, say).
 * `decoded` tells that apart from an icon that could not be read at all.
 */
async function colorFromFaviconImage(blob) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(blob);
    } catch {
        return { decoded: false, color: null };
    }
    try {
        if (!bitmap.width || !bitmap.height) return { decoded: false, color: null };

        // Icons come in every size up to 256 px, and the vote below reads every
        // pixel. Anything larger than this is drawn down first: a dominant colour
        // does not need 65 000 samples, and the groups are counted in dozens.
        const longest = Math.max(bitmap.width, bitmap.height);
        const scale = longest > FAVICON_MAX_SAMPLE_SIDE ? FAVICON_MAX_SAMPLE_SIDE / longest : 1;
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height).data;

        const votes = {
            red: 0,
            orange: 0,
            yellow: 0,
            green: 0,
            cyan: 0,
            blue: 0,
            purple: 0,
            pink: 0,
        };

        let totalChromaticWeight = 0;

        for (let i = 0; i < imageData.length; i += 4) {
            const a = imageData[i + 3];
            if (a < 30) continue; // Ignore transparent pixels

            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];

            // Ignore pure white/near-white backgrounds and near-black pixels
            if (r > 248 && g > 248 && b > 248) continue;
            if (r < 8 && g < 8 && b < 8) continue;

            const { h, s, l } = rgbToHsl(r, g, b);
            const category = classifyHslToChromeGroupColor(h, s, l);
            if (category === 'grey') continue;

            // Weight by saturation and alpha so vibrant brand colors dominate over dull tints
            const weight = (a / 255) * Math.pow(s, 1.2) * (1 - Math.abs(l - 0.5) * 0.8);
            votes[category] += weight;
            totalChromaticWeight += weight;
        }

        // Nothing coloured enough to build a group around: grey is reserved for misc,
        // so the caller falls back to the colour derived from the group's name.
        if (totalChromaticWeight < 0.5) return { decoded: true, color: null };

        let bestColor = null;
        let maxWeight = 0;
        for (const [color, weight] of Object.entries(votes)) {
            if (weight > maxWeight) {
                maxWeight = weight;
                bestColor = color;
            }
        }
        return { decoded: true, color: bestColor };
    } catch {
        return { decoded: false, color: null };
    } finally {
        bitmap.close?.();
    }
}

/**
 * The colour of the icon Chrome holds for a site.
 * `definitive` is false when Chrome answered with its placeholder, meaning it has no
 * icon for the site yet and the question is worth asking again rather than settling
 * for a fallback colour for good.
 */
async function lookupFaviconColor(origin) {
    const local = await fetchFaviconBytes(faviconURL(origin), FAVICON_LOCAL_TIMEOUT_MS);
    if (local) {
        const placeholder = await getPlaceholderFaviconSignature();
        if (!placeholder || faviconSignature(local.bytes) !== placeholder) {
            const { decoded, color } = await colorFromFaviconImage(local.blob);
            if (decoded) return { color, definitive: true };
        }
    }
    return { color: null, definitive: false };
}

/**
 * Of the tabs that will make up a group, the one to take the site address from.
 * A group can hold more than one origin — a plain-http page, a subdomain — and a tab
 * that has already reported a favicon is one Chrome demonstrably holds an icon for.
 * It used to be whichever tab came first, which on a window being restored or a page
 * still loading is a tab that knows nothing yet.
 */
function pickFaviconSourceTab(tabs) {
    if (!Array.isArray(tabs) || tabs.length === 0) return null;
    return (
        tabs.find((t) => t?.favIconUrl && t.status === 'complete') ||
        tabs.find((t) => t?.favIconUrl) ||
        tabs.find((t) => t?.status === 'complete') ||
        tabs[0]
    );
}

/**
 * The colour for a group of tabs, taken from the favicon they share.
 * Returns `{ color, definitive }`: a null colour with `definitive` false means the
 * icon has not turned up yet and the question is worth asking again.
 */
async function resolveFaviconColor(tabs, { force = false } = {}) {
    const tab = pickFaviconSourceTab(tabs);
    if (!tab?.url) return { color: null, definitive: false };

    let origin;
    try {
        origin = new URL(tab.url).origin;
    } catch {
        return { color: null, definitive: false };
    }

    await ensureFaviconColorCacheLoaded();
    const cached = faviconColorCache.get(origin);
    if (cached) {
        const exhausted = cached.tries >= FAVICON_MAX_TRIES;
        // `force` is for the caller that has just been told the favicon arrived. The
        // wait below exists so that a burst of grouping passes does not ask the same
        // question over and over, but it was long enough to swallow that one event,
        // and then nothing else ever asked again.
        const waiting = !force && Date.now() - cached.ts < FAVICON_RETRY_DELAY_MS;
        if (cached.definitive || exhausted || waiting) {
            return { color: cached.color, definitive: cached.definitive || exhausted };
        }
    }

    // One lookup per site at a time: a window holding ten tabs of the same site used
    // to start ten identical fetches, and a grouping pass runs them all in parallel.
    const running = faviconColorInFlight.get(origin);
    if (running) return running;

    const work = (async () => {
        const result = await lookupFaviconColor(origin);
        const tries = (cached?.tries || 0) + 1;
        faviconColorCache.set(origin, {
            color: result.color,
            definitive: result.definitive,
            ts: Date.now(),
            tries,
        });
        scheduleFaviconColorCacheSave();
        return { color: result.color, definitive: result.definitive || tries >= FAVICON_MAX_TRIES };
    })();

    faviconColorInFlight.set(origin, work);
    try {
        return await work;
    } finally {
        faviconColorInFlight.delete(origin);
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

/**
 * Opens the rules page with the add-rule form ready for a URL.
 *
 * The panel is opened first — that call needs the click that is still in hand — and
 * only then is the page asked to take over. If nobody answers, the panel is showing
 * something else (the home view, say, which this page navigates to on its own while
 * `setOptions` still says "rules"), and `setOptions` with the same path would not
 * move it. So the request is put in the address instead: a path that differs makes
 * the panel navigate, and the page reads it on the way in. That is why this used to
 * work once and never again.
 */
function openCreateRuleModalForUrl(pageUrl, windowId, isFullUrl = false) {
    const rulesPath = 'src/ui/pages/rules/rules.html';
    let targetUrl = pageUrl;
    if (!isFullUrl) {
        try {
            targetUrl = new URL(pageUrl).origin;
        } catch {
            console.warn('Could not parse origin from URL:', pageUrl);
        }
    }

    chrome.sidePanel.setOptions({ path: rulesPath, enabled: true });
    chrome.sidePanel.open({ windowId: windowId });
    activeSidePanelPath = rulesPath;

    setTimeout(async () => {
        let handled = false;
        try {
            const answer = await chrome.runtime.sendMessage({
                action: 'create-rule-from-context',
                url: targetUrl,
            });
            handled = Boolean(answer?.handled);
        } catch {
            // Nobody listening: the panel is not on the rules page.
        }
        if (handled) return;

        const wanted = `${rulesPath}?action=create&url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`;
        chrome.sidePanel.setOptions({ path: wanted, enabled: true });
        activeSidePanelPath = rulesPath;
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
