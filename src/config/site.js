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
 * Where each of the extension's languages lives on the website. The site names two of
 * them by their base code — Brazilian Portuguese is `/pt` and Simplified Chinese `/zh`;
 * `/pt-br` and `/zh-cn` answer 404 — so the path cannot be derived from the code.
 * English lives at the root. A language missing here falls back to English.
 */
const SITE_PATHS = {
    en: '',
    es: '/es',
    de: '/de',
    fr: '/fr',
    it: '/it',
    pt_BR: '/pt',
    ru: '/ru',
    hi: '/hi',
    ja: '/ja',
    zh_CN: '/zh',
    ko: '/ko',
};

/**
 * The address of a page of the website.
 *
 * @param {'support'|'privacy'|'terms'} page
 * @param {string} [language] The reader's language; the extension's own by default.
 * @returns {string}
 */
export function siteUrl(page, language = activeLanguage()) {
    return `${SITE_ORIGIN}${sitePathPrefix(language)}/${page}`;
}

/** The path the website serves a language under: `''` for English, `/fr`, `/pt`… */
export function sitePathPrefix(language = activeLanguage()) {
    return SITE_PATHS[resolveLanguage(language)] ?? SITE_PATHS[DEFAULT_LANGUAGE];
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
