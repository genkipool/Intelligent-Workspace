import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

describe('Cumulative Clipboard Copy Feature', () => {
    it('asks for clipboardWrite only: the collection is kept, never read back', () => {
        const manifest = JSON.parse(readFileSync(resolve(rootDir, 'manifest.json'), 'utf-8'));
        assert.ok(!manifest.permissions.includes('clipboardRead'), 'clipboardRead must not be requested');
        assert.ok(manifest.permissions.includes('clipboardWrite'), 'manifest.json should include clipboardWrite');
    });

    it('contains hintDesc_y in BUILT_IN_COMMANDS.categoryPage', () => {
        const hintCommonSrc = readFileSync(resolve(rootDir, 'src/utils/hint_common.js'), 'utf-8');
        assert.ok(
            hintCommonSrc.includes("y: 'hintDesc_y'"),
            'HintCommon.BUILT_IN_COMMANDS.categoryPage should include y: hintDesc_y',
        );
        assert.ok(
            hintCommonSrc.includes("APPEND_CLIPBOARD_ENABLED: 'appendClipboardEnabled'"),
            'HintCommon.STORAGE_KEYS should include APPEND_CLIPBOARD_ENABLED',
        );
    });

    it('contains localized messages in English and Spanish', () => {
        const es = JSON.parse(readFileSync(resolve(rootDir, '_locales/es/messages.json'), 'utf-8'));
        const en = JSON.parse(readFileSync(resolve(rootDir, '_locales/en/messages.json'), 'utf-8'));

        assert.ok(es.hintDesc_y?.message, 'es messages should contain hintDesc_y');
        assert.ok(en.hintDesc_y?.message, 'en messages should contain hintDesc_y');

        assert.ok(es.appendClipboardSectionTitle?.message, 'es messages should contain appendClipboardSectionTitle');
        assert.ok(en.appendClipboardSectionTitle?.message, 'en messages should contain appendClipboardSectionTitle');

        assert.ok(es.appendClipboardDesc?.message, 'es messages should contain appendClipboardDesc');
        assert.ok(en.appendClipboardDesc?.message, 'en messages should contain appendClipboardDesc');

        assert.ok(es.appendClipboardToggleEnable?.message, 'es messages should contain appendClipboardToggleEnable');
        assert.ok(en.appendClipboardToggleEnable?.message, 'en messages should contain appendClipboardToggleEnable');

        assert.ok(es.appendClipboardToggleDisable?.message, 'es messages should contain appendClipboardToggleDisable');
        assert.ok(en.appendClipboardToggleDisable?.message, 'en messages should contain appendClipboardToggleDisable');
    });

    /** Loads the real languages.js and hint_common.js into a sandbox, the way a page does. */
    function loadHintCommon(stored = {}) {
        const written = [];
        let readCalls = 0;
        const local = { ...stored };
        const context = vm.createContext({
            console,
            Intl,
            fetch: async () => ({ ok: false }),
            navigator: {
                clipboard: {
                    writeText: async (text) => {
                        written.push(text);
                    },
                    readText: async () => {
                        readCalls++;
                        return '';
                    },
                },
            },
            chrome: {
                storage: {
                    local: {
                        get: async (key) => (key in local ? { [key]: local[key] } : {}),
                        set: async (items) => Object.assign(local, items),
                    },
                    sync: { get: async () => ({}), set: async () => {} },
                    onChanged: { addListener() {} },
                },
                runtime: { getURL: (p) => p, sendMessage: async () => ({}) },
                i18n: { getUILanguage: () => 'en', getMessage: () => '' },
            },
        });
        context.globalThis = context;
        for (const file of ['src/utils/languages.js', 'src/utils/hint_common.js']) {
            vm.runInContext(readFileSync(resolve(rootDir, file), 'utf-8'), context, { filename: file });
        }
        return { HintCommon: context.HintCommon, written, local, reads: () => readCalls };
    }

    const selection = (text) => ({ toString: () => text });

    it('the first append starts the collection with the selection', async () => {
        const { HintCommon, written, local, reads } = loadHintCommon();
        assert.equal(await HintCommon.Clipboard.appendSelection(selection('First')), true);
        assert.deepEqual(written, ['First']);
        assert.equal(local.itg_last_clipboard_text, 'First');
        assert.equal(reads(), 0, 'the system clipboard is never read');
    });

    it('an ordinary copy starts a collection that the next append extends', async () => {
        const { HintCommon, written, reads } = loadHintCommon();
        HintCommon.Clipboard.remember('Copied');
        await HintCommon.Clipboard.appendSelection(selection('Added'));
        assert.deepEqual(written, ['Copied\n\nAdded']);
        assert.equal(reads(), 0);
    });

    it('carries the collection across tabs through storage, one blank line between pieces', async () => {
        const { HintCommon, written } = loadHintCommon({ itg_last_clipboard_text: 'From another tab\n' });
        await HintCommon.Clipboard.appendSelection(selection('Here'));
        assert.deepEqual(written, ['From another tab\n\nHere']);
    });

    it('does nothing for an empty selection', async () => {
        const { HintCommon, written } = loadHintCommon();
        assert.equal(await HintCommon.Clipboard.appendSelection(selection('')), false);
        assert.deepEqual(written, []);
    });

    it('handles custom assigned key in selection key handler and respects enabled flag', () => {
        let appendInvoked = false;
        const fakeClipboard = {
            appendSelection: () => {
                appendInvoked = true;
            },
        };

        const mainInstance = {
            appendClipboardEnabled: true,
            commands: {
                getMappings: () => ({
                    y: { description: 'hintDesc_y' },
                }),
            },
            _getAppendClipboardKey() {
                const mappings = this.commands?.getMappings?.() || {};
                for (const [key, val] of Object.entries(mappings)) {
                    if (val?.description === 'hintDesc_y') return key;
                }
                return 'y';
            },
            _handleSelectionKeys(event, selection) {
                const appendKey = this._getAppendClipboardKey();
                if (event.key === appendKey) {
                    if (this.appendClipboardEnabled !== false) {
                        fakeClipboard.appendSelection(selection);
                        return true;
                    }
                    return false;
                }
                return false;
            },
        };

        const selection = { toString: () => 'Some selected text' };

        // Test with default 'y' key
        let handled = mainInstance._handleSelectionKeys({ key: 'y' }, selection);
        assert.equal(handled, true);
        assert.equal(appendInvoked, true);

        // Test with disabled flag
        appendInvoked = false;
        mainInstance.appendClipboardEnabled = false;
        handled = mainInstance._handleSelectionKeys({ key: 'y' }, selection);
        assert.equal(handled, false);
        assert.equal(appendInvoked, false);

        // Test with custom key 'Y'
        mainInstance.appendClipboardEnabled = true;
        mainInstance.commands.getMappings = () => ({
            Y: { description: 'hintDesc_y' },
        });
        assert.equal(mainInstance._getAppendClipboardKey(), 'Y');
        handled = mainInstance._handleSelectionKeys({ key: 'y' }, selection);
        assert.equal(handled, false); // old key no longer triggers
        handled = mainInstance._handleSelectionKeys({ key: 'Y' }, selection);
        assert.equal(handled, true); // new key triggers
        assert.equal(appendInvoked, true);
    });

    it('verifies AppendClipboardSection.svelte component exists and is referenced in CustomizeHints.svelte', () => {
        const svelteComponentPath = resolve(
            rootDir,
            'src/ui/pages/customize_hints/components/AppendClipboardSection.svelte',
        );
        assert.ok(existsSync(svelteComponentPath), 'AppendClipboardSection.svelte should exist');

        const customizeHintsSrc = readFileSync(
            resolve(rootDir, 'src/ui/pages/customize_hints/CustomizeHints.svelte'),
            'utf-8',
        );
        assert.ok(
            customizeHintsSrc.includes(
                "import AppendClipboardSection from './components/AppendClipboardSection.svelte'",
            ),
            'CustomizeHints.svelte should import AppendClipboardSection',
        );
        assert.ok(
            customizeHintsSrc.includes('<AppendClipboardSection />'),
            'CustomizeHints.svelte should render <AppendClipboardSection />',
        );
    });

    it('verifies HelpModal has cumulative clipboard toggle and updateAppendClipboardToggle method', () => {
        const uiSrc = readFileSync(resolve(rootDir, 'src/utils/hint/ui.js'), 'utf-8');
        assert.ok(
            uiSrc.includes('updateAppendClipboardToggle(enabled)'),
            'HelpModal should define updateAppendClipboardToggle',
        );
        assert.ok(
            uiSrc.includes('itg-modal-append-clipboard-toggle'),
            'HelpModal should contain toggle input for cumulative clipboard',
        );
        assert.ok(
            uiSrc.includes("descKey === 'hintDesc_y'"),
            'HelpModal should check descKey === hintDesc_y to render toggle',
        );
    });
});
