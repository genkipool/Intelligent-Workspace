/**
 * Alt + letter belongs to the page unless it can lead to a group.
 *
 * The Alt sequence (Alt + group prefix + tab number + Enter) used to take every
 * Alt+letter, so a site's own Alt shortcuts and accesskeys never worked. The page script
 * now asks the worker for the window's group titles and only takes a letter that can
 * still match one, the way handleNavigateToGroupTab matches in the end.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadGroupsHandlers(groups) {
    const sandbox = {
        console,
        chrome: {
            windows: { getLastFocused: async () => ({ id: 1 }) },
            tabGroups: {
                query: async ({ windowId } = {}) => groups.filter((g) => !windowId || g.windowId === windowId),
            },
        },
        displayGroupTitle: (g) => (g.title || '').replace(/[​]/g, ''),
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync('src/core/background/handlers/groups.js', 'utf8'), sandbox);
    return sandbox;
}

function loadCanMatch() {
    const source = fs.readFileSync('src/utils/hint/main.js', 'utf8');
    const body = /\n {4}_altSequenceCanMatch\(sequence\) \{[\s\S]*?\n {4}\}\n/.exec(source)[0];
    return vm.runInNewContext(`({ ${body.trim()} })`);
}

describe('Alt sequence pass-through', () => {
    it('lists the cleaned titles of the sender window', async () => {
        const sandbox = loadGroupsHandlers([
            { id: 1, windowId: 1, title: '​Góogle​' },
            { id: 2, windowId: 1, title: 'Work' },
            { id: 3, windowId: 2, title: 'Other window' },
        ]);
        const response = await new Promise((resolve) =>
            sandbox.handleGetGroupTitlesForNavigation({}, { tab: { windowId: 1 } }, resolve),
        );
        assert.equal(response.success, true);
        assert.ok(response.titles.includes('google'));
        assert.ok(response.titles.includes('work'));
        assert.ok(!response.titles.some((t) => t.includes('other')));
    });

    it('takes only letters that can still name a group', () => {
        const main = loadCanMatch();
        main._altGroupTitles = ['google', 'work'];
        assert.equal(main._altSequenceCanMatch('g'), true);
        assert.equal(main._altSequenceCanMatch('gle'), true); // subsequence, as the jump matches
        assert.equal(main._altSequenceCanMatch('w2'), true);
        assert.equal(main._altSequenceCanMatch('f'), false);
        assert.equal(main._altSequenceCanMatch('wz'), false);
        assert.equal(main._altSequenceCanMatch('1'), false); // a tab number needs a group first
    });

    it('takes every letter until the titles are known, as before', () => {
        const main = loadCanMatch();
        main._altGroupTitles = null;
        assert.equal(main._altSequenceCanMatch('f'), true);
    });

    it('takes nothing when the window has no groups', () => {
        const main = loadCanMatch();
        main._altGroupTitles = [];
        assert.equal(main._altSequenceCanMatch('g'), false);
    });
});
