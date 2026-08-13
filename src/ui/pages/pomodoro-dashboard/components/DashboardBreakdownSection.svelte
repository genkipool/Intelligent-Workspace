<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<section id="bottom-row" style="display: none">
    <div class="section-title" title={$tt('titleBreakdownSection')}>
        {$t('dashboardSessionBreakdown') || 'Session breakdown'}
    </div>
    <div class="chart-grid-2">
        <div class="chart-card animate-in delay-4">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleProjectTable')}>
                    {$t('dashboardProjectSummary') || 'Project summary'}
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

        <div class="chart-card animate-in delay-4">
            <div class="chart-card-header">
                <div class="chart-card-title" title={$tt('titleTimeline')}>
                    {$t('dashboardRecentSessions') || 'Recent sessions'}
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
