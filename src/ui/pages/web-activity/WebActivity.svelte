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
    import LimitModal from './components/LimitModal.svelte';
    import LimitsList from './components/LimitsList.svelte';
    import SiteSidebar from './components/SiteSidebar.svelte';
    import SitesTable from './components/SitesTable.svelte';
    import VisitTimeline from './components/VisitTimeline.svelte';
    import WebActivityIcons from './components/WebActivityIcons.svelte';

    import { fetchActivity, importActivity, saveLimit, snoozeLimit } from '../../services/webActivityService.js';
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
        createVerticalGradient,
        cssVar,
        getSeriesColor,
        scaleDef,
        tickDef,
        tooltipDef,
    } from '../../services/dashboard/chartTheme.js';
    import { dayKey, fmtDur, fmtH, weekdayNames } from '../../services/dashboard/format.js';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    import { DEFAULT_TABLE_PREFS, SITE_TABLE_PREFS_KEY, normalizeTablePrefs } from './components/siteColumns.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    // The palette is already on <html> from the localStorage mirror, so Chart.js can
    // resolve its defaults now rather than after the first paint.
    applyChartDefaults(Chart);

    // ── State ─────────────────────────────────────────────────────────────────
    let payload = $state({ days: {}, limits: {}, settings: { ...WA.DEFAULT_SETTINGS }, recent: [], openSegment: null });
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
    let editing = $state(null);
    /** Which columns the log shows and how it is sorted, remembered between visits. */
    let tablePrefs = $state({ ...DEFAULT_TABLE_PREFS });

    /**
     * Bumped whenever the palette changes, and read by every chart config so they are
     * rebuilt with the new colours. Chart.js resolves its colours once, at build time,
     * so a theme change is not something it can pick up on its own.
     */
    let themeVersion = $state(0);
    let tooltipEl = $state(null);

    // ── Derived ───────────────────────────────────────────────────────────────
    const dayKeys = $derived(daysInPeriod(payload.days, period));
    /** Every site in the period, before the sidebar filters — the sidebar lists them all. */
    const allSites = $derived(aggregateSites(payload.days, dayKeys, payload.limits));
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

    /** `i18n(key, ...params)` — the plain-function shape the analytics module takes. */
    const i18n = $derived((key, ...params) => i18nService.translate($messages, key, params));

    const kpis = $derived(
        computeKpis({ sites, days: payload.days, dayKeys, limits: payload.limits, lang: $currentLang, i18n }),
    );

    const donutRows = $derived(
        categoryRows.slice(0, 8).map((row, index) => ({
            label: i18n('webActivityCategory_' + row.category),
            val: fmtDur(row.seconds),
            color: getSeriesColor(index),
        })),
    );

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
        return {
            type: 'doughnut',
            data: {
                labels: categoryRows.map((row) => i18n('webActivityCategory_' + row.category)),
                datasets: [
                    {
                        data: categoryRows.map((row) => +(row.seconds / 3600).toFixed(2)),
                        backgroundColor: categoryRows.map((_, index) => getSeriesColor(index)),
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
                    tooltip: { ...tooltipDef(), callbacks: { label: (item) => ` ${fmtDur(item.raw * 3600)}` } },
                },
            },
        };
    });

    const weekdayConfig = $derived.by(() => {
        themeVersion;
        if (!dayKeys.length) return null;
        const names = weekdayNames($currentLang, 'short');
        const totals = secondsPerWeekday(dayKeys, perDay);
        return {
            type: 'radar',
            data: {
                labels: names,
                datasets: [
                    {
                        label: i18n('webActivityColTime'),
                        data: totals.map((seconds) => +(seconds / 3600).toFixed(2)),
                        backgroundColor: 'color-mix(in srgb, var(--interactive-color) 30%, transparent)',
                        borderColor: cssVar('--interactive-color'),
                        pointBackgroundColor: cssVar('--interactive-color'),
                        borderWidth: 2,
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
                    r: {
                        angleLines: { color: cssVar('--border-color') },
                        grid: { color: cssVar('--border-color') },
                        pointLabels: { color: cssVar('--text-color'), font: { size: 11 } },
                        ticks: { display: false },
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
                        backgroundColor: top.map((_, index) => getSeriesColor(index)),
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

    function openLimitEditor(domain = '') {
        editing = { domain, limit: domain ? payload.limits[domain] || null : null };
    }

    /**
     * @param {boolean} [announce] The modal says so out loud; the table does not,
     *   because it saves on a debounce and would raise a toast per keystroke.
     */
    async function commitLimit(domain, limit, announce = false) {
        const response = await saveLimit(domain, limit);
        if (response?.success) {
            payload = { ...payload, limits: response.limits };
            if (announce) showNotification('webActivityLimitSaved');
        }
        // Only the modal closes on save; a debounced edit from the table must not shut
        // a dialog the user has since opened.
        if (announce) editing = null;
    }

    async function removeLimit(domain) {
        const accepted = await confirmAction({
            titleKey: 'webActivityDeleteLimit',
            messageKey: 'webActivityDeleteLimitConfirm',
            params: [domain],
            confirmKey: 'delete',
        });
        if (!accepted) return;
        const response = await saveLimit(domain, null);
        if (response?.success) payload = { ...payload, limits: response.limits };
    }

    async function snooze(domain) {
        await snoozeLimit(domain);
        showNotification('webActivitySnoozed');
        await load();
    }

    async function toggleIgnoreDomain(domain) {
        const settings = payload.settings || { ...WA.DEFAULT_SETTINGS };
        const ignored = new SvelteSet(settings.ignoredDomains || []);
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

        const nextSettings = { ...settings, ignoredDomains: Array.from(ignored) };
        try {
            await chrome.storage.local.set({ [WA.KEYS.SETTINGS]: nextSettings });
            payload.settings = nextSettings;
            showNotification(willIgnore ? 'webActivityDomainIgnored' : 'webActivityDomainRestored');
            await load();
        } catch (error) {
            console.error('Failed to update ignoredDomains:', error);
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

    onMount(async () => {
        await i18nStore.init();
        await initializeActiveTheme();
        // The number boxes hide the browser's own arrows and expect themed ones.
        initNumberSpinnerArrows();
        const stored = await chrome.storage.local.get(SITE_TABLE_PREFS_KEY);
        tablePrefs = normalizeTablePrefs(stored[SITE_TABLE_PREFS_KEY]);
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
    });

    onDestroy(() => {
        if (onRuntimeMessage) chrome.runtime.onMessage.removeListener(onRuntimeMessage);
        if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
    });
</script>

<WebActivityIcons />
<div id="tooltip" bind:this={tooltipEl}></div>

<ActivityHeader
    {period}
    category={categoryFilter}
    {categories}
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
        onQuery={(value) => (sidebarQuery = value)}
        onSelectSite={selectSite}
        onSelectCategory={toggleCategorySelection}
        onToggleCategory={toggleCategory}
    />

    <main class="main-content">
        {#if loading}
            <div class="wa-loading">
                <div class="loader-ring"></div>
                <div class="loader-text">{$t('dashboardLoading')}</div>
            </div>
        {:else if error}
            <div class="empty-state">
                <div class="empty-icon">
                    <svg width="64" height="64" aria-hidden="true" focusable="false"><use href="#wa-alert"></use></svg>
                </div>
                <div class="empty-title">{$t('dashboardErrorLoad')}</div>
                <div class="empty-sub">{error}</div>
            </div>
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
                <DashboardSection title={$t('webActivityLogTitle')} tooltip={$tt('webActivityLogHint')}>
                    <div class="wa-log">
                        <SitesTable
                            {sites}
                            limits={payload.limits}
                            settings={payload.settings}
                            {verdicts}
                            prefs={tablePrefs}
                            onSort={(sortBy, sortDir) => persistTablePrefs({ ...tablePrefs, sortBy, sortDir })}
                            onSaveLimit={commitLimit}
                            onOpenLimitEditor={openLimitEditor}
                            onIgnoreDomain={toggleIgnoreDomain}
                        />
                    </div>
                </DashboardSection>

                <DashboardSection title={$t('dashboardSummary')} tooltip={$tt('webActivitySummaryTitle')}>
                    <div class="kpi-grid"><KpiGrid {kpis} /></div>
                </DashboardSection>

                <DashboardSection title={$t('webActivityPatterns')} tooltip={$tt('webActivityPatternsHint')}>
                    <div class="chart-grid-2">
                        <ChartCard
                            title={$t('dashboardHourDistrib')}
                            meta={$t('webActivityHourMeta')}
                            tooltip={$tt('webActivityHourHint')}
                        >
                            <div class="hour-bar-grid" style="height:88px">
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
                        <ChartCard
                            title={$t('webActivityWeekdayTitle')}
                            meta={$t('webActivityWeekdayMeta')}
                            tooltip={$tt('webActivityWeekdayHint')}
                        >
                            <ChartCanvas
                                config={weekdayConfig}
                                height={200}
                                ariaLabel={$t('webActivityWeekdayTitle')}
                            />
                        </ChartCard>
                    </div>
                </DashboardSection>

                <DashboardSection title={$t('webActivityHeatmapTitle')} tooltip={$tt('webActivityHeatmapHint')}>
                    <div class="chart-card animate-in delay-2">
                        <div class="heatmap-container">
                            <div class="heatmap-wrap">
                                <Heatmap
                                    cells={heatmap.cells}
                                    monthPositions={heatmap.monthPositions.map((mp) => ({
                                        ...mp,
                                        label: new Intl.DateTimeFormat($currentLang === 'es' ? 'es-ES' : 'en-GB', {
                                            month: 'short',
                                        }).format(new Date(2024, mp.month, 1)),
                                    }))}
                                    locale={$currentLang === 'es' ? 'es-ES' : 'en-GB'}
                                    {i18n}
                                    fmtDur={(seconds) => fmtDur(seconds)}
                                    {tooltipEl}
                                    countLabel={() => ''}
                                />
                            </div>
                        </div>
                    </div>
                </DashboardSection>

                <DashboardSection title={$t('webActivityTrendsTitle')} tooltip={$tt('webActivityTrendsHint')}>
                    <div class="chart-grid-2">
                        <ChartCard
                            title={$t('webActivityDailyTitle')}
                            meta={siteFilter || $t('webActivityAllSites')}
                            tooltip={$tt('webActivityDailyHint')}
                        >
                            <ChartCanvas config={trendConfig} height={260} ariaLabel={$t('webActivityDailyTitle')} />
                        </ChartCard>
                        <ChartCard
                            title={$t('webActivityCategoriesTitle')}
                            meta={fmtH(totalSeconds, $t('dashboardFocusH_abbrev'))}
                            tooltip={$tt('webActivityCategoriesHint')}
                        >
                            <ChartCanvas
                                config={categoryConfig}
                                height={200}
                                ariaLabel={$t('webActivityCategoriesTitle')}
                            />
                            <DonutStats stats={donutRows} />
                        </ChartCard>
                    </div>
                </DashboardSection>

                <DashboardSection title={$t('webActivitySitesTitle')} tooltip={$tt('webActivitySitesHint')}>
                    <ChartCard title={$t('webActivityTopSitesTitle')} meta={$t('webActivityTopSitesMeta')}>
                        <ChartCanvas config={topSitesConfig} height={320} ariaLabel={$t('webActivityTopSitesTitle')} />
                    </ChartCard>
                </DashboardSection>

                <DashboardSection title={$t('webActivityLimitsTitle')} tooltip={$tt('webActivityLimitsHintTitle')}>
                    <div class="chart-card animate-in delay-1">
                        <LimitsList
                            {rows}
                            onAdd={() => openLimitEditor('')}
                            onEdit={openLimitEditor}
                            onDelete={removeLimit}
                            onSnooze={snooze}
                        />
                    </div>
                </DashboardSection>

                <DashboardSection title={$t('webActivityTimelineTitle')} tooltip={$tt('webActivityTimelineHint')}>
                    <div class="chart-card animate-in delay-1">
                        <VisitTimeline
                            visits={siteFilter ? payload.recent.filter((v) => v.d === siteFilter) : payload.recent}
                        />
                    </div>
                </DashboardSection>
            {/if}
        {/if}
    </main>
</div>

{#if editing}
    <LimitModal
        domain={editing.domain}
        limit={editing.limit}
        onSave={(domain, limit) => commitLimit(domain, limit, true)}
        onClose={() => (editing = null)}
    />
{/if}

<ConfirmDialog />
