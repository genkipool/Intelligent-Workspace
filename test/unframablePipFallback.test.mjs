/**
 * Tests for Unframable / Telegram Picture-in-Picture Fallback to Standalone Popup:
 * - isUnframablePipHost correctly classifies Telegram, payment gateways, and standard sites.
 * - viewsService.openUrlInPip routes Telegram URLs directly to openUrlInPopup.
 * - Background handleOpenPipWindow intercepts unframable URLs and opens them via chrome.windows.create({ type: 'popup' }).
 * - Background dnr.js NEVER_STRIP_FRAMING_HOSTS protects Telegram domains from framing header removal.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { isUnframablePipHost, UNFRAMABLE_PIP_HOSTS } from '../src/ui/services/utils.js';

describe('Telegram & Unframable Hosts PiP Fallback Test Suite', () => {
    describe('1. Host Classification (isUnframablePipHost)', () => {
        it('includes Telegram Web, Telegram domain, and shortlinks', () => {
            assert.equal(isUnframablePipHost('https://web.telegram.org/a/'), true);
            assert.equal(isUnframablePipHost('https://web.telegram.org/k/'), true);
            assert.equal(isUnframablePipHost('https://web.telegram.org/'), true);
            assert.equal(isUnframablePipHost('https://telegram.org/blog'), true);
            assert.equal(isUnframablePipHost('https://t.me/durov'), true);
            assert.equal(isUnframablePipHost('http://web.telegram.org/k/#@channel'), true);
        });

        it('includes payment hosts that must never be framed', () => {
            assert.equal(isUnframablePipHost('https://stripe.com/checkout'), true);
            assert.equal(isUnframablePipHost('https://js.stripe.network'), true);
            assert.equal(isUnframablePipHost('https://www.paypal.com/pay'), true);
            assert.equal(isUnframablePipHost('https://pay.google.com/'), true);
            assert.equal(isUnframablePipHost('https://payments.google.com/'), true);
            assert.equal(isUnframablePipHost('https://genkipool.com/'), true);
        });

        it('does not flag normal framable web pages or video sites', () => {
            assert.equal(isUnframablePipHost('https://google.com'), false);
            assert.equal(isUnframablePipHost('https://github.com/torvalds'), false);
            assert.equal(isUnframablePipHost('https://en.wikipedia.org/wiki/Main_Page'), false);
            assert.equal(isUnframablePipHost('https://youtube.com/watch?v=dQw4w9WgXcQ'), false);
            assert.equal(isUnframablePipHost('https://tiktok.com/@user'), false);
        });

        it('handles empty or malformed URLs safely without throwing', () => {
            assert.equal(isUnframablePipHost(''), false);
            assert.equal(isUnframablePipHost(null), false);
            assert.equal(isUnframablePipHost(undefined), false);
            assert.equal(isUnframablePipHost('not-a-valid-url'), false);
        });
    });

    describe('2. viewsService.openUrlInPip Routing', () => {
        it('routes Telegram Web URLs directly to openUrlInPopup', async () => {
            const sentMessages = [];
            global.window = {
                screenX: 100,
                screenY: 100,
                outerWidth: 1200,
                outerHeight: 800,
            };
            global.chrome = {
                runtime: {
                    sendMessage: (msg) => {
                        sentMessages.push(msg);
                    },
                },
                windows: {
                    getCurrent: async () => ({ id: 1 }),
                },
                tabs: {
                    query: async () => [{ id: 10 }],
                },
            };

            const { openUrlInPip } = await import('../src/ui/services/viewsService.js');

            const result = await openUrlInPip('https://web.telegram.org/a/', 450, 600, 10, 1);

            assert.equal(result, true, 'openUrlInPip should return true when handled via popup');
            assert.equal(sentMessages.length, 1);
            assert.equal(sentMessages[0].action, 'openPopupWindow');
            assert.equal(sentMessages[0].url, 'https://web.telegram.org/a/');
            assert.equal(sentMessages[0].width, 450);
            assert.equal(sentMessages[0].height, 600);
        });
    });

    describe('3. Background handleOpenPipWindow (pip.js)', () => {
        let pipSandbox;
        let createdWindows = [];
        let executedScripts = [];

        before(() => {
            const pipCode = readFileSync('src/core/background/handlers/pip.js', 'utf8');

            pipSandbox = {
                console,
                setTimeout,
                clearTimeout,
                Promise,
                URL,
                Math,
                Number,
                Boolean,
                logMessage: () => {},
                getActivePipWindows: async () => ({}),
                setActivePipWindows: async () => {},
                chrome: {
                    windows: {
                        onCreated: { addListener: () => {} },
                        onFocusChanged: { addListener: () => {} },
                        onRemoved: { addListener: () => {} },
                        get: async (winId) => ({ id: winId, left: 100, top: 100, width: 1200, height: 800 }),
                        create: async (options) => {
                            createdWindows.push(options);
                            return { id: 999, ...options };
                        },
                    },
                    tabs: {
                        get: async (tabId) => ({ id: tabId, url: 'https://web.telegram.org/k/' }),
                        update: async () => {},
                        sendMessage: async () => {},
                    },
                    runtime: {
                        onMessage: {
                            addListener: () => {},
                            removeListener: () => {},
                        },
                        sendMessage: async () => {},
                    },
                    scripting: {
                        executeScript: async (options) => {
                            executedScripts.push(options);
                        },
                    },
                },
            };

            vm.createContext(pipSandbox);
            vm.runInContext(pipCode, pipSandbox);
        });

        it('creates a standalone popup window when URL is Telegram Web and does not inject PiP iframe script', async () => {
            createdWindows = [];
            executedScripts = [];

            let responsePayload = null;
            await pipSandbox.handleOpenPipWindow(
                {
                    url: 'https://web.telegram.org/a/',
                    width: 450,
                    height: 600,
                    windowId: 1,
                    originalWindowId: 1,
                },
                { tab: { id: 10, windowId: 1 } },
                (res) => {
                    responsePayload = res;
                },
            );

            assert.equal(responsePayload?.success, true);
            assert.equal(responsePayload?.openedAsPopup, true);
            assert.equal(createdWindows.length, 1);
            assert.equal(createdWindows[0].type, 'popup');
            assert.equal(createdWindows[0].url, 'https://web.telegram.org/a/');
            assert.equal(createdWindows[0].width, 450);
            assert.equal(createdWindows[0].height, 600);
            assert.equal(executedScripts.length, 0, 'Must NOT inject iframe into the page for unframable host');
        });

        it('resolves targetUrl from tab when url is missing from message and handles popup routing', async () => {
            createdWindows = [];
            executedScripts = [];

            let responsePayload = null;
            await pipSandbox.handleOpenPipWindow(
                {
                    width: 500,
                    height: 700,
                    tabId: 15,
                    originalTabId: 15,
                    windowId: 1,
                },
                { tab: { id: 15, windowId: 1 } },
                (res) => {
                    responsePayload = res;
                },
            );

            assert.equal(responsePayload?.success, true);
            assert.equal(responsePayload?.openedAsPopup, true);
            assert.equal(createdWindows.length, 1);
            assert.equal(createdWindows[0].url, 'https://web.telegram.org/k/');
            assert.equal(executedScripts.length, 0);
        });
    });

    describe('4. Background dnr.js Protection for Telegram', () => {
        it('NEVER_STRIP_FRAMING_HOSTS contains Telegram domains to preserve security and satisfy Store policy', () => {
            const dnrCode = readFileSync('src/core/background/handlers/dnr.js', 'utf8');

            const sandbox = {
                console,
                chrome: {
                    declarativeNetRequest: {},
                    cookies: {},
                },
                logMessage: () => {},
            };
            vm.createContext(sandbox);
            vm.runInContext(
                dnrCode +
                    '\nglobalThis.__NEVER_STRIP_FRAMING_HOSTS = NEVER_STRIP_FRAMING_HOSTS;\nglobalThis.__isPaymentHost = isPaymentHost;',
                sandbox,
            );

            assert.ok(sandbox.__NEVER_STRIP_FRAMING_HOSTS.includes('web.telegram.org'));
            assert.ok(sandbox.__NEVER_STRIP_FRAMING_HOSTS.includes('telegram.org'));
            assert.ok(sandbox.__NEVER_STRIP_FRAMING_HOSTS.includes('t.me'));

            assert.equal(sandbox.__isPaymentHost('web.telegram.org'), true);
            assert.equal(sandbox.__isPaymentHost('k.web.telegram.org'), true);
            assert.equal(sandbox.__isPaymentHost('telegram.org'), true);
            assert.equal(sandbox.__isPaymentHost('t.me'), true);
        });
    });

    describe('5. Hint / Omnibar Host Protection', () => {
        it('omnibar-host _openDocumentPip rejects unframable Telegram URLs', () => {
            const utilsCode = readFileSync('src/utils/hint/utils.js', 'utf8');
            const hostCode = readFileSync('src/utils/hint/omnibar-host.js', 'utf8');

            const sandbox = {
                console,
                URL: globalThis.URL,
                window: {
                    documentPictureInPicture: {},
                    location: { href: 'https://other.com' },
                },
                document: { querySelectorAll: () => [] },
                chrome: { runtime: { sendMessage: async () => {} } },
                requestItgPipWindow: async () => ({ document: { body: { style: {}, appendChild: () => {} } } }),
            };
            vm.createContext(sandbox);
            vm.runInContext(utilsCode + '\n' + hostCode, sandbox);

            const host = new sandbox.OmniBarHost();
            const promise = host._openDocumentPip('https://web.telegram.org/a/');

            return promise.then((result) => {
                assert.equal(result, false, '_openDocumentPip must return false for Telegram');
            });
        });
    });
});
