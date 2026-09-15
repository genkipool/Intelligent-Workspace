/**
 * The side panel froze on a real profile right after the bookmarks view was drawn: every
 * bookmark asked for its favicon in the same instant (1209 `_favicon` requests), and from
 * then on nothing the panel sent to the browser got an answer — extension API calls,
 * messages to the worker, even the navigation of the home button — until the extension
 * was reloaded. With the favicons loading lazily it no longer happened.
 *
 * These tests keep the long lists from going back to eager favicons, and keep the
 * duplicate-bookmark badge from sending one worker request per caller again.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('favicons in long lists load lazily', () => {
    it('bookmarks set loading=lazy before src', () => {
        const src = read('src/ui/bookmarks/bookmarks.js');
        const lazy = src.indexOf("favicon.loading = 'lazy'");
        const url = src.indexOf('favicon.src = `chrome-extension://');
        assert.ok(lazy > -1, 'bookmark favicons are lazy');
        assert.ok(url > lazy, 'loading is set before src, or the request has already started');
    });

    for (const [file, cls] of [
        ['src/ui/components/shared/GenericItem.svelte', 'favicon'],
        ['src/ui/components/downloads/DownloadItem.svelte', 'download-favicon'],
        ['src/ui/components/listGroup/TabItem.svelte', 'favicon'],
    ]) {
        it(`${file.split('/').pop()} marks its favicon lazy`, () => {
            const img = read(file).match(new RegExp(`<img[^>]*class="${cls}"[^>]*>`, 's'));
            assert.ok(img, 'favicon img found');
            assert.match(img[0], /loading="lazy"/);
        });
    }
});

describe('duplicate bookmark count', () => {
    it('shares one in-flight worker request between badge updates', () => {
        const src = read('src/ui/services/groupsService.js');
        const sends = src.match(/action: 'getDuplicateBookmarkCount'/g) || [];
        assert.equal(sends.length, 1, 'a single place sends the request');
        assert.match(src, /duplicateBookmarkCountRequest \?\?= new Promise/);
        assert.match(src, /requestDuplicateBookmarkCount\(\)\.then\(/);
    });
});
