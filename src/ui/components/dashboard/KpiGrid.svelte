<script>
    let { kpis = [] } = $props();
</script>

{#each kpis as k, i (k.label || i)}
    <div class="kpi-card animate-in" style="--kpi-color:{k.color};animation-delay:{i * 0.035}s">
        <div class="kpi-label">{k.label}</div>
        <div
            class="kpi-value"
            class:kpi-value-text={typeof k.value === 'string' && k.value.length > 8}
            title={String(k.value ?? '')}
        >
            {k.value}
        </div>
        <div class="kpi-sub">{k.sub}</div>
    </div>
{/each}
