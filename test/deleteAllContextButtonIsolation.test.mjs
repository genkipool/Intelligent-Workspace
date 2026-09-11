/**
 * Comprehensive Tests for delete-all-context-btn (Delete Other Groups):
 * Verifies that:
 * 1. The confirmation modal displays the exact count of groups in the current window to be closed.
 * 2. Only groups belonging to the current window are closed, sparing the active group.
 * 3. Groups in other windows remain completely untouched.
 * 4. Zero other groups triggers 'noOtherGroupsToClose' notification without opening a confirm modal.
 * 5. Both Spanish and English locales format the confirmation text correctly with placeholders.
 * 6. Background handler respects windowId and isolates group deletion.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { getOtherGroupsInWindow, handleDeleteOtherGroupsUI } from '../src/ui/services/groupsService.js';
import { resetCurrentWindowId, setCurrentWindowId } from '../src/ui/services/windowsService.js';
import { resolveMessage } from '../src/utils/i18n.js';
import { confirmRequest } from '../src/ui/stores/confirmStore.js';

describe('delete-all-context-btn: Window Isolation and Modal Group Count', () => {
    beforeEach(() => {
        resetCurrentWindowId();
        delete global.window;
        delete global.chrome;

        // Reset confirmRequest store
        confirmRequest.set(null);

        global.chrome = {
            i18n: { getUILanguage: () => 'es', getMessage: (k) => k },
            runtime: {
                getURL: (p) => `chrome-extension://mock-id/${p}`,
                sendMessage: (msg, cb) => {
                    if (cb) cb({ success: true });
                },
            },
            storage: {
                local: { get: async () => ({}) },
                session: { get: async () => ({ groupInfoMap: {} }) },
            },
            tabGroups: {
                TAB_GROUP_ID_NONE: -1,
                query: async () => [],
            },
            tabs: {
                query: async () => [],
                remove: async () => {},
            },
        };

        global.fetch = async () => ({
            ok: true,
            json: async () => ({}),
        });

        global.localStorage = {
            getItem: () => 'es',
            setItem: () => {},
        };

        global.document = {
            getElementById: () => ({
                classList: { add: () => {}, remove: () => {} },
                setAttribute: () => {},
                textContent: '',
            }),
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({
                classList: { add: () => {}, remove: () => {} },
                setAttribute: () => {},
                style: { setProperty: () => {} },
                appendChild: () => {},
                addEventListener: () => {},
            }),
            addEventListener: () => {},
            body: { appendChild: () => {} },
        };
    });

    describe('I18n locales: confirmation message with group counts', () => {
        const esMessages = JSON.parse(fs.readFileSync('_locales/es/messages.json', 'utf8'));
        const enMessages = JSON.parse(fs.readFileSync('_locales/en/messages.json', 'utf8'));

        it('resolves Spanish confirmation messages showing exact count and kept group name', () => {
            // Count = 1, Kept Group = "Trabajo"
            const singleMsg = resolveMessage(esMessages.confirmDeleteOtherGroupsSingle, ['1', 'Trabajo'], 'message');
            assert.equal(
                singleMsg,
                '¿Confirmas que quieres cerrar 1 grupo de esta ventana excepto el grupo "Trabajo"?',
            );

            // Count = 3, Kept Group = "Trabajo"
            const pluralMsg = resolveMessage(esMessages.confirmDeleteOtherGroups, ['3', 'Trabajo'], 'message');
            assert.equal(
                pluralMsg,
                '¿Confirmas que quieres cerrar 3 grupos de esta ventana excepto el grupo "Trabajo"?',
            );

            // No active group in window, Count = 2
            const allInWinMsg = resolveMessage(esMessages.confirmDeleteAllGroupsInWindow, ['2'], 'message');
            assert.equal(allInWinMsg, '¿Confirmas que quieres cerrar 2 grupos de esta ventana?');

            // No active group in window, Count = 1
            const allInWinSingle = resolveMessage(esMessages.confirmDeleteAllGroupsInWindowSingle, ['1'], 'message');
            assert.equal(allInWinSingle, '¿Confirmas que quieres cerrar 1 grupo de esta ventana?');

            // Empty state notification
            assert.equal(esMessages.noOtherGroupsToClose.message, 'No hay otros grupos que cerrar en esta ventana');
        });

        it('resolves English confirmation messages showing exact count and kept group name', () => {
            // Count = 1, Kept Group = "Work"
            const singleMsg = resolveMessage(enMessages.confirmDeleteOtherGroupsSingle, ['1', 'Work'], 'message');
            assert.equal(singleMsg, 'Are you sure you want to close 1 group in this window except the group "Work"?');

            // Count = 3, Kept Group = "Work"
            const pluralMsg = resolveMessage(enMessages.confirmDeleteOtherGroups, ['3', 'Work'], 'message');
            assert.equal(pluralMsg, 'Are you sure you want to close 3 groups in this window except the group "Work"?');

            // No active group in window, Count = 2
            const allInWinMsg = resolveMessage(enMessages.confirmDeleteAllGroupsInWindow, ['2'], 'message');
            assert.equal(allInWinMsg, 'Are you sure you want to close 2 groups in this window?');

            // Empty state notification
            assert.equal(enMessages.noOtherGroupsToClose.message, 'No other groups to close in this window');
        });
    });

    describe('getOtherGroupsInWindow: calculation and multi-window isolation', () => {
        it('calculates other groups strictly within targetWindowId and spares the active group', async () => {
            const groups = [
                { id: 10, windowId: 1, title: 'Group A' },
                { id: 11, windowId: 1, title: 'Group B' },
                { id: 12, windowId: 1, title: 'Group C' },
                // Window 2 groups
                { id: 20, windowId: 2, title: 'Group X' },
                { id: 21, windowId: 2, title: 'Group Y' },
            ];

            const tabs = [
                // Window 1: active tab in Group 10
                { id: 1001, windowId: 1, groupId: 10, active: true },
                { id: 1002, windowId: 1, groupId: 11, active: false },
                { id: 1003, windowId: 1, groupId: 12, active: false },
                // Window 2: active tab in Group 20
                { id: 2001, windowId: 2, groupId: 20, active: true },
                { id: 2002, windowId: 2, groupId: 21, active: false },
            ];

            global.chrome = {
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    query: async (opts) => {
                        return groups.filter((g) => opts.windowId === undefined || g.windowId === opts.windowId);
                    },
                },
                tabs: {
                    query: async (opts) => {
                        return tabs.filter((t) => {
                            if (opts.windowId !== undefined && t.windowId !== opts.windowId) return false;
                            if (opts.active !== undefined && t.active !== opts.active) return false;
                            return true;
                        });
                    },
                },
            };

            const result = await getOtherGroupsInWindow(1);
            assert.equal(result.targetWindowId, 1);
            assert.equal(result.keepId, 10);
            assert.equal(result.count, 2);
            assert.deepEqual(
                result.otherGroups.map((g) => g.id),
                [11, 12],
            );

            // None of Window 2\'s groups are returned
            assert.equal(
                result.otherGroups.some((g) => g.windowId === 2),
                false,
            );
        });

        it('includes all window groups if active tab is ungrouped (keepId = -1)', async () => {
            const groups = [
                { id: 10, windowId: 1, title: 'Group A' },
                { id: 11, windowId: 1, title: 'Group B' },
            ];
            const tabs = [
                { id: 1001, windowId: 1, groupId: -1, active: true }, // Ungrouped active tab
                { id: 1002, windowId: 1, groupId: 10, active: false },
                { id: 1003, windowId: 1, groupId: 11, active: false },
            ];

            global.chrome = {
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    query: async (opts) =>
                        groups.filter((g) => opts.windowId === undefined || g.windowId === opts.windowId),
                },
                tabs: {
                    query: async (opts) => {
                        return tabs.filter((t) => {
                            if (opts.windowId !== undefined && t.windowId !== opts.windowId) return false;
                            if (opts.active !== undefined && t.active !== opts.active) return false;
                            return true;
                        });
                    },
                },
            };

            const result = await getOtherGroupsInWindow(1);
            assert.equal(result.targetWindowId, 1);
            assert.equal(result.keepId, -1);
            assert.equal(result.count, 2);
            assert.deepEqual(
                result.otherGroups.map((g) => g.id),
                [10, 11],
            );
        });

        it('returns count 0 if the window has only the active group', async () => {
            const groups = [{ id: 10, windowId: 1, title: 'Only Group' }];
            const tabs = [{ id: 1001, windowId: 1, groupId: 10, active: true }];

            global.chrome = {
                tabGroups: {
                    TAB_GROUP_ID_NONE: -1,
                    query: async (opts) =>
                        groups.filter((g) => opts.windowId === undefined || g.windowId === opts.windowId),
                },
                tabs: {
                    query: async (opts) =>
                        tabs.filter((t) => opts.windowId === undefined || t.windowId === opts.windowId),
                },
            };

            const result = await getOtherGroupsInWindow(1);
            assert.equal(result.count, 0);
            assert.deepEqual(result.otherGroups, []);
        });
    });

    function setupMockChrome({ groups = [], tabs = [], onSendMessage = null, onRemove = null }) {
        global.chrome = {
            i18n: { getUILanguage: () => 'es', getMessage: (k) => (k === 'untitled' ? 'Sin título' : k) },
            runtime: {
                getURL: (p) => `chrome-extension://mock-id/${p}`,
                sendMessage: (msg, callback) => {
                    if (onSendMessage) {
                        onSendMessage(msg, callback);
                    } else if (callback) {
                        callback({ success: true, count: 0, closed: 0 });
                    }
                },
            },
            storage: {
                local: { get: async () => ({}) },
                session: { get: async () => ({ groupInfoMap: {} }) },
            },
            tabGroups: {
                TAB_GROUP_ID_NONE: -1,
                query: async (opts) => {
                    return groups.filter((g) => opts.windowId === undefined || g.windowId === opts.windowId);
                },
            },
            tabs: {
                query: async (opts) => {
                    return tabs.filter((t) => {
                        if (opts.windowId !== undefined && t.windowId !== opts.windowId) return false;
                        if (opts.groupId !== undefined && t.groupId !== opts.groupId) return false;
                        if (opts.active !== undefined && t.active !== opts.active) return false;
                        return true;
                    });
                },
                remove: async (ids) => {
                    if (onRemove) onRemove(ids);
                },
            },
        };
    }

    describe('handleDeleteOtherGroupsUI: modal confirmation and execution flow', () => {
        it('shows notification without opening confirm modal when there are 0 other groups', async () => {
            setCurrentWindowId(10);
            const groups = [{ id: 1, windowId: 10, title: 'Group 1' }];
            const tabs = [{ id: 101, windowId: 10, groupId: 1, active: true }];

            let confirmModalCalled = false;
            let backgroundMessageSent = false;

            setupMockChrome({
                groups,
                tabs,
                onSendMessage: () => {
                    backgroundMessageSent = true;
                },
            });

            // Subscribe to confirmRequest store to verify modal is not opened
            confirmRequest.subscribe((req) => {
                if (req) confirmModalCalled = true;
            });

            const res = await handleDeleteOtherGroupsUI(10);
            assert.equal(res.success, true);
            assert.equal(res.count, 0);
            assert.equal(res.closed, false);
            assert.equal(confirmModalCalled, false);
            assert.equal(backgroundMessageSent, false);
        });

        it('opens confirm modal displaying the group count and sends delete message on confirmation', async () => {
            setCurrentWindowId(10);
            const groups = [
                { id: 1, windowId: 10, title: 'Group 1' },
                { id: 2, windowId: 10, title: 'Group 2' },
                { id: 3, windowId: 10, title: 'Group 3' },
            ];
            const tabs = [
                { id: 101, windowId: 10, groupId: 1, active: true },
                { id: 102, windowId: 10, groupId: 2, active: false },
                { id: 103, windowId: 10, groupId: 3, active: false },
            ];

            let sentMessage = null;
            let observedModalRequest = null;

            setupMockChrome({
                groups,
                tabs,
                onSendMessage: (msg, callback) => {
                    sentMessage = msg;
                    callback({ success: true, count: 2, closed: 2 });
                },
            });

            // Auto-accept modal when presented and capture the request
            const unsubscribe = confirmRequest.subscribe((req) => {
                if (req) {
                    observedModalRequest = req;
                    req.resolve(true); // User clicks "Confirmar"
                }
            });

            const res = await handleDeleteOtherGroupsUI(10);
            unsubscribe();

            // Verify modal request had the correct messageKey and parameters (count and kept group name)
            assert.ok(observedModalRequest);
            assert.equal(observedModalRequest.messageKey, 'confirmDeleteOtherGroups');
            assert.deepEqual(observedModalRequest.params, ['2', 'Group 1']);

            // Verify background message was strictly scoped to window 10 and spared group 1
            assert.ok(sentMessage);
            assert.equal(sentMessage.action, 'deleteOtherGroups');
            assert.equal(sentMessage.windowId, 10);
            assert.equal(sentMessage.groupId, 1);
            assert.equal(res.success, true);

            // Wait for any async render timeouts
            await new Promise((r) => setTimeout(r, 150));
        });

        it('aborts without sending message if user cancels the confirmation modal', async () => {
            setCurrentWindowId(10);
            const groups = [
                { id: 1, windowId: 10, title: 'Group 1' },
                { id: 2, windowId: 10, title: 'Group 2' },
            ];
            const tabs = [
                { id: 101, windowId: 10, groupId: 1, active: true },
                { id: 102, windowId: 10, groupId: 2, active: false },
            ];

            let backgroundMessageSent = false;
            let observedModalRequest = null;

            setupMockChrome({
                groups,
                tabs,
                onSendMessage: () => {
                    backgroundMessageSent = true;
                },
            });

            const unsubscribe = confirmRequest.subscribe((req) => {
                if (req) {
                    observedModalRequest = req;
                    req.resolve(false); // User rejects / cancels
                }
            });

            const res = await handleDeleteOtherGroupsUI(10);
            unsubscribe();

            assert.ok(observedModalRequest);
            assert.equal(observedModalRequest.messageKey, 'confirmDeleteOtherGroupsSingle');
            assert.deepEqual(observedModalRequest.params, ['1', 'Group 1']);
            assert.equal(res.success, false);
            assert.equal(res.cancelled, true);
            assert.equal(backgroundMessageSent, false);
        });

        it('uses untitled label for kept group if the active group has no title', async () => {
            setCurrentWindowId(10);
            const groups = [
                { id: 1, windowId: 10, title: '' }, // Unnamed active group
                { id: 2, windowId: 10, title: 'Other Group' },
            ];
            const tabs = [
                { id: 101, windowId: 10, groupId: 1, active: true },
                { id: 102, windowId: 10, groupId: 2, active: false },
            ];

            let observedModalRequest = null;
            setupMockChrome({
                groups,
                tabs,
                onSendMessage: (msg, cb) => cb({ success: true }),
            });

            const unsubscribe = confirmRequest.subscribe((req) => {
                if (req) {
                    observedModalRequest = req;
                    req.resolve(true);
                }
            });

            const res = await handleDeleteOtherGroupsUI(10);
            unsubscribe();

            assert.ok(observedModalRequest);
            assert.equal(observedModalRequest.messageKey, 'confirmDeleteOtherGroupsSingle');
            assert.deepEqual(observedModalRequest.params, ['1', 'Sin título']);
            assert.equal(res.success, true);

            await new Promise((r) => setTimeout(r, 150));
        });

        it('selects confirmDeleteAllGroupsInWindow when active tab has no group', async () => {
            setCurrentWindowId(10);
            const groups = [
                { id: 1, windowId: 10, title: 'Group 1' },
                { id: 2, windowId: 10, title: 'Group 2' },
            ];
            const tabs = [
                { id: 101, windowId: 10, groupId: -1, active: true }, // Ungrouped active tab
                { id: 102, windowId: 10, groupId: 1, active: false },
                { id: 103, windowId: 10, groupId: 2, active: false },
            ];

            let observedModalRequest = null;
            setupMockChrome({
                groups,
                tabs,
                onSendMessage: (msg, callback) => {
                    callback({ success: true, count: 2, closed: 2 });
                },
            });

            const unsubscribe = confirmRequest.subscribe((req) => {
                if (req) {
                    observedModalRequest = req;
                    req.resolve(true);
                }
            });

            const res = await handleDeleteOtherGroupsUI(10);
            unsubscribe();

            assert.ok(observedModalRequest);
            assert.equal(observedModalRequest.messageKey, 'confirmDeleteAllGroupsInWindow');
            assert.deepEqual(observedModalRequest.params, ['2']);
            assert.equal(res.success, true);

            await new Promise((r) => setTimeout(r, 150));
        });

        it('falls back to direct client removal if chrome.runtime.lastError occurs', async () => {
            setCurrentWindowId(10);
            const groups = [
                { id: 1, windowId: 10, title: 'Group 1' },
                { id: 2, windowId: 10, title: 'Group 2' },
            ];
            const tabs = [
                { id: 101, windowId: 10, groupId: 1, active: true },
                { id: 102, windowId: 10, groupId: 2, active: false },
            ];

            const removedIds = [];
            setupMockChrome({
                groups,
                tabs,
                onRemove: (ids) => {
                    removedIds.push(...ids);
                },
                onSendMessage: (msg, callback) => {
                    global.chrome.runtime.lastError = new Error('Service worker disconnected');
                    callback(undefined);
                    delete global.chrome.runtime.lastError;
                },
            });

            const unsubscribe = confirmRequest.subscribe((req) => {
                if (req) {
                    req.resolve(true);
                }
            });

            const res = await handleDeleteOtherGroupsUI(10);
            unsubscribe();

            assert.equal(res.success, true);
            assert.equal(res.count, 1);
            assert.deepEqual(res.closedGroups, [2]);
            assert.deepEqual(removedIds, [102]);

            await new Promise((r) => setTimeout(r, 150));
        });
    });

    describe('Backend Service Worker: handleDeleteOtherGroups isolation', () => {
        it('closes only other groups in targetWindowId and does not touch other windows', async () => {
            const code = fs.readFileSync('src/core/background/handlers/groups.js', 'utf8');

            const groupsInChrome = [
                // Window 100: Group 1 (keep), Group 2 (delete)
                { id: 1, windowId: 100 },
                { id: 2, windowId: 100 },
                // Window 200: Group 3, Group 4
                { id: 3, windowId: 200 },
                { id: 4, windowId: 200 },
            ];

            const tabsInChrome = [
                // Window 100
                { id: 101, windowId: 100, groupId: 1 },
                { id: 102, windowId: 100, groupId: 2 },
                { id: 103, windowId: 100, groupId: 2 },
                // Window 200
                { id: 201, windowId: 200, groupId: 3 },
                { id: 202, windowId: 200, groupId: 4 },
            ];

            const removedTabIds = [];

            const sandbox = {
                console,
                Number,
                chrome: {
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
                                if (opts.groupId !== undefined && t.groupId !== opts.groupId) return false;
                                if (opts.windowId !== undefined && t.windowId !== opts.windowId) return false;
                                return true;
                            });
                        },
                        remove: async (ids) => {
                            removedTabIds.push(...ids);
                        },
                    },
                },
            };

            vm.createContext(sandbox);
            vm.runInContext(code, sandbox);

            let handlerResponse = null;
            await sandbox.handleDeleteOtherGroups({ windowId: 100, groupId: 1 }, (res) => {
                handlerResponse = res;
            });

            assert.ok(handlerResponse);
            assert.equal(handlerResponse.success, true);
            assert.equal(handlerResponse.count, 1); // 1 other group closed (Group 2)
            assert.equal(handlerResponse.closed, 2); // 2 tabs closed (102, 103)

            // Verify only tabs 102 and 103 were removed
            assert.deepEqual(removedTabIds, [102, 103]);

            // Window 100 Group 1 tab (101) must NOT be removed
            assert.equal(removedTabIds.includes(101), false);

            // Window 200 tabs (201, 202) must NEVER be touched
            assert.equal(removedTabIds.includes(201), false);
            assert.equal(removedTabIds.includes(202), false);
        });
    });
});
