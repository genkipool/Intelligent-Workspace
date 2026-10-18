// The pomodoro's clock and its statistics, as the worker keeps them and as the panel and
// the dashboard exchange them. Each test is one of the faults found recording the
// tutorial videos (17-10-2026).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPomodoro } from './helpers/pomodoroWorker.mjs';
import { POMODORO_LIMITS, stepWithin } from '../src/ui/services/pomodoroSettingsService.js';
import {
    buildPomoBackup,
    parsePomoStatsFile,
    PomoStatsFormatError,
    sanitizePomoStatsEntry,
} from '../src/utils/pomoStatsFile.js';

describe('saving settings leaves the clock alone', () => {
    it('keeps a running phase running, from the same start', async () => {
        const w = loadPomodoro();
        await w.call('handlePomodoroStart');
        w.advance(60);
        const { startTime } = w.state();
        const resp = await w.call('handlePomodoroSaveSettings', { settings: { projectName: 'Website' } });
        assert.equal(resp.state.isRunning, true);
        assert.equal(resp.state.startTime, startTime);
        assert.equal(resp.state.settings.projectName, 'Website');
        assert.ok(resp.remaining <= 25 * 60 - 60 && resp.remaining > 25 * 60 - 62, `remaining ${resp.remaining}`);
        assert.ok(w.alarms.has('pomodoroTick') && w.alarms.has('pomodoroEnd'));
    });

    it('moves the end alarm when the length of the running phase changes', async () => {
        const w = loadPomodoro();
        await w.call('handlePomodoroStart');
        await w.call('handlePomodoroSaveSettings', { settings: { workDuration: 30 * 60 } });
        assert.equal(w.alarms.get('pomodoroEnd').when, w.state().startTime + 30 * 60 * 1000 + 250);
    });

    it('keeps how far a paused phase got when its length changes', async () => {
        const w = loadPomodoro();
        await w.call('handlePomodoroStart');
        w.advance(5 * 60);
        await w.call('handlePomodoroPause');
        const resp = await w.call('handlePomodoroSaveSettings', { settings: { workDuration: 30 * 60 } });
        assert.equal(resp.state.isRunning, false);
        assert.ok(Math.abs(resp.remaining - 25 * 60) <= 1, `remaining ${resp.remaining}`);
        assert.ok(resp.state.pausedAt, 'still paused');
    });
});

describe('skipping a phase', () => {
    it('counts only the time it ran, and not as a pomodoro done', async () => {
        const w = loadPomodoro();
        await w.call('handlePomodoroStart');
        w.advance(1);
        const resp = await w.call('handlePomodoroSkip');
        const st = resp.state;
        assert.ok(st.stats.totalFocusSeconds >= 1 && st.stats.totalFocusSeconds <= 2, `${st.stats.totalFocusSeconds}`);
        assert.equal(st.completedCycles, 0);
        assert.equal(st.completedWork, 0);
        assert.deepEqual([...st.stats.sessionFocusList], []);
        assert.equal(st.mode, 'short');
        assert.equal(w.notifications.length, 0, 'a skip is not announced');
        assert.equal(w.broadcasts.at(-1).event, 'skipped');
    });

    it('a phase that runs out still counts in full', async () => {
        const w = loadPomodoro();
        await w.call('handlePomodoroStart');
        w.advance(25 * 60 + 1);
        await w.fire('pomodoroEnd');
        assert.equal(w.state().stats.totalFocusSeconds, 25 * 60);
        assert.equal(w.state().completedCycles, 1);
        assert.equal(w.notifications.length, 1);
    });
});

describe('the open pause', () => {
    for (const [name, handler, message] of [
        ['reset', 'handlePomodoroReset'],
        ['a change of mode', 'handlePomodoroSetMode', { mode: 'short' }],
        ['a skip', 'handlePomodoroSkip'],
    ]) {
        it(`is closed by ${name}, and counted once`, async () => {
            const w = loadPomodoro();
            await w.call('handlePomodoroStart');
            w.advance(10);
            await w.call('handlePomodoroPause');
            w.advance(20);
            const resp = await w.call(handler, message);
            assert.equal(resp.state.pausedAt, null);
            const counted = resp.state.stats.totalInterruptionSeconds;
            assert.ok(counted >= 20 && counted <= 21, `interruption ${counted}`);
        });
    }

    it('is not reopened by a second pause', async () => {
        const w = loadPomodoro();
        await w.call('handlePomodoroStart');
        await w.call('handlePomodoroPause');
        const { pausedAt } = w.state();
        w.advance(5);
        const resp = await w.call('handlePomodoroPause');
        assert.equal(resp.state.interruptions, 1);
        assert.equal(resp.state.pausedAt, pausedAt - 5000);
    });
});

describe('the statistics file', () => {
    const entry = {
        id: 'Podcast_1',
        projectName: 'Podcast',
        savedAt: 1_700_000_000_000,
        sessionStarted: 1_699_999_000_000,
        totalFocusSeconds: 4500,
        completedCycles: 3,
        avgFocus: 1500,
        endAfter: 4,
        taskLog: [{ name: 'Podcast', duration: 4500, cycle: 3, endTime: 1_700_000_000_000 }],
        noteCount: 2,
    };

    it('reads back what it writes, task log and note count included', () => {
        const [read] = parsePomoStatsFile(JSON.parse(JSON.stringify(buildPomoBackup([entry]))));
        assert.equal(read.projectName, 'Podcast');
        assert.equal(read.totalFocusSeconds, 4500);
        assert.equal(read.endAfter, 4);
        assert.equal(read.taskLog.length, 1);
        assert.equal(read.noteCount, 2);
    });

    it('still reads a bare array and the old single-session summary', () => {
        assert.equal(parsePomoStatsFile([entry]).length, 1);
        const legacy = {
            project: 'Podcast',
            exportedAt: '2026-10-17T10:00:00.000Z',
            focusTime: '1h 15m',
            raw: {
                stats: { sessionStarted: 1, totalFocusSeconds: 3000, avgFocus: 0, sessionFocusList: [1500, 1500] },
                settings: { projectName: 'Podcast' },
            },
        };
        const [read] = parsePomoStatsFile(legacy);
        assert.equal(read.projectName, 'Podcast');
        assert.equal(read.totalFocusSeconds, 3000);
        assert.equal(read.avgFocus, 1500, 'the average the old export left at 0');
        assert.equal(read.savedAt, Date.parse(legacy.exportedAt));
    });

    it('rejects a file that is not one, as a format error', () => {
        for (const json of [{}, { type: 'other' }, [], [{ nope: true }], null]) {
            assert.throws(() => parsePomoStatsFile(json), PomoStatsFormatError);
        }
    });

    it('drops a session it cannot place and numbers that are not numbers', () => {
        assert.equal(sanitizePomoStatsEntry({ id: 'x' }), null);
        assert.equal(sanitizePomoStatsEntry({ id: 'x', savedAt: 5, totalFocusSeconds: 'lots' }).totalFocusSeconds, 0);
    });

    it('is the one both surfaces write and read', () => {
        for (const file of [
            'src/ui/pages/listGroup/features/pomodoro/index.js',
            'src/ui/pages/pomodoro-dashboard/Dashboard.svelte',
        ]) {
            const src = readFileSync(file, 'utf8');
            assert.match(src, /buildPomoBackup\(/, file);
            assert.match(src, /parsePomoStatsFile\(/, file);
        }
    });
});

describe('the limits of the numbers', () => {
    it('are the same in the panel and in the dashboard', () => {
        for (const file of [
            'src/ui/components/listGroup/PomodoroPanel.svelte',
            'src/ui/pages/pomodoro-dashboard/settings/PomodoroSettingsView.svelte',
        ]) {
            const src = readFileSync(file, 'utf8');
            for (const key of Object.keys(POMODORO_LIMITS)) {
                assert.match(src, new RegExp(`max=\\{POMODORO_LIMITS\\.${key}\\.max\\}`), `${file}: ${key}`);
            }
        }
    });

    it('"+" never lowers a value and "−" never raises it', () => {
        const limits = { min: 1, max: 120 };
        assert.equal(stepWithin(150, 1, limits), 150);
        assert.equal(stepWithin(150, -1, limits), 120);
        assert.equal(stepWithin(0, -1, limits), 0);
        assert.equal(stepWithin(0, 1, limits), 1);
        assert.equal(stepWithin(119, 1, limits), 120);
        assert.equal(stepWithin(120, 1, limits), 120);
    });
});
