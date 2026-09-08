/**
 * dateRange.js — the day arithmetic the calendar filter runs on.
 *
 * The history and downloads calendars both pick a range of whole days and hand it
 * to a filter as a pair of timestamps. Where that range starts and ends, and which
 * days may be picked at all, are decided here so the rules are the same in both and
 * can be checked without a DOM.
 */

/** Midnight of a day, as a timestamp — the unit every comparison here works in. */
export const startOfDay = (date) => new Date(date).setHours(0, 0, 0, 0);

/** The last millisecond of a day, so a range's end includes all of it. */
export const endOfDay = (date) => new Date(date).setHours(23, 59, 59, 999);

/**
 * Whether a day is still to come.
 *
 * Nothing has been visited or downloaded tomorrow, so tomorrow is never on offer.
 * Today itself is always allowed, however late in it we are.
 *
 * @param {Date|number} date
 * @param {Date|number} [now]
 */
export const isFutureDay = (date, now = Date.now()) => startOfDay(date) > startOfDay(now);

/**
 * Whether a month is the current one or later — the point past which the calendar's
 * forward arrow has nothing left to show.
 *
 * @param {number} year
 * @param {number} month Zero-based, as `Date` counts them.
 * @param {Date|number} [now]
 */
export function isCurrentMonthOrLater(year, month, now = Date.now()) {
    const today = new Date(now);
    return year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth());
}

/**
 * The two ends of a picked range, as the filters want them.
 *
 * The two clicks arrive in whatever order the user made them, so they are sorted
 * here; picking the same day twice is a single day, not an empty range.
 *
 * @param {Date|number} from
 * @param {Date|number} to
 * @returns {{start: number, end: number}}
 */
export function normalizeRange(from, to) {
    const [first, last] = startOfDay(from) <= startOfDay(to) ? [from, to] : [to, from];
    return { start: startOfDay(first), end: endOfDay(last) };
}

/**
 * Whether a day falls inside a range, and on which edge.
 *
 * @param {Date|number} date
 * @param {{start: number, end: number}|null} range
 * @returns {{inside: boolean, isStart: boolean, isEnd: boolean, isSingleDay: boolean}}
 */
export function dayInRange(date, range) {
    const outside = { inside: false, isStart: false, isEnd: false, isSingleDay: false };
    if (!range || !range.start) return outside;

    const first = startOfDay(range.start);
    const last = startOfDay(range.end ?? range.start);
    const at = startOfDay(date);
    const [from, to] = first <= last ? [first, last] : [last, first];
    if (at < from || at > to) return outside;

    return { inside: true, isStart: at === from, isEnd: at === to, isSingleDay: from === to };
}
