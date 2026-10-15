/**
 * `runtime.onInstalled` with reason `install` also fires on a reinstall and on a second
 * device of the same Chrome profile, where `storage.sync` already holds the user's rules
 * and settings. The defaults must fill only what is missing there.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('src/core/background/stateManager.js', 'utf8');
const start = src.indexOf('async function setupDefaultSettings');
const fnSrc = src.slice(start, src.indexOf('async function checkSchedules', start));

function area(initial = {}) {
    const data = structuredClone(initial);
    return {
        data,
        writes: [],
        async get(keys) {
            const out = {};
            for (const k of keys) if (data[k] !== undefined) out[k] = structuredClone(data[k]);
            return out;
        },
        async set(obj) {
            this.writes.push(structuredClone(obj));
            Object.assign(data, structuredClone(obj));
        },
    };
}

async function install({ sync = {}, local = {} } = {}) {
    const s = area(sync);
    const l = area(local);
    const ctx = {
        console,
        logMessage: () => {},
        DEFAULT_USER_PREFIXES: { a: '1' },
        INACTIVITY_THRESHOLD_INACTIVE_GROUP: 10,
        INACTIVITY_THRESHOLD_ACTIVE_GROUP: 20,
        DEFAULT_CLUSTER_CONFIG: { subdomainsEnabled: false, domainsEnabled: true },
        DEFAULT_SYSTEM_THEME: 'system',
        chrome: { storage: { sync: s, local: l } },
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc + '\nglobalThis.__setup = setupDefaultSettings;', ctx);
    await ctx.__setup();
    return { sync: s.data, local: l.data, syncWrites: s.writes };
}

describe('setupDefaultSettings', () => {
    it('writes every default on a genuinely fresh install', async () => {
        const { sync, local } = await install();
        assert.deepEqual(sync.customRules, []);
        assert.equal(sync.clusteringEnabled, true);
        assert.equal(sync.linkPreviewEnabled, true);
        assert.deepEqual(sync.clusterConfig, { subdomainsEnabled: false, domainsEnabled: true });
        assert.equal(sync.allowRightClickEnabled, true);
        assert.deepEqual(local, { ...sync, ruleStorageArea: 'sync' });
    });

    it('keeps the rules and settings sync already holds, and fills in only the rest', async () => {
        const rules = [{ name: 'Work', urls: ['https://example.com'] }];
        const { sync, local, syncWrites } = await install({
            sync: { customRules: rules, clusteringEnabled: false, activeTheme: 'dark' },
        });
        assert.deepEqual(sync.customRules, rules);
        assert.equal(sync.clusteringEnabled, false);
        assert.equal(sync.activeTheme, 'dark');
        for (const write of syncWrites) {
            assert.ok(!('customRules' in write), 'the synced rules are never rewritten');
        }
        assert.equal(sync.linkPreviewEnabled, true, 'missing keys still get their default');
        assert.deepEqual(local.customRules, rules, 'local starts from what sync has');
        assert.equal(local.clusteringEnabled, false);
    });

    it('writes nothing to sync when every setting is already there', async () => {
        const full = await install();
        const { syncWrites } = await install({ sync: full.sync, local: full.local });
        assert.equal(syncWrites.length, 0);
    });
});
