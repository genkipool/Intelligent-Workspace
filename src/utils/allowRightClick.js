/**
 * RIGHT-CLICK AND COPY UNBLOCKER (isolated world)
 *
 * Gives back what a page takes away: the context menu, text selection, copy, cut,
 * paste and dragging. The half of the job that needs the page's own JavaScript
 * context — undoing `preventDefault()`, `return false` handlers, inline
 * `oncontextmenu="return false"` attributes and selection wiping — lives in
 * allowRightClickHook.js; this file owns the switch and the two blocks that are
 * pure DOM:
 *
 *   1. `user-select: none`. Lifted at the pointer instead of page-wide: a blanket
 *      override would make every toolbar and button label selectable on every
 *      site, which is a worse page than the one the user asked to fix. On mouse
 *      down the outermost element that declares the block is found and released,
 *      and the selection then extends through its subtree normally.
 *   2. The transparent overlay laid over images. Nothing is blocked here — the
 *      right click simply lands on a shield div — so the elements stacked above
 *      the picture stop taking pointer events until the menu closes.
 *
 * The switch is `allowRightClickEnabled` in sync storage, on unless it was turned
 * off, and it is mirrored onto <html> for the main world to read. Turning it off
 * undoes everything without a reload.
 */
(() => {
    if (window.__itgAllowRightClick) return;
    window.__itgAllowRightClick = true;

    const STORAGE_KEY = 'allowRightClickEnabled';
    const FLAG = 'data-itg-allow-right-click';

    let active = false;
    /** Everything that has to be undone when the feature is switched off. */
    const teardown = new Set();
    /** element -> the inline user-select it had before it was released. */
    const releasedSelection = new Map();

    /* ------------------------------------------------------------------ *
     * 1. user-select
     * ------------------------------------------------------------------ */

    /** element released by the press being held right now, if any. */
    let pending = null;

    const unselectable = (node) => {
        const style = getComputedStyle(node);
        return style.userSelect === 'none' || style.webkitUserSelect === 'none';
    };

    /**
     * The outermost ancestor whose computed user-select is none, target included.
     * user-select inherits, so a target that is selectable ends the search at once
     * and the common case costs a single style read.
     */
    const outermostUnselectable = (start) => {
        let node = start?.nodeType === Node.ELEMENT_NODE ? start : start?.parentElement;
        if (!node || !unselectable(node)) return null;
        let found = node;
        for (node = node.parentElement; node && unselectable(node); node = node.parentElement) found = node;
        return found;
    };

    const releaseSelection = (event) => {
        const element = outermostUnselectable(event.target);
        if (!element || releasedSelection.has(element)) return;
        releasedSelection.set(element, element.style.getPropertyValue('user-select'));
        element.style.setProperty('user-select', 'text', 'important');
        pending = element;
    };

    const restoreOne = (element) => {
        const value = releasedSelection.get(element);
        if (value === undefined) return;
        element.style.removeProperty('user-select');
        if (value) element.style.setProperty('user-select', value);
        releasedSelection.delete(element);
    };

    /**
     * A press that selected nothing was a click on something the page had good
     * reason to make unselectable — a button, a toolbar — so the release is undone
     * and only the elements the user actually selected text in stay open.
     */
    const onMouseUp = () => {
        if (!pending) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) restoreOne(pending);
        pending = null;
    };

    const restoreSelection = () => {
        for (const element of [...releasedSelection.keys()]) restoreOne(element);
        releasedSelection.clear();
    };

    /* ------------------------------------------------------------------ *
     * 2. Overlays on top of images
     * ------------------------------------------------------------------ */

    const shielded = new Map();
    const shieldControllers = new Set();
    const shieldProbes = new Set();

    const revertShield = () => {
        for (const [element, value] of shielded) {
            if (value) element.style.setProperty('pointer-events', value);
            else element.style.removeProperty('pointer-events');
        }
        shielded.clear();
        for (const controller of shieldControllers) controller.abort();
        shieldControllers.clear();
        for (const probe of shieldProbes) probe.remove();
        shieldProbes.clear();
    };

    const seeThrough = (element) => {
        if (shielded.has(element)) return;
        shielded.set(element, element.style.getPropertyValue('pointer-events'));
        element.style.setProperty('pointer-events', 'none', 'important');
    };

    /** Everything the right click could reasonably have been aimed at. */
    const collectTargets = (stack) => {
        const images = [];
        const videos = [];
        const inputs = [];
        const backgrounds = [];
        for (const element of stack) {
            if (element.tagName === 'VIDEO' && element.src) videos.push(element);
            else if (element.src || element.tagName === 'CANVAS') images.push(element);
            if (typeof element.type === 'string' && element.type.startsWith('text')) inputs.push(element);
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') continue;
            const url = getComputedStyle(element).backgroundImage?.match(/url\(["']?(.*?)["']?\)/);
            if (url) backgrounds.push({ element, src: url[1] });
        }
        return { images, videos, inputs, backgrounds };
    };

    /** Clears the way down to the first element in `wanted`. */
    const clearDownTo = (stack, wanted) => {
        for (const element of stack) {
            if (wanted.includes(element)) {
                element.focus?.();
                break;
            }
            seeThrough(element);
        }
    };

    /**
     * A CSS background cannot be right-clicked at all — there is no element for the
     * menu to offer "save image as" for — so a transparent one is placed under the
     * cursor for as long as the menu is open.
     */
    const probeBackground = (src, x, y) => {
        const probe = new Image();
        probe.width = 10;
        probe.height = 10;
        probe.style.cssText = `position:fixed;left:${x - 5}px;top:${y - 5}px;opacity:0;z-index:2147483647;`;
        probe.src = src;
        document.body?.append(probe);
        shieldProbes.add(probe);
    };

    const unshield = (target, x, y) => {
        // A picture the page kept out of reach of the pointer is the whole reason
        // the overlay works; it has to take events again before the stack is read.
        for (const media of (target.parentElement || target).querySelectorAll?.('img,canvas,video') || []) {
            shielded.set(media, media.style.getPropertyValue('pointer-events'));
            media.style.setProperty('pointer-events', 'all', 'important');
        }

        const stack = document.elementsFromPoint(x, y);
        const { images, videos, inputs, backgrounds } = collectTargets(stack);

        if (videos.length) clearDownTo(stack, [...videos, ...inputs]);
        else if (images.length || backgrounds.length) {
            const imageDepth = images.length ? stack.indexOf(images[0]) : Infinity;
            const backgroundDepth = backgrounds.length ? stack.indexOf(backgrounds[0].element) : Infinity;
            if (backgroundDepth < imageDepth) probeBackground(backgrounds[0].src, x, y);
            else clearDownTo(stack, [...images, ...inputs]);
        } else if (inputs.length) clearDownTo(stack, inputs);
    };

    const watchRelease = () => {
        const controller = new AbortController();
        shieldControllers.add(controller);
        document.addEventListener('click', revertShield, { once: true, signal: controller.signal });
    };

    /* ------------------------------------------------------------------ *
     * Wiring
     * ------------------------------------------------------------------ */

    const onMouseDown = (event) => {
        releaseSelection(event);
        if (event.button !== 2) return;
        revertShield();
        unshield(event.target, event.clientX, event.clientY);
        watchRelease();
    };

    const enable = () => {
        if (active) return;
        active = true;
        document.documentElement?.setAttribute(FLAG, '1');
        document.addEventListener('mousedown', onMouseDown, true);
        document.addEventListener('mouseup', onMouseUp, true);
        teardown.add(() => {
            document.removeEventListener('mousedown', onMouseDown, true);
            document.removeEventListener('mouseup', onMouseUp, true);
        });
    };

    const disable = () => {
        if (!active) return;
        active = false;
        document.documentElement?.removeAttribute(FLAG);
        for (const undo of teardown) undo();
        teardown.clear();
        revertShield();
        restoreSelection();
    };

    const apply = (enabled) => (enabled ? enable() : disable());

    const start = () => {
        try {
            chrome.storage.sync.get([STORAGE_KEY], (data) => {
                if (chrome.runtime.lastError) return;
                apply(data?.[STORAGE_KEY] !== false);
            });
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'sync' || !changes[STORAGE_KEY]) return;
                apply(changes[STORAGE_KEY].newValue !== false);
            });
        } catch {
            // No extension context (the page outlived a reload of the extension).
        }
    };

    if (document.documentElement) start();
    else document.addEventListener('readystatechange', start, { once: true });
})();
