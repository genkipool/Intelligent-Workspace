<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="bottom-row" data-sort-id="bottom-row" style="display: none">
    <div class="section-title" title={$tt('titleBreakdownSection')}>
        <span
            class="sort-grip"
            data-sort-handle
            role="button"
            tabindex="-1"
            aria-hidden="true"
            title={$tt('dashboardDragSection')}
            aria-label={$t('dashboardDragSection')}
        ></span>
        <span class="section-title-text">{$t('dashboardSessionBreakdown') || 'Session breakdown'}</span>
    </div>
    <div class="chart-grid-2">
        <div class="chart-card animate-in delay-4" data-sort-id="project-table">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleProjectTable')}>
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardProjectSummary') || 'Project summary'}</span>
                </div>
                <div class="chart-card-meta" id="project-count"></div>
            </div>
            <div style="overflow-x:auto">
                <table class="data-table" id="project-table">
                    <thead>
                        <tr>
                            <th>{$t('dashboardHdrProject') || 'Project'}</th>
                            <th>{$t('dashboardHdrSessions') || 'Sessions'}</th>
                            <th>{$t('dashboardHdrFocus') || 'Focus'}</th>
                            <th>{$t('dashboardHdrCycles') || 'Pomodoros'}</th>
                            <th>{$t('dashboardHdrInterruptions') || 'Interrup.'}</th>
                            <th>{$t('dashboardHdrEfficiency') || 'Efficiency'}</th>
                        </tr>
                    </thead>
                    <tbody id="project-table-body"></tbody>
                </table>
                <div class="no-data-msg" id="table-empty" style="display:none">
                    {$t('dashboardNoProjects') || 'No projects in the selected period'}
                </div>
            </div>
        </div>

        <div class="chart-card animate-in delay-4" data-sort-id="timeline">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleTimeline')}>
                    <span
                        class="sort-grip"
                        data-sort-handle
                        role="button"
                        tabindex="-1"
                        aria-hidden="true"
                        title={$tt('dashboardDragPanel')}
                        aria-label={$t('dashboardDragPanel')}
                    ></span>
                    <span>{$t('dashboardRecentSessions') || 'Recent sessions'}</span>
                </div>
                <div class="chart-card-meta" id="sessions-count"></div>
            </div>
            <div class="timeline" id="timeline"></div>
            <div class="no-data-msg" id="timeline-empty" style="display:none">
                {$t('dashboardNoSessions') || 'No sessions in the selected period'}
            </div>
        </div>
    </div>
</section>
