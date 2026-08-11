importScripts('../background/gemini-api.js');
importScripts('../agent-backend.js');
importScripts('../background/state.js');
importScripts('../background/stateManager.js');
importScripts('../services/storage.js');
importScripts('../background/db.js');
importScripts('../background/utils.js');
importScripts('../background/handlers/bookmarks.js');
importScripts('../background/handlers/history.js');
importScripts('../background/handlers/groups.js');
importScripts('../background/handlers/tabs.js');
importScripts('../background/handlers/backups.js');
importScripts('../background/handlers/rules.js');
importScripts('../background/handlers/search.js');
importScripts('../background/handlers/downloads.js');
importScripts('../background/handlers/pip.js');
importScripts('../background/handlers/ui.js');
importScripts('../background/handlers/screenshots.js');
importScripts('../background/handlers/dnr.js');
importScripts('../background/handlers/pomodoro-handlers.js');
importScripts('../background/handlers/omnibar-data.js');
importScripts('../background/group-analyzer.js');
importScripts('../background/groupManager.js');
importScripts('../background/messaging.js');
importScripts('../background/events.js');
importScripts('../background/pomodoro.js');

(async () => {
    logMessage('[Service Worker Startup] Initializing extension...');

    // Force reset side panel path in case Chrome cached the old legacy path
    if (chrome.sidePanel && chrome.sidePanel.setOptions) {
        chrome.sidePanel
            .setOptions({
                path: 'src/ui/pages/rules/rules.html',
                enabled: true,
            })
            .catch((e) => console.warn('Could not set side panel path:', e));
    }
    await initializeExtensionStates();

    // Inject content scripts if it's the first start of this session (e.g., when activating the extension)
    const sessionData = await chrome.storage.session.get('contentScriptsInjected');
    if (!sessionData.contentScriptsInjected) {
        logMessage('[Service Worker Startup] First run this session. Injecting content scripts.');
        await injectContentScriptsInAllTabs();
        await chrome.storage.session.set({ contentScriptsInjected: true });
    }

    logMessage('[Service Worker Startup] Initialization complete.');
})();

// --- Omnibox AI-Powered Tab Finder ---

chrome.omnibox.onInputStarted.addListener(() => {
    const suggestion =
        chrome.i18n.getMessage('omniboxDefaultSuggestion') ||
        'Pregunta a la IA para encontrar cualquier pestaña abierta (ej: ¿Dónde estaba el Excel?)';
    chrome.omnibox.setDefaultSuggestion({ description: suggestion });
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
    logMessage('[Omnibox] Input entered:', text);
    if (!text || !text.trim()) return;

    try {
        // 1. Get all open tabs in the browser
        const tabs = await chrome.tabs.query({});
        if (tabs.length === 0) return;

        let matchedTabId = null;
        let matchedTabTitle = '';

        // 2. Optimized Local Search (Keyword & Substring Matching)
        const normalizedText = text.toLowerCase().trim();
        const queryWords = normalizedText
            .replace(/[¿?¡!]/g, '')
            .split(/\s+/)
            .filter(
                (word) =>
                    word.length > 2 &&
                    ![
                        'donde',
                        'estaba',
                        'que',
                        'con',
                        'del',
                        'los',
                        'las',
                        'para',
                        'una',
                        'uno',
                        'por',
                        'sobre',
                        'abril',
                        'abrir',
                        'abierto',
                        'abrio',
                        'esta',
                        'este',
                    ].includes(word),
            );

        let localMatches = [];

        for (const tab of tabs) {
            const titleLower = (tab.title || '').toLowerCase();
            const urlLower = (tab.url || '').toLowerCase();
            let score = 0;

            // Rule A: Exact full substring match of normalized query in title/url
            if (normalizedText.length > 2) {
                if (titleLower.includes(normalizedText)) score += 30;
                else if (urlLower.includes(normalizedText)) score += 15;
            }

            // Rule B: Keyword-based matching
            let matchedCount = 0;
            for (const word of queryWords) {
                if (titleLower.includes(word)) {
                    score += 10;
                    matchedCount++;
                } else if (urlLower.includes(word)) {
                    score += 3;
                    matchedCount++;
                }
            }

            // Rule C: Bonus for matching all keywords
            if (queryWords.length > 0 && matchedCount === queryWords.length) {
                score += 15;
            }

            if (score > 0) {
                localMatches.push({ tab, score });
            }
        }

        // Sort local matches by score descending
        localMatches.sort((a, b) => b.score - a.score);

        // Analyze confidence to determine if we can switch INSTANTLY without Gemini
        const bestLocalMatch = localMatches[0];
        const secondLocalMatch = localMatches[1];

        const hasHighConfidence =
            bestLocalMatch &&
            // Scenario 1: Perfect score or matches all search terms uniquely
            (bestLocalMatch.score >= 35 ||
                // Scenario 2: Clear difference between top match and second top match
                (!secondLocalMatch && bestLocalMatch.score >= 10) ||
                (secondLocalMatch && bestLocalMatch.score - secondLocalMatch.score >= 15));

        if (hasHighConfidence) {
            matchedTabId = bestLocalMatch.tab.id;
            logMessage(
                `[Omnibox] High-confidence local match found instantly! Title: "${bestLocalMatch.tab.title}" (Score: ${bestLocalMatch.score})`,
            );
        } else {
            // 3. Fallback to Gemini AI resolution if local match is ambiguous or missing
            const storageData = await chrome.storage.local.get(['geminiApiKey', 'geminiApiKeysList']);
            const activeKey = storageData.geminiApiKey;
            const keysList = storageData.geminiApiKeysList || [];
            const hasKey = activeKey || keysList.some((k) => k.key);

            if (hasKey && typeof fetchGeminiResponseWithContext === 'function') {
                logMessage('[Omnibox] Ambiguous query. Attempting semantic Gemini-based tab search...');
                const simplifiedTabs = tabs.map((t) => ({
                    id: t.id,
                    title: t.title || '',
                    url: t.url || '',
                }));

                const systemPrompt = `You are a browser tab finder. The user is looking for an open tab and asked: "${text}". Below is the list of currently open tabs (with id, title, and url). Analyze which tab is the most relevant match for their query. Respond ONLY with a valid JSON object matching this schema: {"tabId": number_or_null, "explanation": "brief_reason"}. If no tab matches the query, set tabId to null.`;

                const contents = [
                    {
                        role: 'user',
                        parts: [{ text: `User query: "${text}"\n\nOpen tabs:\n${JSON.stringify(simplifiedTabs)}` }],
                    },
                ];

                const aiResponse = await fetchGeminiResponseWithContext(systemPrompt, contents);
                if (aiResponse && aiResponse.success && aiResponse.answer) {
                    try {
                        let cleanJson = aiResponse.answer.trim();
                        if (cleanJson.startsWith('```')) {
                            cleanJson = cleanJson
                                .replace(/^```json\s*/i, '')
                                .replace(/```\s*$/g, '')
                                .trim();
                        }
                        const parsed = JSON.parse(cleanJson);
                        if (parsed && parsed.tabId !== undefined && parsed.tabId !== null) {
                            matchedTabId = Number(parsed.tabId);
                            logMessage('[Omnibox] Gemini resolved tabId:', matchedTabId, parsed.explanation);
                        }
                    } catch (jsonErr) {
                        console.error('[Omnibox] Failed to parse Gemini JSON:', jsonErr, aiResponse.answer);
                    }
                }
            }

            // If Gemini did not return a match, use our best local guess as a final fallback
            if (!matchedTabId && bestLocalMatch) {
                matchedTabId = bestLocalMatch.tab.id;
                logMessage(
                    `[Omnibox] No Gemini match, falling back to best local guess: "${bestLocalMatch.tab.title}" (Score: ${bestLocalMatch.score})`,
                );
            }
        }

        // 4. Focus target tab or show notification if no match found
        if (matchedTabId) {
            const targetTab = tabs.find((t) => t.id === matchedTabId);
            if (targetTab) {
                matchedTabTitle = targetTab.title;
                // Switch to the target tab
                await chrome.tabs.update(targetTab.id, { active: true });
                if (targetTab.windowId) {
                    await chrome.windows.update(targetTab.windowId, { focused: true });
                }

                // Show premium success notification
                const titleMsg = chrome.i18n.getMessage('omniboxTabFoundTitle') || '¡Pestaña Encontrada!';
                const messageMsg =
                    chrome.i18n.getMessage('omniboxTabFoundMessage', [matchedTabTitle]) ||
                    `Te hemos llevado directamente a: ${matchedTabTitle}`;

                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '/assets/icons/icon128.png',
                    title: titleMsg,
                    message: messageMsg,
                });
                return;
            }
        }

        // If we reach here, no tab was matched
        const titleErr = chrome.i18n.getMessage('omniboxTabNotFoundTitle') || 'No se Encontró la Pestaña';
        const messageErr =
            chrome.i18n.getMessage('omniboxTabNotFoundMessage', [text]) ||
            `No pudimos encontrar ninguna pestaña abierta para: ${text}`;

        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/assets/icons/icon128.png',
            title: titleErr,
            message: messageErr,
        });
    } catch (error) {
        console.error('[Omnibox] Error processing input:', error);
    }
});
