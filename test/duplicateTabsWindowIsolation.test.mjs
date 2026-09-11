/**
 * Comprehensive Tests for Duplicate Tabs Window Isolation:
 * Verifies that clicking "Eliminar pestañas repetidas" or calling duplicate tab removal
 * only removes duplicate tabs within the current window and never affects tabs in other windows.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { findDuplicateTabs, removeDuplicateTabs, handleRemoveDuplicates } from '../src/ui/services/groupsService.js';
import { resetCurrentWindowId, setCurrentWindowId } from '../src/ui/services/windowsService.js';

describe('Duplicate Tabs Window Isolation', () => {
    beforeEach(() => {
        resetCurrentWindowId();
        delete global.window;
        delete global.chrome;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({}),
        });
        global.localStorage = {
            getItem: () => 'en',
            setItem: () => {},
        };
        global.document = {
            getElementById: () => ({
                classList: { add: () => {}, remove: () => {} },
                setAttribute: () => {},
                textContent: '',
            }),
            querySelector: () => null,
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

    describe('findDuplicateTabs helper', () => {
        it('identifies duplicate URLs within a list of tabs and returns correct count', () => {
            const tabs = [
                { id: 1, url: 'https://example.com', active: false },
                { id: 2, url: 'https://example.com', active: false },
                { id: 3, url: 'https://example.com', active: false },
                { id: 4, url: 'https://unique.com', active: false },
            ];

            const result = findDuplicateTabs(tabs);
            // 3 tabs of example.com -> 1 kept, 2 duplicates to close
            assert.equal(result.count, 2);
            assert.equal(result.duplicateTabs.length, 2);
            // Keeper is tab 1 (first tab), duplicates to close are tabs 2 and 3
            assert.deepEqual(
                result.duplicateTabs.map((t) => t.id),
                [2, 3],
            );
        });

        it('preserves the active tab if one of the duplicate tabs is active', () => {
            const tabs = [
                { id: 1, url: 'https://example.com', active: false },
                { id: 2, url: 'https://example.com', active: true },
                { id: 3, url: 'https://example.com', active: false },
            ];

            const result = findDuplicateTabs(tabs);
            // Tab 2 is active, so tab 2 must be preserved; tabs 1 and 3 are closed
            assert.equal(result.count, 2);
            assert.deepEqual(
                result.duplicateTabs.map((t) => t.id),
                [1, 3],
            );
        });

        it('excludes tabs in the split screen group (splitGroupId)', () => {
            const tabs = [
                { id: 1, url: 'https://example.com', groupId: 10, active: false },
                { id: 2, url: 'https://example.com', groupId: 99, active: false }, // split group 99
            ];

            const result = findDuplicateTabs(tabs, 99);
            // Split tab is ignored, so only 1 tab remains for example.com -> 0 duplicates
            assert.equal(result.count, 0);
            assert.equal(result.duplicateTabs.length, 0);
        });

        it('ignores non-http and non-https URLs (e.g. chrome://, chrome-extension://)', () => {
            const tabs = [
                { id: 1, url: 'chrome://newtab', active: false },
                { id: 2, url: 'chrome://newtab', active: false },
                { id: 3, url: 'chrome-extension://xyz/options.html', active: false },
                { id: 4, url: 'chrome-extension://xyz/options.html', active: false },
                { id: 5, url: 'https://real-site.com', active: false },
                { id: 6, url: 'https://real-site.com', active: false },
            ];

            const result = findDuplicateTabs(tabs);
            // Only real-site.com has duplicates counted
            assert.equal(result.count, 1);
            assert.deepEqual(
                result.duplicateTabs.map((t) => t.id),
                [6],
            );
        });

        it('correctly aggregates duplicates across multiple distinct URLs', () => {
            const tabs = [
                { id: 1, url: 'https://site-a.com', active: false },
                { id: 2, url: 'https://site-a.com', active: false },
                { id: 3, url: 'https://site-b.com', active: false },
                { id: 4, url: 'https://site-b.com', active: false },
                { id: 5, url: 'https://site-b.com', active: false },
                { id: 6, url: 'https://site-c.com', active: false },
            ];

            const result = findDuplicateTabs(tabs);
            // site-a: 1 duplicate (tab 2)
            // site-b: 2 duplicates (tabs 4, 5)
            // site-c: 0 duplicates
            assert.equal(result.count, 3);
            assert.deepEqual(
                result.duplicateTabs.map((t) => t.id),
                [2, 4, 5],
            );
        });
    });

    describe('removeDuplicateTabs: window-scoped execution', () => {
        it('strictly deletes duplicates in the target window and never touches tabs in other windows', async () => {
            const tabsInChrome = [
                // Window 1: duplicates of dup.com and beta.com
                { id: 101, windowId: 1, groupId: -1, url: 'https://dup.com', active: false },
                { id: 102, windowId: 1, groupId: -1, url: 'https://dup.com', active: false },
                { id: 103, windowId: 1, groupId: -1, url: 'https://beta.com', active: false },
                { id: 104, windowId: 1, groupId: -1, url: 'https://beta.com', active: true },
                // Window 2: also has duplicates of dup.com and gamma.com
                { id: 201, windowId: 2, groupId: -1, url: 'https://dup.com', active: false },
                { id: 202, windowId: 2, groupId: -1, url: 'https://dup.com', active: false },
                { id: 203, windowId: 2, groupId: -1, url: 'https://gamma.com', active: false },
            ];

            const removedIds = [];
            global.chrome = {
                storage: {
                    session: { get: async () => ({ groupInfoMap: {} }) },
                    local: { get: async () => ({}) },
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

            // Remove duplicates in Window 1
            const resultWin1 = await removeDuplicateTabs(1);
            assert.equal(resultWin1.success, true);
            assert.equal(resultWin1.count, 2);
            // Tab 102 (duplicate of dup.com) and tab 103 (duplicate of beta.com, tab 104 is active)
            assert.deepEqual(removedIds, [102, 103]);

            // Window 2 tabs (201, 202, 203) MUST NOT be removed!
            assert.equal(removedIds.includes(201), false);
            assert.equal(removedIds.includes(202), false);
            assert.equal(removedIds.includes(203), false);

            // Now, remove duplicates in Window 2
            const resultWin2 = await removeDuplicateTabs(2);
            assert.equal(resultWin2.success, true);
            assert.equal(resultWin2.count, 1);
            assert.deepEqual(removedIds, [102, 103, 202]);
        });

        it('resolves current window when windowId is omitted or an Event object is passed', async () => {
            setCurrentWindowId(42);

            const tabsInChrome = [
                { id: 401, windowId: 42, groupId: -1, url: 'https://dup.com', active: false },
                { id: 402, windowId: 42, groupId: -1, url: 'https://dup.com', active: false },
                { id: 501, windowId: 99, groupId: -1, url: 'https://dup.com', active: false },
            ];

            const removedIds = [];
            global.chrome = {
                storage: {
                    session: { get: async () => ({ groupInfoMap: {} }) },
                    local: { get: async () => ({}) },
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

            // Simulated button click event (passes MouseEvent object as first argument)
            const fakeClickEvent = { type: 'click', target: {} };
            const result = await removeDuplicateTabs(fakeClickEvent);

            assert.equal(result.success, true);
            assert.equal(result.count, 1);
            assert.deepEqual(removedIds, [402]);
            assert.equal(removedIds.includes(501), false);
        });
    });

    describe('handleRemoveDuplicates: messaging and fallback integration', () => {
        it('sends removeDuplicateTabs message with windowId to background', async () => {
            setCurrentWindowId(77);

            let sentMessage = null;
            global.chrome = {
                i18n: { getUILanguage: () => 'en', getMessage: () => 'Done' },
                runtime: {
                    getURL: (p) => `http://localhost/${p}`,
                    sendMessage: (msg, cb) => {
                        sentMessage = msg;
                        cb({ success: true, count: 2, removedIds: [1, 2] });
                    },
                },
                storage: {
                    local: { get: async () => ({}) },
                    session: { get: async () => ({ groupInfoMap: {} }) },
                },
                tabs: {
                    query: async () => [],
                },
            };

            await handleRemoveDuplicates(77);
            assert.deepEqual(sentMessage, {
                action: 'removeDuplicateTabs',
                windowId: 77,
            });
        });

        it('falls back to direct client-side removeDuplicateTabs if service worker message fails', async () => {
            setCurrentWindowId(50);

            const tabsInChrome = [
                { id: 1, windowId: 50, groupId: -1, url: 'https://dup.com', active: false },
                { id: 2, windowId: 50, groupId: -1, url: 'https://dup.com', active: false },
            ];

            const removedIds = [];
            global.chrome = {
                i18n: { getUILanguage: () => 'en', getMessage: () => 'Done' },
                runtime: {
                    getURL: (p) => `http://localhost/${p}`,
                    lastError: { message: 'Receiving end does not exist' },
                    sendMessage: (msg, cb) => {
                        // Simulate failure
                        cb(null);
                    },
                },
                storage: {
                    session: { get: async () => ({ groupInfoMap: {} }) },
                    local: { get: async () => ({}) },
                },
                tabs: {
                    query: async () => tabsInChrome,
                    remove: async (ids) => {
                        removedIds.push(...ids);
                    },
                },
            };

            await handleRemoveDuplicates(50);
            assert.deepEqual(removedIds, [2]);
        });
    });

    describe('src/core/background/utils.js: removeDuplicateTabsCommand', () => {
        it('removes duplicates strictly for targetWindowId and returns { success, count, removedIds }', async () => {
            const tabsInChrome = [
                // Window 10: 2 duplicate tabs of https://dup.com
                { id: 11, windowId: 10, groupId: -1, url: 'https://dup.com', active: false },
                { id: 12, windowId: 10, groupId: -1, url: 'https://dup.com', active: true },
                // Window 20: 2 duplicate tabs of https://dup.com
                { id: 21, windowId: 20, groupId: -1, url: 'https://dup.com', active: false },
                { id: 22, windowId: 20, groupId: -1, url: 'https://dup.com', active: false },
            ];

            const removedIds = [];
            const mockChrome = {
                i18n: { getMessage: (k) => k },
                notifications: { create: () => {} },
                windows: {
                    getLastFocused: async () => ({ id: 10, type: 'normal' }),
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

            const utilsCode = fs.readFileSync('src/core/background/utils.js', 'utf8');
            const sandbox = {
                console,
                URL,
                groupInfoMap: new Map(),
                currentLangMessages: {},
                isModeDebug: false,
                extensionSettings: {},
                logMessage: () => {},
                getI18nMsg: (k) => k,
                cleanUrlForDisplay: (u) => u,
                chrome: mockChrome,
                setTimeout,
                clearTimeout,
            };
            vm.createContext(sandbox);
            vm.runInContext(utilsCode, sandbox);

            const result = await sandbox.removeDuplicateTabsCommand(10);
            assert.equal(result.success, true);
            assert.equal(result.count, 1);
            // Tab 12 is active, so tab 11 is closed
            assert.deepEqual([...result.removedIds], [11]);
            assert.deepEqual(removedIds, [11]);

            // Window 20 tabs must be untouched!
            assert.equal(removedIds.includes(21), false);
            assert.equal(removedIds.includes(22), false);
        });

        it('never merges cross-window tabs even if targetWindowId is null', async () => {
            const tabsInChrome = [
                // Window 1: exactly 1 tab of https://dup.com
                { id: 11, windowId: 1, groupId: -1, url: 'https://dup.com', active: false },
                // Window 2: exactly 1 tab of https://dup.com
                { id: 21, windowId: 2, groupId: -1, url: 'https://dup.com', active: false },
            ];

            const removedIds = [];
            const mockChrome = {
                i18n: { getMessage: (k) => k },
                notifications: { create: () => {} },
                windows: {
                    getLastFocused: async () => null,
                },
                tabs: {
                    query: async () => tabsInChrome,
                    remove: async (ids) => {
                        removedIds.push(...ids);
                    },
                },
            };

            const utilsCode = fs.readFileSync('src/core/background/utils.js', 'utf8');
            const sandbox = {
                console,
                URL,
                groupInfoMap: new Map(),
                currentLangMessages: {},
                isModeDebug: false,
                extensionSettings: {},
                logMessage: () => {},
                getI18nMsg: (k) => k,
                cleanUrlForDisplay: (u) => u,
                chrome: mockChrome,
                setTimeout,
                clearTimeout,
            };
            vm.createContext(sandbox);
            vm.runInContext(utilsCode, sandbox);

            // Calling without windowId and with no focused window
            const result = await sandbox.removeDuplicateTabsCommand(null);
            assert.equal(result.success, true);
            assert.equal(result.count, 0);
            assert.deepEqual(removedIds, []);
        });
    });
});
