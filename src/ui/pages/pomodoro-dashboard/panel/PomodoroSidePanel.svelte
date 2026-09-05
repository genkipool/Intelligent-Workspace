<script>
    /**
     * [AI INSTRUCTION]
     * THE POMODORO, IN THE SIDE PANEL.
     *
     * The same timer as the group list's — literally the same component and the same
     * controller, mounted `embedded` — with the dashboard's own summary cards under it.
     * Nothing here has a second idea of what the clock is doing: the state lives in the
     * service worker and every open surface renders the same `pomodoroStateUpdate`, so
     * starting a session here and switching to the group list shows one clock, not two.
     *
     * What it adds is the reading the panel is for. The timer answers "how long is
     * left"; the cards answer "how has it been going", from the sessions saved in
     * IndexedDB — the same rows, folded the same way and filtered by the same periods
     * as the full dashboard, which the header's first button opens in a tab.
     */
    import { onDestroy, onMount } from 'svelte';
    import { t, tt, currentLang } from '../../../stores/i18nStore.js';
    import { initializeActiveTheme } from '../../../../utils/theme.js';
    import { getAllPomoStatsFromDb, POMO_STATS_EVENT } from '../../../../utils/db.js';
    import { createPanelNav, panelNavActions } from '../../../services/sidePanelNav.js';
    import { DASHBOARD_PAGES } from '../../../services/dashboard/dashboardPages.js';
    import Icons from '../../../components/Icons.svelte';
    import PanelNavIcons from '../../../components/common/PanelNavIcons.svelte';
    import SidePanelHeader from '../../../components/common/SidePanelHeader.svelte';
    import KpiGrid from '../../../components/dashboard/KpiGrid.svelte';
    import PeriodChips from '../../../components/common/PeriodChips.svelte';
    import PomodoroPanel from '../../../components/listGroup/PomodoroPanel.svelte';
    import PomodoroPopups from '../../../components/listGroup/PomodoroPopups.svelte';
    import ScrollButtons from '../../../components/common/ScrollButtons.svelte';
    import { initPomodoro } from '../../listGroup/features/pomodoro/index.js';
    import { computeKpis, dedupeSessions, pickKpis, withinPeriod } from '../dashboardAnalytics.js';
    import { PANEL_PERIODS } from '../../../services/dashboard/periods.js';

    /** Where this page is, for whatever page it hands over to. */
    const HERE = '../pomodoro-dashboard/dashboard.html?context=sidepanel';
    const nav = createPanelNav(HERE);

    /**
     * Sixteen of the dashboard's nineteen cards, in the order a column reads them: what
     * was done, then how well it went, then what got in the way, then when the work
     * actually happens.
     *
     * They are below the timer, not above it, so the length costs nothing: the panel
     * opens on the clock and the summary is what is there when you scroll. What is
     * left for the tab is everything that needs a chart or a wide table to mean
     * anything — the streak calendar, the per-project breakdown, the hourly grid.
     */
    const PANEL_KPIS = [
        'focus',
        'cycles',
        'sessions',
        'efficiency',
        'avgFocus',
        'totalTime',
        'break',
        'workRest',
        'interruptions',
        'interruptionTime',
        'bestSession',
        'activeDays',
        'focusIntensity',
        'goldenHour',
        'bestDay',
        'topProject',
    ];

    const PERIOD_KEY = 'pomodoroPanelPeriod';

    let period = $state(7);
    let sessions = $state([]);
    let loaded = $state(false);
    let listEl = $state(null);

    const shown = $derived(sessions.filter((entry) => withinPeriod(entry, period)));

    /**
     * `computeKpis` speaks `chrome.i18n`'s shape — a key and loose parameters — and the
     * store's translator takes an array. One adapter here beats a second copy of the
     * arithmetic that does not need one.
     */
    const kpis = $derived(
        pickKpis(
            computeKpis(shown, sessions, (key, ...params) => $t(key, params), $currentLang),
            PANEL_KPIS,
        ),
    );

    async function loadSessions() {
        try {
            sessions = dedupeSessions(await getAllPomoStatsFromDb());
        } catch {
            sessions = [];
        }
        loaded = true;
    }

    /** Every route by which a session can be saved, from this page or another one. */
    let syncChannel = null;
    let onRuntimeMessage = null;

    function selectPeriod(days) {
        period = days;
        chrome.storage.local.set({ [PERIOD_KEY]: days });
    }

    onMount(async () => {
        document.body.classList.add('pomo-side-panel');
        initializeActiveTheme();

        const stored = await chrome.storage.local.get(PERIOD_KEY);
        if (typeof stored[PERIOD_KEY] === 'number') period = stored[PERIOD_KEY];

        // The panel is the page, so the controller never has a toolbar button to look
        // for. Everything else about it is the group list's.
        initPomodoro({ embedded: true });

        await loadSessions();

        window.addEventListener(POMO_STATS_EVENT, loadSessions);
        try {
            syncChannel = new BroadcastChannel('pomodoro_sync_channel');
            syncChannel.onmessage = (e) => {
                if (e.data?.type === 'pomodoroStatsChanged') loadSessions();
            };
        } catch {}

        // Not an `async` listener: an async function always returns a promise and
        // Chrome reads any truthy return as "this listener will answer", which starves
        // every other `sendMessage` that expected a reply.
        onRuntimeMessage = (msg) => {
            if (msg.action === 'pomodoroStatsChanged' || msg.action === 'pomodoroStatsUpdated') loadSessions();
            // A finished cycle is written by the panel's own controller a moment after
            // the worker announces it; re-reading on the announcement alone would show
            // the totals from before it.
            if (msg.action === 'pomodoroStateUpdate' && (msg.event === 'completed' || msg.event === 'allDone')) {
                setTimeout(loadSessions, 700);
            }
            if (msg.action === 'themeChanged') initializeActiveTheme();
        };
        chrome.runtime.onMessage.addListener(onRuntimeMessage);
    });

    onDestroy(() => {
        document.body.classList.remove('pomo-side-panel');
        window.removeEventListener(POMO_STATS_EVENT, loadSessions);
        syncChannel?.close();
        if (onRuntimeMessage) chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    });

    /**
     * The header: the button that opens the full dashboard in a tab — the same one the
     * web activity panel wears, in the same place — and then the three every
     * side-panel page ends with.
     */
    const headerActions = $derived([
        {
            id: 'pomo-open-tab-btn',
            class: 'panel-open-tab',
            icon: '#panel-resize',
            ariaLabel: $t('pomodoroDashboard'),
            title: $tt('pomodoroDashboard'),
            onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD_PAGES.pomodoro) }),
        },
        ...panelNavActions({ t: $t, tt: $tt, nav }),
    ]);
</script>

<Icons />
<PanelNavIcons />
<PomodoroPopups />

<div class="side-panel-shell">
    <SidePanelHeader title={$t('pomodoroTitle')} actions={headerActions} />

    <div class="side-panel-body pomo-panel-body" bind:this={listEl}>
        <!-- Full-bleed: the timer is the page's own chrome, not a card on it. -->
        <PomodoroPanel embedded />

        <section class="pomo-panel-stats">
            <h2 class="section-title" title={$tt('titleSummarySection')}>
                <span class="section-title-text">{$t('dashboardSummary')}</span>
            </h2>

            <div class="pomo-panel-periods">
                <PeriodChips
                    wrap
                    value={period}
                    periods={PANEL_PERIODS}
                    ariaLabel={$t('dashboardPeriod')}
                    onchange={selectPeriod}
                />
            </div>

            {#if !loaded}
                <div class="pomo-panel-placeholder">{$t('dashboardLoading')}</div>
            {:else if shown.length === 0}
                <div class="pomo-panel-placeholder">{$t('dashboardNoData')}</div>
            {:else}
                <div class="kpi-grid">
                    <KpiGrid {kpis} />
                </div>
            {/if}
        </section>
    </div>

    <ScrollButtons target={() => listEl} minScroll={10} edge={5} />
</div>
