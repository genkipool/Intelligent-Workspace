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
