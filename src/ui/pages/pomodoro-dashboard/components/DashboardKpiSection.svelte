<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="kpi-section" style="display: none">
    <div class="section-title" title={$tt('titleSummarySection')}>
        {$t('dashboardSummary') || 'General summary'}
    </div>
    <div class="kpi-grid" id="kpi-grid"></div>
</section>
