/**
 * Theme colours are untrusted text: they arrive from imported files, sync storage and
 * the assistant, and every extension page turns them into CSS variables on :root. A
 * value such as `#0af; background-image:url(…)` used to be spliced into the root's
 * inline style and add declarations of its own (tracking requests, page-wide filters).
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { isThemeColor, sanitizeThemeColors, applyCustomTheme } from '../src/utils/theme.js';
import { processAndSaveImportedThemes } from '../src/utils/importExport.js';

const INJECTED = '#0af; background-image: url(http://127.0.0.1/t.png); filter: blur(3px)';

afterEach(() => {
    delete globalThis.document;
    delete globalThis.CSS;
});

describe('theme colour validation', () => {
    it('accepts the colour syntaxes themes use', () => {
        for (const c of ['#16A085', '#fff', 'rgb(10, 20, 30)', 'rgba(0,0,0,.5)', 'hsl(0 0% 90%)', 'transparent']) {
            assert.equal(isThemeColor(c), true, c);
        }
    });

    it('refuses a value that carries extra declarations or markup', () => {
        for (const c of [INJECTED, '#000}body{display:none', '', '   ', null, 42, '<b>', 'red\\3b x']) {
            assert.equal(isThemeColor(c), false, String(c));
        }
    });

    it('defers to CSS.supports where the page has it', () => {
        globalThis.CSS = { supports: (prop, val) => prop === 'color' && val === '#123456' };
        assert.equal(isThemeColor('#123456'), true);
        assert.equal(isThemeColor('url(x)'), false);
    });

    it('keeps only well-formed keys with colour values', () => {
        assert.deepEqual(sanitizeThemeColors({ actionColor: '#123', bgColor: INJECTED, 'x;y': '#fff' }), {
            actionColor: '#123',
        });
        assert.deepEqual(sanitizeThemeColors(null), {});
    });
});

describe('applyCustomTheme', () => {
    it('sets each colour as its own variable and drops an injected one', () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>');
        globalThis.document = dom.window.document;
        applyCustomTheme({ actionColor: '#16A085', bgColor: INJECTED });
        const style = dom.window.document.documentElement.style;
        assert.equal(style.getPropertyValue('--action-color'), '#16A085');
        assert.equal(style.getPropertyValue('--bg-color'), '');
        assert.equal(style.getPropertyValue('filter'), '');
        assert.equal(style.getPropertyValue('background-image'), '');
        assert.equal(dom.window.document.documentElement.getAttribute('data-theme'), 'custom');
    });
});

describe('importing themes', () => {
    const makeStorage = () => {
        const data = { savedThemes: [] };
        return { data, get: async () => ({ savedThemes: data.savedThemes }), set: async (o) => Object.assign(data, o) };
    };
    const utils = { showNotification() {}, getCurrentLang: async () => 'en', loadMessages: async () => ({}) };

    it('refuses a theme whose action colour is not a colour', async () => {
        const storage = makeStorage();
        const res = await processAndSaveImportedThemes(
            [{ name: 'Ocean', colors: { actionColor: INJECTED } }],
            storage,
            10,
            utils,
        );
        assert.equal(res.success, false);
        assert.deepEqual(storage.data.savedThemes, []);
    });

    it('stores a legitimate theme and leaves out a smuggled extra value', async () => {
        const storage = makeStorage();
        const res = await processAndSaveImportedThemes(
            [{ name: 'Legit', colors: { actionColor: '#123456', bgColor: 'rgb(1, 2, 3)', textColor: INJECTED } }],
            storage,
            10,
            utils,
        );
        assert.equal(res.success, true);
        assert.deepEqual(storage.data.savedThemes, [
            { name: 'Legit', colors: { actionColor: '#123456', bgColor: 'rgb(1, 2, 3)' } },
        ]);
    });
});
