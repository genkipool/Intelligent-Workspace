<script>
    /**
     * One card inside a dashboard section: a title, an optional caption that says what
     * the numbers are, and whatever is being shown.
     */
    let { title, meta = '', tooltip = '', delay = 1, children } = $props();
</script>

<div class="chart-card animate-in delay-{delay}">
    <div class="chart-card-header">
        <div class="chart-card-title" title={tooltip}>{title}</div>
        {#if meta}<div class="chart-card-meta">{meta}</div>{/if}
    </div>
    {@render children()}
</div>
