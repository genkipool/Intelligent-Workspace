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
     * [AI NOTE] The client hints have to agree with the User-Agent, or the panel
     * gets an error page instead of the site.
     *
     * Asking for the mobile layout means sending a mobile User-Agent — the panel is
     * a narrow column, and the mobile layout is the one that fits it. But Chrome
     * carries the same information twice: it keeps sending its real low-entropy
     * client hints (`Sec-CH-UA-Mobile: ?0`, `Sec-CH-UA-Platform: "Linux"`, the true
     * version) alongside whatever User-Agent the request carries. The result is a
     * request that describes itself as two different devices at once, and a server
     * that reads both fields is right to reject it as malformed.
     *
     * Setting the hints to match the User-Agent makes the request internally
     * consistent: one device, described the same way in both places. Measured
     * against a news site that had been failing to load in the panel — inconsistent,
     * it stopped serving after the first load; consistent, it serves every time.
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
 * [AI INSTRUCTION]
 * DELETES THE COPY BY EXPIRING IT. DO NOT "SIMPLIFY" THIS BACK TO `cookies.remove`.
 *
 * `chrome.cookies.remove({ ..., partitionKey })` does not do what its signature
 * promises: measured in Chrome 148, it deletes the caller's partitioned copy AND the
 * user's real unpartitioned cookie of the same name. Passing the exact `partitionKey`
 * Chrome reports on the copy — `hasCrossSiteAncestor` included — does not help; both
 * still go. Removing with no `partitionKey` is the mirror image: it takes the real
 * cookie and leaves the copy.
 *
 * So a mirror that cleaned up after itself with `remove` would log the user out of the
 * site it had just been framing, which is worse than never cleaning up at all — and is
 * why this went unnoticed: the only caller was a branch that almost never has anything
 * to delete.
 *
 * Overwriting the partitioned cookie with one that expired an hour ago evicts exactly
 * that copy and leaves the real cookie untouched. Verified in a real browser, both
 * directions: `remove` takes the original, this takes only the copy.
 *
 * The written shape has to match how `mirrorCookiesIntoExtensionPartition` created it —
 * same name, domain, path and partition — or Chrome writes a second cookie instead of
 * replacing the one that is there.
 */
async function clearMirroredCookies(cookieUrl, topLevelSite) {
    let mirrored;
    try {
        mirrored = await chrome.cookies.getAll({ url: cookieUrl, partitionKey: { topLevelSite } });
    } catch {
        return 0;
    }
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600;
    await Promise.all(
        mirrored.map((c) => {
            const details = {
                url: `https://${c.domain.replace(/^\./, '')}${c.path}`,
                name: c.name,
                value: '',
                path: c.path,
                secure: true,
                sameSite: 'no_restriction',
                storeId: c.storeId,
                // Hand back exactly what Chrome reported rather than rebuilding it: the
                // key carries `hasCrossSiteAncestor`, and a key that does not match is a
                // new cookie rather than a replacement.
                partitionKey: c.partitionKey ?? { topLevelSite },
                expirationDate: anHourAgo,
            };
            if (!c.hostOnly) details.domain = c.domain;
            return chrome.cookies.set(details).catch(() => {});
        }),
    );
    return mirrored.length;
}

/**
 * [AI INSTRUCTION]
 * THE MIRROR HAS TO BE UNDONE, AND THIS IS THE RECORD THAT MAKES IT POSSIBLE.
 *
 * `mirrorCookiesIntoExtensionPartition` copies a site's readable cookies — session
 * cookies among them — into the extension's own partition. Nothing used to take them
 * back out: `clearMirroredCookies` was only ever reached on the branch that decides a
 * host cannot be mirrored, so a copy made for a web view outlived the view, the panel
 * and every later browsing session. Authentication data kept past the feature that
 * needed it is exactly what the Limited Use policy is about.
 *
 * Two things undo it now, and they are deliberately belt and braces:
 *   - the copies are written WITHOUT `expirationDate`, so they are session cookies and
 *     the browser drops them on close no matter what else happens;
 *   - this record, kept in `storage.session` so it survives the worker being torn down,
 *     lets `handleCleanupSidePanelRules` clear them the moment the view closes.
 *
 * Re-mirroring costs nothing: `handlePrepareUrlForSidePanel` copies afresh on every
 * open, so a cleared partition is refilled the next time the user opens that site.
 */
const MIRRORED_COOKIE_URLS_KEY = 'dnrMirroredCookieUrls';

async function readMirroredCookieUrls() {
    try {
        const stored = await chrome.storage.session.get(MIRRORED_COOKIE_URLS_KEY);
        return stored[MIRRORED_COOKIE_URLS_KEY] || [];
    } catch {
        return [];
    }
}

async function rememberMirroredCookieUrl(cookieUrl) {
    try {
        const urls = new Set(await readMirroredCookieUrls());
        urls.add(cookieUrl);
        await chrome.storage.session.set({ [MIRRORED_COOKIE_URLS_KEY]: [...urls] });
    } catch (e) {
        logMessage('[DNR] could not record the mirrored host: ' + e.message);
    }
}

async function forgetMirroredCookieUrl(cookieUrl) {
    try {
        const urls = (await readMirroredCookieUrls()).filter((u) => u !== cookieUrl);
        await chrome.storage.session.set({ [MIRRORED_COOKIE_URLS_KEY]: urls });
    } catch {
        /* The record is an optimisation over the session-cookie lifetime, not the
         * guarantee. Losing an entry costs a cookie that dies on browser close. */
    }
}

/**
 * Takes back every copy this extension put into its own partition. Called when the
 * framed view goes away, alongside the rules that made it possible.
 */
async function clearAllMirroredCookies() {
    if (!chrome.cookies) return 0;
    const topLevelSite = chrome.runtime.getURL('/');
    const urls = await readMirroredCookieUrls();
    let dropped = 0;
    for (const url of urls) {
        dropped += await clearMirroredCookies(url, topLevelSite);
    }
    try {
        await chrome.storage.session.remove(MIRRORED_COOKIE_URLS_KEY);
    } catch {
        /* ignored: the cookies are gone, which is the part that matters */
    }
    return dropped;
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
        await forgetMirroredCookieUrl(cookieUrl);
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

    const copyable = cookies.filter((c) => !c.httpOnly && !c.partitionKey);

    await Promise.all(
        copyable.map((c) => {
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
            /*
             * `expirationDate` is deliberately NOT carried over, so every copy is a
             * session cookie regardless of how long the original lives.
             *
             * It used to be copied, which meant a "remember me" cookie mirrored for one
             * afternoon's reading sat in the extension's partition for the year the site
             * had given it. Nothing is lost by dropping it: the mirror is rebuilt from
             * the real cookie store on every open, so the framed site sees the same
             * session it would have seen anyway — it just stops outliving the browser.
             */
            if (!c.hostOnly) details.domain = c.domain;
            return chrome.cookies.set(details).catch(() => {});
        }),
    );

    if (copyable.length) await rememberMirroredCookieUrl(cookieUrl);
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
 * The contribution form does not need any of it: `intelligentworkspace.genkipool.com` grants
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
                    /*
                     * The guarantee that `isPaymentHost` above states, made declarative.
                     *
                     * That check refuses to *install* a rule for a payment host. It does
                     * nothing about a rule already standing: the second rule below is
                     * scoped by tab, not by domain, so with a web view open it strips the
                     * headers off anything the panel then loads — the contribution sheet
                     * included, whose own CSP and `permissions-policy: payment=…` are what
                     * Stripe and Google Pay need. Chrome tears down the panel's document on
                     * navigation without running `closeUrlInPanel`, so the cleanup message
                     * that would have removed these rules never gets sent.
                     *
                     * Excluding the hosts here means the promise is kept by the matcher
                     * rather than by the order the messages happen to arrive in.
                     */
                    excludedRequestDomains: NEVER_STRIP_FRAMING_HOSTS,
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
                    /*
                     * The guarantee that `isPaymentHost` above states, made declarative.
                     *
                     * That check refuses to *install* a rule for a payment host. It does
                     * nothing about a rule already standing: the second rule below is
                     * scoped by tab, not by domain, so with a web view open it strips the
                     * headers off anything the panel then loads — the contribution sheet
                     * included, whose own CSP and `permissions-policy: payment=…` are what
                     * Stripe and Google Pay need. Chrome tears down the panel's document on
                     * navigation without running `closeUrlInPanel`, so the cleanup message
                     * that would have removed these rules never gets sent.
                     *
                     * Excluding the hosts here means the promise is kept by the matcher
                     * rather than by the order the messages happen to arrive in.
                     */
                    excludedRequestDomains: NEVER_STRIP_FRAMING_HOSTS,
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
 * Finds the tab id of the Document Picture-in-Picture window the caller just opened.
 *
 * WHY THIS EXISTS. The floating player's rules used to be bounded by domain alone,
 * while the side panel's are bounded by domain *and* the extension's own tab ids. That
 * asymmetry was not a style difference: measured in a real browser, with a float open
 * on a site, a second tab loading a third-party `<iframe>` of that same site got its
 * framing headers stripped **and** the user's session cookie replayed into it — a
 * cookie the browser had correctly withheld, because it is `SameSite=Lax` and that is a
 * cross-site request. Defeating that is a CSRF boundary, not a cosmetic detail.
 *
 * WHY IT IS FINDABLE. `documentPictureInPicture.requestWindow()` gives Chrome a real
 * tab, in a window of its own, and `chrome.tabs` knows it. Measured: the tab's `url` is
 * `about:blank`, its `windowId` is not the opener's, and its `openerTabId` is the tab
 * that asked for it. The three together identify it, and the window it lives in holds
 * nothing else. Both callers await `requestWindow()` before sending this message, so
 * the tab already exists by the time this runs.
 *
 * WHY IT FAILS SOFT. If the tab cannot be found — a Chrome that stops modelling the
 * float as a tab, a caller that ever sends the message first — this returns null and
 * the caller installs the rules the way it always did. A float that still works with a
 * wider rule is a better failure than a float that shows a blank rectangle.
 */
async function findPipTabId(senderTabId) {
    if (typeof senderTabId !== 'number') return null;
    try {
        const sender = await chrome.tabs.get(senderTabId);
        const tabs = await chrome.tabs.query({});
        const candidates = tabs.filter(
            (t) => t.openerTabId === senderTabId && t.windowId !== sender.windowId && t.url === 'about:blank',
        );
        // More than one match means the guess is not identifying anything; widening the
        // rule is safer than pointing it at the wrong tab.
        return candidates.length === 1 ? candidates[0].id : null;
    } catch (e) {
        logMessage('[DNR] findPipTabId: ' + e.message);
        return null;
    }
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
function handlePrepareVideoUrlForPip(message, sendResponse, senderTabId) {
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

        /*
         * The float's own tab, when it can be identified — see `findPipTabId`. Adding it
         * to both conditions is what stops these rules from reaching the rest of the
         * browser while the window is open. `null` keeps the old, domain-only shape.
         */
        const pipTabId = await findPipTabId(senderTabId);
        const onlyPipTab = pipTabId === null ? {} : { tabIds: [pipTabId] };
        logMessage(
            pipTabId === null
                ? '[DNR] PiP tab not identified; rules stay scoped to the domain alone'
                : `[DNR] PiP rules scoped to tab ${pipTabId}`,
        );

        const ruleId = SIDEPANEL_RULE_ID + 2;
        const rule = {
            id: ruleId,
            priority: 9999,
            action: {
                type: 'modifyHeaders',
                responseHeaders: responseHeaders,
            },
            condition: {
                ...onlyPipTab,
                requestDomains: [registrableDomain(target.hostname)],
                // Belt to the `isPaymentHost` braces above, for the same reason the side
                // panel's rules carry it: a guard that runs once cannot bind a rule that
                // stands afterwards.
                excludedRequestDomains: NEVER_STRIP_FRAMING_HOSTS,
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
                             * The float's own tab. Without it this rule replayed the
                             * user's session cookie into *any* frame of this domain
                             * anywhere in the browser — measured, including a
                             * third-party `<iframe>` in another tab, where the browser
                             * had deliberately withheld it.
                             */
                            ...onlyPipTab,
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
            /*
             * The cookies go with the rules. They were copied so a site could be framed;
             * once it is not framed any more, the copy has no purpose and no business
             * still being there. Failing to clear them must not fail the cleanup of the
             * rules, which is the half with security consequences, so it is caught here
             * rather than left to the outer handler.
             */
            let dropped = 0;
            try {
                dropped = await clearAllMirroredCookies();
            } catch (e) {
                logMessage('[DNR] mirrored cookie cleanup failed: ' + e.message);
            }
            logMessage(
                `[DNR] Side panel rules cleaned up.` + (dropped ? ` ${dropped} mirrored cookie(s) removed.` : ''),
            );
            sendResponse({ success: true });
        } catch (error) {
            console.error('[DNR] Error cleaning up rule:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}
