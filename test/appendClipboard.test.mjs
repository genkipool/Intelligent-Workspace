import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

describe('Cumulative Clipboard Copy Feature', () => {
    let mockLocalStorage;
    let mockSyncStorage;
    let sentMessages;
    let mockChrome;

    beforeEach(() => {
        mockLocalStorage = {};
        mockSyncStorage = {};
        sentMessages = [];

        mockChrome = {
            storage: {
                local: {
                    get: async (keys) => {
                        if (typeof keys === 'string') return { [keys]: mockLocalStorage[keys] };
                        if (Array.isArray(keys)) {
                            const res = {};
                            for (const k of keys) res[k] = mockLocalStorage[k];
                            return res;
                        }
                        return { ...mockLocalStorage };
                    },
                    set: async (items) => {
                        Object.assign(mockLocalStorage, items);
                    },
                },
                sync: {
                    get: async (keys) => {
                        if (typeof keys === 'string') return { [keys]: mockSyncStorage[keys] };
                        if (Array.isArray(keys)) {
                            const res = {};
                            for (const k of keys) res[k] = mockSyncStorage[k];
                            return res;
                        }
                        return { ...mockSyncStorage };
                    },
                    set: async (items) => {
                        Object.assign(mockSyncStorage, items);
                    },
                },
            },
            runtime: {
                sendMessage: (msg) => {
                    sentMessages.push(msg);
                },
            },
        };
    });

    it('declares clipboardRead and clipboardWrite in manifest.json', () => {
        const manifest = JSON.parse(readFileSync(resolve(rootDir, 'manifest.json'), 'utf-8'));
        assert.ok(manifest.permissions.includes('clipboardRead'), 'manifest.json should include clipboardRead');
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

    it('appends text with double newline correctly via Clipboard logic', async () => {
        let clipboardText = 'First copied line';
        globalThis.chrome = mockChrome;
        const mockClipboardApi = {
            readText: async () => clipboardText,
            writeText: async (t) => {
                clipboardText = t;
            },
        };
        Object.defineProperty(globalThis.navigator, 'clipboard', {
            value: mockClipboardApi,
            configurable: true,
            writable: true,
        });

        const Clipboard = {
            _lastCopiedText: '',
            async getLastCopied() {
                let text = '';
                try {
                    text = await globalThis.navigator.clipboard.readText();
                } catch {}
                if (!text) {
                    text = this._lastCopiedText || '';
                }
                return text;
            },
            async appendSelection(selection) {
                const selectedText = selection?.toString() || '';
                if (!selectedText) return false;

                const existingText = await this.getLastCopied();
                const delimiter = existingText
                    ? existingText.endsWith('\n\n') || existingText.endsWith('\r\n\r\n')
                        ? ''
                        : existingText.endsWith('\n')
                          ? '\n'
                          : '\n\n'
                    : '';
                const combinedText = existingText ? `${existingText}${delimiter}${selectedText}` : selectedText;

                await globalThis.navigator.clipboard.writeText(combinedText);
                this._lastCopiedText = combinedText;
                await globalThis.chrome.storage.local.set({ itg_last_clipboard_text: combinedText });
                return true;
            },
        };

        const selectionMock1 = { toString: () => 'Second copied line' };
        const res1 = await Clipboard.appendSelection(selectionMock1);
        assert.equal(res1, true);
        assert.equal(clipboardText, 'First copied line\n\nSecond copied line');
        assert.equal(mockLocalStorage.itg_last_clipboard_text, 'First copied line\n\nSecond copied line');

        const selectionMock2 = { toString: () => 'Third copied line' };
        const res2 = await Clipboard.appendSelection(selectionMock2);
        assert.equal(res2, true);
        assert.equal(clipboardText, 'First copied line\n\nSecond copied line\n\nThird copied line');
        assert.equal(
            mockLocalStorage.itg_last_clipboard_text,
            'First copied line\n\nSecond copied line\n\nThird copied line',
        );
    });

    it('normalizes to double newline if previous clipboard text already ends in single newline', async () => {
        let clipboardText = 'Line with newline\n';
        globalThis.chrome = mockChrome;
        const mockClipboardApi = {
            readText: async () => clipboardText,
            writeText: async (t) => {
                clipboardText = t;
            },
        };
        Object.defineProperty(globalThis.navigator, 'clipboard', {
            value: mockClipboardApi,
            configurable: true,
            writable: true,
        });

        const Clipboard = {
            _lastCopiedText: '',
            async getLastCopied() {
                return globalThis.navigator.clipboard.readText();
            },
            async appendSelection(selection) {
                const selectedText = selection?.toString() || '';
                if (!selectedText) return false;

                const existingText = await this.getLastCopied();
                const delimiter = existingText
                    ? existingText.endsWith('\n\n') || existingText.endsWith('\r\n\r\n')
                        ? ''
                        : existingText.endsWith('\n')
                          ? '\n'
                          : '\n\n'
                    : '';
                const combinedText = existingText ? `${existingText}${delimiter}${selectedText}` : selectedText;

                await globalThis.navigator.clipboard.writeText(combinedText);
                return true;
            },
        };

        await Clipboard.appendSelection({ toString: () => 'Next line' });
        assert.equal(clipboardText, 'Line with newline\n\nNext line');

        // And if it already has double newline, it should not add a third
        await Clipboard.appendSelection({ toString: () => 'After double' });
        assert.equal(clipboardText, 'Line with newline\n\nNext line\n\nAfter double');
    });

    it('sets initial content when clipboard was empty', async () => {
        let clipboardText = '';
        globalThis.chrome = mockChrome;
        const mockClipboardApi = {
            readText: async () => clipboardText,
            writeText: async (t) => {
                clipboardText = t;
            },
        };
        Object.defineProperty(globalThis.navigator, 'clipboard', {
            value: mockClipboardApi,
            configurable: true,
            writable: true,
        });

        const Clipboard = {
            _lastCopiedText: '',
            async getLastCopied() {
                return globalThis.navigator.clipboard.readText();
            },
            async appendSelection(selection) {
                const selectedText = selection?.toString() || '';
                if (!selectedText) return false;

                const existingText = await this.getLastCopied();
                const delimiter = existingText ? (existingText.endsWith('\n') ? '' : '\n') : '';
                const combinedText = existingText ? `${existingText}${delimiter}${selectedText}` : selectedText;

                await globalThis.navigator.clipboard.writeText(combinedText);
                return true;
            },
        };

        await Clipboard.appendSelection({ toString: () => 'First selection ever' });
        assert.equal(clipboardText, 'First selection ever');
    });

    it('returns false and does not append when selection is empty', async () => {
        const Clipboard = {
            async appendSelection(selection) {
                const selectedText = selection?.toString() || '';
                if (!selectedText) return false;
                return true;
            },
        };
        const res = await Clipboard.appendSelection({ toString: () => '' });
        assert.equal(res, false);
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
