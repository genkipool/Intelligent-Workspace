/**
 * Sorting the groups of a window: `planGroupSortMoves` must leave the strip exactly
 * as the one-by-one placement it replaced did, with never more moves. Every move is
 * a write Chrome syncs to the user's other devices, so the count matters.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = {
    console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
    URL,
    Map,
    Set,
    setTimeout,
    clearTimeout,
    Date,
    chrome: { runtime: { sendMessage: () => {}, id: 'test-id' }, storage: { local: {}, sync: {}, session: {} } },
};
vm.createContext(context);
for (const file of ['state.js', 'utils.js', 'group-analyzer.js', 'groupManager.js']) {
    vm.runInContext(readFileSync(`src/core/background/${file}`, 'utf8'), context);
}
const plan = (blocks, ideal, start) =>
    JSON.parse(JSON.stringify(context.planGroupSortMoves(structuredClone(blocks), ideal, start)));

/** The placement used before: every group not at the running index is moved there. */
function previousPlan(blocks, idealIds, startIndex) {
    blocks = structuredClone(blocks);
    const moves = [];
    const startOfBlock = (p) => blocks.slice(0, p).reduce((i, b) => i + b.size, startIndex);
    let currentIndex = startIndex;
    for (const id of idealIds) {
        const from = blocks.findIndex((b) => b.groupId === id);
        const size = blocks[from].size;
        if (startOfBlock(from) !== currentIndex) {
            const [block] = blocks.splice(from, 1);
            let to = 0;
            let index = startIndex;
            while (to < blocks.length && index < currentIndex) index += blocks[to++].size;
            blocks.splice(to, 0, block);
            moves.push({ groupId: id, index: currentIndex });
        }
        currentIndex += size;
    }
    return moves;
}

/** Plays moves on a strip of tab ids the way Chrome does: `index` is where the group's first tab lands. */
function play(blocks, moves, startIndex) {
    let strip = [];
    let tabId = 0;
    for (const b of blocks) for (let i = 0; i < b.size; i++) strip.push({ id: tabId++, groupId: b.groupId });
    for (const { groupId, index } of moves) {
        const moving = strip.filter((t) => t.groupId === groupId);
        strip = strip.filter((t) => t.groupId !== groupId);
        strip.splice(index - startIndex, 0, ...moving);
    }
    return strip.map((t) => `${t.groupId}:${t.id}`).join(' ');
}

function randomStrip(rand, groups, loose, packed) {
    const blocks = [];
    for (let g = 0; g < groups; g++) blocks.push({ groupId: 100 + g, size: 1 + Math.floor(rand() * 4) });
    for (let i = blocks.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    }
    for (let l = 0; l < loose; l++) {
        const at = packed ? blocks.length : Math.floor(rand() * (blocks.length + 1));
        blocks.splice(at, 0, { groupId: -1, size: 1 });
    }
    const ideal = blocks.filter((b) => b.groupId !== -1).map((b) => b.groupId);
    ideal.sort(() => rand() - 0.5);
    return { blocks, ideal };
}

describe('planGroupSortMoves', () => {
    it('a new group at the front costs one move, not one per group behind it', () => {
        const blocks = [
            { groupId: 5, size: 2 },
            { groupId: 1, size: 2 },
            { groupId: 2, size: 2 },
            { groupId: 3, size: 2 },
            { groupId: 4, size: 2 },
        ];
        const ideal = [1, 2, 3, 5, 4];
        const moves = plan(blocks, ideal, 0);
        assert.equal(moves.length, 1);
        assert.equal(previousPlan(blocks, ideal, 0).length, 3);
        assert.equal(play(blocks, moves, 0), play(blocks, previousPlan(blocks, ideal, 0), 0));
    });

    it('a strip already in order is left alone', () => {
        const blocks = [
            { groupId: 1, size: 3 },
            { groupId: 2, size: 1 },
            { groupId: -1, size: 1 },
        ];
        assert.deepEqual(plan(blocks, [1, 2], 2), []);
    });

    it('ends in the same strip as before, never with more moves (5000 random strips)', () => {
        let seed = 42;
        const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        let saved = 0;
        for (let n = 0; n < 5000; n++) {
            const { blocks, ideal } = randomStrip(
                rand,
                1 + Math.floor(rand() * 9),
                Math.floor(rand() * 4),
                rand() < 0.7,
            );
            const start = Math.floor(rand() * 3);
            const before = previousPlan(blocks, ideal, start);
            const after = plan(blocks, ideal, start);
            assert.equal(play(blocks, after, start), play(blocks, before, start), JSON.stringify({ blocks, ideal }));
            assert.ok(after.length <= before.length, JSON.stringify({ blocks, ideal, before, after }));
            saved += before.length - after.length;
        }
        assert.ok(saved > 0);
    });
});
