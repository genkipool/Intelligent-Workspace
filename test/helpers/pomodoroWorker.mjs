// Runs the real pomodoro.js and its message handlers against a fake chrome.*, so a test
// can drive the worker's clock the way the panels do and read what it stored.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

export function loadPomodoro() {
    const storage = {};
    const alarms = new Map();
    const listeners = [];
    const notifications = [];
    const broadcasts = [];
    const context = {
        console,
        setTimeout,
        clearTimeout,
        Date,
        chrome: {
            storage: {
                local: {
                    get: async (key) => (key in storage ? { [key]: structuredClone(storage[key]) } : {}),
                    set: async (obj) => Object.assign(storage, structuredClone(obj)),
                },
            },
            alarms: {
                create: async (name, info) => alarms.set(name, info),
                clear: async (name) => alarms.delete(name),
                onAlarm: { addListener: (fn) => listeners.push(fn) },
            },
            notifications: { create: (...args) => notifications.push(args) },
            runtime: {
                sendMessage: (msg) => {
                    broadcasts.push(msg);
                    return Promise.resolve();
                },
                getContexts: async () => [],
            },
            offscreen: { createDocument: async () => {} },
        },
        getI18nMsg: (key) => key,
    };
    vm.createContext(context);
    vm.runInContext(readFileSync('src/core/background/handlers/pomodoro-handlers.js', 'utf8'), context);
    vm.runInContext(readFileSync('src/core/background/pomodoro.js', 'utf8'), context);
    // Sound goes through the offscreen document; not what is under test.
    vm.runInContext('playPomodoroSoundBackground = async () => {};', context);
    const fire = (name) => Promise.all(listeners.map((fn) => fn({ name })));
    const key = vm.runInContext('POMODORO_STORAGE_KEY', context);

    /** Calls a `handlePomodoroX(…, sendResponse)` handler and resolves with its answer. */
    const call = (handler, message) =>
        new Promise((resolve) => {
            const fn = vm.runInContext(handler, context);
            if (message === undefined) fn(resolve);
            else fn(message, resolve);
        });

    /** Moves the stored clock back in time, as if `seconds` had passed. */
    const advance = (seconds) => {
        const state = storage[key];
        if (state.startTime) state.startTime -= seconds * 1000;
        if (state.pausedAt) state.pausedAt -= seconds * 1000;
    };

    return { context, storage, alarms, fire, notifications, broadcasts, call, advance, state: () => storage[key] };
}
