import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/core/services/webActivitySchema.js';
import { loosensRule } from '../src/ui/pages/web-activity/blockLock.js';
import { computeKpis, daysInPeriod, limitRows } from '../src/ui/pages/web-activity/webActivityAnalytics.js';

const WA = globalThis.ITG_WEB_ACTIVITY;
const rule = (fields) => WA.normalizeLimit(fields);

test('raising or clearing an allowance loosens the rule; lowering it does not', () => {
    const before = rule({ dailyLimitSeconds: 1800 });
    assert.equal(loosensRule(before, rule({ dailyLimitSeconds: 7200 })), true);
    assert.equal(loosensRule(before, rule({ dailyLimitSeconds: 0 })), true);
    assert.equal(loosensRule(before, rule({ dailyLimitSeconds: 600 })), false);
    assert.equal(loosensRule(before, rule({ dailyLimitSeconds: 1800, dailyLimitEnabled: false })), true);
    assert.equal(loosensRule(rule({ weeklyLimitSeconds: 3600 }), rule({ weeklyLimitSeconds: 7200 })), true);
    assert.equal(loosensRule(rule({ weeklyLimitSeconds: 3600 }), rule({ weeklyLimitSeconds: 60 })), false);
    assert.equal(loosensRule(before, null), true);
    assert.equal(loosensRule(null, rule({ dailyLimitSeconds: 60 })), false);
});

test('fewer days under a daily allowance loosens it; more days does not', () => {
    const before = rule({ dailyLimitSeconds: 600, dailyLimitDays: [1, 2, 3] });
    assert.equal(loosensRule(before, rule({ dailyLimitSeconds: 600, dailyLimitDays: [1, 2] })), true);
    assert.equal(loosensRule(before, rule({ dailyLimitSeconds: 600, dailyLimitDays: [1, 2, 3, 4] })), false);
});

test('more allowed hours loosen the schedule; fewer do not', () => {
    const nineToSix = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };
    const before = rule({ schedules: [nineToSix] });
    // A second window, a wider one, or another day: the site is let through more.
    assert.equal(loosensRule(before, rule({ schedules: [nineToSix, { start: '20:00', end: '21:00' }] })), true);
    assert.equal(loosensRule(before, rule({ schedules: [{ ...nineToSix, end: '19:00' }] })), true);
    assert.equal(loosensRule(before, rule({ schedules: [{ ...nineToSix, days: [1, 2, 3, 4, 5, 6] }] })), true);
    // A narrower window, or fewer days: stricter.
    assert.equal(loosensRule(before, rule({ schedules: [{ ...nineToSix, start: '10:00' }] })), false);
    assert.equal(loosensRule(before, rule({ schedules: [{ ...nineToSix, days: [1, 2] }] })), false);
    // No windows at all lets it through all the time; a first window is stricter.
    assert.equal(loosensRule(before, rule({})), true);
    assert.equal(
        loosensRule(rule({ dailyLimitSeconds: 60 }), rule({ dailyLimitSeconds: 60, schedules: [nineToSix] })),
        false,
    );
    // "Always blocked" is the strictest there is.
    assert.equal(loosensRule(rule({ blockAlways: true }), rule({ schedules: [nineToSix] })), true);
    assert.equal(loosensRule(before, rule({ blockAlways: true })), false);
});

test('an overnight window is read as running into the next day', () => {
    const before = rule({ schedules: [{ start: '22:00', end: '02:00', days: [5] }] });
    assert.equal(loosensRule(before, rule({ schedules: [{ start: '22:00', end: '01:00', days: [5] }] })), false);
    assert.equal(loosensRule(before, rule({ schedules: [{ start: '22:00', end: '03:00', days: [5] }] })), true);
});

test('a period lists its quiet days, so the chart draws them at zero', () => {
    const now = new Date(2026, 9, 18, 12).getTime();
    const days = { '2026-10-12': { domains: {} }, '2026-10-15': { domains: {} }, '2026-10-18': { domains: {} } };
    assert.deepEqual(daysInPeriod(days, 7, now), [
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
        '2026-10-17',
        '2026-10-18',
    ]);
    // "Everything" runs from the first day on record.
    assert.equal(daysInPeriod(days, 0, now).length, 7);
    assert.deepEqual(daysInPeriod(days, 1, now), ['2026-10-18']);
    assert.deepEqual(daysInPeriod({}, 7, now), []);
});

test('a site filed under a category is neither a limit nor a rule row', () => {
    const limits = {
        'nasa.gov': { category: 'education' },
        'reddit.com': rule({ dailyLimitSeconds: 600 }),
    };
    const kpis = computeKpis({ sites: [], days: {}, dayKeys: [], limits, lang: 'en', i18n: (key) => key });
    assert.equal(kpis.find((kpi) => kpi.label === 'webActivityKpiLimits').value, 1);
    assert.deepEqual(
        limitRows(limits, {}).map((row) => row.domain),
        ['reddit.com'],
    );
});

test('narrowing a rule to the site alone loosens it; widening it to the subdomains does not', () => {
    const wide = rule({ dailyLimitSeconds: 600, includeSubdomains: true });
    const narrow = rule({ dailyLimitSeconds: 600, includeSubdomains: false });
    assert.equal(loosensRule(wide, narrow), true);
    assert.equal(loosensRule(narrow, wide), false);
});
