import test from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeHtml,
    sanitizeFilename,
    markdownToPlainText,
    exportConversationAsHtml,
    exportConversationAsJson,
    exportConversationAsMarkdown,
    exportConversationAsTxt,
} from '../src/utils/download/conversationExport.js';

test('conversationExport formatting tests', async (t) => {
    const mockEntries = [
        {
            id: 'entry-1',
            timestamp: 1700000000000,
            query: '¿Cómo funciona Svelte?',
            data: {
                answer: 'Svelte es un **compilador** moderno que genera código *reactivo*.',
            },
        },
        {
            id: 'entry-2',
            timestamp: 1700000001000,
            query: 'Explica <code> en HTML & JS',
            data: {
                answer: 'Sirve para representar fragmentos de código.',
            },
        },
    ];

    await t.test('escapeHtml handles special characters', () => {
        assert.equal(
            escapeHtml('<script>alert("hello" & \'world\')</script>'),
            '&lt;script&gt;alert(&quot;hello&quot; &amp; &#039;world&#039;)&lt;/script&gt;',
        );
        assert.equal(escapeHtml(''), '');
    });

    await t.test('sanitizeFilename removes illegal characters and limits length', () => {
        assert.equal(sanitizeFilename('Mi: conversación / especial?'), 'Mi_ conversación _ especial_');
        assert.equal(sanitizeFilename(''), 'gemini_conversation');
    });

    await t.test('markdownToPlainText strips markdown formatting', () => {
        assert.equal(markdownToPlainText('**negrita** y *cursiva* con `código`'), 'negrita y cursiva con código');
        assert.equal(markdownToPlainText(''), '');
    });

    await t.test('exportConversationAsJson generates valid parseable JSON', () => {
        const jsonStr = exportConversationAsJson('Mi Charla', mockEntries);
        const parsed = JSON.parse(jsonStr);

        assert.equal(parsed.title, 'Mi Charla');
        assert.equal(parsed.totalEntries, 2);
        assert.equal(parsed.entries.length, 2);
        assert.equal(parsed.entries[0].query, '¿Cómo funciona Svelte?');
        assert.equal(parsed.entries[0].answer, 'Svelte es un **compilador** moderno que genera código *reactivo*.');
    });

    await t.test('exportConversationAsMarkdown generates markdown with Q&A headers', () => {
        const md = exportConversationAsMarkdown('Mi Charla', mockEntries);
        assert.ok(md.startsWith('# Mi Charla'));
        assert.ok(md.includes('## Q1: ¿Cómo funciona Svelte?'));
        assert.ok(md.includes('Svelte es un **compilador** moderno que genera código *reactivo*.'));
        assert.ok(md.includes('## Q2: Explica <code> en HTML & JS'));
    });

    await t.test('exportConversationAsTxt generates plain text without markdown syntax', () => {
        const txt = exportConversationAsTxt('Mi Charla', mockEntries);
        assert.ok(txt.includes('MI CHARLA'));
        assert.ok(txt.includes('[Q1] ¿Cómo funciona Svelte?'));
        assert.ok(txt.includes('Svelte es un compilador moderno que genera código reactivo.'));
        assert.ok(txt.includes('[Q2] Explica <code> en HTML & JS'));
    });

    await t.test(
        'exportConversationAsHtml produces complete standalone HTML document without Q numbers and with theme color',
        () => {
            const html = exportConversationAsHtml('Mi Charla <test>', mockEntries, { queryColor: '#16a085' });
            assert.ok(html.includes('<!DOCTYPE html>'));
            assert.ok(html.includes('<title>Mi Charla &lt;test&gt;</title>'));
            assert.ok(!html.includes('<strong>Q1:</strong>'));
            assert.ok(!html.includes('Q1:'));
            assert.ok(html.includes('<div class="query">¿Cómo funciona Svelte?</div>'));
            assert.ok(html.includes('class="conversation-container"'));
            assert.ok(html.includes('color: #16a085;'));
            assert.ok(html.includes('overflow-wrap: anywhere;'));
            assert.ok(html.includes('word-break: break-word;'));
        },
    );
});
