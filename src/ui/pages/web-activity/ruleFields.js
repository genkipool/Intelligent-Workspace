// @ts-nocheck
/**
 * [AI INSTRUCTION]
 * THE SMALL CONVERSIONS BOTH RULE DIALOGS DO.
 *
 * An allowance is stored in seconds and typed as `HH:MM`, and both dialogs offer the
 * same weekday row. Written twice they would drift, and the two dialogs edit halves
 * of one record — they have to agree about what Monday is.
 */

/**
 * The weekday buttons, Monday first because that is how a week reads, carrying the
 * JS weekday number the schema stores. The keys are the ones the group list's
 * schedule dialog already uses, so the day names are translated once.
 */
export const DAY_CHIPS = [
    { day: 1, key: 'dayMon' },
    { day: 2, key: 'dayTue' },
    { day: 3, key: 'dayWed' },
    { day: 4, key: 'dayThu' },
    { day: 5, key: 'dayFri' },
    { day: 6, key: 'daySat' },
    { day: 0, key: 'daySun' },
];

/** `5400` → `01:30`. `maxHours` caps a weekly allowance, which can exceed a day. */
export function secondsToHhMm(seconds, maxHours = 24) {
    const total = Math.max(0, Math.min(Math.round(seconds / 60), maxHours * 60));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** `01:30` → `5400`. Anything unparseable is no allowance at all, not a wrong one. */
export function hhMmToSeconds(hhmm) {
    const [h, m] = String(hhmm || '00:00')
        .split(':')
        .map((part) => parseInt(part, 10) || 0);
    return h * 3600 + m * 60;
}

/**
 * [AI INSTRUCTION]
 * IS WHAT WAS TYPED A WEB ADDRESS AT ALL?
 *
 * The "add site" dialog took anything: a sentence, a word, an empty space. What came
 * out the other side was a rule matching a host that does not exist, sitting in the
 * list looking exactly like the ones that work — and nothing to tell the user which
 * was which.
 *
 * This is a check on the *shape*, and deliberately nothing more. Whether a site is
 * reachable is a question with a network round trip, a timeout and a wrong answer on
 * every offline laptop, and a limit on a site that happens to be down today is still a
 * limit the user meant to set.
 *
 * What it accepts: a hostname with at least two labels and a letters-only top level
 * (or a punycode one), and a bare IPv4. Pasting a whole URL is fine — that is the
 * ordinary thing to do — and so is a leading `www.`, a port or a trailing path, all of
 * which are taken off.
 *
 * @param {string} text What the user typed.
 * @returns {{ domain: string, errorKey: string }} `errorKey` is '' when it is good.
 */
export function validateSite(text) {
    const raw = String(text || '').trim();
    if (!raw) return { domain: '', errorKey: 'webActivitySiteRequired' };

    let host = '';
    try {
        host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
    } catch {
        return { domain: '', errorKey: 'webActivitySiteInvalid' };
    }
    host = host.toLowerCase().replace(/^www\./, '');
    if (!host) return { domain: '', errorKey: 'webActivitySiteInvalid' };

    // An address, which the browser writes back in canonical form, so a plain
    // four-number check is enough here.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { domain: host, errorKey: '' };

    const labels = host.split('.');
    if (labels.length < 2) return { domain: '', errorKey: 'webActivitySiteNoDot' };
    const labelShape = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (!labels.every((label) => labelShape.test(label))) {
        return { domain: '', errorKey: 'webActivitySiteInvalid' };
    }
    const tld = labels[labels.length - 1];
    if (!/^[a-z]{2,}$/.test(tld) && !tld.startsWith('xn--')) {
        return { domain: '', errorKey: 'webActivitySiteNoTld' };
    }
    return { domain: host, errorKey: '' };
}
