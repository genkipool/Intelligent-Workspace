<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="activity-row" data-sort-id="activity-row" style="display: none">
    <div class="section-title" title={$tt('titleActivity52')}>
        <span
            class="sort-grip"
            data-sort-handle
            role="button"
            tabindex="-1"
            aria-hidden="true"
            title={$tt('dashboardDragSection')}
            aria-label={$t('dashboardDragSection')}
        ></span>
        <span class="section-title-text">{$t('dashboardActivity52') || 'Daily activity - last 52 weeks'}</span>
    </div>
    <div class="chart-card animate-in delay-1">
        <div class="chart-card-header">
            <div class="chart-card-title" title={$tt('titleHeatmap')}>
                {$t('dashboardHeatmapTitle') || 'Session heatmap of sessions'}
            </div>
            <div class="chart-card-meta" id="heatmap-meta"></div>
        </div>
        <div>
            <div class="heatmap-container">
                <div class="heatmap-days">
                    <div class="heatmap-months-spacer"></div>
                    <div class="heatmap-day-label">{$t('dashboardMonday') || 'Mon'}</div>
                    <div class="heatmap-day-label"></div>
                    <div class="heatmap-day-label">{$t('dashboardWednesday') || 'Wed'}</div>
                    <div class="heatmap-day-label"></div>
                    <div class="heatmap-day-label">{$t('dashboardFriday') || 'Fri'}</div>
                    <div class="heatmap-day-label"></div>
                    <div class="heatmap-day-label">{$t('dashboardSunday') || 'Sun'}</div>
                </div>
                <div class="heatmap-wrap">
                    <div class="heatmap-months" id="heatmap-months"></div>
                    <div class="heatmap-grid" id="heatmap-grid"></div>
                </div>
            </div>
            <div class="legend" style="margin-top:12px">
                <div class="legend-item">
                    <div
                        class="legend-dot"
                        style="background:color-mix(in srgb,var(--bg-panel-color) 40%,var(--bg-color))"
                    ></div>
                    <span>{$t('dashboardLegendNone') || 'No activity'}</span>
                </div>
                <div class="legend-item">
                    <div
                        class="legend-dot"
                        style="background:color-mix(in srgb,var(--interactive-color) 20%,var(--bg-color))"
                    ></div>
                    <span>1-2</span>
                </div>
                <div class="legend-item">
                    <div
                        class="legend-dot"
                        style="background:color-mix(in srgb,var(--interactive-color) 42%,var(--bg-color))"
                    ></div>
                    <span>3-5</span>
                </div>
                <div class="legend-item">
                    <div
                        class="legend-dot"
                        style="background:color-mix(in srgb,var(--interactive-color) 68%,var(--bg-color))"
                    ></div>
                    <span>6-9</span>
                </div>
                <div class="legend-item">
                    <div class="legend-dot" style="background:var(--interactive-color)"></div>
                    <span>10+</span>
                </div>
                <div class="legend-item" style="margin-left:6px">
                    <div
                        class="legend-dot"
                        style="box-shadow:inset 0 0 0 1.5px var(--interactive-color);background:color-mix(in srgb,var(--interactive-color) 10%,var(--bg-color))"
                    ></div>
                    <span>{$t('dashboardToday') || 'today'}</span>
                </div>
            </div>
        </div>
    </div>
</section>
