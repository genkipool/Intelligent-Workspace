<script>
    import { t, tt } from '../../../stores/i18nStore.js';
    import { fmtDur } from '../../../services/dashboard/format.js';
    import { getThemeScoreColor } from '../../../services/dashboard/chartTheme.js';

    let { rows = [], snoozeMinutes = 5, onEditLimit, onSnooze } = $props();

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

    let now = $state(Date.now());
    $effect(() => {
        const timer = setInterval(() => {
            now = Date.now();
        }, 1000);
        return () => clearInterval(timer);
    });

    const faviconFor = (domain) =>
        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + domain)}&size=16`;

    function formatTimeUntil(until) {
        if (!until) return '';
        const d = new Date(until);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function formatRemaining(until) {
        if (!until) return '';
        const sec = Math.max(0, Math.ceil((until - now) / 1000));
        return fmtDur(sec);
    }
</script>

<div class="wa-blocks wa-grace-blocks">
    {#if !rows.length}
        <div class="wa-blocks-empty">
            <span class="wa-blocks-empty-icon wa-grace-empty-icon" aria-hidden="true">
                <svg width="28" height="28" focusable="false"><use href="#wa-snooze"></use></svg>
            </span>
            <div>
                <div class="wa-blocks-empty-title">{$t('webActivityNoGracePeriod')}</div>
                <div class="wa-blocks-empty-sub">{$t('webActivityNoGracePeriodSub')}</div>
            </div>
        </div>
    {/if}

    <div class="wa-block-grid">
        {#each rows as row (row.domain)}
            {@const untilTime = formatTimeUntil(row.limit.snoozeUntil)}
            {@const remainingStr = formatRemaining(row.limit.snoozeUntil)}
            <div class="wa-block-row">
                <span class="wa-block-mark wa-grace-mark" aria-hidden="true"></span>

                <div class="wa-block-content">
                    <div class="wa-block-header">
                        <img class="si-favicon wa-block-favicon" src={faviconFor(row.domain)} alt="" loading="lazy" />
                        <div class="wa-block-line">
                            <span class="wa-block-name" title={row.domain}>{row.domain}</span>
                            <span class="wa-badge wa-badge-grace">
                                {$t('webActivitySnoozed')}
                            </span>
                            {#if untilTime}
                                <span class="tl-chip" title={$t('webActivityGraceRemaining', [remainingStr])}>
                                    {$t('webActivityGraceUntil', [untilTime])} · {remainingStr}
                                </span>
                            {/if}
                        </div>
                    </div>

                    <div class="wa-block-body">
                        {#if row.verdict.reason}
                            <div class="wa-block-why">
                                {$t('webActivityBlockedReason_' + row.verdict.reason)}
                            </div>
                        {:else if row.limit.dailyLimitSeconds > 0 && row.verdict.usedSeconds >= row.limit.dailyLimitSeconds}
                            <div class="wa-block-why">
                                {$t('webActivityBlockedReason_daily')}
                            </div>
                        {:else if row.limit.weeklyLimitSeconds > 0 && row.verdict.weekUsedSeconds >= row.limit.weeklyLimitSeconds}
                            <div class="wa-block-why">
                                {$t('webActivityBlockedReason_weekly')}
                            </div>
                        {:else}
                            <div class="wa-block-why">
                                {$t('webActivityGracePeriodHint')}
                            </div>
                        {/if}

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
