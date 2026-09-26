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
