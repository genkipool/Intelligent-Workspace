/**
 * E2E test suite for Service Worker Startup and Multi-Window Grouping:
 * - Non-blocking SW startup (initializeExtensionStates resolves immediately, isInitializing === false).
 * - Multi-window tab grouping pass (window isolation, no cross-window tab grouping).
 * - Concurrent tabs.onUpdated during isGrouping sets hasPendingRegroup.
 * - Cross-window tab move (tabs.onAttached) triggers debounceGroupTabs().
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function createBackgroundVM(customChrome = {}) {
    const listeners = {};
    const storageData = {
        groupPrefixState: {},
        tabsEverActive: [],
        groupExpandedEver: {},
        browserSessionStartedAt: Date.now(),
    };

    function createTargetProxy(target = {}) {
        return new Proxy(target, {
            get: (t, p) => {
                if (typeof t === 'function' && p === 'bind') {
                    return t.bind.bind(t);
                }
                if (p in t) {
                    const val = t[p];
                    if (val && typeof val === 'object' && !Array.isArray(val)) {
                        return createTargetProxy(val);
                    }
                    return val;
                }
                if (p === 'addListener') {
                    return () => {};
                }
                if (p === 'removeListener') {
                    return () => {};
                }
                const dummyFn = (...args) => {};
                return createTargetProxy(dummyFn);
            },
            apply: (t, thisArg, args) => {
                if (typeof t === 'function') {
                    return t.apply(thisArg, args);
                }
                return undefined;
            },
        });
    }

    const defaultChrome = {
        runtime: {
            sendMessage: () => {},
            id: 'test-extension-id',
            getURL: (path = '') => `chrome-extension://test-extension-id/${path}`,
        },
        storage: {
            local: {
                get: async (k) => (typeof k === 'string' ? { [k]: storageData[k] } : { ...storageData }),
                set: async (obj) => Object.assign(storageData, obj),
            },
            sync: {
                get: async (k) => (typeof k === 'string' ? { [k]: storageData[k] } : { ...storageData }),
                set: async (obj) => Object.assign(storageData, obj),
            },
            session: {
                get: async (k) => (typeof k === 'string' ? { [k]: storageData[k] } : { ...storageData }),
                set: async (obj) => Object.assign(storageData, obj),
                setAccessLevel: async () => {},
            },
            onChanged: { addListener: () => {} },
        },
        tabs: {
            onUpdated: {
                addListener: (fn) => {
                    listeners['tabs.onUpdated'] = fn;
                },
            },
            onAttached: {
                addListener: (fn) => {
                    listeners['tabs.onAttached'] = fn;
                },
            },
            onDetached: { addListener: () => {} },
            onCreated: { addListener: () => {} },
            onRemoved: { addListener: () => {} },
            onMoved: { addListener: () => {} },
            onActivated: { addListener: () => {} },
            query: async () => [],
            get: async () => null,
            group: async () => 1,
            ungroup: async () => {},
            move: async () => {},
        },
        tabGroups: {
            query: async () => [],
            get: async () => ({ id: 1, title: 'test', color: 'blue' }),
            update: async () => {},
            move: async () => {},
            onUpdated: { addListener: () => {} },
            onMoved: { addListener: () => {} },
            onCreated: { addListener: () => {} },
            onRemoved: { addListener: () => {} },
        },
        windows: {
            getAll: async () => [{ id: 1, type: 'normal', tabs: [] }],
            getCurrent: async () => ({ id: 1, type: 'normal' }),
            getLastFocused: async () => ({ id: 1, type: 'normal' }),
            onRemoved: { addListener: () => {} },
            onCreated: { addListener: () => {} },
            onFocusChanged: { addListener: () => {} },
        },
        alarms: {
            create: () => {},
            onAlarm: { addListener: () => {} },
        },
        sidePanel: {
            setOptions: async () => {},
            getOptions: async () => ({}),
        },
        contextMenus: {
            create: () => {},
            onClicked: { addListener: () => {} },
        },
        notifications: {
            create: () => {},
        },
        action: {
            onClicked: { addListener: () => {} },
        },
        bookmarks: {
            onCreated: { addListener: () => {} },
            onRemoved: { addListener: () => {} },
            onChanged: { addListener: () => {} },
            onMoved: { addListener: () => {} },
            onImportEnded: { addListener: () => {} },
        },
    };

    const mergedChrome = { ...defaultChrome, ...customChrome };
    const chromeProxy = createTargetProxy(mergedChrome);

    const context = {
        console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
        URL,
        Map,
        Set,
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 50)),
        clearTimeout,
        setInterval: () => 1,
        clearInterval: () => {},
        Date,
        AbortController,
        fetch: async () => ({ ok: false }),
        chrome: chromeProxy,
    };

    vm.createContext(context);
    vm.runInContext(readFileSync('src/core/background/state.js', 'utf8'), context);
    vm.runInContext(readFileSync('src/core/background/utils.js', 'utf8'), context);
    vm.runInContext(readFileSync('src/core/background/group-analyzer.js', 'utf8'), context);
    vm.runInContext(readFileSync('src/core/background/groupManager.js', 'utf8'), context);
    vm.runInContext(readFileSync('src/core/background/stateManager.js', 'utf8'), context);
    vm.runInContext(readFileSync('src/core/background/events.js', 'utf8'), context);

    return { context, listeners, storageData };
}

/**
 * A one-window browser whose grouping calls raise the tabs.onUpdated events Chrome
 * raises for them, delivered while the pass that caused them is still running.
 * `passes` holds the tabs each real pass started from.
 */
function createEchoingBrowser() {
    const tabs = [
        { id: 101, url: 'https://github.com/a', title: 'GH a' },
        { id: 102, url: 'https://github.com/b', title: 'GH b' },
        { id: 103, url: 'https://docs.google.com/1', title: 'Doc 1' },
        { id: 104, url: 'https://docs.google.com/2', title: 'Doc 2' },
    ].map((t, index) => ({ windowId: 1, index, pinned: false, groupId: -1, status: 'complete', ...t }));
    const groups = new Map();
    let nextGroupId = 900;
    const snapshot = () => tabs.map((t) => ({ ...t }));
    const findTab = (id) => tabs.find((t) => t.id === id);

    const browser = {
        passes: [],
        firedWhileGrouping: [],
        listeners: {},
        context: null,
        duringGroupCall: () => {},
        fire(tabId, changeInfo) {
            const tab = findTab(tabId);
            if (!tab) return;
            if (vm.runInContext('isGrouping', browser.context)) browser.firedWhileGrouping.push(changeInfo);
            browser.listeners['tabs.onUpdated'](tabId, changeInfo, { ...tab });
        },
        navigate(tabId, url) {
            findTab(tabId).url = url;
            browser.fire(tabId, { url, status: 'complete' });
        },
        async runPass() {
            await vm.runInContext('groupTabs()', browser.context);
            // Waits until no pass is running or scheduled for several ticks in a row, so a
            // queued pass (timers are capped at 50 ms here) gets to start and finish.
            for (let idle = 0; idle < 6; ) {
                await new Promise((resolve) => setTimeout(resolve, 50));
                const busy = vm.runInContext('isGrouping || groupTabsTimer !== null', browser.context);
                idle = busy ? 0 : idle + 1;
            }
        },
    };

    const { context } = createBackgroundVM({
        windows: {
            getAll: async (opts) => {
                if (!opts?.populate) return [{ id: 1, type: 'normal' }];
                const tabsAtStart = snapshot();
                browser.passes.push(tabsAtStart);
                return [{ id: 1, type: 'normal', tabs: tabsAtStart }];
            },
            get: async () => ({ id: 1, type: 'normal', tabs: snapshot() }),
        },
        tabs: {
            onUpdated: {
                addListener: (fn) => {
                    browser.listeners['tabs.onUpdated'] = fn;
                },
            },
            query: async (q = {}) =>
                snapshot().filter(
                    (t) =>
                        (q.windowId === undefined || t.windowId === q.windowId) &&
                        (q.groupId === undefined || t.groupId === q.groupId),
                ),
            get: async (id) => {
                const tab = findTab(id);
                if (!tab) throw new Error(`No tab with id: ${id}.`);
                return { ...tab };
            },
            group: async ({ groupId, tabIds }) => {
                const gid = groupId ?? nextGroupId++;
                if (!groups.has(gid)) {
                    groups.set(gid, { id: gid, windowId: 1, title: '', color: 'grey', collapsed: false });
                }
                for (const id of tabIds) {
                    findTab(id).groupId = gid;
                    browser.fire(id, { groupId: gid });
                }
                browser.duringGroupCall(tabIds);
                return gid;
            },
            ungroup: async (tabIds) => {
                for (const id of [].concat(tabIds)) {
                    const tab = findTab(id);
                    if (!tab) continue;
                    tab.groupId = -1;
                    browser.fire(id, { groupId: -1 });
                }
            },
            move: async () => {},
        },
        tabGroups: {
            query: async () =>
                [...groups.values()].filter((g) => tabs.some((t) => t.groupId === g.id)).map((g) => ({ ...g })),
            get: async (gid) => {
                if (!groups.has(gid)) throw new Error(`No group with id: ${gid}.`);
                return { ...groups.get(gid) };
            },
            update: async (gid, props) => {
                if (groups.has(gid)) Object.assign(groups.get(gid), props);
                return { ...groups.get(gid) };
            },
            move: async () => {},
        },
    });
    browser.context = context;
    vm.runInContext('isInitializing = false', context);
    return browser;
}

describe('Service Worker Startup and Grouping E2E Suite', () => {
    it('non-blocking SW startup: initializeExtensionStates resolves immediately without deadlock and isInitializing is false', async () => {
        const { context } = createBackgroundVM();

        const startTime = Date.now();
        await vm.runInContext('initializeExtensionStates()', context);
        const elapsed = Date.now() - startTime;

        assert.ok(elapsed < 1000, `Startup should not block or contain arbitrary delays (took ${elapsed}ms)`);
        const isInitializing = vm.runInContext('isInitializing', context);
        assert.equal(isInitializing, false, 'isInitializing must be false upon startup completion');
    });

    it('multi-window tab grouping pass: groups tabs strictly per window without cross-window leakage', async () => {
        const groupCalls = [];
        const updateCalls = [];

        const window1Tabs = [
            { id: 101, url: 'https://github.com/project1', windowId: 1, pinned: false, groupId: -1, title: 'GH 1' },
            { id: 102, url: 'https://github.com/project2', windowId: 1, pinned: false, groupId: -1, title: 'GH 2' },
        ];
        const window2Tabs = [
            { id: 201, url: 'https://docs.google.com/doc1', windowId: 2, pinned: false, groupId: -1, title: 'Doc 1' },
            { id: 202, url: 'https://docs.google.com/doc2', windowId: 2, pinned: false, groupId: -1, title: 'Doc 2' },
        ];

        let nextGroupId = 500;
        const groupMap = new Map();

        const customChrome = {
            windows: {
                getAll: async (opts) => {
                    if (opts?.populate) {
                        return [
                            { id: 1, type: 'normal', tabs: window1Tabs },
                            { id: 2, type: 'normal', tabs: window2Tabs },
                        ];
                    }
                    return [
                        { id: 1, type: 'normal' },
                        { id: 2, type: 'normal' },
                    ];
                },
            },
            tabs: {
                query: async (queryInfo) => {
                    const all = [...window1Tabs, ...window2Tabs];
                    if (queryInfo?.windowId) {
                        return all.filter((t) => t.windowId === queryInfo.windowId);
                    }
                    return all;
                },
                get: async (tabId) => {
                    const all = [...window1Tabs, ...window2Tabs];
                    return all.find((t) => t.id === tabId) || null;
                },
                group: async (options) => {
                    groupCalls.push(options);
                    const gid = nextGroupId++;
                    for (const tid of options.tabIds) {
                        const tab = [...window1Tabs, ...window2Tabs].find((t) => t.id === tid);
                        if (tab) tab.groupId = gid;
                    }
                    groupMap.set(gid, { id: gid, title: '', collapsed: false });
                    return gid;
                },
            },
            tabGroups: {
                query: async (q) => {
                    const groups = Array.from(groupMap.values());
                    if (q?.windowId) {
                        return groups.filter((g) => g.windowId === q.windowId);
                    }
                    return groups;
                },
                get: async (gid) => groupMap.get(gid) || { id: gid, title: '', color: 'blue' },
                update: async (gid, props) => {
                    updateCalls.push({ gid, props });
                    if (groupMap.has(gid)) {
                        Object.assign(groupMap.get(gid), props);
                    }
                    return groupMap.get(gid);
                },
            },
        };

        const { context } = createBackgroundVM(customChrome);
        vm.runInContext('isInitializing = false', context);
        await vm.runInContext('groupTabs()', context);

        assert.ok(groupCalls.length >= 2, 'Must execute grouping calls for both windows');

        for (const call of groupCalls) {
            const tabIds = call.tabIds;
            const belongsToWin1 = tabIds.every((id) => id === 101 || id === 102);
            const belongsToWin2 = tabIds.every((id) => id === 201 || id === 202);
            assert.ok(
                belongsToWin1 || belongsToWin2,
                `Group call with tabs [${tabIds.join(', ')}] must be strictly window-isolated`,
            );
        }
    });

    it('a navigation during a pass queues exactly one more pass, which sees the new URL', async () => {
        const browser = createEchoingBrowser();
        let navigated = false;
        browser.duringGroupCall = () => {
            if (navigated) return;
            navigated = true;
            browser.navigate(103, 'https://news.ycombinator.com/item');
        };
        await browser.runPass();

        assert.equal(browser.firedWhileGrouping.length > 0, true, 'the navigation must land inside the pass');
        assert.equal(browser.passes.length, 2, 'the navigation must cause one queued pass, not more');
        assert.ok(
            browser.passes[1].some((t) => t.id === 103 && t.url === 'https://news.ycombinator.com/item'),
            'the queued pass must work from the navigated URL',
        );
    });

    it("the pass's own groupId echoes and title, favicon or sound changes do not queue another pass", async () => {
        const browser = createEchoingBrowser();
        browser.duringGroupCall = (tabIds) => {
            for (const id of tabIds) {
                browser.fire(id, { title: `(${Math.random()}) inbox` });
                browser.fire(id, { favIconUrl: 'https://github.com/favicon.ico' });
                browser.fire(id, { audible: true });
            }
        };
        await browser.runPass();

        assert.ok(browser.firedWhileGrouping.length > 0, 'the echoes must land inside the pass');
        assert.equal(browser.passes.length, 1, 'no event the pass caused itself may chain another pass');
        assert.equal(vm.runInContext('hasPendingRegroup', browser.context), false);
    });

    it('a direct groupTabs() call during a pass is queued instead of dropped', async () => {
        const browser = createEchoingBrowser();
        let asked = false;
        browser.duringGroupCall = () => {
            if (asked) return;
            asked = true;
            vm.runInContext('groupTabs()', browser.context);
        };
        await browser.runPass();

        assert.equal(browser.passes.length, 2, 'the request made during the pass must run once it finishes');
    });

    it('switching grouping off forgets the prefix state of the groups it dissolves', async () => {
        const browser = createEchoingBrowser();
        await browser.runPass();
        const identifiers = JSON.parse(
            vm.runInContext(
                `JSON.stringify([...groupIdentifierMap.values()].map((identifier) => {
                    if (!groupPrefixState.has(identifier)) groupPrefixState.set(identifier, { tabCount: 2 });
                    return identifier;
                }))`,
                browser.context,
            ),
        );
        assert.ok(identifiers.length > 0, 'the first pass must create groups');

        vm.runInContext('extensionSettings.clusteringEnabled = false', browser.context);
        await browser.runPass();

        const leftover = JSON.parse(
            vm.runInContext(
                `JSON.stringify(${JSON.stringify(identifiers)}.filter((id) => groupPrefixState.has(id)))`,
                browser.context,
            ),
        );
        assert.deepEqual(leftover, [], 'no prefix state may outlive the groups switched off');
    });

    it('cross-window tab move: tabs.onAttached triggers debounceGroupTabs()', async () => {
        const { context, listeners } = createBackgroundVM();
        assert.ok(typeof listeners['tabs.onAttached'] === 'function', 'tabs.onAttached listener must be registered');

        vm.runInContext('isInitializing = false', context);
        vm.runInContext('isGrouping = false', context);

        vm.runInContext(
            `
            debounceGroupTabs = (delay) => {
                globalThis.__debounceCalled = true;
            };
        `,
            context,
        );

        await listeners['tabs.onAttached'](401, { newWindowId: 2, newPosition: 1 });

        assert.equal(
            vm.runInContext('globalThis.__debounceCalled', context),
            true,
            'tabs.onAttached must trigger debounceGroupTabs()',
        );
    });
});
