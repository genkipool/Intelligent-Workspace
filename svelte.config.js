import fs from 'node:fs';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// The a11y checks that ask an element for text or a label read the markup as written.
// Two kinds of element get theirs only at runtime, so for them the warning is wrong:
// - one carrying `data-i18n`, `data-i18n-title`, `data-i18n-aria-label`…, which the
//   translator fills in the reader's language;
// - one inside a `<template>`, which is never rendered as is: the script that clones it
//   writes the text into the copy.
// Every other a11y warning, and these same ones anywhere else, still reach the build.
const TEXT_SUPPLIED_AT_RUNTIME = new Set(['a11y_consider_explicit_label', 'a11y_missing_content']);

/** The opening tag that starts at `offset`, or null if the offset does not point at one. */
function openingTagAt(source, offset) {
    if (source[offset] !== '<') return null;
    let depth = 0;
    for (let i = offset; i < source.length; i++) {
        const c = source[i];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth === 0) return source.slice(offset, i + 1);
    }
    return null;
}

function isInsideTemplate(source, offset) {
    const before = source.slice(0, offset);
    return (before.match(/<template[\s>]/g) || []).length > (before.match(/<\/template>/g) || []).length;
}

function textSuppliedAtRuntime(warning) {
    if (!TEXT_SUPPLIED_AT_RUNTIME.has(warning.code) || !warning.filename || !warning.start) return false;
    let source;
    try {
        // Read fresh every time: under the dev server the file changes between compiles.
        source = fs.readFileSync(warning.filename, 'utf8');
    } catch {
        return false;
    }
    // Located by line and column, and checked to land on a tag: if preprocessing ever
    // shifts the markup, the warning is kept rather than guessed away.
    const lines = source.split('\n');
    const offset =
        lines.slice(0, warning.start.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + warning.start.column;
    const tag = openingTagAt(source, offset);
    if (!tag) return false;
    return /\sdata-i18n[\w-]*=/.test(tag) || isInsideTemplate(source, offset);
}

export default {
    compilerOptions: {
        warningFilter: (warning) => !textSuppliedAtRuntime(warning),
    },
    preprocess: vitePreprocess(),
};
