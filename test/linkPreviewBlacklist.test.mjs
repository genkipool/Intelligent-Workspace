/**
 * The link-preview blacklist is read, changed and written back whole to `chrome.storage.sync`.
 * Changes that overlapped used to lose each other's domains, and a failed write (the sync
 * quota) left the caller without an answer and the worker with an unhandled rejection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const gm = readFileSync('src/core/background/groupManager.js', 'utf8');
const msgSrc = readFileSync('src/core/background/messaging.js', 'utf8');

function sliceBlock(src, start) {
    let depth = 0;
    let i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) break;
    }
    return src.slice(start, i + 1);
}

function load({ quota = Infinity } = {}) {
    const helperStart = gm.indexOf('let linkPreviewBlacklistChain');
    const helper = gm.slice(helperStart, gm.indexOf('async function addLinkPreviewBlacklistDomain'));
    const fns = ['addLinkPreviewBlacklistDomain', 'removeLinkPreviewBlacklistDomain', 'editLinkPreviewBlacklistDomain']
        .map((n) => sliceBlock(gm, gm.indexOf('async function ' + n)))
        .join('\n');
    const handlers = ['addLinkPreviewBlacklist', 'removeLinkPreviewBlacklist', 'editLinkPreviewBlacklist']
        .map((n) => sliceBlock(msgSrc, msgSrc.indexOf(`    ${n}: (message`)))
        .join(',\n');

    const data = {};
    const tick = () => new Promise((r) => setTimeout(r, 1));
    const sandbox = {
        console,
        Promise,
        Set,
        setTimeout,
        getI18nMsg: (k) => k,
        chrome: {
            storage: {
                sync: {
                    get: async () => {
                        await tick();
                        return structuredClone({ linkPreviewBlacklist: data.linkPreviewBlacklist });
                    },
                    set: async (o) => {
                        await tick();
                        if (JSON.stringify(o.linkPreviewBlacklist).length > quota) {
                            throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
                        }
                        Object.assign(data, structuredClone(o));
                    },
                },
            },
            notifications: { create: () => {} },
            runtime: { sendMessage: () => {} },
            tabs: { query: async () => [], sendMessage: async () => {} },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${helper}\n${fns}\nglobalThis.H = {${handlers}};`, sandbox);
    const send = (action, message) => new Promise((resolve) => sandbox.H[action](message, {}, resolve));
    return { data, send };
}

describe('link-preview blacklist changes', () => {
    it('keeps every domain when several are added at once', async () => {
        const { data, send } = load();
        await Promise.all(['a.com', 'b.com', 'c.com'].map((domain) => send('addLinkPreviewBlacklist', { domain })));
        assert.deepEqual([...data.linkPreviewBlacklist].sort(), ['a.com', 'b.com', 'c.com']);
    });

    it('applies add, edit and remove in the order they were asked for', async () => {
        const { data, send } = load();
        await Promise.all([
            send('addLinkPreviewBlacklist', { domain: 'a.com' }),
            send('addLinkPreviewBlacklist', { domain: 'b.com' }),
            send('editLinkPreviewBlacklist', { oldDomain: 'a.com', newDomain: 'z.com' }),
            send('removeLinkPreviewBlacklist', { domain: 'b.com' }),
        ]);
        assert.deepEqual([...data.linkPreviewBlacklist], ['z.com']);
    });

    it('answers with the error when the write fails, and later changes still run', async () => {
        const { data, send } = load({ quota: 100 });
        let unhandled = null;
        const onUnhandled = (e) => (unhandled = e);
        process.on('unhandledRejection', onUnhandled);
        try {
            const failed = await send('addLinkPreviewBlacklist', { domain: 'x'.repeat(200) + '.com' });
            assert.equal(failed.success, false);
            assert.match(failed.error, /quota/i);
            const ok = await send('addLinkPreviewBlacklist', { domain: 'a.com' });
            assert.equal(ok.success, true);
            assert.deepEqual([...data.linkPreviewBlacklist], ['a.com']);
            await new Promise((r) => setTimeout(r, 10));
            assert.equal(unhandled, null);
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });
});
