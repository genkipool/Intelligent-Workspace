/**
 * Validates and sanitizes URL strings for grouping rules.
 * Ensures domain substrings are cleaned from wildcards/asterisks and formatted as valid domain hosts.
 */
const RULE_URL_SCHEMES = /^(https?:\/\/|file:\/\/\/|chrome:\/\/|chrome-extension:\/\/)/;

function validateAndSanitizeRuleUrls(urls) {
    if (!urls) return [];
    const list = Array.isArray(urls) ? urls : [urls];
    return list
        .map((u) => {
            if (typeof u !== 'string') return '';
            let s = u.trim().toLowerCase();
            s = s.replace(/^\*+|\*+$/g, '');
            if (!s) return '';
            // The rules page only accepts addresses with a scheme, and it is what the
            // matcher compares against; a bare domain was stored as-is and the rule then
            // showed up as invalid there. A domain is given the https it implies.
            if (!RULE_URL_SCHEMES.test(s)) {
                if (!s.includes('.')) s += '.com';
                s = 'https://' + s;
            }
            return s.replace(/\/+$/, '');
        })
        .filter(Boolean);
}

/**
 * [AI INSTRUCTION]
 * Utility function to resolve a Tab Group from agent parameters.
 * Always use this instead of duplicating chrome.tabGroups.query({}) and search logic.
 */
async function resolveGroup(params) {
    const { groupName, groupId } = params;
    if (!groupName && groupId === undefined) {
        throw new Error('groupName or groupId required');
    }
    // This used to call itself, so every tool that resolved a group by name ran out of
    // stack instead of answering.
    const groups = await chrome.tabGroups.query({});
    if (groupId !== undefined) {
        const byId = groups.find((g) => g.id === Number(groupId));
        if (byId) return byId;
    }
    return findGroupIdByName(groupName, groups);
}

/**
 * [AI INSTRUCTION]
 * Utility function to get the current storage area for rules and themes.
 * Always use this instead of repeating the storage area fetch logic.
 */
async function getThemeStorage() {
    const { themeStorageArea = 'sync' } = await chrome.storage.local.get('themeStorageArea');
    return {
        areaName: themeStorageArea,
        storage: chrome.storage[themeStorageArea],
    };
}

/**
 * Executes a single agent tool call and returns a result string.
 * All async chrome.* calls are properly awaited.
 */
async function executeAgentTool(tool, params) {
    logMessage(`[Agent] Executing tool: ${tool}`, JSON.stringify(params));

    switch (tool) {
        case 'getOpenTabs': {
            const tabs = await chrome.tabs.query({});
            const simplified = tabs.map((t) => ({
                id: t.id,
                title: t.title,
                url: t.url,
                active: t.active,
                groupId: t.groupId,
                pinned: t.pinned,
            }));
            return JSON.stringify(simplified);
        }

        case 'switchToTab': {
            if (!params.tabId) return 'Error: tabId required';
            await chrome.tabs.update(Number(params.tabId), { active: true });
            return `Switched to tab ${params.tabId}`;
        }

        case 'createNewTab': {
            const tab = await chrome.tabs.create({ url: params.url || undefined });
            return `Created tab ${tab.id}${params.url ? ' with url: ' + params.url : ''}`;
        }

        case 'closeTab': {
            if (!params.tabId) return 'Error: tabId required';
            await chrome.tabs.remove(Number(params.tabId));
            return `Closed tab ${params.tabId}`;
        }

        case 'closeTabs': {
            if (!params.tabIds || !Array.isArray(params.tabIds)) return 'Error: tabIds array required';
            await chrome.tabs.remove(params.tabIds.map(Number));
            return `Closed ${params.tabIds.length} tabs`;
        }

        case 'getTabGroups': {
            const rawGroups = await chrome.tabGroups.query({});
            const groups = enhanceGroupsWithRealTitles(rawGroups);
            return JSON.stringify(groups);
        }

        case 'deleteTabGroup': {
            if (!params.groupId) return 'Error: groupId required';
            const tabs = await chrome.tabs.query({ groupId: Number(params.groupId) });
            if (tabs.length > 0) await chrome.tabs.remove(tabs.map((t) => t.id));
            return `Deleted group ${params.groupId} (${tabs.length} tabs closed)`;
        }

        case 'groupTabs': {
            const { tabIds, groupName } = params;
            if (!tabIds || !groupName) return 'Error: tabIds and groupName required';
            const numericTabIds = tabIds.map(Number);
            const groupId = await chrome.tabs.group({ tabIds: numericTabIds });
            await chrome.tabGroups.update(groupId, { title: groupName, collapsed: false });
            return `Grouped ${numericTabIds.length} tabs into group "${groupName}" (groupId: ${groupId})`;
        }

        case 'regroupAllTabs': {
            return await new Promise((resolve) => {
                handleRegroupAllTabs((result) => resolve(`Regrouped all tabs: ${JSON.stringify(result)}`));
            });
        }

        case 'removeDuplicateTabs': {
            return await new Promise((resolve) => {
                handleRemoveDuplicateTabs((result) => resolve(`Removed duplicates: ${JSON.stringify(result)}`));
            });
        }

        case 'getBookmarks': {
            return await new Promise((resolve) => {
                handleGetBookmarks((result) => resolve(JSON.stringify(result)));
            });
        }

        case 'searchBookmarks': {
            if (!params.query) return 'Error: query required';
            return await new Promise((resolve) => {
                handleSearchBookmarks({ query: params.query }, (result) => resolve(JSON.stringify(result)));
            });
        }

        case 'createBookmark': {
            const { url, title, parentId } = params;
            if (!url || !title) return 'Error: url and title required';
            return await new Promise((resolve) => {
                handleCreateBookmark({ url, title, parentId }, (result) => resolve(JSON.stringify(result)));
            });
        }

        case 'getHistory': {
            return await new Promise((resolve) => {
                handleGetHistory(
                    { query: params.query || params.text || '', maxResults: params.maxResults || 20 },
                    (result) => resolve(JSON.stringify(result)),
                );
            });
        }

        case 'getRecentlyClosed': {
            return await new Promise((resolve) => {
                handleGetRecentlyClosed({ maxResults: params.maxResults || 10 }, (result) =>
                    resolve(JSON.stringify(result)),
                );
            });
        }

        case 'openUrl': {
            if (!params.url) return 'Error: url required';
            let urlToOpen = params.url.trim();
            // Ensure URL has a protocol to avoid chrome-extension:// prefix
            if (!/^(https?:\/\/|file:\/\/\/|chrome:\/\/|chrome-extension:\/\/)/.test(urlToOpen)) {
                urlToOpen = 'https://' + urlToOpen;
            }
            const tab = await chrome.tabs.create({ url: urlToOpen });
            return `Opened ${urlToOpen} in tab ${tab.id}`;
        }

        case 'searchGoogle': {
            if (!params.query) return 'Error: query required';
            handleSearchAction({ action: 'searchGoogle', text: params.query });
            return `Opened Google search for: "${params.query}"`;
        }

        case 'duplicateTab': {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab) return 'No active tab found';
            const newTab = await chrome.tabs.duplicate(activeTab.id);
            return `Duplicated tab ${activeTab.id}, new tab id: ${newTab.id}`;
        }

        case 'getActiveTheme': {
            return await new Promise((resolve) => {
                handleGetActiveTheme((result) => resolve(JSON.stringify(result)));
            });
        }

        case 'getRules': {
            const { storage } = await getThemeStorage();
            const data = await storage.get('customRules');
            return JSON.stringify(customRules);
        }

        case 'getSavedThemes': {
            const { storage } = await getThemeStorage();
            const data = await storage.get('savedThemes');
            return JSON.stringify(savedThemes);
        }

        case 'closeTabsWithSound': {
            const tabsWithSound = await chrome.tabs.query({ audible: true });
            if (tabsWithSound.length === 0) return 'No tabs currently playing sound.';
            const tabIds = tabsWithSound.map((t) => t.id);
            await chrome.tabs.remove(tabIds);
            return `Closed ${tabsWithSound.length} tab(s) playing sound.`;
        }

        // -- NEW TOOLS ------------------------------------------------------------

        // -- NEW TOOLS ------------------------------------------------------------

        case 'getActiveTab': {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return 'No active tab';
            return JSON.stringify({ id: tab.id, title: tab.title, url: tab.url });
        }

        case 'getActiveTabContent': {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return 'No active tab';
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                return `Active tab: "${tab.title}" -- cannot read content of browser internal pages.`;
            }
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const body = document.body;
                        const scripts = body.querySelectorAll('script, style, noscript');
                        scripts.forEach((s) => s.remove());
                        return (body.innerText || body.textContent || '').trim().substring(0, 8000);
                    },
                });
                const text = results?.[0]?.result || '';
                return `Page: "${tab.title}"\nURL: ${tab.url}\n\nContent:\n${text}`;
            } catch (err) {
                return `Active tab: "${tab.title}" (${tab.url}) -- could not extract content: ${err.message}`;
            }
        }

        case 'findAndSwitchToTab': {
            if (!params.query) return 'Error: query required';
            const tabs = await chrome.tabs.query({});
            const q = params.query.toLowerCase();
            const match = tabs.find(
                (t) => (t.title && t.title.toLowerCase().includes(q)) || (t.url && t.url.toLowerCase().includes(q)),
            );
            if (!match) return `No tab found matching "${params.query}"`;
            await chrome.tabs.update(match.id, { active: true });
            await chrome.windows.update(match.windowId, { focused: true });
            return `Switched to existing tab: "${match.title}" (id: ${match.id})`;
        }

        case 'createRule': {
            if (!params.name) return 'Error: name required';
            const { storage } = await getThemeStorage();
            const { customRules = [] } = await storage.get('customRules');
            if (customRules.find((r) => r.name.toLowerCase() === params.name.toLowerCase())) {
                return `Error: rule "${params.name}" already exists`;
            }
            const validColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
            const randomColor = validColors[Math.floor(Math.random() * validColors.length)];

            const sanitizedUrls = validateAndSanitizeRuleUrls(params.urls);
            if (sanitizedUrls.length === 0) {
                return `Error: Valid domain names or URLs required to create rule "${params.name}" (e.g., 'sega.com', 'nintendo.com').`;
            }

            const newRule = {
                name: params.name,
                urls: sanitizedUrls,
                color: params.color || randomColor,
                active: true,
            };
            customRules.push(newRule);
            await StorageService.saveCustomRules(customRules);
            chrome.runtime.sendMessage({ action: 'rulesUpdated' });
            await new Promise((r) => setTimeout(r, 300));
            return `Rule "${params.name}" created with ${newRule.urls.length} URL(s) (${newRule.urls.join(', ')}) and color "${newRule.color}"`;
        }

        case 'updateRule': {
            if (!params.name) return 'Error: name required';
            const customRules = await StorageService.getCustomRules();
            const idx = customRules.findIndex((r) => r.name.toLowerCase() === params.name.toLowerCase());
            if (idx === -1) return `Error: rule "${params.name}" not found`;
            if (params.newName) customRules[idx].name = params.newName;
            if (params.color) customRules[idx].color = params.color;
            if (params.urls) {
                const sanitizedUrls = validateAndSanitizeRuleUrls(params.urls);
                if (sanitizedUrls.length === 0) {
                    return `Error: Valid domain names or URLs required to update rule "${params.name}" (e.g., 'sega.com', 'nintendo.com').`;
                }
                customRules[idx].urls = sanitizedUrls;
            }
            if (params.active !== undefined) customRules[idx].active = params.active;
            await StorageService.saveCustomRules(customRules);
            chrome.runtime.sendMessage({ action: 'rulesUpdated' });
            await new Promise((r) => setTimeout(r, 300));
            return `Rule "${params.name}" updated successfully`;
        }

        case 'deleteRule': {
            if (!params.name) return 'Error: name required';
            const customRules = await StorageService.getCustomRules();
            const newRules = customRules.filter((r) => r.name.toLowerCase() !== params.name.toLowerCase());
            if (newRules.length === customRules.length) return `Error: rule "${params.name}" not found`;
            await StorageService.saveCustomRules(newRules);
            chrome.runtime.sendMessage({ action: 'rulesUpdated' });
            await new Promise((r) => setTimeout(r, 300));
            return `Rule "${params.name}" deleted`;
        }

        case 'collapseTabGroup': {
            try {
                const group = await resolveGroup(params);
                if (!group) return `No tab group found matching "${params.groupName || params.groupId}"`;
                await chrome.tabGroups.update(group.id, { collapsed: true });
                return `Group "${group.title || group.id}" collapsed`;
            } catch (err) {
                return err.message;
            }
        }

        case 'expandTabGroup': {
            try {
                const group = await resolveGroup(params);
                if (!group) return `No tab group found matching "${params.groupName || params.groupId}"`;
                await chrome.tabGroups.update(group.id, { collapsed: false });
                return `Group "${group.title || group.id}" expanded`;
            } catch (err) {
                return err.message;
            }
        }

        case 'collapseAllGroups': {
            const groups = await chrome.tabGroups.query({});
            await Promise.all(groups.map((g) => chrome.tabGroups.update(g.id, { collapsed: true })));
            return `Collapsed ${groups.length} group(s)`;
        }

        case 'expandAllGroups': {
            const groups = await chrome.tabGroups.query({});
            await Promise.all(groups.map((g) => chrome.tabGroups.update(g.id, { collapsed: false })));
            return `Expanded ${groups.length} group(s)`;
        }

        case 'setGroupColor': {
            if (!params.color)
                return 'Error: color required (blue, red, yellow, green, pink, purple, cyan, orange, grey)';
            try {
                const group = await resolveGroup(params);
                if (!group) return `No tab group found matching "${params.groupName || params.groupId}"`;
                await chrome.tabGroups.update(group.id, { color: params.color });
                return `Group "${group.title || group.id}" color set to "${params.color}"`;
            } catch (err) {
                return err.message;
            }
        }

        case 'renameTabGroup': {
            const { groupName, groupId, newName } = params;
            if (!groupName && groupId === undefined) return 'Error: groupName or groupId required';
            if (!newName) return 'Error: newName required';
            const group = await resolveGroup(params);
            if (!group) return `No tab group found matching "${groupName || groupId}"`;
            await chrome.tabGroups.update(group.id, { title: newName });
            return `Group "${group.title || group.id}" renamed to "${newName}"`;
        }

        case 'pinTab': {
            const { tabId } = params;
            if (!tabId) return 'Error: tabId required';
            await chrome.tabs.update(Number(tabId), { pinned: true });
            return `Tab ${tabId} pinned`;
        }

        case 'unpinTab': {
            const { tabId } = params;
            if (!tabId) return 'Error: tabId required';
            await chrome.tabs.update(Number(tabId), { pinned: false });
            return `Tab ${tabId} unpinned`;
        }

        case 'moveTabToGroup': {
            const { tabId, groupName, groupId } = params;
            if (!tabId) return 'Error: tabId required';
            let group;
            try {
                group = await resolveGroup(params);
            } catch (e) {
                return 'Error: ' + e.message;
            }
            if (!group) return `No group found matching "${groupName || groupId}"`;
            await chrome.tabs.group({ tabIds: [Number(tabId)], groupId: group.id });
            return `Tab ${tabId} moved to group "${group.title || group.id}"`;
        }

        case 'applyTheme': {
            const { themeName } = params;
            if (!themeName) return 'Error: themeName required';

            const savedThemes = await StorageService.getSavedThemes();
            let theme = savedThemes.find((t) => t.name && t.name.toLowerCase().includes(themeName.toLowerCase()));

            if (!theme) {
                const allNames = savedThemes.map((t) => t.name).join(', ');
                return `Theme "${themeName}" not found. Available: ${allNames}`;
            }

            await StorageService.saveActiveTheme(theme);
            chrome.runtime.sendMessage({ action: 'themeChanged' });
            return `Theme "${theme.name}" applied`;
        }

        case 'createAndApplyTheme': {
            const { name, colors = {} } = params;
            if (!name) return 'Error: name required';

            let savedThemesPrimary = await StorageService.getSavedThemes();
            let existingIndexPrimary = savedThemesPrimary.findIndex(
                (t) => t.name && t.name.toLowerCase() === name.toLowerCase(),
            );

            let newTheme;
            if (existingIndexPrimary !== -1) {
                let existingTheme = savedThemesPrimary[existingIndexPrimary];
                const mergedColors = { ...existingTheme.colors, ...colors };
                newTheme = { ...existingTheme, colors: mergedColors };
                savedThemesPrimary[existingIndexPrimary] = newTheme;
            } else {
                const randomColor = () =>
                    `#${Math.floor(Math.random() * 16777215)
                        .toString(16)
                        .padStart(6, '0')}`;
                const defaultKeys = [
                    'actionColor',
                    'textColor',
                    'textOnColor',
                    'bgColor',
                    'bgPanelColor',
                    'borderColor',
                    'interactiveColor',
                    'errorColor',
                    'headerColor',
                ];
                const finalColors = {};
                defaultKeys.forEach((k) => {
                    finalColors[k] = colors[k] || randomColor();
                });
                newTheme = { name, colors: finalColors };

                savedThemesPrimary.push(newTheme);
            }

            await StorageService.saveSavedThemes(savedThemesPrimary);
            await StorageService.saveActiveTheme(newTheme);
            chrome.runtime.sendMessage({ action: 'themeChanged' });
            const actionRaw = existingIndexPrimary !== -1 ? '(updated)' : '(created)';
            return `Theme "${name}" ${actionRaw} and applied with colors: ${JSON.stringify(newTheme.colors)}`;
        }

        case 'applyRandomTheme': {
            const randomColor = () =>
                `#${Math.floor(Math.random() * 16777215)
                    .toString(16)
                    .padStart(6, '0')}`;
            const colors = {
                actionColor: randomColor(),
                textColor: randomColor(),
                textOnColor: randomColor(),
                bgColor: randomColor(),
                bgPanelColor: randomColor(),
                borderColor: randomColor(),
                interactiveColor: randomColor(),
                errorColor: randomColor(),
                headerColor: randomColor(),
            };
            const theme = { name: 'Random Theme', colors };
            await StorageService.saveActiveTheme(theme);
            chrome.runtime.sendMessage({ action: 'themeChanged' });
            return `Random theme applied: ${JSON.stringify(colors)}`;
        }

        case 'updateTheme': {
            const { name, colors = {} } = params;
            if (!name) return 'Error: name required';
            let savedThemes = await StorageService.getSavedThemes();
            let idx = savedThemes.findIndex((t) => t.name && t.name.toLowerCase() === name.toLowerCase());
            if (idx === -1) return `Error: theme "${name}" not found.`;

            const mergedColors = { ...savedThemes[idx].colors, ...colors };
            savedThemes[idx].colors = mergedColors;
            await StorageService.saveSavedThemes(savedThemes);
            return `Theme "${name}" updated successfully (colors merged).`;
        }

        case 'saveTheme': {
            if (!params.name) return 'Error: name required';
            const activeTheme = await StorageService.getActiveTheme();
            if (!activeTheme || !activeTheme.colors) return 'Error: no active custom theme to save';

            const themeToSave = { name: params.name, colors: activeTheme.colors };
            let savedThemes = await StorageService.getSavedThemes();

            const existingIdx = savedThemes.findIndex((t) => t.name.toLowerCase() === params.name.toLowerCase());
            if (existingIdx >= 0) {
                savedThemes[existingIdx] = themeToSave;
            } else {
                savedThemes.push(themeToSave);
            }
            await StorageService.saveSavedThemes(savedThemes);
            chrome.runtime.sendMessage({ action: 'themeChanged' });
            return `Theme "${params.name}" saved successfully. It is now visible in the Themes panel.`;
        }

        case 'muteAllTabs': {
            const tabs = await chrome.tabs.query({ audible: true });
            for (const t of tabs) {
                await chrome.tabs.update(t.id, { muted: true });
            }
            return `Muted ${tabs.length} audible tab(s)`;
        }

        case 'unmuteAllTabs': {
            const tabs = await chrome.tabs.query({ muted: true });
            for (const t of tabs) {
                await chrome.tabs.update(t.id, { muted: false });
            }
            return `Unmuted ${tabs.length} muted tab(s)`;
        }

        case 'closeTabsInGroup': {
            const { groupName, groupId } = params;
            let group;
            try {
                group = await resolveGroup(params);
            } catch (e) {
                return 'Error: ' + e.message;
            }
            if (!group) return `No group found matching "${groupName || groupId}"`;
            const tabs = await chrome.tabs.query({ groupId: group.id });
            if (tabs.length > 0) await chrome.tabs.remove(tabs.map((t) => t.id));
            return `Closed ${tabs.length} tab(s) in group "${group.title || group.id}"`;
        }

        case 'addUrlToRule': {
            const { ruleName, url } = params;
            if (!ruleName || !url) return 'Error: ruleName and url required';
            const sanitized = validateAndSanitizeRuleUrls([url]);
            if (sanitized.length === 0) {
                return `Error: Valid domain name or URL required (e.g., 'sega.com', 'nintendo.com').`;
            }
            const urlToAdd = sanitized[0];
            const customRules = await StorageService.getCustomRules();
            const rule = customRules.find((r) => r.name.toLowerCase() === ruleName.toLowerCase());
            if (!rule) return `Rule "${ruleName}" not found`;
            if (!rule.urls.includes(urlToAdd)) rule.urls.push(urlToAdd);
            await StorageService.saveCustomRules(customRules);
            chrome.runtime.sendMessage({ action: 'rulesUpdated' });
            return `URL "${urlToAdd}" added to rule "${ruleName}"`;
        }

        case 'removeUrlFromRule': {
            const { ruleName, url } = params;
            if (!ruleName || !url) return 'Error: ruleName and url required';
            const customRules = await StorageService.getCustomRules();
            const rule = customRules.find((r) => r.name.toLowerCase() === ruleName.toLowerCase());
            if (!rule) return `Rule "${ruleName}" not found`;
            rule.urls = rule.urls.filter((u) => !u.toLowerCase().includes(url.toLowerCase()));
            await StorageService.saveCustomRules(customRules);
            chrome.runtime.sendMessage({ action: 'rulesUpdated' });
            return `URL "${url}" removed from rule "${ruleName}"`;
        }

        case 'setLinkPreview': {
            const enabled = params.enabled !== false;
            if (typeof toggleLinkPreviewOption === 'function') {
                await toggleLinkPreviewOption(enabled);
            }
            return `Floating link previews are now ${enabled ? 'enabled' : 'disabled'}.`;
        }

        case 'getLinkPreviewSettings': {
            const local = await chrome.storage.local.get(['linkPreviewEnabled']);
            const { linkPreviewBlacklist = [] } = await chrome.storage.sync.get(['linkPreviewBlacklist']);
            return JSON.stringify({
                enabled: local.linkPreviewEnabled !== false,
                blacklist: linkPreviewBlacklist,
            });
        }

        case 'addLinkPreviewBlacklistDomain': {
            const domain = normalizeDomain(params.domain);
            if (!domain) return 'Error: domain required';
            if (typeof addLinkPreviewBlacklistDomain === 'function') {
                await addLinkPreviewBlacklistDomain(domain);
                return `Link previews are now off for "${domain}".`;
            }
            return 'Error: the link preview blacklist is not available';
        }

        case 'removeLinkPreviewBlacklistDomain': {
            const domain = normalizeDomain(params.domain);
            if (!domain) return 'Error: domain required';
            if (typeof removeLinkPreviewBlacklistDomain === 'function') {
                await removeLinkPreviewBlacklistDomain(domain);
                return `Link previews are back on for "${domain}".`;
            }
            return 'Error: the link preview blacklist is not available';
        }

        case 'getSnippets': {
            const snippets = await getStoredSnippets();
            const list = Object.entries(snippets).map(([trigger, value]) => ({
                trigger,
                expansion: typeof value === 'object' ? value.expansion : value,
                variables: typeof value === 'object' ? value.variables || [] : [],
            }));
            return list.length ? JSON.stringify(list) : 'No snippets configured yet.';
        }

        case 'createSnippet':
        case 'updateSnippet': {
            const trigger = String(params.trigger || '').trim();
            const expansion = String(params.expansion || '').trim();
            if (!trigger || !expansion) return 'Error: trigger and expansion required';
            const snippets = await getStoredSnippets();
            const exists = Object.prototype.hasOwnProperty.call(snippets, trigger);
            if (tool === 'createSnippet' && exists) {
                return `Error: a snippet with the trigger "${trigger}" already exists`;
            }
            if (tool === 'updateSnippet' && !exists) {
                return `Error: no snippet with the trigger "${trigger}"`;
            }
            const variables = Array.isArray(params.variables) ? params.variables : [];
            snippets[trigger] = variables.length ? { expansion, variables } : expansion;
            await saveStoredSnippets(snippets);
            return `Snippet "${trigger}" ${exists ? 'updated' : 'created'}.`;
        }

        case 'deleteSnippet': {
            const trigger = String(params.trigger || '').trim();
            if (!trigger) return 'Error: trigger required';
            const snippets = await getStoredSnippets();
            if (!Object.prototype.hasOwnProperty.call(snippets, trigger)) {
                return `Error: no snippet with the trigger "${trigger}"`;
            }
            delete snippets[trigger];
            await saveStoredSnippets(snippets);
            return `Snippet "${trigger}" deleted.`;
        }

        case 'getSiteShortcuts': {
            const shortcuts = await getStoredSiteShortcuts();
            return shortcuts.length ? JSON.stringify(shortcuts) : 'No site shortcuts configured yet.';
        }

        case 'createSiteShortcut':
        case 'updateSiteShortcut': {
            const keys = String(params.keys || '')
                .trim()
                .toLowerCase();
            if (!keys) return 'Error: keys required';
            const shortcuts = await getStoredSiteShortcuts();
            const at = shortcuts.findIndex((c) => c.keys === keys);
            if (tool === 'createSiteShortcut' && at !== -1) {
                return `Error: the shortcut "${keys}" is already in use`;
            }
            if (tool === 'updateSiteShortcut' && at === -1) {
                return `Error: no site shortcut with the keys "${keys}"`;
            }
            const url = params.url ? sanitizeShortcutUrl(params.url) : at !== -1 ? shortcuts[at].url : '';
            if (!url) return 'Error: url required';
            const description = String(params.description || (at !== -1 ? shortcuts[at].description : '') || '').trim();
            const entry = { keys, url, description };
            if (at === -1) shortcuts.push(entry);
            else shortcuts[at] = entry;
            await saveStoredSiteShortcuts(shortcuts);
            return `Site shortcut "${keys}" ${at === -1 ? 'created' : 'updated'} for ${url}.`;
        }

        case 'deleteSiteShortcut': {
            const keys = String(params.keys || '')
                .trim()
                .toLowerCase();
            if (!keys) return 'Error: keys required';
            const shortcuts = await getStoredSiteShortcuts();
            const remaining = shortcuts.filter((c) => c.keys !== keys);
            if (remaining.length === shortcuts.length) return `Error: no site shortcut with the keys "${keys}"`;
            await saveStoredSiteShortcuts(remaining);
            return `Site shortcut "${keys}" deleted.`;
        }
    }
}

/** A bare host, the shape the preview blacklist stores. */
function normalizeDomain(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return '';
    try {
        return new URL(RULE_URL_SCHEMES.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
    } catch (_) {
        return trimmed.replace(RULE_URL_SCHEMES, '').split('/')[0];
    }
}

/** Site shortcuts open a page, so what they hold is a full address. */
function sanitizeShortcutUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    return RULE_URL_SCHEMES.test(url) ? url : `https://${url}`;
}

// Snippets and site shortcuts live under the keys the hints page uses, and both it and
// the content scripts listen for these messages to redraw themselves.
const HINT_SNIPPETS_KEY = 'itg-user-snippets';
const HINT_COMMANDS_KEY = 'userHintCommands';

async function getStoredSnippets() {
    const data = await chrome.storage.sync.get(HINT_SNIPPETS_KEY);
    return data[HINT_SNIPPETS_KEY] || {};
}

async function saveStoredSnippets(snippets) {
    await chrome.storage.sync.set({ [HINT_SNIPPETS_KEY]: snippets });
    chrome.runtime.sendMessage({ action: 'snippetsUpdated' }).catch(() => {});
}

async function getStoredSiteShortcuts() {
    const data = await chrome.storage.sync.get(HINT_COMMANDS_KEY);
    return Array.isArray(data[HINT_COMMANDS_KEY]) ? data[HINT_COMMANDS_KEY] : [];
}

async function saveStoredSiteShortcuts(shortcuts) {
    await chrome.storage.sync.set({ [HINT_COMMANDS_KEY]: shortcuts });
    chrome.runtime.sendMessage({ action: 'hintCommandsUpdated' }).catch(() => {});
}

/**
 * Helper to find a tab group by name/title.
 * Handles fallback to groupInfoMap if name not found in displayed titles (e.g. compact mode).
 */
function findGroupIdByName(name, groups) {
    if (!name) return null;
    const q = name.toLowerCase();

    // 1. Try finding by displayed title
    let match = groups.find((g) => g.title && g.title.toLowerCase().includes(q));
    if (match) return match;

    // 2. Fallback: search in groupInfoMap (which keeps the full original title)
    if (typeof groupInfoMap !== 'undefined') {
        for (const [id, info] of groupInfoMap.entries()) {
            if (info.title && info.title.toLowerCase().includes(q)) {
                // Confirm the group still exists in the browser
                const existing = groups.find((g) => g.id === id);
                if (existing) return existing;
            }
        }
    }

    return null;
}

function handleGeminiAgentStep(message, sendResponse) {
    (async () => {
        try {
            const { systemPrompt, contents } = message;
            const result = await fetchGeminiResponseWithContext(systemPrompt, contents);
            sendResponse(result);
        } catch (error) {
            console.error('[Agent] handleGeminiAgentStep error:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}

function handleGeminiAgentToolCall(message, sendResponse) {
    (async () => {
        try {
            const result = await executeAgentTool(message.tool, message.params || {});
            sendResponse({ success: true, result });
        } catch (error) {
            console.error('[Agent] handleGeminiAgentToolCall error:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}
