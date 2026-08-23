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
     * three rows inside are the figures, the allowance and the hours, each with the
     * controls that act on it.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
    import { fmtDur, fmtHm } from '../../../services/dashboard/format.js';
    import RuleControls from '../components/RuleControls.svelte';

    let {
        site,
        limit,
        verdict = null,
        share = 0,
        open = true,
        /** The site of the tab in front, marked so the eye finds it after a scroll. */
        isActive = false,
        onToggle,
        onEditLimit,
        onEditSchedule,
        onToggleLimit,
        onToggleSchedule,
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

    /** The share of whichever allowance is set, which is what the row is about. */
    const percent = $derived(Math.max(verdict?.percent || 0, verdict?.weekPercent || 0));
</script>

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
        <span class="wa-panel-time" title={$tt('webActivityColTimeDesc')}>{fmtHm(site.seconds)}</span>
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
                    <span class="wa-panel-figure-val">{share}%</span>
                </span>
            </div>

            <div class="wa-panel-row">
                <span class="wa-panel-row-label">{$t('webActivityColLimit')}</span>
                <span class="wa-panel-row-val" class:wa-muted={!limit.dailyLimitSeconds}>
                    {limit.dailyLimitSeconds > 0 ? fmtHm(limit.dailyLimitSeconds) : '—'}
                </span>
                <!-- The percentage and nothing else. What is blocked, and why, is on
                     the header where it belongs to the site rather than to one of its
                     two halves. -->
                <span class="wa-panel-row-pct">
                    {#if verdict?.limitSeconds > 0 || verdict?.weekLimitSeconds > 0}
                        <span class="eff-pct">{percent}%</span>
                    {:else}
                        <span class="wa-muted">--</span>
                    {/if}
                </span>
                <RuleControls
                    isSet={limit.dailyLimitSeconds > 0 || limit.weeklyLimitSeconds > 0}
                    enabled={limit.limitEnabled}
                    editTitle={$tt('webActivityConfigureLimit')}
                    enableKey={LIMIT_KEYS.enable}
                    disableKey={LIMIT_KEYS.disable}
                    clearKey={LIMIT_KEYS.clear}
                    onEdit={onEditLimit}
                    onToggle={onToggleLimit}
                    onClear={onClearLimit}
                />
            </div>

            <div class="wa-panel-row">
                <span class="wa-panel-row-label">{$t('webActivityColSchedule')}</span>
                <span class="wa-panel-row-val" class:wa-muted={!hasSchedule}>{scheduleText}</span>
                <span class="wa-panel-row-pct"></span>
                <RuleControls
                    isSet={hasSchedule}
                    enabled={limit.scheduleEnabled}
                    editTitle={$tt('webActivityConfigureSchedule')}
                    enableKey={SCHEDULE_KEYS.enable}
                    disableKey={SCHEDULE_KEYS.disable}
                    clearKey={SCHEDULE_KEYS.clear}
                    onEdit={onEditSchedule}
                    onToggle={onToggleSchedule}
                    onClear={onClearSchedule}
                />
            </div>
        </div>
    {/if}
</div>
