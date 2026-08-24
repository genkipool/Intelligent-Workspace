<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="streak-section" data-sort-id="streak-section" style="display: none">
    <div class="section-title" title={$tt('titleStreaksSection')}>
        <span
            class="sort-grip"
            data-sort-handle
            role="button"
            tabindex="-1"
            aria-hidden="true"
            title={$tt('dashboardDragSection')}
            aria-label={$t('dashboardDragSection')}
        ></span>
        <span class="section-title-text">{$t('dashboardStreaksSection') || 'Streaks and patterns'}</span>
    </div>
    <div class="chart-grid-2">
        <div class="chart-card animate-in delay-1" data-sort-id="streaks">
            <div class="chart-card-header">
                <div class="chart-card-title">
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardStreakActivity') || 'Activity streak'}</span>
                </div>
                <div class="chart-card-meta">{$t('dashboardConsecutiveDays') || 'consecutive days'}</div>
            </div>
            <div class="streak-grid">
                <div class="streak-item">
                    <div class="streak-icon">🔥</div>
                    <div class="streak-value" id="streak-current">-</div>
                    <div class="streak-label" title={$tt('titleCurrentStreak')}>
                        {$t('dashboardCurrentStreak') || 'Current streak'}
                    </div>
                </div>
                <div class="streak-item">
                    <div class="streak-icon">🏆</div>
                    <div class="streak-value" id="streak-max">-</div>
                    <div class="streak-label" title={$tt('titleBestStreak')}>
                        {$t('dashboardBestStreak') || 'Best streak'}
                    </div>
                </div>
                <div class="streak-item">
                    <div class="streak-icon">⭐</div>
                    <div class="streak-value" id="streak-best-val">-</div>
                    <div class="streak-label">
                        <span>{$t('dashboardBestDay') || 'Best day'}</span>
                        - <span id="streak-best-date" style="color:var(--interactive-color)"></span>
                    </div>
                </div>
            </div>
        </div>

        <div class="chart-card animate-in delay-1" data-sort-id="hours">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleHourDistrib')}>
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardHourDistrib') || 'Hourly distribution'}</span>
                </div>
                <div class="chart-card-meta">{$t('dashboardAccFocus') || 'accumulated total focus'}</div>
            </div>
            <div id="hour-grid" class="hour-bar-grid" style="height:88px"></div>
        </div>
    </div>
</section>
