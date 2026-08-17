const POMODORO_STORAGE_KEY = 'pomodoroState';
const POMODORO_ALARM = 'pomodoroTick';

// ---- Default state with correct defaults ----
function pomodoroDefaults() {
    return {
        mode: 'work',
        isRunning: false,
        startTime: null,
        pausedRemaining: null,
        pausedAt: null,
        currentSession: 1,
        completedCycles: 0, // focus sessions done (for goal)
        completedWork: 0, // work sessions done
        interruptions: 0,
        settings: {
            workDuration: 25 * 60, // 1500s
            shortBreak: 5 * 60, // 300s
            longBreak: 15 * 60, // 900s
            sessionsBeforeLong: 4,
            endAfter: 8, // stop after N cycles
            sound: true,
            autostart: true,
            autosave: true,
            autofinish: true,
            projectName: '',
            projectTag: '',
            projectFolder: '',
        },
        stats: {
            sessionStarted: null,
            totalFocusSeconds: 0,
            totalBreakSeconds: 0,
            totalInterruptionSeconds: 0,
            sessionFocusList: [], // [duration_seconds, ...]
        },
    };
}

async function getPomodoroState() {
    const data = await chrome.storage.local.get(POMODORO_STORAGE_KEY);
    const saved = data[POMODORO_STORAGE_KEY];
    if (!saved) return pomodoroDefaults();
    // Merge with defaults to handle missing fields from old versions
    const defaults = pomodoroDefaults();
    return {
        ...defaults,
        ...saved,
        settings: { ...defaults.settings, ...(saved.settings || {}) },
        stats: { ...defaults.stats, ...(saved.stats || {}) },
    };
}

async function savePomodoroState(state) {
    await chrome.storage.local.set({ [POMODORO_STORAGE_KEY]: state });
}

function getModeDuration(mode, settings) {
    if (mode === 'work') return settings.workDuration;
    if (mode === 'short') return settings.shortBreak;
    return settings.longBreak;
}

async function getRemainingSeconds(state) {
    if (!state.isRunning) {
        if (state.pausedRemaining !== null) return Math.max(0, state.pausedRemaining);
        return getModeDuration(state.mode, state.settings);
    }
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    return Math.max(0, getModeDuration(state.mode, state.settings) - elapsed);
}

function broadcastPomodoro(state, event, completedMode) {
    const msg = { action: 'pomodoroStateUpdate', state, event, completedMode: completedMode || null };
    chrome.runtime.sendMessage(msg).catch(() => {});
}

// ---- Offscreen audio playback ----
/**
 * Makes sure the offscreen document exists. It is shared: the Pomodoro chimes and the
 * music player both sound through it.
 *
 * @param {string} justification what it is being opened for, for the browser's log
 * @returns {Promise<boolean>} whether it had to be created — a fresh one knows
 *   nothing, so whoever asked has to tell it what to play again
 */
async function ensureOffscreenDocument(justification = 'Play audio in the background') {
    const existing = await chrome.offscreen.hasDocument().catch(() => false);
    if (existing) return false;
    try {
        await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL('src/ui/pages/offscreen/offscreen.html'),
            reasons: ['AUDIO_PLAYBACK'],
            justification,
        });
    } catch (error) {
        // Two callers can race into creating it; losing that race is not a failure.
        if (!String(error).includes('Only a single offscreen')) throw error;
        return false;
    }
    return true;
}

/** Is the offscreen document playing music right now? */
async function isMusicPlayingOffscreen() {
    try {
        const answer = await chrome.runtime.sendMessage({ action: 'musicIsBusy' });
        return Boolean(answer?.busy);
    } catch {
        return false;
    }
}

async function playPomodoroSoundBackground(soundType) {
    try {
        await ensureOffscreenDocument('Play Pomodoro completion sound');
        chrome.runtime.sendMessage({ action: 'pomodoroPlaySound', soundType });
        // Closed once the chime is over — unless music is playing through the same
        // document, in which case closing it would cut the track off.
        setTimeout(async () => {
            try {
                if (await isMusicPlayingOffscreen()) return;
                await chrome.offscreen.closeDocument();
            } catch {}
        }, 3500);
    } catch (e) {
        console.warn('[Pomodoro] Offscreen audio error:', e);
    }
}

async function onPomodoroComplete(state) {
    const wasWork = state.mode === 'work';
    const duration = getModeDuration(state.mode, state.settings);

    // Update stats
    const newStats = { ...state.stats };
    if (!newStats.sessionStarted) newStats.sessionStarted = Date.now() - duration * 1000;
    if (wasWork) {
        newStats.totalFocusSeconds = (newStats.totalFocusSeconds || 0) + duration;
        newStats.sessionFocusList = [...(newStats.sessionFocusList || []), duration];
    } else {
        newStats.totalBreakSeconds = (newStats.totalBreakSeconds || 0) + duration;
    }

    let newCompletedWork = state.completedWork + (wasWork ? 1 : 0);
    let newCompletedCycles = state.completedCycles + (wasWork ? 1 : 0);
    let nextMode;
    let nextSession = state.currentSession;

    if (wasWork) {
        if (newCompletedWork % state.settings.sessionsBeforeLong === 0) {
            nextMode = 'long';
        } else {
            nextMode = 'short';
        }
        nextSession = state.currentSession + 1;
    } else {
        nextMode = 'work';
    }

    const allDone = wasWork && newCompletedWork > 0 && newCompletedCycles >= state.settings.endAfter;

    await chrome.alarms.clear(POMODORO_ALARM);

    const shouldAutostart = state.settings.autostart && !allDone;

    const newState = {
        ...state,
        mode: allDone ? 'work' : nextMode,
        isRunning: shouldAutostart,
        startTime: shouldAutostart ? Date.now() : null,
        pausedRemaining: null,
        currentSession: allDone ? 1 : nextSession,
        completedWork: allDone ? 0 : newCompletedWork,
        completedCycles: newCompletedCycles, // Keep this to show the goal reached
        stats: newStats,
    };

    await savePomodoroState(newState);

    if (shouldAutostart) {
        await chrome.alarms.create(POMODORO_ALARM, { periodInMinutes: 1 / 60 });
    }

    const completedMode = state.mode;
    broadcastPomodoro(newState, allDone ? 'allDone' : 'completed', completedMode);

    // Play sound via offscreen if enabled
    if (state.settings.sound) {
        const soundType = allDone ? 'allDone' : wasWork ? 'work' : 'break';
        await playPomodoroSoundBackground(soundType);
    }

    // Browser notification
    const notifMessages = {
        work: 'pomodoroNotifWorkDone',
        short: 'pomodoroNotifBreakDone',
        long: 'pomodoroNotifBreakDone',
        allDone: 'pomodoroNotifAllDone',
    };
    const msgKey = allDone ? 'allDone' : state.mode;
    chrome.notifications.create(`pomo-${Date.now()}`, {
        type: 'basic',
        iconUrl: '/assets/icons/icon48.png',
        title: 'Pomodoro [POMODORO]',
        message: getI18nMsg(notifMessages[msgKey]) || 'Timer complete!',
    });
}

// Alarm tick
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== POMODORO_ALARM) return;
    const state = await getPomodoroState();
    if (!state.isRunning) {
        await chrome.alarms.clear(POMODORO_ALARM);
        return;
    }
    const remaining = await getRemainingSeconds(state);
    if (remaining <= 0) {
        await onPomodoroComplete(state);
    } else {
        broadcastPomodoro(state, 'tick', null);
    }
});

// The secondary message listener has been consolidated into the primary one around line 5800.
