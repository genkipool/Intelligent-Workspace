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
    let formTime = $state('00:00');
    let formDate = $state('');
    let formMode = $state('add'); // 'add' | 'edit'
    let editIndex = $state(-1);
    let formError = $state('');

    // ─── Derived ─────────────────────────────────────────────────────────────
    let isRepeating = $derived(selectedDays.length > 0);

    // Day name translation keys (JS Date.getDay(): 0=Sunday)
    const dayKeys = ['daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat'];

    // ─── Reset form when modal opens ─────────────────────────────────────────
    $effect(() => {
        if (show) {
            resetForm();
        }
    });

    // ─── Handlers ────────────────────────────────────────────────────────────
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

        if (schedule.type === 'repeating') {
            selectedDays = [...(schedule.days || [])];
            formTime = schedule.startTime || '00:00';
            formDate = '';
        } else {
            selectedDays = [];
            if (schedule.startDateTime) {
                const [date, time] = schedule.startDateTime.split('T');
                formDate = date;
                formTime = time ? time.substring(0, 5) : '00:00';
            }
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

        let schedule;

        if (isRepeating) {
            schedule = {
                type: 'repeating',
                days: [...selectedDays],
                startTime: formTime,
                query,
                title,
            };
        } else {
            const startDateTime = formDate ? `${formDate}T${formTime}:00` : '';
            if (!startDateTime || new Date(startDateTime) <= new Date()) {
                formError = tFn('scheduleDateTimeMissing');
                return;
            }
            schedule = {
                type: 'onetime',
                startDateTime,
                query,
                hasBeenTriggered: false,
                title,
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
        formTime = '00:00';
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
                                        {schedule.days.map((d) => $t(dayKeys[d])).join(', ')} - {schedule.startTime}
                                    {:else}
                                        {new Date(schedule.startDateTime).toLocaleString()}
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
                                    <div class="field-container time-width">
                                        <div class="field-label">{$t('startTime')}</div>
                                        <TimeField id="gemini-start-time-trigger" bind:value={formTime} />
                                    </div>
                                </div>
                            </div>
                        {:else}
                            <div id="repeating-gemini-schedule-group" class="form-group">
                                <div class="time-range">
                                    <div class="time">
                                        <div class="field-label">{$t('scheduleTime')}</div>
                                        <TimeField id="gemini-start-time-trigger" bind:value={formTime} />
                                    </div>
                                </div>
                            </div>
                        {/if}
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
