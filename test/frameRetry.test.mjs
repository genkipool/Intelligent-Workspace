/**
 * The side browser tries a site again, after a pause, when the frame came up as
 * Chrome's error page -- x.com's service worker answers from a cached shell that may
 * carry X-Frame-Options, and refreshes it in the background. A real document announces
 * itself through panelScrollbar.js before `load`; the error page never does.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { retryIfFrameRefused } from '../src/ui/services/frameRetry.js';

const DELAYS = { delays: [5, 10] };

function fakeFrame() {
    const frame = new EventTarget();
    frame.contentWindow = {};
    frame.isConnected = true;
    frame.style = { visibility: '' };
    frame.navigations = [];
    let src = null;
    Object.defineProperty(frame, 'src', {
        get: () => src,
        set: (v) => {
            src = v;
            frame.navigations.push(v);
        },
    });
    return frame;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function announce(win, frame) {
    const ready = new Event('message');
    ready.source = frame.contentWindow;
    ready.data = { type: 'panel-scrollbar-ready' };
    win.dispatchEvent(ready);
}

describe('side browser retry on a refused frame', () => {
    let sent;
    beforeEach(() => {
        sent = [];
        globalThis.chrome = {
            runtime: {
                sendMessage: async (msg) => {
                    sent.push(msg);
                    return { success: true };
                },
            },
        };
    });

    it('hides the error page and navigates again after a pause, with the rules put back', async () => {
        const win = new EventTarget();
        const frame = fakeFrame();
        retryIfFrameRefused(frame, 'https://x.com/home', win, DELAYS);
        frame.dispatchEvent(new Event('load'));
        assert.equal(frame.style.visibility, 'hidden');
        assert.equal(frame.navigations.length, 0, 'not at once: the refreshed copy is not there yet');
        await wait(20);
        assert.deepEqual(frame.navigations, ['https://x.com/home']);
        assert.deepEqual(sent, [{ action: 'prepareUrlForSidePanel', url: 'https://x.com/home' }]);

        // The second try renders: the frame is shown and nothing else happens.
        announce(win, frame);
        frame.dispatchEvent(new Event('load'));
        await wait(30);
        assert.equal(frame.style.visibility, '');
        assert.equal(frame.navigations.length, 1);
    });

    it('gives up after two more tries and shows what came back', async () => {
        const win = new EventTarget();
        const frame = fakeFrame();
        retryIfFrameRefused(frame, 'https://x.com/home', win, DELAYS);
        for (let i = 0; i < 4; i++) {
            frame.dispatchEvent(new Event('load'));
            await wait(20);
        }
        assert.equal(frame.navigations.length, 2);
        assert.equal(frame.style.visibility, '');
    });

    it('leaves a frame alone once its document has announced itself', async () => {
        const win = new EventTarget();
        const frame = fakeFrame();
        retryIfFrameRefused(frame, 'https://x.com/home', win, DELAYS);
        announce(win, frame);
        frame.dispatchEvent(new Event('load'));
        await wait(20);
        assert.equal(frame.navigations.length, 0);
        assert.equal(sent.length, 0);
        assert.equal(frame.style.visibility, '');
    });

    it('ignores announcements from other frames', async () => {
        const win = new EventTarget();
        const frame = fakeFrame();
        retryIfFrameRefused(frame, 'https://x.com/home', win, DELAYS);
        const other = new Event('message');
        other.source = {};
        other.data = { type: 'panel-scrollbar-ready' };
        win.dispatchEvent(other);
        frame.dispatchEvent(new Event('load'));
        await wait(20);
        assert.equal(frame.navigations.length, 1);
    });

    it('stops if the frame is taken away while waiting', async () => {
        const win = new EventTarget();
        const frame = fakeFrame();
        retryIfFrameRefused(frame, 'https://x.com/home', win, DELAYS);
        frame.dispatchEvent(new Event('load'));
        frame.isConnected = false;
        await wait(20);
        assert.equal(frame.navigations.length, 0);
    });

    it('does nothing for addresses no content script can run in', async () => {
        const win = new EventTarget();
        const frame = fakeFrame();
        retryIfFrameRefused(frame, 'file:///home/user/doc.pdf', win, DELAYS);
        frame.dispatchEvent(new Event('load'));
        await wait(20);
        assert.equal(frame.navigations.length, 0);
    });
});
