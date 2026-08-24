<script>
    /**
     * [AI INSTRUCTION]
     * ONE SITE, AS A BOX, FOR THE SIDE PANEL.
     *
     * The panel is a column a few hundred pixels wide, so the log's table is not an
     * option: ten columns cannot be read in it, and it is the wrong shape for the
     * question the panel answers, which is "what has this site cost me today and what
     * is it allowed". The box is the group list's own — panel background, one border,
     * a header with a rule under it — because that is what every other list in a side
     * panel already looks like.
     *
     * The header is what stays when the box is collapsed: the site, and its time. The
     * rows inside are the figures and then one row per part of the rule — the daily
     * allowance, the weekly one and the hours — each with the controls that act on it.
     * The three are drawn by one snippet, so a row that gains a state gains it in all
     * three and they cannot drift apart.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
    import { fmtDur, fmtHm } from '../../../services/dashboard/format.js';
    import RuleControls from '../components/RuleControls.svelte';
    import { siteTooltip } from './panelTooltip.js';

    let {
        site,
        limit,
        verdict = null,
        /** This site's share of the day, as a whole number. */
        share: sharePercent = 0,
        open = true,
        /** The site of the tab in front, marked so the eye finds it after a scroll. */
        isActive = false,
        onToggle,
        /** @param {'daily'|'weekly'} tab Which allowance the dialog opens on. */
        onEditLimit,
        onEditSchedule,
        onToggleLimit,
        onToggleSchedule,
        /** @param {'daily'|'weekly'} which Which allowance to empty. */
        onClearLimit,
        onClearSchedule,
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

    const faviconFor = (domain) =>
        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + domain)}&size=16`;

    const windows = $derived(limit.schedules.filter((schedule) => schedule.start && schedule.end));
    const hasSchedule = $derived(limit.blockAlways || windows.length > 0);

    const scheduleText = $derived.by(() => {
        if (limit.blockAlways) return $t('webActivityLimitAlways');
        if (!windows.length) return '—';
        if (windows.length === 1) return `${windows[0].start}-${windows[0].end}`;
        return $t('webActivityWindowCount', [String(windows.length)]);
    });

    const tooltipData = $derived({
        domain: site.domain,
        favicon: faviconFor(site.domain),
        seconds: site.seconds,
        visits: site.visits,
        perVisit: site.perVisit,
        sharePercent,
        dailyLimitSeconds: limit.dailyLimitSeconds,
        dailyLimitEnabled: limit.dailyLimitEnabled,
        dailyPercent: verdict?.percent ?? 0,
        weeklyLimitSeconds: limit.weeklyLimitSeconds,
        weeklyLimitEnabled: limit.weeklyLimitEnabled,
        weeklyPercent: verdict?.weekPercent ?? 0,
        hasSchedule,
        scheduleText,
        scheduleEnabled: limit.scheduleEnabled,
        blocked: verdict?.blocked,
        blockedReason: verdict?.reason,
        limitEnabled: limit.limitEnabled,
        enabled: limit.enabled,
        onEditLimit: (tab) => onEditLimit(tab),
        onEditSchedule: () => onEditSchedule(),
    });
</script>

<!--
    A row of the rule: what it is called, what it says, how much of it is spent, and
    the three things that can be done to it. `percent` is null for a row that has
    nothing to be a percentage of — the hours — and the cell keeps its width anyway, so
    the four columns line up straight down the box whichever row is being read.
-->
{#snippet ruleRow(label, text, isSet, enabled, percent, editTitle, keys, onEdit, onToggleRow, onClear)}
    <div class="wa-panel-row">
        <span class="wa-panel-row-label">{label}</span>
        <!-- `percent === null` is the hours row, and the hours are the one value here
             that is centred: it is the widest thing in the column and it has no share
             beside it, so it reads as the middle of the row rather than as a figure in
             a column of figures. The two allowances stay where they are.
             That row therefore has no share cell at all: the value takes both tracks,
             which is what puts it in the middle of the row. Centred inside the value
             track alone it sat a good twenty pixels to the left of where the eye
             expects the middle, because the empty share track was still holding
             46 pixels open on its right. -->
        <span
            class="wa-panel-row-val"
            class:wa-panel-row-val-center={percent === null}
            class:wa-muted={!isSet}
            class:is-paused={isSet && !enabled}
            title={text}
        >
            {isSet ? text : '—'}
        </span>
        <!-- The share of this allowance and nothing else. What is blocked, and why, is
             on the header where it belongs to the site rather than to one part of its
             rule. -->
        {#if percent !== null}
            <span class="wa-panel-row-pct">
                {#if isSet}
                    <span class="eff-pct">{percent}%</span>
                {:else}
                    <span class="wa-muted">--</span>
                {/if}
            </span>
        {/if}
        <RuleControls
            {isSet}
            {enabled}
            {editTitle}
            enableKey={keys.enable}
            disableKey={keys.disable}
            clearKey={keys.clear}
            {onEdit}
            onToggle={onToggleRow}
            {onClear}
        />
    </div>
{/snippet}

<div
    class="wa-panel-box"
    class:is-blocked={verdict?.blocked}
    class:is-open={open}
    class:is-active={isActive}
    data-domain={site.domain}
>
    <button class="wa-panel-head" type="button" aria-expanded={open} onclick={onToggle}>
        <img class="si-favicon" src={faviconFor(site.domain)} alt="" loading="lazy" />
        <span class="wa-panel-domain" title={site.domain}>{site.domain}</span>
        <!-- Minutes, not seconds: this clock is re-read once a minute, so a seconds
             field would show a number that was already wrong when it was painted. -->
        {#if verdict?.blocked}
            <span class="wa-badge wa-badge-blocked" title={$tt('webActivityBlockedReason_' + verdict.reason)}>
                {$t('webActivityStateBlocked_' + verdict.reason)}
            </span>
        {/if}
        <!-- The whole card, with live stats and rules breakdown. -->
        <span class="wa-panel-time" use:siteTooltip={() => tooltipData}>{fmtHm(site.seconds)}</span>
    </button>

    {#if open}
        <div class="wa-panel-body">
            <div class="wa-panel-figures">
                <span class="wa-panel-figure" title={$tt('webActivityColVisitsDesc')}>
                    <span class="wa-panel-figure-label">{$t('webActivityColVisits')}</span>
                    <span class="wa-panel-figure-val">{site.visits}</span>
                </span>
                <span class="wa-panel-figure" title={$tt('webActivityColPerVisitDesc')}>
                    <span class="wa-panel-figure-label">{$t('webActivityColPerVisit')}</span>
                    <span class="wa-panel-figure-val">{site.visits > 0 ? fmtDur(site.perVisit) : '--'}</span>
                </span>
                <span class="wa-panel-figure" title={$tt('webActivityColShareDesc')}>
                    <span class="wa-panel-figure-label">{$t('webActivityColShare')}</span>
                    <span class="wa-panel-figure-val">{sharePercent}%</span>
                </span>
            </div>

            {@render ruleRow(
                $t('webActivityColDaily'),
                fmtHm(limit.dailyLimitSeconds),
                limit.dailyLimitSeconds > 0,
                limit.dailyLimitEnabled,
                verdict?.percent ?? 0,
                $tt('webActivityConfigureLimit'),
                LIMIT_KEYS,
                () => onEditLimit('daily'),
                (next) => onToggleLimit('daily', next),
                () => onClearLimit('daily'),
            )}

            {@render ruleRow(
                $t('webActivityColWeekly'),
                fmtHm(limit.weeklyLimitSeconds),
                limit.weeklyLimitSeconds > 0,
                limit.weeklyLimitEnabled,
                verdict?.weekPercent ?? 0,
                $tt('webActivityConfigureLimit'),
                LIMIT_KEYS,
                () => onEditLimit('weekly'),
                (next) => onToggleLimit('weekly', next),
                () => onClearLimit('weekly'),
            )}

            {@render ruleRow(
                $t('webActivityColSchedule'),
                scheduleText,
                hasSchedule,
                limit.scheduleEnabled,
                null,
                $tt('webActivityConfigureSchedule'),
                SCHEDULE_KEYS,
                onEditSchedule,
                onToggleSchedule,
                onClearSchedule,
            )}
        </div>
    {/if}
</div>
