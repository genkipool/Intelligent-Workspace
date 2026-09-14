/**
 * Regression & Defect Verification Test Suite for Remediation:
 * - IPC default-deny rejection of unauthorized content script actions.
 * - IPC authorization for extension pages (popup, side panel, full tab rules.html) and 11 shortcut/hint actions.
 * - Incognito isolation in web-activity.js (returns null, no tracking).
 * - Note upload XSS sanitization (escapeHtml and sanitizeNoteHtml).
 * - Duplicate rule group name tab aggregation in groupManager.js.
 * - Named placeholder i18n interpolation ($TITLE$, $COUNT$) in utils.js.
 * - Spanish fallback cascading over English in i18n.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { escapeHtml, sanitizeNoteHtml } from '../src/utils/noteHtml.js';
import { loadMessages } from '../src/utils/i18n.js';

function createTargetProxy(target = {}) {
    return new Proxy(target, {
        get: (t, p) => {
            if (typeof t === 'function' && p === 'bind') return t.bind.bind(t);
            if (p in t) {
                const val = t[p];
                if (val && typeof val === 'object' && !Array.isArray(val)) return createTargetProxy(val);
                return val;
            }
            if (p === 'addListener' || p === 'removeListener') return () => {};
            const dummyFn = (...args) => {};
            return createTargetProxy(dummyFn);
        },
        apply: (t, thisArg, args) => {
            if (typeof t === 'function') return t.apply(thisArg, args);
            return undefined;
        },
    });
}

describe('Remediation Defects & Defenses Test Suite', () => {
    describe('1. Background IPC Default-Deny Dispatcher & Sender Verification (messaging.js)', () => {
        let onMessageListener = null;
        let onConnectListener = null;
        let context = null;

        const chromeMock = {
            runtime: {
                id: 'mock-ext-id',
                getURL: (path = '') => `chrome-extension://mock-ext-id/${path}`,
                onMessage: {
                    addListener: (fn) => {
                        onMessageListener = fn;
                    },
                },
                onConnect: {
                    addListener: (fn) => {
                        onConnectListener = fn;
                    },
                },
            },
            storage: {
                local: { get: async () => ({}), set: async () => {} },
                sync: { get: async () => ({}), set: async () => {} },
                session: { get: async () => ({}), set: async () => {} },
            },
            tabs: {
                query: async () => [],
                get: async () => null,
            },
        };

        context = {
            console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
            URL,
            Map,
            Set,
            setTimeout: (fn) => setTimeout(fn, 0),
            clearTimeout,
            Date,
            chrome: createTargetProxy(chromeMock),
        };

        vm.createContext(context);
        vm.runInContext(readFileSync('src/core/background/messaging.js', 'utf8'), context);

        it('rejects unauthorized message actions from content scripts with default-deny error', () => {
            let capturedResponse = null;
            const untrustedSender = {
                id: 'mock-ext-id',
                url: 'https://malicious-website.com/index.html',
                tab: { id: 10, url: 'https://malicious-website.com/index.html' },
            };

            onMessageListener({ action: 'deleteRule', payload: { ruleName: 'Work' } }, untrustedSender, (res) => {
                capturedResponse = res;
            });

            assert.equal(capturedResponse.success, false);
            assert.equal(capturedResponse.error, 'Unauthorized sender');
        });

        it('authorizes extension popup and side panel page senders', () => {
            vm.runInContext(
                `
                MESSAGE_HANDLERS['testInternalAction'] = () => {
                    globalThis.__testInternalExecuted = true;
                    return true;
                };
            `,
                context,
            );

            const popupSender = {
                id: 'mock-ext-id',
                url: 'chrome-extension://mock-ext-id/src/ui/pages/popup/popup.html',
            };

            vm.runInContext('globalThis.__testInternalExecuted = false;', context);
            onMessageListener({ action: 'testInternalAction' }, popupSender, () => {});

            assert.equal(vm.runInContext('globalThis.__testInternalExecuted', context), true);
        });

        it('authorizes tab-hosted extension pages (such as rules.html opened as a full tab)', () => {
            const rulesTabSender = {
                id: 'mock-ext-id',
                url: 'chrome-extension://mock-ext-id/src/ui/pages/rules/rules.html',
                tab: {
                    id: 25,
                    url: 'chrome-extension://mock-ext-id/src/ui/pages/rules/rules.html',
                },
            };

            vm.runInContext('globalThis.__testInternalExecuted = false;', context);
            onMessageListener({ action: 'testInternalAction' }, rulesTabSender, () => {});

            assert.equal(vm.runInContext('globalThis.__testInternalExecuted', context), true);
        });

        it('authorizes an extension frame embedded in a web tab (the omnibar)', () => {
            const omnibarFrameSender = {
                id: 'mock-ext-id',
                url: 'chrome-extension://mock-ext-id/src/utils/hint/omnibar-frame.html?n=abc',
                origin: 'chrome-extension://mock-ext-id',
                tab: { id: 31, url: 'https://example.com/' },
            };

            vm.runInContext('globalThis.__testInternalExecuted = false;', context);
            onMessageListener({ action: 'testInternalAction' }, omnibarFrameSender, () => {});

            assert.equal(vm.runInContext('globalThis.__testInternalExecuted', context), true);
        });

        it('still refuses a content script in that same tab', () => {
            let capturedResponse = null;
            const contentScriptSender = {
                id: 'mock-ext-id',
                url: 'https://example.com/',
                origin: 'https://example.com',
                tab: { id: 31, url: 'https://example.com/' },
            };

            onMessageListener({ action: 'getHistory' }, contentScriptSender, (res) => {
                capturedResponse = res;
            });

            assert.equal(capturedResponse?.error, 'Unauthorized sender');
        });

        it('authorizes content scripts for allowed shortcut and hint actions', () => {
            const shortcutActions = [
                'backupAllGroupsFromKey',
                'restoreAllGroupsFromKey',
                'createRuleFromShortcut',
                'openAddToRuleFromShortcut',
                'openPopupWindow',
                'openSidePanel',
                'toggleLinkPreviewFromKey',
                'toggleAutoPipFromKey',
                'captureFromShortcut',
                'captureGroupFromShortcut',
                'captureAreaFromShortcut',
            ];

            const allowedSet = vm.runInContext('ALLOWED_CONTENT_SCRIPT_ACTIONS', context);
            for (const action of shortcutActions) {
                assert.ok(
                    allowedSet.has(action),
                    `Shortcut action "${action}" must be in ALLOWED_CONTENT_SCRIPT_ACTIONS`,
                );
            }
        });

        it('disconnects unauthorized port connections in chrome.runtime.onConnect', () => {
            let disconnected = false;
            const unauthorizedPort = {
                name: 'popup-connection',
                sender: {
                    id: 'mock-ext-id',
                    url: 'https://untrusted-site.com',
                    tab: { id: 8, url: 'https://untrusted-site.com' },
                },
                disconnect: () => {
                    disconnected = true;
                },
                onDisconnect: { addListener: () => {} },
            };

            onConnectListener(unauthorizedPort);
            assert.equal(disconnected, true, 'Port from untrusted sender must be immediately disconnected');
        });

        it('leaves alone a content script port addressed to another extension context', () => {
            let disconnected = false;
            // The omnibar's host opens this one to its own frame; it is not the worker's.
            const omnibarPort = {
                name: 'itg-omnibar:0f2abd8cb86bf6a5',
                sender: {
                    id: 'mock-ext-id',
                    url: 'https://example.com/',
                    tab: { id: 8, url: 'https://example.com/' },
                },
                disconnect: () => {
                    disconnected = true;
                },
                onMessage: { addListener: () => {} },
                onDisconnect: { addListener: () => {} },
            };

            onConnectListener(omnibarPort);
            assert.equal(disconnected, false, 'A port the worker does not answer must not be closed by it');
        });
    });

    describe('2. Web Activity Privacy & Incognito Isolation (web-activity.js)', () => {
        let lastQueriedTab = null;
        let webActivityContext = null;

        const chromeMock = {
            idle: { queryState: (sec, cb) => cb('active') },
            windows: { getLastFocused: async () => ({ focused: true, id: 1 }) },
            tabs: {
                query: async () => (lastQueriedTab ? [lastQueriedTab] : []),
            },
            storage: {
                local: { get: async () => ({}), set: async () => {} },
                session: { get: async () => ({}), set: async () => {} },
            },
        };

        webActivityContext = {
            console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
            URL,
            Map,
            Set,
            setTimeout,
            clearTimeout,
            Date,
            ITG_WEB_ACTIVITY: {
                KEYS: { SETTINGS: 'wa:settings' },
                DEFAULT_SETTINGS: { enabled: true, idleSeconds: 60, countAudible: true, ignoredDomains: [] },
                domainOf: (url) => {
                    try {
                        return new URL(url).hostname;
                    } catch {
                        return null;
                    }
                },
            },
            chrome: createTargetProxy(chromeMock),
        };

        vm.createContext(webActivityContext);
        vm.runInContext(readFileSync('src/core/background/handlers/web-activity.js', 'utf8'), webActivityContext);

        it('waResolveActiveContext returns null when active tab is incognito', async () => {
            lastQueriedTab = { id: 201, url: 'https://private.com', title: 'Private', incognito: true };
            const res = await vm.runInContext(
                'waResolveActiveContext({ enabled: true, idleSeconds: 60, countAudible: true, ignoredDomains: [] })',
                webActivityContext,
            );
            assert.equal(res, null, 'Incognito active tab must return null to isolate private browsing');
        });

        it('waResolveActiveContext returns domain context when active tab is normal', async () => {
            lastQueriedTab = { id: 202, url: 'https://example.com/page', title: 'Example', incognito: false };
            const res = await vm.runInContext(
                'waResolveActiveContext({ enabled: true, idleSeconds: 60, countAudible: true, ignoredDomains: [] })',
                webActivityContext,
            );
            assert.ok(res !== null);
            assert.equal(res.domain, 'example.com');
            assert.equal(res.tabId, 202);
        });

        it('waAudibleContext returns null when audible tab is incognito', async () => {
            lastQueriedTab = { id: 203, url: 'https://media.com', title: 'Music', incognito: true };
            const res = await vm.runInContext('waAudibleContext({ ignoredDomains: [] })', webActivityContext);
            assert.equal(res, null, 'Audible incognito tab must return null');
        });

        it('waAudibleContext returns domain context when audible tab is normal', async () => {
            lastQueriedTab = { id: 204, url: 'https://youtube.com/watch', title: 'Video', incognito: false };
            const res = await vm.runInContext('waAudibleContext({ ignoredDomains: [] })', webActivityContext);
            assert.ok(res !== null);
            assert.equal(res.domain, 'youtube.com');
        });
    });

    describe('3. Note Upload XSS Sanitization (noteHtml.js)', () => {
        const dom = new JSDOM();
        global.DOMParser = dom.window.DOMParser;
        global.Node = dom.window.Node;

        it('escapeHtml escapes dangerous HTML characters to prevent XSS', () => {
            const maliciousFilename = '<img src=x onerror=alert(1)>.png';
            const escaped = escapeHtml(maliciousFilename);
            assert.equal(escaped, '&lt;img src=x onerror=alert(1)&gt;.png');

            const payloadWithQuotes = 'Hello "world" & \'test\' <script>';
            assert.equal(escapeHtml(payloadWithQuotes), 'Hello &quot;world&quot; &amp; &#39;test&#39; &lt;script&gt;');
        });

        it('sanitizeNoteHtml strips dangerous script tags and event attributes from uploaded HTML', () => {
            const dirty = '<p>Normal text</p><script>alert("hack")</script><a href="javascript:alert(1)">bad link</a>';
            const sanitized = sanitizeNoteHtml(dirty);
            assert.equal(sanitized.includes('<script>'), false);
            assert.equal(sanitized.includes('javascript:'), false);
            assert.ok(sanitized.includes('Normal text'));
        });
    });

    describe('4. Custom Rules Tab Aggregation and Localhost Matching (groupManager.js)', () => {
        let groupManagerContext = null;

        groupManagerContext = {
            console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
            URL,
            Map,
            Set,
            setTimeout,
            clearTimeout,
            Date,
            chrome: {
                runtime: { sendMessage: () => {}, id: 'test-id' },
                storage: { local: {}, sync: {}, session: {} },
            },
        };

        vm.createContext(groupManagerContext);
        vm.runInContext(readFileSync('src/core/background/state.js', 'utf8'), groupManagerContext);
        vm.runInContext(readFileSync('src/core/background/utils.js', 'utf8'), groupManagerContext);
        vm.runInContext(readFileSync('src/core/background/group-analyzer.js', 'utf8'), groupManagerContext);
        vm.runInContext(readFileSync('src/core/background/groupManager.js', 'utf8'), groupManagerContext);

        it('applyCustomRules aggregates matching tabs when multiple distinct rules share the same groupName', () => {
            const testTabs = [
                { id: 1, url: 'https://github.com/project', pinned: false },
                { id: 2, url: 'https://gitlab.com/project', pinned: false },
                { id: 3, url: 'https://random.com', pinned: false },
            ];

            const rulesWithDuplicateName = [
                { name: 'DevTools', urls: ['github.com'], active: true },
                { name: 'DevTools', urls: ['gitlab.com'], active: true },
            ];

            groupManagerContext.tabs = testTabs;
            groupManagerContext.rules = rulesWithDuplicateName;

            const result = vm.runInContext('applyCustomRules(tabs, rules)', groupManagerContext);
            assert.ok(result.customGroupTabs['DevTools'], 'DevTools group should exist');
            assert.equal(
                result.customGroupTabs['DevTools'].length,
                2,
                'Both matching tabs must be merged into the duplicate group name',
            );
            assert.deepEqual([...result.customGroupTabs['DevTools'].map((t) => t.id)], [1, 2]);
            assert.equal(result.groupedTabIds.has(1), true);
            assert.equal(result.groupedTabIds.has(2), true);
            assert.equal(result.groupedTabIds.has(3), false);
        });

        it('isLocalhost matches standard loopback and bracketed/unbracketed IPv6 loopback', () => {
            assert.equal(vm.runInContext('isLocalhost("localhost")', groupManagerContext), true);
            assert.equal(vm.runInContext('isLocalhost("127.0.0.1")', groupManagerContext), true);
            assert.equal(vm.runInContext('isLocalhost("::1")', groupManagerContext), true);
            assert.equal(vm.runInContext('isLocalhost("[::1]")', groupManagerContext), true);
            assert.equal(vm.runInContext('isLocalhost("example.com")', groupManagerContext), false);
        });
    });

    describe('5. I18n Named Placeholders and Spanish Cascading (utils.js & i18n.js)', () => {
        it('getI18nMsg in utils.js replaces named placeholders ($TITLE$, $COUNT$)', () => {
            const utilsContext = {
                console: { log: () => {}, error: () => {}, warn: () => {} },
                URL,
                Map,
                Set,
                setTimeout,
                clearTimeout,
                Date,
                chrome: {
                    runtime: { sendMessage: () => {} },
                    storage: { local: {}, sync: {}, session: {} },
                    i18n: { getMessage: () => '' },
                },
            };

            vm.createContext(utilsContext);
            vm.runInContext(readFileSync('src/core/background/state.js', 'utf8'), utilsContext);
            vm.runInContext(readFileSync('src/core/background/utils.js', 'utf8'), utilsContext);

            vm.runInContext(
                `
                currentLangMessages['notification_tabs_grouped'] = {
                    message: 'Group $TITLE$ organized with $COUNT$ tabs.',
                    placeholders: {
                        title: { content: 'Research' },
                        count: { content: '7' }
                    }
                };
            `,
                utilsContext,
            );

            const formatted = vm.runInContext("getI18nMsg('notification_tabs_grouped')", utilsContext);
            assert.equal(formatted, 'Group Research organized with 7 tabs.');
        });

        it('loadMessages cascades Spanish translations over the English base catalog', async () => {
            const storage = {};
            global.localStorage = {
                getItem: (k) => storage[k] || null,
                setItem: (k, v) => {
                    storage[k] = v;
                },
            };

            global.chrome = {
                runtime: {
                    getURL: (path) => path,
                },
            };

            global.fetch = async (url) => {
                if (url.includes('/en/')) {
                    return {
                        ok: true,
                        json: async () => ({
                            greeting: { message: 'Hello' },
                            english_only_key: { message: 'Only in English' },
                        }),
                    };
                }
                if (url.includes('/es/')) {
                    return {
                        ok: true,
                        json: async () => ({
                            greeting: { message: 'Hola' },
                        }),
                    };
                }
                return { ok: false };
            };

            const esCatalog = await loadMessages('es');
            assert.equal(esCatalog.greeting.message, 'Hola', 'Spanish overrides English when key exists');
            assert.equal(
                esCatalog.english_only_key.message,
                'Only in English',
                'English string preserved when missing in Spanish catalog',
            );
        });
    });
});
