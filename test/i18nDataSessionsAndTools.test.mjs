/**
 * Locale data fixed in this pass: the pomodoro "session" word follows each language's
 * plural rules, the tool label for creating a theme names the theme, and the Spanish
 * omnibar backup messages are Spanish.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { pluralKey, localeOf } from '../src/utils/i18n.js';

const LOCALES_DIR = new URL('../_locales/', import.meta.url);
const locales = readdirSync(LOCALES_DIR);
const load = (loc) => JSON.parse(readFileSync(new URL(`${loc}/messages.json`, LOCALES_DIR), 'utf8'));

describe('dashboardSessionWord plural forms', () => {
    it('exist in every locale for every category its plural rules use', () => {
        for (const loc of locales) {
            const m = load(loc);
            for (const cat of ['one', 'few', 'many', 'other']) {
                assert.ok(m[`dashboardSessionWord_${cat}`]?.message, `${loc} dashboardSessionWord_${cat}`);
            }
            const categories = new Intl.PluralRules(localeOf(loc)).resolvedOptions().pluralCategories;
            for (const cat of categories) assert.ok(m[`dashboardSessionWord_${cat}`], `${loc} ${cat}`);
        }
    });

    it('gives Russian its three forms', () => {
        const ru = load('ru');
        const word = (n) => ru[pluralKey('dashboardSessionWord', n, 'ru', ru)].message;
        assert.equal(word(1), 'сеанс');
        assert.equal(word(2), 'сеанса');
        assert.equal(word(5), 'сеансов');
        assert.equal(word(21), 'сеанс');
        assert.equal(word(24), 'сеанса');
    });

    it('keeps one-or-many for English', () => {
        const en = load('en');
        assert.equal(en[pluralKey('dashboardSessionWord', 1, 'en', en)].message, 'session');
        assert.equal(en[pluralKey('dashboardSessionWord', 2, 'en', en)].message, 'sessions');
    });
});

describe('toolCreateTheme', () => {
    it('names the theme being created in every locale', () => {
        for (const loc of locales) assert.match(load(loc).toolCreateTheme.message, /\$1/, loc);
    });
});

describe('Spanish omnibar backup messages', () => {
    it('are not the English text', () => {
        const es = load('es');
        const en = load('en');
        for (const key of ['omnibarGroupsRestored', 'omnibarGroupsBackedUp', 'omnibarNoGroupsToBackup']) {
            assert.notEqual(es[key].message, en[key].message, key);
        }
        assert.match(es.omnibarGroupsRestored.message, /\$1/);
    });
});
