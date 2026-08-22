<script>
    /**
     * A titled block of a dashboard. Every section on every dashboard is this shape —
     * a heading with an explanatory tooltip and a body — so the markup lives here.
     */
    let { title, tooltip = '', children } = $props();
</script>

<section>
    <div class="section-title" title={tooltip}>{title}</div>
    {@render children()}
</section>
