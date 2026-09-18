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

        it('does not append ?t= timestamp to x.com/home even if video element exists in DOM', async () => {
            executedScripts = [];

            await pipSandbox.handleOpenPipWindow(
                {
                    url: 'https://x.com/home',
                    width: 450,
                    height: 600,
                    tabId: 10,
                    windowId: 1,
                    originalWindowId: 1,
                    originalTabId: 10,
                },
                { tab: { id: 10, windowId: 1 } },
                () => {},
            );

            assert.equal(executedScripts.length, 1);
            const script = executedScripts[0];
            assert.equal(script.args[2], 'https://x.com/home');

            let preparedUrl = null;
            const mockWindow = {
                location: { href: 'https://x.com/home' },
                documentPictureInPicture: {
                    requestWindow: async () => ({
                        document: { body: { style: {}, appendChild: () => {} } },
                        addEventListener: () => {},
                    }),
                },
            };
            const mockDocument = {
                readyState: 'complete',
                querySelector: (sel) => {
                    if (sel === 'video') {
                        return { currentTime: 25.5 };
                    }
                    return null;
                },
                querySelectorAll: () => [],
                createElement: () => ({ style: {} }),
            };
            const mockChrome = {
                runtime: {
                    sendMessage: async (msg) => {
                        if (msg.action === 'prepareVideoUrlForPip') {
                            preparedUrl = msg.url;
                        }
                    },
                },
            };

            const runFunc = new Function(
                'w',
                'h',
                'targetUrl',
                'window',
                'document',
                'chrome',
                'URL',
                'console',
                'setTimeout',
                'clearTimeout',
                'setInterval',
                'clearInterval',
                `return (${script.func.toString()})(w, h, targetUrl);`,
            );

            await runFunc(
                450,
                600,
                'https://x.com/home',
                mockWindow,
                mockDocument,
                mockChrome,
                globalThis.URL,
                console,
                setTimeout,
                clearTimeout,
                () => 1,
                () => {},
            );

            assert.equal(preparedUrl, 'https://x.com/home', 'Timestamp ?t= should NOT be added to x.com/home');
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
            assert.equal(rule.condition.resourceTypes.length, 1);
            assert.equal(rule.condition.resourceTypes[0], 'sub_frame');
            assert.equal(rule.action.type, 'modifyHeaders');
            const removedHeaders = rule.action.responseHeaders.map((h) => h.header.toLowerCase());
            assert.ok(removedHeaders.includes('x-frame-options'));
            assert.ok(removedHeaders.includes('content-security-policy'));

            // Must include Sec-Fetch headers on sub_frame
            const setHeaders = rule.action.requestHeaders.map((h) => ({
                header: h.header.toLowerCase(),
                value: h.value,
            }));
            assert.ok(setHeaders.some((h) => h.header === 'sec-fetch-dest' && h.value === 'document'));
            assert.ok(setHeaders.some((h) => h.header === 'sec-fetch-mode' && h.value === 'navigate'));

            // No destructive Cookie injection for messaging apps
            assert.equal(updatedRules.addRules.length, 1, 'Telegram should not have rule2Id (cookie injection)');
        });

        it('handlePrepareVideoUrlForPip preserves COOP/COEP and rewrites Sec-Fetch for WhatsApp', async () => {
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
                        getAll: async () => [{ name: 'wa_ul', value: 'secret' }],
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
                sandbox.__handlePrepareVideoUrlForPip({ url: 'https://web.whatsapp.com/' }, resolve, 10);
            });

            assert.ok(updatedRules);
            assert.ok(Array.isArray(updatedRules.addRules));
            assert.equal(updatedRules.addRules.length, 1, 'WhatsApp must not have rule2Id (cookie injection)');

            const rule = updatedRules.addRules[0];
            assert.equal(rule.condition.requestDomains[0], 'whatsapp.com');
            assert.equal(rule.condition.resourceTypes.length, 1);
            assert.equal(rule.condition.resourceTypes[0], 'sub_frame');
            assert.equal(rule.action.type, 'modifyHeaders');

            const removedHeaders = rule.action.responseHeaders.map((h) => h.header.toLowerCase());
            assert.ok(removedHeaders.includes('x-frame-options'));
            assert.ok(removedHeaders.includes('content-security-policy'));

            // WhatsApp Web requires SharedArrayBuffer / WebAssembly cryptography;
            // cross-origin-opener-policy and cross-origin-embedder-policy MUST NOT be removed!
            assert.equal(removedHeaders.includes('cross-origin-opener-policy'), false);
            assert.equal(removedHeaders.includes('cross-origin-embedder-policy'), false);

            // Must include Sec-Fetch headers so web.whatsapp.com does not reject the frame
            const setHeaders = rule.action.requestHeaders.map((h) => ({
                header: h.header.toLowerCase(),
                value: h.value,
            }));
            assert.ok(setHeaders.some((h) => h.header === 'sec-fetch-dest' && h.value === 'document'));
            assert.ok(setHeaders.some((h) => h.header === 'sec-fetch-mode' && h.value === 'navigate'));
        });

        it('handlePrepareVideoUrlForPip configures dual domain x.com/twitter.com and injects cookies on sub_frame and XHR for x.com', async () => {
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
                        getAll: async () => [
                            { name: 'ct0', value: 'csrf_token_123' },
                            { name: 'auth_token', value: 'secret_auth_token' },
                        ],
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
                sandbox.__handlePrepareVideoUrlForPip({ url: 'https://x.com/home' }, resolve, 10);
            });

            assert.ok(updatedRules);
            assert.ok(Array.isArray(updatedRules.addRules));
            assert.equal(
                updatedRules.addRules.length,
                2,
                'x.com must have both framing rule and cookie injection rule',
            );

            // Rule 1: Framing and Sec-Fetch navigation hints
            const rule1 = updatedRules.addRules[0];
            assert.ok(rule1.condition.requestDomains.includes('x.com'));
            assert.ok(rule1.condition.requestDomains.includes('twitter.com'));
            assert.equal(rule1.condition.resourceTypes.length, 1);
            assert.equal(rule1.condition.resourceTypes[0], 'sub_frame');
            assert.equal(rule1.action.type, 'modifyHeaders');

            const removedHeaders = rule1.action.responseHeaders.map((h) => h.header.toLowerCase());
            assert.ok(removedHeaders.includes('x-frame-options'));
            assert.ok(removedHeaders.includes('content-security-policy'));
            assert.ok(removedHeaders.includes('cross-origin-opener-policy'));
            assert.ok(removedHeaders.includes('cross-origin-resource-policy'));

            const setReqHeaders = rule1.action.requestHeaders.map((h) => ({
                header: h.header.toLowerCase(),
                value: h.value,
            }));
            assert.ok(setReqHeaders.some((h) => h.header === 'sec-fetch-dest' && h.value === 'document'));
            assert.ok(setReqHeaders.some((h) => h.header === 'sec-fetch-mode' && h.value === 'navigate'));
            // Must NOT include spoofed sec-fetch-site or sec-fetch-user that triggers Cloudflare/Envoy WAF 403
            assert.equal(
                setReqHeaders.some((h) => h.header === 'sec-fetch-site'),
                false,
            );
            assert.equal(
                setReqHeaders.some((h) => h.header === 'sec-fetch-user'),
                false,
            );

            // Rule 2: Cookie injection on sub_frame, xmlhttprequest, script, image, other
            const rule2 = updatedRules.addRules[1];
            assert.ok(rule2.condition.requestDomains.includes('x.com'));
            assert.ok(rule2.condition.requestDomains.includes('twitter.com'));
            assert.equal(rule2.condition.urlFilter, '|https://');
            assert.ok(rule2.condition.resourceTypes.includes('sub_frame'));
            assert.ok(rule2.condition.resourceTypes.includes('xmlhttprequest'));
            assert.ok(rule2.condition.resourceTypes.includes('script'));

            const cookieHeader = rule2.action.requestHeaders.find((h) => h.header.toLowerCase() === 'cookie');
            assert.ok(cookieHeader);
            assert.ok(cookieHeader.value.includes('ct0=csrf_token_123'));
            assert.ok(cookieHeader.value.includes('auth_token=secret_auth_token'));
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

        it('handlePrepareUrlForSidePanel configures dual domain, omits spoofed hints, and injects cookies for x.com', async () => {
            const dnrCode = readFileSync('src/core/background/handlers/dnr.js', 'utf8');
            let updatedRules = null;

            const sandbox = {
                console,
                URL,
                Set,
                Map,
                Array,
                Promise,
                SIDEPANEL_RULE_ID: 1,
                SIDEPANEL_MOBILE_UA: 'Mobile UA',
                SIDEPANEL_DESKTOP_UA_HOSTS: ['x.com', 'twitter.com'],
                navigator: { userAgent: 'Mozilla/5.0 Desktop' },
                chrome: {
                    declarativeNetRequest: {
                        updateSessionRules: async (options) => {
                            updatedRules = options;
                        },
                    },
                    cookies: {
                        getAll: async () => [
                            { name: 'ct0', value: 'csrf_val_side' },
                            { name: 'auth_token', value: 'auth_val_side' },
                        ],
                        set: async () => {},
                    },
                    runtime: {
                        getURL: (path) => `chrome-extension://test${path}`,
                    },
                    tabs: {
                        query: async () => [],
                    },
                },
                logMessage: () => {},
            };
            vm.createContext(sandbox);
            vm.runInContext(
                dnrCode +
                    '\nglobalThis.__handlePrepareUrlForSidePanel = handlePrepareUrlForSidePanel;' +
                    '\nglobalThis.__handleCleanupSidePanelRules = handleCleanupSidePanelRules;',
                sandbox,
            );

            await new Promise((resolve) => {
                sandbox.__handlePrepareUrlForSidePanel({ url: 'https://x.com/home' }, resolve);
            });

            assert.ok(updatedRules);
            assert.ok(Array.isArray(updatedRules.addRules));
            assert.equal(updatedRules.addRules.length, 3, 'Should have frame, child, and cookie injection rules');

            const frameRule = updatedRules.addRules[0];
            assert.ok(frameRule.condition.requestDomains.includes('x.com'));
            assert.ok(frameRule.condition.requestDomains.includes('twitter.com'));
            // Sec-Fetch-Site and Sec-Fetch-User must NOT be set on x.com to avoid Cloudflare/Envoy WAF 403
            const frameReqHeaders = frameRule.action.requestHeaders.map((h) => h.header.toLowerCase());
            assert.equal(frameReqHeaders.includes('sec-fetch-site'), false);
            assert.equal(frameReqHeaders.includes('sec-fetch-user'), false);

            const cookieRule = updatedRules.addRules[2];
            assert.equal(cookieRule.id, sandbox.SIDEPANEL_RULE_ID + 5);
            assert.ok(cookieRule.condition.requestDomains.includes('x.com'));
            assert.ok(cookieRule.condition.requestDomains.includes('twitter.com'));
            const cHeader = cookieRule.action.requestHeaders.find((h) => h.header.toLowerCase() === 'cookie');
            assert.ok(cHeader.value.includes('auth_token=auth_val_side'));
            assert.ok(cHeader.value.includes('ct0=csrf_val_side'));

            // Cleanup removes SIDEPANEL_RULE_ID, SIDEPANEL_RULE_ID + 1, and SIDEPANEL_RULE_ID + 5
            let cleanedRules = null;
            sandbox.chrome.declarativeNetRequest.updateSessionRules = async (opts) => {
                cleanedRules = opts;
            };
            await new Promise((resolve) => {
                sandbox.__handleCleanupSidePanelRules(resolve);
            });
            assert.ok(cleanedRules);
            assert.ok(cleanedRules.removeRuleIds.includes(sandbox.SIDEPANEL_RULE_ID));
            assert.ok(cleanedRules.removeRuleIds.includes(sandbox.SIDEPANEL_RULE_ID + 1));
            assert.ok(cleanedRules.removeRuleIds.includes(sandbox.SIDEPANEL_RULE_ID + 5));
        });
    });

    describe('4. viewsService View Switching Race Condition Prevention', () => {
        it('closeUrlInPanel(true) does NOT send cleanupSidePanelRules when switching views', async () => {
            const sentMessages = [];
            global.window = {
                screenX: 100,
                screenY: 100,
                outerWidth: 1200,
                outerHeight: 800,
            };
            global.document = {
                querySelector: () => null,
                getElementById: () => null,
                body: {
                    classList: {
                        remove: () => {},
                        add: () => {},
                    },
                },
            };
            global.chrome = {
                runtime: {
                    sendMessage: (msg) => {
                        sentMessages.push(msg);
                    },
                },
            };

            const { closeUrlInPanel } = await import('../src/ui/services/viewsService.js');
            await closeUrlInPanel(true);

            const hasCleanup = sentMessages.some((m) => m.action === 'cleanupSidePanelRules');
            assert.equal(hasCleanup, false, 'closeUrlInPanel(true) must not dispatch cleanupSidePanelRules');
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
