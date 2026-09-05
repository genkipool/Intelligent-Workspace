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
 * The second-level suffixes that are registries rather than sites.
 *
 * Without this, `slice(-2)` reduces `www.bbc.co.uk` to `co.uk` — and a DNR
 * `requestDomains: ['co.uk']` matches that domain *and every subdomain of it*,
 * which is every site in the United Kingdom. The rules below take framing
 * headers off whatever they match, so an over-wide answer here is not a
 * cosmetic bug: it is the difference between "this newspaper" and "half a TLD".
 *
 * A complete answer needs the Public Suffix List, which is 10k entries and not
 * worth shipping for this; the list below is the suffixes a browser extension
 * actually meets. Anything missing falls back to the old behaviour for that
 * name only, so an unlisted suffix is no worse than before.
 */
const MULTIPART_SUFFIXES = new Set([
    'co.uk',
    'org.uk',
    'me.uk',
    'ac.uk',
    'gov.uk',
    'net.uk',
    'sch.uk',
    'com.au',
    'net.au',
    'org.au',
    'edu.au',
    'gov.au',
    'co.nz',
    'net.nz',
    'org.nz',
    'co.jp',
    'or.jp',
    'ne.jp',
    'ac.jp',
    'go.jp',
    'co.kr',
    'or.kr',
    'com.br',
    'net.br',
    'org.br',
    'gov.br',
    'com.mx',
    'com.ar',
    'com.co',
    'com.pe',
    'com.uy',
    've.com',
    'co.za',
    'org.za',
    'com.cn',
    'net.cn',
    'org.cn',
    'gov.cn',
    'com.hk',
    'com.sg',
    'com.tw',
    'com.tr',
    'com.my',
    'com.ph',
    'co.in',
    'net.in',
    'org.in',
    'co.il',
    'org.il',
    'com.ua',
    'com.ru',
    'com.pl',
    'com.es',
    'com.pt',
    'com.gr',
]);

/**
 * Reduces a hostname to the domain DNR should match, so that `www.x.com`
 * also covers `x.com` and its subdomains — without ever reducing it to a
 * registry suffix. See `MULTIPART_SUFFIXES`.
 */
function registrableDomain(hostname) {
    const host = (hostname || '').toLowerCase();
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const lastTwo = parts.slice(-2).join('.');
    if (MULTIPART_SUFFIXES.has(lastTwo)) {
        return parts.length > 3 ? parts.slice(-3).join('.') : host;
    }
    return lastTwo;
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
 * [AI NOTE] Hosts whose session cannot be completed inside a frame, so the
 * mirror below leaves them alone.
 *
 * The test that matters is not "does the site use httpOnly cookies" — x.com
 * does, and mirroring is exactly what makes it work. It is whether the
 * cookies we cannot copy would arrive on their own. x.com sends `auth_token`
 * as httpOnly but SameSite=None, so the session reaches the frame by itself
 * and copying the readable `ct0` (SameSite=Lax, and the CSRF token every
 * GraphQL call needs) completes the set: without it the shell renders and the
 * timeline stays empty. Google's session cookies are httpOnly *and* Lax —
 * unreachable and uncopyable both — so any copy is half a session, and
 * YouTube then tries to restore a login it cannot validate and lands on the
 * accounts.google.com "problem with your cookie settings" page. Mirroring
 * nothing there simply shows the site logged out, which works.
 */
const SIDEPANEL_NO_COOKIE_MIRROR =
    /(^|\.)(google\.[a-z.]+|youtube\.com|youtu\.be|googleusercontent\.com|gstatic\.com)$/;

/**
 * [AI NOTE] Chrome partitions third-party cookies by top-level site, so the
 * cookies the user already has for a site are invisible to an iframe whose
 * top-level site is `chrome-extension://<id>`: the site loads logged out, or
 * half-logged-in. Copying the readable cookies into the extension's partition
 * with SameSite=None makes the framed site see what a normal tab sees.
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

    if (SIDEPANEL_NO_COOKIE_MIRROR.test(target.hostname.toLowerCase())) {
        // Clear anything an earlier version of this code mirrored, so the host
        // is never left holding half a session.
        const dropped = await clearMirroredCookies(cookieUrl, topLevelSite);
        logMessage(
            `[DNR] ${target.hostname} cannot complete a session in a frame; mirroring skipped` +
                (dropped ? ` (${dropped} stale mirrored cookies removed)` : ''),
        );
        return;
    }

    let cookies;
    try {
        cookies = await chrome.cookies.getAll({ url: cookieUrl });
    } catch (e) {
        logMessage('[DNR] Could not read cookies for ' + target.hostname + ': ' + e.message);
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
 * [AI INSTRUCTION]
 * HOSTS THIS HANDLER MUST NEVER TOUCH.
 *
 * Everything above exists to make a site that refuses to be framed show up in the
 * panel anyway: X-Frame-Options and CSP come off, the request is dressed up as a
 * top-level navigation, cookies are copied into our partition. For a newspaper that is
 * the feature. For a payment page it is clickjacking — it is precisely the attack
 * `frame-ancestors` exists to stop — and it breaks the SCA/3DS redirect besides.
 *
 * The donation form does not need any of it: `intelligentworkspace.genkipool.com` grants
 * this extension
 * framing rights itself, and `openPaymentInPanel` frames it directly without ever
 * calling this handler. This list is the belt to that pair of braces, so a later change
 * that routes a payment URL through the web view fails loudly instead of quietly
 * stripping a gateway's defences.
 *
 * DO NOT add an exception here to "make a checkout work in the panel". If a gateway
 * will not be framed, that is the gateway telling you not to.
 */
const NEVER_STRIP_FRAMING_HOSTS = [
    // The whole marketing site, not just /pay: DNR matches hosts, not paths, and the
    // site has no business being framed by the web view either. `isPaymentHost` matches
    // subdomains too, so this one entry covers `intelligentworkspace.genkipool.com`,
    // which is where the page actually is.
    'genkipool.com',
    // Covers js., checkout., api. and m.stripe.com through the suffix match below.
    'stripe.com',
    'stripe.network',
    'paypal.com',
    'paypalobjects.com',
    // Google Pay only. NOT google.com: opening Google in the panel's web view is a
    // feature, and listing the parent domain here would silently kill it.
    'pay.google.com',
    'payments.google.com',
];

function isPaymentHost(hostname) {
    const host = (hostname || '').toLowerCase();
    return NEVER_STRIP_FRAMING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Prepares a URL for embedding inside the extension's side panel by removing
 * framing-restriction headers, faking a top-level navigation and setting the
 * User-Agent the target host expects.
 */
function handlePrepareUrlForSidePanel(message, sendResponse) {
    (async () => {
        const urlObj = new URL(message.url);

        if (isPaymentHost(urlObj.hostname)) {
            logMessage(`[DNR] Refusing to strip framing headers for payment host: ${urlObj.hostname}`);
            sendResponse({ success: false, error: 'Framing headers are never stripped for payment hosts' });
            return;
        }

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
        /*
         * ASK BY URL, NOT BY DOMAIN.
         *
         * `getAll({ domain })` matches the domain *and every subdomain of it*, and it
         * ignores `path` and `secure` — so building the header that way put
         * `internal.example.com`'s cookies, and cookies scoped to paths this request
         * never touches, into a request to `www.example.com`. The manual walk up to
         * the parent domain then widened it a second time.
         *
         * `getAll({ url })` is Chrome's own matching: exactly the cookies a real
         * navigation to this URL would carry, parent-domain ones included, and
         * nothing else. It is both narrower and more faithful to what the frame is
         * pretending to be.
         */
        const cookies = await chrome.cookies.getAll({ url });

        const seen = new Set();
        const allCookies = [];
        for (const c of cookies) {
            if (seen.has(c.name)) continue;
            seen.add(c.name);
            allCookies.push(`${c.name}=${c.value}`);
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

        /*
         * THE RULE HAS TO NAME A DOMAIN, and this is not a tidiness point.
         *
         * It used to carry `resourceTypes` and nothing else. A DNR condition with no
         * host and no tab matches every request the extension has permission for, and
         * this extension has `<all_urls>` — so floating one video took
         * X-Frame-Options, CSP, COOP, COEP and CORP off *every iframe, XHR and script
         * in the browser*, in every tab, for as long as the rule stood. That is
         * universal clickjacking and a CSP bypass on sites that have nothing to do
         * with the video, handed out by a feature that only ever needed to frame one
         * page. `handlePrepareUrlForSidePanel` above already scopes its rules for
         * exactly this reason; this one did not.
         *
         * Scoping to the target's registrable domain is what the PiP frame actually
         * needs: the document it loads and the same-site frames and requests that
         * document makes. Headers on a third-party subresource were never what let
         * the frame open.
         */
        let target = null;
        if (message.url) {
            try {
                target = new URL(message.url);
            } catch {
                target = null;
            }
        }
        if (!target || !['http:', 'https:'].includes(target.protocol)) {
            sendResponse({ success: false, error: 'A framable http(s) URL is required' });
            return;
        }
        if (isPaymentHost(target.hostname)) {
            // Same refusal as the side panel: see NEVER_STRIP_FRAMING_HOSTS. The list
            // was only being consulted on one of the two paths that strip headers.
            logMessage(`[DNR] Refusing to strip framing headers for payment host: ${target.hostname}`);
            sendResponse({ success: false, error: 'Framing headers are never stripped for payment hosts' });
            return;
        }

        const ruleId = SIDEPANEL_RULE_ID + 2;
        const rule = {
            id: ruleId,
            priority: 9999,
            action: {
                type: 'modifyHeaders',
                responseHeaders: responseHeaders,
            },
            condition: {
                requestDomains: [registrableDomain(target.hostname)],
                resourceTypes: ['sub_frame', 'xmlhttprequest', 'script', 'other'],
            },
        };

        const rule2Id = SIDEPANEL_RULE_ID + 3;
        const rules = [rule];

        {
            const urlObj = target;
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
                            /*
                             * `https` only. The filter used to be `*://`, and the header
                             * it sets carries the site's session cookies — httpOnly and
                             * Secure ones included, because that is the point of copying
                             * them into a frame that would not receive them. Over `http://`
                             * that is the whole session in cleartext, for a scheme the
                             * framed page is never loaded on anyway.
                             */
                            urlFilter: `|https://${targetDomain}/`,
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
 * Takes the video-PiP rules back down.
 *
 * These are session rules: nothing expires them, the worker restarting does not
 * clear them, and `handleCleanupSidePanelRules` below only ever removed the side
 * panel's two. So a single float — one video, once — left the framing rules
 * standing until the browser was closed, long after the window they were opened
 * for had gone. The PiP window's own `pagehide` now asks for this.
 *
 * Safe to call when there is nothing to remove: `updateSessionRules` ignores ids
 * that are not installed.
 */
function handleCleanupVideoPipRules(sendResponse) {
    (async () => {
        try {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [SIDEPANEL_RULE_ID + 2, SIDEPANEL_RULE_ID + 3],
            });
            logMessage('[DNR] Video PiP rules cleaned up.');
            sendResponse?.({ success: true });
        } catch (error) {
            console.error('[DNR] Error cleaning up video PiP rules:', error);
            sendResponse?.({ success: false, error: error.message });
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
