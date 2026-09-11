/**
 * Tests for Window Group Isolation in Side Panel:
 * Ensures groups and ungrouped tabs displayed in the side panel are strictly
 * scoped to their owning window, with no cross-window group leakage.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    getCurrentWindowId,
    setCurrentWindowId,
    resetCurrentWindowId,
    isCurrentWindow,
    getOpenWindowIds,
    syncOpenWindows,
} from '../src/ui/services/windowsService.js';

import { withBackups } from '../src/ui/stores/groupStore.js';
import {
    fetchData,
    getValidStandardTabs,
    deleteAllUngroupedTabs,
    removeDuplicateTabs,
    deleteOtherGroups,
    getOtherGroupsInWindow,
} from '../src/ui/services/groupsService.js';

describe('Window Group Isolation', () => {
    beforeEach(() => {
        resetCurrentWindowId();
        delete global.window;
        delete global.chrome;
    });

    describe('windowsService: window ID resolution and caching', () => {
        it('resolves windowId from URL search parameters when present', async () => {
            global.window = {
                location: { search: '?context=sidepanel&windowId=555' },
            };

            const winId = await getCurrentWindowId();
            assert.equal(winId, 555);
            assert.equal(isCurrentWindow(555), true);
            assert.equal(isCurrentWindow(999), false);
        });

        it('resolves windowId from chrome.windows.getCurrent() for normal windows', async () => {
            global.window = { location: { search: '' } };
            global.chrome = {
                windows: {
                    getCurrent: async () => ({ id: 101, type: 'normal' }),
                },
            };

            const winId = await getCurrentWindowId();
            assert.equal(winId, 101);
            assert.equal(isCurrentWindow(101), true);
            assert.equal(isCurrentWindow(202), false);
        });

        it('falls back to getLastFocused normal window if getCurrent() is a popup', async () => {
            global.window = { location: { search: '' } };
            global.chrome = {
                windows: {
                    getCurrent: async () => ({ id: 999, type: 'popup' }),
                    getLastFocused: async (opts) => {
                        assert.deepEqual(opts, { windowTypes: ['normal'] });
                        return { id: 202, type: 'normal' };
                    },
                },
            };

            const winId = await getCurrentWindowId();
            assert.equal(winId, 202);
            assert.equal(isCurrentWindow(202), true);
        });

        it('caches resolved windowId and allows manual override/reset', async () => {
            setCurrentWindowId(777);
            const winId = await getCurrentWindowId();
            assert.equal(winId, 777);

            resetCurrentWindowId();
            global.window = { location: { search: '' } };
            global.chrome = {
                windows: {
                    getCurrent: async () => ({ id: 888, type: 'normal' }),
                },
            };
            const nextWinId = await getCurrentWindowId();
            assert.equal(nextWinId, 888);
        });

        it('returns true from isCurrentWindow when targetWindowId is null or undefined (permissive for legacy callers)', () => {
            setCurrentWindowId(100);
            assert.equal(isCurrentWindow(null), true);
            assert.equal(isCurrentWindow(undefined), true);
        });

        it('getOpenWindowIds and syncOpenWindows collect all normal window IDs', async () => {
            global.chrome = {
                windows: {
                    getAll: async (opts) => {
                        assert.deepEqual(opts, { windowTypes: ['normal'] });
                        return [{ id: 10 }, { id: 20 }, { id: 30 }];
                    },
                },
            };

            const openSet = await getOpenWindowIds();
            assert.equal(openSet.size, 3);
            assert.equal(openSet.has(10), true);
            assert.equal(openSet.has(20), true);
            assert.equal(openSet.has(30), true);

            const synced = await syncOpenWindows();
            assert.equal(synced.size, 3);
        });
    });

    describe('getValidStandardTabs: window-level scoping', () => {
        it('returns only tabs belonging to the specified targetWindowId', async () => {
            global.chrome = {
                windows: {
                    get: async (winId, opts) => {
                        assert.equal(opts?.populate, true);
                        if (winId === 101) {
                            return {
                                id: 101,
                                type: 'normal',
                                alwaysOnTop: false,
                                tabs: [
                                    { id: 1, windowId: 101, title: 'Tab 1' },
                                    { id: 2, windowId: 101, title: 'Tab 2' },
                                ],
                            };
                        }
                        if (winId === 202) {
                            return {
                                id: 202,
                                type: 'normal',
                                alwaysOnTop: false,
                                tabs: [{ id: 3, windowId: 202, title: 'Tab 3' }],
                            };
                        }
                        throw new Error('Window not found');
                    },
                },
            };

            const tabs101 = await getValidStandardTabs(101);
            assert.equal(tabs101.length, 2);
            assert.deepEqual(
                tabs101.map((t) => t.id),
                [1, 2],
            );

            const tabs202 = await getValidStandardTabs(202);
            assert.equal(tabs202.length, 1);
            assert.deepEqual(
                tabs202.map((t) => t.id),
                [3],
            );
        });

        it('returns tabs from all normal windows when targetWindowId is omitted', async () => {
            global.chrome = {
                windows: {
                    getAll: async (opts) => {
                        assert.equal(opts?.populate, true);
                        return [
                            {
                                id: 101,
                                type: 'normal',
                                alwaysOnTop: false,
                                tabs: [{ id: 1, windowId: 101 }],
                            },
                            {
                                id: 202,
                                type: 'normal',
                                alwaysOnTop: false,
                                tabs: [{ id: 2, windowId: 202 }],
                            },
                            {
                                id: 303,
                                type: 'popup', // non-normal, should be excluded
                                alwaysOnTop: false,
                                tabs: [{ id: 3, windowId: 303 }],
                            },
                        ];
                    },
                },
            };

            const allTabs = await getValidStandardTabs();
            assert.equal(allTabs.length, 2);
            assert.deepEqual(
                allTabs.map((t) => t.id),
                [1, 2],
            );
        });
    });

    describe('fetchData: multi-window group separation', () => {
        it('isolates groups and ungrouped tabs strictly to targetWindowId', async () => {
            const mockTabGroups = [
                { id: 10, title: 'Win1 Group A', color: 'blue', windowId: 100 },
                { id: 11, title: 'Win1 Group B', color: 'green', windowId: 100 },
                { id: 20, title: 'Win2 Group C', color: 'red', windowId: 200 },
                { id: 21, title: 'Win2 Group D', color: 'yellow', windowId: 200 },
            ];

            const mockTabs = [
                { id: 1, groupId: 10, windowId: 100, url: 'https://example.com/1', index: 0 },
                { id: 2, groupId: 11, windowId: 100, url: 'https://example.com/2', index: 1 },
                { id: 3, groupId: -1, windowId: 100, url: 'https://example.com/ungrouped1', index: 2 },
                { id: 4, groupId: 20, windowId: 200, url: 'https://example.org/3', index: 0 },
                { id: 5, groupId: 21, windowId: 200, url: 'https://example.org/4', index: 1 },
                { id: 6, groupId: -1, windowId: 200, url: 'https://example.org/ungrouped2', index: 2 },
            ];

            global.chrome = {
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    query: async (opts) => {
                        if (opts?.windowId) {
                            return mockTabGroups.filter((g) => g.windowId === opts.windowId);
                        }
                        return mockTabGroups;
                    },
                },
                tabs: {
                    query: async (opts) => {
                        if (opts?.windowId) {
                            return mockTabs.filter((t) => t.windowId === opts.windowId);
                        }
                        return mockTabs;
                    },
                },
                windows: {
                    get: async (winId) => {
                        const tabs = mockTabs.filter((t) => t.windowId === winId);
                        return { id: winId, type: 'normal', alwaysOnTop: false, tabs };
                    },
                    getAll: async () => [
                        {
                            id: 100,
                            type: 'normal',
                            alwaysOnTop: false,
                            tabs: mockTabs.filter((t) => t.windowId === 100),
                        },
                        {
                            id: 200,
                            type: 'normal',
                            alwaysOnTop: false,
                            tabs: mockTabs.filter((t) => t.windowId === 200),
                        },
                    ],
                },
                storage: {
                    sync: { get: async () => ({}) },
                    local: { get: async () => ({}) },
                },
                i18n: {
                    getMessage: (key) => (key === 'ungroupedTabsTitle' ? 'Pestañas sueltas' : key),
                },
            };

            // Fetch for Window 100
            const resultWin100 = await fetchData(100);
            assert.equal(resultWin100.length, 3); // Group 10, Group 11, and Virtual Ungrouped Group (-100)
            const groupIds100 = resultWin100.map((item) => item.group.id);
            assert.deepEqual(groupIds100, [10, 11, -100]);

            // Ensure no groups or tabs from Window 200 leaked into Window 100
            for (const item of resultWin100) {
                if (item.group.id !== -100) {
                    assert.equal(item.group.windowId, 100);
                }
                for (const t of item.tabs) {
                    assert.equal(t.windowId, 100);
                }
            }

            // Fetch for Window 200
            const resultWin200 = await fetchData(200);
            assert.equal(resultWin200.length, 3); // Group 20, Group 21, and Virtual Ungrouped Group (-100)
            const groupIds200 = resultWin200.map((item) => item.group.id);
            assert.deepEqual(groupIds200, [20, 21, -100]);

            // Ensure no groups or tabs from Window 100 leaked into Window 200
            for (const item of resultWin200) {
                if (item.group.id !== -100) {
                    assert.equal(item.group.windowId, 200);
                }
                for (const t of item.tabs) {
                    assert.equal(t.windowId, 200);
                }
            }
        });
    });

    describe('withBackups: window-aware backup presentation', () => {
        it('excludes backups of other active windows while preserving current window backups', () => {
            const liveGroupsWin1 = [
                {
                    group: { id: 1, title: 'Live G1', windowId: 100 },
                    tabs: [{ id: 10, url: 'https://a.com' }],
                },
            ];

            const backups = {
                b1: {
                    group: { id: 101, title: 'Backup Win1', windowId: 100 },
                    tabs: [{ url: 'https://b1.com' }],
                },
                b2: {
                    group: { id: 201, title: 'Backup Win2', windowId: 200 },
                    tabs: [{ url: 'https://b2.com' }],
                },
            };

            const openWindows = new Set([100, 200]);

            // For Window 100 (both Window 100 and 200 open):
            // Window 200's backup must NOT appear in Window 100's panel
            const mergedWin100 = withBackups(liveGroupsWin1, backups, 100, openWindows);
            const titles100 = mergedWin100.map((g) => g.group.title);
            assert.equal(titles100.includes('Live G1'), true);
            assert.equal(titles100.includes('Backup Win1'), true);
            assert.equal(titles100.includes('Backup Win2'), false);

            // If Window 200 was closed (only Window 100 open):
            // The orphaned backup from Window 200 is made available in Window 100 so it can be restored
            const openWindowsOnly100 = new Set([100]);
            const mergedAfterClose = withBackups(liveGroupsWin1, backups, 100, openWindowsOnly100);
            const titlesAfterClose = mergedAfterClose.map((g) => g.group.title);
            assert.equal(titlesAfterClose.includes('Live G1'), true);
            assert.equal(titlesAfterClose.includes('Backup Win1'), true);
            assert.equal(titlesAfterClose.includes('Backup Win2'), true);
        });
    });

    describe('deleteAllUngroupedTabs: window-scoped removal', () => {
        it('closes only ungrouped tabs belonging to targetWindowId', async () => {
            const tabsInChrome = [
                { id: 1, groupId: -1, windowId: 100, url: 'https://a.com' },
                { id: 2, groupId: -1, windowId: 100, url: 'https://b.com' },
                { id: 3, groupId: -1, windowId: 200, url: 'https://c.com' },
            ];

            const removedIds = [];
            global.chrome = {
                tabGroups: { TAB_GROUP_ID_NONE: -1 },
                tabs: {
                    query: async (opts) => {
                        return tabsInChrome.filter((t) => {
                            if (opts.groupId !== undefined && t.groupId !== opts.groupId) return false;
                            if (opts.windowId !== undefined && t.windowId !== opts.windowId) return false;
                            return true;
                        });
                    },
                    remove: async (ids) => {
                        removedIds.push(...ids);
                    },
                },
            };

            await deleteAllUngroupedTabs(100);
            assert.deepEqual(removedIds, [1, 2]);
            assert.equal(removedIds.includes(3), false);
        });
    });

    describe('removeDuplicateTabs: window-scoped removal', () => {
        it('closes only duplicate tabs belonging to targetWindowId without touching duplicates in other windows', async () => {
            const tabsInChrome = [
                // Window 100: duplicates of https://dup.com and unique https://a.com
                { id: 10, windowId: 100, groupId: -1, url: 'https://dup.com', active: false },
                { id: 11, windowId: 100, groupId: -1, url: 'https://dup.com', active: true },
                { id: 12, windowId: 100, groupId: -1, url: 'https://a.com', active: false },
                // Window 200: also has duplicates of https://dup.com and https://b.com
                { id: 20, windowId: 200, groupId: -1, url: 'https://dup.com', active: false },
                { id: 21, windowId: 200, groupId: -1, url: 'https://dup.com', active: false },
                { id: 22, windowId: 200, groupId: -1, url: 'https://b.com', active: false },
            ];

            const removedIds = [];
            global.chrome = {
                storage: {
                    session: {
                        get: async () => ({ groupInfoMap: {} }),
                    },
                },
                tabs: {
                    query: async (opts) => {
                        return tabsInChrome.filter((t) => {
                            if (opts.windowId !== undefined && t.windowId !== opts.windowId) return false;
                            return true;
                        });
                    },
                    remove: async (ids) => {
                        removedIds.push(...ids);
                    },
                },
            };

            const result = await removeDuplicateTabs(100);
            // Window 100 has 2 tabs with https://dup.com (ids: 10, 11).
            // Tab 11 is active, so tab 10 is the duplicate to close.
            assert.equal(result.success, true);
            assert.equal(result.count, 1);
            assert.deepEqual(removedIds, [10]);

            // Window 200 tabs (20, 21, 22) must be completely untouched!
            assert.equal(removedIds.includes(20), false);
            assert.equal(removedIds.includes(21), false);
            assert.equal(removedIds.includes(22), false);
        });
    });

    describe('deleteOtherGroups: window-scoped removal', () => {
        it('identifies and closes only other groups belonging to targetWindowId without touching other windows', async () => {
            const groupsInChrome = [
                // Window 100 groups: Group 1 (has active tab), Group 2 (inactive)
                { id: 1, windowId: 100, title: 'Work 1' },
                { id: 2, windowId: 100, title: 'Work 2' },
                // Window 200 groups: Group 3, Group 4
                { id: 3, windowId: 200, title: 'Personal 1' },
                { id: 4, windowId: 200, title: 'Personal 2' },
            ];

            const tabsInChrome = [
                // Window 100 tabs
                { id: 101, windowId: 100, groupId: 1, active: true },
                { id: 102, windowId: 100, groupId: 1, active: false },
                { id: 103, windowId: 100, groupId: 2, active: false },
                { id: 104, windowId: 100, groupId: 2, active: false },
                // Window 200 tabs
                { id: 201, windowId: 200, groupId: 3, active: true },
                { id: 202, windowId: 200, groupId: 4, active: false },
            ];

            const removedTabIds = [];
            global.chrome = {
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    query: async (opts) => {
                        return groupsInChrome.filter((g) => {
                            if (opts.windowId !== undefined && g.windowId !== opts.windowId) return false;
                            return true;
                        });
                    },
                },
                tabs: {
                    query: async (opts) => {
                        return tabsInChrome.filter((t) => {
                            if (opts.windowId !== undefined && t.windowId !== opts.windowId) return false;
                            if (opts.groupId !== undefined && t.groupId !== opts.groupId) return false;
                            if (opts.active !== undefined && t.active !== opts.active) return false;
                            return true;
                        });
                    },
                    remove: async (ids) => {
                        removedTabIds.push(...ids);
                    },
                },
            };

            // Test getOtherGroupsInWindow for Window 100
            const preview = await getOtherGroupsInWindow(100);
            assert.equal(preview.targetWindowId, 100);
            assert.equal(preview.keepId, 1);
            assert.equal(preview.count, 1);
            assert.deepEqual(
                preview.otherGroups.map((g) => g.id),
                [2],
            );

            // Execute deleteOtherGroups for Window 100
            const result = await deleteOtherGroups(100);
            assert.equal(result.success, true);
            assert.equal(result.count, 1);
            assert.deepEqual(result.closedGroups, [2]);
            assert.equal(result.closedTabs, 2);

            // Verify only tabs 103 and 104 (belonging to Group 2 in Window 100) were removed
            assert.deepEqual(removedTabIds, [103, 104]);

            // Window 100 active group tabs (101, 102) must NOT be removed
            assert.equal(removedTabIds.includes(101), false);
            assert.equal(removedTabIds.includes(102), false);

            // Window 200 tabs (201, 202) must NOT be removed
            assert.equal(removedTabIds.includes(201), false);
            assert.equal(removedTabIds.includes(202), false);
        });
    });
});
