var HintCommon = {
    i18n: {
        _messages: null,
        _lang: null,
        _loadPromise: null,
        async loadMessages(force = false) {
            if (!force && this._messages) return this._messages;
            if (!force && this._loadPromise) return this._loadPromise;
            this._loadPromise = (async () => {
                try {
                    let lang = 'en';
                    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                        const stored = await chrome.storage.local.get('preferred-language');
                        lang =
                            stored?.['preferred-language'] ||
                            (chrome.i18n?.getUILanguage()?.startsWith('es') ? 'es' : 'en');
                    }
                    this._lang = lang;
                    let loaded = false;
                    try {
                        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
                        const res = await fetch(url);
                        if (res.ok) {
                            this._messages = await res.json();
                            loaded = true;
                        }
                    } catch {
                        // Direct fetch may fail due to CSP in content script
                    }
                    if (!loaded && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                        try {
                            const bgResponse = await chrome.runtime.sendMessage({
                                action: 'getI18nMessages',
                                lang,
                            });
                            if (bgResponse?.success && bgResponse.messages) {
                                this._messages = bgResponse.messages;
                                this._lang = bgResponse.lang || lang;
                                loaded = true;
                            }
                        } catch {}
                    }
                    if (!loaded && lang !== 'en') {
                        try {
                            const fallbackRes = await fetch(chrome.runtime.getURL('_locales/en/messages.json'));
                            if (fallbackRes.ok) this._messages = await fallbackRes.json();
                        } catch {}
                    }
                } catch (e) {
                    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
                        console.log('[HintCommon.i18n] Fallback to native chrome.i18n/storage:', e?.message || e);
                    }
                } finally {
                    this._loadPromise = null;
                }
                return this._messages || {};
            })();
            return this._loadPromise;
        },
        getMessage(key, params = [], fallback = '') {
            if (typeof params === 'string' && fallback === '') {
                fallback = params;
                params = [];
            } else if (!Array.isArray(params)) {
                params = params !== undefined && params !== null ? [params] : [];
            }

            let entry = this._messages?.[key];
            if (!entry && typeof window !== 'undefined' && window.__itgPipMessages) {
                entry = window.__itgPipMessages[key];
            }

            if (entry && entry.message !== undefined) {
                let text = entry.message;
                if (entry.placeholders) {
                    text = text.replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$/g, (match, name) => {
                        const placeholder = entry.placeholders[name] || entry.placeholders[name.toLowerCase()];
                        return placeholder?.content ?? match;
                    });
                }
                if (params && params.length > 0) {
                    text = text.replace(/\$(\d+)/g, (match, indexStr) => {
                        const index = parseInt(indexStr, 10) - 1;
                        return params[index] !== undefined ? params[index] : match;
                    });
                }
                if (text.includes('$$')) {
                    text = text.replace(/\$\$/g, '$');
                }
                return text;
            }

            if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
                const m = chrome.i18n.getMessage(key, params);
                if (m) return m;
            }
            return fallback || key;
        },
    },

    // Storage Keys constants to ensure consistency
    STORAGE_KEYS: {
        COMMANDS: 'userHintCommands',
        SNIPPETS: 'itg-user-snippets',
        CUSTOM_SHORTCUTS: 'itg-ui-custom-shortcuts',
        PINNED_SECTIONS: 'itg-pinned-sections',
        LINK_PREVIEW_BLACKLIST: 'linkPreviewBlacklist',
        LINK_PREVIEW_TRIGGER_KEY: 'linkPreviewTriggerKey',
        SNIPPET_POPUP_TRIGGER_KEY: 'snippetPopupTriggerKey',
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
            // The four capture modes of the panel's camera menu, which is also where
            // the last two take their wording from.
            cs: 'hintDesc_cs',
            cp: 'captureFullPageScroll',
            cP: 'captureFullPageSplit',
            ca: 'hintDesc_ca',
            wp: 'hintDesc_wp',
            wv: 'hintDesc_wv',
            we: 'hintDesc_we',
            as: 'hintDesc_as',
            ah: 'hintDesc_ah',
            ar: 'hintDesc_readAloud',
        },
        categoryTabs: {
            t: 'hintDesc_t',
            x: 'hintDesc_x',
            yt: 'hintDesc_yt',
            s: 'hintDesc_s',
            ts: 'hintDesc_ts',
            i: 'hintDesc_i',
            esc: 'hintDesc_esc',
            'Alt+<grupo><n>+Enter': 'hintDesc_group_tab_nav',
            o: 'hintDesc_o',
            dg: 'hintDesc_dg',
            so: 'hintDesc_so',
            st: 'hintDesc_st',
            // The side panels, all under `p`. `ph` is the home one — it was `pp`,
            // which read as a typo for `p` and said "focus the panel" rather than
            // which panel it opened.
            ph: 'hintDesc_ph',
            pt: 'hintDesc_pt',
            pl: 'hintDesc_pl',
            pk: 'hintDesc_pk',
            ps: 'hintDesc_ps',
            pa: 'hintDesc_pa',
            pw: 'hintDesc_pw',
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
        // The reader's own keys. They are read by `src/utils/readAloud.js` rather than
        // by the command registry, because they only mean anything while the reader is
        // on a page — everywhere else they belong to the site.
        categoryReadAloudControls: {
            zp: 'hintDesc_readerPlay',
            zn: 'hintDesc_readerNext',
            zb: 'hintDesc_readerPrev',
            zq: 'hintDesc_readerClose',
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
            'ts:': 'prefixSplitTabs',
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
            'ar:': 'prefixReadAloud',
            // The four capture modes again, this time over the tabs the omnibar lists.
            // They carry their own description keys because an override is stored by
            // description, and these must not move the keyboard commands with them.
            'cs:': 'omnibarPrefixCaptureVisibleDesc',
            'cp:': 'omnibarPrefixCaptureFullPageDesc',
            'cpp:': 'omnibarPrefixCapturePartsDesc',
            'ca:': 'omnibarPrefixCaptureAreaDesc',
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
        readaloudcontrols: 2,
        readaloudmarks: 2,
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
                // A typed variable fills itself in, so there is nothing to type for it.
                if (v.type && v.type !== 'text') return;
                text += `${v.id}${v.defaultValue || ''}`;
            });
        }
        return text;
    },

    validateSnippetVar(word, expansion) {
        if (!word || !expansion) return false;
        return expansion.includes(word);
    },

    /**
     * The kinds of value a snippet variable can carry.
     *
     * `text` is the plain one: whatever the user types after the marker, or the
     * marked word itself. Every other kind is resolved at expansion time from
     * something real — the clock, the page — so a snippet can carry today's date
     * or the URL it is being written on without the user typing anything.
     *
     * `group` only drives the picker's headings; the stored value is `value`.
     */
    SNIPPET_VAR_TYPES: [
        { value: 'text', group: 'basic', key: 'varTypeText', fallback: 'Text' },
        { value: 'date', group: 'datetime', key: 'varTypeDate', fallback: 'Current date' },
        { value: 'isodate', group: 'datetime', key: 'varTypeIsoDate', fallback: 'ISO date (YYYY-MM-DD)' },
        { value: 'longdate', group: 'datetime', key: 'varTypeLongDate', fallback: 'Long date' },
        { value: 'time', group: 'datetime', key: 'varTypeTime', fallback: 'Current time' },
        { value: 'datetime', group: 'datetime', key: 'varTypeDateTime', fallback: 'Date and time' },
        { value: 'weekday', group: 'datetime', key: 'varTypeWeekday', fallback: 'Day of the week' },
        { value: 'day', group: 'datetime', key: 'varTypeDay', fallback: 'Day of the month' },
        { value: 'month', group: 'datetime', key: 'varTypeMonth', fallback: 'Month' },
        { value: 'year', group: 'datetime', key: 'varTypeYear', fallback: 'Year' },
        { value: 'tomorrow', group: 'datetime', key: 'varTypeTomorrow', fallback: "Tomorrow's date" },
        { value: 'yesterday', group: 'datetime', key: 'varTypeYesterday', fallback: "Yesterday's date" },
        { value: 'nextweek', group: 'datetime', key: 'varTypeNextWeek', fallback: 'Date in a week' },
        { value: 'timestamp', group: 'datetime', key: 'varTypeTimestamp', fallback: 'Unix timestamp' },
        { value: 'url', group: 'page', key: 'varTypeUrl', fallback: 'Page URL' },
        { value: 'domain', group: 'page', key: 'varTypeDomain', fallback: 'Page domain' },
        { value: 'pagetitle', group: 'page', key: 'varTypePageTitle', fallback: 'Page title' },
        { value: 'uuid', group: 'other', key: 'varTypeUuid', fallback: 'Unique identifier' },
        { value: 'random', group: 'other', key: 'varTypeRandom', fallback: 'Random number' },
    ],

    SNIPPET_VAR_TYPE_GROUPS: [
        { id: 'basic', key: 'varTypeGroupBasic', fallback: 'Basic' },
        { id: 'datetime', key: 'varTypeGroupDateTime', fallback: 'Date and time' },
        { id: 'page', key: 'varTypeGroupPage', fallback: 'Page' },
        { id: 'other', key: 'varTypeGroupOther', fallback: 'Other' },
    ],

    getSnippetVarTypeLabel(type) {
        const entry = this.SNIPPET_VAR_TYPES.find((t) => t.value === type) || this.SNIPPET_VAR_TYPES[0];
        return this.i18n.getMessage(entry.key, entry.fallback);
    },

    /** Letters, digits and underscore, accents included — `\b` only knows ASCII. */
    isSnippetWordChar(ch) {
        return !!ch && /[\p{L}\p{N}_]/u.test(ch);
    },

    /** Whether the slice at `index` is a word of its own rather than part of one. */
    isSnippetWordBoundary(text, index, length) {
        return !this.isSnippetWordChar(text[index - 1]) && !this.isSnippetWordChar(text[index + length]);
    },

    /**
     * Replaces `word` with `replacement`, but only where it stands as a word.
     *
     * A variable named "casa" must not turn "casamiento" into "<date>miento": the
     * marks in the editor are drawn on whole words, and this is what makes the
     * expansion agree with them.
     */
    replaceSnippetWord(text, word, replacement) {
        if (!text || !word) return text;
        let out = '';
        let from = 0;
        for (;;) {
            const idx = text.indexOf(word, from);
            if (idx === -1) return out + text.slice(from);
            out += text.slice(from, idx);
            out += this.isSnippetWordBoundary(text, idx, word.length) ? replacement : word;
            from = idx + word.length;
        }
    },

    /**
     * The variable-type picker, in the customizable-select dress the Pomodoro
     * dashboard's tag filter wears: our own trigger button, `<selectedcontent>`
     * and arrow, with `::picker(select)` styling the drop-down itself.
     *
     * @param {object} [options]
     * @param {string} [options.className] extra classes for the <select>
     * @param {string} [options.value] type to start on
     * @param {string} [options.textLabel] what the `text` option reads as — a
     *   variable's own default value, so a row shows the text it will insert
     *   rather than the word "Text"
     * @param {string} [options.prompt] a leading empty-valued option, for the
     *   editor toolbar where nothing is selected until a word is marked
     */
    createVarTypeSelect({ className = '', value = 'text', textLabel = null, prompt = null } = {}) {
        const select = document.createElement('select');
        select.className = ['itg-var-type-select', className].filter(Boolean).join(' ');

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.innerHTML = `<selectedcontent></selectedcontent>
            <svg class="picker-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>`;
        select.appendChild(trigger);

        if (prompt !== null) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = prompt;
            select.appendChild(opt);
        }

        this.SNIPPET_VAR_TYPE_GROUPS.forEach((group) => {
            const types = this.SNIPPET_VAR_TYPES.filter((t) => t.group === group.id);
            if (types.length === 0) return;
            const optgroup = document.createElement('optgroup');
            const legend = document.createElement('legend');
            legend.textContent = this.i18n.getMessage(group.key, group.fallback);
            optgroup.appendChild(legend);
            types.forEach((t) => {
                const opt = document.createElement('option');
                opt.value = t.value;
                opt.textContent = t.value === 'text' && textLabel ? textLabel : this.i18n.getMessage(t.key, t.fallback);
                optgroup.appendChild(opt);
            });
            select.appendChild(optgroup);
        });

        select.value = prompt !== null && !value ? '' : value || 'text';
        return select;
    },

    /** Keeps a row's picker showing the right label after its type or default changes. */
    refreshVarTypeSelect(select, { value, textLabel } = {}) {
        if (!select) return;
        const textOption = select.querySelector('option[value="text"]');
        if (textOption) {
            textOption.textContent = textLabel || this.getSnippetVarTypeLabel('text');
        }
        if (value !== undefined) select.value = value || 'text';
    },

    /**
     * Turns a variable type into the text that replaces the marked word.
     * `text` (and anything unknown) has no computed value, so the caller keeps
     * whatever the user typed or the word itself — that is what `null` means here.
     */
    resolveSnippetVarValue(type) {
        if (!type || type === 'text') return null;
        const now = new Date();
        const shift = (days) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
        const pad = (n) => String(n).padStart(2, '0');
        const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const day = (d) => d.toLocaleDateString();
        try {
            switch (type) {
                case 'date':
                    return day(now);
                case 'isodate':
                    return iso(now);
                case 'longdate':
                    return now.toLocaleDateString(undefined, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    });
                case 'time':
                    return now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                case 'datetime':
                    return `${day(now)} ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
                case 'weekday':
                    return now.toLocaleDateString(undefined, { weekday: 'long' });
                case 'day':
                    return String(now.getDate());
                case 'month':
                    return now.toLocaleDateString(undefined, { month: 'long' });
                case 'year':
                    return String(now.getFullYear());
                case 'tomorrow':
                    return day(shift(1));
                case 'yesterday':
                    return day(shift(-1));
                case 'nextweek':
                    return day(shift(7));
                case 'timestamp':
                    return String(Date.now());
                case 'url':
                    return window.location.href;
                case 'domain':
                    return window.location.hostname;
                case 'pagetitle':
                    return document.title || '';
                case 'uuid':
                    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
                case 'random':
                    return String(Math.floor(Math.random() * 1000) + 1);
                default:
                    return null;
            }
        } catch {
            return null;
        }
    },

    /**
     * Snippet variables as they live inside the formatting editor.
     *
     * While the snippet is being written a variable is a marked span in the
     * preview; once it is saved it is a plain word in the expansion plus an entry
     * in the `variables` array, which is the shape the expansion engine has always
     * read. `extract` performs that flattening and `applyMarks` puts the marks
     * back when the snippet is opened again for editing.
     */
    SnippetVars: {
        CLASS: 'itg-snippet-var',
        WORD_CLASS: 'itg-snippet-var-word',
        REMOVE_CLASS: 'itg-snippet-var-remove',

        /** The selection's own document, which is a shadow root inside the page UI. */
        _selectionOf(root) {
            const node = root.getRootNode();
            return node && node.getSelection ? node.getSelection() : window.getSelection();
        },

        /** The word a chip stands for, read past the remove button. */
        wordOf(span) {
            return (span.querySelector(`.${this.WORD_CLASS}`)?.textContent ?? span.textContent ?? '').trim();
        },

        /** The marked span the caret sits in, if any. */
        activeSpan(previewArea) {
            if (!previewArea) return null;
            const sel = this._selectionOf(previewArea);
            if (!sel || sel.rangeCount === 0) return null;
            const range = sel.getRangeAt(0);
            let node = range.commonAncestorContainer;
            if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
            if (!node || !previewArea.contains(node)) return null;
            return node.closest?.(`.${this.CLASS}`) || null;
        },

        /** `$1`, `$2`, … skipping the ids already taken in this preview. */
        nextId(previewArea) {
            const taken = new Set(
                [...previewArea.querySelectorAll(`.${this.CLASS}`)].map((el) => el.dataset.varId).filter(Boolean),
            );
            for (let i = 1; i <= 99; i++) {
                if (!taken.has(`$${i}`)) return `$${i}`;
            }
            return `$${taken.size + 1}`;
        },

        /** Every chip that stands for the same variable as this one. */
        twins(previewArea, span) {
            const id = span?.dataset.varId;
            if (!previewArea || !id) return span ? [span] : [];
            return [...previewArea.querySelectorAll(`.${this.CLASS}`)].filter((el) => el.dataset.varId === id);
        },

        /** Drops the chip but keeps its word where it was. */
        unmark(span) {
            if (!span || !span.parentNode) return;
            const parent = span.parentNode;
            parent.replaceChild(document.createTextNode(this.wordOf(span)), span);
            parent.normalize();
        },

        /** Drops the whole variable: every chip standing for it. */
        unmarkAll(previewArea, span) {
            this.twins(previewArea, span).forEach((el) => this.unmark(el));
        },

        /**
         * Marks the selection, or unmarks it when it already is a variable.
         *
         * Every identical word in the expansion is marked at once, because that is
         * what actually happens on expansion: the value replaces all of them. Marking
         * only the one the user highlighted would show a snippet that behaves
         * differently from how it reads.
         *
         * Returns the chip under the caret, or null when there was nothing to mark.
         */
        toggle(previewArea, type = 'text') {
            const existing = this.activeSpan(previewArea);
            if (existing) {
                this.unmarkAll(previewArea, existing);
                return null;
            }
            const sel = this._selectionOf(previewArea);
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
            const range = sel.getRangeAt(0);
            if (!previewArea.contains(range.commonAncestorContainer)) return null;
            const word = range.toString().trim();
            if (!word) return null;

            const id = this.nextId(previewArea);
            sel.removeAllRanges();
            const marked = this.markWord(previewArea, word, id, type);
            // Leave the caret inside the first chip so the picker keeps showing the
            // type that was just chosen instead of falling back to its prompt.
            const wordEl = marked[0]?.querySelector(`.${this.WORD_CLASS}`);
            if (wordEl) {
                const caret = document.createRange();
                caret.selectNodeContents(wordEl);
                caret.collapse(false);
                sel.addRange(caret);
            }
            return marked[0] || null;
        },

        /**
         * The editor's text nodes, in order. The × of a chip is furniture rather
         * than content, so it is left out and the words read as they were written.
         */
        _textNodes(previewArea) {
            const walker = document.createTreeWalker(previewArea, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) =>
                    node.parentElement?.closest(`.${this.REMOVE_CLASS}`)
                        ? NodeFilter.FILTER_REJECT
                        : NodeFilter.FILTER_ACCEPT,
            });
            const out = [];
            let node;
            while ((node = walker.nextNode())) out.push(node);
            return out;
        },

        /**
         * The next occurrence of `word` that is a word of its own and is not already
         * inside a chip. Bounded by letters rather than by nothing, so marking "casa"
         * leaves "casamiento" alone — the expansion engine reads the same boundary,
         * so what the editor shows is what the snippet does.
         */
        _findWholeWord(previewArea, word, caretOffset = null) {
            const nodes = this._textNodes(previewArea);
            const full = nodes.map((n) => n.textContent).join('');
            let from = 0;
            for (;;) {
                const idx = full.indexOf(word, from);
                if (idx === -1) return null;
                from = idx + 1;
                if (!HintCommon.isSnippetWordBoundary(full, idx, word.length)) continue;
                // The word being typed is not a word yet: "casa" on the way to
                // "casamiento" would flash a mark and lose it at the next keystroke.
                // It gets marked once the caret leaves it, which is what pressing
                // space does.
                if (caretOffset !== null && caretOffset > idx && caretOffset <= idx + word.length) continue;
                let offset = 0;
                for (const node of nodes) {
                    const len = node.textContent.length;
                    const fits = idx >= offset && idx + word.length <= offset + len;
                    if (fits && !node.parentElement?.closest(`.${this.CLASS}`)) {
                        return { node, idx: idx - offset };
                    }
                    offset += len;
                }
            }
        },

        /**
         * Wraps every unmarked occurrence of `word`; returns the chips it made.
         * `caretOffset` leaves the word under the caret alone — see `_findWholeWord`.
         */
        markWord(previewArea, word, id, type = 'text', caretOffset = null) {
            const made = [];
            if (!word) return made;
            // The tree is rebuilt as chips replace text, so the search restarts after
            // each hit rather than holding on to a stale walker.
            for (let guard = 0; guard < 200; guard++) {
                const hit = this._findWholeWord(previewArea, word, caretOffset);
                if (!hit) break;
                const range = document.createRange();
                range.setStart(hit.node, hit.idx);
                range.setEnd(hit.node, hit.idx + word.length);
                const span = document.createElement('span');
                span.className = this.CLASS;
                span.dataset.varId = id;
                span.dataset.varType = type;
                range.deleteContents();
                range.insertNode(span);
                this._decorate(span, word);
                made.push(span);
            }
            return made;
        },

        setType(previewArea, span, type) {
            this.twins(previewArea, span).forEach((el) => {
                el.dataset.varType = type || 'text';
                this._decorate(el);
            });
        },

        /** Builds the chip's insides: the word, and the × that retires the variable. */
        _decorate(span, word) {
            const text = word ?? this.wordOf(span);
            const type = span.dataset.varType || 'text';
            span.setAttribute('data-var-type', type);
            span.setAttribute('contenteditable', 'false');
            span.title = `${span.dataset.varId || ''} · ${HintCommon.getSnippetVarTypeLabel(type)}`;
            span.textContent = '';

            const wordEl = document.createElement('span');
            wordEl.className = this.WORD_CLASS;
            wordEl.textContent = text;

            const remove = document.createElement('span');
            remove.className = this.REMOVE_CLASS;
            remove.textContent = '\u00D7';
            remove.setAttribute('role', 'button');
            remove.title = HintCommon.i18n.getMessage('varRemoveTooltip', 'Remove variable');

            span.append(wordEl, remove);
        },

        /** Where the caret sits, counted in characters over the whole editor. */
        _saveCaret(previewArea) {
            const sel = this._selectionOf(previewArea);
            if (!sel || sel.rangeCount === 0) return null;
            const range = sel.getRangeAt(0);
            if (!previewArea.contains(range.endContainer)) return null;
            let offset = 0;
            for (const node of this._textNodes(previewArea)) {
                if (node === range.endContainer) return offset + range.endOffset;
                offset += node.textContent.length;
            }
            return null;
        },

        /**
         * Puts the caret back at that character. Landing inside a chip means the word
         * being typed has just become a variable, so the caret goes after it — where
         * the next keystroke belongs.
         */
        _restoreCaret(previewArea, offset) {
            if (offset === null || offset === undefined) return;
            const sel = this._selectionOf(previewArea);
            if (!sel) return;
            let remaining = offset;
            for (const node of this._textNodes(previewArea)) {
                const len = node.textContent.length;
                if (remaining <= len) {
                    const range = document.createRange();
                    const chip = node.parentElement?.closest(`.${this.CLASS}`);
                    if (chip) range.setStartAfter(chip);
                    else range.setStart(node, remaining);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return;
                }
                remaining -= len;
            }
        },

        /** Whether a chip is still bounded by non-letters on both sides. */
        _standsAlone(previewArea, chip) {
            const nodes = this._textNodes(previewArea);
            const full = nodes.map((n) => n.textContent).join('');
            let offset = 0;
            let start = -1;
            let end = -1;
            for (const node of nodes) {
                const len = node.textContent.length;
                if (chip.contains(node)) {
                    if (start === -1) start = offset;
                    end = offset + len;
                }
                offset += len;
            }
            if (start === -1) return true;
            return HintCommon.isSnippetWordBoundary(full, start, end - start);
        },

        /**
         * Brings the marks in step with the text as it is typed.
         *
         * Writing the word again marks it there too, and typing letters onto a chip
         * retires it — "casa" that grows into "casamiento" stops being the variable
         * it was. Both directions keep the editor showing exactly what the snippet
         * will do, without the user having to mark anything twice.
         *
         * `liveTyping` holds the word under the caret back until the caret leaves it,
         * so a half-typed word does not flash a mark. The apply path calls this
         * without it, to settle the last word before the snippet is read out.
         */
        refreshMarks(previewArea, { liveTyping = false } = {}) {
            if (!previewArea) return;
            const chips = [...previewArea.querySelectorAll(`.${this.CLASS}`)];
            if (chips.length === 0) return;

            const caret = this._saveCaret(previewArea);
            let changed = false;

            for (const chip of chips) {
                if (!chip.isConnected || this._standsAlone(previewArea, chip)) continue;
                this.unmark(chip);
                changed = true;
            }

            const seen = new Map();
            previewArea.querySelectorAll(`.${this.CLASS}`).forEach((chip) => {
                const id = chip.dataset.varId;
                if (!id || seen.has(id)) return;
                seen.set(id, {
                    word: this.wordOf(chip),
                    type: chip.dataset.varType || 'text',
                    def: chip.dataset.varDefault || '',
                });
            });

            for (const [id, v] of seen) {
                const made = this.markWord(previewArea, v.word, id, v.type, liveTyping ? caret : null);
                if (made.length === 0) continue;
                changed = true;
                if (v.def) made.forEach((chip) => (chip.dataset.varDefault = v.def));
            }

            if (changed) this._restoreCaret(previewArea, caret);
        },

        /**
         * Flattens the editor content: the HTML that gets stored plus the
         * variable list that describes it.
         */
        extract(previewArea) {
            const clone = previewArea.cloneNode(true);
            const variables = [];
            const seen = new Set();
            clone.querySelectorAll(`.${this.CLASS}`).forEach((span) => {
                const word = this.wordOf(span);
                const id = span.dataset.varId || `$${variables.length + 1}`;
                if (word && !seen.has(id)) {
                    seen.add(id);
                    variables.push({
                        id,
                        word,
                        defaultValue: span.dataset.varDefault || word,
                        type: span.dataset.varType || 'text',
                    });
                }
                span.parentNode.replaceChild(document.createTextNode(word), span);
            });
            clone.normalize();
            return { html: clone.innerHTML, variables };
        },

        /** Re-marks a saved snippet's words so editing picks up where it left off. */
        applyMarks(previewArea, variables) {
            if (!Array.isArray(variables) || variables.length === 0) return;
            variables.forEach((v, i) => {
                const word = (v.word || '').trim();
                if (!word) return;
                const made = this.markWord(previewArea, word, v.id || `$${i + 1}`, v.type || 'text');
                if (v.defaultValue && v.defaultValue !== word) {
                    made.forEach((span) => (span.dataset.varDefault = v.defaultValue));
                }
            });
        },
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
            btn.title = HintCommon.i18n.getMessage('formatText', 'Text Formatting');
            btn.dataset.i18nTitle = 'formatText';
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
            const getMsg = (key, fallback) => HintCommon.i18n.getMessage(key, fallback);
            return `
                    <div class="itg-format-modal-header">
                        <h2 data-i18n="textFormattingTitle">${getMsg('textFormattingTitle', 'Text Formatting')}</h2>
                        ${showCloseBtn ? `<button class="itg-format-close-btn" type="button" data-i18n-title="closeFormatNoApplyTooltip" title="${getMsg('closeFormatNoApplyTooltip', 'Close text formatting without applying changes')}">&times;</button>` : ''}
                    </div>
                    
                    <div class="itg-format-toolbar">
                        <!-- Row 1: Basic styles, Font Size, Text Color, BG Color, Link -->
                        <div class="itg-format-toolbar-row">
                            <button type="button" data-command="bold" data-i18n-title="formatBold" title="${getMsg('formatBold', 'Bold (Ctrl+B)')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
                            </button>
                            <button type="button" data-command="italic" data-i18n-title="formatItalic" title="${getMsg('formatItalic', 'Italic (Ctrl+I)')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
                            </button>
                            <button type="button" data-command="underline" data-i18n-title="formatUnderline" title="${getMsg('formatUnderline', 'Underline (Ctrl+U)')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
                            </button>
                            <button type="button" data-command="strikeThrough" data-i18n-title="formatStrikethrough" title="${getMsg('formatStrikethrough', 'Strikethrough')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 5V4H6v1m6-1v16m-2 0h4M4 12h16"></path>
                                </svg>
                            </button>
                            <button type="button" class="itg-format-trigger-fontSize" data-i18n-title="formatFontSize" title="${getMsg('formatFontSize', 'Font size')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z"/></svg>
                            </button>
                            <button type="button" class="itg-format-trigger-foreColor" data-i18n-title="formatTextColor" title="${getMsg('formatTextColor', 'Text color')}">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2zm-1.38 9L12 5.67 14.38 12H9.62z"></path><rect class="itg-color-indicator" x="0" y="20" width="24" height="4" fill="#9fc5e8"></rect></svg>
                            </button>
                            <button type="button" class="itg-format-trigger-backColor" data-i18n-title="formatBgColor" title="${getMsg('formatBgColor', 'Background color')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.59-.59 1.54 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z"/><rect class="itg-color-indicator" x="0" y="20" width="24" height="4" fill="#ffff00"></rect></svg>
                            </button>
                            <button type="button" data-command="createLink" data-i18n-title="formatInsertLink" title="${getMsg('formatInsertLink', 'Insert link')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                            </button>
                        </div>
                        <!-- Row 2: Alignments, Lists, Indent, Emoji -->
                        <div class="itg-format-toolbar-row">
                            <button type="button" data-command="justifyLeft" data-i18n-title="formatAlignLeft" title="${getMsg('formatAlignLeft', 'Align left')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 10h13M3 14h18M3 18h13M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="justifyCenter" data-i18n-title="formatCenter" title="${getMsg('formatCenter', 'Center')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 14h18m-4-4H7m10 8H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="justifyRight" data-i18n-title="formatAlignRight" title="${getMsg('formatAlignRight', 'Align right')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" transform="scale(-1 1)"><path d="M3 10h13M3 14h18M3 18h13M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="insertOrderedList" data-i18n-title="formatNumberedList" title="${getMsg('formatNumberedList', 'Numbered list')}">
                                <svg width="20" height="20" viewBox="0 0 56 56" fill="currentColor">
                                    <path d="M9.496 19.012c.914 0 1.524-.516 1.524-1.57v-7.57c0-.985-.704-1.618-1.711-1.618-.844 0-1.36.281-1.946.68l-1.64 1.148c-.493.328-.75.633-.75 1.125 0 .61.492 1.031 1.03 1.031.282 0 .446-.047.845-.328l1.078-.726h.023v6.257c0 1.055.633 1.57 1.547 1.57m8.133-2.836h32.086c1.078 0 1.898-.82 1.898-1.875 0-1.078-.82-1.899-1.898-1.899H17.629c-1.055 0-1.875.82-1.875 1.899 0 1.054.82 1.875 1.875 1.875M5.723 33.145h6.023c.656 0 1.125-.446 1.125-1.102 0-.703-.469-1.148-1.125-1.148H8.395v-.07l1.921-1.548c1.617-1.312 2.227-2.062 2.227-3.445 0-1.875-1.57-3.14-4.102-3.14-2.226 0-3.867 1.171-3.867 2.671 0 .75.492 1.149 1.29 1.149.538 0 .913-.164 1.218-.703.328-.563.773-.868 1.406-.868.703 0 1.172.446 1.172 1.102 0 .563-.281 1.055-1.476 2.016l-3.094 2.53c-.445.376-.633.798-.633 1.313 0 .727.492 1.242 1.266 1.242m11.906-2.79h32.086a1.876 1.876 0 0 0 1.898-1.898c0-1.055-.82-1.875-1.898-1.875H17.629c-1.055 0-1.875.82-1.875 1.875s.82 1.898 1.875 1.898M8.512 47.747c2.765 0 4.43-1.242 4.43-3.21 0-1.29-.915-2.18-2.532-2.321v-.07c1.195-.211 2.11-1.008 2.11-2.368 0-1.78-1.735-2.765-4.032-2.765-1.851 0-3.843.867-3.843 2.414 0 .656.468 1.125 1.195 1.125.515 0 .75-.211 1.078-.563.539-.586.984-.773 1.547-.773.726 0 1.265.351 1.265 1.054 0 .657-.539.985-1.5.985h-.28c-.657 0-1.079.328-1.079 1.008 0 .633.398 1.008 1.078 1.008h.305c1.055 0 1.617.351 1.617 1.078 0 .633-.586 1.101-1.36 1.101-.843 0-1.429-.468-1.874-.914-.282-.258-.516-.445-.938-.445-.773 0-1.312.445-1.312 1.172 0 1.617 2.203 2.484 4.125 2.484m9.117-3.234h32.086c1.078 0 1.898-.82 1.898-1.875 0-1.078-.82-1.899-1.898-1.899H17.629c-1.055 0-1.875.82-1.875 1.899 0 1.054.82 1.875 1.875 1.875"/>
                                </svg>
                            </button>
                            <button type="button" data-command="insertUnorderedList" data-i18n-title="formatBulletList" title="${getMsg('formatBulletList', 'Bullet list')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><path d="m8 6 13 .001m-13 6h13m-13 6h13M3.5 6h.01m-.01 6h.01m-.01 6h.01M4 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" data-command="indent" data-i18n-title="formatIncreaseIndent" title="${getMsg('formatIncreaseIndent', 'Increase indent')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>
                            </button>
                            <button type="button" data-command="outdent" data-i18n-title="formatDecreaseIndent" title="${getMsg('formatDecreaseIndent', 'Decrease indent')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M3 21h18v-2H3v2zM3 12l4 4V8l-4 4zm8 5h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/>
                                </svg>
                            </button>
                            <button type="button" class="itg-emoji-trigger" data-i18n-title="formatInsertEmoji" title="${getMsg('formatInsertEmoji', 'Insert emoji')}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
                            </button>
                        </div>
                        <!-- Row 3: mark the selected word as a variable and say what fills it in -->
                        <div class="itg-format-toolbar-row itg-format-var-row"></div>
                    </div>

                    <div class="itg-emoji-picker itg-display-none">
                        <div class="itg-emoji-grid"></div>
                    </div>

                    <div class="itg-format-preview-container">
                        <label data-i18n="formatPreview">${getMsg('formatPreview', 'Preview:')}</label>
                        <div class="itg-format-preview" contenteditable="true" spellcheck="false"></div>
                    </div>
                    
                    <div class="itg-format-modal-footer">
                        ${showApplyBtn ? `<button type="button" class="itg-format-apply-btn button" data-i18n="formatApply">${getMsg('formatApply', 'Apply')}</button>` : ''}
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

            // --- Variables: mark the selected word and say what fills it in ---
            const varRow = root.querySelector('.itg-format-var-row');
            let typeSelect = null;

            /**
             * Puts the caret back where it was before the picker took focus — but
             * only when it has actually left the preview. A live selection is never
             * overwritten with a remembered one, which would silently act on the
             * wrong word.
             */
            const ensurePreviewSelection = () => {
                if (!previewArea) return;
                const rootNode = previewArea.getRootNode();
                const sel = rootNode && rootNode.getSelection ? rootNode.getSelection() : window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const node = sel.getRangeAt(0).commonAncestorContainer;
                    if (previewArea === node || previewArea.contains(node)) return;
                }
                this._restoreSavedRange();
            };

            /** Keeps the picker showing the type of whatever variable is under the caret. */
            const syncTypeSelect = () => {
                if (!typeSelect || !previewArea) return;
                const span = HintCommon.SnippetVars.activeSpan(previewArea);
                typeSelect.value = span ? span.dataset.varType || 'text' : '';
            };

            if (varRow && previewArea) {
                typeSelect = HintCommon.createVarTypeSelect({
                    className: 'itg-var-type-select-wide',
                    prompt: HintCommon.i18n.getMessage('varSelectPrompt', 'Mark the selected word as a variable…'),
                    value: '',
                });
                typeSelect.title = HintCommon.i18n.getMessage(
                    'varTypeTooltip',
                    'Choose what the variable is filled in with',
                );
                varRow.appendChild(typeSelect);

                typeSelect.addEventListener('change', () => {
                    const type = typeSelect.value;
                    ensurePreviewSelection();
                    const active = HintCommon.SnippetVars.activeSpan(previewArea);
                    if (!type) {
                        // Back to the resting entry: the variable is retired.
                        if (active) HintCommon.SnippetVars.unmarkAll(previewArea, active);
                    } else if (active) {
                        HintCommon.SnippetVars.setType(previewArea, active, type);
                    } else {
                        HintCommon.SnippetVars.toggle(previewArea, type);
                    }
                    this.savedRange = null;
                    syncTypeSelect();
                });

                // Typing keeps the marks honest: a word written again is marked
                // there too, and a chip that grows into a longer word is retired.
                previewArea.addEventListener('input', (e) => {
                    if (e.isComposing) return;
                    HintCommon.SnippetVars.refreshMarks(previewArea, { liveTyping: true });
                    this.savedRange = null;
                    syncTypeSelect();
                });

                // The × on a chip retires the whole variable, every twin of it.
                previewArea.addEventListener('mousedown', (e) => {
                    const remove = e.target.closest?.(`.${HintCommon.SnippetVars.REMOVE_CLASS}`);
                    if (!remove) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const span = remove.closest(`.${HintCommon.SnippetVars.CLASS}`);
                    HintCommon.SnippetVars.unmarkAll(previewArea, span);
                    this.savedRange = null;
                    syncTypeSelect();
                });
            }

            if (previewArea) {
                previewArea.addEventListener('keyup', syncTypeSelect);
                previewArea.addEventListener('mouseup', syncTypeSelect);
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
         * Applies i18n translations to elements within the given container
         */
        _applyI18n(container) {
            if (!container) return;
            const getMsg = (key, fallback) => HintCommon.i18n.getMessage(key, fallback);
            container
                .querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label]')
                .forEach((el) => {
                    if (el.dataset.i18n && el.children.length === 0) {
                        el.textContent = getMsg(el.dataset.i18n, el.textContent);
                    }
                    if (el.dataset.i18nTitle) {
                        el.title = getMsg(el.dataset.i18nTitle, el.title);
                    }
                    if (el.dataset.i18nPlaceholder) {
                        const msg = getMsg(el.dataset.i18nPlaceholder, el.placeholder || el.dataset.placeholder || '');
                        if (el.hasAttribute('placeholder')) el.placeholder = msg;
                        if (el.hasAttribute('data-placeholder')) el.dataset.placeholder = msg;
                    }
                    if (el.dataset.i18nAriaLabel) {
                        el.setAttribute(
                            'aria-label',
                            getMsg(el.dataset.i18nAriaLabel, el.getAttribute('aria-label') || ''),
                        );
                    }
                });
        },

        /**
         * Shows the formatting editor inline (collapsible section) inside a given container element.
         * @param {Element} inlineSection - The container element to embed the editor into
         * @param {Element} targetElement - The element whose content will be edited
         * @param {Function} onApply - Called with (html, variables) when apply is clicked
         * @param {object} [options] - `variables` re-marks a saved snippet's words
         */
        async showInline(inlineSection, targetElement, onApply, options = {}) {
            await HintCommon.i18n.loadMessages();
            // Build editor HTML inside inlineSection
            inlineSection.innerHTML = `<div class="itg-inline-editor-content">${this._editorInnerHTML(true, false)}</div>`;

            const editorContent = inlineSection.querySelector('.itg-inline-editor-content');
            this.previewArea = editorContent.querySelector('.itg-format-preview');
            this.targetElement = targetElement;

            this._attachEditorListeners(editorContent, () => this.previewArea);
            this._applyI18n(editorContent);

            // Load current content
            let currentContent = targetElement.dataset.html || targetElement.innerHTML || targetElement.innerText || '';
            if (targetElement.dataset.placeholder && currentContent === targetElement.dataset.placeholder) {
                currentContent = '';
            }
            this.previewArea.innerHTML = currentContent;
            HintCommon.SnippetVars.applyMarks(this.previewArea, options.variables);

            // Apply button
            const applyBtn = editorContent.querySelector('.itg-format-apply-btn');
            if (applyBtn) {
                applyBtn.addEventListener('click', () => {
                    HintCommon.SnippetVars.refreshMarks(this.previewArea);
                    const { html, variables } = HintCommon.SnippetVars.extract(this.previewArea);
                    if (typeof onApply === 'function') {
                        onApply(html, variables);
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
         * Shows the formatting modal.
         * @param {Element} targetElement - element whose content is being edited
         * @param {object} [options] - `onApply(html, variables)` runs after the
         *   content is written back, `variables` re-marks a saved snippet's words
         */
        async showModal(targetElement, options = {}) {
            this.targetElement = targetElement;
            this.onApply = typeof options.onApply === 'function' ? options.onApply : null;
            await HintCommon.i18n.loadMessages();

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

            this._applyI18n(this.modal);

            // Load current content from target
            // Use dataset.html as priority to keep formatting even if display is plain text
            let currentContent = targetElement.dataset.html || targetElement.innerHTML || targetElement.innerText || '';
            if (targetElement.dataset.placeholder && currentContent === targetElement.dataset.placeholder) {
                currentContent = '';
            }
            this.previewArea.innerHTML = currentContent;
            HintCommon.SnippetVars.applyMarks(this.previewArea, options.variables);

            // The picker rests on its prompt until a word is marked in this snippet.
            const typePicker = this.modal.querySelector('.itg-var-type-select');
            if (typePicker) typePicker.value = '';

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
                const typeSelect = this.modal.querySelector('.itg-var-type-select');
                if (typeSelect) typeSelect.value = '';
            }
            this.targetElement = null;
            this.onApply = null;
            this.savedRange = null;
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

            const getMsg = (key, fallback) => HintCommon.i18n.getMessage(key, fallback);

            // Create popup
            const popup = document.createElement('div');
            popup.className = 'itg-link-popup';
            popup.innerHTML = `
                <div class="itg-link-popup-header">
                    <span data-i18n="formatLinkTitle">${getMsg('formatLinkTitle', 'Insert link')}</span>
                    <button type="button" class="itg-link-close-btn" data-i18n-title="closeModal" title="${getMsg('closeModal', 'Close')}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <input type="text" placeholder="https://example.com" spellcheck="false">
                <div class="itg-link-popup-actions">
                    <button type="button" class="itg-link-confirm" data-i18n="formatLinkConfirm">${getMsg('formatLinkConfirm', 'Insert')}</button>
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

            const getMsg = (key, fallback) => HintCommon.i18n.getMessage(key, fallback);
            // Add custom hex input and graphic picker section
            const customSection = document.createElement('div');
            customSection.className = 'itg-color-custom-section';
            customSection.innerHTML = `
                <input type="text" placeholder="#HEX" maxlength="7" spellcheck="false" data-i18n-title="formatHexColor" title="${getMsg('formatHexColor', 'Hexadecimal color')}" value="${currentColor}">
                <button type="button" class="itg-graphic-picker-btn" data-i18n-title="formatCustomizeGraphically" title="${getMsg('formatCustomizeGraphically', 'Customize graphically')}">
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
                // The word the caret was still sitting on is settled first, then the
                // marked variables are flattened back to plain words: the stored
                // expansion stays clean HTML and the marks travel in `variables`.
                HintCommon.SnippetVars.refreshMarks(this.previewArea);
                const { html: formattedContent, variables } = HintCommon.SnippetVars.extract(this.previewArea);
                const target = this.targetElement;
                const onApply = this.onApply;

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

                // hideModal() drops targetElement, so the callback runs on the copies
                // taken above and can safely reset the form it belongs to.
                this.hideModal();
                if (onApply) onApply(formattedContent, variables, target);
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

        // 5. While typing, clear any error state so errors only manifest on Enter or Blur
        el.addEventListener('input', () => {
            el.classList.remove('itg-input-error');
            el.classList.remove('error');
        });

        // 6. Blur / Enter: Validate and Restore if error, or Save if valid
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

            // Validate ONLY on Blur / Enter
            const isValid =
                options.required !== false && !currentPlainText
                    ? false
                    : options.validate
                      ? options.validate(currentPlainText)
                      : true;

            if (!isValid) {
                const hadError = hasChanged || !isValid;
                // Add error visual state
                el.classList.add('itg-input-error');
                el.classList.add('error');

                if (hadError && options.onError) {
                    options.onError(currentPlainText);
                }

                // Restore original value ONLY after the error color disappears (2 seconds)
                setTimeout(() => {
                    if (el.classList.contains('itg-input-error') || el.classList.contains('error')) {
                        el.classList.remove('itg-input-error');
                        el.classList.remove('error');
                        if (isInput) el.value = el.dataset.originalVal;
                        else {
                            el.innerText = el.dataset.originalVal;
                            if (options.useHtml) el.dataset.html = el.dataset.originalHtml;
                        }
                        if (options.onRestore) {
                            options.onRestore();
                        }
                    }
                }, 2000);
            } else if (hasChanged) {
                el.classList.remove('itg-input-error');
                el.classList.remove('error');
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
     * The three-dot menu that narrows a list of commands down to one section.
     *
     * The settings page and the shortcut modal show the same commands under the same
     * headings, and both already filter by section when `@name` is typed into their
     * search box. This is that filter with a mouse on it, and it is written here
     * because those two live in different worlds — one is a bundled page, the other is
     * built inside a shadow root — and this file is what they share.
     *
     * The popup opens on hover and is held open by an invisible bridge that covers the
     * gap down from the button, so crossing it does not close the menu.
     *
     * @param {object} options
     * @param {HTMLElement} options.container Where the button is appended.
     * @param {() => Array<{name: string, count: number}>} options.getSections Read
     *   every time the menu opens: sections appear as the page fills in.
     * @param {(name: string|null) => void} options.onSelect `null` means every section.
     * @param {() => (string|null)} [options.getActive] Which one is on, for the mark.
     * @returns {HTMLElement} The menu, already inside the container.
     */
    createSectionFilter({ container, getSections, onSelect, getActive = () => null }) {
        const msg = (key, fallback) => this.i18n.getMessage(key, [], fallback);
        const create = this.DOM.create;

        const menu = create('div', { className: 'itg-section-filter' });
        const button = create('div', {
            className: 'itg-section-filter-btn',
            role: 'button',
            tabindex: '0',
            'aria-haspopup': 'true',
            'data-i18n-title': 'filterBySection',
            title: msg('filterBySection', 'Filter by section'),
        });
        /*
         * `#icon-more-vertical` drawn out longhand: neither surface carries the icon
         * sheet the group list pulls it from with `<use>`. Same path, same `fill-rule`,
         * and the same 24px the button beside the group list's own search box uses —
         * the three-dot button of a card is a smaller one, and this is not that.
         */
        button.innerHTML =
            '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" d="M12 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2m3 1a3 3 0 1 1-6 0 3 3 0 0 1 6 0m-3 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2m3 1a3 3 0 1 1-6 0 3 3 0 0 1 6 0m-4 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0m1 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>' +
            '</svg>';

        const popup = create('div', { className: 'itg-section-filter-popup' });
        popup.appendChild(create('div', { className: 'itg-section-filter-bridge' }));
        const list = create('div', { className: 'itg-section-filter-list' });
        popup.appendChild(list);
        menu.appendChild(button);
        menu.appendChild(popup);
        container.appendChild(menu);

        const render = () => {
            const active = getActive();
            list.textContent = '';
            const rows = [
                { name: null, label: msg('sectionFilterAll', 'All sections'), count: null },
                ...getSections().map((section) => ({
                    name: section.name,
                    label: section.name,
                    count: section.count,
                })),
            ];
            rows.forEach((row) => {
                const item = create('div', {
                    className: 'itg-section-filter-item',
                    role: 'button',
                    tabindex: '0',
                });
                const isActive = row.name
                    ? !!active && row.name.toLowerCase() === String(active).toLowerCase()
                    : !active;
                if (isActive) item.classList.add('active');
                item.appendChild(create('span', { className: 'itg-section-filter-label' }, row.label));
                if (row.count !== null && row.count !== undefined) {
                    item.appendChild(create('span', { className: 'itg-section-filter-count' }, String(row.count)));
                }
                const choose = () => {
                    menu.classList.remove('open');
                    onSelect(row.name);
                };
                item.addEventListener('click', choose);
                item.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        choose();
                    }
                });
                list.appendChild(item);
            });
        };

        /*
         * A wheel anywhere over the menu belongs to the menu.
         *
         * Only the list scrolls; the popup's padding and the bridge that reaches out
         * past it are not scroll containers, so a wheel that starts over either of
         * them was going straight through to whatever is behind — in the shortcut
         * modal, the modal, which scrolled away under the open menu. `contain` in the
         * stylesheet stops the chaining once the list is at its end; this is for the
         * part of the menu that is not the list.
         */
        popup.addEventListener(
            'wheel',
            (event) => {
                if (list.scrollHeight <= list.clientHeight) {
                    event.preventDefault();
                    return;
                }
                if (!list.contains(event.target)) {
                    list.scrollTop += event.deltaY;
                    event.preventDefault();
                }
            },
            { passive: false },
        );

        // Hover is what opens it; `open` is for the keyboard, which has no hover.
        menu.addEventListener('mouseenter', render);
        menu.addEventListener('mouseleave', () => menu.classList.remove('open'));
        button.addEventListener('click', () => {
            render();
            menu.classList.toggle('open');
        });
        button.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                render();
                menu.classList.add('open');
                list.querySelector('.itg-section-filter-item')?.focus();
            } else if (event.key === 'Escape') {
                menu.classList.remove('open');
            }
        });
        menu.addEventListener('focusout', (event) => {
            if (!menu.contains(event.relatedTarget)) menu.classList.remove('open');
        });

        return menu;
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

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes['preferred-language']) {
            HintCommon.i18n.loadMessages(true);
        }
    });
}
try {
    HintCommon.i18n.loadMessages();
} catch {}

// Export logic
if (typeof window !== 'undefined') {
    window.HintCommon = HintCommon;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HintCommon;
}
