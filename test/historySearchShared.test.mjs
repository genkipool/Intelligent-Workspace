/**
 * History searches in the worker: the same search asked for again while it runs, or a
 * moment after it finished, reuses it instead of queueing another multi-second query
 * behind it. Deletions throw the kept answers away.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadHistoryHandlers({ search }) {
    const listeners = { onVisitRemoved: [] };
    let now = 1_000_000;
    const context = {
        console,
        JSON,
        Map,
        Promise,
        Date: { now: () => now },
        chrome: {
            history: {
                search,
                deleteUrl: async () => {},
                onVisitRemoved: { addListener: (fn) => listeners.onVisitRemoved.push(fn) },
            },
        },
    };
    vm.createContext(context);
    vm.runInContext(
        readFileSync(new URL('../src/core/background/handlers/history.js', import.meta.url), 'utf8'),
        context,
    );
    const ask = (message = {}) => new Promise((resolve) => context.handleGetHistory(message, resolve));
    return {
        ask,
        del: (urls) => new Promise((resolve) => context.handleDeleteHistoryUrls({ urls }, resolve)),
        advance: (ms) => (now += ms),
        visitRemoved: () => listeners.onVisitRemoved.forEach((fn) => fn({ allHistory: false, urls: [] })),
    };
}

function countingSearch() {
    const calls = [];
    const search = (options) => {
        calls.push(options);
        return new Promise((resolve) => setTimeout(() => resolve([{ url: `https://example.com/${calls.length}` }]), 5));
    };
    return { calls, search };
}

describe('history search sharing', () => {
    it('answers requests that arrive together with one search', async () => {
        const { calls, search } = countingSearch();
        const w = loadHistoryHandlers({ search });
        const answers = await Promise.all([w.ask(), w.ask({ query: '' }), w.ask({ startTime: null, endTime: null })]);
        assert.equal(calls.length, 1);
        // Built inside the vm context, so compared as data rather than by prototype.
        assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { text: '', maxResults: 1000, startTime: 0 });
        for (const a of answers) assert.equal(a.success, true);
    });

    it('reuses a finished answer for a few seconds, then searches again', async () => {
        const { calls, search } = countingSearch();
        const w = loadHistoryHandlers({ search });
        await w.ask();
        w.advance(3000);
        await w.ask();
        assert.equal(calls.length, 1, 'hover then click reuses the prefetch');
        w.advance(10000);
        await w.ask();
        assert.equal(calls.length, 2, 'an old answer is not served');
    });

    it('does not share between different queries or ranges', async () => {
        const { calls, search } = countingSearch();
        const w = loadHistoryHandlers({ search });
        await Promise.all([w.ask(), w.ask({ query: 'git' }), w.ask({ startTime: 1, endTime: 2 })]);
        assert.equal(calls.length, 3);
    });

    it('forgets kept answers when history is deleted', async () => {
        const { calls, search } = countingSearch();
        const w = loadHistoryHandlers({ search });
        await w.ask();
        w.visitRemoved();
        await w.ask();
        assert.equal(calls.length, 2, 'onVisitRemoved clears the cache');
        await w.del(['https://example.com/1']);
        await w.ask();
        assert.equal(calls.length, 3, 'deleting through the extension clears it at once');
    });

    it('does not keep a failed search', async () => {
        let fail = true;
        let calls = 0;
        const w = loadHistoryHandlers({
            search: async () => {
                calls++;
                if (fail) throw new Error('boom');
                return [];
            },
        });
        const first = await w.ask();
        assert.equal(first.success, false);
        fail = false;
        const second = await w.ask();
        assert.equal(second.success, true);
        assert.equal(calls, 2);
    });
});
