<script>
    /**
     * [AI INSTRUCTION]
     * THE BLOCK SCREEN — what the user sees instead of a site they limited.
     *
     * It stands between somebody and what they asked for, so it explains itself: which
     * rule fired, how much of the allowance went, and when it lifts. The three ways
     * out are all honest ones — go back, look at the numbers, or say "five more
     * minutes" and have that recorded as a snooze rather than a silent override.
     *
     * It loads no charting engine and no icon sprite of its own: it has to appear
     * instantly, in place of a page that was already loading.
     */
    import { onMount } from 'svelte';
    import { SvelteDate } from 'svelte/reactivity';
    import '../../../core/services/webActivitySchema.js';
    import { t, tt, currentLang } from '../../stores/i18nStore.js';
    import { initializeActiveTheme } from '../../../utils/theme.js';
    import { fetchStatus, snoozeLimit } from '../../services/webActivityService.js';
    import { openDashboard } from '../../services/dashboard/dashboardPages.js';
    import { fmtDur, weekdayNames } from '../../services/dashboard/format.js';

    const domain = new URLSearchParams(window.location.search).get('d') || '';

    /**
     * The address the user actually asked for, which the blocking rule appended raw
     * after `&u=`. It is read by splitting rather than with URLSearchParams because a
     * URL with its own query would be cut at the first `&`.
     */
    const requestedUrl = (() => {
        const marker = window.location.search.indexOf('&u=');
        if (marker < 0) return `https://${domain}`;
        return window.location.search.slice(marker + 3) || `https://${domain}`;
    })();

    let verdict = $state(null);
    let settings = $state(null);
    let busy = $state(false);

    /** `22:00` for the minute-of-day the next allowed window opens at. */
    const unblocksAt = $derived.by(() => {
        if (verdict?.unblocksAtMinute === null || verdict?.unblocksAtMinute === undefined) return null;
        const hours = String(Math.floor(verdict.unblocksAtMinute / 60)).padStart(2, '0');
        const minutes = String(verdict.unblocksAtMinute % 60).padStart(2, '0');
        return `${hours}:${minutes}`;
    });

    /**
     * The weekday that window falls on, named, when it is not today. "Comes back at
     * 09:00" on a Friday evening would read as tonight rather than Monday morning.
     */
    const unblocksOnDay = $derived.by(() => {
        if (!verdict?.unblocksInDays) return null;
        const date = new SvelteDate();
        date.setDate(date.getDate() + verdict.unblocksInDays);
        return weekdayNames($currentLang, 'long')[date.getDay()];
    });

    const reasonKey = $derived(
        verdict?.reason ? 'webActivityBlockedReason_' + verdict.reason : 'webActivityBlockedGeneric',
    );

    async function load() {
        const response = await fetchStatus(domain);
        if (response?.success) {
            verdict = response.verdict;
            settings = response.settings;
        }
    }

    async function snooze() {
        busy = true;
        await snoozeLimit(domain);
        // Straight back to the site: the snooze is only worth anything if it takes the
        // user where they were going.
        window.location.replace(requestedUrl);
    }

    onMount(async () => {
        await initializeActiveTheme();
        await load();
    });
</script>

<div class="wa-block">
    <div class="wa-block-card">
        <div class="wa-block-icon" aria-hidden="true">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" stroke-linejoin="round" />
                <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke-linecap="round" />
            </svg>
        </div>

        <h1 class="wa-block-title">{$t('webActivityBlockedTitle')}</h1>
        <p class="wa-block-domain">{domain}</p>

        {#if verdict}
            <p class="wa-block-reason">{$t(reasonKey)}</p>

            {#if verdict.limitSeconds > 0}
                <div class="wa-block-usage">
                    <div class="eff-bar">
                        <div class="eff-bar-fill" style="width:{verdict.percent}%"></div>
                    </div>
                    <span>{fmtDur(verdict.usedSeconds)} / {fmtDur(verdict.limitSeconds)}</span>
                </div>
            {/if}

            {#if unblocksAt && unblocksOnDay}
                <p class="wa-block-until">{$t('webActivityBlockedUntilDay', [unblocksOnDay, unblocksAt])}</p>
            {:else if unblocksAt}
                <p class="wa-block-until">{$t('webActivityBlockedUntil', [unblocksAt])}</p>
            {:else if verdict.reason === 'daily'}
                <p class="wa-block-until">{$t('webActivityBlockedUntilMidnight')}</p>
            {/if}
        {/if}

        <div class="wa-block-actions">
            <button class="btn btn-accent" type="button" onclick={() => history.back()}>
                {$t('webActivityBlockedGoBack')}
            </button>
            <button class="btn" type="button" onclick={() => openDashboard('webActivity')}>
                {$t('webActivityDashboardTitle')}
            </button>
            {#if settings?.snoozeMinutes > 0}
                <button class="btn" type="button" disabled={busy} title={$tt('webActivitySnooze')} onclick={snooze}>
                    {$t('webActivityBlockedSnooze', [String(settings.snoozeMinutes)])}
                </button>
            {/if}
        </div>

        <p class="wa-block-footer" lang={$currentLang}>{$t('webActivityBlockedFooter')}</p>
    </div>
</div>
