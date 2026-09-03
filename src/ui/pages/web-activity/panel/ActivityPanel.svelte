<script>
    /**
     * [AI INSTRUCTION]
     * THE WEB ACTIVITY, IN THE SIDE PANEL.
     *
     * The same page as the dashboard, in the shape a 350px column can hold: a toolbar
     * that searches and folds, and one box per site. It reads the same payload and
     * opens the same two dialogs, so nothing here has its own idea of what a limit is.
     *
     * It opens on today, because the panel is glanced at while the time is being spent
     * and the question it usually answers is about the day in progress. The chips under
     * the search box widen that to a week, a month or the lot without leaving the
     * column; what is still the tab's is everything that needs a chart to mean
     * anything, which the resize button opens.
     */
    import { onMount, tick } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { t, tt } from '../../../stores/i18nStore.js';
    import { showNotification } from '../../../../utils/i18n.js';
    import SidePanelHeader from '../../../components/common/SidePanelHeader.svelte';
    import SearchAndControls from '../../../components/common/SearchAndControls.svelte';
    import PeriodChips from '../../../components/common/PeriodChips.svelte';
    import PanelSite from './PanelSite.svelte';
    import { createPanelNav, panelNavActions } from '../../../services/sidePanelNav.js';
    import { PANEL_PERIODS } from '../../../services/dashboard/periods.js';

    let {
        sites = [],
        verdicts = {},
        totalSeconds = 0,
        limitOf,
        onEditLimit,
        onEditSchedule,
        onToggleLimit,
        onToggleSchedule,
        onClearLimit,
        onClearSchedule,
        onOpenInTab,
        onOpenSettings,
        /** How far back the list is looking, in days. `1` is today; `0` is everything. */
        period = 1,
        onPeriodChange,
        /** The site of the tab in front, scrolled to when it changes. */
        activeDomain = null,
    } = $props();

    let query = $state('');

    /**
     * The four navigation buttons of the header are the ones every side-panel page
     * carries, so they behave the way they do everywhere else: pin this view so the
     * toolbar icon opens it, jump to the group list, go home, or go back where you
     * came from.
     *
     * The pinned views are mutually exclusive — the worker keeps them that way — so
     * pinning this one is enough; it does not have to unpin the others itself.
     */
    let isPinned = $state(false);

    onMount(async () => {
        const { isWebActivityPinned } = await chrome.storage.local.get('isWebActivityPinned');
        isPinned = !!isWebActivityPinned;
    });

    async function togglePin() {
        const next = !isPinned;
        isPinned = next;
        await chrome.storage.local.set({ isWebActivityPinned: next });
        showNotification(next ? 'webActivityPagePinned' : 'webActivityPageUnpinned');
    }

    /** Where this page is, for whatever page it hands over to. */
    const HERE = '../web-activity/web-activity.html?context=sidepanel';
    const nav = createPanelNav(HERE);

    /**
     * The four navigation buttons, in the order every side-panel header carries them:
     * this page's pin, then the three `sidePanelNav.js` builds for every panel.
     */
    const headerActions = $derived([
        {
            id: 'pin-toggle',
            class: 'pin-button',
            pinned: isPinned,
            pressed: isPinned,
            // Matching the rules page, which makes this one focusable explicitly.
            tabindex: '0',
            icon: '#panel-pin',
            ariaLabel: $t('webActivityPinPage'),
            title: $tt(isPinned ? 'webActivityUnpinPageTitle' : 'webActivityPinPageTitle'),
            onclick: togglePin,
        },
        ...panelNavActions({ t: $t, tt: $tt, nav }),
    ]);

    /**
     * The boxes the user has unfolded.
     *
     * Folded is the default now, so this holds the exceptions. A panel is glanced at:
     * what it is asked is "what has today gone on", and eight sites' worth of figures,
     * allowances and controls is a page to be scrolled rather than a column to be read.
     * The figures are still one hover away — see the tooltip on each box's clock — and
     * one click away, which is where they belong.
     */
    const expanded = new SvelteSet();

    const shown = $derived.by(() => {
        const needle = query.trim().toLowerCase();
        return needle ? sites.filter((site) => site.domain.includes(needle)) : sites;
    });

    const allCollapsed = $derived(shown.length > 0 && shown.every((site) => !expanded.has(site.domain)));

    const share = (seconds) => (totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0);

    function toggleAll() {
        if (allCollapsed) for (const site of shown) expanded.add(site.domain);
        else expanded.clear();
    }

    function toggle(domain) {
        if (expanded.has(domain)) expanded.delete(domain);
        else expanded.add(domain);
    }

    /**
     * Brings the site of the tab in front into view, the way the group list brings the
     * active tab into view: smoothly, centred, and a beat after the render so the box
     * is measurable. The panel is read while switching tabs, and a list that does not
     * follow is a list that has to be searched every time.
     */
    let listEl = $state(null);
    let lastScrolled = null;

    $effect(() => {
        const domain = activeDomain;
        if (!domain || !listEl || domain === lastScrolled) return;
        if (!shown.some((site) => site.domain === domain)) return;
        lastScrolled = domain;
        tick().then(() =>
            setTimeout(() => {
                listEl?.querySelector(`[data-domain="${CSS.escape(domain)}"]`)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }, 250),
        );
    });
</script>

<div class="side-panel-shell">
    <!--
        The bar every side-panel page of this extension wears, and the group list's
        search row under it with the two controls this panel needs.
    -->
    <SidePanelHeader title={$t('webActivityPanelTitleBar')} actions={headerActions} />

    <SearchAndControls>
        {#snippet search()}
            <div class="search-container search-container--compact">
                <label for="search-input" class="visually-hidden">{$t('webActivitySearchPanel')}</label>
                <input
                    type="search"
                    id="search-input"
                    class="search-input"
                    autocomplete="off"
                    spellcheck="false"
                    translate="no"
                    bind:value={query}
                    placeholder={$t('webActivitySearchPanel')}
                    title={$tt('webActivitySearchPanel')}
                />
            </div>
        {/snippet}

        {#snippet controls()}
            <button
                id="resizeButton"
                type="button"
                class="resize-button"
                translate="no"
                aria-pressed="false"
                title={$tt('webActivityOpenInTab')}
                aria-label={$t('webActivityOpenInTab')}
                onclick={onOpenInTab}
            >
                <!-- 24px, like every other control in this row. The rules page draws
                     it at 30 because its header button is that size; here it sits
                     beside the fold, and the two have to match each other. -->
                <svg width="24" height="24" style="color: var(--text-color);" aria-hidden="true" focusable="false">
                    <use href="#panel-resize"></use>
                </svg>
            </button>
            <button
                id="expand-all-btn"
                type="button"
                class="control-btn"
                disabled={!shown.length}
                aria-pressed={!allCollapsed}
                title={$tt(allCollapsed ? 'webActivityExpandAll' : 'webActivityCollapseAll')}
                aria-label={$t(allCollapsed ? 'webActivityExpandAll' : 'webActivityCollapseAll')}
                onclick={toggleAll}
            >
                <svg width="24" height="24" style="color: var(--text-color);" aria-hidden="true" focusable="false">
                    <use href={allCollapsed ? '#wa-expand-all' : '#wa-collapse-all'}></use>
                </svg>
            </button>
            <!-- Everything the dashboard's settings page holds, in a dialog: a column
                 this narrow has no main view to give over to it. -->
            <button
                id="panel-settings-btn"
                type="button"
                class="control-btn"
                title={$tt('webActivitySettings')}
                aria-label={$t('webActivitySettings')}
                onclick={onOpenSettings}
            >
                <svg width="24" height="24" style="color: var(--text-color);" aria-hidden="true" focusable="false">
                    <use href="#wa-settings"></use>
                </svg>
            </button>
        {/snippet}
    </SearchAndControls>

    <!-- Under the controls rather than in them: the search narrows the list and the
         fold changes how it is drawn, but the period changes what the figures *are*.
         A control that changes the numbers belongs on its own line. -->
    <div class="wa-panel-periods">
        <PeriodChips
            wrap
            value={period}
            periods={PANEL_PERIODS}
            ariaLabel={$t('dashboardPeriod')}
            onchange={onPeriodChange}
        />
    </div>

    <div class="side-panel-body" bind:this={listEl}>
        {#each shown as site (site.domain)}
            <PanelSite
                {site}
                isActive={site.domain === activeDomain}
                limit={limitOf(site.domain)}
                verdict={verdicts[site.domain]}
                share={share(site.seconds)}
                open={expanded.has(site.domain)}
                onToggle={() => toggle(site.domain)}
                onEditLimit={(tab) => onEditLimit(site.domain, tab)}
                onEditSchedule={() => onEditSchedule(site.domain)}
                onToggleLimit={(which, next) => onToggleLimit(site.domain, which, next)}
                onToggleSchedule={(next) => onToggleSchedule(site.domain, next)}
                onClearLimit={(which) => onClearLimit(site.domain, which)}
                onClearSchedule={() => onClearSchedule(site.domain)}
            />
        {/each}

        {#if !shown.length}
            <!-- "Nothing today" is only true of today; every other period says so in
                 its own words. -->
            <p class="no-data-msg">
                {$t(sites.length || period !== 1 ? 'webActivityNoSites' : 'webActivityPanelEmpty')}
            </p>
        {/if}
    </div>
</div>
