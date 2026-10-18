// The end of a pomodoro phase has its own one-shot alarm: a packed extension's periodic
// alarm fires at most every 30 s, which delayed the sound, the notification and the next
// phase by up to half a minute. These run the real pomodoro.js and handlers against a
// fake chrome.* to check the alarms are set and cleared together and that the tick and
// the end alarm firing at once complete the phase only once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadPomodoro } from './helpers/pomodoroWorker.mjs';

const start = (context) => new Promise((resolve) => vm.runInContext('handlePomodoroStart', context)(resolve));

test('starting a phase sets the tick and an alarm at its exact end', async () => {
    const { context, alarms } = loadPomodoro();
    const before = Date.now();
    await start(context);
    assert.equal(alarms.get('pomodoroTick')?.periodInMinutes, 1 / 60);
    const { when } = alarms.get('pomodoroEnd');
    const workMs = vm.runInContext('pomodoroDefaults().settings.workDuration', context) * 1000;
    assert.ok(when >= before + workMs && when <= Date.now() + workMs + 1000, `end alarm at ${when}`);
});

test('pausing clears both alarms', async () => {
    const { context, alarms } = loadPomodoro();
    await start(context);
    await new Promise((resolve) => vm.runInContext('handlePomodoroPause', context)(resolve));
    assert.equal(alarms.size, 0);
});

test('tick and end alarm at once complete the phase exactly once', async () => {
    const { context, storage, fire, notifications } = loadPomodoro();
    await start(context);
    // Move the phase start back so the work phase is over.
    const key = vm.runInContext('POMODORO_STORAGE_KEY', context);
    storage[key].startTime -= storage[key].settings.workDuration * 1000 + 1000;
    await Promise.all([fire('pomodoroTick'), fire('pomodoroEnd')]);
    assert.equal(storage[key].completedWork, 1);
    assert.equal(notifications.length, 1);
});
