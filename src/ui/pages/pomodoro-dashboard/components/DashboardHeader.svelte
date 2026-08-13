<script>
    import { t, tt } from '../../../stores/i18nStore.js';
</script>

<header class="app-header">
    <!-- Brand (matches sidebar width) -->
    <div class="header-brand">
        <div class="brand-icon">
            <svg
                width="18"
                height="18"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                xml:space="preserve"
                fill="currentColor"
                id="open-pomodoro-btn-svg"
                aria-hidden="true"
                focusable="false"
            >
                <path
                    d="M360 80c4.8-12.8 8-27.2 8-44.8 0-4.8-1.6-4.8-4.8-8s-8-4.8-12.8-4.8c-19.2 1.6-40 9.6-60.8 24-6.4-11.2-12.8-22.4-22.4-33.6C264 9.6 259.2 8 256 8c-4.8 0-9.6 1.6-11.2 6.4-9.6 11.2-17.6 20.8-24 33.6q-26.4-21.6-57.6-24c-4.8 0-9.6 1.6-12.8 4.8S144 35.2 144 40c0 16 1.6 28.8 6.4 40C59.2 104 0 176 0 260.8 0 376 108.8 504 256 504s256-128 256-243.2c0-88-59.2-156.8-152-180.8m-65.6 8c1.6 0 1.6-1.6 1.6-3.2 12.8-11.2 24-19.2 36.8-24-4.8 19.2-19.2 48-57.6 56C280 105.6 288 96 294.4 88M256 49.6c4.8 6.4 8 12.8 9.6 20.8-11.2 12.8-19.2 28.8-25.6 48-1.6 0-3.2-1.6-4.8-1.6 1.6-32 8-51.2 20.8-67.2m-48 28.8c-1.6 6.4-3.2 14.4-4.8 22.4-11.2-8-20.8-20.8-25.6-40 11.2 3.2 20.8 9.6 30.4 17.6M256 472C128 472 32 360 32 260.8c0-73.6 52.8-132.8 134.4-152 12.8 16 27.2 25.6 43.2 32 1.6 0 1.6 0 3.2 1.6 12.8 4.8 27.2 8 36.8 9.6h1.6c6.4 0 11.2-3.2 14.4-8 24-3.2 54.4-12.8 76.8-35.2 84.8 17.6 139.2 76.8 139.2 152C480 360 384 472 256 472"
                >
                </path>
            </svg>
        </div>
        <div>
            <div class="brand-title">{$t('pomodoroTitle') || 'Pomodoro'}</div>
            <div class="brand-sub">{$t('dashboardDashboard') || 'Dashboard'}</div>
        </div>
    </div>

    <!-- Period & tag filters -->
    <div class="header-filters">
        <span class="filter-label">{$t('dashboardPeriod') || 'Period'}</span>
        <div style="display:flex;gap:5px;align-items:center" id="period-filters">
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
