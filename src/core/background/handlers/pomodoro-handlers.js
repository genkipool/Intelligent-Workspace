/**
 * [AI INSTRUCTION]
 * POMODORO HANDLERS — Message handlers for Pomodoro features.
 *
 * All handlers interact with the Pomodoro state defined in `pomodoro.js`.
 *
 * Dependencies: getPomodoroState(), savePomodoroState(), getRemainingSeconds(),
 *               getModeDuration(), pomodoroDefaults(), broadcastPomodoro(), closePause(),
 *               startPomodoroAlarms(), clearPomodoroAlarms() (all from pomodoro.js)
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
        // Resuming from a pause turns it into interruption time
        const newStats = closePause(state);

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
        await clearPomodoroAlarms();
        await startPomodoroAlarms(newState);
        broadcastPomodoro(newState, 'start', null);
        sendResponse({ success: true, state: newState, remaining: resumeFrom });
    })();
}

function handlePomodoroPause(sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        const remaining = await getRemainingSeconds(state);
        // Pausing a clock that is not going would restart the open pause and count
        // a second interruption for it.
        if (!state.isRunning) {
            sendResponse({ success: true, state, remaining });
            return;
        }
        const wasWork = state.mode === 'work';
        const newState = {
            ...state,
            isRunning: false,
            startTime: null,
            pausedRemaining: remaining,
            pausedAt: Date.now(),
            interruptions: (state.interruptions || 0) + (wasWork ? 1 : 0),
        };
        await savePomodoroState(newState);
        await clearPomodoroAlarms();
        broadcastPomodoro(newState, 'pause', null);
        sendResponse({ success: true, state: newState, remaining });
    })();
}

function handlePomodoroReset(sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        await clearPomodoroAlarms();

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
                pausedAt: null,
                stats: { ...defaults.stats },
            };
        } else {
            newState = {
                ...state,
                isRunning: false,
                startTime: null,
                pausedRemaining: null,
                pausedAt: null,
                stats: closePause(state),
            };
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
        await onPomodoroComplete(state, { skipped: true });
        const newState = await getPomodoroState();
        const remaining = await getRemainingSeconds(newState);
        sendResponse({ success: true, state: newState, remaining });
    })();
}

function handlePomodoroSetMode(message, sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        await clearPomodoroAlarms();
        const newState = {
            ...state,
            mode: message.mode,
            isRunning: false,
            startTime: null,
            pausedRemaining: null,
            pausedAt: null,
            stats: closePause(state),
        };
        await savePomodoroState(newState);
        const remaining = getModeDuration(message.mode, state.settings);
        broadcastPomodoro(newState, 'modeChange', null);
        sendResponse({ success: true, state: newState, remaining });
    })();
}

/**
 * Saving settings leaves the clock alone.
 *
 * Most settings have nothing to do with the phase under way (the project name is typed
 * with the clock going, and used to send it back to 25:00 on every key), and the one
 * that does — the length of the current phase — keeps the time already done: a running
 * phase keeps its start, so only its end moves; a paused one keeps how far it got.
 */
function handlePomodoroSaveSettings(message, sendResponse) {
    (async () => {
        const state = await getPomodoroState();
        const newSettings = { ...state.settings, ...message.settings };
        const newState = { ...state, settings: newSettings };
        if (!state.isRunning && state.pausedRemaining !== null) {
            const done = getModeDuration(state.mode, state.settings) - state.pausedRemaining;
            newState.pausedRemaining = Math.max(0, getModeDuration(state.mode, newSettings) - done);
        }
        await savePomodoroState(newState);
        // Re-created alarms replace the old ones, so the end alarm follows a new length.
        if (newState.isRunning) await startPomodoroAlarms(newState);
        const remaining = await getRemainingSeconds(newState);
        broadcastPomodoro(newState, 'settingsChange', null);
        sendResponse({ success: true, state: newState, remaining });
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
            pausedAt: null,
            stats: { ...defaults.stats },
        };
        await clearPomodoroAlarms();
        await savePomodoroState(newState);
        broadcastPomodoro(newState, 'reset', null);
        sendResponse({ success: true, state: newState });
    })();
}
