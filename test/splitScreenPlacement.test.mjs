/**
 * Split screen when the window manager ignores window placement (Chrome on Wayland).
 *
 * Measured in Chrome 151: on Wayland `windows.update` echoes the requested left/top back,
 * but a window from `windows.create` settles at (0, 0) whatever was requested. On X11 it
 * keeps the requested position. The mock reproduces both behaviours.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DISPLAY = { bounds: { left: 0, top: 0, width: 1920, height: 1080 } };
DISPLAY.workArea = { left: 0, top: 0, width: 1920, height: 1040 };

// Objects built inside the vm realm have another Object.prototype, which deepStrictEqual rejects.
const plain = (obj) => JSON.parse(JSON.stringify(obj));

function createHarness({ os = 'linux', wayland = false, session = {} } = {}) {
    const windows = new Map([[1, { id: 1, left: 0, top: 0, width: 945, height: 1060, state: 'maximized' }]]);
    const calls = { create: [], update: [], notifications: [] };
    let nextTabId = 500;

    const chrome = {
        runtime: { getPlatformInfo: async () => ({ os }) },
        system: { display: { getInfo: async () => [DISPLAY] } },
        storage: {
            session: {
                get: async (key) => (key in session ? { [key]: session[key] } : {}),
                set: async (obj) => Object.assign(session, obj),
            },
        },
        windows: {
            get: async (id) => ({ ...windows.get(id) }),
            getAll: async () => [...windows.values()],
            update: async (id, props) => {
                calls.update.push({ id, props });
                Object.assign(windows.get(id), props);
            },
            create: async (props) => {
                calls.create.push(props);
                const tab = { id: nextTabId++, url: props.url };
                const win = { id: 2, state: 'normal', left: 0, top: 0, ...props, tabs: [tab] };
                windows.set(2, win);
                const created = { ...win };
                // The compositor configures the surface right after creation.
                if (wayland) setTimeout(() => Object.assign(win, { left: 0, top: 0 }), 20);
                return created;
            },
        },
        tabs: {
            get: async (id) => ({ id, url: 'https://example.com/', windowId: 1 }),
            create: async (props) => ({ id: nextTabId++, ...props }),
            group: async () => 77,
        },
        tabGroups: { update: async () => {} },
        notifications: { create: (id, opts) => calls.notifications.push({ id, opts }) },
    };

    const context = {
        chrome,
        console,
        setTimeout,
        logMessage: () => {},
        tabsEverActive: new Set(),
        saveSessionState: async () => {},
        groupInfoMap: new Map(),
        saveGroupInfoMap: async () => {},
        handleSplitScreenClosure: async () => {},
        getI18nMsg: (key) => key,
    };
    vm.createContext(context);
    vm.runInContext(readFileSync('src/core/background/state.js', 'utf8'), context);
    vm.runInContext(readFileSync('src/core/background/handlers/ui.js', 'utf8'), context);

    const toggle = () =>
        new Promise((resolve) =>
            vm.runInContext('handleToggleSplitScreen', context)(
                { tabId: 100 },
                { tab: { id: 100, windowId: 1 } },
                resolve,
            ),
        );
    return { toggle, windows, calls, session };
}

describe('Split screen window placement', () => {
    it('on Wayland detects the ignored placement, sizes both windows to halves and warns once', async () => {
        const h = createHarness({ wayland: true });
        const res = await h.toggle();

        assert.equal(res.success, true);
        assert.equal(h.session.splitScreenPlacement, 'ignored');
        assert.deepEqual(
            { width: h.windows.get(1).width, height: h.windows.get(1).height },
            { width: 960, height: 1040 },
        );
        assert.deepEqual(
            { width: h.windows.get(2).width, height: h.windows.get(2).height },
            { width: 960, height: 1040 },
        );
        assert.equal(h.calls.notifications.length, 1);
        assert.equal(h.calls.notifications[0].opts.message, 'splitScreenPlacementIgnored');
    });

    it('once Wayland is known, opens with halves directly, without positions or a new notice', async () => {
        const h = createHarness({ wayland: true, session: { splitScreenPlacement: 'ignored' } });
        await h.toggle();

        assert.equal(h.calls.create.length, 1);
        assert.equal('left' in h.calls.create[0], false);
        assert.equal('top' in h.calls.create[0], false);
        assert.deepEqual(plain(h.calls.update.at(-1).props), { width: 960, height: 1040 });
        assert.equal(h.calls.notifications.length, 0);
    });

    it('on X11 keeps the positioned 45/55 layout and does not warn', async () => {
        const h = createHarness({ wayland: false });
        await h.toggle();

        assert.equal(h.session.splitScreenPlacement, 'honored');
        assert.deepEqual(plain(h.calls.create[0]), {
            url: 'https://example.com/',
            left: -38,
            top: -38,
            width: 902,
            height: 1194,
            type: 'normal',
        });
        assert.equal(h.windows.get(1).left, 864);
        assert.equal(h.calls.notifications.length, 0);
    });

    it('outside Linux never probes the placement', async () => {
        const h = createHarness({ os: 'win' });
        await h.toggle();

        assert.equal('splitScreenPlacement' in h.session, false);
        assert.equal(h.calls.create[0].left, -19);
        assert.equal(h.calls.notifications.length, 0);
    });
});
