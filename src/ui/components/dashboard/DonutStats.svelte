<script>
    /**
     * The legend under a doughnut: one row per slice, its colour, its name and its
     * figure.
     *
     * `columns` is how many of those rows stand side by side. One is a list, which is
     * what a handful of slices wants; a category breakdown with a dozen of them is a
     * column of names half a metre long next to a chart 200px tall, and reads better
     * as a grid. The rows themselves do not change either way.
     */
    let { stats = [], columns = 1 } = $props();
</script>

<div class="donut-stats" style:--donut-stat-columns={columns} class:is-grid={columns > 1}>
    {#each stats as r (r.label)}
        <div class="stat-row">
            <span class="stat-row-label" title={r.label}>
                <span class="dot" style="background:{r.color}"></span>
                <span class="label-text">{r.label}</span>
            </span>
            <span class="stat-row-val">
                {r.val}
                {#if r.percent !== undefined && r.percent > 0}
                    <span class="stat-row-pct">({r.percent}%)</span>
                {/if}
            </span>
        </div>
    {/each}
</div>

<style>
    .donut-stats {
        display: flex;
        flex-direction: column;
    }

    .donut-stats.is-grid {
        display: grid;
        grid-template-columns: repeat(var(--donut-stat-columns), minmax(0, 1fr));
        column-gap: 20px;
        row-gap: 4px;
        font-size: 0.88rem;
    }

    .donut-stats.is-grid .stat-row {
        border-bottom: 1px solid color-mix(in srgb, var(--border-color) 30%, transparent);
        padding: 6px 0;
        gap: 12px;
        min-width: 0;
    }

    .stat-row-label {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        overflow: hidden;
        color: var(--text-color);
    }

    .stat-row-label .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .stat-row-label .label-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .stat-row-val {
        white-space: nowrap;
        flex-shrink: 0;
        font-family: var(--mono);
        font-size: 0.88rem;
        color: var(--text-on-color);
        display: flex;
        align-items: baseline;
        gap: 4px;
    }

    .stat-row-pct {
        font-family: inherit;
        font-size: 0.78rem;
        color: var(--text-soft);
    }

    @media (max-width: 1100px) {
        .donut-stats.is-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 640px) {
        .donut-stats.is-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
