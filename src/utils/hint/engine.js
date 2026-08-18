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
            'details:not([aria-disabled="true"])',
            '[role="gridcell"]:not([aria-disabled="true"])',
            'div[aria-selected]:not([aria-disabled="true"])',
            '.chatlist-chat:not([aria-disabled="true"])',
            '.row-clickable:not([aria-disabled="true"])',
            '[role="row"]:not([aria-disabled="true"])',
        ];
        if (!window.location.pathname.includes('/listGroup/listGroup.html')) {
            const additional = [
                '[onmousedown]:not([aria-disabled="true"])',
                '[onmouseup]:not([aria-disabled="true"])',
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
        const candidates = Utils.querySelectorAllDeep(this.hintSelectors, document.body);
        const hintable = candidates.filter((el) => {
            const isYtControl = window.location.hostname.includes('youtube.com') && el.closest('.ytp-chrome-bottom');
            return Utils.isVisible(el, isYtControl);
        });
        const finalTargets = hintable.filter((el) => {
            return !hintable.some((other) => el !== other && el.contains(other));
        });
        const keysToAssign = this._generateKeys(finalTargets.length);
        const hintRoot = this.shadowUI.getContainer().getElementById('hint-root-container');
        finalTargets.forEach((el, i) => {
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
            const rect = el.getBoundingClientRect();
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
        if (event.key === 'Backspace') {
            event.preventDefault();
            event.stopPropagation();
            if (this.currentHintKeys.length > 0) {
                this.currentHintKeys = this.currentHintKeys.slice(0, -1);
                this._updateHighlights();
            }
            return true;
        }
        const char = event.key.toLowerCase();
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
                const clickable = (el.closest && el.closest('a[href], button, [role="button"]')) || el;
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
        let len = 1;
        while (Math.pow(this.hintChars.length, len) < count) len++;
        const generate = (l) => {
            if (l <= 0) return [];
            if (l === 1) return this.hintChars.split('');
            const prev = generate(l - 1);
            const res = [];
            for (const p of prev) {
                for (const c of this.hintChars) res.push(p + c);
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
