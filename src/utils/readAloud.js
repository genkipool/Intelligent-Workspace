/* global HintCommon */
// readAloud.js
//
// The page reader: it says the text of the page out loud, lights up the paragraph and
// the word being spoken, and follows them down the page.
//
// It runs in the page rather than in the side panel because that is the only place
// that can see the text and paint on it. It is injected on demand — never as a
// declared content script — and a second injection stops the reading rather than
// starting a second one, which is what makes every entry point (the button, the `ar`
// command, the `ar:` omnibar prefix) a toggle.
//
// The highlight is drawn with the CSS Custom Highlight API, so nothing in the page's
// own DOM is touched: no wrapper spans, no class names, nothing to put back.

(() => {
    /** A second run means "stop", which is what every caller expects of a toggle. */
    if (window.__itgReadAloud) {
        window.__itgReadAloud.destroy();
        return { state: 'stopped' };
    }

    const HOST_CLASS = 'itg-read-aloud-host';
    const PAGE_STYLE_ID = 'itg-read-aloud-style';
    const PARAGRAPH_HIGHLIGHT = 'itg-read-aloud-paragraph';
    const WORD_HIGHLIGHT = 'itg-read-aloud-word';
    const SPEECH_SETTINGS_KEY = 'itg-speech-settings';
    /** What the reader paints on the page, and whether it shows its own panel. */
    const READER_SETTINGS_KEY = 'itg-reader-settings';
    /** The overrides the navigation settings page writes for every built-in key. */
    const SHORTCUTS_KEY = 'itg-ui-custom-shortcuts';

    /**
     * The keys that drive the reader, by the message key that names each command.
     *
     * They are resolved here rather than in the command registry because they only
     * mean anything while the reader is open — everywhere else `p` and `n` belong to
     * the page. The defaults match `HintCommon.BUILT_IN_COMMANDS`, and the settings
     * page overrides them under the same description keys as every other command.
     */
    const READER_KEYS = {
        play: { desc: 'hintDesc_readerPlay', fallback: 'zp' },
        next: { desc: 'hintDesc_readerNext', fallback: 'zn' },
        previous: { desc: 'hintDesc_readerPrev', fallback: 'zb' },
        panel: { desc: 'hintDesc_readerPanel', fallback: 'zv' },
        close: { desc: 'hintDesc_readerClose', fallback: 'zq' },
        markWord: { desc: 'hintDesc_readerMarkWord', fallback: 'zm' },
        markBlock: { desc: 'hintDesc_readerMarkBlock', fallback: 'zs' },
    };

    /** How long a half-typed sequence waits for its second key before it lapses. */
    const KEY_SEQUENCE_TIMEOUT_MS = 900;

    // ── Following the word ──────────────────────────────────────────────────
    //
    // `SpeechSynthesisUtterance.onboundary` is the obvious way to know which word is
    // being said, and on plenty of systems — Linux with speech-dispatcher among them —
    // it simply never fires. A reader that depends on it shows no word at all there.
    //
    // So the mark is driven by a clock instead, the way a reader driven by an audio
    // file would be: the words of the paragraph are measured out in characters, and a
    // timer converts elapsed time into a position in that text. Boundary events, when
    // they do arrive, are treated as anchors that correct the clock rather than as the
    // only source of truth. Every finished paragraph then re-measures the speaking
    // speed from what it actually took, so the estimate converges after the first one.

    /** Characters a voice gets through in a second at rate 1, before any measuring. */
    const BASE_CHARS_PER_SECOND = 15.5;
    /** How often the mark is moved. Not rAF: a background tab stops running those. */
    const WORD_TICK_MS = 80;
    /** A measurement further out than this is noise, not a speaking speed. */
    const CPS_BOUNDS = [4, 60];

    /**
     * What counts as a title.
     *
     * Not every headline is a heading element. Reddit hangs its post titles on an
     * `<a slot="title">`, and plenty of design systems mark a heading with the ARIA
     * role instead of the tag — both are titles as far as a reader is concerned, and
     * both were being skipped because they are anchors and divs.
     */
    const TITLE_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"], [slot="title"]';

    /**
     * Prose written without a `<p>` in sight.
     *
     * Some sites build their body copy out of nested `<span>`s inside a marked-up
     * container — x.com's posts are the clearest case — so the container is named here
     * rather than left to a rule that would have to treat every `<div>` as text.
     */
    const BODY_SELECTOR =
        '[data-testid="tweetText"], [data-testid="post-content"], ' +
        // YouTube builds the title, the description and every comment out of custom
        // elements with no `<p>` anywhere in them, so a video page looks empty to a
        // general rule. The tag names are specific enough to name here rather than
        // gate on the host — nothing else on the web ships a `<ytd-comment-view-model>`.
        'ytd-watch-metadata h1, #description-inline-expander, ' +
        'ytd-comment-view-model #content-text, ytd-comment-renderer #content-text';

    /**
     * Blocks worth reading. Only leaves are taken, so nothing is read twice.
     *
     * A title matters as much as a paragraph: it is the first thing a reader should
     * say, and on most news sites it lives inside the article's own `<header>`.
     */
    const BLOCK_SELECTOR = `p, ${TITLE_SELECTOR}, ${BODY_SELECTOR}, li, blockquote, figcaption, dd, dt, td`;

    /** What makes a container look like an article, for the sake of picking one. */
    const PROSE_SELECTOR = `p, li, ${BODY_SELECTOR}`;

    /**
     * The page's furniture, which has nothing to say.
     *
     * `header` and `footer` are deliberately **not** here. An `<article>` normally
     * wraps its headline and standfirst in a `<header>` of its own — which is exactly
     * the markup of a news page — so skipping every `header` threw away the two lines
     * the reader most needed to say. The page-level banner and contentinfo are
     * excluded by `isPageFurniture()` instead, which is what "the page's header"
     * actually means.
     */
    const SKIP_SELECTOR =
        'nav, aside, script, style, noscript, form, button, select, textarea, pre, ' +
        '[role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], ' +
        '[aria-hidden="true"], [hidden], .itg-read-aloud-host';

    /** Containers that usually hold the article; the best scoring one wins. */
    const ROOT_CANDIDATES = [
        'article',
        '[role="main"]',
        'main',
        '#content',
        '#main',
        '.post',
        '.entry-content',
        '.article',
    ];
    /** Below this a candidate is not an article, and the whole body is used instead. */
    const MIN_ROOT_SCORE = 240;

    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

    // ── Translations ────────────────────────────────────────────────────────
    //
    // The reader lands in a page that has never loaded this extension's i18n helper,
    // and chrome.i18n follows Chrome's language rather than the one chosen in the
    // extension. HintCommon is already in every page and knows how to read the right
    // messages file, so it is used when it is there and chrome.i18n stands in when
    // it is not.
    const hintI18n = typeof HintCommon !== 'undefined' ? HintCommon.i18n : null;
    const t = (key, fallback, params = []) =>
        (hintI18n ? hintI18n.getMessage(key, params, fallback) : chrome.i18n.getMessage(key, params)) || fallback;

    // ── State ───────────────────────────────────────────────────────────────
    let host = null;
    let shadow = null;
    let panel = null;
    let handle = null;
    let playBtn = null;
    let prevBtn = null;
    let nextBtn = null;
    let progressEl = null;
    let speedEl = null;
    let statusEl = null;
    let pageStyle = null;

    let blocks = [];
    let index = 0;
    let paused = false;
    let collapsed = false;
    let destroyed = false;
    let keepAliveId = null;
    /** Bumped on every stop, so a late `onend` cannot advance the reading that replaced it. */
    let generation = 0;
    /**
     * Where in the current paragraph the reading has got to, in characters. It is what
     * a pause freezes and what a resume starts again from, so it is the one number
     * that has to be right whether or not the voice reports anything.
     */
    let charOffset = 0;
    /** Character the current utterance began at, so the clock can be offset by it. */
    let utteranceStart = 0;
    /** `performance.now()` when the current utterance started making sound. */
    let spokenAt = 0;
    /** Seconds of speech already accounted for before the current utterance. */
    let elapsedBefore = 0;
    /** The measured speaking speed at rate 1, refined by every paragraph that ends. */
    let charsPerSecondAtRate1 = BASE_CHARS_PER_SECOND;
    let tickTimer = null;
    /** The word the mark is on, so it is only redrawn when it actually moves. */
    let markedWord = -1;
    let voiceSettings = { voiceURI: '', rate: 1, pitch: 1, volume: 1 };
    /** Everything on by default: the reader shows its panel and both of its marks. */
    let readerSettings = {
        showPanel: true,
        showWordMark: true,
        showBlockMark: true,
        blockOpacity: 0.3,
        wordOpacity: 0.8,
    };
    /** The key sequence for each command, once the settings page's overrides are applied. */
    let keyFor = Object.fromEntries(Object.entries(READER_KEYS).map(([name, spec]) => [name, spec.fallback]));
    /** What has been typed so far towards one of those sequences. */
    let typed = '';
    let typedTimer = null;
    /**
     * A machine with no speech engine — a Linux box without speech-dispatcher, say —
     * rejects every utterance the moment it is queued. Without this the reader would
     * race silently through the whole page in a few milliseconds and look as if it had
     * read it.
     */
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;
    let failed = false;

    // ── Reading the page ────────────────────────────────────────────────────

    function isVisible(element) {
        if (!element.isConnected) return false;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    /**
     * A `<header>` or `<footer>` that belongs to the page rather than to an article.
     *
     * The distinction is what lets a headline be read while the site's masthead is
     * skipped: an article's header is inside a sectioning element, the page's is not.
     */
    function isPageFurniture(element) {
        const landmark = element.closest('header, footer');
        if (!landmark) return false;
        return !landmark.closest('article, main, [role="main"], section');
    }

    /** How much prose a candidate container holds; the article is the fattest one. */
    function scoreOf(element) {
        let score = 0;
        element.querySelectorAll(PROSE_SELECTOR).forEach((node) => {
            score += (node.textContent || '').trim().length;
        });
        return score;
    }

    function pickRoot() {
        let best = null;
        let bestScore = 0;
        ROOT_CANDIDATES.forEach((selector) => {
            document.querySelectorAll(selector).forEach((element) => {
                const score = scoreOf(element);
                if (score > bestScore) {
                    best = element;
                    bestScore = score;
                }
            });
        });
        return bestScore >= MIN_ROOT_SCORE && best ? best : document.body;
    }

    /**
     * The text nodes of one block, with the offset each one starts at.
     *
     * The reading is done on the exact concatenation of those nodes rather than on a
     * tidied-up copy: `onboundary` reports a character index into what was spoken, so
     * any rewriting in between would leave the word highlight drifting off the word.
     */
    function textPiecesOf(element) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => (node.data && node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
        });

        const pieces = [];
        let node = walker.nextNode();
        while (node) {
            pieces.push({ node, nodeStart: 0, length: node.data.length });
            node = walker.nextNode();
        }
        return buildBlockText(pieces);
    }

    /**
     * Turns a run of text pieces into one block: the text that will be spoken, and the
     * offsets that map any position in it back to a node and a character.
     *
     * `nodeStart` is what lets a piece be part of a text node rather than all of it,
     * which is what reading a selection needs — the first and the last node of a
     * selection are almost always cut in the middle of a word.
     */
    /**
     * Where every word of a block starts and ends, in the block's own text.
     *
     * This is the ruler the clock reads against: a position in characters becomes a
     * word by looking it up here, which is the same shape a reader driven by real
     * word timings uses — only the timings are estimated rather than given.
     */
    function wordsOf(text) {
        const words = [];
        const pattern = /[^\s]+/g;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            words.push({ start: match.index, end: match.index + match[0].length });
        }
        return words;
    }

    /** The word a position in the text falls in, or the last one before it. */
    function wordIndexAt(block, charPos) {
        const words = block.words;
        if (words.length === 0) return -1;

        let low = 0;
        let high = words.length - 1;
        let found = -1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            if (words[middle].start <= charPos) {
                found = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        return found;
    }

    function buildBlockText(rawPieces) {
        const pieces = [];
        let text = '';
        rawPieces.forEach((piece) => {
            const slice = piece.node.data.substr(piece.nodeStart, piece.length);
            pieces.push({ ...piece, start: text.length, end: text.length + slice.length });
            text += slice;
        });
        return { pieces, text, words: wordsOf(text) };
    }

    /**
     * What the user has selected, as blocks — or null when nothing is selected.
     *
     * A selection almost never lines up with element boundaries, so the pieces are the
     * text nodes it touches, clipped at both ends to where it actually starts and
     * stops, and then grouped by the block each one belongs to. Grouping matters: it is
     * what keeps the reading one paragraph at a time, so the previous and next buttons
     * still mean something inside a selection.
     */
    function collectSelectionBlocks() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);
        if (!range.toString().trim()) return null;

        const container = range.commonAncestorContainer;
        const root = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
        if (!root) return null;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) =>
                node.data && node.data.trim() && range.intersectsNode(node)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT,
        });

        const groups = [];
        let currentOwner = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            // The ends of the selection land inside a text node; everything between is
            // taken whole.
            const from =
                node === range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE
                    ? range.startOffset
                    : 0;
            const to =
                node === range.endContainer && range.endContainer.nodeType === Node.TEXT_NODE
                    ? range.endOffset
                    : node.data.length;
            if (to <= from) continue;

            const owner = node.parentElement?.closest(BLOCK_SELECTOR) || node.parentElement || root;
            if (owner !== currentOwner) {
                currentOwner = owner;
                groups.push({ owner, pieces: [] });
            }
            groups[groups.length - 1].pieces.push({ node, nodeStart: from, length: to - from });
        }

        const found = [];
        groups.forEach(({ owner, pieces }) => {
            const { pieces: mapped, text, words } = buildBlockText(pieces);
            if (text.trim().length < 2) return;
            found.push({ element: owner, pieces: mapped, text, words });
        });
        return found.length > 0 ? found : null;
    }

    function collectBlocks() {
        // A selection is an explicit "read this": it wins over the whole page.
        const selected = collectSelectionBlocks();
        if (selected) {
            // The browser's own selection paint would sit on top of the reader's, and
            // two highlights on the same words read as a rendering fault.
            window.getSelection()?.removeAllRanges();
            return selected;
        }

        const root = pickRoot();
        const found = [];
        const seen = new Set();

        const consider = (element) => {
            if (seen.has(element)) return;
            // Only leaves: a `<li>` wrapping a `<p>` would otherwise be read twice.
            if (element.querySelector(BLOCK_SELECTOR)) return;
            if (element.closest(SKIP_SELECTOR)) return;
            if (isPageFurniture(element)) return;
            if (!isVisible(element)) return;

            const { pieces, text, words } = textPiecesOf(element);
            if (text.trim().length < 2) return;
            seen.add(element);
            found.push({ element, pieces, text, words });
        };

        // The headline and the standfirst usually sit in the article's own header, and
        // on plenty of sites that header is a sibling of the container that scored
        // best rather than a child of it. Taking them from the enclosing article first
        // is what puts the title at the top of the reading instead of leaving it out.
        const article = root.closest('article') || root;
        article.querySelectorAll(TITLE_SELECTOR).forEach(consider);
        root.querySelectorAll(BLOCK_SELECTOR).forEach(consider);

        // Reading order is the page's order, not the order the two sweeps found them.
        found.sort((a, b) => {
            const relation = a.element.compareDocumentPosition(b.element);
            if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });
        return found;
    }

    // ── Colours ─────────────────────────────────────────────────────────────

    /** The theme the extension is wearing right now, or null while it is being read. */
    let theme = null;

    function parseColor(value, fallback) {
        if (typeof value !== 'string') return fallback;
        const hex = value.trim().replace(/^#/, '');
        if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return fallback;
        const full =
            hex.length === 3
                ? hex
                      .split('')
                      .map((c) => c + c)
                      .join('')
                : hex;
        return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
    }

    /**
     * Black or white, whichever can be read on top of the given colour.
     *
     * Picked rather than taken from the theme's own `textOnColor`, because in the light
     * themes that token *is* the interactive colour — the word would have been painted
     * on itself and become invisible.
     */
    function readableInk([r, g, b]) {
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.55 ? '#101010' : '#ffffff';
    }

    /**
     * The two highlights, in the colours of the active theme.
     *
     * This has to be a page-level stylesheet — `::highlight()` paints the page's own
     * text — so it cannot read the custom properties that live on the reader's host.
     * The values are therefore written out literally, and rewritten whenever the theme
     * changes.
     */
    function paintHighlights() {
        if (!highlightsSupported) return;
        if (!pageStyle) {
            pageStyle = document.createElement('style');
            pageStyle.id = PAGE_STYLE_ID;
            (document.head || document.documentElement).appendChild(pageStyle);
        }

        const colors = theme?.colors || {};
        const paragraph = parseColor(colors.actionColor, [255, 200, 0]);
        const word = parseColor(colors.interactiveColor, colors.actionColor ? paragraph : [255, 145, 0]);

        const blockAlpha = clamp(readerSettings.blockOpacity ?? 0.3, 0.03, 1);
        const wordAlpha = clamp(readerSettings.wordOpacity ?? 0.8, 0.1, 1);
        // Below about a third the mark is a wash rather than a block of colour, and
        // dark ink on a wash of the page's own background is unreadable — so the ink
        // only switches once the mark is solid enough to carry it.
        const ink = wordAlpha >= 0.55 ? readableInk(word) : 'inherit';

        pageStyle.textContent =
            `::highlight(${PARAGRAPH_HIGHLIGHT}) {` +
            `background-color: rgba(${paragraph.join(', ')}, ${blockAlpha});` +
            `}` +
            `::highlight(${WORD_HIGHLIGHT}) {` +
            `background-color: rgba(${word.join(', ')}, ${wordAlpha});` +
            `color: ${ink};` +
            `}`;
    }

    /**
     * Paints the host with the extension's active theme, the way every overlay does,
     * and repaints the highlights to match.
     */
    const THEME_PRESETS = {
        light: {
            actionColor: '#3498db',
            textColor: '#000000',
            textOnColor: '#3498db',
            bgColor: '#f5f5f5',
            bgPanelColor: '#ffffff',
            borderColor: '#dddddd',
            interactiveColor: '#3498db',
            errorColor: '#e74c3c',
            headerColor: '#0658aa',
        },
        dark: {
            actionColor: '#5f6368',
            textColor: '#a8a8a8',
            textOnColor: '#d3d1d1',
            bgColor: '#000000',
            bgPanelColor: '#2c2c2c',
            borderColor: '#1a1818',
            interactiveColor: '#5f6368',
            errorColor: '#dbee0c',
            headerColor: '#424242',
        },
        viridian: {
            actionColor: '#16a085',
            textColor: '#f5f5f5',
            textOnColor: '#16a085',
            bgColor: '#1b2631',
            bgPanelColor: '#233240',
            borderColor: '#34495e',
            interactiveColor: '#16a085',
            errorColor: '#e74c3c',
            headerColor: '#0e6655',
        },
    };

    async function applyTheme() {
        try {
            const next = await chrome.runtime.sendMessage({ action: 'getActiveTheme' });
            if (!next || destroyed) return;
            theme = next;

            // The highlights are painted whether or not there is a panel to dress.
            paintHighlights();
            if (!host) return;

            const themeName = typeof theme === 'string' ? theme : theme.name || 'dark';
            host.setAttribute('data-theme', themeName);
            if (panel) panel.setAttribute('data-theme', themeName);
            if (handle) handle.setAttribute('data-theme', themeName);

            const preset = THEME_PRESETS[themeName] || THEME_PRESETS.dark;
            const colors = theme && typeof theme === 'object' && theme.colors ? { ...preset, ...theme.colors } : preset;

            Object.entries(colors).forEach(([key, value]) => {
                const prop = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
                host.style.setProperty(prop, value);
                if (panel) panel.style.setProperty(prop, value);
                if (handle) handle.style.setProperty(prop, value);
            });
        } catch {
            /* the worker may be asleep; the stylesheet's own fallbacks stand in */
        }
    }

    // ── Highlighting ────────────────────────────────────────────────────────

    const highlightsSupported = typeof Highlight === 'function' && typeof CSS !== 'undefined' && CSS.highlights;

    function setHighlight(name, ranges) {
        if (!highlightsSupported) return;
        if (!ranges || ranges.length === 0) {
            CSS.highlights.delete(name);
            return;
        }
        CSS.highlights.set(name, new Highlight(...ranges));
    }

    function clearHighlights() {
        if (!highlightsSupported) return;
        CSS.highlights.delete(PARAGRAPH_HIGHLIGHT);
        CSS.highlights.delete(WORD_HIGHLIGHT);
    }

    /** A range over part of a block, given offsets into its concatenated text. */
    function rangeFor(block, from, to) {
        const startPiece = block.pieces.find((piece) => from >= piece.start && from < piece.end);
        const endPiece = block.pieces.find((piece) => to > piece.start && to <= piece.end);
        if (!startPiece || !endPiece) return null;

        const range = document.createRange();
        range.setStart(startPiece.node, startPiece.nodeStart + (from - startPiece.start));
        range.setEnd(endPiece.node, endPiece.nodeStart + (to - endPiece.start));
        return range;
    }

    function highlightBlock(block) {
        markedWord = -1;
        if (!readerSettings.showBlockMark) {
            setHighlight(PARAGRAPH_HIGHLIGHT, []);
            setHighlight(WORD_HIGHLIGHT, []);
            return;
        }
        const range = rangeFor(block, 0, block.text.length);
        setHighlight(PARAGRAPH_HIGHLIGHT, range ? [range] : []);
        setHighlight(WORD_HIGHLIGHT, []);
    }

    /**
     * Lights up the word the synthesizer has just reached.
     *
     * Chrome reports where the word starts but not how long it is, so the end is found
     * by reading forward to the next space.
     */
    /** Lights up one word of the block, by its index in `block.words`. */
    function markWord(block, wordIndex) {
        if (!readerSettings.showWordMark) return;
        if (wordIndex < 0 || wordIndex >= block.words.length) return;
        if (wordIndex === markedWord) return;
        markedWord = wordIndex;

        const word = block.words[wordIndex];
        const range = rangeFor(block, word.start, word.end);
        setHighlight(WORD_HIGHLIGHT, range ? [range] : []);
    }

    function scrollToBlock(block) {
        const rect = block.element.getBoundingClientRect();
        // Only when it has drifted out of the comfortable middle band: scrolling on
        // every paragraph turns a long page into a nauseating slideshow.
        if (rect.top >= 80 && rect.bottom <= window.innerHeight - 120) return;
        block.element.scrollIntoView({
            block: 'center',
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
    }

    // ── The clock that follows the word ─────────────────────────────────────

    /** Characters per second at the rate now in force. */
    function currentCps() {
        return charsPerSecondAtRate1 * effectiveRate();
    }

    /** Seconds of speech since the current paragraph began. */
    function elapsedSeconds() {
        if (!spokenAt) return elapsedBefore;
        return elapsedBefore + (performance.now() - spokenAt) / 1000;
    }

    /** Where in the paragraph the voice is, by the clock. */
    function spokenChars() {
        return utteranceStart + Math.max(0, elapsedSeconds() - elapsedBefore) * currentCps();
    }

    function startTicking() {
        stopTicking();
        tickTimer = setInterval(() => {
            if (destroyed || paused) return;
            const block = blocks[index];
            if (!block) return;

            const position = Math.min(spokenChars(), block.text.length - 1);
            const wordIndex = wordIndexAt(block, position);
            if (wordIndex >= 0) {
                charOffset = block.words[wordIndex].start;
                markWord(block, wordIndex);
            }
        }, WORD_TICK_MS);
    }

    function stopTicking() {
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = null;
    }

    /**
     * Folds a measurement into the speaking speed.
     *
     * Smoothed rather than replaced: one paragraph that happened to be short, or one
     * boundary event that arrived late, should nudge the estimate, not become it.
     */
    function learnCps(chars, seconds) {
        if (seconds < 0.4 || chars < 12) return;
        const measured = chars / seconds / Math.max(0.1, effectiveRate());
        if (measured < CPS_BOUNDS[0] || measured > CPS_BOUNDS[1]) return;
        charsPerSecondAtRate1 = charsPerSecondAtRate1 * 0.6 + measured * 0.4;
    }

    // ── Speaking ────────────────────────────────────────────────────────────

    /** The one speed there is: the reading rate from the settings, clamped to what
     *  the synthesizer accepts. The panel's picker writes this very value. */
    function effectiveRate() {
        const rate = Number(voiceSettings.rate);
        return Number.isFinite(rate) ? Math.min(4, Math.max(0.25, rate)) : 1;
    }

    /** The voice chosen in the navigation settings, or the browser's own default. */
    function resolveVoice() {
        if (!voiceSettings.voiceURI) return null;
        return speechSynthesis.getVoices().find((voice) => voice.voiceURI === voiceSettings.voiceURI) || null;
    }

    /**
     * Chrome drops a reading after about fifteen seconds of speech. Pausing and
     * resuming on a timer keeps the queue alive; the timer clears itself once nothing
     * is being spoken. The side panel's reader does exactly the same.
     */
    function startKeepAlive() {
        stopKeepAlive();
        keepAliveId = setInterval(() => {
            if (destroyed) return stopKeepAlive();
            // Never while paused: resuming a reading the user paused is precisely the
            // bug this timer used to cause.
            if (paused) return;
            if (speechSynthesis.speaking && !speechSynthesis.paused) {
                speechSynthesis.pause();
                speechSynthesis.resume();
            } else if (!speechSynthesis.speaking) {
                stopKeepAlive();
            }
        }, 10000);
    }

    function stopKeepAlive() {
        if (keepAliveId) clearInterval(keepAliveId);
        keepAliveId = null;
    }

    /**
     * Says the current paragraph, from `charOffset` on.
     *
     * The offset is what makes resuming reliable: `speechSynthesis.pause()` is not
     * honoured everywhere, and a paragraph Chrome has already dropped cannot be
     * resumed at all — so a resume that finds nothing paused says the rest of the
     * paragraph again from the last word it reported.
     */
    function speakCurrent() {
        if (destroyed || paused || failed) return;
        if (index >= blocks.length) {
            finishReading();
            return;
        }

        const block = blocks[index];
        const mine = generation;
        const offset = Math.min(Math.max(0, charOffset), Math.max(0, block.text.length - 1));

        utteranceStart = offset;
        elapsedBefore = 0;
        spokenAt = 0;
        markedWord = -1;

        highlightBlock(block);
        scrollToBlock(block);
        markWord(block, Math.max(0, wordIndexAt(block, offset)));
        updatePanel();

        const utterance = new SpeechSynthesisUtterance(block.text.slice(offset));
        const voice = resolveVoice();
        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
        } else {
            utterance.lang = document.documentElement.lang || chrome.i18n.getUILanguage() || 'en-US';
        }
        utterance.rate = effectiveRate();
        // `?? 1` and not `|| 1`: the lowest pitch there is happens to be zero, and
        // `0 || 1` quietly turned the bottom of the slider back into the middle.
        utterance.pitch = clamp(voiceSettings.pitch ?? 1, 0, 2);
        utterance.volume = clamp(voiceSettings.volume ?? 1, 0, 1);

        utterance.onstart = () => {
            if (mine !== generation) return;
            consecutiveErrors = 0;
            // The clock starts when the sound does, not when the utterance was queued:
            // the queue can sit for a moment and that moment is not speech.
            spokenAt = performance.now();
            startTicking();
        };
        utterance.onboundary = (event) => {
            if (mine !== generation || destroyed) return;
            if (event.name && event.name !== 'word') return;

            // An anchor: it says exactly where the voice is, so the clock is corrected
            // to match and the speaking speed is re-measured from it. Systems that
            // never send these are read by the clock alone, which is the whole point
            // of having one.
            const position = offset + event.charIndex;
            const seconds = elapsedSeconds();
            learnCps(position - offset, seconds);
            utteranceStart = position;
            elapsedBefore = seconds;
            spokenAt = performance.now();

            charOffset = position;
            markWord(block, wordIndexAt(block, position));
        };
        utterance.onend = () => {
            if (mine !== generation || destroyed || paused) return;
            consecutiveErrors = 0;
            // A paragraph that has just been read is the best measurement there is.
            learnCps(block.text.length - offset, elapsedSeconds());
            stopTicking();
            advance(1);
        };
        utterance.onerror = (event) => {
            if (mine !== generation || destroyed) return;
            // 'interrupted' and 'canceled' just mean somebody else took the
            // synthesizer over, which is not a failure worth reporting.
            if (event.error === 'interrupted' || event.error === 'canceled') return;
            console.warn('[read aloud] speech error:', event.error);

            consecutiveErrors += 1;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                reportNoVoice();
                return;
            }
            // A single paragraph the engine choked on is skipped, not fatal.
            advance(1);
        };

        speechSynthesis.speak(utterance);
        startKeepAlive();
    }

    function clamp(value, low, high) {
        const number = Number(value);
        if (!Number.isFinite(number)) return low;
        return Math.min(high, Math.max(low, number));
    }

    /** Silences the synthesizer without taking the panel down. */
    function cancelSpeech() {
        generation += 1;
        stopTicking();
        stopKeepAlive();
        spokenAt = 0;
        try {
            speechSynthesis.cancel();
        } catch {
            /* nothing was being spoken */
        }
    }

    /** Moves the reading by whole paragraphs, always from their first word. */
    function advance(step) {
        const next = index + step;
        if (next < 0 || next >= blocks.length) {
            if (next >= blocks.length) finishReading();
            return;
        }
        cancelSpeech();
        index = next;
        charOffset = 0;
        paused = false;
        speakCurrent();
    }

    /**
     * Play and pause.
     *
     * Pausing freezes the clock on the word that is marked, and that word is where a
     * resume starts — `speechSynthesis.pause()` is honoured on some systems and
     * quietly ignored on others, so the reading is said again from that word whenever
     * the synthesizer no longer has anything to resume. Either way what the user hears
     * next is the word they were looking at.
     */
    function togglePlay() {
        if (failed) return;

        if (paused) {
            paused = false;

            // Always said again from the marked word rather than handed back to
            // `speechSynthesis.resume()`. Resuming natively would be tidier, but on
            // the systems where `pause()` is only half honoured — Linux voices among
            // them — it either carries on from somewhere else or never restarts at
            // all. Re-speaking from the word on screen is the one behaviour that is
            // the same everywhere, and it is the behaviour being asked for.
            //
            // `resume()` first because a synthesizer left in its paused state ignores
            // the utterance that follows a `cancel()`.
            try {
                speechSynthesis.resume();
            } catch {
                /* nothing was paused */
            }
            cancelSpeech();
            speakCurrent();
            return;
        }

        paused = true;
        // Whatever the clock says now is where the reading is; freeze it there.
        const block = blocks[index];
        if (block) {
            const wordIndex = wordIndexAt(block, Math.min(spokenChars(), block.text.length - 1));
            if (wordIndex >= 0) {
                charOffset = block.words[wordIndex].start;
                markWord(block, wordIndex);
            }
        }
        elapsedBefore = elapsedSeconds();
        spokenAt = 0;
        stopTicking();
        stopKeepAlive();
        try {
            speechSynthesis.pause();
        } catch {
            /* nothing was being spoken */
        }
        updatePanel();
    }

    function finishReading() {
        cancelSpeech();
        // Both marks go: leaving the last paragraph lit made a finished reading look
        // like a paused one.
        clearHighlights();
        paused = true;
        index = 0;
        charOffset = 0;
        markedWord = -1;
        updatePanel();
    }

    /** Nothing can be said on this machine, so the panel says so instead of pretending. */
    function reportNoVoice() {
        failed = true;
        cancelSpeech();
        clearHighlights();
        paused = true;
        if (statusEl) statusEl.textContent = t('readAloudNoVoice', 'No voice installed');
        if (panel) panel.classList.add('has-status');
        [prevBtn, playBtn, nextBtn, speedEl].forEach((control) => {
            if (control) control.disabled = true;
        });
    }

    // ── The panel ───────────────────────────────────────────────────────────

    const ICONS = {
        play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
        prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 9 12l9 6zM6 5v14"/></svg>',
        next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 9 6-9 6zM18 5v14"/></svg>',
        close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
        settings:
            '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/>' +
            '<path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1"/></svg>',
        collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
        expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
        chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    };

    function makeButton(className, icon, titleKey, fallback, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn ${className}`;
        button.innerHTML = icon;
        const label = t(titleKey, fallback);
        button.title = label;
        button.setAttribute('aria-label', label);
        button.addEventListener('click', onClick);
        return button;
    }

    function updatePanel() {
        if (!panel || failed) return;
        const label = t(paused ? 'readAloudPlay' : 'readAloudPause', paused ? 'Play' : 'Pause');
        playBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
        playBtn.classList.toggle('is-play', paused);
        playBtn.title = label;
        playBtn.setAttribute('aria-label', label);
        prevBtn.disabled = index <= 0;
        nextBtn.disabled = index >= blocks.length - 1;
        progressEl.textContent = t('readAloudProgress', `${index + 1} / ${blocks.length}`, [
            String(Math.min(index + 1, blocks.length)),
            String(blocks.length),
        ]);
    }

    function setCollapsed(next) {
        collapsed = next;
        if (!panel || !handle) return;
        panel.classList.toggle('is-collapsed', collapsed);
        handle.classList.toggle('is-visible', collapsed);
        const label = t(collapsed ? 'readAloudShowPanel' : 'readAloudHidePanel', collapsed ? 'Show' : 'Hide');
        handle.title = label;
        handle.setAttribute('aria-label', label);
    }

    /**
     * The speed picker, wearing the extension's own select.
     *
     * `appearance: base-select` needs the button and `<selectedcontent>` written out by
     * hand; that markup plus `src/styles/select.css` is what every other select in the
     * extension is, so the one in here is not a lookalike but the same control.
     */
    function makeSpeedSelect() {
        const select = document.createElement('select');
        select.className = 'speed-select';
        select.title = t('readAloudSpeed', 'Reading speed');
        select.setAttribute('aria-label', select.title);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.innerHTML = `<selectedcontent></selectedcontent><span class="picker-icon">${ICONS.chevronDown}</span>`;
        select.appendChild(trigger);

        select.addEventListener('change', () => {
            const rate = Number(select.value) || 1;
            if (rate === effectiveRate()) return;
            voiceSettings.rate = rate;
            // Written back rather than kept here: this picker and the slider in the
            // navigation settings are two views of one number, and each has to move
            // when the other does.
            chrome.storage.sync.set({ [SPEECH_SETTINGS_KEY]: { ...voiceSettings, rate } }).catch(() => {});
            restartAtCurrentWord();
        });
        return select;
    }

    /**
     * The options the picker offers.
     *
     * Rebuilt whenever the rate changes because the slider in the settings page moves
     * in steps of 0.05 and this list does not: whatever it is set to has to be in
     * here, or the picker would sit blank on a perfectly valid speed.
     */
    function fillSpeedOptions() {
        if (!speedEl) return;
        const rate = effectiveRate();
        const values = [...new Set([...SPEEDS, Math.round(rate * 100) / 100])].sort((a, b) => a - b);

        speedEl.querySelectorAll('option').forEach((option) => option.remove());
        values.forEach((value) => {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = `${value}×`;
            speedEl.appendChild(option);
        });
        speedEl.value = String(Math.round(rate * 100) / 100);
    }

    /**
     * Says the current paragraph again from the word that is marked.
     *
     * The rate of an utterance cannot be changed once it is speaking, so a new speed
     * means a new utterance — and it should pick up where the ear was, not at the top
     * of the paragraph.
     */
    function restartAtCurrentWord() {
        if (paused || failed || destroyed) {
            fillSpeedOptions();
            return;
        }
        const block = blocks[index];
        if (block) {
            const wordIndex = wordIndexAt(block, Math.min(spokenChars(), block.text.length - 1));
            if (wordIndex >= 0) charOffset = block.words[wordIndex].start;
        }
        cancelSpeech();
        fillSpeedOptions();
        speakCurrent();
    }

    async function buildPanel() {
        host = document.createElement('div');
        host.className = HOST_CLASS;
        // The page's rules apply to anything it can reach, so the host is wiped clean
        // and everything that matters is set !important. The controls themselves live
        // in the shadow root, where the page's CSS cannot reach at all.
        host.style.cssText =
            'all: initial !important; position: fixed !important; inset: 0 !important; ' +
            'z-index: 2147483646 !important; pointer-events: none !important;';
        shadow = host.attachShadow({ mode: 'closed' });

        const style = document.createElement('style');
        style.textContent = await readStylesheets();
        shadow.appendChild(style);

        panel = document.createElement('div');
        panel.className = 'panel';
        panel.setAttribute('role', 'toolbar');
        panel.setAttribute('aria-label', t('readAloudTitle', 'Page reader'));
        panel.title = document.title || location.hostname;

        const collapseBtn = makeButton('collapse', ICONS.collapse, 'readAloudHidePanel', 'Hide', () =>
            setCollapsed(true),
        );
        prevBtn = makeButton('prev', ICONS.prev, 'readAloudPrevious', 'Previous paragraph', () => advance(-1));
        playBtn = makeButton('toggle', ICONS.pause, 'readAloudPause', 'Pause', togglePlay);
        nextBtn = makeButton('next', ICONS.next, 'readAloudNext', 'Next paragraph', () => advance(1));
        // The way to everything this panel does not have room for. It opens the
        // navigation settings in the side panel, already scrolled to the reader.
        const settingsBtn = makeButton('settings', ICONS.settings, 'readAloudOpenSettings', 'Reader settings', () => {
            chrome.runtime.sendMessage({ action: 'openSidePanel', type: 'customize-hint-reader' }).catch(() => {});
        });
        const closeBtn = makeButton('close', ICONS.close, 'readAloudClose', 'Close the reader', () => destroy());

        progressEl = document.createElement('span');
        progressEl.className = 'progress';

        statusEl = document.createElement('span');
        statusEl.className = 'status';

        speedEl = makeSpeedSelect();
        fillSpeedOptions();

        const separator = () => {
            const line = document.createElement('span');
            line.className = 'separator';
            return line;
        };

        panel.append(
            collapseBtn,
            separator(),
            prevBtn,
            playBtn,
            nextBtn,
            progressEl,
            speedEl,
            statusEl,
            separator(),
            settingsBtn,
            closeBtn,
        );

        // The handle that brings the panel back, pinned to the same edge it left by.
        handle = makeButton('handle', ICONS.expand, 'readAloudShowPanel', 'Show', () => setCollapsed(false));

        shadow.append(panel, handle);
        document.documentElement.appendChild(host);

        requestAnimationFrame(() => panel.classList.add('visible'));
        await applyTheme();
    }

    /**
     * The panel's stylesheets: the extension's select, then the reader's own.
     *
     * Both are web accessible resources, so the isolated world can read them directly
     * even under a hostile page CSP; the worker is only asked if that fails.
     */
    async function readStylesheets() {
        const paths = ['src/styles/themes.css', 'src/styles/select.css', 'src/utils/read-aloud.css'];
        const sheets = await Promise.all(paths.map(readStylesheet));
        return sheets.join('\n');
    }

    async function readStylesheet(path) {
        try {
            const response = await fetch(chrome.runtime.getURL(path));
            if (response.ok) return await response.text();
        } catch {
            /* fall through to the worker */
        }
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getExtensionFileContent', path });
            if (response?.success) return response.text;
        } catch {
            /* the panel keeps the browser's default look */
        }
        return '';
    }

    // ── Wiring ──────────────────────────────────────────────────────────────

    /** Keys are only ours when the page is not expecting them in a field. */
    function isTyping(target) {
        if (!target) return false;
        const tag = target.tagName;
        return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    /** What each configured sequence does. */
    function readerActions() {
        return {
            [keyFor.play]: togglePlay,
            [keyFor.next]: () => advance(1),
            [keyFor.previous]: () => advance(-1),
            [keyFor.panel]: () => setCollapsed(!collapsed),
            [keyFor.close]: destroy,
            [keyFor.markWord]: () => setReaderSetting('showWordMark', !readerSettings.showWordMark),
            [keyFor.markBlock]: () => setReaderSetting('showBlockMark', !readerSettings.showBlockMark),
        };
    }

    function clearTyped() {
        typed = '';
        if (typedTimer) clearTimeout(typedTimer);
        typedTimer = null;
    }

    function onKeyDown(event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            destroy();
            return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;

        // The space bar and the arrows are fixed: they are what a player is expected
        // to answer to, and no page uses them for anything the reader is not already
        // covering while it is open.
        if (event.key === ' ' || event.code === 'Space') {
            event.preventDefault();
            event.stopPropagation();
            clearTyped();
            togglePlay();
            return;
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            event.stopPropagation();
            clearTyped();
            advance(event.key === 'ArrowRight' ? 1 : -1);
            return;
        }

        if (event.key.length !== 1) return;

        // Everything else is only ours if it begins one of the reader's own sequences.
        // That is the whole reason they are two keys long: while a page is being read
        // its own shortcuts, and the extension's, still have to work.
        const actions = readerActions();
        const attempt = typed + event.key.toLowerCase();
        const isPrefix = Object.keys(actions).some((sequence) => sequence.startsWith(attempt));
        if (!isPrefix) {
            clearTyped();
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (actions[attempt]) {
            clearTyped();
            actions[attempt]();
            return;
        }

        typed = attempt;
        if (typedTimer) clearTimeout(typedTimer);
        typedTimer = setTimeout(clearTyped, KEY_SEQUENCE_TIMEOUT_MS);
    }

    /** Re-reads whatever the settings page just wrote, and acts on it at once. */
    function applyReaderSettings(next) {
        readerSettings = {
            showPanel: true,
            showWordMark: true,
            showBlockMark: true,
            blockOpacity: 0.3,
            wordOpacity: 0.8,
            ...(next || {}),
        };
        // The transparency lives in the page stylesheet, so it is rewritten now.
        paintHighlights();

        // A mark that has just been turned off has to leave the page now, not at the
        // next paragraph.
        if (!readerSettings.showWordMark) {
            setHighlight(WORD_HIGHLIGHT, []);
            markedWord = -1;
        }
        if (!readerSettings.showBlockMark) setHighlight(PARAGRAPH_HIGHLIGHT, []);
        else if (blocks[index]) highlightBlock(blocks[index]);

        // The panel can be dismissed and brought back without touching the reading.
        if (panel) {
            panel.classList.toggle('is-hidden-by-setting', !readerSettings.showPanel);
            if (!readerSettings.showPanel) handle.classList.remove('is-visible');
            else setCollapsed(collapsed);
        }
    }

    /** Writes one of the mark settings back, which is what the keys above toggle. */
    function setReaderSetting(name, value) {
        applyReaderSettings({ ...readerSettings, [name]: value });
        chrome.storage.sync.set({ [READER_SETTINGS_KEY]: { ...readerSettings } }).catch(() => {});
    }

    /** A theme, a voice or a reader setting picked in any window reaches us here. */
    function onStorageChanged(changes, area) {
        if (area === 'local' && changes.activeTheme) applyTheme();
        if (area !== 'sync') return;
        if (changes[READER_SETTINGS_KEY]) applyReaderSettings(changes[READER_SETTINGS_KEY].newValue);
        if (changes[SPEECH_SETTINGS_KEY]) {
            const previousRate = effectiveRate();
            Object.assign(voiceSettings, changes[SPEECH_SETTINGS_KEY].newValue || {});
            fillSpeedOptions();
            // The picker in the panel and the sliders in the settings page are two
            // views of the same numbers, so a change over there is heard over here at
            // once rather than at the next paragraph.
            if (effectiveRate() !== previousRate) restartAtCurrentWord();
        }
        if (changes[SHORTCUTS_KEY]) applyShortcutOverrides(changes[SHORTCUTS_KEY].newValue);
    }

    /** The keys the settings page has been told to use instead of the defaults. */
    function applyShortcutOverrides(overrides) {
        const map = overrides || {};
        Object.entries(READER_KEYS).forEach(([name, spec]) => {
            const custom = (map[spec.desc] || '').trim().toLowerCase();
            keyFor[name] = custom || spec.fallback;
        });
    }

    function onRuntimeMessage(message) {
        if (message?.action === 'themeChanged') applyTheme();
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelSpeech();
        clearHighlights();
        pageStyle?.remove();
        host?.remove();
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('pagehide', destroy);
        chrome.storage.onChanged.removeListener(onStorageChanged);
        chrome.runtime.onMessage.removeListener(onRuntimeMessage);
        delete window.__itgReadAloud;
    }

    /** The voice picked in the navigation settings page, if there is one. */
    async function loadVoiceSettings() {
        try {
            const stored = await chrome.storage.sync.get([SPEECH_SETTINGS_KEY, READER_SETTINGS_KEY, SHORTCUTS_KEY]);
            Object.assign(voiceSettings, stored?.[SPEECH_SETTINGS_KEY] || {});
            readerSettings = { ...readerSettings, ...(stored?.[READER_SETTINGS_KEY] || {}) };
            applyShortcutOverrides(stored?.[SHORTCUTS_KEY]);
        } catch {
            /* the defaults above are already the browser's own behaviour */
        }
        // getVoices() is empty until the list has loaded, which on a cold profile
        // happens after the first call rather than during it.
        if (voiceSettings.voiceURI && speechSynthesis.getVoices().length === 0) {
            await new Promise((resolve) => {
                const done = () => resolve();
                speechSynthesis.addEventListener('voiceschanged', done, { once: true });
                setTimeout(done, 400);
            });
        }
    }

    /**
     * The part that has to wait for something: the settings, the translations and the
     * stylesheets. It is deliberately not awaited by the caller — the answer the
     * injection reports is already known by then (see below).
     */
    async function start() {
        await loadVoiceSettings();
        if (hintI18n) await hintI18n.loadMessages().catch(() => {});
        if (destroyed) return;

        // With the panel turned off the reading is driven by the keys alone, which is
        // what somebody who turned it off is asking for.
        if (readerSettings.showPanel) await buildPanel();
        else await applyTheme();
        if (destroyed) return;

        // Whatever else was talking — a note, the assistant, another tab — gives the
        // synthesizer up: it is a single shared queue across the whole browser.
        speechSynthesis.cancel();
        index = 0;
        charOffset = 0;
        paused = false;
        speakCurrent();
    }

    // What the injection reports back is worked out here, synchronously: whether the
    // page has anything to read is already known once the blocks are collected, and a
    // value is a far steadier thing to hand an injection than a promise.
    blocks = collectBlocks();
    if (blocks.length === 0) return { state: 'empty' };

    window.__itgReadAloud = { destroy };
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pagehide', destroy);
    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    start();

    return { state: 'started', paragraphs: blocks.length };
})();
