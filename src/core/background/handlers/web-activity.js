/**
 * [AI INSTRUCTION]
 * WEB ACTIVITY — the clock, the counters and the blocker.
 *
 * Everything about *what* is recorded, *where* it is stored and *whether a site is
 * over its limit* lives in `/services/webActivitySchema.js`, which the dashboard
 * reads too. This file is only the machinery: notice that the active site changed,
 * bank the time that passed, and keep the blocking rules in step. Do not restate any
 * of the schema's answers here.
 *
 * HOW THE CLOCK WORKS
 * There is at most one open segment at a time, held in chrome.storage.session so it
 * survives the worker being shut down between events. Anything that could change
 * which site is in front — a tab activated, a navigation, the window losing focus,
 * the user going idle, the minute tick — calls `waSync()`, which banks the time the
 * open segment accumulated and opens a new one for whatever is in front now. Nothing
 * else writes to the counters.
 *
 * Dependencies: ITG_WEB_ACTIVITY (services/webActivitySchema.js), logMessage(),
 *               getI18nMsg() (background/utils.js)
 */

/** Dynamic DNR rule ids are ours from here up; nothing else in the extension uses them. */
const WA_RULE_ID_BASE = 9000;
const WA_RULE_ID_MAX = WA_RULE_ID_BASE + 999;

/**
 * A single segment is never worth more than this. The worker can be shut down with a
 * segment open, and while that is normally harmless — the minute tick reopens it —
 * a laptop suspended for a weekend would otherwise come back with 48 hours on
 * whatever site happened to be in front.
 */
const WA_MAX_SEGMENT_SECONDS = 15 * 60;

/**
 * The `day|domain` pairs already warned about, so the notification fires once.
 *
 * Kept in session storage rather than in a variable: the worker is shut down between
 * events, and a forgotten stamp means the same "almost out of time" notice again a
 * minute later, which is exactly the nagging the once-a-day rule is there to prevent.
 */
const WA_NOTIFIED_KEY = 'wa:notified';

async function waAlreadyWarned(stamp) {
    const { [WA_NOTIFIED_KEY]: stamps = [] } = await chrome.storage.session.get(WA_NOTIFIED_KEY);
    return stamps.includes(stamp);
}

async function waMarkWarned(stamp) {
    const { [WA_NOTIFIED_KEY]: stamps = [] } = await chrome.storage.session.get(WA_NOTIFIED_KEY);
    await chrome.storage.session.set({ [WA_NOTIFIED_KEY]: [...stamps, stamp] });
}

/** The rule set currently installed, as a string, so identical rebuilds are skipped. */
let waInstalledRuleSignature = null;

// ---------------------------------------------------------------- storage access

async function waGetSettings() {
    const { [ITG_WEB_ACTIVITY.KEYS.SETTINGS]: stored } = await chrome.storage.local.get(ITG_WEB_ACTIVITY.KEYS.SETTINGS);
    return { ...ITG_WEB_ACTIVITY.DEFAULT_SETTINGS, ...(stored || {}) };
}

async function waGetLimits() {
    const { [ITG_WEB_ACTIVITY.KEYS.LIMITS]: stored } = await chrome.storage.local.get(ITG_WEB_ACTIVITY.KEYS.LIMITS);
    return stored || {};
}

async function waSaveLimits(limits) {
    await chrome.storage.local.set({ [ITG_WEB_ACTIVITY.KEYS.LIMITS]: limits });
    await waRebuildBlockRules();
    await waSyncPush({ days: false });
}

async function waGetDay(dayKey) {
    const storageKey = ITG_WEB_ACTIVITY.dayStorageKey(dayKey);
    const { [storageKey]: stored } = await chrome.storage.local.get(storageKey);
    return stored || { domains: {} };
}

/** The day keys on record, newest last. */
async function waGetDayIndex() {
    const { [ITG_WEB_ACTIVITY.KEYS.DAY_INDEX]: stored } = await chrome.storage.local.get(
        ITG_WEB_ACTIVITY.KEYS.DAY_INDEX,
    );
    return Array.isArray(stored) ? stored : [];
}

/**
 * Records that a day exists. Without this the only way to find the day records would
 * be to read the whole storage area, which also holds the rules, the themes and the
 * group backups.
 */
async function waIndexDay(dayKey, index = null) {
    const days = index || (await waGetDayIndex());
    if (days.includes(dayKey)) return days;
    const updated = [...days, dayKey].sort();
    await chrome.storage.local.set({ [ITG_WEB_ACTIVITY.KEYS.DAY_INDEX]: updated });
    return updated;
}

async function waGetOpenSegment() {
    const { [ITG_WEB_ACTIVITY.KEYS.OPEN_SEGMENT]: segment } = await chrome.storage.session.get(
        ITG_WEB_ACTIVITY.KEYS.OPEN_SEGMENT,
    );
    return segment || null;
}

/** Seconds spent on a site today, which is what every limit is measured against. */
async function waUsedToday(domain, now = Date.now()) {
    if (!domain) return 0;
    const day = await waGetDay(ITG_WEB_ACTIVITY.dayKey(now));
    return day.domains?.[domain]?.t || 0;
}

/**
 * Whether any limit at all has a weekly allowance.
 *
 * Reading the week costs seven storage reads, and this runs on the minute tick. Most
 * users never set a weekly allowance, and for them the week is never read at all.
 */
function waHasWeeklyLimit(limits) {
    return Object.values(limits).some((limit) => Number(limit?.weeklyLimitSeconds) > 0);
}

/**
 * Seconds per site since Monday, for every site at once.
 *
 * The blocker has to judge every limited site on the same tick, and asking per site
 * would re-read the same seven day records once per rule.
 */
async function waWeekTotals(now = Date.now()) {
    const keys = ITG_WEB_ACTIVITY.weekDayKeys(now);
    const stored = await chrome.storage.local.get(keys.map((day) => ITG_WEB_ACTIVITY.dayStorageKey(day)));
    const totals = {};
    for (const day of keys) {
        const domains = stored[ITG_WEB_ACTIVITY.dayStorageKey(day)]?.domains || {};
        for (const [domain, entry] of Object.entries(domains)) {
            totals[domain] = (totals[domain] || 0) + (entry.t || 0);
        }
    }
    return totals;
}

/** Seconds spent on a site since Monday, which is what a weekly allowance is measured against. */
async function waUsedThisWeek(domain, now = Date.now()) {
    if (!domain) return 0;
    const keys = ITG_WEB_ACTIVITY.weekDayKeys(now);
    const stored = await chrome.storage.local.get(keys.map((day) => ITG_WEB_ACTIVITY.dayStorageKey(day)));
    return keys.reduce(
        (total, day) => total + (stored[ITG_WEB_ACTIVITY.dayStorageKey(day)]?.domains?.[domain]?.t || 0),
        0,
    );
}

/**
 * Which pomodoro phase was running, as a key of `entry.p`, or null if the timer was
 * not going.
 *
 * Read straight from the timer's stored state rather than passed in: the tracker is
 * driven by browser events and the timer by an alarm, so there is no moment where one
 * could hand the other anything. A paused timer counts as no phase — the point of the
 * figure is time spent browsing *during* a focus block, and a paused block is not one.
 */
async function waPomodoroPhaseField() {
    try {
        const { pomodoroState: state } = await chrome.storage.local.get('pomodoroState');
        if (!state?.isRunning) return null;
        return ITG_WEB_ACTIVITY.POMODORO_PHASE_FIELD[state.mode] || null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------- writing counters

/**
 * Banks a stretch of time against a site, spread over the days and hours it really
 * covers, and returns the site's new total for today.
 */
async function waAddTime(domain, startMs, endMs, phaseField = null) {
    const seconds = (endMs - startMs) / 1000;
    if (!domain || !(seconds > 0.5)) return waUsedToday(domain, endMs);

    const cappedStart = seconds > WA_MAX_SEGMENT_SECONDS ? endMs - WA_MAX_SEGMENT_SECONDS * 1000 : startMs;
    const buckets = ITG_WEB_ACTIVITY.splitIntoBuckets(cappedStart, endMs);

    const byDay = new Map();
    for (const bucket of buckets) {
        if (!byDay.has(bucket.day)) byDay.set(bucket.day, []);
        byDay.get(bucket.day).push(bucket);
    }

    const writes = {};
    let todayTotal = 0;
    const todayKey = ITG_WEB_ACTIVITY.dayKey(endMs);

    for (const [dayKey, dayBuckets] of byDay) {
        const record = await waGetDay(dayKey);
        record.domains ||= {};
        const entry = (record.domains[domain] ||= ITG_WEB_ACTIVITY.emptyDomainDay());
        // A record written before the phase split has no `p`, and a day is read back
        // as it was stored rather than through `emptyDomainDay`.
        entry.p ||= { w: 0, s: 0, l: 0 };
        for (const bucket of dayBuckets) {
            entry.t = Math.round((entry.t + bucket.seconds) * 100) / 100;
            entry.h[bucket.hour] = Math.round(((entry.h[bucket.hour] || 0) + bucket.seconds) * 100) / 100;
            if (phaseField) entry.p[phaseField] = Math.round((entry.p[phaseField] + bucket.seconds) * 100) / 100;
        }
        writes[ITG_WEB_ACTIVITY.dayStorageKey(dayKey)] = record;
        if (dayKey === todayKey) todayTotal = entry.t;
    }

    await chrome.storage.local.set(writes);
    for (const dayKey of byDay.keys()) await waIndexDay(dayKey);
    // A segment that ended entirely inside a previous day leaves today untouched, so
    // the running total has to be read rather than inferred.
    return byDay.has(todayKey) ? todayTotal : await waUsedToday(domain, endMs);
}

/** Bumps a per-day counter that is not time: a visit, or a fresh stretch of attention. */
async function waBumpCounter(domain, field, now = Date.now()) {
    if (!domain) return;
    const dayKey = ITG_WEB_ACTIVITY.dayKey(now);
    const record = await waGetDay(dayKey);
    record.domains ||= {};
    const entry = (record.domains[domain] ||= ITG_WEB_ACTIVITY.emptyDomainDay());
    entry[field] = (entry[field] || 0) + 1;
    await chrome.storage.local.set({ [ITG_WEB_ACTIVITY.dayStorageKey(dayKey)]: record });
    await waIndexDay(dayKey);
}

/** Newest first, capped, so the timeline never grows without bound. */
async function waPushRecent(visit) {
    const { [ITG_WEB_ACTIVITY.KEYS.RECENT]: stored } = await chrome.storage.local.get(ITG_WEB_ACTIVITY.KEYS.RECENT);
    const recent = Array.isArray(stored) ? stored : [];
    recent.unshift(visit);
    recent.length = Math.min(recent.length, ITG_WEB_ACTIVITY.MAX_RECENT);
    await chrome.storage.local.set({ [ITG_WEB_ACTIVITY.KEYS.RECENT]: recent });
}

// ---------------------------------------------------------------- what is in front

/**
 * Whatever is playing, as a context to keep timing. Shared by the idle path and by
 * the "browser is in the background" one, which ask the same question.
 */
async function waAudibleContext(settings) {
    let tab = null;
    try {
        [tab] = await chrome.tabs.query({ audible: true, muted: false });
    } catch {
        /* No tab is playing anything. */
    }
    const domain = ITG_WEB_ACTIVITY.domainOf(tab?.url);
    if (!domain || settings.ignoredDomains.includes(domain)) return null;
    return { domain, tabId: tab.id, url: tab.url, title: tab.title || '' };
}

/**
 * The site the user is actually looking at, or null when they are not looking at one:
 * tracking off, browser in the background, user away from the keyboard, or a page
 * that is not browsing at all.
 */
async function waResolveActiveContext(settings) {
    if (!settings.enabled) return null;

    // Asked for on every sync rather than kept in a variable: the worker is shut down
    // between events, and a remembered idle state would come back wrong.
    const idleState = await new Promise((resolve) =>
        chrome.idle.queryState(Math.max(15, settings.idleSeconds), resolve),
    );
    // Watching something is not being away. The keyboard and the mouse are the only
    // things Chrome counts as activity, so an hour of video with nobody touching
    // anything reads as idle and the clock stops — which is exactly backwards for the
    // sites a limit is most often put on. Sound coming out of a tab is the evidence
    // that somebody is still there.
    if (idleState !== 'active') {
        if (!settings.countAudible) return null;
        return waAudibleContext(settings);
    }

    let tab = null;
    try {
        const win = await chrome.windows.getLastFocused({ populate: false });
        if (win?.focused) [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    } catch {
        // No window at all, e.g. everything minimised.
    }

    // Nothing browsable is in front — the browser is in the background, or the front
    // tab is a settings page — but something may still be playing. A video left running
    // in another window is time spent on that site, and not counting it makes the media
    // sites read as far quieter than they are.
    const domain = ITG_WEB_ACTIVITY.domainOf(tab?.url);
    if (!domain) return settings.countAudible ? waAudibleContext(settings) : null;
    if (settings.ignoredDomains.includes(domain)) return null;
    return { domain, tabId: tab.id, url: tab.url, title: tab.title || '' };
}

/**
 * Runs one thing at a time.
 *
 * Everything here is read-modify-write over chrome.storage, and two of them in flight
 * at once both read the old value and the second overwrites the first. It showed up
 * twice: closing a window fires one event per tab and banked the same stretch of time
 * more than once, and a settings panel that saves on every field threw away two of
 * three changes made in the same second.
 */
let waChain = Promise.resolve();

function waSerial(task) {
    waChain = waChain.then(task, task);
    return waChain;
}

function waSync(options) {
    return waSerial(() => waSyncNow(options));
}

/**
 * Banks whatever the open segment is worth and opens one for whatever is in front now.
 * Every event funnels through `waSync`; nothing else moves the clock.
 *
 * @param {{ idleSince?: number }} [options] When the sync is caused by the user going
 *   idle, the stretch since they stopped touching anything is not time spent, so the
 *   segment is closed as of then rather than now.
 */
async function waSyncNow({ idleSince = null } = {}) {
    const now = Date.now();
    const settings = await waGetSettings();
    const open = await waGetOpenSegment();
    const next = await waResolveActiveContext(settings);

    let usedToday = null;
    if (open) {
        const closedAt = idleSince && idleSince > open.startedAt ? idleSince : now;
        usedToday = await waAddTime(open.domain, open.startedAt, closedAt, await waPomodoroPhaseField());
    }

    if (next) {
        if (!open || open.domain !== next.domain) {
            await waBumpCounter(next.domain, 's', now);
        }
        await chrome.storage.session.set({
            [ITG_WEB_ACTIVITY.KEYS.OPEN_SEGMENT]: { ...next, startedAt: now },
        });
    } else if (open) {
        await chrome.storage.session.remove(ITG_WEB_ACTIVITY.KEYS.OPEN_SEGMENT);
    }

    const focus = next?.domain || open?.domain;
    if (focus) {
        if (usedToday === null || focus !== open?.domain) usedToday = await waUsedToday(focus, now);
        await waEnforce(focus, usedToday, settings, now);
    }
    await waRebuildBlockRules();
    return focus;
}

// ---------------------------------------------------------------- limits and blocking

/** The sites a limit is stopping right now. */
async function waBlockedDomains(now = new Date()) {
    const limits = await waGetLimits();
    const domains = Object.keys(limits);
    if (!domains.length) return [];
    // One read for the whole day rather than one per site: this runs on the minute
    // tick, and a user with thirty limits would otherwise make thirty reads a minute.
    const today = await waGetDay(ITG_WEB_ACTIVITY.dayKey(now.getTime()));
    // Same again for the week, and only when there is a weekly allowance to check.
    const week = waHasWeeklyLimit(limits) ? await waWeekTotals(now.getTime()) : null;
    return domains
        .filter(
            (domain) =>
                ITG_WEB_ACTIVITY.evaluate(
                    domain,
                    limits,
                    today.domains?.[domain]?.t || 0,
                    now,
                    week ? week[domain] || 0 : null,
                ).blocked,
        )
        .sort();
}

/** A hostname as a literal inside a DNR regexFilter. */
function escapeForRegexFilter(domain) {
    return domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Puts the blocking rules in the browser. They are declarative on purpose: a rule
 * stops the request before the page ever loads, which a listener that redirects
 * afterwards cannot do.
 */
async function waRebuildBlockRules() {
    const domains = await waBlockedDomains();
    const signature = domains.join('|');
    if (signature === waInstalledRuleSignature) return domains;

    const blockedPage = chrome.runtime.getURL('src/ui/pages/web-activity/blocked.html');
    const addRules = domains.slice(0, WA_RULE_ID_MAX - WA_RULE_ID_BASE).map((domain, index) => ({
        id: WA_RULE_ID_BASE + index,
        priority: 1,
        action: {
            type: 'redirect',
            // The address the user asked for is carried across in `u`, so "five more
            // minutes" can put them back exactly where they were going — scheme, port
            // and path included. It goes last and unencoded because `\1` is a raw
            // substitution; the block screen reads it by splitting on `&u=` rather
            // than through URLSearchParams, which would stop at the first `&`.
            redirect: { regexSubstitution: `${blockedPage}?d=${encodeURIComponent(domain)}&u=\\1` },
        },
        condition: {
            regexFilter: `^(https?://([a-z0-9_-]+\\.)*${escapeForRegexFilter(domain)}(:\\d+)?/.*)$`,
            resourceTypes: ['main_frame'],
        },
    }));

    try {
        const existing = await chrome.declarativeNetRequest.getDynamicRules();
        const removeRuleIds = existing
            .filter((rule) => rule.id >= WA_RULE_ID_BASE && rule.id <= WA_RULE_ID_MAX)
            .map((rule) => rule.id);
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
        waInstalledRuleSignature = signature;
        logMessage(`[webActivity] Blocking ${domains.length} site(s).`);
    } catch (error) {
        console.error('[webActivity] Could not update the blocking rules:', error);
    }
    return domains;
}

/**
 * Acts on a site the moment it crosses a line: warns as it approaches its allowance,
 * and sends the tabs already sitting on it to the block screen — the declarative
 * rules only catch the next request, and a page already open would otherwise stay.
 */
async function waEnforce(domain, usedToday, settings, now = Date.now()) {
    const limits = await waGetLimits();
    const usedWeek = Number(limits[domain]?.weeklyLimitSeconds) > 0 ? await waUsedThisWeek(domain, now) : null;
    const verdict = ITG_WEB_ACTIVITY.evaluate(domain, limits, usedToday, new Date(now), usedWeek);
    if (!verdict.configured) return;

    const warnAt = limits[domain]?.notifyAtPercent ?? settings.notifyAtPercent;
    const stamp = `${ITG_WEB_ACTIVITY.dayKey(now)}|${domain}`;
    if (
        !verdict.blocked &&
        warnAt > 0 &&
        verdict.limitSeconds > 0 &&
        verdict.percent >= warnAt &&
        !(await waAlreadyWarned(stamp))
    ) {
        await waMarkWarned(stamp);
        await loadI18nMessages();
        chrome.notifications.create(`wa-limit-${stamp}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
            title: getI18nMsg('webActivityLimitNearTitle'),
            message: getI18nMsg('webActivityLimitNearBody', [
                domain,
                String(Math.round(verdict.remainingSeconds / 60)),
            ]),
        });
    }

    if (verdict.blocked) await waRedirectOpenTabs(domain);
}

/** Sends every tab already on a blocked site to the block screen. */
async function waRedirectOpenTabs(domain) {
    const blockedPage = chrome.runtime.getURL('src/ui/pages/web-activity/blocked.html');
    try {
        const tabs = await chrome.tabs.query({ url: [`*://${domain}/*`, `*://*.${domain}/*`] });
        await Promise.all(
            tabs.map((tab) => chrome.tabs.update(tab.id, { url: `${blockedPage}?d=${encodeURIComponent(domain)}` })),
        );
    } catch (error) {
        logMessage('[webActivity] Could not redirect the open tabs: ' + error.message);
    }
}

// ---------------------------------------------------------------- housekeeping

/** Drops the days that fall outside the retention window. */
async function waPruneOldDays() {
    const settings = await waGetSettings();
    const cutoff = ITG_WEB_ACTIVITY.dayKey(Date.now() - settings.retentionDays * 86400000);
    const index = await waGetDayIndex();
    const stale = index.filter((day) => day < cutoff);
    if (!stale.length) return;
    await chrome.storage.local.remove(stale.map((day) => ITG_WEB_ACTIVITY.dayStorageKey(day)));
    await chrome.storage.local.set({
        [ITG_WEB_ACTIVITY.KEYS.DAY_INDEX]: index.filter((day) => day >= cutoff),
    });
    logMessage(`[webActivity] Dropped ${stale.length} day(s) past the retention window.`);
}

/** The day records, keyed by day. `limitDays` of 0 means everything on record. */
async function waReadDays(limitDays = 0) {
    let index = await waGetDayIndex();
    if (limitDays) {
        const cutoff = ITG_WEB_ACTIVITY.dayKey(Date.now() - limitDays * 86400000);
        index = index.filter((day) => day >= cutoff);
    }
    if (!index.length) return {};
    const stored = await chrome.storage.local.get(index.map((day) => ITG_WEB_ACTIVITY.dayStorageKey(day)));
    const days = {};
    for (const day of index) {
        const record = stored[ITG_WEB_ACTIVITY.dayStorageKey(day)];
        if (record) days[day] = record;
    }
    return days;
}

/**
 * Adds one stored day entry into another, field by field.
 *
 * Three places had grown their own copy of this loop — the importer, the sync reader
 * and the sync merge — and the phase split (`p`) was added to two of them, which is
 * exactly the kind of drift that makes a figure disagree with itself depending on
 * which route the data took.
 */
function waAddEntry(target, incoming) {
    target.t += incoming.t || 0;
    target.v += incoming.v || 0;
    target.s += incoming.s || 0;
    for (const [hour, seconds] of Object.entries(incoming.h || {})) {
        target.h[hour] = (target.h[hour] || 0) + seconds;
    }
    target.p ||= { w: 0, s: 0, l: 0 };
    for (const field of ['w', 's', 'l']) {
        target.p[field] = (target.p[field] || 0) + (incoming.p?.[field] || 0);
    }
    return target;
}

// ---------------------------------------------------------------- profile sync

/**
 * [AI INSTRUCTION]
 * THE SHARED COPY, WHEN THE USER ASKS FOR ONE.
 *
 * `chrome.storage.sync` rides along with the browser profile, so writing there is how
 * the same extension in another browser ends up with the same figures. It is off by
 * default and everything below is a no-op until `settings.syncEnabled` is true.
 *
 * THREE THINGS ARE SHARED, AND THEY ARE SHARED DIFFERENTLY.
 *
 * - The preferences and the rules are one decision the user made once, so they are
 *   one item each and the most recent write wins. Each carries an `at` stamp so a
 *   browser that has been shut for a week cannot push its stale copy over a newer one
 *   the moment it wakes up.
 * - The day records are not a decision, they are a measurement, and two browsers
 *   measure different halves of the same Tuesday. Each writes its own days under its
 *   own device key and the reader adds them up. Overwriting one item with the other's
 *   copy would throw away whichever browser was opened first.
 *
 * WHAT IS NOT SHARED. Blocking is still decided on the local record: the blocker runs
 * on every navigation and cannot afford a round trip to the sync area, and a shared
 * area that is minutes stale is not something to hold a door shut with. The rules
 * travel; the enforcement stays where the browsing is.
 *
 * The local record is never written from the sync area either. It stays this
 * browser's own count — merging on read is what keeps the two from adding the same
 * seconds twice on the next push.
 */

/** Chrome's own ceiling. An item over it is rejected, so it is not offered. */
const WA_SYNC_ITEM_BYTES = 8000;

/** This browser's id inside the shared record, minted once and kept. */
async function waSyncDeviceId() {
    const key = ITG_WEB_ACTIVITY.KEYS.SYNC_DEVICE;
    const { [key]: stored } = await chrome.storage.local.get(key);
    if (stored) return stored;
    const id = 'd' + Math.random().toString(36).slice(2, 10);
    await chrome.storage.local.set({ [key]: id });
    return id;
}

const waSyncDayKey = (device, day) => `${ITG_WEB_ACTIVITY.SYNC.DAY_PREFIX}${device}:${day}`;

/** Everything of ours in the shared area, so it can be read or swept in one go. */
async function waSyncReadAll() {
    try {
        const all = await chrome.storage.sync.get(null);
        return Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(ITG_WEB_ACTIVITY.SYNC.PREFIX)));
    } catch {
        return {};
    }
}

/**
 * Publishes this browser's copy.
 *
 * Days that do not fit the per-item ceiling are skipped rather than failing the whole
 * push: one enormous Tuesday must not stop the other twenty days from travelling.
 *
 * @param {{ days?: boolean }} [options] The record is twenty-one items and the shared
 *   area only takes a hundred and twenty writes a minute, so editing a rule publishes
 *   the rules alone. The record goes out on the tick (see `waSyncPushDue`).
 */
async function waSyncPush({ days: includeDays = true } = {}) {
    const settings = await waGetSettings();
    if (!settings.syncEnabled) return;

    const limits = await waGetLimits();
    const now = Date.now();
    const writes = {
        [ITG_WEB_ACTIVITY.SYNC.SETTINGS]: { at: now, settings },
        [ITG_WEB_ACTIVITY.SYNC.LIMITS]: { at: now, limits },
    };

    let device = null;
    if (includeDays) {
        device = await waSyncDeviceId();
        for (const [day, record] of Object.entries(await waReadDays(ITG_WEB_ACTIVITY.SYNC.DAYS))) {
            const item = { at: now, record };
            if (JSON.stringify(item).length > WA_SYNC_ITEM_BYTES) continue;
            writes[waSyncDayKey(device, day)] = item;
        }
    }

    try {
        await chrome.storage.sync.set(writes);
    } catch (error) {
        logMessage('[webActivity] Could not publish the synced copy: ' + error.message);
        return;
    }
    if (!includeDays) return;

    // Days that have rolled out of the window are this browser's to withdraw.
    const stale = Object.keys(await waSyncReadAll()).filter(
        (key) => key.startsWith(`${ITG_WEB_ACTIVITY.SYNC.DAY_PREFIX}${device}:`) && !writes[key],
    );
    if (stale.length) await chrome.storage.sync.remove(stale).catch(() => {});
}

/** How often the record itself is republished. */
const WA_SYNC_PUSH_EVERY_MS = 10 * 60 * 1000;
const WA_SYNC_PUSHED_KEY = 'wa:syncPushedAt';

/**
 * The minute tick's share of the work: republish the record, but only every so often.
 *
 * The stamp lives in session storage because the worker is shut down between events —
 * a variable would reset to "never pushed" every time anything at all happened, and
 * the tick would publish twenty-one items a minute for as long as the browser was
 * open.
 */
async function waSyncPushDue() {
    const settings = await waGetSettings();
    if (!settings.syncEnabled) return;
    const { [WA_SYNC_PUSHED_KEY]: last = 0 } = await chrome.storage.session.get(WA_SYNC_PUSHED_KEY);
    if (Date.now() - last < WA_SYNC_PUSH_EVERY_MS) return;
    await chrome.storage.session.set({ [WA_SYNC_PUSHED_KEY]: Date.now() });
    await waSyncPush();
}

/**
 * The day records the *other* browsers have published, `{ [day]: { domains } }`.
 *
 * This browser's own slice is left out on purpose: it is already in the local record,
 * and adding it to itself would double every figure on the page.
 */
async function waSyncRemoteDays() {
    const settings = await waGetSettings();
    if (!settings.syncEnabled) return {};
    const device = await waSyncDeviceId();
    const all = await waSyncReadAll();
    const days = {};
    for (const [key, item] of Object.entries(all)) {
        if (!key.startsWith(ITG_WEB_ACTIVITY.SYNC.DAY_PREFIX)) continue;
        const [itemDevice, day] = key.slice(ITG_WEB_ACTIVITY.SYNC.DAY_PREFIX.length).split(':');
        if (!day || itemDevice === device) continue;
        days[day] ||= { domains: {} };
        for (const [domain, incoming] of Object.entries(item?.record?.domains || {})) {
            waAddEntry((days[day].domains[domain] ||= ITG_WEB_ACTIVITY.emptyDomainDay()), incoming);
        }
    }
    return days;
}

/** Local plus everyone else's, added domain by domain and hour by hour. */
function waMergeDays(local, remote) {
    if (!Object.keys(remote).length) return local;
    const merged = {};
    for (const day of new Set([...Object.keys(local), ...Object.keys(remote)])) {
        const record = { domains: {} };
        for (const source of [local[day], remote[day]]) {
            for (const [domain, incoming] of Object.entries(source?.domains || {})) {
                waAddEntry((record.domains[domain] ||= ITG_WEB_ACTIVITY.emptyDomainDay()), incoming);
            }
        }
        merged[day] = record;
    }
    return merged;
}

/**
 * Takes the preferences and the rules another browser published, if they are newer
 * than what is here. The record is not pulled: it is merged when it is read.
 */
async function waSyncPull() {
    const settings = await waGetSettings();
    if (!settings.syncEnabled) return;
    try {
        const { [ITG_WEB_ACTIVITY.SYNC.SETTINGS]: remoteSettings, [ITG_WEB_ACTIVITY.SYNC.LIMITS]: remoteLimits } =
            await chrome.storage.sync.get([ITG_WEB_ACTIVITY.SYNC.SETTINGS, ITG_WEB_ACTIVITY.SYNC.LIMITS]);

        if (remoteSettings?.settings) {
            // Whether *this* browser syncs is this browser's business, so the incoming
            // copy never gets to switch it off — that would be a one-way door nobody
            // could reopen from here.
            await chrome.storage.local.set({
                [ITG_WEB_ACTIVITY.KEYS.SETTINGS]: {
                    ...ITG_WEB_ACTIVITY.DEFAULT_SETTINGS,
                    ...remoteSettings.settings,
                    syncEnabled: true,
                },
            });
        }
        if (remoteLimits?.limits) {
            await chrome.storage.local.set({ [ITG_WEB_ACTIVITY.KEYS.LIMITS]: remoteLimits.limits });
            await waRebuildBlockRules();
        }
    } catch (error) {
        logMessage('[webActivity] Could not read the synced copy: ' + error.message);
    }
}

/** Everything this extension ever wrote to the shared area, gone. */
async function waSyncWipe() {
    const keys = Object.keys(await waSyncReadAll());
    if (keys.length) await chrome.storage.sync.remove(keys).catch(() => {});
}

/**
 * Another browser wrote something. Only the shared config is worth reacting to; a day
 * record landing there changes nothing until the dashboard asks for the days again.
 */
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (!changes[ITG_WEB_ACTIVITY.SYNC.SETTINGS] && !changes[ITG_WEB_ACTIVITY.SYNC.LIMITS]) return;
    waSerial(() => waSyncPull());
});

// ---------------------------------------------------------------- message handlers

/** Everything the dashboard paints, in one round trip. */
function handleWebActivityGetData(message, sendResponse) {
    (async () => {
        try {
            await waSync();
            const [days, limits, settings, openSegment, recentStore] = await Promise.all([
                waReadDays(message.days || 0),
                waGetLimits(),
                waGetSettings(),
                waGetOpenSegment(),
                chrome.storage.local.get(ITG_WEB_ACTIVITY.KEYS.RECENT),
            ]);
            sendResponse({
                success: true,
                days: waMergeDays(days, await waSyncRemoteDays()),
                limits,
                settings,
                openSegment,
                recent: recentStore[ITG_WEB_ACTIVITY.KEYS.RECENT] || [],
                blocked: await waBlockedDomains(),
                snoozeUses: await waSnoozeUses(),
            });
        } catch (error) {
            console.error('[webActivity] getData failed:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}

/** The verdict for one site, which is all the block screen needs. */
function handleWebActivityGetStatus(message, sendResponse) {
    (async () => {
        const now = Date.now();
        const limits = await waGetLimits();
        const used = await waUsedToday(message.domain, now);
        const usedWeek =
            Number(limits[message.domain]?.weeklyLimitSeconds) > 0 ? await waUsedThisWeek(message.domain, now) : null;
        sendResponse({
            success: true,
            verdict: ITG_WEB_ACTIVITY.evaluate(message.domain, limits, used, new Date(now), usedWeek),
            settings: await waGetSettings(),
            snoozeUses: await waSnoozeUses(now),
        });
    })();
}

function handleWebActivitySaveLimit(message, sendResponse) {
    waSerial(async () => {
        const limits = await waGetLimits();
        if (Array.isArray(message.domains)) {
            for (const d of message.domains) {
                if (message.limit === null) {
                    delete limits[d];
                } else {
                    limits[d] = ITG_WEB_ACTIVITY.normalizeLimit({
                        ...(limits[d] || {}),
                        ...message.limit,
                        category: limits[d]?.category || null,
                    });
                }
            }
        } else if (message.limit === null) {
            delete limits[message.domain];
        } else {
            limits[message.domain] = ITG_WEB_ACTIVITY.normalizeLimit(message.limit);
        }
        await waSaveLimits(limits);
        sendResponse({ success: true, limits });
    });
}

/** Lifts the block for a few minutes, which is the honest version of "not now". */
/**
 * How many times the grace button has been used today.
 *
 * The count rolls over with the day, like the allowances it is buying time against:
 * yesterday's "one more go" is not something to hold against this morning.
 */
async function waSnoozeUses(now = Date.now()) {
    const key = ITG_WEB_ACTIVITY.KEYS.SNOOZE_USES;
    const { [key]: stored } = await chrome.storage.local.get(key);
    const today = ITG_WEB_ACTIVITY.dayKey(now);
    return stored?.day === today ? Number(stored.count) || 0 : 0;
}

async function waBumpSnoozeUses(now = Date.now()) {
    const key = ITG_WEB_ACTIVITY.KEYS.SNOOZE_USES;
    const count = (await waSnoozeUses(now)) + 1;
    await chrome.storage.local.set({ [key]: { day: ITG_WEB_ACTIVITY.dayKey(now), count } });
    return count;
}

function handleWebActivitySnooze(message, sendResponse) {
    waSerial(async () => {
        const settings = await waGetSettings();
        const limits = await waGetLimits();
        const minutes = Number(message.minutes) || settings.snoozeMinutes;
        if (!limits[message.domain]) {
            sendResponse({ success: false });
            return;
        }
        limits[message.domain] = ITG_WEB_ACTIVITY.normalizeLimit({
            ...limits[message.domain],
            snoozeUntil: Date.now() + minutes * 60000,
        });
        await waSaveLimits(limits);
        // Counted here rather than in the page that asked: the block screen uses this
        // button too, and two pages each keeping their own tally is no tally at all.
        const uses = await waBumpSnoozeUses();
        sendResponse({ success: true, until: limits[message.domain].snoozeUntil, snoozeUses: uses });
    });
}

/**
 * Saves the tracking preferences.
 *
 * It goes through the worker rather than being written straight to storage from the
 * settings page because two of the fields have an immediate effect the page cannot
 * produce: the idle threshold is a browser-level setting, and turning a site's
 * tracking off has to take the clock off it now rather than at the next event.
 */
function handleWebActivitySaveSettings(message, sendResponse) {
    waSerial(async () => {
        const previous = await waGetSettings();
        const settings = { ...ITG_WEB_ACTIVITY.DEFAULT_SETTINGS, ...(message.settings || {}) };
        await chrome.storage.local.set({ [ITG_WEB_ACTIVITY.KEYS.SETTINGS]: settings });
        // Turning the switch off has to take the copy with it. Leaving the records in
        // the shared area would keep them travelling to every other browser on the
        // profile long after the user said to stop.
        if (previous.syncEnabled && !settings.syncEnabled) await waSyncWipe();
        try {
            await chrome.idle.setDetectionInterval(Math.max(15, settings.idleSeconds));
        } catch (error) {
            logMessage('[webActivity] Could not apply the idle threshold: ' + error.message);
        }
        await waSyncNow();
        if (settings.syncEnabled) await waSyncPush();
        sendResponse({ success: true, settings });
    });
}

/** Forgets history: one site everywhere, or everything. */
function handleWebActivityClear(message, sendResponse) {
    waSerial(async () => {
        const index = await waGetDayIndex();
        if (message.domain) {
            const days = await waReadDays();
            const writes = {};
            for (const [day, record] of Object.entries(days)) {
                if (!record?.domains?.[message.domain]) continue;
                delete record.domains[message.domain];
                writes[ITG_WEB_ACTIVITY.dayStorageKey(day)] = record;
            }
            const { [ITG_WEB_ACTIVITY.KEYS.RECENT]: recent = [] } = await chrome.storage.local.get(
                ITG_WEB_ACTIVITY.KEYS.RECENT,
            );
            writes[ITG_WEB_ACTIVITY.KEYS.RECENT] = recent.filter((visit) => visit.d !== message.domain);
            await chrome.storage.local.set(writes);
        } else {
            await chrome.storage.local.remove([
                ...index.map((day) => ITG_WEB_ACTIVITY.dayStorageKey(day)),
                ITG_WEB_ACTIVITY.KEYS.DAY_INDEX,
                ITG_WEB_ACTIVITY.KEYS.RECENT,
            ]);
            await chrome.storage.session.remove(ITG_WEB_ACTIVITY.KEYS.OPEN_SEGMENT);
        }
        await waRebuildBlockRules();
        sendResponse({ success: true });
    });
}

/** Restores an exported file, merging days rather than replacing the lot. */
function handleWebActivityImport(message, sendResponse) {
    waSerial(async () => {
        try {
            const payload = message.payload || {};
            const writes = {};
            for (const [day, record] of Object.entries(payload.days || {})) {
                const existing = await waGetDay(day);
                for (const [domain, incoming] of Object.entries(record.domains || {})) {
                    waAddEntry((existing.domains[domain] ||= ITG_WEB_ACTIVITY.emptyDomainDay()), incoming);
                }
                writes[ITG_WEB_ACTIVITY.dayStorageKey(day)] = existing;
                await waIndexDay(day);
            }
            if (payload.limits) writes[ITG_WEB_ACTIVITY.KEYS.LIMITS] = payload.limits;
            if (payload.settings) {
                writes[ITG_WEB_ACTIVITY.KEYS.SETTINGS] = {
                    ...ITG_WEB_ACTIVITY.DEFAULT_SETTINGS,
                    ...payload.settings,
                };
            }
            await chrome.storage.local.set(writes);
            await waRebuildBlockRules();
            sendResponse({ success: true });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    });
}

// ---------------------------------------------------------------- browser events

/**
 * Anything that can change which site is in front. They all do the same thing, so
 * they share one handler rather than each growing its own logic.
 */
chrome.tabs.onActivated.addListener(() => waSync());
chrome.windows.onFocusChanged.addListener(() => waSync());
chrome.tabs.onRemoved.addListener(() => waSync());

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // A navigation is the only thing that counts as a visit; a title or favicon
    // landing later is the same visit.
    if (changeInfo.url) {
        const settings = await waGetSettings();
        const domain = ITG_WEB_ACTIVITY.domainOf(changeInfo.url);
        if (settings.enabled && domain && !settings.ignoredDomains.includes(domain)) {
            await waBumpCounter(domain, 'v');
            await waPushRecent({ d: domain, u: changeInfo.url, t: tab?.title || '', at: Date.now() });
        }
    }
    if (changeInfo.url || changeInfo.audible !== undefined) await waSync();
});

chrome.idle.onStateChanged.addListener(async (state) => {
    if (state === 'active') {
        await waSync();
        return;
    }
    // The stretch between the last keypress and this event is not time spent, so the
    // segment is closed as of when the user actually stopped.
    const settings = await waGetSettings();
    await waSync({ idleSince: Date.now() - settings.idleSeconds * 1000 });
});

/** Banks the open segment before the worker is shut down, so nothing waits a minute. */
chrome.runtime.onSuspend?.addListener(() => {
    waSync();
});

/**
 * Everything that has to happen once per worker start: the idle threshold is not
 * persisted, and the blocking rules have to be checked against the clock in case a
 * schedule window opened or the day rolled over while nothing was running.
 */
async function initWebActivity() {
    try {
        const settings = await waGetSettings();
        await chrome.idle.setDetectionInterval(Math.max(15, settings.idleSeconds));
        await waPruneOldDays();
        await waSync();
        if (settings.syncEnabled) {
            await waSyncPull();
            await waSyncPush();
        }
    } catch (error) {
        console.error('[webActivity] Could not start the tracker:', error);
    }
}
