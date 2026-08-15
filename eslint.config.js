import fs from 'node:fs';
import path from 'node:path';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

/**
 * The service worker is not made of ES modules: background.js pulls its parts in
 * with importScripts, so every one of those files shares a single global scope and
 * a function declared in state.js is callable from events.js.
 *
 * ESLint checks each file on its own and cannot see that, so it reported every
 * shared name as no-undef — 1115 errors, none of them real, which made the
 * pre-commit hook impossible to pass for anything touching the worker.
 *
 * The names are read from the files themselves instead of being listed by hand, so
 * the configuration cannot drift away from the code.
 */
const sharedScriptFiles = [
    'src/core/background.js',
    'src/core/agent-backend.js',
    ...expand('src/core/background'),
    ...expand('src/core/background/handlers'),
    ...expand('src/core/services'),
];

/** Content scripts declared together in the manifest also share one scope. */
const contentScriptFiles = ['src/utils/hint_common.js', ...expand('src/utils/hint')];

function expand(dir) {
    try {
        return fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.js'))
            .map((f) => path.join(dir, f));
    } catch {
        return [];
    }
}

const DECLARATION = /^(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;

/** Reads every file of a shared set once, as [path, source] pairs. */
function readAll(files) {
    return files.flatMap((file) => {
        try {
            return [[file, fs.readFileSync(file, 'utf8')]];
        } catch {
            return [];
        }
    });
}

/** Every name declared at the top level of the given files. */
function sharedGlobalsOf(files) {
    const names = {};
    for (const [, source] of readAll(files)) {
        for (const line of source.split('\n')) {
            const match = DECLARATION.exec(line);
            // Only column 0: anything indented is local to a block.
            if (match && !/^\s/.test(line)) names[match[1]] = 'writable';
        }
    }
    return names;
}

/**
 * The mirror image of the problem sharedGlobalsOf solves. A function declared in
 * db.js and called from handlers/backups.js is used, but ESLint checks each file
 * alone and sees a top-level declaration nobody reads: 268 no-unused-vars that
 * were not real, drowning the ones that were.
 *
 * The exemption is deliberately narrow. It lists only the names that some *other*
 * file of the same shared scope actually mentions, so a function nobody calls is
 * still reported — which is how fifteen genuinely dead ones were found. Adding a
 * declaration that nothing uses will be reported too.
 */
function usedAcrossFiles(files) {
    const sources = readAll(files);
    const declared = new Map(); // name -> file where it is declared
    for (const [file, source] of sources) {
        for (const line of source.split('\n')) {
            const match = DECLARATION.exec(line);
            if (match && !/^\s/.test(line)) declared.set(match[1], file);
        }
    }

    const used = [];
    for (const [name, home] of declared) {
        const mention = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
        if (sources.some(([file, source]) => file !== home && mention.test(source))) used.push(name);
    }
    // Anchored, so a local variable only escapes if its name is exactly a shared one.
    return used.length ? `^(?:${used.map((n) => n.replace(/\$/g, '\\$')).join('|')})$` : '(?!)';
}

export default [
    {
        ignores: [
            'dist/',
            'node_modules/',
            'assets/',
            '**/*.py',
            'fix-sw.js',
            '*.json',
            // Third-party libraries vendored as-is (tesseract, qr-code-styling,
            // marked, chart). They are not ours to fix and most are minified.
            'src/lib/',
        ],
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                chrome: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none' }],
            'no-undef': 'error',
        },
    },
    {
        files: sharedScriptFiles,
        languageOptions: {
            sourceType: 'script',
            globals: {
                ...globals.serviceworker,
                chrome: 'readonly',
                ...sharedGlobalsOf(sharedScriptFiles),
            },
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: usedAcrossFiles(sharedScriptFiles) }],
        },
    },
    {
        files: contentScriptFiles,
        languageOptions: {
            sourceType: 'script',
            globals: {
                ...globals.browser,
                chrome: 'readonly',
                ...sharedGlobalsOf(contentScriptFiles),
            },
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: usedAcrossFiles(contentScriptFiles) }],
        },
    },
    {
        // Its tail is a UMD guard (`typeof module !== 'undefined'`) so the file can
        // also be required; as a content script that branch never runs, but the
        // reference is real and guarded.
        files: ['src/utils/hint_common.js'],
        languageOptions: { globals: { ...globals.commonjs } },
    },
    {
        // Imported by the listGroup page right after hint_common.js, which publishes
        // window.HintCommon. The global is genuinely there at run time; it just
        // arrives through a side-effect import instead of a named one.
        files: ['src/utils/snippet-panel.js'],
        languageOptions: { globals: { HintCommon: 'readonly' } },
    },
    /**
     * The plugin's recommended preset ends with a block that carries rules but no
     * `files`, so its 37 svelte/* rules were being applied to every file in the
     * repository, plain .js included. On a classic worker script that is not just
     * noise: svelte/no-inner-declarations crashes outright on script scope
     * ("Cannot read properties of null"). They are scoped to components, which is
     * where they were meant to run.
     */
    ...svelte.configs['flat/recommended'].map((block) =>
        block.rules && !block.files ? { ...block, files: ['**/*.svelte'] } : block,
    ),
    {
        files: ['**/*.svelte'],
        rules: {
            // The base block only covers .js/.mjs, so components were never checked
            // for this and unused imports piled up unseen. The parser resolves names
            // referenced from the markup, so a prop or a store used only in the
            // template still counts as used.
            'no-unused-vars': ['warn', { args: 'none' }],
            'svelte/no-reactive-functions': 'off',
            'svelte/no-unused-props': 'warn',
            'svelte/button-has-type': 'warn',
            'svelte/prefer-class-directive': 'warn',
            'svelte/prefer-destructured-store-props': 'warn',
            'svelte/require-stores-init': 'warn',
        },
    },
];
