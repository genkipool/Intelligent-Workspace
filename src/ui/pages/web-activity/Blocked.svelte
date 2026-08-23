<script>
    /**
     * [AI INSTRUCTION]
     * THE BLOCK SCREEN — what the user sees instead of a site they limited.
     *
     * It stands between somebody and what they asked for, so it explains itself: which
     * rule fired, how much of each allowance went, and when it lifts. The three ways
     * out are all honest ones — go back, look at the numbers, or say "five more
     * minutes" and have that recorded as a snooze rather than a silent override.
     *
     * It loads no charting engine and no icon sprite of its own: it has to appear
     * instantly, in place of a page that was already loading, so the handful of icons
     * it needs are inline.
     */
    import { onDestroy, onMount } from 'svelte';
    import { SvelteDate } from 'svelte/reactivity';
    import '../../../core/services/webActivitySchema.js';
    import { t, tt, currentLang } from '../../stores/i18nStore.js';
    import { initializeActiveTheme } from '../../../utils/theme.js';
    import { fetchStatus, snoozeLimit } from '../../services/webActivityService.js';
    import { openDashboard } from '../../services/dashboard/dashboardPages.js';
    import { fmtDur, fmtHm, weekdayNames } from '../../services/dashboard/format.js';

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

    const faviconFor = (host) =>
        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + host)}&size=32`;

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

    /** When it lifts, in one sentence, or nothing when only the user can lift it. */
    const liftsWhen = $derived.by(() => {
        if (unblocksAt && unblocksOnDay) return $t('webActivityBlockedUntilDay', [unblocksOnDay, unblocksAt]);
        if (unblocksAt) return $t('webActivityBlockedUntil', [unblocksAt]);
        if (verdict?.reason === 'daily') return $t('webActivityBlockedUntilMidnight');
        if (verdict?.reason === 'weekly') return $t('webActivityBlockedUntilMonday');
        return '';
    });

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

    /**
     * The palette can be changed while this page is on screen — it is a full tab, and
     * the theme editor is one window away. The rules page listens for the same message
     * and re-applies; this one did not, so a page opened before a theme change kept
     * the old palette until it was reloaded, which on a block screen means until the
     * user gives up and closes it.
     */
    let onRuntimeMessage = null;

    onMount(async () => {
        await initializeActiveTheme();
        await load();

        onRuntimeMessage = (message) => {
            if (message.action === 'themeChanged' || message.action === 'languageChanged') {
                initializeActiveTheme();
            }
        };
        chrome.runtime.onMessage.addListener(onRuntimeMessage);
    });

    onDestroy(() => {
        if (onRuntimeMessage) chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    });
</script>

{#snippet meter(labelKey, used, limit, percent)}
    <div class="wa-gate-meter" class:is-spent={percent >= 100}>
        <div class="wa-gate-meter-head">
            <span class="wa-gate-meter-label">{$t(labelKey)}</span>
            <!-- What was spent is measured time and keeps its seconds; what was allowed
                 is a round figure the user typed, and "30m 0s" only spends characters. -->
            <span class="wa-gate-meter-val">{fmtDur(used)} / {fmtHm(limit)}</span>
        </div>
        <div class="eff-bar">
            <div class="eff-bar-fill" style="width:{percent}%"></div>
        </div>
    </div>
{/snippet}

<div class="wa-gate">
    <div class="wa-gate-card">
        <div class="wa-gate-top">
            <span class="wa-gate-shield" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                    <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" stroke-linejoin="round" />
                    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke-linecap="round" />
                </svg>
            </span>
            <div>
                <div class="wa-gate-eyebrow">{$t('webActivityTitle')}</div>
                <h1 class="wa-gate-title">{$t('webActivityBlockedTitle')}</h1>
            </div>
        </div>

        <div class="wa-gate-site">
            <img class="si-favicon" src={faviconFor(domain)} alt="" width="16" height="16" />
            <span class="wa-gate-domain">{domain}</span>
            {#if verdict?.reason}
                <span class="wa-badge wa-badge-blocked wa-gate-tag">
                    {$t('webActivityStateBlocked_' + verdict.reason)}
                </span>
            {/if}
        </div>

        {#if verdict}
            <p class="wa-gate-reason">{$t(reasonKey)}</p>

            {#if verdict.limitSeconds > 0 || verdict.weekLimitSeconds > 0}
                <div class="wa-gate-meters">
                    {#if verdict.limitSeconds > 0}
                        {@render meter(
                            'webActivityMeterDaily',
                            verdict.usedSeconds,
                            verdict.limitSeconds,
                            verdict.percent,
                        )}
                    {/if}
                    {#if verdict.weekLimitSeconds > 0}
                        {@render meter(
                            'webActivityMeterWeekly',
                            verdict.weekUsedSeconds,
                            verdict.weekLimitSeconds,
                            verdict.weekPercent,
                        )}
                    {/if}
                </div>
            {/if}

            {#if liftsWhen}
                <p class="wa-gate-until">
                    <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                    >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3.5 2" stroke-linecap="round" />
                    </svg>
                    <span>{liftsWhen}</span>
                </p>
            {/if}
        {/if}

        <div class="wa-gate-actions">
            <button class="btn btn-accent" type="button" onclick={() => history.back()}>
                {$t('webActivityBlockedGoBack')}
            </button>
            <button class="btn" type="button" onclick={() => openDashboard('webActivity')}>
                {$t('webActivityBlockedChangeRule')}
            </button>
            {#if settings?.snoozeMinutes > 0}
                <button class="btn" type="button" disabled={busy} title={$tt('webActivitySnooze')} onclick={snooze}>
                    {$t('webActivityBlockedSnooze', [String(settings.snoozeMinutes)])}
                </button>
            {/if}
        </div>

        <p class="wa-gate-footer" lang={$currentLang}>{$t('webActivityBlockedFooter')}</p>
    </div>
</div>
