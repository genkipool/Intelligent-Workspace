<script>
    /**
     * [AI INSTRUCTION]
     * THE WEB ACTIVITY DASHBOARD.
     *
     * Everything on screen is derived from one payload the service worker hands over,
     * so there is a single source of truth and a single refresh path. The maths lives
     * in `webActivityAnalytics.js`, the chart palette in
     * `services/dashboard/chartTheme.js`, and the cards, heatmap and hourly grid are
     * the same components the pomodoro dashboard uses. If a section needs a new
     * number, add it to the analytics module — not here.
     */
    import { onDestroy, onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import '../../../core/services/webActivitySchema.js';

    import { t, tt, currentLang, i18nStore, messages } from '../../stores/i18nStore.js';
    import { confirmAction } from '../../stores/confirmStore.js';
    import { showNotification } from '../../../utils/i18n.js';
    import { initializeActiveTheme } from '../../../utils/theme.js';
    import { i18nService } from '../../services/i18nService.js';

    import ConfirmDialog from '../../components/common/ConfirmDialog.svelte';
    import ChartCanvas from '../../components/dashboard/ChartCanvas.svelte';
    import ChartCard from '../../components/dashboard/ChartCard.svelte';
    import DashboardSection from '../../components/dashboard/DashboardSection.svelte';
    import DonutStats from '../../components/dashboard/DonutStats.svelte';
    import Heatmap from '../../components/dashboard/Heatmap.svelte';
    import HourGrid from '../../components/dashboard/HourGrid.svelte';
    import KpiGrid from '../../components/dashboard/KpiGrid.svelte';

    import ActivityHeader from './components/ActivityHeader.svelte';
    import BlocksList from './components/BlocksList.svelte';
    import SnoozedList from './components/SnoozedList.svelte';
    import LimitModal from './components/LimitModal.svelte';
    import SiteSidebar from './components/SiteSidebar.svelte';
    import SitesTable from './components/SitesTable.svelte';
    import VisitTimeline from './components/VisitTimeline.svelte';
    import WebActivityIcons from './components/WebActivityIcons.svelte';
    import PasswordPromptModal from './components/PasswordPromptModal.svelte';
    import SettingsView from './settings/SettingsView.svelte';
    import SettingsDialog from '../../components/common/SettingsDialog.svelte';
    import ActivityPanel from './panel/ActivityPanel.svelte';

    import { categoryLabel, customCategoriesOf } from './categories.js';
    import { hasLock, loosensRule, snoozeNeedsPassword, verifyLock } from './blockLock.js';
    import { sortable } from '../../actions/sortable.js';
    import {
        applyOrder,
        loadLayout,
        savePanelOrder,
        saveSectionOrder,
    } from '../../services/dashboard/dashboardLayout.js';
    import {
        clearActivity,
        fetchActivity,
        importActivity,
        saveLimit,
        saveSettings,
        snoozeLimit,
    } from '../../services/webActivityService.js';
    import {
        aggregateCategories,
        aggregateSites,
        computeKpis,
        daysInPeriod,
        heatmapCells,
        limitRows,
        secondsPerDay,
        secondsPerHour,
        secondsPerWeekday,
        activeSitesPerHour,
    } from './webActivityAnalytics.js';
    import {
        applyChartDefaults,
        accentRamp,
        createVerticalGradient,
        cssVar,
        scaleDef,
        tickDef,
        tooltipDef,
    } from '../../services/dashboard/chartTheme.js';
    import { dayKey, fmtDur, fmtH, weekdayNames } from '../../services/dashboard/format.js';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    import { DEFAULT_TABLE_PREFS, SITE_TABLE_PREFS_KEY, normalizeTablePrefs } from './components/siteColumns.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    /** This page, for the panel's "open in a tab" button. */
    const PAGE_PATH = 'src/ui/pages/web-activity/web-activity.html';

    // The palette is already on <html> from the localStorage mirror, so Chart.js can
    // resolve its defaults now rather than after the first paint.
    applyChartDefaults(Chart);

    // ── State ─────────────────────────────────────────────────────────────────
    let payload = $state({
        days: {},
        limits: {},
        settings: { ...WA.DEFAULT_SETTINGS },
        recent: [],
        openSegment: null,
        snoozeUses: 0,
    });
    let loading = $state(true);
    let refreshing = $state(false);
    let error = $state(null);
    let lastUpdated = $state(0);

    let period = $state(7);
    let categoryFilter = $state('');
    let siteFilter = $state(null);
    let sidebarQuery = $state('');
    // A SvelteSet is reactive on its own, so it is not wrapped in $state.
    const openCategories = new SvelteSet();
    /** `{ domain, limit, tab }` while the rule dialog is open. */
    let editingLimit = $state(null);
    /** Which of the two things the main column is showing: 'dashboard' or 'settings'. */
    let view = $state('dashboard');
    /** The panel has no main column to give over, so its settings open in a dialog. */
    let panelSettingsOpen = $state(false);

    /**
     * The password prompt, while one is open: `{ resolve }`, the promise the guarded
     * action is waiting on. One at a time, because it is modal.
     */
    let passwordPrompt = $state(null);
    const blockLock = $derived(payload.settings?.blockPassword || null);

    /**
     * Whether this is the side panel rather than a tab. The same page serves both —
     * one payload, one set of dialogs, one idea of what a limit is — but a column a
     * few hundred pixels wide cannot hold a dashboard, so it gets its own view.
     */
    const isPanel = new URLSearchParams(window.location.search).get('context') === 'sidepanel';

    /**
     * Ticks once a minute so the panel's clock keeps up without re-reading anything.
     * The dashboard has a refresh button and a visibility hook; the panel is looked at
     * *while* the time is being spent, so a figure that only moves when the tab is
     * left is a figure that is always wrong there.
     */
    let minuteTick = $state(0);

    /** The site of the tab in front, which the panel scrolls to and marks. */
    let activeDomain = $state(null);

    async function readActiveDomain() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            activeDomain = WA.domainOf(tab?.url);
        } catch {
            activeDomain = null;
        }
    }
    /** Which columns the log shows and how it is sorted, remembered between visits. */
    let tablePrefs = $state({ ...DEFAULT_TABLE_PREFS });

    /**
     * Bumped whenever the palette changes, and read by every chart config so they are
     * rebuilt with the new colours. Chart.js resolves its colours once, at build time,
     * so a theme change is not something it can pick up on its own.
     */
    let themeVersion = $state(0);
    let tooltipEl = $state(null);

    // ── Layout ────────────────────────────────────────────────────────────────
    /**
     * The sections this page has, in the order it declares them, and the panels of the
     * two sections that hold more than one. Everything drag-and-drop needs is here: the
     * markup renders `sectionOrder`, each multi-panel grid renders its own list, and a
     * drop only ever rewrites one of these arrays.
     */
    const SECTION_IDS = ['log', 'blocks', 'grace', 'summary', 'patterns', 'heatmap', 'trends', 'sites', 'timeline'];
    const PANEL_IDS = {
        patterns: ['hours', 'weekday'],
        trends: ['daily', 'categories'],
    };

    let sectionOrder = $state([...SECTION_IDS]);
    let panelOrder = $state({ ...PANEL_IDS });

    async function restoreLayout() {
        const layout = await loadLayout('webActivity');
        sectionOrder = applyOrder(SECTION_IDS, layout.sections);
        panelOrder = Object.fromEntries(
            Object.entries(PANEL_IDS).map(([section, ids]) => [section, applyOrder(ids, layout.panels?.[section])]),
        );
    }

    function reorderSections(ids) {
        sectionOrder = ids;
        saveSectionOrder('webActivity', ids);
    }

    function reorderPanels(section, ids) {
        panelOrder = { ...panelOrder, [section]: ids };
        savePanelOrder('webActivity', section, ids);
    }

    // ── Derived ───────────────────────────────────────────────────────────────
    const dayKeys = $derived(daysInPeriod(payload.days, period));
    /** Every site in the period, before the sidebar filters — the sidebar lists them all. */
    const allSites = $derived(
        aggregateSites(payload.days, dayKeys, payload.limits).filter(
            (site) => !(payload.settings?.ignoredDomains || []).includes(site.domain),
        ),
    );
    const allKnownDomains = $derived(
        Array.from(new Set([...allSites.map((s) => s.domain), ...Object.keys(payload.limits || {})])).filter(
            (d) => !(payload.settings?.ignoredDomains || []).includes(d) && d !== '*',
        ),
    );
    const sites = $derived(
        allSites.filter(
            (site) =>
                (!siteFilter || site.domain === siteFilter) && (!categoryFilter || site.category === categoryFilter),
        ),
    );
    const totalSeconds = $derived(sites.reduce((sum, site) => sum + site.seconds, 0));
    const sidebarTotal = $derived(allSites.reduce((sum, site) => sum + site.seconds, 0));
    const categories = $derived(aggregateCategories(allSites).map((row) => row.category));
    const categoryRows = $derived(aggregateCategories(sites));
    const hours = $derived(secondsPerHour(sites));
    const hourCounts = $derived(activeSitesPerHour(sites));
    const perDay = $derived(secondsPerDay(payload.days, dayKeys, siteFilter));
    const heatmap = $derived(heatmapCells(payload.days));
    const rows = $derived(limitRows(payload.limits, payload.days));
    const verdicts = $derived(Object.fromEntries(rows.map((row) => [row.domain, row.verdict])));
    const hasData = $derived(allSites.length > 0);

    /** The categories the user added, and how a category id is named on screen. */
    const customCategories = $derived(customCategoriesOf(payload.settings));
    const nameCategory = $derived((id) => categoryLabel(id, customCategories, (key) => $t(key)));

    /**
     * The four filled bands of the calendar's legend.
     *
     * A cell's level is a quarter of the busiest day on record (see `heatmapCells`),
     * so the legend can say what each shade is worth instead of leaving the reader to
     * guess. The swatches are the very colours the cells use, quoted from the same
     * stylesheet rules.
     */
    const HEATMAP_LEGEND = $derived(
        [
            { level: 1, color: 'color-mix(in srgb,var(--interactive-color) 20%,var(--bg-color))' },
            { level: 2, color: 'color-mix(in srgb,var(--interactive-color) 42%,var(--bg-color))' },
            { level: 3, color: 'color-mix(in srgb,var(--interactive-color) 68%,var(--bg-color))' },
            { level: 4, color: 'var(--interactive-color)' },
        ].map((band) => ({
            ...band,
            label: (band.level < 4 ? '≤ ' : '') + fmtDur((heatmap.max * band.level) / 4),
        })),
    );

    /** Only the sites the blocker is stopping right now — what the dashboard reports. */
    const blockedRows = $derived(rows.filter((row) => row.verdict.blocked));

    /** Sites currently under grace period (snoozed). */
    const snoozedRows = $derived.by(() => {
        minuteTick;
        return rows.filter(
            (row) => row.verdict.snoozed || (row.limit.snoozeUntil && row.limit.snoozeUntil > Date.now()),
        );
    });

    /** Today's sites, longest first — what the side panel is asked about. */
    const todaySites = $derived.by(() => {
        minuteTick;
        return aggregateSites(payload.days, daysInPeriod(payload.days, 1), payload.limits).filter(
            (site) => !(payload.settings?.ignoredDomains || []).includes(site.domain),
        );
    });
    const todayTotal = $derived(todaySites.reduce((sum, site) => sum + site.seconds, 0));

    /** How many sites sit in each category, for the settings page's category list. */
    const categoryUsage = $derived.by(() => {
        const counts = {};
        for (const site of allSites) counts[site.category] = (counts[site.category] || 0) + 1;
        return counts;
    });

    /** `i18n(key, ...params)` — the plain-function shape the analytics module takes. */
    const i18n = $derived((key, ...params) => i18nService.translate($messages, key, params));

    const kpis = $derived(
        computeKpis({
            sites,
            days: payload.days,
            dayKeys,
            limits: payload.limits,
            lang: $currentLang,
            i18n,
            categoryLabel: nameCategory,
        }),
    );

    const donutRows = $derived.by(() => {
        const top = categoryRows.slice(0, 10);
        const ramp = accentRamp(top.length);
        const total = top.reduce((sum, r) => sum + r.seconds, 0);
        return top.map((row, index) => ({
            label: nameCategory(row.category),
            val: fmtDur(row.seconds),
            percent: total > 0 ? Math.round((row.seconds / total) * 100) : 0,
            color: ramp[index],
        }));
    });

    // ── Chart configurations ──────────────────────────────────────────────────
    // Each one reads `themeVersion` so a palette change rebuilds it.

    const trendConfig = $derived.by(() => {
        themeVersion;
        if (!dayKeys.length) return null;
        return {
            type: 'bar',
            data: {
                labels: dayKeys.map((day) => day.slice(8) + '/' + day.slice(5, 7)),
                datasets: [
                    {
                        label: i18n('webActivityColTime'),
                        data: perDay.map((seconds) => +(seconds / 3600).toFixed(2)),
                        backgroundColor: (context) => {
                            const { ctx, chartArea } = context.chart;
                            return chartArea
                                ? createVerticalGradient(ctx, chartArea, '--interactive-color', 0.85, 0.35)
                                : null;
                        },
                        borderRadius: 4,
                        borderSkipped: false,
                        maxBarThickness: 26,
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
                        callbacks: { label: (item) => ` ${fmtDur(item.raw * 3600)}` },
                    },
                },
                scales: {
                    x: { ...scaleDef(), ticks: { ...tickDef(), maxTicksLimit: 14 } },
                    y: {
                        ...scaleDef(),
                        beginAtZero: true,
                        ticks: { ...tickDef(), callback: (value) => value + 'h' },
                    },
                },
            },
        };
    });

    const categoryConfig = $derived.by(() => {
        themeVersion;
        if (!categoryRows.length) return null;
        const top = categoryRows.slice(0, 10);
        const ramp = accentRamp(top.length);
        const total = top.reduce((sum, r) => sum + r.seconds, 0);
        return {
            type: 'doughnut',
            data: {
                labels: top.map((row) => nameCategory(row.category)),
                datasets: [
                    {
                        data: top.map((row) => +(row.seconds / 3600).toFixed(2)),
                        backgroundColor: ramp,
                        borderColor: cssVar('--bg-panel-color'),
                        borderWidth: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipDef(),
                        callbacks: {
                            label: (item) => {
                                const val = fmtDur(item.raw * 3600);
                                const pct = total > 0 ? Math.round(((item.raw * 3600) / total) * 100) : 0;
                                return ` ${val} (${pct}%)`;
                            },
                        },
                    },
                },
            },
        };
    });

    /**
     * Time per weekday.
     *
     * A bar chart, not a radar one: `lib/chart.local.js` is the extension's own
     * charting engine and draws exactly three types — bar, line and doughnut. A
     * `radar` config built cleanly and was then simply never painted, which is why
     * this card had been empty since the day it was written. Monday first, because
     * that is the week the calendar above it draws.
     */
    const weekdayConfig = $derived.by(() => {
        themeVersion;
        if (!dayKeys.length) return null;
        const names = weekdayNames($currentLang, 'short');
        const totals = secondsPerWeekday(dayKeys, perDay);
        // `secondsPerWeekday` counts Sunday first, as `Date#getDay` does.
        const order = [1, 2, 3, 4, 5, 6, 0];
        return {
            type: 'bar',
            data: {
                labels: order.map((day) => names[day]),
                datasets: [
                    {
                        label: i18n('webActivityColTime'),
                        data: order.map((day) => +(totals[day] / 3600).toFixed(2)),
                        backgroundColor: (context) => {
                            const { ctx, chartArea } = context.chart;
                            return chartArea
                                ? createVerticalGradient(ctx, chartArea, '--interactive-color', 0.85, 0.35)
                                : null;
                        },
                        borderRadius: 4,
                        borderSkipped: false,
                        maxBarThickness: 30,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { ...tooltipDef(), callbacks: { label: (item) => ` ${fmtDur(item.raw * 3600)}` } },
                },
                scales: {
                    x: { ...scaleDef(), ticks: tickDef() },
                    y: {
                        ...scaleDef(),
                        beginAtZero: true,
                        ticks: { ...tickDef(), callback: (value) => value + 'h' },
                    },
                },
            },
        };
    });

    const topSitesConfig = $derived.by(() => {
        themeVersion;
        const top = sites.slice(0, 10);
        if (!top.length) return null;
        return {
            type: 'bar',
            data: {
                labels: top.map((site) => site.domain),
                datasets: [
                    {
                        label: i18n('webActivityColTime'),
                        data: top.map((site) => +(site.seconds / 3600).toFixed(2)),
                        // Longest first, so the ramp runs strong to faint down the axis.
                        backgroundColor: accentRamp(top.length),
                        borderRadius: 4,
                        maxBarThickness: 22,
                    },
                ],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { ...tooltipDef(), callbacks: { label: (item) => ` ${fmtDur(item.raw * 3600)}` } },
                },
                scales: {
                    x: { ...scaleDef(), beginAtZero: true, ticks: { ...tickDef(), callback: (v) => v + 'h' } },
                    y: { ...scaleDef(), ticks: tickDef() },
                },
            },
        };
    });

    // ── Loading ───────────────────────────────────────────────────────────────
    async function load() {
        refreshing = true;
        try {
            const response = await fetchActivity(0);
            if (!response?.success) throw new Error(response?.error || 'unknown');
            payload = {
                days: response.days || {},
                limits: response.limits || {},
                settings: { ...WA.DEFAULT_SETTINGS, ...(response.settings || {}) },
                recent: response.recent || [],
                openSegment: response.openSegment || null,
                snoozeUses: response.snoozeUses || 0,
            };
            lastUpdated = Date.now();
            error = null;
        } catch (e) {
            error = e.message;
            console.error('[webActivity] Could not load the data:', e);
        } finally {
            loading = false;
            refreshing = false;
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────────
    function selectSite(domain) {
        if (!domain) {
            siteFilter = null;
            categoryFilter = '';
            return;
        }
        siteFilter = siteFilter === domain ? null : domain;
        categoryFilter = '';
    }

    function selectCategory(category) {
        categoryFilter = category || '';
        siteFilter = null;
        if (categoryFilter) {
            openCategories.add(categoryFilter);
        }
    }

    function toggleCategorySelection(category) {
        if (!category || categoryFilter === category) {
            categoryFilter = '';
        } else {
            categoryFilter = category;
            openCategories.add(category);
        }
        siteFilter = null;
    }

    function toggleCategory(category) {
        if (openCategories.has(category)) openCategories.delete(category);
        else openCategories.add(category);
    }

    /**
     * Asks for the password and resolves to whether it was right.
     *
     * Every path that could weaken a rule goes through here, and there is exactly one
     * of them per kind of change: `commitLimit` catches the switches and the crosses
     * wherever they are drawn, and the two editor openers catch the dialogs. Guarding
     * the buttons instead would have meant remembering the guard in three tables, a
     * side panel and two dialogs — and forgetting it in one of them.
     */
    function askForPassword() {
        if (!hasLock(blockLock)) return Promise.resolve(true);
        // A second prompt while one is open would strand the first one's promise.
        if (passwordPrompt) return Promise.resolve(false);
        return new Promise((resolve) => {
            passwordPrompt = { resolve };
        });
    }

    function closePasswordPrompt(accepted) {
        const pending = passwordPrompt;
        passwordPrompt = null;
        pending?.resolve(accepted);
    }

    /** The stored rule for a site, or an empty one so a dialog can always open. */
    const limitFor = (domain) => (domain ? payload.limits[domain] || null : null);

    /** The same, filled in — what the panel draws from. */
    const normalizedLimit = (domain) => WA.normalizeLimit(payload.limits[domain] || {});

    /**
     * @param {string} [domain]
     * @param {'daily'|'weekly'|'schedule'} [tab] Which tab the dialog opens on.
     */
    async function openLimitEditor(domain = '', tab = 'daily') {
        // Writing a new rule is not editing one, so it never asks.
        if (limitFor(domain) && !(await askForPassword())) return;
        editingLimit = { domain, limit: limitFor(domain), tab };
    }

    async function openScheduleEditor(domain = '') {
        if (limitFor(domain) && !(await askForPassword())) return;
        editingLimit = { domain, limit: limitFor(domain), tab: 'schedule' };
    }

    /**
     * @param {boolean} [announce] A dialog says so out loud and then closes; an edit
     *   made straight in a table row does neither, because it is one of many.
     */
    async function commitLimit(domain, limit, announce = false, unlocked = false, domains = null) {
        // A rule that sets nothing is not a rule. Clearing the allowance and the hours
        // is how one is deleted now — there is no separate delete button — so the
        // record goes with them rather than lingering as a row of dashes. A category
        // the user picked is their own choice and keeps the record alive.
        // The dialogs asked when they opened, so whatever they save is already past the
        // lock; everything else — a switch in a table, a cross in the panel — arrives
        // here unannounced and is checked against what is stored.
        if (!unlocked && hasLock(blockLock)) {
            if (domains && Array.isArray(domains)) {
                if (!(await askForPassword())) return;
            } else {
                const before = payload.limits[domain] ? WA.normalizeLimit(payload.limits[domain]) : null;
                const after = limit === null ? null : WA.normalizeLimit(limit);
                if (loosensRule(before, after) && !(await askForPassword())) return;
            }
        }

        if (domains && Array.isArray(domains)) {
            const response = await saveLimit('*', limit, domains.length ? domains : ['*']);
            if (response?.success) {
                payload = { ...payload, limits: response.limits };
                if (announce) showNotification('webActivityLimitsAppliedToAll');
            }
            if (announce) {
                editingLimit = null;
            }
            return;
        }

        const stripped = WA.normalizeLimit(limit || {});
        const setsNothing =
            !stripped.dailyLimitSeconds &&
            !stripped.weeklyLimitSeconds &&
            !stripped.blockAlways &&
            !stripped.schedules.some((schedule) => schedule.start && schedule.end) &&
            !stripped.category;
        const response = await saveLimit(domain, setsNothing ? null : limit);
        if (response?.success) {
            payload = { ...payload, limits: response.limits };
            if (announce) showNotification('webActivityLimitSaved');
        }
        if (announce) {
            editingLimit = null;
        }
    }

    async function snooze(domain) {
        // The grace button is the one that undoes a block on purpose, so it is the one
        // the password was set for; how soon it starts asking is `snoozePasswordAfter`.
        if (
            snoozeNeedsPassword(blockLock, payload.snoozeUses, payload.settings?.snoozePasswordAfter) &&
            !(await askForPassword())
        ) {
            return;
        }
        await snoozeLimit(domain);
        showNotification('webActivitySnoozed');
        await load();
    }

    /** Every settings write goes through here, so the worker always hears about it. */
    async function patchSettings(patch, notify = true) {
        const next = { ...(payload.settings || WA.DEFAULT_SETTINGS), ...patch };
        const response = await saveSettings(next);
        if (!response?.success) return false;
        payload = { ...payload, settings: response.settings || next };
        if (notify) showNotification('webActivitySettingsSaved');
        return true;
    }

    /**
     * The same, on a short delay.
     *
     * The number boxes clamp and report on every keystroke, so typing "300" is three
     * changes: three round trips to the worker, three writes, and three toasts saying
     * the same thing. The delay is short enough that a change still lands the moment
     * the user looks away from the box.
     */
    let settingsTimer = null;
    let pendingSettings = {};

    function patchSettingsDebounced(patch) {
        // On screen at once, saved a moment later. A switch whose "on" only appears
        // after a debounce plus a round trip to the worker feels broken: the click
        // lands, nothing happens, and half a second later the button moves. The write
        // is still the authority — `patchSettings` replaces this with whatever the
        // worker stored, and the storage listener catches anything written elsewhere.
        payload = { ...payload, settings: { ...(payload.settings || WA.DEFAULT_SETTINGS), ...patch } };
        pendingSettings = { ...pendingSettings, ...patch };
        clearTimeout(settingsTimer);
        settingsTimer = setTimeout(() => {
            const batch = pendingSettings;
            pendingSettings = {};
            patchSettings(batch);
        }, 400);
    }

    async function toggleIgnoreDomain(domain) {
        const ignored = new SvelteSet(payload.settings?.ignoredDomains || []);
        const willIgnore = !ignored.has(domain);

        if (willIgnore) {
            const accepted = await confirmAction({
                titleKey: 'webActivityIgnoreDomainTitle',
                messageKey: 'webActivityIgnoreDomainConfirm',
                params: [domain],
                confirmKey: 'confirm',
                danger: false,
            });
            if (!accepted) return;
            ignored.add(domain);
        } else {
            ignored.delete(domain);
        }

        if (!(await patchSettings({ ignoredDomains: Array.from(ignored) }, false))) return;
        showNotification(willIgnore ? 'webActivityDomainIgnored' : 'webActivityDomainRestored');
        // The counters change as well as the settings: an ignored site stops being
        // timed from this moment, so the live segment has to be re-read.
        await load();
    }

    /**
     * The lock itself. `PasswordSection` has already checked the current password
     * before asking for this, which is what stops the "remove password" button from
     * being the very door the password guards.
     */
    async function saveBlockPassword(nextLock) {
        if (!(await patchSettings({ blockPassword: nextLock }, false))) return;
        showNotification(nextLock ? 'webActivityBlockPasswordSaved' : 'webActivityBlockPasswordRemoved');
    }

    async function addCategory(entry) {
        await patchSettings({ customCategories: [...customCategories, entry] });
    }

    async function renameCategory(id, label) {
        await patchSettings({
            customCategories: customCategories.map((entry) => (entry.id === id ? { ...entry, label } : entry)),
        });
    }

    /**
     * Deleting a category leaves the sites filed under it alone: their stored id stops
     * matching anything and they fall back to being detected automatically, which is
     * where they were before. Saying so is what the confirmation is for.
     */
    async function deleteCategory(entry) {
        const accepted = await confirmAction({
            titleKey: 'webActivityCategoryDelete',
            messageKey: 'webActivityCategoryDeleteConfirm',
            params: [entry.label],
            confirmKey: 'delete',
        });
        if (!accepted) return;
        await patchSettings({ customCategories: customCategories.filter((row) => row.id !== entry.id) });
    }

    /**
     * The tracking preferences back to what the extension ships with.
     *
     * Only the preferences. The categories the user added, the rules they wrote and
     * the record itself are their work, not a setting, and a button in a row with
     * "export" must not quietly take them — which is what "restore defaults" means
     * everywhere else and is exactly why it needs saying out loud here.
     */
    async function restoreDefaults() {
        const accepted = await confirmAction({
            titleKey: 'webActivityRestoreDefaults',
            messageKey: 'webActivityRestoreDefaultsConfirm',
            confirmKey: 'confirm',
        });
        if (!accepted) return;
        const kept = payload.settings || WA.DEFAULT_SETTINGS;
        await patchSettings({
            ...WA.DEFAULT_SETTINGS,
            customCategories: kept.customCategories || [],
            ignoredDomains: kept.ignoredDomains || [],
            // A "restore defaults" that quietly unlocked every rule would be the
            // shortest way round the lock on the page.
            blockPassword: kept.blockPassword || null,
        });
    }

    async function clearEverything() {
        const accepted = await confirmAction({
            titleKey: 'webActivityClearAll',
            messageKey: 'webActivityClearAllConfirm',
            confirmKey: 'delete',
        });
        if (!accepted) return;
        const response = await clearActivity();
        if (response?.success) {
            showNotification('webActivityCleared');
            await load();
        }
    }

    /**
     * The table layout is a preference of this page alone, so it is written straight
     * to storage rather than routed through the worker like the tracking data.
     */
    async function persistTablePrefs(next) {
        tablePrefs = next;
        try {
            await chrome.storage.local.set({ [SITE_TABLE_PREFS_KEY]: next });
        } catch {
            // A layout that fails to save is not worth interrupting anyone over.
        }
    }

    /** The whole record, in the shape the importer expects back. */
    function exportJson() {
        const blob = new Blob(
            [
                JSON.stringify(
                    {
                        version: WA.version,
                        exportedAt: new Date().toISOString(),
                        days: payload.days,
                        limits: payload.limits,
                        settings: payload.settings,
                    },
                    null,
                    2,
                ),
            ],
            { type: 'application/json' },
        );
        const link = document.getElementById('download-link');
        link.href = URL.createObjectURL(blob);
        // The local day, not the UTC one: just after midnight `toISOString()` names
        // yesterday, which does not match the day the records are filed under.
        link.download = `web-activity-${dayKey(Date.now())}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    async function importJson(file) {
        try {
            const response = await importActivity(JSON.parse(await file.text()));
            if (!response?.success) throw new Error(response?.error || 'unknown');
            showNotification('webActivityImported');
            await load();
        } catch (e) {
            console.error('[webActivity] Import failed:', e);
            showNotification('webActivityImportFailed', 'error');
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    let onRuntimeMessage = null;
    let onVisibility = null;
    let onStorageChanged = null;
    let minuteTimer = null;
    let onTabChanged = null;
    let onTabUpdated = null;

    onMount(async () => {
        await i18nStore.init();
        await initializeActiveTheme();
        // The number boxes hide the browser's own arrows and expect themed ones.
        initNumberSpinnerArrows();
        const stored = await chrome.storage.local.get(SITE_TABLE_PREFS_KEY);
        tablePrefs = normalizeTablePrefs(stored[SITE_TABLE_PREFS_KEY]);
        await restoreLayout();
        await load();

        onRuntimeMessage = (message) => {
            if (message.action === 'themeChanged') {
                initializeActiveTheme().then(() => (themeVersion += 1));
            }
        };
        chrome.runtime.onMessage.addListener(onRuntimeMessage);

        // Coming back to the tab is exactly when the numbers are most stale: the time
        // spent away is time the tracker banked while this page was not looking.
        onVisibility = () => {
            if (document.visibilityState === 'visible') load();
        };
        document.addEventListener('visibilitychange', onVisibility);

        // The panel sits open beside the browsing it is counting, so it re-reads on
        // its own. A tab does not: it has a refresh button, and a page that reloads
        // under the reader while they are working through it is worse than a stale
        // one they chose to leave open.
        if (isPanel) {
            document.body.classList.add('is-sidepanel');
            minuteTimer = setInterval(() => {
                minuteTick += 1;
                load();
            }, 60000);

            // And whenever the tab in front changes. The clock the panel shows is
            // banked by the worker on exactly that event, so this is the moment the
            // figures move — waiting up to a minute for the tick would show the
            // previous site still counting.
            onTabChanged = async () => {
                await readActiveDomain();
                await load();
            };
            chrome.tabs.onActivated.addListener(onTabChanged);
            onTabUpdated = (_id, changeInfo, tab) => {
                if (changeInfo.url && tab.active) onTabChanged();
            };
            chrome.tabs.onUpdated.addListener(onTabUpdated);
            await readActiveDomain();
        }

        // The tracking switch lives in three places now — here, the popup and the
        // settings page — and all three have to agree the moment any of them is used.
        onStorageChanged = (changes, area) => {
            if (area !== 'local' || !changes[WA.KEYS.SETTINGS]) return;
            payload = {
                ...payload,
                settings: { ...WA.DEFAULT_SETTINGS, ...(changes[WA.KEYS.SETTINGS].newValue || {}) },
            };
        };
        chrome.storage.onChanged.addListener(onStorageChanged);
    });

    onDestroy(() => {
        if (isPanel) document.body.classList.remove('is-sidepanel');
        if (onRuntimeMessage) chrome.runtime.onMessage.removeListener(onRuntimeMessage);
        if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
        if (onStorageChanged) chrome.storage.onChanged.removeListener(onStorageChanged);
        if (minuteTimer) clearInterval(minuteTimer);
        if (onTabChanged) chrome.tabs.onActivated.removeListener(onTabChanged);
        if (onTabUpdated) chrome.tabs.onUpdated.removeListener(onTabUpdated);
    });
</script>

<WebActivityIcons />
<div id="tooltip" bind:this={tooltipEl}></div>

{#snippet settingsPanel(compact)}
    <SettingsView
        {compact}
        rules={rows}
        settings={payload.settings}
        {customCategories}
        {categoryUsage}
        dayCount={Object.keys(payload.days).length}
        siteCount={allSites.length}
        onEditLimit={openLimitEditor}
        onEditSchedule={openScheduleEditor}
        onSaveLimit={commitLimit}
        onAddRule={() => openLimitEditor('')}
        onAddCategory={addCategory}
        onRenameCategory={renameCategory}
        onDeleteCategory={deleteCategory}
        onChangeSettings={patchSettingsDebounced}
        onChangeBlockPassword={saveBlockPassword}
        onIgnoreAdd={(domain) =>
            patchSettings({
                ignoredDomains: [...new Set([...(payload.settings.ignoredDomains || []), domain])],
            })}
        onIgnoreRemove={(domain) =>
            patchSettings({
                ignoredDomains: (payload.settings.ignoredDomains || []).filter((entry) => entry !== domain),
            })}
        onExport={exportJson}
        onImport={importJson}
        onClearAll={clearEverything}
        onRestoreDefaults={restoreDefaults}
    />
{/snippet}

{#if isPanel}
    <!-- The side panel: the same data and the same dialogs, in the only shape a
         column this narrow can hold. -->
    {#if loading}
        <div class="wa-loading">
            <div class="loader-ring"></div>
            <div class="loader-text">{$t('dashboardLoading')}</div>
        </div>
    {:else}
        <ActivityPanel
            sites={todaySites}
            {verdicts}
            totalSeconds={todayTotal}
            limitOf={normalizedLimit}
            onEditLimit={openLimitEditor}
            onEditSchedule={openScheduleEditor}
            onToggleLimit={(domain, which, next) =>
                commitLimit(domain, {
                    ...normalizedLimit(domain),
                    ...(which === 'weekly' ? { weeklyLimitEnabled: next } : { dailyLimitEnabled: next }),
                })}
            onToggleSchedule={(domain, next) =>
                commitLimit(domain, { ...normalizedLimit(domain), scheduleEnabled: next })}
            onClearLimit={(domain, which) =>
                commitLimit(domain, {
                    ...normalizedLimit(domain),
                    ...(which === 'weekly' ? { weeklyLimitSeconds: 0 } : { dailyLimitSeconds: 0 }),
                })}
            onClearSchedule={(domain) =>
                commitLimit(domain, { ...normalizedLimit(domain), schedules: [], blockAlways: false })}
            {activeDomain}
            onOpenInTab={() => chrome.tabs.create({ url: chrome.runtime.getURL(PAGE_PATH) })}
            onOpenSettings={() => (panelSettingsOpen = true)}
        />

        <!-- The same drawer the rules page's settings button opens, down to the slide:
             two settings screens in one extension that arrive differently are two
             products. It stays mounted so the closing animation can finish. -->
        <SettingsDialog
            open={panelSettingsOpen}
            titleId="wa-settings-title"
            title={$t('webActivitySettings')}
            onClose={() => (panelSettingsOpen = false)}
        >
            {@render settingsPanel(true)}
        </SettingsDialog>
    {/if}
{:else}
    <ActivityHeader
        {period}
        category={categoryFilter}
        {categories}
        {customCategories}
        {lastUpdated}
        {refreshing}
        onPeriodChange={(days) => (period = days)}
        onCategoryChange={selectCategory}
        onExport={exportJson}
        onImport={importJson}
        onRefresh={load}
    />

    <div class="app-body">
        <SiteSidebar
            sites={allSites}
            totalSeconds={sidebarTotal}
            query={sidebarQuery}
            selectedSite={siteFilter}
            selectedCategory={categoryFilter}
            {openCategories}
            {customCategories}
            {view}
            onQuery={(value) => (sidebarQuery = value)}
            onSelectSite={(domain) => {
                view = 'dashboard';
                selectSite(domain);
            }}
            onSelectCategory={(category) => {
                view = 'dashboard';
                toggleCategorySelection(category);
            }}
            onToggleCategory={toggleCategory}
            onOpenSettings={() => (view = view === 'settings' ? 'dashboard' : 'settings')}
        />

        <!-- The sections can be dragged into another order; see `actions/sortable.js`.
             The action lives on the column rather than on a wrapper of its own so the
             loading, error and settings views inside it are untouched — it only ever
             looks at children carrying a `data-sort-id`.

             `items` names the element and not just the attribute on purpose: the panels
             inside a section carry one too, so `closest('[data-sort-id]')` from a point
             over a chart would answer with the panel, whose parent is the grid rather
             than this column, and the section being dragged over would never be
             recognised. -->
        <main class="main-content" use:sortable={{ items: 'section[data-sort-id]', onReorder: reorderSections }}>
            {#if loading}
                <div class="wa-loading">
                    <div class="loader-ring"></div>
                    <div class="loader-text">{$t('dashboardLoading')}</div>
                </div>
            {:else if error}
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg width="64" height="64" aria-hidden="true" focusable="false"
                            ><use href="#wa-alert"></use></svg
                        >
                    </div>
                    <div class="empty-title">{$t('dashboardErrorLoad')}</div>
                    <div class="empty-sub">{error}</div>
                </div>
            {:else if view === 'settings'}
                {@render settingsPanel(false)}
            {:else}
                {#if payload.openSegment}
                    <div class="wa-live" title={$tt('webActivityLiveHint')}>
                        <span class="wa-live-dot"></span>
                        {$t('webActivityLiveNow', [payload.openSegment.domain])}
                    </div>
                {/if}

                {#if !hasData}
                    <div class="empty-state">
                        <div class="empty-icon">
                            <svg width="64" height="64" aria-hidden="true" focusable="false"
                                ><use href="#wa-activity"></use></svg
                            >
                        </div>
                        <div class="empty-title">{$t('webActivityEmptyTitle')}</div>
                        <div class="empty-sub">{$t('webActivityEmptySub')}</div>
                    </div>
                {:else}
                    <!--
                        THE SECTIONS, IN WHATEVER ORDER THE READER LEFT THEM.

                        Each one is a snippet and `sectionOrder` is the order, so dragging a
                        section only ever changes a list of ids — nothing moves DOM that Svelte
                        owns. `sortId` is what the grip in the heading reports and what the
                        layout is stored under, so a section keeps its place whatever language
                        its title is in.
                    -->
                    {#snippet section_log()}
                        <DashboardSection
                            sortId="log"
                            title={$t('webActivityLogTitle')}
                            tooltip={$tt('webActivityLogHint')}
                        >
                            <div class="wa-log">
                                <SitesTable
                                    {sites}
                                    limits={payload.limits}
                                    settings={payload.settings}
                                    {verdicts}
                                    {customCategories}
                                    prefs={tablePrefs}
                                    onSort={(sortBy, sortDir) => persistTablePrefs({ ...tablePrefs, sortBy, sortDir })}
                                    onSaveLimit={commitLimit}
                                    onOpenLimitEditor={openLimitEditor}
                                    onOpenScheduleEditor={openScheduleEditor}
                                    onIgnoreDomain={toggleIgnoreDomain}
                                />
                            </div>
                        </DashboardSection>
                    {/snippet}

                    {#snippet section_blocks()}
                        <DashboardSection
                            sortId="blocks"
                            title={$t('webActivityBlocksTitle')}
                            tooltip={$tt('webActivityBlocksHintTitle')}
                        >
                            <BlocksList
                                rows={blockedRows}
                                snoozeMinutes={payload.settings?.snoozeMinutes ?? 5}
                                onEditLimit={openLimitEditor}
                                onSnooze={snooze}
                            />
                        </DashboardSection>
                    {/snippet}

                    {#snippet section_grace()}
                        <DashboardSection
                            sortId="grace"
                            title={$t('webActivityGracePeriodTitle')}
                            tooltip={$tt('webActivityGracePeriodHint')}
                        >
                            <SnoozedList
                                rows={snoozedRows}
                                snoozeMinutes={payload.settings?.snoozeMinutes ?? 5}
                                onEditLimit={openLimitEditor}
                                onSnooze={snooze}
                            />
                        </DashboardSection>
                    {/snippet}

                    {#snippet section_summary()}
                        <DashboardSection
                            sortId="summary"
                            title={$t('dashboardSummary')}
                            tooltip={$tt('webActivitySummaryTitle')}
                        >
                            <div class="kpi-grid"><KpiGrid {kpis} /></div>
                        </DashboardSection>
                    {/snippet}

                    {#snippet section_patterns()}
                        <DashboardSection
                            sortId="patterns"
                            title={$t('webActivityPatterns')}
                            tooltip={$tt('webActivityPatternsHint')}
                        >
                            <!-- The grid is the container, so a panel dragged out of it has
                                 nowhere to land: a panel only ever moves within its section. -->
                            <div
                                class="chart-grid-2"
                                use:sortable={{ onReorder: (ids) => reorderPanels('patterns', ids) }}
                            >
                                {#each panelOrder.patterns as panel (panel)}
                                    {#if panel === 'hours'}
                                        {@render panelHours()}
                                    {:else if panel === 'weekday'}
                                        {@render panelWeekday()}
                                    {/if}
                                {/each}
                            </div>
                        </DashboardSection>
                    {/snippet}

                    {#snippet panelHours()}
                        <ChartCard
                            sortId="hours"
                            title={$t('dashboardHourDistrib')}
                            meta={$t('webActivityHourMeta')}
                            tooltip={$tt('webActivityHourHint')}
                        >
                            <!-- Grows into the card rather than sitting 88px tall in one
                                 stretched to match its neighbour. -->
                            <div class="hour-bar-grid" style="flex:1 1 auto;min-height:120px">
                                <HourGrid
                                    hours={hours.map((seconds) => seconds / 3600)}
                                    cnts={hourCounts}
                                    maxH={Math.max(...hours.map((s) => s / 3600), 0.001)}
                                    fmtH={(seconds) => fmtDur(seconds)}
                                    {i18n}
                                    countLabel={(count) => i18n('webActivityHourSites', count)}
                                />
                            </div>
                        </ChartCard>
                    {/snippet}

                    {#snippet panelWeekday()}
                        <ChartCard
                            sortId="weekday"
                            title={$t('webActivityWeekdayTitle')}
                            meta={$t('webActivityWeekdayMeta')}
                            tooltip={$tt('webActivityWeekdayHint')}
                        >
                            <ChartCanvas
                                grow
                                config={weekdayConfig}
                                height={180}
                                ariaLabel={$t('webActivityWeekdayTitle')}
                            />
                        </ChartCard>
                    {/snippet}

                    {#snippet section_heatmap()}
                        <!-- The same calendar the pomodoro dashboard draws, down to the day
                             column, the month strip and the legend: one card, one grammar.
                             Only the scale differs, because a cell here is worth an amount
                             of time rather than a number of sessions, so the legend spells
                             out the four bands in hours instead of counts. -->
                        <DashboardSection
                            sortId="heatmap"
                            title={$t('webActivityHeatmapTitle')}
                            tooltip={$tt('webActivityHeatmapHint')}
                        >
                            <div class="chart-card animate-in delay-2">
                                <div class="chart-card-header">
                                    <div class="chart-card-title" title={$tt('webActivityHeatmapHint')}>
                                        {$t('webActivityHeatmapCardTitle')}
                                    </div>
                                    <div class="chart-card-meta">
                                        {$t('webActivityHeatmapMeta', [fmtDur(heatmap.max)])}
                                    </div>
                                </div>
                                <div>
                                    <div class="heatmap-container">
                                        <div class="heatmap-days">
                                            <div class="heatmap-months-spacer"></div>
                                            <div class="heatmap-day-label">{$t('dashboardMonday')}</div>
                                            <div class="heatmap-day-label"></div>
                                            <div class="heatmap-day-label">{$t('dashboardWednesday')}</div>
                                            <div class="heatmap-day-label"></div>
                                            <div class="heatmap-day-label">{$t('dashboardFriday')}</div>
                                            <div class="heatmap-day-label"></div>
                                            <div class="heatmap-day-label">{$t('dashboardSunday')}</div>
                                        </div>
                                        <div class="heatmap-wrap">
                                            <Heatmap
                                                cells={heatmap.cells}
                                                monthPositions={heatmap.monthPositions.map((mp) => ({
                                                    ...mp,
                                                    label: new Intl.DateTimeFormat(
                                                        $currentLang === 'es' ? 'es-ES' : 'en-GB',
                                                        { month: 'short' },
                                                    ).format(new Date(2024, mp.month, 1)),
                                                }))}
                                                locale={$currentLang === 'es' ? 'es-ES' : 'en-GB'}
                                                {i18n}
                                                fmtDur={(seconds) => fmtDur(seconds)}
                                                {tooltipEl}
                                                countLabel={() => ''}
                                            />
                                        </div>
                                    </div>
                                    <div class="legend" style="margin-top:12px">
                                        <div class="legend-item">
                                            <div
                                                class="legend-dot"
                                                style="background:color-mix(in srgb,var(--bg-panel-color) 40%,var(--bg-color))"
                                            ></div>
                                            <span>{$t('dashboardLegendNone')}</span>
                                        </div>
                                        {#each HEATMAP_LEGEND as band (band.level)}
                                            <div class="legend-item">
                                                <div class="legend-dot" style="background:{band.color}"></div>
                                                <span>{band.label}</span>
                                            </div>
                                        {/each}
                                        <div class="legend-item" style="margin-left:6px">
                                            <div
                                                class="legend-dot"
                                                style="box-shadow:inset 0 0 0 1.5px var(--interactive-color);background:color-mix(in srgb,var(--interactive-color) 10%,var(--bg-color))"
                                            ></div>
                                            <span>{$t('dashboardToday')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </DashboardSection>
                    {/snippet}

                    {#snippet section_trends()}
                        <DashboardSection
                            sortId="trends"
                            title={$t('webActivityTrendsTitle')}
                            tooltip={$tt('webActivityTrendsHint')}
                        >
                            <div
                                class="chart-grid-2"
                                use:sortable={{ onReorder: (ids) => reorderPanels('trends', ids) }}
                            >
                                {#each panelOrder.trends as panel (panel)}
                                    {#if panel === 'daily'}
                                        {@render panelDaily()}
                                    {:else if panel === 'categories'}
                                        {@render panelCategories()}
                                    {/if}
                                {/each}
                            </div>
                        </DashboardSection>
                    {/snippet}

                    {#snippet panelDaily()}
                        <ChartCard
                            sortId="daily"
                            title={$t('webActivityDailyTitle')}
                            meta={siteFilter || $t('webActivityAllSites')}
                            tooltip={$tt('webActivityDailyHint')}
                        >
                            <ChartCanvas
                                grow
                                config={trendConfig}
                                height={220}
                                ariaLabel={$t('webActivityDailyTitle')}
                            />
                        </ChartCard>
                    {/snippet}

                    {#snippet panelCategories()}
                        <ChartCard
                            sortId="categories"
                            title={$t('webActivityCategoriesTitle')}
                            meta={fmtH(totalSeconds, $t('dashboardFocusH_abbrev'))}
                            tooltip={$tt('webActivityCategoriesHint')}
                        >
                            <ChartCanvas
                                config={categoryConfig}
                                height={200}
                                ariaLabel={$t('webActivityCategoriesTitle')}
                            />
                            <DonutStats stats={donutRows} columns={2} />
                        </ChartCard>
                    {/snippet}

                    {#snippet section_sites()}
                        <DashboardSection
                            sortId="sites"
                            title={$t('webActivitySitesTitle')}
                            tooltip={$tt('webActivitySitesHint')}
                        >
                            <ChartCard title={$t('webActivityTopSitesTitle')} meta={$t('webActivityTopSitesMeta')}>
                                <ChartCanvas
                                    config={topSitesConfig}
                                    height={320}
                                    ariaLabel={$t('webActivityTopSitesTitle')}
                                />
                            </ChartCard>
                        </DashboardSection>
                    {/snippet}

                    {#snippet section_timeline()}
                        <DashboardSection
                            sortId="timeline"
                            title={$t('webActivityTimelineTitle')}
                            tooltip={$tt('webActivityTimelineHint')}
                        >
                            <div class="chart-card animate-in delay-1">
                                <VisitTimeline
                                    visits={payload.recent.filter(
                                        (v) =>
                                            (!siteFilter || v.d === siteFilter) &&
                                            !(payload.settings?.ignoredDomains || []).includes(v.d),
                                    )}
                                />
                            </div>
                        </DashboardSection>
                    {/snippet}

                    {#each sectionOrder as id (id)}
                        {#if id === 'log'}{@render section_log()}
                        {:else if id === 'blocks'}{@render section_blocks()}
                        {:else if id === 'grace'}{@render section_grace()}
                        {:else if id === 'summary'}{@render section_summary()}
                        {:else if id === 'patterns'}{@render section_patterns()}
                        {:else if id === 'heatmap'}{@render section_heatmap()}
                        {:else if id === 'trends'}{@render section_trends()}
                        {:else if id === 'sites'}{@render section_sites()}
                        {:else if id === 'timeline'}{@render section_timeline()}
                        {/if}
                    {/each}
                {/if}
            {/if}
        </main>
    </div>
{/if}

{#if editingLimit}
    <LimitModal
        domain={editingLimit.domain}
        limit={editingLimit.limit}
        initialTab={editingLimit.tab}
        onSave={(domain, limit, applyToAll) => {
            if (applyToAll) {
                commitLimit('*', limit, true, true, allKnownDomains);
            } else {
                commitLimit(domain, limit, true, true);
            }
        }}
        onClose={() => (editingLimit = null)}
    />
{/if}

{#if passwordPrompt}
    <PasswordPromptModal
        onSubmit={async (password) => {
            const accepted = await verifyLock(blockLock, password);
            if (accepted) closePasswordPrompt(true);
            return accepted;
        }}
        onClose={() => closePasswordPrompt(false)}
    />
{/if}

<ConfirmDialog />
