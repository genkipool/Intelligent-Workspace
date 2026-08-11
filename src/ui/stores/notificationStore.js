import { writable } from 'svelte/store';

let key = 0;
const _notification = writable({ visible: false, message: '', type: 'success', key: 0 });
let timeoutId = null;
let startTime = null;
let remaining = 0;

export const notificationStore = {
    subscribe: _notification.subscribe,
    show(message, type = 'success', duration = 3000) {
        clearTimeout(timeoutId);
        remaining = duration;
        startTime = Date.now();
        _notification.set({ visible: true, message, type, key: ++key });
        timeoutId = setTimeout(() => {
            _notification.set({ visible: false, message: '', type: 'success', key: 0 });
        }, remaining);
    },
    pause() {
        if (timeoutId === null) return;
        clearTimeout(timeoutId);
        timeoutId = null;
        remaining -= Date.now() - startTime;
    },
    resume() {
        if (timeoutId !== null) return;
        if (remaining <= 0) return;
        startTime = Date.now();
        timeoutId = setTimeout(() => {
            _notification.set({ visible: false, message: '', type: 'success', key: 0 });
        }, remaining);
    },
    hide() {
        clearTimeout(timeoutId);
        timeoutId = null;
        _notification.set({ visible: false, message: '', type: 'success', key: 0 });
    },
};
