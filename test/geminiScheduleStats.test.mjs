import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function calculateQueryStats(query) {
    const text = query || '';
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    return { words, chars };
}

describe('Gemini schedule query stats counter', () => {
    it('calculates 0 words and 0 chars for empty or undefined input', () => {
        assert.deepEqual(calculateQueryStats(''), { words: 0, chars: 0 });
        assert.deepEqual(calculateQueryStats(null), { words: 0, chars: 0 });
        assert.deepEqual(calculateQueryStats(undefined), { words: 0, chars: 0 });
    });

    it('calculates characters and words accurately including whitespace and newlines', () => {
        const query = '¿Cuál es el clima hoy en Madrid?\nPor favor sé breve.';
        const stats = calculateQueryStats(query);
        assert.equal(stats.chars, query.length);
        assert.equal(stats.words, 11);
    });

    it('GeminiScheduleModal.svelte includes note-content-wrapper and note-editor-stats', () => {
        const fileContent = readFileSync('src/ui/components/listGroup/GeminiScheduleModal.svelte', 'utf8');
        assert.match(fileContent, /id="gemini-schedule-query"/);
        assert.match(fileContent, /class="note-content-wrapper"/);
        assert.match(fileContent, /class="note-editor-stats"/);
        assert.match(fileContent, /noteEditorStatsWordsChars/);
        assert.match(fileContent, /noteStatsTooltipText/);
    });

    it('locale files have translations for noteEditorStatsWordsChars and noteStatsTooltipText', () => {
        const es = JSON.parse(readFileSync('_locales/es/messages.json', 'utf8'));
        const en = JSON.parse(readFileSync('_locales/en/messages.json', 'utf8'));

        assert.ok(es.noteEditorStatsWordsChars);
        assert.ok(es.noteStatsTooltipText);
        assert.ok(en.noteEditorStatsWordsChars);
        assert.ok(en.noteStatsTooltipText);
    });
});
