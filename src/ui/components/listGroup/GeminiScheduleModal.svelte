<script>
    import { get } from 'svelte/store';
    import DateField from '../common/DateField.svelte';
    import TimeField from '../common/TimeField.svelte';
    import { t, tt } from '../../stores/i18nStore.js';

    let { show = false, schedules = [], onClose = () => {}, onSave = () => {}, onDelete = () => {} } = $props();

    // ─── Form State ──────────────────────────────────────────────────────────
    let formTitle = $state('');
    let formQuery = $state('');
    let selectedDays = $state([]);
    /**
     * Every time of day the query runs at. One query can be launched several times
     * on the same date or on each of the chosen weekdays, so this is a list rather
     * than a single value; a schedule saved before this existed comes back as a list
     * of one.
     */
    let formTimes = $state(['00:00']);
    let formDate = $state('');
    let formMode = $state('add'); // 'add' | 'edit'
    let editIndex = $state(-1);
    let formError = $state('');

    const MAX_TIMES = 6;

    // ─── Derived ─────────────────────────────────────────────────────────────
    let isRepeating = $derived(selectedDays.length > 0);
    let canAddTime = $derived(formTimes.length < MAX_TIMES);

    // Day name translation keys (JS Date.getDay(): 0=Sunday)
    const dayKeys = ['daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat'];

    // ─── Reset form when modal opens ─────────────────────────────────────────
    $effect(() => {
        if (show) {
            resetForm();
        }
    });

    // ─── Handlers ────────────────────────────────────────────────────────────
    /** The times a saved schedule runs at, whichever shape it was stored in. */
    function timesOf(schedule) {
        if (Array.isArray(schedule.times) && schedule.times.length > 0) return [...schedule.times];
        if (schedule.startTime) return [schedule.startTime];
        if (schedule.startDateTime) return [schedule.startDateTime.split('T')[1]?.substring(0, 5) || '00:00'];
        return ['00:00'];
    }

    function addTime() {
        if (!canAddTime) return;
        formTimes = [...formTimes, '00:00'];
    }

    function removeTime(index) {
        if (formTimes.length <= 1) return;
        formTimes = formTimes.filter((_, i) => i !== index);
    }

    function handleDayToggle(day) {
        if (selectedDays.includes(day)) {
            selectedDays = selectedDays.filter((d) => d !== day);
        } else {
            selectedDays = [...selectedDays, day];
        }
    }

    function handleEdit(index) {
        const schedule = schedules[index];
        if (!schedule) return;

        formMode = 'edit';
        editIndex = index;
        formTitle = schedule.title || '';
        formQuery = schedule.query || '';
        formError = '';

        formTimes = timesOf(schedule);

        if (schedule.type === 'repeating') {
            selectedDays = [...(schedule.days || [])];
            formDate = '';
        } else {
            selectedDays = [];
            formDate = schedule.startDate || (schedule.startDateTime || '').split('T')[0] || '';
        }
    }

    function handleDelete(index) {
        onDelete(index);
    }

    function handleSave() {
        formError = '';

        const tFn = get(t);
        const title = formTitle.trim();
        const query = formQuery.trim();

        if (!title) {
            formError = tFn('geminiTitleIsRequired');
            return;
        }

        if (!query) {
            formError = tFn('geminiQueryIsRequired');
            return;
        }

        // Two rows set to the same time would only ever fire once, so they are
        // folded together instead of being saved as a duplicate that never runs.
        const times = [...new Set(formTimes)].sort();

        let schedule;

        if (isRepeating) {
            schedule = {
                type: 'repeating',
                days: [...selectedDays],
                times,
                // Kept so a build that does not know about several times still finds
                // the first one where it expects it.
                startTime: times[0],
                query,
                title,
                firedSlots: [],
            };
        } else {
            if (!formDate) {
                formError = tFn('scheduleDateTimeMissing');
                return;
            }
            const moments = times.map((time) => new Date(`${formDate}T${time}:00`));
            if (moments.every((moment) => moment <= new Date())) {
                formError = tFn('scheduleDateTimeMissing');
                return;
            }
            schedule = {
                type: 'onetime',
                startDate: formDate,
                times,
                startDateTime: `${formDate}T${times[0]}:00`,
                query,
                hasBeenTriggered: false,
                title,
                firedSlots: [],
            };
        }

        onSave({ schedule, mode: formMode, editIndex });

        if (formMode === 'add') {
            resetForm();
        }
    }

    function resetForm() {
        formTitle = '';
        formQuery = '';
        selectedDays = [];
        formTimes = ['00:00'];
        formDate = '';
        formMode = 'add';
        editIndex = -1;
        formError = '';
    }
</script>

{#if show}
    <div
        id="gemini-schedule-modal"
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gemini-schedule-modal-title"
        tabindex="-1"
        onclick={onClose}
        onkeydown={(e) => {
            if (e.key === 'Escape') onClose();
        }}
    >
        <div class="modal-content gemini-schedule-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 id="gemini-schedule-modal-title">{$t('scheduleGeminiQuery')}</h2>
                <button
                    type="button"
                    id="close-gemini-schedule-modal"
                    class="close-modal-btn"
                    onclick={onClose}
                    title={$tt('close')}>&times;</button
                >
            </div>

            <div class="modal-body">
                <h3 class="titleSchedules">
                    <span>{$t('existingSchedules')}</span> ({schedules.length}/7)
                </h3>

                <ul id="gemini-schedules-list">
                    {#if schedules.length > 0}
                        {#each schedules as schedule, i (schedule.title + schedule.query + (schedule.startDateTime || schedule.startTime || ''))}
                            <li class="schedule-item">
                                <div class="schedule-item-header">
                                    <span class="schedule-query-text" title={schedule.query}>{schedule.title}</span>
                                    <div class="schedule-item-actions">
                                        <button
                                            type="button"
                                            class="edit-schedule-btn"
                                            onclick={() => handleEdit(i)}
                                            title={$tt('editGeminiQuery')}
                                        >
                                            <svg width="20" height="20">
                                                <use href="#icon-edit" />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            class="delete-schedule-btn"
                                            onclick={() => handleDelete(i)}
                                            title={$tt('deleteSchedule')}
                                        >
                                            &times;
                                        </button>
                                    </div>
                                </div>
                                <div class="schedule-details">
                                    {#if schedule.type === 'repeating'}
                                        {schedule.days.map((d) => $t(dayKeys[d])).join(', ')} - {timesOf(schedule).join(
                                            ', ',
                                        )}
                                    {:else}
                                        {new Date(schedule.startDateTime).toLocaleDateString()} - {timesOf(
                                            schedule,
                                        ).join(', ')}
                                    {/if}
                                </div>
                            </li>
                        {/each}
                    {/if}
                </ul>
                {#if schedules.length === 0}
                    <p id="no-gemini-schedules-message">{$t('noSchedulesFound')}</p>
                {/if}

                {#if schedules.length < 7}
                    <div id="add-gemini-schedule-section">
                        <h3 class="section-title">{$t('addNewSchedule')}</h3>

                        <div class="form-group">
                            <label for="gemini-schedule-title">{$t('conversationTitle')}</label>
                            <input
                                type="text"
                                id="gemini-schedule-title"
                                bind:value={formTitle}
                                maxlength="40"
                                placeholder={$t('conversationTitlePlaceholder')}
                                autocomplete="off"
                                translate="no"
                            />
                        </div>

                        <div class="form-group">
                            <label for="gemini-schedule-query">{$t('geminiQuery')}</label>
                            <textarea
                                id="gemini-schedule-query"
                                bind:value={formQuery}
                                maxlength="1000"
                                placeholder={$t('geminiQueryPlaceholder')}
                            ></textarea>
                        </div>

                        <div class="form-group">
                            <div class="field-label">{$t('daysOfWeek')}</div>
                            <div id="gemini-schedule-days" class="days-selector">
                                <button
                                    type="button"
                                    class:selected={selectedDays.includes(1)}
                                    onclick={() => handleDayToggle(1)}>{$t('dayMon')}</button
                                >
                                <button
                                    type="button"
                                    class:selected={selectedDays.includes(2)}
                                    onclick={() => handleDayToggle(2)}>{$t('dayTue')}</button
                                >
                                <button
                                    type="button"
                                    class:selected={selectedDays.includes(3)}
                                    onclick={() => handleDayToggle(3)}>{$t('dayWed')}</button
                                >
                                <button
                                    type="button"
                                    class:selected={selectedDays.includes(4)}
                                    onclick={() => handleDayToggle(4)}>{$t('dayThu')}</button
                                >
                                <button
                                    type="button"
                                    class:selected={selectedDays.includes(5)}
                                    onclick={() => handleDayToggle(5)}>{$t('dayFri')}</button
                                >
                                <button
                                    type="button"
                                    class:selected={selectedDays.includes(6)}
                                    onclick={() => handleDayToggle(6)}>{$t('daySat')}</button
                                >
                                <button
                                    type="button"
                                    class:selected={selectedDays.includes(0)}
                                    onclick={() => handleDayToggle(0)}>{$t('daySun')}</button
                                >
                            </div>
                        </div>

                        {#if !isRepeating}
                            <div id="onetime-gemini-schedule-group" class="form-group">
                                <div class="datetime-row">
                                    <div class="field-container">
                                        <div class="field-label">{$t('scheduleDateTime')}</div>
                                        <DateField id="gemini-start-date-trigger" bind:value={formDate} />
                                    </div>
                                </div>
                            </div>
                        {/if}

                        <!-- The same query can be launched at several times of day, on
                             the chosen date or on each of the chosen weekdays. -->
                        <div id="gemini-schedule-times" class="form-group">
                            <div class="field-label">{$t('scheduleTimes')}</div>
                            <div class="schedule-times-list">
                                {#each formTimes as _, index (index)}
                                    <div class="schedule-time-row">
                                        <TimeField
                                            id={`gemini-start-time-trigger${index === 0 ? '' : `-${index}`}`}
                                            bind:value={formTimes[index]}
                                        />
                                        <button
                                            type="button"
                                            class="remove-time-btn"
                                            disabled={formTimes.length <= 1}
                                            onclick={() => removeTime(index)}
                                            title={$tt('removeScheduleTime')}
                                            aria-label={$tt('removeScheduleTime')}>&times;</button
                                        >
                                    </div>
                                {/each}
                            </div>
                            <button
                                type="button"
                                id="add-gemini-schedule-time"
                                class="add-time-btn"
                                disabled={!canAddTime}
                                onclick={addTime}
                            >
                                + {$t('addScheduleTime')}
                            </button>
                        </div>
                    </div>
                {/if}
            </div>

            {#if schedules.length < 7}
                <div class="modal-actions">
                    <button
                        type="button"
                        id="save-gemini-schedule-btn"
                        class:error-state={!!formError}
                        onclick={handleSave}
                    >
                        {$t(formMode === 'add' ? 'addSchedule' : 'updateSchedule')}
                    </button>
                    {#if formError}
                        <div class="modal-error-message">{formError}</div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
{/if}
