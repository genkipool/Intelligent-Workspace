/**
 * [AI INSTRUCTION]
 * POMODORO HANDLERS — Message handlers for Pomodoro features.
 *
 * All handlers interact with the Pomodoro state defined in `pomodoro.js`.
 *
 * Dependencies: getPomodoroState(), savePomodoroState(), getRemainingSeconds(),
 *               getModeDuration(), pomodoroDefaults(), broadcastPomodoro(),
 *               POMODORO_ALARM (all from pomodoro.js)
 */

function handlePomodoroGetState(sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        const remaining = await getRemainingSeconds(state);
        sendResponse({ state, remaining });
    })();
}

function handlePomodoroStart(sendResponse) {
    (async () => {
        let state = await getPomodoroState();

        // If session is already finished, reset counters for a new session
        const cycles = Number(state.completedCycles) || 0;
        const goal = Number(state.settings?.endAfter) || 8;

        if (cycles >= goal) {
            const defaults = pomodoroDefaults();
            state = {
                ...state,
                mode: 'work',
                completedWork: 0,
                completedCycles: 0,
                currentSession: 1,
                interruptions: 0,
                pausedRemaining: null,
                stats: {
                    ...defaults.stats,
                    sessionStarted: Date.now(),
                },
            };
        }

        const total = getModeDuration(state.mode, state.settings);
        const resumeFrom = state.pausedRemaining !== null ? state.pausedRemaining : total;
        // Calculate interruption time if resuming from pause
        const newStats = { ...state.stats };
        if (state.pausedAt && state.pausedRemaining !== null && state.mode === 'work') {
            const pauseDurationSecs = Math.floor((Date.now() - state.pausedAt) / 1000);
            newStats.totalInterruptionSeconds = (newStats.totalInterruptionSeconds || 0) + pauseDurationSecs;
        }

        const newState = {
            ...state,
            isRunning: true,
            startTime: Date.now() - (total - resumeFrom) * 1000,
            pausedRemaining: null,
            pausedAt: null,
            stats: {
                ...newStats,
                sessionStarted: state.stats.sessionStarted || Date.now(),
            },
        };
        await savePomodoroState(newState);
        await chrome.alarms.clear(POMODORO_ALARM);
        await chrome.alarms.create(POMODORO_ALARM, { periodInMinutes: 1 / 60 });
        broadcastPomodoro(newState, 'start', null);
        sendResponse({ success: true, state: newState, remaining: resumeFrom });
    })();
}

function handlePomodoroPause(sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        const remaining = await getRemainingSeconds(state);
        const wasWork = state.mode === 'work';
        const elapsed = getModeDuration(state.mode, state.settings) - remaining;
        const newStats = { ...state.stats };
        if (wasWork && elapsed > 0) {
            newStats.totalInterruptionSeconds = newStats.totalInterruptionSeconds || 0;
        }
        const newState = {
            ...state,
            isRunning: false,
            startTime: null,
            pausedRemaining: remaining,
            pausedAt: Date.now(),
            interruptions: (state.interruptions || 0) + (wasWork ? 1 : 0),
            stats: newStats,
        };
        await savePomodoroState(newState);
        await chrome.alarms.clear(POMODORO_ALARM);
        broadcastPomodoro(newState, 'pause', null);
        sendResponse({ success: true, state: newState, remaining });
    })();
}

function handlePomodoroReset(sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        await chrome.alarms.clear(POMODORO_ALARM);

        const cycles = Number(state.completedCycles) || 0;
        const goal = Number(state.settings?.endAfter) || 8;

        let newState;
        if (cycles >= goal) {
            const defaults = pomodoroDefaults();
            newState = {
                ...state,
                mode: 'work',
                currentSession: 1,
                completedWork: 0,
                completedCycles: 0,
                interruptions: 0,
                isRunning: false,
                startTime: null,
                pausedRemaining: null,
                stats: { ...defaults.stats },
            };
        } else {
            newState = { ...state, isRunning: false, startTime: null, pausedRemaining: null };
        }

        await savePomodoroState(newState);
        const remaining = getModeDuration(newState.mode, newState.settings);
        broadcastPomodoro(newState, 'reset', null);
        sendResponse({ success: true, state: newState, remaining });
    })();
}

function handlePomodoroSkip(sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        await onPomodoroComplete(state);
        const newState = await getPomodoroState();
        const remaining = await getRemainingSeconds(newState);
        sendResponse({ success: true, state: newState, remaining });
    })();
}

function handlePomodoroSetMode(message, sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        await chrome.alarms.clear(POMODORO_ALARM);
        const newState = { ...state, mode: message.mode, isRunning: false, startTime: null, pausedRemaining: null };
        await savePomodoroState(newState);
        const remaining = getModeDuration(message.mode, state.settings);
        broadcastPomodoro(newState, 'modeChange', null);
        sendResponse({ success: true, state: newState, remaining });
    })();
}

function handlePomodoroSaveSettings(message, sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        await chrome.alarms.clear(POMODORO_ALARM);
        const newSettings = { ...state.settings, ...message.settings };
        const newState = { ...state, settings: newSettings, isRunning: false, startTime: null, pausedRemaining: null };
        await savePomodoroState(newState);
        broadcastPomodoro(newState, 'settingsChange', null);
        sendResponse({ success: true, state: newState });
    })();
}

function handlePomodoroClearStats(sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        const defaults = pomodoroDefaults();
        const newState = {
            ...state,
            completedWork: 0,
            completedCycles: 0,
            currentSession: 1,
            interruptions: 0,
            isRunning: false,
            startTime: null,
            pausedRemaining: null,
            stats: { ...defaults.stats },
        };
        await chrome.alarms.clear(POMODORO_ALARM);
        await savePomodoroState(newState);
        broadcastPomodoro(newState, 'reset', null);
        sendResponse({ success: true, state: newState });
    })();
}
