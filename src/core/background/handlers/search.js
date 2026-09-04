/**
 * [AI INSTRUCTION]
 * SEARCH HANDLER — Handles search queries from omnibar.
 */

/**
 * Handles search actions on different websites.
 */
function handleSearchAction(message) {
    // The omnibar sends `query`; the agent tool sends `text`.
    const query = message.query ?? message.text;
    let baseUrl;
    switch (message.action) {
        case 'searchGoogle':
            baseUrl = 'https://www.google.com/search?q=';
            break;
        case 'searchYoutube':
            baseUrl = 'https://www.youtube.com/results?search_query=';
            break;
        case 'searchAmazon':
            baseUrl = 'https://www.amazon.com/s?k=';
            break;
        case 'searchAmazonEs':
            baseUrl = 'https://www.amazon.es/s?k=';
            break;
        case 'searchDuckDuckGo':
            baseUrl = 'https://duckduckgo.com/?q=';
            break;
        case 'searchWikipedia':
            baseUrl = 'https://en.wikipedia.org/wiki/Special:Search?search=';
            break;
        case 'searchGoogleMaps':
            baseUrl = 'https://www.google.com/maps/search/';
            break;
        case 'searchX':
            baseUrl = 'https://x.com/search?q=';
            break;
    }
    if (!baseUrl || !query) return;
    // The omnibar's `sp:` prefix and its Ctrl+Enter ask for the same search in the side
    // panel instead of a tab. The address is built the same way either way; only where
    // it is shown differs, so the branch belongs here and not in a second table of
    // search engines.
    if (message.inSidePanel) {
        openUrlInSidePanel(baseUrl + encodeURIComponent(query));
        return;
    }
    openSearchUrl(baseUrl, query);
}

function handleSearchGoogle(message, sendResponse) {
    (async () => {
        const query = message.query;
        const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(query);
        // Asked for in the side panel there is no tab to reuse: the panel is the
        // destination, and steering an existing Google tab would put the answer where
        // nobody is looking.
        if (message.inSidePanel) {
            openUrlInSidePanel(searchUrl);
            sendResponse({ status: 'ok' });
            return;
        }
        try {
            const tabs = await chrome.tabs.query({
                url: 'https://www.google.com/search*',
            });
            const reusableTab = tabs.find((t) => !t.pinned);
            if (reusableTab) {
                await chrome.tabs.update(reusableTab.id, {
                    url: searchUrl,
                    active: true,
                });
                await chrome.windows.update(reusableTab.windowId, {
                    focused: true,
                });
            } else {
                await chrome.tabs.create({
                    url: searchUrl,
                    active: true,
                });
            }
            sendResponse({
                status: 'ok',
            });
        } catch (e) {
            console.error('Error handling Google search:', e);
            sendResponse({
                status: 'error',
                message: e.message,
            });
        }
    })();
}

function handleSearchGemini(message, sendResponse) {
    (async () => {
        try {
            const result = await fetchGeminiResponse(message.query, message.contents, message.attachments);
            sendResponse(result);
        } catch (error) {
            console.error(`[background.js] Error fetching Gemini response for ${message.query}:`, error);
            sendResponse({
                success: false,
                error: error.message,
            });
        }
    })();
}
