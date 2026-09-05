/**
 * Copies the published privacy policy into the CWS dossier.
 *
 * WHY THIS IS A SCRIPT AND NOT A COPY-PASTE. `CHROMEWEBSTORE.md` carries the policy so a
 * reviewer can read it without leaving the dossier, and the page at
 * `intelligentworkspace.genkipool.com/privacy` is the canonical version. Two copies of the
 * same text, one of them maintained by hand, drift — and they did: the dossier and the page
 * disagreed about how many permissions the extension asks for, in the direction that matters,
 * because a permission was removed and only one of the two was updated.
 *
 * So the dossier's copy is generated from the built page. Change the policy in the website
 * repository (`src/i18n/ui.ts`, the `privacy.*` keys), build it there, and run this.
 *
 *   node scripts/sync-policy.mjs ../../Intelligent-Workspace-Web
 *
 * The argument is the website checkout; the default below is where it sits relative to this
 * repository. It reads that build's English privacy page, not the source, because the page is
 * what a reader actually gets — a key added to `ui.ts` but never rendered would otherwise walk
 * into the dossier as if it were published.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_REPO = process.argv[2] ?? resolve(import.meta.dirname, '../../../Intelligent-Workspace-Web');
const PAGE = resolve(WEB_REPO, '.vercel/output/static/privacy/index.html');
const DOSSIER = resolve(import.meta.dirname, '../CHROMEWEBSTORE.md');

/** Labels of links that are buttons on the page rather than sentences in the policy. */
const NOT_PROSE = new Set(['See the permission table', 'Ver la tabla de permisos']);

if (!existsSync(PAGE)) {
    console.error(`No built privacy page at ${PAGE}\nRun \`pnpm build\` in the website repository first.`);
    process.exit(1);
}

const html = readFileSync(PAGE, 'utf8');
const main = html.slice(html.indexOf('<main'), html.lastIndexOf('</main>')).replace(/<nav\b[\s\S]*?<\/nav>/g, '');

const clean = (t) =>
    t
        .replace(/<br\s*\/?>/g, ' ')
        .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, '`$1`')
        .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/g, '**$2**')
        .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/g, '*$2*')
        .replace(/<a [^>]*>([\s\S]*?)<\/a>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();

const first = (re, s) => re.exec(s)?.[1] ?? '';
const all = (re, s) => [...s.matchAll(re)];

const out = [];
const articleAt = main.indexOf('<article');
const head = main.slice(0, main.indexOf('<section class="policy-basic"'));

out.push(`# ${clean(first(/<h1\b[^>]*>([\s\S]*?)<\/h1>/, head))} | Intelligent Workspace`);
out.push(
    `**In effect since:** ${clean(first(/<time [^>]*>([\s\S]*?)<\/time>/, head))}  \n` +
        `**Website:** https://intelligentworkspace.genkipool.com  \n` +
        `**Contact:** luisrb1985@gmail.com`,
);

// The lead paragraph, then the three highlights, which the page renders as h2 + p pairs.
const lead = all(/<p\b[^>]*>([\s\S]*?)<\/p>/g, head).find((m) => !m[1].includes('<time'));
if (lead) out.push(clean(lead[1]));
const highlights = all(/<h2\b[^>]*>([\s\S]*?)<\/h2>\s*<p\b[^>]*>([\s\S]*?)<\/p>/g, head);
if (highlights.length) out.push(highlights.map((m) => `- **${clean(m[1])}.** ${clean(m[2])}`).join('\n'));

// The AEPD box is a definition list on the page and a two-column table here.
const basic = main.slice(main.indexOf('<section class="policy-basic"'), articleAt);
out.push(`## ${clean(first(/<h2\b[^>]*>([\s\S]*?)<\/h2>/, basic))}`);
out.push(
    '| | |\n|:---|:---|\n' +
        all(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g, basic)
            .map((m) => `| **${clean(m[1])}** | ${clean(m[2])} |`)
            .join('\n'),
);

// The numbered sections. The number is the position, which is what the copy cross-references.
all(/<section\b[^>]*>([\s\S]*?)<\/section>/g, main.slice(articleAt)).forEach((sec, i) => {
    const body = sec[1];
    out.push(`## ${i + 1}. ${clean(first(/<h2\b[^>]*>([\s\S]*?)<\/h2>/, body))}`);
    for (const m of all(/<(p|ul|ol|table)\b[^>]*>([\s\S]*?)<\/\1>/g, body.slice(body.indexOf('</h2>') + 5))) {
        const [, tag, inner] = m;
        if (tag === 'table') {
            const rows = all(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g, inner)
                .map((tr) => all(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g, tr[1]).map((c) => clean(c[1])))
                .filter((cells) => cells.length);
            out.push(
                rows
                    .flatMap((cells, r) =>
                        r === 0
                            ? [`| ${cells.join(' | ')} |`, `|${cells.map(() => ':---').join('|')}|`]
                            : [`| ${cells.join(' | ')} |`],
                    )
                    .join('\n'),
            );
        } else if (tag === 'ul' || tag === 'ol') {
            const items = all(/<li\b[^>]*>([\s\S]*?)<\/li>/g, inner)
                .map((li) => clean(li[1]))
                .filter(Boolean);
            if (items.length) out.push(items.map((t) => `- ${t}`).join('\n'));
        } else {
            const text = clean(inner);
            if (text && !NOT_PROSE.has(text)) out.push(text);
        }
    }
});

/** Wrapped to the width the rest of the dossier uses. Tables and lists are left alone. */
const wrap = (block) => {
    if (block.startsWith('|') || block.startsWith('#') || block.startsWith('**') || block.includes('\n')) return block;
    const lines = [];
    let line = '';
    for (const word of block.split(' ')) {
        if (line && `${line} ${word}`.length > 100) {
            lines.push(line);
            line = word;
        } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.join('\n');
};

const policy = out.map(wrap).join('\n\n');
const dossier = readFileSync(DOSSIER, 'utf8');
const start = dossier.indexOf('# Privacy Policy | Intelligent Workspace');
const end = dossier.lastIndexOf('```');
if (start === -1 || end === -1 || end < start) {
    console.error('Could not find the fenced policy copy in CHROMEWEBSTORE.md. Has its shape changed?');
    process.exit(1);
}

const updated = dossier.slice(0, start) + policy + '\n' + dossier.slice(end);
if (updated === dossier) {
    console.log('The dossier already matches the published policy.');
} else {
    writeFileSync(DOSSIER, updated);
    console.log(`Policy copied into CHROMEWEBSTORE.md (${out.length} blocks).`);
}
