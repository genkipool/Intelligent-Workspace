<script>
    let { kpis = [] } = $props();
</script>

{#each kpis as k, i}
    <div class="kpi-card animate-in" style="--kpi-color:{k.color};animation-delay:{i * 0.035}s">
        <div class="kpi-label">{k.label}</div>
        <div class="kpi-value">{k.value}</div>
        <div class="kpi-sub">{k.sub}</div>
    </div>
{/each}
