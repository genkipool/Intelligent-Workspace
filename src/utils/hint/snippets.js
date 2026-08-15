/**
 * @class SnippetManager
 * @description Handles text expansion (snippets) in inputs and textareas.
 */
/**
 * @class SnippetManager
 * @description Handles text expansion (snippets) in inputs and textareas.
 * MODIFIED: Autocomplete on space press for all cases (with and without variables).
 */
/**
 * @class SnippetExpander
 * @description Handles text expansion (snippets) with full support for formatted HTML
 * using Clipboard API for compatibility with Google Docs and other advanced editors.
 */
var SnippetManager = class SnippetManager {
    constructor(shadowUI) {
        this.snippets = {};
        this.initialized = false;
        this.shadowUI = shadowUI;
        this.keyBuffer = [];
        this.bufferLimit = 50;

        // * Detect site/editor type
        this.siteInfo = this._detectSiteAndEditor();

        // IMPORTANT: Automatically load and initialize
        this.load();
        this.init();
    }
    async load() {
        this.snippets = await HintCommon.Snippets.getAll();
    }
    async init() {
        if (this.initialized) return;
        this.initialized = true;

        // * CRITICAL: Register input event listener
        document.addEventListener(
            'input',
            (e) => {
                if (!Utils.isInputLikeElement(e.target)) return;
                this._handleInput(e.target, e);
            },
            true,
        );

        // Initialize key buffer (now global to support $$ and popup navigation)
        this.initKeyBuffer();

        // * NEW: Monitor Google Docs iframes
        this._setupGDocsMonitor();

        // Snippet update listener
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'snippetsUpdated') {
                this._reloadSnippets();
            }
        });
    }

    /**
     * * Detects the site for specific configurations (WhatsApp proxy editor, etc.)
     */
    _detectSiteAndEditor() {
        const hostname = window.location.hostname;
        const configs = {
            'web.whatsapp.com': {
                name: 'WhatsApp',
                isProxyEditor: true,
                forcePlainText: true,
                useKeyBuffer: true,
            },
            'web.telegram.org': {
                name: 'Telegram',
                isProxyEditor: false,
                forcePlainText: true,
                useKeyBuffer: true,
                needsDelay: true,
            },
            'word.cloud.microsoft': {
                name: 'Word Online',
                isProxyEditor: false,
                forcePlainText: false,
                useKeyBuffer: true,
                isDocs: true, // Force robust GDocs logic
            },
            'office.live.com': {
                name: 'Word Online (Live)',
                isProxyEditor: false,
                forcePlainText: false,
                useKeyBuffer: true,
                isDocs: true,
            },
            'docs.google.com': {
                name: 'Google Docs',
                isProxyEditor: false,
                forcePlainText: false,
                useKeyBuffer: true,
                isDocs: true,
            },
            'keep.google.com': {
                name: 'Google Keep',
                isProxyEditor: false,
                forcePlainText: true,
                useKeyBuffer: true,
            },
            'mail.google.com': {
                name: 'Gmail',
                isProxyEditor: false,
                forcePlainText: false,
            },
        };
        for (const [domain, config] of Object.entries(configs)) {
            if (hostname.includes(domain)) {
                console.log(`[Snippet] Site detected: ${config.name}`);
                return {
                    ...config,
                    hostname,
                };
            }
        }
        return {
            name: 'Generic',
            isProxyEditor: false,
            forcePlainText: false,
            hostname,
        };
    }

    /**
     * Detects if it's a proxy editor (invisible) like WhatsApp
     */
    _isProxyEditor(element) {
        if (this.siteInfo.isProxyEditor) return true;
        return false;
    }

    /**
     * NEW: Detects editor type based on DOM features
     * (similar to Text Blaze - doesn't depend on URL)
     */
    _detectEditorType(element) {
        if (!element) return 'standard';

        // ====== GOOGLE DOCS ======
        if (element.tagName === 'DIV' && element.nextElementSibling?.id === 'docs-texteventtarget-descendant') {
            return 'google-docs';
        }

        // ====== GOOGLE KEEP ======
        if (
            element.classList?.contains('notranslate') &&
            element.getAttribute('role') === 'textbox' &&
            element.isContentEditable
        ) {
            return 'google-keep';
        }

        // ====== MICROSOFT OFFICE ONLINE (Word/Excel/PowerPoint) ======
        if (
            element.classList?.contains('OutlineElement') ||
            element.closest('[role="textbox"][aria-label*="Word"]') ||
            element.closest('.WACViewPanel_EditingElement') ||
            element.closest('[id*="WACViewPanel"]')
        ) {
            return 'office-online';
        }

        // ====== LEXICAL EDITOR ======
        if (
            element.getAttribute?.('data-lexical-editor') === 'true' ||
            element.closest('[data-lexical-editor="true"]')
        ) {
            return 'lexical';
        }

        // ====== DRAFT.JS (used in Medium, Notion, etc) ======
        if (
            element.classList?.contains('public-DraftEditor-content') &&
            element.parentElement?.classList.contains('DraftEditor-editorContainer')
        ) {
            return 'draftjs';
        }

        // ====== Generic CONTENTEDITABLE ======
        if (element.isContentEditable) {
            return 'contenteditable';
        }

        // ====== TEXTAREA / INPUT ======
        if (
            element.tagName === 'TEXTAREA' ||
            (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'search'))
        ) {
            return 'textarea';
        }
        return 'standard';
    }

    /**
     * NEW: Gets the insertion strategy according to the editor type
     */
    _getEditorStrategy(editorType) {
        const strategies = {
            'google-docs': {
                deleteMethod: 'keyboard-events',
                insertMethod: 'paste-event',
                needsDelay: true,
                forcePlainText: false,
            },
            'google-keep': {
                deleteMethod: 'execCommand',
                insertMethod: 'paste-event',
                // Paste event is more robust for Keep to maintain the cursor
                needsDelay: true,
                forcePlainText: true,
            },
            'office-online': {
                deleteMethod: 'simulate-backspace',
                // Changed from 'keyboard-events' to 'simulate-backspace'
                insertMethod: 'paste-event',
                needsDelay: true,
                forcePlainText: false,
            },
            lexical: {
                deleteMethod: 'select-replace',
                insertMethod: 'select-replace',
                needsDelay: false,
                forcePlainText: true,
            },
            draftjs: {
                deleteMethod: 'keyboard-events',
                insertMethod: 'paste-event',
                needsDelay: false,
                forcePlainText: false,
            },
            contenteditable: {
                deleteMethod: 'execCommand',
                insertMethod: 'execCommand',
                needsDelay: false,
                forcePlainText: false,
            },
            textarea: {
                deleteMethod: 'direct',
                insertMethod: 'direct',
                needsDelay: false,
                forcePlainText: true,
            },
            standard: {
                deleteMethod: 'execCommand',
                insertMethod: 'execCommand',
                needsDelay: false,
                forcePlainText: false,
            },
        };
        return strategies[editorType] || strategies['standard'];
    }
    _isElementVisible(element) {
        if (!element) return false;

        // Use checkVisibility if available
        if (element.checkVisibility) {
            try {
                return element.checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                });
            } catch {
                // Fallback
            }
        }

        // Fallback manual
        const style = window.getComputedStyle(element);
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (style.opacity === '0') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    /**
     * NEW: Verifies if the trigger is actually before the cursor
     */
    _isIntegratedEditor(element, trigger) {
        if (!element || !trigger) return true;
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            const value = element.value || '';
            const pos = element.selectionStart || 0;
            const textBefore = value.substring(0, pos);
            return textBefore.toLowerCase().endsWith(trigger.toLowerCase() + ' ');
        }
        if (element.isContentEditable) {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return true;
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            if (node.nodeType !== Node.TEXT_NODE) return true;
            const text = node.textContent || '';
            const offset = range.startOffset;
            const textBefore = text.substring(0, offset);
            return textBefore.toLowerCase().endsWith(trigger.toLowerCase() + ' ');
        }
        return true;
    }

    /**
     * FIXED: Emulates Backspace with REAL deletion
     */
    async _simulateBackspace(element, count) {
        console.log(`[Snippet] [BACK] Deleting ${count} characters in proxy editor`);
        for (let i = 0; i < count; i++) {
            // Simulate keyboard event
            const keydownEvent = new KeyboardEvent('keydown', {
                key: 'Backspace',
                code: 'Backspace',
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true,
            });
            element.dispatchEvent(keydownEvent);

            // CRITICAL: ACTUALLY DELETE with execCommand
            document.execCommand('delete', false, null);
            const keyupEvent = new KeyboardEvent('keyup', {
                key: 'Backspace',
                code: 'Backspace',
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true,
            });
            element.dispatchEvent(keyupEvent);
        }
        console.log('[Snippet] [OK] Deletion completed');
    }
    async _deleteTrigger(element, trigger, spacePrevented) {
        // If the space was prevented, the trigger is as-is.
        // If space wasn't prevented, it's already inserted and needs to be deleted (+1).
        const triggerLength = trigger.length + (spacePrevented ? 0 : 1);

        // NEW: Dynamically detect editor type
        const editorType = this._detectEditorType(element);
        const strategy = this._getEditorStrategy(editorType);
        console.log(`[Snippet] Editor type detected: ${editorType}`);
        console.log(`[Snippet] Deletion strategy: ${strategy.deleteMethod}`);
        console.log(`[Snippet] Deleting "${trigger}" (${triggerLength} characters)`);

        // Apply deletion strategy
        switch (strategy.deleteMethod) {
            case 'keyboard-events':
                await this._deleteViaKeyboardEmulation(element, triggerLength);
                break;
            case 'simulate-backspace':
                // New strategy for Word Online / Proxy Editors
                await this._simulateBackspace(element, triggerLength);
                break;
            case 'execCommand':
                for (let i = 0; i < triggerLength; i++) {
                    document.execCommand('delete', false, null);
                }
                break;
            case 'direct':
                // For INPUT/TEXTAREA
                const value = element.value || '';
                const start = element.selectionStart || 0;
                const deleteStart = start - triggerLength;
                element.value = value.substring(0, deleteStart) + value.substring(start);
                element.selectionStart = element.selectionEnd = deleteStart;
                break;
        }

        // Delay if necessary (Google Docs, Office Online)
        if (strategy.needsDelay) {
            await new Promise((r) => setTimeout(r, 50));
        }
    }

    /**
     * NEW: Deletes text using keyboard event emulation (for Google Docs)
     */
    async _deleteViaKeyboardEmulation(element, count) {
        console.log('[Snippet] _deleteViaKeyboardEmulation:', count, 'characters');

        // Trigger backspace events
        for (let i = 0; i < count; i++) {
            // Create keydown event
            const keydownEvent = new KeyboardEvent('keydown', {
                key: 'Backspace',
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true,
                composed: true,
            });
            element.dispatchEvent(keydownEvent);

            // Small pause for Google Docs to process
            await new Promise((r) => setTimeout(r, 1));

            // Create keyup event
            const keyupEvent = new KeyboardEvent('keyup', {
                key: 'Backspace',
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true,
                composed: true,
            });
            element.dispatchEvent(keyupEvent);
        }
        console.log('[Snippet] [OK] Backspace emulation completed');
    }

    /**
     * REFACTORED: Inserts using element type detection
     */
    async _insertViaDataTransfer(element, plainText, htmlText) {
        console.log('[Snippet] [SYNC] Starting insertion');

        // NEW: Dynamically detect editor type
        const editorType = this._detectEditorType(element);
        const strategy = this._getEditorStrategy(editorType);
        console.log(`[Snippet] Editor type detected: ${editorType}`);
        console.log(`[Snippet] Insertion strategy: ${strategy.insertMethod}`);
        console.log(`[Snippet] Force plain text: ${strategy.forcePlainText}`);

        // Determine whether to use HTML or plain text
        const useHTML = htmlText && !strategy.forcePlainText;
        console.log(`[Snippet] Inserting: ${useHTML ? 'HTML' : 'plain text'}`);

        // Apply insertion strategy
        switch (strategy.insertMethod) {
            case 'paste-event':
                this._insertViaPasteEvent(element, plainText, useHTML ? htmlText : null, editorType);
                break;
            case 'execCommand':
                if (useHTML) {
                    document.execCommand('insertHTML', false, htmlText);
                } else {
                    document.execCommand('insertText', false, plainText);
                }
                break;
            case 'direct':
                // For INPUT/TEXTAREA
                const start = element.selectionStart || 0;
                const end = element.selectionEnd || start;
                const value = element.value || '';
                element.value = value.substring(0, start) + plainText + value.substring(end);
                element.selectionStart = element.selectionEnd = start + plainText.length;

                // Trigger events for frameworks like React
                element.dispatchEvent(
                    new Event('input', {
                        bubbles: true,
                    }),
                );
                element.dispatchEvent(
                    new Event('change', {
                        bubbles: true,
                    }),
                );
                break;
        }

        // Delay if necessary
        if (strategy.needsDelay) {
            await new Promise((r) => setTimeout(r, 50));
        }

        // WORD ONLINE FIX V3: Insert space explicitly AFTER paste
        // Word cuts spaces from paste, so we insert it as an isolated event
        if (editorType === 'office-online') {
            console.log('[Snippet] [FIX] Word Online: Injecting post-paste space');
            document.execCommand('insertText', false, ' ');
        }
        console.log('[Snippet] [OK] Insertion completed');
        return true;
    }

    /**
     * NEW: Atomic select-and-replace for editors like Lexical (WhatsApp) and
     * contenteditable managed by frameworks (Telegram).
     * Instead of deleting N characters + inserting, selects the trigger and replaces it
     * in a single operation, avoiding desync with the framework's virtual state.
     */
    async _selectAndReplace(element, triggerLength, plainText, htmlText, editorType) {
        console.log(`[Snippet] _selectAndReplace: triggerLength=${triggerLength}, editorType=${editorType}`);

        // SPECIAL DETECTION: Google Keep
        const isKeep = window.location.hostname.includes('keep.google.com');
        if (isKeep) {
            console.log('[Snippet] [FIX] Google Keep detected - using special strategy');
        }
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) {
            console.log('[Snippet] [WARN] No selection available');
            return false;
        }
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        const offset = range.startOffset;

        // Verify that we can select the trigger
        if (node.nodeType !== Node.TEXT_NODE || offset < triggerLength) {
            console.log('[Snippet] [WARN] Cannot select trigger, falling back to execCommand');
            for (let i = 0; i < triggerLength; i++) {
                document.execCommand('delete', false, null);
            }
            document.execCommand('insertText', false, plainText);

            // FIX KEEP: Position cursor at the end
            if (isKeep) {
                await this._fixKeepCursorPosition(element, plainText);
            }
            return false;
        }

        // Select the trigger text
        const newRange = document.createRange();
        newRange.setStart(node, offset - triggerLength);
        newRange.setEnd(node, offset);
        sel.removeAllRanges();
        sel.addRange(newRange);
        console.log(`[Snippet] Selected: "${node.textContent.substring(offset - triggerLength, offset)}"`);
        if (editorType === 'lexical') {
            // Lexical ignores synthetic events (isTrusted===false).
            // execCommand('insertText') generates a TRUSTED beforeinput that Lexical does process.
            // As the selection already covers the trigger, this replaces it atomically.
            document.execCommand('insertText', false, plainText);
            console.log('[Snippet] [OK] Lexical: execCommand insertText (trusted beforeinput)');
        } else {
            // Contenteditable: try beforeinput, fallback to execCommand
            const biEvent = new InputEvent('beforeinput', {
                inputType: 'insertText',
                data: plainText,
                bubbles: true,
                cancelable: true,
                composed: true,
            });
            const wasHandled = !element.dispatchEvent(biEvent);
            if (wasHandled) {
                console.log('[Snippet] [OK] Handled via beforeinput');
            } else {
                console.log('[Snippet] Using execCommand fallback');
                if (htmlText) {
                    document.execCommand('insertHTML', false, htmlText);
                } else {
                    document.execCommand('insertText', false, plainText);
                }
            }
        }

        // FIX KEEP: Position cursor at the end after insertion
        if (isKeep) {
            await this._fixKeepCursorPosition(element, plainText);
        }
        console.log('[Snippet] [OK] selectAndReplace completed');
        return true;
    }

    /**
     * NEW: Fix to position cursor correctly in Google Keep
     * Keep processes insertions asynchronously and may move the cursor,
     * especially when there is previous text. This method guarantees that the cursor
     * stays at the end of the inserted text.
     */
    async _fixKeepCursorPosition(element, insertedText) {
        console.log('[Snippet] [FIX] Applying cursor fix for Google Keep');

        // Wait for Keep to process insertion
        await new Promise((r) => setTimeout(r, 50));
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) {
            console.log('[Snippet] [WARN] No selection for cursor fix');
            return;
        }
        try {
            // Search for the last text node in the element
            const range = sel.getRangeAt(0);
            let node = range.startContainer;

            // If we are in an element, search for the last child text node
            if (node.nodeType === Node.ELEMENT_NODE) {
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
                let lastTextNode = null;
                while (walker.nextNode()) {
                    lastTextNode = walker.currentNode;
                }
                if (lastTextNode) {
                    node = lastTextNode;
                }
            }

            // Position cursor at the end of the text node
            if (node && node.nodeType === Node.TEXT_NODE) {
                const newRange = document.createRange();
                const textContent = node.textContent;
                const endPosition = textContent.length;
                newRange.setStart(node, endPosition);
                newRange.setEnd(node, endPosition);
                sel.removeAllRanges();
                sel.addRange(newRange);
                console.log('[Snippet] [OK] Cursor repositioned at the end in Keep');
            } else {
                console.log('[Snippet] [WARN] No valid text node found');
            }
        } catch (error) {
            console.error('[Snippet] Error repositioning cursor in Keep:', error);
        }
    }

    /**
     * NEW: Inserts using paste event (for Google Docs, Office Online, etc)
     */
    _insertViaPasteEvent(element, plainText, htmlText, editorType) {
        console.log('[Snippet] Using paste event');

        // Create DataTransfer
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', plainText);
        if (htmlText) {
            // For Google Docs and Office Online: special format with meta
            const meta = "<meta charset='utf-8'>";
            let finalHtml = htmlText.startsWith(meta) ? htmlText : meta + htmlText;

            // Wrap in full HTML structure if it's Google Docs or Office
            if (editorType === 'google-docs' || editorType === 'office-online') {
                if (!finalHtml.toLowerCase().includes('<!doctype')) {
                    finalHtml = `<!DOCTYPE html><html><head>${meta}</head><body>${finalHtml}</body></html>`;
                }
            }
            dataTransfer.setData('text/html', finalHtml);
            console.log('[Snippet] HTML with prepared formatting');
        }

        // beforeinput event
        const beforeInputEvent = new InputEvent('beforeinput', {
            inputType: 'insertFromPaste',
            dataTransfer: dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(beforeInputEvent);
        if (beforeInputEvent.defaultPrevented) {
            console.log('[Snippet] beforeinput was prevented');
            return;
        }

        // paste event
        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(pasteEvent);

        // Input event to ensure editor detects the change
        setTimeout(() => {
            element.dispatchEvent(
                new Event('input', {
                    bubbles: true,
                }),
            );
        }, 10);
        console.log('[Snippet] Paste event fired, defaultPrevented:', pasteEvent.defaultPrevented);

        // Fallback when the events were not handled
        if (!pasteEvent.defaultPrevented && !beforeInputEvent.defaultPrevented) {
            console.log('[Snippet] [WARN] Events not handled, using fallback execCommand');
            if (htmlText) {
                document.execCommand('insertHTML', false, htmlText);
            } else {
                document.execCommand('insertText', false, plainText);
            }
        }
    }
    _shouldUsePlainText(element, hasHTML) {
        // NEW: Use editor type detection
        const editorType = this._detectEditorType(element);
        const strategy = this._getEditorStrategy(editorType);

        // If strategy forces plain text
        if (strategy.forcePlainText) {
            console.log(`[Snippet] [TEXT] Using plain text (type: ${editorType})`);
            return true;
        }

        // If content does NOT have HTML, use plain text
        if (!hasHTML) {
            return true;
        }

        // By default, if it has HTML and editor supports it, use HTML
        console.log(`[Snippet] [HTML] Using formatted HTML (type: ${editorType})`);
        return false;
    }

    /**
     * NEW METHOD: Simplifies HTML for sites with limited support
     */
    /**
     * NEW: Handles key buffer in a centralized way
     */
    _handleKeyDown(e) {
        if (this._isCleanedUp) return;
        const isSpace = e.key === ' ' || e.code === 'Space';
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            this.keyBuffer.push(e.key);
            if (this.keyBuffer.length > this.bufferLimit) this.keyBuffer.shift();

            // Check $$ trigger
            if (this.keyBuffer.length >= 2 && this.keyBuffer.slice(-2).join('') === '$$') {
                e.preventDefault();
                e.stopPropagation();
                this.keyBuffer = [];
                this._showSnippetPopup();
                return;
            }

            // Synchronous Match Detection to prevent Space
            if (isSpace) {
                const bufferText = this.keyBuffer.join('');
                const match = this._getMatchedSnippet(bufferText);
                if (match) {
                    console.log('[Snippet] [MATCH] Match sincrono detected:', match.trigger);
                    e.preventDefault(); // Block space insertion by the editor
                    e.stopPropagation();
                    this._checkBlindMatch(true); // Pass true indicating that space was prevented
                    return;
                }
            }

            // If not space or no sync match, call normal flow (async)
            this._checkBlindMatch(false);
        } else if (e.key === 'Backspace') {
            this.keyBuffer.pop();
        } else if (['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
            if (this.popupActive) {
                // Only prevent for keys the popup consumes
                e.preventDefault();
                e.stopPropagation();
                this._handlePopupNavigation(e);
            } else {
                this.keyBuffer = [];
            }
        }
    }

    /**
     * NEW METHOD: Initialization of keyboard and mouse listeners
     */
    initKeyBuffer() {
        console.log('[DEBUG] initKeyBuffer initialized');
        this._boundKeyDownHandler = (e) => this._handleKeyDown(e);
        document.addEventListener('keydown', this._boundKeyDownHandler, true);

        // NEW: Capture pasted text to feed keyBuffer
        // Paste doesn't generate keydown per character, so buffer stays empty
        this._boundPasteHandler = (e) => {
            const pastedText = (e.clipboardData || window.clipboardData)?.getData('text') || '';
            if (!pastedText) return;
            // Feed buffer with pasted characters
            for (const ch of pastedText) {
                this.keyBuffer.push(ch);
                if (this.keyBuffer.length > this.bufferLimit) this.keyBuffer.shift();
            }
            console.log('[Snippet] [PASTE] Paste detected, keyBuffer updated:', this.keyBuffer.join(''));
        };
        document.addEventListener('paste', this._boundPasteHandler, true);
        this._boundMouseDownHandler = (e) => {
            if (this.popupActive && this.popupElement) {
                const path = e.composedPath();
                // FIX: check also shadow host because from document
                // composedPath() might not include internal elements of shadow root.
                const shadowHost = this.shadowUI && this.shadowUI.host;
                const isInsidePopup = path.includes(this.popupElement) || (shadowHost && path.includes(shadowHost));
                if (!isInsidePopup) {
                    this._closePopup();
                }
            }
            this.keyBuffer = [];
        };
        document.addEventListener('mousedown', this._boundMouseDownHandler, true);
    }
    cleanup() {
        this._isCleanedUp = true;
        if (this._boundKeyDownHandler) document.removeEventListener('keydown', this._boundKeyDownHandler, true);
        if (this._boundPasteHandler) document.removeEventListener('paste', this._boundPasteHandler, true);
        if (this._boundMouseDownHandler) document.removeEventListener('mousedown', this._boundMouseDownHandler, true);
        if (this.gDocsObserver) {
            this.gDocsObserver.disconnect();
            this.gDocsObserver = null;
        }
        this._closePopup();
    }

    /**
     * NEW: Detects and attaches listeners to Google Docs iframe
     */
    _setupGDocsMonitor() {
        if (!window.location.hostname.includes('docs.google.com')) return;
        const attachToIframe = (iframe) => {
            if (!iframe || iframe.dataset.snippetAttached) return;
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                if (doc) {
                    doc.addEventListener('keydown', (e) => this._handleKeyDown(e), true);
                    iframe.dataset.snippetAttached = 'true';
                    console.log('[Snippet] [OK] Listener attached to GDocs iframe');
                }
            } catch {}
        };
        const iframes = document.querySelectorAll('iframe.docs-texteventtarget-iframe');
        iframes.forEach(attachToIframe);
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'IFRAME' && node.classList.contains('docs-texteventtarget-iframe')) {
                        attachToIframe(node);
                    } else if (node.querySelectorAll) {
                        const found = node.querySelectorAll('iframe.docs-texteventtarget-iframe');
                        found.forEach(attachToIframe);
                    }
                });
            });
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }
    async _checkBlindMatch(spacePrevented = false) {
        const activeEl = document.activeElement;
        if (!activeEl) return;
        const text = this.keyBuffer.join('');
        console.log('[DEBUG] _checkBlindMatch called');
        console.log('[DEBUG] keyBuffer:', this.keyBuffer);
        console.log('[DEBUG] text:', text);
        const match = this._getMatchedSnippet(text);
        console.log('[DEBUG] match encontrado:', match);
        if (match) {
            console.log('[DEBUG] [OK] Match found, processing...');
            this._incrementSnippetUsage(match.trigger);
            console.log('[DEBUG] activeElement:', activeEl);
            console.log('[DEBUG] activeElement.tagName:', activeEl?.tagName);
            console.log('[DEBUG] activeElement.isContentEditable:', activeEl?.isContentEditable);
            if (!activeEl) {
                console.log('[DEBUG] [ERR] No activeElement, aborting');
                return;
            }

            // USE CENTRALIZED HANDLERS
            if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
                await this._handleInputField(activeEl, '', match);
            } else if (activeEl.isContentEditable) {
                await this._handleContentEditable(activeEl, match, spacePrevented);
            } else {
                // Fallback for other rare cases (role=textbox etc)
                const hasHTML = this._isHTML(match.expansion);
                await this._deleteTrigger(activeEl, match.trigger, spacePrevented);
                const plainText = this._cleanExpansionText(match.expansion, false) + ' ';
                const htmlText = hasHTML ? this._cleanExpansionText(match.expansion, true) + '&nbsp;' : null;
                await this._insertViaDataTransfer(activeEl, plainText, htmlText);
            }

            // Clear buffer
            this.keyBuffer = [];
        } else {
            console.log('[DEBUG] [ERR] No match found para:', text);
            console.log('[DEBUG] Snippets disponibles:', Object.keys(this.snippets));
        }
    }
    _simulateKey(target, key, keyCode) {
        const common = {
            key: key,
            keyCode: keyCode,
            which: keyCode,
            code: key,
            bubbles: true,
            cancelable: true,
            composed: true,
        };
        target.dispatchEvent(new KeyboardEvent('keydown', common));
        target.dispatchEvent(new KeyboardEvent('keyup', common));
    }
    async _reloadSnippets() {
        this.snippets = await HintCommon.Snippets.getAll();
    }

    /**
     * Detects if content has HTML
     */
    _isHTML(text) {
        return /<[a-z][\s\S]*>/i.test(text);
    }

    /**
     * Cleans expansion text from HTML if necessary
     */
    _cleanExpansionText(text, keepHtml = false) {
        if (keepHtml) {
            return text;
        }
        const stripped = text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<div\s*\/?>/gi, '\n')
            .replace(/<\/div>/gi, '')
            .replace(/<p\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '')
            .replace(/<[^>]+>/g, '');

        // Decode HTML entities (&lt; -> <, &gt; -> >, &amp; -> &, etc.)
        const textarea = document.createElement('textarea');
        textarea.innerHTML = stripped;
        return textarea.value;
    }

    /**
     * Inserts text using the Clipboard API (recommended method for Google Docs)
     */
    _insertUsingPasteEvent(target, text, html) {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        if (html) {
            // CRITICAL: Google Docs needs COMPLETE HTML structure
            // Include DOCTYPE, meta tags and body wrapper

            let finalHtml = html;

            // Ensure it does not have duplicate meta
            const meta = "<meta charset='utf-8'>";
            if (finalHtml.startsWith(meta)) {
                finalHtml = finalHtml.substring(meta.length);
            }

            // Wrap in full HTML structure if it doesn't have one
            if (!finalHtml.toLowerCase().includes('<!doctype')) {
                finalHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <meta name='generator' content='Intelligent Workspace'>
    <style>
        body { margin: 0; padding: 0; }
        p { margin: 0; }
    </style>
</head>
<body>
${finalHtml}
</body>
</html>`;
            }
            console.log('[SnippetManager] HTML para paste:', finalHtml.substring(0, 200));
            dataTransfer.setData('text/html', finalHtml);
        }

        // 1. Try InputEvent (beforeinput) - modern method
        const inputEvent = new InputEvent('beforeinput', {
            inputType: 'insertFromPaste',
            dataTransfer: dataTransfer,
            bubbles: true,
            cancelable: true,
            composed: true,
        });
        const inputHandled = target.dispatchEvent(inputEvent);
        if (!inputHandled || inputEvent.defaultPrevented) {
            console.log('[SnippetManager] [OK] Manejado por beforeinput');
            return true;
        }

        // 2. Try ClipboardEvent (paste)
        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true,
            composed: true,
        });
        const pasteHandled = target.dispatchEvent(pasteEvent);
        if (!pasteHandled || pasteEvent.defaultPrevented) {
            console.log('[SnippetManager] [OK] Manejado por paste event');
            return true;
        }

        // 3. Fallback: try execCommand paste (might work in some editors)
        console.log('[SnippetManager] [WARN] Usando fallback execCommand');

        // Try insertHTML first if there is HTML
        if (html && this._isHTML(html)) {
            const success = document.execCommand('insertHTML', false, html);
            if (success) {
                console.log('[SnippetManager] [OK] Insertado con insertHTML');
                return true;
            }
        }

        // Last resort: plain text
        document.execCommand('insertText', false, text);
        console.log('[SnippetManager] [WARN] Insertado como texto plano');
        return true;
    }

    /**
     * Inserts HTML using insertHTML (fallback when clipboard fails)
     */
    _insertHTMLDirect(range, selection, html, element) {
        try {
            const finalHTML = html + '&nbsp;';
            if (!document.execCommand('insertHTML', false, finalHTML)) {
                // Fallback manual
                range.deleteContents();
                const fragment = range.createContextualFragment(finalHTML);
                range.insertNode(fragment);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                element.dispatchEvent(
                    new Event('input', {
                        bubbles: true,
                    }),
                );
            }
            return true;
        } catch (error) {
            console.error('Error insertando HTML:', error);
            return false;
        }
    }

    /**
     * Inserts plain text
     */
    _insertPlainText(range, selection, text, element) {
        try {
            const finalText = text + ' ';
            if (!document.execCommand('insertText', false, finalText)) {
                // Fallback manual
                range.deleteContents();
                range.insertNode(document.createTextNode(finalText));
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                element.dispatchEvent(
                    new Event('input', {
                        bubbles: true,
                    }),
                );
            }
            return true;
        } catch (error) {
            console.error('Error insertando texto:', error);
            return false;
        }
    }

    /**
     * Looks for snippet that matches text before the cursor
     */
    _getMatchedSnippet(textBeforeCursor) {
        // Only expand if it ends with space
        const endsWithSpace = /\s$/.test(textBeforeCursor);
        if (!endsWithSpace) return null;

        // Get last word before the space
        const words = textBeforeCursor.trimEnd().split(/\s/);
        const rawToken = words[words.length - 1];
        if (!rawToken) return null;

        // NEW: Support for forcing plain text with '#' suffix
        let forcePlainText = false;
        let potentialTriggerToken = rawToken;
        if (rawToken.endsWith('#') && rawToken.length > 1) {
            forcePlainText = true;
            potentialTriggerToken = rawToken.slice(0, -1);
        }

        // 1. Direct match (simple snippet or one with format without dynamic vars)
        if (this.snippets[potentialTriggerToken]) {
            const snippet = this.snippets[potentialTriggerToken];
            const isSimple = typeof snippet === 'string';
            let expansion = isSimple ? snippet : snippet.expansion || '';

            // If plain text is forced, clean HTML
            if (forcePlainText && expansion) {
                expansion = HintCommon.stripHtml(expansion);
            }

            // If NO variables, expand directly (or with defaults)
            if (isSimple || !snippet.variables || snippet.variables.length === 0) {
                return {
                    expansion: expansion,
                    matchLength: rawToken.length + 1,
                    trigger: rawToken,
                };
            }

            // If it HAS variables but is a direct match (no params in the trigger), expand with defaults
            let expandedText = expansion;
            snippet.variables.forEach((v) => {
                const targetWord = v.word;
                const replacement = v.defaultValue || targetWord;
                if (targetWord) {
                    expandedText = expandedText.split(targetWord).join(replacement);
                }
            });
            return {
                expansion: expandedText,
                matchLength: rawToken.length + 1,
                trigger: rawToken,
            };
        }

        // 2. Match with variables (e.g. trigger$1Value)
        for (const [key, snippet] of Object.entries(this.snippets)) {
            if (typeof snippet === 'object' && snippet.variables && snippet.variables.length > 0) {
                if (potentialTriggerToken.startsWith(key)) {
                    const paramsPart = potentialTriggerToken.substring(key.length);
                    let tempVars = {};
                    const sortedVars = [...snippet.variables].sort((a, b) => b.id.length - a.id.length);
                    let remaining = paramsPart;
                    const foundMarkers = [];
                    for (const v of sortedVars) {
                        let idx = remaining.indexOf(v.id);
                        while (idx !== -1) {
                            foundMarkers.push({
                                id: v.id,
                                index: idx,
                            });
                            idx = remaining.indexOf(v.id, idx + 1);
                        }
                    }
                    foundMarkers.sort((a, b) => a.index - b.index);
                    for (let i = 0; i < foundMarkers.length; i++) {
                        const marker = foundMarkers[i];
                        const nextMarker = foundMarkers[i + 1];
                        const start = marker.index + marker.id.length;
                        const end = nextMarker ? nextMarker.index : remaining.length;
                        // Replace __ with spaces in captured value
                        const val = remaining.substring(start, end).replace(/__/g, ' ');
                        tempVars[marker.id] = val;
                    }
                    for (const v of sortedVars) {
                        if (!tempVars[v.id]) tempVars[v.id] = v.defaultValue || '';
                    }
                    let expandedText = snippet.expansion;
                    for (const v of sortedVars) {
                        const targetWord = v.word;
                        const replacement = tempVars[v.id] || targetWord;
                        if (targetWord) {
                            expandedText = expandedText.split(targetWord).join(replacement);
                        }
                    }

                    // If plain text is forced, clean HTML
                    if (forcePlainText && expandedText) {
                        expandedText = HintCommon.stripHtml(expandedText);
                    }
                    return {
                        expansion: expandedText,
                        matchLength: rawToken.length + 1,
                        trigger: rawToken,
                    };
                }
            }
        }
        return null;
    }

    /**
     * Handles input in INPUT/TEXTAREA fields
     */
    /**
     * Handles input in INPUT/TEXTAREA fields
     */
    async _handleInputField(el, textBeforeCursor, match) {
        const value = el.value || '';
        const selectionStart = el.selectionStart || 0;

        // Always use plain text in INPUT/TEXTAREA
        const plainExpansion = this._cleanExpansionText(match.expansion, false);

        // ALWAYS add space at the end
        const finalExpansion = plainExpansion + ' ';
        const startDelete = selectionStart - match.matchLength;
        const newValue = value.substring(0, startDelete) + finalExpansion + value.substring(selectionStart);
        Utils.setReactValue(el, newValue);

        // Position cursor AT THE END (after the space)
        const newPos = startDelete + finalExpansion.length;
        el.setSelectionRange(newPos, newPos);
        console.log(`[SnippetManager] [OK] Expanded in INPUT/TEXTAREA: "${match.trigger}" -> texto plano`);
    }

    /**
     * Handles input in contentEditable elements (IMPROVED FOR GOOGLE DOCS)
     */
    /**
     * Handles input in contentEditable elements
     */
    async _handleContentEditable(el, match, spacePrevented) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        try {
            const hasHTML = this._isHTML(match.expansion);
            const editorType = this._detectEditorType(el);
            console.log('[Snippet] ContentEditable Exp:', {
                trigger: match.trigger,
                editorType,
            });

            // Prepare content (including space if not office-online)
            const plainTextContent = this._cleanExpansionText(match.expansion, false);
            let plainText = plainTextContent;
            if (editorType !== 'office-online') {
                plainText += ' ';
            }
            let htmlText = null;
            if (hasHTML) {
                htmlText = this._cleanExpansionText(match.expansion, true);
                if (editorType !== 'office-online') {
                    htmlText += '&nbsp;';
                }
            }

            // ROBUST LOGIC (Same as _checkBlindMatch)

            // 1. WhatsApp / Proxy Editors
            if (this._isProxyEditor(el)) {
                console.log('[Snippet] [MOBILE] Proxy Editor (WhatsApp) via handler');
                const triggerLength = match.trigger.length + (spacePrevented ? 0 : 1);
                await this._simulateBackspace(el, triggerLength);
                document.execCommand('insertText', false, plainText);
                console.log('[Snippet] [OK] Proxy Editor completado');

                // 2. Telegram / ContentEditable Generic (select-and-replace)
            } else if (editorType === 'contenteditable') {
                const triggerLen = match.trigger.length + (spacePrevented ? 0 : 1);
                await this._selectAndReplace(el, triggerLen, plainText, htmlText, editorType);
                console.log('[Snippet] [OK] Select-and-Replace completado');

                // 3. Others (Google Docs, Office Online, Textarea, etc.)
            } else {
                // Delete trigger
                await this._deleteTrigger(el, match.trigger, spacePrevented);
                // Insert content
                await this._insertViaDataTransfer(el, plainText, htmlText);

                // Re-insert space if it was prevented (if we haven't already added it to the plainText)
                // Note: _checkBlindMatch NO does this if it already added the space to plainText.
                // But _handleContentEditable had it. We will keep it only if necessary.
            }
            console.log('[Snippet] [OK] Expansion completed');
        } catch (err) {
            console.error('[Snippet] Error en _handleContentEditable:', err);
        }
    }

    /**
     * Handles input events
     */
    async _handleInput(el, event) {
        // DISABLED: _checkBlindMatch (keyBuffer) now handles ALL sites
        // _handleInput no longer does snippet expansion to avoid double expansion.
        // Detection and expansion is done exclusively via keyBuffer + _checkBlindMatch.
        return;
    }

    /**
     * Gets text before the cursor
     */
    _getTextBeforeCursor(el) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            const selectionStart = el.selectionStart || 0;
            return (el.value || '').substring(0, selectionStart);
        } else if (el.isContentEditable) {
            const selection = window.getSelection();
            if (!selection.rangeCount) return '';
            const range = selection.getRangeAt(0);
            const node = range.endContainer;
            const offset = range.endOffset;
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent.substring(0, offset);
            }
        }
        return '';
    }

    /**
     * Increments usage count of a snippet
     */
    async _incrementSnippetUsage(trigger) {
        if (!trigger) return;
        try {
            const snippets = await HintCommon.Snippets.getAll();
            if (snippets[trigger]) {
                if (typeof snippets[trigger] === 'string') {
                    snippets[trigger] = {
                        expansion: snippets[trigger],
                        usageCount: 0,
                    };
                }
                if (!snippets[trigger].usageCount) snippets[trigger].usageCount = 0;
                snippets[trigger].usageCount++;
                await HintCommon.Snippets.saveAll(snippets);
            }
        } catch (e) {
            console.error('Error updating snippet usage:', e);
        }
    }

    /**
     * Gets caret coordinates in an input, textarea or contentEditable element.
     */
    static getCaretCoordinates(element, triggerText) {
        const doc = element.ownerDocument;
        const win = doc.defaultView;
        let coordinates = {
            top: 0,
            left: 0,
            height: 20,
        };

        // SPECIAL CASE: Google Docs (Canvas Editor)
        if (win.location.hostname.includes('docs.google.com')) {
            const docsCursor = doc.querySelector('.kix-cursor-caret');
            if (docsCursor) {
                const rect = docsCursor.getBoundingClientRect();
                return {
                    top: rect.bottom + win.scrollY,
                    left: rect.left + win.scrollX,
                };
            }
        }
        if (element.isContentEditable) {
            const selection = win.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                // If rect is 0 (e.g. new empty line), try to get it another way
                if (rect.width === 0 && rect.height === 0) {
                    const span = doc.createElement('span');
                    span.appendChild(doc.createTextNode('\u200b')); // Zero-width space
                    range.insertNode(span);
                    const spanRect = span.getBoundingClientRect();
                    coordinates = {
                        top: spanRect.bottom,
                        left: spanRect.left,
                        height: spanRect.height,
                    };
                    span.remove();
                } else {
                    coordinates = {
                        top: rect.bottom,
                        left: rect.left,
                        height: rect.height,
                    };
                }
            }
        } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            const div = doc.createElement('div');
            const style = win.getComputedStyle(element);
            const properties = [
                'direction',
                'boxSizing',
                'width',
                'height',
                'overflowX',
                'overflowY',
                'borderTopWidth',
                'borderRightWidth',
                'borderBottomWidth',
                'borderLeftWidth',
                'borderStyle',
                'paddingTop',
                'paddingRight',
                'paddingBottom',
                'paddingLeft',
                'fontStyle',
                'fontVariant',
                'fontWeight',
                'fontStretch',
                'fontSize',
                'fontSizeAdjust',
                'lineHeight',
                'fontFamily',
                'textAlign',
                'textTransform',
                'textIndent',
                'textDecoration',
                'letterSpacing',
                'wordSpacing',
                'tabSize',
                'mozTabSize',
            ];
            properties.forEach((prop) => {
                div.style[prop] = style[prop];
            });
            div.style.position = 'absolute';
            div.style.top = '0px';
            div.style.left = '0px';
            div.style.visibility = 'hidden';
            div.style.whiteSpace = 'pre-wrap';
            div.style.wordWrap = 'break-word';
            div.style.overflow = 'hidden';

            // Copy text up to the cursor
            const value = element.value;
            const selectionEnd = element.selectionEnd;
            // Substitute the trigger with a span to locate it, or simply measure to the end
            // But we want "below $$". The $$ is just before the cursor.
            const textBeforeIcon = value.substring(0, selectionEnd);
            div.textContent = textBeforeIcon;
            const span = doc.createElement('span');
            span.textContent = '|'; // Caret fake
            div.appendChild(span);
            doc.body.appendChild(div);
            const elementRect = element.getBoundingClientRect();

            // Adjust coordinates relative to the element
            // Note: This is simplified, inputs with horizontal/vertical scroll need adjustment
            const scrollTop = element.scrollTop;
            const scrollLeft = element.scrollLeft;
            coordinates = {
                top: elementRect.top + span.offsetTop - scrollTop + parseFloat(style.fontSize) * 1.5,
                // approx height
                left: elementRect.left + span.offsetLeft - scrollLeft,
                height: parseFloat(style.lineHeight) || parseFloat(style.fontSize),
            };
            doc.body.removeChild(div);
        }
        return {
            top: coordinates.top + win.scrollY,
            left: coordinates.left + win.scrollX,
        };
    }

    /**
     * Shows the snippet popup for most used snippets ($$)
     */
    async _showSnippetPopup() {
        if (this.popupActive) return;

        // 1. Get Theme and Snippets
        this.targetElement = document.activeElement;
        this.savedSelection = null;
        if (this.targetElement) {
            if (this.targetElement.tagName === 'INPUT' || this.targetElement.tagName === 'TEXTAREA') {
                this.savedSelection = {
                    start: this.targetElement.selectionStart,
                    end: this.targetElement.selectionEnd,
                };
            } else if (this.targetElement.isContentEditable) {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    this.savedSelection = sel.getRangeAt(0).cloneRange();
                }
            } else {
                // FIX Google Docs: GDocs uses a special editor where the activeElement
                // might NOT be isContentEditable but there is a valid selection.
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    this.savedSelection = sel.getRangeAt(0).cloneRange();
                }
            }
        }
        const snippetsMap = await HintCommon.Snippets.getAll();

        // 2. Prepare Data (All snippets, ordered by usage)
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

        // 3. Create DOM elements
        const popup = document.createElement('div');
        popup.className = 'hint-snippet-popup';

        // FIX Google Docs: Prevent any mousedown inside the popup
        // from stealing focus from the editor. Without this fix, Google Docs loses the cursor
        // when clicking on the popup items.
        popup.addEventListener('mousedown', (e) => {
            // Only prevent if the click is NOT in the search input,
            // as that one needs to receive focus to be able to write.
            if (!e.target.classList.contains('hint-snippet-search-input')) {
                e.preventDefault();
            }
        });

        // Search Bar
        const searchContainer = document.createElement('div');
        searchContainer.className = 'hint-snippet-search-container';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = chrome.i18n.getMessage('searchSnippets') || 'Search snippets...';
        searchInput.className = 'hint-snippet-search-input';
        searchContainer.appendChild(searchInput);
        popup.appendChild(searchContainer);

        // List Container
        const list = document.createElement('ul');
        list.className = 'hint-snippet-list';
        popup.appendChild(list);
        this.popupElement = popup;
        this.popupList = list;
        this.searchInput = searchInput;

        // Render initial list
        this._renderPopupList();

        // Inject into Shadow DOM
        this.shadowUI.getContainer().appendChild(popup);

        // 4. Position popup (Caret aware)
        const coords = SnippetManager.getCaretCoordinates(this.targetElement, '$$');

        // Adjustments to keep it in viewport
        let left = coords.left;
        let top = coords.top + 8;
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        if (left + 320 > winWidth + scrollX) {
            left = winWidth + scrollX - 330;
        }
        if (top + 250 > winHeight + scrollY) {
            top = coords.top - 260 - 20;
        }
        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;

        // Animation and Focus
        requestAnimationFrame(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'translateY(0)';
            searchInput.focus();
        });

        // 5. Search Bar Events
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase();
            this.filteredSnippets = this.parsedSnippets.filter(
                (s) => s.trigger.toLowerCase().includes(query) || s.expansion.toLowerCase().includes(query),
            );
            this.popupSelectedIndex = 0;
            this._renderPopupList();
        });
        searchInput.addEventListener('keydown', (e) => {
            if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                this._handlePopupNavigation(e);
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
            empty.className = 'hint-snippet-empty';
            empty.textContent = chrome.i18n.getMessage('omnibarNoMatchingSnippets') || 'No matching snippets';
            this.popupList.appendChild(empty);
            return;
        }
        this.filteredSnippets.forEach((s, idx) => {
            const isSelected = idx === this.popupSelectedIndex;
            const item = document.createElement('li');
            item.className = 'hint-snippet-item';
            if (isSelected) item.classList.add('selected');

            // Trigger
            const trigSpan = document.createElement('span');
            trigSpan.textContent = s.trigger;
            trigSpan.className = 'hint-snippet-item-trigger';

            // Preview
            const prevSpan = document.createElement('span');
            prevSpan.textContent = this._cleanExpansionText(s.expansion, false).substring(0, 40);
            prevSpan.className = 'hint-snippet-item-preview';
            item.appendChild(trigSpan);
            item.appendChild(prevSpan);

            // FIX Google Docs: On click, simulate an Enter in the exact place
            // where the user would physically press it.
            //
            // In GDocs the keydown listener is registered in the contentDocument
            // of the "docs-texteventtarget-iframe" (see _setupGDocsMonitor).
            // When the user presses Enter physically, the event originates there.
            // To reproduce it from a click, we must also dispatch the event there.
            //
            // In other sites, the listener is on document (capture), so
            // we dispatch the Enter on targetElement so it bubbles up to it.
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Avoid focus loss
                e.stopPropagation(); // Avoid global listener closing the popup

                this.popupSelectedIndex = idx;
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                });

                // GDocs case: dispatch in the contentDocument of the iframe
                const gdocsIframe = document.querySelector('iframe.docs-texteventtarget-iframe');
                if (gdocsIframe) {
                    try {
                        const iframeDoc = gdocsIframe.contentDocument || gdocsIframe.contentWindow.document;
                        // Re-focus the iframe (it might have been lost due to mousedown)
                        gdocsIframe.contentWindow.focus();
                        // Fire Enter in the iframe: activates the _setupGDocsMonitor listener
                        iframeDoc.dispatchEvent(enterEvent);
                        return;
                    } catch (err) {
                        console.warn('[Snippet] Could not access GDocs iframe:', err);
                    }
                }

                // Other sites: dispatch on target -> bubbles up to document listener
                const target = this.targetElement || document.activeElement;
                if (target) {
                    target.dispatchEvent(enterEvent);
                } else {
                    this._insertSnippetFromPopup(s);
                }
            });
            item.addEventListener('mouseenter', () => {
                if (this.popupSelectedIndex !== idx) {
                    this.popupSelectedIndex = idx;
                    this._renderPopupList();
                }
            });
            this.popupList.appendChild(item);
        });

        // Auto-scroll selection into view
        const selectedEl = this.popupList.children[this.popupSelectedIndex];
        if (selectedEl) {
            selectedEl.scrollIntoView({
                block: 'nearest',
            });
        }
    }
    _handlePopupNavigation(e) {
        if (!this.popupActive) return;
        if (e.key === 'Escape') {
            this._closePopup();
            return;
        }
        if (e.key === 'Enter') {
            const selected = this.filteredSnippets[this.popupSelectedIndex];
            if (selected) this._insertSnippetFromPopup(selected);
            return;
        }

        // Tab navigation
        if (e.key === 'Tab') {
            if (e.shiftKey) {
                // Shift+Tab -> Up
                this.popupSelectedIndex =
                    (this.popupSelectedIndex - 1 + this.filteredSnippets.length) % this.filteredSnippets.length;
            } else {
                // Tab -> Down
                this.popupSelectedIndex = (this.popupSelectedIndex + 1) % this.filteredSnippets.length;
            }
            this._renderPopupList();
            return;
        }
        if (e.key === 'ArrowDown') {
            this.popupSelectedIndex = (this.popupSelectedIndex + 1) % this.filteredSnippets.length;
            this._renderPopupList();
            return;
        }
        if (e.key === 'ArrowUp') {
            this.popupSelectedIndex =
                (this.popupSelectedIndex - 1 + this.filteredSnippets.length) % this.filteredSnippets.length;
            this._renderPopupList();
            return;
        }
    }
    async _insertSnippetFromPopup(snippet) {
        this._closePopup();
        this._incrementSnippetUsage(snippet.trigger);

        // Recover the target element
        let activeEl = this.targetElement || document.activeElement;

        // Restore Focus and Selection IMMEDIATELY (without visible gap)
        if (activeEl) {
            if (typeof activeEl.focus === 'function') activeEl.focus();

            // Restore selection IMMEDIATELY after focus, before any delay,
            // so the cursor is never visible at position 0 (start of field).
            if (this.savedSelection) {
                if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
                    activeEl.setSelectionRange(this.savedSelection.start, this.savedSelection.end);
                } else {
                    // For GDocs and contenteditable: restore whenever we have a Range
                    // (GDocs might not be isContentEditable but uses window.getSelection)
                    try {
                        const sel = window.getSelection();
                        if (sel && this.savedSelection instanceof Range) {
                            sel.removeAllRanges();
                            sel.addRange(this.savedSelection);
                        }
                    } catch {}
                }
            }

            // Pause for complex editors (Keep/WhatsApp/GDocs)
            // to process focus and restored selection.
            await new Promise((r) => setTimeout(r, 100));
        }
        this.targetElement = null;
        this.savedSelection = null;
        if (!activeEl) return;

        // Build fictional match object
        const match = {
            expansion: snippet.expansion,
            // matchLength: 1
            // Explanation: When triggering with $$, the second $ is prevented,
            // but the FIRST $ is already in the input. We want to replace it.
            matchLength: 1,
            // The real trigger in the DOM is '$', regardless of the snippet's trigger.
            trigger: '$',
        };

        // Resolve variables with defaults if they exist
        let expandedText = snippet.expansion;
        if (snippet.variables && snippet.variables.length > 0) {
            const tempVars = {};
            snippet.variables.forEach((v) => {
                tempVars[v.id] = v.defaultValue || '';
            });
            snippet.variables.forEach((v) => {
                const targetWord = v.word;
                const replacement = tempVars[v.id] || targetWord;
                if (targetWord) {
                    expandedText = expandedText.split(targetWord).join(replacement);
                }
            });
            match.expansion = expandedText;
        }
        if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
            await this._handleInputField(activeEl, '', match);
        } else if (activeEl.isContentEditable || this._detectEditorType(activeEl) === 'google-docs') {
            // For content editable or Google Docs - USE THE ROBUST HANDLER
            // The trigger was '$', and the space was 'prevented' (not really applicable here,
            // but we pass true so length is exactly 1)
            match.trigger = '$';
            await this._handleContentEditable(activeEl, match, true);
        }
    }
};
/**
 * @class ShadowUI
 * @description Handles creation and injection of Shadow DOM and its styles.
 */
