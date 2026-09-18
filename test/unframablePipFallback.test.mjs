/**
 * Tests for Telegram & Web Page Document Picture-in-Picture Support:
 * - viewsService.openUrlInPip attempts Document PiP and delegates to openPipWindow.
 * - Background handleOpenPipWindow prepares DNR framing rules and sets up PiP iframe.
 * - Background dnr.js strips framing headers for web apps (e.g. Telegram) while protecting payment gateways.
 * - Rules are cleanly cleaned up on PiP window close.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

describe('Telegram & Document Picture-in-Picture Suite', () => {
    describe('1. viewsService.openUrlInPip Routing', () => {
        it('routes Telegram Web to openPipWindow rather than popup when PiP succeeds', async () => {
            const sentMessages = [];
            global.window = {
                screenX: 100,
                screenY: 100,
                outerWidth: 1200,
                outerHeight: 800,
            };
            global.chrome = {
                runtime: {
                    sendMessage: (msg, callback) => {
                        sentMessages.push(msg);
                        if (typeof callback === 'function') {
                            callback({ success: true });
                        }
                    },
                },
                windows: {
                    getCurrent: async () => ({ id: 1 }),
                },
                tabs: {
                    query: async () => [{ id: 10, windowId: 1 }],
                },
            };

            const { openUrlInPip } = await import('../src/ui/services/viewsService.js');

            const result = await openUrlInPip('https://web.telegram.org/a/', 450, 600, 10, 1);

            assert.equal(result, true, 'openUrlInPip should return true when handled via Document PiP');
            assert.equal(sentMessages.length, 1);
            assert.equal(sentMessages[0].action, 'openPipWindow');
            assert.equal(sentMessages[0].url, 'https://web.telegram.org/a/');
            assert.equal(sentMessages[0].tabId, 10);
            assert.equal(sentMessages[0].windowId, 1);
        });

        it('falls back to openUrlInPopup only if openPipWindow fails', async () => {
            const sentMessages = [];
            global.window = {
                screenX: 100,
                screenY: 100,
                outerWidth: 1200,
                outerHeight: 800,
            };
            global.chrome = {
                runtime: {
                    sendMessage: (msg, callback) => {
                        sentMessages.push(msg);
                        if (typeof callback === 'function') {
                            callback({ success: false });
                        }
                    },
                },
                windows: {
                    getCurrent: async () => ({ id: 1 }),
                },
                tabs: {
                    query: async () => [{ id: 10, windowId: 1 }],
                },
            };

            const { openUrlInPip } = await import('../src/ui/services/viewsService.js');

            const result = await openUrlInPip('https://web.telegram.org/k/', 450, 600, 10, 1);

            assert.equal(result, false, 'openUrlInPip should return false when falling back to popup');
            assert.equal(sentMessages.length, 2);
            assert.equal(sentMessages[0].action, 'openPipWindow');
            assert.equal(sentMessages[1].action, 'openPopupWindow');
            assert.equal(sentMessages[1].url, 'https://web.telegram.org/k/');
        });
    });

    describe('2. Background handleOpenPipWindow (pip.js)', () => {
        let pipSandbox;
        let executedScripts = [];
        const messageListeners = new Set();

        before(() => {
            const pipCode = readFileSync('src/core/background/handlers/pip.js', 'utf8');

            pipSandbox = {
                console,
                setTimeout: (fn) => setTimeout(fn, 0),
                clearTimeout,
                setInterval: () => 1,
                clearInterval: () => {},
                logMessage: () => {},
                getActivePipWindows: async () => ({}),
                setActivePipWindows: async () => {},
                chrome: {
                    windows: {
                        onCreated: { addListener: () => {} },
                        onFocusChanged: { addListener: () => {} },
                        onRemoved: { addListener: () => {} },
                        get: async (winId) => ({ id: winId, left: 100, top: 100, width: 1200, height: 800 }),
                        update: async () => {},
                        create: async () => ({ id: 999 }),
                    },
                    tabs: {
                        get: async (tabId) => ({ id: tabId, url: 'https://web.telegram.org/k/' }),
                        update: async () => {},
                        sendMessage: async () => {},
                    },
                    runtime: {
                        onMessage: {
                            addListener: (listener) => {
                                messageListeners.add(listener);
                            },
                            removeListener: (listener) => {
                                messageListeners.delete(listener);
                            },
                        },
                        sendMessage: async () => {},
                    },
                    scripting: {
                        executeScript: async (options) => {
                            executedScripts.push(options);
                            // Simulate ITG_PIP_STARTED from injected script
                            for (const listener of messageListeners) {
                                listener({ action: 'ITG_PIP_STARTED' }, { tab: { id: options.target.tabId } });
                            }
                        },
                    },
                },
            };

            vm.createContext(pipSandbox);
            vm.runInContext(pipCode, pipSandbox);
        });

        it('injects Document PiP script for Telegram Web with correct args and focus', async () => {
            executedScripts = [];

            let responsePayload = null;
            await pipSandbox.handleOpenPipWindow(
                {
                    url: 'https://web.telegram.org/a/',
                    width: 450,
                    height: 600,
                    tabId: 10,
                    windowId: 1,
                    originalWindowId: 1,
                    originalTabId: 10,
                },
                { tab: { id: 10, windowId: 1 } },
                (res) => {
                    responsePayload = res;
                },
            );

            assert.equal(executedScripts.length, 1, 'Should inject Document PiP script');
            assert.equal(executedScripts[0].target.tabId, 10);
            assert.equal(executedScripts[0].args[0], 450);
            assert.equal(executedScripts[0].args[1], 600);
            assert.equal(executedScripts[0].args[2], 'https://web.telegram.org/a/');
            assert.equal(responsePayload?.success, true);
        });

        it('resolves targetUrl from tab when url is missing from message', async () => {
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

            assert.equal(executedScripts.length, 1);
            assert.equal(executedScripts[0].target.tabId, 15);
            assert.equal(executedScripts[0].args[0], 500);
            assert.equal(executedScripts[0].args[1], 700);
            assert.equal(executedScripts[0].args[2], 'https://web.telegram.org/k/');
            assert.equal(responsePayload?.success, true);
        });
    });

    describe('3. Background dnr.js Framing Header Management', () => {
        it('NEVER_STRIP_FRAMING_HOSTS protects payment gateways but allows Telegram', () => {
            const dnrCode = readFileSync('src/core/background/handlers/dnr.js', 'utf8');

            const sandbox = {
                console,
                SIDEPANEL_RULE_ID: 1,
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

            // Payment gateways remain strictly protected
            assert.ok(sandbox.__NEVER_STRIP_FRAMING_HOSTS.includes('stripe.com'));
            assert.ok(sandbox.__NEVER_STRIP_FRAMING_HOSTS.includes('paypal.com'));
            assert.ok(sandbox.__NEVER_STRIP_FRAMING_HOSTS.includes('pay.google.com'));
            assert.ok(sandbox.__NEVER_STRIP_FRAMING_HOSTS.includes('genkipool.com'));

            assert.equal(sandbox.__isPaymentHost('stripe.com'), true);
            assert.equal(sandbox.__isPaymentHost('checkout.stripe.com'), true);
            assert.equal(sandbox.__isPaymentHost('paypal.com'), true);

            // Telegram is a messaging web app and is framable in PiP
            assert.equal(sandbox.__isPaymentHost('web.telegram.org'), false);
            assert.equal(sandbox.__isPaymentHost('telegram.org'), false);
        });

        it('handlePrepareVideoUrlForPip installs framing removal rules for Telegram', async () => {
            const dnrCode = readFileSync('src/core/background/handlers/dnr.js', 'utf8');
            let updatedRules = null;

            const sandbox = {
                console,
                URL,
                Set,
                SIDEPANEL_RULE_ID: 1,
                chrome: {
                    declarativeNetRequest: {
                        updateSessionRules: async (options) => {
                            updatedRules = options;
                        },
                    },
                    cookies: {
                        getAll: async () => [],
                    },
                    tabs: {
                        get: async () => ({ windowId: 1 }),
                        query: async () => [],
                    },
                },
                logMessage: () => {},
            };
            vm.createContext(sandbox);
            vm.runInContext(
                dnrCode + '\nglobalThis.__handlePrepareVideoUrlForPip = handlePrepareVideoUrlForPip;',
                sandbox,
            );

            await new Promise((resolve) => {
                sandbox.__handlePrepareVideoUrlForPip({ url: 'https://web.telegram.org/a/' }, resolve, 10);
            });

            assert.ok(updatedRules);
            assert.ok(Array.isArray(updatedRules.addRules));
            assert.ok(updatedRules.addRules.length >= 1);

            const rule = updatedRules.addRules[0];
            assert.equal(rule.condition.requestDomains[0], 'telegram.org');
            assert.equal(rule.action.type, 'modifyHeaders');
            const removedHeaders = rule.action.responseHeaders.map((h) => h.header.toLowerCase());
            assert.ok(removedHeaders.includes('x-frame-options'));
            assert.ok(removedHeaders.includes('content-security-policy'));
        });

        it('handleCleanupVideoPipRules removes the installed PiP session rules', async () => {
            const dnrCode = readFileSync('src/core/background/handlers/dnr.js', 'utf8');
            let removedRules = null;

            const sandbox = {
                console,
                SIDEPANEL_RULE_ID: 1,
                chrome: {
                    declarativeNetRequest: {
                        updateSessionRules: async (options) => {
                            removedRules = options;
                        },
                    },
                },
                logMessage: () => {},
            };
            vm.createContext(sandbox);
            vm.runInContext(
                dnrCode + '\nglobalThis.__handleCleanupVideoPipRules = handleCleanupVideoPipRules;',
                sandbox,
            );

            await new Promise((resolve) => {
                sandbox.__handleCleanupVideoPipRules(resolve);
            });

            assert.ok(removedRules);
            assert.ok(Array.isArray(removedRules.removeRuleIds));
            assert.ok(removedRules.removeRuleIds.length >= 2);
        });
    });

    describe('4. Hint / Omnibar Host Document PiP Support', () => {
        it('omnibar-host _openDocumentPip delegates directly without blocking Telegram', async () => {
            const utilsCode = readFileSync('src/utils/hint/utils.js', 'utf8');
            const hostCode = readFileSync('src/utils/hint/omnibar-host.js', 'utf8');

            let requestedUrl = null;
            const sandbox = {
                console,
                URL: globalThis.URL,
                setInterval: () => 1,
                clearInterval: () => {},
                window: {
                    documentPictureInPicture: {
                        requestWindow: async () => ({
                            document: {
                                body: {
                                    style: {},
                                    appendChild: () => {},
                                },
                            },
                            addEventListener: () => {},
                        }),
                    },
                    location: { href: 'https://other.com', pathname: '/' },
                },
                document: {
                    querySelectorAll: () => [],
                    createElement: () => ({ style: {} }),
                },
                chrome: {
                    runtime: {
                        sendMessage: async (msg) => {
                            if (msg.action === 'prepareVideoUrlForPip') {
                                requestedUrl = msg.url;
                            }
                        },
                    },
                    storage: { local: { set: async () => {} } },
                },
                requestItgPipWindow: async (targetUrl) => {
                    requestedUrl = targetUrl;
                    return {
                        document: {
                            body: {
                                style: {},
                                appendChild: () => {},
                            },
                        },
                        addEventListener: () => {},
                    };
                },
            };
            vm.createContext(sandbox);
            vm.runInContext(utilsCode + '\n' + hostCode, sandbox);

            const host = new sandbox.OmniBarHost();
            const result = await host._openDocumentPip('https://web.telegram.org/a/');

            assert.ok(result, '_openDocumentPip should succeed and not reject Telegram');
            assert.equal(requestedUrl, 'https://web.telegram.org/a/');
        });
    });
});
