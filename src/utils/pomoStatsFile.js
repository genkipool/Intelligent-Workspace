/**
 * [AI INSTRUCTION]
 * THE POMODORO STATISTICS FILE: ONE FORMAT, WRITTEN AND READ IN ONE PLACE.
 *
 * Two surfaces export saved sessions and import them back — the stats drawer of the
 * pomodoro panel and the pomodoro dashboard. Each used to have its own format and its own
 * reader, so a file exported from the panel was "Error loading data" in the dashboard.
 * Both now write `buildPomoBackup` and read with `parsePomoStatsFile`, which also still
 * accepts the shapes older versions wrote: a bare array of sessions, and the panel's
 * single-session summary with its numbers under `raw`.
 */

export const POMO_BACKUP_TYPE = 'pomodoro_backup';

/** A file that is not a pomodoro statistics file, as opposed to one that failed to load. */
export class PomoStatsFormatError extends Error {
    constructor() {
        super('Invalid pomodoro statistics file');
        this.name = 'PomoStatsFormatError';
    }
}

/** The file both surfaces export: the sessions as they are stored. */
export function buildPomoBackup(entries) {
    return {
        type: POMO_BACKUP_TYPE,
        version: 1,
        exportedAt: new Date().toISOString(),
        data: entries,
    };
}

const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
};
/** Rounded mean of a list of seconds; 0 for an empty one. */
export const averageOf = (list) => (list.length > 0 ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0);
const str = (value) => (typeof value === 'string' ? value : '');

function sanitizeTask(task) {
    if (!task || typeof task !== 'object') return null;
    return {
        name: str(task.name),
        startTime: num(task.startTime),
        endTime: num(task.endTime),
        duration: num(task.duration),
        cycle: num(task.cycle),
    };
}

/**
 * Checks one session of an imported file and returns it in the shape the store holds,
 * or null when it is not a session at all.
 *
 * The dashboard sums these fields without checking them, so a string where a number
 * belongs turns every total it feeds into `NaN`. Anything that cannot be read as a
 * session is dropped rather than stored.
 */
export function sanitizePomoStatsEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    if (typeof entry.id !== 'string' || !entry.id) return null;
    // A session with no timestamp cannot be placed on any chart, and every one of them
    // would pile onto the same day.
    const savedAt = Number(entry.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0) return null;

    return {
        id: entry.id,
        projectName: str(entry.projectName),
        projectFolder: str(entry.projectFolder),
        projectTag: str(entry.projectTag),
        sessionStarted: num(entry.sessionStarted),
        savedAt,
        totalFocusSeconds: num(entry.totalFocusSeconds),
        totalBreakSeconds: num(entry.totalBreakSeconds),
        totalInterruptionSeconds: num(entry.totalInterruptionSeconds),
        completedCycles: num(entry.completedCycles),
        endAfter: num(entry.endAfter),
        interruptions: num(entry.interruptions),
        avgFocus: num(entry.avgFocus),
        sessionFocusList: Array.isArray(entry.sessionFocusList) ? entry.sessionFocusList.map(num) : [],
        taskLog: Array.isArray(entry.taskLog) ? entry.taskLog.map(sanitizeTask).filter(Boolean) : [],
        noteCount: num(entry.noteCount),
    };
}

/** The panel's old single-session export, numbers under `raw`, as a stored session. */
function entryFromLegacySummary(json) {
    const st = json.raw.stats || {};
    const settings = json.raw.settings || {};
    const projectName = settings.projectName || 'Unnamed';
    const focusList = Array.isArray(st.sessionFocusList) ? st.sessionFocusList.map(num) : [];
    return {
        id: `${projectName}_${st.sessionStarted || Date.now()}`,
        projectName,
        projectFolder: settings.projectFolder,
        projectTag: settings.projectTag,
        sessionStarted: st.sessionStarted,
        savedAt: Date.parse(json.exportedAt) || Date.now(),
        totalFocusSeconds: st.totalFocusSeconds,
        totalBreakSeconds: st.totalBreakSeconds,
        totalInterruptionSeconds: st.totalInterruptionSeconds,
        completedCycles: st.completedCycles,
        interruptions: st.interruptions,
        // Older panels always wrote 0 here; the list it is the average of came along.
        avgFocus: st.avgFocus || averageOf(focusList),
        sessionFocusList: focusList,
        taskLog: json.taskLog,
        noteCount: json.noteCount,
    };
}

/**
 * Reads the sessions out of a parsed statistics file.
 *
 * @param {unknown} json what `JSON.parse` gave for the file
 * @returns {object[]} the sessions, sanitised, never empty
 * @throws {PomoStatsFormatError} when there is no session in it to import
 */
export function parsePomoStatsFile(json) {
    let entries = null;
    if (Array.isArray(json)) entries = json;
    else if (json?.type === POMO_BACKUP_TYPE && Array.isArray(json.data)) entries = json.data;
    else if (json?.raw && typeof json.raw === 'object') entries = [entryFromLegacySummary(json)];

    const clean = (entries || []).map(sanitizePomoStatsEntry).filter(Boolean);
    if (clean.length === 0) throw new PomoStatsFormatError();
    return clean;
}
