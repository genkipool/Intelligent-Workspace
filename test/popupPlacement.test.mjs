/**
 * Where a detached popup goes, in the four situations `positionSmartPopup`
 * distinguishes: whole below, whole above, whole below on borrowed panel scroll,
 * and clamped with a scrollbar of its own.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { createPanel, modelPanelScroll, modelScrollBox, placeAnchor } from './helpers/panel.mjs';

const WINDOW_HEIGHT = 600;

let positionSmartPopup;
let panel;

before(async () => {
    panel = createPanel({ windowHeight: WINDOW_HEIGHT });
    ({ positionSmartPopup } = await import('../src/ui/services/popupPositioning.js'));
});

/**
 * Places a popup of `popupHeight` under the described conditions and reports
 * where it landed.
 */
function place({ anchorTop, popupHeight, panelContent = 600, panelViewport = 600, panelScrollTop = 0 }) {
    const { list, anchor, window } = panel;
    placeAnchor(anchor, { top: anchorTop });
    modelPanelScroll(list, { content: panelContent, viewport: panelViewport, scrollTop: panelScrollTop });

    const popup = window.document.createElement('div');
    window.document.body.appendChild(popup);
    modelScrollBox(popup, { contentHeight: popupHeight });

    positionSmartPopup(anchor, popup, { margin: 8, gap: 5 });

    const top = parseFloat(popup.style.top);
    const scrolls = popup.classList.contains('has-scroll-y');
    return {
        placement: popup.classList.contains('popup-upwards') ? 'above' : 'below',
        scrolls,
        overflowsViewport: top + (scrolls ? parseFloat(popup.style.maxHeight) : popupHeight) > WINDOW_HEIGHT,
        overflowX: popup.style.overflowX,
    };
}

describe('positionSmartPopup', () => {
    it('sale entero por abajo cuando cabe', () => {
        assert.deepEqual(place({ anchorTop: 100, popupHeight: 200 }), {
            placement: 'below',
            scrolls: false,
            overflowsViewport: false,
            overflowX: 'hidden',
        });
    });

    it('sale entero por arriba cuando no cabe por abajo', () => {
        assert.deepEqual(place({ anchorTop: 450, popupHeight: 200 }), {
            placement: 'above',
            scrolls: false,
            overflowsViewport: false,
            overflowX: 'hidden',
        });
    });

    it('sale entero por abajo aprovechando el scroll que le queda al panel', () => {
        const result = place({ anchorTop: 300, popupHeight: 400, panelContent: 1400, panelScrollTop: 0 });
        assert.equal(result.placement, 'below');
        assert.equal(result.scrolls, false, 'no debe recortarse: el panel puede subirlo hasta verlo entero');
        assert.equal(result.overflowsViewport, true, 'empieza sobresaliendo y entra al hacer scroll');
    });

    it('se recorta con scroll propio cuando el panel ya esta al final', () => {
        const result = place({ anchorTop: 300, popupHeight: 400, panelContent: 1400, panelScrollTop: 800 });
        assert.equal(result.scrolls, true);
        assert.equal(result.overflowsViewport, false);
    });

    it('se recorta con scroll propio cuando el panel no tiene scroll', () => {
        const result = place({ anchorTop: 380, popupHeight: 400 });
        assert.equal(result.scrolls, true);
        assert.equal(result.overflowsViewport, false);
    });

    it('se recorta con scroll propio cuando el scroll del panel no basta', () => {
        const result = place({ anchorTop: 300, popupHeight: 400, panelContent: 640 });
        assert.equal(result.scrolls, true);
        assert.equal(result.overflowsViewport, false);
    });

    it('al recortar elige el lado mas holgado', () => {
        // Ancla abajo: sobra sitio por arriba.
        assert.equal(
            place({ anchorTop: 300, popupHeight: 400, panelContent: 1400, panelScrollTop: 800 }).placement,
            'above',
        );
        // Ancla arriba: sobra sitio por abajo.
        assert.equal(
            place({ anchorTop: 120, popupHeight: 600, panelContent: 1400, panelScrollTop: 800 }).placement,
            'below',
        );
    });

    it('nunca deja scroll horizontal, se coloque donde se coloque', () => {
        const cases = [
            { anchorTop: 100, popupHeight: 200 },
            { anchorTop: 450, popupHeight: 200 },
            { anchorTop: 300, popupHeight: 400, panelContent: 1400 },
            { anchorTop: 380, popupHeight: 400 },
        ];
        cases.forEach((options) => assert.equal(place(options).overflowX, 'hidden'));
    });
});
