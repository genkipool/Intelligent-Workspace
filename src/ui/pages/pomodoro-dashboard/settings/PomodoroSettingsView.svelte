<script>
    /**
     * [AI INSTRUCTION]
     * THE SETTINGS PAGE OF THE POMODORO DASHBOARD.
     *
     * A view of this page, not a second one: the sidebar and the header stay where they
     * are and only the main column changes, exactly as the web activity dashboard does
     * it. Everything visual comes from `src/styles/settings-page.css`, which both
     * dashboards wear, and every control is one of the shared field components.
     *
     * THE SETTINGS ARE NOT THIS PAGE'S. They belong to the timer, which runs in the
     * service worker and is drawn by the panel in the group list and by the pomodoro
     * side panel. `pomodoroSettingsService.js` owns the reads, the writes and the
     * subscription; this file is a form over it. Two consequences worth keeping:
     *
     *   - Every edit is written through immediately. There is no Save button because
     *     there is nothing to save to — the panel that is open in another window has to
     *     show the new duration now, not when this page is done being edited.
     *   - The subscription is what makes it work the other way round, so a change made
     *     in either panel moves the controls here while they are on screen.
     *
     * WHICH SECTIONS ARE SHOWN depends on the method, and it mirrors what the panel's
     * own drawer does: the cycle belongs to the pomodoro, the countdown fields to the
     * timer, the end moment to the clock. Showing all of them at once would be a page
     * of settings three quarters of which do nothing.
     */
    import { onDestroy, onMount } from 'svelte';
    import { t, tt } from '../../../stores/i18nStore.js';
    import { initNumberSpinnerArrows } from '../../../../utils/numberSpinner.js';
    import NumberField from '../../../components/common/NumberField.svelte';
    import ToggleButton from '../../../components/common/ToggleButton.svelte';
    import DateField from '../../../components/common/DateField.svelte';
    import TimeField from '../../../components/common/TimeField.svelte';
    import {
        POMODORO_METHODS,
        readPomodoroSettings,
        saveLocalPomodoroSettings,
        savePomodoroMethod,
        savePomodoroSettings,
        watchPomodoroSettings,
    } from '../../../services/pomodoroSettingsService.js';

    let settings = $state(null);
    let local = $state(null);
    let method = $state('pomodoro');

    /**
     * Whether the clock is running. Changing a duration mid-session restarts it — the
     * worker clears the alarm on `pomodoroSaveSettings` — so the fields that would do
     * that are held until it stops, the way the panel holds its method buttons.
     */
    let running = $state(false);

    let unwatch = null;

    onMount(async () => {
        initNumberSpinnerArrows();
        const initial = await readPomodoroSettings();
        settings = initial.settings;
        local = initial.local;
        method = initial.method;
        running = await isRunning();

        unwatch = watchPomodoroSettings((change) => {
            if (change.settings) settings = change.settings;
            if (change.running !== undefined) running = change.running;
            if (change.local) local = change.local;
            if (change.method) method = change.method;
        });
    });

    onDestroy(() => unwatch?.());

    async function isRunning() {
        const resp = await chrome.runtime.sendMessage({ action: 'pomodoroGetState' }).catch(() => null);
        return !!resp?.state?.isRunning;
    }

    /** Optimistic, then corrected by whatever the worker settled on. */
    async function patch(next) {
        settings = { ...settings, ...next };
        const settled = await savePomodoroSettings(next);
        if (settled) settings = settled;
        // The worker clears the alarm on every settings write, so by the time it has
        // answered the clock is stopped whatever it was doing before.
        running = false;
    }

    async function patchLocal(next) {
        local = { ...local, ...next };
        local = await saveLocalPomodoroSettings(next);
    }

    async function chooseMethod(next) {
        if (next === method) return;
        method = next;
        await savePomodoroMethod(next);
    }

    /** Minutes in the boxes, seconds in the store. */
    const mins = (seconds) => Math.max(1, Math.round(seconds / 60));

    /** `tiempoDate` is a timestamp in the store and `YYYY-MM-DD` in the field. */
    const endDate = $derived.by(() => {
        if (!local?.tiempoDate) return '';
        const d = new Date(local.tiempoDate);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    const endTime = $derived(local?.tiempoHH != null ? `${local.tiempoHH}:${local.tiempoMM ?? '00'}` : '');

    function setEndDate(value) {
        if (!value) return patchLocal({ tiempoDate: null });
        const [y, m, d] = value.split('-').map(Number);
        return patchLocal({ tiempoDate: new Date(y, m - 1, d).getTime() });
    }

    function setEndTime(value) {
        const [hh, mm] = (value || '00:00').split(':');
        return patchLocal({ tiempoHH: hh, tiempoMM: mm });
    }

    const onOff = (on) => $t(on ? 'toggleOn' : 'toggleOff');
</script>

{#if settings && local}
    <div class="settings-page pomo-settings">
        <header class="set-hero">
            <div>
                <h1 class="set-title">{$t('pomodoroSettingsTitle')}</h1>
                <p class="set-subtitle">{$t('pomodoroSettingsSubtitle')}</p>
            </div>
        </header>

        <h2 class="set-head" title={$tt('pomodoroMethodHint')}>{$t('pomodoroMethodLabel')}</h2>
        <section class="set-section">
            <div class="set-block">
                <p class="set-note">{$t('pomodoroSettingsShared')}</p>
                <div class="set-choice" role="group" aria-label={$t('pomodoroMethodLabel')}>
                    {#each POMODORO_METHODS as option (option.id)}
                        <button
                            type="button"
                            class="set-choice-btn"
                            class:is-active={method === option.id}
                            aria-pressed={method === option.id}
                            disabled={running}
                            title={$tt(option.titleKey)}
                            onclick={() => chooseMethod(option.id)}
                        >
                            {$t(option.labelKey)}
                        </button>
                    {/each}
                </div>
            </div>
        </section>

        <h2 class="set-head">{$t('pomodoroSettingsProject')}</h2>
        <section class="set-section">
            <div class="set-block">
                <div class="set-rows">
                    <div class="set-row">
                        <span class="set-row-text">
                            <span class="set-row-name">{$t('pomodoroProjectName')}</span>
                            <span class="set-row-note">{$t('pomodoroProjectNameHint')}</span>
                        </span>
                        <span class="set-row-control set-row-control-text">
                            <input
                                type="text"
                                class="set-text-input"
                                maxlength="18"
                                value={settings.projectName}
                                aria-label={$t('pomodoroProjectName')}
                                onchange={(e) => patch({ projectName: e.currentTarget.value.trim() })}
                            />
                        </span>
                    </div>

                    <div class="set-row">
                        <span class="set-row-text">
                            <span class="set-row-name">{$t('pomodoroProjectTag')}</span>
                            <span class="set-row-note">{$t('pomodoroProjectTagHint')}</span>
                        </span>
                        <span class="set-row-control set-row-control-text">
                            <input
                                type="text"
                                class="set-text-input"
                                placeholder="#tag"
                                value={settings.projectTag}
                                aria-label={$t('pomodoroProjectTag')}
                                onchange={(e) => patch({ projectTag: e.currentTarget.value.trim() })}
                            />
                        </span>
                    </div>

                    <div class="set-row">
                        <span class="set-row-text">
                            <span class="set-row-name">{$t('pomodoroProjectFolder')}</span>
                            <span class="set-row-note">{$t('pomodoroProjectFolderHint')}</span>
                        </span>
                        <span class="set-row-control set-row-control-text">
                            <input
                                type="text"
                                class="set-text-input"
                                placeholder="/"
                                value={settings.projectFolder}
                                aria-label={$t('pomodoroProjectFolder')}
                                onchange={(e) => patch({ projectFolder: e.currentTarget.value.trim() })}
                            />
                        </span>
                    </div>
                </div>
            </div>
        </section>

        {#if method === 'pomodoro'}
            <h2 class="set-head">{$t('pomodoroSettingsTimers')}</h2>
            <section class="set-section">
                <div class="set-block">
                    <div class="set-rows">
                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroWorkDuration')}</span>
                                <span class="set-row-note">{$t('pomodoroWorkDurationHint')}</span>
                            </span>
                            <span class="set-row-control">
                                <NumberField
                                    wide
                                    value={mins(settings.workDuration)}
                                    min={1}
                                    max={180}
                                    ariaLabel={$t('pomodoroWorkDuration')}
                                    onchange={(next) => patch({ workDuration: next * 60 })}
                                />
                                <span class="set-unit">{$t('unitMinutesShort')}</span>
                            </span>
                        </div>

                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroShortDuration')}</span>
                                <span class="set-row-note">{$t('pomodoroShortDurationHint')}</span>
                            </span>
                            <span class="set-row-control">
                                <NumberField
                                    wide
                                    value={mins(settings.shortBreak)}
                                    min={1}
                                    max={120}
                                    ariaLabel={$t('pomodoroShortDuration')}
                                    onchange={(next) => patch({ shortBreak: next * 60 })}
                                />
                                <span class="set-unit">{$t('unitMinutesShort')}</span>
                            </span>
                        </div>

                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroLongDuration')}</span>
                                <span class="set-row-note">{$t('pomodoroLongDurationHint')}</span>
                            </span>
                            <span class="set-row-control">
                                <NumberField
                                    wide
                                    value={mins(settings.longBreak)}
                                    min={1}
                                    max={180}
                                    ariaLabel={$t('pomodoroLongDuration')}
                                    onchange={(next) => patch({ longBreak: next * 60 })}
                                />
                                <span class="set-unit">{$t('unitMinutesShort')}</span>
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            <h2 class="set-head" title={$tt('pomodoroSettingsCyclesTitle')}>{$t('pomodoroSettingsCycles')}</h2>
            <section class="set-section">
                <div class="set-block">
                    <div class="set-rows">
                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroSessionsBeforeLong')}</span>
                                <span class="set-row-note">{$t('pomodoroSessionsBeforeLongHint')}</span>
                            </span>
                            <span class="set-row-control">
                                <NumberField
                                    wide
                                    value={settings.sessionsBeforeLong}
                                    min={1}
                                    max={12}
                                    digits={2}
                                    ariaLabel={$t('pomodoroSessionsBeforeLong')}
                                    onchange={(next) => patch({ sessionsBeforeLong: next })}
                                />
                            </span>
                        </div>

                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroEndAfter')}</span>
                                <span class="set-row-note">{$t('pomodoroEndAfterHint')}</span>
                            </span>
                            <span class="set-row-control">
                                <NumberField
                                    wide
                                    value={settings.endAfter}
                                    min={1}
                                    max={99}
                                    digits={2}
                                    ariaLabel={$t('pomodoroEndAfter')}
                                    onchange={(next) => patch({ endAfter: next })}
                                />
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        {/if}

        {#if method === 'temporizador'}
            <h2 class="set-head">{$t('pomodoroSettingsTimers')}</h2>
            <section class="set-section">
                <div class="set-block">
                    <div class="set-rows">
                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroMethodTemporizador')}</span>
                                <span class="set-row-note">{$t('pomodoroTimerDurationHint')}</span>
                            </span>
                            <span class="set-row-fields">
                                <span class="set-field">
                                    <span class="set-field-label">{$t('pomodoroTimerHours')}</span>
                                    <span class="set-field-control">
                                        <NumberField
                                            value={local.timerHours}
                                            min={0}
                                            max={23}
                                            digits={2}
                                            ariaLabel={$t('pomodoroTimerHours')}
                                            onchange={(next) => patchLocal({ timerHours: next })}
                                        />
                                        <span class="set-unit">{$t('unitHoursShort')}</span>
                                    </span>
                                </span>
                                <span class="set-field">
                                    <span class="set-field-label">{$t('pomodoroTimerMinutes')}</span>
                                    <span class="set-field-control">
                                        <NumberField
                                            value={local.timerMinutes}
                                            min={0}
                                            max={59}
                                            digits={2}
                                            ariaLabel={$t('pomodoroTimerMinutes')}
                                            onchange={(next) => patchLocal({ timerMinutes: next })}
                                        />
                                        <span class="set-unit">{$t('unitMinutesShort')}</span>
                                    </span>
                                </span>
                                <span class="set-field">
                                    <span class="set-field-label">{$t('pomodoroTimerSeconds')}</span>
                                    <span class="set-field-control">
                                        <NumberField
                                            value={local.timerSeconds}
                                            min={0}
                                            max={59}
                                            digits={2}
                                            ariaLabel={$t('pomodoroTimerSeconds')}
                                            onchange={(next) => patchLocal({ timerSeconds: next })}
                                        />
                                        <span class="set-unit">{$t('unitSecondsShort')}</span>
                                    </span>
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        {/if}

        {#if method === 'tiempo'}
            <h2 class="set-head">{$t('pomodoroEndTime')}</h2>
            <section class="set-section">
                <div class="set-block">
                    <div class="set-rows">
                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroEndTime')}</span>
                                <span class="set-row-note">{$t('pomodoroEndTimeHint')}</span>
                            </span>
                            <span class="set-row-fields">
                                <span class="set-field">
                                    <span class="set-field-label">{$t('pomodoroEndDate')}</span>
                                    <DateField value={endDate} onchange={setEndDate} />
                                </span>
                                <span class="set-field">
                                    <span class="set-field-label">{$t('pomodoroEndTimeLabel')}</span>
                                    <TimeField
                                        value={endTime}
                                        placeholder="--:--"
                                        suggestNow={true}
                                        onchange={setEndTime}
                                    />
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        {/if}

        <h2 class="set-head">{$t('pomodoroSettingsOptions')}</h2>
        <section class="set-section">
            <div class="set-block">
                <div class="set-rows">
                    {#if method === 'cronometro' || method === 'temporizador'}
                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroMethodPauseAsStop')}</span>
                                <span class="set-row-note">{$t('pomodoroMethodPauseAsStopHint')}</span>
                            </span>
                            <span class="set-row-control">
                                <ToggleButton
                                    variant="rounded"
                                    pressed={method === 'cronometro' ? local.cronometroStop : local.temporizadorStop}
                                    label={onOff(
                                        method === 'cronometro' ? local.cronometroStop : local.temporizadorStop,
                                    )}
                                    title={$tt('pomodoroMethodPauseAsStop')}
                                    onchange={(next) =>
                                        patchLocal(
                                            method === 'cronometro'
                                                ? { cronometroStop: next }
                                                : { temporizadorStop: next },
                                        )}
                                />
                            </span>
                        </div>
                    {/if}

                    {#if method === 'tiempo'}
                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroAddSecondsToTime')}</span>
                                <span class="set-row-note">{$t('pomodoroAddSecondsToTimeHint')}</span>
                            </span>
                            <span class="set-row-control">
                                <ToggleButton
                                    variant="rounded"
                                    pressed={local.tiempoShowSec}
                                    label={onOff(local.tiempoShowSec)}
                                    title={$tt('pomodoroAddSecondsToTime')}
                                    onchange={(next) => patchLocal({ tiempoShowSec: next })}
                                />
                            </span>
                        </div>
                    {/if}

                    <div class="set-row">
                        <span class="set-row-text">
                            <span class="set-row-name">{$t('pomodoroHideProject')}</span>
                            <span class="set-row-note">{$t('pomodoroHideProjectHint')}</span>
                        </span>
                        <span class="set-row-control">
                            <ToggleButton
                                variant="rounded"
                                pressed={local.hideProject}
                                label={onOff(local.hideProject)}
                                title={$tt('pomodoroHideProject')}
                                onchange={(next) => patchLocal({ hideProject: next })}
                            />
                        </span>
                    </div>

                    <div class="set-row">
                        <span class="set-row-text">
                            <span class="set-row-name">{$t('pomodoroHideProgress')}</span>
                            <span class="set-row-note">{$t('pomodoroHideProgressHint')}</span>
                        </span>
                        <span class="set-row-control">
                            <ToggleButton
                                variant="rounded"
                                pressed={local.hideProgress}
                                label={onOff(local.hideProgress)}
                                title={$tt('pomodoroHideProgress')}
                                onchange={(next) => patchLocal({ hideProgress: next })}
                            />
                        </span>
                    </div>

                    <div class="set-row">
                        <span class="set-row-text">
                            <span class="set-row-name">{$t('pomodoroSound')}</span>
                            <span class="set-row-note">{$t('pomodoroSoundHint')}</span>
                        </span>
                        <span class="set-row-control">
                            <ToggleButton
                                variant="rounded"
                                pressed={settings.sound !== false}
                                label={onOff(settings.sound !== false)}
                                title={$tt('pomodoroSound')}
                                onchange={(next) => patch({ sound: next })}
                            />
                        </span>
                    </div>

                    {#if method === 'pomodoro'}
                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroAutostart')}</span>
                                <span class="set-row-note">{$t('pomodoroAutostartHint')}</span>
                            </span>
                            <span class="set-row-control">
                                <ToggleButton
                                    variant="rounded"
                                    pressed={settings.autostart !== false}
                                    label={onOff(settings.autostart !== false)}
                                    title={$tt('pomodoroAutostart')}
                                    onchange={(next) => patch({ autostart: next })}
                                />
                            </span>
                        </div>
                    {/if}

                    <div class="set-row">
                        <span class="set-row-text">
                            <span class="set-row-name">{$t('pomodoroAutosave')}</span>
                            <span class="set-row-note">{$t('pomodoroAutosaveHint')}</span>
                        </span>
                        <span class="set-row-control">
                            <ToggleButton
                                variant="rounded"
                                pressed={settings.autosave !== false}
                                label={onOff(settings.autosave !== false)}
                                title={$tt('pomodoroAutosave')}
                                onchange={(next) => patch({ autosave: next })}
                            />
                        </span>
                    </div>

                    {#if method === 'pomodoro'}
                        <div class="set-row">
                            <span class="set-row-text">
                                <span class="set-row-name">{$t('pomodoroAutofinish')}</span>
                                <span class="set-row-note">{$t('pomodoroAutofinishHint')}</span>
                            </span>
                            <span class="set-row-control">
                                <ToggleButton
                                    variant="rounded"
                                    pressed={settings.autofinish !== false}
                                    label={onOff(settings.autofinish !== false)}
                                    title={$tt('pomodoroAutofinish')}
                                    onchange={(next) => patch({ autofinish: next })}
                                />
                            </span>
                        </div>
                    {/if}
                </div>
            </div>
        </section>
    </div>
{/if}
