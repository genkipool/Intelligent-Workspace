var HintCommon = {
    // Storage Keys constants to ensure consistency
    STORAGE_KEYS: {
        COMMANDS: 'userHintCommands',
        SNIPPETS: 'itg-user-snippets',
        CUSTOM_SHORTCUTS: 'itg-ui-custom-shortcuts',
        PINNED_SECTIONS: 'itg-pinned-sections',
        LINK_PREVIEW_BLACKLIST: 'linkPreviewBlacklist',
        LINK_PREVIEW_TRIGGER_KEY: 'linkPreviewTriggerKey',
    },

    // The Single Source of Truth for Built-in Commands
    BUILT_IN_COMMANDS: {
        categoryNavigation: {
            j: 'hintDesc_j',
            k: 'hintDesc_k',
            h: 'hintDesc_h_tab',
            l: 'hintDesc_l_tab',
            d: 'hintDesc_d',
            u: 'hintDesc_u',
        },
        categoryPage: {
            r: 'hintDesc_r',
            R: 'hintDesc_R',
            H: 'hintDesc_h_tab_page',
            L: 'hintDesc_l_tab_page',
            at: 'hintDesc_at',
            c: 'hintDesc_c',
            vs: 'hintDesc_vs',
            vp: 'hintDesc_vp',
            bg: 'hintDesc_bg',
            br: 'hintDesc_br',
            cr: 'hintDesc_ar',
            ae: 'hintDesc_ae',
            cs: 'hintDesc_cs',
            ca: 'hintDesc_ca',
            wp: 'hintDesc_wp',
            wv: 'hintDesc_wv',
            we: 'hintDesc_we',
            as: 'hintDesc_as',
            ah: 'hintDesc_ah',
        },
        categoryTabs: {
            t: 'hintDesc_t',
            x: 'hintDesc_x',
            yt: 'hintDesc_yt',
            s: 'hintDesc_s',
            i: 'hintDesc_i',
            pp: 'hintDesc_pp',
            o: 'hintDesc_o',
            dg: 'hintDesc_dg',
            so: 'hintDesc_so',
            st: 'hintDesc_st',
            pt: 'hintDesc_pt',
            pl: 'hintDesc_pl',
            pa: 'hintDesc_pa',
            pg: 'hintDesc_pg',
            pn: 'hintDesc_pn',
        },
        categoryHints: {
            f: 'hintDesc_f',
            cf: 'hintDesc_cf',
        },
        categoryShortcuts: {
            gy: 'hintDesc_gy',
            gm: 'hintDesc_gm',
            gp: 'hintDesc_gp',
            gx: 'hintDesc_gx',
            gi: 'hintDesc_gi',
            gu: 'hintDesc_gu',
            gc: 'hintDesc_gc',
            gg: 'hintDesc_gg',
        },
        categoryModes: {
            mb: 'hintDesc_mb',
            mB: 'hintDesc_mB',
            ms: 'hintDesc_ms',
            mS: 'hintDesc_mS',
            mp: 'hintDesc_mp',
            mP: 'hintDesc_mP',
            ml: 'hintDesc_ml',
            mL: 'hintDesc_mL',
            me: 'hintDesc_me',
            mE: 'hintDesc_mE',
        },
        categoryOmnibarPrefixes: {
            '@': 'prefixSelector',
            'f:': 'prefixSearchText',
            'b:': 'prefixSearchBookmarks',
            'h:': 'prefixSearchHistory',
            'c:': 'prefixSearchRecentlyClosed',
            'g:': 'prefixSearchGoogle',
            'y:': 'prefixSearchYouTube',
            'd:': 'prefixSearchDuckDuckGo',
            'w:': 'prefixSearchWikipedia',
            'we:': 'omnibarPrefixPopupDesc',
            'wp:': 'omnibarPrefixPipDesc',
            'bgr:': 'omnibarPrefixBackupDesc',
            'bg:': 'omnibarPrefixBackupNowDesc',
            'dg:': 'prefixDeleteGroup',
            'dt:': 'prefixDeleteTab',
            'gm:': 'prefixSearchGoogleMaps',
            'x:': 'prefixSearchX',
            'am:': 'prefixSearchAmazon',
            'ams:': 'prefixSearchAmazonES',
            'qai:': 'prefixQueryAI',
            'qaia:': 'prefixQueryAIAgent',
            'laiq:': 'prefixListQueries',
            'lai:': 'prefixListConversations',
            'limg:': 'prefixListImages',
            'lnt:': 'prefixListNotes',
            'atcr:': 'omnibarPrefixAddToExistingRule',
            'atr:': 'omnibarPrefixAddToRule',
            'rl:': 'omnibarPrefixRulesSearch',
            'cr:': 'omnibarPrefixRulesCreate',
            'dr:': 'omnibarPrefixRulesDelete',
            'er:': 'omnibarPrefixRulesEdit',
            'ccr:': 'omnibarPrefixChangeRuleColor',
            'ccg:': 'omnibarPrefixChangeGroupColor',
            'st:': 'omnibarPrefixTutorial',
        },
    },

    // Character limits for each command category
    LIMITS: {
        navigation: 1,
        page: 2,
        hints: 2,
        tabs: 2,
        modes: 2,
        shortcuts: 2,
        omnibar: 4,
        'custom-site': 4,
        snippet: 5,
        default: 5,
    },

    getCategoryLimit(category) {
        return this.LIMITS[category] || this.LIMITS.default;
    },

    preventInputSpace(event) {
        if (event.key === ' ') {
            event.preventDefault();
            return true;
        }
        return false;
    },

    /**
     * Checks if a key sequence is already in use.
     * @param {string} key - The key sequence to check.
     * @param {string} type - 'mapping', 'snippet', or 'omnibar'.
     * @param {string} excludingKey - Key to exclude from check (for editing).
     * @param {object} context - Optional data { checkMapping, customCommands, snippets }. If null, fetches from storage (async usage recommended via wrapper).
     */
    isKeyInUse(key, type, excludingKey, context) {
        if (!key) return false;
        const k = key.trim();

        if (type === 'mapping') {
            // 1. Check passed mapping function (usually checks defaults + overrides)
            if (context && context.checkMapping && typeof context.checkMapping === 'function') {
                if (context.checkMapping(k, excludingKey)) return true;
            }
            // 2. Check Custom Commands Array
            if (context && context.customCommands) {
                const isTaken = context.customCommands.some((cmd) => cmd.keys === k && cmd.keys !== excludingKey);
                if (isTaken) return true;
            }
        } else if (type === 'snippet') {
            if (context && context.snippets) {
                return Object.keys(context.snippets).some((trig) => trig === k && trig !== excludingKey);
            }
        }
        return false;
    },

    /**
     * Strips HTML tags from a string
     */
    stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    },

    /**
     * Shared logic for Site Shortcuts (Custom Commands)
     */
    Commands: {
        async getAll() {
            const data = await chrome.storage.sync.get(HintCommon.STORAGE_KEYS.COMMANDS);
            return data[HintCommon.STORAGE_KEYS.COMMANDS] || [];
        },

        async add(key, url, description) {
            const keys = key.trim().toLowerCase();
            const currentCmds = await this.getAll();

            // Check duplicates
            if (currentCmds.some((c) => c.keys === keys)) {
                throw new Error('Key already in use');
            }

            currentCmds.push({ keys, url: url.trim(), description: description.trim() });
            await chrome.storage.sync.set({ [HintCommon.STORAGE_KEYS.COMMANDS]: currentCmds });
            chrome.runtime.sendMessage({ action: 'hintCommandsUpdated' });
            return currentCmds;
        },

        async remove(key) {
            const currentCmds = await this.getAll();
            const filtered = currentCmds.filter((c) => c.keys !== key);
            await chrome.storage.sync.set({ [HintCommon.STORAGE_KEYS.COMMANDS]: filtered });
            chrome.runtime.sendMessage({ action: 'hintCommandsUpdated' });
            return filtered;
        },

        // Updates the whole list (for bulk edits/reordering)
        async saveAll(commands) {
            await chrome.storage.sync.set({ [HintCommon.STORAGE_KEYS.COMMANDS]: commands });
            chrome.runtime.sendMessage({ action: 'hintCommandsUpdated' });
        },
    },

    /**
     * Shared logic for Snippets
     */
    Snippets: {
        async getAll() {
            const data = await chrome.storage.sync.get(HintCommon.STORAGE_KEYS.SNIPPETS);
            return data[HintCommon.STORAGE_KEYS.SNIPPETS] || {};
        },

        async add(trigger, expansion, variables = []) {
            const trig = trigger.trim();
            if (!trig || !expansion) throw new Error('Missing fields');

            // Note: We don't strictly check for duplicates on add because 'add' acts as 'upsert' for snippets usually
            const currentSnippets = await this.getAll();

            if (variables && variables.length > 0) {
                currentSnippets[trig] = { expansion, variables };
            } else {
                currentSnippets[trig] = expansion;
            }

            await chrome.storage.sync.set({ [HintCommon.STORAGE_KEYS.SNIPPETS]: currentSnippets });
            chrome.runtime.sendMessage({ action: 'snippetsUpdated' });
            return currentSnippets;
        },

        async remove(trigger) {
            const currentSnippets = await this.getAll();
            if (currentSnippets[trigger]) {
                delete currentSnippets[trigger];
                await chrome.storage.sync.set({ [HintCommon.STORAGE_KEYS.SNIPPETS]: currentSnippets });
                chrome.runtime.sendMessage({ action: 'snippetsUpdated' });
            }
            return currentSnippets;
        },

        async rename(oldTrigger, newTrigger, expansion, variables = []) {
            const oldTrig = oldTrigger.trim();
            const newTrig = newTrigger.trim();
            if (!oldTrig || !newTrig || !expansion) throw new Error('Missing fields');

            const currentSnippets = await this.getAll();
            if (currentSnippets[oldTrig]) {
                delete currentSnippets[oldTrig];
            }

            if (variables && variables.length > 0) {
                currentSnippets[newTrig] = { expansion, variables };
            } else {
                currentSnippets[newTrig] = expansion;
            }

            await chrome.storage.sync.set({ [HintCommon.STORAGE_KEYS.SNIPPETS]: currentSnippets });
            chrome.runtime.sendMessage({ action: 'snippetsUpdated' });
            return currentSnippets;
        },

        async saveAll(snippets) {
            await chrome.storage.sync.set({ [HintCommon.STORAGE_KEYS.SNIPPETS]: snippets });
            chrome.runtime.sendMessage({ action: 'snippetsUpdated' });
        },
    },

    DOM: {
        /**
         * Safely creates a DOM element.
         * @param {string} tag - HTML tag (div, span, etc).
         * @param {object} attrs - Attributes (className, id, dataset, etc).
         * @param {string|Node} content - Plain text or child node. NOT interpreted as HTML.
         * @returns {HTMLElement}
         */
        create(tag, attrs = {}, content = null) {
            const el = document.createElement(tag);

            // Apply attributes
            for (const [key, val] of Object.entries(attrs)) {
                if (key === 'dataset' && typeof val === 'object') {
                    for (const [dsKey, dsVal] of Object.entries(val)) {
                        el.dataset[dsKey] = dsVal;
                    }
                } else if (key === 'className') {
                    el.className = val;
                } else if (key.startsWith('on') && typeof val === 'function') {
                    el.addEventListener(key.substring(2).toLowerCase(), val);
                } else {
                    el.setAttribute(key, val);
                }
            }

            // Apply content (textContent avoids XSS)
            if (content !== null && content !== undefined) {
                if (content instanceof Node) {
                    el.appendChild(content);
                } else if (Array.isArray(content)) {
                    content.forEach((child) => {
                        if (child)
                            el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
                    });
                } else {
                    el.textContent = String(content);
                }
            }
            return el;
        },

        /**
         * Escapes dangerous characters for when it is strictly necessary to use innerHTML.
         */
        escape(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        },
    },

    // --- Validation Helpers ---

    generateSnippetUsageText(trigger, variables = []) {
        let text = trigger;
        if (Array.isArray(variables)) {
            variables.forEach((v) => {
                text += `${v.id}${v.defaultValue || ''}`;
            });
        }
        return text;
    },

    validateSnippetVar(word, expansion) {
        if (!word || !expansion) return false;
        return expansion.includes(word);
    },

    validateSnippetVariableRow(id, word, def, expansion) {
        const errors = { id: null, word: null, def: null };
        let isValid = true;

        // Validate ID
        if (!id || !id.trim()) {
            errors.id = 'errorFieldRequired';
            isValid = false;
        }

        // Validate Word
        if (!word || !word.trim()) {
            errors.word = 'errorFieldRequired';
            isValid = false;
        } else if (expansion && !expansion.includes(word.trim())) {
            errors.word = 'errorVarWordNotFound'; // Specific key
            isValid = false;
        }

        // Validate Default Value
        if (!def || !def.trim()) {
            errors.def = 'errorFieldRequired';
            isValid = false;
        }

        return { isValid, errors };
    },

    /**
     * Rich Text Formatter - Modal for formatting text in snippet expansions and descriptions
     */
    RichTextFormatter: {
        modal: null,
        targetElement: null,
        previewArea: null,

        /**
         * Creates the format button SVG icon
         */
        createFormatButton() {
            const btn = document.createElement('button');
            btn.className = 'itg-format-btn';
            btn.type = 'button';
            btn.title = chrome.i18n.getMessage('formatText') || 'Text Formatting';
            btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 1024 1024" class="icon" xmlns="http://www.w3.org/2000/svg">
                    <path d="M840 192h-56v-72c0-13.3-10.7-24-24-24H168c-13.3 0-24 10.7-24 24v272c0 13.3 10.7 24 24 24h592c13.3 0 24-10.7 24-24V256h32v200H465c-22.1 0-40 17.9-40 40v136h-44c-4.4 0-8 3.6-8 8v228c0 .6.1 1.3.2 1.9-.1 2-.2 4.1-.2 6.1 0 46.4 37.6 84 84 84s84-37.6 84-84c0-2.1-.1-4.1-.2-6.1.1-.6.2-1.2.2-1.9V640c0-4.4-3.6-8-8-8h-44V520h351c22.1 0 40-17.9 40-40V232c0-22.1-17.9-40-40-40M720 352H208V160h512zM477 876c0 11-9 20-20 20s-20-9-20-20V696h40z" fill="currentColor"/>
                </svg>
            `;
            return btn;
        },

        /**
         * Returns the shared inner HTML string for the editor (toolbar + emoji + preview + apply).
         * Used by both modal and inline modes.
         */
        _editorInnerHTML(showApplyBtn = true, showCloseBtn = true) {
            return `
                    <div class="itg-format-modal-header">
                        <h2>Text Formatting</h2>
                        ${showCloseBtn ? '<button class="itg-format-close-btn" type="button">&times;</button>' : ''}
                    </div>
                    
                    <div class="itg-format-toolbar">
                        <!-- Row 1: Basic styles, Font Size, Text Color, BG Color, Link -->
                        <div class="itg-format-toolbar-row">
                            <button type="button" data-command="bold" title="Bold (Ctrl+B)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
                            </button>
                            <button type="button" data-command="italic" title="Italic (Ctrl+I)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
                            </button>
                            <button type="button" data-command="underline" title="Underline (Ctrl+U)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
                            </button>
                            <button type="button" data-command="strikeThrough" title="Strikethrough">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 5V4H6v1m6-1v16m-2 0h4M4 12h16"></path>
                                </svg>
                            </button>
                            <button type="button" class="itg-format-trigger-fontSize" title="Font size">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z"/></svg>
                            </button>
                            <button type="button" class="itg-format-trigger-foreColor" title="Text color">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2zm-1.38 9L12 5.67 14.38 12H9.62z"></path><rect class="itg-color-indicator" x="0" y="20" width="24" height="4" fill="#9fc5e8"></rect></svg>
                            </button>
                            <button type="button" class="itg-format-trigger-backColor" title="Background color">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.59-.59 1.54 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z"/><rect class="itg-color-indicator" x="0" y="20" width="24" height="4" fill="#ffff00"/></svg>
                            </button>
                            <button type="button" data-command="createLink" title="Insert link">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                            </button>
                        </div>
                        <!-- Row 2: Alignments, Lists, Indent, Emoji -->
                        <div class="itg-format-toolbar-row">
                            <button type="button" data-command="justifyLeft" title="Align left">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 10h13M3 14h18M3 18h13M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="justifyCenter" title="Center">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 14h18m-4-4H7m10 8H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="justifyRight" title="Align right">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" transform="scale(-1 1)"><path d="M3 10h13M3 14h18M3 18h13M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="insertOrderedList" title="Numbered list">
                                <svg width="20" height="20" viewBox="0 0 56 56" fill="currentColor">
                                    <path d="M9.496 19.012c.914 0 1.524-.516 1.524-1.57v-7.57c0-.985-.704-1.618-1.711-1.618-.844 0-1.36.281-1.946.68l-1.64 1.148c-.493.328-.75.633-.75 1.125 0 .61.492 1.031 1.03 1.031.282 0 .446-.047.845-.328l1.078-.726h.023v6.257c0 1.055.633 1.57 1.547 1.57m8.133-2.836h32.086c1.078 0 1.898-.82 1.898-1.875 0-1.078-.82-1.899-1.898-1.899H17.629c-1.055 0-1.875.82-1.875 1.899 0 1.054.82 1.875 1.875 1.875M5.723 33.145h6.023c.656 0 1.125-.446 1.125-1.102 0-.703-.469-1.148-1.125-1.148H8.395v-.07l1.921-1.548c1.617-1.312 2.227-2.062 2.227-3.445 0-1.875-1.57-3.14-4.102-3.14-2.226 0-3.867 1.171-3.867 2.671 0 .75.492 1.149 1.29 1.149.538 0 .913-.164 1.218-.703.328-.563.773-.868 1.406-.868.703 0 1.172.446 1.172 1.102 0 .563-.281 1.055-1.476 2.016l-3.094 2.53c-.445.376-.633.798-.633 1.313 0 .727.492 1.242 1.266 1.242m11.906-2.79h32.086a1.876 1.876 0 0 0 1.898-1.898c0-1.055-.82-1.875-1.898-1.875H17.629c-1.055 0-1.875.82-1.875 1.875s.82 1.898 1.875 1.898M8.512 47.747c2.765 0 4.43-1.242 4.43-3.21 0-1.29-.915-2.18-2.532-2.321v-.07c1.195-.211 2.11-1.008 2.11-2.368 0-1.78-1.735-2.765-4.032-2.765-1.851 0-3.843.867-3.843 2.414 0 .656.468 1.125 1.195 1.125.515 0 .75-.211 1.078-.563.539-.586.984-.773 1.547-.773.726 0 1.265.351 1.265 1.054 0 .657-.539.985-1.5.985h-.28c-.657 0-1.079.328-1.079 1.008 0 .633.398 1.008 1.078 1.008h.305c1.055 0 1.617.351 1.617 1.078 0 .633-.586 1.101-1.36 1.101-.843 0-1.429-.468-1.874-.914-.282-.258-.516-.445-.938-.445-.773 0-1.312.445-1.312 1.172 0 1.617 2.203 2.484 4.125 2.484m9.117-3.234h32.086c1.078 0 1.898-.82 1.898-1.875 0-1.078-.82-1.899-1.898-1.899H17.629c-1.055 0-1.875.82-1.875 1.899 0 1.054.82 1.875 1.875 1.875"/>
                                </svg>
                            </button>
                            <button type="button" data-command="insertUnorderedList" title="Bullet list">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><path d="m8 6 13 .001m-13 6h13m-13 6h13M3.5 6h.01m-.01 6h.01m-.01 6h.01M4 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="indent" title="Increase indent">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>
                            </button>
                            <button type="button" data-command="outdent" title="Decrease indent">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M3 21h18v-2H3v2zM3 12l4 4V8l-4 4zm8 5h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/>
                                </svg>
                            </button>
                            <button type="button" class="itg-emoji-trigger" title="Insert emoji">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="itg-emoji-picker itg-display-none">
                        <div class="itg-emoji-grid"></div>
                    </div>
                    
                    <div class="itg-format-preview-container">
                        <label>Preview:</label>
                        <div class="itg-format-preview" contenteditable="true" spellcheck="false"></div>
                    </div>
                    
                    <div class="itg-format-modal-footer">
                        ${showApplyBtn ? '<button type="button" class="itg-format-apply-btn button">Apply</button>' : ''}
                    </div>
            `;
        },

        /**
         * Attaches all toolbar/picker/emoji listeners to an editor root element.
         * @param {Element} root - The container element with the editor DOM
         * @param {Function} getPreviewArea - Function returning the preview area element
         */
        _attachEditorListeners(root, getPreviewArea) {
            const previewArea = getPreviewArea();
            const emojiGrid = root.querySelector('.itg-emoji-grid');
            const emojiPicker = root.querySelector('.itg-emoji-picker');
            const emojiTrigger = root.querySelector('.itg-emoji-trigger');

            // --- Track selection continuously via selectionchange ---
            // This is the most reliable way to know the last valid selection
            // in previewArea, even after mousedown events that might clear it.
            if (previewArea) {
                const trackSelection = () => {
                    const rootNode = previewArea.getRootNode();
                    const sel = rootNode && rootNode.getSelection ? rootNode.getSelection() : window.getSelection();
                    if (!sel || sel.rangeCount === 0) return;
                    try {
                        const range = sel.getRangeAt(0);
                        const ancestor = range.commonAncestorContainer;
                        if (previewArea === ancestor || previewArea.contains(ancestor)) {
                            this.savedRange = range.cloneRange();
                        }
                    } catch {
                        /* ignore */
                    }
                };
                document.addEventListener('selectionchange', trackSelection);
                const rootNode = previewArea.getRootNode();
                if (rootNode && rootNode !== document) {
                    rootNode.addEventListener('selectionchange', trackSelection);
                }
                // Store ref so we can clean up if needed
                this._selectionTracker = trackSelection;
            }

            if (emojiTrigger) {
                emojiTrigger.addEventListener('mousedown', (e) => e.preventDefault());
                emojiTrigger.addEventListener('click', (e) => {
                    e.preventDefault();
                    emojiPicker.classList.toggle('itg-display-none');
                });
            }

            if (emojiGrid) {
                this.initEmojiPicker(emojiGrid);
            }

            root.querySelectorAll('.itg-format-toolbar button').forEach((btn) => {
                // Prevent mousedown from stealing focus/selection from previewArea
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                const command = btn.getAttribute('data-command');
                if (command) {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.applyFormat(command);
                    });
                }
            });

            const fontSizeBtn = root.querySelector('.itg-format-trigger-fontSize');
            if (fontSizeBtn) {
                fontSizeBtn.addEventListener('mousedown', (e) => e.preventDefault());
                fontSizeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showFontSizePopup(e.currentTarget);
                });
            }

            const foreColorBtn = root.querySelector('.itg-format-trigger-foreColor');
            if (foreColorBtn) {
                foreColorBtn.addEventListener('mousedown', (e) => e.preventDefault());
                foreColorBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showColorPickerPopup(e.currentTarget, 'foreColor');
                });
            }

            const backColorBtn = root.querySelector('.itg-format-trigger-backColor');
            if (backColorBtn) {
                backColorBtn.addEventListener('mousedown', (e) => e.preventDefault());
                backColorBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showColorPickerPopup(e.currentTarget, 'backColor');
                });
            }

            if (previewArea) {
                previewArea.addEventListener('keydown', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        if (e.key === 'b') {
                            e.preventDefault();
                            this.applyFormat('bold');
                        } else if (e.key === 'i') {
                            e.preventDefault();
                            this.applyFormat('italic');
                        } else if (e.key === 'u') {
                            e.preventDefault();
                            this.applyFormat('underline');
                        }
                    }
                });
            }
        },

        /**
         * Shows the formatting editor inline (collapsible section) inside a given container element.
         * @param {Element} inlineSection - The container element to embed the editor into
         * @param {Element} targetElement - The element whose content will be edited
         * @param {Function} onApply - Callback called with the formatted HTML when apply is clicked
         */
        showInline(inlineSection, targetElement, onApply) {
            // Build editor HTML inside inlineSection
            inlineSection.innerHTML = `<div class="itg-inline-editor-content">${this._editorInnerHTML(true, false)}</div>`;

            const editorContent = inlineSection.querySelector('.itg-inline-editor-content');
            this.previewArea = editorContent.querySelector('.itg-format-preview');
            this.targetElement = targetElement;

            this._attachEditorListeners(editorContent, () => this.previewArea);

            // Load current content
            const currentContent =
                targetElement.dataset.html || targetElement.innerHTML || targetElement.innerText || '';
            this.previewArea.innerHTML = currentContent;

            // Apply button
            const applyBtn = editorContent.querySelector('.itg-format-apply-btn');
            if (applyBtn) {
                applyBtn.addEventListener('click', () => {
                    const formattedContent = this.previewArea.innerHTML;
                    if (typeof onApply === 'function') {
                        onApply(formattedContent);
                    } else {
                        this.applyToTarget();
                    }
                });
            }

            // Focus preview
            setTimeout(() => {
                if (this.previewArea) {
                    this.previewArea.focus();
                    const range = document.createRange();
                    const rootNode = this.previewArea.getRootNode();
                    const sel = rootNode && rootNode.getSelection ? rootNode.getSelection() : window.getSelection();
                    if (this.previewArea.childNodes.length > 0) {
                        range.selectNodeContents(this.previewArea);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            }, 150);
        },

        /**
         * Creates the formatting modal
         */
        createFormattingModal() {
            const modal = document.createElement('div');
            modal.className = 'itg-format-modal';

            modal.innerHTML = `
                <div class="itg-format-modal-content">
                    ${this._editorInnerHTML(true, true)}
                </div>
            `;

            return modal;
        },

        /**
         * @private legacy - replaced by createFormattingModal using _editorInnerHTML
         */
        _createFormattingModalLegacy_UNUSED() {
            const modal = document.createElement('div');
            modal.className = 'itg-format-modal';

            modal.innerHTML = `
                <div class="itg-format-modal-content">
                    <div class="itg-format-modal-header">
                        <h2>Text Formatting</h2>
                        <button class="itg-format-close-btn" type="button">&times;</button>
                    </div>
                    
                    <div class="itg-format-toolbar">
                        <!-- Row 1: Basic styles, Font Size, Text Color, BG Color, Link -->
                        <div class="itg-format-toolbar-row">
                            <button type="button" data-command="bold" title="Bold (Ctrl+B)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
                            </button>
                            <button type="button" data-command="italic" title="Italic (Ctrl+I)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
                            </button>
                            <button type="button" data-command="underline" title="Underline (Ctrl+U)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
                            </button>
                            <button type="button" data-command="strikeThrough" title="Strikethrough">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 5V4H6v1m6-1v16m-2 0h4M4 12h16"></path>
                                </svg>
                            </button>
                            <button type="button" class="itg-format-trigger-fontSize" title="Font size">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z"/></svg>
                            </button>
                            <button type="button" class="itg-format-trigger-foreColor" title="Text color">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2zm-1.38 9L12 5.67 14.38 12H9.62z"></path><rect class="itg-color-indicator" x="0" y="20" width="24" height="4" fill="#9fc5e8"></rect></svg>
                            </button>
                            <button type="button" class="itg-format-trigger-backColor" title="Background color">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.59-.59 1.54 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z"/><rect class="itg-color-indicator" x="0" y="20" width="24" height="4" fill="#ffff00"/></svg>
                            </button>
                            <button type="button" data-command="createLink" title="Insert link">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                            </button>
                        </div>
                        
                        <!-- Row 2: Alignments, Lists, Indent, Emoji -->
                        <div class="itg-format-toolbar-row">
                            <button type="button" data-command="justifyLeft" title="Align left">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 10h13M3 14h18M3 18h13M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="justifyCenter" title="Center">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 14h18m-4-4H7m10 8H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="justifyRight" title="Align right">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" transform="scale(-1 1)"><path d="M3 10h13M3 14h18M3 18h13M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="insertOrderedList" title="Numbered list">
                                <svg width="20" height="20" viewBox="0 0 56 56" fill="currentColor">
                                    <path d="M9.496 19.012c.914 0 1.524-.516 1.524-1.57v-7.57c0-.985-.704-1.618-1.711-1.618-.844 0-1.36.281-1.946.68l-1.64 1.148c-.493.328-.75.633-.75 1.125 0 .61.492 1.031 1.03 1.031.282 0 .446-.047.845-.328l1.078-.726h.023v6.257c0 1.055.633 1.57 1.547 1.57m8.133-2.836h32.086c1.078 0 1.898-.82 1.898-1.875 0-1.078-.82-1.899-1.898-1.899H17.629c-1.055 0-1.875.82-1.875 1.899 0 1.054.82 1.875 1.875 1.875M5.723 33.145h6.023c.656 0 1.125-.446 1.125-1.102 0-.703-.469-1.148-1.125-1.148H8.395v-.07l1.921-1.548c1.617-1.312 2.227-2.062 2.227-3.445 0-1.875-1.57-3.14-4.102-3.14-2.226 0-3.867 1.171-3.867 2.671 0 .75.492 1.149 1.29 1.149.538 0 .913-.164 1.218-.703.328-.563.773-.868 1.406-.868.703 0 1.172.446 1.172 1.102 0 .563-.281 1.055-1.476 2.016l-3.094 2.53c-.445.376-.633.798-.633 1.313 0 .727.492 1.242 1.266 1.242m11.906-2.79h32.086a1.876 1.876 0 0 0 1.898-1.898c0-1.055-.82-1.875-1.898-1.875H17.629c-1.055 0-1.875.82-1.875 1.875s.82 1.898 1.875 1.898M8.512 47.747c2.765 0 4.43-1.242 4.43-3.21 0-1.29-.915-2.18-2.532-2.321v-.07c1.195-.211 2.11-1.008 2.11-2.368 0-1.78-1.735-2.765-4.032-2.765-1.851 0-3.843.867-3.843 2.414 0 .656.468 1.125 1.195 1.125.515 0 .75-.211 1.078-.563.539-.586.984-.773 1.547-.773.726 0 1.265.351 1.265 1.054 0 .657-.539.985-1.5.985h-.28c-.657 0-1.079.328-1.079 1.008 0 .633.398 1.008 1.078 1.008h.305c1.055 0 1.617.351 1.617 1.078 0 .633-.586 1.101-1.36 1.101-.843 0-1.429-.468-1.874-.914-.282-.258-.516-.445-.938-.445-.773 0-1.312.445-1.312 1.172 0 1.617 2.203 2.484 4.125 2.484m9.117-3.234h32.086c1.078 0 1.898-.82 1.898-1.875 0-1.078-.82-1.899-1.898-1.899H17.629c-1.055 0-1.875.82-1.875 1.899 0 1.054.82 1.875 1.875 1.875"/>
                                </svg>
                            </button>
                            <button type="button" data-command="insertUnorderedList" title="Bullet list">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><path d="m8 6 13 .001m-13 6h13m-13 6h13M3.5 6h.01m-.01 6h.01m-.01 6h.01M4 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="indent" title="Increase indent">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>
                            </button>
                            <button type="button" data-command="outdent" title="Decrease indent">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M3 21h18v-2H3v2zM3 12l4 4V8l-4 4zm8 5h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/>
                                </svg>
                            </button>
                            <button type="button" class="itg-emoji-trigger" title="Insert emoji">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="itg-emoji-picker itg-display-none">
                        <div class="itg-emoji-grid"></div>
                    </div>
                    
                    <div class="itg-format-preview-container">
                        <label>Preview:</label>
                        <div class="itg-format-preview" contenteditable="true" spellcheck="false"></div>
                    </div>
                    
                    <div class="itg-format-modal-footer">
                        <button type="button" class="itg-format-apply-btn button">Apply</button>
                    </div>
                </div>
            `;

            return modal;
        },

        /**
         * Initializes the emoji picker
         */
        initEmojiPicker(emojiGrid) {
            const emojis = [
                '😀',
                '😃',
                '😄',
                '😁',
                '😅',
                '😂',
                '🤣',
                '😊',
                '😇',
                '🙂',
                '🙃',
                '😉',
                '😌',
                '😍',
                '🥰',
                '😘',
                '😗',
                '😙',
                '😚',
                '😋',
                '😛',
                '😝',
                '😜',
                '🤪',
                '🤨',
                '🧐',
                '🤓',
                '😎',
                '🤩',
                '🥳',
                '😏',
                '😒',
                '😞',
                '😔',
                '😟',
                '😕',
                '🙁',
                '☹️',
                '😣',
                '😖',
                '😫',
                '😩',
                '🥺',
                '😢',
                '😭',
                '😤',
                '😠',
                '😡',
                '🤬',
                '🤯',
                '😳',
                '🥵',
                '🥶',
                '😱',
                '😨',
                '😰',
                '😥',
                '😓',
                '🤗',
                '🤔',
                '👍',
                '👎',
                '👌',
                '✌️',
                '🤞',
                '🤟',
                '🤘',
                '🤙',
                '👈',
                '👉',
                '👆',
                '👇',
                '☝️',
                '👏',
                '🙌',
                '👐',
                '🤲',
                '🤝',
                '🙏',
                '✍️',
                '💪',
                '🦾',
                '🦿',
                '🦵',
                '🦶',
                '👂',
                '🦻',
                '👃',
                '🧠',
                '🫀',
                '❤️',
                '🧡',
                '💛',
                '💚',
                '💙',
                '💜',
                '🖤',
                '🤍',
                '🤎',
                '💔',
                '❣️',
                '💕',
                '💞',
                '💓',
                '💗',
                '💖',
                '💘',
                '💝',
                '💟',
                '☮️',
                '✝️',
                '☪️',
                '🕉️',
                '☸️',
                '✡️',
                '🔯',
                '🕎',
                '☯️',
                '☦️',
                '🛐',
                '⭐',
                '🌟',
                '✨',
                '⚡',
                '🔥',
                '💥',
                '☄️',
                '🌈',
                '☀️',
                '🌤️',
                '⛅',
                '🌥️',
                '☁️',
                '🌦️',
                '🌧️',
                '⛈️',
                '🌩️',
                '🌨️',
                '❄️',
                '☃️',
            ];

            emojis.forEach((emoji) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'itg-emoji-btn';
                btn.textContent = emoji;
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.insertEmoji(emoji);
                });
                emojiGrid.appendChild(btn);
            });
        },

        /**
         * Shows the formatting modal
         */
        showModal(targetElement) {
            this.targetElement = targetElement;

            // Create modal if it doesn't exist
            if (!this.modal) {
                this.modal = this.createFormattingModal();
                document.body.appendChild(this.modal);

                // Get references
                this.previewArea = this.modal.querySelector('.itg-format-preview');

                // Use shared listener attachment (modal mode)
                this._attachEditorListeners(this.modal, () => this.previewArea);

                // Close button (only in modal)
                const closeBtn = this.modal.querySelector('.itg-format-close-btn');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => this.hideModal());
                }

                // Apply button
                const applyBtn = this.modal.querySelector('.itg-format-apply-btn');
                if (applyBtn) {
                    applyBtn.addEventListener('click', () => this.applyToTarget());
                }

                // Close on backdrop click
                this.modal.addEventListener('click', (e) => {
                    if (e.target === this.modal) this.hideModal();
                });
            }

            // Load current content from target
            // Use dataset.html as priority to keep formatting even if display is plain text
            const currentContent =
                targetElement.dataset.html || targetElement.innerHTML || targetElement.innerText || '';
            this.previewArea.innerHTML = currentContent;

            // Show modal
            this.modal.classList.add('itg-format-modal-visible');

            // Focus preview area
            setTimeout(() => {
                this.previewArea.focus();
                // Move cursor to end
                const range = document.createRange();
                const rootNode = this.previewArea.getRootNode();
                const sel = rootNode && rootNode.getSelection ? rootNode.getSelection() : window.getSelection();
                if (this.previewArea.childNodes.length > 0) {
                    range.selectNodeContents(this.previewArea);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }, 100);
        },

        /**
         * Hides the formatting modal
         */
        hideModal() {
            if (this.modal) {
                this.modal.classList.remove('itg-format-modal-visible');
                const emojiPicker = this.modal.querySelector('.itg-emoji-picker');
                if (emojiPicker) {
                    emojiPicker.classList.add('itg-display-none');
                }
                this.closeAllPopups();
            }
            this.targetElement = null;
        },

        /**
         * Restores this.savedRange into the window selection and focuses previewArea.
         * Returns the restored range or null.
         */
        _restoreSavedRange() {
            if (!this.savedRange) return null;
            try {
                this.previewArea.focus();
                const rootNode = this.previewArea.getRootNode();
                const sel = rootNode && rootNode.getSelection ? rootNode.getSelection() : window.getSelection();
                sel.removeAllRanges();
                sel.addRange(this.savedRange);
                return this.savedRange;
            } catch {
                return null;
            }
        },

        /**
         * Applies formatting to the preview area using direct DOM manipulation.
         * This approach works reliably in Shadow DOM where document.execCommand may not.
         */
        applyFormat(command, value = null) {
            if (command === 'createLink') {
                this.showLinkPopup();
                return;
            }

            const range = this._restoreSavedRange();
            if (!range) return;

            // Commands that need direct DOM manipulation (work reliably in Shadow DOM)
            const manualCommands = {
                bold: () => this._toggleInlineStyle(range, 'STRONG', 'b'),
                italic: () => this._toggleInlineStyle(range, 'EM', 'i'),
                underline: () => this._toggleInlineStyle(range, 'U', null, 'underline', 'textDecoration'),
                strikeThrough: () => this._toggleInlineStyle(range, 'S', null, 'line-through', 'textDecoration'),
                foreColor: () => this._applyInlineStyle(range, 'color', value),
                backColor: () => this._applyInlineStyle(range, 'backgroundColor', value),
                hiliteColor: () => this._applyInlineStyle(range, 'backgroundColor', value),
                fontSize: () => {
                    const pxMap = { 1: '10px', 2: '13px', 3: '16px', 4: '18px', 5: '24px', 6: '32px', 7: '48px' };
                    this._applyInlineStyle(range, 'fontSize', pxMap[value] || value + 'px');
                },
            };

            if (manualCommands[command]) {
                manualCommands[command]();
                return;
            }

            // Fallback to execCommand for block-level / list / indent commands
            // (justifyLeft, insertOrderedList, indent, outdent, etc.)
            try {
                document.execCommand(command, false, value || null);
            } catch {
                /* ignore */
            }
        },

        /**
         * Wraps or unwraps the selection in a given tag (toggle behavior).
         * @param {Range} range
         * @param {string} tagName - uppercase tag name to check (e.g. 'STRONG')
         * @param {string|null} altTag - alternative tag name to also check (e.g. 'b')
         * @param {string|null} styleValue - CSS value to check in style (e.g. 'bold')
         * @param {string|null} styleProp - CSS property to check (e.g. 'fontWeight')
         */
        _toggleInlineStyle(range, tagName, altTag, styleValue, styleProp) {
            if (range.collapsed) return;

            // Check if selection is already wrapped
            const ancestor = range.commonAncestorContainer;
            const el = ancestor.nodeType === 3 ? ancestor.parentElement : ancestor;
            const isWrapped =
                el &&
                (el.closest(tagName.toLowerCase()) ||
                    (altTag && el.closest(altTag)) ||
                    (styleProp && styleValue && el.closest(`[style*="${styleValue}"]`)));

            if (isWrapped) {
                // Unwrap: use execCommand toggle (more reliable for unwrapping)
                try {
                    document.execCommand(this._tagToCommand(tagName), false, null);
                } catch {}
            } else {
                // Wrap: create element and insert
                this._wrapRangeWithElement(range, document.createElement(tagName.toLowerCase()));
            }
        },

        _tagToCommand(tag) {
            const map = { STRONG: 'bold', EM: 'italic', U: 'underline', S: 'strikeThrough' };
            return map[tag] || tag.toLowerCase();
        },

        /**
         * Applies a CSS inline style (color, fontSize, backgroundColor) to the selection.
         * Wraps selected content in a <span style="..."> if not already styled.
         */
        _applyInlineStyle(range, property, value) {
            if (range.collapsed || !value) return;

            const span = document.createElement('span');
            span.style[property] = value;
            this._wrapRangeWithElement(range, span);
        },

        /**
         * Wraps the contents of a Range with the given element.
         * Handles partial selections across multiple nodes.
         */
        _wrapRangeWithElement(range, wrapper) {
            try {
                const fragment = range.extractContents();
                wrapper.appendChild(fragment);
                range.insertNode(wrapper);

                // Move selection to encompass the new wrapper
                const rootNode = wrapper.getRootNode();
                const sel = rootNode && rootNode.getSelection ? rootNode.getSelection() : window.getSelection();
                const newRange = document.createRange();
                newRange.selectNodeContents(wrapper);
                sel.removeAllRanges();
                sel.addRange(newRange);

                // Update savedRange to the new selection
                this.savedRange = newRange.cloneRange();
            } catch {
                // Fallback if range manipulation fails
                try {
                    document.execCommand('bold', false, null);
                } catch {
                    /* ignore */
                }
            }
        },

        /**
         * Shows the custom link selection popup
         * @param {Element} [triggerBtn] - The button that triggered the popup (used for fallback positioning)
         */
        showLinkPopup(triggerBtn) {
            // Use savedRange maintained by the selectionchange listener -- most reliable approach
            if (!this.savedRange) return; // No selection to link

            // Remove existing popup if any (check both document and shadow roots)
            this.closeAllPopups();

            // Create popup
            const popup = document.createElement('div');
            popup.className = 'itg-link-popup';
            popup.innerHTML = `
                <div class="itg-link-popup-header">
                    <span>Insert link</span>
                    <button type="button" class="itg-link-close-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <input type="text" placeholder="https://example.com" spellcheck="false">
                <div class="itg-link-popup-actions">
                    <button type="button" class="itg-link-confirm">Insert</button>
                </div>
            `;

            // Position popup: prefer the trigger button's position, fall back to range rect
            let top, left;

            // Primary: use trigger button position (reliable - always visible in toolbar)
            if (triggerBtn) {
                const btnRect = triggerBtn.getBoundingClientRect();
                top = btnRect.bottom + 5;
                left = btnRect.left;
            }

            // Secondary: try range rect if no trigger or range has width (text selection visible)
            if (!top) {
                try {
                    const rangeRect = this.savedRange.getBoundingClientRect();
                    if (rangeRect && (rangeRect.top !== 0 || rangeRect.left !== 0)) {
                        top = rangeRect.bottom + 5;
                        left = rangeRect.left;
                    }
                } catch {
                    /* ignore */
                }
            }

            if (!top) {
                // Last resort: center on screen
                top = window.innerHeight / 2 - 60;
                left = window.innerWidth / 2 - 125;
            }

            // Clamp to viewport
            popup.style.top = `${Math.min(top, window.innerHeight - 120)}px`;
            popup.style.left = `${Math.max(8, Math.min(left, window.innerWidth - 280))}px`;

            this._applyThemeVarsToPopup(popup);
            const popupContainer = this._getPopupContainer(this.previewArea);
            popupContainer.appendChild(popup);

            const input = popup.querySelector('input');
            input.focus();

            const validate = (value) => {
                const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
                if (value.length > 0 && !urlPattern.test(value)) {
                    input.classList.add('itg-input-error');
                    return false;
                }
                input.classList.remove('itg-input-error');
                return true;
            };

            const applyLink = () => {
                const url = input.value.trim();
                const isValid = validate(url);

                if (url.length > 0 && isValid) {
                    const finalUrl = url.startsWith('http') ? url : `https://${url}`;
                    // Use manual DOM manipulation for link creation (works in Shadow DOM)
                    const a = document.createElement('a');
                    a.href = finalUrl;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    this._wrapRangeWithElement(this.savedRange, a);
                }
                popup.remove();
            };

            input.addEventListener('input', (e) => validate(e.target.value));

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const url = input.value.trim();
                    if (url.length === 0 || validate(url)) {
                        applyLink();
                    }
                } else if (e.key === 'Escape') {
                    popup.remove();
                }
            });

            const confirmBtn = popup.querySelector('.itg-link-confirm');
            if (confirmBtn) {
                confirmBtn.addEventListener('mousedown', (e) => e.preventDefault());
                confirmBtn.addEventListener('click', applyLink);
            }

            const closeBtn = popup.querySelector('.itg-link-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('mousedown', (e) => e.preventDefault());
                closeBtn.addEventListener('click', () => popup.remove());
            }

            // Handle click outside -- just close the popup without applying
            const handleOutsideClick = (e) => {
                const path = e.composedPath ? e.composedPath() : [e.target];
                if (!path.includes(popup)) {
                    popup.remove();
                    document.removeEventListener('mousedown', handleOutsideClick);
                }
            };

            setTimeout(() => {
                document.addEventListener('mousedown', handleOutsideClick);
            }, 10);
        },

        /**
         * Closes all custom formatting popups
         */
        /**
         * Extracts CSS custom properties (theme vars) from the previewArea's ancestor chain
         * (including crossing the Shadow DOM boundary to the host) and applies them inline
         * to the given popup element. This ensures themed colors are available even when
         * the popup is appended to document.body or a shadow root sibling of the modal.
         */
        _applyThemeVarsToPopup(popup) {
            const varNames = [
                '--bg-panel-color',
                '--bg-color',
                '--border-color',
                '--text-color',
                '--text-on-color',
                '--action-color',
                '--interactive-color',
                '--error-color',
            ];
            const collected = {};
            let el = this.previewArea;

            while (el && Object.keys(collected).length < varNames.length) {
                if (el.style) {
                    varNames.forEach((v) => {
                        if (!(v in collected)) {
                            const val = el.style.getPropertyValue(v);
                            if (val && val.trim()) collected[v] = val.trim();
                        }
                    });
                }
                if (el.parentElement) {
                    el = el.parentElement;
                } else {
                    const root = el.getRootNode();
                    el = root instanceof ShadowRoot ? root.host : null;
                }
            }

            Object.entries(collected).forEach(([k, v]) => popup.style.setProperty(k, v));
        },

        /**
         * Returns the best container for appending popups.
         * If `el` is inside a Shadow DOM, returns that shadow root so that
         * the shadow root's CSS (variables, popup styles) apply correctly.
         * Otherwise falls back to document.body.
         */
        _getPopupContainer(el) {
            if (!el) return document.body;
            const root = el.getRootNode();
            return root instanceof ShadowRoot ? root : document.body;
        },

        closeAllPopups() {
            document.querySelectorAll('.itg-custom-popup, .itg-link-popup').forEach((p) => p.remove());
            // Also check shadow roots (needed when popups are appended inside a shadow DOM)
            document.querySelectorAll('*').forEach((el) => {
                if (el.shadowRoot) {
                    el.shadowRoot.querySelectorAll('.itg-custom-popup, .itg-link-popup').forEach((p) => p.remove());
                }
            });
        },

        /**
         * Shows custom font size selection popup
         */
        showFontSizePopup(triggerBtn) {
            this.closeAllPopups();

            const popup = document.createElement('div');
            popup.className = 'itg-custom-popup itg-font-size-popup';
            // Prevent clicks inside the popup from stealing focus from previewArea
            popup.addEventListener('mousedown', (e) => e.preventDefault());

            const sizes = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48];
            sizes.forEach((size) => {
                const opt = document.createElement('div');
                opt.className = 'itg-font-size-option';
                opt.textContent = `${size}px`;
                opt.addEventListener('mousedown', (e) => e.preventDefault());
                opt.addEventListener('click', () => {
                    // applyFormat with 'fontSize' uses _applyInlineStyle which maps value to px
                    // Pass the size index (1-7) -- applyFormat's manual handler maps it to actual px
                    let val = 3;
                    if (size <= 10) val = 1;
                    else if (size <= 13) val = 2;
                    else if (size <= 16) val = 3;
                    else if (size <= 18) val = 4;
                    else if (size <= 24) val = 5;
                    else if (size <= 32) val = 6;
                    else val = 7;

                    this.applyFormat('fontSize', val);
                    popup.remove();
                });
                popup.appendChild(opt);
            });

            const rect = triggerBtn.getBoundingClientRect();
            popup.style.top = `${rect.bottom + 5}px`;
            // Align right edge of popup with right edge of trigger (open to the left)
            popup.style.right = `${window.innerWidth - rect.right}px`;

            this._applyThemeVarsToPopup(popup);
            const popupContainer = this._getPopupContainer(triggerBtn);
            popupContainer.appendChild(popup);

            // Close on click outside (use composedPath to work inside shadow DOM)
            setTimeout(() => {
                const outside = (e) => {
                    const path = e.composedPath ? e.composedPath() : [e.target];
                    if (!path.includes(popup) && !path.includes(triggerBtn)) {
                        popup.remove();
                        document.removeEventListener('mousedown', outside);
                    }
                };
                document.addEventListener('mousedown', outside);
            }, 10);
        },
        showColorPickerPopup(triggerBtn, command) {
            this.closeAllPopups();

            const popup = document.createElement('div');
            popup.className = 'itg-custom-popup itg-color-picker-popup';
            // Prevent any click inside the popup from stealing focus from previewArea
            popup.addEventListener('mousedown', (e) => e.preventDefault());

            // Get current color from indicator
            const indicator = triggerBtn.querySelector('.itg-color-indicator');
            const currentColor = indicator ? indicator.getAttribute('fill').toUpperCase() : '#000000';

            let colors = [
                '#000000',
                '#434343',
                '#666666',
                '#999999',
                '#B7B7B7',
                '#CCCCCC',
                '#D9D9D9',
                '#EFEFEF',
                '#F3F3F3',
                '#FFFFFF',
                '#980000',
                '#FF0000',
                '#FF9900',
                '#FFFF00',
                '#00FF00',
                '#00FFFF',
                '#4A86E8',
                '#0000FF',
                '#9900FF',
                '#FF00FF',
                '#E6B8AF',
                '#F4CCCC',
                '#FCE5CD',
                '#FFF2CC',
                '#D9EAD3',
                '#D0E0E3',
                '#C9DAF8',
                '#CFE2F3',
                '#D9D2E9',
                '#EAD1DC',
                '#DD7E6B',
                '#EA9999',
                '#F9CB9C',
                '#FFE599',
                '#B6D7A8',
                '#A2C4C9',
                '#A4C2F4',
                '#9FC5E8',
                '#B4A7D6',
                '#D5A6BD',
                '#CC4125',
                '#E06666',
                '#F6B26B',
                '#FFD966',
                '#93C47D',
                '#76A5AF',
                '#6D9EEB',
                '#6FA8DC',
                '#8E7CC3',
                '#C27BA0',
                '#A61C00',
                '#CC0000',
                '#E69138',
                '#F1C232',
                '#6AA84F',
                '#45818E',
                '#3C78D8',
                '#3D85C6',
                '#674EA7',
                '#A64D79',
            ];

            // If current color is not in palette, replace the last one
            if (!colors.includes(currentColor)) {
                colors[colors.length - 1] = currentColor;
            }

            const applyColor = (color) => {
                // applyFormat will restore savedRange (maintained by selectionchange listener)
                this.applyFormat(command, color);
                const ind = triggerBtn.querySelector('.itg-color-indicator');
                if (ind) ind.setAttribute('fill', color);
                popup.remove();
            };

            colors.forEach((color) => {
                const opt = document.createElement('div');
                opt.className = 'itg-color-option';
                opt.style.backgroundColor = color;
                opt.title = color;

                if (color === currentColor) {
                    opt.classList.add('itg-selected-color');
                }

                // Prevent mousedown from stealing focus from previewArea
                opt.addEventListener('mousedown', (e) => e.preventDefault());
                opt.addEventListener('click', () => applyColor(color));
                popup.appendChild(opt);
            });

            // Add custom hex input and graphic picker section
            const customSection = document.createElement('div');
            customSection.className = 'itg-color-custom-section';
            customSection.innerHTML = `
                <input type="text" placeholder="#HEX" maxlength="7" spellcheck="false" title="Hexadecimal color" value="${currentColor}">
                <button type="button" class="itg-graphic-picker-btn" title="Customize graphically">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
                </button>
                <input type="color" class="itg-hidden-color-input" style="opacity:0; position:absolute; pointer-events:none;">
            `;

            const hexInput = customSection.querySelector('input[type="text"]');
            const graphicBtn = customSection.querySelector('.itg-graphic-picker-btn');
            const hiddenColorInput = customSection.querySelector('.itg-hidden-color-input');

            hexInput.addEventListener('input', (e) => {
                let val = e.target.value.trim().toUpperCase();
                if (!val.startsWith('#') && val.length > 0) val = '#' + val;

                if (/^#[0-9A-F]{6}$/i.test(val) || /^#[0-9A-F]{3}$/i.test(val)) {
                    hexInput.style.borderColor = 'var(--action-color)';
                } else {
                    hexInput.style.borderColor = 'var(--error-color)';
                }
            });

            hexInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    let val = hexInput.value.trim().toUpperCase();
                    if (!val.startsWith('#') && val.length > 0) val = '#' + val;
                    if (/^#[0-9A-F]{6}$/i.test(val) || /^#[0-9A-F]{3}$/i.test(val)) {
                        applyColor(val);
                    }
                }
            });

            graphicBtn.addEventListener('mousedown', (e) => e.preventDefault());
            graphicBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Position where it appeared before (Step 462 style)
                const popupRect = popup.getBoundingClientRect();
                hiddenColorInput.style.position = 'fixed';
                hiddenColorInput.style.top = `${popupRect.top}px`;
                hiddenColorInput.style.left = `${popupRect.left}px`;
                hiddenColorInput.style.width = '1px';
                hiddenColorInput.style.height = '1px';
                hiddenColorInput.style.opacity = '0';
                hiddenColorInput.style.pointerEvents = 'none';
                hiddenColorInput.style.display = 'block';

                hiddenColorInput.click();
            });

            hiddenColorInput.addEventListener('change', (e) => {
                applyColor(e.target.value.toUpperCase());
            });

            popup.appendChild(customSection);

            const rect = triggerBtn.getBoundingClientRect();
            popup.style.top = `${rect.bottom + 5}px`;
            // Align right edge of popup with right edge of trigger (open to the left)
            popup.style.right = `${window.innerWidth - rect.right}px`;

            this._applyThemeVarsToPopup(popup);
            const popupContainer = this._getPopupContainer(triggerBtn);
            popupContainer.appendChild(popup);

            // Close on click outside (use composedPath to work inside shadow DOM)
            setTimeout(() => {
                const outside = (e) => {
                    const path = e.composedPath ? e.composedPath() : [e.target];
                    if (!path.includes(popup) && !path.includes(triggerBtn)) {
                        popup.remove();
                        document.removeEventListener('mousedown', outside);
                    }
                };
                document.addEventListener('mousedown', outside);
            }, 10);
        },

        /**
         * Inserts an emoji at cursor position
         */
        insertEmoji(emoji) {
            const range = this._restoreSavedRange();
            if (!range) {
                // No saved range -- just focus and insert at end
                this.previewArea.focus();
                const rootNode = this.previewArea.getRootNode();
                const sel = rootNode && rootNode.getSelection ? rootNode.getSelection() : window.getSelection();
                if (sel.rangeCount > 0) {
                    const r = sel.getRangeAt(0);
                    r.deleteContents();
                    const textNode = document.createTextNode(emoji);
                    r.insertNode(textNode);
                    r.setStartAfter(textNode);
                    r.setEndAfter(textNode);
                    sel.removeAllRanges();
                    sel.addRange(r);
                }
                return;
            }

            range.deleteContents();
            const textNode = document.createTextNode(emoji);
            range.insertNode(textNode);

            // Move cursor after emoji
            const rootNode = this.previewArea.getRootNode();
            const sel = rootNode && rootNode.getSelection ? rootNode.getSelection() : window.getSelection();
            const newRange = document.createRange();
            newRange.setStartAfter(textNode);
            newRange.setEndAfter(textNode);
            sel.removeAllRanges();
            sel.addRange(newRange);
            this.savedRange = newRange.cloneRange();
        },

        /**
         * Applies the formatted content to the target element
         */
        applyToTarget() {
            if (this.targetElement && this.previewArea) {
                const formattedContent = this.previewArea.innerHTML;

                // Set the content
                if (this.targetElement.tagName === 'INPUT' || this.targetElement.tagName === 'TEXTAREA') {
                    this.targetElement.value = formattedContent;
                } else {
                    // Update dataset with full HTML
                    this.targetElement.dataset.html = formattedContent;
                    // Actual display is plain text as requested by user
                    this.targetElement.innerText = HintCommon.stripHtml(formattedContent);

                    // Flag to tell setupInlineEdit that this was a modal update
                    this.targetElement.dataset.itgUpdating = 'true';
                }

                // Trigger input event for validation
                this.targetElement.dispatchEvent(new Event('input', { bubbles: true }));

                // Manually trigger blur to ensure setupInlineEdit saves the changes
                this.targetElement.dispatchEvent(new Event('blur'));

                this.hideModal();
            }
        },
    },

    setupInlineEdit(el, options) {
        const isInput = el.tagName === 'INPUT';
        const limit = options.category ? this.getCategoryLimit(options.category) : null;

        // 1. Save initial value on focus
        el.addEventListener('focus', () => {
            el.dataset.originalVal = isInput ? el.value : el.innerText; // Save raw text
            if (options.useHtml) {
                el.dataset.originalHtml = el.dataset.html || el.innerHTML || '';
            }
        });

        // 2. Limit Control (Keyboard)
        el.addEventListener('beforeinput', (e) => {
            if (limit && e.data && !window.getSelection().toString()) {
                const currentLen = isInput ? el.value.length : el.innerText.length;
                if (currentLen + e.data.length > limit) {
                    e.preventDefault();
                }
            }
        });

        // 4. Limit Control (Paste) - FIX: Prevents pasting beyond the limit and cleans styles
        el.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');

            if (limit) {
                const currentLen = isInput ? el.value.length : el.innerText.length;
                const selectionLen = window.getSelection().toString().length;
                const available = limit - (currentLen - selectionLen);

                if (available > 0) {
                    const truncated = text.substring(0, available);
                    if (isInput) {
                        el.setRangeText(truncated); // Maintains cursor position in inputs
                    } else {
                        document.execCommand('insertText', false, truncated);
                    }
                }
            } else {
                // If no limit, paste as clean plain text
                if (isInput) el.setRangeText(text);
                else document.execCommand('insertText', false, text);
            }

            // Trigger immediate validation after pasting
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // 5. Real-Time Validation (Input)
        const validateUI = () => {
            const val = isInput ? el.value.trim() : el.innerText.trim();
            // If it is mandatory and empty, or if custom validation fails
            const isValid =
                options.required !== false && !val ? false : options.validate ? options.validate(val) : true;

            if (!isValid) {
                el.classList.add('itg-input-error');
            } else {
                el.classList.remove('itg-input-error');
            }
        };

        el.addEventListener('input', validateUI);

        // 6. Blur: Restore if error or Save if valid
        el.addEventListener('blur', async () => {
            const currentPlainText = (isInput ? el.value : el.innerText).trim();
            const originalPlainText = (el.dataset.originalVal || '').trim();

            // If we use HTML, the value to compare and save is different
            let valueToSave = currentPlainText;
            let hasChanged = currentPlainText !== originalPlainText;

            if (options.useHtml && !isInput) {
                const currentHtml = el.dataset.html || currentPlainText;
                const originalHtml = el.dataset.originalHtml || originalPlainText;

                // If plain text changed, but dataset.html has not been updated
                // (e.g., manual inline editing), HTML is no longer valid.
                // EXCEPTION: If it's an update from the modal, we trust the HTML.
                if (
                    el.dataset.itgUpdating !== 'true' &&
                    hasChanged &&
                    HintCommon.stripHtml(currentHtml).trim() !== currentPlainText
                ) {
                    el.dataset.html = currentPlainText;
                    valueToSave = currentPlainText;
                } else {
                    valueToSave = currentHtml;
                    hasChanged = currentHtml !== originalHtml;
                }

                // Clear flag
                delete el.dataset.itgUpdating;
            }

            // FIX: If there is a visual error (class) OR validation fails right now
            const isValid =
                options.required !== false && !currentPlainText
                    ? false
                    : options.validate
                      ? options.validate(currentPlainText)
                      : true;

            if (!isValid || el.classList.contains('itg-input-error')) {
                const hadError = hasChanged || el.classList.contains('itg-input-error') || !isValid;
                // Restore original value
                if (isInput) el.value = el.dataset.originalVal;
                else {
                    el.innerText = el.dataset.originalVal;
                    if (options.useHtml) el.dataset.html = el.dataset.originalHtml;
                }

                el.classList.remove('itg-input-error');

                if (hadError && options.onError) {
                    options.onError(currentPlainText);
                } else if (options.onRestore) {
                    options.onRestore();
                }
            } else if (hasChanged) {
                // Save
                if (options.onSave) await options.onSave(valueToSave);
                if (options.onAfter) options.onAfter();
            }
        });

        // 6. Special keys
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                const original = el.dataset.originalVal;
                if (isInput) el.value = original;
                else el.innerText = original;
                el.classList.remove('itg-input-error');
                el.blur();
            } else if (e.key === 'Enter') {
                if (isInput || options.blurOnEnter) {
                    e.preventDefault();
                    el.blur();
                }
            }
        });
    },

    /**
     * Filter DOM items by text content, hiding those that don't match the query.
     * @param {string} query - The search string
     * @param {HTMLElement|NodeList|Array} items - Elements to filter
     * @param {Object} [opts]
     * @param {Function} [opts.getText] - Extract searchable text from each element
     * @param {Function} [opts.onItem] - Called per item (item, matches)
     * @param {Function} [opts.onComplete] - Called after all items processed (visibleCount)
     * @returns {number} Number of visible items
     */
    filterItems(query, items, opts = {}) {
        const lower = query.toLowerCase().trim();
        const list = items instanceof NodeList ? Array.from(items) : items;
        let visibleCount = 0;
        list.forEach((item) => {
            const text = opts.getText ? opts.getText(item).toLowerCase() : item.textContent.toLowerCase();
            const matches = !lower || text.includes(lower);
            item.style.display = matches ? '' : 'none';
            if (matches) visibleCount++;
            if (opts.onItem) opts.onItem(item, matches);
        });
        if (opts.onComplete) opts.onComplete(visibleCount);
        return visibleCount;
    },
};

// Export logic
if (typeof window !== 'undefined') {
    window.HintCommon = HintCommon;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HintCommon;
}
