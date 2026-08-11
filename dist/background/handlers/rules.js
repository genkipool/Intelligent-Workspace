/**
 * [AI INSTRUCTION]
 * RULES HANDLER — Centralized rules CRUD operations.
 *
 * ALL rule mutations MUST go through `mutateRulesAndSync()` to avoid
 * code duplication. This function handles:
 *   1. Loading rules from storage
 *   2. Calling the mutation callback
 *   3. Saving rules back to storage
 *   4. Updating the in-memory extensionSettings cache
 *   5. Broadcasting `rulesUpdated` to all UI contexts
 *   6. Calling `groupTabs()` to regroup tabs
 *
 * REUSE: When adding new rule mutation features, use `mutateRulesAndSync()`.
 * DO NOT duplicate the get→mutate→save→broadcast→regroup pattern.
 *
 * Dependencies: getSettingsStorage(), getRulesFromStorage(), groupTabs(),
 *               extensionSettings (global state from state.js)
 */

/**
 * Core utility for all rule mutations. Loads rules, applies a mutation
 * callback, persists changes, and triggers UI sync + tab regrouping.
 *
 * @param {Function} mutateFn - Receives the customRules array. Must return
 *   the (possibly modified) array. Can also return an object with
 *   `{ rules, result }` if extra data needs to be sent in the response.
 * @param {Function} sendResponse - Chrome message sendResponse callback.
 */
async function mutateRulesAndSync(mutateFn, sendResponse) {
    try {
        const customRules = await getRulesFromStorage();
        const outcome = await mutateFn(customRules);

        // Support both plain array return and {rules, result} object return
        const finalRules = Array.isArray(outcome) ? outcome : outcome.rules;
        const extraResult = Array.isArray(outcome) ? {} : outcome.result || {};

        const storage = await getSettingsStorage();
        await storage.set({ customRules: finalRules });

        // Update in-memory cache so other handlers see the change immediately
        if (typeof extensionSettings !== 'undefined') {
            extensionSettings.customRules = finalRules;
        }

        // Broadcast to all UI contexts and regroup tabs
        chrome.runtime.sendMessage({ action: 'rulesUpdated' });
        await groupTabs();

        sendResponse({ success: true, ...extraResult });
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

// --- Individual Rule Handlers (all delegate to mutateRulesAndSync) ---

/**
 * Creates a new rule from the omnibar with name, urls, color.
 */
function handleCreateRuleFromOmnibar(message, sendResponse) {
    mutateRulesAndSync((rules) => {
        const newRule = {
            name: message.name,
            color: 'blue',
            urls: message.urls,
            active: true,
        };
        rules.push(newRule);
        return rules;
    }, sendResponse);
}

/**
 * Deletes rules or individual URLs from rules (bulk delete from omnibar).
 * Items can be "ruleName" (deletes entire rule) or "ruleName::url" (deletes URL).
 */
function handleDeleteRulesFromOmnibar(message, sendResponse) {
    mutateRulesAndSync((rules) => {
        const itemsToDelete = message.items || [];
        let currentRules = rules;

        for (const item of itemsToDelete) {
            if (item.includes('::')) {
                const [ruleName, url] = item.split('::');
                const rule = currentRules.find((r) => r.name === ruleName);
                if (rule && rule.urls) {
                    rule.urls = rule.urls.filter((u) => u !== url);
                }
            } else {
                currentRules = currentRules.filter((r) => r.name !== item);
            }
        }

        return currentRules;
    }, sendResponse);
}

/**
 * Adds URLs to an existing rule (deduplicates automatically).
 */
function handleAddUrlsToRule(message, sendResponse) {
    mutateRulesAndSync((rules) => {
        const rule = rules.find((r) => r.name === message.ruleName);
        if (!rule) throw new Error('Rule not found');

        if (!rule.urls) rule.urls = [];
        const added = [];
        for (const u of message.urls) {
            if (!rule.urls.includes(u)) {
                rule.urls.push(u);
                added.push(u);
            }
        }
        return { rules, result: { addedCount: added.length } };
    }, sendResponse);
}

/**
 * Updates the color of one or more rules.
 */
function handleUpdateRuleColor(message, sendResponse) {
    mutateRulesAndSync((rules) => {
        const updates = message.rules || [{ ruleName: message.ruleName, color: message.color }];
        for (const { ruleName, color } of updates) {
            const rule = rules.find((r) => r.name === ruleName);
            if (!rule) throw new Error('One or more rules not found');
            rule.color = color;
        }
        return rules;
    }, sendResponse);
}

/**
 * Renames a rule.
 */
function handleUpdateRuleName(message, sendResponse) {
    mutateRulesAndSync((rules) => {
        const rule = rules.find((r) => r.name === message.ruleName);
        if (!rule) throw new Error('Rule not found');
        rule.name = message.newName;
        return rules;
    }, sendResponse);
}

/**
 * Replaces a URL within a rule with a new URL.
 */
function handleUpdateRuleDomain(message, sendResponse) {
    mutateRulesAndSync((rules) => {
        const rule = rules.find((r) => r.name === message.ruleName);
        if (!rule || !rule.urls) throw new Error('Rule not found');

        const idx = rule.urls.indexOf(message.oldUrl);
        if (idx === -1) throw new Error('URL not found');

        rule.urls[idx] = message.newUrl;
        return rules;
    }, sendResponse);
}

/**
 * Adds a URL to a rule and shows a notification (from context menu / shortcut).
 * NOTE: This uses addUrlToRuleAndNotify() which is defined in utils.js because
 * it has specialized notification logic and multi-rule URL movement.
 */
function handleAddCurrentUrlToExistingRule(message, sendResponse) {
    (async () => {
        try {
            const { url, ruleName } = message;
            if (url && ruleName) {
                await addUrlToRuleAndNotify(url, ruleName);
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Missing url or ruleName' });
            }
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
    })();
}

/**
 * Gets all rules from storage (read-only).
 */
function handleGetRules(sendResponse) {
    (async () => {
        try {
            const rules = await getRulesFromStorage();
            sendResponse({ success: true, rules });
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
    })();
}

/**
 * Handles creating a rule from a keyboard shortcut ('ar').
 */
async function handleCreateRuleFromShortcut(message, sender, sendResponse) {
    try {
        const windowId = sender?.tab?.windowId;
        const pageUrl = message.url || sender?.tab?.url;
        if (!windowId || !pageUrl) {
            sendResponse({
                success: false,
                error: 'Missing windowId or URL',
            });
            return;
        }
        openCreateRuleModalForUrl(pageUrl, windowId, false);
        sendResponse({
            success: true,
        });
    } catch (err) {
        console.error('Error handling createRuleFromShortcut:', err);
        sendResponse({
            success: false,
            error: err.message,
        });
    }
}

async function handleOpenAddToRuleFromShortcut(message, sender, sendResponse) {
    try {
        const windowId = sender?.tab?.windowId;
        const pageUrl = message.url || sender?.tab?.url;
        const baseTitle = message.title || sender?.tab?.title || '';
        if (!windowId || !pageUrl) {
            sendResponse({
                success: false,
                error: 'Missing windowId or URL',
            });
            return;
        }
        openAddToRuleModalForUrl(pageUrl, baseTitle, windowId);
        sendResponse({
            success: true,
        });
    } catch (err) {
        console.error('Error handling openAddToRuleFromShortcut:', err);
        sendResponse({
            success: false,
            error: err.message,
        });
    }
}

function handleRulesUpdated(sendResponse) {
    (async () => {
        logMessage('[onMessage] Rules have been updated. Triggering regroup and context menu update.');
        await groupTabs();
        await setupContextMenus();
        sendResponse({
            status: 'rules_and_groups_updated',
        });
    })();
}

function handleOpenCreateRuleFromOmnibar(message, sender, sendResponse) {
    const windowId = sender?.tab?.windowId;
    if (windowId && message.url) {
        openCreateRuleModalForUrl(message.url, windowId, false);
    }
    sendResponse({
        success: true,
    });
}

function handleOpenAddToRuleFromOmnibar(message, sender, sendResponse) {
    const windowId = sender?.tab?.windowId;
    if (windowId && message.url) {
        openAddToRuleModalForUrl(message.url, message.title || '', windowId);
    }
    sendResponse({
        success: true,
    });
}
