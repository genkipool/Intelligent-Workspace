<script>
    /**
     * One card inside a dashboard section: a title, an optional caption that says what
     * the numbers are, and whatever is being shown.
     *
     * `sortId` makes it movable *within its own section* — the grid it sits in is the
     * `sortable` container, so there is nowhere else for it to go. A section with one
     * card passes no id, because a list of one has no order.
     */
    import { t, tt } from '../../stores/i18nStore.js';

    let { title, meta = '', tooltip = '', delay = 1, sortId = null, children } = $props();
</script>

<div class="chart-card animate-in delay-{delay}" data-sort-id={sortId}>
    <div class="chart-card-header">
        <div class="chart-card-title" title={tooltip}>
            {#if sortId}
                <span
                    class="sort-grip"
                    data-sort-handle
                    role="button"
                    tabindex="-1"
                    aria-hidden="true"
                    title={$tt('dashboardDragPanel')}
                    aria-label={$t('dashboardDragPanel')}
                ></span>
            {/if}
            <span>{title}</span>
        </div>
        {#if meta}<div class="chart-card-meta">{meta}</div>{/if}
    </div>
    {@render children()}
</div>
