/**
 * The language list and the helpers every context translates through.
 *
 * A fresh install opens in Chrome's language, a choice made with the switch wins from
 * then on, and adding a language is one entry plus its _locales folder.
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

import {
    SUPPORTED_LANGUAGES,
    DEFAULT_LANGUAGE,
    resolveLanguage,
    pickLanguage,
    localeOf,
    msg,
    pluralKey,
    tooltipEntry,
    setActiveMessages,
} from '../src/utils/i18n.js';

const withUiLanguage = (tag) => {
    globalThis.chrome = { i18n: { getUILanguage: () => tag, getMessage: () => '' } };
};

afterEach(() => {
    delete globalThis.chrome;
});

describe('supported languages', () => {
    it('matches the _locales folders one to one', () => {
        const folders = readdirSync('_locales').sort();
        assert.deepEqual(SUPPORTED_LANGUAGES.map((l) => l.code).sort(), folders);
    });

    it('defaults to English', () => {
        assert.equal(DEFAULT_LANGUAGE, 'en');
    });
});

describe('resolveLanguage', () => {
    it('maps regional variants to the base language the extension ships', () => {
        for (const tag of ['es', 'es-ES', 'es-419', 'es_MX', 'ES-es']) assert.equal(resolveLanguage(tag), 'es');
        for (const tag of ['en', 'en-GB', 'en_US']) assert.equal(resolveLanguage(tag), 'en');
    });

    it('falls back to the default for a language not shipped, or none', () => {
        for (const tag of ['fr', 'pt-BR', 'zz', '', undefined]) assert.equal(resolveLanguage(tag), 'en');
    });
});

describe('pickLanguage', () => {
    it('starts in the browser language when the user has not chosen', () => {
        withUiLanguage('es-419');
        assert.equal(pickLanguage(undefined), 'es');
        withUiLanguage('de');
        assert.equal(pickLanguage(undefined), 'en');
    });

    it("keeps the user's choice over the browser language", () => {
        withUiLanguage('es');
        assert.equal(pickLanguage('en'), 'en');
    });

    it('ignores a stored choice that is no longer supported', () => {
        withUiLanguage('es');
        assert.equal(pickLanguage('klingon'), 'es');
    });
});

describe('formatting helpers', () => {
    it('gives each language its Intl locale', () => {
        assert.equal(localeOf('es'), 'es-ES');
        assert.equal(localeOf('en'), 'en-US');
        assert.equal(localeOf('xx'), 'en-US');
    });

    it('picks plural forms by CLDR rules', () => {
        const messages = { n_one: {}, n_other: {} };
        assert.equal(pluralKey('n', 1, 'es-ES', messages), 'n_one');
        assert.equal(pluralKey('n', 0, 'es-ES', messages), 'n_other');
        assert.equal(pluralKey('n', 2, 'en-US', messages), 'n_other');
        assert.equal(pluralKey('n', 1, 'en-US', { n_other: {} }), 'n_other', 'a missing form falls back to other');
    });

    it('reads tooltips from <key>_tooltip and never from description', () => {
        const messages = {
            a: { message: 'Label', description: 'A note for translators' },
            a_tooltip: { message: 'Hover text' },
            b: { message: 'Only a label', description: 'Note' },
        };
        assert.equal(tooltipEntry(messages, 'a').message, 'Hover text');
        assert.equal(tooltipEntry(messages, 'b').message, 'Only a label');
    });
});

describe('msg', () => {
    it('answers in the active language, not the browser one', () => {
        globalThis.chrome = { i18n: { getMessage: () => 'from Chrome', getUILanguage: () => 'en' } };
        setActiveMessages('es', { hello: { message: 'Hola $1' } });
        assert.equal(msg('hello', 'Ana'), 'Hola Ana');
        assert.equal(msg('missing'), 'from Chrome', 'unknown keys fall back to chrome.i18n');
    });
});

describe('setActiveMessages', () => {
    it('leaves the document alone when the language has not changed', () => {
        // It runs once per rendered item; writing <html lang> each time restyled the
        // whole page and made a 1200-bookmark view take four seconds to open.
        let langWrites = 0;
        const element = {
            get lang() {
                return this._lang ?? '';
            },
            set lang(value) {
                langWrites++;
                this._lang = value;
            },
        };
        globalThis.document = { documentElement: element, querySelector: () => null };
        globalThis.localStorage = { setItem() {} };
        try {
            const messages = { a: { message: 'A' } };
            for (let i = 0; i < 100; i++) setActiveMessages('es', messages);
            assert.equal(langWrites, 1);
        } finally {
            delete globalThis.document;
            delete globalThis.localStorage;
        }
    });
});
