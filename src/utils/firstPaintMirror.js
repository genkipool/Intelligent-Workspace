/**
 * Values a page needs for its very first paint, mirrored in localStorage.
 *
 * chrome.storage is asynchronous, so a control drawn from it starts from a default and
 * then jumps to the stored value in front of the user — a switch that was on slides on
 * every time the page is opened. localStorage can be read before the first paint, so
 * the control starts where it was left. chrome.storage stays the source of truth: the
 * mirror is only a head start, and is rewritten whenever the real value is known.
 *
 * Every entry lives under one key, so all of them are read in one go.
 */
const MIRROR_KEY = 'settings-switch-mirror';

function readAll() {
    try {
        return JSON.parse(localStorage.getItem(MIRROR_KEY)) || {};
    } catch {
        return {};
    }
}

/** The mirrored value of `key`, or `fallback` when there is none yet. */
export function readMirror(key, fallback) {
    return readAll()[key] ?? fallback;
}

/** Keeps `value` as the head start for `key` the next time a page opens. */
export function writeMirror(key, value) {
    try {
        const current = readAll();
        if (JSON.stringify(current[key]) === JSON.stringify(value)) return;
        localStorage.setItem(MIRROR_KEY, JSON.stringify({ ...current, [key]: value }));
    } catch {
        // No localStorage: the control only loses its head start.
    }
}
