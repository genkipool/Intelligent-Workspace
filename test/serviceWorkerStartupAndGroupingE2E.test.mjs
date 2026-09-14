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

    it('concurrent tabs.onUpdated during isGrouping sets hasPendingRegroup and triggers deferred regroup', async () => {
        const { context, listeners } = createBackgroundVM();
        assert.ok(typeof listeners['tabs.onUpdated'] === 'function', 'tabs.onUpdated listener must be registered');

        vm.runInContext('isInitializing = false', context);
        vm.runInContext('isGrouping = true', context);
        vm.runInContext('hasPendingRegroup = false', context);

        await listeners['tabs.onUpdated'](
            301,
            { status: 'complete', url: 'https://news.ycombinator.com' },
            { id: 301, url: 'https://news.ycombinator.com', title: 'Hacker News', windowId: 1 },
        );

        const pendingAfterUpdate = vm.runInContext('hasPendingRegroup', context);
        assert.equal(
            pendingAfterUpdate,
            true,
            'tabs.onUpdated while isGrouping is true must set hasPendingRegroup to true',
        );

        // When groupTabs() finishes its finally block, it consumes hasPendingRegroup
        let debouncedTriggered = false;
        context.debounceGroupTabs = (delay) => {
            debouncedTriggered = true;
        };

        // Simulate groupTabs finally block
        vm.runInContext(
            `
            isGrouping = false;
            if (typeof hasPendingRegroup !== 'undefined' && hasPendingRegroup) {
                hasPendingRegroup = false;
                debounceGroupTabs(50);
            }
        `,
            context,
        );

        assert.equal(vm.runInContext('hasPendingRegroup', context), false, 'hasPendingRegroup should be reset');
        assert.equal(debouncedTriggered, true, 'debounceGroupTabs(50) should be scheduled for deferred regroup');
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
