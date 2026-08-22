<script>
    /**
     * The limits the user has set, and how each one is doing today.
     *
     * A limit that is doing nothing right now still shows what it will do — the daily
     * allowance left, or the only hours the site is allowed — because a rule you
     * cannot see is a rule you cannot trust.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
    import { fmtDur } from '../../../services/dashboard/format.js';
    import { getThemeScoreColor } from '../../../services/dashboard/chartTheme.js';
    import { weekdayNames } from '../../../services/dashboard/format.js';
    import { currentLang } from '../../../stores/i18nStore.js';

    let { rows = [], onEdit, onDelete, onAdd, onSnooze } = $props();

    const days = $derived(weekdayNames($currentLang, 'short'));

    /** "Mon, Tue, Wed" — or nothing at all when the window runs every day. */
    function scheduleDays(schedule) {
        const chosen = Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
        if (chosen.length === 7) return $t('webActivityEveryDay');
        return chosen
            .slice()
            .sort()
            .map((day) => days[day])
            .join(', ');
    }
</script>

<div class="wa-limits">
    <div class="wa-limits-head">
        <span class="wa-muted">{$t('webActivityLimitsHint')}</span>
        <button class="btn btn-accent" type="button" title={$tt('webActivityAddLimit')} onclick={() => onAdd()}>
            <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-plus"></use></svg>
            <span>{$t('webActivityAddLimit')}</span>
        </button>
    </div>

    {#if !rows.length}
        <div class="no-data-msg">{$t('webActivityNoLimits')}</div>
    {/if}

    <div class="wa-limit-grid">
        {#each rows as row (row.domain)}
            <div class="wa-limit-card" class:is-blocked={row.verdict.blocked}>
                <div class="wa-limit-head">
                    <span class="wa-limit-domain" title={row.domain}>{row.domain}</span>
                    <div class="wa-row-actions">
                        {#if row.verdict.blocked}
                            <button
                                class="wa-icon-btn"
                                type="button"
                                title={$tt('webActivitySnooze')}
                                aria-label={$t('webActivitySnooze')}
                                onclick={() => onSnooze(row.domain)}
                            >
                                <svg width="14" height="14" aria-hidden="true" focusable="false"
                                    ><use href="#wa-clock"></use></svg
                                >
                            </button>
                        {/if}
                        <button
                            class="wa-icon-btn"
                            type="button"
                            title={$tt('webActivityEditLimit')}
                            aria-label={$t('webActivityEditLimit')}
                            onclick={() => onEdit(row.domain)}
                        >
                            <svg width="14" height="14" aria-hidden="true" focusable="false"
                                ><use href="#wa-edit"></use></svg
                            >
                        </button>
                        <button
                            class="wa-icon-btn wa-icon-btn-danger"
                            type="button"
                            title={$tt('webActivityDeleteLimit')}
                            aria-label={$t('webActivityDeleteLimit')}
                            onclick={() => onDelete(row.domain)}
                        >
                            <svg width="14" height="14" aria-hidden="true" focusable="false"
                                ><use href="#wa-trash"></use></svg
                            >
                        </button>
                    </div>
                </div>

                {#if row.limit.dailyLimitSeconds > 0}
                    <div class="eff-bar-wrap">
                        <div class="eff-bar">
                            <div
                                class="eff-bar-fill"
                                style="width:{row.verdict.percent}%;background:{getThemeScoreColor(
                                    100 - row.verdict.percent,
                                )}"
                            ></div>
                        </div>
                        <span class="eff-pct">{row.verdict.percent}%</span>
                    </div>
                    <div class="wa-limit-meta">
                        {fmtDur(row.verdict.usedSeconds)} / {fmtDur(row.limit.dailyLimitSeconds)}
                        <span class="wa-muted">
                            · {row.verdict.remainingSeconds > 0
                                ? $t('webActivityRemaining', [fmtDur(row.verdict.remainingSeconds)])
                                : $t('webActivityExhausted')}
                        </span>
                    </div>
                {/if}

                <div class="wa-limit-tags">
                    {#if row.limit.blockAlways}
                        <span class="tl-chip wa-chip-block">{$t('webActivityBlockAlways')}</span>
                    {/if}
                    {#each row.limit.schedules as schedule, i (i)}
                        <span class="tl-chip" title={$tt('webActivityFieldSchedules')}>
                            {$t('webActivityAllowedWindow', [schedule.start, schedule.end])} · {scheduleDays(schedule)}
                        </span>
                    {/each}
                    {#if !row.limit.enabled}
                        <span class="tl-chip wa-muted">{$t('webActivityLimitPaused')}</span>
                    {/if}
                    {#if row.verdict.snoozed}
                        <span class="tl-chip">{$t('webActivitySnoozed')}</span>
                    {/if}
                    {#if row.verdict.blocked}
                        <span class="tl-chip wa-chip-block">
                            {$t('webActivityStateBlocked_' + row.verdict.reason)}
                        </span>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</div>
