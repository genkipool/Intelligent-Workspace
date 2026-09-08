/**
 * The single set of rules a rule has to satisfy.
 *
 * These checks used to live inside `RuleModal.svelte`, so only the rules a person
 * typed by hand went through them: the import path in `Rules.svelte` wrote whatever
 * the file contained straight into `chrome.storage.sync`, `null` entries included,
 * and the rule list then crashed while rendering them. Both paths now come here.
 *
 * Every failure is reported as an i18n key plus its `$1`/`$2` parameters, the shape
 * `showNotification` and the modal's error line already expect.
 */

export const MAX_RULE_NAME_LENGTH = 16;

const VALID_SCHEMES = ['http://', 'https://', 'file:///', 'chrome://', 'chrome-extension://'];

/** The scheme a URL typed without one is read as. */
export const DEFAULT_SCHEME = 'https://';

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Strict 4-octet IPv4 pattern (each octet 0-255, no leading zeros unless 0). */
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** DNS label pattern (alphanumeric and internal hyphens, max 63 chars). */
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/** TLD pattern (at least one letter or IDN punycode prefix; never purely numeric). */
const TLD_RE = /^(?:[a-z0-9-]*[a-z][a-z0-9-]*|xn--[a-z0-9-]+)$/i;

/** Whether the text already carries a scheme of its own, valid or not. */
export function hasScheme(url) {
    return SCHEME_RE.test(String(url).trim());
}

/**
 * The stored form of what a person typed: `www.example.com` becomes
 * `https://www.example.com`, anything already carrying a scheme is left alone.
 *
 * Only the modal's textarea is scheme-less. What reaches storage always has a
 * scheme, because the rule matcher, the links on the cards and `chrome.tabs.create`
 * all need a whole URL.
 */
export function withDefaultScheme(url) {
    const trimmed = String(url).trim();
    return hasScheme(trimmed) ? trimmed : DEFAULT_SCHEME + trimmed;
}

/**
 * The form shown in the textarea: `https://` and `http://` are dropped, the rest of
 * the URL is left untouched, so a full URL is still seen in full. Other schemes
 * (`file:///`, `chrome://`) are kept, as they cannot be guessed back.
 */
export function stripDefaultScheme(url) {
    return String(url)
        .trim()
        .replace(/^https?:\/\//i, '');
}

/**
 * The URLs of a rule as the textarea shows them.
 *
 * A URL only loses its scheme when no other URL of the same rule ends up looking
 * like it: a rule holding both `http://example.com` and `https://example.com` keeps
 * them whole, or the two lines would become indistinguishable and one of the pair
 * would be lost on save.
 */
export function toDisplayUrls(urls) {
    const list = urls || [];
    const stripped = list.map(stripDefaultScheme);
    const counts = new Map();
    for (const s of stripped) counts.set(s, (counts.get(s) || 0) + 1);
    return list.map((url, i) => (counts.get(stripped[i]) > 1 ? String(url).trim() : stripped[i]));
}

/**
 * Turns a textarea line back into the URL to store.
 *
 * `previousUrls` are the URLs the rule was opened with: a line the user did not
 * touch is given back the exact scheme it had, so editing a rule never silently
 * turns its `http://` entries into `https://`.
 */
export function toStoredUrl(line, previousUrls) {
    const trimmed = String(line).trim();
    if (hasScheme(trimmed)) return trimmed;
    const previous = (previousUrls || []).find((url) => stripDefaultScheme(url) === trimmed);
    if (previous) return String(previous).trim();
    // A line that is not a URL at all is left exactly as typed: it stops the save
    // either way, and the error should quote what the user wrote.
    return isValidUrl(trimmed) ? DEFAULT_SCHEME + trimmed : trimmed;
}

/**
 * Canonical form of a URL for comparison purposes.
 *
 * The fragment is dropped by cutting the normalised href rather than by assigning to
 * u.hash, so the URL is never mutated after it is built. Checked to give the same
 * answer for http, file, chrome and bracketed IPv6 addresses, with and without a
 * fragment.
 */
export function normalizeUrl(url) {
    try {
        return new URL(withDefaultScheme(url)).href.split('#')[0].replace(/\/$/, '');
    } catch {
        return String(url).trim().toLowerCase();
    }
}

/**
 * Extracts the raw host from a URL before the WHATWG URL parser mutates or canonicalizes it.
 *
 * `new URL('https://3242342424')` parses 3242342424 as a 32-bit integer IPv4 address
 * and rewrites `hostname` to `193.66.56.24`. Extracting the host string as written allows
 * detecting whether the user actually typed a valid hostname or a raw integer.
 */
export function extractRawHost(urlString) {
    let s = String(urlString).trim();
    const schemeMatch = s.match(SCHEME_RE);
    if (schemeMatch) {
        s = s.slice(schemeMatch[0].length);
    }
    s = s.split(/[/?#]/)[0];
    const atIdx = s.lastIndexOf('@');
    if (atIdx !== -1) s = s.slice(atIdx + 1);
    if (s.startsWith('[')) {
        const closeIdx = s.indexOf(']');
        if (closeIdx !== -1) return s.slice(0, closeIdx + 1);
        return s;
    }
    const colonIdx = s.indexOf(':');
    if (colonIdx !== -1) return s.slice(0, colonIdx);
    return s;
}

/**
 * Validates the host part of an http(s) URL.
 *
 * Ensures the host was written as an intentional, valid web host:
 * - `localhost`
 * - Bracketed IPv6 (e.g. `[2002::1]`)
 * - Canonical 4-octet IPv4 (e.g. `192.168.1.1`)
 * - Domain name with at least 2 labels and a non-numeric TLD (e.g. `example.com`)
 *
 * Pure numbers/integers like `3242342424` or `12345` are rejected.
 */
export function isValidHost(rawHost, parsedHostname) {
    if (!rawHost || !parsedHostname) return false;
    if (/^\d+$/.test(rawHost)) return false;

    if (parsedHostname === 'localhost' && rawHost.toLowerCase() === 'localhost') {
        return true;
    }

    if (parsedHostname.startsWith('[') && parsedHostname.endsWith(']')) {
        return rawHost.toLowerCase() === parsedHostname.toLowerCase();
    }

    if (IPV4_RE.test(parsedHostname)) {
        return rawHost === parsedHostname;
    }

    const labels = parsedHostname.split('.');
    if (labels.length < 2) return false;
    if (!labels.every((label) => DNS_LABEL_RE.test(label))) return false;
    const tld = labels[labels.length - 1];
    if (!TLD_RE.test(tld)) return false;

    return true;
}

/** URL validation shared with the background rule matcher. */
export function isValidUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') return false;
    const trimmedUrl = urlString.trim();
    if (trimmedUrl.includes(' ')) return false;

    const schemePresent = hasScheme(trimmedUrl);
    if (schemePresent && !VALID_SCHEMES.some((scheme) => trimmedUrl.startsWith(scheme))) {
        return false;
    }

    if (
        trimmedUrl.startsWith('file:///') ||
        trimmedUrl.startsWith('chrome://') ||
        trimmedUrl.startsWith('chrome-extension://')
    ) {
        try {
            new URL(trimmedUrl);
            return true;
        } catch {
            return false;
        }
    }

    const fullUrl = schemePresent ? trimmedUrl : DEFAULT_SCHEME + trimmedUrl;
    let url;
    try {
        url = new URL(fullUrl);
    } catch {
        return false;
    }

    const rawHost = extractRawHost(trimmedUrl);
    return isValidHost(rawHost, url.hostname);
}

/**
 * Validates one rule against the rules already stored.
 *
 * @param {string} name
 * @param {string} color
 * @param {string[]} urls
 * @param {Array} rules Rules already stored.
 * @param {number} [editingIdx] Index being edited, skipped when looking for clashes.
 * @returns {{valid: boolean, message?: string, params?: string[]}}
 */
export function validateRule(name, color, urls, rules, editingIdx) {
    if (!name) return { valid: false, message: 'enterRuleName', params: [] };
    if (name.length > MAX_RULE_NAME_LENGTH) {
        return { valid: false, message: 'ruleNameTooLongError', params: [name] };
    }
    if (!color) return { valid: false, message: 'selectColor', params: [] };
    if (urls.length === 0) return { valid: false, message: 'enterOneUrl', params: [] };

    const invalidUrls = urls.filter((u) => !isValidUrl(u));
    if (invalidUrls.length > 0) {
        return { valid: false, message: 'invalidUrls', params: [invalidUrls.join(', ')] };
    }

    const currentNameLower = name.toLowerCase();
    const isDuplicateName = rules.some((r, idx) => r.name.toLowerCase() === currentNameLower && idx !== editingIdx);
    if (isDuplicateName) return { valid: false, message: 'duplicateRuleName', params: [] };

    const normUrls = urls.map(normalizeUrl);
    const uniqueUrls = new Set(normUrls);
    if (uniqueUrls.size !== normUrls.length) {
        const counts = {};
        const duplicates = [];
        urls.forEach((u) => {
            const norm = normalizeUrl(u);
            counts[norm] = (counts[norm] || 0) + 1;
            if (counts[norm] === 2) duplicates.push(u);
        });
        return { valid: false, message: 'duplicateUrlsInRule', params: [name, duplicates.join(', ')] };
    }

    for (let i = 0; i < rules.length; i++) {
        if (i === editingIdx) continue;
        const otherRule = rules[i];
        for (const otherUrl of otherRule.urls) {
            if (normUrls.includes(normalizeUrl(otherUrl))) {
                const conflictingUrl = urls.find((u) => normalizeUrl(u) === normalizeUrl(otherUrl));
                return {
                    valid: false,
                    message: 'urlInOtherRule',
                    params: [conflictingUrl || otherUrl, otherRule.name],
                };
            }
        }
    }

    return { valid: true };
}

/** Whether an entry parsed out of a file has the shape of a rule at all. */
function hasRuleShape(entry) {
    return (
        entry !== null &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        typeof entry.name === 'string' &&
        typeof entry.color === 'string' &&
        Array.isArray(entry.urls) &&
        entry.urls.every((u) => typeof u === 'string') &&
        typeof entry.active === 'boolean'
    );
}

/**
 * Reads the rules out of the parsed contents of an import file.
 *
 * Exports written by this page wrap them in `customRules`; older files are a bare
 * array, and `rules` is accepted because the page used to read that key too.
 *
 * @returns {Array|null} null when the file holds nothing that looks like a rule list.
 */
function extractRuleList(importedData) {
    if (Array.isArray(importedData)) return importedData;
    if (importedData && typeof importedData === 'object') {
        if (Array.isArray(importedData.customRules)) return importedData.customRules;
        if (Array.isArray(importedData.rules)) return importedData.rules;
    }
    return null;
}

/**
 * Validates a whole import file before rules reach storage.
 *
 * In 'add' mode, rules that pass validation and do not clash with existing rules are
 * added; rules with errors (e.g. duplicate name, invalid URL, or URL collision) are
 * skipped and reported as notifications so the valid ones are still imported.
 *
 * In 'overwrite' mode, the entire file replaces existing rules only if the file
 * itself is internally valid (no duplicate names, no URL collisions between rules in
 * the file, and all rules valid).
 *
 * @param {unknown} importedData Already parsed JSON.
 * @param {Array} existingRules Rules currently stored.
 * @param {'add'|'overwrite'} mode
 * @returns {{valid: boolean, rules?: Array, errors?: Array<{message: string, params: string[]}>}}
 */
export function validateImportedRules(importedData, existingRules, mode) {
    const rawRules = extractRuleList(importedData);
    if (!rawRules || rawRules.length === 0) {
        return { valid: false, errors: [{ message: 'errorImportingRulesInvalid', params: [] }] };
    }

    if (!rawRules.every(hasRuleShape)) {
        return { valid: false, errors: [{ message: 'errorImportingRulesInvalid', params: [] }] };
    }

    const cleanedRules = rawRules.map((r) => ({
        name: r.name,
        color: r.color,
        // A file may hold scheme-less URLs too, now that the modal accepts them, but
        // what is stored always carries a scheme. Only valid scheme-less URLs receive
        // the default scheme; invalid entries retain their raw form for error reporting.
        urls: r.urls
            .map((u) => u.trim())
            .filter((u) => u)
            .map((u) => (isValidUrl(u) && !hasScheme(u) ? withDefaultScheme(u) : u)),
        active: r.active ?? true,
        isStarred: r.isStarred ?? false,
    }));

    const errors = [];

    if (mode === 'overwrite') {
        // Duplicate names inside the file itself.
        const seenNames = new Set();
        const duplicateNames = new Set();
        for (const rule of cleanedRules) {
            const key = rule.name.trim().toLowerCase();
            if (seenNames.has(key)) duplicateNames.add(rule.name);
            seenNames.add(key);
        }
        if (duplicateNames.size > 0) {
            errors.push({ message: 'duplicateRuleNameInFile', params: [[...duplicateNames].join(', ')] });
        }

        // Spaces in a name are refused on import
        const spacedNames = cleanedRules.map((r) => r.name).filter((name) => /\s/.test(name));
        if (spacedNames.length > 0) {
            errors.push({ message: 'ruleNameNoSpacesError', params: [spacedNames.join(', ')] });
        }

        const accepted = [];
        for (const rule of cleanedRules) {
            const result = validateRule(rule.name, rule.color, rule.urls, accepted, undefined);
            if (!result.valid) {
                if (result.message === 'duplicateRuleName') {
                    errors.push({ message: 'duplicateRuleNameInFile', params: [rule.name] });
                } else {
                    errors.push({ message: result.message, params: result.params || [] });
                }
            } else {
                accepted.push(rule);
            }
        }

        if (errors.length > 0) return { valid: false, errors };
        return { valid: true, rules: cleanedRules, errors: [] };
    }

    // mode === 'add'
    const accepted = [...(existingRules || [])];
    const rulesToAdd = [];

    for (const rule of cleanedRules) {
        if (/\s/.test(rule.name)) {
            errors.push({ message: 'ruleNameNoSpacesError', params: [rule.name] });
            continue;
        }

        const result = validateRule(rule.name, rule.color, rule.urls, accepted, undefined);
        if (!result.valid) {
            if (result.message === 'duplicateRuleName') {
                errors.push({ message: 'duplicateRuleNameInFile', params: [rule.name] });
            } else {
                errors.push({ message: result.message, params: result.params || [] });
            }
            continue;
        }

        accepted.push(rule);
        rulesToAdd.push(rule);
    }

    if (rulesToAdd.length === 0) {
        return { valid: false, rules: [], errors };
    }

    return { valid: true, rules: rulesToAdd, errors };
}
