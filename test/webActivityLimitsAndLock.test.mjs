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
        getI18nMsg: (key) => key,
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
            notifications: { create: () => {} },
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
    return { context, local, session, rules, redirected, WA: context.ITG_WEB_ACTIVITY };
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
    assert.equal(WA.secondsUnder('youtube.com', domains), 15);
    assert.equal(WA.secondsUnder('youtube.com', { 'youtube.com': 7, 'm.youtube.com': 3 }), 10);
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
