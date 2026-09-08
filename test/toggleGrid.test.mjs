/**
 * El reparto en columnas de los interruptores de visibilidad de acciones.
 *
 * El panel es una rejilla: una fila a la que se le acaban los botones termina antes
 * del borde. Con once columnas fijas, la vista de marcadores (diez interruptores)
 * dejaba una celda vacia al final; la de grupos (veintidos) cuadraba de casualidad.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toggleGridColumns } from '../src/ui/services/toggleGrid.js';

/** Las filas que salen con esas columnas, y cuantos huecos quedan sin usar. */
function layout(count) {
    const columns = toggleGridColumns(count);
    const rows = Math.ceil(count / columns);
    return { columns, rows, emptyCells: rows * columns - count };
}

describe('toggleGridColumns', () => {
    it('la vista de marcadores llena su fila', () => {
        assert.deepEqual(layout(10), { columns: 10, rows: 1, emptyCells: 0 });
    });

    it('la vista de grupos conserva sus dos filas de once', () => {
        assert.deepEqual(layout(22), { columns: 11, rows: 2, emptyCells: 0 });
    });

    it('nunca pone mas de once por fila, que es donde el icono deja de caber', () => {
        for (let count = 1; count <= 60; count++) {
            assert.ok(
                toggleGridColumns(count) <= 11,
                `${count} interruptores dan ${toggleGridColumns(count)} columnas`,
            );
        }
    });

    it('reparte para dejar el minimo de huecos posible', () => {
        // Doce en dos filas son seis y seis, no once y uno.
        assert.deepEqual(layout(12), { columns: 6, rows: 2, emptyCells: 0 });
        // Cuando no hay reparto exacto, el sobrante nunca llega a una fila entera.
        for (let count = 1; count <= 60; count++) {
            const { columns, emptyCells } = layout(count);
            assert.ok(emptyCells < columns, `${count} interruptores dejan ${emptyCells} huecos de ${columns}`);
        }
    });

    it('un panel vacio no divide por cero', () => {
        assert.equal(toggleGridColumns(0), 1);
        assert.equal(toggleGridColumns(undefined), 1);
    });
});
