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
 * [AI NOTE] Removing X-Frame-Options and CSP is only half of what an embedded
 * site needs. Sites like x.com or web.whatsapp.com also look at the Sec-Fetch-*
 * request headers and refuse to serve their app when `Sec-Fetch-Dest: iframe`
 * arrives, and a cached 304 would replay the original framing headers, so
 * If-None-Match has to go too. These are sent alongside the User-Agent.
 */
function buildFramingRequestHeaders(userAgent, mobile) {
    /**
     * [AI NOTE] A spoofed mobile User-Agent on its own is what gets the frame
     * blocked. Chrome keeps sending its real low-entropy client hints
     * (`Sec-CH-UA-Mobile: ?0`, `Sec-CH-UA-Platform: "Linux"`, the true version),
     * so the request claims to be a Pixel while its hints say desktop Linux —
     * a contradiction bot detection reads immediately. Measured on as.com,
     * which sits behind DataDome: with the mismatch it served 403 from the
     * second load on, with the hints aligned it serves 200 every time.
     */
    const clientHints = mobile
        ? [
              { header: 'sec-ch-ua-mobile', operation: 'set', value: '?1' },
              { header: 'sec-ch-ua-platform', operation: 'set', value: '"Android"' },
              { header: 'sec-ch-ua-platform-version', operation: 'set', value: '"13.0.0"' },
              { header: 'sec-ch-ua-model', operation: 'set', value: '"Pixel 7"' },
              {
                  header: 'sec-ch-ua',
                  operation: 'set',
                  value: '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
              },
          ]
        : [];

    return [
        { header: 'user-agent', operation: 'set', value: userAgent },
        ...clientHints,
        { header: 'sec-fetch-dest', operation: 'set', value: 'document' },
        { header: 'sec-fetch-mode', operation: 'set', value: 'navigate' },
        { header: 'sec-fetch-site', operation: 'set', value: 'same-origin' },
        { header: 'sec-fetch-user', operation: 'set', value: '?1' },
        { header: 'if-none-match', operation: 'remove' },
        { header: 'if-modified-since', operation: 'remove' },
    ];
}

// User-Agent for a modern mobile browser (Pixel 7 with Android 13). The side
// panel is narrow, so the mobile layout is the sensible default.
const SIDEPANEL_MOBILE_UA =
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';

/**
 * [AI NOTE] Hosts that serve a "download our app" wall to mobile browsers and
 * only work with a desktop User-Agent. WhatsApp Web is the canonical case.
 */
const SIDEPANEL_DESKTOP_UA_HOSTS = ['web.whatsapp.com', 'whatsapp.com', 'meet.google.com', 'teams.microsoft.com'];

/**
 * Reduces a hostname to the domain DNR should match, so that `www.x.com`
 * also covers `x.com` and its subdomains.
 */
function registrableDomain(hostname) {
    const parts = (hostname || '').toLowerCase().split('.');
    return parts.length > 2 ? parts.slice(-2).join('.') : hostname.toLowerCase();
}

function pickSidePanelUserAgent(hostname) {
    const host = (hostname || '').toLowerCase();
    const wantsDesktop = SIDEPANEL_DESKTOP_UA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    if (wantsDesktop) {
        // The worker's own UA is a plain desktop Chrome string.
        return navigator.userAgent.replace(/\s*Headless/gi, '');
    }
    return SIDEPANEL_MOBILE_UA;
}

/**
 * Removes the cookies this extension previously copied into its own partition
 * for a site, so a site we decide not to mirror is never left holding half of
 * an old copy.
 */
async function clearMirroredCookies(cookieUrl, topLevelSite) {
    let mirrored;
    try {
        mirrored = await chrome.cookies.getAll({ url: cookieUrl, partitionKey: { topLevelSite } });
    } catch {
        return 0;
    }
    await Promise.all(
        mirrored.map((c) =>
            chrome.cookies
                .remove({
                    url: `${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path}`,
                    name: c.name,
                    storeId: c.storeId,
                    partitionKey: { topLevelSite },
                })
                .catch(() => {}),
        ),
    );
    return mirrored.length;
}

/**
 * [AI NOTE] Chrome partitions third-party cookies by top-level site, so the
 * cookies the user already has for a site are invisible to an iframe whose
 * top-level site is `chrome-extension://<id>`: the site loads logged out.
 * Copying the cookies into the extension's partition with SameSite=None makes
 * the framed site see the same session as a normal tab.
 *
 * The copy is all-or-nothing on purpose. HttpOnly cookies cannot be read
 * through this API, so on a site that uses them the copy would carry the
 * readable half of a session and leave the credential behind. Google is the
 * case that proved it: with a partial copy YouTube tries to restore a session
 * it then cannot validate, and the frame ends up on the accounts.google.com
 * "We've detected a problem with your cookie settings" page — where mirroring
 * nothing at all simply shows the site logged out, which works. Sites whose
 * cookies are all script-readable (as.com and its DataDome cookie, for one)
 * get the full copy and behave exactly as in a normal tab.
 */
async function mirrorCookiesIntoExtensionPartition(url) {
    if (!chrome.cookies) return;
    let target;
    try {
        target = new URL(url);
    } catch {
        return;
    }
    if (!['http:', 'https:'].includes(target.protocol)) return;

    target.protocol = 'https:';
    target.hash = '';
    const cookieUrl = target.toString();
    const topLevelSite = chrome.runtime.getURL('/');

    let cookies;
    try {
        cookies = await chrome.cookies.getAll({ url: cookieUrl });
    } catch (e) {
        logMessage('[DNR] Could not read cookies for ' + target.hostname + ': ' + e.message);
        return;
    }

    if (cookies.some((c) => c.httpOnly)) {
        const dropped = await clearMirroredCookies(cookieUrl, topLevelSite);
        logMessage(
            `[DNR] ${target.hostname} keeps its session in httpOnly cookies; mirroring skipped` +
                (dropped ? ` (${dropped} stale mirrored cookies removed)` : ''),
        );
        return;
    }

    await Promise.all(
        cookies
            .filter((c) => !c.httpOnly && !c.partitionKey)
            .map((c) => {
                const details = {
                    url: cookieUrl,
                    name: c.name,
                    value: c.value,
                    path: c.path,
                    secure: true,
                    sameSite: 'no_restriction',
                    storeId: c.storeId,
                    partitionKey: { topLevelSite },
                };
                if (c.expirationDate) details.expirationDate = c.expirationDate;
                if (!c.hostOnly) details.domain = c.domain;
                return chrome.cookies.set(details).catch(() => {});
            }),
    );
}

/**
 * [AI NOTE] The side panel is not a tab, so every request it makes is reported
 * with tabId -1. Extension pages opened as real tabs get their own ids. The
 * rules are scoped to these ids so that removing CSP never leaks into the
 * user's normal browsing.
 */
async function getSidePanelRuleTabIds() {
    const ids = new Set([-1]);
    try {
        const prefix = chrome.runtime.getURL('');
        const tabs = await chrome.tabs.query({});
        tabs.filter((t) => t.id && t.url?.startsWith(prefix)).forEach((t) => ids.add(t.id));
    } catch (e) {
        logMessage('[DNR] getSidePanelRuleTabIds (tabs): ' + e.message);
    }
    try {
        const contexts = await chrome.runtime.getContexts({});
        contexts.filter((c) => c.tabId && c.tabId !== -1 && c.frameId === 0).forEach((c) => ids.add(c.tabId));
    } catch (e) {
        logMessage('[DNR] getSidePanelRuleTabIds (contexts): ' + e.message);
    }
    return [...ids];
}

/**
 * Prepares a URL for embedding inside the extension's side panel by removing
 * framing-restriction headers, faking a top-level navigation and setting the
 * User-Agent the target host expects.
 */
function handlePrepareUrlForSidePanel(message, sendResponse) {
    (async () => {
        const urlObj = new URL(message.url);
        const userAgent = pickSidePanelUserAgent(urlObj.hostname);
        const isMobileUserAgent = userAgent === SIDEPANEL_MOBILE_UA;
        const responseHeaders = buildFramingResponseHeaders();
        const tabIds = await getSidePanelRuleTabIds();

        await mirrorCookiesIntoExtensionPartition(message.url).catch((e) => {
            logMessage('[DNR] cookie mirroring failed: ' + e.message);
        });

        const rules = [
            {
                // The iframe document itself: the target site's own navigation.
                id: SIDEPANEL_RULE_ID,
                priority: 9999,
                action: {
                    type: 'modifyHeaders',
                    requestHeaders: buildFramingRequestHeaders(userAgent, isMobileUserAgent),
                    responseHeaders: responseHeaders,
                },
                condition: {
                    tabIds: tabIds,
                    requestDomains: [registrableDomain(urlObj.hostname)],
                    resourceTypes: ['sub_frame'],
                },
            },
            {
                // Everything the framed page then loads for itself, plus any
                // nested frame it opens. Scoped to the extension's own tabIds.
                id: SIDEPANEL_RULE_ID + 1,
                priority: 9999,
                action: {
                    type: 'modifyHeaders',
                    responseHeaders: responseHeaders,
                },
                condition: {
                    tabIds: tabIds,
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
 * [AI NOTE] The YouTube embed player refuses to run when the framing page is a
 * `chrome-extension://` origin: it answers "Error 153 — Video player
 * configuration error", because it cannot validate a Referer it does not
 * recognise as a web origin. Verified in a real browser: a third-party https
 * Referer is all it needs, while `https://www.youtube.com/` itself yields
 * "Error 152" instead.
 *
 * The Referer used is under a `.invalid` TLD, which RFC 2606 reserves so that
 * it can never resolve and never belongs to anyone — the extension is not
 * impersonating a real site.
 *
 * The rule is narrow on purpose: only YouTube sub-frames created by this
 * extension's own pages are touched.
 */
const YOUTUBE_EMBED_REFERER = 'https://intelligent-tab-group.invalid/';

function handlePrepareYouTubeEmbed(sendResponse) {
    (async () => {
        const ruleId = SIDEPANEL_RULE_ID + 4;
        try {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [ruleId],
                addRules: [
                    {
                        id: ruleId,
                        priority: 9999,
                        action: {
                            type: 'modifyHeaders',
                            requestHeaders: [{ header: 'referer', operation: 'set', value: YOUTUBE_EMBED_REFERER }],
                        },
                        condition: {
                            initiatorDomains: [chrome.runtime.id],
                            requestDomains: ['youtube.com', 'youtube-nocookie.com'],
                            // Only the embedded player; opening youtube.com itself in
                            // the side panel keeps its own referer.
                            urlFilter: '/embed/',
                            resourceTypes: ['sub_frame'],
                        },
                    },
                ],
            });
            logMessage('[DNR] YouTube embed referer rule active.');
            sendResponse({ success: true });
        } catch (error) {
            console.error('[DNR] Error installing YouTube embed rule:', error);
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
                removeRuleIds: [SIDEPANEL_RULE_ID, SIDEPANEL_RULE_ID + 1],
            });
            logMessage(`[DNR] Side panel rules cleaned up.`);
            sendResponse({ success: true });
        } catch (error) {
            console.error('[DNR] Error cleaning up rule:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}
