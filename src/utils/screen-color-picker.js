// screen-color-picker.js
//
// The magnifier behind the pipette button of the theme editor.
//
// Chrome only exposes `window.EyeDropper` on Windows, macOS and ChromeOS. On Linux
// the interface does not exist at all, so the button had nothing to open and looked
// broken. This draws the same idea over the active tab: a still capture of the
// viewport, a lens that zooms into it under the cursor, and a click that reports the
// colour back to whichever extension page asked for it.
//
// The colour that is picked also goes to the clipboard, and Escape — pressed here or
// on the page that asked for it — takes the lens down.
//
// It is injected on demand (never as a declared content script) and removes itself
// as soon as a colour is picked or the pick is called off.

(() => {
    const HOST_CLASS = 'screen-color-picker-overlay-itg';

    // A second injection while one is already running would stack two overlays and
    // leak the first one's listeners.
    if (document.querySelector(`.${HOST_CLASS}`)) {
        return;
    }

    /** Device pixels sampled across the lens; odd, so one of them is the centre. */
    const LENS_PIXELS = 13;
    /** On-screen size of each sampled pixel. */
    const LENS_CELL = 11;
    const LENS_SIZE = LENS_PIXELS * LENS_CELL;
    const LABEL_GAP = 10;

    /**
     * The host sits in the page, so the page's own rules apply to it. They are shut
     * out twice over: `all` wipes whatever it inherited or matched, and every
     * property that matters is then set as !important, which a page stylesheet
     * cannot outbid. Everything else lives inside a shadow root, where page CSS
     * cannot reach at all — without it a rule as ordinary as `div { height: 100% }`
     * blows the readout up to the size of the window.
     */
    const HOST_STYLE = {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        margin: '0',
        padding: '0',
        border: 'none',
        display: 'block',
        'pointer-events': 'auto',
        'z-index': '2147483647',
        cursor: 'none',
        'user-select': 'none',
        background: 'transparent',
    };

    const toHex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

    let host = null;
    let lens = null;
    let label = null;
    let swatch = null;
    let hexText = null;
    let lensCtx = null;
    let source = null; // canvas holding the capture, in device pixels
    let sourceCtx = null;
    let scale = 1; // device pixels per CSS pixel in the capture
    let pointer = null; // last known cursor position, in CSS pixels
    let finished = false;

    function cleanup() {
        if (finished) return false;
        finished = true;
        host?.remove();
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('resize', cancel, true);
        chrome.runtime.onMessage.removeListener(onExternalMessage);
        return true;
    }

    /**
     * Puts the picked colour on the clipboard.
     *
     * This runs here rather than on the page that asked for the pick because the
     * click that chose the colour landed on this document: it is the one holding the
     * focus and the transient activation the clipboard demands. Nothing may be
     * awaited before the write, or the activation is spent by the time it is asked
     * for.
     */
    async function copyToClipboard(hex) {
        try {
            await navigator.clipboard.writeText(hex);
            return true;
        } catch {
            // A frame whose permissions policy withholds the clipboard, or a document
            // that is not focused. The old command still goes through in both.
            try {
                const scratch = document.createElement('textarea');
                scratch.value = hex;
                scratch.setAttribute('readonly', '');
                scratch.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
                document.body.appendChild(scratch);
                scratch.select();
                const copied = document.execCommand('copy');
                scratch.remove();
                return copied;
            } catch {
                return false;
            }
        }
    }

    async function finish(hex) {
        if (finished) return;
        const copied = await copyToClipboard(hex);
        cleanup();
        chrome.runtime.sendMessage({ action: 'screenColorPicked', color: hex, copied }).catch(() => {});
    }

    function cancel() {
        if (!cleanup()) return;
        chrome.runtime.sendMessage({ action: 'screenColorPickCanceled' }).catch(() => {});
    }

    /**
     * Escape pressed on the page that asked for the colour. It cannot reach the
     * overlay's own key handler — the focus is over there — so the request arrives as
     * a message instead. The asking page already knows the pick is off, so this only
     * takes the lens down.
     */
    function onExternalMessage(message) {
        if (message?.action === 'cancelScreenColorPicker') {
            cleanup();
        }
    }

    function colorAt(x, y) {
        const deviceX = Math.min(source.width - 1, Math.max(0, Math.round(x * scale)));
        const deviceY = Math.min(source.height - 1, Math.max(0, Math.round(y * scale)));
        const [r, g, b] = sourceCtx.getImageData(deviceX, deviceY, 1, 1).data;
        return toHex(r, g, b);
    }

    function drawLens(x, y) {
        const half = (LENS_PIXELS - 1) / 2;
        const deviceX = Math.round(x * scale);
        const deviceY = Math.round(y * scale);

        lensCtx.imageSmoothingEnabled = false;
        lensCtx.clearRect(0, 0, LENS_SIZE, LENS_SIZE);
        // Anything outside the capture (the page edges) reads as an empty area
        // rather than as a stale slice of the previous position.
        lensCtx.fillStyle = '#1b1b1b';
        lensCtx.fillRect(0, 0, LENS_SIZE, LENS_SIZE);
        lensCtx.drawImage(source, deviceX - half, deviceY - half, LENS_PIXELS, LENS_PIXELS, 0, 0, LENS_SIZE, LENS_SIZE);

        // The grid is what turns a blurry zoom into countable pixels.
        lensCtx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
        lensCtx.lineWidth = 1;
        lensCtx.beginPath();
        for (let i = 1; i < LENS_PIXELS; i++) {
            const at = i * LENS_CELL + 0.5;
            lensCtx.moveTo(at, 0);
            lensCtx.lineTo(at, LENS_SIZE);
            lensCtx.moveTo(0, at);
            lensCtx.lineTo(LENS_SIZE, at);
        }
        lensCtx.stroke();

        // The centre cell is the pixel a click would take, so it is marked twice —
        // dark over a light page, light over a dark one.
        const cell = half * LENS_CELL;
        lensCtx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        lensCtx.strokeRect(cell - 0.5, cell - 0.5, LENS_CELL + 1, LENS_CELL + 1);
        lensCtx.strokeStyle = '#ffffff';
        lensCtx.strokeRect(cell + 0.5, cell + 0.5, LENS_CELL - 1, LENS_CELL - 1);
    }

    function moveTo(x, y) {
        pointer = { x, y };
        const hex = colorAt(x, y);
        drawLens(x, y);

        // The lens follows the cursor but never leaves the viewport, so a colour at
        // the very edge of the page is still readable.
        const lensLeft = Math.min(window.innerWidth - LENS_SIZE, Math.max(0, x - LENS_SIZE / 2));
        const lensTop = Math.min(window.innerHeight - LENS_SIZE, Math.max(0, y - LENS_SIZE / 2));
        lens.style.transform = `translate(${lensLeft}px, ${lensTop}px)`;

        hexText.textContent = hex.toUpperCase();
        swatch.style.backgroundColor = hex;
        const labelWidth = label.offsetWidth || 90;
        const labelHeight = label.offsetHeight || 22;
        const labelLeft = Math.min(window.innerWidth - labelWidth, Math.max(0, x - labelWidth / 2));
        // Under the lens by default; above it when there is no room left below.
        const below = lensTop + LENS_SIZE + LABEL_GAP;
        const labelTop = below + labelHeight > window.innerHeight ? lensTop - LABEL_GAP - labelHeight : below;
        label.style.transform = `translate(${labelLeft}px, ${Math.max(0, labelTop)}px)`;
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
            return;
        }
        if (!pointer) return;

        const step = e.shiftKey ? 10 : 1;
        const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[
            e.key
        ];
        if (nudge) {
            e.preventDefault();
            e.stopPropagation();
            moveTo(
                Math.min(window.innerWidth - 1, Math.max(0, pointer.x + nudge[0])),
                Math.min(window.innerHeight - 1, Math.max(0, pointer.y + nudge[1])),
            );
            return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            finish(colorAt(pointer.x, pointer.y));
        }
    }

    function build(css) {
        host = document.createElement('div');
        host.className = HOST_CLASS;
        host.style.setProperty('all', 'initial', 'important');
        for (const [property, value] of Object.entries(HOST_STYLE)) {
            host.style.setProperty(property, value, 'important');
        }

        const root = host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = css;
        root.appendChild(style);

        lens = document.createElement('div');
        lens.className = 'lens';
        const lensCanvas = document.createElement('canvas');
        lensCanvas.width = LENS_SIZE;
        lensCanvas.height = LENS_SIZE;
        lens.appendChild(lensCanvas);
        lensCtx = lensCanvas.getContext('2d');
        root.appendChild(lens);

        label = document.createElement('div');
        label.className = 'label';
        swatch = document.createElement('span');
        swatch.className = 'swatch';
        hexText = document.createElement('span');
        label.append(swatch, hexText);
        root.appendChild(label);

        document.documentElement.appendChild(host);

        host.addEventListener('mousemove', (e) => moveTo(e.clientX, e.clientY));
        host.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        host.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            finish(colorAt(e.clientX, e.clientY));
        });
        host.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            cancel();
        });
        // The capture is a still: letting the page scroll under it would show the
        // colours of a viewport that is no longer there.
        host.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', cancel, true);
        chrome.runtime.onMessage.addListener(onExternalMessage);
    }

    function giveUp(reason) {
        chrome.runtime.sendMessage({ action: 'screenColorPickCanceled', reason }).catch(() => {});
    }

    async function start() {
        // The capture has to be asked for before the overlay exists, or the lens
        // would be magnifying its own reflection.
        let response;
        try {
            response = await chrome.runtime.sendMessage({ action: 'captureForColorPicker' });
        } catch {
            response = null;
        }
        if (!response?.success || !response.dataUrl) {
            giveUp('captureFailed');
            return;
        }

        const image = new Image();
        image.src = response.dataUrl;
        let css;
        try {
            // The styles come from the package rather than from insertCSS: they have
            // to end up inside the shadow root, which an injected page stylesheet
            // cannot enter.
            [css] = await Promise.all([
                fetch(chrome.runtime.getURL('src/utils/screen-color-picker.css')).then((r) => r.text()),
                image.decode(),
            ]);
        } catch {
            giveUp('captureFailed');
            return;
        }

        source = document.createElement('canvas');
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        // Reading pixels back is the whole point, so keep the buffer on the CPU side.
        sourceCtx = source.getContext('2d', { willReadFrequently: true });
        sourceCtx.drawImage(image, 0, 0);
        scale = image.naturalWidth / window.innerWidth || 1;

        build(css);
        // The pointer may already be over the page — and if it is not, the lens still
        // has to be visible somewhere, or the button would again look like it did
        // nothing. The centre of the viewport is where it waits.
        moveTo(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
    }

    start();
})();
