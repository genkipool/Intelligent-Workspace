/**
 * Snippet and site-command HTML is rendered with innerHTML in the hints editor and can
 * come from a config file someone else shared. It must keep what the editor produces
 * and lose anything that runs, loads, navigates, takes input or covers the page.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

let HintCommon;

before(() => {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
    // hint_common.js is a classic script that declares a global; evaluated as one here.
    dom.window.eval(`${readFileSync(new URL('../src/utils/hint_common.js', import.meta.url), 'utf8')}
window.HintCommon = HintCommon;`);
    HintCommon = dom.window.HintCommon;
});

describe('HintCommon.sanitizeHtml', () => {
    it('keeps the formatting the editor produces', () => {
        const html =
            '<b>bold</b> <i>it</i> <u>u</u> <s>s</s> <a href="https://e.com/x">link</a>' +
            '<ul><li>a</li></ul><ol start="2"><li>b</li></ol>' +
            '<span style="font-size: 24px; color: rgb(255, 0, 0)">big</span>' +
            '<div style="text-align: center">c</div><font color="#f00">f</font>' +
            '<blockquote style="margin-left: 40px">q</blockquote>';
        assert.equal(HintCommon.sanitizeHtml(html), html);
    });

    it('drops page-level and active markup with its content', () => {
        const out = HintCommon.sanitizeHtml(
            'Hi<meta http-equiv="refresh" content="1;url=http://x/"><script>x()</script>' +
                '<form action="http://x/steal"><input name="k"><button>OK</button></form>' +
                '<iframe src="http://x/"></iframe><svg><a href="javascript:x"/></svg><style>*{}</style>',
        );
        assert.equal(out, 'Hi');
    });

    it('removes handlers, unsafe links and layout styles', () => {
        const out = HintCommon.sanitizeHtml(
            '<img src="x" onerror="alert(1)"><a href="java\tscript:alert(1)">t</a>' +
                '<div id="ov" class="modal" style="position:fixed;inset:0;z-index:9;color:red">d</div>' +
                '<span style="color: red; background-image: url(http://x/t.png)">s</span>',
        );
        assert.equal(out, 't<div style="color: red">d</div><span style="color: red">s</span>');
    });

    it('leaves plain text as text', () => {
        assert.equal(HintCommon.sanitizeHtml('a &lt; b'), 'a &lt; b');
        assert.equal(HintCommon.sanitizeHtml(''), '');
        assert.equal(HintCommon.sanitizeHtml(null), '');
    });
});

describe('HintCommon.stripHtml', () => {
    it('returns the text without attaching the markup to the page', () => {
        assert.equal(HintCommon.stripHtml('<b>x</b> &amp; <img src="http://x/p.png">y'), 'x & y');
    });
});

describe('snippet trigger rename', () => {
    it('runs the same conflict check as the add form', () => {
        const src = readFileSync(
            new URL('../src/ui/pages/customize_hints/customize_hints.js', import.meta.url),
            'utf8',
        );
        const validate = src.slice(src.indexOf("category: type === 'trigger' ? 'snippet'"));
        const trigger = validate.slice(0, validate.indexOf("if (type === 'expansion')"));
        assert.match(trigger, /!getKeyConflictInfo\(val, 'snippet', li\.dataset\.trigger, 'snippet'\)/);
    });
});
