<script>
    /**
     * `countLabel` is what the tooltip says about `c`, because what a cell counts
     * differs by dashboard — pomodoro sessions on one, nothing worth naming on
     * another, where the duration alone is the whole story. Returning an empty string
     * leaves the line out.
     */
    let {
        cells = [],
        monthPositions = [],
        locale = 'en-GB',
        i18n = () => '',
        fmtDur = () => '',
        tooltipEl = null,
        countLabel = (count, translate) =>
            `${count} ${translate(count === 1 ? 'dashboardSession' : 'dashboardSessions')}`,
    } = $props();

    const STRIDE = 20; // 17px cell + 3px gap

    function showTooltip(e, { c, focus, date }) {
        if (!tooltipEl) return;
        tooltipEl.style.display = 'block';
        const focusLine = focus > 0 ? `<span class="tt-focus">${fmtDur(focus)}</span>` : '';
        const counted = c > 0 ? countLabel(c, i18n) : '';
        const countLine =
            c > 0
                ? counted && `<span class="tt-count">${counted}</span>`
                : `<span class="tt-empty">${i18n('dashboardLegendNone') || 'Sin actividad'}</span>`;

        tooltipEl.innerHTML =
            `<span class="tt-date">${date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>` +
            (countLine || '') +
            focusLine;

        moveTooltip(e);
    }

    function moveTooltip(e) {
        if (!tooltipEl) return;
        tooltipEl.style.left = e.clientX + 14 + 'px';
        tooltipEl.style.top = e.clientY - 52 + 'px';
    }

    function hideTooltip() {
        if (!tooltipEl) return;
        tooltipEl.style.display = 'none';
    }
</script>

<div class="heatmap-months">
    {#each monthPositions as mp, i (mp.col)}
        {@const nextMp = i + 1 < monthPositions.length ? monthPositions[i + 1] : null}
        {@const nextCol = nextMp ? nextMp.col : cells.length / 7}
        {@const w = (nextCol - mp.col) * STRIDE}
        {@const spanCols = nextCol - mp.col}
        <span style="display:inline-block;width:{w}px;overflow:hidden;box-sizing:border-box;padding-left:2px;">
            {spanCols >= 2 ? mp.label : ''}
        </span>
    {/each}
</div>

<div class="heatmap-grid">
    {#each cells as cell (cell.date.getTime())}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="heatmap-cell"
            data-level={cell.lv}
            data-today={cell.isToday ? '' : null}
            data-month-start={cell.isMonthStart ? '' : null}
            onmouseenter={(e) => showTooltip(e, cell)}
            onmousemove={moveTooltip}
            onmouseleave={hideTooltip}
        ></div>
    {/each}
</div>
