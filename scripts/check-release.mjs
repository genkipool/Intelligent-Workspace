/**
 * The two things that break silently between "it builds" and "it works for a user".
 *
 * Neither is caught by lint, by the build, or by clicking around: the extension loads,
 * the panel opens, and the damage only shows up as contributions that never arrive or an
 * extension Chrome refuses to install. Both are one grep, so they are cheap to assert
 * and expensive to miss.
 */

import { readFileSync } from 'node:fs';

const problems = [];

// ── 1. The payment origin must not be localhost ──────────────────
//
// The origin is `import.meta.env.VITE_PAYMENT_ORIGIN || <default>`. Local development
// overrides it through `.env.local`, which git ignores. What must never regress is the
// fallback baked into the source: if that ever became a local or plaintext origin, a
// release would ship a contribution frame that loads nothing, with nothing to say so.
{
    const source = readFileSync('src/config/payments.js', 'utf8');
    const fallback = source.match(/PAYMENT_ORIGIN\s*=\s*import\.meta\.env\.\w+\s*\|\|\s*['"]([^'"]+)['"]/);
    if (!fallback) {
        problems.push(
            'src/config/payments.js: PAYMENT_ORIGIN is no longer an env var with a hardcoded\n' +
                '  https fallback. That shape is what stops a localhost origin being committed.',
        );
    } else if (!/^https:\/\//.test(fallback[1]) || /localhost|127\.0\.0\.1/.test(fallback[1])) {
        problems.push(`src/config/payments.js: the PAYMENT_ORIGIN fallback is "${fallback[1]}", not an https origin.`);
    }
}

// ── 2. The locales must agree, and must not contain a stray $ ────
//
// Chrome parses every messages.json at install time. An undeclared `$word$` placeholder
// makes it reject the whole extension — not the message, the extension. And a key that
// exists in one language but not the other renders as an empty string, because
// `i18nService.translate` returns '' for a missing key rather than falling back.
{
    const read = (lang) => JSON.parse(readFileSync(`_locales/${lang}/messages.json`, 'utf8'));
    const en = read('en');
    const es = read('es');

    const onlyIn = (a, b) => Object.keys(a).filter((k) => !(k in b));
    const missingFromEs = onlyIn(en, es);
    const missingFromEn = onlyIn(es, en);

    if (missingFromEs.length) problems.push(`Keys in en but not es: ${missingFromEs.join(', ')}`);
    if (missingFromEn.length) problems.push(`Keys in es but not en: ${missingFromEn.join(', ')}`);

    for (const [lang, dict] of [
        ['en', en],
        ['es', es],
    ]) {
        for (const [key, entry] of Object.entries(dict)) {
            for (const field of ['message', 'description']) {
                const text = entry?.[field];
                if (typeof text !== 'string') continue;
                // `$1`-style substitutions are fine. A `$word$` must be declared, and
                // `$$` is not an escape — Chrome rejects both.
                const named = text.match(/\$[A-Za-z_][A-Za-z0-9_]*\$/g) ?? [];
                for (const placeholder of named) {
                    const name = placeholder.slice(1, -1).toLowerCase();
                    const declared = Object.keys(entry.placeholders ?? {}).some((p) => p.toLowerCase() === name);
                    if (!declared) {
                        problems.push(
                            `${lang}/${key}.${field}: "${placeholder}" is not declared in placeholders. ` +
                                'Chrome refuses to load the whole extension over this.',
                        );
                    }
                }
            }
        }
    }
}

if (problems.length) {
    console.error('Release checks failed:\n');
    for (const problem of problems) console.error(`• ${problem}\n`);
    process.exit(1);
}

console.log('Release checks passed: payment origin is production, locales agree, no stray placeholders.');
