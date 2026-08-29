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

import {
    PAYMENT_ORIGIN,
    PAYMENT_PAGE_URL,
    PAYMENT_MESSAGE_TYPES,
    PAYMENT_THEME_TOKENS,
    DONATION_CURRENCY,
    DONATION_DEFAULT_AMOUNT,
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
 * @param {object} provider An entry from `donationProviders.js` with `kind: 'payment'`.
 * @param {object} [options]
 * @param {string} [options.nonce] Omit for the about page, which opens a plain tab and
 *   has no bridge to authenticate.
 */
export function buildPaymentUrl(provider, { nonce = null, amount = DONATION_DEFAULT_AMOUNT } = {}) {
    const url = new URL(PAYMENT_PAGE_URL);
    url.searchParams.set('method', provider.method);
    url.searchParams.set('amount', String(amount));
    url.searchParams.set('currency', DONATION_CURRENCY);
    url.searchParams.set('locale', (chrome.i18n?.getUILanguage?.() || navigator.language || 'en').slice(0, 2));
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
            default:
                break;
        }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
}
