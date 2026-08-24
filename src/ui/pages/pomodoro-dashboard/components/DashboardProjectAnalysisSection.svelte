<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="charts-row3" data-sort-id="charts-row3" style="display: none">
    <div class="section-title" title={$tt('titleProjectSection')}>
        <span
            class="sort-grip"
            data-sort-handle
            role="button"
            tabindex="-1"
            aria-hidden="true"
            title={$tt('dashboardDragSection')}
            aria-label={$t('dashboardDragSection')}
        ></span>
        <span class="section-title-text">{$t('dashboardProjectAnalysis') || 'Project analysis'}</span>
    </div>
    <div class="chart-grid-3">
        <div class="chart-card animate-in delay-3" data-sort-id="project-bar">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleProjectBar')}>
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardFocusPerProject') || 'Focus by project'}</span>
                </div>
                <div class="chart-card-meta">{$t('dashboardTop12') || 'total hours - top 12'}</div>
            </div>
            <div class="chart-wrap" style="height:250px">
                <canvas id="project-bar-chart"></canvas>
            </div>
        </div>

        <div class="chart-card animate-in delay-3" data-sort-id="donut">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleDonut')}>
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardTimeDistrib') || 'Time distribution'}</span>
                </div>
            </div>
            <div class="chart-wrap" style="height:170px">
                <canvas id="donut-chart"></canvas>
            </div>
            <div id="donut-stats"></div>
        </div>

        <div class="chart-card animate-in delay-3" data-sort-id="cycles">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleCyclesChart')}>
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardCyclesPerProject') || 'Pomodoros by project'}</span>
                </div>
                <div class="chart-card-meta">{$t('dashboardCompleted') || 'completed'}</div>
            </div>
            <div class="chart-wrap" style="height:250px">
                <canvas id="cycles-chart"></canvas>
            </div>
        </div>
    </div>
</section>
