<script>
    /**
     * [AI INSTRUCTION]
     * HOW LONG A SITE IS ALLOWED — the time half of a rule.
     *
     * Two allowances, one per tab, because they answer two different questions and
     * are almost never set together. A daily one paces a habit and refills at
     * midnight; a weekly one budgets it and refills on Monday. The tabs keep each
     * answer whole instead of stacking two nearly identical forms down one column.
     *
     * The daily allowance carries the weekdays it applies on — half an hour of this
     * on a working day and no limit at the weekend is the ordinary thing to want.
     * The weekly one has no days: a week is the same week whichever day you look at
     * it from, which is why that tab is the same form minus the day row.
     *
     * An allowance of `00:00` is no allowance. That is why there is no "remove"
     * button and no "block always" switch: clearing the field is how a rule is
     * taken off, and it is the same gesture in both dialogs.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt } from '../../../stores/i18nStore.js';
    import NumberField from '../../../components/common/NumberField.svelte';
    import TimeField from '../../../components/common/TimeField.svelte';
    import RuleModalShell from './RuleModalShell.svelte';
    import { DAY_CHIPS, hhMmToSeconds, secondsToHhMm } from '../ruleFields.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let { domain = '', limit = null, onSave, onClose } = $props();

    const base = WA.normalizeLimit(limit || {});
    const isNew = !domain;

    let tab = $state('daily');
    let site = $state(domain);
    let dailyTime = $state(secondsToHhMm(base.dailyLimitSeconds));
    let weeklyTime = $state(secondsToHhMm(base.weeklyLimitSeconds, 168));
    let dailyDays = $state([...base.dailyLimitDays]);
    let notifyAtPercent = $state(base.notifyAtPercent ?? 0);

    const dailySeconds = $derived(hhMmToSeconds(dailyTime));
    const weeklySeconds = $derived(hhMmToSeconds(weeklyTime));

    /** A daily allowance with no day ticked can never fire, which is worth saying. */
    const noDays = $derived(dailySeconds > 0 && dailyDays.length === 0);

    function toggleDay(day) {
        dailyDays = dailyDays.includes(day) ? dailyDays.filter((d) => d !== day) : [...dailyDays, day];
    }

    function apply() {
        if (tab === 'daily' && noDays) return;
        // Whatever the user typed, only the hostname is a site: pasting a full URL is
        // the obvious thing to do and should not silently create a limit that matches
        // nothing.
        const cleaned = WA.domainOf(site.includes('://') ? site : `https://${site.trim()}`);
        if (!cleaned) return;
        onSave(cleaned, {
            ...base,
            dailyLimitSeconds: dailySeconds,
            dailyLimitDays: [...dailyDays],
            weeklyLimitSeconds: weeklySeconds,
            // Zero is 'no warning for this site'; the general default lives on the
            // settings page.
            notifyAtPercent: Number(notifyAtPercent) || 0,
        });
    }
</script>

<!--
    The allowance and the warning threshold, side by side because they are one
    decision read left to right: how long, and how early to say something about it.
    `maxHour` is what separates the two tabs: a day cannot hold more than 23 hours of
    browsing, a week can hold a great deal more.

    What each field means is on the field, as a tooltip. Spelled out under every row
    the explanations were longer than the form and pushed the controls off the bottom
    of a dialog that has only four of them.
-->
{#snippet allowance(value, setValue, maxHour, hintKey)}
    <div class="form-group wa-allowance-row">
        <label class="wa-allowance-time" title={$tt(hintKey)}>
            <span class="field-label">{$t('webActivityFieldAllowance')}</span>
            <TimeField
                value={value()}
                suggestNow={false}
                {maxHour}
                pickerLabel={$t('webActivityDurationLabel')}
                title={$tt(hintKey)}
                onchange={setValue}
            />
        </label>

        <label class="wa-allowance-notify" title={$tt('webActivityNotifyAtHint')}>
            <span class="field-label">{$t('webActivityFieldNotifyAt')}</span>
            <NumberField
                wide
                bind:value={notifyAtPercent}
                min={0}
                max={100}
                step={5}
                digits={3}
                title={$tt('webActivityNotifyAtHint')}
                ariaLabel={$t('webActivityFieldNotifyAt')}
            />
        </label>
    </div>
{/snippet}

<RuleModalShell
    titleId="wa-limit-title"
    title={$t('webActivityLimitModalTitle')}
    applyLabel={$t('apply')}
    disabled={(tab === 'daily' && noDays) || (isNew && !site.trim())}
    onApply={apply}
    {onClose}
>
    {#if isNew}
        <div class="form-group">
            <label for="wa-limit-site">{$t('webActivityFieldSite')}</label>
            <input
                id="wa-limit-site"
                type="text"
                bind:value={site}
                placeholder="example.com"
                autocomplete="off"
                spellcheck="false"
            />
        </div>
    {/if}

    <div class="wa-tabs" role="tablist">
        <button
            type="button"
            role="tab"
            class="wa-tab"
            class:selected={tab === 'daily'}
            aria-selected={tab === 'daily'}
            onclick={() => (tab = 'daily')}
        >
            {$t('webActivityFieldDailyLimit')}
        </button>
        <button
            type="button"
            role="tab"
            class="wa-tab"
            class:selected={tab === 'weekly'}
            aria-selected={tab === 'weekly'}
            onclick={() => (tab = 'weekly')}
        >
            {$t('webActivityFieldWeeklyLimit')}
        </button>
    </div>

    <!-- Under the tabs rather than over them: the tabs are what the dialog is doing,
         and the site is what it is doing it to. Reading them the other way round put
         a bare hostname above a strip that had nothing to do with it. -->
    {#if !isNew}
        <div class="form-group wa-site-group">
            <div class="field-label">{$t('webActivityFieldSite')}</div>
            <p class="wa-modal-site">{domain}</p>
        </div>
    {/if}

    <div class="wa-tab-panel">
        {#if tab === 'daily'}
            <div class="form-group">
                <div class="field-label" title={$tt('webActivityLimitDaysHint')}>{$t('daysOfWeek')}</div>
                <div class="days-selector">
                    {#each DAY_CHIPS as chip (chip.day)}
                        <button
                            type="button"
                            class:selected={dailyDays.includes(chip.day)}
                            aria-pressed={dailyDays.includes(chip.day)}
                            onclick={() => toggleDay(chip.day)}>{$t(chip.key)}</button
                        >
                    {/each}
                </div>
                <!-- Always in the layout, spoken only when there is something to say:
                     a line that appears out of nowhere shoves the controls under the
                     pointer down a row just as it is reaching for them. -->
                <p class="wa-field-warning" aria-live="polite">
                    {noDays ? $t('webActivityLimitNoDays') : ''}
                </p>
            </div>

            {@render allowance(
                () => dailyTime,
                (next) => (dailyTime = next),
                23,
                'webActivityDailyLimitHint',
            )}
        {:else}
            {@render allowance(
                () => weeklyTime,
                (next) => (weeklyTime = next),
                167,
                'webActivityWeeklyLimitHint',
            )}
        {/if}
    </div>
</RuleModalShell>
