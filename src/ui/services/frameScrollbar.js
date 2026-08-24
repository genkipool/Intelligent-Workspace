/**
 * THE PANEL'S HALF OF THE SIDE BROWSER SCROLLBAR
 *
 * The framed page asks for a palette (`utils/panelScrollbar.js`) and this answers with
 * the one the panel is painted with right now. The reply goes to `event.source` rather
 * than to a window we kept a reference to: the frame is rebuilt on every navigation, and
 * the one that just spoke is by definition the one that is listening.
 *
 * The theme is watched instead of being hooked into `themesService`, because it is
 * changed from four places — the picker, a schedule, the system preference, the mirror
 * applied before first paint — and all four end in the same two attributes.
 */

const THEME_MESSAGE = 'panel-scrollbar-theme';
const READY_MESSAGE = 'panel-scrollbar-ready';

let observer = null;
let listening = false;
let currentFrame = null;

function readPalette() {
    const styles = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => (styles.getPropertyValue(name) || '').trim() || fallback;

    return {
        // Narrower than the group list's `--small-spacing` bar on purpose. That one is
        // 6px and sits beside its own content; this one is laid over somebody else's
        // page, where the bar is the only thing between the text and the edge of the
        // panel. 4px is still wide enough to grab. One number, changed here.
        width: '4px',
        track: pick('--bg-color', '#1b2631'),
        border: pick('--border-color', '#34495e'),
        hover: pick('--interactive-color', '#16a085'),
    };
}

function send(targetWindow) {
    if (!targetWindow) return;
    try {
        // The site's origin is unknown and unknowable in advance, and the payload is
        // five colours — there is nothing here to keep from a page we chose to frame.
        targetWindow.postMessage({ type: THEME_MESSAGE, payload: readPalette() }, '*');
    } catch {
        // A frame that went away mid-navigation is not an error worth reporting.
    }
}

function handleMessage(event) {
    if (event.data?.type !== READY_MESSAGE) return;
    send(event.source);
}

/**
 * Starts answering the framed page and keeps its bar in step with the theme.
 *
 * @param {HTMLIFrameElement} iframe The frame the side browser has just created.
 */
export function attachFrameScrollbar(iframe) {
    currentFrame = iframe;

    if (!listening) {
        window.addEventListener('message', handleMessage);
        listening = true;
    }

    if (!observer) {
        observer = new MutationObserver(() => send(currentFrame?.contentWindow));
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'style'],
        });
    }

    // The frame usually asks first, but a document that was already parsed when the
    // script ran — a cached page, mostly — has nothing left to announce.
    iframe.addEventListener('load', () => send(iframe.contentWindow));
}

/** Stops watching once the side browser is closed. */
export function detachFrameScrollbar() {
    currentFrame = null;
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (listening) {
        window.removeEventListener('message', handleMessage);
        listening = false;
    }
}
