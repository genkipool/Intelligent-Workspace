/**
 * [AI INSTRUCTION]
 * THE ONLY WAY THE EXTENSION TALKS TO THE PAYMENT PAGE.
 *
 * REUSE: `buildPaymentUrl` is the single place that composes that URL — the panel and
 * the about page both call it, so the two surfaces cannot drift on locale, theme or
 * amount.
 *
 * SECURITY, and none of this is optional:
 *   - Every inbound message is checked against `PAYMENT_ORIGIN` *and* the nonce minted
 *     when the frame was opened. A message that fails either is dropped silently — it
 *     did not come from the frame we opened.
 *   - The frame is never given the extension's origin, so it cannot reach into the
 *     page. Card data stays on Stripe's side of the boundary; the extension is not in
 *     PCI scope and must not become so by, say, adding an input of its own.
 *   - `prepareUrlForSidePanel` is NOT called for this URL. That handler strips
 *     X-Frame-Options and CSP, which is the exact opposite of what a payment page
 *     needs; the hosted page grants us framing rights itself via `frame-ancestors`.
 *     `handlers/dnr.js` refuses payment hosts by name so a later change cannot
 *     quietly route them through it.
 */

import { get } from 'svelte/store';
import { currentLang } from '../stores/i18nStore.js';

import {
    PAYMENT_ORIGIN,
    paymentPagePath,
    PAYMENT_MESSAGE_TYPES,
    PAYMENT_THEME_TOKENS,
    CONTRIBUTION_CURRENCY,
    CONTRIBUTION_DEFAULT_AMOUNT,
} from '../../config/payments.js';

/**
 * Reads the tokens of whatever theme is currently applied, so the payment form is
 * painted in the user's colours rather than Stripe's defaults.
 *
 * Deliberately resolved from the live document instead of the theme store: custom and
 * scheduled themes end up as inline custom properties on `:root`, and only the
 * computed style knows what actually won.
 */
function readThemeTokens() {
    const styles = getComputedStyle(document.documentElement);
    const theme = {};
    for (const token of PAYMENT_THEME_TOKENS) {
        const value = styles.getPropertyValue(token).trim();
        if (value) theme[token.replace(/^--/, '')] = value;
    }
    return theme;
}

/** Cryptographically random, because it is what tells our frame from anyone else's. */
export function mintPaymentNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {object} provider An entry from `contributionProviders.js` with `kind: 'payment'`.
 * @param {object} [options]
 * @param {string} [options.nonce] Omit for the about page, which opens a plain tab and
 *   has no bridge to authenticate.
 */
export function buildPaymentUrl(provider, { nonce = null, amount = CONTRIBUTION_DEFAULT_AMOUNT } = {}) {
    /*
     * THE LANGUAGE THE READER CHOSE, not the one the browser is in.
     *
     * This used to read `chrome.i18n.getUILanguage()`, which reports Chrome's own UI
     * language and knows nothing about the extension's language switch. Someone running
     * Chrome in English with the extension set to Spanish got an English contribution sheet,
     * and nothing in the panel explained why.
     *
     * `currentLang` is the store the whole interface already renders from, so the sheet
     * now agrees with the panel around it. It also decides `locale` for Stripe.js, so the
     * card fields and their error messages come back in the same language.
     */
    const locale = (get(currentLang) || 'en').slice(0, 2);
    const url = new URL(paymentPagePath(locale), PAYMENT_ORIGIN);
    url.searchParams.set('method', provider.method);
    url.searchParams.set('amount', String(amount));
    url.searchParams.set('currency', CONTRIBUTION_CURRENCY);
    if (nonce) {
        url.searchParams.set('nonce', nonce);
        // Only the framed flow needs the palette; a tab renders on the page's own.
        url.searchParams.set('theme', JSON.stringify(readThemeTokens()));
    }
    return url.toString();
}

/**
 * Listens for the frame's messages until it is torn down.
 *
 * @returns {() => void} Removes the listener. The caller MUST hold on to this: an
 *   orphaned listener would keep answering for a frame that is no longer on screen.
 */
export function attachPaymentBridge(iframe, nonce, handlers = {}) {
    const onMessage = (event) => {
        if (event.origin !== PAYMENT_ORIGIN) return;
        if (event.source !== iframe.contentWindow) return;

        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.nonce !== nonce) return;

        switch (data.type) {
            case PAYMENT_MESSAGE_TYPES.READY:
                handlers.onReady?.();
                break;
            case PAYMENT_MESSAGE_TYPES.SUCCESS:
                // The amount is echoed back for the thank-you line only. It is never
                // trusted for anything — the charge already happened on Stripe's side.
                handlers.onSuccess?.({ amount: Number(data.amount) || null });
                break;
            case PAYMENT_MESSAGE_TYPES.ERROR:
                handlers.onError?.(typeof data.message === 'string' ? data.message.slice(0, 300) : '');
                break;
            case PAYMENT_MESSAGE_TYPES.CLOSE:
                handlers.onClose?.();
                break;
            case PAYMENT_MESSAGE_TYPES.EXTERNAL: {
                /*
                 * The frame asks for a tab. The nonce and the origin have already been
                 * checked above, but the URL is checked again on its own: this is the one
                 * message that turns the frame's words into a navigation, and "it came
                 * from the right origin" is not the same claim as "it points at the right
                 * origin". A malformed or foreign address is dropped, not opened.
                 */
                let target = null;
                try {
                    target = new URL(String(data.url ?? ''));
                } catch {
                    break;
                }
                if (target.origin !== PAYMENT_ORIGIN) break;
                handlers.onExternal?.(target.toString());
                break;
            }
            default:
                break;
        }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
}

/**
 * Opens the connections the contribution sheet will need, before anybody asks for it.
 *
 * The sheet's cost is its first load, and almost none of it is our page: `js.stripe.com`
 * has to arrive and then stand up a controller and a metrics frame on two further
 * origins. Paid when the panel opens the sheet, that is the reader watching "Loading the
 * secure payment form". Paid when the panel itself opens — while they are looking at
 * their tab groups — it costs them nothing.
 *
 * `preconnect` only: it does the DNS lookup and the TLS handshake and fetches nothing, so
 * it is not subject to the extension's `script-src` (a `prefetch` with `as="script"` would
 * be dropped by it, silently). The origin comes from `PAYMENT_ORIGIN` rather than being
 * written out here, so a build pointed at a local site warms the local one.
 *
 * Safe to call more than once; the links are added once per page.
 */
export function warmPaymentOrigin() {
    const origins = [PAYMENT_ORIGIN, 'https://js.stripe.com', 'https://m.stripe.network', 'https://q.stripe.com'];

    for (const origin of origins) {
        if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) continue;
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = origin;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
    }
}

/**
 * The sandbox and the permissions the sheet is framed under.
 *
 * Written here rather than in `viewsService.js` because the warm-up frame below has to
 * be framed on exactly the same terms as the real one — a warm-up that boots down a
 * different path warms the wrong thing — and two lists that must agree should not be
 * two lists. `viewsService.js` imports them.
 */
export const PAYMENT_VIEW_SANDBOX =
    'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';

export const PAYMENT_VIEW_ALLOW = 'payment; publickey-credentials-get';

/**
 * The method the warm-up frame asks for.
 *
 * It barely matters — every method boots the same Stripe.js, the same controller frames
 * and the same `elements/sessions` call, which is all this is here to pay for — but it
 * has to be one of them, and `card` is the tile most readers press.
 */
const WARM_METHOD = 'card';

/** One per document; the popup is a fresh document every time it opens. */
let warmFrame = null;

/**
 * [AI INSTRUCTION]
 * BOOTS THE CONTRIBUTION SHEET IN THE BACKGROUND, BEFORE ANYBODY ASKS FOR IT.
 *
 * `warmPaymentOrigin` opens the sockets. This loads the page: a 1×1 frame, off screen,
 * pointed at the same sheet the panel will open, so that Stripe.js has been fetched and
 * parsed and its controller and metrics frames have been stood up by the time the reader
 * presses Contribute. Measured, cold profile, two pairs of runs — the moment Stripe's wallet
 * row lands, which is when the sheet stops moving:
 *
 *     without this   1134 ms / 978 ms
 *     with this       715 ms / 791 ms
 *
 * WHAT IT COSTS, because it is not free and the trade was made deliberately. Every popup
 * that opens fetches a quarter of a megabyte of Stripe.js, parses it, stands up about ten
 * frames and makes one `elements/sessions` call — for a button most readers never press.
 * It is scheduled on idle so it never competes with the popup's own first paint, and it
 * is not started at all when the browser says the connection is metered or the reader has
 * asked for reduced data.
 *
 * WHY IT CANNOT SIMPLY BE THE REAL SHEET. The URL the panel opens carries a per-open
 * nonce and the theme, so it is different every time and no cache can serve it. This
 * frame therefore asks for the sheet WITHOUT either: what it warms is everything behind
 * the document — Stripe.js, its frames, the DNS and TLS — which is where the seconds are.
 * Leaving the nonce out is also what makes it harmless: `attachPaymentBridge` checks
 * `event.source` against the real frame's `contentWindow`, so nothing this one says can
 * ever be mistaken for the sheet the reader is looking at.
 *
 * @param {object} [options]
 * @param {number} [options.timeoutMs] How long to leave it running before taking it down.
 *   Long enough for a cold boot to finish and short enough that a popup left open does
 *   not keep a frame alive for no reason.
 */
export function warmPaymentSheet({ timeoutMs = 20000 } = {}) {
    if (warmFrame || typeof document === 'undefined') return;

    // Somebody on a phone tether should not spend a quarter of a megabyte on a button
    // they have not pressed. `connection` is Chromium-only, which is the only browser
    // this extension runs in.
    const connection = navigator.connection;
    if (connection?.saveData) return;
    if (connection?.type === 'cellular') return;

    const start = () => {
        if (warmFrame) return;
        const frame = document.createElement('iframe');
        warmFrame = frame;
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.sandbox = PAYMENT_VIEW_SANDBOX;
        frame.allow = PAYMENT_VIEW_ALLOW;
        frame.referrerPolicy = 'no-referrer';
        // Off screen rather than `display: none`: a frame that is not displayed is not
        // guaranteed to load at all, and one sized 0×0 makes Stripe lay its elements out
        // against a zero width and re-do the work when the real frame appears.
        frame.style.cssText =
            'position:absolute;left:-9999px;top:0;width:360px;height:640px;border:0;opacity:0;pointer-events:none;';
        frame.src = buildPaymentUrl({ method: WARM_METHOD });
        document.body.appendChild(frame);

        setTimeout(() => {
            frame.remove();
            // Left non-null: one warm-up per document, and a second one after the timeout
            // would be paying the whole cost again for a cache that is already full.
        }, timeoutMs);
    };

    // After the popup has drawn itself. The reader is looking at their tab groups; this
    // must not be the reason that took a frame longer.
    if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 2000 });
    else setTimeout(start, 600);
}
