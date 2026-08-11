<script>
    let { hours = [], cnts = [], maxH = 0.001, fmtH = (val) => val, i18n = (key) => key } = $props();
</script>

{#each hours as val, h}
    {@const pct = Math.round((val / maxH) * 100)}
    {@const label = h % 6 === 0 ? `${h}h` : ''}
    {@const alpha = 0.15 + (pct / 100) * 0.75}
    {@const sessWord = cnts[h] !== 1 ? i18n('dashboardSessions') : i18n('dashboardSession')}
    <div class="hour-bar-col" title="{h}:00-{h + 1}:00 - {fmtH(val * 3600)} - {cnts[h]} {sessWord}">
        <div
            class="hour-bar"
            style="height:{Math.max(2, pct)}%;background:color-mix(in srgb,var(--interactive-color) {Math.round(
                alpha * 100,
            )}%,transparent)"
        ></div>
        <div class="hour-label">{label}</div>
    </div>
{/each}
