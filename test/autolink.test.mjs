/**
 * What `autolink` turns into a link when a note is saved.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let autolink;

before(async () => {
    const { window } = new JSDOM('<!doctype html><body></body>');
    global.window = window;
    global.document = window.document;
    ({ autolink } = await import('../src/ui/services/utils.js'));
});

/** The hrefs `autolink` leaves in a note body written as `html`. */
function links(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    autolink(el);
    return [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
}

describe('autolink', () => {
    it('no corta el enlace en el primer guion', () => {
        assert.deepEqual(links('Mira https://www.youtube.com/watch?v=aqz-KE-bpKQ ya'), [
            'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        ]);
        assert.deepEqual(links('https://example.com/a-b-c'), ['https://example.com/a-b-c']);
    });

    it('enlaza cada nodo de texto, uno detras de otro', () => {
        assert.deepEqual(links('<div>https://a.com/x-1</div><div>https://b.com/y-2</div>'), [
            'https://a.com/x-1',
            'https://b.com/y-2',
        ]);
    });

    it('no vuelve a enlazar lo que ya es un enlace', () => {
        assert.deepEqual(links('<a href="https://a.com/">https://a.com/</a>'), ['https://a.com/']);
    });

    it('da http:// a lo que empieza por www.', () => {
        assert.deepEqual(links('www.example.com/path-x'), ['http://www.example.com/path-x']);
    });
});
