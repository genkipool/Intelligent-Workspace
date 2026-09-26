/**
 * Every message key the code names literally exists in the default locale.
 *
 * A missing key does not fail loudly: `chrome.i18n` answers with an empty string and
 * the content scripts' helper answers with the key itself, so the user sees
 * "omnibarPressEnterToSearch" on screen or a notification with no title. check:release
 * already makes the locales agree with each other; this makes the code agree with them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const en = JSON.parse(readFileSync('_locales/en/messages.json', 'utf8'));

// Keys built at run time from a prefix and a value (`webActivityCategory_${id}`).
const DYNAMIC_PREFIXES = ['noteCat', 'webActivityBlockedReason_', 'webActivityCategory_', 'webActivityStateBlocked_'];

const CALL =
    /(?<![\w.])(?:getOmniMsg|getHintI18nMsg|getPreviewMsg|itgPipMsg|localizedMsg|getI18nMsg|\$t|\$tt|HintCommon\.i18n\.getMessage|showNotification|getMsg)\(\s*['"]([A-Za-z][A-Za-z0-9_]{2,})['"]/g;
// Counted messages are named by their base and resolved to `<key>_one`, `<key>_other`…
const PLURAL = /(?<![\w])(?:plural|pluralKey|getI18nPluralKey)\(\s*['"]([A-Za-z][A-Za-z0-9_]{2,})['"]/g;
const ATTRIBUTE = /data-i18n(?:-title|-placeholder|-aria-label|-text)?="([A-Za-z][A-Za-z0-9_]+)"/g;

function* sourceFiles(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            if (path !== join('src', 'lib')) yield* sourceFiles(path);
        } else if (/\.(js|svelte|html)$/.test(name)) yield path;
    }
}

describe('message keys', () => {
    it('has both plural forms for every counted message', () => {
        const bases = Object.keys(en)
            .filter((k) => k.endsWith('_one'))
            .map((k) => k.slice(0, -4));
        assert.deepEqual(
            bases.filter((b) => !(`${b}_other` in en)),
            [],
        );
    });

    it('every key named in the code exists in _locales/en', () => {
        const missing = [];
        for (const file of sourceFiles('src')) {
            const source = readFileSync(file, 'utf8');
            for (const match of [...source.matchAll(CALL), ...source.matchAll(ATTRIBUTE)]) {
                const key = match[1];
                if (!(key in en) && !DYNAMIC_PREFIXES.includes(key)) missing.push(`${key} (${file})`);
            }
            for (const match of source.matchAll(PLURAL)) {
                const key = match[1];
                if (!(`${key}_other` in en)) missing.push(`${key}_other (${file})`);
            }
        }
        assert.deepEqual(missing, []);
    });
});
