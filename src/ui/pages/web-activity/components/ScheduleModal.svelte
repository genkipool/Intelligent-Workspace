<script>
    /**
     * [AI INSTRUCTION]
     * WHEN A SITE IS ALLOWED — the clock half of a rule.
     *
     * The windows say when the site *is* open, not when it is shut, because that is
     * the shape the blocker reads (see `webActivitySchema.js`): outside every window
     * the site is blocked, and no windows at all means no restriction by the clock.
     *
     * Every window carries its own weekdays. "Six to eight on weekdays, and all
     * morning at the weekend" is two windows about the same site, and a single row of
     * days shared by both cannot say it. So the days sit inside the window, and adding
     * one gives you a fresh set to tick.
     *
     * There is no "block always" switch: a schedule that lets the site in at no hour
     * is what that means, and one less control that has to agree with another.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt } from '../../../stores/i18nStore.js';
    import TimeField from '../../../components/common/TimeField.svelte';
    import RuleModalShell from './RuleModalShell.svelte';
    import { DAY_CHIPS } from '../ruleFields.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let { domain = '', limit = null, onSave, onClose } = $props();

    const base = WA.normalizeLimit(limit || {});
    const isNew = !domain;
    const stored = base.schedules.filter((schedule) => schedule.start && schedule.end);

    const blankWindow = () => ({ start: '09:00', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6] });

    let site = $state(domain);
    // A dialog opened on a site with no schedule still shows a window: it was opened
    // to set one, and an empty panel with an "add" button is a step that answers
    // nothing. Nothing is stored until Apply is pressed.
    let windows = $state(
        stored.length
            ? stored.map((schedule) => ({
                  start: schedule.start,
                  end: schedule.end,
                  days: [...(schedule.days?.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6])],
              }))
            : [blankWindow()],
    );

    /** A window that ends before it starts runs past midnight, which is worth saying. */
    const isOvernight = (window) => WA.minutesOfDay(window.end) <= WA.minutesOfDay(window.start);

    const hasInvalidWindow = $derived(windows.some((w) => !w.days?.length));

    function toggleDay(index, day) {
        const current = windows[index].days;
        windows[index].days = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    }

    function addWindow() {
        windows = [...windows, blankWindow()];
    }

    function removeWindow(index) {
        windows = windows.filter((_, i) => i !== index);
    }

    function apply() {
        if (hasInvalidWindow) return;
        const cleaned = WA.domainOf(site.includes('://') ? site : `https://${site.trim()}`);
        if (!cleaned) return;
        onSave(cleaned, {
            ...base,
            // The switch is gone from the dialog, so a record that still carries it
            // would be blocked for good with nothing on screen saying why.
            blockAlways: false,
            // A window with no day ticked can never let the site in, and storing it
            // would shut the site out with nothing on screen to explain it.
            schedules: windows
                .filter((window) => window.start && window.end && window.days.length)
                .map((window) => ({ start: window.start, end: window.end, days: [...window.days] })),
        });
    }
</script>

<RuleModalShell
    titleId="wa-schedule-title"
    title={$t('webActivityScheduleModalTitle')}
    applyLabel={$t('apply')}
    errorMessage={hasInvalidWindow ? $t('webActivityWindowNoDays') : ''}
    disabled={hasInvalidWindow || (isNew && !site.trim())}
    variant="wa-schedule-modal"
    onApply={apply}
    {onClose}
>
    {#if isNew}
        <div class="form-group">
            <label for="wa-schedule-site">{$t('webActivityFieldSite')}</label>
            <input
                id="wa-schedule-site"
                type="text"
                bind:value={site}
                placeholder="example.com"
                autocomplete="off"
                spellcheck="false"
            />
        </div>
    {:else}
        <div class="form-group wa-site-group">
            <div class="field-label">{$t('webActivityFieldSite')}</div>
            <p class="wa-modal-site">{domain}</p>
        </div>
    {/if}

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
                            onclick={() => toggleDay(index, chip.day)}>{$t(chip.key)}</button
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
                <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-plus"></use></svg>
                <span>{$t('webActivityAddSchedule')}</span>
            </button>
        {/if}
    </div>
</RuleModalShell>
