<script>
    /**
     * [AI INSTRUCTION]
     * THE HEADER BRAND, WHICH IS ALSO THE WAY BETWEEN THE TWO DASHBOARDS.
     *
     * The extension has two of them — web activity and pomodoro — and until now the
     * only way from one to the other was the popup or a bookmark. The brand block was
     * already sitting in the top-left corner of both, saying which one you are on, so
     * it is the honest place to say which ones there are.
     *
     * It is a `<details>` rather than a `<select>` on purpose. The brand is two lines
     * and an icon; a select's trigger is one line of text, so dressing it as the
     * category picker would have meant throwing the brand away to gain a control that
     * says less. A disclosure keeps every pixel of the current design and only adds a
     * chevron — closed, it is the block that was always there.
     *
     * The icons are inlined rather than pulled from a page's sprite: this component is
     * used on both dashboards and only one of them has a `<symbol id="wa-activity">`
     * to point at.
     */
    import { openDashboard } from '../../services/dashboard/dashboardPages.js';

    let {
        /** Which dashboard this page is: a key of `DASHBOARD_PAGES`. */
        current = 'webActivity',
        /** `[{ id, title, sub }]` — already translated, because the two pages do i18n differently. */
        pages = [],
        title = '',
        switchLabel = '',
    } = $props();

    let details = $state(null);

    const currentPage = $derived(pages.find((page) => page.id === current) || pages[0] || { title: '', sub: '' });

    async function go(id) {
        if (details) details.open = false;
        if (id === current) return;
        await openDashboard(id);
    }

    /** Clicking anywhere else closes it, which is what every other menu here does. */
    function onWindowPointerDown(event) {
        if (details?.open && !details.contains(event.target)) details.open = false;
    }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

{#snippet pageIcon(id)}
    {#if id === 'pomodoro'}
        <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" focusable="false">
            <path
                d="M360 80c4.8-12.8 8-27.2 8-44.8 0-4.8-1.6-4.8-4.8-8s-8-4.8-12.8-4.8c-19.2 1.6-40 9.6-60.8 24-6.4-11.2-12.8-22.4-22.4-33.6C264 9.6 259.2 8 256 8c-4.8 0-9.6 1.6-11.2 6.4-9.6 11.2-17.6 20.8-24 33.6q-26.4-21.6-57.6-24c-4.8 0-9.6 1.6-12.8 4.8S144 35.2 144 40c0 16 1.6 28.8 6.4 40C59.2 104 0 176 0 260.8 0 376 108.8 504 256 504s256-128 256-243.2c0-88-59.2-156.8-152-180.8m-65.6 8c1.6 0 1.6-1.6 1.6-3.2 12.8-11.2 24-19.2 36.8-24-4.8 19.2-19.2 48-57.6 56C280 105.6 288 96 294.4 88M256 49.6c4.8 6.4 8 12.8 9.6 20.8-11.2 12.8-19.2 28.8-25.6 48-1.6 0-3.2-1.6-4.8-1.6 1.6-32 8-51.2 20.8-67.2m-48 28.8c-1.6 6.4-3.2 14.4-4.8 22.4-11.2-8-20.8-20.8-25.6-40 11.2 3.2 20.8 9.6 30.4 17.6M256 472C128 472 32 360 32 260.8c0-73.6 52.8-132.8 134.4-152 12.8 16 27.2 25.6 43.2 32 1.6 0 1.6 0 3.2 1.6 12.8 4.8 27.2 8 36.8 9.6h1.6c6.4 0 11.2-3.2 14.4-8 24-3.2 54.4-12.8 76.8-35.2 84.8 17.6 139.2 76.8 139.2 152C480 360 384 472 256 472"
            />
        </svg>
    {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
                d="M3 12h4l3 8 4-16 3 8h4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    {/if}
{/snippet}

<details class="brand-switch" bind:this={details}>
    <summary class="header-brand" title={title || switchLabel} aria-label={switchLabel}>
        <div class="brand-icon">{@render pageIcon(current)}</div>
        <div class="brand-text">
            <div class="brand-title">{currentPage.title}</div>
            <div class="brand-sub">{currentPage.sub}</div>
        </div>
        <svg
            class="brand-chevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    </summary>

    <div class="brand-menu">
        {#each pages as page (page.id)}
            <button
                class="brand-menu-item"
                class:is-current={page.id === current}
                type="button"
                aria-current={page.id === current ? 'page' : undefined}
                onclick={() => go(page.id)}
            >
                <span class="brand-menu-icon">{@render pageIcon(page.id)}</span>
                <span class="brand-menu-title">{page.title}</span>
            </button>
        {/each}
    </div>
</details>

<style>
    .brand-switch {
        position: relative;
        height: 100%;
        flex-shrink: 0;
    }

    /* The summary carries `.header-brand`, so the closed state is pixel for pixel the
       block that was there before — the chevron is the only thing added. */
    .brand-switch summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
    }

    .brand-switch summary::-webkit-details-marker {
        display: none;
    }

    .brand-switch summary::marker {
        content: '';
    }

    .brand-text {
        min-width: 0;
    }

    .brand-chevron {
        width: 12px;
        height: 12px;
        margin-left: auto;
        flex-shrink: 0;
        color: color-mix(in srgb, var(--text-color) 55%, transparent);
        transition:
            transform 0.15s ease,
            color 0.15s ease;
    }

    .brand-switch summary:hover .brand-chevron {
        color: var(--interactive-color);
    }

    .brand-switch[open] .brand-chevron {
        transform: rotate(180deg);
        color: var(--interactive-color);
    }

    .brand-switch summary:focus-visible {
        outline: 2px solid var(--interactive-color);
        outline-offset: -2px;
    }

    .brand-menu {
        position: absolute;
        top: calc(100% + 4px);
        left: 8px;
        z-index: 60;
        min-width: max(var(--sidebar-w, 220px), 220px);
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 5px;
        background: var(--bg-panel-color);
        border: 1px solid var(--border-color);
        border-radius: 9px;
        box-shadow: 0 12px 28px color-mix(in srgb, var(--bg-color) 65%, transparent);
    }

    .brand-menu-item {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        padding: 7px 9px;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: var(--text-color);
        font-family: inherit;
        text-align: left;
        cursor: pointer;
        transition:
            background 0.13s,
            border-color 0.13s;
    }

    .brand-menu-item:hover {
        background: color-mix(in srgb, var(--interactive-color) 14%, transparent);
        border-color: color-mix(in srgb, var(--interactive-color) 45%, transparent);
    }

    /* The page you are on stays in the list rather than being hidden: a menu of one
       item is a menu that never tells you where you are. */
    .brand-menu-item.is-current {
        background: color-mix(in srgb, var(--interactive-color) 22%, transparent);
        border-color: var(--interactive-color);
    }

    .brand-menu-item:focus-visible {
        outline: 2px solid var(--interactive-color);
        outline-offset: 1px;
    }

    .brand-menu-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--interactive-color) 20%, transparent);
        color: var(--interactive-color);
        flex-shrink: 0;
    }

    .brand-menu-icon :global(svg) {
        width: 14px;
        height: 14px;
    }

    /* Only the name. The row under the brand says "panel" because it says which of
       the two you are looking at; repeating it beside every entry of a list of panels
       says nothing at all. */
    .brand-menu-title {
        font-size: 0.92rem;
        font-weight: 600;
        color: var(--text-on-color);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
