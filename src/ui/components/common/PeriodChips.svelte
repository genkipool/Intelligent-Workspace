<script>
    /**
     * [AI INSTRUCTION]
     * THE ROW OF CHIPS THAT PICKS A PERIOD.
     *
     * Both side panels carry it and both dashboards carry the same control in their
     * header, so it is one component over one list (`services/dashboard/periods.js`).
     * The look is the dashboards' `.filter-chip`, which is where it started.
     *
     * `wrap` is the panel's variant: in a header the chips sit on one line at their
     * natural width, and in a 300px column they have to share the line evenly and fold
     * onto a second one rather than run off the edge.
     */
    import { t, tt } from '../../stores/i18nStore.js';
    import { DASHBOARD_PERIODS } from '../../services/dashboard/periods.js';

    let {
        /** The selected period, in days. `0` is everything. */
        value = 0,
        /** Which periods to offer; defaults to all five. */
        periods = DASHBOARD_PERIODS,
        wrap = false,
        ariaLabel = '',
        onchange,
    } = $props();
</script>

<div class="filter-chips" class:filter-chips-wrap={wrap} role="group" aria-label={ariaLabel || $t('dashboardPeriod')}>
    {#each periods as period (period.days)}
        <button
            type="button"
            class="filter-chip"
            class:active={value === period.days}
            aria-pressed={value === period.days}
            title={$tt(period.titleKey)}
            onclick={() => onchange?.(period.days)}>{$t(period.labelKey)}</button
        >
    {/each}
</div>
