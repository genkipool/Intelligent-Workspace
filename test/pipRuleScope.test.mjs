/**
 * The floating player's framing rules must never reach the tab that asked for them.
 *
 * That tab is the web page the float was opened from, and the page chooses the URL.
 * With its own tab in `tabIds`, the page could frame that site itself with the
 * framing headers stripped and the site's cookies replayed into the frame — measured
 * in a real browser against a page sending `X-Frame-Options: DENY`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SENDER = 10;
const PIP = 77;

function loadDnr(tabs) {
    const dnrCode = readFileSync('src/core/background/handlers/dnr.js', 'utf8');
    const state = { rules: null };
    const sandbox = {
        console,
        URL,
        Set,
        setTimeout,
        SIDEPANEL_RULE_ID: 1,
        chrome: {
            declarativeNetRequest: {
                updateSessionRules: async (options) => {
                    state.rules = options.addRules;
                },
            },
            cookies: { getAll: async () => [{ name: 'session', value: 'secret' }] },
            tabs: {
                get: async (id) => tabs.find((t) => t.id === id),
                query: async () => tabs,
            },
        },
        logMessage: () => {},
    };
    vm.createContext(sandbox);
    vm.runInContext(dnrCode + '\nglobalThis.__prepare = handlePrepareVideoUrlForPip;', sandbox);
    const prepare = (url) =>
        new Promise((resolve) => sandbox.__prepare({ url }, resolve, SENDER)).then(() => state.rules);
    return prepare;
}

describe('PiP framing rules scope', () => {
    it('covers only the float tab, not the page that asked', async () => {
        const prepare = loadDnr([
            { id: SENDER, windowId: 1, url: 'https://attacker.example/' },
            { id: PIP, windowId: 2, openerTabId: SENDER, url: 'about:blank' },
        ]);
        const rules = await prepare('https://victim.example/account');
        assert.equal(rules.length, 2, 'framing rule and cookie rule');
        for (const rule of rules) {
            assert.deepEqual([...rule.condition.tabIds], [PIP]);
            assert.equal(rule.condition.excludedTabIds, undefined);
        }
    });

    it('leaves the requesting tab out when the float cannot be identified', async () => {
        const prepare = loadDnr([{ id: SENDER, windowId: 1, url: 'https://attacker.example/' }]);
        const rules = await prepare('https://victim.example/account');
        for (const rule of rules) {
            assert.equal(rule.condition.tabIds, undefined);
            assert.deepEqual([...rule.condition.excludedTabIds], [SENDER]);
        }
    });
});

/**
 * Opened from another site, the framed page is a third party of the float's document,
 * and its script cannot read its own SameSite=Lax cookies. x.com then reloads itself
 * forever looking for `ct0`. The readable cookies are copied into the opener's
 * partition for the life of the float, and never the HttpOnly ones.
 */
describe('PiP cookie copy into the opener partition', () => {
    function load({ openerUrl }) {
        const dnrCode = readFileSync('src/core/background/handlers/dnr.js', 'utf8');
        const session = {};
        const writes = [];
        const sandbox = {
            console,
            URL,
            Set,
            setTimeout,
            SIDEPANEL_RULE_ID: 1,
            chrome: {
                runtime: { getURL: (p) => `chrome-extension://abc${p}` },
                storage: {
                    session: {
                        get: async (k) => ({ [k]: session[k] }),
                        set: async (o) => Object.assign(session, o),
                        remove: async (k) => delete session[k],
                    },
                },
                declarativeNetRequest: { updateSessionRules: async () => {} },
                cookies: {
                    getAll: async (q) =>
                        q.partitionKey
                            ? writes.filter(
                                  (w) => w.partitionKey.topLevelSite === q.partitionKey.topLevelSite && w.value,
                              )
                            : [
                                  {
                                      name: 'ct0',
                                      value: 'csrf',
                                      path: '/',
                                      domain: '.x.com',
                                      httpOnly: false,
                                      storeId: '0',
                                  },
                                  {
                                      name: 'auth_token',
                                      value: 'secret',
                                      path: '/',
                                      domain: '.x.com',
                                      httpOnly: true,
                                      storeId: '0',
                                  },
                              ],
                    set: async (d) => {
                        writes.push(d);
                        return d;
                    },
                },
                tabs: {
                    get: async () => ({ id: SENDER, windowId: 1, url: openerUrl }),
                    query: async () => [{ id: PIP, windowId: 2, openerTabId: SENDER, url: 'about:blank' }],
                },
            },
            logMessage: () => {},
        };
        vm.createContext(sandbox);
        vm.runInContext(
            dnrCode +
                '\nglobalThis.__prepare = handlePrepareVideoUrlForPip; globalThis.__cleanup = handleCleanupVideoPipRules;',
            sandbox,
        );
        return {
            writes,
            prepare: (url) => new Promise((resolve) => sandbox.__prepare({ url }, resolve, SENDER)),
            cleanup: () => new Promise((resolve) => sandbox.__cleanup(resolve)),
        };
    }

    it('copies the readable cookies into the opener partition, never the HttpOnly ones', async () => {
        const t = load({ openerUrl: 'https://www.as.com/futbol/' });
        await t.prepare('https://x.com/home');
        const copied = t.writes.filter((w) => w.value);
        assert.ok(copied.length > 0);
        for (const w of copied) {
            assert.equal(w.partitionKey.topLevelSite, 'https://as.com');
            assert.equal(w.expirationDate, undefined, 'session cookies only');
        }
        assert.deepEqual([...new Set(copied.map((w) => w.name))], ['ct0']);
    });

    it('copies nothing when the float is opened from the same site', async () => {
        const t = load({ openerUrl: 'https://x.com/explore' });
        await t.prepare('https://x.com/home');
        assert.equal(t.writes.length, 0);
    });

    it('takes the copies back when the float closes', async () => {
        const t = load({ openerUrl: 'https://as.com/' });
        await t.prepare('https://x.com/home');
        const before = t.writes.length;
        await t.cleanup();
        const expired = t.writes.slice(before);
        assert.ok(expired.length > 0);
        for (const w of expired) {
            assert.equal(w.value, '');
            assert.ok(w.expirationDate < Date.now() / 1000);
            assert.equal(w.partitionKey.topLevelSite, 'https://as.com');
        }
    });
});

/**
 * x.com's service worker answers from a cached shell and refreshes it in the background
 * with requests that belong to no tab. Opened from x.com itself, the float needs those
 * refreshes framable; opened from another site, that other site's partition must never
 * get a framable copy.
 */
describe('PiP rule for the site service worker', () => {
    function load(openerUrl) {
        const dnrCode = readFileSync('src/core/background/handlers/dnr.js', 'utf8');
        const state = {};
        const sandbox = {
            console,
            URL,
            Set,
            setTimeout,
            SIDEPANEL_RULE_ID: 1,
            chrome: {
                declarativeNetRequest: {
                    updateSessionRules: async (o) => {
                        state.update = o;
                    },
                },
                cookies: { getAll: async () => [] },
                tabs: {
                    get: async () => ({ id: SENDER, windowId: 1, url: openerUrl }),
                    query: async () => [{ id: PIP, windowId: 2, openerTabId: SENDER, url: 'about:blank' }],
                },
            },
            logMessage: () => {},
        };
        vm.createContext(sandbox);
        vm.runInContext(dnrCode + '\nglobalThis.__prepare = handlePrepareVideoUrlForPip;', sandbox);
        return new Promise((resolve) => sandbox.__prepare({ url: 'https://x.com/home' }, resolve, SENDER)).then(
            () => state.update,
        );
    }

    it('strips framing headers from the worker refreshes when the float is opened from the same site', async () => {
        const update = await load('https://x.com/explore');
        const sw = update.addRules.find((r) => r.id === 7);
        assert.ok(sw, 'service worker rule installed');
        assert.deepEqual([...sw.condition.tabIds], [-1]);
        assert.deepEqual([...sw.condition.requestDomains], ['x.com', 'twitter.com']);
        assert.equal(sw.action.requestHeaders, undefined, 'no cookies or request changes');
        assert.ok(update.removeRuleIds.includes(7));
    });

    it('leaves the worker alone when the float is opened from another site', async () => {
        const update = await load('https://as.com/');
        assert.equal(
            update.addRules.find((r) => r.id === 7),
            undefined,
        );
    });
});
