/**
 * popupPositioning.js — where a detached popup goes, and what scrolls when it is open.
 *
 * Every floating menu in the panel (the overflow menus, the hover action menus)
 * shares these rules, and they depend on nothing but the DOM, so they live apart
 * from the services that build the menus themselves.
 */

/** Smallest popup worth clamping to when neither side has real room. */
const MIN_POPUP_HEIGHT = 40;

/** The `overflow-y` values that turn an element into a scroll container. */
const SCROLLABLE_OVERFLOW = /^(auto|scroll|overlay)$/;

/** Marks a popup that was clamped and therefore scrolls itself. */
const SCROLLING_POPUP_CLASS = 'has-scroll-y';

/**
 * The scroller an element lives in — the list of whichever view is on screen.
 *
 * Walking up from the element keeps this right for every view (groups, bookmarks,
 * notes, downloads…) without an id list to keep in sync, and it returns only
 * scrollers that currently have somewhere to scroll to.
 *
 * @param {HTMLElement|null} el
 * @returns {HTMLElement|null}
 */
export function getScrollParent(el) {
    for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
        if (node.scrollHeight <= node.clientHeight) continue;
        if (SCROLLABLE_OVERFLOW.test(getComputedStyle(node).overflowY)) return node;
    }
    return null;
}

/** Share of the distance still owed that each frame of the glide consumes. */
const GLIDE_EASING = 0.22;

/** Below this the remainder is spent in one frame instead of easing forever. */
const GLIDE_MIN_STEP = 1;

/** @type {{scroller: HTMLElement, remaining: number, raf: number}|null} */
let wheelGlide = null;

/** One frame of the glide: move a share of what is owed, then ask for the next. */
function stepWheelGlide() {
    const glide = wheelGlide;
    if (!glide) return;

    const eased = glide.remaining * GLIDE_EASING;
    const isLastStep = Math.abs(eased) < GLIDE_MIN_STEP;
    const step = isLastStep ? glide.remaining : eased;

    const before = glide.scroller.scrollTop;
    glide.scroller.scrollTop = before + step;
    glide.remaining -= step;

    // Finished, or the list is at an end and has nothing left to give.
    if (isLastStep || glide.scroller.scrollTop === before) {
        wheelGlide = null;
        return;
    }
    glide.raf = requestAnimationFrame(stepWheelGlide);
}

/**
 * Scrolls `scroller` by `delta`, eased over a few frames.
 *
 * Landing a whole wheel notch in one frame reads as a stutter next to the panel's
 * own wheel scrolling, which the browser animates. What is still owed is carried
 * rather than replaced, so a fast burst of notches adds up instead of each one
 * cutting the last short, and reading `scrollTop` fresh every frame lets a drag of
 * the scrollbar move the list without fighting the glide.
 *
 * @param {HTMLElement} scroller
 * @param {number} delta
 */
function glideScrollBy(scroller, delta) {
    const owed = wheelGlide?.scroller === scroller ? wheelGlide.remaining : 0;
    if (wheelGlide) cancelAnimationFrame(wheelGlide.raf);
    wheelGlide = { scroller, remaining: owed + delta, raf: 0 };
    wheelGlide.raf = requestAnimationFrame(stepWheelGlide);
}

/**
 * Wheel over a detached popup scrolls the list behind it, as smoothly as the list
 * scrolls on its own.
 *
 * A detached popup is fixed and parented to <body>, so a wheel over it would
 * otherwise land nowhere and the panel would sit still under the pointer.
 *
 * Whether the popup scrolls itself is read off the class `positionSmartPopup` set,
 * never off its geometry: the invisible hover bridge is an absolutely positioned
 * child that hangs past the bottom edge, so `scrollHeight` is always larger than
 * `clientHeight` and would veto every forward. When the popup does scroll the
 * browser handles the wheel, and `overscroll-behavior: contain` keeps that scroll
 * from chaining into the panel once the popup reaches its end.
 *
 * @param {HTMLElement} popupEl
 * @param {HTMLElement} anchorEl The element the popup is anchored to.
 */
export function forwardWheelToScrollParent(popupEl, anchorEl) {
    popupEl.addEventListener(
        'wheel',
        (event) => {
            if (popupEl.classList.contains(SCROLLING_POPUP_CLASS)) return;
            const scroller = getScrollParent(anchorEl);
            if (scroller) glideScrollBy(scroller, event.deltaY);
        },
        { passive: true },
    );
}

/**
 * Intelligently positions a popup relative to an anchor element so that it stays
 * within the viewport, in this order of preference:
 *
 * 1. Whole, below the anchor.
 * 2. Whole, above it.
 * 3. Whole, below it and past the bottom edge — only when the panel can still
 *    scroll down far enough to bring the rest into view. The popup rides the
 *    anchor up on every scroll event, so it ends up fully visible.
 * 4. Clamped to the roomier side, scrolling on its own.
 *
 * It never scrolls horizontally: the width is capped to the window and the
 * overflow on that axis stays hidden in every branch. Calling it again on an open
 * popup keeps whatever the reader had scrolled to.
 *
 * @param {HTMLElement} anchorEl - The button or container the popup is attached to.
 * @param {HTMLElement} popupEl - The popup element.
 * @param {{ margin?: number, gap?: number }} [options]
 */
export function positionSmartPopup(anchorEl, popupEl, options = {}) {
    if (!anchorEl || !popupEl) return;

    const margin = options.margin ?? 8;
    const gap = options.gap ?? 4;
    const rect = anchorEl.getBoundingClientRect();

    // Dropping the clamp below lets the popup grow to its full height, which clamps
    // `scrollTop` to zero; the reader's place is restored once the clamp is back on.
    const previousScrollTop = popupEl.scrollTop;

    // Reset before measuring: a previous call's clamp would be read back as the height.
    popupEl.style.position = 'fixed';
    popupEl.style.zIndex = '9999999';
    popupEl.style.boxSizing = 'border-box';
    popupEl.style.maxHeight = '';
    popupEl.style.overflowY = 'hidden';
    popupEl.style.overflowX = 'hidden';
    popupEl.classList.remove(SCROLLING_POPUP_CLASS, 'popup-upwards');

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    popupEl.style.maxWidth = `${Math.max(100, windowWidth - 2 * margin)}px`;

    // 1. Vertical placement:
    const popupHeight = popupEl.offsetHeight;
    const neededHeight = popupHeight + gap;
    const spaceBelow = windowHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    // Room the popup can borrow by riding the anchor up as the panel scrolls, rather
    // than being clamped and given a scrollbar of its own.
    const scroller = getScrollParent(anchorEl);
    const borrowable = scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight : 0;
    const fitsBelow = spaceBelow >= neededHeight;
    const fitsAbove = spaceAbove >= neededHeight;

    if (fitsAbove && !fitsBelow) {
        popupEl.style.top = `${rect.top - popupHeight - gap}px`;
        popupEl.classList.add('popup-upwards');
    } else if (fitsBelow || spaceBelow + borrowable >= neededHeight) {
        // Below, whole. In the borrowed case it starts off past the bottom edge and
        // walks back into view as the panel scrolls, repositioned on every scroll event.
        popupEl.style.top = `${rect.bottom + gap}px`;
    } else {
        // Nowhere to put it whole and no scroll left to borrow: clamp it to the roomier
        // side and let it scroll itself.
        const upwards = spaceAbove > spaceBelow;
        const availableHeight = Math.max(MIN_POPUP_HEIGHT, (upwards ? spaceAbove : spaceBelow) - gap);
        popupEl.style.maxHeight = `${availableHeight}px`;
        popupEl.style.overflowY = 'auto';
        popupEl.classList.add(SCROLLING_POPUP_CLASS);
        popupEl.style.top = upwards ? `${rect.top - availableHeight - gap}px` : `${rect.bottom + gap}px`;
        if (upwards) popupEl.classList.add('popup-upwards');
    }

    // 2. Horizontal placement (measured after vertical layout & scrollbar are determined):
    const popupWidth = popupEl.offsetWidth;
    // Align popup right edge with anchor right edge
    let left = rect.right - popupWidth;

    // Boundary checks:
    if (left < margin) {
        left = margin;
    }
    if (left + popupWidth > windowWidth - margin) {
        left = Math.max(margin, windowWidth - popupWidth - margin);
    }
    popupEl.style.left = `${left}px`;

    // Harmless when the popup no longer scrolls: the browser clamps it back to zero.
    popupEl.scrollTop = previousScrollTop;
}
