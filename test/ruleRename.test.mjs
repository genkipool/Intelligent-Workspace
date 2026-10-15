/**
 * Renaming a rule: the name checks the card's inline rename shares with the modal, and
 * the worker re-filing the notes and captures kept under the rule's old name.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { validateRule, validateRuleName, validateImportedRules } from '../src/ui/pages/rules/ruleValidation.js';

const root = new URL('../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');

describe('validateRuleName', () => {
    const rules = [
        { name: 'Alpha', color: 'blue', urls: ['https://a.example'], active: true },
        { name: 'Bar', color: 'red', urls: ['https://b.example'], active: true },
    ];

    it('refuses a name that differs from another only in case', () => {
        assert.equal(validateRuleName('bar', rules, 0).message, 'duplicateRuleName');
    });

    it('accepts a case-only change of the rule itself', () => {
        assert.equal(validateRuleName('alpha', rules, 0).valid, true);
    });

    it('refuses names that are too long or hold whitespace', () => {
        assert.equal(validateRuleName('x'.repeat(17), rules, 0).message, 'ruleNameTooLongError');
        assert.equal(validateRuleName('Two words', rules, 0).message, 'ruleNameNoSpacesError');
        assert.equal(validateRuleName('Tab\tname', rules, 0).message, 'ruleNameNoSpacesError');
        assert.equal(validateRuleName('', rules, 0).message, 'enterRuleName');
    });

    it('accepts a valid new name', () => {
        assert.deepEqual(validateRuleName('Gamma', rules, 0), { valid: true });
    });
});

describe('validateRule refuses whitespace in the name', () => {
    it('a pasted "Two words" no longer passes the modal', () => {
        const result = validateRule('Two words', 'red', ['https://two.example'], [], -1);
        assert.equal(result.message, 'ruleNameNoSpacesError');
        assert.deepEqual(result.params, ['Two words']);
    });

    it('an overwrite import reports a spaced name once, not twice', () => {
        const file = {
            customRules: [{ name: 'Two words', color: 'red', urls: ['https://two.example'], active: true }],
        };
        const { errors } = validateImportedRules(file, [], 'overwrite');
        assert.deepEqual(
            errors.map((e) => e.message),
            ['ruleNameNoSpacesError'],
        );
    });
});

function loadNotesHandler(stores) {
    const context = {
        console,
        groupInfoMap: new Map([[7, { type: 'rule', key: 'Docs2' }]]),
        NOTES_STORE_NAME: 'notesStore',
        STORE_NAME: 'screenshots',
        // A minimal IndexedDB: one cursor walking an in-memory array.
        openDb: async () => ({
            transaction([name]) {
                const records = stores[name];
                const tx = {};
                const request = {};
                let i = 0;
                const step = () =>
                    setTimeout(() => {
                        if (i >= records.length) {
                            request.onsuccess({ target: { result: null } });
                            tx.oncomplete();
                            return;
                        }
                        const at = i;
                        request.onsuccess({
                            target: {
                                result: {
                                    value: records[at],
                                    update: (value) => (records[at] = value),
                                    continue: () => {
                                        i++;
                                        step();
                                    },
                                },
                            },
                        });
                    });
                tx.objectStore = () => ({
                    openCursor: () => {
                        step();
                        return request;
                    },
                });
                return tx;
            },
        }),
    };
    vm.createContext(context);
    vm.runInContext(read('src/core/background/handlers/notes.js'), context);
    vm.runInContext(
        read('src/core/background/handlers/screenshots.js').match(/function rekeyScreenshotsForRule[\s\S]*?\n}\n/)[0],
        context,
    );
    return context;
}

describe('rekeyRuleContextKey', () => {
    const { rekeyRuleContextKey } = loadNotesHandler({});

    it('moves the group key and the domain keys of the rule', () => {
        assert.equal(rekeyRuleContextKey('g_Doc', 'Doc', 'Paper', []), 'g_Paper');
        assert.equal(rekeyRuleContextKey('s_Doc_example.com', 'Doc', 'Paper', []), 's_Paper_example.com');
    });

    it('leaves the keys of another rule alone', () => {
        assert.equal(rekeyRuleContextKey('g_Docs', 'Doc', 'Paper', []), null);
        assert.equal(rekeyRuleContextKey('s_Docs_example.com', 'Doc', 'Paper', []), null);
        assert.equal(rekeyRuleContextKey('s_Doc_x_example.com', 'Doc', 'Paper', ['Doc_x']), null);
        assert.equal(rekeyRuleContextKey('g_ungrouped', 'Doc', 'Paper', []), null);
        assert.equal(rekeyRuleContextKey(undefined, 'Doc', 'Paper', []), null);
    });
});

describe('handleRenameRuleContext', () => {
    it('re-files notes and captures, touches nothing else, and is idempotent', async () => {
        const stores = {
            notesStore: [
                { id: 1, contextKey: 'g_Docs' },
                { id: 2, contextKey: 'g_Docs2x' },
                { id: 3, contextKey: 's_Docs_example.com' },
                { id: 4, contextKey: 'g_general' },
            ],
            screenshots: [
                { id: 5, contextKey: 's_Docs_example.com', dataUrl: 'data:' },
                { id: 6, contextKey: 'g_Doc' },
            ],
        };
        const ctx = loadNotesHandler(stores);
        const call = (message) =>
            new Promise((resolve) => ctx.handleRenameRuleContext(message, {}, (r) => resolve({ ...r })));

        const first = await call({ oldName: 'Docs', newName: 'Docs2', ruleNames: ['Docs2'] });
        assert.deepEqual(first, { success: true, notes: 2, screenshots: 1 });
        assert.deepEqual(
            [...stores.notesStore.map((n) => n.contextKey)],
            ['g_Docs2', 'g_Docs2x', 's_Docs2_example.com', 'g_general'],
        );
        assert.deepEqual([...stores.screenshots.map((s) => s.contextKey)], ['s_Docs2_example.com', 'g_Doc']);
        assert.equal(stores.screenshots[0].dataUrl, 'data:');

        const again = await call({ oldName: 'Docs', newName: 'Docs2', ruleNames: ['Docs2'] });
        assert.deepEqual(again, { success: true, notes: 0, screenshots: 0 });
    });

    it('refuses a message without both names', async () => {
        const ctx = loadNotesHandler({ notesStore: [], screenshots: [] });
        const response = await new Promise((resolve) => ctx.handleRenameRuleContext({ oldName: 'A' }, {}, resolve));
        assert.equal(response.success, false);
    });
});

describe('renameRuleContext is for extension pages only', () => {
    it('is a handler but not an action content scripts may send', () => {
        const messaging = read('src/core/background/messaging.js');
        const allowed = messaging.match(/ALLOWED_CONTENT_SCRIPT_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)[1];
        assert.ok(!allowed.includes("'renameRuleContext'"));
        assert.match(messaging, /renameRuleContext: \(message, sender, sendResponse\) => \{/);
    });
});
