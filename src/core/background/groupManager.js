function getInactiveCollapseThreshold() {
    const minutes = extensionSettings.inactiveCollapseTime ?? INACTIVITY_THRESHOLD_INACTIVE_GROUP;
    return minutes * 60 * 1000;
}

function getActiveCollapseThreshold() {
    const minutes = extensionSettings.activeCollapseTime ?? INACTIVITY_THRESHOLD_ACTIVE_GROUP;
    return minutes * 60 * 1000;
}

function determinePotentialPrefix(groupId, groupTabs, isCurrentlyExpanded, isEdit = false, needsWarning = false) {
    if (isEdit && !needsWarning) {
        return '';
    }
    const wasEverExpanded = groupExpandedEver.get(groupId) || isCurrentlyExpanded;

    if (!groupTabs || groupTabs.length === 0) {
        return wasEverExpanded ? CURRENT_PREFIX_OPENKEY : CURRENT_PREFIX_LOCK;
    }

    const allTabsInGroupEverActive = groupTabs.every((tab) => tabsEverActive.has(tab.id));
    const anyTabInGroupEverActive = groupTabs.some((tab) => tabsEverActive.has(tab.id));

    if (allTabsInGroupEverActive) {
        return CURRENT_PREFIX_CHECKED;
    } else if (anyTabInGroupEverActive) {
        return CURRENT_PREFIX_LOUPE;
    } else if (wasEverExpanded) {
        return CURRENT_PREFIX_OPENKEY;
    } else {
        return CURRENT_PREFIX_LOCK;
    }
}

function findManagedGroup(groupType, groupKey, existingGroups, windowId) {
    for (const [id, info] of groupInfoMap) {
        if (info.type === groupType && info.key === groupKey) {
            const group = existingGroups[id];
            if (group && group.windowId === windowId) {
                logMessage(`[findManagedGroup] -> Match FOUND. Reusing existing group ID: ${id}.`);
                return group;
            }
        }
    }
    logMessage(`[findManagedGroup] -> Match NOT found for type '${groupType}' and key '${groupKey}'.`);
    return null;
}

async function updateGroupProperties(group, tabIds, newColor, clusterConfig, currentGroupIdByTabId = null) {
    // Only the tabs that are not in the group yet. Re-adding the ones already there
    // is not free: Chrome relocates the whole group to keep it contiguous, so a pass
    // in which nothing had changed still paid one tab-strip write per group and left
    // the strip shuffled enough that the sorting step then had to move everything.
    const tabIdsToAdd = currentGroupIdByTabId
        ? tabIds.filter((id) => currentGroupIdByTabId.get(id) !== group.id)
        : tabIds;

    if (tabIdsToAdd.length > 0) {
        logMessage(`[updateGroupProperties] Adding ${tabIdsToAdd.length} tabs to existing group ${group.id}.`);
        await chrome.tabs.group({ groupId: group.id, tabIds: tabIdsToAdd });
    } else {
        logMessage(
            `[updateGroupProperties] Group ${group.id} already holds its ${tabIds.length} tabs; nothing to add.`,
        );
    }

    const updatePayload = {};
    const info = groupInfoMap.get(group.id);

    if (group.color !== newColor) {
        updatePayload.color = newColor;
    }

    if (info.type === 'special' && !info.isCompact) {
        const specialConfig = Object.values(clusterConfig.specialGroups).find((c) => c.key === info.key);
        if (specialConfig) {
            const newBaseName = specialConfig.name || info.key;
            const currentBaseName = getBaseGroupName(group.title);
            if (newBaseName !== currentBaseName) {
                // We use the helper function to ensure the title is reconstructed
                // with the same logic as in the rest of the application.
                const newFullTitle = constructFullTitle(info.type, info.key, newBaseName, clusterConfig);
                info.title = newFullTitle;
            }
        }
    }

    if (info.isCompact) {
        delete updatePayload.title;
    }

    if (Object.keys(updatePayload).length > 0) {
        await executeWithRetries(
            async () => await chrome.tabGroups.update(group.id, updatePayload),
            `update group ${group.id} properties`,
        );
    }

    if (!group.collapsed) {
        groupExpandedEver.set(group.id, true);
    }
}

/**
 * The title the tab strip should show for a group, given whether compact mode
 * will be active. Mirrors what updateAllGroupPrefixes computes, so that a group
 * can be born with its definitive title instead of being renamed right after.
 */
function buildUiTitleForNewGroup(groupType, groupKey, fullTitle, tabIds, isCompact) {
    if (!isCompact) return fullTitle;

    const baseName = getBaseGroupName(fullTitle) || groupKey;
    let titleCore = baseName.charAt(0).toUpperCase();

    if (extensionSettings.enablePrefixes ?? false) {
        // A brand-new group is created collapsed and has never been expanded.
        const prefixMarker = determinePotentialPrefix(
            null,
            tabIds.map((id) => ({ id })),
            false,
        ).trim();
        if (prefixMarker.length >= 4) titleCore = prefixMarker;
    }

    switch (groupType) {
        case 'domain':
            return titleCore + DOMAIN_SUFFIX;
        case 'rule':
            return RULE_PREFIX + titleCore;
        case 'special':
            return SPECIAL_PREFIX + titleCore + SPECIAL_SUFFIX;
        default:
            return titleCore;
    }
}

async function createAndConfigureGroup(groupType, groupKey, color, tabIds, clusterConfig, willBeCompact = false) {
    logMessage(`[createAndConfigureGroup] Creating and IMMEDIATELY registering a NEW group for key '${groupKey}'.`);

    // 1. Create the tab group.
    const groupId = await chrome.tabs.group({ tabIds });

    // 2. Determine the base title.
    const specialConfig = Object.values(clusterConfig.specialGroups).find((c) => c.key === groupKey);
    const baseTitle = groupType === 'special' && specialConfig ? specialConfig.name : groupKey;

    // 3. Use the helper function to build the full title with markers.
    const fullTitle = constructFullTitle(groupType, groupKey, baseTitle, clusterConfig);

    // 4. Update the newly created group with its title and color. When compact mode
    //    is going to be on, write the compact title straight away: writing the long
    //    one first only to rename it a moment later costs one extra tab-strip write
    //    per group and makes the names visibly flicker.
    // Ensure 'grey' is strictly reserved for the misc group
    const isMisc = groupType === 'misc' || groupKey === 'Misc';
    const effectiveColor =
        !isMisc && color === 'grey' ? getDeterministicColor(groupKey) : color || getDeterministicColor(groupKey);

    const uiTitle = buildUiTitleForNewGroup(groupType, groupKey, fullTitle, tabIds, willBeCompact);
    await executeWithRetries(
        async () => await chrome.tabGroups.update(groupId, { title: uiTitle, color: effectiveColor, collapsed: true }),
        `create group ${groupId} (${uiTitle})`,
    );

    // 5. Register group info immediately in the session map. The map always keeps the
    //    full title; only what the tab strip shows is shortened.
    const groupInfo = {
        type: groupType,
        key: groupKey,
        title: fullTitle, // Use the full title built by the auxiliary function.
        isCompact: willBeCompact,
    };
    groupInfoMap.set(groupId, groupInfo);
    logMessage(`[createAndConfigureGroup] Group ${groupId} created and INSTANTLY identified in groupInfoMap.`);

    return groupId;
}

async function manageGroup(
    groupType,
    groupKey,
    color,
    tabIds,
    existingGroups,
    windowId,
    willBeCompact = false,
    currentGroupIdByTabId = null,
) {
    logMessage(`[manageGroup] Process start. Type: '${groupType}', Key: '${groupKey}'.`);
    const localClusterConfig = extensionSettings.clusterConfig || DEFAULT_CLUSTER_CONFIG;

    // 1. Check if the group already exists.
    const existingGroup = findManagedGroup(groupType, groupKey, existingGroups, windowId);
    let groupId;
    let groupFinalTitle;

    if (existingGroup) {
        // 2a. If it exists, update it.
        await updateGroupProperties(existingGroup, tabIds, color, localClusterConfig, currentGroupIdByTabId);
        groupId = existingGroup.id;
        //groupFinalTitle = groupInfoMap.get(groupId)?.title || existingGroup.title;
    } else {
        // 2b. If it doesn't exist, create it.
        groupId = await createAndConfigureGroup(groupType, groupKey, color, tabIds, localClusterConfig, willBeCompact);
        groupFinalTitle = groupInfoMap.get(groupId)?.title;
    }

    // 3. Final and common step: Update the identifier map.
    const cleanTitle = getBaseGroupName(groupFinalTitle);
    const identifier = generateGroupIdentifier(cleanTitle, null, groupId);
    groupIdentifierMap.set(groupId, identifier);

    logMessage(`[manageGroup] Process end. Final Group ID: ${groupId}.`);
    return groupId;
}

function reconstructFullTitleFromInfo(baseTitle, groupId = null) {
    getTypeGroup = true;
    if (groupId === null || !groupInfoMap.has(groupId)) {
        console.warn(`[reconstructFullTitleFromInfo] Group ID ${groupId} not found or is null. Returning base title.`);
        return baseTitle;
    }

    const info = groupInfoMap.get(groupId);
    let fullTitle;

    switch (info.type) {
        case 'domain':
            fullTitle = baseTitle + DOMAIN_SUFFIX;
            break;
        case 'rule':
            fullTitle = RULE_PREFIX + baseTitle;
            break;
        case 'special':
            fullTitle = SPECIAL_PREFIX + baseTitle + SPECIAL_SUFFIX;
            break;
        case 'manual':
            fullTitle = baseTitle;
            break;
        default:
            console.warn(`[reconstructFullTitleFromInfo] Unknown group type "${info.type}" for group ID ${groupId}.`);
            fullTitle = baseTitle;
            break;
    }
    return fullTitle;
}

function applyCustomRules(tabs, customRules) {
    const customGroupTabs = {};
    const groupedTabIds = new Set();

    if (!Array.isArray(customRules) || customRules.length === 0) {
        return { customGroupTabs, groupedTabIds };
    }

    const activeRules = customRules.filter(
        (rule) => rule.active !== false && Array.isArray(rule.urls) && rule.urls.length > 0,
    );
    if (activeRules.length === 0) {
        return { customGroupTabs, groupedTabIds };
    }

    for (const rule of activeRules) {
        const matchingTabs = [];
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            if (tab.pinned || groupedTabIds.has(tab.id) || !tab.url || tab.url === 'chrome://newtab/') {
                continue;
            }
            if (rule.urls.some((u) => u && tab.url.toLowerCase().includes(u.toLowerCase().trim()))) {
                matchingTabs.push(tab);
                groupedTabIds.add(tab.id);
            }
        }
        if (matchingTabs.length > 0) {
            customGroupTabs[rule.name] = matchingTabs;
        }
    }
    return { customGroupTabs, groupedTabIds };
}

function isLocalhost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isIPAddress(hostname) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');
}

function formatIPGroupName(hostname, port) {
    if (hostname.startsWith('[') && hostname.includes(']')) {
        const ipv6Part = hostname.substring(1, hostname.indexOf(']'));
        return `[${ipv6Part.slice(-8)}]${port}`;
    }
    return `${hostname}${port}`;
}

function addToGroup(groupMap, groupName, tab) {
    if (!groupMap[groupName]) groupMap[groupName] = [];
    groupMap[groupName].push(tab);
}

const SEARCH_ENGINES_SET = new Set([
    'google.com',
    'www.google.com',
    'bing.com',
    'www.bing.com',
    'baidu.com',
    'www.baidu.com',
    'duckduckgo.com',
    'www.duckduckgo.com',
    'yahoo.com',
    'search.yahoo.com',
    'ecosia.org',
    'www.ecosia.org',
    'yandex.com',
    'ask.com',
    'aol.com',
    'startpage.com',
    'qwant.com',
    'brave.com',
    'search.brave.com',
]);

function isSearchUrl(url) {
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        if (!SEARCH_ENGINES_SET.has(hostname)) return false;

        const searchParams = parsedUrl.searchParams;
        return (
            searchParams.has('q') || searchParams.has('query') || searchParams.has('search') || searchParams.has('ie')
        );
    } catch {
        return false;
    }
}
function isEligibleForDomainGrouping(url) {
    return !isSearchUrl(url);
}

// background.js

function classifyTabs(tabs, groupedTabIds, existingGroups) {
    const domainTabs = {};
    const chromeTabs = [];
    const fileTabs = [];
    const localhostTabs = {};
    const ipTabs = {};
    const extensionTabs = [];
    const newTabTabs = [];
    const miscTabs = [];

    const manualGroupIds = new Set();
    for (const groupIdStr in existingGroups) {
        const groupId = parseInt(groupIdStr, 10);
        const info = groupInfoMap.get(groupId);
        if (info && info.type === 'manual') {
            manualGroupIds.add(groupId);
        }
    }

    const subdomainsEnabled = extensionSettings.clusterConfig?.subdomainsEnabled ?? false;
    const domainsOrSubdomainsEnabled = subdomainsEnabled || (extensionSettings.clusterConfig?.domainsEnabled ?? true);

    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (tab.pinned) continue;

        if (manualGroupIds.has(tab.groupId)) {
            continue;
        }

        if (groupedTabIds.has(tab.id)) continue;
        const url = tab.url;

        // If the URL is empty or not a valid string, the tab is considered "misc" and the rest of the processing is skipped.
        if (!url || url.trim() === '' || url === 'about:blank' || url === 'chrome://blank') {
            continue;
        }

        if (url === 'chrome://newtab/') {
            newTabTabs.push(tab);
            continue;
        }
        if (url.startsWith('chrome-extension://')) {
            extensionTabs.push(tab);
            continue;
        }
        if (url.startsWith('chrome://')) {
            chromeTabs.push(tab);
            continue;
        }
        if (url.startsWith('file://')) {
            fileTabs.push(tab);
            continue;
        }

        try {
            const { hostname, port } = new URL(url);
            const portPrefix = port ? `:${port}` : '';
            if (isLocalhost(hostname)) {
                addToGroup(localhostTabs, `Localhost${portPrefix}`, tab);
            } else if (isIPAddress(hostname)) {
                addToGroup(ipTabs, formatIPGroupName(hostname, portPrefix), tab);
            } else if (domainsOrSubdomainsEnabled) {
                const groupKey = getDomain(url, subdomainsEnabled);
                if (groupKey && isEligibleForDomainGrouping(url)) {
                    addToGroup(domainTabs, groupKey, tab);
                } else {
                    miscTabs.push(tab);
                }
            } else {
                miscTabs.push(tab);
            }
        } catch (e) {
            console.warn(`Could not parse URL, adding to misc: ${tab.url}.`, e);
            miscTabs.push(tab);
        }
    }

    return {
        domainTabs,
        chromeTabs,
        fileTabs,
        localhostTabs,
        ipTabs,
        extensionTabs,
        newTabTabs,
        miscTabs,
    };
}

async function getExistingGroupsForWindow(windowId) {
    const existingGroups = {};
    const groups = await chrome.tabGroups.query({ windowId });
    for (const group of groups) {
        existingGroups[group.id] = group;
    }
    return existingGroups;
}

function planCustomGroups(customGroupTabs, customRules) {
    const groupingPlan = [];
    for (const [name, tabs] of Object.entries(customGroupTabs)) {
        const tabIds = tabs.map((tab) => tab.id);
        if (tabIds.length > 0) {
            const rule = customRules.find((r) => r.name === name);
            if (rule) {
                groupingPlan.push({
                    type: 'rule',
                    key: name,
                    color: rule.color,
                    tabIds: tabIds,
                    name: RULE_PREFIX + name,
                });
            }
        }
    }
    return groupingPlan;
}

async function planDomainGroups(domainTabs, existingGroups, windowId) {
    const subdomainsEnabled = extensionSettings.clusterConfig?.subdomainsEnabled ?? false;
    const domainThreshold = subdomainsEnabled
        ? (extensionSettings.clusterConfig?.subdomainThreshold ?? 2)
        : (extensionSettings.clusterConfig?.domainThreshold ?? 2);

    const domainEntries = Object.entries(domainTabs);
    const miscTabs = [];

    const planPromises = domainEntries.map(async ([domain, tabs]) => {
        const tabIds = tabs.map((tab) => tab.id);
        const existingGroup = Array.from(groupInfoMap).find(
            ([id, info]) => info.type === 'domain' && info.key === domain && existingGroups[id]?.windowId === windowId,
        );

        if ((tabs.length >= domainThreshold || existingGroup) && tabs.length > 0) {
            let color;
            if (existingGroup) {
                color = existingGroups[existingGroup[0]].color;
            } else {
                const favIconUrl = tabs[0]?.favIconUrl || faviconURL(tabs[0].url);
                const extractedColor = await getFaviconColor(favIconUrl);
                color = extractedColor && extractedColor !== 'grey' ? extractedColor : getDeterministicColor(domain);
            }
            return {
                plan: {
                    type: 'domain',
                    key: domain,
                    color: color,
                    tabIds: tabIds,
                    name: domain,
                },
                misc: null,
            };
        } else {
            return {
                plan: null,
                misc: tabs,
            };
        }
    });

    const results = await Promise.all(planPromises);
    const groupingPlan = [];
    for (const res of results) {
        if (res.plan) groupingPlan.push(res.plan);
        if (res.misc) miscTabs.push(...res.misc);
    }

    return { groupingPlan, miscTabs };
}

function getBaseGroupName(title) {
    let baseTitle = cleanGroupTitle(title);
    while (baseTitle.startsWith('\u200B')) {
        baseTitle = baseTitle.substring(1);
    }
    while (baseTitle.endsWith('\u200B')) {
        baseTitle = baseTitle.slice(0, -1);
    }
    return baseTitle.trim();
}

function getGroupType(title) {
    const cleanTitle = cleanGroupTitle(title);
    if (cleanTitle.startsWith(SPECIAL_PREFIX) && cleanTitle.endsWith(SPECIAL_SUFFIX)) {
        return 'special';
    } else if (cleanTitle.startsWith(RULE_PREFIX)) {
        return 'rule';
    } else if (cleanTitle.endsWith(DOMAIN_SUFFIX)) {
        return 'domain';
    } else {
        return 'manual';
    }
}

function planMiscGroup(miscTabs, existingGroups, windowId) {
    const groupingPlan = [];
    const miscConfig =
        extensionSettings.clusterConfig?.specialGroups?.misc || DEFAULT_CLUSTER_CONFIG.specialGroups.misc;

    const findExistingMiscGroup = (groupKey) => {
        return Array.from(groupInfoMap).find(
            ([id, info]) =>
                info.type === 'special' && info.key === groupKey && existingGroups[id]?.windowId === windowId,
        );
    };

    if (miscConfig.enabled && (miscTabs.length >= miscConfig.threshold || findExistingMiscGroup(miscConfig.key))) {
        const { key, name, color } = miscConfig;
        const miscTabIds = miscTabs.map((tab) => tab.id);
        if (miscTabIds.length > 0) {
            groupingPlan.push({
                type: 'special',
                key: key,
                color: color,
                tabIds: miscTabIds,
                name: name,
            });
        }
    }
    return groupingPlan;
}

async function planSpecialGroups(chromeTabs, fileTabs, localhostTabs, ipTabs, extensionTabs, existingGroups, windowId) {
    const groupingPlan = [];
    const { specialGroups } = extensionSettings.clusterConfig || DEFAULT_CLUSTER_CONFIG;

    const findExistingSpecialGroup = (groupKey) => {
        return Array.from(groupInfoMap).find(
            ([id, info]) =>
                info.type === 'special' && info.key === groupKey && existingGroups[id]?.windowId === windowId,
        );
    };

    const processGroup = (configKey, tabs) => {
        const config = specialGroups[configKey];
        if (
            config &&
            config.enabled &&
            (tabs.length >= (config.threshold || 1) || findExistingSpecialGroup(config.key)) &&
            tabs.length > 0
        ) {
            groupingPlan.push({
                type: 'special',
                key: config.key,
                color: config.color,
                tabIds: tabs.map((t) => t.id),
                name: config.name,
            });
        }
    };

    processGroup('chrome', chromeTabs);
    processGroup('files', fileTabs);
    processGroup('extensions', extensionTabs);

    const ipConfig = specialGroups.ipAddress || {
        enabled: true,
        threshold: 1,
        key: 'ipAddress',
    };
    const ipThreshold = ipConfig.threshold || 1;

    const processIpLikeGroup = async (name, tabs) => {
        const existingGroupInfo = findExistingSpecialGroup(name); // Search for existing group

        if (ipConfig.enabled && (tabs.length >= ipThreshold || existingGroupInfo) && tabs.length > 0) {
            let color; // Declare color variable

            if (existingGroupInfo) {
                // If the group already exists, we get its current color to preserve user changes.
                const existingGroupId = existingGroupInfo[0];
                color = existingGroups[existingGroupId].color;
            } else {
                const favIconUrl = tabs[0]?.favIconUrl || faviconURL(tabs[0].url);
                const extractedColor = await getFaviconColor(favIconUrl);
                color = extractedColor && extractedColor !== 'grey' ? extractedColor : getDeterministicColor(name);
            }

            return {
                type: 'special',
                key: name,
                color: color, // We use the correctly determined color
                tabIds: tabs.map((tab) => tab.id),
                name: name,
            };
        }
        return null;
    };

    const ipPromises = [...Object.entries(localhostTabs), ...Object.entries(ipTabs)].map(([name, tabs]) =>
        processIpLikeGroup(name, tabs),
    );
    const ipResults = await Promise.all(ipPromises);
    for (const res of ipResults) {
        if (res) groupingPlan.push(res);
    }

    return groupingPlan;
}

// How many groups are built before letting the browser process catch its breath.
//
// Creating a group is cheap as an API call (measured at 2 ms), but the tab strip
// then animates the new group and its collapse, and that animation runs on the
// browser's UI thread — the same one that paints and handles clicks. Building the
// groups back to back keeps that thread saturated and the whole browser stops
// responding. The pause has to be long enough for an animation to get through.
//
// Measured with 120 tabs and 21 groups (total time / peak of the UI thread):
//   16 ms ->  505 ms / 92%   (fastest, browser frozen while it lasts)
//   80 ms ->  923 ms / 68%   (chosen: browser stays usable)
//  200 ms -> 1508 ms / 60%
// The extra time is roughly (groups / batch size) x pause.
const GROUP_CREATION_BATCH_SIZE = 4;
const GROUP_CREATION_BATCH_PAUSE_MS = 80;

async function executeGroupingPlan(groupingPlan, existingGroups, windowId, currentGroupIdByTabId = null) {
    // How many groups the window will end up with, so new groups can be created
    // with their definitive (compact or full) title in a single write.
    const compactConfig = (extensionSettings.clusterConfig || DEFAULT_CLUSTER_CONFIG).compactMode;
    let willBeCompact = false;
    if (compactConfig?.enabled) {
        const newGroups = groupingPlan.filter(
            (plan) => !findManagedGroup(plan.type, plan.key, existingGroups, windowId),
        ).length;
        const expectedGroupCount = Object.keys(existingGroups).length + newGroups;
        willBeCompact = expectedGroupCount >= (compactConfig.threshold ?? 12);
    }

    // Tabs that are leaving one group for another are pulled out in a single call
    // before anything is created. Chrome keeps every group contiguous, so taking
    // them out one target group at a time made it close the gap in the group they
    // were leaving once per new group: with a 160-tab Misc group, moving 60 tabs out
    // into 15 domain groups cost 1141 ms, against 26 ms to move the same 60 back in.
    // Detaching them in one go leaves that group to compact itself exactly once.
    if (currentGroupIdByTabId) {
        const targetByTabId = new Map();
        for (const plan of groupingPlan) {
            const existing = findManagedGroup(plan.type, plan.key, existingGroups, windowId);
            for (const tabId of plan.tabIds) targetByTabId.set(tabId, existing ? existing.id : null);
        }

        const leaving = [];
        for (const [tabId, targetGroupId] of targetByTabId) {
            const currentGroupId = currentGroupIdByTabId.get(tabId);
            if (currentGroupId !== undefined && currentGroupId !== -1 && currentGroupId !== targetGroupId) {
                leaving.push(tabId);
            }
        }

        if (leaving.length > 1) {
            logMessage(`[executeGroupingPlan] Detaching ${leaving.length} tabs that change group, in one call.`);
            const detached = await executeWithRetries(
                async () => await chrome.tabs.ungroup(leaving),
                `detaching ${leaving.length} tabs before regrouping them`,
            );
            if (detached !== false) {
                for (const tabId of leaving) currentGroupIdByTabId.set(tabId, -1);
            }
        }
    }

    // In batches, with a breath in between. Every one of these calls is executed by
    // the browser process, which is also the one that paints and handles input:
    // handing it the whole plan at once leaves the browser unable to respond until
    // the last group is built. Pausing between batches lets it service what is
    // waiting. It costs a little total time and buys back a responsive browser.
    const groupResults = [];
    for (let i = 0; i < groupingPlan.length; i += GROUP_CREATION_BATCH_SIZE) {
        const batch = groupingPlan.slice(i, i + GROUP_CREATION_BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(async (plan) => {
                const groupId = await manageGroup(
                    plan.type,
                    plan.key,
                    plan.color,
                    plan.tabIds,
                    existingGroups,
                    windowId,
                    willBeCompact,
                    currentGroupIdByTabId,
                );
                if (plan.name) {
                    return [plan.name, groupId];
                }
            }),
        );
        groupResults.push(...batchResults);
        if (i + GROUP_CREATION_BATCH_SIZE < groupingPlan.length) {
            await new Promise((resolve) => setTimeout(resolve, GROUP_CREATION_BATCH_PAUSE_MS));
        }
    }
    return Object.fromEntries(groupResults.filter(Boolean));
}

async function sortGroups(windowId, groupsInWindow, tabsInWindow) {
    try {
        if (groupsInWindow.length === 0) return;

        // A name is being typed somewhere in the strip: leave the order alone until
        // the typing settles, or the group being renamed slides away under the box.
        if (Date.now() < groupRenameSettlesAt) {
            logMessage(`[sortGroups] A group is being renamed; leaving the order alone.`);
            return;
        }

        // Reordering while the browser is showing its "name this group" bubble closes
        // it, so the whole pass waits: moving the other groups shifts the strip under
        // the bubble and dismisses it just the same.
        const now = Date.now();
        if (groupsInWindow.some((group) => isBeingNamed(group, now))) {
            logMessage(`[sortGroups] Window ${windowId} has a group being named; leaving the order alone.`);
            return;
        }

        const groupDetails = new Map();
        const tabsByGroupId = new Map();

        for (const tab of tabsInWindow) {
            if (tab.groupId !== -1) {
                if (!tabsByGroupId.has(tab.groupId)) {
                    tabsByGroupId.set(tab.groupId, []);
                }
                tabsByGroupId.get(tab.groupId).push(tab);
            }
        }

        for (const group of groupsInWindow) {
            const tabsInGroup = tabsByGroupId.get(group.id) || [];
            if (tabsInGroup.length > 0) {
                const firstTabIndex = tabsInGroup[0].index;
                groupDetails.set(group.id, {
                    ...group,
                    actualIndex: firstTabIndex,
                    tabCount: tabsInGroup.length,
                });
            }
        }

        const miscConfig =
            extensionSettings.clusterConfig?.specialGroups?.misc || DEFAULT_CLUSTER_CONFIG.specialGroups.misc;
        const currentMiscGroupKey = miscConfig.key;

        const idealOrder = [...groupDetails.values()].sort((a, b) => {
            const infoA = groupInfoMap.get(a.id);
            const infoB = groupInfoMap.get(b.id);
            const miscGroupSortOption = extensionSettings.miscGroupSortOption ?? 'start';

            const fullTitleA = infoA?.title || a.title;
            const fullTitleB = infoB?.title || b.title;
            const baseTitleA = getBaseGroupName(fullTitleA);
            const baseTitleB = getBaseGroupName(fullTitleB);

            const isMiscA = infoA?.type === 'special' && infoA?.key === currentMiscGroupKey;
            const isMiscB = infoB?.type === 'special' && infoB?.key === currentMiscGroupKey;

            if (miscGroupSortOption !== 'alpha') {
                if (isMiscA && !isMiscB) return miscGroupSortOption === 'start' ? -1 : 1;
                if (!isMiscA && isMiscB) return miscGroupSortOption === 'start' ? 1 : -1;
            }

            return baseTitleA.localeCompare(baseTitleB);
        });

        const orderedTabs = [...tabsInWindow].sort((a, b) => a.index - b.index);
        const startIndex = tabsInWindow.filter((t) => t.pinned).length;

        // Note: pushing the ungrouped tabs to the end up front looks like it would
        // save group moves, and it does — but measured on a profile with many loose
        // tabs, that single chrome.tabs.move costs far more than the moves it saves
        // (60 loose tabs: 273 ms -> 364 ms). The loose tabs end up behind the groups
        // anyway as the groups are packed to the front.

        // The tab strip as blocks in index order: one block per group, one per
        // loose tab. Every move is replayed here so the next comparison is made
        // against where the group really is, not against the stale snapshot.
        // Comparing against the snapshot made the first move invalidate all the
        // others, so every group was moved even when it was already in place.
        const blocks = [];
        for (const tab of orderedTabs) {
            if (tab.pinned) continue;
            const last = blocks[blocks.length - 1];
            if (tab.groupId !== -1 && last && last.groupId === tab.groupId) {
                last.size++;
            } else {
                blocks.push({ groupId: tab.groupId, size: 1 });
            }
        }

        const startOfBlock = (position) => {
            let index = startIndex;
            for (let i = 0; i < position; i++) index += blocks[i].size;
            return index;
        };

        let currentIndex = startIndex;
        let moves = 0;
        for (const groupToPlace of idealOrder) {
            const from = blocks.findIndex((b) => b.groupId === groupToPlace.id);
            if (from === -1) {
                currentIndex += groupToPlace.tabCount;
                continue;
            }

            if (startOfBlock(from) !== currentIndex) {
                await executeWithRetries(
                    async () =>
                        await chrome.tabGroups.move(groupToPlace.id, {
                            index: currentIndex,
                        }),
                    `sort move group ${groupToPlace.title} to index ${currentIndex}`,
                );
                moves++;

                const [block] = blocks.splice(from, 1);
                let to = 0;
                let index = startIndex;
                while (to < blocks.length && index < currentIndex) {
                    index += blocks[to].size;
                    to++;
                }
                blocks.splice(to, 0, block);
            }
            currentIndex += groupToPlace.tabCount;
        }
        logMessage(`[sortGroups] Reordered window ${windowId} with ${moves} move(s) for ${idealOrder.length} groups.`);
    } catch (error) {
        console.warn('Error sorting groups.', error);
    }
}

async function findFilesOnPage(pageUrl) {
    try {
        const response = await fetch(pageUrl);
        if (!response.ok) {
            throw new Error(`Network error: ${response.status} ${response.statusText}`);
        }
        const html = await response.text();

        const hrefRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/gi;
        const foundFiles = new Map();

        let match;
        while ((match = hrefRegex.exec(html)) !== null) {
            const href = match[1];

            const hasDownloadableExtension = DOWNLOADABLE_EXTENSIONS.some(
                (ext) => href.toLowerCase().endsWith(ext) || href.toLowerCase().includes(ext + '?'),
            );

            if (hasDownloadableExtension) {
                try {
                    const absoluteUrl = new URL(href, pageUrl).href;

                    const fileName = absoluteUrl.substring(absoluteUrl.lastIndexOf('/') + 1).split('?')[0];

                    if (fileName && !foundFiles.has(absoluteUrl)) {
                        foundFiles.set(absoluteUrl, { name: decodeURIComponent(fileName), url: absoluteUrl });
                    }
                } catch {
                    console.warn(`[findFilesOnPage] Invalid URL found and skipped: ${href}`);
                }
            }
        }

        return { success: true, files: Array.from(foundFiles.values()) };
    } catch (error) {
        console.error(`[findFilesOnPage] Error finding files on ${pageUrl}:`, error);
        return { success: false, error: error.message };
    }
}

async function toggleClusteringCommand() {
    const storage = await getSettingsStorage();
    const data = await storage.get(['clusteringEnabled', 'clusterConfig']);
    const currentEnabledState = data.clusteringEnabled ?? true;
    const config = data.clusterConfig || DEFAULT_CLUSTER_CONFIG;

    const newEnabledState = !currentEnabledState;

    config.domainsEnabled = newEnabledState;
    config.subdomainsEnabled = false;
    config.compactMode.enabled = newEnabledState;
    for (const key in config.specialGroups) {
        if (config.specialGroups.hasOwnProperty(key)) {
            config.specialGroups[key].enabled = newEnabledState;
        }
    }

    await storage.set({
        clusteringEnabled: newEnabledState,
        clusterConfig: config,
    });
}

const handleClusterToggle = async (key) => {
    const storage = await getSettingsStorage();
    const data = await storage.get(['clusterConfig']);
    const config = data.clusterConfig || DEFAULT_CLUSTER_CONFIG;

    const keys = key.split('.');
    let obj = config;
    for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
    }
    const finalKey = keys[keys.length - 1];

    obj[finalKey] = !obj[finalKey];

    // Logic to ensure that grouping by domain and subdomain are mutually exclusive.
    if (key === 'domainsEnabled' && obj.domainsEnabled) {
        config.subdomainsEnabled = false;
    } else if (key === 'subdomainsEnabled' && obj.subdomainsEnabled) {
        config.domainsEnabled = false;
    }

    const isAnyClusterOn =
        config.domainsEnabled ||
        config.subdomainsEnabled ||
        config.compactMode.enabled ||
        Object.values(config.specialGroups).some((g) => g.enabled);

    await storage.set({
        clusterConfig: config,
        clusteringEnabled: isAnyClusterOn,
    });
};

async function toggleCollapseTimerOption() {
    const newEnableTimer = !extensionSettings.enableCollapseTimer;
    const storage = await getSettingsStorage();
    await storage.set({ enableCollapseTimer: newEnableTimer });
    chrome.runtime.sendMessage({
        action: 'optionChanged',
        option: 'enableCollapseTimer',
        value: newEnableTimer,
    });
}

async function toggleSortGroupsAlpha() {
    const newSortGroups = !extensionSettings.sortGroupsAlphabetically;
    const storage = await getSettingsStorage();
    await storage.set({ sortGroupsAlphabetically: newSortGroups });

    chrome.runtime.sendMessage({
        action: 'optionChanged',
        option: 'sortGroupsAlphabetically',
        value: newSortGroups,
    });
    await groupTabs();
}

async function toggleAllRules() {
    const customRules = extensionSettings.customRules;
    const allActive = customRules.every((rule) => rule.active);
    const newActiveState = !allActive;

    const updatedRules = customRules.map((rule) => ({
        ...rule,
        active: newActiveState,
    }));

    const storage = await getSettingsStorage();
    await storage.set({ customRules: updatedRules });

    sendMessageToUI({ action: 'rulesUpdated' });
    sendMessageToUI({
        action: 'optionChanged',
        option: 'toggleAllRules',
        value: newActiveState,
    });
    await groupTabs();
}

async function collapseInactiveGroups(tabId) {
    try {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        const activeTab = allTabs.find((tab) => tab.id === tabId);
        if (!activeTab || activeTab.groupId === -1) return;

        const otherGroupIds = [
            ...new Set(
                allTabs
                    .filter((tab) => tab.groupId !== activeTab.groupId && tab.groupId !== -1)
                    .map((tab) => tab.groupId),
            ),
        ];

        for (const groupId of otherGroupIds) {
            await executeWithRetries(
                async () => await chrome.tabGroups.update(groupId, { collapsed: true }),
                `collapsing group ${groupId}`,
            );
        }
    } catch (error) {
        console.error('[collapseInactiveGroups] Error:', error);
    }
}

async function getGroupComposition(windowId, knownTabs = null) {
    const composition = new Map();
    try {
        const tabs = knownTabs || (await chrome.tabs.query({ windowId }));
        for (const tab of tabs) {
            if (tab.groupId !== -1) {
                if (!composition.has(tab.groupId)) {
                    composition.set(tab.groupId, []);
                }
                composition.get(tab.groupId).push(tab.id);
            }
        }
    } catch (error) {
        console.error('Error getting group composition.', error);
    }
    return composition;
}
function getSpecialCategoryKeyForTab(url, config) {
    const specialGroups = config.specialGroups || DEFAULT_CLUSTER_CONFIG.specialGroups;

    if (url.startsWith('chrome://')) return specialGroups.chrome.key;
    if (url.startsWith('file://')) return specialGroups.files.key;
    if (url.startsWith('chrome-extension://')) return specialGroups.extensions.key;

    try {
        const { hostname, port } = new URL(url);
        const portPrefix = port ? `:${port}` : '';

        if (isLocalhost(hostname)) {
            return `Localhost${portPrefix}`;
        }
        if (isIPAddress(hostname)) {
            return formatIPGroupName(hostname, portPrefix);
        }
    } catch {}
    return specialGroups.misc.key;
}

function ejectMisplacedTabsFromGroups(tabs, existingGroups, groupInfoMap, customRules, localClusterConfig) {
    const misplacedTabIds = [];

    const automaticGroups = Object.values(existingGroups).filter((group) => {
        const info = groupInfoMap.get(group.id);
        return info && info.type !== 'manual';
    });

    for (const group of automaticGroups) {
        const info = groupInfoMap.get(group.id);
        if (!info || !info.key) continue;

        const tabsInGroup = tabs.filter((t) => t.groupId === group.id);
        const subdomainsEnabledForCheck = localClusterConfig.subdomainsEnabled ?? false;

        for (const tab of tabsInGroup) {
            let belongs = false;

            if (!tab.url || tab.url.trim() === '' || tab.url === 'about:blank' || tab.url === 'chrome://blank') {
                belongs = true;
            } else {
                switch (info.type) {
                    case 'rule':
                        const rule = Array.isArray(customRules)
                            ? customRules.find((r) => r.name === info.key)
                            : undefined;
                        if (
                            rule &&
                            rule.active !== false &&
                            Array.isArray(rule.urls) &&
                            rule.urls.some((u) => u && tab.url.toLowerCase().includes(u.toLowerCase().trim()))
                        ) {
                            belongs = true;
                        }
                        break;
                    case 'domain':
                        const tabMatchesRule =
                            Array.isArray(customRules) &&
                            customRules.some(
                                (r) =>
                                    r.active !== false &&
                                    Array.isArray(r.urls) &&
                                    r.urls.some((u) => u && tab.url.toLowerCase().includes(u.toLowerCase().trim())),
                            );
                        if (tabMatchesRule) {
                            belongs = false;
                            break;
                        }
                        const tabDomain = getDomain(tab.url, subdomainsEnabledForCheck);
                        if (tabDomain === info.key && isEligibleForDomainGrouping(tab.url)) {
                            belongs = true;
                        }
                        break;
                    case 'special':
                        const tabMatchesRuleSpecial =
                            Array.isArray(customRules) &&
                            customRules.some(
                                (r) =>
                                    r.active !== false &&
                                    Array.isArray(r.urls) &&
                                    r.urls.some((u) => u && tab.url.toLowerCase().includes(u.toLowerCase().trim())),
                            );
                        if (tabMatchesRuleSpecial) {
                            belongs = false;
                            break;
                        }
                        const tabCategoryKey = getSpecialCategoryKeyForTab(tab.url, localClusterConfig);
                        if (tabCategoryKey === info.key) {
                            belongs = true;
                        }
                        break;
                }
            }

            if (!belongs) {
                logMessage(
                    `[Eject] Ejecting tab "${tab.title}" from group "${group.title}" because it no longer belongs.`,
                );
                misplacedTabIds.push(tab.id);
            }
        }
    }
    return misplacedTabIds;
}

function dissolveEmptyOrInvalidGroups(tabs, existingGroups, groupInfoMap, localClusterConfig, configChanged) {
    const tabsToUngroup = [];
    // We use Object.values to iterate directly over existing groups.
    const automaticGroups = Object.values(existingGroups).filter((group) => {
        const info = groupInfoMap.get(group.id);
        // A group is automatic if it has info and its type is NOT 'manual'.
        return info && info.type !== 'manual';
    });

    for (const group of automaticGroups) {
        const groupId = group.id;
        const info = groupInfoMap.get(groupId);
        let shouldBeDissolved = false;

        const tabsInThisGroup = tabs.filter((t) => t.groupId === groupId);
        const tabCount = tabsInThisGroup.length;

        if (tabCount === 0) {
            shouldBeDissolved = true;
            logMessage(`[dissolveGroups] Group ${groupId} ("${info.key}") marked for dissolution: Empty.`);
        } else {
            // Dissolution logic based on configuration (if threshold has changed, etc.)
            let threshold = -1;
            let isEnabled = true;

            if (info.type === 'domain') {
                const {
                    subdomainsEnabled = false,
                    domainsEnabled = true,
                    subdomainThreshold,
                    domainThreshold,
                } = localClusterConfig;
                isEnabled = subdomainsEnabled || domainsEnabled;
                if (configChanged) {
                    threshold = subdomainsEnabled ? subdomainThreshold : domainThreshold;
                }
            } else if (info.type === 'special') {
                const configKey = Object.keys(localClusterConfig.specialGroups).find(
                    (k) => localClusterConfig.specialGroups[k].key === info.key,
                );

                if (configKey && localClusterConfig.specialGroups[configKey]) {
                    const config = localClusterConfig.specialGroups[configKey];
                    isEnabled = config.enabled;
                    if (configChanged) {
                        threshold = config.threshold || 1;
                    }
                } else {
                    const baseKey = info.key.split(':')[0];

                    if (isLocalhost(baseKey.toLowerCase()) || isIPAddress(baseKey)) {
                        const config = localClusterConfig.specialGroups.ipAddress;
                        if (config) {
                            isEnabled = config.enabled;
                            if (configChanged) {
                                threshold = config.threshold || 1;
                            }
                        } else {
                            isEnabled = false;
                        }
                    } else {
                        isEnabled = false;
                    }
                }
            }
            if (!isEnabled) {
                shouldBeDissolved = true;
                logMessage(
                    `[dissolveGroups] Group ${groupId} ("${info.key}") marked for dissolution: Feature disabled.`,
                );
            } else if (threshold !== -1 && tabCount < threshold) {
                shouldBeDissolved = true;
                logMessage(
                    `[dissolveGroups] Group ${groupId} ("${info.key}") marked for dissolution: Below new threshold (${tabCount}/${threshold}).`,
                );
            }
        }

        if (shouldBeDissolved) {
            tabsToUngroup.push(...tabsInThisGroup.map((t) => t.id));

            // Proactive and complete cleanup of the internal state for this group.
            // This is the most important part to avoid ghost state.
            logMessage(
                `[dissolveGroups] Proactively cleaning all state for dissolved group ${groupId} ("${info.key}").`,
            );
            groupInfoMap.delete(groupId);
            groupIdentifierMap.delete(groupId);
            groupExpandedEver.delete(groupId);
            groupPrefixState.delete(groupIdentifierMap.get(groupId)); // Clean persistent state just in case
            delete lastActivity[groupId];
        }
    }
    return tabsToUngroup;
}
async function processAndGroupRemainingTabs(
    tabsToGroup,
    customRules,
    existingGroups,
    windowId,
    localClusterConfig,
    isClusteringGloballyEnabled = true,
) {
    let groupingPlan = [];

    // Where every tab lives right now, so a group that already holds its tabs is
    // left untouched instead of being rebuilt.
    const currentGroupIdByTabId = new Map(tabsToGroup.map((tab) => [tab.id, tab.groupId]));

    const { customGroupTabs, groupedTabIds } = applyCustomRules(tabsToGroup, customRules);
    groupingPlan.push(...planCustomGroups(customGroupTabs, customRules));

    if (!isClusteringGloballyEnabled) {
        const allGroupIds = await executeGroupingPlan(groupingPlan, existingGroups, windowId, currentGroupIdByTabId);
        return allGroupIds;
    }

    const remainingTabs = tabsToGroup.filter((tab) => !groupedTabIds.has(tab.id));
    const {
        domainTabs,
        chromeTabs,
        fileTabs,
        localhostTabs,
        ipTabs,
        extensionTabs,
        miscTabs: classifiedMiscTabs,
    } = classifyTabs(remainingTabs, new Set(), existingGroups);

    let finalMiscTabs = [...classifiedMiscTabs];

    const { domainsEnabled, subdomainsEnabled } = localClusterConfig;
    if (domainsEnabled || subdomainsEnabled) {
        const domainPlanResult = await planDomainGroups(domainTabs, existingGroups, windowId);
        groupingPlan.push(...domainPlanResult.groupingPlan);
        finalMiscTabs.push(...domainPlanResult.miscTabs);
    } else {
        Object.values(domainTabs).forEach((tabsInDomain) => finalMiscTabs.push(...tabsInDomain));
    }

    const tabsForSpecialGrouping = {
        chrome: localClusterConfig.specialGroups.chrome.enabled ? chromeTabs : [],
        files: localClusterConfig.specialGroups.files.enabled ? fileTabs : [],
        extensions: localClusterConfig.specialGroups.extensions.enabled ? extensionTabs : [],
    };
    const tabsForIpLikeGrouping = {
        localhost: localClusterConfig.specialGroups.ipAddress.enabled ? localhostTabs : {},
        ip: localClusterConfig.specialGroups.ipAddress.enabled ? ipTabs : {},
    };

    if (!localClusterConfig.specialGroups.chrome.enabled) finalMiscTabs.push(...chromeTabs);
    if (!localClusterConfig.specialGroups.files.enabled) finalMiscTabs.push(...fileTabs);
    if (!localClusterConfig.specialGroups.extensions.enabled) finalMiscTabs.push(...extensionTabs);
    if (!localClusterConfig.specialGroups.ipAddress.enabled) {
        Object.values(localhostTabs).forEach((arr) => finalMiscTabs.push(...arr));
        Object.values(ipTabs).forEach((arr) => finalMiscTabs.push(...arr));
    }

    const specialPlan = await planSpecialGroups(
        tabsForSpecialGrouping.chrome,
        tabsForSpecialGrouping.files,
        tabsForIpLikeGrouping.localhost,
        tabsForIpLikeGrouping.ip,
        tabsForSpecialGrouping.extensions,
        existingGroups,
        windowId,
    );
    groupingPlan.push(...specialPlan);

    const miscConfig = localClusterConfig.specialGroups.misc;
    if (miscConfig && miscConfig.enabled) {
        const miscPlan = planMiscGroup(finalMiscTabs, existingGroups, windowId);
        groupingPlan.push(...miscPlan);
    }

    if (extensionSettings.sortGroupsAlphabetically) {
        groupingPlan.sort((a, b) => {
            const nameA = getBaseGroupName(a.name || a.key || '');
            const nameB = getBaseGroupName(b.name || b.key || '');
            return nameA.localeCompare(nameB);
        });
        // Chrome lays the new groups out in the reverse of the order in which the
        // calls are issued, so issuing them backwards leaves the strip already in
        // alphabetical order and the sorting step has nothing left to move —
        // otherwise it had to relocate every single group, one call at a time.
        // sortGroups still runs afterwards and fixes the order if this ever changes.
        groupingPlan.reverse();
    }

    const allGroupIds = await executeGroupingPlan(groupingPlan, existingGroups, windowId, currentGroupIdByTabId);

    return allGroupIds;
}

async function finalizeWindowProcessing(
    windowId,
    tabs, // We keep `tabs` as the INITIAL state for reference if necessary
    allGroupIds,
    initialComposition,
    sortGroupsEnabled,
    configChanged,
) {
    const finalGroups = await chrome.tabGroups.query({ windowId });
    const finalTabs = await chrome.tabs.query({ windowId });

    if (Object.keys(allGroupIds).length > 0 && sortGroupsEnabled) {
        // Now we call sortGroups with the FRESH and FINAL data.
        await sortGroups(windowId, finalGroups, finalTabs);
    }

    // We use the final data for the new tabs logic.
    // New tab pages belong at the end, ungrouped. This used to move them on every
    // single pass without checking where they already were, and that move triggered
    // another regroup, which moved them again: one click produced 24 chained passes,
    // about one per second, for as long as a new tab page stayed open. It is a fixed
    // cost, so it showed up just as badly with few tabs as with many, and equally
    // when switching the grouping on and off. Only act when something is actually
    // out of place.
    //
    // A new tab the user put in a group on purpose is left alone. "Add tab to group"
    // in the browser's own tab menu is the usual way in, and the group it creates is
    // untitled while the naming box is open, so pulling the tab straight back out
    // destroyed the group before there was time to name it — and a new tab could
    // never be filed by hand into any group either.
    const groupById = new Map(finalGroups.map((g) => [g.id, g]));
    const isUserGroup = (groupId) => {
        if (groupId === -1) return false;
        if (isBeingNamed(groupById.get(groupId))) return true;
        return groupInfoMap.get(groupId)?.type === 'manual';
    };

    // The exempt tabs are taken out of the picture entirely, positions included, so
    // the "already at the end" check still settles after one move instead of firing
    // again on every pass.
    const exemptIds = new Set(
        finalTabs.filter((t) => t.url === 'chrome://newtab/' && isUserGroup(t.groupId)).map((t) => t.id),
    );
    const strip = exemptIds.size ? finalTabs.filter((t) => !exemptIds.has(t.id)) : finalTabs;

    const newTabTabs = strip.filter((t) => t.url === 'chrome://newtab/');
    if (newTabTabs.length > 0) {
        const grouped = newTabTabs.filter((t) => t.groupId !== -1);

        // They are in place when they occupy the last positions of the strip.
        const lastIndex = strip.reduce((max, t) => Math.max(max, t.index), -1);
        const byIndex = [...newTabTabs].sort((a, b) => a.index - b.index);
        const alreadyAtEnd = byIndex.every((t, i) => t.index === lastIndex - (byIndex.length - 1 - i));

        try {
            if (grouped.length > 0) {
                await executeWithRetries(
                    async () => await chrome.tabs.ungroup(grouped.map((t) => t.id)),
                    `ungrouping ${grouped.length} new tabs in window ${windowId}`,
                );
            }
            if (!alreadyAtEnd) {
                await executeWithRetries(
                    async () =>
                        await chrome.tabs.move(
                            byIndex.map((t) => t.id),
                            { index: -1 },
                        ),
                    `moving new tabs to the end in window ${windowId}`,
                );
            }
        } catch (e) {
            if (!e.message.includes('No tab with id')) console.warn('Error ungrouping/moving new tabs.', e);
        }
    }

    const finalComposition = await getGroupComposition(windowId);
    const changedGroupIds = new Set();
    const allInvolvedGroupIds = new Set([...initialComposition.keys(), ...finalComposition.keys()]);

    for (const groupId of allInvolvedGroupIds) {
        const initialTabs = initialComposition.get(groupId)?.sort().join(',') || '';
        const finalTabs = finalComposition.get(groupId)?.sort().join(',') || '';
        if (initialTabs !== finalTabs) {
            changedGroupIds.add(groupId);
        }
    }

    if (configChanged || changedGroupIds.size > 0) {
        await updateAllGroupPrefixes(windowId, null, false, finalGroups, finalTabs);
    }
}

async function ensureSettingsAreLoaded() {
    if (!extensionSettings || Object.keys(extensionSettings).length === 0) {
        logMessage(
            '[ensureSettingsAreLoaded] extensionSettings is empty. Attempting to load settings before proceeding.',
        );

        await loadExtensionSettings();

        if (!extensionSettings || Object.keys(extensionSettings).length === 0) {
            console.error('[ensureSettingsAreLoaded] CRITICAL: Failed to load extensionSettings. Aborting operation.');
            return false;
        }

        logMessage('[ensureSettingsAreLoaded] Settings loaded successfully.');
    }
    return true;
}

async function renameMismatchedDomainGroups(groups, tabsByGroupId, groupInfoMap, newConfig, oldConfig) {
    const domainStrategyChanged = (oldConfig.domainsEnabled ?? true) !== (newConfig.domainsEnabled ?? true);
    const subdomainStrategyChanged = (oldConfig.subdomainsEnabled ?? false) !== (newConfig.subdomainsEnabled ?? false);

    // If the domain/subdomain grouping strategy hasn't changed, there's nothing to do.
    if (!domainStrategyChanged && !subdomainStrategyChanged) {
        return;
    }

    logMessage('[Rename Strategy] Domain/subdomain strategy changed. Checking for groups to rename.');

    const renamePromises = groups.map(async (group) => {
        const info = groupInfoMap.get(group.id);

        // We are only interested in 'domain' type groups.
        if (!info || info.type !== 'domain') return;

        const tabsInGroup = tabsByGroupId.get(group.id);
        if (!tabsInGroup || tabsInGroup.length === 0) return;

        const representativeTab = tabsInGroup[0];
        const currentGroupKey = info.key;

        // We calculate what the group 'key' would be with the NEW configuration.
        const hypotheticalNewKey = getDomain(representativeTab.url, newConfig.subdomainsEnabled);

        // If the new 'key' is valid and is different from the current one, proceed to rename.
        if (hypotheticalNewKey && currentGroupKey !== hypotheticalNewKey) {
            const newBaseTitle = getBaseGroupName(hypotheticalNewKey);
            logMessage(
                `[Rename Strategy] Group ${group.id} ("${getBaseGroupName(currentGroupKey)}") will be renamed to "${newBaseTitle}".`,
            );

            // 1. Update internal state in groupInfoMap. This is the most critical part.
            info.key = hypotheticalNewKey;
            info.title = hypotheticalNewKey; // The internal title carries the marker.
            groupInfoMap.set(group.id, info);

            // 2. Update the visible title in the browser UI to the new base name.
            // Prefix logic will handle adding emojis later.
            await executeWithRetries(
                async () => await chrome.tabGroups.update(group.id, { title: newBaseTitle }),
                `renaming group ${group.id} to ${newBaseTitle}`,
            );
        }
    });

    await Promise.all(renamePromises);
}

function constructFullTitle(type, key, title, config) {
    let baseNameToUse; // This will be the variable containing the final base name.

    // Decision logic is now INSIDE the function, where it belongs.
    switch (type) {
        case 'special':
            const specialConfig = Object.values(config.specialGroups).find((c) => c.key === key);
            baseNameToUse = (specialConfig ? specialConfig.name : key) || title;
            return SPECIAL_PREFIX + baseNameToUse + SPECIAL_SUFFIX;

        case 'domain':
            baseNameToUse = title;
            return baseNameToUse + DOMAIN_SUFFIX;

        case 'rule':
            baseNameToUse = title;
            return RULE_PREFIX + baseNameToUse;

        case 'manual':
        default:
            // Manual groups do not have markers.
            return title;
    }
}

/**
 * Main orchestrator function to group tabs across all windows.
 */
async function groupTabs() {
    if (shouldIgnoreEventDuringInitialization('groupTabs', 'groupTabs')) return;
    if (isGrouping) {
        logMessage("[groupTabs] Skipping execution because it's already running.");
        return;
    }

    const settingsAreReady = await ensureSettingsAreLoaded();
    if (!settingsAreReady) {
        isGrouping = false;
        return;
    }

    isGrouping = true;
    logMessage('[groupTabs] Starting grouping process...');

    try {
        const windows = await chrome.windows.getAll({ populate: true });
        const customRules = extensionSettings.customRules || (await getRulesFromStorage());
        const sortGroupsEnabled = extensionSettings.sortGroupsAlphabetically || (await getSortAlphabeticallySetting());
        const localClusterConfig = extensionSettings.clusterConfig || DEFAULT_CLUSTER_CONFIG;
        const isClusteringGloballyEnabled = extensionSettings.clusteringEnabled ?? true;
        const configChanged = JSON.stringify(localClusterConfig) !== JSON.stringify(lastAppliedClusterConfig);

        if (configChanged) {
            logMessage('[groupTabs] Cluster configuration change detected!');
        }

        for (const window of windows) {
            if (window.type !== 'normal' || window.alwaysOnTop) continue;
            const windowId = window.id;
            let tabs = window.tabs.filter((tab) => !tab.pinned);
            let existingGroups = await getExistingGroupsForWindow(windowId);
            // The populated window already carries every tab; querying them again
            // only added a round trip per window.
            const initialComposition = await getGroupComposition(windowId, window.tabs);

            const tabsByGroupId = new Map();
            for (const tab of tabs) {
                if (tab.groupId !== -1) {
                    if (!tabsByGroupId.has(tab.groupId)) {
                        tabsByGroupId.set(tab.groupId, []);
                    }
                    tabsByGroupId.get(tab.groupId).push(tab);
                }
            }

            for (const group of Object.values(existingGroups)) {
                if (!groupInfoMap.has(group.id) && group.title !== '') {
                    logMessage(
                        `[groupTabs] SAFETY NET: Discovered unknown group ${group.id} ("${group.title}"). Performing identification.`,
                    );
                    const tabsInGroup = tabs.filter((t) => t.groupId === group.id);
                    if (tabsInGroup.length > 0) {
                        const allTabsLoaded = tabsInGroup.every(
                            (tab) => tab.url !== '' && tab.url !== 'about:blank' && tab.url !== 'chrome://blank',
                        );
                        if (allTabsLoaded) {
                            const inferredInfo = inferGroupTypeFromTabs(
                                group.id,
                                tabsInGroup,
                                group.title,
                                customRules,
                                localClusterConfig,
                            );
                            const cleanTitle = getBaseGroupName(group.title);

                            const fullTitle = constructFullTitle(
                                inferredInfo.type,
                                inferredInfo.key,
                                cleanTitle,
                                localClusterConfig,
                            );
                            if (!isTitleInvalidForUpdate(fullTitle)) {
                                groupInfoMap.set(group.id, {
                                    type: inferredInfo.type,
                                    key: inferredInfo.key,
                                    title: fullTitle,
                                    isCompact: false,
                                });
                            }

                            logMessage(
                                `[groupTabs] Group ${group.id} identified as type '${inferredInfo.type}' with key '${inferredInfo.key}'.`,
                            );
                        }
                    } else {
                        logMessage(
                            `[groupTabs] SAFETY NET: Deferring identification for group ${group.id} ("${group.title}") because not all its tabs are fully loaded.`,
                        );
                    }
                }
            }

            if (configChanged) {
                await renameMismatchedDomainGroups(
                    Object.values(existingGroups),
                    tabsByGroupId,
                    groupInfoMap,
                    localClusterConfig,
                    lastAppliedClusterConfig,
                );
                // After renaming, the group state in the browser might be updated, so we re-fetch.
                existingGroups = await getExistingGroupsForWindow(windowId);
            }

            // STEP 1 & 2 & 3: Combine all tabs to ungroup (misplaced, disabled cluster, dissolved) in a single fast pass.
            const allTabsToUngroup = new Set();

            const misplacedTabIds = ejectMisplacedTabsFromGroups(
                tabs,
                existingGroups,
                groupInfoMap,
                customRules,
                localClusterConfig,
            );
            misplacedTabIds.forEach((id) => allTabsToUngroup.add(id));

            if (!isClusteringGloballyEnabled) {
                const groupIdsToClean = new Set();
                tabs.forEach((t) => {
                    if (t.groupId !== -1) {
                        const info = groupInfoMap.get(t.groupId);
                        if (info && (info.type === 'domain' || info.type === 'special')) {
                            allTabsToUngroup.add(t.id);
                            groupIdsToClean.add(t.groupId);
                        }
                    }
                });

                for (const groupId of groupIdsToClean) {
                    groupInfoMap.delete(groupId);
                    groupIdentifierMap.delete(groupId);
                    groupExpandedEver.delete(groupId);
                    delete lastActivity[groupId];
                }
            }

            const tabsToUngroupFromDissolved = dissolveEmptyOrInvalidGroups(
                tabs,
                existingGroups,
                groupInfoMap,
                localClusterConfig,
                configChanged,
            );
            tabsToUngroupFromDissolved.forEach((id) => allTabsToUngroup.add(id));

            if (allTabsToUngroup.size > 0) {
                const ungroupList = Array.from(allTabsToUngroup);
                await executeWithRetries(
                    async () => await chrome.tabs.ungroup(ungroupList),
                    `ungrouping ${ungroupList.length} tabs in single batch`,
                );
                const updatedWindow = await chrome.windows.get(windowId, { populate: true });
                tabs = updatedWindow.tabs.filter((tab) => !tab.pinned);
                existingGroups = await getExistingGroupsForWindow(windowId);
            }

            // STEP 4: Group remaining tabs (new, ejected, from dissolved groups).
            const automaticGroupIds = new Set();
            for (const groupIdStr in existingGroups) {
                const groupId = parseInt(groupIdStr, 10);
                const info = groupInfoMap.get(groupId);

                if (info && info.type !== 'manual') {
                    automaticGroupIds.add(groupId);
                }
            }

            const tabsToGroup = tabs.filter((tab) => {
                if (tab.groupId === -1) return true;
                return automaticGroupIds.has(tab.groupId);
            });

            const allGroupIds = await processAndGroupRemainingTabs(
                tabsToGroup,
                customRules,
                existingGroups,
                windowId,
                localClusterConfig,
                isClusteringGloballyEnabled,
            );

            // STEP 5: Final tasks like sorting and updating prefixes.
            await finalizeWindowProcessing(
                windowId,
                tabs,
                allGroupIds,
                initialComposition,
                sortGroupsEnabled,
                configChanged,
            );
        }

        if (configChanged) {
            logMessage('[groupTabs] Cluster config has changed. Updating reference state.');
            lastAppliedClusterConfig = JSON.parse(JSON.stringify(localClusterConfig));
        }

        await saveGroupInfoMap();
    } catch (error) {
        console.error('Catastrophic error in groupTabs:', error);
    } finally {
        isGrouping = false;
        logMessage('[groupTabs] Grouping process finished.');
        if (typeof hasPendingRegroup !== 'undefined' && hasPendingRegroup) {
            hasPendingRegroup = false;
            debounceGroupTabs(50);
        }
    }
}

async function toggleCurrentGroupCommand() {
    const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });
    if (activeTab?.groupId !== -1 && activeTab.groupId !== undefined) {
        try {
            const group = await chrome.tabGroups.get(activeTab.groupId);
            await executeWithRetries(
                async () =>
                    await chrome.tabGroups.update(group.id, {
                        collapsed: !group.collapsed,
                    }),
                `toggle current group command ${group.id} collapsed ${!group.collapsed}`,
            );
            if (!group.collapsed) {
                groupExpandedEver.set(group.id, true);
                await saveSessionState();
            }
            if (!shouldIgnoreEventDuringInitialization('commands.onCommand', 'toggle-current-group')) {
                await updateAllGroupPrefixes(group.windowId, group.id);
            }
        } catch (error) {
            console.error('Error toggling current group. / Error al alternar el grupo actual:', error);
        }
    }
}

async function toggleAllGroupsCommand() {
    try {
        const groups = await chrome.tabGroups.query({});
        if (groups.length > 0) {
            const collapse = groups.some((group) => !group.collapsed);
            for (const group of groups) {
                await executeWithRetries(
                    async () => await chrome.tabGroups.update(group.id, { collapsed: collapse }),
                    `toggle all group command ${group.id} collapsed ${!collapse}`,
                );
                if (!collapse) {
                    groupExpandedEver.set(group.id, true);
                }
            }
            await saveSessionState();
            if (!shouldIgnoreEventDuringInitialization('commands.onCommand', 'toggle-all-groups')) {
                const windows = await chrome.windows.getAll();
                for (const win of windows) {
                    await updateAllGroupPrefixes(win.id, null);
                }
            }
        }
    } catch (error) {
        console.error('Error toggling all groups.', error);
    }
}

async function togglePrefixesCommand(newState) {
    const isToggleAction = newState === undefined;
    const newToggleState = isToggleAction ? !extensionSettings.enablePrefixes : newState;
    extensionSettings.enablePrefixes = newToggleState;

    const storage = await getSettingsStorage();
    await storage.set({ enablePrefixes: extensionSettings.enablePrefixes });

    const windows = await chrome.windows.getAll();
    if (!extensionSettings.enablePrefixes) {
        for (const window of windows) {
            await clearAllGroupPrefixes(window.id);
        }
    } else {
        loadUserDefinedPrefixes();
        for (const window of windows) {
            await updateAllGroupPrefixes(window.id, null);
        }
    }

    chrome.runtime.sendMessage({
        action: 'optionChanged',
        option: 'enablePrefixes',
        value: extensionSettings.enablePrefixes,
    });
}

async function toggleHintsCommand() {
    const { hintsEnabled = true } = await chrome.storage.sync.get('hintsEnabled');
    const newState = !hintsEnabled;
    await chrome.storage.sync.set({ hintsEnabled: newState });

    // 1. Notify content scripts in all tabs
    if (typeof handleHintStatusChanged === 'function') {
        handleHintStatusChanged({ action: 'hintStatusChanged', enabled: newState });
    }

    // 2. Notify other extension parts (like the popup) to sync the UI
    chrome.runtime.sendMessage({ action: 'hintStatusChanged', enabled: newState });
}

async function toggleLinkPreviewOption(explicitState) {
    const res = await chrome.storage.local.get(['linkPreviewEnabled']);
    const currentState = res.linkPreviewEnabled !== false; // default true
    const newState = explicitState !== undefined ? Boolean(explicitState) : !currentState;

    extensionSettings.linkPreviewEnabled = newState;
    await chrome.storage.local.set({ linkPreviewEnabled: newState });
    await chrome.storage.sync.set({ linkPreviewEnabled: newState });

    try {
        await chrome.contextMenus.update('toggle-link-preview', { checked: newState });
    } catch {}

    const msg = { action: 'linkPreviewStatusChanged', enabled: newState };
    chrome.runtime.sendMessage(msg);

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
}

async function toggleExtensionPopupCommand(tab = null) {
    try {
        const popupUrl = chrome.runtime.getURL('src/ui/pages/popup/popup.html');

        // 1. Check if it's already open
        const tabs = await chrome.tabs.query({ url: popupUrl });
        if (tabs.length > 0) {
            await chrome.windows.update(tabs[0].windowId, { focused: true });
            return;
        }

        // 2. Dimensions
        const width = 450;
        const height = 700;

        // 3. Centering logic
        let left = 100;
        let top = 100;
        try {
            const displayInfo = await chrome.system.display.getInfo();
            if (displayInfo && displayInfo.length > 0) {
                const workArea = displayInfo[0].workArea;
                left = Math.round(workArea.left + (workArea.width - width) / 2);
                top = Math.round(workArea.top + (workArea.height - height) / 2);
            }
        } catch {
            try {
                const currentWin = await chrome.windows.getLastFocused();
                left = Math.round(currentWin.left + (currentWin.width - width) / 2);
                top = Math.round(currentWin.top + (currentWin.height - height) / 2);
            } catch {}
        }

        // 4. Create the window
        await chrome.windows.create({
            url: popupUrl,
            type: 'popup',
            width: width,
            height: height,
            left: left,
            top: top,
            focused: true,
        });
    } catch (e) {
        console.warn('Failed to open popup window, opening rules manager as fallback.', e);
        await openRulesManagerCommand();
    }
}

async function openRulesManagerCommand() {
    const rulesUrl = chrome.runtime.getURL('src/ui/pages/rules/rules.html');
    const tabs = await chrome.tabs.query({ url: rulesUrl });
    if (tabs.length === 0) {
        await chrome.tabs.create({ url: rulesUrl, active: true });
    } else {
        await chrome.tabs.update(tabs[0].id, { active: true });
        await chrome.windows.update(tabs[0].windowId, { focused: true });
    }
}

async function handleSplitScreenClosure(state, tabIdToClose = null) {
    if (!state || !state.isActive || !state.splitWindowId) {
        return;
    }

    logMessage(`[Split Screen] Starting session closure in window ${state.splitWindowId}.`);

    try {
        // Get ALL tabs currently in the split group.
        const tabsInGroup = await chrome.tabs.query({ groupId: state.splitGroupId });
        const tabIdsInGroup = tabsInGroup.map((t) => t.id);

        if (tabIdsInGroup.length > 0) {
            logMessage(`[Split Screen] Ungrouping ${tabIdsInGroup.length} tab(s) before closing.`);
            // First, UNGROUP all existing tabs in the group.
            // This is crucial so the group is not "saved" or "archived".
            await chrome.tabs.ungroup(tabIdsInGroup);
        }

        // Then, we close the window containing the group.
        logMessage(`[Split Screen] Closing window ${state.splitWindowId}.`);
        await chrome.windows.remove(state.splitWindowId);

        // Final cleanup of the session state and window restoration
        // original window will happen in the `chrome.windows.onRemoved` listener,
        // which is triggered by the previous line.
    } catch (error) {
        // It's safe to ignore errors if the group or window no longer exists,
        // as it means the desired state (closed) has already been reached.
        if (
            !error.message.toLowerCase().includes('no group with id') &&
            !error.message.toLowerCase().includes('no window with id')
        ) {
            console.error('Error during split screen closure:', error);
        }
    }
}

async function addLinkPreviewBlacklistDomain(domain) {
    if (!domain || typeof domain !== 'string') return;
    const cleanDomain = domain.trim().toLowerCase();
    if (!cleanDomain) return;

    const res = await chrome.storage.sync.get(['linkPreviewBlacklist']);
    const blacklist = res.linkPreviewBlacklist || [];
    if (!blacklist.includes(cleanDomain)) {
        blacklist.push(cleanDomain);
        await chrome.storage.sync.set({ linkPreviewBlacklist: blacklist });

        const msgStr = getI18nMsg(
            'domainBlacklistedNotify',
            [cleanDomain],
            `Dominio añadido a la lista negra: ${cleanDomain}`,
        );
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: 'Intelligent Tab Group',
            message: msgStr,
        });

        const msg = { action: 'linkPreviewBlacklistUpdated', blacklist };
        chrome.runtime.sendMessage(msg);
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
        }
    }
}

async function removeLinkPreviewBlacklistDomain(domain) {
    if (!domain || typeof domain !== 'string') return;
    const cleanDomain = domain.trim().toLowerCase();
    if (!cleanDomain) return;

    const res = await chrome.storage.sync.get(['linkPreviewBlacklist']);
    let blacklist = res.linkPreviewBlacklist || [];
    if (blacklist.includes(cleanDomain)) {
        blacklist = blacklist.filter((d) => d !== cleanDomain);
        await chrome.storage.sync.set({ linkPreviewBlacklist: blacklist });

        const msgStr = getI18nMsg(
            'domainRemovedNotify',
            [cleanDomain],
            `Dominio eliminado de la lista negra: ${cleanDomain}`,
        );
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: 'Intelligent Tab Group',
            message: msgStr,
        });

        const msg = { action: 'linkPreviewBlacklistUpdated', blacklist };
        chrome.runtime.sendMessage(msg);
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
        }
    }
}

async function editLinkPreviewBlacklistDomain(oldDomain, newDomain) {
    if (!oldDomain || typeof oldDomain !== 'string' || !newDomain || typeof newDomain !== 'string') return;
    const cleanOld = oldDomain.trim().toLowerCase();
    const cleanNew = newDomain.trim().toLowerCase();
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

    const res = await chrome.storage.sync.get(['linkPreviewBlacklist']);
    let blacklist = res.linkPreviewBlacklist || [];

    if (blacklist.includes(cleanOld)) {
        blacklist = blacklist.map((d) => (d === cleanOld ? cleanNew : d));
        blacklist = [...new Set(blacklist)]; // Remove duplicates
        await chrome.storage.sync.set({ linkPreviewBlacklist: blacklist });

        const msg = { action: 'linkPreviewBlacklistUpdated', blacklist };
        chrome.runtime.sendMessage(msg);
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
        }
    }
}

async function handleSetLinkPreviewTriggerKey(triggerKey, sendResponse) {
    const cleanKey = (triggerKey || '').trim().toLowerCase();
    await chrome.storage.sync.set({ linkPreviewTriggerKey: cleanKey });
    await chrome.storage.local.set({ linkPreviewTriggerKey: cleanKey });
    if (typeof extensionSettings !== 'undefined' && extensionSettings) {
        extensionSettings.linkPreviewTriggerKey = cleanKey;
    }

    const msg = { action: 'linkPreviewTriggerKeyUpdated', triggerKey: cleanKey };
    chrome.runtime.sendMessage(msg);
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
    if (sendResponse) sendResponse({ success: true });
}
