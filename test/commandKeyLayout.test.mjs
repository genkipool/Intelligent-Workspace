/**
 * Keyboard commands and hint labels on non-Latin keyboard layouts.
 *
 * On a Russian (or Greek, Hebrew, Arabic, Hindi…) layout the F key writes `а`, so `f`
 * never opened the hints and no label could be typed. itgCommandKey reads such a key by
 * its position; keys that already write ASCII are left exactly as they were.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/utils/hint/utils.js', import.meta.url), 'utf8');
const fn = /function itgCommandKey\(event\) \{[\s\S]*?\n\}/.exec(source)[0];
const itgCommandKey = vm.runInNewContext(`(${fn})`);

describe('itgCommandKey', () => {
    it('reads a non-Latin letter by its physical key', () => {
        assert.equal(itgCommandKey({ key: 'а', code: 'KeyF' }), 'f');
        assert.equal(itgCommandKey({ key: 'о', code: 'KeyJ' }), 'j');
        assert.equal(itgCommandKey({ key: 'φ', code: 'KeyF' }), 'f');
        assert.equal(itgCommandKey({ key: 'כ', code: 'KeyF' }), 'f');
    });

    it('keeps the case Shift gives', () => {
        assert.equal(itgCommandKey({ key: 'П', code: 'KeyG', shiftKey: true }), 'G');
    });

    it('leaves Latin layouts as they were (AZERTY, QWERTZ, Dvorak)', () => {
        assert.equal(itgCommandKey({ key: 'a', code: 'KeyQ' }), 'a');
        assert.equal(itgCommandKey({ key: 'z', code: 'KeyY' }), 'z');
        assert.equal(itgCommandKey({ key: 'u', code: 'KeyF' }), 'u');
        assert.equal(itgCommandKey({ key: '?', code: 'Slash', shiftKey: true }), '?');
    });

    it('leaves named keys and non-letter positions alone', () => {
        assert.equal(itgCommandKey({ key: 'Escape', code: 'Escape' }), 'Escape');
        assert.equal(itgCommandKey({ key: 'Process', code: 'KeyF' }), 'Process');
        assert.equal(itgCommandKey({ key: 'ñ', code: 'Semicolon' }), 'ñ');
        assert.equal(itgCommandKey({ key: '№', code: 'Digit3', shiftKey: true }), '№');
    });
});
