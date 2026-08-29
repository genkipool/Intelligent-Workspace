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
 * The page itself lives in a separate repository (`genkipool-site`), deployed to Vercel.
 * Swap the two lines below to point the extension at a local `vercel dev`; put the
 * production one back before committing, because a build aimed at localhost is a build
 * where donations silently go nowhere.
 */
export const PAYMENT_ORIGIN = 'http://localhost:3000';
// export const PAYMENT_ORIGIN = 'https://genkipool.com';

/** `/pay` is a route of the marketing site, not a subdomain of its own. */
export const PAYMENT_PAGE_URL = `${PAYMENT_ORIGIN}/pay`;

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
    '--interactive-color',
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
