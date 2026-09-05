/**
 * The worker broadcasts a lot of "if anyone is listening" notices — rulesUpdated,
 * themeChanged, bookmarksChanged, pageModeChanged and friends — from around fifty
 * places, none of which care about the answer. When no page of the extension is
 * open there is nobody to receive them, the promise rejects, and since nothing
 * awaits it the console fills with "Could not establish connection. Receiving end
 * does not exist.". It is harmless, but it buries the errors that do matter.
 *
 * Only that specific rejection is swallowed, and only for calls made in the
 * promise form; anything else still propagates.
 */
((noReceiver) => {
    for (const [api, method] of [
        [chrome.runtime, 'sendMessage'],
        [chrome.tabs, 'sendMessage'],
    ]) {
        if (!api || typeof api[method] !== 'function') continue;
        const original = api[method].bind(api);
        api[method] = function (...args) {
            const result = original(...args);
            if (result && typeof result.catch === 'function') {
                return result.catch((error) => {
                    if (noReceiver.test(error?.message || '')) return undefined;
                    throw error;
                });
            }
            return result;
        };
    }
})(/Receiving end does not exist|message port closed|Could not establish connection/i);

importScripts('/background/gemini-api.js');
importScripts('/agent-backend.js');
importScripts('/background/state.js');
importScripts('/background/stateManager.js');
importScripts('/services/storage.js');
importScripts('/services/dbSchema.js');
importScripts('/services/webActivitySchema.js');
importScripts('/background/db.js');
importScripts('/background/utils.js');
importScripts('/background/handlers/bookmarks.js');
importScripts('/background/handlers/history.js');
importScripts('/background/handlers/groups.js');
importScripts('/background/handlers/tabs.js');
importScripts('/background/handlers/backups.js');
importScripts('/background/handlers/rules.js');
importScripts('/background/handlers/search.js');
importScripts('/background/handlers/downloads.js');
importScripts('/background/handlers/pip.js');
importScripts('/background/handlers/ui.js');
importScripts('/background/handlers/screenshots.js');
importScripts('/background/handlers/notes.js');
importScripts('/background/handlers/read-aloud.js');
importScripts('/background/handlers/dnr.js');
importScripts('/background/handlers/pomodoro-handlers.js');
importScripts('/background/handlers/web-activity.js');
importScripts('/background/handlers/omnibar-data.js');
importScripts('/background/group-analyzer.js');
importScripts('/background/groupManager.js');
importScripts('/background/messaging.js');
importScripts('/background/events.js');
importScripts('/background/pomodoro.js');

(async () => {
    logMessage('[Service Worker Startup] Initializing extension...');

    // The side panel keeps whatever page it was showing.
    //
    // This used to force the rules page on every startup, to shake off a legacy path
    // Chrome might have cached. But in MV3 the worker starts again on any event — an
    // alarm, a tab change, a message — so that reset fired over and over and dragged
    // the panel back to the rules page on its own while someone was reading the group
    // list or the assistant. Now the configured path is only touched when it does not
    // belong to this build, which is the case the reset was written for.
    if (chrome.sidePanel && chrome.sidePanel.setOptions) {
        const KNOWN_PANEL_PAGES = [
            'src/ui/pages/rules/rules.html',
            'src/ui/pages/listGroup/listGroup.html',
            'src/ui/pages/savedThemes/savedThemes.html',
            'src/ui/pages/customize_hints/customize_hints.html',
            'src/ui/pages/popup/popup.html',
        ];
        try {
            const options = await chrome.sidePanel.getOptions({});
            const current = options?.path || '';
            const isKnown = KNOWN_PANEL_PAGES.some((page) => current.startsWith(page));
            if (!isKnown) {
                await chrome.sidePanel.setOptions({ path: 'src/ui/pages/rules/rules.html', enabled: true });
            } else if (options.enabled === false) {
                await chrome.sidePanel.setOptions({ enabled: true });
            }
        } catch (e) {
            console.warn('Could not read the side panel options:', e);
        }
    }
    await initializeExtensionStates();

    // The idle threshold is not persisted across worker starts, and a blocking
    // schedule may have opened while nothing was running.
    await initWebActivity();

    // Inject content scripts into open tabs upon reload / startup so changes apply immediately without manual refresh
    logMessage('[Service Worker Startup] Injecting content scripts into open tabs.');
    await injectContentScriptsInAllTabs();

    logMessage('[Service Worker Startup] Initialization complete.');
})();

// --- Omnibox AI-Powered Tab Finder ---

/**
 * Words that carry no signal in "which tab was it" phrasing, in both languages the
 * extension ships.
 *
 * The list used to be Spanish only, so an English question dragged its own filler into
 * the scoring and `where`, `the` and `my` earned points against whatever URL happened to
 * contain them. It also held `abril` — the month, sitting next to `abrir`, and almost
 * certainly a slip of the finger — which silently threw away the search term of anyone
 * looking for something about April.
 *
 * It now has to carry the short words too, because the length filter that used to hide
 * them is gone.
 */
const OMNIBOX_FILLER_WORDS = new Set([
    // Spanish
    'el',
    'la',
    'lo',
    'los',
    'las',
    'un',
    'una',
    'uno',
    'unos',
    'unas',
    'de',
    'del',
    'al',
    'en',
    'con',
    'por',
    'para',
    'sin',
    'sobre',
    'entre',
    'que',
    'donde',
    'cual',
    'cuando',
    'como',
    'esta',
    'este',
    'esa',
    'ese',
    'eso',
    'estaba',
    'era',
    'fue',
    'hay',
    'tengo',
    'tenia',
    'mi',
    'mis',
    'tu',
    'su',
    'abrir',
    'abierto',
    'abrio',
    'abierta',
    'pestana',
    'pestaa',
    // English
    'the',
    'of',
    'in',
    'on',
    'at',
    'to',
    'is',
    'it',
    'was',
    'were',
    'be',
    'been',
    'my',
    'me',
    'and',
    'or',
    'for',
    'with',
    'from',
    'that',
    'this',
    'these',
    'those',
    'where',
    'which',
    'what',
    'when',
    'had',
    'have',
    'has',
    'open',
    'opened',
]);

/**
 * How short a word has to be before it is matched on a word boundary instead of as a
 * plain substring.
 *
 * Short terms are worth keeping — `IA`, `UI`, `3D` — but `includes('ia')` also matches
 * *Wikipedia*, and a two-letter substring against forty titles finds something every
 * time. Anything at or below this length has to appear as a word of its own.
 */
const OMNIBOX_BOUNDARY_MAX = 3;

/** A local guess this weak is a coincidence, not an answer. See where it is used. */
const OMNIBOX_MIN_ACCEPTABLE_SCORE = 10;

/**
 * Drops the accents from a word, for comparing against the filler list only.
 *
 * People type `¿dónde estaba…?` with the accent, and lowercasing alone leaves `dónde`,
 * which does not equal the `donde` in the list — so the filler survived the filter and
 * went on to earn points against any URL containing it. The accents are stripped for
 * this comparison and nowhere else: what gets matched against titles is still the word
 * the reader typed.
 */
function omniboxDeaccent(word) {
    return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Escapes a search term so it can go inside a RegExp — `c++` and `c#` are real queries. */
function omniboxEscapeRegex(word) {
    return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether `word` occurs in `haystack`, as a substring for ordinary words and as a whole
 * word for very short ones.
 */
function omniboxContains(haystack, word) {
    if (word.length > OMNIBOX_BOUNDARY_MAX) return haystack.includes(word);
    const boundary = '[^a-z0-9áéíóúüñ]';
    return new RegExp(`(^|${boundary})${omniboxEscapeRegex(word)}(${boundary}|$)`).test(haystack);
}

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
            // One-letter words are never what someone is looking for; everything else is
            // judged by the filler list rather than by length, so `IA`, `UI`, `3D` and
            // `C#` survive. They used to be dropped by a `length > 2` rule, which is why
            // searching for a two-letter thing found nothing at all.
            .filter((word) => word.length > 1 && !OMNIBOX_FILLER_WORDS.has(omniboxDeaccent(word)));

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
                if (omniboxContains(titleLower, word)) {
                    score += 10;
                    matchedCount++;
                } else if (omniboxContains(urlLower, word)) {
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

            /*
             * The last resort, and it now has a floor.
             *
             * This used to take `bestLocalMatch` whatever its score, which meant that with
             * no API key configured — when the branch above is skipped entirely — a single
             * query word appearing anywhere in a URL was enough to jump somewhere. Three
             * points out of a possible sixty is a coincidence, and being sent to the wrong
             * tab is worse than being told the tab was not found.
             *
             * Ten is one word matched in a title, or the whole query inside a URL. Below
             * that the answer is "no".
             */
            if (!matchedTabId && bestLocalMatch && bestLocalMatch.score >= OMNIBOX_MIN_ACCEPTABLE_SCORE) {
                matchedTabId = bestLocalMatch.tab.id;
                logMessage(
                    `[Omnibox] No Gemini match, falling back to best local guess: "${bestLocalMatch.tab.title}" (Score: ${bestLocalMatch.score})`,
                );
            } else if (!matchedTabId && bestLocalMatch) {
                logMessage(
                    `[Omnibox] Best local guess "${bestLocalMatch.tab.title}" scored ${bestLocalMatch.score}, below ${OMNIBOX_MIN_ACCEPTABLE_SCORE}; reporting no match instead.`,
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
