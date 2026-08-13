<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="charts-row3" style="display: none">
    <div class="section-title" title={$tt('titleProjectSection')}>
        {$t('dashboardProjectAnalysis') || 'Project analysis'}
    </div>
    <div class="chart-grid-3">
        <div class="chart-card animate-in delay-3">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleProjectBar')}>
                    {$t('dashboardFocusPerProject') || 'Focus by project'}
                </div>
                <div class="chart-card-meta">{$t('dashboardTop12') || 'total hours - top 12'}</div>
            </div>
            <div class="chart-wrap" style="height:250px">
                <canvas id="project-bar-chart"></canvas>
            </div>
        </div>

        <div class="chart-card animate-in delay-3">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleDonut')}>
                    {$t('dashboardTimeDistrib') || 'Time distribution'}
                </div>
            </div>
            <div class="chart-wrap" style="height:170px">
                <canvas id="donut-chart"></canvas>
            </div>
            <div id="donut-stats"></div>
        </div>

        <div class="chart-card animate-in delay-3">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleCyclesChart')}>
                    {$t('dashboardCyclesPerProject') || 'Pomodoros by project'}
                </div>
                <div class="chart-card-meta">{$t('dashboardCompleted') || 'completed'}</div>
            </div>
            <div class="chart-wrap" style="height:250px">
                <canvas id="cycles-chart"></canvas>
            </div>
        </div>
    </div>
</section>
