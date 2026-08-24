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
    /**
     * `grow` turns `height` into a floor and lets the chart take whatever the card has
     * left. Two cards side by side are the same height whether they like it or not, so
     * a fixed 260px next to a taller neighbour leaves a band of nothing under the axis.
     */
    let { config, height = 260, ariaLabel = '', grow = false } = $props();

    let canvas = $state(null);

    $effect(() => {
        // Read the config here so the effect re-runs when it changes.
        const chartConfig = config;
        if (!canvas || !chartConfig) return;
        const chart = new Chart(canvas.getContext('2d'), chartConfig);
        return () => chart.destroy();
    });
</script>

<div class="chart-wrap" style={grow ? `flex:1 1 auto;min-height:${height}px` : `height:${height}px`}>
    <canvas bind:this={canvas} role="img" aria-label={ariaLabel}></canvas>
</div>
