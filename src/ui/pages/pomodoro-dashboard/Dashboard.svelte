<script>
    import { onMount, tick, mount } from 'svelte';
    import { SvelteSet, SvelteMap, SvelteDate } from 'svelte/reactivity';
    import { showNotification } from '../../../utils/i18n.js';
    import ConfirmDialog from '../../components/common/ConfirmDialog.svelte';
    import { t, i18nStore, tt } from '../../stores/i18nStore.js';
    /* ===============================================================
   Pomodoro Dashboard -- Logic
   =============================================================== */

    import Sidebar from './components/Sidebar.svelte';
    import TagFilter from './components/TagFilter.svelte';
    import KpiGrid from './components/KpiGrid.svelte';
    import HourGrid from './components/HourGrid.svelte';
    import Heatmap from './components/Heatmap.svelte';
    import DonutStats from './components/DonutStats.svelte';
    import ProjectTable from './components/ProjectTable.svelte';
    import Timeline from './components/Timeline.svelte';
    import DashboardHeader from './components/DashboardHeader.svelte';
    import DashboardKpiSection from './components/DashboardKpiSection.svelte';
    import DashboardStreaksSection from './components/DashboardStreaksSection.svelte';
    import DashboardHeatmapSection from './components/DashboardHeatmapSection.svelte';
    import DashboardTimeEfficiencySection from './components/DashboardTimeEfficiencySection.svelte';
    import DashboardProjectAnalysisSection from './components/DashboardProjectAnalysisSection.svelte';
    import DashboardBreakdownSection from './components/DashboardBreakdownSection.svelte';
    import {
        PROJECT_COLORS,
        fmtDur,
        fmtH,
        fmtDate,
        fmtDateShort,
        fmtTime,
        dayKey,
        effColor,
        projColor,
        computeKpis,
        computeStreak,
    } from './dashboardAnalytics.js';

    let apps = {
        sidebar: null,
        tagFilter: null,
        kpiGrid: null,
        hourGrid: null,
        heatmap: null,
        donutStats: null,
        projectTable: null,
        timeline: null,
    };

    // --- i18n ---------------------------------------------------------
    // Loads the active language messages and exposes the i18n(key) helper
    let _msgs = {};
    let _lang = 'en';
    let openFolders = new SvelteSet();
    let closedFolders = new SvelteSet();

    const FOLDER_CLOSED_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M3 8.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C4.52 5 5.08 5 6.2 5h3.475c.489 0 .733 0 .963.055.204.05.4.13.579.24.201.123.374.296.72.642l.126.126c.346.346.519.519.72.642q.271.165.579.24c.23.055.474.055.963.055H17.8c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C21 8.52 21 9.08 21 10.2v5.6c0 1.12 0 1.68-.218 2.108a2 2 0 0 1-.874.874C19.48 19 18.92 19 17.8 19H6.2c-1.12 0-1.68 0-2.108-.218a2 2 0 0 1-.874-.874C3 17.48 3 16.92 3 15.8z"/></svg>`;
    const FOLDER_OPEN_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4 9V6.472a2 2 0 0 1 .211-.894L5 4h5l1 2h10a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2h-2"/><path d="M17.236 9H2.31a1 1 0 0 0-.965 1.263l2.254 8.263A2 2 0 0 0 5.528 20H19.69a1 1 0 0 0 .965-1.263l-2.455-9A1 1 0 0 0 17.236 9Z"/></svg>`;
    const CLOCK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const ALERT_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    async function _loadI18n() {
        try {
            const stored = await chrome.storage.local.get('preferred-language');
            _lang = stored['preferred-language'] || (chrome.i18n.getUILanguage().startsWith('es') ? 'es' : 'en');
        } catch (_) {
            _lang = 'en';
        }
        try {
            const url = chrome.runtime.getURL(`_locales/${_lang}/messages.json`);
            const res = await fetch(url);
            if (res.ok) {
                _msgs = await res.json();
                return;
            }
        } catch (_) {}
        // Fallback to English
        try {
            const url = chrome.runtime.getURL('_locales/en/messages.json');
            const res = await fetch(url);
            if (res.ok) _msgs = await res.json();
        } catch (_) {}
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
        } catch (_) {
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
                            } catch (_) {}
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
        } catch (_) {}
    }

    // --- DB ACCESS ----------------------------------------------------
    const DB_NAME = 'Intelligent_Workspace';
    const STORE = 'pomodoroStats';
    const DB_VER = 6;

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = () => {};
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
    let allData = [];
    let filteredData = [];
    let activePeriod = 0;
    let activeFolder = null;
    let activeProject = null;
    let activeTag = '';
    let sidebarQuery = '';
    let charts = {};

    // --- CHART DEFAULTS -----------------------------------------------
    Chart.defaults.color = cssVar('--text-color');
    if (Chart.defaults.font) {
        Chart.defaults.font.family = "'Roboto Mono', monospace";
    }

    const tooltipDef = () => ({
        backgroundColor: cssVar('--bg-panel-color'),
        borderColor: cssVar('--border-color'),
        borderWidth: 1,
        titleColor: cssVar('--text-on-color'),
        bodyColor: cssVar('--text-color'),
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: "'Roboto Mono', monospace", size: 12, weight: '600' },
        bodyFont: { family: "'Roboto Mono', monospace", size: 11 },
        displayColors: true,
        boxPadding: 4,
    });

    const scaleDef = () => ({
        grid: { color: cssVar('--border-color'), drawBorder: false },
        border: { display: false },
    });

    const tickDef = () => ({
        color: cssVar('--text-color'),
        font: { family: "'Roboto Mono', monospace", size: 11 },
    });

    // Creates vertical gradients using resolved theme variables
    function createVerticalGradient(ctx, chartArea, varName, alphaStart = 0.8, alphaEnd = 0.2) {
        const { top, bottom } = chartArea;
        const gradient = ctx.createLinearGradient(0, top, 0, bottom);
        const baseColor = cssVar(varName);
        gradient.addColorStop(0, colorMix(baseColor, alphaStart));
        gradient.addColorStop(1, colorMix(baseColor, alphaEnd));
        return gradient;
    }

    function colorMix(color, alpha) {
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${alpha})`;
        }
        if (color.startsWith('rgb')) {
            return color
                .replace(/rgb\(|rgba\(/, 'rgba(')
                .replace(/\)$/, `,${alpha})`)
                .replace(/,[\d.]+\)$/, `,${alpha})`);
        }
        return color;
    }

    // Resolves a CSS variable to its current computed value
    // data-theme lives on document.body, so the values are read from body
    function cssVar(v) {
        const name = v.startsWith('var(') ? v.slice(4, -1) : v.startsWith('--') ? v : '--' + v;
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name;
    }

    // --- FILTER -------------------------------------------------------
    function applyFilters() {
        const now = Date.now();
        filteredData = allData.filter((e) => {
            if (activePeriod > 0 && e.savedAt < now - activePeriod * 86400000) return false;
            if (activePeriod === 1) {
                const today = new SvelteDate();
                today.setHours(0, 0, 0, 0);
                if (e.savedAt < today.getTime()) return false;
            }
            if (activeTag && (e.projectTag || '') !== activeTag) return false;
            if (activeProject) {
                if (e.projectName !== activeProject) return false;
            } else if (activeFolder !== null) {
                if ((e.projectFolder || '') !== activeFolder) return false;
            }
            return true;
        });
    }

    // --- SIDEBAR ------------------------------------------------------
    function buildSidebar() {
        const folderMap = {};
        const noFolder = [];
        const projectCounts = {};

        allData.forEach((e) => {
            const p = e.projectName || i18n('dashboardNoName');
            const f = e.projectFolder || '';
            projectCounts[p] = (projectCounts[p] || 0) + 1;
            if (f) {
                if (!folderMap[f]) folderMap[f] = new Set();
                folderMap[f].add(p);
            } else {
                if (!noFolder.includes(p)) noFolder.push(p);
            }
        });

        const q = sidebarQuery.toLowerCase();
        const matchesQuery = (name) => !q || name.toLowerCase().includes(q);
        const scrollEl = document.getElementById('sidebar-scroll');
        const props = {
            folderNames: Object.keys(folderMap).sort(),
            folderMap,
            projectCounts,
            activeProject,
            activeFolder,
            openFolders,
            closedFolders,
            sidebarQuery,
            standaloneProjs: noFolder,
        };

        scrollEl.replaceChildren();
        apps.sidebar = mount(Sidebar, {
            target: scrollEl,
            props: {
                ...props,
                ontoggleFolder: (detail) => {
                    const { folder, isProjectInThisFolder } = detail;
                    if (isProjectInThisFolder) {
                        if (closedFolders.has(folder)) closedFolders.delete(folder);
                        else closedFolders.add(folder);
                    } else {
                        if (openFolders.has(folder)) openFolders.delete(folder);
                        else openFolders.add(folder);
                        selectFolder(folder);
                    }
                    buildSidebar();
                    updateAllItem();
                    renderAll();
                },
                onselectProject: (detail) => selectProject(detail.project),
                onrenameProject: (detail) => renameProject(detail.oldName, detail.newName),
            },
        });
    }

    async function renameProject(oldName, newName) {
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
                            val.projectName = newName;
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
                activeProject = newName;
            }
            await loadData();
        } catch (err) {
            console.error('Error renaming project:', err);
        }
    }

    function selectProject(name) {
        activeProject = activeProject === name ? null : name;
        if (activeProject) {
            activeFolder = null;
            // If the project is in a folder, ensure it's not manually marked as closed
            allData.some((e) => {
                if (e.projectName === name && e.projectFolder) {
                    closedFolders.delete(e.projectFolder);
                    return true;
                }
                return false;
            });
        }
        buildSidebar();
        updateAllItem();
        renderAll();
    }

    function selectFolder(name) {
        if (activeFolder === name && !activeProject) {
            activeFolder = null;
            activeProject = null;
        } else {
            activeFolder = name;
            activeProject = null;
        }
        buildSidebar();
        updateAllItem();
        renderAll();
    }

    function updateAllItem() {
        const allEl = document.getElementById('sidebar-all-item');
        if (allEl) allEl.classList.toggle('active', !activeProject && activeFolder === null);
    }

    // --- TAG FILTER ---------------------------------------------------
    function populateTagFilter() {
        const tags = [...new Set(allData.map((e) => e.projectTag || '').filter(Boolean))].sort();
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

        // -- constants matching CSS ---------------------------------------
        const CELL = 17; // px  (grid-template-rows cell size)
        const GAP = 3; // px  (grid gap)
        const STRIDE = CELL + GAP; // 20 px per column

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
            // 7 cells for this week column -- scan first to detect day-1 boundaries
            const weekStart = new Date(cur);
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

        // Bar color by efficiency level: <40 error, 40-69 action, >=70 interactive
        const barColors = vals.map((v) => {
            if (v >= 70) return colorMix(cssVar('--interactive-color'), 0.75);
            if (v >= 40) return colorMix(cssVar('--text-color'), 0.45);
            return colorMix(cssVar('--error-color'), 0.65);
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
        const colors = labels.map((_, i) => projColor(i));

        charts.projectBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        data: vals,
                        backgroundColor: colors.map((c) => c),
                        borderColor: colors,
                        borderWidth: 1,
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

        // Donut colours taken from theme variables
        const c1 = cssVar('--interactive-color');
        const c2 = cssVar('--text-color');
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
        const colors = labels.map((_, i) => projColor(i));

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

        const props = { sorted, maxF, effColor, projColor, fmtDur };
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

                let importedCount = 0;
                for (const entry of data) {
                    if (!entry.id) continue;
                    await new Promise((res, rej) => {
                        const req = store.put(entry);
                        req.onsuccess = () => res();
                        req.onerror = () => rej(req.error);
                    });
                    importedCount++;
                }

                tx.oncomplete = () => {
                    db.close();
                    // Use a more subtle feedback if possible, but alert is fine for now
                    loadData();
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
        ['kpi-section', 'streak-section', 'activity-row', 'charts-row2', 'charts-row3', 'bottom-row'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = has ? '' : 'none';
        });
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
    }

    // --- LOAD DATA ----------------------------------------------------
    async function loadData() {
        const btn = document.getElementById('refresh-btn');
        btn.classList.add('spinning');
        try {
            allData = await getAllStats();
            // Deduplicate cumulative entries from the same session (legacy or autosave snapshots)
            const sessionMap = new SvelteMap();
            allData.forEach((entry) => {
                const sid = entry.sessionStarted;
                if (!sid) {
                    // Entries without sessionStarted are kept as unique (fallback for very old data)
                    sessionMap.set(Symbol(), entry);
                } else {
                    const existing = sessionMap.get(sid);
                    if (!existing || entry.savedAt > existing.savedAt) {
                        sessionMap.set(sid, entry);
                    }
                }
            });
            allData = Array.from(sessionMap.values());
            allData.sort((a, b) => b.savedAt - a.savedAt);
            populateTagFilter();
            buildSidebar();
            updateAllItem();
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
            ['kpi-section', 'streak-section', 'activity-row', 'charts-row2', 'charts-row3', 'bottom-row'].forEach(
                (id) => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                },
            );
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

        document.getElementById('sidebar-search-input').addEventListener('input', (e) => {
            sidebarQuery = e.target.value;
            buildSidebar();
        });

        document.getElementById('sidebar-all-item').addEventListener('click', () => {
            activeProject = null;
            activeFolder = null;
            buildSidebar();
            updateAllItem();
            renderAll();
        });
    }

    // --- INIT ---------------------------------------------------------

    onMount(async () => {
        initEvents();
        await i18nStore.init();
        await _loadI18n();
        initTheme();
        loadData();
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
    <aside class="sidebar">
        <div class="sidebar-header">
            <div class="sidebar-top-label">{$t('dashboardProjects') || 'Projects'}</div>
            <div class="sidebar-search">
                <svg
                    class="search-icon"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    focusable="false"
                >
                    <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" />
                    <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
                <input type="text" id="sidebar-search-input" placeholder={$t('dashboardSearch')} />
            </div>
        </div>

        <!-- All projects item -->
        <div class="sidebar-all">
            <div class="sidebar-item active" id="sidebar-all-item">
                <span class="si-name">{$t('dashboardAllProjects') || 'All projects'}</span>
            </div>
        </div>

        <!-- Folders + projects tree -->
        <div class="sidebar-scroll" id="sidebar-scroll"></div>
    </aside>

    <!-- -- Main content ----------------------------------------------- -->
    <main class="main-content">
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
</div>
<!-- /app-body -->

<ConfirmDialog />
