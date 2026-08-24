// @ts-nocheck
/**
 * [AI INSTRUCTION]
 * THE PASSWORD THAT STANDS IN FRONT OF TURNING A BLOCK OFF.
 *
 * A site limit is a promise somebody made to themselves, and the moment it bites is
 * exactly the moment they will want to take it off. The password is the pause between
 * wanting to and doing it — so what it guards is *weakening* a rule: switching one
 * off, clearing an allowance or its hours, and opening the dialog that could do
 * either. Making a rule stricter, or writing a new one, never asks for it.
 *
 * WHAT IT IS NOT. This is not a security boundary and must not be described as one:
 * anyone who can open the extension's own devtools can read the settings and write
 * whatever they like. That is why the record itself is not encrypted — encrypting it
 * would only cost the user their history the day they forget the password, and buy
 * nothing against an attacker who already has the profile.
 *
 * WHAT IS STORED. Never the password: a random salt and the SHA-256 of salt+password,
 * both hex. It lives in the tracking settings, so it travels with the rules when the
 * user turns sync on — a limit that follows you to another browser and a lock that
 * does not would be a lock with a door beside it.
 */

const encoder = new TextEncoder();

/** Hex, because it goes into `chrome.storage` and has to survive a JSON round trip. */
function toHex(buffer) {
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
    return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

async function digest(salt, password) {
    return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${password}`)));
}

/** `{ salt, hash }` for a new password, or null for an empty one. */
export async function createLock(password) {
    const secret = String(password ?? '');
    if (!secret) return null;
    const salt = randomSalt();
    return { salt, hash: await digest(salt, secret) };
}

/** Whether a stored lock is a lock at all. */
export function hasLock(lock) {
    return !!(lock && lock.salt && lock.hash);
}

/**
 * Whether `password` opens `lock`.
 *
 * A record with no lock accepts anything, so callers do not have to ask twice — but
 * every caller checks `hasLock` first anyway, because a dialog that asks for a
 * password nobody set is worse than no dialog.
 */
export async function verifyLock(lock, password) {
    if (!hasLock(lock)) return true;
    return (await digest(lock.salt, String(password ?? ''))) === lock.hash;
}

/**
 * Whether the *next* use of the grace button has to be paid for with the password.
 *
 * `after` counts from the first use of the day: 2 means the first one is free and the
 * second is not. 0 turns it off entirely, and none of it means anything without a
 * password set — the setting is about when to ask, not about whether there is anything
 * to ask for.
 *
 * @param {object|null} lock The stored `{ salt, hash }`.
 * @param {number} usesToday How many times it has been used today already.
 * @param {number} after The configured threshold.
 */
export function snoozeNeedsPassword(lock, usesToday, after) {
    if (!hasLock(lock)) return false;
    const threshold = Number(after);
    if (!Number.isFinite(threshold) || threshold <= 0) return false;
    return (Number(usesToday) || 0) + 1 >= threshold;
}

/** Whichever half of a rule this change is about to take away. */
const hasWindows = (limit) => !!(limit?.blockAlways || (limit?.schedules || []).some((s) => s.start && s.end));

/**
 * Whether going from `before` to `after` loosens the rule, which is the only kind of
 * change the password stands in front of.
 *
 * Deleting the record outright is `after === null`. Anything that makes the rule
 * stricter — a shorter allowance, a new window, switching a paused half back on —
 * goes through untouched: a lock that argued with somebody trying to be stricter with
 * themselves would be a lock nobody keeps.
 *
 * @param {object} before The stored rule, normalized.
 * @param {object|null} after What is about to be written, normalized, or null.
 */
export function loosensRule(before, after) {
    if (!before) return false;
    if (after === null) return true;
    if (before.dailyLimitSeconds > 0 && before.dailyLimitEnabled && !after.dailyLimitEnabled) return true;
    if (before.weeklyLimitSeconds > 0 && before.weeklyLimitEnabled && !after.weeklyLimitEnabled) return true;
    if (hasWindows(before) && before.scheduleEnabled && !after.scheduleEnabled) return true;
    if (before.enabled && !after.enabled) return true;
    if (before.dailyLimitSeconds > 0 && after.dailyLimitSeconds < before.dailyLimitSeconds) return true;
    if (before.weeklyLimitSeconds > 0 && after.weeklyLimitSeconds < before.weeklyLimitSeconds) return true;
    if (hasWindows(before) && !hasWindows(after)) return true;
    return false;
}
