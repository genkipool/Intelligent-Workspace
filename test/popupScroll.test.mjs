/**
 * What scrolls, and how, while a detached popup is open.
 *
 * Two traps live here, both of which shipped broken once:
 *  - the invisible hover bridge makes `scrollHeight > clientHeight` always true,
 *    so geometry can never decide whether the popup scrolls itself;
 *  - re-measuring a popup means dropping its height clamp, which the browser
 *    answers by wiping `scrollTop`.
 */

import { describe, it, beforeEach, before } from 'node:test';
import assert from 'node:assert/strict';

import { assertSamePixel, createPanel, modelPanelScroll, modelScrollBox, placeAnchor } from './helpers/panel.mjs';

const PANEL_CONTENT = 2000;
const PANEL_VIEWPORT = 600;

let forwardWheelToScrollParent;
let positionSmartPopup;
let panel;

before(async () => {
    panel = createPanel();
    ({ forwardWheelToScrollParent, positionSmartPopup } = await import('../src/ui/services/popupPositioning.js'));
});

beforeEach(() => {
    panel.frames.settle();
    modelPanelScroll(panel.list, { content: PANEL_CONTENT, viewport: PANEL_VIEWPORT });
});

/**
 * A popup wired for wheel forwarding. Its box always overflows by the ~10px the
 * hover bridge hangs past the bottom edge, which is the trap being guarded against.
 */
function openPopup({ scrollsItself }) {
    const popup = panel.window.document.createElement('div');
    if (scrollsItself) popup.classList.add('has-scroll-y');
    Object.defineProperty(popup, 'scrollHeight', { value: 210, configurable: true });
    Object.defineProperty(popup, 'clientHeight', { value: 200, configurable: true });
    panel.window.document.body.appendChild(popup);
    forwardWheelToScrollParent(popup, panel.anchor);
    return popup;
}

function wheel(popup, deltaY) {
    popup.dispatchEvent(new panel.window.WheelEvent('wheel', { deltaY, bubbles: true }));
}

describe('forwardWheelToScrollParent', () => {
    it('mueve el panel cuando el popup no tiene scroll propio', () => {
        const popup = openPopup({ scrollsItself: false });
        wheel(popup, 120);
        panel.frames.settle();
        assertSamePixel(panel.list.scrollTop, 120, 'el panel');
    });

    it('no toca el panel cuando el popup tiene scroll propio', () => {
        const popup = openPopup({ scrollsItself: true });
        wheel(popup, 120);
        panel.frames.settle();
        assert.equal(panel.list.scrollTop, 0);
    });

    it('reparte cada muesca en varios fotogramas en vez de un salto', () => {
        const popup = openPopup({ scrollsItself: false });
        wheel(popup, 120);

        assert.equal(panel.list.scrollTop, 0, 'nada se mueve antes del primer fotograma');
        panel.frames.tick();
        const afterFirst = panel.list.scrollTop;
        assert.ok(afterFirst > 0 && afterFirst < 120, `un fotograma avanza parte del camino, no todo (${afterFirst})`);

        panel.frames.settle();
        assertSamePixel(panel.list.scrollTop, 120, 'la muesca entera');
    });

    it('suma las muescas rapidas en vez de perder las anteriores', () => {
        const popup = openPopup({ scrollsItself: false });
        wheel(popup, 100);
        panel.frames.tick();
        wheel(popup, 100);
        panel.frames.tick();
        wheel(popup, 100);
        panel.frames.settle();
        assertSamePixel(panel.list.scrollTop, 300, 'las tres muescas');
    });

    it('se detiene al final de la lista sin quedarse girando', () => {
        const popup = openPopup({ scrollsItself: false });
        panel.list.scrollTop = PANEL_CONTENT - PANEL_VIEWPORT;
        wheel(popup, 500);
        const frames = panel.frames.settle();
        assert.ok(frames < 500, `debe terminar, no girar indefinidamente (${frames} fotogramas)`);
        assert.equal(panel.list.scrollTop, PANEL_CONTENT - PANEL_VIEWPORT);
    });

    it('no lanza si el ancla ya no esta en el documento', () => {
        const orphan = panel.window.document.createElement('div');
        const popup = panel.window.document.createElement('div');
        forwardWheelToScrollParent(popup, orphan);
        assert.doesNotThrow(() => wheel(popup, 120));
        panel.frames.settle();
        assert.equal(panel.list.scrollTop, 0);
    });
});

describe('positionSmartPopup y el scroll del propio popup', () => {
    const POPUP_CONTENT = 900;

    /** Un popup obligado a recortarse: el panel esta al final y no queda sitio. */
    function clampedPopup() {
        placeAnchor(panel.anchor, { top: 120 });
        panel.list.scrollTop = PANEL_CONTENT - PANEL_VIEWPORT;

        const popup = panel.window.document.createElement('div');
        panel.window.document.body.appendChild(popup);
        modelScrollBox(popup, { contentHeight: POPUP_CONTENT });
        positionSmartPopup(panel.anchor, popup, { margin: 8, gap: 5 });

        assert.ok(popup.classList.contains('has-scroll-y'), 'el escenario exige un popup recortado');
        return popup;
    }

    it('conserva el sitio del lector al recolocarse', () => {
        const popup = clampedPopup();
        const bottom = POPUP_CONTENT - popup.clientHeight;

        popup.scrollTop = bottom;
        positionSmartPopup(panel.anchor, popup, { margin: 8, gap: 5 });
        assert.equal(popup.scrollTop, bottom, 'recolocar no puede devolverlo arriba');

        popup.scrollTop = 120;
        positionSmartPopup(panel.anchor, popup, { margin: 8, gap: 5 });
        assert.equal(popup.scrollTop, 120);
    });

    it('deja llegar hasta el fondo', () => {
        const popup = clampedPopup();
        const bottom = POPUP_CONTENT - popup.clientHeight;
        popup.scrollTop = bottom;
        assert.equal(popup.scrollTop, bottom);
    });
});
