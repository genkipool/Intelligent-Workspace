/**
 * Las reglas de fecha del filtro de calendario, comunes a historial y descargas.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    dayInRange,
    endOfDay,
    isCurrentMonthOrLater,
    isFutureDay,
    normalizeRange,
    startOfDay,
} from '../src/ui/services/dateRange.js';

/** Un martes cualquiera, a media tarde: hoy para todas estas pruebas. */
const NOW = new Date(2026, 8, 8, 16, 30, 0);
const day = (d, month = 8, year = 2026) => new Date(year, month, d, 12, 0, 0);

describe('dias que se pueden elegir', () => {
    it('manana no', () => {
        assert.equal(isFutureDay(day(9), NOW), true);
    });

    it('hoy si, por tarde que sea', () => {
        assert.equal(isFutureDay(day(8), NOW), false);
        assert.equal(isFutureDay(new Date(2026, 8, 8, 23, 59, 59), NOW), false);
    });

    it('el pasado si', () => {
        assert.equal(isFutureDay(day(7), NOW), false);
        assert.equal(isFutureDay(day(31, 11, 2025), NOW), false);
    });
});

describe('hasta donde llega la flecha de mes siguiente', () => {
    it('se para en el mes en curso', () => {
        assert.equal(isCurrentMonthOrLater(2026, 8, NOW), true, 'septiembre de 2026 es el mes en curso');
    });

    it('deja pasar los meses anteriores', () => {
        assert.equal(isCurrentMonthOrLater(2026, 7, NOW), false);
        assert.equal(isCurrentMonthOrLater(2025, 11, NOW), false, 'diciembre del ano pasado');
    });

    it('corta los meses y anos futuros', () => {
        assert.equal(isCurrentMonthOrLater(2026, 9, NOW), true);
        assert.equal(isCurrentMonthOrLater(2027, 0, NOW), true, 'enero del ano que viene');
    });
});

describe('normalizeRange', () => {
    it('coge el dia entero, de la primera a la ultima milesima', () => {
        const { start, end } = normalizeRange(day(3), day(5));
        assert.equal(start, new Date(2026, 8, 3, 0, 0, 0, 0).getTime());
        assert.equal(end, new Date(2026, 8, 5, 23, 59, 59, 999).getTime());
    });

    it('ordena los dos clics, se hagan en el orden que se hagan', () => {
        assert.deepEqual(normalizeRange(day(5), day(3)), normalizeRange(day(3), day(5)));
    });

    it('el mismo dia dos veces es ese dia, no un rango vacio', () => {
        const { start, end } = normalizeRange(day(4), day(4));
        assert.equal(start, startOfDay(day(4)));
        assert.equal(end, endOfDay(day(4)));
        assert.ok(end > start);
    });
});

describe('dayInRange', () => {
    const range = normalizeRange(day(3), day(6));

    it('marca los extremos y lo de en medio', () => {
        assert.deepEqual(dayInRange(day(3), range), { inside: true, isStart: true, isEnd: false, isSingleDay: false });
        assert.deepEqual(dayInRange(day(4), range), { inside: true, isStart: false, isEnd: false, isSingleDay: false });
        assert.deepEqual(dayInRange(day(6), range), { inside: true, isStart: false, isEnd: true, isSingleDay: false });
    });

    it('deja fuera lo que esta fuera', () => {
        assert.equal(dayInRange(day(2), range).inside, false);
        assert.equal(dayInRange(day(7), range).inside, false);
    });

    it('un rango de un solo dia se reconoce como tal', () => {
        const single = dayInRange(day(4), normalizeRange(day(4), day(4)));
        assert.deepEqual(single, { inside: true, isStart: true, isEnd: true, isSingleDay: true });
    });

    it('sin rango no marca nada', () => {
        assert.equal(dayInRange(day(4), null).inside, false);
    });
});
