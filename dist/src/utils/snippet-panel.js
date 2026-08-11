/**
 * snippet-panel.js — Lightweight standalone SnippetManager for the Side Panel.
 *
 * Extracted from hint_content.js. Handles text expansion (snippets) in
 * standard inputs, textareas, and contenteditable elements within the
 * extension's own UI pages (listGroup.html, etc.).
 *
 * Does NOT include: ShadowUI, Omnibar, HintEngine, LinkPreview, CSP bypass,
 * Google Docs/Office/WhatsApp/Telegram editor strategies, or any
 * chrome.runtime.onMessage listeners that could interfere with MV3 messaging.
 */
(function () {
    'use strict';

    // ── Inline helpers (no dependency on hint_content.js Utils class) ──

    function isInputLikeElement(element) {
        if (!element) return false;
        const tagName = element.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return true;
        if (element.isContentEditable) return true;
        if (element.getAttribute) {
            const role = element.getAttribute('role');
            if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
        }
        return false;
    }

    function setReactValue(element, value) {
        const proto = Object.getPrototypeOf(element);
        const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (valueSetter && valueSetter !== element.value) {
            const protoSetter = Object.getOwnPropertyDescriptor(
                element.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
                'value',
            ).set;
            if (protoSetter) protoSetter.call(element, value);
            else element.value = value;
        } else {
            element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function isHTML(text) {
        return /<[a-z][\s\S]*>/i.test(text);
    }

    function cleanExpansionText(text, keepHtml = false) {
        if (keepHtml) return text;
        const stripped = text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<div\s*\/?>/gi, '\n')
            .replace(/<\/div>/gi, '')
            .replace(/<p\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '')
            .replace(/<[^>]+>/g, '');
        const textarea = document.createElement('textarea');
        textarea.innerHTML = stripped;
        return textarea.value;
    }

    // ── Inject minimal CSS for the $$ popup ──
    function injectPopupStyles() {
        if (document.getElementById('snippet-panel-popup-styles')) return;
        const style = document.createElement('style');
        style.id = 'snippet-panel-popup-styles';
        style.textContent = `
.sp-snippet-popup{position:fixed;z-index:999999;background:var(--bg-panel-color,#2c2c2c);border:1px solid var(--border-color,#444);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.3);width:300px;max-height:250px;display:flex;flex-direction:column;overflow:hidden;font-family:'Roboto Mono',monospace;font-size:13px;color:var(--text-color,#ccc);opacity:0;transform:translateY(4px);transition:opacity .15s,transform .15s}
.sp-snippet-search-container{padding:6px;border-bottom:1px solid var(--border-color,#444)}
.sp-snippet-search-input{width:100%;padding:4px 8px;background:var(--bg-color,#1a1a1a);border:1px solid var(--border-color,#444);border-radius:4px;color:var(--text-color,#ccc);font-size:12px;outline:none;box-sizing:border-box}
.sp-snippet-search-input:focus{border-color:var(--interactive-color,#5f6368)}
.sp-snippet-list{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1}
.sp-snippet-item{padding:8px 10px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid transparent}
.sp-snippet-item:last-child{border-bottom:none}
.sp-snippet-item.selected,.sp-snippet-item:hover{background:var(--action-color,#5f6368);color:#fff}
.sp-snippet-item-trigger{font-weight:700;margin-right:8px;flex-shrink:0}
.sp-snippet-item-preview{opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;text-align:right;max-width:60%}
.sp-snippet-empty{padding:12px;text-align:center;opacity:.5;font-size:12px}
        `;
        document.head.appendChild(style);
    }

    // ══════════════════════════════════════════════════════════════
    //  PanelSnippetManager
    // ══════════════════════════════════════════════════════════════
    class PanelSnippetManager {
        constructor() {
            this.snippets = {};
            this.keyBuffer = [];
            this.bufferLimit = 50;
            this.popupActive = false;
            this.popupElement = null;
            this.popupList = null;
            this.searchInput = null;
            this.popupSelectedIndex = 0;
            this.parsedSnippets = [];
            this.filteredSnippets = [];
            this.targetElement = null;
            this.savedSelection = null;
            this._isCleanedUp = false;

            this._init();
        }

        async _init() {
            injectPopupStyles();
            this.snippets = await HintCommon.Snippets.getAll();
            this._attachListeners();

            // Listen for snippet updates (synchronous listener — safe for MV3)
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg.action === 'snippetsUpdated') {
                    HintCommon.Snippets.getAll().then((s) => {
                        this.snippets = s;
                    });
                }
            });
        }

        _attachListeners() {
            this._boundKeyDown = (e) => this._handleKeyDown(e);
            this._boundPaste = (e) => {
                const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
                for (const ch of text) {
                    this.keyBuffer.push(ch);
                    if (this.keyBuffer.length > this.bufferLimit) this.keyBuffer.shift();
                }
            };
            this._boundMouseDown = (e) => {
                if (this.popupActive && this.popupElement && !this.popupElement.contains(e.target)) {
                    this._closePopup();
                }
                this.keyBuffer = [];
            };

            document.addEventListener('keydown', this._boundKeyDown, true);
            document.addEventListener('paste', this._boundPaste, true);
            document.addEventListener('mousedown', this._boundMouseDown, true);
        }

        // ── Key handling ──

        _handleKeyDown(e) {
            if (this._isCleanedUp) return;
            const isSpace = e.key === ' ' || e.code === 'Space';

            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                this.keyBuffer.push(e.key);
                if (this.keyBuffer.length > this.bufferLimit) this.keyBuffer.shift();

                // $$ trigger
                if (this.keyBuffer.length >= 2 && this.keyBuffer.slice(-2).join('') === '$$') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.keyBuffer = [];
                    this._showSnippetPopup();
                    return;
                }

                // Space: synchronous match check
                if (isSpace) {
                    const text = this.keyBuffer.join('');
                    const match = this._getMatchedSnippet(text);
                    if (match) {
                        e.preventDefault();
                        e.stopPropagation();
                        this._expandMatch(match, true);
                        return;
                    }
                }

                // Async fallback
                this._expandMatch(null, false);
            } else if (e.key === 'Backspace') {
                this.keyBuffer.pop();
            } else if (['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
                if (this.popupActive) {
                    e.preventDefault();
                    e.stopPropagation();
                    this._handlePopupNav(e);
                } else {
                    this.keyBuffer = [];
                }
            }
        }

        // ── Snippet matching ──

        _getMatchedSnippet(textBeforeCursor) {
            if (!/\s$/.test(textBeforeCursor)) return null;
            const words = textBeforeCursor.trimEnd().split(/\s/);
            const rawToken = words[words.length - 1];
            if (!rawToken) return null;

            let forcePlainText = false;
            let token = rawToken;
            if (rawToken.endsWith('#') && rawToken.length > 1) {
                forcePlainText = true;
                token = rawToken.slice(0, -1);
            }

            // Direct match
            if (this.snippets[token]) {
                const snippet = this.snippets[token];
                const isSimple = typeof snippet === 'string';
                let expansion = isSimple ? snippet : snippet.expansion || '';

                if (forcePlainText && expansion) expansion = HintCommon.stripHtml(expansion);

                if (isSimple || !snippet.variables || snippet.variables.length === 0) {
                    return { expansion, matchLength: rawToken.length + 1, trigger: rawToken };
                }

                let expanded = expansion;
                snippet.variables.forEach((v) => {
                    if (v.word) expanded = expanded.split(v.word).join(v.defaultValue || v.word);
                });
                return { expansion: expanded, matchLength: rawToken.length + 1, trigger: rawToken };
            }

            // Variable match
            for (const [key, snippet] of Object.entries(this.snippets)) {
                if (typeof snippet !== 'object' || !snippet.variables?.length) continue;
                if (!token.startsWith(key)) continue;

                const paramsPart = token.substring(key.length);
                const tempVars = {};
                const sortedVars = [...snippet.variables].sort((a, b) => b.id.length - a.id.length);

                let remaining = paramsPart;
                const markers = [];
                for (const v of sortedVars) {
                    let idx = remaining.indexOf(v.id);
                    while (idx !== -1) {
                        markers.push({ id: v.id, index: idx });
                        idx = remaining.indexOf(v.id, idx + 1);
                    }
                }
                markers.sort((a, b) => a.index - b.index);

                for (let i = 0; i < markers.length; i++) {
                    const m = markers[i];
                    const next = markers[i + 1];
                    const start = m.index + m.id.length;
                    const end = next ? next.index : remaining.length;
                    tempVars[m.id] = remaining.substring(start, end).replace(/__/g, ' ');
                }
                for (const v of sortedVars) {
                    if (!tempVars[v.id]) tempVars[v.id] = v.defaultValue || '';
                }

                let expanded = snippet.expansion;
                for (const v of sortedVars) {
                    if (v.word) expanded = expanded.split(v.word).join(tempVars[v.id] || v.word);
                }
                if (forcePlainText) expanded = HintCommon.stripHtml(expanded);

                return { expansion: expanded, matchLength: rawToken.length + 1, trigger: rawToken };
            }

            return null;
        }

        // ── Expansion ──

        async _expandMatch(match, spacePrevented) {
            const activeEl = document.activeElement;
            if (!activeEl) return;

            if (!match) {
                const text = this.keyBuffer.join('');
                match = this._getMatchedSnippet(text);
                if (!match) return;
            }

            this._incrementUsage(match.trigger);

            if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
                this._expandInInput(activeEl, match);
            } else if (activeEl.isContentEditable) {
                this._expandInContentEditable(activeEl, match, spacePrevented);
            }

            this.keyBuffer = [];
        }

        _expandInInput(el, match) {
            const value = el.value || '';
            const pos = el.selectionStart || 0;
            const plain = cleanExpansionText(match.expansion, false) + ' ';
            const start = pos - match.matchLength;
            const newVal = value.substring(0, start) + plain + value.substring(pos);
            setReactValue(el, newVal);
            el.setSelectionRange(start + plain.length, start + plain.length);
        }

        _expandInContentEditable(el, match, spacePrevented) {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;

            const hasHtml = isHTML(match.expansion);
            const plain = cleanExpansionText(match.expansion, false) + ' ';
            const html = hasHtml ? cleanExpansionText(match.expansion, true) + '&nbsp;' : null;
            const triggerLen = match.trigger.length + (spacePrevented ? 0 : 1);

            // Select-and-replace strategy (safe for standard contenteditable)
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            const offset = range.startOffset;

            if (node.nodeType === Node.TEXT_NODE && offset >= triggerLen) {
                const newRange = document.createRange();
                newRange.setStart(node, offset - triggerLen);
                newRange.setEnd(node, offset);
                sel.removeAllRanges();
                sel.addRange(newRange);
            } else {
                // Fallback: delete via execCommand
                for (let i = 0; i < triggerLen; i++) document.execCommand('delete', false, null);
            }

            if (html && !this._shouldUsePlainText(el)) {
                document.execCommand('insertHTML', false, html);
            } else {
                document.execCommand('insertText', false, plain);
            }
        }

        _shouldUsePlainText(el) {
            // In the side panel, most editors are simple. Use plain text for inputs.
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
            return false;
        }

        async _incrementUsage(trigger) {
            if (!trigger) return;
            try {
                const snippets = await HintCommon.Snippets.getAll();
                if (snippets[trigger]) {
                    if (typeof snippets[trigger] === 'string') {
                        snippets[trigger] = { expansion: snippets[trigger], usageCount: 0 };
                    }
                    if (!snippets[trigger].usageCount) snippets[trigger].usageCount = 0;
                    snippets[trigger].usageCount++;
                    await HintCommon.Snippets.saveAll(snippets);
                }
            } catch (e) {
                /* silent */
            }
        }

        // ── $$ Popup ──

        async _showSnippetPopup() {
            if (this.popupActive) return;

            this.targetElement = document.activeElement;
            this.savedSelection = null;
            if (this.targetElement) {
                if (this.targetElement.tagName === 'INPUT' || this.targetElement.tagName === 'TEXTAREA') {
                    this.savedSelection = {
                        start: this.targetElement.selectionStart,
                        end: this.targetElement.selectionEnd,
                    };
                } else if (this.targetElement.isContentEditable) {
                    const s = window.getSelection();
                    if (s?.rangeCount > 0) this.savedSelection = s.getRangeAt(0).cloneRange();
                }
            }

            const snippetsMap = await HintCommon.Snippets.getAll();
            const snippets = Object.entries(snippetsMap)
                .map(([trigger, data]) => {
                    const isObj = typeof data === 'object';
                    return {
                        trigger,
                        expansion: isObj ? data.expansion : data,
                        usageCount: isObj ? data.usageCount || 0 : 0,
                        variables: isObj ? data.variables : [],
                    };
                })
                .sort((a, b) => b.usageCount - a.usageCount);

            if (snippets.length === 0) return;

            this.popupActive = true;
            this.popupSelectedIndex = 0;
            this.parsedSnippets = snippets;
            this.filteredSnippets = [...snippets];

            const popup = document.createElement('div');
            popup.className = 'sp-snippet-popup';
            popup.addEventListener('mousedown', (e) => {
                if (!e.target.classList.contains('sp-snippet-search-input')) e.preventDefault();
            });

            const searchContainer = document.createElement('div');
            searchContainer.className = 'sp-snippet-search-container';
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = chrome.i18n.getMessage('searchSnippets') || 'Search snippets...';
            searchInput.className = 'sp-snippet-search-input';
            searchContainer.appendChild(searchInput);
            popup.appendChild(searchContainer);

            const list = document.createElement('ul');
            list.className = 'sp-snippet-list';
            popup.appendChild(list);

            this.popupElement = popup;
            this.popupList = list;
            this.searchInput = searchInput;
            this._renderPopupList();

            document.body.appendChild(popup);

            // Position near caret
            const rect = this.targetElement?.getBoundingClientRect();
            if (rect) {
                let top = rect.bottom + 8;
                let left = rect.left;
                if (left + 320 > window.innerWidth) left = window.innerWidth - 330;
                if (top + 260 > window.innerHeight) top = rect.top - 260;
                popup.style.top = `${top}px`;
                popup.style.left = `${left}px`;
            } else {
                popup.style.top = '50%';
                popup.style.left = '50%';
                popup.style.transform = 'translate(-50%,-50%)';
            }

            requestAnimationFrame(() => {
                popup.style.opacity = '1';
                popup.style.transform = 'translateY(0)';
                searchInput.focus();
            });

            searchInput.addEventListener('input', () => {
                const q = searchInput.value.toLowerCase();
                this.filteredSnippets = this.parsedSnippets.filter(
                    (s) => s.trigger.toLowerCase().includes(q) || s.expansion.toLowerCase().includes(q),
                );
                this.popupSelectedIndex = 0;
                this._renderPopupList();
            });
            searchInput.addEventListener('keydown', (e) => {
                if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
                    e.preventDefault();
                    e.stopPropagation();
                    this._handlePopupNav(e);
                }
            });
        }

        _closePopup() {
            if (this.popupElement) {
                this.popupElement.remove();
                this.popupElement = null;
            }
            this.popupActive = false;
            this.popupList = null;
            this.parsedSnippets = [];
        }

        _renderPopupList() {
            if (!this.popupList) return;
            this.popupList.innerHTML = '';
            if (this.filteredSnippets.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'sp-snippet-empty';
                empty.textContent = 'No matching snippets';
                this.popupList.appendChild(empty);
                return;
            }
            this.filteredSnippets.forEach((s, idx) => {
                const item = document.createElement('li');
                item.className = 'sp-snippet-item';
                if (idx === this.popupSelectedIndex) item.classList.add('selected');

                const trig = document.createElement('span');
                trig.textContent = s.trigger;
                trig.className = 'sp-snippet-item-trigger';

                const prev = document.createElement('span');
                prev.textContent = cleanExpansionText(s.expansion, false).substring(0, 40);
                prev.className = 'sp-snippet-item-preview';

                item.appendChild(trig);
                item.appendChild(prev);

                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.popupSelectedIndex = idx;
                    this._insertFromPopup(s);
                });
                item.addEventListener('mouseenter', () => {
                    if (this.popupSelectedIndex !== idx) {
                        this.popupSelectedIndex = idx;
                        this._renderPopupList();
                    }
                });
                this.popupList.appendChild(item);
            });

            const sel = this.popupList.children[this.popupSelectedIndex];
            if (sel) sel.scrollIntoView({ block: 'nearest' });
        }

        _handlePopupNav(e) {
            if (!this.popupActive) return;
            if (e.key === 'Escape') {
                this._closePopup();
                return;
            }
            if (e.key === 'Enter') {
                const s = this.filteredSnippets[this.popupSelectedIndex];
                if (s) this._insertFromPopup(s);
                return;
            }
            const len = this.filteredSnippets.length;
            if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
                this.popupSelectedIndex = (this.popupSelectedIndex + 1) % len;
            } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
                this.popupSelectedIndex = (this.popupSelectedIndex - 1 + len) % len;
            }
            this._renderPopupList();
        }

        async _insertFromPopup(snippet) {
            this._closePopup();
            this._incrementUsage(snippet.trigger);

            let activeEl = this.targetElement || document.activeElement;
            if (activeEl) {
                if (typeof activeEl.focus === 'function') activeEl.focus();
                if (this.savedSelection) {
                    if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
                        activeEl.setSelectionRange(this.savedSelection.start, this.savedSelection.end);
                    } else {
                        try {
                            const sel = window.getSelection();
                            if (sel && this.savedSelection instanceof Range) {
                                sel.removeAllRanges();
                                sel.addRange(this.savedSelection);
                            }
                        } catch (e) {
                            /* ignore */
                        }
                    }
                }
                await new Promise((r) => setTimeout(r, 50));
            }

            this.targetElement = null;
            this.savedSelection = null;
            if (!activeEl) return;

            // Resolve variables with defaults
            let expansion = snippet.expansion;
            if (snippet.variables?.length > 0) {
                snippet.variables.forEach((v) => {
                    if (v.word) expansion = expansion.split(v.word).join(v.defaultValue || v.word);
                });
            }

            const match = { expansion, matchLength: 1, trigger: '$' };

            if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
                this._expandInInput(activeEl, match);
            } else if (activeEl.isContentEditable) {
                this._expandInContentEditable(activeEl, match, true);
            }
        }

        cleanup() {
            this._isCleanedUp = true;
            if (this._boundKeyDown) document.removeEventListener('keydown', this._boundKeyDown, true);
            if (this._boundPaste) document.removeEventListener('paste', this._boundPaste, true);
            if (this._boundMouseDown) document.removeEventListener('mousedown', this._boundMouseDown, true);
            this._closePopup();
        }
    }

    // ── Auto-initialize ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new PanelSnippetManager());
    } else {
        new PanelSnippetManager();
    }
})();
