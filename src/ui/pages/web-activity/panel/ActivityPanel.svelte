<script>
    /**
     * [AI INSTRUCTION]
     * THE WEB ACTIVITY, IN THE SIDE PANEL.
     *
     * The same page as the dashboard, in the shape a 350px column can hold: a toolbar
     * that searches and folds, and one box per site. It reads the same payload and
     * opens the same two dialogs, so nothing here has its own idea of what a limit is.
     *
     * Today only. The panel is glanced at while browsing, and the question it answers
     * is about the day in progress; anything longer is what the tab is for, which the
     * resize button opens.
     */
    import { onMount, tick } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { t, tt } from '../../../stores/i18nStore.js';
    import { showNotification } from '../../../../utils/i18n.js';
    import PanelSite from './PanelSite.svelte';

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

    async function goToGroups() {
        await chrome.storage.local.set({ navSource: HERE });
        window.location.href = '../listGroup/listGroup.html?context=sidepanel';
        chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: '../listGroup/listGroup.html' });
    }

    function goHome() {
        window.location.href = '../popup/popup.html?context=sidepanel';
        chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: '../popup/popup.html' });
    }

    async function goBack() {
        const { navSource } = await chrome.storage.local.get('navSource');
        await chrome.storage.local.set({ navSource: HERE });
        if (navSource) {
            window.location.href = navSource;
            return;
        }
        goHome();
    }
    /** The boxes the user has folded. Open is the default, so this holds the exceptions. */
    const collapsed = new SvelteSet();

    const shown = $derived.by(() => {
        const needle = query.trim().toLowerCase();
        return needle ? sites.filter((site) => site.domain.includes(needle)) : sites;
    });

    const allCollapsed = $derived(shown.length > 0 && shown.every((site) => collapsed.has(site.domain)));

    const share = (seconds) => (totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0);

    function toggleAll() {
        if (allCollapsed) collapsed.clear();
        else for (const site of shown) collapsed.add(site.domain);
    }

    function toggle(domain) {
        if (collapsed.has(domain)) collapsed.delete(domain);
        else collapsed.add(domain);
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

<div class="wa-panel">
    <!--
        The header every side-panel page of this extension wears: the page's name and
        the same four navigation buttons, with the same glyphs at the same size. Under
        it, the group list's `search-and-controls` row with the two controls this panel
        needs.
    -->
    <header class="header-main-menu">
        <h1 class="header-main-title">{$t('webActivityPanelTitleBar')}</h1>
        <button
            id="pin-toggle"
            class="pin-button"
            class:pinned={isPinned}
            type="button"
            translate="no"
            tabindex="0"
            aria-pressed={isPinned}
            aria-label={$t('webActivityPinPage')}
            title={$tt(isPinned ? 'webActivityUnpinPageTitle' : 'webActivityPinPageTitle')}
            onclick={togglePin}
        >
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                style="color: var(--text-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#wa-pin"></use>
            </svg>
        </button>
        <button
            id="list-groups-btn"
            class="buttom-list-group"
            type="button"
            translate="no"
            aria-label={$t('listTabGroups')}
            title={$tt('listTabGroups')}
            onclick={goToGroups}
        >
            <svg
                width="20"
                height="20"
                viewBox="0 0 512 512"
                style="color: var(--text-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#wa-list-group"></use>
            </svg>
        </button>
        <button
            id="home-btn"
            class="home-button"
            type="button"
            translate="no"
            aria-label={$t('backToHome')}
            title={$tt('backToHome')}
            onclick={goHome}
        >
            <svg
                width="20"
                height="20"
                viewBox="2 2 20 20"
                style="color: var(--text-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#wa-home"></use>
            </svg>
        </button>
        <button
            class="back-button"
            type="button"
            translate="no"
            aria-label={$t('backToMainPopup')}
            title={$tt('backToHome')}
            onclick={goBack}
        >
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                style="color: var(--text-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#wa-back"></use>
            </svg>
        </button>
    </header>

    <div class="search-and-controls">
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
        <div class="controls-container">
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
                    <use href="#wa-resize"></use>
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
        </div>
    </div>

    <div class="wa-panel-list" bind:this={listEl}>
        {#each shown as site (site.domain)}
            <PanelSite
                {site}
                isActive={site.domain === activeDomain}
                limit={limitOf(site.domain)}
                verdict={verdicts[site.domain]}
                share={share(site.seconds)}
                open={!collapsed.has(site.domain)}
                onToggle={() => toggle(site.domain)}
                onEditLimit={() => onEditLimit(site.domain)}
                onEditSchedule={() => onEditSchedule(site.domain)}
                onToggleLimit={(next) => onToggleLimit(site.domain, next)}
                onToggleSchedule={(next) => onToggleSchedule(site.domain, next)}
                onClearLimit={() => onClearLimit(site.domain)}
                onClearSchedule={() => onClearSchedule(site.domain)}
            />
        {/each}

        {#if !shown.length}
            <p class="no-data-msg">{$t(sites.length ? 'webActivityNoSites' : 'webActivityPanelEmpty')}</p>
        {/if}
    </div>
</div>
