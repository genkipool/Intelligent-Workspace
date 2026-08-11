<script>
    let { stats = [] } = $props();
</script>

{#each stats as r}
    <div class="stat-row">
        <span class="stat-row-label">
            <span class="dot" style="background:{r.color}"></span>{r.label}
        </span>
        <span class="stat-row-val">{r.val}</span>
    </div>
{/each}
