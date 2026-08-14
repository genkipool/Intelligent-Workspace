/**
 * agent-ui.js
 * Externalized UI logic for the AI Assistant (Agent Mode).
 */

let ctx = {};
let isAgentQueryCancelled = false;

/**
 * Cancels any ongoing agent query.
 */
export function cancelAgentQuery() {
    isAgentQueryCancelled = true;
}

/**
 * Initializes the Agent UI module with the necessary context from listGroup.js.
 * @param {Object} context - Object containing references to state and functions from listGroup.js.
 */
export function initAgentUI(context) {
    ctx = context;
}

/**
 * Extracts the first complete JSON object or array from a string.
 */
function extractJSON(text) {
    if (!text) return null;
    let s = text.trim();
    s = s
        .replace(/^```(?:json)?\s*/im, '')
        .replace(/\s*```\s*$/im, '')
        .trim();

    const startBrace = s.indexOf('{');
    const startBracket = s.indexOf('[');
    let start = -1;
    if (startBrace === -1 && startBracket === -1) return null;
    if (startBrace === -1) start = startBracket;
    else if (startBracket === -1) start = startBrace;
    else start = Math.min(startBrace, startBracket);

    const openChar = s[start];
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (c === '\\' && inString) {
            escape = true;
            continue;
        }
        if (c === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (c === openChar) depth++;
        else if (c === closeChar) {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(s.substring(start, i + 1));
                } catch (_) {
                    return null;
                }
            }
        }
    }
    return null;
}

export const AGENT_SYSTEM_PROMPT = `You are an intelligent browser tab management agent for a Chrome extension called "Intelligent Workspace".
Your job is to help users manage tabs, groups, bookmarks, history, rules, and themes by using tools one at a time.

AVAILABLE TOOLS (call one tool at a time):
TAB TOOLS:
- getOpenTabs -- lists all open tabs (returns [{id,title,url,active,groupId,pinned}])
- getActiveTab -- returns {id,title,url} of the currently active tab
- getActiveTabContent -- extracts text content from the active tab (for summarization, analysis)
- findAndSwitchToTab -- {query:string} -- finds existing tab by title/URL and switches to it (use BEFORE createNewTab to avoid duplicates)
- switchToTab -- {tabId:number}
- createNewTab -- {url?:string}
- closeTab -- {tabId:number}
- closeTabs -- {tabIds:number[]}
- duplicateTab -- duplicates the active tab
- pinTab -- {tabId:number}
- unpinTab -- {tabId:number}
- muteAllTabs -- mutes all tabs that are currently audible
- unmuteAllTabs -- unmutes all tabs that are currently muted
- closeTabsWithSound -- closes ALL tabs that are currently playing audio (use this when the user wants to "stop the noise" or "close loud tabs")

GROUP TOOLS:
- getTabGroups -- lists all tab groups (returns [{id,title,color,collapsed}])
- groupTabs -- {tabIds:number[], groupName:string} -- creates a new group
- deleteTabGroup -- {groupId:number} -- deletes group AND closes its tabs
- closeTabsInGroup -- {groupName?:string, groupId?:number} -- closes tabs in a group without deleting group structure
- collapseTabGroup -- {groupName?:string, groupId?:number} -- collapses a specific group
- expandTabGroup -- {groupName?:string, groupId?:number} -- expands a specific group
- collapseAllGroups -- collapses all tab groups
- expandAllGroups -- expands all tab groups
- setGroupColor -- {groupName?:string, groupId?:number, color:string} -- colors: blue,red,yellow,green,pink,purple,cyan,orange,grey
- renameTabGroup -- {groupName?:string, groupId?:number, newName:string}
- moveTabToGroup -- {tabId:number, groupName?:string, groupId?:number}
- regroupAllTabs -- re-applies all grouping rules
- removeDuplicateTabs -- removes duplicate open tabs

RULE TOOLS (CRITICAL: ALL urls MUST be full addresses with their scheme, like 'https://wikipedia.org' or 'https://sega.com', NEVER plain words or asterisk wildcards):
- getRules -- lists all configured grouping rules
- createRule -- {name:string, urls:string[], color?:string} -- (urls must be full addresses e.g. ['https://sega.com', 'https://nintendo.com'])
- updateRule -- {name:string, newName?:string, color?:string, urls?:string[], active?:boolean} -- (urls must be full addresses)
- deleteRule -- {name:string}
- addUrlToRule -- {ruleName:string, url:string} -- (url must be a full address)
- removeUrlFromRule -- {ruleName:string, url:string}

THEME TOOLS:
- getActiveTheme -- current UI theme info
- getSavedThemes -- saved themes list
- applyTheme -- {themeName:string} -- applies a saved theme by name
- applyRandomTheme -- generates and applies a completely random theme
- createAndApplyTheme -- {name:string, colors?:{actionColor,textColor,textOnColor,bgColor,bgPanelColor,borderColor,interactiveColor,errorColor,headerColor}} -- creates a new theme OR applies an existing one. Use ONLY if the theme doesn't exist yet OR as the LAST step to apply changes.
- updateTheme -- {name:string, colors:object} -- updates colors of an existing theme. Call this to show "Editing theme" in the UI.
- saveTheme -- {name:string} -- saves the currently active theme to the Themes panel with a given name

IMPORTANT SUB-STEPS FOR THEME EDITING:
When a user asks to modify/edit an existing theme, follow this EXACT sequence to ensure the UI shows all steps:
1. Call getSavedThemes to confirm it exists.
2. Call updateTheme with the colors to change (this adds the "Editing theme" step).
3. Call createAndApplyTheme with the SAME name to finalize and apply it (this adds the "Creating/updating theme" step).
This sequence guarantees the user sees the full update process.

BOOKMARK TOOLS:
- getBookmarks -- retrieves bookmark tree
- searchBookmarks -- {query:string}
- createBookmark -- {url:string, title:string, parentId?:string}

HISTORY TOOLS:
- getHistory -- {query?:string, maxResults?:number}
- getRecentlyClosed -- {maxResults?:number}

SNIPPET TOOLS (auto-completed text, configured in the hints page):
- getSnippets -- lists the configured snippets
- createSnippet -- {trigger:string, expansion:string, variables?:[{id,word,defaultValue}]}
- updateSnippet -- {trigger:string, expansion:string, variables?:array} -- the trigger must already exist
- deleteSnippet -- {trigger:string}

SITE SHORTCUT TOOLS (key combinations that open a site):
- getSiteShortcuts -- lists the configured site shortcuts
- createSiteShortcut -- {keys:string, url:string, description?:string} -- e.g. {keys:'gh', url:'https://github.com'}
- updateSiteShortcut -- {keys:string, url?:string, description?:string}
- deleteSiteShortcut -- {keys:string}

OTHER TOOLS:
- openUrl -- {url:string}
- searchGoogle -- {query:string}
- setLinkPreview -- {enabled:boolean} -- enables or disables floating link previews on webpages
- getLinkPreviewSettings -- whether link previews are on, and the domains excluded from them
- addLinkPreviewBlacklistDomain -- {domain:string} -- stops previewing links on that domain
- removeLinkPreviewBlacklistDomain -- {domain:string} -- previews links on that domain again

STRICT RESPONSE FORMAT -- respond ONLY with a single raw JSON object, no markdown, no explanation outside the JSON:

When you need to call a tool:
{"type":"tool_call","tool":"toolName","params":{},"reasoning":"why you need this tool"}

When you have enough information to answer the user:
{"type":"final","response":"Your answer to the user","actions_taken":["what was done"]}

IMPORTANT RULES:
- ONE tool call per response -- never combine multiple tools in one response
- For tab navigation: ALWAYS use findAndSwitchToTab FIRST before creating a new tab -- only create if tab doesn't exist
- For grouping rules: you MUST use full addresses with their scheme (e.g. 'https://sega.com', 'https://nintendo.com'). NEVER use plain text names, wildcards, or asterisk-wrapped words (like '*sega*'). If the user provides brand names, infer their standard domain names (.com, .org, etc.) and write them as https:// addresses.
- For summarizing/analyzing a page: use getActiveTabContent to extract the page text, then analyze it in your final response
- For collapsing/expanding: use the group tools, not DOM manipulation
- Always call a read/query tool first to get IDs before performing actions
- ALWAYS respond in the SAME LANGUAGE the user used
- Your final response must summarize what was done and any relevant results`;

export function setAgentButtonRunning(running) {
    const { geminiAgentModeBtn } = ctx;
    if (!geminiAgentModeBtn) return;
    if (running) {
        geminiAgentModeBtn.setAttribute('aria-busy', 'true');
        geminiAgentModeBtn.style.opacity = '0.45';
        geminiAgentModeBtn.style.pointerEvents = 'none';
        geminiAgentModeBtn.title = chrome.i18n.getMessage('agentRunning') || 'Agent is running…';
    } else {
        geminiAgentModeBtn.removeAttribute('aria-busy');
        geminiAgentModeBtn.style.opacity = '';
        geminiAgentModeBtn.style.pointerEvents = '';
        geminiAgentModeBtn.title = chrome.i18n.getMessage('agentModeTooltip') || 'Toggle Agent Mode';
    }
    setSendButtonBusy(running);
}

export function setSendButtonBusy(busy) {
    const { geminiSendBtn } = ctx;
    if (!geminiSendBtn) return;
    geminiSendBtn.disabled = busy;
    geminiSendBtn.style.opacity = busy ? '0.4' : '';
}

export function getToolLabel(tool, params) {
    const i18n = chrome.i18n.getMessage.bind(chrome.i18n);
    try {
        switch (tool) {
            case 'getOpenTabs':
                return i18n('toolGetOpenTabs');
            case 'getActiveTab':
                return i18n('toolGetActiveTab');
            case 'getActiveTabContent':
                return i18n('toolGetActiveTabContent');
            case 'findAndSwitchToTab':
                return i18n('toolFindAndSwitchToTab', [String(params.query || '')]);
            case 'switchToTab':
                return i18n('toolSwitchToTab', [String(params.tabId || '')]);
            case 'createNewTab':
                return params.url
                    ? i18n('toolCreateNewTabUrl', [
                          (() => {
                              try {
                                  return new URL(params.url).hostname;
                              } catch (_) {
                                  return params.url;
                              }
                          })(),
                      ])
                    : i18n('toolCreateNewTab');
            case 'closeTab':
                return i18n('toolCloseTab', [String(params.tabId || '')]);
            case 'closeTabs':
                return i18n('toolCloseTabs', [String((params.tabIds || []).length)]);
            case 'duplicateTab':
                return i18n('toolDuplicateTab');
            case 'pinTab':
                return i18n('toolPinTab', [String(params.tabId || '')]);
            case 'unpinTab':
                return i18n('toolUnpinTab', [String(params.tabId || '')]);
            case 'muteAllTabs':
                return i18n('toolMuteAllTabs');
            case 'unmuteAllTabs':
                return i18n('toolUnmuteAllTabs');
            case 'closeTabsWithSound':
                return i18n('toolCloseTabsWithSound') || 'Closing tabs with sound…';
            case 'getTabGroups':
                return i18n('toolGetTabGroups');
            case 'groupTabs':
                return i18n('toolGroupTabs', [String(params.groupName || '')]);
            case 'deleteTabGroup':
                return i18n('toolDeleteTabGroup', [String(params.groupId || '')]);
            case 'closeTabsInGroup':
                return i18n('toolCloseTabsInGroup', [String(params.groupName || params.groupId || '')]);
            case 'collapseTabGroup':
                return i18n('toolCollapseTabGroup', [String(params.groupName || params.groupId || '')]);
            case 'expandTabGroup':
                return i18n('toolExpandTabGroup', [String(params.groupName || params.groupId || '')]);
            case 'collapseAllGroups':
                return i18n('toolCollapseAllGroups');
            case 'expandAllGroups':
                return i18n('toolExpandAllGroups');
            case 'setGroupColor':
                return i18n('toolSetGroupColor', [
                    String(params.groupName || params.groupId || ''),
                    String(params.color || ''),
                ]);
            case 'renameTabGroup':
                return i18n('toolRenameTabGroup', [
                    String(params.groupName || params.groupId || ''),
                    String(params.newName || ''),
                ]);
            case 'moveTabToGroup':
                return i18n('toolMoveTabToGroup', [
                    String(params.tabId || ''),
                    String(params.groupName || params.groupId || ''),
                ]);
            case 'regroupAllTabs':
                return i18n('toolRegroupAllTabs');
            case 'removeDuplicateTabs':
                return i18n('toolRemoveDuplicateTabs');
            case 'getRules':
                return i18n('toolGetRules');
            case 'createRule':
                return i18n('toolCreateRule', [String(params.name || '')]);
            case 'updateRule':
                return i18n('toolUpdateRule', [String(params.name || '')]);
            case 'deleteRule':
                return i18n('toolDeleteRule', [String(params.name || '')]);
            case 'addUrlToRule':
                return i18n('toolAddUrlToRule', [String(params.url || ''), String(params.ruleName || '')]);
            case 'removeUrlFromRule':
                return i18n('toolRemoveUrlFromRule', [String(params.url || ''), String(params.ruleName || '')]);
            case 'getActiveTheme':
                return i18n('toolGetActiveTheme');
            case 'getSavedThemes':
                return i18n('toolGetSavedThemes');
            case 'applyTheme':
                return i18n('toolApplyTheme', [String(params.themeName || '')]);
            case 'applyRandomTheme':
                return i18n('toolApplyRandomTheme');
            case 'createAndApplyTheme':
                return i18n('toolCreateAndApplyTheme', [String(params.name || '')]);
            case 'createTheme':
                return i18n('toolCreateTheme', [String(params.name || '')]);
            case 'updateTheme':
                return i18n('toolUpdateTheme', [String(params.name || '')]);
            case 'saveTheme':
                return i18n('toolSaveTheme', [String(params.name || '')]);
            case 'getBookmarks':
                return i18n('toolGetBookmarks');
            case 'searchBookmarks':
                return i18n('toolSearchBookmarks', [String(params.query || '')]);
            case 'createBookmark':
                return i18n('toolCreateBookmark', [String(params.title || params.url || '')]);
            case 'getHistory':
                return params.query ? i18n('toolGetHistoryQuery', [String(params.query)]) : i18n('toolGetHistory');
            case 'getRecentlyClosed':
                return i18n('toolGetRecentlyClosed');
            case 'openUrl':
                return i18n('toolOpenUrl', [String(params.url || '')]);
            case 'searchGoogle':
                return i18n('toolSearchGoogle', [String(params.query || '')]);
            case 'setLinkPreview':
                return params.enabled !== false
                    ? i18n('enableLinkPreview') || 'Enable link previews'
                    : i18n('disableLinkPreview') || 'Disable link previews';
            case 'getLinkPreviewSettings':
                return i18n('toolGetLinkPreviewSettings') || 'Read the link preview settings';
            case 'addLinkPreviewBlacklistDomain':
                return i18n('toolBlacklistPreviewDomain', [String(params.domain || '')]);
            case 'removeLinkPreviewBlacklistDomain':
                return i18n('toolUnblacklistPreviewDomain', [String(params.domain || '')]);
            case 'getSnippets':
                return i18n('toolGetSnippets') || 'List the snippets';
            case 'createSnippet':
                return i18n('toolCreateSnippet', [String(params.trigger || '')]);
            case 'updateSnippet':
                return i18n('toolUpdateSnippet', [String(params.trigger || '')]);
            case 'deleteSnippet':
                return i18n('toolDeleteSnippet', [String(params.trigger || '')]);
            case 'getSiteShortcuts':
                return i18n('toolGetSiteShortcuts') || 'List the site shortcuts';
            case 'createSiteShortcut':
                return i18n('toolCreateSiteShortcut', [String(params.keys || '')]);
            case 'updateSiteShortcut':
                return i18n('toolUpdateSiteShortcut', [String(params.keys || '')]);
            case 'deleteSiteShortcut':
                return i18n('toolDeleteSiteShortcut', [String(params.keys || '')]);
            default:
                return i18n('toolUnknown', [String(tool)]) || `⚙ ${tool}`;
        }
    } catch (_) {
        return `⚙ ${tool}`;
    }
}

export async function handleAgentQuery(userQuery, attachments = []) {
    if (!userQuery) return;

    const {
        getConversationHistory,
        currentCombinedIndex,
        combinedConversations,
        persistentConversations,
        sessionConversations,
        geminiConversationView,
        PERSISTENT_GEMINI_KEY,
        GEMINI_SESSION_CONVERSATIONS_KEY,
        switchToGeminiView,
        saveGeminiEntryToDb,
        addGeminiEntryToDOM,
        applyTranslations,
        updateCombinedConversationDisplay,
    } = ctx;
    // Always read from the getter so we never operate on a stale array reference
    // (listGroup.js may reassign its local `conversationHistory` via .filter()).
    const conversationHistory = getConversationHistory();

    // --- 1. CREATE ENTRY IN conversationHistory ---
    const isContinuingPersistent =
        currentCombinedIndex > -1 &&
        combinedConversations[currentCombinedIndex] &&
        !combinedConversations[currentCombinedIndex].isTemporary;
    const persistentTitle = isContinuingPersistent ? combinedConversations[currentCombinedIndex].title : '';

    const newEntry = {
        id: `agent_${Date.now()}`,
        query: userQuery,
        data: null,
        isLoading: true,
        isAgent: true,
        isPersistent: isContinuingPersistent,
        persistentTitle,
    };
    conversationHistory.push(newEntry);

    // --- 2. MANAGE SESSION CONVERSATION ---
    if (isContinuingPersistent) {
        const persistentConv = persistentConversations.find((c) => c.title === persistentTitle);
        if (persistentConv) persistentConv.entries.push(newEntry);
        const { [PERSISTENT_GEMINI_KEY]: currentIds = [] } = await chrome.storage.local.get(PERSISTENT_GEMINI_KEY);
        const persistentSet = new Set(currentIds);
        persistentSet.add(newEntry.id);
        await chrome.storage.local.set({ [PERSISTENT_GEMINI_KEY]: Array.from(persistentSet) });
    } else {
        const isContinuingTemporary =
            currentCombinedIndex > -1 && combinedConversations[currentCombinedIndex]?.isTemporary;
        if (isContinuingTemporary) {
            const activeSessionConv = sessionConversations.find(
                (c) => c.timestamp === combinedConversations[currentCombinedIndex].timestamp,
            );
            if (activeSessionConv) activeSessionConv.entryIds.push(newEntry.id);
        } else {
            const title = userQuery.substring(0, 40) + (userQuery.length > 40 ? '...' : '');
            sessionConversations.push({ title, entryIds: [newEntry.id], timestamp: Date.now(), isTemporary: true });
        }
        await chrome.storage.session.set({ [GEMINI_SESSION_CONVERSATIONS_KEY]: sessionConversations });
    }

    // --- 3. RENDER INITIAL LOADING STATE ---
    await switchToGeminiView();
    chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });

    // --- 4. ENSURE LOADING CARD IS VISIBLE & SHOW AGENT-STEPS ---
    // We explicitly call addGeminiEntryToDOM because listGroup.js may have reassigned
    // its local conversationHistory via .filter(), causing ctx.conversationHistory to
    // diverge from what switchToGeminiView renders. This guarantees the card appears.
    addGeminiEntryToDOM(newEntry);
    geminiConversationView.scrollTop = geminiConversationView.scrollHeight;

    const entryContainer = geminiConversationView.querySelector(`.gemini-entry[data-entry-id="${newEntry.id}"]`);
    const agentStepsEl = entryContainer ? entryContainer.querySelector('.agent-steps') : null;
    if (agentStepsEl) agentStepsEl.classList.remove('hidden');

    newEntry.agentSteps = [];
    setAgentButtonRunning(true);
    isAgentQueryCancelled = false;

    // --- 5. RUN AGENTIC LOOP ---
    const contents = [];
    for (const entry of conversationHistory) {
        if (entry.id === newEntry.id) {
            if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
                contents.push({ role: 'user', parts: [{ text: newEntry.query }] });
            } else if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
                contents[contents.length - 1] = { role: 'user', parts: [{ text: newEntry.query }] };
            }
            break;
        }
        if (
            entry.query &&
            typeof entry.query === 'string' &&
            entry.data &&
            entry.data.answer &&
            typeof entry.data.answer === 'string'
        ) {
            if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
                contents.push({ role: 'user', parts: [{ text: entry.query }] });
                contents.push({ role: 'model', parts: [{ text: entry.data.answer }] });
            }
        }
    }

    if (attachments && attachments.length > 0) {
        const lastIndex = contents.length - 1;
        if (lastIndex >= 0 && contents[lastIndex].role === 'user') {
            const newParts = [...contents[lastIndex].parts];
            for (const att of attachments) {
                const base64Data = att.data.split(',')[1];
                newParts.push({
                    inline_data: {
                        mime_type: att.mimeType,
                        data: base64Data,
                    },
                });
            }
            contents[lastIndex] = { role: 'user', parts: newParts };
        }
    }
    const MAX_STEPS = 8;
    let finalResponse = null;

    const addStep = (text, status = 'running') => {
        const stepData = { text, status };
        newEntry.agentSteps.push(stepData);

        if (!agentStepsEl) return { stepData };
        const div = document.createElement('div');
        div.className = 'agent-step-indicator';
        if (status === 'done') div.classList.add('agent-step-done');
        if (status === 'error') div.classList.add('agent-step-error');
        const icon = document.createElement('span');
        icon.className = 'agent-step-icon';
        icon.textContent = status === 'done' ? '✓' : status === 'error' ? '✗' : '⚙';
        const label = document.createElement('span');
        label.textContent = text;
        div.appendChild(icon);
        div.appendChild(label);
        agentStepsEl.appendChild(div);
        geminiConversationView.scrollTop = geminiConversationView.scrollHeight;
        return { stepData, div };
    };

    const showThinking = () => {
        if (!agentStepsEl || agentStepsEl.querySelector('.agent-thinking')) return;
        const div = document.createElement('div');
        div.className = 'agent-step-indicator agent-thinking';
        div.innerHTML = `<span class="agent-thinking-dots"><span class="agent-thinking-dot"></span><span class="agent-thinking-dot"></span><span class="agent-thinking-dot"></span></span><span>${chrome.i18n.getMessage('agentThinking') || 'Thinking…'}</span>`;
        agentStepsEl.appendChild(div);
        geminiConversationView.scrollTop = geminiConversationView.scrollHeight;
    };
    const hideThinking = () => agentStepsEl?.querySelector('.agent-thinking')?.remove();

    showThinking();

    let finalUsageMetadata = null;
    let finalGroundingMetadata = null;
    let finalModelVersion = null;

    try {
        for (let step = 0; step < MAX_STEPS; step++) {
            if (isAgentQueryCancelled) {
                addStep('Query cancelled by user', 'error');
                finalResponse = 'Query cancelled.';
                break;
            }

            const geminiResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'geminiAgentStep',
                        systemPrompt: AGENT_SYSTEM_PROMPT,
                        contents,
                    },
                    (response) =>
                        resolve(
                            chrome.runtime.lastError
                                ? { success: false, error: chrome.runtime.lastError.message }
                                : response,
                        ),
                );
            });

            hideThinking();

            if (isAgentQueryCancelled) {
                finalResponse = 'Query cancelled.';
                break;
            }

            if (!geminiResult?.success) {
                const errMsg = geminiResult?.error || 'Could not connect to Gemini API';
                addStep(`Error: ${errMsg}`, 'error');
                finalResponse = `**Error:** ${errMsg}`;
                break;
            }

            finalUsageMetadata = geminiResult.usageMetadata;
            finalGroundingMetadata = geminiResult.groundingMetadata;
            finalModelVersion = geminiResult.modelVersion;

            contents.push({ role: 'model', parts: [{ text: geminiResult.answer }] });
            const parsed = extractJSON(geminiResult.answer);

            if (!parsed || parsed.type === 'final') {
                finalResponse = parsed?.response || geminiResult.answer;
                break;
            }

            if (parsed.type === 'tool_call') {
                const toolName = parsed.tool;
                const toolParams = parsed.params || {};
                const { stepData, div: stepEl } = addStep(getToolLabel(toolName, toolParams), 'running');

                if (isAgentQueryCancelled) {
                    finalResponse = 'Query cancelled.';
                    break;
                }

                const toolResult = await new Promise((resolve) => {
                    chrome.runtime.sendMessage(
                        {
                            action: 'geminiAgentToolCall',
                            tool: toolName,
                            params: toolParams,
                        },
                        (response) =>
                            resolve(
                                chrome.runtime.lastError
                                    ? { success: false, error: chrome.runtime.lastError.message }
                                    : response,
                            ),
                    );
                });

                const ok = toolResult?.success === true;
                const resultStr = ok
                    ? typeof toolResult.result === 'string'
                        ? toolResult.result
                        : JSON.stringify(toolResult.result)
                    : `Error: ${toolResult?.error || 'Tool failed'}`;

                stepData.status = ok ? 'done' : 'error';

                if (stepEl) {
                    if (ok) {
                        stepEl.classList.add('agent-step-done');
                        stepEl.querySelector('.agent-step-icon').textContent = '✓';
                    } else {
                        stepEl.classList.add('agent-step-error');
                        stepEl.querySelector('.agent-step-icon').textContent = '✗';
                    }
                }

                const truncated = resultStr.length > 4000 ? resultStr.substring(0, 4000) + '…[truncated]' : resultStr;
                contents.push({
                    role: 'user',
                    parts: [
                        {
                            text: `Tool result for "${toolName}": ${truncated}\n\nNow continue: either call another tool or provide the final answer.`,
                        },
                    ],
                });

                showThinking();
                await new Promise((res) => setTimeout(res, 1000));
                continue;
            }

            finalResponse = geminiResult.answer;
            break;
        }

        if (!finalResponse) finalResponse = 'Maximum steps reached. Please try rephrasing your request.';
    } catch (err) {
        finalResponse = `Unexpected error: ${err.message}`;
        addStep(`Error: ${err.message}`, 'error');
    } finally {
        hideThinking();
        setAgentButtonRunning(false);
    }

    if (isAgentQueryCancelled) {
        // Query was cancelled: silently clean up without re-adding the card to the DOM.
        // The card has already been removed by the user clicking the X button.
        // Use safe removal to avoid splice(-1,1) if entry was already removed.
        const cancelledIdx = conversationHistory.indexOf(newEntry);
        if (cancelledIdx > -1) conversationHistory.splice(cancelledIdx, 1);
        setAgentButtonRunning(false);
        return;
    }

    // --- 6. RENDER FINAL RESPONSE ---
    newEntry.isLoading = false;
    newEntry.data = {
        success: true,
        answer: finalResponse,
        usageMetadata: finalUsageMetadata,
        groundingMetadata: finalGroundingMetadata,
        modelVersion: finalModelVersion,
    };

    await saveGeminiEntryToDb(newEntry);
    addGeminiEntryToDOM(newEntry);
    applyTranslations(ctx.geminiConversationView);
    geminiConversationView.scrollTop = geminiConversationView.scrollHeight;

    await updateCombinedConversationDisplay();
    chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });
}
