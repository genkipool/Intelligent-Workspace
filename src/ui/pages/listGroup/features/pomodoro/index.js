import { showNotification } from '../../../../../utils/i18n.js';
import {
    savePomoStatsToDb,
    getAllPomoStatsFromDb,
    getPomoStatsByProjectFromDb,
    deletePomoStatsFromDb,
    clearPomoStatsFromDb,
} from '../../../../../utils/db.js';

// ============================================================
// POMODORO FRONTEND v3 — 3-division design, fixed sound, i18n
// ============================================================

export function initPomodoro() {
    'use strict';

    // ─── Helpers ───────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);
    const t = (key, subs) => {
        const m = chrome.i18n.getMessage(key);
        if (!m) return key;
        if (!subs) return m;
        return subs.reduce((s, v, i) => s.replace(`$${i + 1}`, String(v)), m);
    };

    function fmt(sec) {
        const s = Math.max(0, Math.round(sec));
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }
    function fmtDur(sec) {
        sec = Math.max(0, Math.round(sec));
        const h = Math.floor(sec / 3600),
            m = Math.floor((sec % 3600) / 60),
            s = sec % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }
    function fmtDate(ts) {
        return ts ? new Date(ts).toLocaleString() : '—';
    }
    function fmtTime(ts) {
        return ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
    }

    function getModeDuration(state) {
        const d = state.settings;
        return state.mode === 'work' ? d.workDuration : state.mode === 'short' ? d.shortBreak : d.longBreak;
    }
    function isBreak(mode) {
        return mode === 'short' || mode === 'long';
    }

    // ─── DOM refs ──────────────────────────────────────────────
    const openBtn = $('open-pomodoro-btn');
    const panel = $('pomodoro-panel');
    const closeBtn = $('pomodoro-close-btn');
    const settingsBtn = $('pomodoro-settings-btn');
    const statsBtn = $('pomodoro-stats-btn');
    const settingsPanel = $('pomodoro-settings-panel');
    const statsPanel = $('pomodoro-stats-panel');
    const timeDisplay = $('pomodoro-time');
    const projectDisplay = $('pomo-project-display');
    const projectInline = $('pomo-project-inline');
    const modeBtns = document.querySelectorAll('.pomo-mode-btn');
    const startBtn = $('pomodoro-start-btn');
    const resetBtn = $('pomodoro-reset-btn');
    const skipBtn = $('pomodoro-skip-btn');
    const playIcon = startBtn?.querySelector('.icon-play');
    const pauseIcon = startBtn?.querySelector('.icon-pause');

    // New corner buttons
    const noteCornerBtn = $('pomo-note-corner-btn');
    const noteCounter = $('pomo-note-counter');
    const taskResetBtn = $('pomo-task-reset-btn');
    const taskFinishBtn = $('pomo-task-finish-btn');
    const saveStatsBtn = $('pomo-save-stats-btn');

    // Toolbar note button
    const pomodoroNoteBtn = $('pomodoro-note-btn');
    const pomodoroDashboardBtn = $('pomodoro-dashboard-btn');

    // Cycles bar
    const cyclesFill = $('pomo-cycles-fill');
    const cyclesPct = $('pomo-cycles-pct');
    const cyclesCurrent = $('pomo-cycles-current');
    const cyclesTotal = $('pomo-cycles-total');

    // Settings inputs
    const workInput = $('pomodoro-work-input');
    const shortInput = $('pomodoro-short-input');
    const longInput = $('pomodoro-long-input');
    const sessInput = $('pomodoro-sessions-input');
    const endInput = $('pomodoro-endafter-input');
    const projName = $('pomodoro-project-name');
    const projTag = $('pomodoro-project-tag');
    const projFolder = $('pomodoro-project-folder');
    const soundToggle = $('pomodoro-sound-toggle');
    const autostartTog = $('pomodoro-autostart-toggle');
    const autosaveTog = $('pomodoro-autosave-toggle');
    const autofinishTog = $('pomodoro-autofinish-toggle');

    // Method buttons & sections
    const methodBtns = document.querySelectorAll('.pomo-method-btn');
    const methodSectionPomodoro = $('pomo-method-section-pomodoro');
    const methodSectionCronometro = $('pomo-method-section-cronometro');
    const methodSectionTemporizador = $('pomo-method-section-temporizador');
    const methodSectionTiempo = $('pomo-method-section-tiempo');
    const cronometroStopToggle = $('pomodoro-cronometro-stop-toggle');
    const temporizadorStopToggle = $('pomodoro-temporizador-stop-toggle');
    const hideProjectToggle = $('pomodoro-hide-project-toggle');
    const hideProgressToggle = $('pomodoro-hide-progress-toggle');
    const timerHoursInput = $('pomodoro-timer-hours');
    const timerMinutesInput = $('pomodoro-timer-minutes');
    const timerSecondsInput = $('pomodoro-timer-seconds');
    const tiempoShowSeconds = $('pomo-tiempo-show-seconds');
    const progressRow = panel.querySelector('.pomo-row-progress');
    const unitSessions = $('pomo-unit-sessions');
    const unitCycleInfo = $('pomo-unit-cycle-info');
    // Tiempo pickers (custom, like Gemini)
    const pomoDateTrigger = $('pomo-end-date-trigger');
    const pomoTimeTrigger = $('pomo-end-time-trigger');
    const pomoCalPopup = $('pomo-custom-calendar-popup');
    const pomoTimePopup = $('pomo-custom-time-popup');
    const pomoInputHour = $('pomo-input-hour');
    const pomoInputMinute = $('pomo-input-minute');
    // Track selected date/time for tiempo mode
    let tiempoSelectedDate = null; // Date object
    let tiempoSelectedHH = null; // string HH
    let tiempoSelectedMM = null; // string MM
    let pomoActivePopup = null;
    let pomoActiveTrigger = null;
    const clearBtn = $('pomodoro-clear-stats-btn');
    const exportBtn = $('pomodoro-export-stats-btn');
    const importBtn = $('pomodoro-import-stats-btn');
    const importInput = $('pomodoro-import-stats-input');

    // Project selector for stats
    const statProjectBtn = $('pomo-stat-project-btn');
    const statProjectName = $('pomo-stat-project-name');
    const statProjectDropdown = $('pomo-project-dropdown');
    const statProjectList = $('pomo-project-list');
    const statProjectSearch = $('pomo-project-search-input');

    if (!openBtn || !panel) return;

    // ─── State ─────────────────────────────────────────────────
    let localState = null;
    let localRemaining = 0;
    let uiInterval = null;
    let lastTickMs = null;
    let pomodoroNoteCount = 0; // notes created during current session
    let pomoMethod = 'pomodoro'; // 'pomodoro' | 'cronometro' | 'temporizador' | 'tiempo'
    let cronometroElapsed = 0; // seconds elapsed in stopwatch mode
    let cronometroRunning = false;
    let temporizadorRemaining = 0; // seconds remaining in countdown mode
    let temporizadorRunning = false;
    let tiempoEndMs = 0; // target end time ms for tiempo mode
    let tiempoStartMs = 0; // start time ms for tiempo mode progress
    let tiempoRunning = false;

    // SVG definitions for each method (used for openBtn and method buttons)
    const METHOD_SVGS = {
        pomodoro: `<svg width="22" height="22" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" xml:space="preserve" fill="currentColor"><path d="M360 80c4.8-12.8 8-27.2 8-44.8 0-4.8-1.6-4.8-4.8-8s-8-4.8-12.8-4.8c-19.2 1.6-40 9.6-60.8 24-6.4-11.2-12.8-22.4-22.4-33.6C264 9.6 259.2 8 256 8c-4.8 0-9.6 1.6-11.2 6.4-9.6 11.2-17.6 20.8-24 33.6q-26.4-21.6-57.6-24c-4.8 0-9.6 1.6-12.8 4.8S144 35.2 144 40c0 16 1.6 28.8 6.4 40C59.2 104 0 176 0 260.8 0 376 108.8 504 256 504s256-128 256-243.2c0-88-59.2-156.8-152-180.8m-65.6 8c1.6 0 1.6-1.6 1.6-3.2 12.8-11.2 24-19.2 36.8-24-4.8 19.2-19.2 48-57.6 56C280 105.6 288 96 294.4 88M256 49.6c4.8 6.4 8 12.8 9.6 20.8-11.2 12.8-19.2 28.8-25.6 48-1.6 0-3.2-1.6-4.8-1.6 1.6-32 8-51.2 20.8-67.2m-48 28.8c-1.6 6.4-3.2 14.4-4.8 22.4-11.2-8-20.8-20.8-25.6-40 11.2 3.2 20.8 9.6 30.4 17.6M256 472C128 472 32 360 32 260.8c0-73.6 52.8-132.8 134.4-152 12.8 16 27.2 25.6 43.2 32 1.6 0 1.6 0 3.2 1.6 12.8 4.8 27.2 8 36.8 9.6h1.6c6.4 0 11.2-3.2 14.4-8 24-3.2 54.4-12.8 76.8-35.2 84.8 17.6 139.2 76.8 139.2 152C480 360 384 472 256 472"/></svg>`,
        cronometro: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M9 2h6M12 2v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
        temporizador: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
        tiempo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    };
    const METHOD_TITLES = {
        pomodoro: chrome.i18n.getMessage('pomodoroMethodPomodoroTitle') || 'Pomodoro',
        cronometro: chrome.i18n.getMessage('pomodoroMethodCronometroTitle') || 'Stopwatch',
        temporizador: chrome.i18n.getMessage('pomodoroMethodTemporizadorTitle') || 'Temporizador',
        tiempo: chrome.i18n.getMessage('pomodoroMethodTiempoTitle') || 'Tiempo',
    };

    // Save alt timer state to storage for background persistence
    async function saveAltTimerState() {
        const state = {
            method: pomoMethod,
            cronometroElapsed,
            cronometroRunning,
            cronometroStartMs: cronometroRunning ? lastTickMs : null,
            temporizadorRemaining,
            temporizadorRunning,
            temporizadorStartMs: temporizadorRunning ? lastTickMs : null,
            tiempoEndMs,
            tiempoStartMs,
            tiempoRunning,
        };
        await chrome.storage.local.set({ altTimerState: state });
    }

    // Save local-only settings (timer inputs, toggles, tiempo date/time)
    async function saveLocalSettings() {
        const ls = {
            timerHours: parseInt(timerHoursInput?.value) || 0,
            timerMinutes: parseInt(timerMinutesInput?.value) || 0,
            timerSeconds: parseInt(timerSecondsInput?.value) || 0,
            cronometroStop: cronometroStopToggle?.checked ?? false,
            temporizadorStop: temporizadorStopToggle?.checked ?? false,
            hideProject: hideProjectToggle?.checked ?? false,
            hideProgress: hideProgressToggle?.checked ?? false,
            tiempoShowSec: tiempoShowSeconds?.checked ?? false,
            tiempoDate: tiempoSelectedDate ? tiempoSelectedDate.getTime() : null,
            tiempoHH: tiempoSelectedHH,
            tiempoMM: tiempoSelectedMM,
        };
        await chrome.storage.local.set({ pomoLocalSettings: ls });
    }

    async function loadLocalSettings() {
        const { pomoLocalSettings: ls } = await chrome.storage.local.get('pomoLocalSettings');
        if (!ls) return;
        if (timerHoursInput && ls.timerHours !== undefined) timerHoursInput.value = ls.timerHours;
        if (timerMinutesInput && ls.timerMinutes !== undefined) timerMinutesInput.value = ls.timerMinutes;
        if (timerSecondsInput && ls.timerSeconds !== undefined) timerSecondsInput.value = ls.timerSeconds;
        if (cronometroStopToggle && ls.cronometroStop !== undefined) cronometroStopToggle.checked = ls.cronometroStop;
        if (temporizadorStopToggle && ls.temporizadorStop !== undefined)
            temporizadorStopToggle.checked = ls.temporizadorStop;
        if (hideProjectToggle && ls.hideProject !== undefined) {
            hideProjectToggle.checked = ls.hideProject;
            applyHideProject(ls.hideProject);
        }
        if (hideProgressToggle && ls.hideProgress !== undefined) {
            hideProgressToggle.checked = ls.hideProgress;
            applyHideProgress(ls.hideProgress);
        }
        if (tiempoShowSeconds && ls.tiempoShowSec !== undefined) tiempoShowSeconds.checked = ls.tiempoShowSec;
        if (ls.tiempoDate) {
            tiempoSelectedDate = new Date(ls.tiempoDate);
            const formatted = formatDateYMD(tiempoSelectedDate);
            if (pomoDateTrigger) pomoDateTrigger.textContent = formatted;
        }
        if (ls.tiempoHH !== null && ls.tiempoHH !== undefined) {
            tiempoSelectedHH = ls.tiempoHH;
            tiempoSelectedMM = ls.tiempoMM;
            if (pomoTimeTrigger) pomoTimeTrigger.textContent = `${ls.tiempoHH}:${ls.tiempoMM}`;
        }
        // Update display based on current method
        if (pomoMethod === 'temporizador') {
            const secs = getTimerInputSecs();
            if (timeDisplay) timeDisplay.textContent = secs > 0 ? fmtHMS(secs) : '00:00';
            const totalMin = Math.round(secs / 60);
            if (cyclesTotal) cyclesTotal.textContent = totalMin;
        }
    }

    function applyHideProject(hide) {
        const projectRow = $('pomo-row-project');
        // Only hide the input; keep the row for error messages
        const input = $('pomo-project-inline');
        if (input) input.style.display = hide ? 'none' : '';
    }

    function applyHideProgress(hide) {
        if (progressRow) progressRow.style.display = hide ? 'none' : '';
    }

    // ─── Method validation (error indicator on method buttons) ──
    function validateMethod(method, showError = false) {
        const btn = document.getElementById(`pomo-method-${method}`);
        let error = null;

        if (method === 'tiempo') {
            const endMs = getEndTimeMs();
            if (!endMs || endMs <= Date.now()) {
                error =
                    chrome.i18n.getMessage('pomodoroTiempoErrorPast') || 'End time must be greater than current time';
            }
        }
        // temporizador: error if total == 0
        if (method === 'temporizador') {
            const secs = getTimerInputSecs();
            if (secs <= 0) {
                error = chrome.i18n.getMessage('pomodoroTemporizadorErrorZero') || 'Time must be greater than 0';
            }
        }

        if (btn) btn.classList.toggle('pomo-method-error', !!error && method === pomoMethod);

        // Only show notification if caller explicitly requests it (e.g. on start attempt)
        if (showError && error && method === pomoMethod) {
            showNotification('pomodoroMethodChangeError', true);
        }

        return !error;
    }

    function validateAllMethods() {
        ['pomodoro', 'cronometro', 'temporizador', 'tiempo'].forEach((m) => validateMethod(m));
    }

    async function restoreAltTimerState() {
        const { altTimerState } = await chrome.storage.local.get('altTimerState');
        if (!altTimerState || altTimerState.method !== pomoMethod) return;
        const now = Date.now();

        if (pomoMethod === 'cronometro' && altTimerState.cronometroElapsed !== undefined) {
            if (altTimerState.cronometroRunning && altTimerState.cronometroStartMs) {
                cronometroElapsed = altTimerState.cronometroElapsed + (now - altTimerState.cronometroStartMs) / 1000;
                cronometroRunning = false; // will start ticking via startCronometroResume
                updateCronometroDisplay();
                // Resume the interval
                startCronometroResume();
            } else {
                cronometroElapsed = altTimerState.cronometroElapsed;
                cronometroRunning = false;
                updateCronometroDisplay();
                if (cronometroElapsed > 0) {
                    updateStartPauseUI(false);
                    setAltTimerRunning(false);
                    disableMethodButtons();
                }
            }
        } else if (pomoMethod === 'temporizador' && altTimerState.temporizadorRemaining !== undefined) {
            if (altTimerState.temporizadorRunning && altTimerState.temporizadorStartMs) {
                const elapsed = (now - altTimerState.temporizadorStartMs) / 1000;
                temporizadorRemaining = Math.max(0, altTimerState.temporizadorRemaining - elapsed);
                if (temporizadorRemaining > 0) {
                    temporizadorRunning = false;
                    updateTemporizadorDisplay();
                    resumeTemporizador();
                } else {
                    // Timer ended while away
                    temporizadorRemaining = 0;
                    updateTemporizadorDisplay();
                    enableMethodButtons();
                    finishAltTask();
                }
            } else {
                temporizadorRemaining = altTimerState.temporizadorRemaining;
                updateTemporizadorDisplay();
                if (temporizadorRemaining > 0 && temporizadorRemaining < getTimerInputSecs()) {
                    updateStartPauseUI(false);
                    setAltTimerRunning(false);
                    disableMethodButtons();
                }
            }
        } else if (pomoMethod === 'tiempo') {
            tiempoEndMs = altTimerState.tiempoEndMs || 0;
            tiempoStartMs = altTimerState.tiempoStartMs || 0;
            if (altTimerState.tiempoRunning && tiempoEndMs > 0) {
                if (Date.now() >= tiempoEndMs) {
                    // Ended while away
                    tiempoRunning = false;
                    updateStartPauseUI(false);
                    if (startBtn) startBtn.disabled = false;
                    finishAltTask();
                } else {
                    tiempoRunning = false;
                    // Restore progress state before re-starting
                    const currentEndMs = getEndTimeMs() || tiempoEndMs;
                    const totalSecs = Math.round((currentEndMs - tiempoStartMs) / 1000);
                    const elapsed = Math.round((now - tiempoStartMs) / 1000);
                    if (cyclesCurrent) cyclesCurrent.textContent = Math.floor(elapsed / 60);
                    if (cyclesTotal) cyclesTotal.textContent = Math.round(totalSecs / 60);
                    const pct = totalSecs > 0 ? Math.min(100, Math.round((elapsed / totalSecs) * 100)) : 0;
                    if (cyclesFill) cyclesFill.style.width = pct + '%';
                    if (cyclesPct) cyclesPct.textContent = pct + '%';
                    startTiempo(); // re-start
                }
            }
        }
    }

    // Register global callback so handleSaveNote can increment the counter
    window._onPomoNoteSaved = () => updateNoteCounter(pomodoroNoteCount + 1);
    let taskCompletionLog = []; // [{name, startTime, endTime, duration, cycle}]
    let currentSessionStart = null;
    let selectedStatProject = null; // null = current session
    let savedStatProjects = [];

    // ─── Local interval (smooth countdown) ─────────────────────
    function startTick() {
        stopTick();
        lastTickMs = Date.now();
        uiInterval = setInterval(() => {
            if (!localState?.isRunning) return;
            const now = Date.now();
            localRemaining = Math.max(0, localRemaining - (now - lastTickMs) / 1000);
            lastTickMs = now;
            if (timeDisplay) timeDisplay.textContent = fmt(localRemaining);
            if (localRemaining <= 0) stopTick();
        }, 200);
    }
    function stopTick() {
        if (uiInterval) {
            clearInterval(uiInterval);
            uiInterval = null;
        }
    }

    // ─── Format helpers ─────────────────────────────────────────
    function fmtHMS(secs) {
        const s = Math.floor(secs);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    // ─── Method switching ────────────────────────────────────────
    function isAnyTaskRunning() {
        return cronometroRunning || temporizadorRunning || tiempoRunning || !!localState?.isRunning;
    }

    function updateModeTabsState() {
        const modeTabs = panel.querySelector('.pomo-mode-tabs');
        if (!modeTabs) return;
        const isRunning = isAnyTaskRunning();
        // Enable tabs if in pomodoro method OR if nothing is running (paused/stopped in other methods)
        if (pomoMethod === 'pomodoro' || !isRunning) {
            modeTabs.classList.remove('pomo-tabs-disabled');
        } else {
            modeTabs.classList.add('pomo-tabs-disabled');
        }
    }

    function applyMethod(method) {
        pomoMethod = method;
        methodBtns.forEach((b) => b.classList.toggle('active', b.dataset.method === method));

        // Show/hide method-specific config sections
        [methodSectionPomodoro, methodSectionCronometro, methodSectionTemporizador, methodSectionTiempo].forEach((el) =>
            el?.classList.add('hidden'),
        );

        if (method === 'pomodoro') methodSectionPomodoro?.classList.remove('hidden');
        else if (method === 'cronometro') methodSectionCronometro?.classList.remove('hidden');
        else if (method === 'temporizador') methodSectionTemporizador?.classList.remove('hidden');
        else if (method === 'tiempo') methodSectionTiempo?.classList.remove('hidden');

        // ── Option row visibility per method ──────────────────────
        // cronometro: stop-toggle + sound + autosave
        // temporizador / tiempo: sound + autosave only
        // pomodoro: all
        const optAutostart = $('pomo-opt-autostart-row');
        const optAutofinish = $('pomo-opt-autofinish-row');
        const cronometroStopRow = $('pomo-cronometro-stop-row');
        const temporizadorStopRow = $('pomo-temporizador-stop-row');

        if (method === 'pomodoro') {
            cronometroStopRow?.classList.add('hidden');
            temporizadorStopRow?.classList.add('hidden');
            optAutostart?.classList.remove('hidden');
            optAutofinish?.classList.remove('hidden');
        } else if (method === 'cronometro') {
            cronometroStopRow?.classList.remove('hidden');
            temporizadorStopRow?.classList.add('hidden');
            optAutostart?.classList.add('hidden');
            optAutofinish?.classList.add('hidden');
        } else if (method === 'temporizador') {
            cronometroStopRow?.classList.add('hidden');
            temporizadorStopRow?.classList.remove('hidden');
            optAutostart?.classList.add('hidden');
            optAutofinish?.classList.add('hidden');
        } else {
            // tiempo
            cronometroStopRow?.classList.add('hidden');
            temporizadorStopRow?.classList.add('hidden');
            optAutostart?.classList.add('hidden');
            optAutofinish?.classList.add('hidden');
        }

        updateModeTabsState();

        // ── Progress row visibility & labels per method ──────────
        if (progressRow) {
            progressRow.classList.remove('hidden');
            // Set smart title based on active method
            const progressTitleKey =
                {
                    pomodoro: 'pomodoroProgressTitlePomodoro',
                    cronometro: 'pomodoroProgressTitleCronometro',
                    temporizador: 'pomodoroProgressTitleTemporizador',
                    tiempo: 'pomodoroProgressTitleTiempo',
                }[method] || 'pomodoroProgressTitlePomodoro';
            progressRow.title = chrome.i18n.getMessage(progressTitleKey) || progressTitleKey;

            if (method === 'cronometro') {
                progressRow.classList.add('pomo-progress-disabled');
            } else {
                progressRow.classList.remove('pomo-progress-disabled');
                if (method === 'pomodoro') {
                    // Will be updated by render()
                } else if (method === 'temporizador') {
                    // Start=0, end=configured minutes
                    const totalSecs = getTimerInputSecs();
                    const totalMin = Math.round(totalSecs / 60);
                    if (cyclesCurrent) cyclesCurrent.textContent = '0';
                    if (cyclesTotal) cyclesTotal.textContent = totalMin;
                    if (cyclesFill) cyclesFill.style.width = '0%';
                    if (cyclesPct) cyclesPct.textContent = '0%';
                } else if (method === 'tiempo') {
                    // Start=0, end=minutes until end time
                    const remSecs = getSecsUntilEndTime();
                    const remMin = Math.round(remSecs / 60);
                    if (cyclesCurrent) cyclesCurrent.textContent = '0';
                    if (cyclesTotal) cyclesTotal.textContent = remMin;
                    if (cyclesFill) cyclesFill.style.width = '0%';
                    if (cyclesPct) cyclesPct.textContent = '0%';
                }
            }
        }

        // ── Skip button disabled for non-pomodoro ─────────────────
        const skipBtnEl = $('pomodoro-skip-btn');
        const resetBtnEl = $('pomodoro-reset-btn');
        if (skipBtnEl) {
            skipBtnEl.disabled = method !== 'pomodoro';
            skipBtnEl.style.opacity = method !== 'pomodoro' ? '0.3' : '';
            skipBtnEl.style.pointerEvents = method !== 'pomodoro' ? 'none' : '';
        }
        // Reset button: disable for temporizador and tiempo
        if (resetBtnEl) {
            const disableReset = method === 'temporizador' || method === 'tiempo';
            resetBtnEl.disabled = disableReset;
            resetBtnEl.style.opacity = disableReset ? '0.3' : '';
            resetBtnEl.style.pointerEvents = disableReset ? 'none' : '';
        }

        // ── Tiempo seconds row: visible only in tiempo mode ────────
        const tiempoSecRow = $('pomo-tiempo-seconds-row');
        if (tiempoSecRow) {
            tiempoSecRow.classList.toggle('hidden', method !== 'tiempo');
        }

        // ── Update openBtn SVG and title ──────────────────────────
        if (openBtn) {
            openBtn.innerHTML = METHOD_SVGS[method] || METHOD_SVGS.pomodoro;
            const newSvg = openBtn.querySelector('svg');
            if (newSvg) newSvg.id = 'open-pomodoro-btn-svg';
            openBtn.title = METHOD_TITLES[method] || 'Pomodoro';
        }

        // Re-enable start/pause
        if (startBtn) startBtn.disabled = false;

        // Reset time display color and classes
        if (timeDisplay) {
            timeDisplay.classList.remove('alt-running', 'alt-finished', 'pomo-time-warning', 'pomo-running');
        }

        // Update unit tooltip texts with actual values
        updateUnitTooltips();

        // Stop any running alternative timers
        stopAllAltTimers();

        // Validate the newly selected method
        validateAllMethods();

        // Update main time display
        if (timeDisplay) {
            if (method === 'cronometro') {
                updateCronometroDisplay();
                stopTiempoClock();
            } else if (method === 'temporizador') {
                const secs = getTimerInputSecs();
                timeDisplay.textContent = secs > 0 ? fmtHMS(secs) : '00:00';
                stopTiempoClock();
            } else if (method === 'tiempo') {
                stopTiempoClock();
                // Initialize pickers with current date/time if not already set
                initTiempoDefaults();
                // Show current clock (not countdown) when idle
                updateTiempoCurrentClock();
                startTiempoClock();
            } else {
                stopTiempoClock();
            }
        }

        chrome.storage.local.set({ pomoMethod: method });
    }

    function updateUnitTooltips() {
        const sessCount = parseInt(endInput?.value) || 8;
        const cycleCount = parseInt(sessInput?.value) || 4;
        if (unitSessions) {
            const titleMsg = chrome.i18n.getMessage('pomodoroUnitSessionsTitle', [String(sessCount)]);
            unitSessions.title =
                titleMsg || `With ${sessCount} pomodoros you finish the task. Each finished task counts as a session`;
        }
        if (unitCycleInfo) {
            const titleMsg = chrome.i18n.getMessage('pomodoroUnitCycleInfoTitle', [String(cycleCount)]);
            unitCycleInfo.title = titleMsg || `With ${cycleCount} pomodoros you complete a cycle`;
        }
        // Settings cycles label title
        const cyclesLabel = panel.querySelector('[data-i18n="pomodoroSettingsCycles"]');
        if (cyclesLabel) {
            const titleMsg = chrome.i18n.getMessage('pomodoroSettingsCyclesTitle');
            cyclesLabel.title =
                titleMsg ||
                chrome.i18n.getMessage('pomodoroCyclesSessionTooltip') ||
                'Cycle: group of pomodoros with long break. Session: complete task from start to finish';
        }
    }

    function getTimerInputSecs() {
        const h = parseInt(timerHoursInput?.value) || 0;
        const m = parseInt(timerMinutesInput?.value) || 0;
        const s = parseInt(timerSecondsInput?.value) || 0;
        return h * 3600 + m * 60 + s;
    }

    function getSecsUntilEndTime() {
        if (!tiempoSelectedDate || tiempoSelectedHH === null || tiempoSelectedMM === null) return 0;
        const end = new Date(tiempoSelectedDate);
        end.setHours(parseInt(tiempoSelectedHH), parseInt(tiempoSelectedMM), 0, 0);
        const now = new Date();
        if (end <= now) return 0;
        return Math.round((end - now) / 1000);
    }

    function getEndTimeMs() {
        if (!tiempoSelectedDate || tiempoSelectedHH === null || tiempoSelectedMM === null) return 0;
        const end = new Date(tiempoSelectedDate);
        end.setHours(parseInt(tiempoSelectedHH), parseInt(tiempoSelectedMM), 0, 0);
        return end.getTime();
    }

    // Show current clock in the timer display for tiempo mode (idle and running)
    function updateTiempoCurrentClock() {
        if (pomoMethod !== 'tiempo') return;
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const showSec = tiempoShowSeconds?.checked;
        if (timeDisplay) timeDisplay.textContent = showSec ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
    }

    // Initialize tiempo pickers with current date+time defaults
    function initTiempoDefaults() {
        const now = new Date();
        // Default end = 1 hour from now
        const endDefault = new Date(now.getTime() + 3600000);

        // Set date trigger
        if (!tiempoSelectedDate) {
            tiempoSelectedDate = new Date(endDefault);
            tiempoSelectedDate.setHours(0, 0, 0, 0);
            const formatted = formatDateYMD(tiempoSelectedDate);
            if (pomoDateTrigger) pomoDateTrigger.textContent = formatted;
        }

        // Set time trigger
        if (tiempoSelectedHH === null) {
            tiempoSelectedHH = String(endDefault.getHours()).padStart(2, '0');
            tiempoSelectedMM = String(endDefault.getMinutes()).padStart(2, '0');
            if (pomoTimeTrigger) pomoTimeTrigger.textContent = `${tiempoSelectedHH}:${tiempoSelectedMM}`;
        }

        // Update display with remaining time
        updateTiempoIdleDisplay();
    }

    function updateTiempoIdleDisplay() {
        if (pomoMethod !== 'tiempo' || tiempoRunning) return;
        // Always show current clock when idle — end time is configured separately
        updateTiempoCurrentClock();
    }

    function formatDateYMD(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function stopAllAltTimers() {
        cronometroRunning = false;
        temporizadorRunning = false;
        tiempoRunning = false;
        cronometroElapsed = 0;
        temporizadorRemaining = 0;
        tiempoEndMs = 0;
        stopTick();
        stopTiempoClock();
        enableMethodButtons();
        if (timeDisplay) {
            timeDisplay.classList.remove('alt-running', 'alt-finished', 'pomo-time-warning', 'pomo-running');
        }
    }

    function disableMethodButtons() {
        methodBtns.forEach((b) => {
            b.disabled = true;
        });
    }
    function enableMethodButtons() {
        methodBtns.forEach((b) => {
            b.disabled = false;
        });
    }

    // ─── Stopwatch ──────────────────────────────────
    function startCronometro() {
        cronometroElapsed = 0;
        cronometroRunning = true;
        lastTickMs = Date.now();
        updateCronometroDisplay();
        uiInterval = setInterval(() => {
            if (!cronometroRunning) return;
            const now = Date.now();
            cronometroElapsed += (now - lastTickMs) / 1000;
            lastTickMs = now;
            updateCronometroDisplay();
        }, 200);
        updateStartPauseUI(true);
        setAltTimerRunning(true);
        disableMethodButtons();
        saveAltTimerState();
    }

    function startCronometroResume() {
        cronometroRunning = true;
        lastTickMs = Date.now();
        uiInterval = setInterval(() => {
            if (!cronometroRunning) return;
            const now = Date.now();
            cronometroElapsed += (now - lastTickMs) / 1000;
            lastTickMs = now;
            updateCronometroDisplay();
        }, 200);
        updateStartPauseUI(true);
        setAltTimerRunning(true);
        disableMethodButtons();
        saveAltTimerState();
    }

    function pauseCronometro() {
        cronometroRunning = false;
        if (uiInterval) {
            clearInterval(uiInterval);
            uiInterval = null;
        }
        updateStartPauseUI(false);
        setAltTimerRunning(false);
        enableMethodButtons();
        saveAltTimerState();
    }

    function stopCronometro() {
        cronometroRunning = false;
        if (uiInterval) {
            clearInterval(uiInterval);
            uiInterval = null;
        }
        updateStartPauseUI(false);
        enableMethodButtons();
        saveAltTimerState();
        finishAltTask();
    }

    function updateCronometroDisplay() {
        if (timeDisplay) timeDisplay.textContent = fmtHMS(cronometroElapsed);
    }

    // ─── Temporizador (countdown) ────────────────────────────────
    function startTemporizador() {
        const totalSecs = getTimerInputSecs();
        if (totalSecs <= 0) return;
        temporizadorRemaining = totalSecs;
        temporizadorRunning = true;
        lastTickMs = Date.now();
        // Reset cycles counter
        if (cyclesCurrent) cyclesCurrent.textContent = '0';
        const totalMin = Math.round(totalSecs / 60);
        if (cyclesTotal) cyclesTotal.textContent = totalMin;
        if (cyclesFill) cyclesFill.style.width = '0%';
        if (cyclesPct) cyclesPct.textContent = '0%';
        updateTemporizadorDisplay();
        uiInterval = setInterval(() => {
            if (!temporizadorRunning) return;
            const now = Date.now();
            temporizadorRemaining = Math.max(0, temporizadorRemaining - (now - lastTickMs) / 1000);
            // Accept dynamically updated end time from inputs
            const newTotal = getTimerInputSecs();
            lastTickMs = now;
            updateTemporizadorDisplay();
            if (temporizadorRemaining <= 0) {
                temporizadorRunning = false;
                if (uiInterval) {
                    clearInterval(uiInterval);
                    uiInterval = null;
                }
                updateStartPauseUI(false);
                if (localState?.settings?.sound) playSound('work');
                enableMethodButtons();
                saveAltTimerState();
                finishAltTask();
            }
        }, 200);
        // Show start/pause/stop icon based on toggle setting
        updateStartPauseUI(true);
        setAltTimerRunning(true);
        disableMethodButtons();
        saveAltTimerState();
    }

    function pauseTemporizador() {
        temporizadorRunning = false;
        if (uiInterval) {
            clearInterval(uiInterval);
            uiInterval = null;
        }
        updateStartPauseUI(false);
        setAltTimerRunning(false);
        if (timeDisplay) timeDisplay.classList.remove('pomo-time-warning');
        enableMethodButtons();
        saveAltTimerState();
    }

    function resumeTemporizador() {
        if (temporizadorRemaining <= 0) return;
        temporizadorRunning = true;
        lastTickMs = Date.now();
        uiInterval = setInterval(() => {
            if (!temporizadorRunning) return;
            const now = Date.now();
            temporizadorRemaining = Math.max(0, temporizadorRemaining - (now - lastTickMs) / 1000);
            lastTickMs = now;
            updateTemporizadorDisplay();
            if (temporizadorRemaining <= 0) {
                temporizadorRunning = false;
                if (uiInterval) {
                    clearInterval(uiInterval);
                    uiInterval = null;
                }
                updateStartPauseUI(false);
                if (localState?.settings?.sound) playSound('work');
                enableMethodButtons();
                saveAltTimerState();
                finishAltTask();
            }
        }, 200);
        updateStartPauseUI(true);
        setAltTimerRunning(true);
        disableMethodButtons();
        saveAltTimerState();
    }

    function updateTemporizadorDisplay() {
        if (timeDisplay) {
            timeDisplay.textContent = fmtHMS(temporizadorRemaining);
            // Last 10 seconds — error color warning
            if (temporizadorRunning && temporizadorRemaining > 0 && temporizadorRemaining <= 10) {
                timeDisplay.classList.add('pomo-time-warning');
            } else {
                timeDisplay.classList.remove('pomo-time-warning');
            }
        }
        // Update progress bar: elapsed / total (use current configured total)
        const totalSecs = getTimerInputSecs();
        if (totalSecs > 0) {
            const elapsed = totalSecs - temporizadorRemaining;
            const pct = Math.min(100, Math.round((Math.max(0, elapsed) / totalSecs) * 100));
            if (cyclesFill) cyclesFill.style.width = pct + '%';
            if (cyclesPct) cyclesPct.textContent = pct + '%';
            if (cyclesCurrent) cyclesCurrent.textContent = Math.floor(Math.max(0, elapsed) / 60);
            if (cyclesTotal) cyclesTotal.textContent = Math.round(totalSecs / 60);
        }
    }

    // ─── Tiempo (count to end time) ──────────────────────────────
    function startTiempo() {
        if (!validateMethod('tiempo', true)) return; // shows notification on error
        const endMs = getEndTimeMs();
        tiempoEndMs = endMs;
        tiempoStartMs = Date.now();
        tiempoRunning = true;
        // Initialize cycles: current=0, total=minutes until end
        const totalSecs = Math.round((tiempoEndMs - tiempoStartMs) / 1000);
        const totalMin = Math.round(totalSecs / 60);
        if (cyclesCurrent) cyclesCurrent.textContent = '0';
        if (cyclesTotal) cyclesTotal.textContent = totalMin;
        if (cyclesFill) cyclesFill.style.width = '0%';
        if (cyclesPct) cyclesPct.textContent = '0%';
        // Show current clock (not countdown) — startTiempoClock handles auto-stop at end time
        updateTiempoCurrentClock();
        startTiempoClock();
        // Show stop icon for tiempo (no pause)
        updateStartPauseUI(true);
        setAltTimerRunning(true);
        disableMethodButtons();
        saveAltTimerState();
    }

    function updateStartPauseUI(running, mode) {
        const stopIcon = startBtn?.querySelector('.icon-stop');
        const useStopMode =
            mode === 'stop' ||
            (pomoMethod === 'cronometro' && cronometroStopToggle?.checked) ||
            (pomoMethod === 'temporizador' && temporizadorStopToggle?.checked && running) ||
            (pomoMethod === 'tiempo' && running);
        playIcon?.classList.toggle('hidden', running);
        if (useStopMode && running) {
            pauseIcon?.classList.add('hidden');
            stopIcon?.classList.remove('hidden');
            if (startBtn) startBtn.title = chrome.i18n.getMessage('pomodoroStop') || 'Stop';
        } else {
            stopIcon?.classList.add('hidden');
            pauseIcon?.classList.toggle('hidden', !running);
            if (startBtn) {
                if (running) {
                    startBtn.title = chrome.i18n.getMessage('pomodoroPause') || 'Pause';
                } else {
                    startBtn.title = chrome.i18n.getMessage('pomodoroStart') || 'Start';
                }
            }
        }
        // Ensure startBtn is enabled when not running
        if (!running && startBtn) startBtn.disabled = false;
        updateModeTabsState();
        // Color: always show text-on-color when any task is running
        openBtn.classList.toggle('pomo-task-running', running);
        // Blink: only when running AND panel is hidden
        const panelHidden = panel.classList.contains('hidden');
        openBtn.classList.toggle('pomodoro-running', running && panelHidden);
    }

    function setAltTimerRunning(running) {
        if (timeDisplay) {
            timeDisplay.classList.remove('pomo-running');
            if (running) {
                timeDisplay.classList.add('alt-running');
                timeDisplay.classList.remove('alt-finished');
            } else {
                timeDisplay.classList.remove('alt-running', 'pomo-time-warning');
                // Idle = default text-color (no extra class needed)
            }
        }
        // Update openBtn color and blink state
        openBtn.classList.toggle('pomo-task-running', running);
        const panelHidden = panel.classList.contains('hidden');
        openBtn.classList.toggle('pomodoro-running', running && panelHidden);
    }

    function finishAltTask() {
        if (timeDisplay) {
            timeDisplay.classList.remove('alt-running', 'alt-finished', 'pomo-time-warning', 'pomo-running');
        }
        enableMethodButtons();
        if (startBtn) startBtn.disabled = false;
        updateStartPauseUI(false);
        // Remove running classes from openBtn
        openBtn.classList.remove('pomo-task-running', 'pomodoro-running');
        if (!localState) return;
        const projectN = localState.settings?.projectName || 'Unnamed';
        showNotification('pomodoroTaskCompleted', false, [projectN]);
    }

    // ─── Sound (UI side — only when panel open) ─────────────────
    function playSound(type) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const master = ctx.createGain();
            master.gain.value = 0.7;
            master.connect(ctx.destination);
            const schedules = {
                work: [
                    [523.25, 0],
                    [659.25, 0.28],
                    [783.99, 0.56],
                    [1046.5, 0.84],
                ],
                break: [
                    [783.99, 0],
                    [659.25, 0.32],
                    [523.25, 0.64],
                ],
                allDone: [
                    [523.25, 0],
                    [659.25, 0.15],
                    [783.99, 0.3],
                    [1046.5, 0.45],
                    [783.99, 0.65],
                    [1046.5, 0.8],
                    [1318.5, 0.95],
                ],
            };
            const wave = type === 'break' ? 'triangle' : 'sine';
            (schedules[type] || [[880, 0]]).forEach(([freq, delay]) => {
                const osc = ctx.createOscillator(),
                    g = ctx.createGain();
                osc.connect(g);
                g.connect(master);
                osc.frequency.value = freq;
                osc.type = wave;
                const t0 = ctx.currentTime + delay;
                g.gain.setValueAtTime(0, t0);
                g.gain.linearRampToValueAtTime(0.5, t0 + 0.06);
                g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
                osc.start(t0);
                osc.stop(t0 + 0.75);
            });
        } catch (e) {}
    }

    // ─── Render ─────────────────────────────────────────────────
    function render(state, remaining) {
        if (!state) return;
        localState = state;
        localRemaining = remaining;

        // ① Controls row
        modeBtns.forEach((btn) => {
            const active = btn.dataset.mode === state.mode;
            btn.classList.toggle('active', active);
        });
        // Smart play/pause/stop icon and title
        if (pomoMethod === 'pomodoro') {
            const stopIcon = startBtn?.querySelector('.icon-stop');
            stopIcon?.classList.add('hidden');
            playIcon?.classList.toggle('hidden', state.isRunning);
            pauseIcon?.classList.toggle('hidden', !state.isRunning);
            if (startBtn) {
                startBtn.title = state.isRunning
                    ? chrome.i18n.getMessage('pomodoroPause') || 'Pausar'
                    : chrome.i18n.getMessage('pomodoroStart') || 'Iniciar';
            }
        }
        startBtn?.classList.toggle('mode-break', isBreak(state.mode));
        panel.classList.toggle('mode-work', state.mode === 'work');
        panel.classList.toggle('mode-break', isBreak(state.mode));
        openBtn.classList.toggle('pomo-task-running', state.isRunning);
        const panelHidden = panel.classList.contains('hidden');
        openBtn.classList.toggle('pomodoro-running', state.isRunning && panelHidden);

        // ② Timer row — only update timeDisplay in pomodoro mode
        if (pomoMethod === 'pomodoro') {
            if (timeDisplay) {
                timeDisplay.textContent = fmt(remaining);
                // pomo-running: only when actually running
                timeDisplay.classList.toggle('pomo-running', !!state.isRunning);
                timeDisplay.classList.remove('alt-running', 'alt-finished', 'pomo-time-warning');
            }
        }
        // Update editable project display
        if (projectDisplay && projectDisplay.tagName === 'INPUT') {
            if (document.activeElement !== projectDisplay) {
                projectDisplay.value = state.settings.projectName || '';
            }
        }
        // Sync inline project input
        if (projectInline && document.activeElement !== projectInline) {
            projectInline.value = state.settings.projectName || '';
        }

        // Disable method buttons when pomodoro is running
        if (pomoMethod === 'pomodoro') {
            if (state.isRunning) disableMethodButtons();
            else enableMethodButtons();
        }
        updateModeTabsState();

        // Only update cycles for pomodoro mode; other modes manage their own counters
        if (pomoMethod === 'pomodoro') {
            const endAfter = state.settings.endAfter || 8;
            const cycles = state.completedCycles || 0;
            const pct = Math.min(100, endAfter > 0 ? Math.round((cycles / endAfter) * 100) : 0);
            if (cyclesFill) cyclesFill.style.width = pct + '%';
            if (cyclesPct) cyclesPct.textContent = pct + '%';
            if (cyclesCurrent) cyclesCurrent.textContent = cycles;
            if (cyclesTotal) cyclesTotal.textContent = endAfter;
        }

        // Update unit tooltips with current values
        updateUnitTooltips();

        // Settings sync
        syncSettingsInputs(state);

        // Stats
        if (selectedStatProject === null) renderStats(state);
    }

    function syncSettingsInputs(state) {
        const s = state.settings;
        const setIfUnfocused = (el, val) => {
            if (el && document.activeElement !== el) el.value = val;
        };
        setIfUnfocused(workInput, Math.round(s.workDuration / 60));
        setIfUnfocused(shortInput, Math.round(s.shortBreak / 60));
        setIfUnfocused(longInput, Math.round(s.longBreak / 60));
        setIfUnfocused(sessInput, s.sessionsBeforeLong);
        setIfUnfocused(endInput, s.endAfter || 8);
        setIfUnfocused(projName, s.projectName || '');
        setIfUnfocused(projTag, s.projectTag || '');
        setIfUnfocused(projFolder, s.projectFolder || '');
        if (soundToggle) soundToggle.checked = s.sound;
        if (autostartTog) autostartTog.checked = s.autostart ?? true;
        if (autosaveTog) autosaveTog.checked = s.autosave ?? true;
        if (autofinishTog) autofinishTog.checked = s.autofinish ?? true;
    }

    function renderStats(state) {
        const st = state.stats || {};
        const focusSecs = st.totalFocusSeconds || 0;
        const breakSecs = st.totalBreakSeconds || 0;
        const totalSecs = focusSecs + breakSecs;
        let interruptSecs = st.totalInterruptionSeconds || 0;
        if (!state.isRunning && state.pausedAt && state.mode === 'work') {
            interruptSecs += Math.floor((Date.now() - state.pausedAt) / 1000);
        }

        const set = (id, val) => {
            const el = $(id);
            if (el) el.textContent = val;
        };
        set('stat-focus-time', fmtDur(focusSecs));
        set('stat-break-time', fmtDur(breakSecs));
        set('stat-total-time', fmtDur(totalSecs));
        set('stat-interrupt-time', interruptSecs > 0 ? fmtDur(interruptSecs) : '—');
        set('stat-completed-cycles', state.completedCycles || 0);
        // Sessions = fully completed sets of endAfter cycles for this project
        const endAfterSessions = state.settings.endAfter || 8;
        const completedSessions =
            endAfterSessions > 0 ? Math.floor((state.completedCycles || 0) / endAfterSessions) : 0;
        set(
            'stat-completed-sessions',
            completedSessions > 0 ? `${completedSessions} session${completedSessions !== 1 ? 's' : ''}` : '0',
        );
        set('stat-interruptions', state.interruptions || 0);
        set('stat-started', fmtDate(st.sessionStarted));

        const fl = st.sessionFocusList || [];
        set('stat-avg-focus', fl.length > 0 ? fmtDur(Math.round(fl.reduce((a, b) => a + b, 0) / fl.length)) : '—');

        const endAfter = state.settings.endAfter || 8;
        if (st.sessionStarted && endAfter > 0) {
            const spb = state.settings.sessionsBeforeLong;
            const fullCycleLen =
                spb * state.settings.workDuration + (spb - 1) * state.settings.shortBreak + state.settings.longBreak;
            const estTotalSecs = (endAfter * fullCycleLen) / spb;
            set('stat-finished', fmtDate(st.sessionStarted + estTotalSecs * 1000));
        } else {
            set('stat-finished', '—');
        }

        // Efficiency bar with color coding
        const eff = totalSecs > 0 ? Math.round((focusSecs / totalSecs) * 100) : 0;
        const effFill = $('stat-efficiency-fill');
        const effPct = $('stat-efficiency-pct');
        if (effFill) {
            effFill.style.width = eff + '%';
            const effColor =
                eff >= 80
                    ? 'var(--interactive-color)'
                    : eff >= 60
                      ? '#27ae60'
                      : eff >= 40
                        ? '#f39c12'
                        : eff > 0
                          ? '#e74c3c'
                          : 'var(--interactive-color)';
            effFill.style.background = effColor;
        }
        if (effPct) effPct.textContent = eff + '%';

        // Task completion stats
        renderTaskStats();
    }

    function renderSavedStats(entry) {
        // entry is a saved stats object from IndexedDB
        const set = (id, val) => {
            const el = $(id);
            if (el) el.textContent = val;
        };
        const focusSecs = entry.totalFocusSeconds || 0;
        const breakSecs = entry.totalBreakSeconds || 0;
        const totalSecs = focusSecs + breakSecs;

        set('stat-focus-time', fmtDur(focusSecs));
        set('stat-break-time', fmtDur(breakSecs));
        set('stat-total-time', fmtDur(totalSecs));
        set(
            'stat-interrupt-time',
            (entry.totalInterruptionSeconds || 0) > 0 ? fmtDur(entry.totalInterruptionSeconds) : '—',
        );
        set('stat-completed-cycles', entry.completedCycles || 0);
        const endAfterS = entry.endAfter || 8;
        const completedSessionsSaved = endAfterS > 0 ? Math.floor((entry.completedCycles || 0) / endAfterS) : 0;
        set(
            'stat-completed-sessions',
            completedSessionsSaved > 0
                ? `${completedSessionsSaved} session${completedSessionsSaved !== 1 ? 's' : ''}`
                : '0',
        );
        set('stat-interruptions', entry.interruptions || 0);
        set('stat-started', fmtDate(entry.sessionStarted));
        set('stat-finished', fmtDate(entry.savedAt));
        set('stat-avg-focus', entry.avgFocus ? fmtDur(entry.avgFocus) : '—');

        const eff = totalSecs > 0 ? Math.round((focusSecs / totalSecs) * 100) : 0;
        const effFill = $('stat-efficiency-fill');
        const effPct = $('stat-efficiency-pct');
        if (effFill) {
            effFill.style.width = eff + '%';
            const effColor =
                eff >= 80
                    ? 'var(--interactive-color)'
                    : eff >= 60
                      ? '#27ae60'
                      : eff >= 40
                        ? '#f39c12'
                        : eff > 0
                          ? '#e74c3c'
                          : 'var(--interactive-color)';
            effFill.style.background = effColor;
        }
        if (effPct) effPct.textContent = eff + '%';

        renderTaskStatsFromData(entry.taskLog || []);

        // Update local state and logs so that the Export button reflects what's being viewed
        taskCompletionLog = [...(entry.taskLog || [])];
        pomodoroNoteCount = entry.noteCount || 0;

        localState = {
            settings: {
                projectName: entry.projectName || 'Unnamed',
                projectFolder: entry.projectFolder || '',
                projectTag: entry.projectTag || '',
                endAfter: entry.endAfter || 8,
            },
            stats: {
                totalFocusSeconds: entry.totalFocusSeconds || 0,
                totalBreakSeconds: entry.totalBreakSeconds || 0,
                totalInterruptionSeconds: entry.totalInterruptionSeconds || 0,
                sessionStarted: entry.sessionStarted,
            },
            completedCycles: entry.completedCycles || 0,
            interruptions: entry.interruptions || 0,
        };
    }

    function renderTaskStats() {
        renderTaskStatsFromData(taskCompletionLog);
    }

    function renderTaskStatsFromData(log) {
        const section = $('pomo-task-stats-section');
        const list = $('pomo-task-stats-list');
        if (!section || !list) return;

        if (!log || log.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        list.innerHTML = '';

        log.forEach((task) => {
            const row = document.createElement('div');
            row.className = 'pomo-task-stat-row';
            row.innerHTML = `
                <span class="task-name">${task.name || 'Task'}</span>
                <span class="task-hour">${fmtTime(task.endTime)}</span>
                <span class="task-time">${fmtDur(task.duration || 0)}</span>
                <span class="task-cycle">Cycle ${task.cycle || '—'}</span>
            `;
            list.appendChild(row);
        });

        // Summary
        const totalTaskTime = log.reduce((a, t) => a + (t.duration || 0), 0);
        const lastCycle = log.length > 0 ? log[log.length - 1].cycle : '—';
        const set = (id, val) => {
            const el = $(id);
            if (el) el.textContent = val;
        };
        set('stat-total-tasks', log.length);
        set('stat-total-task-time', fmtDur(totalTaskTime));
        set('stat-all-tasks-cycle', lastCycle || '—');
    }

    // ─── Save stats to IndexedDB ────────────────────────────────
    async function saveStatsToDb(state) {
        if (!state) return;
        const st = state.stats || {};
        const fl = st.sessionFocusList || [];
        const projectN = state.settings.projectName || 'Unnamed';
        const entry = {
            id: `${projectN}_${st.sessionStarted || Date.now()}`,
            projectName: projectN,
            projectFolder: state.settings.projectFolder || '',
            projectTag: state.settings.projectTag || '',
            savedAt: Date.now(),
            sessionStarted: st.sessionStarted,
            totalFocusSeconds: st.totalFocusSeconds || 0,
            totalBreakSeconds: st.totalBreakSeconds || 0,
            totalInterruptionSeconds: st.totalInterruptionSeconds || 0,
            completedCycles: state.completedCycles || 0,
            endAfter: state.settings.endAfter || 8,
            interruptions: state.interruptions || 0,
            avgFocus: fl.length > 0 ? Math.round(fl.reduce((a, b) => a + b, 0) / fl.length) : 0,
            taskLog: [...taskCompletionLog],
            noteCount: pomodoroNoteCount,
        };
        try {
            await savePomoStatsToDb(entry);
            // Refresh project list
            await loadSavedProjects();
            showNotification('pomodoroStatsSaved', false);
        } catch (e) {
            console.error('Error saving pomo stats:', e);
        }
    }

    // ─── Load saved projects for stats dropdown ─────────────────
    async function loadSavedProjects() {
        try {
            const all = await getAllPomoStatsFromDb();
            // Unique project names
            const projectMap = {};
            all.forEach((entry) => {
                const pn = entry.projectName;
                if (!projectMap[pn]) projectMap[pn] = [];
                projectMap[pn].push(entry);
            });
            savedStatProjects = Object.keys(projectMap).map((name) => ({
                name,
                entries: projectMap[name].sort((a, b) => b.savedAt - a.savedAt),
            }));
            renderProjectDropdown();
        } catch (e) {
            console.error('Error loading pomo projects:', e);
        }
    }

    function renderProjectDropdown() {
        if (!statProjectList) return;
        statProjectList.innerHTML = '';

        // Option: current session
        const currentItem = document.createElement('li');
        currentItem.className = 'pomo-project-item' + (selectedStatProject === null ? ' active' : '');
        const currentBtn = document.createElement('button');
        currentBtn.type = 'button';
        currentBtn.textContent = chrome.i18n.getMessage('pomodoroCurrentSessionLabel') || '— current session —';
        currentBtn.addEventListener('click', () => {
            selectedStatProject = null;
            if (statProjectName)
                statProjectName.textContent =
                    chrome.i18n.getMessage('pomodoroCurrentSessionLabel') || '— current session —';
            closeProjectDropdown();
            if (localState) renderStats(localState);
        });
        currentItem.appendChild(currentBtn);
        statProjectList.appendChild(currentItem);

        // Option: totals (sum of all saved projects)
        if (savedStatProjects.length > 0) {
            const totalsItem = document.createElement('li');
            totalsItem.className = 'pomo-project-item' + (selectedStatProject === '__totals__' ? ' active' : '');
            totalsItem.dataset.projectName = '__totals__';
            const totalsBtn = document.createElement('button');
            totalsBtn.type = 'button';
            totalsBtn.textContent = chrome.i18n.getMessage('pomodoroStatsTotalAll') || 'Totals (all)';
            totalsBtn.addEventListener('click', () => {
                selectedStatProject = '__totals__';
                if (statProjectName)
                    statProjectName.textContent = chrome.i18n.getMessage('pomodoroStatsTotal') || 'Totals';
                closeProjectDropdown();
                renderTotalsStats();
            });
            totalsItem.appendChild(totalsBtn);
            statProjectList.appendChild(totalsItem);
        }

        savedStatProjects.forEach((proj) => {
            const item = document.createElement('li');
            item.className = 'pomo-project-item' + (selectedStatProject === proj.name ? ' active' : '');
            item.dataset.projectName = proj.name;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `${proj.name}  (${proj.entries.length})`;
            btn.addEventListener('click', () => {
                selectedStatProject = proj.name;
                if (statProjectName) statProjectName.textContent = proj.name;
                closeProjectDropdown();
                if (proj.entries.length > 0) renderSavedStats(proj.entries[0]);
            });
            item.appendChild(btn);
            statProjectList.appendChild(item);
        });

        // Search filter
        if (statProjectSearch) {
            statProjectSearch.addEventListener('input', () => {
                const term = statProjectSearch.value.toLowerCase().trim();
                statProjectList.querySelectorAll('.pomo-project-item').forEach((item) => {
                    const name = (item.dataset.projectName || '').toLowerCase();
                    item.classList.toggle('hidden', !!term && !name.includes(term));
                });
            });
        }
    }

    function renderTotalsStats() {
        // Aggregate all entries from all saved projects
        const allEntries = savedStatProjects.flatMap((p) => p.entries);
        if (allEntries.length === 0) return;

        const set = (id, val) => {
            const el = $(id);
            if (el) el.textContent = val;
        };
        const totalFocus = allEntries.reduce((a, e) => a + (e.totalFocusSeconds || 0), 0);
        const totalBreak = allEntries.reduce((a, e) => a + (e.totalBreakSeconds || 0), 0);
        const totalInterrupt = allEntries.reduce((a, e) => a + (e.totalInterruptionSeconds || 0), 0);
        const totalCycles = allEntries.reduce((a, e) => a + (e.completedCycles || 0), 0);
        const totalInterruptions = allEntries.reduce((a, e) => a + (e.interruptions || 0), 0);
        const totalTime = totalFocus + totalBreak;

        const avgFocusEntries = allEntries.filter((e) => e.avgFocus > 0);
        const avgFocus =
            avgFocusEntries.length > 0
                ? Math.round(avgFocusEntries.reduce((a, e) => a + e.avgFocus, 0) / avgFocusEntries.length)
                : 0;

        set('stat-focus-time', fmtDur(totalFocus));
        set('stat-break-time', fmtDur(totalBreak));
        set('stat-total-time', fmtDur(totalTime));
        set('stat-interrupt-time', totalInterrupt > 0 ? fmtDur(totalInterrupt) : '—');
        set('stat-completed-cycles', totalCycles);
        set(
            'stat-completed-sessions',
            `${allEntries.length} ${chrome.i18n.getMessage('pomodoroStatsSessions') || 'sessions'}`,
        );
        set('stat-interruptions', totalInterruptions);
        set('stat-avg-focus', avgFocus > 0 ? fmtDur(avgFocus) : '—');

        // Earliest start, latest end
        const starts = allEntries.map((e) => e.sessionStarted).filter(Boolean);
        const ends = allEntries.map((e) => e.savedAt).filter(Boolean);
        set('stat-started', starts.length > 0 ? fmtDate(Math.min(...starts)) : '—');
        set('stat-finished', ends.length > 0 ? fmtDate(Math.max(...ends)) : '—');

        // Efficiency
        const eff = totalTime > 0 ? Math.round((totalFocus / totalTime) * 100) : 0;
        const effFill = $('stat-efficiency-fill');
        const effPct = $('stat-efficiency-pct');
        if (effFill) {
            effFill.style.width = eff + '%';
            effFill.style.background =
                eff >= 80
                    ? 'var(--interactive-color)'
                    : eff >= 60
                      ? '#27ae60'
                      : eff >= 40
                        ? '#f39c12'
                        : eff > 0
                          ? '#e74c3c'
                          : 'var(--interactive-color)';
        }
        if (effPct) effPct.textContent = eff + '%';

        // Aggregate task logs
        const allTaskLogs = allEntries.flatMap((e) => e.taskLog || []);
        renderTaskStatsFromData(allTaskLogs);
    }

    function openProjectDropdown() {
        if (!statProjectDropdown) return;
        statProjectDropdown.classList.add('visible');
        if (statProjectSearch) {
            statProjectSearch.value = '';
            // Clear hidden state
            statProjectList?.querySelectorAll('.pomo-project-item').forEach((i) => i.classList.remove('hidden'));
            setTimeout(() => statProjectSearch.focus(), 50);
        }
    }

    function closeProjectDropdown() {
        statProjectDropdown?.classList.remove('visible');
    }

    // ─── Note counter management ────────────────────────────────
    function updateNoteCounter(count) {
        pomodoroNoteCount = count;
        if (!noteCounter) return;
        if (count > 0) {
            noteCounter.textContent = count;
            noteCounter.classList.remove('hidden');
        } else {
            noteCounter.classList.add('hidden');
        }
    }

    function openPomoNoteModal() {
        const pomoData = localState
            ? {
                  startTime: localState.stats?.sessionStarted || Date.now(),
                  focusDuration: localState.stats?.totalFocusSeconds || 0,
                  cycle: localState.completedCycles || 0,
                  projectName: localState.settings?.projectName || '',
              }
            : null;

        // Store pomoData so the note-save handler can attach it
        window._pendingPomoData = pomoData;

        const internal = window._pomoInternal;
        if (!internal) return;

        // Build a context for the note — use current notes context if active, else orphan
        const ctx = internal.getNotesContext() || {
            type: 'orphan',
            id: -1,
            title: pomoData?.projectName || 'Pomodoro',
        };

        internal.openNoteModal(ctx, null, { isPomodoro: true });
    }

    async function openPomoNotesView() {
        const internal = window._pomoInternal;
        if (!internal) return;

        // Use a dedicated pomodoro context so showNotesView fetches from g_pomodoro
        const ctx = { type: 'pomodoro', id: -1, title: 'Pomodoro' };
        await internal.showNotesView(ctx);
    }

    // ─── Load state from background ────────────────────────────
    async function loadState() {
        const resp = await chrome.runtime.sendMessage({ action: 'pomodoroGetState' });
        if (resp?.state) {
            render(resp.state, resp.remaining);
            if (resp.state.isRunning) startTick();
        }
    }

    // ─── Panel open/close ───────────────────────────────────────
    openBtn.addEventListener('click', async () => {
        const wasHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !wasHidden);

        // NEW: If we are opening Pomodoro, hide view-toggle-panel to avoid conflicts
        if (wasHidden) {
            const vtPanel = document.getElementById('view-toggle-panel');
            if (vtPanel) vtPanel.classList.add('hidden');
        }
        // Stop blinking when panel opens; resume when panel hides
        if (!wasHidden) {
            // Panel is now hidden — if task running, start blinking
            const taskRunning = isAnyTaskRunning();
            openBtn.classList.toggle('pomodoro-running', taskRunning);
        } else {
            // Panel is now open — stop blinking
            openBtn.classList.remove('pomodoro-running');
        }
        await chrome.storage.local.set({ pomodoroPanelOpen: wasHidden });
        if (wasHidden) {
            await loadState();
            await loadSavedProjects();
            const { pomoMethod: savedMethod } = await chrome.storage.local.get('pomoMethod');
            if (savedMethod) applyMethod(savedMethod);
            // Restore alt timer state after method is applied
            await restoreAltTimerState();
        }
    });
    closeBtn.addEventListener('click', async () => {
        panel.classList.add('hidden');
        stopTiempoClock();
        // If task still running, start blinking
        const taskRunning = isAnyTaskRunning();
        openBtn.classList.toggle('pomodoro-running', taskRunning);
        await chrome.storage.local.set({ pomodoroPanelOpen: false });
    });

    // ─── Sub-panel toggles ──────────────────────────────────────
    function toggleSubPanel(panelEl, toggleBtn, otherPanelEl, otherBtn) {
        const opening = panelEl.classList.contains('hidden');
        panelEl.classList.toggle('hidden', !opening);
        toggleBtn.classList.toggle('active-panel', opening);
        if (opening) {
            otherPanelEl.classList.add('hidden');
            otherBtn.classList.remove('active-panel');
            if (panelEl === statsPanel) {
                loadSavedProjects();
                renderProjectDropdown();
            }
        }
    }
    settingsBtn?.addEventListener('click', () => toggleSubPanel(settingsPanel, settingsBtn, statsPanel, statsBtn));
    statsBtn?.addEventListener('click', () => toggleSubPanel(statsPanel, statsBtn, settingsPanel, settingsBtn));

    // Clicking pomodoro-time also toggles settings panel (linked to settingsBtn)
    timeDisplay?.addEventListener('click', () => toggleSubPanel(settingsPanel, settingsBtn, statsPanel, statsBtn));

    // ─── Method buttons ─────────────────────────────────────────
    methodBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (isAnyTaskRunning()) {
                showNotification('pomodoroMethodChangeError', true);
                return;
            }
            applyMethod(btn.dataset.method);
        });
    });

    // Update temporizador display when inputs change
    [timerHoursInput, timerMinutesInput, timerSecondsInput].forEach((el) => {
        el?.addEventListener('change', () => {
            if (pomoMethod === 'temporizador') {
                if (!temporizadorRunning) {
                    temporizadorRemaining = 0; // force fresh start
                    if (timeDisplay) timeDisplay.textContent = fmtHMS(getTimerInputSecs());
                }
                // Update total in cycles display
                const totalMin = Math.round(getTimerInputSecs() / 60);
                if (cyclesTotal) cyclesTotal.textContent = totalMin;
            }
            validateMethod('temporizador');
            saveLocalSettings();
        });
        el?.addEventListener('input', () => {
            if (pomoMethod === 'temporizador') {
                if (!temporizadorRunning) {
                    temporizadorRemaining = 0;
                    if (timeDisplay) timeDisplay.textContent = fmtHMS(getTimerInputSecs());
                }
                // Update total in cycles display
                const totalMin = Math.round(getTimerInputSecs() / 60);
                if (cyclesTotal) cyclesTotal.textContent = totalMin;
            }
            validateMethod('temporizador');
        });
    });

    // ─── Pomo Tiempo: Calendar + Time Pickers ────────────────────
    function initPomoTiempoCalendar() {
        if (!pomoCalPopup || !pomoDateTrigger || !pomoTimeTrigger) return;

        // Ensure popups are direct children of body for fixed positioning
        if (pomoCalPopup.parentElement !== document.body) document.body.appendChild(pomoCalPopup);
        if (pomoTimePopup && pomoTimePopup.parentElement !== document.body) document.body.appendChild(pomoTimePopup);

        let calCurrentDate = new Date();
        const monthNames = [
            chrome.i18n.getMessage('monthJanuary') || 'January',
            chrome.i18n.getMessage('monthFebruary') || 'February',
            chrome.i18n.getMessage('monthMarch') || 'March',
            chrome.i18n.getMessage('monthApril') || 'April',
            chrome.i18n.getMessage('monthMay') || 'May',
            chrome.i18n.getMessage('monthJune') || 'June',
            chrome.i18n.getMessage('monthJuly') || 'July',
            chrome.i18n.getMessage('monthAugust') || 'August',
            chrome.i18n.getMessage('monthSeptember') || 'September',
            chrome.i18n.getMessage('monthOctober') || 'October',
            chrome.i18n.getMessage('monthNovember') || 'November',
            chrome.i18n.getMessage('monthDecember') || 'December',
        ];

        function closeAll() {
            pomoCalPopup?.classList.add('hidden');
            pomoTimePopup?.classList.add('hidden');
            pomoActiveTrigger = null;
            pomoActivePopup = null;
        }

        function updatePopupPosition(trigger, popup) {
            if (!trigger || !popup) return;
            const rect = trigger.getBoundingClientRect();
            const popW = popup.offsetWidth || 240;
            const popH = popup.offsetHeight || 250;
            const pad = 5;
            let top = rect.bottom + pad;
            if (top + popH > window.innerHeight) top = rect.top - popH - pad;
            let left = rect.left;
            if (left + popW > window.innerWidth) left = window.innerWidth - popW - pad;
            popup.style.position = 'fixed';
            popup.style.top = `${Math.max(pad, top)}px`;
            popup.style.left = `${Math.max(pad, left)}px`;
            popup.style.zIndex = '99999';
        }

        function renderCalendar() {
            const grid = $('pomo-calendar-days-grid');
            const monthYearEl = $('pomo-cal-month-year');
            if (!grid || !monthYearEl) return;
            const year = calCurrentDate.getFullYear();
            const month = calCurrentDate.getMonth();
            const today = new Date();
            monthYearEl.textContent = `${monthNames[month]} ${year}`;
            grid.innerHTML = '';
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            for (let i = 0; i < firstDay; i++) {
                const empty = document.createElement('div');
                empty.className = 'pomo-cal-day empty';
                grid.appendChild(empty);
            }
            for (let day = 1; day <= daysInMonth; day++) {
                const dayEl = document.createElement('div');
                dayEl.className = 'pomo-cal-day';
                dayEl.textContent = day;
                const isPast =
                    year < today.getFullYear() ||
                    (year === today.getFullYear() && month < today.getMonth()) ||
                    (year === today.getFullYear() && month === today.getMonth() && day < today.getDate());
                if (isPast) {
                    dayEl.classList.add('disabled');
                    grid.appendChild(dayEl);
                    continue;
                }
                if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
                    dayEl.classList.add('today');
                }
                if (tiempoSelectedDate) {
                    const sd = tiempoSelectedDate;
                    if (day === sd.getDate() && month === sd.getMonth() && year === sd.getFullYear()) {
                        dayEl.classList.add('selected');
                    }
                }
                dayEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tiempoSelectedDate = new Date(year, month, day);
                    const formatted = formatDateYMD(tiempoSelectedDate);
                    pomoDateTrigger.textContent = formatted;
                    // Validate time (if today selected, ensure time > now)
                    validateAndFixTiempoTime();
                    pomoCalPopup.classList.add('hidden');
                    pomoActiveTrigger = null;
                    pomoActivePopup = null;
                    updateTiempoIdleDisplay();
                    validateMethod('tiempo');
                    saveLocalSettings();
                });
                grid.appendChild(dayEl);
            }
        }

        // Date trigger click
        pomoDateTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!pomoCalPopup.classList.contains('hidden') && pomoActiveTrigger === pomoDateTrigger) {
                closeAll();
                return;
            }
            pomoTimePopup?.classList.add('hidden');
            pomoActiveTrigger = pomoDateTrigger;
            pomoActivePopup = pomoCalPopup;
            pomoCalPopup.classList.remove('hidden');
            renderCalendar();
            requestAnimationFrame(() => updatePopupPosition(pomoDateTrigger, pomoCalPopup));
        });

        $('pomo-cal-prev-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = new Date();
            const prev = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() - 1, 1);
            if (prev >= new Date(now.getFullYear(), now.getMonth(), 1)) {
                calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
                renderCalendar();
            }
        });
        $('pomo-cal-next-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
            renderCalendar();
        });
        $('pomo-cal-clear-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            // Reset to today
            const now = new Date();
            tiempoSelectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            pomoDateTrigger.textContent = formatDateYMD(tiempoSelectedDate);
            validateAndFixTiempoTime();
            closeAll();
            updateTiempoIdleDisplay();
        });

        // Time picker setup
        function updatePomoTimeTrigger() {
            const hh = (pomoInputHour?.value || '00').padStart(2, '0');
            const mm = (pomoInputMinute?.value || '00').padStart(2, '0');
            tiempoSelectedHH = hh;
            tiempoSelectedMM = mm;
            if (pomoTimeTrigger) pomoTimeTrigger.textContent = `${hh}:${mm}`;
            updateTiempoIdleDisplay();
            validateMethod('tiempo');
            saveLocalSettings();
        }

        function validateAndFixTiempoTime() {
            const now = new Date();
            if (!tiempoSelectedDate) return;
            const selDay = new Date(tiempoSelectedDate);
            selDay.setHours(0, 0, 0, 0);
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            // If selected date is today, time must be > now
            if (selDay.getTime() === today.getTime()) {
                const hh = parseInt(tiempoSelectedHH || '0');
                const mm = parseInt(tiempoSelectedMM || '0');
                const selMs = hh * 3600000 + mm * 60000;
                const nowMs = now.getHours() * 3600000 + now.getMinutes() * 60000;
                if (selMs <= nowMs) {
                    // Bump to 1 hour from now
                    const future = new Date(now.getTime() + 3600000);
                    tiempoSelectedHH = String(future.getHours()).padStart(2, '0');
                    tiempoSelectedMM = String(future.getMinutes()).padStart(2, '0');
                    if (pomoTimeTrigger) pomoTimeTrigger.textContent = `${tiempoSelectedHH}:${tiempoSelectedMM}`;
                }
            }
        }

        if (pomoInputHour && pomoInputMinute) {
            [pomoInputHour, pomoInputMinute].forEach((input) => {
                input.addEventListener('input', (e) => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (input === pomoInputHour && parseInt(val) > 23) val = '23';
                    if (input === pomoInputMinute && parseInt(val) > 59) val = '59';
                    e.target.value = val;
                    if (input === pomoInputHour && val.length === 2) {
                        pomoInputMinute.focus();
                        pomoInputMinute.select();
                    }
                    updatePomoTimeTrigger();
                });
                input.addEventListener('blur', () => {
                    if (input.value === '') input.value = '00';
                    input.value = input.value.padStart(2, '0');
                    updatePomoTimeTrigger();
                    validateAndFixTiempoTime();
                });
            });

            pomoTimePopup?.querySelectorAll('.time-arrow-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const unit = btn.dataset.unit;
                    const dir = btn.dataset.dir;
                    if (unit === 'hour') {
                        let val = parseInt(pomoInputHour.value) || 0;
                        val = dir === 'up' ? (val + 1) % 24 : (val - 1 + 24) % 24;
                        pomoInputHour.value = String(val).padStart(2, '0');
                    } else {
                        let val = parseInt(pomoInputMinute.value) || 0;
                        val = dir === 'up' ? (val + 1) % 60 : (val - 1 + 60) % 60;
                        pomoInputMinute.value = String(val).padStart(2, '0');
                    }
                    updatePomoTimeTrigger();
                });
            });
        }

        pomoTimeTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!pomoTimePopup) return;
            if (!pomoTimePopup.classList.contains('hidden') && pomoActiveTrigger === pomoTimeTrigger) {
                closeAll();
                return;
            }
            pomoCalPopup?.classList.add('hidden');
            pomoActiveTrigger = pomoTimeTrigger;
            pomoActivePopup = pomoTimePopup;
            // Load current values into inputs
            if (pomoInputHour) pomoInputHour.value = tiempoSelectedHH || '00';
            if (pomoInputMinute) pomoInputMinute.value = tiempoSelectedMM || '00';
            pomoTimePopup.classList.remove('hidden');
            requestAnimationFrame(() => updatePopupPosition(pomoTimeTrigger, pomoTimePopup));
            setTimeout(() => {
                pomoInputHour?.focus();
                pomoInputHour?.select();
            }, 10);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (pomoCalPopup && !pomoCalPopup.contains(e.target) && e.target !== pomoDateTrigger) {
                pomoCalPopup.classList.add('hidden');
                if (pomoActivePopup === pomoCalPopup) {
                    pomoActivePopup = null;
                    pomoActiveTrigger = null;
                }
            }
            if (pomoTimePopup && !pomoTimePopup.contains(e.target) && e.target !== pomoTimeTrigger) {
                pomoTimePopup.classList.add('hidden');
                if (pomoActivePopup === pomoTimePopup) {
                    pomoActivePopup = null;
                    pomoActiveTrigger = null;
                }
            }
        });

        window.addEventListener('resize', () => {
            if (pomoActivePopup && pomoActiveTrigger) {
                updatePopupPosition(pomoActiveTrigger, pomoActivePopup);
            }
        });
    }

    // Live clock update for tiempo mode (idle and running — always shows current time)
    let tiempoClock = null;
    function startTiempoClock() {
        stopTiempoClock();
        tiempoClock = setInterval(() => {
            if (pomoMethod === 'tiempo') {
                updateTiempoCurrentClock();
                if (tiempoRunning && tiempoStartMs > 0) {
                    // Always use current configured end time (dynamic)
                    const currentEndMs = getEndTimeMs() || tiempoEndMs;
                    const totalSecs = Math.round((currentEndMs - tiempoStartMs) / 1000);
                    const elapsed = Math.round((Date.now() - tiempoStartMs) / 1000);
                    const pct = totalSecs > 0 ? Math.min(100, Math.round((elapsed / totalSecs) * 100)) : 0;
                    if (cyclesFill) cyclesFill.style.width = pct + '%';
                    if (cyclesPct) cyclesPct.textContent = pct + '%';
                    if (cyclesCurrent) cyclesCurrent.textContent = Math.floor(elapsed / 60);
                    if (cyclesTotal) cyclesTotal.textContent = Math.round(totalSecs / 60);
                    // Auto-stop using the dynamic end time
                    if (Date.now() >= currentEndMs) {
                        tiempoRunning = false;
                        tiempoEndMs = 0;
                        stopTiempoClock();
                        if (localState?.settings?.sound) playSound('work');
                        enableMethodButtons();
                        saveAltTimerState();
                        finishAltTask();
                        // Restart idle clock
                        startTiempoClock();
                    }
                }
                // Update cyclesTotal when idle based on remaining time to configured end
                if (!tiempoRunning) {
                    const remSecs = getSecsUntilEndTime();
                    if (cyclesTotal) cyclesTotal.textContent = Math.round(remSecs / 60);
                    validateMethod('tiempo');
                }
            }
        }, 1000);
    }
    function stopTiempoClock() {
        if (tiempoClock) {
            clearInterval(tiempoClock);
            tiempoClock = null;
        }
    }

    // ─── Project dropdown toggle ────────────────────────────────
    statProjectBtn?.addEventListener('click', () => {
        const isVisible = statProjectDropdown?.classList.contains('visible');
        if (isVisible) {
            closeProjectDropdown();
        } else {
            renderProjectDropdown();
            openProjectDropdown();
        }
    });
    document.addEventListener('click', (e) => {
        if (!statProjectBtn?.contains(e.target) && !statProjectDropdown?.contains(e.target)) {
            closeProjectDropdown();
        }
    });

    // ─── Controls ──────────────────────────────────────────────
    startBtn?.addEventListener('click', async () => {
        // Non-pomodoro methods handled locally
        if (pomoMethod === 'cronometro') {
            if (cronometroRunning) {
                // Pause or stop depending on toggle
                if (cronometroStopToggle?.checked) {
                    stopCronometro();
                } else {
                    pauseCronometro();
                }
            } else {
                if (cronometroElapsed === 0) {
                    startCronometro();
                } else {
                    // Resume
                    startCronometroResume();
                }
            }
            return;
        }
        if (pomoMethod === 'temporizador') {
            if (temporizadorRunning) {
                // Stop (finish) the task early
                temporizadorRunning = false;
                if (uiInterval) {
                    clearInterval(uiInterval);
                    uiInterval = null;
                }
                updateStartPauseUI(false);
                enableMethodButtons();
                saveAltTimerState();
                finishAltTask();
            } else {
                if (temporizadorRemaining > 0) {
                    resumeTemporizador();
                } else {
                    startTemporizador();
                }
            }
            return;
        }
        if (pomoMethod === 'tiempo') {
            if (tiempoRunning) {
                // Stop and finish task early
                tiempoRunning = false;
                tiempoEndMs = 0;
                stopTiempoClock();
                enableMethodButtons();
                saveAltTimerState();
                finishAltTask();
                // Restart idle clock
                startTiempoClock();
            } else {
                startTiempo();
            }
            return;
        }
        // Default: pomodoro mode
        if (!localState) return;
        if (localState.isRunning) {
            stopTick();
            const resp = await chrome.runtime.sendMessage({ action: 'pomodoroPause' });
            if (resp) render(resp.state, resp.remaining);
        } else {
            const resp = await chrome.runtime.sendMessage({ action: 'pomodoroStart' });
            if (resp) {
                render(resp.state, resp.remaining);
                startTick();
            }
        }
    });

    resetBtn?.addEventListener('click', async () => {
        if (pomoMethod !== 'pomodoro') {
            stopAllAltTimers();
            updateStartPauseUI(false);
            if (startBtn) startBtn.disabled = false;
            if (timeDisplay) {
                if (pomoMethod === 'cronometro') {
                    updateCronometroDisplay();
                } else if (pomoMethod === 'temporizador') {
                    const secs = getTimerInputSecs();
                    temporizadorRemaining = secs;
                    timeDisplay.textContent = fmtHMS(secs);
                    // Reset cycles
                    if (cyclesCurrent) cyclesCurrent.textContent = '0';
                    const totalMin = Math.round(secs / 60);
                    if (cyclesTotal) cyclesTotal.textContent = totalMin;
                    if (cyclesFill) cyclesFill.style.width = '0%';
                    if (cyclesPct) cyclesPct.textContent = '0%';
                } else if (pomoMethod === 'tiempo') {
                    updateTiempoCurrentClock();
                    startTiempoClock(); // restart idle clock
                    const remSecs = getSecsUntilEndTime();
                    const remMin = Math.round(remSecs / 60);
                    if (cyclesCurrent) cyclesCurrent.textContent = '0';
                    if (cyclesTotal) cyclesTotal.textContent = remMin;
                    if (cyclesFill) cyclesFill.style.width = '0%';
                    if (cyclesPct) cyclesPct.textContent = '0%';
                }
            }
            saveAltTimerState();
            return;
        }
        stopTick();
        const resp = await chrome.runtime.sendMessage({ action: 'pomodoroReset' });
        if (resp) render(resp.state, getModeDuration(resp.state));
    });

    skipBtn?.addEventListener('click', async () => {
        stopTick();
        const resp = await chrome.runtime.sendMessage({ action: 'pomodoroSkip' });
        if (resp) {
            render(resp.state, resp.remaining);
            if (resp.state.isRunning) startTick();
        }
    });

    modeBtns.forEach((btn) =>
        btn.addEventListener('click', async () => {
            // If we were in a non-pomodoro method, switch back to pomodoro first
            if (pomoMethod !== 'pomodoro') {
                applyMethod('pomodoro');
            }
            stopTick();
            const resp = await chrome.runtime.sendMessage({ action: 'pomodoroSetMode', mode: btn.dataset.mode });
            if (resp) render(resp.state, resp.remaining);
        }),
    );

    // ─── New corner / toolbar buttons ──────────────────────────
    // Note button (toolbar) — creates note
    pomodoroNoteBtn?.addEventListener('click', () => openPomoNoteModal());
    pomodoroDashboardBtn?.addEventListener('click', () => {
        const dashboardUrl = chrome.runtime.getURL('src/ui/pages/pomodoro-dashboard/dashboard.html');
        chrome.tabs.create({ url: dashboardUrl, active: true });
    });

    // Note button (corner of timer) — navigates to pomodoro notes view
    noteCornerBtn?.addEventListener('click', () => openPomoNotesView());

    // Editable project display — sync to settings input & localState in real-time
    if (projectDisplay && projectDisplay.tagName === 'INPUT') {
        projectDisplay.addEventListener('input', () => {
            const val = projectDisplay.value;
            if (projName) projName.value = val;
            if (projectInline) projectInline.value = val;
            if (localState?.settings) localState.settings.projectName = val;
            schedSave();
        });
    }

    // Inline project input (pomo-row-project)
    if (projectInline) {
        projectInline.addEventListener('input', () => {
            const val = projectInline.value;
            if (projName) projName.value = val;
            if (projectDisplay && projectDisplay.tagName === 'INPUT') projectDisplay.value = val;
            if (localState?.settings) localState.settings.projectName = val;
            schedSave();
        });
    }

    // Task Reset: zero all stats for current project
    taskResetBtn?.addEventListener('click', async () => {
        taskCompletionLog = [];
        updateNoteCounter(0);
        stopTick();
        stopAllAltTimers();
        updateStartPauseUI(false);
        if (pomoMethod === 'cronometro') updateCronometroDisplay();
        else if (pomoMethod === 'temporizador') updateTemporizadorDisplay();
        else if (pomoMethod === 'tiempo') updateTiempoCurrentClock();

        const resp = await chrome.runtime.sendMessage({ action: 'pomodoroClearStats' });
        if (resp?.state) render(resp.state, getModeDuration(resp.state));
    });

    // Task Finish: mark task as done, save if autosave on
    taskFinishBtn?.addEventListener('click', async () => {
        if (!localState) return;
        stopTick();
        stopAllAltTimers();
        updateStartPauseUI(false);
        // Log task completion
        const projectN =
            localState.settings.projectName || chrome.i18n.getMessage('pomodoroUntitledProject') || 'Untitled';
        const taskEntry = {
            name: projectN,
            startTime: localState.stats?.sessionStarted || Date.now(),
            endTime: Date.now(),
            duration: localState.stats?.totalFocusSeconds || 0,
            cycle: localState.completedCycles || 0,
        };
        taskCompletionLog.push(taskEntry);
        renderTaskStats();

        // Auto-save if enabled
        if (localState.settings.autosave) {
            await saveStatsToDb(localState);
        }

        // Reset timer via background
        const resp = await chrome.runtime.sendMessage({ action: 'pomodoroReset' });
        if (resp?.state) {
            render(resp.state, getModeDuration(resp.state));
            // Reset cycles counter to 0 after task finish
            if (pomoMethod === 'pomodoro') {
                if (cyclesCurrent) cyclesCurrent.textContent = '0';
                if (cyclesFill) cyclesFill.style.width = '0%';
                if (cyclesPct) cyclesPct.textContent = '0%';
            }
        }

        // Restore time display for current method
        if (pomoMethod === 'pomodoro' && resp?.state) {
            if (timeDisplay) timeDisplay.textContent = fmt(getModeDuration(resp.state));
        } else if (pomoMethod === 'temporizador') {
            temporizadorRemaining = 0;
            const secs = getTimerInputSecs();
            if (timeDisplay) timeDisplay.textContent = secs > 0 ? fmtHMS(secs) : '00:00';
            // Reset cycles for temporizador
            if (cyclesCurrent) cyclesCurrent.textContent = '0';
            const totalMin = Math.round(secs / 60);
            if (cyclesTotal) cyclesTotal.textContent = totalMin;
            if (cyclesFill) cyclesFill.style.width = '0%';
            if (cyclesPct) cyclesPct.textContent = '0%';
        } else if (pomoMethod === 'cronometro') {
            cronometroElapsed = 0;
            if (timeDisplay) timeDisplay.textContent = '00:00';
        } else if (pomoMethod === 'tiempo') {
            updateTiempoCurrentClock();
            startTiempoClock();
            // Reset cycles
            const remSecs = getSecsUntilEndTime();
            const remMin = Math.round(remSecs / 60);
            if (cyclesCurrent) cyclesCurrent.textContent = '0';
            if (cyclesTotal) cyclesTotal.textContent = remMin;
            if (cyclesFill) cyclesFill.style.width = '0%';
            if (cyclesPct) cyclesPct.textContent = '0%';
        }
        saveAltTimerState();
        showNotification('pomodoroTaskCompleted', false, [projectN]);
    });

    // Save stats button
    saveStatsBtn?.addEventListener('click', async () => {
        if (!localState) return;
        await saveStatsToDb(localState);
    });

    // Clear stats button
    clearBtn?.addEventListener('click', async () => {
        stopTick();
        if (selectedStatProject && selectedStatProject !== null) {
            // Clear saved stats for this project from DB
            await clearPomoStatsFromDb(selectedStatProject);
            await loadSavedProjects();
            selectedStatProject = null;
            if (statProjectName)
                statProjectName.textContent =
                    chrome.i18n.getMessage('pomodoroCurrentSessionLabel') || '— current session —';
            if (localState) renderStats(localState);
        } else {
            taskCompletionLog = [];
            updateNoteCounter(0);
            const resp = await chrome.runtime.sendMessage({ action: 'pomodoroClearStats' });
            if (resp?.state) render(resp.state, getModeDuration(resp.state));
        }
    });

    // Export stats
    exportBtn?.addEventListener('click', async () => {
        let stateToExport = localState;

        // If localState is null, try to get it from background
        if (!stateToExport) {
            const resp = await chrome.runtime.sendMessage({ action: 'pomodoroGetState' });
            if (resp?.state) {
                stateToExport = resp.state;
                localState = resp.state;
            }
        }

        if (!stateToExport) return;

        const st = stateToExport.stats || {};
        const data = {
            project: stateToExport.settings?.projectName || 'Unnamed',
            exportedAt: new Date().toISOString(),
            focusTime: fmtDur(st.totalFocusSeconds || 0),
            breakTime: fmtDur(st.totalBreakSeconds || 0),
            totalTime: fmtDur((st.totalFocusSeconds || 0) + (st.totalBreakSeconds || 0)),
            completedCycles: stateToExport.completedCycles || 0,
            interruptions: stateToExport.interruptions || 0,
            taskLog: taskCompletionLog,
            noteCount: pomodoroNoteCount,
        };

        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeProjectName = (data.project || 'Unnamed').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `pomodoro_${safeProjectName}_${Date.now()}.json`;
            document.body.appendChild(a); // Crucial for some environments
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Pomodoro export failed:', err);
        }
    });

    // Import stats
    importBtn?.addEventListener('click', () => {
        importInput?.click();
    });

    importInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                let entries = [];

                if (Array.isArray(json)) {
                    entries = json;
                } else if (json.type === 'pomodoro_backup') {
                    entries = json.data || [];
                } else if (json.raw) {
                    const st = json.raw.stats || {};
                    const projectN = json.raw.settings?.projectName || 'Unnamed';
                    entries = [
                        {
                            id: `${projectN}_${st.sessionStarted || Date.now()}`,
                            projectName: projectN,
                            projectFolder: json.raw.settings?.projectFolder || '',
                            projectTag: json.raw.settings?.projectTag || '',
                            sessionStarted: st.sessionStarted,
                            savedAt: Date.now(),
                            totalFocusSeconds: st.totalFocusSeconds || 0,
                            totalBreakSeconds: st.totalBreakSeconds || 0,
                            totalInterruptionSeconds: st.totalInterruptionSeconds || 0,
                            completedCycles: st.completedCycles || 0,
                            interruptions: st.interruptions || 0,
                            avgFocus: st.avgFocus || 0,
                            sessionFocusList: st.sessionFocusList || [],
                        },
                    ];
                } else {
                    throw new Error('Unsupported format');
                }

                let imported = 0;
                for (const entry of entries) {
                    if (!entry.id) continue;
                    await chrome.runtime.sendMessage({ action: 'savePomoStats', stats: entry });
                    imported++;
                }

                showNotification('pomodoroStatsSaved', false);
                await loadSavedProjects();
            } catch (err) {
                console.error('Import error:', err);
                // A native alert blocks the page and ignores the theme; the app's own
                // notification says the same thing in place.
                showNotification('dashboardErrorLoad', true, [err.message || String(err)]);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // ─── Stepper buttons ────────────────────────────────────────
    document.querySelectorAll('.pomo-num-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.target);
            if (!input) return;
            const delta = parseInt(btn.dataset.delta);
            const min = parseInt(input.min) || 0;
            const max = parseInt(input.max) || 999;
            input.value = Math.min(max, Math.max(min, (parseInt(input.value) || 0) + delta));
            schedSave();
            saveLocalSettings();
            // Real-time temporizador display + cycles update
            if (pomoMethod === 'temporizador' && !temporizadorRunning) {
                temporizadorRemaining = 0;
                if (timeDisplay) timeDisplay.textContent = fmtHMS(getTimerInputSecs());
                const totalMin = Math.round(getTimerInputSecs() / 60);
                if (cyclesTotal) cyclesTotal.textContent = totalMin;
            }
            validateMethod('temporizador');
        });
    });

    // ─── Settings save ──────────────────────────────────────────
    let saveTimer = null;
    function schedSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            const settings = {
                workDuration: Math.max(1, parseInt(workInput?.value) || 25) * 60,
                shortBreak: Math.max(1, parseInt(shortInput?.value) || 5) * 60,
                longBreak: Math.max(1, parseInt(longInput?.value) || 15) * 60,
                sessionsBeforeLong: Math.max(1, parseInt(sessInput?.value) || 4),
                endAfter: Math.max(1, parseInt(endInput?.value) || 8),
                sound: soundToggle?.checked ?? true,
                autostart: autostartTog?.checked ?? false,
                autosave: autosaveTog?.checked ?? false,
                autofinish: autofinishTog?.checked ?? false,
                projectName: projName?.value.trim() || '',
                projectTag: projTag?.value.trim() || '',
                projectFolder: projFolder?.value.trim() || '',
            };
            const resp = await chrome.runtime.sendMessage({ action: 'pomodoroSaveSettings', settings });
            if (resp?.state) render(resp.state, getModeDuration(resp.state));
        }, 700);
    }

    // Immediately patch localState when toggles change (real-time effect)
    function applySettingsToLocalState() {
        if (!localState) return;
        localState.settings = {
            ...localState.settings,
            sound: soundToggle?.checked ?? true,
            autostart: autostartTog?.checked ?? false,
            autosave: autosaveTog?.checked ?? false,
            autofinish: autofinishTog?.checked ?? false,
            workDuration: Math.max(1, parseInt(workInput?.value) || 25) * 60,
            shortBreak: Math.max(1, parseInt(shortInput?.value) || 5) * 60,
            longBreak: Math.max(1, parseInt(longInput?.value) || 15) * 60,
            sessionsBeforeLong: Math.max(1, parseInt(sessInput?.value) || 4),
            endAfter: Math.max(1, parseInt(endInput?.value) || 8),
            projectName: projName?.value.trim() || localState.settings.projectName || '',
            projectTag: projTag?.value.trim() || localState.settings.projectTag || '',
            projectFolder: projFolder?.value.trim() || localState.settings.projectFolder || '',
        };
        updateUnitTooltips();
    }

    [workInput, shortInput, longInput, sessInput, endInput, projName, projTag, projFolder].forEach((el) =>
        el?.addEventListener('change', () => {
            applySettingsToLocalState();
            schedSave();
        }),
    );
    [workInput, shortInput, longInput, sessInput, endInput].forEach((el) =>
        el?.addEventListener('input', () => {
            applySettingsToLocalState();
            updateUnitTooltips();
        }),
    );
    soundToggle?.addEventListener('change', () => {
        applySettingsToLocalState();
        schedSave();
    });
    autostartTog?.addEventListener('change', () => {
        applySettingsToLocalState();
        schedSave();
    });
    autosaveTog?.addEventListener('change', () => {
        applySettingsToLocalState();
        schedSave();
    });
    autofinishTog?.addEventListener('change', () => {
        applySettingsToLocalState();
        schedSave();
    });

    // Local settings toggles (not sent to background)
    cronometroStopToggle?.addEventListener('change', () => saveLocalSettings());
    temporizadorStopToggle?.addEventListener('change', () => saveLocalSettings());
    tiempoShowSeconds?.addEventListener('change', () => saveLocalSettings());
    hideProjectToggle?.addEventListener('change', () => {
        applyHideProject(hideProjectToggle.checked);
        saveLocalSettings();
    });
    hideProgressToggle?.addEventListener('change', () => {
        applyHideProgress(hideProgressToggle.checked);
        saveLocalSettings();
    });

    // ─── External updates from background ──────────────────────
    window._pomodoroHandleUpdate = function (req) {
        const { state, event, completedMode } = req;
        if (!state) return;

        const remaining = state.isRunning
            ? Math.max(0, getModeDuration(state) - Math.floor((Date.now() - state.startTime) / 1000))
            : (state.pausedRemaining ?? getModeDuration(state));

        render(state, remaining);

        if (event === 'start' || event === 'tick') {
            if (state.isRunning && !uiInterval) {
                lastTickMs = Date.now();
                startTick();
            }
        } else if (['pause', 'reset', 'modeChange', 'settingsChange'].includes(event)) {
            stopTick();
        } else if (event === 'completed' || event === 'allDone') {
            stopTick();
            if (state.settings.sound) {
                const snd = event === 'allDone' ? 'allDone' : completedMode === 'work' ? 'work' : 'break';
                playSound(snd);
            }

            // Auto-save when work session completes
            if (event === 'completed' && completedMode === 'work' && state.settings.autosave) {
                saveStatsToDb(state);
            }

            // Auto-finish: when all cycles done and autofinish enabled
            if (event === 'allDone' && state.settings.autofinish) {
                const projectN = state.settings.projectName || 'Unnamed';
                taskCompletionLog.push({
                    name: projectN,
                    startTime: state.stats?.sessionStarted || Date.now(),
                    endTime: Date.now(),
                    duration: state.stats?.totalFocusSeconds || 0,
                    cycle: state.completedCycles || 0,
                });
                if (state.settings.autosave) saveStatsToDb(state);
                showNotification('pomodoroSessionComplete', false, [projectN]);
            }

            if (state.isRunning) {
                lastTickMs = Date.now();
                startTick();
            }
        }
    };

    // --- External API ------------------------------------------
    window.closePomodoroPanel = async (saveState = false) => {
        if (!panel.classList.contains('hidden')) {
            panel.classList.add('hidden');
            const taskRunning = isAnyTaskRunning();
            openBtn.classList.toggle('pomodoro-running', taskRunning);
            if (saveState) {
                await chrome.storage.local.set({ pomodoroPanelOpen: false });
            }
        }
    };

    // ─── Init ───────────────────────────────────────────────────
    initPomoTiempoCalendar();
    updateUnitTooltips();
    (async () => {
        const { pomodoroPanelOpen, pomoMethod: savedMethod } = await chrome.storage.local.get([
            'pomodoroPanelOpen',
            'pomoMethod',
        ]);
        if (savedMethod) applyMethod(savedMethod);
        // Load local settings (timer inputs, toggles, tiempo date/time) in all cases
        await loadLocalSettings();
        validateAllMethods();
        if (pomodoroPanelOpen) {
            panel.classList.remove('hidden');
            await loadState();
            await loadSavedProjects();
            await restoreAltTimerState();
        } else {
            // Panel is hidden — check if any task is running to start blinking
            const resp = await chrome.runtime.sendMessage({ action: 'pomodoroGetState' });
            if (resp?.state) {
                localState = resp.state;
                const isAltRunning = await chrome.storage.local
                    .get('altTimerState')
                    .then(
                        (r) =>
                            r.altTimerState?.cronometroRunning ||
                            r.altTimerState?.temporizadorRunning ||
                            r.altTimerState?.tiempoRunning,
                    );
                const taskRunning = resp.state.isRunning || isAltRunning;
                if (taskRunning) {
                    openBtn.classList.add('pomo-task-running');
                    openBtn.classList.add('pomodoro-running'); // panel is hidden, so blink
                }
            }
        }
    })();
}
