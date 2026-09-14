/**
 * The worker refuses messages from content scripts unless their action is in
 * ALLOWED_CONTENT_SCRIPT_ACTIONS. That list was once written by hand from the keyboard
 * shortcuts, and the omnibar — a content script at the time — opened empty because
 * every list it asks for was refused.
 *
 * These tests take the actions from the scripts that really run inside web pages (the
 * manifest's content scripts plus the overlays the worker injects) and hold the list
 * to exactly that set, in both directions. They also hold the omnibar where it now
 * lives: in an extension frame, out of the content scripts and out of this list.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/** Every file that runs in a web page's isolated world and can call chrome.runtime. */
function contentScriptFiles() {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
    const files = new Set();
    for (const entry of manifest.content_scripts) {
        // The main world has no chrome.runtime to send with.
        if (entry.world === 'MAIN') continue;
        entry.js.forEach((file) => files.add(file));
    }
    // Scripts the worker injects with chrome.scripting.executeScript({ files }).
    const walk = (dir) =>
        readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
            d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)],
        );
    for (const file of walk('src/core').filter((f) => f.endsWith('.js'))) {
        const source = readFileSync(file, 'utf8');
        // One level of nesting is allowed for `target: { tabId }`, which comes first.
        for (const match of source.matchAll(/executeScript\(\{(?:[^{}]|\{[^{}]*\})*?files:\s*\[([^\]]*)\]/g)) {
            for (const [, injected] of match[1].matchAll(/['"]([^'"]+\.js)['"]/g)) files.add(injected);
        }
    }
    return [...files];
}

/**
 * The actions a source sends: `runtime.sendMessage({ action: 'x' … })`, the registry's
 * `this._send('x')`, and prefix tables (`prefixes[…] = 'x'`), whose value is sent as
 * `{ action }`.
 */
function sentActions(source) {
    const actions = new Set();
    for (const [, a] of source.matchAll(/runtime\.sendMessage\(\s*\{[^}]*?\baction\s*:\s*['"](\w+)['"]/gs))
        actions.add(a);
    for (const [, a] of source.matchAll(/\b_send\(\s*['"](\w+)['"]/g)) actions.add(a);
    for (const [, a] of source.matchAll(/[Pp]refixes\[[^\]]+\]\s*=\s*['"](\w+)['"]/g)) actions.add(a);
    return actions;
}

/** Runs messaging.js the way the worker does and returns its top-level bindings. */
function loadMessaging() {
    const noop = new Proxy(function () {}, {
        get: (target, prop) =>
            prop === 'id' ? 'ext-id' : prop === 'getURL' ? (p = '') => `chrome-extension://ext-id/${p}` : noop,
        apply: () => undefined,
    });
    const context = { console, URL, Set, Map, chrome: noop };
    vm.createContext(context);
    vm.runInContext(readFileSync('src/core/background/messaging.js', 'utf8'), context);
    return {
        allowed: new Set(vm.runInContext('[...ALLOWED_CONTENT_SCRIPT_ACTIONS]', context)),
        handlers: new Set(vm.runInContext('Object.keys(MESSAGE_HANDLERS)', context)),
    };
}

describe('Content script message contract (messaging.js)', () => {
    const files = contentScriptFiles();
    const sent = new Map();
    for (const file of files) {
        for (const action of sentActions(readFileSync(file, 'utf8'))) {
            if (!sent.has(action)) sent.set(action, []);
            sent.get(action).push(file);
        }
    }
    const { allowed, handlers } = loadMessaging();

    it('reads the injected overlays as content scripts', () => {
        for (const file of [
            'src/utils/area-selector.js',
            'src/utils/screen-color-picker.js',
            'src/utils/readAloud.js',
        ]) {
            assert.ok(files.includes(file), `${file} must be read as a content script`);
        }
    });

    it('runs the omnibar in its extension frame, with only its host in the page', () => {
        assert.equal(files.includes('src/utils/hint/omnibar.js'), false, 'omnibar.js must not be a content script');
        assert.ok(files.includes('src/utils/hint/omnibar-host.js'), 'omnibar-host.js must be a content script');
        const frame = readFileSync('src/utils/hint/omnibar-frame.html', 'utf8');
        for (const script of ['../hint_common.js', 'utils.js', 'omnibar.js', 'omnibar-frame.js']) {
            assert.ok(frame.includes(`<script src="${script}"></script>`), `the frame must load ${script}`);
        }
        const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
        const exposed = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
        assert.ok(exposed.includes('src/utils/hint/omnibar-frame.html'), 'pages must be able to frame the omnibar');
        assert.equal(exposed.includes('src/utils/hint/omnibar.js'), false, 'omnibar.js has no reason to be exposed');
    });

    it('allows every action a content script sends', () => {
        const refused = [...sent.keys()].filter((action) => !allowed.has(action));
        assert.deepEqual(
            refused.map((action) => `${action} (${sent.get(action).join(', ')})`),
            [],
            'Content scripts send these actions but the worker refuses them',
        );
    });

    it('allows nothing that no content script sends', () => {
        const unused = [...allowed].filter((action) => !sent.has(action));
        assert.deepEqual(unused, [], 'These actions are open to content scripts but none of them sends it');
    });

    it('keeps what only extension pages ask for out of reach of a web page', () => {
        for (const action of [
            // Extension pages.
            'getCookiesForUrl',
            'setCookie',
            'removeCookie',
            'fetchPageContent',
            'getDownloads',
            'eraseAllDownloads',
            'captureFullPage',
            'getBookmarks',
            'deleteAllBookmarks',
            'openFileUrl',
            // The omnibar, now that it is one.
            'getOpenTabs',
            'getHistory',
            'searchBookmarks',
            'getRules',
            'getOmnibarNotes',
            'getOmnibarConversations',
            'getOmnibarAllMessages',
            'getOmnibarScreenshots',
            'searchGemini',
            'geminiAgentToolCall',
            'deleteTabs',
        ]) {
            assert.ok(handlers.has(action), `"${action}" must still be a handler`);
            assert.equal(allowed.has(action), false, `"${action}" must not be open to content scripts`);
        }
    });
});
