/**
 * [AI INSTRUCTION]
 * WHERE THE PAYMENT PAGE LIVES, AND THE RULES FOR TALKING TO IT.
 *
 * The extension itself can never run a payment form. Manifest V3 pins
 * `script-src 'self'`, so Stripe.js, the PayPal SDK and Google's `pay.js` cannot load
 * in `popup.html` or `listGroup.html`, and bundling them locally is both a Web Store
 * violation and something Stripe.js refuses to do. The form therefore lives on a page
 * we host, and the panel frames it.
 *
 * WHY THAT IS SAFE, and why it must not be done the way the web view is done: the
 * hosted page opts *in* by sending `frame-ancestors chrome-extension://<id>`. Nothing
 * strips a header. `handlers/dnr.js` — which removes X-Frame-Options and CSP for the
 * side panel's web view — must never be pointed at a payment host; it refuses to, by
 * name, and that guard is deliberate.
 *
 * SECURITY: `PAYMENT_ORIGIN` is the only origin the postMessage bridge will accept a
 * message from, and every message also has to carry the per-open nonce. Card data
 * never crosses into the extension — the frame is cross-origin, so it cannot.
 */
/**
 * The origin serving the payment page. Origin comparisons are made against exactly this
 * string, so it carries no trailing slash and no path.
 *
 * The page lives in a separate repository (`Intelligent-Workspace-Web`), deployed to
 * Vercel at `intelligentworkspace.genkipool.com`. It is a subdomain of its own and not
 * `genkipool.com`, which serves an unrelated older site: pointing this at the parent
 * domain frames that site instead, and every donation fails with nothing in the panel
 * to say why.
 *
 * PRODUCTION IS THE DEFAULT, and that is deliberate. This used to be a pair of lines
 * with the local one uncommented, which meant a release could ship pointing at
 * `localhost` — a build where every donation silently goes nowhere, with nothing in the
 * UI to say so. Now the only way to get a local origin is to set it in `.env.local`,
 * which git ignores, so it cannot be committed by accident.
 *
 *     # .env.local
 *     VITE_PAYMENT_ORIGIN=http://localhost:4321
 */
export const PAYMENT_ORIGIN = import.meta.env.VITE_PAYMENT_ORIGIN || 'https://intelligentworkspace.genkipool.com';

/**
 * `/pay` is a route of the marketing site, not a subdomain of its own, and the site
 * pre-renders one page per language: `/pay` in English, `/es/pay` in Spanish.
 *
 * Asking for the right one here rather than passing `?locale=` means the panel gets a
 * page whose copy is already correct in the HTML, with no flash of English while a
 * script swaps it. Any language the site does not build falls back to English, which is
 * what the site itself does for an unknown prefix.
 */
const LOCALISED_PAYMENT_PATHS = { en: '/pay', es: '/es/pay' };

export function paymentPagePath(locale) {
    return LOCALISED_PAYMENT_PATHS[locale] || LOCALISED_PAYMENT_PATHS.en;
}

/**
 * The preset amounts, in whole euros. The page offers these as chips plus a free
 * field — but the amount is re-validated server-side in `api/intent.js`, because a
 * framed page's query string is user input like any other.
 */
export const DONATION_AMOUNTS = [1, 5, 10];

export const DONATION_DEFAULT_AMOUNT = 5;

export const DONATION_CURRENCY = 'eur';

/**
 * The theme tokens handed to the page so Stripe's Appearance API can match whatever
 * theme the user picked. Only these six travel: they are the ones the payment form
 * actually paints with, and a shorter list is a shorter query string.
 */
export const PAYMENT_THEME_TOKENS = [
    '--bg-color',
    '--bg-panel-color',
    '--text-color',
    '--text-on-color',
    '--interactive-color',
    // The colour a focused field's border takes on the rules page. Without it the
    // payment form focused in the extension's blue while every other input in the
    // extension focused in the action colour.
    '--action-color',
    '--border-color',
    '--error-color',
];

/** Messages the hosted page is allowed to send. Anything else is dropped. */
export const PAYMENT_MESSAGE_TYPES = Object.freeze({
    READY: 'pay:ready',
    SUCCESS: 'pay:success',
    ERROR: 'pay:error',
    CLOSE: 'pay:close',
});
