/**
 * INSIDE THE FLOATING PLAYER'S FRAME.
 *
 * Runs in every frame and stops at once unless this frame is the one the floating
 * player (`wp`, the omnibar's `wp:`) put its page in -- recognised by the name it gave
 * the frame. Two jobs:
 *
 * 1. Tell the float a real document arrived. Chrome's "refused to connect" page runs
 *    no content script, so a frame that loads without this message is that page, and
 *    the float tries again (`itgRetryIfPipFrameRefused` in hint/utils.js).
 *
 * 2. On x.com, keep the videos quiet until the reader asks for sound. X remembers that
 *    someone once turned the sound on and starts every video in the timeline with it,
 *    which a page opened in a small window should not do on its own. A video that gets
 *    its sound without a click or key press in the frame (no user activation) is muted
 *    again; the reader's own press on X's sound button carries one and is left alone.
 *    Every other site keeps its own behaviour.
 *
 * Everything inside a function: content scripts share one world, and a frame can be
 * injected into twice.
 */
(() => {
    const PAGE_FRAME = 'itg-page-pip-iframe';
    const FRAME_NAMES = [PAGE_FRAME, 'itg-pip-iframe', 'itg-video-pip-iframe'];
    if (window.self === window.top || !FRAME_NAMES.includes(window.name)) return;
    if (window.__itgPipFrame) return;
    window.__itgPipFrame = true;

    try {
        window.parent.postMessage({ type: 'itg-pip-frame-ready' }, '*');
    } catch {}

    if (window.name !== PAGE_FRAME || !/(^|\.)(x|twitter)\.com$/.test(location.hostname)) return;

    // A page that insists on unmuting in a loop gets the last word after this many tries
    // a second, rather than a fight that never ends.
    const MAX_CORRECTIONS_PER_SECOND = 10;
    const corrections = new WeakMap();
    const keepQuiet = (event) => {
        const media = event.target;
        if (!(media instanceof HTMLMediaElement) || media.muted || navigator.userActivation?.isActive) return;
        const now = Date.now();
        const record = corrections.get(media) || { since: now, count: 0 };
        if (now - record.since > 1000) Object.assign(record, { since: now, count: 0 });
        if (++record.count > MAX_CORRECTIONS_PER_SECOND) return;
        corrections.set(media, record);
        media.muted = true;
    };
    document.addEventListener('play', keepQuiet, true);
    document.addEventListener('volumechange', keepQuiet, true);
})();
