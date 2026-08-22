/**
 * [AI INSTRUCTION]
 * FORMATTERS AND CALENDAR MATHS SHARED BY EVERY DASHBOARD.
 *
 * Durations, dates and day keys read the same on the pomodoro dashboard and on the
 * web activity one because they come from here. Import these rather than writing
 * another `Math.floor(secs / 3600)`.
 */

/** `2h 5m` / `5m 3s` / `3s`. Rounds, never shows a negative. */
export const fmtDur = (secs) => {
    secs = Math.max(0, Math.round(secs));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

/** Hours with one decimal, for axis labels and tight cells. */
export const fmtH = (secs, abbrev = 'h') => (secs / 3600).toFixed(1) + abbrev;

const localeOf = (lang) => (lang === 'es' ? 'es-ES' : 'en-GB');

export const fmtDateShort = (ts, lang = 'en') =>
    !ts ? '--' : new Date(ts).toLocaleDateString(localeOf(lang), { day: '2-digit', month: 'short' });

export const fmtTime = (ts, lang = 'en') =>
    !ts ? '--' : new Date(ts).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' });

/** `YYYY-MM-DD` in local time, which is the day the user means. */
export const dayKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Midnight of a `YYYY-MM-DD` key, as a timestamp. */
export const dayKeyToTime = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
};

const DAY_MS = 86400000;

/**
 * How many days in a row end at today (or yesterday), and the longest run ever.
 *
 * "Or yesterday" is the part worth keeping: at nine in the morning a streak that
 * stopped counting at midnight would read as broken, which is not what anybody
 * means by a streak.
 *
 * @param {string[]} dayKeys days with activity, in any order, possibly repeated
 */
export function computeDayStreak(dayKeys) {
    const days = [...new Set(dayKeys)].sort();
    if (!days.length) return { currentStreak: 0, maxStreak: 0 };

    let maxStreak = 1;
    let run = 1;
    for (let i = 1; i < days.length; i++) {
        const consecutive = dayKeyToTime(days[i]) - dayKeyToTime(days[i - 1]) === DAY_MS;
        run = consecutive ? run + 1 : 1;
        if (run > maxStreak) maxStreak = run;
    }

    const today = dayKeyToTime(dayKey(Date.now()));
    const last = dayKeyToTime(days[days.length - 1]);
    if (today - last > DAY_MS) return { currentStreak: 0, maxStreak };

    let currentStreak = 1;
    for (let i = days.length - 2; i >= 0; i--) {
        if (dayKeyToTime(days[i + 1]) - dayKeyToTime(days[i]) !== DAY_MS) break;
        currentStreak++;
    }
    return { currentStreak, maxStreak };
}

/** Localised weekday names, Sunday first, matching `Date.prototype.getDay()`. */
export function weekdayNames(lang = 'en', style = 'short') {
    const formatter = new Intl.DateTimeFormat(localeOf(lang), { weekday: style });
    // 2024-01-07 was a Sunday, so this walks Sunday through Saturday.
    return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2024, 0, 7 + i)));
}
