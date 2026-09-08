/**
 * Los contadores de los chips de descargas.
 *
 * El chip enseña un numero y, al pulsarlo, filtra la lista a lo que conto. Si esas
 * dos respuestas se calculan por separado acaban discrepando: una descarga en pausa
 * es `in_progress` con `paused`, asi que la cadena if/else del contador la archivaba
 * en "en progreso" y no llegaba nunca a la rama de pausadas, mientras el filtro si
 * la listaba en "pausadas / errores". Y la vista sumaba un campo `paused` que el
 * store no devolvia, con lo que el chip ponia NaN.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
    downloadStats,
    downloadsStore,
    downloadsStatusFilter,
    downloadsSearchQuery,
    downloadsDateFilter,
} from '../src/ui/stores/downloadsStore.js';

/** Como Chrome describe cada situacion en `chrome.downloads`. */
const AT = '2026-09-08T10:00:00Z';
const DOWNLOADS = [
    { id: 1, state: 'in_progress', paused: false, canResume: false, filename: 'a.zip', startTime: AT },
    { id: 2, state: 'in_progress', paused: true, canResume: true, filename: 'b.zip', startTime: AT },
    { id: 3, state: 'complete', paused: false, filename: 'c.zip', startTime: AT },
    { id: 4, state: 'complete', paused: false, filename: 'd.zip', startTime: AT },
    { id: 5, state: 'interrupted', paused: false, canResume: true, filename: 'e.zip', startTime: AT },
];

/** El numero de filas que el panel acaba pintando con el filtro puesto. */
function listedUnder(status) {
    downloadsStatusFilter.set(status);
    return get(downloadsStore).reduce((rows, group) => rows + group.items.length, 0);
}

beforeEach(() => {
    downloadsSearchQuery.set('');
    downloadsDateFilter.set(null);
    downloadsStatusFilter.set('all');
    downloadsStore.raw.set(DOWNLOADS);
});

describe('downloadStats', () => {
    it('no deja ningun contador en NaN', () => {
        Object.entries(get(downloadStats)).forEach(([name, count]) => {
            assert.ok(Number.isFinite(count), `${name} vale ${count}`);
        });
    });

    it('cuenta las pausadas aparte de los errores', () => {
        const stats = get(downloadStats);
        assert.equal(stats.paused, 1, 'la pausada (id 2)');
        assert.equal(stats.interrupted, 1, 'el error (id 5), sin arrastrar la pausada');
    });

    it('no cuenta la pausada como en progreso', () => {
        // Chrome deja la pausada en in_progress, pero su chip es el de pausadas.
        assert.equal(get(downloadStats).inProgress, 1, 'solo la id 1');
    });

    it('los cuatro estados son excluyentes, asi que suman el total', () => {
        const { total, inProgress, complete, paused, interrupted } = get(downloadStats);
        assert.equal(inProgress + complete + paused + interrupted, total);
    });

    it('cada chip cuenta exactamente lo que su filtro lista', () => {
        const stats = get(downloadStats);
        assert.equal(stats.total, listedUnder('all'), 'todas');
        assert.equal(stats.inProgress, listedUnder('in_progress'), 'en progreso');
        assert.equal(stats.complete, listedUnder('complete'), 'completadas');
        assert.equal(stats.paused, listedUnder('paused'), 'pausadas');
        assert.equal(stats.interrupted, listedUnder('interrupted'), 'errores');
    });

    it('sigue a la lista cuando cambia', () => {
        downloadsStore.raw.set([]);
        assert.deepEqual(get(downloadStats), { total: 0, inProgress: 0, complete: 0, paused: 0, interrupted: 0 });

        downloadsStore.raw.set([{ id: 9, state: 'interrupted', filename: 'z.zip' }]);
        assert.equal(get(downloadStats).interrupted, 1);
    });
});
