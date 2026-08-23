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
            <span class="stat-row-label">
                <span class="dot" style="background:{r.color}"></span>{r.label}
            </span>
            <span class="stat-row-val">{r.val}</span>
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
        column-gap: 18px;
    }

    /* In a grid the bottom rule would draw a ragged line across a short last column,
       so the separator goes and the columns are held apart by the gap instead. */
    .donut-stats.is-grid .stat-row {
        border-bottom: none;
        gap: 10px;
        min-width: 0;
    }

    .donut-stats.is-grid .stat-row :global(.stat-row-label) {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
