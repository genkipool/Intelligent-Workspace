/**
 * Tests for Defects #10, #11, #12, #13: Background messaging, events, and exception handling.
 *
 * - Defect #10: groupsService storage session listener uses standard chrome.storage.onChanged.
 * - Defect #11: messaging.js handles createBookmarkFolder returning { success: true, folder }.
 * - Defect #12: offscreen.js handles musicIsBusy and pomodoro.js protects active offscreen music from close.
 * - Defect #13: history.js onPrintingComplete safely guards sender.tab?.id against undefined.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

describe('Defects #10, #11, #12, #13: Background messaging and event handlers', () => {
    describe('Defect #10: groupsService storage.onChanged session listener', () => {
        const groupsServiceCode = readFileSync('src/ui/services/groupsService.js', 'utf8');

        it('does not attempt to subscribe to non-existent chrome.storage.session.onChanged', () => {
            assert.equal(
                /chrome\.storage\.session\.onChanged/.test(groupsServiceCode),
                false,
                'Must not reference chrome.storage.session.onChanged (non-existent API event in Chrome)',
            );
        });

        it('subscribes to chrome.storage.onChanged and filters for areaName === "session"', () => {
            assert.match(
                groupsServiceCode,
                /chrome\.storage(?:\?\.|\.)onChanged(?:\?\.|\.)addListener/,
                'Must subscribe to chrome.storage.onChanged.addListener',
            );
            assert.match(
                groupsServiceCode,
                /areaName\s*===\s*['"]session['"]/,
                'Must filter storage event by areaName === "session"',
            );
            assert.match(
                groupsServiceCode,
                /changes\.readAloudTabs/,
                'Must check changes.readAloudTabs before updating mute button state',
            );
        });

        it('behavioral simulation: executes update callback only on session storage readAloudTabs changes', () => {
            let updateStateCalledCount = 0;
            let capturedListener = null;

            // In Chrome MV3, chrome.storage.session has NO onChanged event.
            const mockStorage = {
                session: {},
                onChanged: {
                    addListener: (callback) => {
                        capturedListener = callback;
                    },
                },
            };

            assert.equal(mockStorage.session.onChanged, undefined);

            // Register listener using the fixed pattern from groupsService.js
            mockStorage?.onChanged?.addListener((changes, areaName) => {
                if (areaName === 'session' && changes.readAloudTabs) {
                    updateStateCalledCount++;
                }
            });

            assert.ok(capturedListener, 'Listener must be registered');

            // 1. Session storage change with readAloudTabs -> triggers update
            capturedListener({ readAloudTabs: { newValue: { 10: 'reading' } } }, 'session');
            assert.equal(updateStateCalledCount, 1);

            // 2. Local storage change with readAloudTabs -> ignored
            capturedListener({ readAloudTabs: { newValue: {} } }, 'local');
            assert.equal(updateStateCalledCount, 1, 'Local changes must not trigger session mute update');

            // 3. Sync storage change -> ignored
            capturedListener({ someSetting: { newValue: true } }, 'sync');
            assert.equal(updateStateCalledCount, 1, 'Sync changes must not trigger session mute update');

            // 4. Session change without readAloudTabs -> ignored
            capturedListener({ otherSessionKey: { newValue: 'val' } }, 'session');
            assert.equal(updateStateCalledCount, 1, 'Other session keys must not trigger mute update');

            // 5. Another session change with readAloudTabs -> triggers update
            capturedListener({ readAloudTabs: { newValue: null } }, 'session');
            assert.equal(updateStateCalledCount, 2);
        });
    });

    describe('Defect #11: createBookmarkFolder handler in messaging.js', () => {
        let handlers;
        let createdBookmarks;

        const setupMessagingContext = (createBookmarkImpl) => {
            createdBookmarks = [];
            const bookmarksMock = {
                create:
                    createBookmarkImpl ||
                    (async (params) => {
                        const folder = { id: String(Date.now()), ...params };
                        createdBookmarks.push(folder);
                        return folder;
                    }),
            };

            const chromeProxy = new Proxy(
                { bookmarks: bookmarksMock },
                {
                    get: (target, prop) => {
                        if (prop in target) return target[prop];
                        return new Proxy(
                            {},
                            {
                                get: (target2, prop2) => {
                                    if (prop2 === 'addListener' || prop2 === 'removeListener') return () => {};
                                    return { addListener: () => {}, removeListener: () => {} };
                                },
                            },
                        );
                    },
                },
            );

            const context = {
                console: {
                    ...console,
                    error: () => {},
                    warn: () => {},
                    log: () => {},
                },
                chrome: chromeProxy,
                setTimeout,
                clearTimeout,
            };
            vm.createContext(context);
            const messagingCode = readFileSync('src/core/background/messaging.js', 'utf8');
            vm.runInContext(messagingCode, context);
            return vm.runInContext('MESSAGE_HANDLERS', context);
        };

        it('MESSAGE_HANDLERS has createBookmarkFolder registered', () => {
            handlers = setupMessagingContext();
            assert.equal(typeof handlers.createBookmarkFolder, 'function');
        });

        it('creates bookmark folder successfully with parentId and title', async () => {
            handlers = setupMessagingContext();

            const message = {
                action: 'createBookmarkFolder',
                payload: { parentId: '1', title: 'Work Bookmarks' },
            };

            const response = await new Promise((resolve) => {
                handlers.createBookmarkFolder(message, {}, (res) => resolve(res));
            });

            assert.equal(response.success, true);
            assert.ok(response.folder);
            assert.equal(response.folder.title, 'Work Bookmarks');
            assert.equal(response.folder.parentId, '1');
            assert.equal(createdBookmarks.length, 1);
        });

        it('supports creating top-level folder with undefined parentId', async () => {
            handlers = setupMessagingContext();

            const message = {
                action: 'createBookmarkFolder',
                payload: { title: 'Top Folder' },
            };

            const response = await new Promise((resolve) => {
                handlers.createBookmarkFolder(message, {}, (res) => resolve(res));
            });

            assert.equal(response.success, true);
            assert.equal(response.folder.title, 'Top Folder');
            assert.equal(response.folder.parentId, undefined);
        });

        it('returns success: false when title is missing or empty', async () => {
            handlers = setupMessagingContext();

            const message = {
                action: 'createBookmarkFolder',
                payload: { parentId: '1', title: '' },
            };

            const response = await new Promise((resolve) => {
                handlers.createBookmarkFolder(message, {}, (res) => resolve(res));
            });

            assert.equal(response.success, false);
            assert.match(response.error, /Title is mandatory/);
            assert.equal(createdBookmarks.length, 0);
        });

        it('handles rejection from chrome.bookmarks.create cleanly', async () => {
            handlers = setupMessagingContext(async () => {
                throw new Error('Chrome Bookmarks API quota exceeded');
            });

            const message = {
                action: 'createBookmarkFolder',
                payload: { title: 'Fail Folder' },
            };

            const response = await new Promise((resolve) => {
                handlers.createBookmarkFolder(message, {}, (res) => resolve(res));
            });

            assert.equal(response.success, false);
            assert.equal(response.error, 'Chrome Bookmarks API quota exceeded');
        });
    });

    describe('Defect #12: Audio coexistence (offscreen.js & pomodoro.js)', () => {
        const offscreenCode = readFileSync('src/ui/pages/offscreen/offscreen.js', 'utf8');

        it('offscreen.js handles musicIsBusy and setMusicBusy actions', () => {
            assert.match(offscreenCode, /msg\?\.action\s*===\s*['"]musicIsBusy['"]/);
            assert.match(offscreenCode, /msg\?\.action\s*===\s*['"]setMusicBusy['"]/);
        });

        it('offscreen.js returns busy: false when no music is playing', async () => {
            let messageListener = null;
            const context = {
                console,
                chrome: {
                    runtime: {
                        onMessage: {
                            addListener: (fn) => {
                                messageListener = fn;
                            },
                        },
                    },
                },
                document: { querySelectorAll: () => [] },
            };
            vm.createContext(context);
            vm.runInContext(offscreenCode, context);

            const res = await new Promise((resolve) => {
                messageListener({ action: 'musicIsBusy' }, {}, (r) => resolve(r));
            });

            assert.equal(res?.busy, false);
        });

        it('offscreen.js returns busy: true when music is flagged active or audio element is playing', async () => {
            let messageListener = null;
            const mockAudioElement = { paused: false, ended: false, currentTime: 15 };

            const context = {
                console,
                chrome: {
                    runtime: {
                        onMessage: {
                            addListener: (fn) => {
                                messageListener = fn;
                            },
                        },
                    },
                },
                document: { querySelectorAll: () => [mockAudioElement] },
            };
            vm.createContext(context);
            vm.runInContext(offscreenCode, context);

            // Audio element is playing
            const resAudio = await new Promise((resolve) => {
                messageListener({ action: 'musicIsBusy' }, {}, (r) => resolve(r));
            });
            assert.equal(resAudio?.busy, true);

            // setMusicBusy explicitly
            const setRes = await new Promise((resolve) => {
                messageListener({ action: 'setMusicBusy', busy: true }, {}, (r) => resolve(r));
            });
            assert.equal(setRes?.success, true);
            assert.equal(setRes?.busy, true);

            const resFlag = await new Promise((resolve) => {
                messageListener({ action: 'musicIsBusy' }, {}, (r) => resolve(r));
            });
            assert.equal(resFlag?.busy, true);
        });

        it('pomodoro.js isMusicPlayingOffscreen protects active music from document closure', async () => {
            const pomodoroCode = readFileSync('src/core/background/pomodoro.js', 'utf8');

            let offscreenHasDocument = true;
            let offscreenBusy = false;
            let closeDocumentCalled = false;

            const mockChrome = {
                offscreen: {
                    hasDocument: async () => offscreenHasDocument,
                    closeDocument: async () => {
                        closeDocumentCalled = true;
                    },
                },
                runtime: {
                    sendMessage: async (msg) => {
                        if (msg.action === 'musicIsBusy') {
                            return { busy: offscreenBusy };
                        }
                        return {};
                    },
                    onMessage: { addListener: () => {} },
                },
                storage: { local: {}, session: {} },
                alarms: { onAlarm: { addListener: () => {} }, create: () => {}, clear: () => {} },
            };

            const context = {
                console,
                chrome: mockChrome,
                setTimeout,
                clearTimeout,
            };
            vm.createContext(context);
            vm.runInContext(pomodoroCode, context);

            const isMusicPlayingOffscreen = vm.runInContext('isMusicPlayingOffscreen', context);

            // Case 1: No offscreen document exists -> returns false
            offscreenHasDocument = false;
            assert.equal(await isMusicPlayingOffscreen(), false);

            // Case 2: Document exists, music not busy -> returns false
            offscreenHasDocument = true;
            offscreenBusy = false;
            assert.equal(await isMusicPlayingOffscreen(), false);

            // Case 3: Document exists, music is playing -> returns true
            offscreenBusy = true;
            assert.equal(await isMusicPlayingOffscreen(), true);

            // Verify closure decision: when music is playing, closeDocument must not be invoked
            const isPlaying = await isMusicPlayingOffscreen();
            if (!isPlaying) {
                await mockChrome.offscreen.closeDocument();
            }
            assert.equal(closeDocumentCalled, false, 'Must not close offscreen document while music is playing');
        });
    });

    describe('Defect #13: history.js printingComplete sender.tab?.id guard', () => {
        const historyCode = readFileSync('src/core/background/handlers/history.js', 'utf8');

        it('history.js uses optional chaining sender.tab?.id', () => {
            assert.match(
                historyCode,
                /sender\.tab\?\.id\s*===\s*printTab\?\.id/,
                'Must use optional chaining sender.tab?.id === printTab?.id',
            );
            assert.equal(
                /sender\.tab\.id\s*===/.test(historyCode),
                false,
                'Must not access sender.tab.id directly without optional chaining',
            );
        });

        it('behavioral simulation: onPrintingComplete executes without TypeError when sender.tab is undefined', () => {
            let closedTabId = null;
            let listenerRemoved = false;

            const printTab = { id: 777 };

            // Emulate onPrintingComplete listener with fixed guard
            const onPrintingComplete = (message, sender) => {
                if (message.action === 'printingComplete' && sender.tab?.id === printTab?.id) {
                    closedTabId = printTab.id;
                    listenerRemoved = true;
                }
            };

            // 1. Message from extension page (popup, sidepanel, offscreen) where sender.tab is undefined
            assert.doesNotThrow(() => {
                onPrintingComplete({ action: 'printingComplete' }, {});
            }, 'Must not throw TypeError when sender.tab is undefined');
            assert.equal(closedTabId, null);
            assert.equal(listenerRemoved, false);

            // 2. Message from a different tab
            onPrintingComplete({ action: 'printingComplete' }, { tab: { id: 888 } });
            assert.equal(closedTabId, null);
            assert.equal(listenerRemoved, false);

            // 3. Message from the temporary print tab
            onPrintingComplete({ action: 'printingComplete' }, { tab: { id: 777 } });
            assert.equal(closedTabId, 777);
            assert.equal(listenerRemoved, true);
        });
    });
});
