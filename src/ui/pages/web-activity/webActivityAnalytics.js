// @ts-nocheck
/**
 * [AI INSTRUCTION]
 * THE WEB ACTIVITY MATHS. Pure functions only — no DOM, no chrome APIs, no stores.
 *
 * Everything the dashboard shows is derived here from the raw day records, so the
 * components stay declarative and the numbers can be checked without a browser.
 * What counts as a site, a category or a broken limit is not decided here: that is
 * `core/services/webActivitySchema.js`, which the tracker reads too.
 */
import '../../../core/services/webActivitySchema.js';
import {
    computeDayStreak,
    dayKey,
    dayKeyToTime,
    fmtDateShort,
    fmtDur,
    fmtH,
    weekdayNames,
} from '../../services/dashboard/format.js';

const WA = globalThis.ITG_WEB_ACTIVITY;

/** Period filter values, in days. 0 means everything on record. */
export const PERIODS = [
    { days: 1, labelKey: 'dashboardToday', titleKey: 'titleFilterToday' },
    { days: 7, labelKey: 'dashboard7Days', titleKey: 'titleFilter7Days' },
    { days: 30, labelKey: 'dashboard30Days', titleKey: 'titleFilter30Days' },
    { days: 90, labelKey: 'dashboard3Months', titleKey: 'titleFilter3Months' },
    { days: 0, labelKey: 'dashboardAllTime', titleKey: 'titleFilterAll' },
];

/**
 * The day keys a period covers, oldest first, including the days with no activity —
 * a gap in a trend line means "nothing happened", and dropping it would quietly
 * redraw the week as if it were shorter.
 */
export function daysInPeriod(days, periodDays, now = Date.now()) {
    const present = Object.keys(days).sort();
    if (!present.length) return [];
    if (!periodDays) return present;
    const cutoff = dayKey(now - (periodDays - 1) * 86400000);
    return present.filter((day) => day >= cutoff);
}

/**
 * Rolls the raw day records up into one row per site.
 *
 * @returns {Array<{domain, seconds, visits, sessions, category, hours: number[], days: number}>}
 *          sorted by time spent, longest first.
 */
export function aggregateSites(days, dayKeys, limits = {}) {
    const bySite = new Map();
    for (const day of dayKeys) {
        const domains = days[day]?.domains || {};
        for (const [domain, entry] of Object.entries(domains)) {
            let row = bySite.get(domain);
            if (!row) {
                row = {
                    domain,
                    seconds: 0,
                    visits: 0,
                    sessions: 0,
                    days: 0,
                    lastDay: null,
                    hours: new Array(24).fill(0),
                    category: WA.categoryOf(domain, limits),
                };
                bySite.set(domain, row);
            }
            row.seconds += entry.t || 0;
            row.visits += entry.v || 0;
            row.sessions += entry.s || 0;
            if ((entry.t || 0) > 0) {
                row.days += 1;
                // The keys arrive in whatever order the records were read, so the most
                // recent one is compared rather than assumed to be last.
                if (!row.lastDay || day > row.lastDay) row.lastDay = day;
            }
            for (const [hour, seconds] of Object.entries(entry.h || {})) {
                row.hours[Number(hour)] += seconds;
            }
        }
    }
    // Derived per-site figures, worked out once here rather than in the table's markup.
    for (const row of bySite.values()) {
        row.perVisit = row.visits > 0 ? row.seconds / row.visits : 0;
        row.perDay = row.days > 0 ? row.seconds / row.days : 0;
        row.perSession = row.sessions > 0 ? row.seconds / row.sessions : 0;
    }
    return [...bySite.values()].sort((a, b) => b.seconds - a.seconds);
}

/** Seconds per day, in the order given, for the trend chart. */
export function secondsPerDay(days, dayKeys, domainFilter = null) {
    return dayKeys.map((day) => {
        const domains = days[day]?.domains || {};
        if (domainFilter) return domains[domainFilter]?.t || 0;
        return Object.values(domains).reduce((total, entry) => total + (entry.t || 0), 0);
    });
}

/** Seconds per hour of the day, summed over the period. */
export function secondsPerHour(sites) {
    const hours = new Array(24).fill(0);
    for (const site of sites) {
        for (let hour = 0; hour < 24; hour++) hours[hour] += site.hours[hour];
    }
    return hours;
}

/**
 * How many different sites were open in each hour.
 *
 * Visits are only counted per day, not per hour, so an hourly visit count would have
 * to be invented. This is a real number and answers the same question — was that hour
 * one long read or a scatter of tabs.
 */
export function activeSitesPerHour(sites) {
    const counts = new Array(24).fill(0);
    for (const site of sites) {
        for (let hour = 0; hour < 24; hour++) if (site.hours[hour] > 0) counts[hour] += 1;
    }
    return counts;
}

/**
 * Seconds per weekday, Sunday first, folded from a per-day series.
 *
 * It takes the series rather than the raw records so it inherits whatever filter
 * produced them — the radar chart for one site has to agree with that site's numbers
 * everywhere else on the page.
 */
export function secondsPerWeekday(dayKeys, perDay) {
    const totals = new Array(7).fill(0);
    dayKeys.forEach((day, index) => {
        totals[new Date(dayKeyToTime(day)).getDay()] += perDay[index] || 0;
    });
    return totals;
}

/** One row per category, longest first, ready for a donut or a legend. */
export function aggregateCategories(sites) {
    const totals = new Map();
    for (const site of sites) {
        totals.set(site.category, (totals.get(site.category) || 0) + site.seconds);
    }
    return [...totals.entries()]
        .map(([category, seconds]) => ({ category, seconds }))
        .sort((a, b) => b.seconds - a.seconds);
}

/**
 * The share of time spent on categories flagged as focused work versus the ones
 * flagged as a distraction. Anything in neither list is left out of both, so the
 * ratio compares the two things it claims to compare.
 */
function focusSplit(sites) {
    let productive = 0;
    let distracting = 0;
    let neutral = 0;
    for (const site of sites) {
        if (WA.PRODUCTIVE_CATEGORIES.includes(site.category)) productive += site.seconds;
        else if (WA.DISTRACTING_CATEGORIES.includes(site.category)) distracting += site.seconds;
        else neutral += site.seconds;
    }
    const rated = productive + distracting;
    return {
        productive,
        distracting,
        neutral,
        percent: rated > 0 ? Math.round((productive / rated) * 100) : 0,
    };
}

/**
 * The heatmap cells for the last `weeks` weeks, in the column-major order the grid
 * expects (each column is a week, Sunday at the top).
 */
export function heatmapCells(days, weeks = 26, now = Date.now()) {
    const totals = {};
    for (const [day, record] of Object.entries(days)) {
        totals[day] = Object.values(record.domains || {}).reduce((sum, entry) => sum + (entry.t || 0), 0);
    }
    const max = Math.max(...Object.values(totals), 0);

    const today = new Date(dayKeyToTime(dayKey(now)));
    // Start on the Sunday of the week that is `weeks` back, so every column is full.
    const start = new Date(today);
    start.setDate(start.getDate() - (weeks * 7 - 1) - today.getDay());

    const cells = [];
    const monthPositions = [];
    let lastMonth = -1;
    for (let column = 0; column < weeks; column++) {
        for (let row = 0; row < 7; row++) {
            const date = new Date(start);
            date.setDate(start.getDate() + column * 7 + row);
            const key = dayKey(date.getTime());
            const seconds = totals[key] || 0;
            const level = seconds <= 0 ? 0 : Math.min(4, Math.ceil((seconds / (max || 1)) * 4));
            const isMonthStart = date.getDate() === 1;
            if (isMonthStart && date.getMonth() !== lastMonth) {
                lastMonth = date.getMonth();
                monthPositions.push({ col: column, month: date.getMonth() });
            }
            cells.push({
                date,
                c: seconds > 0 ? 1 : 0,
                focus: seconds,
                lv: level,
                isToday: key === dayKey(now),
                isMonthStart,
            });
        }
    }
    return { cells, monthPositions, max };
}

/**
 * The headline numbers. Each is `{label, value, sub, color}` — the shape KpiGrid
 * takes, which is why this dashboard reuses the pomodoro one's card component.
 */
export function computeKpis({ sites, days, dayKeys, limits, lang, i18n, categoryLabel = null }) {
    // A category the user added has no translation key — its name is the word they
    // typed — so naming one is the caller's job when it can do it.
    const nameCategory = categoryLabel || ((id) => i18n('webActivityCategory_' + id));
    const totalSeconds = sites.reduce((sum, site) => sum + site.seconds, 0);
    const totalVisits = sites.reduce((sum, site) => sum + site.visits, 0);
    const totalSessions = sites.reduce((sum, site) => sum + site.sessions, 0);
    const activeDays = dayKeys.filter((day) =>
        Object.values(days[day]?.domains || {}).some((entry) => (entry.t || 0) > 0),
    ).length;

    const perDay = secondsPerDay(days, dayKeys);
    const busiestIndex = perDay.length ? perDay.indexOf(Math.max(...perDay)) : -1;
    const hours = secondsPerHour(sites);
    const peakHour = hours.some((h) => h > 0) ? hours.indexOf(Math.max(...hours)) : -1;
    const weekdays = secondsPerWeekday(dayKeys, perDay);
    const peakWeekday = weekdays.some((d) => d > 0) ? weekdays.indexOf(Math.max(...weekdays)) : -1;

    const split = focusSplit(sites);
    const { currentStreak } = computeDayStreak(
        dayKeys.filter((day) => Object.values(days[day]?.domains || {}).some((entry) => (entry.t || 0) > 0)),
    );
    const top = sites[0];
    const categories = aggregateCategories(sites);
    const blockedCount = Object.values(limits).filter((limit) => limit?.enabled !== false).length;
    const hAbbrev = i18n('dashboardFocusH_abbrev');

    const accent = 'var(--interactive-color)';
    const secondary = 'var(--action-color)';
    const muted = 'color-mix(in srgb, var(--text-color) 55%, var(--bg-color))';
    const alert = 'var(--error-color)';

    return [
        {
            label: i18n('webActivityKpiTotalTime'),
            value: fmtDur(totalSeconds),
            sub: fmtH(totalSeconds, hAbbrev) + ' ' + i18n('dashboardInTotal'),
            color: accent,
        },
        {
            label: i18n('webActivityKpiVisits'),
            value: totalVisits,
            sub: i18n('webActivityKpiVisitsSub'),
            color: secondary,
        },
        {
            label: i18n('webActivityKpiSites'),
            value: sites.length,
            sub: i18n('webActivityKpiSitesSub', categories.length),
            color: 'color-mix(in srgb, var(--interactive-color) 70%, var(--text-on-color))',
        },
        {
            label: i18n('webActivityKpiAvgPerDay'),
            value: activeDays > 0 ? fmtDur(totalSeconds / activeDays) : '--',
            sub: i18n('webActivityKpiAvgPerDaySub', activeDays),
            color: accent,
        },
        {
            label: i18n('webActivityKpiTopSite'),
            value: top ? top.domain : '--',
            sub: top ? fmtDur(top.seconds) : '--',
            color: secondary,
        },
        {
            label: i18n('webActivityKpiFocusRatio'),
            value: split.percent + '%',
            sub: i18n('webActivityKpiFocusRatioSub'),
            color: split.percent >= 50 ? accent : alert,
        },
        {
            label: i18n('webActivityKpiBusiestDay'),
            value: busiestIndex >= 0 ? fmtDur(perDay[busiestIndex]) : '--',
            sub: busiestIndex >= 0 ? fmtDateShort(dayKeyToTime(dayKeys[busiestIndex]), lang) : '--',
            color: 'color-mix(in srgb, var(--action-color) 80%, var(--text-on-color))',
        },
        {
            label: i18n('webActivityKpiPeakHour'),
            value: peakHour >= 0 ? `${peakHour}:00 - ${peakHour + 1}:00` : '--',
            sub: i18n('webActivityKpiPeakHourSub'),
            color: accent,
        },
        {
            label: i18n('webActivityKpiPeakWeekday'),
            value: peakWeekday >= 0 ? weekdayNames(lang, 'long')[peakWeekday] : '--',
            sub: i18n('webActivityKpiPeakWeekdaySub'),
            color: secondary,
        },
        {
            label: i18n('webActivityKpiSessions'),
            value: totalSessions,
            sub: i18n('webActivityKpiSessionsSub', totalSessions > 0 ? fmtDur(totalSeconds / totalSessions) : '--'),
            color: muted,
        },
        {
            label: i18n('webActivityKpiPerVisit'),
            value: totalVisits > 0 ? fmtDur(totalSeconds / totalVisits) : '--',
            sub: i18n('webActivityKpiPerVisitSub'),
            color: muted,
        },
        {
            label: i18n('webActivityKpiStreak'),
            value: currentStreak,
            sub: i18n('dashboardConsecutiveDays'),
            color: accent,
        },
        {
            label: i18n('webActivityKpiDistracting'),
            value: fmtDur(split.distracting),
            sub: i18n('webActivityKpiDistractingSub'),
            color: alert,
        },
        {
            label: i18n('webActivityKpiProductive'),
            value: fmtDur(split.productive),
            sub: i18n('webActivityKpiProductiveSub'),
            color: accent,
        },
        {
            label: i18n('webActivityKpiLimits'),
            value: blockedCount,
            sub: i18n('webActivityKpiLimitsSub'),
            color: blockedCount > 0 ? secondary : muted,
        },
        {
            label: i18n('webActivityKpiTopCategory'),
            value: categories.length ? nameCategory(categories[0].category) : '--',
            sub: categories.length ? fmtDur(categories[0].seconds) : '--',
            color: secondary,
        },
    ];
}

/**
 * How each configured limit stands right now. The verdict itself comes from the
 * schema, so the badge here and the rule that actually blocks cannot disagree.
 *
 * The week is folded up here rather than asked of the worker: the dashboard already
 * holds every day record it needs, and a second round trip for a number it can add up
 * itself would only be one refresh out of date.
 */
export function limitRows(limits, days, now = Date.now()) {
    const today = days[dayKey(now)]?.domains || {};
    const weekKeys = WA.weekDayKeys(now);
    const week = {};
    for (const key of weekKeys) {
        for (const [domain, entry] of Object.entries(days[key]?.domains || {})) {
            week[domain] = (week[domain] || 0) + (entry.t || 0);
        }
    }
    return Object.keys(limits)
        .map((domain) => ({
            domain,
            limit: WA.normalizeLimit(limits[domain]),
            verdict: WA.evaluate(domain, limits, today[domain]?.t || 0, new Date(now), week[domain] || 0),
        }))
        .sort((a, b) => b.verdict.usedSeconds - a.verdict.usedSeconds);
}
