/**
 * panel.mjs — a side panel in miniature, for the popup placement tests.
 *
 * jsdom does no layout, so every box these tests measure is modelled by hand. The
 * one behaviour worth modelling faithfully is what a browser does to `scrollTop`
 * when a box grows: it clamps it on the spot, and never gives it back.
 */

import { JSDOM } from 'jsdom';

/**
 * Builds the document and installs the globals `popupPositioning.js` reaches for.
 *
 * @param {{windowWidth?: number, windowHeight?: number}} [viewport]
 * @returns {{window: Window, list: HTMLElement, anchor: HTMLElement, frames: ReturnType<typeof installFrameClock>}}
 */
export function createPanel({ windowWidth = 400, windowHeight = 600 } = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="list"><div id="anchor"></div></div></body>');
    const { window } = dom;

    Object.defineProperty(window, 'innerWidth', { value: windowWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: windowHeight, configurable: true });

    global.window = window;
    global.document = window.document;
    global.getComputedStyle = window.getComputedStyle.bind(window);
    global.Node = window.Node;

    const list = window.document.getElementById('list');
    list.style.overflowY = 'auto';

    return { window, list, anchor: window.document.getElementById('anchor'), frames: installFrameClock() };
}

/**
 * Replaces the frame loop with one the test drives itself, so the eased wheel
 * glide can be stepped frame by frame instead of waited on.
 */
export function installFrameClock() {
    const pending = new Map();
    let nextId = 1;

    global.requestAnimationFrame = (callback) => {
        pending.set(nextId, callback);
        return nextId++;
    };
    global.cancelAnimationFrame = (id) => pending.delete(id);

    return {
        /** Runs the callbacks queued right now; ones they queue wait for the next call. */
        tick() {
            const due = [...pending];
            pending.clear();
            due.forEach(([, callback]) => callback());
            return due.length;
        },
        /** Runs frames until the queue drains, so an animation can settle. */
        settle(maxFrames = 500) {
            let frames = 0;
            while (pending.size > 0 && frames < maxFrames) {
                this.tick();
                frames++;
            }
            return frames;
        },
    };
}

/**
 * Makes `el` behave like a scrollable box the browser lays out.
 *
 * Measuring is what triggers layout, so both height getters re-clamp `scrollTop`
 * first: that is exactly how dropping a popup's `max-height` to measure it wipes
 * the reader's scroll position.
 *
 * @param {HTMLElement} el
 * @param {{contentHeight: number, width?: number, cappedByMaxHeight?: boolean, boxHeight?: number}} box
 */
export function modelScrollBox(el, { contentHeight, width = 200, cappedByMaxHeight = true, boxHeight }) {
    let scrollTop = 0;

    const layout = () => {
        const cap = cappedByMaxHeight ? parseFloat(el.style.maxHeight) || Infinity : Infinity;
        const height = Math.min(boxHeight ?? contentHeight, cap);
        scrollTop = Math.min(scrollTop, Math.max(0, contentHeight - height));
        return height;
    };

    Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
    Object.defineProperty(el, 'offsetHeight', { get: layout, configurable: true });
    Object.defineProperty(el, 'clientHeight', { get: layout, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: contentHeight, configurable: true });
    Object.defineProperty(el, 'scrollTop', {
        get: () => scrollTop,
        set: (value) => {
            scrollTop = Math.max(0, Math.min(value, Math.max(0, contentHeight - layout())));
        },
        configurable: true,
    });
}

/**
 * Pins an anchor at a fixed spot in the viewport.
 *
 * @param {HTMLElement} el
 * @param {{top: number, height?: number, left?: number, width?: number}} at
 */
export function placeAnchor(el, { top, height = 20, left = 300, width = 80 }) {
    el.getBoundingClientRect = () => ({
        top,
        bottom: top + height,
        left,
        right: left + width,
        width,
        height,
    });
}

/**
 * Models the panel's own scrolling: a fixed viewport over taller content, with
 * `scrollTop` clamped to the ends the way a real list clamps it.
 *
 * @param {HTMLElement} list
 * @param {{content: number, viewport?: number, scrollTop?: number}} panel
 */
export function modelPanelScroll(list, { content, viewport = 600, scrollTop = 0 }) {
    modelScrollBox(list, { contentHeight: content, boxHeight: viewport, cappedByMaxHeight: false });
    list.scrollTop = scrollTop;
}

/** Asserts two lengths match to within half a pixel, which is all layout resolves. */
export function assertSamePixel(actual, expected, message) {
    if (Math.abs(actual - expected) > 0.5) {
        throw new Error(`${message ?? 'longitud'}: ${actual} no es ${expected}`);
    }
}
