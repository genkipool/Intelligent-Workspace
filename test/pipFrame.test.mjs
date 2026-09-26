/**
 * The floating player's page frame announces itself to the float, and on x.com keeps
 * videos from turning their sound on by themselves; other sites are left as they are.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync('src/utils/pipFrame.js', 'utf8');

function run({ name = 'itg-page-pip-iframe', hostname = 'x.com', activation = false } = {}) {
    const posted = [];
    const listeners = {};
    class HTMLMediaElement {
        muted = false;
    }
    const win = { name };
    win.self = win;
    win.top = {};
    win.parent = { postMessage: (m) => posted.push(m) };
    const sandbox = {
        window: win,
        location: { hostname },
        navigator: { userActivation: { isActive: activation } },
        document: { addEventListener: (type, fn) => (listeners[type] = fn) },
        HTMLMediaElement,
        WeakMap,
        Date,
    };
    vm.runInNewContext(code, sandbox);
    const video = new HTMLMediaElement();
    return { posted, listeners, video, sandbox };
}

describe('floating player page frame', () => {
    it('announces itself to the float', () => {
        // Compared as JSON: the objects come from the sandbox's own realm.
        assert.equal(JSON.stringify(run().posted), '[{"type":"itg-pip-frame-ready"}]');
        assert.equal(JSON.stringify(run({ name: 'itg-video-pip-iframe' }).posted), '[{"type":"itg-pip-frame-ready"}]');
    });

    it('does nothing in a frame the float did not name', () => {
        const t = run({ name: 'some-ad-frame' });
        assert.equal(t.posted.length, 0);
        assert.equal(t.listeners.play, undefined);
    });

    it('mutes an x.com video that starts with sound on its own', () => {
        const t = run();
        t.listeners.play({ target: t.video });
        assert.equal(t.video.muted, true);
    });

    it('lets the reader turn the sound on', () => {
        const t = run({ activation: true });
        t.listeners.volumechange({ target: t.video });
        assert.equal(t.video.muted, false);
    });

    it('leaves the sound of other sites alone', () => {
        const t = run({ hostname: 'www.youtube.com' });
        assert.equal(t.listeners.play, undefined);
    });
});
