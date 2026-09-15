/**
 * What the service worker does when it starts and when events arrive, counted against
 * the calls it makes to the browser. The worker starts again on every alarm and on every
 * event after half a minute idle, so anything here that repeats work for nothing repeats
 * it all day.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const WORKER_FILES = [
    'src/core/background/state.js',
    'src/core/background/utils.js',
    'src/core/background/group-analyzer.js',
    'src/core/background/groupManager.js',
    'src/core/background/stateManager.js',
    'src/core/background/events.js',
];

function pick(data, keys) {
    if (keys === null || keys === undefined) return { ...data };
    if (typeof keys === 'string') return keys in data ? { [keys]: data[keys] } : {};
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
    return Object.fromEntries(Object.entries(keys).map(([k, fallback]) => [k, k in data ? data[k] : fallback]));
}

function storageArea(data, onSet) {
    return {
        get: async (keys) => structuredClone(pick(data, keys)),
        set: async (items) => {
            onSet?.(items);
            Object.assign(data, structuredClone(items));
        },
        remove: async (keys) => [].concat(keys).forEach((k) => delete data[k]),
        setAccessLevel: async () => {},
    };
}

/**
 * One worker start. `session` is shared between starts of the same browser session, the
 * way chrome.storage.session outlives the worker.
 */
function startWorker({ session = {}, tabs = [], groups = [], manifestScripts = [] } = {}) {
    const calls = {
        removeAll: 0,
        menuCreates: 0,
        executeScript: 0,
        localSets: [],
        passes: 0,
        allGroupsQueries: 0,
        groupUpdates: [],
    };
    const errors = [];
    const noop = () => {};
    const event = { addListener: noop, removeListener: noop, hasListener: () => false };
    const anyApi = new Proxy(
        {},
        {
            get: (target, prop) =>
                prop === 'then' ? undefined : prop.startsWith?.('on') ? event : async () => undefined,
        },
    );
    const local = {};
    const chrome = {
        runtime: {
            id: 'test',
            sendMessage: noop,
            getURL: (p = '') => `chrome-extension://test/${p}`,
            getManifest: () => ({ content_scripts: manifestScripts, version: '1' }),
            getContexts: async () => [],
            onMessage: event,
            onConnect: event,
            onStartup: event,
            onInstalled: event,
            onSuspend: event,
            lastError: undefined,
        },
        storage: {
            local: storageArea(local, (items) => calls.localSets.push(Object.keys(items))),
            sync: storageArea({}),
            session: storageArea(session),
            onChanged: event,
        },
        i18n: { getMessage: (key) => key, getUILanguage: () => 'en' },
        tabs: new Proxy(
            {
                query: async (q = {}) =>
                    tabs.filter(
                        (t) =>
                            (q.windowId === undefined || t.windowId === q.windowId) &&
                            (q.groupId === undefined || t.groupId === q.groupId),
                    ),
                get: async (id) => tabs.find((t) => t.id === id),
            },
            { get: (t, p) => (p in t ? t[p] : anyApi[p]) },
        ),
        tabGroups: new Proxy(
            {
                query: async (q = {}) => {
                    if (Object.keys(q).length === 0) calls.allGroupsQueries++;
                    return groups.filter(
                        (g) =>
                            (q.windowId === undefined || g.windowId === q.windowId) &&
                            (q.collapsed === undefined || g.collapsed === q.collapsed),
                    );
                },
                get: async (id) => groups.find((g) => g.id === id),
                update: async (id, props) => {
                    calls.groupUpdates.push([id, props]);
                    return groups.find((g) => g.id === id);
                },
            },
            { get: (t, p) => (p in t ? t[p] : anyApi[p]) },
        ),
        windows: new Proxy(
            {
                getAll: async (opts) => {
                    if (opts?.populate) calls.passes++;
                    return [{ id: 1, type: 'normal', tabs: opts?.populate ? tabs : undefined }];
                },
            },
            { get: (t, p) => (p in t ? t[p] : anyApi[p]) },
        ),
        contextMenus: {
            removeAll: async () => {
                calls.removeAll++;
            },
            create: () => {
                calls.menuCreates++;
            },
            update: async () => {},
            onClicked: event,
        },
        scripting: {
            executeScript: async () => {
                calls.executeScript++;
                return [];
            },
            insertCSS: async () => {},
        },
        alarms: { create: noop, get: async () => ({ name: 'itg-periodic-tasks' }), onAlarm: event },
    };
    const chromeWithFallback = new Proxy(chrome, { get: (t, p) => (p in t ? t[p] : anyApi) });

    const context = {
        console: { log: noop, info: noop, warn: noop, error: (...a) => errors.push(a.map(String).join(' ')) },
        URL,
        Map,
        Set,
        Date,
        JSON,
        Promise,
        structuredClone,
        AbortController,
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 20)),
        clearTimeout,
        setInterval: () => 0,
        clearInterval: noop,
        fetch: async () => ({ ok: true, json: async () => ({}) }),
        chrome: chromeWithFallback,
    };
    vm.createContext(context);
    for (const file of WORKER_FILES) vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file });
    // Defined in files this test does not load: the handlers and the IndexedDB module.
    for (const name of ['loadTabModes', 'updatePinState', 'cleanupOrphanScreenshots', 'checkSchedules']) {
        if (typeof context[name] !== 'function') context[name] = async () => {};
    }
    vm.runInContext('isInitializing = false', context);
    const run = (code) => vm.runInContext(code, context);
    return { context, calls, errors, run, session };
}

describe('worker start', () => {
    it('regroups on the first start of a browser session and not on later starts with nothing missed', async () => {
        const session = {};
        const first = startWorker({ session });
        await first.run('initializeExtensionStates()');
        assert.deepEqual(first.errors, []);
        assert.equal(first.calls.passes, 1, 'the first start of the session runs a grouping pass');

        const later = startWorker({ session });
        await later.run('initializeExtensionStates()');
        assert.deepEqual(later.errors, []);
        assert.equal(later.calls.passes, 0, 'an alarm start with no event dropped must not regroup');
    });

    it('regroups on a later start when an event was dropped while the state was loading', async () => {
        const session = {};
        await startWorker({ session }).run('initializeExtensionStates()');

        const woken = startWorker({ session });
        // The activation that woke the worker arrives while the state is still loading.
        woken.context.loadTabModes = async () => {
            woken.run("shouldIgnoreEventDuringInitialization('tabs.onActivated', 7)");
        };
        await woken.run('initializeExtensionStates()');
        assert.equal(woken.calls.passes, 1, 'the dropped event has to be made up for');
    });

    it('a second plain request joins the initialization in flight', async () => {
        const worker = startWorker();
        await worker.run('Promise.all([initializeExtensionStates(), initializeExtensionStates()])');
        assert.equal(worker.calls.passes, 1);
    });

    it('a forced initialization regroups even when the session has settled', async () => {
        const session = {};
        await startWorker({ session }).run('initializeExtensionStates()');
        const worker = startWorker({ session });
        await worker.run('initializeExtensionStates(false, { forceFull: true })');
        assert.equal(worker.calls.passes, 1);
    });
});

describe('content scripts re-run into open tabs', () => {
    const manifestScripts = [{ matches: ['<all_urls>'], js: ['src/utils/hint/main.js'], all_frames: true }];
    const tabs = [{ id: 11, windowId: 1, url: 'https://example.com/', groupId: -1 }];

    it('once per extension session, not on every worker start', async () => {
        const session = {};
        const first = startWorker({ session, tabs, manifestScripts });
        await first.run('injectContentScriptsOncePerSession()');
        assert.equal(first.calls.executeScript, 1);

        const later = startWorker({ session, tabs, manifestScripts });
        await later.run('injectContentScriptsOncePerSession()');
        assert.equal(later.calls.executeScript, 0);
    });

    it('not at all when the browser has just started, and not later in that session either', async () => {
        const session = {};
        const atStartup = startWorker({ session, tabs, manifestScripts });
        await atStartup.run('injectContentScriptsOncePerSession({ browserJustStarted: true })');
        assert.equal(atStartup.calls.executeScript, 0);

        const later = startWorker({ session, tabs, manifestScripts });
        await later.run('injectContentScriptsOncePerSession()');
        assert.equal(later.calls.executeScript, 0);
    });
});

describe('context menus', () => {
    it('are rebuilt only when what they show changes, across worker starts too', async () => {
        const session = {};
        const worker = startWorker({ session });
        await worker.run('setupContextMenus()');
        assert.equal(worker.calls.removeAll, 1);
        assert.ok(worker.calls.menuCreates > 10);

        await worker.run('setupContextMenus()');
        assert.equal(worker.calls.removeAll, 1, 'an identical menu is not rebuilt');

        worker.run('extensionSettings.enablePrefixes = !extensionSettings.enablePrefixes');
        await worker.run('setupContextMenus()');
        assert.equal(worker.calls.removeAll, 2, 'a changed option rebuilds it');

        const restarted = startWorker({ session });
        restarted.run(`extensionSettings.enablePrefixes = ${worker.run('extensionSettings.enablePrefixes')}`);
        await restarted.run('setupContextMenus()');
        assert.equal(restarted.calls.removeAll, 0, 'the menus outlive the worker, and so does their signature');
    });
});

describe('per-event work', () => {
    it('collapsing the other groups writes only to the ones still open', async () => {
        const tabs = [
            { id: 1, windowId: 1, groupId: 10, active: true },
            { id: 2, windowId: 1, groupId: 20 },
            { id: 3, windowId: 1, groupId: 30 },
        ];
        const groups = [
            { id: 10, windowId: 1, collapsed: false },
            { id: 20, windowId: 1, collapsed: false },
            { id: 30, windowId: 1, collapsed: true },
        ];
        const worker = startWorker({ tabs, groups });
        await worker.run('collapseInactiveGroups(1)');
        assert.deepEqual(
            worker.calls.groupUpdates.map(([id]) => id),
            [20],
        );
    });

    it('the prefix state is written only when it changed', async () => {
        const worker = startWorker();
        worker.run("groupPrefixState.set('Docs_1', { prefix: '', tabCount: 1 })");
        await worker.run('saveGroupPrefixState()');
        await worker.run('saveGroupPrefixState()');
        const writes = () => worker.calls.localSets.filter((keys) => keys.includes('groupPrefixState')).length;
        assert.equal(writes(), 1);

        worker.run("groupPrefixState.set('Docs_1', { prefix: '', tabCount: 2 })");
        await worker.run('saveGroupPrefixState()');
        assert.equal(writes(), 2);
    });

    it('a burst of requests to re-sync the groups runs one sync', async () => {
        const worker = startWorker({ groups: [{ id: 5, windowId: 1, title: 'Docs' }] });
        await worker.run('Promise.all([1, 2, 3, 4, 5].map(() => requestSyncWithExistingGroups()))');
        assert.equal(worker.calls.allGroupsQueries, 1);
    });
});
