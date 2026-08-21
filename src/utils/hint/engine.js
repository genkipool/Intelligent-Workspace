/**
 * @class HintEngine
 * @description Core logic for generating and activating hints.
 */
var HintEngine = class HintEngine {
    constructor(shadowUI) {
        this.shadowUI = shadowUI;
        this.active = false;
        this.mode = 'click';
        this.hints = [];
        this.currentHintKeys = '';
        this.hintCharsBase = 'asdfghjklqwertyuiopzxcvbnm'; // Full base
        this.hintChars = this.hintCharsBase; // Will be filtered dynamically
        this.hintSelectors = this._getSelectors();
        this.domObserver = null;
        this.debouncedRefresh = null;
        this.activeScrollContainers = [];
    }

    /**
     * * NEW: Updates available hint characters,
     * freeing those used by the user for scrolling (j/k by default).
     */
    updateHintChars(mappings) {
        if (!mappings) return;

        // Find keys mapped to scroll up/down
        const blockedKeys = new Set();
        Object.entries(mappings).forEach(([key, val]) => {
            if (val.description === 'hintDesc_j' || val.description === 'hintDesc_k') {
                blockedKeys.add(key.toLowerCase());
            }
        });

        // Filter hintCharsBase to exclude blocked keys
        this.hintChars = this.hintCharsBase
            .split('')
            .filter((char) => !blockedKeys.has(char))
            .join('');
        console.log('[HintEngine] hintChars updated:', this.hintChars);
    }
    cleanup() {
        if (this.domObserver) {
            this.domObserver.disconnect();
            this.domObserver = null;
        }
        if (this.debouncedRefresh) {
            clearTimeout(this.debouncedRefresh);
        }
        this.clear();
    }
    _getSelectors() {
        let selectors = [
            'a[href]:not([aria-disabled="true"])',
            'button:not([disabled]):not([aria-disabled="true"])',
            'input:not([type="hidden"]):not([disabled]):not([aria-disabled="true"])',
            'textarea:not([disabled]):not([aria-disabled="true"])',
            'select:not([disabled]):not([aria-disabled="true"])',
            '[role="button"]:not([aria-disabled="true"])',
            '[role="checkbox"]:not([aria-disabled="true"])',
            '[role="radio"]:not([aria-disabled="true"])',
            '[contenteditable="true"]:not([aria-disabled="true"])',
            '.tab-title:not([aria-disabled="true"])',
            '[role="listitem"]:not([aria-disabled="true"])',
            'a[href] > [role="button"][tabindex="0"][aria-label]',
            'summary:not([aria-disabled="true"])',
            'details:not([aria-disabled="true"])',
            '[role="gridcell"]:not([aria-disabled="true"])',
            'div[aria-selected]:not([aria-disabled="true"])',
            '.chatlist-chat:not([aria-disabled="true"])',
            '.row-clickable:not([aria-disabled="true"])',
            '[role="row"]:not([aria-disabled="true"])',
            '[tabindex]:not([tabindex="-1"]):not([disabled]):not([aria-disabled="true"])',
        ];
        if (!window.location.pathname.includes('/listGroup/listGroup.html')) {
            const additional = [
                '[onmousedown]:not([aria-disabled="true"])',
                '[onmouseup]:not([aria-disabled="true"])',
                '[jsaction]:not([aria-disabled="true"])',
                '[role="link"]:not([aria-disabled="true"])',
                '[role="menuitem"]:not([aria-disabled="true"])',
                '[role="menuitemcheckbox"]:not([aria-disabled="true"])',
                '[role="menuitemradio"]:not([aria-disabled="true"])',
                '[role="tab"]:not([aria-disabled="true"])',
            ];
            selectors = selectors.concat(additional);
        }
        return selectors.join(', ');
    }
    async activate(mode) {
        this.clear(false);
        this.active = true;
        this.mode = mode;
        try {
            const theme = await chrome.runtime.sendMessage({
                action: 'getActiveTheme',
            });
            this._ensureRootAndApplyTheme(theme?.colors);
        } catch (e) {
            console.warn('HintEngine: Could not fetch theme', e);
            this._ensureRootAndApplyTheme(null);
        }
        this.debouncedRefresh = Utils.debounce(() => this.refresh(), 150);
        this.domObserver = new MutationObserver(() => this.debouncedRefresh());
        this.domObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
        const isSidePanel = window.location.pathname.includes('/listGroup/listGroup.html');
        if (isSidePanel) {
            ['groups-list', 'gemini-conversation-view', 'notes-view', 'screenshot-gallery-view'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('scroll', this.debouncedRefresh);
                    this.activeScrollContainers.push(el);
                }
            });
        }
        if (this.activeScrollContainers.length === 0) {
            window.addEventListener('scroll', this.debouncedRefresh);
        }
        window.addEventListener('resize', this.debouncedRefresh);
        this._boundClickHandler = () => this.clear(false);
        document.addEventListener('mousedown', this._boundClickHandler, true);
        this.refresh();
    }
    clear(deactivatePageMode = false) {
        if (deactivatePageMode) {
            chrome.runtime.sendMessage({
                action: 'deactivateAllPageModes',
            });
        }
        if (this.domObserver) {
            this.domObserver.disconnect();
            this.domObserver = null;
        }
        if (this.debouncedRefresh) {
            if (this.activeScrollContainers.length > 0) {
                this.activeScrollContainers.forEach((c) => c.removeEventListener('scroll', this.debouncedRefresh));
                this.activeScrollContainers = [];
            } else {
                window.removeEventListener('scroll', this.debouncedRefresh);
            }
            window.removeEventListener('resize', this.debouncedRefresh);
            this.debouncedRefresh = null;
        }
        if (this._boundClickHandler) {
            document.removeEventListener('mousedown', this._boundClickHandler, true);
            this._boundClickHandler = null;
        }
        this.hints.forEach((h) => h.hintElement.remove());
        this.hints = [];
        this.currentHintKeys = '';
        this.active = false;
        const hintRoot = this.shadowUI.getContainer().getElementById('hint-root-container');
        if (hintRoot) hintRoot.remove();
    }
    refresh() {
        if (!this.active) return;
        this.hints.forEach((h) => h.hintElement.remove());
        this.hints = [];
        // Helper: Check if an element is an atomic/leaf interactive element
        const isAtomicInteractive = (el) => {
            if (!el) return false;
            const tag = (el.tagName || '').toUpperCase();
            if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'].includes(tag)) return true;
            if (tag === 'A' && el.hasAttribute('href')) return true;
            const role = (el.getAttribute('role') || '').toLowerCase();
            if (
                [
                    'button',
                    'checkbox',
                    'radio',
                    'menuitem',
                    'menuitemcheckbox',
                    'menuitemradio',
                    'tab',
                    'link',
                ].includes(role)
            ) {
                return true;
            }
            if (el.getAttribute('contenteditable') === 'true') return true;
            return false;
        };

        // Helper: Check if parent is an ancestor of child across standard and shadow DOM boundaries
        const isAncestorOf = (parent, child) => {
            if (!parent || !child || parent === child) return false;
            if (parent.contains && parent.contains(child)) return true;
            let curr = child;
            while (curr) {
                if (curr.assignedSlot) {
                    curr = curr.assignedSlot;
                } else if (curr.getRootNode && curr.getRootNode() instanceof ShadowRoot) {
                    curr = curr.getRootNode().host;
                } else {
                    curr = curr.parentElement;
                }
                if (curr && parent.contains && parent.contains(curr)) return true;
                if (curr === parent) return true;
            }
            return false;
        };

        // Helper: Check hit target match including Shadow DOM, slots, and parent/descendant relationships
        const isHitTarget = (candidateEl, hitEl) => {
            if (!candidateEl || !hitEl) return false;
            if (candidateEl === hitEl || candidateEl.contains(hitEl)) return true;

            const slot = candidateEl.assignedSlot || candidateEl.closest?.('[slot]')?.assignedSlot;
            if (slot) {
                if (hitEl === slot || hitEl.contains(slot) || slot.contains(hitEl)) return true;
                if (hitEl.tagName === 'SLOT' && typeof hitEl.assignedElements === 'function') {
                    const assigned = hitEl.assignedElements({ flatten: true });
                    if (assigned.some((a) => a === candidateEl || a.contains(candidateEl) || candidateEl.contains(a))) {
                        return true;
                    }
                }
            }

            if (hitEl.querySelectorAll) {
                const slots = hitEl.querySelectorAll('slot');
                for (const s of slots) {
                    if (s === slot) return true;
                    if (typeof s.assignedElements === 'function') {
                        const assigned = s.assignedElements({ flatten: true });
                        if (
                            assigned.some(
                                (a) => a === candidateEl || a.contains(candidateEl) || candidateEl.contains(a),
                            )
                        ) {
                            return true;
                        }
                    }
                }
            }

            const rootNode = candidateEl.getRootNode?.();
            if (rootNode instanceof ShadowRoot && rootNode.host === hitEl) return true;
            if (candidateEl.parentElement === hitEl && hitEl.shadowRoot) return true;

            return false;
        };

        // Helper: Calculate preference score for link elements when duplicate URLs exist in the same article/card
        const getLinkScore = (el) => {
            if (!el) return 0;
            let score = 0;
            const slot = el.getAttribute?.('slot') || '';
            const id = (el.id || '').toLowerCase();
            const className = (el.getAttribute?.('class') || '').toLowerCase();

            // Primary title link gets highest priority
            if (
                slot === 'title' ||
                id.includes('title') ||
                className.includes('title') ||
                el.closest?.('h1, h2, h3, h4, h5, h6')
            ) {
                score += 100;
            }

            // Body preview links or secondary text slots get penalized
            if (
                slot === 'text-body' ||
                el.closest?.(
                    '[slot="text-body"], shreddit-post-text-body, .feed-card-text-preview, .post-body, .article-body, .entry-content',
                )
            ) {
                score -= 50;
            }

            // Pointer events none penalty
            if (className.includes('pointer-events-none')) {
                score -= 100;
            }

            // Background overlay card link
            if (slot === 'full-post-link' || className.includes('inset-0')) {
                score -= 20;
            }

            return score;
        };

        // Helper: Get article/card container
        const getArticleContainer = (el) => {
            if (!el || typeof el.closest !== 'function') return null;
            return el.closest(
                'article, [data-post-id], shreddit-post, [role="article"], .card, .post, .feed-item, [data-testid*="post"]',
            );
        };

        // Helper: Normalize URL
        const normalizeUrl = (url) => {
            if (!url) return '';
            try {
                const u = new URL(url, window.location.href);
                return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
            } catch {
                return (url || '').replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
            }
        };

        // 1. Gather all candidates in DOM order
        const rawCandidates = Utils.querySelectorAllDeep(this.hintSelectors, document.body);
        let candidateHints = [];
        for (const el of rawCandidates) {
            const isYtControl = window.location.hostname.includes('youtube.com') && el.closest('.ytp-chrome-bottom');
            if (!Utils.isVisible(el, isYtControl)) continue;
            const rect = Utils.getVisibleClientRect(el, true);
            if (!rect) continue;
            candidateHints.push({
                element: el,
                rect,
                isAtomic: isAtomicInteractive(el),
            });
        }

        // 2. Filter duplicate / container false positives:
        // - Drop non-atomic container elements that contain other interactive candidates
        // - Drop inner elements inside atomic interactives (e.g. icon spans inside buttons)
        // - Drop duplicate candidates with overlapping bounding boxes
        // - Drop duplicate link URLs within the same article container (keeping primary title link)
        candidateHints = candidateHints.filter((hintA, idxA) => {
            const elA = hintA.element;
            const isAtomicA = hintA.isAtomic;

            for (let idxB = 0; idxB < candidateHints.length; idxB++) {
                if (idxA === idxB) continue;
                const hintB = candidateHints[idxB];
                const elB = hintB.element;
                const isAtomicB = hintB.isAtomic;

                // Case 1: elA is a non-atomic internal child inside an atomic interactive elB (e.g. span inside button)
                if (isAtomicB && !isAtomicA && isAncestorOf(elB, elA)) {
                    return false;
                }

                // Case 2: elA is a container/wrapper (non-atomic) containing another candidate elB
                if (!isAtomicA && isAncestorOf(elA, elB)) {
                    return false;
                }

                // Case 3: Duplicate link URLs within the same article/post container
                if (elA.tagName === 'A' && elB.tagName === 'A' && elA.href && elB.href) {
                    const urlA = normalizeUrl(elA.href);
                    const urlB = normalizeUrl(elB.href);
                    if (urlA && urlA === urlB) {
                        const containerA = getArticleContainer(elA);
                        const containerB = getArticleContainer(elB);
                        if (
                            (containerA && containerB && containerA === containerB) ||
                            isAncestorOf(containerA || elA, elB) ||
                            isAncestorOf(containerB || elB, elA) ||
                            isAncestorOf(elA, elB) ||
                            isAncestorOf(elB, elA)
                        ) {
                            const isActionA =
                                elA.hasAttribute('data-action-bar-action') ||
                                (elA.getAttribute('name') || '').includes('action') ||
                                (elA.getAttribute('class') || '').includes('button') ||
                                (elA.getAttribute('class') || '').includes('btn');
                            const isActionB =
                                elB.hasAttribute('data-action-bar-action') ||
                                (elB.getAttribute('name') || '').includes('action') ||
                                (elB.getAttribute('class') || '').includes('button') ||
                                (elB.getAttribute('class') || '').includes('btn');

                            if (!isActionA && !isActionB) {
                                const scoreA = getLinkScore(elA);
                                const scoreB = getLinkScore(elB);
                                if (scoreA < scoreB) {
                                    return false; // Drop elA in favor of higher scored elB
                                }
                                if (scoreA === scoreB && idxA > idxB) {
                                    return false; // Keep the first/shallower one
                                }
                            }
                        }
                    }
                }

                // Case 4: Overlapping bounding boxes (identical or nearly identical rects)
                const isNearlySameRect =
                    Math.abs(hintA.rect.left - hintB.rect.left) < 3 &&
                    Math.abs(hintA.rect.top - hintB.rect.top) < 3 &&
                    Math.abs(hintA.rect.width - hintB.rect.width) < 3 &&
                    Math.abs(hintA.rect.height - hintB.rect.height) < 3;

                if (isNearlySameRect) {
                    if (isAncestorOf(elA, elB)) {
                        return false; // Drop outer container elA
                    }
                    if (isAncestorOf(elB, elA)) {
                        if (!isAtomicA && isAtomicB) return false;
                    }
                    if (!isAtomicA && isAtomicB) {
                        return false;
                    }
                    if (isAtomicA === isAtomicB && idxA > idxB) {
                        return false; // Deduplicate identical rects by keeping first
                    }
                }
            }
            return true;
        });

        // 3. Hit-test (elementFromPoint / elementsFromPoint) to filter out occluded or scrolled out elements
        const getElementAtPoint = (x, y) => {
            let el = document.elementFromPoint(x, y);
            while (el && el.shadowRoot) {
                const inner = el.shadowRoot.elementFromPoint(x, y);
                if (!inner || inner === el) break;
                el = inner;
            }
            return el;
        };

        const finalTargets = candidateHints.filter((hint) => {
            const el = hint.element;
            const rect = hint.rect;

            // Check center
            const centerX = rect.left + rect.width * 0.5;
            const centerY = rect.top + rect.height * 0.5;
            if (centerX >= 0 && centerY >= 0 && centerX < window.innerWidth && centerY < window.innerHeight) {
                const elAtCenter = getElementAtPoint(centerX, centerY);
                if (isHitTarget(el, elAtCenter)) {
                    return true;
                }
                if (typeof document.elementsFromPoint === 'function') {
                    const stack = document.elementsFromPoint(centerX, centerY);
                    if (stack && stack.length > 0) {
                        for (let i = 0; i < Math.min(stack.length, 3); i++) {
                            if (isHitTarget(el, stack[i])) return true;
                        }
                    }
                }
            }

            // Check sample points across the element
            const samplePoints = [
                [rect.left + Math.min(6, rect.width * 0.25), rect.top + rect.height * 0.5],
                [rect.right - Math.min(6, rect.width * 0.25), rect.top + rect.height * 0.5],
                [rect.left + Math.min(4, rect.width * 0.1), rect.top + Math.min(4, rect.height * 0.1)],
                [rect.right - Math.min(4, rect.width * 0.1), rect.bottom - Math.min(4, rect.height * 0.1)],
            ];

            for (const [px, py] of samplePoints) {
                if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) continue;
                const elAtPoint = getElementAtPoint(px, py);
                if (isHitTarget(el, elAtPoint)) {
                    return true;
                }
                if (typeof document.elementsFromPoint === 'function') {
                    const stack = document.elementsFromPoint(px, py);
                    if (stack && stack.length > 0) {
                        for (let i = 0; i < Math.min(stack.length, 3); i++) {
                            if (isHitTarget(el, stack[i])) return true;
                        }
                    }
                }
            }
            return false;
        });

        const keysToAssign = this._generateKeys(finalTargets.length);
        const hintRoot = this.shadowUI.getContainer().getElementById('hint-root-container');
        finalTargets.forEach((target, i) => {
            const el = target.element;
            const rect = target.rect;
            const keyString = keysToAssign[i];
            if (!keyString) return;
            const hintEl = document.createElement('div');
            hintEl.className = 'hint-hint';
            for (const char of keyString) {
                const s = document.createElement('span');
                s.textContent = char;
                hintEl.appendChild(s);
            }
            hintRoot.appendChild(hintEl);
            let top = window.scrollY + rect.top;
            let left = window.scrollX + rect.left;
            const hintWidth = hintEl.offsetWidth;
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            const viewportWidth = window.innerWidth - scrollbarWidth;
            if (left + hintWidth > viewportWidth) {
                left = viewportWidth - hintWidth - 5;
            }
            hintEl.style.top = `${top}px`;
            hintEl.style.left = `${left}px`;
            this.hints.push({
                key: keyString,
                element: el,
                hintElement: hintEl,
            });
        });
        this._updateHighlights();
    }
    handleKey(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.clear();
            return true;
        }
        const char = event.key.toLowerCase();
        if (char === 'f' && this.currentHintKeys.length === 0) {
            event.preventDefault();
            event.stopPropagation();
            this.clear();
            return true;
        }
        if (event.key === 'Backspace') {
            event.preventDefault();
            event.stopPropagation();
            if (this.currentHintKeys.length > 0) {
                this.currentHintKeys = this.currentHintKeys.slice(0, -1);
                this._updateHighlights();
            }
            return true;
        }
        if (this.hintChars.includes(char)) {
            event.preventDefault();
            event.stopPropagation();
            this.currentHintKeys += char;
            const matches = this.hints.filter((h) => h.key.startsWith(this.currentHintKeys));
            if (matches.length === 0) {
                this.currentHintKeys = this.currentHintKeys.slice(0, -1);
            } else if (matches.length === 1 && matches[0].key === this.currentHintKeys) {
                this._executeHint(matches[0], event);
            } else {
                this._updateHighlights();
            }
            return true;
        }
        return false; // Not handled by HintEngine
    }
    _simulateComplexClick(element, modifiers = {}) {
        if (typeof element.focus === 'function') {
            element.focus({
                preventScroll: true,
            });
        }
        const rect = element.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const commonProps = {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: 1,
            screenX: window.screenX + clientX,
            screenY: window.screenY + clientY,
            clientX: clientX,
            clientY: clientY,
            ctrlKey: modifiers.ctrlKey || false,
            altKey: modifiers.altKey || false,
            shiftKey: modifiers.shiftKey || false,
            metaKey: modifiers.metaKey || false,
            button: 0,
            buttons: 1,
            composed: true,
        };
        const eventSequence = [
            new PointerEvent('pointerdown', {
                ...commonProps,
                pointerId: 1,
                pointerType: 'mouse',
            }),
            new MouseEvent('mousedown', commonProps),
            new PointerEvent('pointerup', {
                ...commonProps,
                pointerId: 1,
                pointerType: 'mouse',
            }),
            new MouseEvent('mouseup', commonProps),
            new MouseEvent('click', commonProps),
        ];
        eventSequence.forEach((evt) => element.dispatchEvent(evt));
    }
    _executeHint(hintObj, event) {
        const el = hintObj.element;
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
        const keyModifiers = {
            ctrlKey: ctrlKey,
            metaKey: isMac ? event.metaKey : false,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
        };
        if (this.mode === 'copyLink') {
            let text = '';
            if (event.shiftKey) text = el.textContent.trim();
            else {
                const link = el.closest('a[href]');
                text = link ? link.href : '';
            }
            if (text) {
                navigator.clipboard
                    .writeText(text)
                    .then(() => {
                        hintObj.hintElement.style.background = '#28a745';
                        setTimeout(() => this.clear(false), 150);
                    })
                    .catch((e) => {
                        console.error('Copy failed', e);
                        this.clear(false);
                    });
            } else {
                this.clear(false);
            }
        } else {
            const isInputLike = Utils.isInputLikeElement(el);
            if (isInputLike) {
                // Focus element, or inner active element inside shadowRoot
                let targetInput = el;
                while (
                    targetInput &&
                    targetInput.shadowRoot &&
                    targetInput.shadowRoot.querySelector('input, textarea, [contenteditable="true"]')
                ) {
                    const inner = targetInput.shadowRoot.querySelector('input, textarea, [contenteditable="true"]');
                    if (inner) targetInput = inner;
                    else break;
                }
                if (typeof targetInput.focus === 'function') {
                    targetInput.focus();
                }
                try {
                    targetInput.click();
                } catch {}
                if (
                    ['INPUT', 'TEXTAREA'].includes((targetInput.tagName || '').toUpperCase()) &&
                    typeof targetInput.select === 'function'
                ) {
                    try {
                        targetInput.select();
                    } catch {}
                }
            } else {
                const clickable = (el.closest && el.closest('a[href], button, [role="button"], summary')) || el;
                const isComplexAppElement =
                    clickable.hasAttribute('aria-selected') ||
                    clickable.getAttribute('role') === 'row' ||
                    clickable.getAttribute('role') === 'gridcell' ||
                    clickable.getAttribute('role') === 'listitem' ||
                    clickable.classList.contains('chatlist-chat') ||
                    clickable.classList.contains('row-clickable');
                if (isComplexAppElement) {
                    this._simulateComplexClick(clickable, keyModifiers);
                } else if (clickable.tagName === 'A' && clickable.href && (ctrlKey || event.shiftKey)) {
                    const clickEvt = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        ...keyModifiers,
                    });
                    clickable.dispatchEvent(clickEvt);
                } else {
                    clickable.click();
                }
            }
            this.clear(false);
        }
    }
    _updateHighlights() {
        this.hints.forEach((h) => {
            if (h.key.startsWith(this.currentHintKeys)) {
                h.hintElement.style.display = 'flex';
                const spans = h.hintElement.querySelectorAll('span');
                spans.forEach((span, idx) => {
                    span.classList.toggle('highlight', idx < this.currentHintKeys.length);
                });
            } else {
                h.hintElement.style.display = 'none';
            }
        });
    }
    _ensureRootAndApplyTheme(themeColors) {
        let hintRoot = this.shadowUI.getContainer().getElementById('hint-root-container');
        if (!hintRoot) {
            hintRoot = document.createElement('div');
            hintRoot.id = 'hint-root-container';
            this.shadowUI.getContainer().appendChild(hintRoot);
        }
        if (themeColors) {
            const cssVars = Object.entries(themeColors)
                .map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
                .join(' ');
            hintRoot.style = hintRoot.getAttribute('style') + cssVars;
        }
    }
    _generateKeys(count) {
        if (count === 0) return [];
        const firstChars = this.hintChars.split('').filter((c) => c !== 'f');
        const otherChars = this.hintChars.split('');
        if (firstChars.length === 0) return [];

        let len = 1;
        let maxForLen = firstChars.length;
        while (maxForLen < count) {
            len++;
            maxForLen = firstChars.length * Math.pow(otherChars.length, len - 1);
        }

        const generate = (l) => {
            if (l <= 0) return [];
            if (l === 1) return firstChars;
            const prev = generate(l - 1);
            const res = [];
            for (const p of prev) {
                for (const c of otherChars) {
                    res.push(p + c);
                }
            }
            return res;
        };

        return generate(len).slice(0, count);
    }
};

/**
 * @class OmniBar
 */
// -- Markdown mini-parser for omnibar responses ------------------
