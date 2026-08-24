<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="kpi-section" data-sort-id="kpi-section" style="display: none">
    <div class="section-title" title={$tt('titleSummarySection')}>
        <span
            class="sort-grip"
            data-sort-handle
            role="button"
            tabindex="-1"
            aria-hidden="true"
            title={$tt('dashboardDragSection')}
            aria-label={$t('dashboardDragSection')}
        ></span>
        <span class="section-title-text">{$t('dashboardSummary') || 'General summary'}</span>
    </div>
    <div class="kpi-grid" id="kpi-grid"></div>
</section>
