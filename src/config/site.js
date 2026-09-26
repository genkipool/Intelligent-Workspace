/**
 * site.js — the pages of the website, in the reader's language.
 *
 * The site publishes one page per language and falls back to English for a prefix it
 * does not know. Working that out was copied into every component that linked to it,
 * which is a rule that only has to drift once to send half the product's links to the
 * wrong language; it is decided here instead.
 */

import { activeLanguage, resolveLanguage, DEFAULT_LANGUAGE } from '../utils/i18n.js';

export const SITE_ORIGIN = 'https://intelligentworkspace.genkipool.com';

/**
 * The address of a page of the website.
 *
 * @param {'support'|'privacy'|'terms'} page
 * @param {string} [language] The reader's language; the extension's own by default.
 * @returns {string}
 */
export function siteUrl(page, language = activeLanguage()) {
    const code = resolveLanguage(language);
    // English lives at the root; every other language under its own code.
    const prefix = code === DEFAULT_LANGUAGE ? '' : `/${code.replace('_', '-').toLowerCase()}`;
    return `${SITE_ORIGIN}${prefix}/${page}`;
}

/**
 * The documents the panel will frame, and the label each is offered under.
 *
 * A table rather than a URL parameter, and the reason the route names a page instead of
 * carrying an address: nothing else can be pushed through it. The header does not use
 * these — a framed document is called the browser view, like anything else in a frame.
 */
export const SITE_DOCUMENT_TITLES = {
    privacy: 'popupPrivacyPolicyLink',
    support: 'popupSupportLink',
    terms: 'popupTermsLink',
};
