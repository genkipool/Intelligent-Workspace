<script>
    import { t, tt } from '../../../stores/i18nStore.js';
    import DashboardBrandSwitcher from '../../../components/dashboard/DashboardBrandSwitcher.svelte';
</script>

<header class="app-header">
    <!-- Brand (matches sidebar width), and the way over to the other dashboard. -->
    <DashboardBrandSwitcher
        current="pomodoro"
        pages={[
            { id: 'pomodoro', title: $t('pomodoroTitle') || 'Pomodoro', sub: $t('dashboardDashboard') || 'Dashboard' },
            {
                id: 'webActivity',
                title: $t('webActivityTitle') || 'Web activity',
                sub: $t('dashboardDashboard') || 'Dashboard',
            },
        ]}
        title={$tt('dashboardSwitchDashboard')}
        switchLabel={$t('dashboardSwitchDashboard')}
    />

    <!-- Period & tag filters -->
    <div class="header-filters">
        <span class="filter-label">{$t('dashboardPeriod') || 'Period'}</span>
        <div class="filter-chips" id="period-filters">
            <button class="filter-chip" type="button" data-period="1" title={$tt('titleFilterToday')}
                >{$t('dashboardToday') || 'Today'}</button
            >
            <button class="filter-chip" type="button" data-period="7" title={$tt('titleFilter7Days')}
                >{$t('dashboard7Days') || '7 days'}</button
            >
            <button class="filter-chip" type="button" data-period="30" title={$tt('titleFilter30Days')}
                >{$t('dashboard30Days') || '30 days'}</button
            >
            <button class="filter-chip" type="button" data-period="90" title={$tt('titleFilter3Months')}
                >{$t('dashboard3Months') || '3 months'}</button
            >
            <button class="filter-chip active" type="button" data-period="0" title={$tt('titleFilterAll')}
                >{$t('dashboardAllTime') || 'All time'}</button
            >
        </div>
        <span class="filter-sep"></span>
        <span class="filter-label">{$t('pomodoroProjectTag') || 'Tag'}</span>
        <select class="tag-select" id="tag-filter" title={$tt('titleTagFilter')}>
            <button type="button">
                <selectedcontent></selectedcontent>
                <svg
                    class="picker-icon"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>
            <option value="">{$t('dashboardAllTags') || 'All tags'}</option>
        </select>
    </div>

    <!-- Actions -->
    <div class="header-actions">
        <div class="last-updated" id="last-updated">-</div>
        <div class="header-actions-group">
            <button class="btn" type="button" id="export-btn" title={$tt('dashboardExportJSON')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path
                        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
                <span>{$t('pomodoroExport') || 'Export'}</span>
            </button>

            <button class="btn" type="button" id="import-btn" title={$tt('dashboardImportJSON')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path
                        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 10l-5-5-5 5M12 5v12"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
                <span>{$t('pomodoroImport') || 'Import'}</span>
            </button>
            <input type="file" id="import-input" accept=".json" style="display:none" />
        </div>
        <div class="header-actions-refresh">
            <button class="btn btn-accent" type="button" id="refresh-btn" title={$tt('dashboardRefresh')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path
                        d="M1 4v6h6M23 20v-6h-6"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                    <path
                        d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
                <span>{$t('dashboardRefresh') || 'Refresh'}</span>
            </button>
        </div>
    </div>
</header>
