import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

/** The real schema and worker file, loaded against an in-memory chrome. */
function loadWorker({ activeTab = null } = {}) {
    const area = () => {
        const data = {};
        return {
            data,
            get: async (keys) => {
                const out = {};
                const list =
                    keys == null
                        ? Object.keys(data)
                        : Array.isArray(keys)
                          ? keys
                          : typeof keys === 'string'
                            ? [keys]
                            : Object.keys(keys);
                for (const key of list) if (key in data) out[key] = structuredClone(data[key]);
                return out;
            },
            set: async (values) => Object.assign(data, structuredClone(values)),
            remove: async (keys) => {
                for (const key of [].concat(keys)) delete data[key];
            },
        };
    };
    const local = area();
    const session = area();
    const on = () => ({ addListener: () => {} });
    const rules = [];
    const redirected = [];
    const notified = [];
    const context = {
        console,
        setTimeout,
        clearTimeout,
        Date,
        URL,
        structuredClone,
        Promise,
        Math,
        logMessage: () => {},
        getI18nMsg: (key, args) => (args ? `${key}:${args.join('|')}` : key),
        loadI18nMessages: async () => {},
        chrome: {
            storage: { local, session, sync: area(), onChanged: on() },
            tabs: {
                onActivated: on(),
                onRemoved: on(),
                onUpdated: on(),
                query: async () => (activeTab ? [activeTab] : []),
                update: async (id, props) => redirected.push(props.url),
            },
            windows: {
                onFocusChanged: on(),
                getLastFocused: async () => ({ id: 1, focused: true }),
                WINDOW_ID_NONE: -1,
            },
            idle: {
                onStateChanged: on(),
                setDetectionInterval: async () => {},
                queryState: (interval, callback) => callback('active'),
            },
            runtime: { onSuspend: on(), getURL: (path) => 'chrome-extension://x/' + path },
            notifications: { create: (id, options) => notified.push({ id, ...options }) },
            declarativeNetRequest: {
                getDynamicRules: async () => rules.slice(),
                updateDynamicRules: async ({ removeRuleIds, addRules }) => {
                    for (const id of removeRuleIds) {
                        const index = rules.findIndex((rule) => rule.id === id);
                        if (index >= 0) rules.splice(index, 1);
                    }
                    rules.push(...addRules);
                },
            },
        },
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('core/services/webActivitySchema.js'), context);
    vm.runInContext(read('core/background/handlers/web-activity.js'), context);
    return { context, local, session, rules, redirected, notified, WA: context.ITG_WEB_ACTIVITY };
}

const run = (context, code) => vm.runInContext(code, context);

test('a limit counts the time spent on its subdomains, as its block rule covers them', async () => {
    const tab = { id: 9, url: 'https://m.youtube.com/watch?v=1', title: 'yt', active: true, windowId: 1 };
    const { context, local, session, rules, redirected, WA } = loadWorker({ activeTab: tab });
    local.data[WA.KEYS.LIMITS] = {
        'youtube.com': WA.normalizeLimit({ dailyLimitSeconds: 60, weeklyLimitSeconds: 120 }),
    };
    session.data[WA.KEYS.OPEN_SEGMENT] = {
        domain: 'm.youtube.com',
        tabId: 9,
        url: tab.url,
        startedAt: Date.now() - 30 * 60000,
    };
    await run(context, 'waSyncNow()');

    // Recorded under its own hostname, unchanged.
    const day = local.data[WA.dayStorageKey(Date.now())].domains;
    assert.deepEqual(Object.keys(day), ['m.youtube.com']);

    assert.ok((await run(context, "waUsedToday('youtube.com')")) >= 899);
    assert.ok((await run(context, "waUsedThisWeek('youtube.com')")) >= 899);
    assert.deepEqual([...(await run(context, 'waBlockedDomains()'))], ['youtube.com']);
    assert.equal(rules.length, 1);
    // The tab already sitting on the subdomain is sent to the block screen.
    assert.ok(redirected.some((url) => url.includes('blocked.html?d=youtube.com')));
});

test('a limit does not count a different site that merely ends the same way', () => {
    const { WA } = loadWorker();
    const domains = { 'notyoutube.com': { t: 500 }, 'youtube.com': { t: 10 }, 'a.b.youtube.com': { t: 5 } };
    assert.equal(WA.secondsUnder('youtube.com', domains, true), 15);
    assert.equal(WA.secondsUnder('youtube.com', domains), 10);
    assert.equal(WA.secondsUnder('youtube.com', { 'youtube.com': 7, 'm.youtube.com': 3 }), 10);
});

test('a site is itself and its mobile and www forms; every subdomain only when asked', () => {
    const { WA } = loadWorker();
    assert.equal(WA.limitCovers('youtube.com', 'm.youtube.com'), true);
    assert.equal(WA.limitCovers('google.com', 'www.google.com'), true);
    assert.equal(WA.limitCovers('google.com', 'mail.google.com'), false);
    assert.equal(WA.limitCovers('google.com', 'mail.google.com', true), true);
    assert.equal(WA.isIgnored('mail.google.com', ['google.com']), false);
    assert.equal(WA.isIgnored('m.google.com', ['google.com']), true);
    assert.equal(WA.isIgnored('mail.google.com', ['*.google.com']), true);
    assert.equal(WA.isIgnored('google.com', ['*.google.com']), true);
});

test('rules stored before the choice keep covering their subdomains; new ones do not', () => {
    const { WA } = loadWorker();
    assert.equal(WA.normalizeLimit({ dailyLimitSeconds: 60 }).includeSubdomains, true);
    assert.equal(WA.normalizeLimit({ dailyLimitSeconds: 60, includeSubdomains: false }).includeSubdomains, false);
    assert.equal(WA.normalizeLimit({ category: 'news' }).includeSubdomains, false);
    assert.equal(WA.normalizeLimit({}).includeSubdomains, false);
});

test('the block rule reaches what the counter counts', async () => {
    const { context, local, rules, WA } = loadWorker();
    const today = WA.dayStorageKey(Date.now());
    local.data[today] = { domains: { 'mail.google.com': { t: 900 }, 'reddit.com': { t: 900 } } };
    local.data[WA.KEYS.LIMITS] = {
        'google.com': WA.normalizeLimit({ dailyLimitSeconds: 60, includeSubdomains: false }),
        'reddit.com': WA.normalizeLimit({ dailyLimitSeconds: 60, includeSubdomains: false }),
    };
    // Gmail's time is not Google's, so Google is not blocked by it.
    assert.deepEqual([...(await run(context, 'waBlockedDomains()'))], ['reddit.com']);
    await run(context, 'waRebuildBlockRules()');
    const filter = new RegExp(rules[0].condition.regexFilter);
    assert.equal(filter.test('https://reddit.com/r/x'), true);
    assert.equal(filter.test('https://m.reddit.com/r/x'), true);
    assert.equal(filter.test('https://old.reddit.com/r/x'), false);

    // Asked to reach the subdomains, the same rule counts and stops them.
    local.data[WA.KEYS.LIMITS]['google.com'].includeSubdomains = true;
    local.data[WA.KEYS.LIMITS]['reddit.com'].includeSubdomains = true;
    assert.deepEqual([...(await run(context, 'waBlockedDomains()'))], ['google.com', 'reddit.com']);
    await run(context, 'waRebuildBlockRules()');
    assert.equal(rules.length, 2);
    assert.ok(rules.some((rule) => new RegExp(rule.condition.regexFilter).test('https://mail.google.com/')));
    assert.ok(rules.some((rule) => new RegExp(rule.condition.regexFilter).test('https://old.reddit.com/')));
});

test('importing a file without a password keeps the lock that is set', async () => {
    const { context, local, WA } = loadWorker();
    const lock = { salt: 'aa', hash: 'bb' };
    local.data[WA.KEYS.SETTINGS] = { ...WA.DEFAULT_SETTINGS, blockPassword: lock };
    const response = await new Promise((resolve) => {
        context.__done = resolve;
        run(context, 'handleWebActivityImport({ payload: { days: {}, limits: {}, settings: {} } }, __done)');
    });
    assert.equal(response.success, true);
    assert.deepEqual({ ...local.data[WA.KEYS.SETTINGS].blockPassword }, lock);
});

/** Calls a message handler the way the dispatcher does and waits for its answer. */
const answer = (context, call) =>
    new Promise((resolve) => {
        context.__done = resolve;
        run(context, call.replace('DONE', '__done'));
    });

test('"almost out of time" is not sent once the allowance is spent, snoozed or not', async () => {
    const { context, local, notified, WA } = loadWorker();
    const settings = { ...WA.DEFAULT_SETTINGS };
    const now = Date.now();
    local.data[WA.KEYS.LIMITS] = {
        'example.com': WA.normalizeLimit({ dailyLimitSeconds: 120, notifyAtPercent: 80, snoozeUntil: now + 300000 }),
    };
    // Past the allowance, let through by "five more minutes".
    await run(context, `waEnforce('example.com', 400, ${JSON.stringify(settings)}, ${now})`);
    assert.equal(notified.length, 0);

    // Still inside it, past the threshold: warned once, with at least a minute to say.
    local.data[WA.KEYS.LIMITS]['example.com'].snoozeUntil = 0;
    await run(context, `waEnforce('example.com', 110, ${JSON.stringify(settings)}, ${now})`);
    await run(context, `waEnforce('example.com', 112, ${JSON.stringify(settings)}, ${now})`);
    assert.equal(notified.length, 1);
    // Ten seconds left reads as a minute, not as "about 0 min".
    assert.equal(notified[0].message, 'webActivityLimitNearBody:example.com|1');
});

test('a rule with no threshold of its own warns at the default one', async () => {
    const { context, local, notified, WA } = loadWorker();
    local.data[WA.KEYS.LIMITS] = { 'example.com': WA.normalizeLimit({ dailyLimitSeconds: 600 }) };
    await run(context, `waEnforce('example.com', 500, ${JSON.stringify(WA.DEFAULT_SETTINGS)})`);
    assert.equal(notified.length, 1);
});

test('a grace period of zero minutes lifts nothing and is not counted', async () => {
    const { context, local, WA } = loadWorker();
    local.data[WA.KEYS.SETTINGS] = { ...WA.DEFAULT_SETTINGS, snoozeMinutes: 0 };
    local.data[WA.KEYS.LIMITS] = { 'example.com': WA.normalizeLimit({ dailyLimitSeconds: 60 }) };
    const response = await answer(context, "handleWebActivitySnooze({ domain: 'example.com' }, DONE)");
    assert.equal(response.success, false);
    assert.equal(local.data[WA.KEYS.LIMITS]['example.com'].snoozeUntil, 0);
    assert.equal(local.data[WA.KEYS.SNOOZE_USES], undefined);
});

test('not recording a site leaves its subdomains off the record too', async () => {
    const tab = { id: 3, url: 'https://m.youtube.com/watch?v=1', title: 'yt', active: true, windowId: 1 };
    const { context, local, session, WA } = loadWorker({ activeTab: tab });
    local.data[WA.KEYS.SETTINGS] = { ...WA.DEFAULT_SETTINGS, ignoredDomains: ['youtube.com'] };
    await run(context, 'waSyncNow()');
    assert.equal(session.data[WA.KEYS.OPEN_SEGMENT], undefined);
    assert.equal(WA.isIgnored('notyoutube.com', ['youtube.com']), false);
    assert.equal(WA.isIgnored('localhost', ['localhost']), true);
});

test('a record holding only a category is not a rule', () => {
    const { WA } = loadWorker();
    const limits = { 'nasa.gov': { category: 'education' } };
    assert.equal(WA.setsRule(limits['nasa.gov']), false);
    assert.equal(WA.evaluate('nasa.gov', limits).configured, false);
    assert.equal(WA.categoryOf('nasa.gov', limits), 'education');
    assert.equal(WA.setsRule({ schedules: [{ start: '09:00', end: '10:00' }] }), true);
});
