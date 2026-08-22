<script>
    /**
     * Twenty-four bars, one per hour of the day.
     *
     * What `cnts` counts is up to the caller — pomodoro sessions on one dashboard,
     * sites visited on another — so the wording of the tooltip comes with it rather
     * than being assumed here.
     */
    let {
        hours = [],
        cnts = [],
        maxH = 0.001,
        fmtH = (val) => val,
        i18n = (key, params) => key,
        countLabel = (count) =>
            tr('dashboardHourSessions', [String(count)]) ||
            `${count} ${tr(count === 1 ? 'dashboardSession' : 'dashboardSessions')}`,
    } = $props();

    function tr(key, ...params) {
        if (typeof i18n !== 'function') return key;
        const flatParams = Array.isArray(params[0]) ? params[0] : params;
        const res = i18n(key, ...flatParams);
        if (typeof res === 'string' && res.includes('$1')) {
            return i18n(key, flatParams);
        }
        return res;
    }

    function formatHour(h) {
        return String(h).padStart(2, '0');
    }

    function tooltipFor(h, val, count) {
        const startStr = formatHour(h);
        const endStr = h === 23 ? '24' : formatHour(h + 1);
        const timeStr = fmtH(val * 3600);
        const countStr = countLabel(count);
        return (
            tr('dashboardHourSlotTitle', [startStr, endStr, timeStr, countStr]) ||
            `${startStr}:00 - ${endStr}:00 · ${timeStr} · ${countStr}`
        );
    }
</script>

{#each hours as val, h (h)}
    {@const pct = Math.round((val / maxH) * 100)}
    {@const label = h % 6 === 0 ? `${h}h` : ''}
    {@const alpha = 0.15 + (pct / 100) * 0.75}
    <div class="hour-bar-col" title={tooltipFor(h, val, cnts[h] ?? 0)}>
        <div class="hour-bar-track">
            <div
                class="hour-bar"
                style="height:{Math.max(2, pct)}%;background:color-mix(in srgb,var(--interactive-color) {Math.round(
                    alpha * 100,
                )}%,transparent)"
            ></div>
        </div>
        <div class="hour-label">{label || '\u00A0'}</div>
    </div>
{/each}
