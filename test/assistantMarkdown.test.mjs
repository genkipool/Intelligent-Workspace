import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../src/ui/content-renderer/content-renderer.js';
import { markdownToPlainText } from '../src/utils/download/conversationExport.js';

// The answer Chrome's local model gave to "Name three classic Nintendo consoles": a bullet
// list whose items mix bold names and an italic game title.
const ANSWER =
    '* **Nintendo Entertainment System (NES):** The console that revived home video games.\n' +
    '* **Super Nintendo Entertainment System (SNES):** Home to *The Legend of Zelda: A Link to the Past*.\n' +
    '* **Nintendo 64:** Brought 3D gaming with *Super Mario 64*.';

test('a "* " bullet does not pair with the asterisk of an italic title on its line', () => {
    const html = parseMarkdown(ANSWER);
    assert.equal(html.match(/<li>/g)?.length, 3, html);
    assert.equal(html.match(/<ul>/g)?.length, 1, html);
    assert.ok(html.includes('<em>The Legend of Zelda: A Link to the Past</em>'), html);
    assert.ok(html.includes('<em>Super Mario 64</em>'), html);
    assert.ok(!html.includes('*'), html);
});

test('emphasis needs its asterisks against the text', () => {
    assert.equal(parseMarkdown('2 * 3 * 4 and *this*'), '<p>2 * 3 * 4 and <em>this</em></p>');
    assert.equal(parseMarkdown('**bold** and *italic*'), '<p><strong>bold</strong> and <em>italic</em></p>');
});

test('the plain-text copy of the same answer keeps no stray asterisks', () => {
    const text = markdownToPlainText(ANSWER);
    assert.ok(!text.includes('*'), text);
    assert.ok(text.includes('The Legend of Zelda: A Link to the Past.'), text);
});
