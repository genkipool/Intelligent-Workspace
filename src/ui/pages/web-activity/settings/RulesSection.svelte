<script>
    /**
     * [AI INSTRUCTION]
     * EVERY SITE THAT HAS A RULE, IN ONE PLACE.
     *
     * The log on the dashboard only lists the sites visited in the period on screen,
     * so a rule on a site nobody has opened this week is invisible there — which is
     * exactly the rule most likely to have been forgotten. This is the complete list,
     * and the only place a rule can be deleted outright.
     *
     * It is the same table as the log, down to the classes: a fixed layout with a
     * weight per column so it never scrolls sideways, the same rule cells with their
     * pencil and cross, the same badges. Two lists of the same sites showing the same
     * two values in two different shapes is how a page stops looking designed.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
    import { fmtHm } from '../../../services/dashboard/format.js';
    import RuleControls from '../components/RuleControls.svelte';

    let {
        rows = [],
        /**
         * In the side panel the table is left out and only the "add" button stays.
         * Every rule it would list is already a card in the panel behind this dialog,
         * with the same three controls on it — printing them again a centimetre away is
         * two lists of the same thing, and the second one is the one nobody asked for.
         */
        compact = false,
        onEditLimit,
        onEditSchedule,
        onSaveLimit,
        onAdd,
    } = $props();

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

    /**
     * Only the sites that actually have something configured.
     *
     * A record can outlive both its halves — clearing an allowance and its hours
     * leaves the row behind with two dashes and nothing to say. This list is the
     * answer to "what have I set up", so a rule that sets nothing up is not in it.
     */
    const configured = $derived(
        rows.filter(
            (row) =>
                row.limit.dailyLimitSeconds > 0 ||
                row.limit.weeklyLimitSeconds > 0 ||
                row.limit.blockAlways ||
                row.limit.schedules.some((schedule) => schedule.start && schedule.end),
        ),
    );

    /** The same shape as `siteColumns.js`, kept here because these are not those columns. */
    const COLUMNS = [
        { id: 'site', labelKey: 'webActivityColSite', weight: 20, align: 'left' },
        { id: 'limit', labelKey: 'webActivityColDaily', weight: 20 },
        { id: 'weekly', labelKey: 'webActivityColWeekly', weight: 20 },
        { id: 'schedule', labelKey: 'webActivityColSchedule', weight: 24 },
        // "fuera de horario" is sixteen letters of small caps; twelve was not enough
        // for it and the badge came out cut in half.
        { id: 'state', labelKey: 'webActivityColState', weight: 16 },
    ];
    const total = COLUMNS.reduce((sum, column) => sum + column.weight, 0);
    const widths = COLUMNS.map((column) => ((column.weight / total) * 100).toFixed(3) + '%');

    const faviconFor = (domain) =>
        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + domain)}&size=16`;

    /** Whether the clock half of the rule says anything at all. */
    const hasSchedule = (limit) => limit.blockAlways || limit.schedules.some((s) => s.start && s.end);

    /**
     * What a cell's tooltip says once there is something to say: the figures actually
     * configured, rather than the pencil's "configure this" repeated on the value.
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

    /** "09:00-18:00", "3 windows", "always" — whatever the clock half of the rule says. */
    function scheduleText(limit) {
        if (limit.blockAlways) return $t('webActivityLimitAlways');
        const windows = limit.schedules.filter((schedule) => schedule.start && schedule.end);
        if (!windows.length) return '—';
        if (windows.length === 1) return `${windows[0].start}-${windows[0].end}`;
        return $t('webActivityWindowCount', [String(windows.length)]);
    }
</script>

{#snippet ruleCell(label, isSet, enabled, editTitle, valueTitle, keys, onEdit, onToggle, onClear)}
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
            {onEdit}
            {onToggle}
            {onClear}
        />
    </div>
{/snippet}

<div class="set-block">
    <div class="set-block-head" class:set-block-head-center={compact}>
        <button class="set-add-btn" type="button" title={$tt('webActivityAddRule')} onclick={onAdd}>
            <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-plus"></use></svg>
            <span>{$t('webActivityAddRule')}</span>
        </button>
    </div>

    {#if compact}
        <!-- Nothing else: the rules are the cards in the panel behind this dialog. -->
    {:else if !configured.length}
        <p class="wa-empty-line">{$t('webActivityRulesEmpty')}</p>
    {:else}
        <div class="wa-table-frame wa-rules-frame">
            <table class="data-table wa-log-table">
                <colgroup>
                    {#each COLUMNS as column, index (column.id)}
                        <col data-col={column.id} style:width={widths[index]} />
                    {/each}
                </colgroup>
                <thead>
                    <tr>
                        {#each COLUMNS as column (column.id)}
                            <th data-col={column.id} style:text-align={column.align || 'center'}>
                                <span class="wa-sort-label">{$t(column.labelKey)}</span>
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    {#each configured as row (row.domain)}
                        <tr class:is-blocked={row.verdict.blocked} class:is-paused={!row.limit.enabled}>
                            <td data-col="site" class="td-name" style:text-align="left">
                                <span class="wa-site-cell" title={row.domain}>
                                    <img class="si-favicon" src={faviconFor(row.domain)} alt="" loading="lazy" />
                                    <span class="wa-site-name">{row.domain}</span>
                                </span>
                            </td>

                            <td data-col="limit" data-label={$t('webActivityColDaily')}>
                                {@render ruleCell(
                                    fmtHm(row.limit.dailyLimitSeconds),
                                    row.limit.dailyLimitSeconds > 0,
                                    row.limit.dailyLimitEnabled,
                                    $tt('webActivityConfigureLimit'),
                                    limitTitle(row.limit) || $tt('webActivityConfigureLimit'),
                                    LIMIT_KEYS,
                                    () => onEditLimit(row.domain, 'daily'),
                                    (next) => onSaveLimit(row.domain, { ...row.limit, dailyLimitEnabled: next }),
                                    () => onSaveLimit(row.domain, { ...row.limit, dailyLimitSeconds: 0 }),
                                )}
                            </td>

                            <td data-col="weekly" data-label={$t('webActivityColWeekly')}>
                                {@render ruleCell(
                                    fmtHm(row.limit.weeklyLimitSeconds),
                                    row.limit.weeklyLimitSeconds > 0,
                                    row.limit.weeklyLimitEnabled,
                                    $tt('webActivityConfigureLimit'),
                                    limitTitle(row.limit) || $tt('webActivityConfigureLimit'),
                                    LIMIT_KEYS,
                                    // The week column opens the dialog on its own tab: a
                                    // pencil that lands on the daily form is a pencil that
                                    // edited the wrong half of the rule.
                                    () => onEditLimit(row.domain, 'weekly'),
                                    (next) => onSaveLimit(row.domain, { ...row.limit, weeklyLimitEnabled: next }),
                                    () => onSaveLimit(row.domain, { ...row.limit, weeklyLimitSeconds: 0 }),
                                )}
                            </td>

                            <td data-col="schedule" data-label={$t('webActivityColSchedule')}>
                                {@render ruleCell(
                                    scheduleText(row.limit),
                                    hasSchedule(row.limit),
                                    row.limit.scheduleEnabled,
                                    $tt('webActivityConfigureSchedule'),
                                    scheduleTitle(row.limit) || $tt('webActivityConfigureSchedule'),
                                    SCHEDULE_KEYS,
                                    () => onEditSchedule(row.domain),
                                    (next) => onSaveLimit(row.domain, { ...row.limit, scheduleEnabled: next }),
                                    () =>
                                        onSaveLimit(row.domain, {
                                            ...row.limit,
                                            schedules: [],
                                            blockAlways: false,
                                        }),
                                )}
                            </td>

                            <td data-col="state" class="td-mono" data-label={$t('webActivityColState')}>
                                {#if !row.limit.enabled}
                                    <span class="wa-badge" title={$tt('webActivityLimitEnabledHint')}>
                                        {$t('webActivityLimitPaused')}
                                    </span>
                                {:else if row.verdict.blocked}
                                    <!-- The column is narrow and the reason ellipsises; the whole of
                                         it is on the badge so hovering still answers the question. -->
                                    <span
                                        class="wa-badge wa-badge-blocked"
                                        title={$tt('webActivityBlockedReason_' + row.verdict.reason)}
                                    >
                                        {$t('webActivityStateBlocked_' + row.verdict.reason)}
                                    </span>
                                {:else if row.verdict.limitSeconds > 0 || row.verdict.weekLimitSeconds > 0}
                                    <span class="eff-pct"
                                        >{Math.max(row.verdict.percent || 0, row.verdict.weekPercent || 0)}%</span
                                    >
                                {:else}
                                    <span class="wa-badge" title={$tt('webActivityStateWatchedTitle')}>
                                        {$t('webActivityStateWatched')}
                                    </span>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
