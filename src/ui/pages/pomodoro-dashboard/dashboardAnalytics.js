// @ts-nocheck
import { SvelteSet, SvelteDate } from 'svelte/reactivity';

export const PROJECT_COLORS = [
    '#3b82f6',
    '#10b981',
    '#8b5cf6',
    '#f59e0b',
    '#06b6d4',
    '#ec4899',
    '#6366f1',
    '#14b8a6',
    '#f97316',
    '#a855f7',
    '#84cc16',
    '#e11d48',
];

export const fmtDur = (secs) => {
    secs = Math.max(0, Math.round(secs));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

export const fmtH = (secs, abbrev = 'h') => (secs / 3600).toFixed(1) + abbrev;

export const fmtDate = (ts, lang = 'en') =>
    !ts
        ? '--'
        : new Date(ts).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
          });

export const fmtDateShort = (ts, lang = 'en') =>
    !ts ? '--' : new Date(ts).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: '2-digit', month: 'short' });

export const fmtTime = (ts, lang = 'en') =>
    !ts
        ? '--'
        : new Date(ts).toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-GB', {
              hour: '2-digit',
              minute: '2-digit',
          });

export const dayKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const effColor = (pct) => {
    if (pct >= 80) return '#10b981';
    if (pct >= 60) return '#3b82f6';
    if (pct >= 40) return '#f59e0b';
    return '#ef4444';
};

export const projColor = (idx) => PROJECT_COLORS[idx % PROJECT_COLORS.length];

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
    const projLabel = `${projects} ${projects === 1 ? i18n('dashboardProject') : i18n('dashboardProjects')}`;
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
    const days = [...new Set(allData.map((e) => dayKey(e.savedAt)))].sort();
    if (!days.length) return { currentStreak: 0, maxStreak: 0, bestSec: 0, bestKey: null };

    let maxStreak = 1,
        tempStreak = 1;
    for (let i = 1; i < days.length; i++) {
        const prev = new SvelteDate(days[i - 1]);
        prev.setDate(prev.getDate() + 1);
        const cur = new Date(days[i]);
        if (prev.toDateString() === cur.toDateString()) {
            tempStreak++;
            if (tempStreak > maxStreak) maxStreak = tempStreak;
        } else tempStreak = 1;
    }
    if (days.length === 1) maxStreak = 1;

    let currentStreak = 0;
    const last = new SvelteDate(days[days.length - 1]);
    last.setHours(0, 0, 0, 0);
    const today = new SvelteDate();
    today.setHours(0, 0, 0, 0);
    const yest = new SvelteDate(today);
    yest.setDate(today.getDate() - 1);
    if (last >= yest) {
        currentStreak = 1;
        for (let i = days.length - 2; i >= 0; i--) {
            const d = new SvelteDate(days[i]);
            d.setHours(0, 0, 0, 0);
            const n = new SvelteDate(days[i + 1]);
            n.setHours(0, 0, 0, 0);
            n.setDate(n.getDate() - 1);
            if (d.toDateString() === n.toDateString()) currentStreak++;
            else break;
        }
    }

    const dayFocus = {};
    allData.forEach((e) => {
        const k = dayKey(e.savedAt);
        dayFocus[k] = (dayFocus[k] || 0) + (e.totalFocusSeconds || 0);
    });
    const bestSec = Math.max(...Object.values(dayFocus), 0);
    const bestKey = Object.entries(dayFocus).find(([, v]) => v === bestSec)?.[0];

    return { currentStreak, maxStreak, bestSec, bestKey };
}
