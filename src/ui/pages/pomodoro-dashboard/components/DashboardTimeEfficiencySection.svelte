<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="charts-row2" data-sort-id="charts-row2" style="display: none">
    <div class="section-title" title={$tt('titleTimeEff')}>
        <span
            class="sort-grip"
            data-sort-handle
            role="button"
            tabindex="-1"
            aria-hidden="true"
            title={$tt('dashboardDragSection')}
            aria-label={$t('dashboardDragSection')}
        ></span>
        <span class="section-title-text">{$t('dashboardTimeEff') || 'Time and efficiency'}</span>
    </div>
    <div class="chart-grid-3">
        <div class="chart-card animate-in delay-2" data-sort-id="focus-break" style="grid-column:span 2">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleFocusBreakChart')}>
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardFocusBreakTitle') || 'Daily focus and break'}</span>
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

        <div class="chart-card animate-in delay-2" data-sort-id="weekday">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleWeekdayChart')}>
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardFocusPerDay') || 'Focus by day'}</span>
                </div>
                <div class="chart-card-meta">{$t('dashboardWeekAvg') || 'weekly average'}</div>
            </div>
            <div class="chart-wrap" style="height:200px">
                <canvas id="weekday-chart"></canvas>
            </div>
        </div>
    </div>

    <div class="section-gap">
        <div class="chart-card animate-in delay-2" data-sort-id="efficiency">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleEffChart')}>
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardEffPerSess') || 'Efficiency per session'}</span>
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
