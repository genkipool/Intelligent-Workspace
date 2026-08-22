<script>
    /**
     * A Chart.js chart that follows its configuration.
     *
     * The pomodoro dashboard drives its charts by hand — a render function per chart
     * that finds a canvas by id, destroys the old instance and builds a new one, and
     * a theme listener that has to remember to call all of them. Here the config is a
     * prop: change it, or change the palette, and the chart is rebuilt, with the
     * previous instance disposed of by the same effect that made it.
     *
     * `Chart` is the global defined by `lib/chart.local.js`, which the page imports.
     */
    let { config, height = 260, ariaLabel = '' } = $props();

    let canvas = $state(null);

    $effect(() => {
        // Read the config here so the effect re-runs when it changes.
        const chartConfig = config;
        if (!canvas || !chartConfig) return;
        const chart = new Chart(canvas.getContext('2d'), chartConfig);
        return () => chart.destroy();
    });
</script>

<div class="chart-wrap" style="height:{height}px">
    <canvas bind:this={canvas} role="img" aria-label={ariaLabel}></canvas>
</div>
