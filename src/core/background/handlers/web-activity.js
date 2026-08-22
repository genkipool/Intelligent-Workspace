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

// ---------------------------------------------------------------- writing counters

/**
 * Banks a stretch of time against a site, spread over the days and hours it really
 * covers, and returns the site's new total for today.
 */
async function waAddTime(domain, startMs, endMs) {
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
        for (const bucket of dayBuckets) {
            entry.t = Math.round((entry.t + bucket.seconds) * 100) / 100;
            entry.h[bucket.hour] = Math.round(((entry.h[bucket.hour] || 0) + bucket.seconds) * 100) / 100;
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
    if (idleState !== 'active') return null;

    let tab = null;
    try {
        const win = await chrome.windows.getLastFocused({ populate: false });
        if (win?.focused) [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    } catch {
        // No window at all, e.g. everything minimised.
    }

    // Nothing browsable is in front — the browser is in the background, or the front
    // tab is a settings page — but something is still playing. A video left running in
    // another window is time spent on that site, and not counting it makes the media
    // sites read as far quieter than they are.
    if (!ITG_WEB_ACTIVITY.domainOf(tab?.url) && settings.countAudible) {
        try {
            [tab] = await chrome.tabs.query({ audible: true, muted: false });
        } catch {
            /* ignore */
        }
    }

    const domain = ITG_WEB_ACTIVITY.domainOf(tab?.url);
    if (!domain || settings.ignoredDomains.includes(domain)) return null;
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
        usedToday = await waAddTime(open.domain, open.startedAt, closedAt);
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
    return domains
        .filter((domain) => ITG_WEB_ACTIVITY.evaluate(domain, limits, today.domains?.[domain]?.t || 0, now).blocked)
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
    const verdict = ITG_WEB_ACTIVITY.evaluate(domain, limits, usedToday, new Date(now));
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
                days,
                limits,
                settings,
                openSegment,
                recent: recentStore[ITG_WEB_ACTIVITY.KEYS.RECENT] || [],
                blocked: await waBlockedDomains(),
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
        sendResponse({
            success: true,
            verdict: ITG_WEB_ACTIVITY.evaluate(message.domain, limits, used, new Date(now)),
            settings: await waGetSettings(),
        });
    })();
}

function handleWebActivitySaveLimit(message, sendResponse) {
    waSerial(async () => {
        const limits = await waGetLimits();
        if (message.limit === null) delete limits[message.domain];
        else limits[message.domain] = ITG_WEB_ACTIVITY.normalizeLimit(message.limit);
        await waSaveLimits(limits);
        sendResponse({ success: true, limits });
    });
}

/** Lifts the block for a few minutes, which is the honest version of "not now". */
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
        sendResponse({ success: true, until: limits[message.domain].snoozeUntil });
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
                    const entry = (existing.domains[domain] ||= ITG_WEB_ACTIVITY.emptyDomainDay());
                    entry.t += incoming.t || 0;
                    entry.v += incoming.v || 0;
                    entry.s += incoming.s || 0;
                    for (const [hour, seconds] of Object.entries(incoming.h || {})) {
                        entry.h[hour] = (entry.h[hour] || 0) + seconds;
                    }
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
    } catch (error) {
        console.error('[webActivity] Could not start the tracker:', error);
    }
}
