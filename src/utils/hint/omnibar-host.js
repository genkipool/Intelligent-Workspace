/**
 * [AI INSTRUCTION]
 * THE OMNIBAR RUNS IN AN EXTENSION FRAME. THIS IS WHAT IS LEFT OF IT IN THE PAGE.
 *
 * The omnibar lists history, bookmarks, notes, AI conversations, screenshots and every
 * open tab. Drawn by a content script into the page's own DOM (an open shadow root),
 * all of it was readable by the page's scripts while it was on screen, and every
 * request for it came from a content script — the least trusted sender the worker has.
 * In an extension frame the page can neither read it (another origin, another process)
 * nor reach the handlers behind it, which the worker only answers for extension pages.
 *
 * What still needs the page stays here, and only that: the frame itself, countering a
 * page mode's filter on it, the click outside, find in page (`f:`) and the floating
 * players that take over the page's own video. Nothing the omnibar lists ever crosses
 * back into the page.
 *
 * The link to the frame is an extension port, not `postMessage`: the page shares this
 * window, so it could post into the frame as if it were us, but it cannot open an
 * extension port. The port is named with a nonce made for that one opening, and the
 * frame takes only the first port that carries it.
 *
 * Same surface the in-page omnibar had for main.js and registry.js: `active`, `open`,
 * `close`, `recoverFocus`, `cleanup`, `setRegistry`.
 */
var OmniBarHost = class OmniBarHost {
    constructor() {
        this.active = false;
        this.registry = null;
        this.frame = null;
        this.port = null;
        this.nonce = null;
        this.matches = [];
        this.filterObserver = null;
        this._readyTimer = null;
        // The frame is clipped to the bar, so a mousedown that reaches the page is one
        // outside the omnibar.
        this._onPageMouseDown = () => this.close();
        this._onResize = () => {
            if (this.port) this.port.postMessage({ type: 'layout', layoutWidth: this._layoutWidth() });
        };
    }
    setRegistry(registry) {
        this.registry = registry;
    }
    open() {
        if (this.active || !document.body) return;
        if (!chrome.runtime || !chrome.runtime.id) {
            console.warn('[Hint] Cannot open OmniBar: Extension context invalidated.');
            return;
        }
        this.active = true;
        // `crypto.randomUUID` only exists in secure contexts, and plenty of pages are not.
        this.nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
            b.toString(16).padStart(2, '0'),
        ).join('');
        const nonce = this.nonce;

        const frame = document.createElement('iframe');
        frame.setAttribute('data-itg-omnibar', '');
        // The origin has to be named. Without one `allow` delegates to the origin of `src`,
        // and with `use_dynamic_url` that is a per-session GUID while the document it
        // loads is the extension's own origin: nothing was delegated and every copy from
        // the omnibar failed with "blocked because of a permissions policy" (measured).
        const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
        frame.allow = `clipboard-read ${extensionOrigin}; clipboard-write ${extensionOrigin}`;
        // The query goes after getURL: inside its argument the `?` would be part of the path.
        frame.src = `${chrome.runtime.getURL('src/utils/hint/omnibar-frame.html')}?n=${nonce}`;
        const style = {
            position: 'fixed',
            inset: '0',
            // Viewport units, scrollbars included, so the bar's own `vw`/`vh` inside the
            // frame measure what they measured on the page (see OmniBar.applyLayoutWidth).
            width: '100vw',
            height: '100vh',
            'max-width': 'none',
            'max-height': 'none',
            margin: '0',
            padding: '0',
            border: '0',
            display: 'block',
            visibility: 'visible',
            opacity: '1',
            transform: 'none',
            'z-index': '2147483647',
            background: 'transparent',
            'pointer-events': 'auto',
            // Nothing is hit or painted until the omnibar reports where it is drawn.
            'clip-path': 'inset(0 0 100% 0)',
        };
        for (const [property, value] of Object.entries(style)) frame.style.setProperty(property, value, 'important');
        frame.addEventListener('load', (event) => {
            if (event.isTrusted && this.frame === frame && this.nonce === nonce) this._connect(nonce);
        });
        document.body.appendChild(frame);
        this.frame = frame;

        this._syncFilter();
        this.filterObserver = new MutationObserver(() => this._syncFilter());
        this.filterObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style', 'itg-mode-applied'],
        });
        document.addEventListener('mousedown', this._onPageMouseDown, true);
        window.addEventListener('resize', this._onResize);
    }
    /** The width a fixed `width: 100%` gets on this page: its layout, without the scrollbar. */
    _layoutWidth() {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;left:0;right:0;top:0;height:0;visibility:hidden;pointer-events:none';
        document.body.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
    }
    _connect(nonce) {
        let port;
        try {
            port = chrome.runtime.connect({ name: `itg-omnibar:${nonce}` });
        } catch (e) {
            console.warn('[Hint] Could not reach the omnibar frame', e);
            this._teardown();
            return;
        }
        this.port = port;
        port.onMessage.addListener((msg) => this._onFrameMessage(port, msg));
        port.onDisconnect.addListener(() => {
            if (this.port === port) this._teardown();
        });
        // Every extension page hears a runtime port, so a frame that never answers would
        // leave it open and the page's keys held by an omnibar that is not there.
        this._readyTimer = setTimeout(() => {
            if (this.port === port) this._teardown();
        }, 3000);
        this.frame.focus();
        port.postMessage({
            type: 'open',
            pageMode: document.documentElement.getAttribute('data-itg-page-mode'),
            rawShortcuts: this.registry ? this.registry.getRawShortcuts() : {},
            layoutWidth: this._layoutWidth(),
            // Chrome paints a frame opaque when its document's color scheme is not the one
            // its element has on the page — a white box around the bar on any site that
            // declares `color-scheme: dark`, measured. Forcing the element to `normal` did
            // not help; handing the page's scheme to the frame does, and it is also the
            // scheme the bar's controls had when it was drawn inside the page.
            colorScheme: window.getComputedStyle(this.frame).colorScheme,
            documentPip: 'documentPictureInPicture' in window,
        });
    }
    async _onFrameMessage(port, msg) {
        if (this.port !== port || !msg) return;
        switch (msg.type) {
            case 'ready':
                clearTimeout(this._readyTimer);
                break;
            case 'clip':
                if (this.frame) this.frame.style.setProperty('clip-path', String(msg.clip), 'important');
                break;
            case 'closed':
                this._teardown();
                break;
            case 'request': {
                const result = await this._handleRequest(msg.op, msg.args || {});
                if (msg.id && this.port === port) port.postMessage({ type: 'reply', id: msg.id, result });
                break;
            }
        }
    }
    async _handleRequest(op, args) {
        switch (op) {
            case 'find':
                this.matches = this._findTextInPage(String(args.term || ''));
                // Only the text goes back: the nodes stay here, where they can be selected.
                return this.matches.map(({ snippet }) => ({ snippet }));
            case 'selectMatch':
                this._selectMatchInPage(this.matches[args.index], Number(args.barHeight) || 0);
                return null;
            case 'openDocumentPip':
                return this._openDocumentPip(String(args.url || ''));
            case 'openVideoPip':
                await openVideoPip(String(args.url || ''));
                return null;
            default:
                return null;
        }
    }
    close() {
        if (!this.active) return;
        // The omnibar has the last word — Ctrl+Enter keeps it open for a moment — and
        // answers `closed` when it really goes.
        if (this.port) this.port.postMessage({ type: 'close' });
        else this._teardown();
    }
    recoverFocus() {
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        if (!this.frame) return;
        this.frame.focus();
        if (this.port) this.port.postMessage({ type: 'focus' });
    }
    cleanup() {
        this._teardown();
    }
    _teardown() {
        const port = this.port;
        const frame = this.frame;
        this.port = null;
        this.frame = null;
        this.nonce = null;
        this.active = false;
        this.matches = [];
        clearTimeout(this._readyTimer);
        if (this.filterObserver) {
            this.filterObserver.disconnect();
            this.filterObserver = null;
        }
        document.removeEventListener('mousedown', this._onPageMouseDown, true);
        window.removeEventListener('resize', this._onResize);
        if (frame) {
            // Focus is in the frame while the omnibar is open, and removing a focused
            // frame leaves the page's document without focus (`document.hasFocus()`
            // false, measured), which the in-page omnibar never did. `blur()` hands it
            // back to this document. Not `window.focus()`: that can bring this tab to the
            // front, and did — choosing another tab in the omnibar switched to it and
            // straight back.
            if (document.activeElement === frame) frame.blur();
            frame.remove();
        }
        if (port) {
            try {
                port.disconnect();
            } catch {
                // Already gone with the frame.
            }
        }
    }
    _syncFilter() {
        if (!this.frame) return;
        // A page mode filters the whole document, frame included; applying the same
        // filter again on the frame undoes it for the omnibar, as it did for its host.
        const pf = window.getComputedStyle(document.documentElement).filter;
        this.frame.style.setProperty('filter', pf !== 'none' ? pf : 'none', 'important');
    }
    _findTextInPage(term) {
        if (!term) return [];
        const matches = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                const pTag = node.parentNode.tagName.toUpperCase();
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'SVG', 'IFRAME'].includes(pTag))
                    return NodeFilter.FILTER_REJECT;
                if (!Utils.isVisible(node.parentNode)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let node;
        while ((node = walker.nextNode())) {
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(node.textContent)) !== null) {
                const start = match.index;
                const end = start + term.length;
                const snippet = `...${node.textContent.substring(Math.max(0, start - 20), start)}${match[0]}${node.textContent.substring(end, end + 20)}...`;
                matches.push({
                    snippet,
                    node,
                    start,
                    end,
                });
            }
        }
        return matches;
    }
    _selectMatchInPage(match, barHeight) {
        if (!match) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        sel.addRange(range);
        const rect = range.getBoundingClientRect();
        let targetY = window.scrollY + rect.top - window.innerHeight * 0.3 + rect.height / 2;
        if (barHeight) targetY -= barHeight + 40;
        window.scrollTo({
            top: targetY,
            behavior: 'smooth',
        });
    }
    /**
     * Opens a page in Document Picture-in-Picture from this page, which is the window
     * that owns the player: it pauses the page's own video and hands its time over.
     * The click was in the omnibar's frame, and user activation reaches the frames
     * above the one clicked, so the request is still allowed here.
     *
     * @returns {Promise<boolean>} Whether the window opened; if not, the omnibar asks
     *   the worker for its own floating window instead.
     */
    async _openDocumentPip(url) {
        let targetUrl = url;
        let pipWindow;
        try {
            if (window.documentPictureInPicture.window) {
                window.documentPictureInPicture.window.close();
            }
            try {
                const currentCleanUrl = window.location.href.split('#')[0].split('?')[0];
                const urlObj = new URL(url);
                const targetCleanUrl = urlObj.href.split('#')[0].split('?')[0];
                if (currentCleanUrl === targetCleanUrl) {
                    const video = document.querySelector('video');
                    if (video && video.currentTime > 0) {
                        const secs = Math.floor(video.currentTime);
                        urlObj.searchParams.set('t', secs);
                        targetUrl = urlObj.toString();
                    }
                }
            } catch (e) {
                console.warn('Failed to append current video time:', e);
            }
            document.querySelectorAll('video').forEach((v) => {
                try {
                    v.pause();
                } catch {}
            });
            pipWindow = await requestItgPipWindow(targetUrl, 450, 600);
        } catch (err) {
            console.warn('Omnibar direct PiP failed, attempting background fallback:', err);
            return false;
        }
        this._fillDocumentPip(pipWindow, targetUrl).catch((err) => console.warn('Omnibar PiP setup failed:', err));
        return true;
    }
    async _fillDocumentPip(pipWindow, targetUrl) {
        pipWindow.document.body.style.margin = '0';
        pipWindow.document.body.style.padding = '0';
        pipWindow.document.body.style.overflow = 'hidden';
        pipWindow.document.body.style.backgroundColor = '#1e1e1e';
        /*
         * AWAIT, and not for tidiness.
         *
         * This installs the rules that take `X-Frame-Options` and the site's CSP off.
         * Without waiting for them, the `iframe` below is appended first and its request
         * goes out with no rule to touch it: the site refuses the frame and the floating
         * window comes up blank. It is not a race that is sometimes won — measured in a
         * real browser, 0 of 5 without the `await` and 5 of 5 with it — so opening a page
         * in the floating player from the omnibar never worked on a site that refuses to
         * be framed, which is exactly the kind of site the rule exists for. `utils.js`,
         * the other way to the floating player, always awaited it.
         */
        await chrome.runtime.sendMessage({
            action: 'prepareVideoUrlForPip',
            url: targetUrl,
        });
        const iframe = document.createElement('iframe');
        iframe.name = 'itg-page-pip-iframe';
        iframe.src = targetUrl;
        iframe.style.width = '100vw';
        iframe.style.height = '100vh';
        iframe.style.border = 'none';
        iframe.allow = 'fullscreen; clipboard-write; encrypted-media;';
        pipWindow.document.body.appendChild(iframe);
        let lastKnownTime = 0;
        const timeTrackerInterval = setInterval(() => {
            try {
                if (!pipWindow || pipWindow.closed) {
                    clearInterval(timeTrackerInterval);
                    return;
                }
                const pipIframe = pipWindow.document.querySelector('iframe');
                if (pipIframe) {
                    const innerDoc = pipIframe.contentDocument || pipIframe.contentWindow?.document;
                    const pipVideo = innerDoc?.querySelector('video');
                    if (pipVideo && !isNaN(pipVideo.currentTime) && pipVideo.currentTime > 0) {
                        lastKnownTime = pipVideo.currentTime;
                    }
                }
            } catch {}
        }, 250);
        let didResume = false;
        const resumeOriginalVideo = (shouldPlay) => {
            if (didResume) return;
            didResume = true;
            clearInterval(timeTrackerInterval);
            try {
                const localVideo = document.querySelector('video');
                if (localVideo) {
                    if (lastKnownTime > 0) {
                        localVideo.currentTime = lastKnownTime;
                    }
                    if (shouldPlay) {
                        localVideo.play().catch((e) => {
                            console.warn('Failed to autoplay original video on PiP close:', e);
                        });
                    } else {
                        localVideo.pause();
                    }
                }
            } catch (e) {
                console.warn('Error resuming original video:', e);
            }
        };
        // The framing rules asked for above are session rules and outlive this window
        // unless somebody takes them down.
        const releasePipNetworkRules = () => {
            chrome.runtime.sendMessage({ action: 'cleanupVideoPipRules' }).catch(() => {});
        };
        pipWindow.addEventListener('pagehide', () => {
            resumeOriginalVideo(!document.hidden);
            releasePipNetworkRules();
        });
        pipWindow.addEventListener('unload', () => {
            resumeOriginalVideo(!document.hidden);
            releasePipNetworkRules();
        });
    }
};
