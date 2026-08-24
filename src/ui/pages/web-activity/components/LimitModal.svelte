<script>
    /**
     * [AI INSTRUCTION]
     * HOW LONG AND WHEN A SITE IS ALLOWED — the unified rule dialog.
     *
     * Three views of one rule:
     * - Daily allowance: paces a habit and refills at midnight (with weekday selection)
     * - Weekly allowance: budgets time across the week and refills on Monday
     * - Allowed schedule: clock windows where the site is permitted (outside which it is blocked)
     *
     * The tabs keep each answer whole instead of stacking three different forms down one column.
     * When switching to the schedule tab, the modal header switches to "Horario permitido"
     * and shows the window management interface with day selector chips and time fields.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt } from '../../../stores/i18nStore.js';
    import NumberField from '../../../components/common/NumberField.svelte';
    import TimeField from '../../../components/common/TimeField.svelte';
    import RuleModalShell from './RuleModalShell.svelte';
    import { DAY_CHIPS, hhMmToSeconds, secondsToHhMm, validateSite } from '../ruleFields.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let { domain = '', limit = null, initialTab = 'daily', onSave, onClose } = $props();

    const base = WA.normalizeLimit(limit || {});
    const isNew = !domain;
    const storedWindows = base.schedules.filter((schedule) => schedule.start && schedule.end);

    const blankWindow = () => ({ start: '09:00', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6] });

    // Whichever tab the caller was looking at when they opened the dialog.
    let tab = $state(initialTab === 'weekly' ? 'weekly' : initialTab === 'schedule' ? 'schedule' : 'daily');
    let site = $state(domain);
    let applyToAll = $state(false);
    let dailyTime = $state(secondsToHhMm(base.dailyLimitSeconds));
    let weeklyTime = $state(secondsToHhMm(base.weeklyLimitSeconds, 168));
    let dailyDays = $state([...base.dailyLimitDays]);
    let notifyAtPercent = $state(base.notifyAtPercent ?? 0);

    let hasClearedWindows = $state(false);
    let windows = $state(
        storedWindows.length
            ? storedWindows.map((schedule) => ({
                  start: schedule.start,
                  end: schedule.end,
                  days: [...(schedule.days?.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6])],
              }))
            : initialTab === 'schedule'
              ? [blankWindow()]
              : [],
    );

    const dailySeconds = $derived(hhMmToSeconds(dailyTime));
    const weeklySeconds = $derived(hhMmToSeconds(weeklyTime));

    /** A daily allowance with no day ticked can never fire, which is worth saying. */
    const noDays = $derived(dailySeconds > 0 && dailyDays.length === 0);

    /**
     * Whether what was typed is a web address at all — see `validateSite`, which also
     * says why "real" here means the shape and not a round trip to the network.
     *
     * "All sites" needs no address, and an existing rule already has one, so neither is
     * checked. The complaint waits until something has been typed: a dialog that opens
     * already telling the user off for an empty field is a dialog that tells them off
     * for opening it.
     */
    const siteCheck = $derived(isNew && !applyToAll ? validateSite(site) : { domain, errorKey: '' });
    const siteError = $derived(isNew && !applyToAll && site.trim() && siteCheck.errorKey ? $t(siteCheck.errorKey) : '');

    /** A window that ends before it starts runs past midnight, which is worth saying. */
    const isOvernight = (window) => WA.minutesOfDay(window.end) <= WA.minutesOfDay(window.start);

    const hasInvalidWindow = $derived(windows.some((w) => !w.days?.length));

    function toggleDailyDay(day) {
        dailyDays = dailyDays.includes(day) ? dailyDays.filter((d) => d !== day) : [...dailyDays, day];
    }

    function toggleScheduleDay(index, day) {
        const current = windows[index].days;
        windows[index].days = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    }

    function addWindow() {
        windows = [...windows, blankWindow()];
    }

    function removeWindow(index) {
        windows = windows.filter((_, i) => i !== index);
        if (!windows.length) {
            hasClearedWindows = true;
        }
    }

    function selectTab(nextTab) {
        tab = nextTab;
        if (nextTab === 'schedule' && !windows.length && !storedWindows.length && !hasClearedWindows) {
            windows = [blankWindow()];
        }
    }

    function apply() {
        if (tab === 'daily' && noDays) return;
        if (tab === 'schedule' && hasInvalidWindow) return;

        const limitPayload = {
            ...base,
            dailyLimitEnabled: base.dailyLimitEnabled || (base.dailyLimitSeconds === 0 && dailySeconds > 0),
            weeklyLimitEnabled: base.weeklyLimitEnabled || (base.weeklyLimitSeconds === 0 && weeklySeconds > 0),
            scheduleEnabled: base.scheduleEnabled || (!storedWindows.length && windows.length > 0),
            blockAlways: false,
            dailyLimitSeconds: dailySeconds,
            dailyLimitDays: [...dailyDays],
            weeklyLimitSeconds: weeklySeconds,
            // Zero is 'no warning for this site'; the general default lives on the
            // settings page.
            notifyAtPercent: Number(notifyAtPercent) || 0,
            schedules: windows
                .filter((window) => window.start && window.end && window.days?.length)
                .map((window) => ({ start: window.start, end: window.end, days: [...window.days] })),
        };

        if (applyToAll) {
            onSave('*', limitPayload, true);
            return;
        }

        // Only the hostname is a site, and it has to look like one. Pasting a whole URL
        // is the ordinary thing to do and is taken; a sentence is not.
        const cleaned = siteCheck.domain;
        if (!cleaned) return;
        onSave(cleaned, limitPayload, false);
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
    titleId={tab === 'schedule' ? 'wa-schedule-title' : 'wa-limit-title'}
    title={tab === 'schedule' ? $t('webActivityScheduleModalTitle') : $t('webActivityLimitModalTitle')}
    applyLabel={$t('apply')}
    errorMessage={tab === 'schedule' && hasInvalidWindow ? $t('webActivityWindowNoDays') : ''}
    disabled={(tab === 'daily' && noDays) ||
        (tab === 'schedule' && hasInvalidWindow) ||
        (!applyToAll && isNew && !siteCheck.domain)}
    variant="wa-schedule-modal"
    onApply={apply}
    {onClose}
>
    {#if isNew}
        <div class="form-group">
            <label for="wa-limit-site">{$t('webActivityFieldSite')}</label>
            <div class="wa-site-input-row">
                <input
                    id="wa-limit-site"
                    type="text"
                    class:input-error={!!siteError}
                    bind:value={site}
                    placeholder={applyToAll ? $t('webActivityAllSitesPlaceholder') : 'example.com'}
                    disabled={applyToAll}
                    autocomplete="off"
                    spellcheck="false"
                    title={$tt('webActivityFieldSite')}
                />
                <button
                    type="button"
                    class="wa-all-sites-btn"
                    class:selected={applyToAll}
                    aria-pressed={applyToAll}
                    title={$tt('webActivityApplyToAllSitesHint')}
                    onclick={() => {
                        applyToAll = !applyToAll;
                        if (applyToAll) site = '';
                    }}
                >
                    {$t('webActivityBtnAll')}
                </button>
            </div>
            <!-- Always in the layout, spoken only when there is something to say, so a
                 typo does not shove the rest of the form down a line. -->
            <p class="wa-field-warning" aria-live="polite">{siteError}</p>
        </div>
    {/if}

    <div class="wa-tabs" role="tablist">
        <button
            type="button"
            role="tab"
            class="wa-tab"
            class:selected={tab === 'daily'}
            aria-selected={tab === 'daily'}
            onclick={() => selectTab('daily')}
        >
            {$t('webActivityFieldDailyLimit')}
        </button>
        <button
            type="button"
            role="tab"
            class="wa-tab"
            class:selected={tab === 'weekly'}
            aria-selected={tab === 'weekly'}
            onclick={() => selectTab('weekly')}
        >
            {$t('webActivityFieldWeeklyLimit')}
        </button>
        <button
            type="button"
            role="tab"
            class="wa-tab"
            class:selected={tab === 'schedule'}
            aria-selected={tab === 'schedule'}
            onclick={() => selectTab('schedule')}
        >
            {$t('webActivityColSchedule')}
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
                            onclick={() => toggleDailyDay(chip.day)}>{$t(chip.key)}</button
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
        {:else if tab === 'weekly'}
            <!-- A week is 168 hours, and "the whole week" is a real answer: a cap of
                 167 made the largest weekly allowance one hour short of a week for no
                 reason anybody could see. -->
            {@render allowance(
                () => weeklyTime,
                (next) => (weeklyTime = next),
                168,
                'webActivityWeeklyLimitHint',
            )}
        {:else if tab === 'schedule'}
            <div class="form-group">
                <div class="field-label" title={$tt('webActivitySchedulesHint')}>{$t('webActivityFieldSchedules')}</div>

                {#each windows as window, index (index)}
                    <div class="wa-window">
                        <div class="days-selector" title={$tt('webActivityWindowDaysHint')}>
                            {#each DAY_CHIPS as chip (chip.day)}
                                <button
                                    type="button"
                                    class:selected={window.days.includes(chip.day)}
                                    aria-pressed={window.days.includes(chip.day)}
                                    onclick={() => toggleScheduleDay(index, chip.day)}>{$t(chip.key)}</button
                                >
                            {/each}
                        </div>

                        <div class="wa-window-row">
                            <TimeField bind:value={window.start} title={$tt('webActivityFrom')} />
                            <span class="wa-window-arrow" aria-hidden="true">→</span>
                            <TimeField bind:value={window.end} title={$tt('webActivityTo')} />
                            {#if isOvernight(window)}
                                <span class="wa-badge wa-badge-soft" title={$tt('webActivityOvernightHint')}>
                                    {$t('webActivityOvernight')}
                                </span>
                            {/if}
                            <!-- Both controls on the row the hours are on: a window is added
                                 and taken away from where it is being read. -->
                            <button
                                class="wa-icon-btn wa-icon-btn-danger wa-window-remove"
                                type="button"
                                title={$tt('webActivityRemoveWindow')}
                                aria-label={$t('webActivityRemoveWindow')}
                                onclick={() => removeWindow(index)}
                            >
                                <svg width="13" height="13" aria-hidden="true" focusable="false"
                                    ><use href="#wa-close"></use></svg
                                >
                            </button>
                            <button
                                class="wa-icon-btn wa-window-add"
                                type="button"
                                title={$tt('webActivityAddSchedule')}
                                aria-label={$t('webActivityAddSchedule')}
                                onclick={addWindow}
                            >
                                <svg width="14" height="14" aria-hidden="true" focusable="false"
                                    ><use href="#wa-plus"></use></svg
                                >
                            </button>
                        </div>
                    </div>
                {/each}

                {#if !windows.length}
                    <button
                        class="btn wa-window-restore"
                        type="button"
                        title={$tt('webActivityAddSchedule')}
                        onclick={addWindow}
                    >
                        <svg width="12" height="12" aria-hidden="true" focusable="false"
                            ><use href="#wa-plus"></use></svg
                        >
                        <span>{$t('webActivityAddSchedule')}</span>
                    </button>
                {/if}
            </div>
        {/if}
    </div>
</RuleModalShell>
