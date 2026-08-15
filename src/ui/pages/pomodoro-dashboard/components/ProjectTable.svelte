<script>
    let { sorted = [], maxF = 0, effColor = () => '', projColor = () => '', fmtDur = () => '' } = $props();
</script>

{#each sorted as [name, s], i (name)}
    {@const eff = s.effCount > 0 ? Math.round(s.effSum / s.effCount) : 0}
    {@const color = projColor(i)}
    {@const barW = maxF > 0 ? Math.round((s.focus / maxF) * 100) : 0}
    {@const tags = [...s.tags]}

    <tr>
        <td class="td-name">
            <span class="dot" style="background:{color}"></span>{name}
            {#if tags.length > 0}
                <span style="margin-left:4px">
                    {#each tags as t (t)}
                        <span class="tl-chip tl-tag">#{t}</span>
                    {/each}
                </span>
            {/if}
        </td>
        <td class="td-mono">{s.sessions}</td>
        <td class="td-mono">
            <div class="eff-bar-wrap">
                <div class="eff-bar"><div class="eff-bar-fill" style="width:{barW}%;background:{color}"></div></div>
                <span>{fmtDur(s.focus)}</span>
            </div>
        </td>
        <td class="td-mono">{s.cycles}</td>
        <td class="td-mono">{s.interruptions}</td>
        <td>
            <div class="eff-bar-wrap">
                <div class="eff-bar">
                    <div class="eff-bar-fill" style="width:{eff}%;background:{effColor(eff)}"></div>
                </div>
                <span class="eff-pct">{eff}%</span>
            </div>
        </td>
    </tr>
{/each}
