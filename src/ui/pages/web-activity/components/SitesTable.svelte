<script>
    /**
     * [AI INSTRUCTION]
     * THE VISIT LOG — every site, what it cost, and what it is allowed.
     *
     * It is laid out to be read, not scrolled: `table-layout: fixed` with a weight per
     * column (see `siteColumns.js`) so every column fits the width it is given, and a
     * cap of `MAX_TABLE_ROWS` rows so the page ends. The footer counts every site, not
     * just the ones drawn, and says so when the two differ.
     *
     * The category is edited in the row, because it is one choice from a list. The
     * limit and the schedule are not: each opens its own dialog, since neither fits in
     * a cell and both are more than one field. The cell itself is the button — a
     * value plus a pencil, so the whole width is a target rather than a 13px icon.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt, currentLang } from '../../../stores/i18nStore.js';
    import { fmtDateShort, fmtDur, fmtHm } from '../../../services/dashboard/format.js';
    import SelectField from '../../../components/common/SelectField.svelte';
    import RuleControls from './RuleControls.svelte';
    import { categoryOptions } from '../categories.js';
    import { MAX_TABLE_ROWS, SITE_COLUMNS, columnWidths, sortRows } from './siteColumns.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    /** Which half of the rule a set of controls is acting on, for its tooltips. */
    const LIMIT_KEYS = {
        enable: 'webActivityEnableLimit',
        disable: 'webActivityDisableLimit',
        clear: 'webActivityRemoveLimit',
    };
    const SCHEDULE_KEYS = {
        enable: 'webActivityEnableSchedule',
        disable: 'webActivityDisableSchedule',
        clear: 'webActivityRemoveSchedule',
    };

    let {
        sites = [],
        limits = {},
        settings = {},
        verdicts = {},
        customCategories = [],
        prefs,
        onSort,
        onSaveLimit,
        onOpenLimitEditor,
        onOpenScheduleEditor,
        onIgnoreDomain,
    } = $props();

    /** The columns actually drawn, in the order they are declared. */
    const columns = $derived(SITE_COLUMNS.filter((column) => column.pinned || prefs.columns.includes(column.id)));
    const widths = $derived(columnWidths(columns));
    const sorted = $derived(sortRows(sites, prefs.sortBy, prefs.sortDir));
    const rows = $derived(sorted.slice(0, MAX_TABLE_ROWS));
    const hiddenRows = $derived(sorted.length - rows.length);

    // The totals are of every site in the period, not of the hundred on screen: a
    // footer that only added up what fits would quietly contradict the summary above.
    const totals = $derived({
        seconds: sites.reduce((sum, site) => sum + site.seconds, 0),
        visits: sites.reduce((sum, site) => sum + site.visits, 0),
        sessions: sites.reduce((sum, site) => sum + site.sessions, 0),
    });

    const share = (seconds) => (totals.seconds > 0 ? Math.round((seconds / totals.seconds) * 100) : 0);

    const faviconFor = (domain) =>
        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + domain)}&size=16`;

    const limitOf = (domain) => WA.normalizeLimit(limits[domain] || {});
    const scheduleOf = (domain) => limitOf(domain).schedules?.filter((s) => s.start && s.end) || [];

    /**
     * What the cell's tooltip says once there is something to say.
     *
     * A cell this narrow shows one figure — the daily allowance, or the first of three
     * windows — so hovering it has to give back the rest. Until now it repeated the
     * pencil's "configure this", which the pencil already says and which is not what
     * anybody hovers a value to find out.
     */
    const limitTitle = (limit) => {
        const parts = [];
        if (limit.dailyLimitSeconds > 0) parts.push(`${$t('webActivityColDaily')}: ${fmtHm(limit.dailyLimitSeconds)}`);
        if (limit.weeklyLimitSeconds > 0)
            parts.push(`${$t('webActivityColWeekly')}: ${fmtHm(limit.weeklyLimitSeconds)}`);
        return parts.join(' · ');
    };

    const scheduleTitle = (limit) => {
        if (limit.blockAlways) return `${$t('webActivityColSchedule')}: ${$t('webActivityLimitAlways')}`;
        const windows = (limit.schedules || []).filter((entry) => entry.start && entry.end);
        if (!windows.length) return '';
        return `${$t('webActivityColSchedule')}: ${windows.map((w) => `${w.start}-${w.end}`).join(', ')}`;
    };

    const categoryChoices = $derived(
        categoryOptions({
            custom: customCategories,
            t: (key) => $t(key),
        }),
    );

    async function setCategory(domain, category) {
        await onSaveLimit(domain, { ...limitOf(domain), category: category || null });
    }

    function headerSort(column) {
        if (!column.sortValue) return;
        onSort(column.id, prefs.sortBy === column.id && prefs.sortDir === 'desc' ? 'asc' : 'desc');
    }
</script>

<!--
    A limit or a schedule cell: the value and the three things that can be done to it.
    Nothing set reads as a dash rather than "not configured" — the column is narrow by
    design, and a sentence that ends in an ellipsis looks like a value that was cut
    off rather than one that was never there. The words are in the tooltip.
-->
{#snippet ruleCell(label, isSet, enabled, editTitle, valueTitle, keys, onOpen, onToggle, onClear)}
    <div class="wa-cell-with-action">
        <span class="wa-cell-val" class:wa-muted={!isSet} class:is-paused={isSet && !enabled} title={valueTitle}>
            {isSet ? label : '—'}
        </span>
        <RuleControls
            {isSet}
            {enabled}
            {editTitle}
            enableKey={keys.enable}
            disableKey={keys.disable}
            clearKey={keys.clear}
            onEdit={onOpen}
            {onToggle}
            {onClear}
        />
    </div>
{/snippet}

{#snippet cell(column, row)}
    {#if column.id === 'site'}
        <span class="wa-site-cell" title={row.domain}>
            <img class="si-favicon" src={faviconFor(row.domain)} alt="" loading="lazy" />
            <span class="wa-site-name">{row.domain}</span>
        </span>
    {:else if column.id === 'category'}
        <!--
            The value is the category the site is actually filed under, whether that
            was detected or chosen. There is no "automatic" row: a picker whose
            selected item says "Auto" is hiding the very thing the column is for, and
            a site always belongs to exactly one category — the question is only
            whether the extension worked it out or the user corrected it.
        -->
        <SelectField
            compact
            wide
            value={row.category}
            title={$tt('webActivityColCategoryDesc')}
            ariaLabel={$t('webActivityColCategory')}
            options={categoryChoices}
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
        {@render ruleCell(
            fmtHm(lim.dailyLimitSeconds),
            lim.dailyLimitSeconds > 0,
            lim.dailyLimitEnabled,
            $tt('webActivityConfigureLimit'),
            limitTitle(lim) || $tt('webActivityConfigureLimit'),
            LIMIT_KEYS,
            () => onOpenLimitEditor(row.domain, 'daily'),
            (next) => onSaveLimit(row.domain, { ...lim, dailyLimitEnabled: next }),
            () => onSaveLimit(row.domain, { ...lim, dailyLimitSeconds: 0 }),
        )}
    {:else if column.id === 'weekly'}
        {@const lim = limitOf(row.domain)}
        {@render ruleCell(
            fmtHm(lim.weeklyLimitSeconds),
            lim.weeklyLimitSeconds > 0,
            lim.weeklyLimitEnabled,
            $tt('webActivityConfigureLimit'),
            limitTitle(lim) || $tt('webActivityConfigureLimit'),
            LIMIT_KEYS,
            () => onOpenLimitEditor(row.domain, 'weekly'),
            (next) => onSaveLimit(row.domain, { ...lim, weeklyLimitEnabled: next }),
            () => onSaveLimit(row.domain, { ...lim, weeklyLimitSeconds: 0 }),
        )}
    {:else if column.id === 'schedule'}
        {@const lim = limitOf(row.domain)}
        {@const windows = scheduleOf(row.domain)}
        {@render ruleCell(
            lim.blockAlways
                ? $t('webActivityLimitAlways')
                : windows.length === 1
                  ? `${windows[0].start}-${windows[0].end}`
                  : $t('webActivityWindowCount', [String(windows.length)]),
            lim.blockAlways || windows.length > 0,
            lim.scheduleEnabled,
            $tt('webActivityConfigureSchedule'),
            scheduleTitle(lim) || $tt('webActivityConfigureSchedule'),
            SCHEDULE_KEYS,
            () => onOpenScheduleEditor(row.domain),
            (next) => onSaveLimit(row.domain, { ...lim, scheduleEnabled: next }),
            () => onSaveLimit(row.domain, { ...lim, schedules: [], blockAlways: false }),
        )}
    {:else if column.id === 'state'}
        {@const verdict = verdicts[row.domain]}
        {#if verdict?.blocked}
            <span class="wa-badge wa-badge-blocked" title={$tt('webActivityStateBlocked_' + verdict.reason)}>
                {$t('webActivityStateBlocked_' + verdict.reason)}
            </span>
        {:else if verdict?.limitSeconds > 0 || verdict?.weekLimitSeconds > 0}
            {@const percent = Math.max(verdict.percent || 0, verdict.weekPercent || 0)}
            <span
                class="eff-pct"
                title={$tt('webActivityStateQuotaTitle', [
                    String(percent),
                    fmtDur(verdict.limitSeconds > 0 ? verdict.usedSeconds : verdict.weekUsedSeconds),
                    fmtDur(verdict.limitSeconds > 0 ? verdict.limitSeconds : verdict.weekLimitSeconds),
                ])}
            >
                {percent}%
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
        <span class="wa-row-actions">
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

<div class="wa-table-frame">
    <table class="data-table wa-log-table">
        <colgroup>
            {#each columns as column, index (column.id)}
                <col data-col={column.id} style:width={widths[index]} />
            {/each}
        </colgroup>
        <thead>
            <tr>
                {#each columns as column (column.id)}
                    <th
                        data-col={column.id}
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
                                <span class="wa-sort-label">{$t(column.labelKey)}</span>
                                <span class="wa-sort-mark" class:active={prefs.sortBy === column.id}>
                                    {prefs.sortBy === column.id ? (prefs.sortDir === 'asc' ? '▲' : '▼') : '↕'}
                                </span>
                            </button>
                        {:else}
                            <span class="wa-sort-label">{$t(column.labelKey)}</span>
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
                            data-col={column.id}
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
                        <td class="td-mono" data-col={column.id} style:text-align={column.align || 'center'}>
                            {#if column.id === 'site'}
                                <span title={$tt('webActivityTotalSitesHint', [String(sites.length)])}>
                                    {$t('webActivityTotalRow', [String(sites.length)])}
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

    {#if hiddenRows > 0}
        <div class="wa-table-capped" title={$tt('webActivityTableCappedHint')}>
            {$t('webActivityTableCapped', [String(rows.length), String(sorted.length)])}
        </div>
    {/if}
    {#if !rows.length}
        <div class="no-data-msg">{$t('webActivityNoSites')}</div>
    {/if}
</div>
