/**
 * Unit Tests for Backup and Restore Window Isolation:
 *
 * 1. isBackupForWindow:
 *    - Validates window scoping rules for displaying and restoring backups.
 *    - Protects backups belonging to other active windows.
 *    - Permits restoration of orphaned backups from closed windows or legacy backups without windowId.
 *    - Permits restoration of backups linked to live groups in the target window.
 *
 * 2. handleBackupAllGroups:
 *    - Defensively handles invocation with DOM click events (MouseEvent/PointerEvent object)
 *      without throwing "TypeError: Invalid type: expected integer, found object".
 *    - Backs up only groups belonging to targetWindowId and closes only their tabs.
 *    - Groups in other open windows remain completely untouched.
 *    - Stored backup objects record windowId and group.windowId.
 *
 * 3. handleRestoreAllGroups:
 *    - Defensively handles invocation with DOM click events.
 *    - Restores ONLY backups belonging to targetWindowId.
 *    - Backups belonging to another active window remain in storage and are not restored into the current window.
 *    - Orphaned backups from closed windows are allowed to be restored.
 *    - Tabs and groups are created specifically inside targetWindowId.
 *
 * 4. handleRestoreSingleTab:
 *    - Restores single tab inside targetWindowId.
 *
 * 5. initGroupsEvents:
 *    - Event listener callbacks wrap handler invocations in arrow functions.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    handleBackupAllGroups,
    handleRestoreAllGroups,
    handleRestoreSingleTab,
    initGroupsEvents,
} from '../src/ui/services/groupsService.js';
import { resetCurrentWindowId, setCurrentWindowId, isBackupForWindow } from '../src/ui/services/windowsService.js';
import { backedUpGroupData } from '../src/ui/stores/appStore.svelte.js';

let mockDbData = new Map();

describe('Backup and Restore Window Isolation', () => {
    beforeEach(() => {
        resetCurrentWindowId();
        backedUpGroupData.set({});
        mockDbData = new Map();

        global.fetch = async () => ({
            ok: true,
            json: async () => ({}),
        });

        global.localStorage = {
            getItem: () => 'es',
            setItem: () => {},
            removeItem: () => {},
        };

        const mockNode = () => ({
            appendChild: () => {},
            removeChild: () => {},
            setAttribute: () => {},
            classList: { add: () => {}, remove: () => {} },
            style: { setProperty: () => {} },
            addEventListener: () => {},
            removeEventListener: () => {},
            textContent: '',
        });

        global.document = {
            body: mockNode(),
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => mockNode(),
            addEventListener: () => {},
            removeEventListener: () => {},
            hasFocus: () => false,
        };

        global.chrome = {
            i18n: { getUILanguage: () => 'es', getMessage: (k) => k },
            runtime: {
                getURL: (p) => `chrome-extension://mock-id/${p}`,
                lastError: null,
                sendMessage: () => {},
            },
            storage: {
                local: { get: async () => ({}), set: async () => {} },
                sync: { get: async () => ({}), set: async () => {} },
                session: { get: async () => ({}), set: async () => {} },
            },
            tabGroups: {
                TAB_GROUP_ID_NONE: -1,
                query: async () => [],
                update: async (id, props) => ({ id, ...props }),
            },
            tabs: {
                query: async () => [],
                create: async (p) => ({ id: 1, ...p }),
                group: async () => 1,
                remove: async () => {},
                onUpdated: { addListener: () => {} },
            },
            windows: {
                getCurrent: async () => ({ id: 100, type: 'normal' }),
                getAll: async () => [{ id: 100, type: 'normal' }],
            },
        };

        global.indexedDB = {
            open: () => {
                const req = {
                    onsuccess: null,
                    onerror: null,
                    result: {
                        transaction: () => ({
                            objectStore: () => ({
                                put: (item) => {
                                    mockDbData.set(item?.group?.id ?? item?.id, item);
                                    const r = { onsuccess: null };
                                    setTimeout(() => r.onsuccess?.(), 0);
                                    return r;
                                },
                                get: (key) => {
                                    const r = { onsuccess: null, result: mockDbData.get(key) };
                                    setTimeout(() => r.onsuccess?.({ target: r }), 0);
                                    return r;
                                },
                                delete: (id) => {
                                    mockDbData.delete(id);
                                    const r = { onsuccess: null };
                                    setTimeout(() => r.onsuccess?.(), 0);
                                    return r;
                                },
                                getAll: () => {
                                    const r = { onsuccess: null, result: [...mockDbData.values()] };
                                    setTimeout(() => r.onsuccess?.({ target: r }), 0);
                                    return r;
                                },
                                getAllKeys: () => {
                                    const r = { onsuccess: null, result: [...mockDbData.keys()] };
                                    setTimeout(() => r.onsuccess?.({ target: r }), 0);
                                    return r;
                                },
                            }),
                        }),
                    },
                };
                setTimeout(() => req.onsuccess?.({ target: req }), 0);
                return req;
            },
        };
    });

    describe('isBackupForWindow', () => {
        it('returns false for null or undefined backup', () => {
            assert.equal(isBackupForWindow(null, 100), false);
            assert.equal(isBackupForWindow(undefined, 100), false);
        });

        it('returns true when backup windowId matches targetWindowId', () => {
            const backup = { windowId: 100, group: { id: 1, windowId: 100 } };
            assert.equal(isBackupForWindow(backup, 100, new Set([100, 200])), true);
        });

        it('returns false when backup belongs to another active open window', () => {
            const backup = { windowId: 200, group: { id: 2, windowId: 200 } };
            const openWins = new Set([100, 200]);
            // Evaluated for window 100: backup belongs to window 200 which is still open
            assert.equal(isBackupForWindow(backup, 100, openWins), false);
        });

        it('returns true when backup belongs to a window that has been closed (orphaned backup)', () => {
            const backup = { windowId: 200, group: { id: 2, windowId: 200 } };
            const openWins = new Set([100]); // window 200 is closed
            // Should be available to window 100 to restore
            assert.equal(isBackupForWindow(backup, 100, openWins), true);
        });

        it('returns true when backup is linked to a live group in targetWindowId', () => {
            const backup = {
                windowId: 200,
                linkedGroupId: 99,
                group: { id: 2, windowId: 200 },
            };
            const openWins = new Set([100, 200]);
            const liveGroupsIn100 = new Set([99, 101]);
            assert.equal(isBackupForWindow(backup, 100, openWins, liveGroupsIn100), true);
        });

        it('returns true for legacy backups without windowId', () => {
            const backup = { group: { id: 5, title: 'Legacy' } };
            assert.equal(isBackupForWindow(backup, 100, new Set([100, 200])), true);
        });
    });

    describe('handleBackupAllGroups: DOM Event invocation and window isolation', () => {
        it('handles DOM click event object without throwing TypeError and queries tabs with integer windowId', async () => {
            setCurrentWindowId(100);

            let queriedTabOpts = null;
            let removedTabIds = [];

            global.chrome = {
                i18n: { getUILanguage: () => 'es', getMessage: (k) => k },
                runtime: { getURL: (p) => `chrome-extension://mock-id/${p}`, lastError: null },
                storage: {
                    local: { get: async () => ({}), set: async () => {} },
                    sync: { get: async () => ({}), set: async () => {} },
                    session: { get: async () => ({}), set: async () => {} },
                },
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    query: async ({ windowId }) => {
                        assert.equal(typeof windowId, 'number');
                        assert.equal(windowId, 100);
                        return [
                            { id: 10, title: 'Group 10 in Win 100', color: 'blue', windowId: 100 },
                            { id: 11, title: 'Group 11 in Win 100', color: 'red', windowId: 100 },
                        ];
                    },
                },
                tabs: {
                    query: async (opts) => {
                        queriedTabOpts = opts;
                        // active tab in group 10 (should be spared from backup)
                        if (opts.active) {
                            return [{ id: 1, groupId: 10, windowId: 100, active: true }];
                        }
                        return [
                            { id: 1, groupId: 10, windowId: 100, url: 'https://a.com', title: 'A' },
                            { id: 2, groupId: 11, windowId: 100, url: 'https://b.com', title: 'B' },
                            { id: 3, groupId: 11, windowId: 100, url: 'https://c.com', title: 'C' },
                        ];
                    },
                    remove: async (tabIds) => {
                        removedTabIds = tabIds;
                    },
                },
                windows: {
                    getCurrent: async () => ({ id: 100, type: 'normal' }),
                    getAll: async () => [{ id: 100, type: 'normal' }],
                },
            };

            // Simulate clicking backup-all-btn: browser passes MouseEvent/PointerEvent object
            const fakeEvent = {
                type: 'click',
                target: {},
                isTrusted: true,
                preventDefault: () => {},
                stopPropagation: () => {},
            };

            await handleBackupAllGroups(fakeEvent);

            // Verify tabs.query received integer windowId, NEVER the fakeEvent object
            assert.equal(typeof queriedTabOpts.windowId, 'number');
            assert.equal(queriedTabOpts.windowId, 100);

            // Active group was 10, so only group 11 tabs were removed (tabs 2 and 3)
            assert.deepEqual(removedTabIds, [2, 3]);

            // Stored backup records windowId: 100
            const backups = backedUpGroupData;
            let current = {};
            backups.subscribe((v) => {
                current = v;
            })();
            assert.ok(current[11]);
            assert.equal(current[11].windowId, 100);
            assert.equal(current[11].group.windowId, 100);
        });

        it('backs up only groups of targetWindowId and does not touch groups in other windows', async () => {
            let removedTabIds = [];

            global.chrome = {
                i18n: { getUILanguage: () => 'es', getMessage: (k) => k },
                runtime: { getURL: (p) => `chrome-extension://mock-id/${p}`, lastError: null },
                storage: {
                    local: { get: async () => ({}), set: async () => {} },
                    sync: { get: async () => ({}), set: async () => {} },
                    session: { get: async () => ({}), set: async () => {} },
                },
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    query: async (opts) => {
                        const allGroups = [
                            { id: 10, title: 'Win100 Group', color: 'blue', windowId: 100 },
                            { id: 20, title: 'Win200 Group', color: 'green', windowId: 200 },
                        ];
                        if (typeof opts?.windowId === 'number') {
                            return allGroups.filter((g) => g.windowId === opts.windowId);
                        }
                        return allGroups;
                    },
                },
                tabs: {
                    query: async (opts) => {
                        const allTabs = [
                            {
                                id: 1,
                                groupId: 10,
                                windowId: 100,
                                url: 'https://win100.com',
                                title: 'W100',
                                active: false,
                            },
                            {
                                id: 2,
                                groupId: 20,
                                windowId: 200,
                                url: 'https://win200.com',
                                title: 'W200',
                                active: false,
                            },
                        ];
                        if (opts.active) {
                            return [{ id: 99, groupId: -1, windowId: opts.windowId ?? 100, active: true }];
                        }
                        return allTabs.filter((t) => !opts.windowId || t.windowId === opts.windowId);
                    },
                    remove: async (tabIds) => {
                        removedTabIds.push(...tabIds);
                    },
                },
                windows: {
                    getCurrent: async () => ({ id: 100, type: 'normal' }),
                    getAll: async () => [
                        { id: 100, type: 'normal' },
                        { id: 200, type: 'normal' },
                    ],
                },
            };

            // Back up all groups in window 100
            await handleBackupAllGroups(100);

            // Only tab 1 in window 100 was removed, tab 2 in window 200 was NOT touched
            assert.deepEqual(removedTabIds, [1]);
        });
    });

    describe('handleRestoreAllGroups: window-scoped restoration', () => {
        it('restores only backups belonging to targetWindowId and ignores other open window backups', async () => {
            setCurrentWindowId(100);

            // Backups in storage: Group 10 belongs to Window 100, Group 20 belongs to Window 200
            const b10 = {
                windowId: 100,
                group: { id: 10, title: 'Group 10 (Win 100)', color: 'blue', windowId: 100 },
                tabs: [{ url: 'https://tab10.com', title: 'Tab 10' }],
            };
            const b20 = {
                windowId: 200,
                group: { id: 20, title: 'Group 20 (Win 200)', color: 'red', windowId: 200 },
                tabs: [{ url: 'https://tab20.com', title: 'Tab 20' }],
            };
            backedUpGroupData.set({ 10: b10, 20: b20 });
            mockDbData.set(10, b10);
            mockDbData.set(20, b20);

            const createdTabs = [];
            const groupedTabs = [];

            global.chrome = {
                i18n: { getUILanguage: () => 'es', getMessage: (k) => k },
                runtime: { getURL: (p) => `chrome-extension://mock-id/${p}`, lastError: null },
                storage: {
                    local: { get: async () => ({}), set: async () => {} },
                    sync: { get: async () => ({}), set: async () => {} },
                    session: { get: async () => ({}), set: async () => {} },
                },
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    query: async () => [],
                    update: async (groupId, updateProps) => ({ id: groupId, ...updateProps }),
                },
                tabs: {
                    query: async () => [],
                    create: async (createProps) => {
                        createdTabs.push(createProps);
                        return { id: createdTabs.length, ...createProps };
                    },
                    group: async (groupProps) => {
                        groupedTabs.push(groupProps);
                        return 777;
                    },
                },
                windows: {
                    getCurrent: async () => ({ id: 100, type: 'normal' }),
                    getAll: async () => [
                        { id: 100, type: 'normal' },
                        { id: 200, type: 'normal' },
                    ],
                },
            };

            // Call handleRestoreAllGroups for window 100 (simulating click or direct invocation)
            await handleRestoreAllGroups(100);

            // Only Group 10 tabs were created, inside window 100
            assert.equal(createdTabs.length, 1);
            assert.equal(createdTabs[0].url, 'https://tab10.com');
            assert.equal(createdTabs[0].windowId, 100);

            // Group 20 (Window 200) was NOT restored and remains in backedUpGroupData
            let remaining = {};
            backedUpGroupData.subscribe((v) => {
                remaining = v;
            })();
            assert.equal(Boolean(remaining[10]), false); // Group 10 was restored and deleted from backup
            assert.equal(Boolean(remaining[20]), true); // Group 20 remains safely backed up for Win 200
        });

        it('allows restoring orphaned backup if its original window was closed', async () => {
            setCurrentWindowId(100);

            // Backup 20 was created in window 200, but window 200 is now closed
            const orphanB20 = {
                windowId: 200,
                group: { id: 20, title: 'Group 20', color: 'red', windowId: 200 },
                tabs: [{ url: 'https://tab20.com', title: 'Tab 20' }],
            };
            backedUpGroupData.set({ 20: orphanB20 });
            mockDbData.set(20, orphanB20);

            const createdTabs = [];

            global.chrome = {
                i18n: { getUILanguage: () => 'es', getMessage: (k) => k },
                runtime: { getURL: (p) => `chrome-extension://mock-id/${p}`, lastError: null },
                storage: {
                    local: { get: async () => ({}), set: async () => {} },
                    sync: { get: async () => ({}), set: async () => {} },
                    session: { get: async () => ({}), set: async () => {} },
                },
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    query: async () => [],
                    update: async (id, props) => ({ id, ...props }),
                },
                tabs: {
                    query: async () => [],
                    create: async (createProps) => {
                        createdTabs.push(createProps);
                        return { id: 1, ...createProps };
                    },
                    group: async () => 888,
                },
                windows: {
                    getCurrent: async () => ({ id: 100, type: 'normal' }),
                    getAll: async () => [
                        { id: 100, type: 'normal' }, // only window 100 is open
                    ],
                },
            };

            await handleRestoreAllGroups(100);

            // Orphaned backup is adopted and restored into the active window 100
            assert.equal(createdTabs.length, 1);
            assert.equal(createdTabs[0].windowId, 100);
        });
    });

    describe('handleRestoreSingleTab: window-scoped creation', () => {
        it('creates restored tab specifically in targetWindowId', async () => {
            const b30 = {
                windowId: 100,
                group: { id: 30, title: 'Group 30', color: 'yellow', windowId: 100 },
                tabs: [{ url: 'https://single.com', title: 'Single Tab' }],
            };
            backedUpGroupData.set({ 30: b30 });
            mockDbData.set(30, b30);

            let createdProps = null;

            global.chrome = {
                i18n: { getUILanguage: () => 'es', getMessage: (k) => k },
                runtime: { getURL: (p) => `chrome-extension://mock-id/${p}`, lastError: null },
                storage: {
                    local: { get: async () => ({}), set: async () => {} },
                    sync: { get: async () => ({}), set: async () => {} },
                    session: { get: async () => ({}), set: async () => {} },
                },
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    update: async (id, props) => ({ id, ...props }),
                },
                tabs: {
                    create: async (props) => {
                        createdProps = props;
                        return { id: 55, ...props };
                    },
                    group: async () => 999,
                },
                windows: {
                    getCurrent: async () => ({ id: 100, type: 'normal' }),
                },
            };

            await handleRestoreSingleTab(30, { url: 'https://single.com', title: 'Single Tab' }, 100);

            assert.ok(createdProps);
            assert.equal(createdProps.url, 'https://single.com');
            assert.equal(createdProps.windowId, 100);
        });
    });

    describe('initGroupsEvents: callback wrapper verification', () => {
        it('registers click listeners with functions that do not pass Event object to handlers', () => {
            const listeners = {};
            const mockElement = (id) => ({
                id,
                addEventListener: (evt, handler) => {
                    listeners[id] = handler;
                },
            });

            global.document = {
                ...global.document,
                getElementById: (id) => {
                    if (['backup-all-btn', 'restore-all-btn', 'remove-duplicates-btn', 'regroup-btn'].includes(id)) {
                        return mockElement(id);
                    }
                    return null;
                },
                addEventListener: () => {},
            };

            initGroupsEvents();

            assert.equal(typeof listeners['backup-all-btn'], 'function');
            assert.equal(typeof listeners['restore-all-btn'], 'function');
            assert.equal(typeof listeners['remove-duplicates-btn'], 'function');

            // Verify they are anonymous wrappers (not directly the handler with length 1 expecting windowId)
            // An arrow function `() => handleBackupAllGroups()` has length 0
            assert.equal(listeners['backup-all-btn'].length, 0);
            assert.equal(listeners['restore-all-btn'].length, 0);
            assert.equal(listeners['remove-duplicates-btn'].length, 0);
        });
    });
});
