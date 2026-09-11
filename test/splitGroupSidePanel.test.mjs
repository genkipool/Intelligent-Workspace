/**
 * Tests for Split Group presentation in the Originating Window Side Panel:
 * Ensures the split group appears in the side panel of the window that originated it,
 * while maintaining multi-window isolation for other unrelated windows.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    setCurrentWindowId,
    resetCurrentWindowId,
    isCurrentWindow,
    isCurrentOrSplitWindow,
    syncAssociatedSplitWindow,
    getAssociatedSplitWindowId,
    setAssociatedSplitWindowId,
} from '../src/ui/services/windowsService.js';

import { fetchData, fetchOriginatingSplitGroupData, deleteAllUngroupedTabs } from '../src/ui/services/groupsService.js';

describe('Split Group in Originating Window Side Panel', () => {
    beforeEach(() => {
        resetCurrentWindowId();
        delete global.window;
        delete global.chrome;
    });

    describe('windowsService: split window association and listener filtering', () => {
        it('associates splitWindowId when current window is originalWindowId', async () => {
            setCurrentWindowId(100);

            const splitScreenState = {
                isActive: true,
                originalWindowId: 100,
                splitWindowId: 200,
                splitGroupId: 99,
                splitTabs: { 1: 10 },
            };

            global.chrome = {
                storage: {
                    session: {
                        get: async (key) => {
                            if (key === 'splitScreenState') {
                                return { splitScreenState };
                            }
                            return {};
                        },
                    },
                },
            };

            const associatedId = await syncAssociatedSplitWindow(100);
            assert.equal(associatedId, 200);
            assert.equal(getAssociatedSplitWindowId(), 200);

            // isCurrentWindow only matches 100
            assert.equal(isCurrentWindow(100), true);
            assert.equal(isCurrentWindow(200), false);
            assert.equal(isCurrentWindow(300), false);

            // isCurrentOrSplitWindow matches both 100 and 200, but not 300
            assert.equal(isCurrentOrSplitWindow(100), true);
            assert.equal(isCurrentOrSplitWindow(200), true);
            assert.equal(isCurrentOrSplitWindow(300), false);
        });

        it('does not associate split window if current window is not the originator', async () => {
            setCurrentWindowId(300); // Window 300 is an unrelated window

            const splitScreenState = {
                isActive: true,
                originalWindowId: 100,
                splitWindowId: 200,
                splitGroupId: 99,
                splitTabs: { 1: 10 },
            };

            global.chrome = {
                storage: {
                    session: {
                        get: async () => ({ splitScreenState }),
                    },
                },
            };

            const associatedId = await syncAssociatedSplitWindow(300);
            assert.equal(associatedId, null);
            assert.equal(getAssociatedSplitWindowId(), null);

            assert.equal(isCurrentOrSplitWindow(300), true);
            assert.equal(isCurrentOrSplitWindow(100), false);
            assert.equal(isCurrentOrSplitWindow(200), false);
        });

        it('clears associated split window when split screen is inactive or reset', async () => {
            setCurrentWindowId(100);
            setAssociatedSplitWindowId(200);
            assert.equal(getAssociatedSplitWindowId(), 200);

            global.chrome = {
                storage: {
                    session: {
                        get: async () => ({ splitScreenState: { isActive: false } }),
                    },
                },
            };

            await syncAssociatedSplitWindow(100);
            assert.equal(getAssociatedSplitWindowId(), null);
            assert.equal(isCurrentOrSplitWindow(200), false);
        });
    });

    describe('fetchOriginatingSplitGroupData', () => {
        it('returns split group and its tabs when targetWindowId is the originator', async () => {
            const splitScreenState = {
                isActive: true,
                originalWindowId: 100,
                splitWindowId: 200,
                splitGroupId: 99,
                splitTabs: { 1: 10 },
            };

            const mockSplitGroup = { id: 99, title: 'Split', color: 'green', windowId: 200 };
            const mockSplitTabs = [{ id: 10, groupId: 99, windowId: 200, title: 'Split Tab 1' }];

            global.chrome = {
                storage: {
                    session: {
                        get: async (key) => {
                            if (key === 'splitScreenState') return { splitScreenState };
                            return {};
                        },
                    },
                },
                tabGroups: {
                    get: async (id) => (id === 99 ? mockSplitGroup : null),
                    query: async () => [mockSplitGroup],
                },
                tabs: {
                    query: async (opts) => {
                        if (opts?.groupId === 99 || opts?.windowId === 200) {
                            return mockSplitTabs;
                        }
                        return [];
                    },
                },
            };

            const data = await fetchOriginatingSplitGroupData(100);
            assert.notEqual(data, null);
            assert.equal(data.group.id, 99);
            assert.equal(data.group.title, 'Split');
            assert.equal(data.tabs.length, 1);
            assert.equal(data.tabs[0].id, 10);
        });

        it('returns null when targetWindowId is the split window itself to prevent duplicate cards', async () => {
            const splitScreenState = {
                isActive: true,
                originalWindowId: 100,
                splitWindowId: 200,
                splitGroupId: 99,
                splitTabs: { 1: 10 },
            };

            global.chrome = {
                storage: {
                    session: {
                        get: async () => ({ splitScreenState }),
                    },
                },
            };

            const data = await fetchOriginatingSplitGroupData(200);
            assert.equal(data, null);
        });

        it('returns null when targetWindowId is an unrelated third window', async () => {
            const splitScreenState = {
                isActive: true,
                originalWindowId: 100,
                splitWindowId: 200,
                splitGroupId: 99,
                splitTabs: { 1: 10 },
            };

            global.chrome = {
                storage: {
                    session: {
                        get: async () => ({ splitScreenState }),
                    },
                },
            };

            const data = await fetchOriginatingSplitGroupData(300);
            assert.equal(data, null);
        });
    });

    describe('fetchData: split group integration into originating window side panel', () => {
        it('includes the split group in the originating window alongside native groups and ungrouped tabs', async () => {
            const mockTabGroups = [
                { id: 10, title: 'Win1 Group A', color: 'blue', windowId: 100 },
                { id: 99, title: 'Split', color: 'green', windowId: 200 },
                { id: 20, title: 'Win2 Normal Group', color: 'red', windowId: 200 },
            ];

            const mockTabs = [
                { id: 1, groupId: 10, windowId: 100, url: 'https://example.com/1', index: 0 },
                { id: 2, groupId: -1, windowId: 100, url: 'https://example.com/ungrouped1', index: 1 },
                { id: 10, groupId: 99, windowId: 200, url: 'https://example.com/split1', index: 0 },
                { id: 21, groupId: 20, windowId: 200, url: 'https://example.com/normalWin2', index: 1 },
                { id: 22, groupId: -1, windowId: 200, url: 'https://example.com/ungroupedWin2', index: 2 },
            ];

            const splitScreenState = {
                isActive: true,
                originalWindowId: 100,
                splitWindowId: 200,
                splitGroupId: 99,
                splitTabs: { 1: 10 },
            };

            global.chrome = {
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    get: async (id) => mockTabGroups.find((g) => g.id === id) || null,
                    query: async (opts) => {
                        if (opts?.windowId) {
                            return mockTabGroups.filter((g) => g.windowId === opts.windowId);
                        }
                        return mockTabGroups;
                    },
                },
                tabs: {
                    query: async (opts) => {
                        return mockTabs.filter((t) => {
                            if (opts?.windowId && t.windowId !== opts.windowId) return false;
                            if (opts?.groupId !== undefined && t.groupId !== opts.groupId) return false;
                            return true;
                        });
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
                    session: {
                        get: async (key) => {
                            if (key === 'splitScreenState') return { splitScreenState };
                            return {};
                        },
                    },
                },
                i18n: {
                    getMessage: (key) => (key === 'ungroupedTabsTitle' ? 'Pestañas sueltas' : key),
                },
            };

            // Window 100 (Originator) side panel fetch:
            const resultWin100 = await fetchData(100);

            // Should have Group 10, Group 99 (Split), and -100 (Ungrouped)
            const groupIds100 = resultWin100.map((item) => item.group.id);
            assert.equal(groupIds100.includes(10), true, 'Group 10 must appear in Window 100');
            assert.equal(groupIds100.includes(99), true, 'Split group 99 must appear in originating Window 100');
            assert.equal(groupIds100.includes(-100), true, 'Ungrouped virtual group must appear in Window 100');

            // Win2 Normal Group (Group 20) MUST NOT appear in Window 100!
            assert.equal(groupIds100.includes(20), false, 'Non-split group 20 from Win2 must not leak into Window 100');

            // Window 200 ungrouped tab (tab 22) MUST NOT appear in Window 100!
            const ungroupedInWin100 = resultWin100.find((item) => item.group.id === -100);
            assert.equal(
                ungroupedInWin100.tabs.some((t) => t.id === 22),
                false,
                'Win2 ungrouped tab 22 must not leak into Window 100',
            );
            assert.equal(
                ungroupedInWin100.tabs.some((t) => t.id === 2),
                true,
                'Win1 ungrouped tab 2 must be present',
            );

            // Split group in Window 100 has its tabs
            const splitGroupInWin100 = resultWin100.find((item) => item.group.id === 99);
            assert.equal(splitGroupInWin100.tabs.length, 1);
            assert.equal(splitGroupInWin100.tabs[0].id, 10);

            // Window 200 (Split window itself) side panel fetch:
            const resultWin200 = await fetchData(200);
            const groupIds200 = resultWin200.map((item) => item.group.id);
            assert.equal(groupIds200.includes(99), true, 'Split group 99 appears in Window 200 natively');
            assert.equal(groupIds200.includes(20), true, 'Group 20 appears in Window 200');
            assert.equal(
                groupIds200.filter((id) => id === 99).length,
                1,
                'Split group 99 must appear only once (no duplicate cards)',
            );
            assert.equal(groupIds200.includes(10), false, 'Group 10 from Window 100 must not leak into Window 200');
        });
    });

    describe('deleteAllUngroupedTabs with active split screen', () => {
        it('closes only ungrouped tabs of targetWindowId and does not touch split tabs', async () => {
            const tabsInChrome = [
                { id: 1, groupId: -1, windowId: 100, url: 'https://a.com' },
                { id: 10, groupId: 99, windowId: 200, url: 'https://split.com' },
                { id: 20, groupId: -1, windowId: 200, url: 'https://c.com' },
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
            assert.deepEqual(removedIds, [1]);
            assert.equal(removedIds.includes(10), false, 'Must not touch split tab 10');
            assert.equal(removedIds.includes(20), false, 'Must not touch window 200 ungrouped tab 20');
        });
    });
});
