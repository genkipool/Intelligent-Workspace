<script>
    /**
     * The shell of the "what was browsed while the timer ran" row. Like every other
     * section on this dashboard it is markup only: `renderWebPhases()` in
     * `Dashboard.svelte` mounts the three cards into the grid below once it knows what
     * period is on screen.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="wa-phases-row" data-sort-id="wa-phases-row" style="display: none">
    <div class="section-title" title={$tt('dashboardWebPhases')}>
        <span
            class="sort-grip"
            data-sort-handle
            role="button"
            tabindex="-1"
            aria-hidden="true"
            title={$tt('dashboardDragSection')}
            aria-label={$t('dashboardDragSection')}
        ></span>
        <span class="section-title-text">{$t('dashboardWebPhases') || 'Browsing during the timer'}</span>
    </div>
    <div class="chart-grid-3-even" id="wa-phase-cards"></div>
</section>
