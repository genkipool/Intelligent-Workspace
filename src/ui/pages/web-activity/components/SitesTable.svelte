<script>
    /**
     * [AI INSTRUCTION]
     * THE VISIT LOG — every site, what it cost, and what it is allowed.
     *
     * The limit, the schedule and the category are edited here, in the row, because
     * that is where the user decides they want them: the numbers that justify a limit
     * are on the same line as the box that sets it. The columns themselves come from
     * `siteColumns.js`; add one there rather than growing this file sideways.
     *
     * Edits are debounced and sent as a whole limit record, so a site with no rule yet
     * gets one created the moment a figure is typed into its row.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt, currentLang } from '../../../stores/i18nStore.js';
    import { fmtDateShort, fmtDur } from '../../../services/dashboard/format.js';
    import SelectField from '../../../components/common/SelectField.svelte';
    import { SITE_COLUMNS, sortRows } from './siteColumns.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let {
        sites = [],
        limits = {},
        settings = {},
        verdicts = {},
        prefs,
        onSort,
        onSaveLimit,
        onOpenLimitEditor,
        onIgnoreDomain,
    } = $props();

    /** The columns actually drawn, in the order they are declared. */
    const columns = $derived(SITE_COLUMNS.filter((column) => column.pinned || prefs.columns.includes(column.id)));
    const rows = $derived(sortRows(sites, prefs.sortBy, prefs.sortDir));

    const totals = $derived({
        seconds: sites.reduce((sum, site) => sum + site.seconds, 0),
        visits: sites.reduce((sum, site) => sum + site.visits, 0),
        sessions: sites.reduce((sum, site) => sum + site.sessions, 0),
    });

    const share = (seconds) => (totals.seconds > 0 ? Math.round((seconds / totals.seconds) * 100) : 0);

    const faviconFor = (domain) =>
        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + domain)}&size=16`;

    const limitOf = (domain) => WA.normalizeLimit(limits[domain] || {});
    const scheduleOf = (domain) => limitOf(domain).schedules?.[0] || null;

    async function setCategory(domain, category) {
        await onSaveLimit(domain, { ...limitOf(domain), category: category || null });
    }

    function headerSort(column) {
        if (!column.sortValue) return;
        onSort(column.id, prefs.sortBy === column.id && prefs.sortDir === 'desc' ? 'asc' : 'desc');
    }
</script>

{#snippet cell(column, row)}
    {#if column.id === 'site'}
        <span class="wa-site-cell" title={$tt('webActivityColSiteDesc')}>
            <img class="si-favicon" src={faviconFor(row.domain)} alt="" loading="lazy" />
            <span class="wa-site-name" title={row.domain}>{row.domain}</span>
        </span>
    {:else if column.id === 'category'}
        <SelectField
            compact
            value={limitOf(row.domain).category || ''}
            title={$tt('webActivityColCategoryDesc')}
            ariaLabel={$t('webActivityColCategory')}
            options={[
                { value: '', label: $t('webActivityCategory_' + row.category) },
                ...WA.CATEGORIES.map((id) => ({ value: id, label: $t('webActivityCategory_' + id) })),
            ]}
            onchange={(next) => setCategory(row.domain, next)}
        />
    {:else if column.id === 'visits'}
        <span title={$tt('webActivityColVisitsDesc')}>{row.visits}</span>
    {:else if column.id === 'time'}
        <span title={$tt('webActivityColTimeDesc')}>{fmtDur(row.seconds)}</span>
    {:else if column.id === 'share'}
        <span title={$tt('webActivityColShareDesc')}>{share(row.seconds)}%</span>
    {:else if column.id === 'perVisit'}
        <span title={$tt('webActivityColPerVisitDesc')}>{row.visits > 0 ? fmtDur(row.perVisit) : '--'}</span>
    {:else if column.id === 'sessions'}
        <span title={$tt('webActivityColSessionsDesc')}>{row.sessions}</span>
    {:else if column.id === 'perDay'}
        <span title={$tt('webActivityColPerDayDesc')}>{row.days > 0 ? fmtDur(row.perDay) : '--'}</span>
    {:else if column.id === 'activeDays'}
        <span title={$tt('webActivityColActiveDaysDesc')}>{row.days}</span>
    {:else if column.id === 'lastSeen'}
        <span title={$tt('webActivityColLastSeenDesc')}>
            {row.lastDay ? fmtDateShort(new Date(row.lastDay).getTime(), $currentLang) : '--'}
        </span>
    {:else if column.id === 'limit'}
        {@const lim = limitOf(row.domain)}
        {@const limitSec = lim.dailyLimitSeconds}
        {@const isAlways = lim.blockAlways}
        <div class="wa-cell-with-action" title={$tt('webActivityColLimitDesc')}>
            <span class="wa-cell-val">
                {#if isAlways}
                    <span class="wa-badge wa-badge-blocked" title={$tt('webActivityBlockAlways')}
                        >{$t('webActivityLimitAlways')}</span
                    >
                {:else if limitSec > 0}
                    <span>{fmtDur(limitSec)}</span>
                {:else}
                    <span class="wa-muted">{$t('webActivityNotConfigured')}</span>
                {/if}
            </span>
            <div class="wa-cell-actions">
                <button
                    class="wa-icon-btn wa-edit-btn"
                    type="button"
                    title={$tt('webActivityConfigureLimit')}
                    aria-label={$t('webActivityConfigureLimit')}
                    onclick={() => onOpenLimitEditor(row.domain)}
                >
                    <svg width="13" height="13" aria-hidden="true" focusable="false"><use href="#wa-edit"></use></svg>
                </button>
                {#if isAlways || limitSec > 0}
                    <button
                        class="wa-icon-btn wa-icon-btn-danger"
                        type="button"
                        title={$tt('webActivityRemoveLimit')}
                        aria-label={$t('webActivityRemoveLimit')}
                        onclick={() =>
                            onSaveLimit(row.domain, {
                                ...limitOf(row.domain),
                                dailyLimitSeconds: 0,
                                blockAlways: false,
                            })}
                    >
                        <svg width="12" height="12" aria-hidden="true" focusable="false"
                            ><use href="#wa-close"></use></svg
                        >
                    </button>
                {:else}
                    <span class="wa-btn-placeholder" aria-hidden="true"></span>
                {/if}
            </div>
        </div>
    {:else if column.id === 'schedule'}
        {@const sched = scheduleOf(row.domain)}
        <div class="wa-cell-with-action" title={$tt('webActivityColScheduleDesc')}>
            <span class="wa-cell-val">
                {#if sched?.start && sched?.end}
                    <span>{sched.start} → {sched.end}</span>
                {:else}
                    <span class="wa-muted">{$t('webActivityNotConfigured')}</span>
                {/if}
            </span>
            <div class="wa-cell-actions">
                <button
                    class="wa-icon-btn wa-edit-btn"
                    type="button"
                    title={$tt('webActivityConfigureLimit')}
                    aria-label={$t('webActivityConfigureLimit')}
                    onclick={() => onOpenLimitEditor(row.domain)}
                >
                    <svg width="13" height="13" aria-hidden="true" focusable="false"><use href="#wa-edit"></use></svg>
                </button>
                {#if sched?.start && sched?.end}
                    <button
                        class="wa-icon-btn wa-icon-btn-danger"
                        type="button"
                        title={$tt('webActivityRemoveSchedule')}
                        aria-label={$t('webActivityRemoveSchedule')}
                        onclick={() => onSaveLimit(row.domain, { ...limitOf(row.domain), schedules: [] })}
                    >
                        <svg width="12" height="12" aria-hidden="true" focusable="false"
                            ><use href="#wa-close"></use></svg
                        >
                    </button>
                {:else}
                    <span class="wa-btn-placeholder" aria-hidden="true"></span>
                {/if}
            </div>
        </div>
    {:else if column.id === 'state'}
        {@const verdict = verdicts[row.domain]}
        {#if verdict?.blocked}
            <span class="wa-badge wa-badge-blocked" title={$tt('webActivityStateBlocked_' + verdict.reason)}>
                {$t('webActivityStateBlocked_' + verdict.reason)}
            </span>
        {:else if verdict?.limitSeconds > 0}
            <span
                class="eff-pct"
                title={$tt('webActivityStateQuotaTitle', [
                    String(verdict.percent),
                    fmtDur(verdict.usedSeconds),
                    fmtDur(verdict.limitSeconds),
                ])}
            >
                {verdict.percent}%
            </span>
        {:else if verdict?.configured}
            <span class="wa-badge" title={$tt('webActivityStateWatchedTitle')}>
                {$t('webActivityStateWatched')}
            </span>
        {:else}
            <span class="wa-muted" title={$tt('webActivityStateNoLimitTitle')}>--</span>
        {/if}
    {:else if column.id === 'record' || column.id === 'actions'}
        {@const isIgnored = (settings?.ignoredDomains || []).includes(row.domain)}
        <span class="wa-row-actions" title={$tt('webActivityColRecordDesc')}>
            <button
                class="wa-icon-btn wa-icon-btn-danger"
                class:is-ignored={isIgnored}
                type="button"
                title={$tt(isIgnored ? 'webActivityUnignoreDomainBtn' : 'webActivityIgnoreDomainBtn')}
                aria-label={$t(isIgnored ? 'webActivityUnignoreDomainBtn' : 'webActivityIgnoreDomainBtn')}
                onclick={() => onIgnoreDomain(row.domain)}
            >
                <svg width="13" height="13" aria-hidden="true" focusable="false"><use href="#wa-close"></use></svg>
            </button>
        </span>
    {/if}
{/snippet}

<div class="table-scroll">
    <table class="data-table wa-log-table">
        <thead>
            <tr>
                {#each columns as column (column.id)}
                    <th
                        class:is-sortable={!!column.sortValue}
                        style:text-align={column.align || 'center'}
                        title={$tt(column.descKey)}
                    >
                        {#if column.sortValue}
                            <button
                                type="button"
                                class="wa-sort-btn"
                                aria-sort={prefs.sortBy === column.id
                                    ? prefs.sortDir === 'asc'
                                        ? 'ascending'
                                        : 'descending'
                                    : 'none'}
                                title={$tt(column.descKey)}
                                onclick={() => headerSort(column)}
                            >
                                <span>{$t(column.labelKey)}</span>
                                <span class="wa-sort-mark" class:active={prefs.sortBy === column.id}>
                                    {prefs.sortBy === column.id ? (prefs.sortDir === 'asc' ? '▲' : '▼') : '↕'}
                                </span>
                            </button>
                        {:else}
                            {$t(column.labelKey)}
                        {/if}
                    </th>
                {/each}
            </tr>
        </thead>
        <tbody>
            {#each rows as row (row.domain)}
                <tr class:is-blocked={verdicts[row.domain]?.blocked}>
                    {#each columns as column (column.id)}
                        <td
                            class:td-mono={column.align !== 'left'}
                            class:td-name={column.id === 'site'}
                            style:text-align={column.align || 'center'}
                        >
                            {@render cell(column, row)}
                        </td>
                    {/each}
                </tr>
            {/each}
        </tbody>
        {#if rows.length}
            <tfoot>
                <tr>
                    {#each columns as column (column.id)}
                        <td class="td-mono" style:text-align={column.align || 'center'}>
                            {#if column.id === 'site'}
                                <span title={$tt('webActivityTotalSitesHint', [String(rows.length)])}>
                                    {$t('webActivityTotalRow', [String(rows.length)])}
                                </span>
                            {:else if column.id === 'visits'}
                                <span title={$tt('webActivityTotalVisitsHint', [String(totals.visits)])}>
                                    {totals.visits}
                                </span>
                            {:else if column.id === 'time'}
                                <span title={$tt('webActivityTotalTimeHint', [fmtDur(totals.seconds)])}>
                                    {fmtDur(totals.seconds)}
                                </span>
                            {:else if column.id === 'share'}
                                <span title={$tt('webActivityTotalShareHint')}> 100% </span>
                            {:else if column.id === 'sessions'}
                                <span title={$tt('webActivityTotalSessionsHint', [String(totals.sessions)])}>
                                    {totals.sessions}
                                </span>
                            {:else if column.id === 'perVisit'}
                                <span
                                    title={$tt('webActivityTotalAvgVisitHint', [
                                        totals.visits > 0 ? fmtDur(totals.seconds / totals.visits) : '--',
                                    ])}
                                >
                                    {totals.visits > 0 ? fmtDur(totals.seconds / totals.visits) : '--'}
                                </span>
                            {/if}
                        </td>
                    {/each}
                </tr>
            </tfoot>
        {/if}
    </table>
    {#if !rows.length}
        <div class="no-data-msg">{$t('webActivityNoSites')}</div>
    {/if}
</div>
