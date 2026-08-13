<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="charts-row2" style="display: none">
    <div class="section-title" title={$tt('titleTimeEff')}>
        {$t('dashboardTimeEff') || 'Time and efficiency'}
    </div>
    <div class="chart-grid-3">
        <div class="chart-card animate-in delay-2" style="grid-column:span 2">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleFocusBreakChart')}>
                    {$t('dashboardFocusBreakTitle') || 'Daily focus and break'}
                </div>
                <div class="legend">
                    <div class="legend-item">
                        <div class="legend-dot" style="background:var(--interactive-color)"></div>
                        <span>{$t('pomodoroWork') || 'Focus'}</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-dot" style="background:var(--text-color)"></div>
                        <span>{$t('dashboardBreak') || 'Break'}</span>
                    </div>
                </div>
            </div>
            <div class="chart-wrap" style="height:200px">
                <canvas id="focus-chart"></canvas>
            </div>
        </div>

        <div class="chart-card animate-in delay-2">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleWeekdayChart')}>
                    {$t('dashboardFocusPerDay') || 'Focus by day'}
                </div>
                <div class="chart-card-meta">{$t('dashboardWeekAvg') || 'weekly average'}</div>
            </div>
            <div class="chart-wrap" style="height:200px">
                <canvas id="weekday-chart"></canvas>
            </div>
        </div>
    </div>

    <div class="section-gap">
        <div class="chart-card animate-in delay-2">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleEffChart')}>
                    {$t('dashboardEffPerSess') || 'Efficiency per session'}
                </div>
                <div class="chart-card-meta">
                    {$t('dashboardEffMeta') || 'bar = value - line = 5-session moving average'}
                </div>
            </div>
            <div class="chart-wrap" style="height:140px">
                <canvas id="eff-chart"></canvas>
            </div>
        </div>
    </div>
</section>
