<script>
    /**
     * The dashboard's top bar: what it is, what slice of time is on screen, and the
     * actions that apply to the whole page.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt } from '../../../stores/i18nStore.js';
    import { PERIODS } from '../webActivityAnalytics.js';
    import SelectField from '../../../components/common/SelectField.svelte';
    import { categoryOptions } from '../categories.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let {
        period = 7,
        category = '',
        categories = [],
        customCategories = [],
        lastUpdated = 0,
        refreshing = false,
        onPeriodChange,
        onCategoryChange,
        onExport,
        onImport,
        onRefresh,
    } = $props();

    let fileInput = $state(null);

    /**
     * The built-in buckets, plus any the sites on screen are filed under. A category
     * the user deleted can still be on a site, and leaving it out of the filter would
     * make those sites unreachable from here.
     */
    const builtInIds = $derived([
        ...new Set([...(WA?.CATEGORIES || []), ...(categories || []).filter((id) => !WA.isCustomCategory(id))]),
    ]);

    const categoryChoices = $derived(
        categoryOptions({
            custom: customCategories,
            t: (key) => $t(key),
            ids: builtInIds,
            lead: [{ value: '', label: $t('webActivityAllCategories') }],
        }),
    );

    function handleFile(event) {
        const [file] = event.target.files || [];
        if (file) onImport(file);
        event.target.value = '';
    }
</script>

<header class="app-header">
    <div class="header-brand">
        <div class="brand-icon">
            <svg width="18" height="18" aria-hidden="true" focusable="false"><use href="#wa-activity"></use></svg>
        </div>
        <div>
            <div class="brand-title">{$t('webActivityTitle')}</div>
            <div class="brand-sub">{$t('dashboardDashboard')}</div>
        </div>
    </div>

    <div class="header-filters">
        <span class="filter-label">{$t('dashboardPeriod')}</span>
        <div class="filter-chips">
            {#each PERIODS as option (option.days)}
                <button
                    class="filter-chip"
                    class:active={period === option.days}
                    type="button"
                    title={$tt(option.titleKey)}
                    onclick={() => onPeriodChange(option.days)}>{$t(option.labelKey)}</button
                >
            {/each}
        </div>
        <span class="filter-sep"></span>
        <span class="filter-label">{$t('webActivityCategoryLabel')}</span>
        <SelectField
            value={category}
            ariaLabel={$t('webActivityCategoryLabel')}
            title={$tt('webActivityCategoryFilterTitle')}
            options={categoryChoices}
            onchange={onCategoryChange}
        />
    </div>

    <div class="header-actions">
        <div class="last-updated">
            {lastUpdated ? $t('webActivityUpdatedAt', [new Date(lastUpdated).toLocaleTimeString()]) : '-'}
        </div>
        <div class="header-actions-group">
            <button class="btn" type="button" title={$tt('webActivityExport')} onclick={onExport}>
                <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-export"></use></svg>
                <span>{$t('pomodoroExport')}</span>
            </button>
            <button class="btn" type="button" title={$tt('webActivityImport')} onclick={() => fileInput.click()}>
                <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-import"></use></svg>
                <span>{$t('pomodoroImport')}</span>
            </button>
            <input
                bind:this={fileInput}
                type="file"
                accept=".json"
                style="display:none"
                onchange={handleFile}
                aria-hidden="true"
                tabindex="-1"
            />
        </div>
        <div class="header-actions-refresh">
            <button
                class="btn btn-accent"
                class:spinning={refreshing}
                type="button"
                title={$tt('dashboardRefresh')}
                onclick={onRefresh}
            >
                <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-refresh"></use></svg>
                <span>{$t('dashboardRefresh')}</span>
            </button>
        </div>
    </div>
</header>
