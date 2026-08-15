<script>
    import { t, tt } from '../../stores/i18nStore.js';
</script>

<!-- ═══════════════════════════════════════════════
     POMODORO PANEL — 3 Divisions
     ═══════════════════════════════════════════════ -->
<section id="pomodoro-panel" class="pomodoro-panel hidden">
    <!-- ① CONTROLS ROW: mode tabs + all action buttons -->
    <div class="pomo-row pomo-row-controls">
        <div class="pomo-mode-tabs">
            <button
                type="button"
                class="pomo-mode-btn active"
                data-mode="work"
                title={$tt('pomodoroWork')}
                tabindex="-1"
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-target"></use>
                </svg>
            </button>
            <button
                type="button"
                class="pomo-mode-btn"
                data-mode="short"
                title={$tt('pomodoroShortBreak')}
                tabindex="-1"
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-coffee"></use>
                </svg>
            </button>
            <button type="button" class="pomo-mode-btn" data-mode="long" title={$tt('pomodoroLongBreak')} tabindex="-1">
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-relax"></use>
                </svg>
            </button>
        </div>
        <div class="pomo-divider" title={$tt('dragToMovePanel')}></div>
        <div class="pomo-actions" title={$tt('dragToMovePanel')}>
            <button type="button" id="pomodoro-reset-btn" class="pomo-action-btn" title={$tt('pomodoroReset')}>
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-pomo-reset"></use>
                </svg>
            </button>
            <button
                type="button"
                id="pomodoro-start-btn"
                class="pomo-action-btn pomo-play-btn"
                title={$tt('pomodoroStart')}
            >
                <svg class="icon-play" width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-play-solid"></use>
                </svg>
                <svg class="icon-pause hidden" width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-pause-solid"></use>
                </svg>
                <svg class="icon-stop hidden" width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-stop-solid"></use>
                </svg>
            </button>
            <button type="button" id="pomodoro-skip-btn" class="pomo-action-btn" title={$tt('pomodoroSkip')}>
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-skip"></use>
                </svg>
            </button>
            <div class="pomo-divider"></div>
            <button
                type="button"
                id="pomodoro-dashboard-btn"
                class="pomo-action-btn pomo-icon-only"
                title={$tt('pomodoroDashboard')}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-dashboard"></use>
                </svg>
            </button>
            <button
                type="button"
                id="pomodoro-note-btn"
                class="pomo-action-btn pomo-icon-only"
                title={$tt('pomodoroCreateNote')}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-add-note"></use>
                </svg>
            </button>
            <button
                type="button"
                id="pomodoro-stats-btn"
                class="pomo-action-btn pomo-icon-only"
                title={$tt('pomodoroStats')}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-stats"></use>
                </svg>
            </button>
            <button
                type="button"
                id="pomodoro-settings-btn"
                class="pomo-action-btn pomo-icon-only"
                title={$tt('pomodoroSettings')}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-settings"></use>
                </svg>
            </button>
            <button
                type="button"
                id="pomodoro-close-btn"
                class="pomo-action-btn pomo-icon-only"
                title={$tt('pomodoroClose')}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-close-stroke"></use>
                </svg>
            </button>
        </div>
    </div>

    <!-- ② PROJECT ROW: project name display -->
    <div class="pomo-row pomo-row-project" id="pomo-row-project">
        <input
            id="pomo-project-inline"
            class="pomo-project-inline-input"
            type="text"
            maxlength="18"
            autocomplete="off"
            placeholder={$t('pomodoroProjectName')}
        />
    </div>

    <!-- ③ TIMER ROW: big time + project name -->
    <div class="pomo-row pomo-row-timer">
        <!-- Top-left: Reset task (zero out stats) -->
        <button
            type="button"
            id="pomo-task-reset-btn"
            class="pomo-corner-btn pomo-corner-tl"
            title={$tt('pomodoroTaskReset')}
        >
            <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-rotate-ccw"></use>
            </svg>
        </button>
        <!-- Top-right: Note button with counter -->
        <button
            type="button"
            id="pomo-note-corner-btn"
            class="pomo-corner-btn pomo-corner-tr"
            title={$tt('pomodoroCreateNote')}
        >
            <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-add-note"></use>
            </svg>
            <span id="pomo-note-counter" class="pomo-note-counter hidden">0</span>
        </button>
        <!-- Center content -->
        <input
            id="pomo-project-display"
            class="pomo-project-name pomo-project-edit"
            type="text"
            placeholder=""
            maxlength="100"
            autocomplete="off"
        />
        <span id="pomodoro-time" class="pomo-time">25:00</span>
        <!-- Bottom-left: Finish task -->
        <button
            type="button"
            id="pomo-task-finish-btn"
            class="pomo-corner-btn pomo-corner-bl"
            title={$tt('pomodoroTaskFinish')}
        >
            <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-check"></use>
            </svg>
        </button>
        <!-- Bottom-right: Save stats (archive icon) -->
        <button
            type="button"
            id="pomo-save-stats-btn"
            class="pomo-corner-btn pomo-corner-br"
            title={$tt('pomodoroSaveStats')}
        >
            <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-archive-note"></use>
            </svg>
        </button>
    </div>

    <!-- ③ PROGRESS ROW: cycles bar -->
    <div class="pomo-row pomo-row-progress">
        <span class="pomo-cycles-current" id="pomo-cycles-current">0</span>
        <div class="pomo-cycles-track" id="pomo-cycles-track">
            <div class="pomo-cycles-fill" id="pomo-cycles-fill"></div>
            <span class="pomo-cycles-pct" id="pomo-cycles-pct">0%</span>
        </div>
        <span class="pomo-cycles-total" id="pomo-cycles-total">8</span>
    </div>

    <!-- ④ SETTINGS PANEL (expandable below) -->
    <div id="pomodoro-settings-panel" class="pomo-settings-panel hidden">
        <div class="pomo-settings-header">{$t('pomodoroSettingsTitle') || 'Configuration'}</div>
        <div class="pomo-settings-body">
            <!-- Project group (FIRST) -->
            <div class="pomo-settings-group">
                <div class="pomo-settings-group-label">{$t('pomodoroSettingsProject') || 'Project'}</div>
                <div class="pomo-settings-row3">
                    <div class="pomo-sf pomo-sf-wide">
                        <label for="pomodoro-project-name">{$t('pomodoroProjectName') || 'Name'}</label>
                        <input
                            type="text"
                            id="pomodoro-project-name"
                            placeholder="Mi proyecto"
                            class="pomo-text-input"
                        />
                    </div>
                    <div class="pomo-sf">
                        <label for="pomodoro-project-tag">{$t('pomodoroProjectTag') || 'Tag'}</label>
                        <input type="text" id="pomodoro-project-tag" placeholder="#tag" class="pomo-text-input" />
                    </div>
                    <div class="pomo-sf">
                        <label for="pomodoro-project-folder">{$t('pomodoroProjectFolder') || 'Folder'}</label>
                        <input type="text" id="pomodoro-project-folder" placeholder="/" class="pomo-text-input" />
                    </div>
                </div>
            </div>
            <!-- Method group -->
            <div class="pomo-settings-group">
                <div class="pomo-settings-group-label">{$t('pomodoroMethodLabel') || 'Method'}</div>
                <div class="pomo-method-btns">
                    <button
                        type="button"
                        class="pomo-method-btn active"
                        id="pomo-method-pomodoro"
                        data-method="pomodoro"
                        title={$tt('pomodoroMethodPomodoroTitle')}
                    >
                        <svg width="14" height="14" aria-hidden="true" focusable="false">
                            <use href="#icon-pomodoro"></use>
                        </svg>
                        <span>{$t('pomodoroMethodPomodoro') || 'Pomodoro'}</span>
                    </button>
                    <button
                        type="button"
                        class="pomo-method-btn"
                        id="pomo-method-cronometro"
                        data-method="cronometro"
                        title={$tt('pomodoroMethodCronometroTitle')}
                    >
                        <svg width="14" height="14" aria-hidden="true" focusable="false">
                            <use href="#icon-stopwatch"></use>
                        </svg>
                        <span>{$t('pomodoroMethodCronometro') || 'Stopwatch'}</span>
                    </button>
                    <button
                        type="button"
                        class="pomo-method-btn"
                        id="pomo-method-temporizador"
                        data-method="temporizador"
                        title={$tt('pomodoroMethodTemporizadorTitle')}
                    >
                        <svg width="14" height="14" aria-hidden="true" focusable="false">
                            <use href="#icon-timer"></use>
                        </svg>
                        <span>{$t('pomodoroMethodTemporizador') || 'Timer'}</span>
                    </button>
                    <button
                        type="button"
                        class="pomo-method-btn"
                        id="pomo-method-tiempo"
                        data-method="tiempo"
                        title={$tt('pomodoroMethodTiempoTitle')}
                    >
                        <svg width="14" height="14" aria-hidden="true" focusable="false">
                            <use href="#icon-calendar-time"></use>
                        </svg>
                        <span>{$t('pomodoroMethodTiempo') || 'Time'}</span>
                    </button>
                </div>
            </div>
            <!-- Method: Pomodoro specific settings -->
            <div id="pomo-method-section-pomodoro">
                <!-- Timers group -->
                <div class="pomo-settings-group">
                    <div class="pomo-settings-group-label">{$t('pomodoroSettingsTimers') || 'Timers'}</div>
                    <div class="pomo-settings-row3">
                        <div class="pomo-sf">
                            <label for="pomodoro-work-input">{$t('pomodoroWork') || 'Pomodoro'}</label>
                            <div class="pomo-num-wrap">
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-work-input"
                                    data-delta="-1">−</button
                                >
                                <input
                                    type="number"
                                    id="pomodoro-work-input"
                                    min="1"
                                    max="120"
                                    value="25"
                                    class="pomo-num-input"
                                />
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-work-input"
                                    data-delta="1">+</button
                                >
                            </div>
                            <span class="pomo-unit">min</span>
                        </div>
                        <div class="pomo-sf">
                            <label for="pomodoro-short-input">{$t('pomodoroShortBreak') || 'Short break'}</label>
                            <div class="pomo-num-wrap">
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-short-input"
                                    data-delta="-1">−</button
                                >
                                <input
                                    type="number"
                                    id="pomodoro-short-input"
                                    min="1"
                                    max="60"
                                    value="5"
                                    class="pomo-num-input"
                                />
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-short-input"
                                    data-delta="1">+</button
                                >
                            </div>
                            <span class="pomo-unit">min</span>
                        </div>
                        <div class="pomo-sf">
                            <label for="pomodoro-long-input">{$t('pomodoroLongBreak') || 'Long break'}</label>
                            <div class="pomo-num-wrap">
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-long-input"
                                    data-delta="-1">−</button
                                >
                                <input
                                    type="number"
                                    id="pomodoro-long-input"
                                    min="1"
                                    max="120"
                                    value="15"
                                    class="pomo-num-input"
                                />
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-long-input"
                                    data-delta="1">+</button
                                >
                            </div>
                            <span class="pomo-unit">min</span>
                        </div>
                    </div>
                </div>
                <!-- Cycles group -->
                <div class="pomo-settings-group">
                    <div class="pomo-settings-group-label" title={$tt('pomodoroSettingsCyclesTitle')}>
                        {$t('pomodoroSettingsCycles') || 'Cycle & Session'}
                    </div>
                    <div class="pomo-settings-row2">
                        <div class="pomo-sf">
                            <label for="pomodoro-sessions-input"
                                >{$t('pomodoroSessionsBeforeLong') || 'Pomodoros for the long break'}</label
                            >
                            <div class="pomo-num-wrap">
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-sessions-input"
                                    data-delta="-1">−</button
                                >
                                <input
                                    type="number"
                                    id="pomodoro-sessions-input"
                                    min="1"
                                    max="12"
                                    value="4"
                                    class="pomo-num-input"
                                />
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-sessions-input"
                                    data-delta="1">+</button
                                >
                            </div>
                            <span class="pomo-unit pomo-unit-cycle-info" id="pomo-unit-cycle-info"
                                >{$t('pomodoroUnitCycleInfo') || 'to complete a cycle'}</span
                            >
                        </div>
                        <div class="pomo-sf">
                            <label for="pomodoro-endafter-input"
                                >{$t('pomodoroEndAfter') || 'Pomodoros to finish'}</label
                            >
                            <div class="pomo-num-wrap">
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-endafter-input"
                                    data-delta="-1">−</button
                                >
                                <input
                                    type="number"
                                    id="pomodoro-endafter-input"
                                    min="1"
                                    max="20"
                                    value="8"
                                    class="pomo-num-input"
                                />
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-endafter-input"
                                    data-delta="1">+</button
                                >
                            </div>
                            <span class="pomo-unit pomo-unit-sessions" id="pomo-unit-sessions"
                                >{$t('pomodoroUnitSessions') || 'sessions'}</span
                            >
                        </div>
                    </div>
                </div>
            </div>
            <!-- Method: Stopwatch specific settings (now merged into general options) -->
            <div id="pomo-method-section-cronometro" class="hidden"></div>
            <!-- Method: Temporizador specific settings -->
            <div id="pomo-method-section-temporizador" class="hidden">
                <div class="pomo-settings-group">
                    <div class="pomo-settings-group-label">{$t('pomodoroSettingsTimers') || 'Time'}</div>
                    <div class="pomo-settings-row3">
                        <div class="pomo-sf">
                            <label for="pomodoro-timer-hours">{$t('pomodoroTimerHours') || 'Hours'}</label>
                            <div class="pomo-num-wrap">
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-timer-hours"
                                    data-delta="-1">−</button
                                >
                                <input
                                    type="number"
                                    id="pomodoro-timer-hours"
                                    min="0"
                                    max="23"
                                    value="0"
                                    class="pomo-num-input"
                                />
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-timer-hours"
                                    data-delta="1">+</button
                                >
                            </div>
                            <span class="pomo-unit">h</span>
                        </div>
                        <div class="pomo-sf">
                            <label for="pomodoro-timer-minutes">{$t('pomodoroTimerMinutes') || 'Minutes'}</label>
                            <div class="pomo-num-wrap">
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-timer-minutes"
                                    data-delta="-1">−</button
                                >
                                <input
                                    type="number"
                                    id="pomodoro-timer-minutes"
                                    min="0"
                                    max="59"
                                    value="25"
                                    class="pomo-num-input"
                                />
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-timer-minutes"
                                    data-delta="1">+</button
                                >
                            </div>
                            <span class="pomo-unit">min</span>
                        </div>
                        <div class="pomo-sf">
                            <label for="pomodoro-timer-seconds">{$t('pomodoroTimerSeconds') || 'Seconds'}</label>
                            <div class="pomo-num-wrap">
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-timer-seconds"
                                    data-delta="-1">−</button
                                >
                                <input
                                    type="number"
                                    id="pomodoro-timer-seconds"
                                    min="0"
                                    max="59"
                                    value="0"
                                    class="pomo-num-input"
                                />
                                <button
                                    type="button"
                                    class="pomo-num-btn"
                                    data-target="pomodoro-timer-seconds"
                                    data-delta="1">+</button
                                >
                            </div>
                            <span class="pomo-unit">sec</span>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Method: Time specific settings -->
            <div id="pomo-method-section-tiempo" class="hidden">
                <div class="pomo-settings-group">
                    <div class="pomo-settings-group-label">{$t('pomodoroEndTime') || 'End time'}</div>
                    <div class="pomo-tiempo-datetime-row">
                        <div class="pomo-tiempo-field">
                            <div class="field-label">{$t('pomodoroEndDate') || 'Date'}</div>
                            <div class="custom-input-trigger pomo-date-trigger" id="pomo-end-date-trigger">
                                <span class="val-placeholder">YYYY-MM-DD</span>
                            </div>
                        </div>
                        <div class="pomo-tiempo-field">
                            <div class="field-label">{$t('pomodoroEndTimeLabel') || 'Time'}</div>
                            <div class="custom-input-trigger time-trigger pomo-time-trigger" id="pomo-end-time-trigger">
                                00:00
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Options group -->
            <div class="pomo-settings-group">
                <div class="pomo-settings-group-label">{$t('pomodoroSettingsOptions') || 'Options'}</div>
                <div class="pomo-toggles-row">
                    <label class="pomo-toggle-label hidden" id="pomo-cronometro-stop-row">
                        <input type="checkbox" id="pomodoro-cronometro-stop-toggle" />
                        <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                        <span>{$t('pomodoroStopFinalizeNoPause') || 'Stop finishes the task (no pause)'}</span>
                    </label>
                    <label class="pomo-toggle-label hidden" id="pomo-temporizador-stop-row">
                        <input type="checkbox" id="pomodoro-temporizador-stop-toggle" />
                        <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                        <span>{$t('pomodoroStopFinalizeNoPause') || 'Stop finishes the task (no pause)'}</span>
                    </label>
                    <label class="pomo-toggle-label hidden" id="pomo-tiempo-seconds-row">
                        <input type="checkbox" id="pomo-tiempo-show-seconds" />
                        <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                        <span>{$t('pomodoroAddSecondsToTime') || 'Add seconds to time'}</span>
                    </label>
                    <label class="pomo-toggle-label" id="pomo-opt-hide-project-row">
                        <input type="checkbox" id="pomodoro-hide-project-toggle" />
                        <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                        <span>{$t('pomodoroHideProject') || 'Hide project name'}</span>
                    </label>
                    <label class="pomo-toggle-label" id="pomo-opt-hide-progress-row">
                        <input type="checkbox" id="pomodoro-hide-progress-toggle" />
                        <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                        <span>{$t('pomodoroHideProgress') || 'Hide progress bar'}</span>
                    </label>
                    <label class="pomo-toggle-label" id="pomo-opt-sound-row">
                        <input type="checkbox" id="pomodoro-sound-toggle" checked />
                        <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                        <span>{$t('pomodoroSound') || 'Sound'}</span>
                    </label>
                    <label class="pomo-toggle-label" id="pomo-opt-autostart-row">
                        <input type="checkbox" id="pomodoro-autostart-toggle" checked />
                        <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                        <span>{$t('pomodoroAutostart') || 'Auto-start'}</span>
                    </label>
                    <label class="pomo-toggle-label" id="pomo-opt-autosave-row">
                        <input type="checkbox" id="pomodoro-autosave-toggle" checked />
                        <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                        <span>{$t('pomodoroAutosave') || 'Auto-save'}</span>
                    </label>
                    <label class="pomo-toggle-label" id="pomo-opt-autofinish-row">
                        <input type="checkbox" id="pomodoro-autofinish-toggle" checked />
                        <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                        <span>{$t('pomodoroAutofinish') || 'Auto-finish'}</span>
                    </label>
                </div>
            </div>
        </div>
    </div>

    <!-- ⑤ STATISTICS PANEL (expandable below) -->
    <div id="pomodoro-stats-panel" class="pomo-stats-panel hidden">
        <div class="pomo-settings-header pomo-stats-header">
            <span class="pomo-stats-title-text">{$t('pomodoroStats') || 'Statistics'}</span>
            <!-- Project selector (Gemini-style) -->
            <div class="pomo-project-selector-wrapper" id="pomo-project-selector-wrapper">
                <button id="pomo-stat-project-btn" class="pomo-project-selector-btn" type="button">
                    <span id="pomo-stat-project-name">{$t('pomodoroCurrentSessionLabel') || '— current session —'}</span
                    >
                </button>
            </div>
            <div id="pomo-project-dropdown" class="pomo-project-dropdown">
                <div class="pomo-dropdown-search-container">
                    <span class="pomo-search-icon">
                        <svg width="14" height="14" aria-hidden="true" focusable="false">
                            <use href="#icon-search"></use>
                        </svg>
                    </span>
                    <label for="pomo-project-search-input" class="visually-hidden"
                        >{$t('pomoSearchProjectPlaceholder')}</label
                    >
                    <input
                        type="search"
                        id="pomo-project-search-input"
                        placeholder={$t('pomoSearchProjectPlaceholder') || 'Search project…'}
                        autocomplete="off"
                    />
                </div>
                <ul id="pomo-project-list"></ul>
            </div>
        </div>
        <div class="pomo-stats-grid">
            <div class="pomo-stat">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsFocusTime') || 'Focus'}</span>
                <span class="pomo-stat-val" id="stat-focus-time">—</span>
            </div>
            <div class="pomo-stat">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsBreakTime') || 'Break'}</span>
                <span class="pomo-stat-val" id="stat-break-time">—</span>
            </div>
            <div class="pomo-stat">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsTotalTime') || 'Total'}</span>
                <span class="pomo-stat-val" id="stat-total-time">—</span>
            </div>
            <div class="pomo-stat" title={$tt('dashboardTotalTimePaused')}>
                <span class="pomo-stat-lbl">{$t('dashboardInterruptionTime') || 'Interruption'}</span>
                <span class="pomo-stat-val" id="stat-interrupt-time">—</span>
            </div>
            <div class="pomo-stat">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsCompletedCycles') || 'Pomodoros'}</span>
                <span class="pomo-stat-val" id="stat-completed-cycles">—</span>
            </div>
            <div class="pomo-stat">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsSessions') || 'Sessions'}</span>
                <span class="pomo-stat-val" id="stat-completed-sessions">—</span>
            </div>
            <div class="pomo-stat">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsAvgFocusDuration') || 'Avg. focus'}</span>
                <span class="pomo-stat-val" id="stat-avg-focus">—</span>
            </div>
            <div class="pomo-stat">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsFocusInterruptions') || 'Interruptions'}</span>
                <span class="pomo-stat-val" id="stat-interruptions">—</span>
            </div>
            <div class="pomo-stat">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsStarted') || 'Started'}</span>
                <span class="pomo-stat-val" id="stat-started">—</span>
            </div>
            <div class="pomo-stat">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsFinished') || 'Estimated end'}</span>
                <span class="pomo-stat-val" id="stat-finished">—</span>
            </div>
            <div class="pomo-stat pomo-stat-wide">
                <span class="pomo-stat-lbl">{$t('pomodoroStatsEfficiency') || 'Efficiency'}</span>
                <div class="pomo-eff-bar" title={$tt('pomodoroEfficiencyTooltip')}>
                    <div class="pomo-eff-fill" id="stat-efficiency-fill"></div>
                    <span class="pomo-eff-pct" id="stat-efficiency-pct">0%</span>
                </div>
            </div>
        </div>
        <!-- Task completion stats -->
        <div id="pomo-task-stats-section" class="pomo-task-stats-section hidden">
            <div class="pomo-task-stats-header">{$t('pomodoroTaskStatsHeader') || 'Completed tasks'}</div>
            <div id="pomo-task-stats-list" class="pomo-task-stats-list"></div>
            <div class="pomo-task-stats-summary">
                <span class="pomo-task-stat-item"
                    ><strong>{$t('pomodoroStatTotalTasks') || 'Total tasks:'}</strong>
                    <span id="stat-total-tasks">—</span></span
                >
                <span class="pomo-task-stat-item"
                    ><strong>{$t('pomodoroStatTotalTaskTime') || 'Total time in tasks:'}</strong>
                    <span id="stat-total-task-time">—</span></span
                >
                <span class="pomo-task-stat-item"
                    ><strong>{$t('pomodoroStatTasksCycle') || 'Completed in pomodoro:'}</strong>
                    <span id="stat-all-tasks-cycle">—</span></span
                >
            </div>
        </div>
        <div class="pomo-stats-actions">
            <button type="button" id="pomodoro-clear-stats-btn" class="pomo-clear-btn"
                >{$t('pomodoroStatsClearBtn') || 'Clear statistics'}</button
            >
            <button type="button" id="pomodoro-export-stats-btn" class="pomo-clear-btn pomo-export-btn"
                >{$t('pomodoroExport') || 'Export'}</button
            >
            <button type="button" id="pomodoro-import-stats-btn" class="pomo-clear-btn pomo-export-btn"
                >{$t('pomodoroImport') || 'Import'}</button
            >
            <input type="file" id="pomodoro-import-stats-input" accept=".json" style="display:none" />
        </div>
    </div>
</section>
