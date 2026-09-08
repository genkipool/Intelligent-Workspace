/**
 * panelViews.js — every view `listGroup.html` can be opened straight into.
 *
 * The page is opened at `?view=…` from the popup, from a keyboard command and from the
 * worker, and three separate things have to agree about that view *before the first
 * paint*: what the header is called, whether the group list shows underneath, and which
 * controls the toolbar draws. Each of those used to carry its own list, so a view added
 * to one and forgotten in the others booted as the group list and was covered a few
 * frames later — which is exactly the flash the rest of this page was built to avoid.
 *
 * One table, then. Adding a view is an entry here.
 */

import { SITE_DOCUMENT_TITLES } from '../../config/site.js';

/** What the header calls each view, before any storage has been read. */
const VIEW_TITLE_KEYS = {
    groups: 'listTabGroups',
    bookmarks: 'bookmarksViewTitle',
    history: 'historyViewTitle',
    recent: 'recentlyClosedViewTitle',
    reading: 'readingListViewTitle',
    downloads: 'downloadsViewTitle',
    gemini: 'geminiViewTitle',
    notes: 'notesViewTitle',
    gallery: 'screenshotGalleryTitle',
    url: 'webViewTitle',
    payment: 'contribution',
};

/**
 * The views that are an iframe filling the panel.
 *
 * They differ only in what the header says and what goes in the frame, so they borrow
 * the web view's chrome: its controls, and its habit of not painting the group list
 * underneath. Without this a contribution sheet or a policy booted showing the whole
 * group list first.
 */
const FRAMED_VIEWS = new Set(['url', 'payment', 'document']);

/** The views painted *over* the group list rather than replacing it. */
export const OVERLAY_VIEWS = new Set(['notes', 'gallery', 'gemini', ...FRAMED_VIEWS]);

/**
 * The title a view claims at the first paint, or null when the URL names no view this
 * page knows — in which case the caller falls back to the group list.
 *
 * A document is called what it is: the side browser view. Naming it after the page in
 * the frame meant the header read "Soporte" and became "Navegador Lateral" a few frames
 * later, once the view finished opening — and a header that changes on its own is the
 * flash, whichever of the two words is the better one. `document` still needs `params`,
 * because a page this route does not publish claims no title at all and falls through
 * to the group list rather than framing nothing.
 *
 * @param {string|null} view
 * @param {URLSearchParams} params
 * @returns {string|null}
 */
export function bootTitleKey(view, params) {
    if (view === 'document') return SITE_DOCUMENT_TITLES[params.get('page')] ? 'webViewTitle' : null;
    return VIEW_TITLE_KEYS[view] || null;
}

/**
 * The view whose layout and controls a boot should start from. A framed view has none
 * of its own: it wears the web view's.
 *
 * @param {string|null} view
 * @returns {string}
 */
export function bootLayoutView(view) {
    if (FRAMED_VIEWS.has(view)) return 'url';
    return VIEW_TITLE_KEYS[view] ? view : 'groups';
}

/**
 * The framed views with nothing to search and nothing to navigate.
 *
 * The web view keeps the search row — typing there navigates its frame — but a
 * contribution sheet and a published document have no use for it, and the row is two
 * dozen controls sitting over a page that ignores every one of them. The openers hide it
 * by hand at the end of the boot, which is late enough to be seen: the row was drawn and
 * then taken away, and that is the flash. The class goes on from the URL instead, and
 * `closeUrlInPanel` takes it off when the frame goes.
 */
const BARE_FRAMED_VIEWS = new Set(['payment', 'document']);

/**
 * Whether a view is framed with no search row of its own.
 *
 * @param {string|null} view
 * @returns {boolean}
 */
export function isBareFramedView(view) {
    return BARE_FRAMED_VIEWS.has(view);
}

/**
 * Whether a view is an iframe filling the panel.
 *
 * `body.url-view-active` is what the stylesheet hides the group toolbar behind, and
 * `enterFramedView` only adds it once the boot has run — hundreds of milliseconds after
 * the first paint, during which the whole group toolbar was drawn and then swept away.
 * That is the flash. The class is claimed from the URL instead, the way the assistant
 * claims `gemini-view-active` in the markup.
 *
 * @param {string|null} view
 * @returns {boolean}
 */
export function isFramedView(view) {
    return FRAMED_VIEWS.has(view);
}
