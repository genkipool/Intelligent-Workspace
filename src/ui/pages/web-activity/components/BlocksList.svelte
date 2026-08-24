<script>
    /**
     * [AI INSTRUCTION]
     * WHAT IS BLOCKED RIGHT NOW, AND WHY.
     *
     * Only sites the blocker is actually stopping at this moment. The rules themselves
     * — every site with an allowance or a schedule, whether or not it is biting today —
     * belong to the settings page; a dashboard section is a reading of the present, and
     * a list that mixes "this is shut" with "this has a rule" answers neither question.
     *
     * Each entry says which rule fired and when it lifts, because a block the user
     * cannot explain is a block they will turn off.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
    import { fmtDur } from '../../../services/dashboard/format.js';
    import { getThemeScoreColor } from '../../../services/dashboard/chartTheme.js';

    let { rows = [], snoozeMinutes = 5, onEditLimit, onSnooze } = $props();

    const faviconFor = (domain) =>
        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + domain)}&size=16`;

    function blockedTab(row) {
        const reason = row?.verdict?.reason;
        if (reason === 'weekly') return 'weekly';
        if (reason === 'schedule' || reason === 'always') return 'schedule';
        if (reason === 'daily') return 'daily';
        if (
            row?.limit?.weeklyLimitSeconds > 0 &&
            (row?.verdict?.weekUsedSeconds ?? 0) >= row.limit.weeklyLimitSeconds
        ) {
            return 'weekly';
        }
        if (row?.limit?.dailyLimitSeconds > 0 && (row?.verdict?.usedSeconds ?? 0) >= row.limit.dailyLimitSeconds) {
            return 'daily';
        }
        if (row?.limit?.blockAlways || (row?.limit?.schedules?.length ?? 0) > 0) {
            return 'schedule';
        }
        return 'daily';
    }

    /** `22:00`, for the minute of day the next allowed window opens at. */
    function unblocksAt(verdict) {
        if (verdict.unblocksAtMinute === null || verdict.unblocksAtMinute === undefined) return null;
        const hours = String(Math.floor(verdict.unblocksAtMinute / 60)).padStart(2, '0');
        const minutes = String(verdict.unblocksAtMinute % 60).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function liftsWhen(verdict) {
        if (verdict.reason === 'schedule') {
            const at = unblocksAt(verdict);
            return at ? $t('webActivityBlockedUntil', [at]) : '';
        }
        if (verdict.reason === 'daily') return $t('webActivityBlockedUntilMidnight');
        if (verdict.reason === 'weekly') return $t('webActivityBlockedUntilMonday');
        return '';
    }
</script>

<div class="wa-blocks">
    {#if !rows.length}
        <div class="wa-blocks-empty">
            <span class="wa-blocks-empty-icon" aria-hidden="true">
                <svg width="28" height="28" focusable="false"><use href="#wa-shield"></use></svg>
            </span>
            <div>
                <div class="wa-blocks-empty-title">{$t('webActivityNoBlocks')}</div>
                <div class="wa-blocks-empty-sub">{$t('webActivityNoBlocksSub')}</div>
            </div>
        </div>
    {/if}

    <div class="wa-block-grid">
        {#each rows as row (row.domain)}
            {@const lifts = liftsWhen(row.verdict)}
            <div class="wa-block-row">
                <span class="wa-block-mark" aria-hidden="true"></span>

                <div class="wa-block-content">
                    <div class="wa-block-header">
                        <img class="si-favicon wa-block-favicon" src={faviconFor(row.domain)} alt="" loading="lazy" />
                        <div class="wa-block-line">
                            <span class="wa-block-name" title={row.domain}>{row.domain}</span>
                            <span
                                class="wa-badge wa-badge-blocked"
                                title={$tt('webActivityBlockedReason_' + row.verdict.reason)}
                            >
                                {$t('webActivityStateBlocked_' + row.verdict.reason)}
                            </span>
                            {#if row.verdict.snoozed}
                                <span class="tl-chip">{$t('webActivitySnoozed')}</span>
                            {/if}
                        </div>
                    </div>

                    <div class="wa-block-body">
                        <div class="wa-block-why">{$t('webActivityBlockedReason_' + row.verdict.reason)}</div>

                        {#if row.verdict.limitSeconds > 0}
                            <div class="wa-block-meter" title={$tt('webActivityMeterDaily')}>
                                <span class="wa-block-meter-label">{$t('webActivityMeterDaily')}</span>
                                <div class="eff-bar">
                                    <div
                                        class="eff-bar-fill"
                                        style="width:{row.verdict.percent}%;background:{getThemeScoreColor(
                                            100 - row.verdict.percent,
                                        )}"
                                    ></div>
                                </div>
                                <span class="wa-block-meter-val"
                                    >{fmtDur(row.verdict.usedSeconds)} / {fmtDur(row.verdict.limitSeconds)}</span
                                >
                            </div>
                        {/if}
                        {#if row.verdict.weekLimitSeconds > 0}
                            <div class="wa-block-meter" title={$tt('webActivityMeterWeekly')}>
                                <span class="wa-block-meter-label">{$t('webActivityMeterWeekly')}</span>
                                <div class="eff-bar">
                                    <div
                                        class="eff-bar-fill"
                                        style="width:{row.verdict.weekPercent}%;background:{getThemeScoreColor(
                                            100 - row.verdict.weekPercent,
                                        )}"
                                    ></div>
                                </div>
                                <span class="wa-block-meter-val"
                                    >{fmtDur(row.verdict.weekUsedSeconds)} / {fmtDur(
                                        row.verdict.weekLimitSeconds,
                                    )}</span
                                >
                            </div>
                        {/if}

                        {#if lifts}<div class="wa-block-lifts">{lifts}</div>{/if}
                    </div>

                    <div class="wa-row-actions wa-block-actions-col">
                        <button
                            class="wa-icon-btn"
                            type="button"
                            title={$t('webActivitySnoozeWithTime', [String(snoozeMinutes)])}
                            aria-label={$t('webActivityBlockedSnooze', [String(snoozeMinutes)])}
                            onclick={() => onSnooze(row.domain)}
                        >
                            <svg width="14" height="14" aria-hidden="true" focusable="false"
                                ><use href="#wa-snooze"></use></svg
                            >
                        </button>
                        <button
                            class="wa-icon-btn"
                            type="button"
                            title={$tt('webActivityConfigureLimit')}
                            aria-label={$t('webActivityConfigureLimit')}
                            onclick={() => onEditLimit(row.domain, blockedTab(row))}
                        >
                            <svg width="14" height="14" aria-hidden="true" focusable="false"
                                ><use href="#wa-gauge"></use></svg
                            >
                        </button>
                    </div>
                </div>
            </div>
        {/each}
    </div>
</div>
