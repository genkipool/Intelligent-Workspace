/**
 * site.js — the pages of the website, in the reader's language.
 *
 * The site publishes one page per language and falls back to English for a prefix it
 * does not know. Working that out was copied into every component that linked to it,
 * which is a rule that only has to drift once to send half the product's links to the
 * wrong language; it is decided here instead.
 */

export const SITE_ORIGIN = 'https://intelligentworkspace.genkipool.com';

/** The language the extension is being read in, or nothing outside the browser. */
const uiLanguage = () => (typeof chrome !== 'undefined' ? chrome.i18n?.getUILanguage?.() : '') || '';

/**
 * The address of a page of the website.
 *
 * @param {'support'|'privacy'|'terms'} page
 * @param {string} [language] The reader's language; the extension's own by default.
 * @returns {string}
 */
export function siteUrl(page, language = uiLanguage()) {
    const prefix = language.toLowerCase().startsWith('es') ? '/es' : '';
    return `${SITE_ORIGIN}${prefix}/${page}`;
}
