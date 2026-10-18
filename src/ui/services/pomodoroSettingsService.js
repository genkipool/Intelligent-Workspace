/**
 * [AI INSTRUCTION]
 * THE POMODORO'S SETTINGS, AND THE TWO PLACES THEY LIVE.
 *
 * Three surfaces edit them now — the drawer in the group list's panel, the same drawer
 * in the pomodoro side panel, and the settings view of the pomodoro dashboard — and
 * they are all editing one thing. This module is what makes that true: the keys, the
 * defaults, the reads, the writes and the subscription, in one place.
 *
 * WHY TWO STORES, AND WHICH SETTING GOES WHERE. It is not an accident:
 *
 *   - The service worker owns everything the *clock* needs — the three durations, the
 *     cycle counts, the four behaviour switches and the project the session is filed
 *     under. The worker runs the alarm whether or not any page is open, so it has to
 *     hold them, and it broadcasts `pomodoroStateUpdate` after every write, which is
 *     what makes an edit on one surface appear on the others.
 *   - `chrome.storage.local` holds what only the *panel* needs: which of the four
 *     methods is showing, the stopwatch and countdown fields, and the two switches
 *     that hide a row. The worker's timer knows nothing about those, and putting them
 *     in its state would mean a round-trip to change what a row looks like.
 *
 * The split is why `watchPomodoroSettings` listens to both: a caller wants to know
 * that "the settings changed", not which of the two halves it was.
 */

/** Where the panel's own settings live in `chrome.storage.local`. */
export const POMO_LOCAL_KEY = 'pomoLocalSettings';
/** And which of the four methods it is showing. */
export const POMO_METHOD_KEY = 'pomoMethod';

/**
 * The four things the panel can be. `pomodoro` is the cycle; the other three are plain
 * clocks that share the same face.
 */
export const POMODORO_METHODS = [
    { id: 'pomodoro', labelKey: 'pomodoroMethodPomodoro', titleKey: 'pomodoroMethodPomodoroTitle' },
    { id: 'cronometro', labelKey: 'pomodoroMethodCronometro', titleKey: 'pomodoroMethodCronometroTitle' },
    { id: 'temporizador', labelKey: 'pomodoroMethodTemporizador', titleKey: 'pomodoroMethodTemporizadorTitle' },
    { id: 'tiempo', labelKey: 'pomodoroMethodTiempo', titleKey: 'pomodoroMethodTiempoTitle' },
];

/**
 * The worker's own defaults, repeated here only as the floor for a page that reads the
 * settings before the worker has answered. `pomodoroGetState` always wins.
 */
export const DEFAULT_WORKER_SETTINGS = {
    workDuration: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60,
    sessionsBeforeLong: 4,
    endAfter: 8,
    sound: true,
    autostart: true,
    autosave: true,
    autofinish: true,
    projectName: '',
    projectTag: '',
    projectFolder: '',
};

/**
 * The range of every number the clock takes, in the unit its box shows (minutes for the
 * three durations). The panel's drawer and the dashboard's settings page both read it:
 * with a range of their own each, a value one of them allowed was out of range in the
 * other, and its "+" pulled it down to that other maximum.
 */
export const POMODORO_LIMITS = {
    workDuration: { min: 1, max: 180 },
    shortBreak: { min: 1, max: 120 },
    longBreak: { min: 1, max: 180 },
    sessionsBeforeLong: { min: 1, max: 12 },
    endAfter: { min: 1, max: 99 },
};

/**
 * Where a stepper lands after one press: inside the range, but never moved against the
 * press. A value already past the edge (written before the ranges agreed) stays where it
 * is on a "+" instead of dropping to the maximum.
 *
 * @param {number} value what the box holds now
 * @param {number} delta +1 or -1
 * @param {{min: number, max: number}} limits
 */
export function stepWithin(value, delta, { min, max }) {
    const next = Math.min(max, Math.max(min, value + delta));
    if (delta > 0) return Math.max(value, next);
    if (delta < 0) return Math.min(value, next);
    return next;
}

/** What `pomoLocalSettings` holds, and what an empty profile means. */
export const DEFAULT_LOCAL_SETTINGS = {
    timerHours: 0,
    timerMinutes: 0,
    timerSeconds: 0,
    cronometroStop: false,
    temporizadorStop: false,
    hideProject: false,
    hideProgress: false,
    tiempoShowSec: false,
    tiempoDate: null,
    tiempoHH: null,
    tiempoMM: null,
};

/**
 * Everything three surfaces need to draw the settings, from both stores at once.
 *
 * @returns {Promise<{settings: object, local: object, method: string}>}
 */
export async function readPomodoroSettings() {
    const [state, stored] = await Promise.all([
        chrome.runtime.sendMessage({ action: 'pomodoroGetState' }).catch(() => null),
        chrome.storage.local.get([POMO_LOCAL_KEY, POMO_METHOD_KEY]),
    ]);
    return {
        settings: { ...DEFAULT_WORKER_SETTINGS, ...(state?.state?.settings || {}) },
        local: { ...DEFAULT_LOCAL_SETTINGS, ...(stored[POMO_LOCAL_KEY] || {}) },
        method: stored[POMO_METHOD_KEY] || 'pomodoro',
    };
}

/**
 * Writes a patch of the clock's settings through the worker.
 *
 * A patch, not the whole object: the worker merges, so a page that only knows about
 * half of them cannot blank the other half. It answers with the settled state, which
 * is what the caller should redraw from. Saving never touches the clock: a phase under
 * way keeps running, and keeps the time it has done if its own length changes.
 *
 * @param {object} patch
 * @returns {Promise<object|null>} the whole new settings object, or null if the worker
 *   did not answer.
 */
export async function savePomodoroSettings(patch) {
    const resp = await chrome.runtime
        .sendMessage({ action: 'pomodoroSaveSettings', settings: patch })
        .catch(() => null);
    return resp?.state?.settings || null;
}

/**
 * Writes a patch of the panel's own settings.
 *
 * Read-modify-write on one key, so two quick edits from the same page cannot lose each
 * other — which is what setting the whole object from a stale copy would do.
 */
export async function saveLocalPomodoroSettings(patch) {
    const stored = await chrome.storage.local.get(POMO_LOCAL_KEY);
    const next = { ...DEFAULT_LOCAL_SETTINGS, ...(stored[POMO_LOCAL_KEY] || {}), ...patch };
    await chrome.storage.local.set({ [POMO_LOCAL_KEY]: next });
    return next;
}

/** Which of the four methods the panel shows. */
export async function savePomodoroMethod(method) {
    await chrome.storage.local.set({ [POMO_METHOD_KEY]: method });
}

/**
 * Calls back whenever anything above changes, wherever it was changed.
 *
 * Both halves, because a caller wants "the settings moved" and not a lesson in which
 * store holds what: `storage.onChanged` for the panel's own keys, and the worker's
 * `settingsChange` broadcast for the clock's. Neither reaches the page that did the
 * writing — storage events do not fire on the writer in the same context for the value
 * it just set from the same page's cache, and `sendMessage` never reaches its sender —
 * so a caller still redraws from its own writes itself.
 *
 * `running` rides along with `settings` because it comes from the same broadcast and
 * a settings screen needs it: the method cannot change while the clock is going, so
 * those controls are held. Without it a page left open while a session was started
 * elsewhere would still offer them.
 *
 * @param {(change: {settings?: object, running?: boolean, local?: object, method?: string}) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function watchPomodoroSettings(onChange) {
    const onStorage = (changes, area) => {
        if (area !== 'local') return;
        const patch = {};
        if (changes[POMO_LOCAL_KEY]) {
            patch.local = { ...DEFAULT_LOCAL_SETTINGS, ...(changes[POMO_LOCAL_KEY].newValue || {}) };
        }
        if (changes[POMO_METHOD_KEY]) patch.method = changes[POMO_METHOD_KEY].newValue || 'pomodoro';
        if (patch.local || patch.method) onChange(patch);
    };

    // Deliberately not async: an async listener returns a promise, and Chrome reads any
    // truthy return as "this listener will answer", which starves every other
    // `sendMessage` that expected a reply.
    const onMessage = (message) => {
        if (message?.action !== 'pomodoroStateUpdate' || !message.state?.settings) return;
        onChange({
            settings: { ...DEFAULT_WORKER_SETTINGS, ...message.state.settings },
            running: !!message.state.isRunning,
        });
    };

    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
        chrome.storage.onChanged.removeListener(onStorage);
        chrome.runtime.onMessage.removeListener(onMessage);
    };
}
