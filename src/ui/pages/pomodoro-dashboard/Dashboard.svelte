<script>
    import '../../../core/services/dbSchema.js';
    import { compareNames } from '../../services/utils.js';
    import { onMount, onDestroy, mount } from 'svelte';
    import { SvelteSet, SvelteMap, SvelteDate } from 'svelte/reactivity';
    import { showNotification } from '../../../utils/i18n.js';
    import { notifyPomoStatsChanged } from '../../../utils/db.js';
    import ConfirmDialog from '../../components/common/ConfirmDialog.svelte';
    import { t, i18nStore } from '../../stores/i18nStore.js';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    /* ===============================================================
   Pomodoro Dashboard -- Logic
   =============================================================== */

    import Sidebar from './components/Sidebar.svelte';
    import TagFilter from './components/TagFilter.svelte';
    import KpiGrid from '../../components/dashboard/KpiGrid.svelte';
    import HourGrid from '../../components/dashboard/HourGrid.svelte';
    import Heatmap from '../../components/dashboard/Heatmap.svelte';
    import DonutStats from '../../components/dashboard/DonutStats.svelte';
    import ProjectTable from './components/ProjectTable.svelte';
    import Timeline from './components/Timeline.svelte';
    import DashboardHeader from './components/DashboardHeader.svelte';
    import PomodoroSettingsView from './settings/PomodoroSettingsView.svelte';
    import DashboardKpiSection from './components/DashboardKpiSection.svelte';
    import DashboardStreaksSection from './components/DashboardStreaksSection.svelte';
    import DashboardHeatmapSection from './components/DashboardHeatmapSection.svelte';
    import DashboardTimeEfficiencySection from './components/DashboardTimeEfficiencySection.svelte';
    import DashboardProjectAnalysisSection from './components/DashboardProjectAnalysisSection.svelte';
    import DashboardBreakdownSection from './components/DashboardBreakdownSection.svelte';
    import DashboardWebPhasesSection from './components/DashboardWebPhasesSection.svelte';
    import WebPhaseCards from './components/WebPhaseCards.svelte';
    import { fetchActivity } from '../../services/webActivityService.js';
    import { sortable } from '../../actions/sortable.js';
    import {
        applyOrderToDom,
        loadLayout,
        savePanelOrder,
        saveSectionOrder,
    } from '../../services/dashboard/dashboardLayout.js';
    import {
        applyChartDefaults,
        blendColors,
        colorMix,
        createVerticalGradient,
        cssVar,
        getSeriesColor as getProjectColor,
        getThemeScoreColor as getThemeEffColor,
        scaleDef,
        tickDef,
        tooltipDef,
    } from '../../services/dashboard/chartTheme.js';
    import { computeKpis, computeStreak, dedupeSessions, effColor, withinPeriod } from './dashboardAnalytics.js';
    import { dayKey, fmtDateShort, fmtDur, fmtH, fmtTime } from '../../services/dashboard/format.js';

    /**
     * Which of the two things the main column is showing: 'dashboard' or 'settings'.
     * The same shape the web activity dashboard uses, and for the same reason — the
     * sidebar and the header stay put, so coming back is instant and nothing reloads.
     *
     * The dashboard column is hidden rather than unmounted. Everything in it is built
     * imperatively — `mount()` into elements found by id, six live Chart.js canvases —
     * so tearing it down and putting it back would mean re-running the whole render
     * for a trip to the settings and back.
     */
    let view = $state('dashboard');

    let apps = {
        tagFilter: null,
        kpiGrid: null,
        hourGrid: null,
        heatmap: null,
        donutStats: null,
        projectTable: null,
        timeline: null,
        webPhases: null,
    };

    // --- i18n ---------------------------------------------------------
    // Loads the active language messages and exposes the i18n(key) helper
    let _msgs = {};
    let _lang = 'en';
    const openFolders = new SvelteSet();

    async function _loadI18n() {
        try {
            const stored = await chrome.storage.local.get('preferred-language');
            _lang = stored['preferred-language'] || (chrome.i18n.getUILanguage().startsWith('es') ? 'es' : 'en');
        } catch {
            _lang = 'en';
        }
        try {
            const url = chrome.runtime.getURL(`_locales/${_lang}/messages.json`);
            const res = await fetch(url);
            if (res.ok) {
                _msgs = await res.json();
                return;
            }
        } catch {}
        // Fallback to English
        try {
            const url = chrome.runtime.getURL('_locales/en/messages.json');
            const res = await fetch(url);
            if (res.ok) _msgs = await res.json();
        } catch {}
    }

    /** Returns the localized message for a key, substituting $1, $2... */
    function i18n(key, ...params) {
        const obj = _msgs[key];
        let msg = obj && obj.message ? obj.message : key;
        params.forEach((p, i) => {
            msg = msg.replace(`$${i + 1}`, p);
        });
        return msg;
    }

    /**
     * The richer explanation a key carries in its `description`, for tooltips. The
     * same thing `applyDomI18n` does for `data-i18n-title`, for the places that set a
     * title from script rather than from an attribute.
     */
    function i18nTitle(key) {
        return _msgs[key]?.description || i18n(key);
    }

    /** Applies data-i18n / data-i18n-placeholder to the DOM */
    function applyDomI18n() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            el.textContent = i18n(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            el.placeholder = i18n(el.getAttribute('data-i18n-placeholder'));
        });
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            // Use description field as tooltip text (richer explanation), fall back to message
            el.title = _msgs[key]?.description || i18n(key);
        });
    }

    // --- THEME INIT ---------------------------------------------------
    let _themeChangeTimer = null;

    async function applyTheme() {
        try {
            const data = await chrome.storage.local.get(['activeTheme', 'preferred-theme']);
            const at = data['activeTheme'];
            if (at) {
                if (at.colors) {
                    document.documentElement.setAttribute('data-theme', 'custom');
                    const vars = Object.entries(at.colors)
                        .map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
                        .join(';');
                    document.documentElement.style.cssText = vars;
                } else {
                    document.documentElement.setAttribute('data-theme', at.name || 'dark');
                }
            } else {
                const pref = data['preferred-theme'] || 'dark';
                if (pref === 'system') {
                    document.documentElement.setAttribute(
                        'data-theme',
                        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
                    );
                } else {
                    document.documentElement.setAttribute('data-theme', pref);
                }
            }
        } catch {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    async function initTheme() {
        await applyTheme();
        try {
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg.action === 'themeChanged') {
                    // Debounce: cancel previous pending refresh, wait 300ms after last change
                    if (_themeChangeTimer) clearTimeout(_themeChangeTimer);
                    _themeChangeTimer = setTimeout(async () => {
                        _themeChangeTimer = null;
                        await applyTheme();
                        // Destroy and re-render all charts so they pick up new theme colors
                        Object.values(charts).forEach((c) => {
                            try {
                                c.destroy();
                            } catch {}
                        });
                        charts = {};
                        renderAll();
                    }, 300);
                }
                if (msg.action === 'languageChanged') {
                    _loadI18n().then(() => {
                        applyDomI18n();
                        renderAll();
                    });
                }
            });
        } catch {}
    }

    // --- DB ACCESS ----------------------------------------------------
    // Name, version and store come from the one schema the extension shares. Naming
    // them here as well — pinned at a version — meant that the day the schema moved
    // on, `indexedDB.open` refused the newer database and the panel showed nothing.
    const { name: DB_NAME, version: DB_VER, stores: ITG_STORES } = globalThis.ITG_DB_SCHEMA;
    const STORE = ITG_STORES.pomodoroStats;

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = (event) =>
                globalThis.ITG_DB_SCHEMA.upgrade(event.target.result, event.target.transaction);
        });
    }

    async function getAllStats() {
        let db;
        try {
            db = await openDb();
        } catch (err) {
            throw new Error(`${i18n('dashboardErrorLoad')}: ${err.message || err}`);
        }

        if (!db.objectStoreNames.contains(STORE)) {
            db.close();
            return [];
        }

        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction([STORE], 'readonly');
                const req = tx.objectStore(STORE).getAll();
                req.onsuccess = () => {
                    db.close();
                    resolve(req.result || []);
                };
                req.onerror = () => {
                    db.close();
                    reject(req.error);
                };
            } catch (err) {
                db.close();
                reject(err);
            }
        });
    }

    // --- STATE --------------------------------------------------------
    let allData = $state([]);
    let filteredData = $state([]);
    let activePeriod = $state(0);
    let activeFolder = $state(null);
    let activeProject = $state(null);
    let activeTag = $state('');
    let sidebarQuery = $state('');
    let charts = {};
    /**
     * The web activity record, or null when the tracker has nothing to say. Fetched
     * once per reload alongside the pomodoro stats: the three phase cards are the only
     * thing on this page that needs it, and they are redrawn on every filter change.
     */
    let waDays = null;

    applyChartDefaults(Chart);

    // --- SIDEBAR DATA -------------------------------------------------
    const sidebarData = $derived.by(() => {
        const folderMap = {};
        const standaloneProjs = [];
        const projectCounts = {};
        let totalCount = 0;

        for (const e of allData) {
            const p = e.projectName || i18n('dashboardNoName');
            const f = e.projectFolder || '';
            projectCounts[p] = (projectCounts[p] || 0) + 1;
            totalCount++;
            if (f) {
                if (!folderMap[f]) folderMap[f] = new Set();
                folderMap[f].add(p);
            } else {
                if (!standaloneProjs.includes(p)) standaloneProjs.push(p);
            }
        }
        // Names people wrote: ordered the way they read, not by code point. See
        // `compareNames` — a plain `.sort()` puts `Ñandú` after `Zulú`.
        standaloneProjs.sort(compareNames);
        const folderNames = Object.keys(folderMap).sort(compareNames);
        return { folderNames, folderMap, projectCounts, standaloneProjs, totalCount };
    });

    // --- FILTER -------------------------------------------------------
    function applyFilters() {
        const now = Date.now();
        filteredData = allData.filter((e) => {
            // The period is `withinPeriod`'s, shared with the pomodoro side panel:
            // two surfaces that disagree about where "today" starts show two
            // different numbers for the same afternoon.
            if (!withinPeriod(e, activePeriod, now)) return false;
            if (activeTag && (e.projectTag || '') !== activeTag) return false;
            if (activeProject) {
                if (e.projectName !== activeProject) return false;
            } else if (activeFolder !== null) {
                if ((e.projectFolder || '') !== activeFolder) return false;
            }
            return true;
        });
    }

    async function renameProject(oldName, newName) {
        const sanitizedNewName = (newName || '').trim().slice(0, 18);
        if (!sanitizedNewName) return;
        try {
            const db = await openDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction([STORE], 'readwrite');
                const store = tx.objectStore(STORE);
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        const val = cursor.value;
                        const defaultName = i18n('dashboardNoName') || 'Unnamed';
                        if (
                            val.projectName === oldName ||
                            (!val.projectName && (oldName === defaultName || oldName === 'Unnamed'))
                        ) {
                            val.projectName = sanitizedNewName;
                            cursor.update(val);
                        }
                        cursor.continue();
                    } else {
                        db.close();
                        resolve();
                    }
                };
                req.onerror = () => {
                    db.close();
                    reject(req.error);
                };
            });
            if (activeProject === oldName) {
                activeProject = sanitizedNewName;
            }
            await loadData();
            notifyPomoStatsChanged();
        } catch (err) {
            console.error('Error renaming project:', err);
        }
    }

    function selectAll() {
        view = 'dashboard';
        activeProject = null;
        activeFolder = null;
        renderAll();
    }

    function selectProject(name) {
        view = 'dashboard';
        activeProject = activeProject === name ? null : name;
        activeFolder = null;
        if (activeProject) {
            for (const e of allData) {
                if (e.projectName === activeProject && e.projectFolder) {
                    openFolders.add(e.projectFolder);
                    break;
                }
            }
        }
        renderAll();
    }

    function toggleFolderSelection(name) {
        view = 'dashboard';
        if (!name || activeFolder === name) {
            activeFolder = null;
        } else {
            activeFolder = name;
            openFolders.add(name);
        }
        activeProject = null;
        renderAll();
    }

    function toggleFolder(folder) {
        if (openFolders.has(folder)) {
            openFolders.delete(folder);
        } else {
            openFolders.add(folder);
        }
    }

    // --- TAG FILTER ---------------------------------------------------
    function populateTagFilter() {
        const tags = [...new Set(allData.map((e) => e.projectTag || '').filter(Boolean))].sort(compareNames);
        const sel = document.getElementById('tag-filter');
        if (!sel) return;

        // Keep the trigger button and drop only the stale options
        const props = { tags, activeTag, allTagsLabel: i18n('dashboardAllTags') };
        sel.querySelectorAll('option').forEach((o) => o.remove());
        apps.tagFilter = mount(TagFilter, { target: sel, props });
    }

    // --- KPIs ---------------------------------------------------------
    function renderKPIs() {
        const kpis = computeKpis(filteredData, allData, i18n, _lang);
        const props = { kpis };
        const el = document.getElementById('kpi-grid');
        if (el) {
            el.replaceChildren();
            apps.kpiGrid = mount(KpiGrid, { target: el, props });
        }
    }

    // --- STREAK -------------------------------------------------------
    function renderStreak() {
        const { currentStreak, maxStreak, bestSec, bestKey } = computeStreak(allData);
        const currEl = document.getElementById('streak-current');
        const maxEl = document.getElementById('streak-max');
        const valEl = document.getElementById('streak-best-val');
        const dateEl = document.getElementById('streak-best-date');
        if (currEl) currEl.textContent = currentStreak;
        if (maxEl) maxEl.textContent = maxStreak;
        if (valEl) valEl.textContent = bestSec > 0 ? fmtDur(bestSec) : '--';
        if (dateEl) dateEl.textContent = bestKey ? fmtDateShort(new Date(bestKey), _lang) : '';
    }

    // --- HOUR CHART ---------------------------------------------------
    function renderHourChart() {
        const hours = new Array(24).fill(0);
        const cnts = new Array(24).fill(0);
        filteredData.forEach((e) => {
            const h = new Date(e.savedAt).getHours();
            hours[h] += (e.totalFocusSeconds || 0) / 3600;
            cnts[h]++;
        });
        const maxH = Math.max(...hours, 0.001);

        const props = { hours, cnts, maxH, fmtH, i18n };
        const el = document.getElementById('hour-grid');
        el.replaceChildren();
        apps.hourGrid = mount(HourGrid, { target: el, props });
    }

    // --- HEATMAP ------------------------------------------------------
    function renderHeatmap() {
        const wrap = document.querySelector('.heatmap-wrap');
        const tooltip = document.getElementById('tooltip');

        // -- data: sessions + focus seconds per day ----------------------
        const dayMap = {};
        filteredData.forEach((e) => {
            const k = dayKey(e.savedAt);
            if (!dayMap[k]) dayMap[k] = { c: 0, focus: 0 };
            dayMap[k].c++;
            dayMap[k].focus += e.totalFocusSeconds || 0;
        });

        // -- date range: last 52 complete weeks ending today -------------
        const todayDate = new Date();
        const todayKey = dayKey(todayDate.getTime());
        const today = new SvelteDate(todayDate);
        today.setHours(23, 59, 59, 999);
        const rangeEnd = new Date(today);
        const rangeStart = new SvelteDate(today);
        rangeStart.setDate(rangeStart.getDate() - 364);
        // Snap to Monday
        const dowSnap = rangeStart.getDay();
        rangeStart.setDate(rangeStart.getDate() - (dowSnap === 0 ? 6 : dowSnap - 1));

        const locale = _lang === 'es' ? 'es-ES' : 'en-GB';

        // -- iterate weeks -> collect cells + month positions -------------
        const cells = [];
        let colIdx = 0;
        const monthPositions = []; // { col, label, colOffset }
        const monthStartCols = new SvelteSet(); // columns that contain day 1 of a new month (skip col 0)
        // Track which months we've already registered to avoid duplicates
        const seenMonths = new SvelteSet();

        const cur = new SvelteDate(rangeStart);
        while (cur <= rangeEnd) {
            for (let d = 0; d < 7; d++) {
                // Detect if this day is the 1st of a month we haven't seen yet
                const dayOfMonth = cur.getDate();
                const monthKey = `${cur.getFullYear()}-${cur.getMonth()}`;
                if (dayOfMonth === 1 && !seenMonths.has(monthKey)) {
                    seenMonths.add(monthKey);
                    const rawLabel = cur.toLocaleDateString(locale, { month: 'short' });
                    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
                    // colOffset: how many rows (days) into this column the 1st falls
                    // We'll use this to shift the label slightly so it aligns with day 1
                    monthPositions.push({ col: colIdx, label, colOffset: d });
                    if (colIdx > 0 || d > 0) monthStartCols.add(colIdx);
                }

                const k = dayKey(cur.getTime());
                const entry = dayMap[k] || { c: 0, focus: 0 };
                const c = entry.c;
                const lv = c === 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : c <= 9 ? 3 : 4;
                cells.push({
                    c,
                    focus: entry.focus,
                    lv,
                    date: new Date(cur),
                    isToday: k === todayKey,
                    isMonthStart: monthStartCols.has(colIdx) && dayOfMonth === 1,
                });
                cur.setDate(cur.getDate() + 1);
            }
            colIdx++;
        }

        // -- meta label --------------------------------------------------
        const maxC = Math.max(...Object.values(dayMap).map((d) => d.c), 1);
        const sessWord = maxC !== 1 ? i18n('dashboardSessions') : i18n('dashboardSession');
        document.getElementById('heatmap-meta').textContent = i18n('dashboardMaxSessions', maxC, sessWord);

        // -- month header spans -------------------------------------------
        // Each span covers from the exact pixel of day-1 of this month
        // to the exact pixel of day-1 of the next month.
        // colOffset = how many rows (days) into the week column the 1st falls.
        // Since columns are vertical (rows = days), the horizontal position is
        // entirely determined by the column index -- offset within the column
        // doesn't shift things horizontally. We align the label to the column
        // that contains day 1, so spans transition precisely at the boundary.
        const props = { cells, monthPositions, locale, i18n, fmtDur, tooltipEl: tooltip };
        wrap.replaceChildren();
        apps.heatmap = mount(Heatmap, { target: wrap, props });
    }

    // --- FOCUS CHART --------------------------------------------------
    function renderFocusChart() {
        const ctx = document.getElementById('focus-chart').getContext('2d');
        if (charts.focus) {
            charts.focus.destroy();
            charts.focus = null;
        }

        const dayMap = {};
        filteredData.forEach((e) => {
            const k = dayKey(e.savedAt);
            if (!dayMap[k]) dayMap[k] = { focus: 0, rest: 0 };
            dayMap[k].focus += (e.totalFocusSeconds || 0) / 3600;
            dayMap[k].rest += (e.totalBreakSeconds || 0) / 3600;
        });

        const days = Object.keys(dayMap).sort().slice(-60);
        const labels = days.map((d) => {
            const p = d.split('-');
            return `${p[2]}/${p[1]}`;
        });
        const focusVals = days.map((d) => +dayMap[d].focus.toFixed(2));
        const restVals = days.map((d) => +dayMap[d].rest.toFixed(2));

        charts.focus = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: i18n('dashboardFocusH'),
                        data: focusVals,
                        backgroundColor: (context) => {
                            const { ctx, chartArea } = context.chart;
                            if (!chartArea) return null;
                            return createVerticalGradient(ctx, chartArea, '--interactive-color', 0.8, 0.4);
                        },
                        borderRadius: 4,
                        borderSkipped: false,
                        maxBarThickness: 24,
                    },
                    {
                        label: i18n('dashboardBreakH'),
                        data: restVals,
                        backgroundColor: (context) => {
                            const { ctx, chartArea } = context.chart;
                            if (!chartArea) return null;
                            return createVerticalGradient(ctx, chartArea, '--text-color', 0.75, 0.3);
                        },
                        borderRadius: 4,
                        borderSkipped: false,
                        maxBarThickness: 24,
                    },
                    {
                        label: i18n('dashboardFocusH') + ' (Joint)',
                        data: focusVals,
                        stack: 'joint',
                        order: 1,
                        backgroundColor: (context) => {
                            const { ctx, chartArea } = context.chart;
                            if (!chartArea) return null;
                            return createVerticalGradient(ctx, chartArea, '--interactive-color', 0.6, 0.3);
                        },
                        maxBarThickness: 24,
                    },
                    {
                        label: i18n('dashboardBreakH') + ' (Joint)',
                        data: restVals,
                        stack: 'joint',
                        order: 2,
                        backgroundColor: (context) => {
                            const { ctx, chartArea } = context.chart;
                            if (!chartArea) return null;
                            return createVerticalGradient(ctx, chartArea, '--text-color', 0.5, 0.2);
                        },
                        maxBarThickness: 24,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipDef(),
                        callbacks: { footer: (items) => `Total: ${items.reduce((a, i) => a + i.raw, 0).toFixed(1)}h` },
                    },
                },
                scales: {
                    x: { ...scaleDef(), stacked: true, ticks: { ...tickDef(), maxTicksLimit: 12 } },
                    y: {
                        ...scaleDef(),
                        stacked: true,
                        ticks: { callback: (v) => v + 'h', ...tickDef() },
                        beginAtZero: true,
                    },
                },
            },
        });
    }

    // --- EFFICIENCY CHART ---------------------------------------------
    function renderEffChart() {
        const ctx = document.getElementById('eff-chart').getContext('2d');
        if (charts.eff) {
            charts.eff.destroy();
            charts.eff = null;
        }

        const sorted = [...filteredData].sort((a, b) => a.savedAt - b.savedAt);
        const labels = sorted.map((_, i) => `#${i + 1}`);
        const dates = sorted.map((e) =>
            new Date(e.savedAt).toLocaleDateString(_lang === 'es' ? 'es-ES' : 'en-GB', {
                day: '2-digit',
                month: 'short',
            }),
        );

        const vals = sorted.map((e) => {
            const t = (e.totalFocusSeconds || 0) + (e.totalBreakSeconds || 0);
            return t > 0 ? Math.round(((e.totalFocusSeconds || 0) / t) * 100) : 0;
        });
        const rolling = vals.map((_, i) => {
            const s = vals.slice(Math.max(0, i - 4), i + 1);
            return +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1);
        });

        charts.eff = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        type: 'line',
                        label: i18n('dashboardRollingAvg'),
                        data: rolling,
                        borderColor: cssVar('--text-color'),
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.45,
                        pointRadius: 0,
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        order: 1,
                    },
                    {
                        type: 'line',
                        label: i18n('dashboardEfficiency'),
                        data: vals,
                        borderColor: cssVar('--interactive-color'),
                        backgroundColor: (context) => {
                            const { ctx, chartArea } = context.chart;
                            if (!chartArea) return null;
                            return createVerticalGradient(ctx, chartArea, '--interactive-color', 0.35, 0.05);
                        },
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: cssVar('--interactive-color'),
                        pointBorderColor: cssVar('--bg-panel-color'),
                        pointBorderWidth: 2,
                        borderWidth: 3,
                        order: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipDef(),
                        callbacks: {
                            title: (items) =>
                                `${i18n('dashboardSession')} ${items[0].label}  -  ${dates[items[0].dataIndex]}`,
                            label: (c) => {
                                if (c.datasetIndex === 0) return ` ${i18n('dashboardRollingAvg')}: ${c.raw}%`;
                                return ` ${i18n('dashboardEfficiency')}: ${c.raw}%`;
                            },
                        },
                    },
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: { ...scaleDef(), ticks: { ...tickDef(), maxTicksLimit: 10 } },
                    y: {
                        ...scaleDef(),
                        min: 0,
                        max: 100,
                        ticks: { callback: (v) => v + '%', ...tickDef(), stepSize: 25 },
                    },
                },
            },
        });
    }

    // --- WEEKDAY CHART ------------------------------------------------
    function renderWeekdayChart() {
        const ctx = document.getElementById('weekday-chart').getContext('2d');
        if (charts.weekday) {
            charts.weekday.destroy();
            charts.weekday = null;
        }

        const buckets = new Array(7).fill(0),
            counts = new Array(7).fill(0);
        filteredData.forEach((e) => {
            const dow = new Date(e.savedAt).getDay();
            buckets[dow] += (e.totalFocusSeconds || 0) / 3600;
            counts[dow]++;
        });

        const order = [1, 2, 3, 4, 5, 6, 0];
        const dayLbls = [
            i18n('dashboardMonday'),
            i18n('dashboardTuesday'),
            i18n('dashboardWednesday'),
            i18n('dashboardThursday'),
            i18n('dashboardFriday'),
            i18n('dashboardSaturday'),
            i18n('dashboardSunday'),
        ];
        const vals = order.map((i) => (counts[i] > 0 ? +(buckets[i] / counts[i]).toFixed(2) : 0));
        const cnts = order.map((i) => counts[i]);

        charts.weekday = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dayLbls,
                datasets: [
                    {
                        data: vals,
                        backgroundColor: (context) => {
                            const { ctx, chartArea } = context.chart;
                            if (!chartArea) return null;
                            const idx = context.dataIndex;
                            // Weekend uses action-color, weekdays use interactive-color
                            const colorKey =
                                order[idx] === 0 || order[idx] === 6 ? '--action-color' : '--interactive-color';
                            return createVerticalGradient(ctx, chartArea, colorKey, 0.7, 0.3);
                        },
                        borderColor: order.map((d, j) =>
                            cssVar(d === 0 || d === 6 ? '--action-color' : '--interactive-color'),
                        ),
                        borderWidth: 1.5,
                        borderRadius: 6,
                        borderSkipped: false,
                        maxBarThickness: 40,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipDef(),
                        callbacks: {
                            label: (c) => [
                                ` ${fmtH(c.raw * 3600)} ${i18n('dashboardWeekAvg')}`,
                                ` ${cnts[c.dataIndex]} ${cnts[c.dataIndex] !== 1 ? i18n('dashboardSessions') : i18n('dashboardSession')}`,
                            ],
                        },
                    },
                },
                scales: {
                    x: { ...scaleDef(), ticks: { ...tickDef() } },
                    y: { ...scaleDef(), ticks: { callback: (v) => v + 'h', ...tickDef() }, beginAtZero: true },
                },
            },
        });
    }

    // --- PROJECT BAR --------------------------------------------------
    function renderProjectBar() {
        const ctx = document.getElementById('project-bar-chart').getContext('2d');
        if (charts.projectBar) {
            charts.projectBar.destroy();
            charts.projectBar = null;
        }

        const proj = {};
        filteredData.forEach((e) => {
            if (!proj[e.projectName]) proj[e.projectName] = 0;
            proj[e.projectName] += (e.totalFocusSeconds || 0) / 3600;
        });
        const sorted = Object.entries(proj)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12);
        const labels = sorted.map(([n]) => n);
        const vals = sorted.map(([, v]) => +v.toFixed(2));
        const colors = labels.map((_, i) => getProjectColor(i));

        charts.projectBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        data: vals,
                        backgroundColor: colors.map((c) => colorMix(c, 0.85)),
                        borderColor: colors,
                        borderWidth: 1.5,
                        borderRadius: 5,
                        borderSkipped: false,
                    },
                ],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { ...tooltipDef(), callbacks: { label: (c) => ` ${fmtH(c.raw * 3600)}` } },
                },
                scales: {
                    x: { ...scaleDef(), ticks: { callback: (v) => v + 'h', ...tickDef() } },
                    y: { ...scaleDef(), ticks: { ...tickDef(), maxRotation: 0 } },
                },
            },
        });
    }

    // --- DONUT --------------------------------------------------------
    function renderDonut() {
        const ctx = document.getElementById('donut-chart').getContext('2d');
        if (charts.donut) {
            charts.donut.destroy();
            charts.donut = null;
        }

        const tF = filteredData.reduce((a, e) => a + (e.totalFocusSeconds || 0), 0);
        const tB = filteredData.reduce((a, e) => a + (e.totalBreakSeconds || 0), 0);
        const tI = filteredData.reduce((a, e) => a + (e.totalInterruptionSeconds || 0), 0);

        // Donut colours taken dynamically from active theme variables
        const c1 = cssVar('--interactive-color');
        const c2 = blendColors(cssVar('--action-color'), cssVar('--header-color') || cssVar('--text-on-color'), 60);
        const c3 = cssVar('--error-color');

        charts.donut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [i18n('dashboardFocus'), i18n('dashboardBreak'), i18n('dashboardInterruption')],
                datasets: [
                    {
                        data: [tF / 3600, tB / 3600, tI / 3600],
                        backgroundColor: [colorMix(c1, 0.8), colorMix(c2, 0.8), colorMix(c3, 0.8)],
                        hoverBackgroundColor: [c1, c2, c3],
                        borderColor: cssVar('--bg-panel-color'),
                        borderWidth: 2,
                        hoverOffset: 8,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '74%',
                plugins: {
                    legend: { display: false },
                    tooltip: { ...tooltipDef(), callbacks: { label: (c) => ` ${fmtDur(c.raw * 3600)}` } },
                },
            },
        });

        const stats = [
            { label: i18n('dashboardFocus'), val: fmtDur(tF), color: c1 },
            { label: i18n('dashboardBreak'), val: fmtDur(tB), color: c2 },
            { label: i18n('dashboardInterruption'), val: fmtDur(tI), color: c3 },
        ];
        const el = document.getElementById('donut-stats');
        el.replaceChildren();
        apps.donutStats = mount(DonutStats, { target: el, props: { stats } });
    }

    // --- CYCLES CHART -------------------------------------------------
    function renderCyclesChart() {
        const ctx = document.getElementById('cycles-chart').getContext('2d');
        if (charts.cycles) {
            charts.cycles.destroy();
            charts.cycles = null;
        }

        const proj = {};
        filteredData.forEach((e) => {
            if (!proj[e.projectName]) proj[e.projectName] = 0;
            proj[e.projectName] += e.completedCycles || 0;
        });
        const sorted = Object.entries(proj)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        const labels = sorted.map(([n]) => n);
        const vals = sorted.map(([, v]) => v);
        const colors = labels.map((_, i) => getProjectColor(i));

        charts.cycles = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        data: vals,
                        backgroundColor: (context) => {
                            const { ctx, chartArea } = context.chart;
                            if (!chartArea) return null;
                            const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
                            const color = cssVar('--interactive-color');
                            gradient.addColorStop(0, colorMix(color, 0.8));
                            gradient.addColorStop(1, colorMix(color, 0.3));
                            return gradient;
                        },
                        borderColor: colors,
                        borderWidth: 1,
                        borderRadius: 4,
                        borderSkipped: false,
                        maxBarThickness: 32,
                    },
                ],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { ...tooltipDef() } },
                scales: {
                    x: { ...scaleDef(), ticks: { ...tickDef() } },
                    y: { ...scaleDef(), ticks: { ...tickDef() } },
                },
            },
        });
    }

    // --- PROJECT TABLE ------------------------------------------------
    function renderTable() {
        const proj = {};
        filteredData.forEach((e) => {
            const p = e.projectName;
            if (!proj[p])
                proj[p] = {
                    sessions: 0,
                    focus: 0,
                    cycles: 0,
                    effSum: 0,
                    effCount: 0,
                    interruptions: 0,
                    tags: new Set(),
                };
            proj[p].sessions++;
            proj[p].focus += e.totalFocusSeconds || 0;
            proj[p].cycles += e.completedCycles || 0;
            proj[p].interruptions += e.interruptions || 0;
            if (e.projectTag) proj[p].tags.add(e.projectTag);
            const t = (e.totalFocusSeconds || 0) + (e.totalBreakSeconds || 0);
            if (t > 0) {
                proj[p].effSum += ((e.totalFocusSeconds || 0) / t) * 100;
                proj[p].effCount++;
            }
        });

        const sorted = Object.entries(proj).sort((a, b) => b[1].focus - a[1].focus);
        const n = sorted.length;
        document.getElementById('project-count').textContent =
            n === 1 ? i18n('dashboardProjects_n', n) : i18n('dashboardProjects_plural', n);

        const tbody = document.getElementById('project-table-body');
        const empty = document.getElementById('table-empty');

        if (!sorted.length) {
            tbody.replaceChildren();
            apps.projectTable = mount(ProjectTable, { target: tbody, props: { sorted: [] } });
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';
        const maxF = sorted[0][1].focus;

        const props = { sorted, maxF, effColor: getThemeEffColor, projColor: getProjectColor, fmtDur };
        tbody.replaceChildren();
        apps.projectTable = mount(ProjectTable, { target: tbody, props });
    }

    // --- TIMELINE -----------------------------------------------------
    function renderTimeline() {
        const sorted = [...filteredData].sort((a, b) => b.savedAt - a.savedAt).slice(0, 50);
        const tl = document.getElementById('timeline');
        const empty = document.getElementById('timeline-empty');
        const n = filteredData.length;
        document.getElementById('sessions-count').textContent = `${n} ${i18n('dashboardInTotal')}`;

        if (!sorted.length) {
            tl.replaceChildren();
            apps.timeline = mount(Timeline, { target: tl, props: { sorted: [] } });
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        const props = { sorted, effColor, fmtDateShort, fmtTime, fmtDur, i18n };
        tl.replaceChildren();
        apps.timeline = mount(Timeline, { target: tl, props });
    }

    // --- EXPORT/IMPORT JSON ------------------------------------------
    function exportJSON() {
        const backup = {
            type: 'pomodoro_backup',
            version: 1,
            exportedAt: new Date().toISOString(),
            data: allData,
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.getElementById('download-link');
        a.href = url;
        a.download = `pomodoro-stats-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function importJSON(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backup = JSON.parse(e.target.result);
                if (backup.type !== 'pomodoro_backup' && !Array.isArray(backup)) {
                    // Support both full backup format and raw array format
                    throw new Error('Invalid file format');
                }
                const data = Array.isArray(backup) ? backup : backup.data || [];

                const db = await openDb();
                const tx = db.transaction([STORE], 'readwrite');
                const store = tx.objectStore(STORE);

                for (const entry of data) {
                    if (!entry.id) continue;
                    await new Promise((res, rej) => {
                        const req = store.put(entry);
                        req.onsuccess = () => res();
                        req.onerror = () => rej(req.error);
                    });
                }

                tx.oncomplete = () => {
                    db.close();
                    loadData();
                    notifyPomoStatsChanged();
                };
            } catch (err) {
                console.error('Import error:', err);
                // A native alert blocks the page and ignores the theme; the app's own
                // notification says the same thing in place.
                showNotification('dashboardErrorLoad', true, [err.message || String(err)]);
            }
        };
        reader.readAsText(file);
    }

    // --- RENDER ALL ---------------------------------------------------
    function renderAll() {
        applyFilters();
        const has = filteredData.length > 0;
        document.getElementById('empty-state').style.display = has ? 'none' : 'flex';
        // `wa-phases-row` is revealed by `renderWebPhases` itself, which is the only
        // thing that knows whether the tracker has anything for this period.
        ['kpi-section', 'streak-section', 'activity-row', 'charts-row2', 'charts-row3', 'bottom-row'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = has ? '' : 'none';
        });
        if (!has) {
            const waRow = document.getElementById('wa-phases-row');
            if (waRow) waRow.style.display = 'none';
        }
        if (!has) return;
        renderKPIs();
        renderStreak();
        renderHeatmap();
        renderHourChart();
        renderFocusChart();
        renderEffChart();
        renderWeekdayChart();
        renderProjectBar();
        renderDonut();
        renderCyclesChart();
        renderTable();
        renderTimeline();
        renderWebPhases();
    }

    // --- LAYOUT -------------------------------------------------------
    /**
     * [AI INSTRUCTION]
     * THE ORDER OF THE PAGE, WHICH THE READER OWNS.
     *
     * Unlike the web activity dashboard, this page's markup *is* its state: the
     * sections are real elements that nothing re-creates, so a reorder is a run of
     * `appendChild` rather than a list to re-render. `applyOrderToDom` is safe to call
     * again after every repaint, which matters for the one grid whose cards are
     * remounted from scratch each time (`#wa-phase-cards`).
     *
     * A panel never leaves its section, because the grid it sits in is the sortable
     * container and there is nowhere else to drop it.
     */
    let layout = { sections: [], panels: {} };
    /** The `sortable` handles, so they can be torn down; nothing reads it reactively. */
    const sortableGrids = new SvelteMap();

    /** Every grid on the page that holds more than one card, by its section's id. */
    function panelGrids() {
        const grids = new SvelteMap();
        document.querySelectorAll('main.main-content > section[data-sort-id]').forEach((section) => {
            const grid = section.querySelector('.chart-grid-2, .chart-grid-3, .chart-grid-3-even');
            if (grid && grid.querySelectorAll(':scope > [data-sort-id]').length > 1) {
                grids.set(section.dataset.sortId, grid);
            }
        });
        return grids;
    }

    function applyStoredLayout() {
        applyOrderToDom(document.querySelector('main.main-content'), layout.sections, 'section[data-sort-id]');
        for (const [sectionId, grid] of panelGrids()) {
            applyOrderToDom(grid, layout.panels?.[sectionId] || []);
            if (sortableGrids.has(grid)) continue;
            sortableGrids.set(
                grid,
                sortable(grid, {
                    onReorder: (ids) => {
                        layout = { ...layout, panels: { ...layout.panels, [sectionId]: ids } };
                        applyOrderToDom(grid, ids);
                        savePanelOrder('pomodoro', sectionId, ids);
                    },
                }),
            );
        }
    }

    function reorderSections(ids) {
        layout = { ...layout, sections: ids };
        applyOrderToDom(document.querySelector('main.main-content'), ids, 'section[data-sort-id]');
        saveSectionOrder('pomodoro', ids);
    }

    // --- BROWSING DURING THE TIMER ------------------------------------
    /** How many sites each card lists. Six fits the card without a scrollbar. */
    const WA_PHASE_ROWS = 6;

    /**
     * The three cards: focus, short break, long break.
     *
     * The period comes from the same filter the rest of the page uses, so a card can
     * never be showing a different fortnight from the chart beside it. The project and
     * tag filters do not apply: a browsing record has no project on it, and quietly
     * leaving the cards unfiltered while the sidebar says "work" would be a lie.
     */
    function renderWebPhases() {
        const host = document.getElementById('wa-phase-cards');
        const section = document.getElementById('wa-phases-row');
        if (!host || !section) return;

        // The record can arrive after the stats have already said there is nothing to
        // show, and one lone section under a "no data yet" screen is worse than none.
        if (!filteredData.length) {
            section.style.display = 'none';
            return;
        }

        const phases = [
            { key: 'w', title: i18n('dashboardWebPhaseFocus'), hint: i18nTitle('dashboardWebPhaseFocus') },
            { key: 's', title: i18n('dashboardWebPhaseShort'), hint: i18nTitle('dashboardWebPhaseShort') },
            { key: 'l', title: i18n('dashboardWebPhaseLong'), hint: i18nTitle('dashboardWebPhaseLong') },
        ];

        // Seconds per site per phase, over the days the period covers.
        const totals = { w: new Map(), s: new Map(), l: new Map() };
        const cutoff = activePeriod > 0 ? dayKey(Date.now() - (activePeriod - 1) * 86400000) : null;
        for (const [day, record] of Object.entries(waDays || {})) {
            if (cutoff && day < cutoff) continue;
            for (const [domain, entry] of Object.entries(record?.domains || {})) {
                for (const phase of phases) {
                    const seconds = entry?.p?.[phase.key] || 0;
                    if (seconds > 0) totals[phase.key].set(domain, (totals[phase.key].get(domain) || 0) + seconds);
                }
            }
        }

        const cards = phases.map((phase) => {
            const rows = [...totals[phase.key].entries()]
                .map(([domain, seconds]) => ({ domain, seconds }))
                .sort((a, b) => b.seconds - a.seconds);
            const total = rows.reduce((sum, row) => sum + row.seconds, 0);
            // Bars are scaled against the busiest site in *this* card, not against the
            // card's total: with one site at 90% every other bar would be a stub.
            const top = rows.length ? rows[0].seconds : 1;
            return {
                key: phase.key,
                title: phase.title,
                hint: phase.hint,
                totalLabel: total > 0 ? fmtDur(total) : '--',
                rows: rows.slice(0, WA_PHASE_ROWS).map((row) => ({
                    ...row,
                    label: fmtDur(row.seconds),
                    pct: Math.max(3, Math.round((row.seconds / top) * 100)),
                })),
            };
        });

        // A browser that has never had the tracker on has nothing to compare, and three
        // empty cards would only be three ways of saying so.
        const hasAny = cards.some((card) => card.rows.length);
        section.style.display = hasAny ? '' : 'none';
        if (!hasAny) return;

        host.replaceChildren();
        apps.webPhases = mount(WebPhaseCards, {
            target: host,
            props: { cards, emptyLabel: i18n('dashboardWebPhaseEmpty') },
        });
        // These three are built again from scratch on every repaint, so whatever order
        // the reader left them in has to be put back each time.
        applyStoredLayout();
    }

    // --- LOAD DATA ----------------------------------------------------
    async function loadData() {
        const btn = document.getElementById('refresh-btn');
        btn.classList.add('spinning');
        try {
            // The browsing record is a nice-to-have on this page: if the tracker is off
            // or the worker is asleep the three phase cards simply do not appear, and
            // the rest of the dashboard is unaffected.
            fetchActivity(0)
                .then((response) => {
                    if (!response?.success) return;
                    waDays = response.days || {};
                    renderWebPhases();
                })
                .catch(() => {});
            // Folded and sorted by `dedupeSessions`, shared with the pomodoro side
            // panel: autosave's cumulative snapshots have to be collapsed the same way
            // in both, or the same session is counted a different number of times.
            allData = dedupeSessions(await getAllStats());
            populateTagFilter();
            renderAll();
            document.getElementById('last-updated').textContent =
                i18n('dashboardUpdated') +
                ' ' +
                new Date().toLocaleTimeString(_lang === 'es' ? 'es-ES' : 'en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                });
        } catch (err) {
            console.error('Dashboard error:', err);
            const es = document.getElementById('empty-state');
            es.style.display = 'flex';
            es.querySelector('.empty-title').textContent = i18n('dashboardErrorLoad');
            es.querySelector('.empty-sub').textContent = err.message || String(err);
            [
                'kpi-section',
                'streak-section',
                'activity-row',
                'charts-row2',
                'charts-row3',
                'bottom-row',
                'wa-phases-row',
            ].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        } finally {
            const ld = document.getElementById('loading');
            ld.classList.add('hidden');
            setTimeout(() => {
                ld.style.display = 'none';
            }, 350);
            btn.classList.remove('spinning');
        }
    }

    // --- EVENTS -------------------------------------------------------
    // Runs in onMount: the component DOM does not exist yet during script init
    function initEvents() {
        document.getElementById('refresh-btn').addEventListener('click', loadData);
        document.getElementById('export-btn').addEventListener('click', exportJSON);
        document.getElementById('import-btn').addEventListener('click', () => {
            document.getElementById('import-input').click();
        });
        document.getElementById('import-input').addEventListener('change', (e) => {
            importJSON(e.target.files[0]);
            e.target.value = ''; // Reset for next time
        });

        document.getElementById('period-filters').addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;
            document.querySelectorAll('#period-filters .filter-chip').forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            activePeriod = +chip.dataset.period;
            renderAll();
        });

        document.getElementById('tag-filter').addEventListener('change', (e) => {
            activeTag = e.target.value;
            renderAll();
        });
    }

    // --- REAL-TIME SYNC -----------------------------------------------
    let _syncChannel = null;
    let _dataSyncTimer = null;
    let _onMessageListener = null;
    let _visibilityHandler = null;
    let _focusHandler = null;

    function triggerSyncLoad() {
        if (_dataSyncTimer) clearTimeout(_dataSyncTimer);
        _dataSyncTimer = setTimeout(() => {
            _dataSyncTimer = null;
            loadData();
        }, 150);
    }

    function initSync() {
        try {
            _syncChannel = new BroadcastChannel('pomodoro_sync_channel');
            _syncChannel.onmessage = (e) => {
                if (e.data?.type === 'pomodoroStatsChanged') {
                    triggerSyncLoad();
                }
            };
        } catch {}

        _onMessageListener = (msg) => {
            if (msg.action === 'pomodoroStatsChanged' || msg.action === 'pomodoroStatsUpdated') {
                triggerSyncLoad();
            }
        };
        try {
            chrome.runtime.onMessage.addListener(_onMessageListener);
        } catch {}

        _visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                triggerSyncLoad();
            }
        };
        document.addEventListener('visibilitychange', _visibilityHandler);

        _focusHandler = () => {
            triggerSyncLoad();
        };
        window.addEventListener('focus', _focusHandler);
    }

    // --- INIT ---------------------------------------------------------

    onMount(async () => {
        initEvents();
        await i18nStore.init();
        await _loadI18n();
        initTheme();
        initNumberSpinnerArrows();
        initSync();
        // Before the first paint of the data: the sections are already in the DOM, so
        // putting them in the reader's order now means they are never seen in the
        // page's own.
        layout = await loadLayout('pomodoro');
        applyStoredLayout();
        loadData();
    });

    onDestroy(() => {
        for (const handle of sortableGrids.values()) handle.destroy?.();
        sortableGrids.clear();
    });

    onDestroy(() => {
        if (_syncChannel) {
            try {
                _syncChannel.close();
            } catch {}
            _syncChannel = null;
        }
        if (_dataSyncTimer) {
            clearTimeout(_dataSyncTimer);
            _dataSyncTimer = null;
        }
        if (_onMessageListener) {
            try {
                chrome.runtime.onMessage.removeListener(_onMessageListener);
            } catch {}
        }
        if (_visibilityHandler) {
            document.removeEventListener('visibilitychange', _visibilityHandler);
        }
        if (_focusHandler) {
            window.removeEventListener('focus', _focusHandler);
        }
    });
</script>

<!-- --- Loading ---------------------------------------------------- -->
<div id="loading">
    <div class="loader-ring"></div>
    <div class="loader-text">{$t('dashboardLoading') || 'Loading statistics...'}</div>
</div>

<!-- --- Tooltip (heatmap) ------------------------------------------- -->
<div id="tooltip"></div>

<!-- --- Header ----------------------------------------------------- -->
<DashboardHeader />

<!-- --- App body ---------------------------------------------------- -->
<div class="app-body">
    <!-- -- Sidebar ---------------------------------------------------- -->
    <Sidebar
        folderNames={sidebarData.folderNames}
        folderMap={sidebarData.folderMap}
        projectCounts={sidebarData.projectCounts}
        standaloneProjs={sidebarData.standaloneProjs}
        totalCount={sidebarData.totalCount}
        {activeProject}
        {activeFolder}
        {openFolders}
        query={sidebarQuery}
        {view}
        onQuery={(q) => {
            sidebarQuery = q;
        }}
        onSelectAll={selectAll}
        onSelectProject={selectProject}
        onSelectFolder={toggleFolderSelection}
        onToggleFolder={toggleFolder}
        onRenameProject={renameProject}
        onOpenSettings={() => (view = view === 'settings' ? 'dashboard' : 'settings')}
    />

    <!-- -- Main content ----------------------------------------------- -->
    <!-- Sections can be dragged into another order; the panels inside a section can be
         rearranged among themselves. See `actions/sortable.js`. -->
    <main
        class="main-content"
        hidden={view === 'settings'}
        use:sortable={{ items: 'section[data-sort-id]', onReorder: reorderSections }}
    >
        <!-- Empty / error state -->
        <!-- These sections start hidden and renderAll() reveals them once it knows
             there is data: rendering them first meant painting the whole dashboard and
             then removing it again whenever there was nothing to show. -->
        <div class="empty-state" id="empty-state" style="display:none">
            <div class="empty-icon">
                <svg
                    width="64"
                    height="64"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path d="M18 20V10M12 20V4M6 20v-6" />
                    <path d="M4 20h16" />
                </svg>
            </div>
            <div class="empty-title">{$t('dashboardNoData') || 'No data yet'}</div>
            <div class="empty-sub">
                {$t('dashboardNoDataSub') ||
                    'Complete and save your first Pomodoro sessions to see the statistics here.'}
            </div>
        </div>

        <!-- -- KPIs ----------------------------------------------------- -->
        <DashboardKpiSection />

        <!-- -- Browsing during focus and the two breaks ------------------ -->
        <DashboardWebPhasesSection />

        <!-- -- Streaks & time of day ------------------------------------ -->
        <DashboardStreaksSection />

        <!-- -- Heatmap -------------------------------------------- -->
        <DashboardHeatmapSection />

        <!-- -- Time and efficiency -------------------------------------- -->
        <DashboardTimeEfficiencySection />

        <!-- -- By project --------------------------------------------- -->
        <DashboardProjectAnalysisSection />

        <!-- -- Table + Timeline ----------------------------------------- -->
        <DashboardBreakdownSection />
    </main>
    <!-- /main-content -->

    {#if view === 'settings'}
        <main class="main-content">
            <PomodoroSettingsView />
        </main>
    {/if}
</div>
<!-- /app-body -->

<ConfirmDialog />
