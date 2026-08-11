/**
 * [AI INSTRUCTION]
 * DNR (Declarative Net Request) HANDLER — Header modification rules.
 *
 * REUSE: All framing-restriction header removal MUST use `FRAMING_HEADERS_TO_REMOVE`
 * and `buildFramingResponseHeaders()` instead of duplicating the header list.
 * This was previously duplicated 3 times across messaging.js.
 *
 * Dependencies: SIDEPANEL_RULE_ID (from state.js), logMessage() (from utils.js)
 */

/**
 * [AI NOTE] Single source of truth for headers that block iframe embedding.
 * Used by both side panel URL preparation and video PiP URL preparation.
 * DO NOT duplicate this list elsewhere.
 */
const FRAMING_HEADERS_TO_REMOVE = [
    'x-frame-options',
    'frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'x-webkit-csp',
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
];

/**
 * Builds the responseHeaders array for DNR rules that remove framing restrictions.
 * Also adds a permissions-policy override.
 * @returns {Array} Array of header modification operations
 */
function buildFramingResponseHeaders() {
    const headers = FRAMING_HEADERS_TO_REMOVE.map((h) => ({ header: h, operation: 'remove' }));
    headers.push({ header: 'permissions-policy', operation: 'set', value: 'browsing-topics=()' });
    return headers;
}

/**
 * Prepares a URL for embedding inside the extension's side panel by removing
 * framing-restriction headers and setting a mobile User-Agent.
 */
function handlePrepareUrlForSidePanel(message, sendResponse) {
    (async () => {
        // User-Agent for a modern mobile browser (Pixel 7 with Android 13)
        const mobileUserAgent =
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';

        const urlObj = new URL(message.url);
        const responseHeaders = buildFramingResponseHeaders();

        const rules = [
            {
                id: SIDEPANEL_RULE_ID,
                priority: 9999,
                action: {
                    type: 'modifyHeaders',
                    requestHeaders: [
                        {
                            header: 'user-agent',
                            operation: 'set',
                            value: mobileUserAgent,
                        },
                    ],
                    responseHeaders: responseHeaders,
                },
                condition: {
                    resourceTypes: ['sub_frame'],
                },
            },
            {
                id: SIDEPANEL_RULE_ID + 1,
                priority: 9999,
                action: {
                    type: 'modifyHeaders',
                    responseHeaders: responseHeaders,
                },
                condition: {
                    resourceTypes: ['sub_frame', 'xmlhttprequest', 'script', 'other'],
                },
            },
        ];

        try {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [SIDEPANEL_RULE_ID, SIDEPANEL_RULE_ID + 1],
                addRules: rules,
            });
            logMessage(`[background.js] Side panel framing rules active for: ${urlObj.hostname}`);
            sendResponse({ success: true });
        } catch (error) {
            console.error('[background.js] Error updating DNR rules:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}

/**
 * Gets cookies for a domain to inject into sub_frame requests.
 * Used by handlePrepareVideoUrlForPip for non-YouTube sites.
 */
async function getCookiesHeaderForDomain(url) {
    try {
        const targetDomain = new URL(url).hostname;
        // Get cookies for the domain
        const cookies = await chrome.cookies.getAll({ domain: targetDomain });

        // Also get cookies for parent domain if applicable (e.g. .youtube.com if targetDomain is www.youtube.com)
        let parentDomain = targetDomain;
        const parts = targetDomain.split('.');
        if (parts.length > 2) {
            parentDomain = parts.slice(-2).join('.');
        }

        const allCookies = [];
        const seen = new Set();

        const addCookies = (list) => {
            for (const c of list) {
                if (!seen.has(c.name)) {
                    seen.add(c.name);
                    allCookies.push(`${c.name}=${c.value}`);
                }
            }
        };

        addCookies(cookies);
        if (parentDomain !== targetDomain) {
            const parentCookies = await chrome.cookies.getAll({ domain: parentDomain });
            addCookies(parentCookies);
        }

        return allCookies.join('; ');
    } catch (e) {
        logMessage('Error fetching cookies for domain: ' + e.message);
        return '';
    }
}

/**
 * Prepares a URL for embedding inside a Document PiP iframe by removing
 * framing-restriction headers WITHOUT altering the User-Agent.
 * This ensures the site serves its desktop version with native video controls intact.
 */
function handlePrepareVideoUrlForPip(message, sendResponse) {
    (async () => {
        const responseHeaders = buildFramingResponseHeaders();

        const ruleId = SIDEPANEL_RULE_ID + 2;
        const rule = {
            id: ruleId,
            priority: 9999,
            action: {
                type: 'modifyHeaders',
                responseHeaders: responseHeaders,
            },
            condition: {
                resourceTypes: ['sub_frame', 'xmlhttprequest', 'script', 'other'],
            },
        };

        const rule2Id = SIDEPANEL_RULE_ID + 3;
        const rules = [rule];

        if (message.url) {
            const urlObj = new URL(message.url);
            const isYouTube = urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be');
            if (!isYouTube) {
                const cookieString = await getCookiesHeaderForDomain(message.url);
                if (cookieString) {
                    const targetDomain = urlObj.hostname;
                    rules.push({
                        id: rule2Id,
                        priority: 9999,
                        action: {
                            type: 'modifyHeaders',
                            requestHeaders: [
                                {
                                    header: 'Cookie',
                                    operation: 'set',
                                    value: cookieString,
                                },
                            ],
                        },
                        condition: {
                            urlFilter: `*://${targetDomain}/*`,
                            resourceTypes: ['sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet', 'other'],
                        },
                    });
                }
            }
        }

        try {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [ruleId, rule2Id],
                addRules: rules,
            });
            logMessage(
                `[background.js] Video PiP framing and cookie injection rules active (rules ${ruleId}, ${rule2Id}).`,
            );
            sendResponse({ success: true });
        } catch (error) {
            console.error('[background.js] Error updating DNR rules for video PiP:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}

/**
 * Cleans up side panel DNR session rules.
 */
function handleCleanupSidePanelRules(sendResponse) {
    (async () => {
        try {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [SIDEPANEL_RULE_ID],
            });
            logMessage(`[DNR] Side panel rule cleaned up.`);
            sendResponse({ success: true });
        } catch (error) {
            console.error('[DNR] Error cleaning up rule:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}
