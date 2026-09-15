/**
 * Clicks on the header's view controls while the group list is still starting: the
 * three-dots panel toggle and the view buttons had no handlers yet, or the start-up
 * switch undid them, and the click was simply lost.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let dom;
let mod;

function page() {
    dom = new JSDOM(
        `<body>
            <button id="toggle-view-panel-btn"></button>
            <section id="view-toggle-panel" class="hidden">
                <button id="view-groups-btn"></button>
                <button id="toggle-bookmarks-view-btn"></button>
            </section>
        </body>`,
    );
    globalThis.document = dom.window.document;
    return dom.window.document;
}

/** What initializeAllEvents does: the handlers, then a start-up switch to the groups. */
function wire(doc, log) {
    const panel = doc.getElementById('view-toggle-panel');
    doc.getElementById('toggle-view-panel-btn').addEventListener('click', () => {
        panel.classList.toggle('hidden');
        log.push(`panel ${panel.classList.contains('hidden') ? 'closed' : 'open'}`);
    });
    doc.getElementById('toggle-bookmarks-view-btn').addEventListener('click', () => log.push('view bookmarks'));
    doc.getElementById('view-groups-btn').addEventListener('click', () => log.push('view groups'));
}

const click = (doc, id) =>
    doc.getElementById(id).dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));

describe('clicks made while the group list starts', () => {
    beforeEach(async () => {
        // A fresh module state per test.
        mod = await import(`../src/ui/services/earlyViewClicks.js?${Math.random()}`);
    });

    it('replays three dots then bookmarks when both land before the buttons are wired', () => {
        const doc = page();
        const log = [];
        mod.captureEarlyViewClicks();
        click(doc, 'toggle-view-panel-btn');
        click(doc, 'toggle-bookmarks-view-btn');
        wire(doc, log);
        mod.markViewControlsWired();
        log.push('start-up switch');
        mod.replayEarlyViewClick();
        assert.deepEqual(log, ['start-up switch', 'panel open', 'view bookmarks']);
    });

    it('does not repeat a panel toggle that already reached its handler', () => {
        const doc = page();
        const log = [];
        mod.captureEarlyViewClicks();
        wire(doc, log);
        mod.markViewControlsWired();
        click(doc, 'toggle-view-panel-btn');
        mod.replayEarlyViewClick();
        assert.deepEqual(log, ['panel open']);
    });

    it('repeats a view click that the start-up switch undid', () => {
        const doc = page();
        const log = [];
        mod.captureEarlyViewClicks();
        wire(doc, log);
        mod.markViewControlsWired();
        click(doc, 'toggle-bookmarks-view-btn');
        log.push('start-up switch');
        mod.replayEarlyViewClick();
        assert.deepEqual(log, ['view bookmarks', 'start-up switch', 'view bookmarks']);
    });

    it('stops listening once replayed', () => {
        const doc = page();
        const log = [];
        mod.captureEarlyViewClicks();
        wire(doc, log);
        mod.markViewControlsWired();
        mod.replayEarlyViewClick();
        click(doc, 'toggle-view-panel-btn');
        click(doc, 'toggle-bookmarks-view-btn');
        mod.replayEarlyViewClick();
        assert.deepEqual(log, ['panel open', 'view bookmarks']);
    });
});
