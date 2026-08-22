<script>
    /**
     * The editor for one site's limit: a daily allowance, hours it is blocked
     * outright, and which category it belongs to.
     *
     * The form holds a copy and only hands it back on save, so closing it never
     * half-applies a change.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt, currentLang } from '../../../stores/i18nStore.js';
    import { weekdayNames } from '../../../services/dashboard/format.js';
    import { dismissOnBackdrop } from '../../../actions/dismissOnBackdrop.js';
    import NumberField from '../../../components/common/NumberField.svelte';
    import SelectField from '../../../components/common/SelectField.svelte';
    import TimeField from '../../../components/common/TimeField.svelte';
    import ToggleButton from '../../../components/common/ToggleButton.svelte';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let { domain = '', limit = null, onSave, onClose } = $props();

    const base = WA.normalizeLimit(limit || {});

    let site = $state(domain);
    let enabled = $state(base.enabled);
    let blockAlways = $state(base.blockAlways);
    let limitHours = $state(Math.floor(base.dailyLimitSeconds / 3600));
    let limitMinutes = $state(Math.round((base.dailyLimitSeconds % 3600) / 60));
    let category = $state(base.category || '');
    let notifyAtPercent = $state(base.notifyAtPercent ?? 0);
    let schedules = $state(base.schedules.map((s) => ({ ...s, days: [...(s.days || [0, 1, 2, 3, 4, 5, 6])] })));

    const dayNames = $derived(weekdayNames($currentLang, 'short'));
    const isNew = !limit;

    function addSchedule() {
        schedules = [...schedules, { start: '22:00', end: '07:00', days: [0, 1, 2, 3, 4, 5, 6] }];
    }

    function removeSchedule(index) {
        schedules = schedules.filter((_, i) => i !== index);
    }

    function toggleDay(index, day) {
        const current = schedules[index].days;
        schedules[index].days = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    }

    function save() {
        // Whatever the user typed, only the hostname is a site: pasting a full URL is
        // the obvious thing to do and should not silently create a limit that matches
        // nothing.
        const cleaned = WA.domainOf(site.includes('://') ? site : `https://${site.trim()}`);
        if (!cleaned) return;
        onSave(cleaned, {
            enabled,
            blockAlways,
            dailyLimitSeconds: Number(limitHours) * 3600 + Number(limitMinutes) * 60,
            schedules: schedules.filter((s) => s.start && s.end),
            // Zero is 'no warning for this site'; null would mean 'use the general setting',
            // and there is no longer a settings panel to hold one.
            notifyAtPercent: Number(notifyAtPercent) || 0,
            category: category || null,
            snoozeUntil: base.snoozeUntil,
        });
    }
</script>

<div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="wa-limit-title"
    tabindex="-1"
    use:dismissOnBackdrop={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
>
    <div class="modal-content wa-limit-modal" role="none" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
            <h2 id="wa-limit-title">{$t(isNew ? 'webActivityAddLimit' : 'webActivityEditLimit')}</h2>
            <button type="button" class="close-modal-btn" title={$tt('close')} onclick={onClose}>&times;</button>
        </div>

        <div class="modal-body wa-form">
            <label class="wa-field">
                <span class="wa-field-label">{$t('webActivityFieldSite')}</span>
                <input
                    type="text"
                    bind:value={site}
                    readonly={!isNew}
                    placeholder="example.com"
                    title={$tt('webActivityFieldSite')}
                />
            </label>

            <fieldset class="wa-field">
                <legend class="wa-field-label">{$t('webActivityFieldDailyLimit')}</legend>
                <div class="wa-inline">
                    <NumberField
                        bind:value={limitHours}
                        min={0}
                        max={23}
                        digits={2}
                        ariaLabel={$t('webActivityHours')}
                    />
                    <span class="wa-muted">{$t('webActivityHoursShort')}</span>
                    <NumberField
                        bind:value={limitMinutes}
                        min={0}
                        max={59}
                        step={5}
                        digits={2}
                        ariaLabel={$t('webActivityMinutes')}
                    />
                    <span class="wa-muted">{$t('webActivityMinutesShort')}</span>
                </div>
                <span class="wa-hint">{$t('webActivityDailyLimitHint')}</span>
            </fieldset>

            <div class="wa-field">
                <span class="wa-field-label">{$t('webActivityBlockAlways')}</span>
                <ToggleButton
                    pressed={blockAlways}
                    label={$t(blockAlways ? 'webActivityOn' : 'webActivityOff')}
                    title={$tt('webActivityBlockAlways')}
                    onchange={(next) => (blockAlways = next)}
                />
                <span class="wa-hint">{$t('webActivityBlockAlwaysHint')}</span>
            </div>

            <fieldset class="wa-field">
                <legend class="wa-field-label">{$t('webActivityFieldSchedules')}</legend>
                <span class="wa-hint">{$t('webActivitySchedulesHint')}</span>
                {#each schedules as schedule, index (index)}
                    <div class="wa-schedule">
                        <div class="wa-inline">
                            <TimeField bind:value={schedule.start} title={$tt('webActivityFrom')} />
                            <span class="wa-muted">→</span>
                            <TimeField bind:value={schedule.end} title={$tt('webActivityTo')} />
                            <button
                                class="wa-icon-btn wa-icon-btn-danger"
                                type="button"
                                title={$tt('webActivityRemoveSchedule')}
                                aria-label={$t('webActivityRemoveSchedule')}
                                onclick={() => removeSchedule(index)}
                            >
                                <svg width="14" height="14" aria-hidden="true" focusable="false"
                                    ><use href="#wa-close"></use></svg
                                >
                            </button>
                        </div>
                        <div class="wa-days">
                            {#each dayNames as name, day (day)}
                                <button
                                    type="button"
                                    class="filter-chip"
                                    class:active={schedule.days.includes(day)}
                                    onclick={() => toggleDay(index, day)}>{name}</button
                                >
                            {/each}
                        </div>
                    </div>
                {/each}
                <button class="btn" type="button" onclick={addSchedule}>
                    <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-plus"></use></svg>
                    <span>{$t('webActivityAddSchedule')}</span>
                </button>
            </fieldset>

            <div class="wa-field">
                <span class="wa-field-label">{$t('webActivityFieldCategory')}</span>
                <SelectField
                    value={category}
                    title={$tt('webActivityFieldCategory')}
                    ariaLabel={$t('webActivityFieldCategory')}
                    options={[
                        { value: '', label: $t('webActivityCategoryAuto') },
                        ...WA.CATEGORIES.map((id) => ({ value: id, label: $t('webActivityCategory_' + id) })),
                    ]}
                    onchange={(next) => (category = next)}
                />
            </div>

            <div class="wa-field">
                <span class="wa-field-label">{$t('webActivityFieldNotifyAt')}</span>
                <NumberField
                    bind:value={notifyAtPercent}
                    min={0}
                    max={100}
                    step={5}
                    digits={3}
                    ariaLabel={$t('webActivityFieldNotifyAt')}
                />
                <span class="wa-hint">{$t('webActivityNotifyAtHint')}</span>
            </div>

            <div class="wa-field">
                <span class="wa-field-label">{$t('webActivityLimitEnabled')}</span>
                <ToggleButton
                    pressed={enabled}
                    label={$t(enabled ? 'webActivityOn' : 'webActivityOff')}
                    title={$tt('webActivityLimitEnabled')}
                    onchange={(next) => (enabled = next)}
                />
                <span class="wa-hint">{$t('webActivityLimitEnabledHint')}</span>
            </div>
        </div>

        <div class="modal-actions">
            <button type="button" class="modal-btn-save" onclick={save}>{$t('save')}</button>
            <button type="button" class="modal-btn-cancel" onclick={onClose}>{$t('cancel')}</button>
        </div>
    </div>
</div>
