// @ts-nocheck
import { SvelteSet } from 'svelte/reactivity';
import { computeDayStreak, dayKey, fmtDur, fmtH } from '../../services/dashboard/format.js';

/**
 * The pomodoro-specific half of the dashboard maths. Durations, dates and the streak
 * calendar are shared with the other dashboards and live in `services/dashboard/format.js`.
 */

export const effColor = (pct) => {
    if (pct >= 80) return 'var(--interactive-color)';
    if (pct >= 60) return 'var(--action-color)';
    if (pct >= 40) return 'var(--text-on-color)';
    return 'var(--error-color)';
};

export function computeKpis(d, allData, i18n, lang) {
    let totalFocus = 0,
        totalBreak = 0,
        totalCycles = 0,
        totalInt = 0,
        totalIntTime = 0,
        bestSession = {};
    const projs = new SvelteSet(),
        days = new SvelteSet();

    d.forEach((e) => {
        const f = e.totalFocusSeconds || 0;
        totalFocus += f;
        totalBreak += e.totalBreakSeconds || 0;
        totalCycles += e.completedCycles || 0;
        totalInt += e.interruptions || 0;
        totalIntTime += e.totalInterruptionSeconds || 0;
        if (e.projectName) projs.add(e.projectName);
        days.add(dayKey(e.savedAt));
        if (f > (bestSession.totalFocusSeconds || 0)) bestSession = e;
    });

    const totalTime = totalFocus + totalBreak;
    const eff = totalTime > 0 ? Math.round((totalFocus / totalTime) * 100) : 0;
    const avgFocus = totalCycles > 0 ? Math.round(totalFocus / totalCycles) : 0;
    const activeDays = days.size;
    const projects = projs.size;
    // 'dashboardProject' (singular) does not exist in either locale, so with exactly
    // one project the label read "1 dashboardProject". The pair below already carries
    // the count and is what the project table uses for the same sentence.
    const projLabel =
        projects === 1 ? i18n('dashboardProjects_n', projects) : i18n('dashboardProjects_plural', projects);
    const cyclesPerSess = d.length > 0 ? (totalCycles / d.length).toFixed(1) : 0;
    const intPerSess = d.length > 0 ? (totalInt / d.length).toFixed(1) : 0;

    const wrRatio = totalFocus > 0 ? (totalBreak / totalFocus).toFixed(1) : 0;
    const intRate = totalFocus > 0 ? (totalInt / (totalFocus / 3600)).toFixed(1) : 0;
    const avgIntDur = totalInt > 0 ? Math.round(totalIntTime / totalInt) : 0;

    const daysOfWeek = new Array(7).fill(0);
    const hourlyFocus = new Array(24).fill(0);
    d.forEach((e) => {
        const date = new Date(e.savedAt);
        const dow = date.getDay();
        const h = date.getHours();
        daysOfWeek[dow] += e.totalFocusSeconds || 0;
        hourlyFocus[h] += e.totalFocusSeconds || 0;
    });
    const bestDayIdx = daysOfWeek.indexOf(Math.max(...daysOfWeek));
    const bestDayName =
        d.length > 0
            ? [
                  i18n('dashboardSunday'),
                  i18n('dashboardMonday'),
                  i18n('dashboardTuesday'),
                  i18n('dashboardWednesday'),
                  i18n('dashboardThursday'),
                  i18n('dashboardFriday'),
                  i18n('dashboardSaturday'),
              ][bestDayIdx]
            : '--';
    const bestHour = hourlyFocus.indexOf(Math.max(...hourlyFocus));
    const goldenHourStr = d.length > 0 ? `${bestHour}:00 - ${bestHour + 1}:00` : '--';

    const projMap = {};
    d.forEach((e) => {
        const p = e.projectName || '--';
        projMap[p] = (projMap[p] || 0) + (e.totalFocusSeconds || 0);
    });
    let topProj = '--',
        maxP = 0;
    for (const p in projMap) {
        if (projMap[p] > maxP) {
            maxP = projMap[p];
            topProj = p;
        }
    }

    const hAbbrev = i18n('dashboardFocusH_abbrev');

    return [
        {
            label: i18n('pomodoroStatsFocusTime'),
            value: fmtDur(totalFocus),
            sub: fmtH(totalFocus, hAbbrev) + ' ' + i18n('dashboardInTotal'),
            color: 'var(--interactive-color)',
        },
        { label: i18n('pomodoroStatsSessions'), value: d.length, sub: projLabel, color: 'var(--action-color)' },
        {
            label: i18n('pomodoroStatsCompletedCycles'),
            value: totalCycles,
            sub: `~${cyclesPerSess} / ${i18n('dashboardSession')}`,
            color: 'color-mix(in srgb, var(--interactive-color) 70%, var(--text-on-color))',
        },
        {
            label: i18n('dashboardAvgEfficiency'),
            value: eff + '%',
            sub: i18n('dashboardFocusDivTotal'),
            color: effColor(eff),
        },
        {
            label: i18n('dashboardActiveDays'),
            value: activeDays,
            sub: i18n('dashboardAtLeast1'),
            color: 'color-mix(in srgb, var(--action-color) 80%, var(--text-on-color))',
        },
        {
            label: i18n('pomodoroStatsBreakTime'),
            value: fmtDur(totalBreak),
            sub: i18n('dashboardRestTime'),
            color: 'color-mix(in srgb, var(--text-color) 55%, var(--bg-color))',
        },
        {
            label: i18n('pomodoroStatsFocusInterruptions'),
            value: totalInt,
            sub: `${intPerSess} ${i18n('dashboardPerSession')}`,
            color: 'color-mix(in srgb, var(--error-color) 70%, var(--bg-color))',
        },
        {
            label: i18n('dashboardInterruptionTime'),
            value: fmtDur(totalIntTime),
            sub: i18n('dashboardTotalTimePaused'),
            color: 'color-mix(in srgb, var(--error-color) 70%, var(--bg-color))',
        },
        {
            label: i18n('dashboardBestSession'),
            value: (bestSession.totalFocusSeconds || 0) > 0 ? fmtDur(bestSession.totalFocusSeconds) : '--',
            sub: bestSession.projectName || '--',
            color: 'color-mix(in srgb, var(--interactive-color) 70%, var(--text-on-color))',
        },
        {
            label: i18n('pomodoroStatsAvgFocusDuration'),
            value: avgFocus > 0 ? fmtDur(avgFocus) : '--',
            sub: i18n('dashboardAvgCycle'),
            color: 'var(--action-color)',
        },
        {
            label: i18n('pomodoroStatsTotalTime'),
            value: fmtDur(totalTime),
            sub: i18n('dashboardFocusPlusBreak'),
            color: 'var(--text-color)',
        },
        {
            label: i18n('dashboardWorkRestRatio'),
            value: `1 : ${wrRatio}`,
            sub: i18n('dashboardFocusVsBreak'),
            color: 'var(--interactive-color)',
        },
        {
            label: i18n('dashboardDistractionRate'),
            value: intRate,
            sub: i18n('dashboardIntsPerHour'),
            color: 'var(--error-color)',
        },
        {
            label: i18n('dashboardMostProductiveDay'),
            value: bestDayName,
            sub: i18n('dashboardMaxFocusDay'),
            color: 'var(--action-color)',
        },
        {
            label: i18n('dashboardGoldenHour'),
            value: goldenHourStr,
            sub: i18n('dashboardMostFocusedSlot'),
            color: 'var(--interactive-color)',
        },
        {
            label: i18n('dashboardTotalProjects'),
            value: projects,
            sub: i18n('dashboardProjectVariety'),
            color: 'var(--action-color)',
        },
        {
            label: i18n('dashboardAvgIntDuration'),
            value: avgIntDur > 0 ? fmtDur(avgIntDur) : '--',
            sub: i18n('dashboardPerInterruption'),
            color: 'var(--error-color)',
        },
        {
            label: i18n('dashboardTopProject'),
            value: topProj,
            sub: i18n('dashboardMostTimeOn'),
            color: 'var(--action-color)',
        },
        {
            label: i18n('dashboardFocusIntensity'),
            value: activeDays > 0 ? (totalFocus / activeDays / 3600).toFixed(1) + 'h' : '--',
            sub: i18n('dashboardAvgFocusPerDay'),
            color: 'var(--interactive-color)',
        },
    ];
}

export function computeStreak(allData) {
    const { currentStreak, maxStreak } = computeDayStreak(allData.map((e) => dayKey(e.savedAt)));

    const dayFocus = {};
    allData.forEach((e) => {
        const k = dayKey(e.savedAt);
        dayFocus[k] = (dayFocus[k] || 0) + (e.totalFocusSeconds || 0);
    });
    const bestSec = Math.max(...Object.values(dayFocus), 0);
    const bestKey = Object.entries(dayFocus).find(([, v]) => v === bestSec)?.[0] || null;

    return { currentStreak, maxStreak, bestSec, bestKey };
}
