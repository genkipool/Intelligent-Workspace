<script>
    import { dismissOnBackdrop } from '../../../actions/dismissOnBackdrop.js';
    import DateField from '../../../components/common/DateField.svelte';
    import TimeField from '../../../components/common/TimeField.svelte';

    let {
        show = false,
        currentThemeForScheduling = null,
        totalScheduleCount = 0,
        schedules = [],
        scheduleEditorState = { mode: 'add', themeName: null, scheduleIndex: -1 },
        selectedDays = [],
        scheduleType = 'onetime',
        scheduleReminder = $bindable(''),
        startDateValue = $bindable(''),
        endDateValue = $bindable(''),
        startTimeTrigger = $bindable('00:00'),
        endTimeTrigger = $bindable('00:00'),
        startTimeOneTimeTrigger = $bindable('00:00'),
        endTimeOneTimeTrigger = $bindable('00:00'),
        scheduleError = $bindable(''),
        MAX_GLOBAL_SCHEDULES = 7,
        onClose = () => {},
        onScroll = () => {},
        onEditSchedule = () => {},
        onDeleteSchedule = () => {},
        onToggleDay = () => {},
        onSaveSchedule = () => {},
        onResetForm = () => {},
        onFetchSchedules = () => {},
        formatDateTime = (s) => s,
        getDayNames = (d) => d,
    } = $props();
</script>

{#if show}
    <div
        id="schedule-modal"
        class="modal-overlay"
        style="display: flex;"
        use:dismissOnBackdrop={onClose}
        onscroll={onScroll}
    >
        <div class="modal-content">
            <section class="section">
                <div class="section-title">
                    <span
                        id="schedule-modal-title"
                        class="createThemeTitle"
                        data-i18n={currentThemeForScheduling ? '' : 'scheduleThemes'}
                        >{currentThemeForScheduling ? currentThemeForScheduling.name : ''}</span
                    >
                    <button id="close-schedule-modal" class="close-button" type="button" onclick={onClose}>x</button>
                </div>
                <h3 class="titleSchedules">
                    <span data-i18n="existingSchedules"></span> (<span id="schedule-count">{totalScheduleCount}</span
                    >/7)
                </h3>
                <ul id="schedules-list">
                    {#each schedules as sch (sch.themeName + '-' + sch.originalIndex)}
                        <li class="schedule-item" tabindex="0">
                            <span class="schedule-type-indicator"
                                >{sch.type === 'onetime'
                                    ? chrome.i18n.getMessage('scheduleTypeDate') || 'Date'
                                    : chrome.i18n.getMessage('scheduleTypeTime') || 'Time'}</span
                            >
                            <div class="schedule-details">
                                <span class="schedule-theme-name">{sch.themeName}</span>
                                <div class="schedule-time-details">
                                    {#if sch.type === 'onetime'}
                                        <div class="schedule-date-row">
                                            <span>{chrome.i18n.getMessage('scheduleFrom') || 'From:'}</span>
                                            <span>{formatDateTime(sch.startDateTime)}</span>
                                        </div>
                                        <div class="schedule-date-row">
                                            <span>{chrome.i18n.getMessage('scheduleTo') || 'To:'}</span>
                                            <span>{formatDateTime(sch.endDateTime)}</span>
                                        </div>
                                    {:else}
                                        <span>{getDayNames(sch.days)}: {sch.startTime} - {sch.endTime}</span>
                                    {/if}
                                </div>
                                {#if sch.reminder}
                                    <div class="schedule-reminder-text" title={sch.reminder}>{sch.reminder}</div>
                                {/if}
                            </div>
                            <button
                                class="edit-schedule-btn"
                                type="button"
                                data-i18n-title="editSchedule"
                                aria-label="Edit schedule"
                                onclick={() => onEditSchedule(sch)}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path
                                        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                    <path
                                        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 9.5-9.5z"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                </svg>
                            </button>
                            <button
                                class="delete-schedule-btn"
                                type="button"
                                data-i18n-title="deleteSchedule"
                                aria-label="Delete schedule"
                                onclick={() => onDeleteSchedule(sch.themeName, sch.originalIndex)}>x</button
                            >
                        </li>
                    {/each}
                </ul>
                {#if schedules.length === 0}
                    <p id="no-schedules-message" data-i18n="noSchedulesFound"></p>
                {/if}

                {#if currentThemeForScheduling && (totalScheduleCount < MAX_GLOBAL_SCHEDULES || scheduleEditorState.mode === 'edit')}
                    <div id="add-schedule-section">
                        <h3
                            id="schedule-form-title"
                            data-i18n={scheduleEditorState.mode === 'edit' ? 'editScheduleTitle' : 'addNewSchedule'}
                        ></h3>

                        <div class="form-group">
                            <label data-i18n="daysOfWeek"></label>
                            <div id="schedule-days" class="days-selector">
                                {#each [{ d: 1, k: 'dayMon' }, { d: 2, k: 'dayTue' }, { d: 3, k: 'dayWed' }, { d: 4, k: 'dayThu' }, { d: 5, k: 'dayFri' }, { d: 6, k: 'daySat' }, { d: 0, k: 'daySun' }] as day (day.d)}
                                    <button
                                        class:selected={selectedDays.includes(day.d)}
                                        type="button"
                                        data-i18n={day.k}
                                        onclick={() => onToggleDay(day.d)}
                                    ></button>
                                {/each}
                            </div>
                        </div>

                        {#if scheduleType === 'onetime'}
                            <div id="onetime-schedule-group" class="form-group">
                                <div class="datetime-row">
                                    <div class="field-container">
                                        <label data-i18n="startDateTime"></label>
                                        <DateField id="start-date-trigger" bind:value={startDateValue} />
                                    </div>
                                    <div class="field-container time-width">
                                        <label data-i18n="startTime"></label>
                                        <TimeField
                                            id="start-time-onetime-trigger"
                                            bind:value={startTimeOneTimeTrigger}
                                        />
                                    </div>
                                </div>
                                <div class="datetime-row">
                                    <div class="field-container">
                                        <label data-i18n="endDateTime"></label>
                                        <DateField id="end-date-trigger" bind:value={endDateValue} />
                                    </div>
                                    <div class="field-container time-width">
                                        <label data-i18n="endTime"></label>
                                        <TimeField id="end-time-onetime-trigger" bind:value={endTimeOneTimeTrigger} />
                                    </div>
                                </div>
                            </div>
                        {:else}
                            <div id="repeating-schedule-group" class="form-group">
                                <div class="time-range">
                                    <div class="start-time time">
                                        <label data-i18n="startTime"></label>
                                        <TimeField id="start-time-trigger" bind:value={startTimeTrigger} />
                                    </div>
                                    <div class="end-time time">
                                        <label data-i18n="endTime"></label>
                                        <TimeField id="end-time-trigger" bind:value={endTimeTrigger} />
                                    </div>
                                </div>
                            </div>
                        {/if}

                        <div class="form-group">
                            <label for="schedule-reminder" data-i18n="scheduleReminderLabel"></label>
                            <textarea
                                id="schedule-reminder"
                                maxlength="200"
                                data-i18n-placeholder="scheduleReminderPlaceholder"
                                bind:value={scheduleReminder}
                                oninput={() => (scheduleError = '')}
                            ></textarea>
                        </div>

                        <p class="schedule-storage-info" data-i18n="scheduleStorageInfo"></p>
                        <button
                            id="save-schedule-btn"
                            class="button"
                            class:error-state={scheduleError}
                            data-i18n={scheduleEditorState.mode === 'edit' ? 'updateSchedule' : 'addSchedule'}
                            onclick={async (e) => {
                                const ok = await onSaveSchedule();
                                if (ok && (e.ctrlKey || e.metaKey)) {
                                    onResetForm();
                                    onFetchSchedules(currentThemeForScheduling?.name);
                                }
                            }}
                        ></button>
                        {#if scheduleError}
                            <div id="schedule-error" class="modal-error-message">{scheduleError}</div>
                        {/if}
                    </div>
                {/if}
            </section>
        </div>
    </div>
{/if}
