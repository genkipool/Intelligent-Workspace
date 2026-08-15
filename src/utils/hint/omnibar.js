var OmniBar = class OmniBar {
    constructor() {
        this.active = false;
        this.host = null;
        this.shadow = null;
        this.registry = null; // Reference to CommandRegistry
        this.matches = [];
        this.tabs = [];
        this.selectedIndex = 0;
        this.filterObserver = null;
        this.debouncedSearch = null;
        this.selectedActionItems = new Set();
        this.lastSelectedActionIdx = null;
        this.useRegex = false;
        this.atrSelectingRule = false;
        this.atrPendingUrls = [];
        this.crSelectingTabsFor = null;
        this.hasNavigated = false;
        this._inputSeq = 0;
        this._keyboardNav = false;
    }
    setRegistry(registry) {
        this.registry = registry;
    }
    hasFocus() {
        if (!this.shadow) return false;
        const input = this.shadow.getElementById('hint-omni-input');
        return this.shadow.activeElement === input;
    }
    recoverFocus() {
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        if (this.shadow) {
            const input = this.shadow.getElementById('hint-omni-input');
            if (input) {
                input.focus();
                const length = input.value.length;
                input.setSelectionRange(length, length);
            }
        }
    }
    async open() {
        if (this.active) return;
        if (!chrome.runtime || !chrome.runtime.id) {
            console.warn('[Hint] Cannot open OmniBar: Extension context invalidated.');
            return;
        }
        this.active = true;
        this.matches = [];
        this.selectedActionItems.clear();
        this.lastSelectedActionIdx = null;
        this.atrSelectingRule = false;
        this.atrPendingUrls = [];
        this.crSelectingTabsFor = null;
        this.hasNavigated = false;
        let currentTheme = null;
        try {
            currentTheme = await chrome.runtime.sendMessage({
                action: 'getActiveTheme',
            });
        } catch (e) {
            console.warn('OmniBar theme error', e);
        }
        this.host = document.createElement('div');
        this.host.id = 'hint-omni-host';
        // Note: position and basic layout kept as inline for critical layout isolation
        this.host.style.cssText =
            'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 2147483647; pointer-events: none; opacity: 0; display: flex; justify-content: center; align-items: flex-start;';
        document.body.appendChild(this.host);
        this._syncFilter();
        this.filterObserver = new MutationObserver(() => this._syncFilter());
        this.filterObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style', 'itg-mode-applied'],
        });
        this.shadow = this.host.attachShadow({
            mode: 'open',
        });
        await Utils.loadThemes(this.shadow);

        // Apply initial theme/mode
        const pageMode = document.documentElement.getAttribute('data-itg-page-mode');
        Utils.applyThemeToHost(this.host, currentTheme, pageMode);
        try {
            await Utils.loadStyle(this.shadow, chrome.runtime.getURL('src/styles/hint_content.css'));
        } catch (e) {
            console.warn('[Hint] Failed to load hint_content.css style', e);
        }
        const bar = document.createElement('div');
        bar.id = 'hint-omni-bar';
        bar.className = 'hint-omni-bar';
        bar.style.pointerEvents = 'auto';
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'hint-omni-input-wrapper';
        const input = document.createElement('input');
        input.id = 'hint-omni-input';
        input.className = 'hint-omni-input';
        input.type = 'text';
        input.placeholder =
            chrome.i18n.getMessage('omnibarPlaceholder') ||
            'Search tabs or use prefixes (@, we:, wp:, wv:, b:, h:, c:, dg:, dt:, f:, qai:, qaia:, lai:, laiq:, limg:, lnt:, bg:, ccr:)...';
        input.autocomplete = 'off';
        const counter = document.createElement('span');
        counter.id = 'hint-omni-counter';
        counter.className = 'hint-omni-counter';
        inputWrapper.appendChild(input);
        inputWrapper.appendChild(counter);

        // Regex toggle button
        const regexBtn = document.createElement('button');
        regexBtn.id = 'hint-omni-regex-btn';
        regexBtn.className = 'hint-omni-regex-btn';
        regexBtn.title = chrome.i18n.getMessage('omnibarRegexSearchTooltip') || 'Toggle Regex Search';
        regexBtn.textContent = '.*';
        if (this.useRegex) {
            regexBtn.classList.add('active');
        }
        regexBtn.addEventListener('click', () => {
            this.useRegex = !this.useRegex;
            regexBtn.classList.toggle('active', this.useRegex);
            input.focus();
            this._handleInput({
                target: input,
            });
        });
        inputWrapper.appendChild(regexBtn);
        const results = document.createElement('ul');
        results.id = 'hint-omni-results';
        results.className = 'hint-omni-results';
        bar.appendChild(inputWrapper);
        bar.appendChild(results);
        this.shadow.appendChild(bar);

        // Overlay scroll chaining fix
        bar.addEventListener(
            'wheel',
            (e) => {
                const resultsList = this.shadow.getElementById('hint-omni-results');
                if (resultsList) {
                    const { scrollTop, scrollHeight, clientHeight } = resultsList;
                    const isScrollable = scrollHeight > clientHeight;
                    const delta = e.deltaY;
                    const isAtTop = scrollTop === 0 && delta < 0;
                    const isAtBottom = scrollTop + clientHeight >= scrollHeight && delta > 0;
                    if (!isScrollable || isAtTop || isAtBottom) {
                        e.preventDefault();
                    }
                } else {
                    e.preventDefault();
                }
                e.stopPropagation();
            },
            {
                passive: false,
            },
        );
        input.focus();
        input.addEventListener('input', (e) => this._handleInput(e));
        input.addEventListener('keydown', (e) => this._handleKey(e));

        // Track if the next blur is from clicking inside an expand panel (so we don't steal focus)
        this._blurFromExpand = false;
        this.shadow.addEventListener('mousedown', (e) => {
            const isExpand =
                e.target &&
                e.target.closest &&
                e.target.closest(
                    '.hint-omni-conv-expand, .hint-omni-img-expand, .hint-omni-ai-response, .hint-omni-note-expand',
                );
            this._blurFromExpand = !!isExpand;
        });
        input.addEventListener('blur', () => {
            if (this.active && !this._blurFromExpand) {
                setTimeout(() => {
                    if (this.active) input.focus();
                }, 0);
            }
            this._blurFromExpand = false;
        });
        this._boundOutsideClick = (e) => {
            if (this.host && !e.composedPath().includes(this.host)) this.close();
        };
        document.addEventListener('mousedown', this._boundOutsideClick, true);
        requestAnimationFrame(() => {
            this.host.style.transition = 'opacity 150ms ease-in';
            this.host.style.opacity = '1';
        });
        this.debouncedSearch = Utils.debounce((query) => {
            if (query) {
                this.matches = this._findTextInPage(query);
                this._renderResults(this.matches, 'inpage');
            } else {
                this.matches = [];
                this._renderResults([], 'none');
            }
        }, 300);
        chrome.runtime.sendMessage(
            {
                action: 'getOpenTabs',
            },
            (res) => {
                if (res && res.success) {
                    this.tabs = res.tabs;
                    this._renderResults(this.tabs, 'tab');
                }
            },
        );
    }
    cleanup() {
        this.close();
        // Just in case it was closed but the host still existed or there were other unbound listeners
        if (this._boundOutsideClick) {
            document.removeEventListener('mousedown', this._boundOutsideClick, true);
            this._boundOutsideClick = null;
        }
    }
    close() {
        if (this._keepOpenOnClose) return;
        if (!this.active) return;
        this.active = false;
        if (this.filterObserver) {
            this.filterObserver.disconnect();
            this.filterObserver = null;
        }
        if (this.host) this.host.remove();
        document.removeEventListener('mousedown', this._boundOutsideClick, true);
        this.host = null;
        this.shadow = null;
        this.matches = [];
        this.selectedActionItems.clear();
        this.atrSelectingRule = false;
        this.atrPendingUrls = [];
        this.crSelectingTabsFor = null;
    }
    _syncFilter() {
        if (!this.host) return;
        const pf = window.getComputedStyle(document.documentElement).filter;
        this.host.style.filter = pf !== 'none' ? pf : 'none';
    }
    _handleInput(event) {
        if (!chrome.runtime || !chrome.runtime.id) {
            console.warn('[Hint] Extension context invalidated.');
            return;
        }
        const query = event.target.value;
        const lower = query.toLowerCase();

        // -- Prefix Selector Trigger (default: @) --------------
        const trigger = this.registry ? this.registry.getRawShortcuts()['prefixSelector'] || '@' : '@';
        if (query.startsWith(trigger)) {
            const prefixList = [
                {
                    prefix: this._getPrefixVal('we:', 'omnibarPrefixPopupDesc'),
                    title: chrome.i18n.getMessage('omnibarPrefixPopupTitle') || 'Open Popup',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixPopupDesc') ||
                        'Select a tab to open as a standalone popup window',
                },
                {
                    prefix: this._getPrefixVal('wp:', 'omnibarPrefixPipDesc'),
                    title: chrome.i18n.getMessage('omnibarPrefixPipTitle') || 'Open PiP',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixPipDesc') ||
                        'Select a tab to open as Document Picture-in-Picture',
                },
                {
                    prefix: this._getPrefixVal('wv:', 'omnibarPrefixVideoPipDesc'),
                    title: chrome.i18n.getMessage('omnibarPrefixVideoPipTitle') || 'Open Video PiP',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixVideoPipDesc') ||
                        'Select a tab to open as Video Picture-in-Picture',
                },
                {
                    prefix: this._getPrefixVal('b:', 'prefixSearchBookmarks'),
                    title: chrome.i18n.getMessage('omnibarPrefixBookmarksTitle') || 'Bookmarks',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixBookmarksDesc') || 'Search through your browser bookmarks',
                },
                {
                    prefix: this._getPrefixVal('h:', 'prefixSearchHistory'),
                    title: chrome.i18n.getMessage('omnibarPrefixHistoryTitle') || 'History',
                    desc: chrome.i18n.getMessage('omnibarPrefixHistoryDesc') || 'Search through your browsing history',
                },
                {
                    prefix: this._getPrefixVal('c:', 'prefixSearchRecentlyClosed'),
                    title: chrome.i18n.getMessage('omnibarPrefixClosedTitle') || 'Recently Closed',
                    desc: chrome.i18n.getMessage('omnibarPrefixClosedDesc') || 'Browse and reopen recently closed tabs',
                },
                {
                    prefix: this._getPrefixVal('dg:', 'prefixDeleteGroup'),
                    title: chrome.i18n.getMessage('omnibarPrefixGroupsTitle') || 'Tab Groups',
                    desc: chrome.i18n.getMessage('omnibarPrefixGroupsDesc') || 'Search and switch between tab groups',
                },
                {
                    prefix: this._getPrefixVal('dt:', 'prefixDeleteTab'),
                    title: chrome.i18n.getMessage('omnibarPrefixTabsDeleteTitle') || 'Tabs (Delete)',
                    desc: chrome.i18n.getMessage('omnibarPrefixTabsDeleteDesc') || 'Search and delete multiple tabs',
                },
                {
                    prefix: this._getPrefixVal('bgr:', 'omnibarPrefixBackupDesc'),
                    title: chrome.i18n.getMessage('omnibarPrefixBackupTitle') || 'Backups',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixBackupDesc') ||
                        'Search and restore backed up groups and tabs',
                },
                {
                    prefix: this._getPrefixVal('bg:', 'omnibarPrefixBackupNowDesc'),
                    title: chrome.i18n.getMessage('omnibarPrefixBackupNowTitle') || 'Backup Groups',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixBackupNowDesc') ||
                        'Backup tab groups that do not have a backup yet',
                },
                {
                    prefix: this._getPrefixVal('f:', 'prefixSearchText'),
                    title: chrome.i18n.getMessage('omnibarPrefixDeepSearchTitle') || 'Deep Search',
                    desc: chrome.i18n.getMessage('omnibarPrefixDeepSearchDesc') || 'Full-text search in all open tabs',
                },
                {
                    prefix: this._getPrefixVal('qai:', 'prefixQueryAI'),
                    title: chrome.i18n.getMessage('omnibarPrefixAiQueryTitle') || 'AI Query',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixAiQueryDesc') ||
                        'Ask a question to the configured AI model',
                },
                {
                    prefix: this._getPrefixVal('qaia:', 'prefixQueryAIAgent'),
                    title: chrome.i18n.getMessage('omnibarPrefixAiAgentTitle') || 'AI Agent',
                    desc: chrome.i18n.getMessage('omnibarPrefixAiAgentDesc') || 'Ask the AI agent to perform actions',
                },
                {
                    prefix: this._getPrefixVal('lai:', 'prefixListConversations'),
                    title: chrome.i18n.getMessage('omnibarPrefixConversationsTitle') || 'Conversations',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixConversationsDesc') ||
                        'Browse your AI conversation history',
                },
                {
                    prefix: this._getPrefixVal('laiq:', 'prefixListQueries'),
                    title: chrome.i18n.getMessage('omnibarPrefixMessagesTitle') || 'AI Messages',
                    desc: chrome.i18n.getMessage('omnibarPrefixMessagesDesc') || 'Search through all AI messages',
                },
                {
                    prefix: this._getPrefixVal('limg:', 'prefixListImages'),
                    title: chrome.i18n.getMessage('omnibarPrefixImagesTitle') || 'Images',
                    desc: chrome.i18n.getMessage('omnibarPrefixImagesDesc') || 'Browse captured screenshots and images',
                },
                {
                    prefix: this._getPrefixVal('lnt:', 'prefixListNotes'),
                    title: chrome.i18n.getMessage('omnibarPrefixNotesTitle') || 'Notes',
                    desc: chrome.i18n.getMessage('omnibarPrefixNotesDesc') || 'Browse and search your saved notes',
                },
                {
                    prefix: this._getPrefixVal('atcr:', 'omnibarPrefixAddToExistingRule'),
                    title: chrome.i18n.getMessage('omnibarPrefixAddToExistingRuleTitle') || 'Add Active Tab to Rule',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixAddToExistingRuleDesc') ||
                        'Add the active tab to an existing rule',
                },
                {
                    prefix: this._getPrefixVal('atr:', 'omnibarPrefixAddToRule'),
                    title: chrome.i18n.getMessage('omnibarPrefixAddToRuleTitle') || 'Add Tabs to Rule',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixAddToRuleDesc') ||
                        'Add open tabs or manual URLs/domains to an existing rule',
                },
                {
                    prefix: this._getPrefixVal('rl:', 'omnibarPrefixRulesSearch'),
                    title: chrome.i18n.getMessage('omnibarPrefixRulesTitle') || 'Rules',
                    desc: chrome.i18n.getMessage('omnibarPrefixRulesDesc') || 'Search rules and open URLs',
                },
                {
                    prefix: this._getPrefixVal('cr:', 'omnibarPrefixRulesCreate'),
                    title: chrome.i18n.getMessage('omnibarPrefixRulesCreateTitle') || 'Create Rule',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixRulesCreateDesc') ||
                        "Create a new rule. Type 'cr: rule_name' to create and select tabs, or 'cr: rule_name, url1, url2' to add URLs directly.",
                },
                {
                    prefix: this._getPrefixVal('ccr:', 'omnibarPrefixChangeRuleColor'),
                    title: chrome.i18n.getMessage('omnibarPrefixChangeRuleColorTitle') || 'Change Rule Color',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixChangeRuleColorDesc') ||
                        'Select rules and change their color',
                },
                {
                    prefix: this._getPrefixVal('ccg:', 'omnibarPrefixChangeGroupColor'),
                    title: chrome.i18n.getMessage('omnibarPrefixChangeGroupColorTitle') || 'Change Group Color',
                    desc: chrome.i18n.getMessage('omnibarPrefixChangeGroupColorDesc') || 'Change groups color',
                },
                {
                    prefix: this._getPrefixVal('dr:', 'omnibarPrefixRulesDelete'),
                    title: chrome.i18n.getMessage('omnibarPrefixRulesDeleteTitle') || 'Rules (Delete)',
                    desc: chrome.i18n.getMessage('omnibarPrefixRulesDeleteDesc') || 'Delete rules or rule domains',
                },
                {
                    prefix: this._getPrefixVal('er:', 'omnibarPrefixRulesEdit'),
                    title: chrome.i18n.getMessage('omnibarPrefixRulesEditTitle') || 'Rules (Edit)',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixRulesEditDesc') ||
                        'Select a rule or URL to rename/edit it',
                },
                {
                    prefix: this._getPrefixVal('st:', 'omnibarPrefixTutorial'),
                    title: chrome.i18n.getMessage('omnibarPrefixTutorialTitle') || 'Omnibar Tutorial',
                    desc:
                        chrome.i18n.getMessage('omnibarPrefixTutorialDesc') ||
                        'Learn how to use the Omnibar features and shortcuts',
                },
                // The site searches are prefixes like any other and belong on this list.
                ...this._getSiteSearchPrefixes(),
            ];
            // Typing after the trigger narrows the list: `@b` shows the commands whose
            // prefix or name mentions it, and the prefix matches come first. The
            // description only counts when nothing else matched, so a common letter
            // does not bring the whole list back.
            const filter = query.slice(trigger.length).trim().toLowerCase();
            let shown = prefixList;
            if (filter) {
                const byPrefix = prefixList.filter((item) => (item.prefix || '').toLowerCase().includes(filter));
                const byTitle = prefixList.filter(
                    (item) => !byPrefix.includes(item) && (item.title || '').toLowerCase().includes(filter),
                );
                shown = [...byPrefix, ...byTitle];
                if (shown.length === 0) {
                    shown = prefixList.filter((item) => (item.desc || '').toLowerCase().includes(filter));
                }
            }
            if (shown.length === 0) {
                this._renderResults(
                    [
                        {
                            prefix: '',
                            title: chrome.i18n.getMessage('omnibarNoMatchingPrefixes') || 'No matching commands',
                            desc: '',
                        },
                    ],
                    'prefix',
                );
                return;
            }
            this._renderResults(shown, 'prefix');
            return;
        }

        // -- st: Omnibar Tutorial -----------------------------
        const pTutorial = this._getPrefixVal('st:', 'omnibarPrefixTutorial');
        if (lower.startsWith(pTutorial)) {
            const tutorialList = [
                {
                    title: chrome.i18n.getMessage('omnibarTutorialTriggerTitle') || 'Prefix Selector (@)',
                    url:
                        chrome.i18n.getMessage('omnibarTutorialTriggerDesc') ||
                        "Type '@' to view all available commands and search categories.",
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.82 0 3.53-.5 5-1.35l-1.42-1.42C14.51 19.72 13.3 20 12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8c0 .88-.36 1.68-.96 2.27-.4.39-.95.73-1.54.73-.83 0-1.5-.67-1.5-1.5V11c0-2.21-1.79-4-4-4s-4 1.79-4 4 1.79 4 4 4c1.19 0 2.26-.52 3.01-1.35.34.82 1.13 1.35 2.09 1.35.9 0 1.75-.43 2.37-1.07C19.43 14.93 20 13.53 20 12c0-5.52-4.48-10-10-10zm-2 11c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="var(--text-color)"/></svg>',
                },
                {
                    title: chrome.i18n.getMessage('omnibarTutorialSelectionTitle') || 'Multiple Selection',
                    url:
                        chrome.i18n.getMessage('omnibarTutorialSelectionDesc') ||
                        'Click items or use Space to select multiple tabs/rules/groups for bulk actions.',
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z" fill="var(--text-color)"/></svg>',
                },
                {
                    title: chrome.i18n.getMessage('omnibarTutorialEnterTitle') || 'Press Enter',
                    url:
                        chrome.i18n.getMessage('omnibarTutorialEnterDesc') ||
                        'Press Enter to execute the action for selected items or focused option.',
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 9h-6V3H5v18h14V9zM12 5v4h2v2h-4v2h4v2l3-3-3-3v2h-2V5h-2z" fill="var(--text-color)"/></svg>',
                },
                {
                    title: chrome.i18n.getMessage('omnibarTutorialCtrlEnterTitle') || 'Press Ctrl + Enter',
                    url:
                        chrome.i18n.getMessage('omnibarTutorialCtrlEnterDesc') ||
                        'Press Ctrl+Enter to execute the action without closing the Omnibar.',
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6h16v12H4V6zm2 2v8h12V8H6z" fill="var(--text-color)"/></svg>',
                },
            ];
            this._renderResults(tutorialList, 'tutorial-hint');
            return;
        }
        const prefixes = {};
        prefixes[this._getPrefixVal('b:', 'prefixSearchBookmarks')] = 'searchBookmarks';
        prefixes[this._getPrefixVal('h:', 'prefixSearchHistory')] = 'getHistory';
        prefixes[this._getPrefixVal('c:', 'prefixSearchRecentlyClosed')] = 'getRecentlyClosed';
        prefixes[this._getPrefixVal('dg:', 'prefixDeleteGroup')] = 'getTabGroups';
        prefixes[this._getPrefixVal('dt:', 'prefixDeleteTab')] = 'getOpenTabs';

        // -- we: Open Popup / wp: Open PiP / wv: Open Video PiP -----
        const pPopup = this._getPrefixVal('we:', 'omnibarPrefixPopupDesc');
        const pPip = this._getPrefixVal('wp:', 'omnibarPrefixPipDesc');
        const pVideoPip = this._getPrefixVal('wv:', 'omnibarPrefixVideoPipDesc');
        if (lower.startsWith(pPopup) || lower.startsWith(pPip) || lower.startsWith(pVideoPip)) {
            const isPopup = lower.startsWith(pPopup);
            const isVideoPip = lower.startsWith(pVideoPip);
            const prefixUsed = isPopup ? pPopup : isVideoPip ? pVideoPip : pPip;
            const q = query.substring(prefixUsed.length).trim();
            const filtered = this.tabs.filter((t) => this._itemMatchesQuery('tab', t, q));
            this._renderResults(filtered, isPopup ? 'popup-tab' : isVideoPip ? 'video-pip-tab' : 'pip-tab');
            return;
        }

        // -- Site searches (g:, y:, d:, w:, gm:, x:, am:, ams:) --
        // These only act on Enter, so without a row the box looked dead while typing.
        const site = this._getSiteSearchPrefixes().find((entry) => lower.startsWith(entry.prefix));
        if (site) {
            const q = query.substring(site.prefix.length).trim();
            const hint = chrome.i18n.getMessage('omnibarPressEnterToSearch') || 'Press Enter to search';
            this._renderResults(
                [
                    {
                        title: q ? `${site.title}: ${q}` : site.desc,
                        url: hint,
                        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7" stroke="var(--text-color)" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="var(--text-color)" stroke-width="2" stroke-linecap="round"/></svg>',
                    },
                ],
                'site-search',
            );
            return;
        }

        // -- qai: AI Query --------------------------------------
        const pQai = this._getPrefixVal('qai:', 'prefixQueryAI');
        if (lower.startsWith(pQai)) {
            const q = query.substring(pQai.length).trim();
            if (!q) {
                this._renderResults(
                    [
                        {
                            title:
                                chrome.i18n.getMessage('omnibarAiWriteQuestion') ||
                                'Type your question and press Enter...',
                            url: chrome.i18n.getMessage('omnibarAiConfiguredModel') || 'Query the configured AI model',
                            icon: '<svg width="24" height="24" aria-hidden="true" viewBox="0 0 471 471" xmlns="http://www.w3.org/2000/svg"><path fill="var(--text-color)" d="M235.5 471q0-48.866-18.84-91.845-18.252-42.978-50.044-74.771T91.845 254.34Q48.867 235.5 0 235.5q48.867 0 91.845-18.251 42.979-18.84 74.771-50.633t50.044-74.771Q235.5 48.867 235.5 0q0 48.867 18.251 91.845 18.84 42.978 50.633 74.771t74.771 50.633Q422.134 235.499 471 235.5q-48.866 0-91.845 18.84-42.978 18.252-74.771 50.044-31.793 31.793-50.633 74.771Q235.501 422.134 235.5 471"></path></svg>',
                        },
                    ],
                    'ai-hint',
                );
            } else {
                this._renderResults(
                    [
                        {
                            title:
                                chrome.i18n.getMessage('omnibarAiAsk', [q]) ||
                                `<svg width="24" height="24" aria-hidden="true" viewBox="0 0 471 471" xmlns="http://www.w3.org/2000/svg"><path fill="var(--text-color)" d="M235.5 471q0-48.866-18.84-91.845-18.252-42.978-50.044-74.771T91.845 254.34Q48.867 235.5 0 235.5q48.867 0 91.845-18.251 42.979-18.84 74.771-50.633t50.044-74.771Q235.5 48.867 235.5 0q0 48.867 18.251 91.845 18.84 42.978 50.633 74.771t74.771 50.633Q422.134 235.499 471 235.5q-48.866 0-91.845 18.84-42.978 18.252-74.771 50.044-31.793 31.793-50.633 74.771Q235.501 422.134 235.5 471"></path></svg> Ask: ${q}`,
                            url: chrome.i18n.getMessage('omnibarAiSendHint') || 'Press Enter to send the query to AI',
                            icon: '<svg width="24" height="24" aria-hidden="true" viewBox="0 0 471 471" xmlns="http://www.w3.org/2000/svg"><path fill="var(--text-color)" d="M235.5 471q0-48.866-18.84-91.845-18.252-42.978-50.044-74.771T91.845 254.34Q48.867 235.5 0 235.5q48.867 0 91.845-18.251 42.979-18.84 74.771-50.633t50.044-74.771Q235.5 48.867 235.5 0q0 48.867 18.251 91.845 18.84 42.978 50.633 74.771t74.771 50.633Q422.134 235.499 471 235.5q-48.866 0-91.845 18.84-42.978 18.252-74.771 50.044-31.793 31.793-50.633 74.771Q235.501 422.134 235.5 471"></path></svg>',
                        },
                    ],
                    'ai-hint',
                );
            }
            return;
        }

        // -- qaia: AI Agent Query -----------------------------
        const pQaia = this._getPrefixVal('qaia:', 'prefixQueryAIAgent');
        if (lower.startsWith(pQaia)) {
            const q = query.substring(pQaia.length).trim();
            if (!q) {
                this._renderResults(
                    [
                        {
                            title:
                                chrome.i18n.getMessage('omnibarAgentWriteQuestion') ||
                                'Write your agent query and press Enter...',
                            url:
                                chrome.i18n.getMessage('omnibarAgentHint') ||
                                'The agent will perform actions in your browser',
                            icon: '<svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"></path></svg>',
                        },
                    ],
                    'ai-hint',
                );
            } else {
                this._renderResults(
                    [
                        {
                            title:
                                chrome.i18n.getMessage('omnibarAgentAsk', [q]) ||
                                `<svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"></path></svg> Agent: ${q}`,
                            url: chrome.i18n.getMessage('omnibarAgentSendHint') || 'Press Enter to launch the agent',
                            icon: '<svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"></path></svg>',
                        },
                    ],
                    'ai-hint',
                );
            }
            return;
        }

        // -- lai: List conversations ------------------------------
        const pLai = this._getPrefixVal('lai:', 'prefixListConversations');
        if (lower.startsWith(pLai)) {
            const q = query.substring(pLai.length).trim().toLowerCase();
            this._renderResults(
                [
                    {
                        title: chrome.i18n.getMessage('omnibarLoadingConversations') || 'Loading conversations...',
                        url: '',
                        icon: '[CONV]',
                    },
                ],
                'ai-hint',
            );
            const seq = ++this._inputSeq;
            chrome.runtime.sendMessage(
                {
                    action: 'getOmnibarConversations',
                },
                (res) => {
                    if (seq !== this._inputSeq) return;
                    let convs = res && res.success ? res.conversations : [];
                    if (q) convs = convs.filter((c) => c.title.toLowerCase().includes(q));
                    if (convs.length === 0)
                        convs = [
                            {
                                title: chrome.i18n.getMessage('omnibarNoConversations') || 'No conversations found',
                                url: '',
                                icon: '[CONV]',
                            },
                        ];
                    this._renderResults(convs, 'conversation');
                },
            );
            return;
        }

        // -- laiq: List all AI messages -------------------------
        const pLaiq = this._getPrefixVal('laiq:', 'prefixListQueries');
        if (lower.startsWith(pLaiq)) {
            const q = query.substring(pLaiq.length).trim().toLowerCase();
            this._renderResults(
                [
                    {
                        title: chrome.i18n.getMessage('loadingMessages') || 'Loading messages...',
                        url: '',
                        icon: '<svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"></path></svg>',
                    },
                ],
                'ai-hint',
            );
            const seq = ++this._inputSeq;
            chrome.runtime.sendMessage(
                {
                    action: 'getOmnibarAllMessages',
                },
                (res) => {
                    if (seq !== this._inputSeq) return;
                    let msgs = res && res.success ? res.messages : [];
                    if (q)
                        msgs = msgs.filter((m) =>
                            this._itemMatchesQuery('text', (m.query || '') + ' ' + (m.answer || ''), q),
                        );
                    if (msgs.length === 0)
                        msgs = [
                            {
                                title: chrome.i18n.getMessage('omnibarNoMessages') || 'No messages found',
                                url: '',
                                icon: '<svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"></path></svg>',
                            },
                        ];
                    this._renderResults(msgs, 'message');
                },
            );
            return;
        }

        // -- lnt: List notes ----------------------------------------
        const pLnt = this._getPrefixVal('lnt:', 'prefixListNotes');
        if (lower.startsWith(pLnt)) {
            const q = query.substring(pLnt.length).trim().toLowerCase();
            this._renderResults(
                [
                    {
                        title: chrome.i18n.getMessage('loadingNotes') || 'Loading notes...',
                        url: '',
                        icon: '[TEXT]',
                    },
                ],
                'ai-hint',
            );
            const seq = ++this._inputSeq;
            chrome.runtime.sendMessage(
                {
                    action: 'getOmnibarNotes',
                },
                (res) => {
                    if (seq !== this._inputSeq) return;
                    let notes = res && res.success ? res.notes : [];
                    if (q)
                        notes = notes.filter((n) =>
                            this._itemMatchesQuery('text', (n.title || '') + ' ' + (n.plainText || ''), q),
                        );
                    if (notes.length === 0)
                        notes = [
                            {
                                title: chrome.i18n.getMessage('omnibarNoNotes') || 'No notes found',
                                url: '',
                                icon: '[TEXT]',
                            },
                        ];
                    this._renderResults(notes, 'note');
                },
            );
            return;
        }

        // -- limg: List images ------------------------------------
        const pLimg = this._getPrefixVal('limg:', 'prefixListImages');
        if (lower.startsWith(pLimg)) {
            const q = query.substring(pLimg.length).trim().toLowerCase();
            this._renderResults(
                [
                    {
                        title: chrome.i18n.getMessage('loadingImages') || 'Loading images...',
                        url: '',
                        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g fill="var(--text-color)"><path d="M18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M11.943 1.25h.114c2.309 0 4.118 0 5.53.19 1.444.194 2.584.6 3.479 1.494.895.895 1.3 2.035 1.494 3.48.19 1.411.19 3.22.19 5.529v.088c0 1.909 0 3.471-.104 4.743-.104 1.28-.317 2.347-.795 3.235q-.314.586-.785 1.057c-.895.895-2.035 1.3-3.48 1.494-1.411.19-3.22.19-5.529.19h-.114c-2.309 0-4.118 0-5.53-.19-1.444-.194-2.584-.6-3.479-1.494-.793-.793-1.203-1.78-1.42-3.006-.215-1.203-.254-2.7-.262-4.558Q1.25 12.792 1.25 12v-.058c0-2.309 0-4.118.19-5.53.194-1.444.6-2.584 1.494-3.479.895-.895 2.035-1.3 3.48-1.494 1.411-.19 3.22-.19 5.529-.19m-5.33 1.676c-1.278.172-2.049.5-2.618 1.069-.57.57-.897 1.34-1.069 2.619-.174 1.3-.176 3.008-.176 5.386v.844l1.001-.876a2.3 2.3 0 0 1 3.141.104l4.29 4.29a2 2 0 0 0 2.564.222l.298-.21a3 3 0 0 1 3.732.225l2.83 2.547c.286-.598.455-1.384.545-2.493.098-1.205.099-2.707.099-4.653 0-2.378-.002-4.086-.176-5.386-.172-1.279-.5-2.05-1.069-2.62-.57-.569-1.34-.896-2.619-1.068-1.3-.174-3.008-.176-5.386-.176s-4.086.002-5.386.176"></path></g></svg>',
                    },
                ],
                'ai-hint',
            );
            const seq = ++this._inputSeq;
            chrome.runtime.sendMessage(
                {
                    action: 'getOmnibarScreenshots',
                },
                (res) => {
                    if (seq !== this._inputSeq) return;
                    let imgs = res && res.success ? res.screenshots : [];
                    if (q) imgs = imgs.filter((i) => this._itemMatchesQuery('text', i.title || '', q));
                    if (imgs.length === 0)
                        imgs = [
                            {
                                title: chrome.i18n.getMessage('omnibarNoImages') || 'No images found',
                                url: '',
                                icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g fill="var(--text-color)"><path d="M18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M11.943 1.25h.114c2.309 0 4.118 0 5.53.19 1.444.194 2.584.6 3.479 1.494.895.895 1.3 2.035 1.494 3.48.19 1.411.19 3.22.19 5.529v.088c0 1.909 0 3.471-.104 4.743-.104 1.28-.317 2.347-.795 3.235q-.314.586-.785 1.057c-.895.895-2.035 1.3-3.48 1.494-1.411.19-3.22.19-5.529.19h-.114c-2.309 0-4.118 0-5.53-.19-1.444-.194-2.584-.6-3.479-1.494-.793-.793-1.203-1.78-1.42-3.006-.215-1.203-.254-2.7-.262-4.558Q1.25 12.792 1.25 12v-.058c0-2.309 0-4.118.19-5.53.194-1.444.6-2.584 1.494-3.479.895-.895 2.035-1.3 3.48-1.494 1.411-.19 3.22-.19 5.529-.19m-5.33 1.676c-1.278.172-2.049.5-2.618 1.069-.57.57-.897 1.34-1.069 2.619-.174 1.3-.176 3.008-.176 5.386v.844l1.001-.876a2.3 2.3 0 0 1 3.141.104l4.29 4.29a2 2 0 0 0 2.564.222l.298-.21a3 3 0 0 1 3.732.225l2.83 2.547c.286-.598.455-1.384.545-2.493.098-1.205.099-2.707.099-4.653 0-2.378-.002-4.086-.176-5.386-.172-1.279-.5-2.05-1.069-2.62-.57-.569-1.34-.896-2.619-1.068-1.3-.174-3.008-.176-5.386-.176s-4.086.002-5.386.176"></path></g></svg>',
                            },
                        ];
                    this._renderResults(imgs, 'image');
                },
            );
            return;
        }

        // -- are: Add active tab to Existing Rule -----------------
        const pAre = this._getPrefixVal('atcr:', 'omnibarPrefixAddToExistingRule');
        if (lower.startsWith(pAre)) {
            const q = query.substring(pAre.length).trim();
            const seq = ++this._inputSeq;
            chrome.runtime.sendMessage(
                {
                    action: 'getRules',
                },
                (res) => {
                    if (seq !== this._inputSeq) return;
                    const customRules = res && res.success ? res.rules : [];
                    const results = [];
                    customRules.forEach((rule) => {
                        const ruleMatches =
                            !q || this._itemMatchesQuery('text', rule.name + ' ' + (rule.urls || []).join(' '), q);
                        if (ruleMatches) {
                            results.push({
                                type: 'atcr-rule',
                                name: rule.name,
                                color: rule.color,
                                urls: rule.urls || [],
                                title: rule.name,
                                url:
                                    chrome.i18n.getMessage('omnibarUrlsCount', [(rule.urls || []).length.toString()]) ||
                                    `${(rule.urls || []).length} URLs`,
                            });
                        }
                    });
                    if (results.length === 0) {
                        this._renderResults(
                            [
                                {
                                    title: chrome.i18n.getMessage('omnibarNoRulesFound') || 'No rules found',
                                    url: '',
                                },
                            ],
                            'ai-hint',
                        );
                    } else {
                        this._renderResults(results, 'atcr-item');
                    }
                },
            );
            return;
        }

        // -- atr: Add Tabs to Existing Rule ----------------------
        const pAtr = this._getPrefixVal('atr:', 'omnibarPrefixAddToRule');
        if (lower.startsWith(pAtr)) {
            const q = query.substring(pAtr.length).trim();
            if (this.atrSelectingRule) {
                // Phase 2: Show rules
                const seq = ++this._inputSeq;
                chrome.runtime.sendMessage(
                    {
                        action: 'getRules',
                    },
                    (res) => {
                        if (seq !== this._inputSeq) return;
                        const customRules = res && res.success ? res.rules : [];
                        const results = [];
                        customRules.forEach((rule) => {
                            const ruleMatches =
                                !q || this._itemMatchesQuery('text', rule.name + ' ' + (rule.urls || []).join(' '), q);
                            if (ruleMatches) {
                                results.push({
                                    type: 'atr-rule-select',
                                    ruleName: rule.name,
                                    color: rule.color,
                                    urls: rule.urls || [],
                                    title: rule.name,
                                    url:
                                        chrome.i18n.getMessage('omnibarUrlsCount', [
                                            (rule.urls || []).length.toString(),
                                        ]) || `${(rule.urls || []).length} URLs`,
                                });
                            }
                        });
                        if (results.length === 0) {
                            this._renderResults(
                                [
                                    {
                                        title: chrome.i18n.getMessage('omnibarNoRulesFound') || 'No rules found',
                                        url: '',
                                    },
                                ],
                                'ai-hint',
                            );
                        } else {
                            this._renderResults(results, 'atr-rule-select');
                        }
                    },
                );
            } else {
                // Phase 1: Show open tabs
                const filtered = this.tabs.filter((t) => this._itemMatchesQuery('tab', t, q));
                const results = [];
                // Prepend "Add all filtered tabs" special action if there is more than 1 tab
                if (filtered.length > 1) {
                    results.push({
                        isSpecialAction: true,
                        specialType: 'add-all-tabs',
                        title:
                            chrome.i18n.getMessage('omnibarAddAllFilteredTabsPrefix', [filtered.length.toString()]) ||
                            `Add all filtered tabs (${filtered.length})`,
                        url: '',
                        rawItems: filtered,
                    });
                }
                filtered.forEach((tab) => {
                    results.push({
                        ...tab,
                        type: 'atr-tab',
                    });
                });
                if (filtered.length === 0 && q) {
                    results.push({
                        title:
                            chrome.i18n.getMessage('omnibarAddManualUrlDomainEnter', [q]) ||
                            `Press Enter to add manual URL/domain: "${q}"`,
                        url: chrome.i18n.getMessage('omnibarToExistingRule') || 'to an existing rule',
                        type: 'atr-manual-preview',
                    });
                }
                this._renderResults(results, 'atr-tab');
            }
            return;
        }

        // -- erl: Edit Rules and domains -------------------------
        const pErl = this._getPrefixVal('er:', 'omnibarPrefixRulesEdit');
        if (lower.startsWith(pErl)) {
            const q = query.substring(pErl.length).trim();
            const ruleMatch = q.match(/^rule:([^,]+),(.*)$/i);
            const urlMatch = q.match(/^url:([^:]+)::([^,]+),(.*)$/i);
            if (ruleMatch) {
                const ruleName = ruleMatch[1].trim();
                const newName = ruleMatch[2].trim();
                const seq = ++this._inputSeq;
                chrome.runtime.sendMessage(
                    {
                        action: 'getRules',
                    },
                    (res) => {
                        if (seq !== this._inputSeq) return;
                        const customRules = res && res.success ? res.rules : [];
                        let error = null;
                        if (!newName) {
                            error =
                                chrome.i18n.getMessage('omnibarEnterNewRuleName') || 'Please enter a new rule name.';
                        } else if (newName.length > 16) {
                            error =
                                chrome.i18n.getMessage('omnibarRuleNameLength') ||
                                'Rule name must be 16 characters or less.';
                        } else {
                            const duplicateName = customRules.some(
                                (r) =>
                                    r.name.toLowerCase() === newName.toLowerCase() &&
                                    r.name.toLowerCase() !== ruleName.toLowerCase(),
                            );
                            if (duplicateName) {
                                error =
                                    chrome.i18n.getMessage('omnibarRuleNameExists', [newName]) ||
                                    `Rule name "${newName}" already exists.`;
                            }
                        }
                        if (error) {
                            this._renderResults(
                                [
                                    {
                                        type: 'er-preview-rule',
                                        isValid: false,
                                        title: error,
                                        desc:
                                            chrome.i18n.getMessage('omnibarPressEnterErrors') ||
                                            'Press Enter to see error details',
                                    },
                                ],
                                'er-preview',
                            );
                        } else {
                            this._renderResults(
                                [
                                    {
                                        type: 'er-preview-rule',
                                        isValid: true,
                                        ruleName: ruleName,
                                        newName: newName,
                                        title:
                                            chrome.i18n.getMessage('omnibarRenameRulePreview', [ruleName, newName]) ||
                                            `Rename rule "${ruleName}" to "${newName}"`,
                                        desc:
                                            chrome.i18n.getMessage('omnibarPressEnterSave') ||
                                            'Press Enter to save changes',
                                    },
                                ],
                                'er-preview',
                            );
                        }
                    },
                );
            } else if (urlMatch) {
                const ruleName = urlMatch[1].trim();
                const oldUrl = urlMatch[2].trim();
                let newUrl = urlMatch[3].trim();
                if (newUrl && !newUrl.match(/^[a-zA-Z]+:\/\//)) {
                    newUrl = 'https://' + newUrl;
                }
                const seq = ++this._inputSeq;
                chrome.runtime.sendMessage(
                    {
                        action: 'getRules',
                    },
                    (res) => {
                        if (seq !== this._inputSeq) return;
                        const customRules = res && res.success ? res.rules : [];
                        let error = null;
                        if (!newUrl) {
                            error = chrome.i18n.getMessage('omnibarEnterNewUrl') || 'Please enter a new URL/domain.';
                        } else if (newUrl.includes(' ')) {
                            error = chrome.i18n.getMessage('omnibarUrlNoSpaces') || 'URL cannot contain spaces.';
                        } else {
                            try {
                                const parsed = new URL(newUrl);
                                if (parsed.hostname.length === 0) throw new Error();
                            } catch {
                                error = chrome.i18n.getMessage('omnibarInvalidUrlFormat') || 'Invalid URL format.';
                            }
                        }
                        if (!error) {
                            const rule = customRules.find((r) => r.name === ruleName);
                            if (rule) {
                                const normalizedNew = newUrl
                                    .toLowerCase()
                                    .replace(/^(https?:\/\/)?(www\.)?/, '')
                                    .replace(/\/$/, '');
                                const otherUrls = (rule.urls || []).filter((u) => u !== oldUrl);
                                const otherNorms = otherUrls.map((u) =>
                                    u
                                        .toLowerCase()
                                        .replace(/^(https?:\/\/)?(www\.)?/, '')
                                        .replace(/\/$/, ''),
                                );
                                if (otherNorms.includes(normalizedNew)) {
                                    error =
                                        chrome.i18n.getMessage('omnibarUrlAlreadyInRule') ||
                                        'URL already exists in this rule.';
                                } else {
                                    for (const r of customRules) {
                                        if (r.name === ruleName) continue;
                                        const rNorms = (r.urls || []).map((u) =>
                                            u
                                                .toLowerCase()
                                                .replace(/^(https?:\/\/)?(www\.)?/, '')
                                                .replace(/\/$/, ''),
                                        );
                                        if (rNorms.includes(normalizedNew)) {
                                            error =
                                                chrome.i18n.getMessage('omnibarUrlAlreadyInOtherRule', [r.name]) ||
                                                `URL already exists in rule "${r.name}".`;
                                            break;
                                        }
                                    }
                                }
                            } else {
                                error = chrome.i18n.getMessage('omnibarRuleNotFound') || 'Rule not found.';
                            }
                        }
                        if (error) {
                            this._renderResults(
                                [
                                    {
                                        type: 'er-preview-url',
                                        isValid: false,
                                        title: error,
                                        desc:
                                            chrome.i18n.getMessage('omnibarPressEnterErrors') ||
                                            'Press Enter to see error details',
                                    },
                                ],
                                'er-preview',
                            );
                        } else {
                            this._renderResults(
                                [
                                    {
                                        type: 'er-preview-url',
                                        isValid: true,
                                        ruleName: ruleName,
                                        oldUrl: oldUrl,
                                        newUrl: newUrl,
                                        title:
                                            chrome.i18n.getMessage('omnibarChangeUrlTo', [newUrl]) ||
                                            `Change URL to "${newUrl}"`,
                                        desc:
                                            chrome.i18n.getMessage('omnibarInRuleReplacing', [ruleName, oldUrl]) ||
                                            `In rule "${ruleName}" (replacing "${oldUrl}")`,
                                    },
                                ],
                                'er-preview',
                            );
                        }
                    },
                );
            } else {
                const seq = ++this._inputSeq;
                chrome.runtime.sendMessage(
                    {
                        action: 'getRules',
                    },
                    (res) => {
                        if (seq !== this._inputSeq) return;
                        const customRules = res && res.success ? res.rules : [];
                        const results = [];
                        customRules.forEach((rule) => {
                            const ruleMatches =
                                !q || this._itemMatchesQuery('text', rule.name + ' ' + (rule.urls || []).join(' '), q);
                            if (ruleMatches) {
                                results.push({
                                    type: 'er-rule',
                                    name: rule.name,
                                    color: rule.color,
                                    urls: rule.urls || [],
                                    title: rule.name,
                                    url:
                                        chrome.i18n.getMessage('omnibarRenameRule', [rule.name]) ||
                                        `Rename rule: ${rule.name}`,
                                });
                                const urlsToShow = q
                                    ? this._itemMatchesQuery('text', rule.name, q)
                                        ? rule.urls || []
                                        : (rule.urls || []).filter((u) => this._itemMatchesQuery('text', u, q))
                                    : rule.urls || [];
                                urlsToShow.forEach((url) => {
                                    results.push({
                                        type: 'er-url',
                                        name: rule.name,
                                        color: rule.color,
                                        url: url,
                                        title: url,
                                        desc:
                                            chrome.i18n.getMessage('omnibarEditUrlFromRule', [rule.name]) ||
                                            `Edit URL from rule: ${rule.name}`,
                                    });
                                });
                            }
                        });
                        if (results.length === 0) {
                            this._renderResults(
                                [
                                    {
                                        title: chrome.i18n.getMessage('omnibarNoRulesFound') || 'No rules found',
                                        url: '',
                                    },
                                ],
                                'ai-hint',
                            );
                        } else {
                            this._renderResults(results, 'er-item');
                        }
                    },
                );
            }
            return;
        }

        // -- rl: Search Rules and open URLs ---------------------
        const pRl = this._getPrefixVal('rl:', 'omnibarPrefixRulesSearch');
        if (lower.startsWith(pRl)) {
            const q = query.substring(pRl.length).trim();
            const seq = ++this._inputSeq;
            chrome.runtime.sendMessage(
                {
                    action: 'getRules',
                },
                (res) => {
                    if (seq !== this._inputSeq) return;
                    const customRules = res && res.success ? res.rules : [];
                    const results = [];
                    customRules.forEach((rule) => {
                        const ruleMatches =
                            !q || this._itemMatchesQuery('text', rule.name + ' ' + (rule.urls || []).join(' '), q);
                        if (ruleMatches) {
                            results.push({
                                type: 'rl-rule',
                                name: rule.name,
                                color: rule.color,
                                urls: rule.urls || [],
                                title: rule.name,
                                url: `${chrome.i18n.getMessage('omnibarOpenAllUrls') || 'Open all URLs'} (${(rule.urls || []).length})`,
                            });
                            const urlsToShow = q
                                ? this._itemMatchesQuery('text', rule.name, q)
                                    ? rule.urls || []
                                    : (rule.urls || []).filter((u) => this._itemMatchesQuery('text', u, q))
                                : rule.urls || [];
                            urlsToShow.forEach((url) => {
                                results.push({
                                    type: 'rl-url',
                                    name: rule.name,
                                    color: rule.color,
                                    url: url,
                                    title: url,
                                    desc:
                                        chrome.i18n.getMessage('omnibarFromRule', [rule.name]) ||
                                        `From rule: ${rule.name}`,
                                });
                            });
                        }
                    });
                    if (results.length === 0) {
                        this._renderResults(
                            [
                                {
                                    title: chrome.i18n.getMessage('omnibarNoRulesFound') || 'No rules found',
                                    url: '',
                                },
                            ],
                            'ai-hint',
                        );
                    } else {
                        this._renderResults(results, 'rl-item');
                    }
                },
            );
            return;
        }

        // -- ccr & ccg: Change Rule/Group Color ---------------------
        const pCcr = this._getPrefixVal('ccr:', 'omnibarPrefixChangeRuleColor');
        const pCcg = this._getPrefixVal('ccg:', 'omnibarPrefixChangeGroupColor');
        const isCcr = lower.startsWith(pCcr);
        const isCcg = lower.startsWith(pCcg);
        if (isCcr || isCcg) {
            const isRule = isCcr;
            const prefix = isRule ? pCcr : pCcg;
            const q = query.substring(prefix.length).trim();
            const qLower = q.toLowerCase();
            const seq = ++this._inputSeq;
            const COLOR_OPTIONS = this._getColorOptions();
            const promises = isRule
                ? [
                      new Promise((res) =>
                          chrome.runtime.sendMessage(
                              {
                                  action: 'getRules',
                              },
                              res,
                          ),
                      ),
                  ]
                : [
                      new Promise((res) =>
                          chrome.runtime.sendMessage(
                              {
                                  action: 'getTabGroups',
                              },
                              res,
                          ),
                      ),
                      new Promise((res) =>
                          chrome.runtime.sendMessage(
                              {
                                  action: 'getClusterConfig',
                              },
                              res,
                          ),
                      ),
                  ];
            Promise.all(promises).then((responses) => {
                if (seq !== this._inputSeq) return;
                const results = [];
                if (isRule) {
                    const customRules = responses[0] && responses[0].success ? responses[0].rules : [];
                    customRules.forEach((rule) => {
                        const ruleMatches =
                            !q || this._itemMatchesQuery('text', rule.name + ' ' + (rule.urls || []).join(' '), qLower);
                        if (ruleMatches) {
                            results.push({
                                type: 'ccr-rule',
                                name: rule.name,
                                color: rule.color,
                                title: rule.name,
                                url:
                                    chrome.i18n.getMessage('omnibarPrefixChangeRuleColorDesc') ||
                                    'Click a color below to change',
                            });
                            COLOR_OPTIONS.forEach((c) => {
                                results.push({
                                    type: 'ccr-color',
                                    name: c.name,
                                    value: c.value,
                                    ruleName: rule.name,
                                    ruleColor: rule.color,
                                    isCurrent: rule.color === c.name,
                                    title:
                                        chrome.i18n.getMessage(`omnibarColorName_${c.name}`) ||
                                        c.name.charAt(0).toUpperCase() + c.name.slice(1),
                                });
                            });
                        }
                    });
                } else {
                    const tabGroups = responses[0] && responses[0].success ? responses[0].results : [];
                    const clusterConfig = responses[1] && responses[1].success ? responses[1].config : {};
                    const specialGroups = clusterConfig.specialGroups || {};
                    tabGroups.forEach((group) => {
                        const title = group.title || `Group ${group.id}`;
                        const groupMatches =
                            !q || title.toLowerCase().includes(qLower) || (group.color && group.color.includes(qLower));
                        if (groupMatches) {
                            results.push({
                                type: 'ccg-group',
                                name: title,
                                groupId: group.id,
                                color: group.color || 'grey',
                                title: title,
                                url:
                                    chrome.i18n.getMessage('omnibarPrefixChangeGroupColorDesc') ||
                                    'Click a color below to change',
                            });
                            COLOR_OPTIONS.forEach((c) => {
                                results.push({
                                    type: 'ccg-color',
                                    name: c.name,
                                    value: c.value,
                                    groupId: group.id,
                                    groupColor: group.color || 'grey',
                                    isCurrent: (group.color || 'grey') === c.name,
                                    title:
                                        chrome.i18n.getMessage(`omnibarColorName_${c.name}`) ||
                                        c.name.charAt(0).toUpperCase() + c.name.slice(1),
                                });
                            });
                        }
                    });
                    Object.keys(specialGroups).forEach((key) => {
                        const sg = specialGroups[key];
                        if (!sg.color) return;
                        const sgName = sg.name || key;
                        const sgMatches =
                            !q ||
                            sgName.toLowerCase().includes(qLower) ||
                            sg.color.includes(qLower) ||
                            key.toLowerCase().includes(qLower);
                        if (sgMatches) {
                            results.push({
                                type: 'ccg-group',
                                name: sgName,
                                specialGroupKey: key,
                                color: sg.color || 'grey',
                                title: sgName,
                                url:
                                    chrome.i18n.getMessage('omnibarPrefixChangeGroupColorDesc') ||
                                    'Click a color below to change',
                            });
                            COLOR_OPTIONS.forEach((c) => {
                                results.push({
                                    type: 'ccg-color',
                                    name: c.name,
                                    value: c.value,
                                    specialGroupKey: key,
                                    groupColor: sg.color || 'grey',
                                    isCurrent: (sg.color || 'grey') === c.name,
                                    title:
                                        chrome.i18n.getMessage(`omnibarColorName_${c.name}`) ||
                                        c.name.charAt(0).toUpperCase() + c.name.slice(1),
                                });
                            });
                        }
                    });
                }
                if (results.length === 0) {
                    this._renderResults(
                        [
                            {
                                title:
                                    chrome.i18n.getMessage('omnibarNoRulesFound') ||
                                    (isRule ? 'No rules found' : 'No groups found'),
                                url: '',
                            },
                        ],
                        'ai-hint',
                    );
                } else {
                    this._renderResults(results, isRule ? 'ccr-item' : 'ccg-item');
                }
            });
            return;
        }

        // -- crl: Create Rule ------------------------------------
        const pCrl = this._getPrefixVal('cr:', 'omnibarPrefixRulesCreate');
        if (lower.startsWith(pCrl)) {
            const rawInput = query.substring(pCrl.length).trim();
            if (this.crSelectingTabsFor) {
                const filtered = this.tabs.filter((t) => this._itemMatchesQuery('tab', t, rawInput));
                const results = [];
                if (rawInput && (rawInput.includes(',') || (filtered.length === 0 && rawInput.includes('.')))) {
                    const manualUrls = rawInput
                        .split(',')
                        .map((u) => u.trim())
                        .filter(Boolean);
                    if (manualUrls.length > 0) {
                        results.push({
                            type: 'cr-add-manual',
                            urls: manualUrls,
                            title:
                                chrome.i18n.getMessage('omnibarAddManualUrls', [manualUrls.join(', ')]) ||
                                `Add manual URLs/domains: ${manualUrls.join(', ')}`,
                            desc:
                                chrome.i18n.getMessage('omnibarToRule', [this.crSelectingTabsFor]) ||
                                `To rule: ${this.crSelectingTabsFor}`,
                        });
                    }
                }
                if (filtered.length > 1) {
                    results.push({
                        isSpecialAction: true,
                        specialType: 'add-all-tabs',
                        title:
                            chrome.i18n.getMessage('omnibarAddAllFilteredTabsPrefix', [filtered.length.toString()]) ||
                            `Add all filtered tabs (${filtered.length})`,
                        url:
                            chrome.i18n.getMessage('omnibarToRule', [this.crSelectingTabsFor]) ||
                            `To rule: ${this.crSelectingTabsFor}`,
                        rawItems: filtered,
                    });
                }
                filtered.forEach((tab) => {
                    results.push({
                        ...tab,
                        type: 'cr-tab',
                    });
                });
                if (results.length === 0) {
                    if (rawInput) {
                        results.push({
                            type: 'cr-add-manual',
                            urls: [rawInput],
                            title:
                                chrome.i18n.getMessage('omnibarAddManualUrlDomain', [rawInput]) ||
                                `Add manual URL/domain: ${rawInput}`,
                            desc:
                                chrome.i18n.getMessage('omnibarToRule', [this.crSelectingTabsFor]) ||
                                `To rule: ${this.crSelectingTabsFor}`,
                        });
                    } else {
                        results.push({
                            title: chrome.i18n.getMessage('omnibarNoTabsFound') || 'No tabs found',
                            url: '',
                        });
                    }
                }
                this._renderResults(results, 'cr-tab');
                return;
            }
            let name = '';
            let urls = [];
            const commaIdx = rawInput.indexOf(',');
            if (commaIdx !== -1) {
                name = rawInput.substring(0, commaIdx).trim();
                urls = rawInput
                    .substring(commaIdx + 1)
                    .split(',')
                    .map((u) => u.trim())
                    .filter(Boolean);
            } else {
                name = rawInput;
            }
            const isNameOnly = commaIdx === -1;

            // Prepend https:// if protocol missing
            urls = urls.map((u) => {
                if (!u.match(/^[a-zA-Z]+:\/\//)) {
                    return 'https://' + u;
                }
                return u;
            });
            const seq = ++this._inputSeq;
            chrome.runtime.sendMessage(
                {
                    action: 'getRules',
                },
                (res) => {
                    if (seq !== this._inputSeq) return;
                    const customRules = res && res.success ? res.rules : [];
                    let error = null;
                    if (!name) {
                        error = chrome.i18n.getMessage('omnibarEnterRuleName') || 'Please enter a rule name.';
                    } else if (name.length > 16) {
                        error =
                            chrome.i18n.getMessage('omnibarRuleNameLength') ||
                            'Rule name must be 16 characters or less.';
                    } else {
                        const duplicateName = customRules.some((r) => r.name.toLowerCase() === name.toLowerCase());
                        if (duplicateName) {
                            error =
                                chrome.i18n.getMessage('omnibarRuleNameExists', [name]) ||
                                `Rule name "${name}" already exists.`;
                        } else if (!isNameOnly) {
                            const invalidUrl = urls.find((url) => {
                                if (url.includes(' ')) return true;
                                try {
                                    const parsed = new URL(url);
                                    if (parsed.hostname.length === 0) return true;
                                } catch {
                                    return true;
                                }
                                return false;
                            });
                            if (invalidUrl) {
                                error =
                                    chrome.i18n.getMessage('omnibarInvalidUrlCrl', [invalidUrl]) ||
                                    `Invalid URL: "${invalidUrl}"`;
                            } else {
                                const normalized = urls.map((u) =>
                                    u
                                        .toLowerCase()
                                        .replace(/^(https?:\/\/)?(www\.)?/, '')
                                        .replace(/\/$/, ''),
                                );
                                const hasSelfDup = new Set(normalized).size !== normalized.length;
                                if (hasSelfDup) {
                                    error =
                                        chrome.i18n.getMessage('omnibarDuplicateUrls') ||
                                        'Rule contains duplicate URLs.';
                                } else {
                                    let dupRule = null;
                                    let dupUrl = '';
                                    for (const r of customRules) {
                                        const otherNorms = (r.urls || []).map((u) =>
                                            u
                                                .toLowerCase()
                                                .replace(/^(https?:\/\/)?(www\.)?/, '')
                                                .replace(/\/$/, ''),
                                        );
                                        const intersecting = normalized.find((n) => otherNorms.includes(n));
                                        if (intersecting) {
                                            dupRule = r.name;
                                            break;
                                        }
                                    }
                                    if (dupRule) {
                                        error =
                                            chrome.i18n.getMessage('omnibarUrlAlreadyInOtherRuleCrl', [
                                                dupUrl,
                                                dupRule,
                                            ]) || `URL "${dupUrl}" is already in rule "${dupRule}".`;
                                    }
                                }
                            }
                        }
                    }
                    if (error) {
                        this._renderResults(
                            [
                                {
                                    isCrlPreview: true,
                                    isValid: false,
                                    title: error,
                                    desc:
                                        chrome.i18n.getMessage('omnibarPressEnterErrors') ||
                                        'Press Enter to see error details',
                                },
                            ],
                            'cr-preview',
                        );
                    } else {
                        if (isNameOnly) {
                            this._renderResults(
                                [
                                    {
                                        isCrlPreview: true,
                                        isValid: true,
                                        isNameOnly: true,
                                        name: name,
                                        urls: [],
                                        title:
                                            chrome.i18n.getMessage('omnibarCreateRulePreview', [name]) ||
                                            `Create rule: "${name}"`,
                                        desc:
                                            chrome.i18n.getMessage('omnibarPressEnterCreate') ||
                                            'Press Enter to create rule and select tabs',
                                    },
                                ],
                                'cr-preview',
                            );
                        } else {
                            this._renderResults(
                                [
                                    {
                                        isCrlPreview: true,
                                        isValid: true,
                                        isNameOnly: false,
                                        name: name,
                                        urls: urls,
                                        title:
                                            chrome.i18n.getMessage('omnibarCreateRulePreview', [name]) ||
                                            `Create rule: "${name}"`,
                                        desc:
                                            chrome.i18n.getMessage('omnibarUrlsList', [urls.join(', ')]) ||
                                            `URLs: ${urls.join(', ')}`,
                                    },
                                ],
                                'cr-preview',
                            );
                        }
                    }
                },
            );
            return;
        }

        // -- drl: Delete Rules and rule domains ------------------
        const pDrl = this._getPrefixVal('dr:', 'omnibarPrefixRulesDelete');
        if (lower.startsWith(pDrl)) {
            const q = query.substring(pDrl.length).trim();
            const seq = ++this._inputSeq;
            chrome.runtime.sendMessage(
                {
                    action: 'getRules',
                },
                (res) => {
                    if (seq !== this._inputSeq) return;
                    const customRules = res && res.success ? res.rules : [];
                    const results = [];
                    customRules.forEach((rule) => {
                        const ruleMatches =
                            !q || this._itemMatchesQuery('text', rule.name + ' ' + (rule.urls || []).join(' '), q);
                        if (ruleMatches) {
                            results.push({
                                type: 'dr-rule',
                                name: rule.name,
                                color: rule.color,
                                urls: rule.urls || [],
                                title: rule.name,
                                url:
                                    chrome.i18n.getMessage('omnibarDeleteRule', [rule.name]) ||
                                    `Delete rule: ${rule.name}`,
                            });
                            const urlsToShow = q
                                ? this._itemMatchesQuery('text', rule.name, q)
                                    ? rule.urls || []
                                    : (rule.urls || []).filter((u) => this._itemMatchesQuery('text', u, q))
                                : rule.urls || [];
                            urlsToShow.forEach((url) => {
                                results.push({
                                    type: 'dr-url',
                                    name: rule.name,
                                    color: rule.color,
                                    url: url,
                                    title: url,
                                    desc:
                                        chrome.i18n.getMessage('omnibarDeleteDomainFromRule', [rule.name]) ||
                                        `Delete domain from rule: ${rule.name}`,
                                });
                            });
                        }
                    });
                    if (results.length === 0) {
                        this._renderResults(
                            [
                                {
                                    title: chrome.i18n.getMessage('omnibarNoRulesFound') || 'No rules found',
                                    url: '',
                                },
                            ],
                            'ai-hint',
                        );
                    } else {
                        this._renderResults(results, 'dr-item');
                    }
                },
            );
            return;
        }

        // -- bgr: Backups ----------------------------------------
        const pBgr = this._getPrefixVal('bgr:', 'omnibarPrefixBackupDesc');
        if (lower.startsWith(pBgr)) {
            const q = query.substring(pBgr.length).trim();
            const backupIcon =
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 8C9.85 8 7.56 9.11 6 10.9L3.5 8.4V15H10.1L7.53 12.43C8.73 10.93 10.5 10 12.5 10C16.08 10 19 12.92 19 16.5C19 20.08 16.08 23 12.5 23C9.9 23 7.64 21.46 6.6 19.24L4.98 20.17C6.35 23.08 9.24 25 12.5 25C17.19 25 21 21.19 21 16.5C21 11.81 17.19 8 12.5 8Z" fill="var(--text-color)"/></svg>';
            this._renderResults(
                [
                    {
                        title: chrome.i18n.getMessage('omnibarLoadingBackups') || 'Loading backups...',
                        url: '',
                        icon: backupIcon,
                    },
                ],
                'ai-hint',
            );
            const seq = ++this._inputSeq;
            chrome.runtime.sendMessage(
                {
                    action: 'getBackups',
                },
                (res) => {
                    if (seq !== this._inputSeq) return;
                    const backups = res && res.success ? res.backups : [];
                    const results = [];
                    backups.forEach((backup) => {
                        const groupTitle = backup.group.title || `Group ${backup.group.color}`;
                        const groupMatches = !q || this._itemMatchesQuery('dg', backup.group, q);
                        if (groupMatches) {
                            results.push({
                                type: 'bg-group',
                                id: backup.group.id,
                                title: groupTitle,
                                color: backup.group.color,
                                count: backup.tabs.length,
                                url:
                                    chrome.i18n.getMessage('omnibarGroupBackup', [backup.tabs.length.toString()]) ||
                                    `Group Backup (${backup.tabs.length} tabs)`,
                            });
                        }
                        backup.tabs.forEach((tab) => {
                            if (!q || this._itemMatchesQuery('tab', tab, q)) {
                                results.push({
                                    type: 'bg-tab',
                                    groupId: backup.group.id,
                                    groupTitle: groupTitle,
                                    title: tab.title || tab.url,
                                    url: tab.url,
                                    favIconUrl: tab.favIconUrl,
                                    pinned: tab.pinned,
                                });
                            }
                        });
                    });
                    if (results.length === 0) {
                        this._renderResults(
                            [
                                {
                                    title: chrome.i18n.getMessage('omnibarNoBackups') || 'No backups found',
                                    url: '',
                                    icon: backupIcon,
                                },
                            ],
                            'ai-hint',
                        );
                    } else {
                        this._renderResults(results, 'bg-item');
                    }
                },
            );
            return;
        }

        // -- bg: Backup non-backed-up groups ------------------------
        const pBg = this._getPrefixVal('bg:', 'omnibarPrefixBackupNowDesc');
        if (lower.startsWith(pBg)) {
            const q = query.substring(pBg.length).trim();
            const seq = ++this._inputSeq;
            const backupIcon =
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 8C9.85 8 7.56 9.11 6 10.9L3.5 8.4V15H10.1L7.53 12.43C8.73 10.93 10.5 10 12.5 10C16.08 10 19 12.92 19 16.5C19 20.08 16.08 23 12.5 23C9.9 23 7.64 21.46 6.6 19.24L4.98 20.17C6.35 23.08 9.24 25 12.5 25C17.19 25 21 21.19 21 16.5C21 11.81 17.19 8 12.5 8Z" fill="var(--text-color)"/></svg>';
            this._renderResults(
                [
                    {
                        title: chrome.i18n.getMessage('omnibarLoadingBackups') || 'Loading groups...',
                        url: '',
                        icon: backupIcon,
                    },
                ],
                'ai-hint',
            );
            chrome.runtime.sendMessage(
                {
                    action: 'getBackups',
                },
                (backupRes) => {
                    if (seq !== this._inputSeq) return;
                    const backups = backupRes && backupRes.success ? backupRes.backups : [];
                    const backedUpGroupIds = new Set(backups.map((b) => b.group?.id).filter((id) => id !== undefined));
                    chrome.runtime.sendMessage(
                        {
                            action: 'getTabGroups',
                        },
                        (groupsRes) => {
                            if (seq !== this._inputSeq) return;
                            const groups = groupsRes && groupsRes.success ? groupsRes.results : [];
                            const results = [];
                            groups.forEach((g) => {
                                if (!backedUpGroupIds.has(g.id)) {
                                    const groupTitle = g.title || `Group ${g.color}`;
                                    if (!q || this._itemMatchesQuery('dg', g, q)) {
                                        results.push({
                                            type: 'bg-group',
                                            id: g.id,
                                            title: groupTitle,
                                            color: g.color,
                                            count: g.tabCount || 0,
                                            url:
                                                chrome.i18n.getMessage('omnibarClickBackupGroup') ||
                                                'Click to backup. Space / Ctrl+Click to select, Shift+Click to select range.',
                                        });
                                    }
                                }
                            });
                            if (results.length === 0) {
                                this._renderResults(
                                    [
                                        {
                                            title:
                                                chrome.i18n.getMessage('omnibarNoGroupsToBackup') ||
                                                'All groups already have a backup',
                                            url: '',
                                            icon: backupIcon,
                                        },
                                    ],
                                    'ai-hint',
                                );
                            } else {
                                this._renderResults(results, 'bg-item');
                            }
                        },
                    );
                },
            );
            return;
        }
        let handled = false;
        for (const [prefix, action] of Object.entries(prefixes)) {
            if (lower.startsWith(prefix)) {
                const q = query.substring(prefix.length).trim();
                const seq = ++this._inputSeq;
                chrome.runtime.sendMessage(
                    {
                        action,
                        query: q,
                    },
                    (res) => {
                        if (seq !== this._inputSeq) return;
                        let matches = [];
                        if (action === 'getTabGroups') {
                            matches = res && res.success ? res.results : [];
                            matches = matches.filter((g) => this._itemMatchesQuery('dg', g, q));
                        } else if (action === 'getOpenTabs') {
                            matches = res && res.success ? res.tabs : [];
                            matches = matches.filter((t) => this._itemMatchesQuery('tab', t, q));
                        } else {
                            matches = res && res.success ? res.results : [];
                        }
                        this._renderResults(matches, prefix.slice(0, prefix.length - 1));
                    },
                );
                handled = true;
                break;
            }
        }
        if (!handled && lower.startsWith('f:')) {
            const q = query.substring(2).trim();
            this.debouncedSearch(q);
            handled = true;
        }
        if (!handled) {
            const filtered = this.tabs.filter((t) => this._itemMatchesQuery('tab', t, lower));
            this._renderResults(filtered, 'tab');
        }
    }
    _handleKey(event) {
        const input = this.shadow.getElementById('hint-omni-input');
        const resultsList = this.shadow.getElementById('hint-omni-results');
        const items = Array.from(resultsList.getElementsByTagName('li'));
        const count = items.length;

        // Always stop propagation to avoid page shortcuts
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (event.key === 'Escape') {
            this.close();
            event.preventDefault();
            return;
        }
        const currentValue = input.value.trim();
        const currentLower = currentValue.toLowerCase();
        const isDg = currentLower.startsWith(this._getPrefixVal('dg:', 'prefixDeleteGroup'));
        const isCt = currentLower.startsWith(this._getPrefixVal('dt:', 'prefixDeleteTab'));
        const isRl = currentLower.startsWith(this._getPrefixVal('rl:', 'omnibarPrefixRulesSearch'));
        const isDrl = currentLower.startsWith(this._getPrefixVal('dr:', 'omnibarPrefixRulesDelete'));
        const isCcr = currentLower.startsWith(this._getPrefixVal('ccr:', 'omnibarPrefixChangeRuleColor'));
        const isCcg = currentLower.startsWith(this._getPrefixVal('ccg:', 'omnibarPrefixChangeGroupColor'));
        const isAtr =
            currentLower.startsWith(this._getPrefixVal('atr:', 'omnibarPrefixAddToRule')) && !this.atrSelectingRule;
        const isCrlSelect =
            currentLower.startsWith(this._getPrefixVal('cr:', 'omnibarPrefixRulesCreate')) && !!this.crSelectingTabsFor;
        const pBgSpace = this._getPrefixVal('bg:', 'omnibarPrefixBackupNowDesc');
        const isBg = currentLower.startsWith(pBgSpace);
        const isBgr = currentLower.startsWith(this._getPrefixVal('bgr:', 'omnibarPrefixBackupDesc'));
        const spaceNeedsNav = isDg || isCt || isRl || isDrl || isAtr || isBg || isBgr || isCcr || isCcg;
        const spaceAllowed = (spaceNeedsNav && this.hasNavigated) || isCrlSelect;
        if (
            event.key === ' ' &&
            spaceAllowed &&
            (isDg || isCt || isRl || isDrl || isAtr || isCrlSelect || isBg || isBgr || isCcr || isCcg)
        ) {
            if (count > 0) {
                const selectedItem = items[this.selectedIndex];
                if (
                    selectedItem &&
                    !selectedItem.classList.contains('delete-all-filtered') &&
                    !selectedItem.classList.contains('add-all-filtered')
                ) {
                    event.preventDefault();
                    if (
                        (isCcr && selectedItem.dataset.ccrType === 'ccr-color') ||
                        (isCcg && selectedItem.dataset.ccgType === 'ccg-color')
                    ) {
                        const isRule = isCcr;
                        const actionId = selectedItem.dataset.actionId;
                        const mainId = isRule
                            ? selectedItem.dataset.ruleName
                            : selectedItem.dataset.groupId || selectedItem.dataset.specialGroupKey;
                        const itemType = isRule ? 'ccr-item' : 'ccg-item';
                        const subType = isRule ? 'ccr-color' : 'ccg-color';
                        if (actionId && this.selectedActionItems.has(actionId)) {
                            this.selectedActionItems.delete(actionId);
                            selectedItem.classList.remove('action-selected-theme');
                        } else {
                            items.forEach((other) => {
                                if (
                                    other !== selectedItem &&
                                    other.dataset.type === itemType &&
                                    other.dataset[isRule ? 'ccrType' : 'ccgType'] === subType &&
                                    other.dataset.actionId
                                ) {
                                    const otherMainId = isRule
                                        ? other.dataset.ruleName
                                        : other.dataset.groupId || other.dataset.specialGroupKey;
                                    if (otherMainId === mainId) {
                                        this.selectedActionItems.delete(other.dataset.actionId);
                                        other.classList.remove('action-selected-theme');
                                    }
                                }
                            });
                            this.selectedActionItems.add(actionId);
                            selectedItem.classList.add('action-selected-theme');
                        }
                    } else {
                        this._toggleActionItemSelection(selectedItem, event.shiftKey, true);
                    }
                    return;
                }
            }
        }

        // -- Arrow / Tab navigation ------------------------------------
        if (['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key)) {
            event.preventDefault();
            if (count === 0) return;
            this.hasNavigated = true;
            this._keyboardNav = true;
            if (this._keyboardNavTimer) clearTimeout(this._keyboardNavTimer);
            this._keyboardNavTimer = setTimeout(() => {
                this._keyboardNav = false;
            }, 300);
            if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
                this.selectedIndex = (this.selectedIndex + 1) % count;
            } else {
                this.selectedIndex = (this.selectedIndex - 1 + count) % count;
            }
            this._updateSelection(items);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const items = Array.from(resultsList.getElementsByTagName('li'));
            const selected = items[this.selectedIndex];
            if (selected && selected.dataset.type === 'prefix') {
                input.value = selected.dataset.prefix;
                this._handleInput({
                    target: input,
                });
                return;
            }
            if (selected && selected.dataset.type === 'tutorial-hint') {
                return;
            }
            // A site prefix is decided by what was typed, not by which row happens to be
            // highlighted: its single row is only a preview of what Enter will do.
            if (this._getSiteSearchPrefixes().some((entry) => currentLower.startsWith(entry.prefix))) {
                this._executeDefaultSearch(currentValue);
                return;
            }
            const pAtr = this._getPrefixVal('atr:', 'omnibarPrefixAddToRule');
            if (currentLower.startsWith(pAtr)) {
                if (this.atrSelectingRule) {
                    if (selected && selected.dataset.type === 'atr-rule-select') {
                        const ruleName = selected.dataset.ruleName;
                        this._addValidatedUrlsToRule(ruleName, this.atrPendingUrls || []);
                        this.close();
                    }
                } else {
                    // Phase 1 transition to Phase 2 rule selection
                    let urlsToAdd = [];
                    if (selected && selected.classList.contains('add-all-filtered')) {
                        try {
                            urlsToAdd = JSON.parse(selected.dataset.rawUrls || '[]');
                        } catch {}
                    } else if (selected && selected.dataset.type === 'atr-manual-preview') {
                        const qVal = currentValue.substring(pAtr.length).trim();
                        if (qVal) urlsToAdd = [qVal];
                    } else if (this.selectedActionItems && this.selectedActionItems.size > 0) {
                        urlsToAdd = Array.from(this.selectedActionItems);
                    } else if (selected && selected.dataset.type === 'atr-tab') {
                        urlsToAdd = [selected.dataset.url];
                    } else {
                        const qVal = currentValue.substring(pAtr.length).trim();
                        if (qVal) urlsToAdd = [qVal];
                    }
                    if (urlsToAdd.length > 0) {
                        this.atrPendingUrls = urlsToAdd;
                        this.atrSelectingRule = true;
                        this.selectedActionItems.clear();
                        input.value = `${pAtr} `;
                        this._handleInput({
                            target: input,
                        });
                    } else {
                        this._showToast(chrome.i18n.getMessage('omnibarNoUrlsToAdd') || 'No URLs to add.');
                    }
                }
                return;
            }
            const pAre = this._getPrefixVal('atcr:', 'omnibarPrefixAddToExistingRule');
            if (currentLower.startsWith(pAre)) {
                if (selected && selected.dataset.type === 'atcr-item') {
                    const ruleName = selected.dataset.ruleName;
                    chrome.runtime.sendMessage(
                        {
                            action: 'getActiveTab',
                        },
                        (activeTab) => {
                            if (activeTab && activeTab.url) {
                                chrome.runtime.sendMessage(
                                    {
                                        action: 'addUrlsToRule',
                                        ruleName: ruleName,
                                        urls: [activeTab.url],
                                    },
                                    (res) => {
                                        if (res && res.success) {
                                            this._showToast(
                                                chrome.i18n.getMessage('omnibarAddedActiveTab', [ruleName]) ||
                                                    `Added active tab to rule "${ruleName}"`,
                                            );
                                        } else {
                                            this._showToast(
                                                res?.error ||
                                                    chrome.i18n.getMessage('omnibarFailedAddActiveTab') ||
                                                    'Failed to add active tab to rule',
                                            );
                                        }
                                    },
                                );
                            } else {
                                this._showToast(
                                    chrome.i18n.getMessage('omnibarFailedRetrieveActiveTab') ||
                                        'Failed to retrieve active tab URL',
                                );
                            }
                        },
                    );
                }
                this.close();
                return;
            }
            const pCrl = this._getPrefixVal('cr:', 'omnibarPrefixRulesCreate');
            if (currentLower.startsWith(pCrl)) {
                if (this.crSelectingTabsFor) {
                    let urlsToAdd = [];
                    if (selected && selected.classList.contains('add-all-filtered')) {
                        try {
                            urlsToAdd = JSON.parse(selected.dataset.rawUrls || '[]');
                        } catch {}
                    } else if (selected && selected.dataset.itemSubtype === 'cr-add-manual') {
                        try {
                            urlsToAdd = JSON.parse(selected.dataset.urls || '[]');
                        } catch {}
                    } else if (this.selectedActionItems && this.selectedActionItems.size > 0) {
                        urlsToAdd = Array.from(this.selectedActionItems);
                    } else if (selected && selected.dataset.type === 'cr-tab') {
                        urlsToAdd = [selected.dataset.url];
                    } else {
                        const qVal = currentValue.substring(pCrl.length).trim();
                        if (qVal) {
                            if (qVal.includes(',')) {
                                urlsToAdd = qVal
                                    .split(',')
                                    .map((u) => u.trim())
                                    .filter(Boolean);
                            } else {
                                urlsToAdd = [qVal];
                            }
                        }
                    }
                    if (urlsToAdd.length > 0) {
                        this._addValidatedUrlsToRule(this.crSelectingTabsFor, urlsToAdd);
                    } else {
                        this._showToast(chrome.i18n.getMessage('omnibarNoUrlsToAdd') || 'No URLs to add.');
                    }
                    this.close();
                } else {
                    if (selected && selected.dataset.type === 'cr-preview') {
                        if (selected.dataset.isValid === 'true') {
                            const name = selected.dataset.ruleName;
                            const isNameOnly = selected.dataset.isNameOnly === 'true';
                            const urls = JSON.parse(selected.dataset.ruleUrls || '[]');
                            chrome.runtime.sendMessage(
                                {
                                    action: 'createRuleFromOmnibar',
                                    name: name,
                                    urls: urls,
                                },
                                (response) => {
                                    if (response && response.success) {
                                        if (isNameOnly) {
                                            this.crSelectingTabsFor = name;
                                            this.selectedActionItems.clear();
                                            input.value = `${pCrl} `;
                                            this._handleInput({
                                                target: input,
                                            });
                                        } else {
                                            this._showToast(
                                                chrome.i18n.getMessage('omnibarRuleCreated', [name]) ||
                                                    `Rule "${name}" created successfully`,
                                            );
                                            this.close();
                                        }
                                    } else {
                                        this._showToast(
                                            response?.error ||
                                                chrome.i18n.getMessage('omnibarFailedCreateRule') ||
                                                'Failed to create rule',
                                        );
                                        this.close();
                                    }
                                },
                            );
                        } else {
                            this._showToast(selected.dataset.ruleTitle);
                        }
                    }
                }
                return;
            }
            const pErl = this._getPrefixVal('er:', 'omnibarPrefixRulesEdit');
            if (currentLower.startsWith(pErl)) {
                if (selected && selected.dataset.type === 'er-item') {
                    if (selected.dataset.erType === 'er-rule') {
                        input.value = `${pErl} rule:${selected.dataset.ruleName}, `;
                        this._handleInput({
                            target: input,
                        });
                    } else if (selected.dataset.erType === 'er-url') {
                        input.value = `${pErl} url:${selected.dataset.ruleName}::${selected.dataset.url}, `;
                        this._handleInput({
                            target: input,
                        });
                    }
                } else if (selected && selected.dataset.type === 'er-preview') {
                    if (selected.dataset.isValid === 'true') {
                        if (selected.dataset.newName) {
                            const ruleName = selected.dataset.ruleName;
                            const newName = selected.dataset.newName;
                            chrome.runtime.sendMessage(
                                {
                                    action: 'updateRuleName',
                                    ruleName: ruleName,
                                    newName: newName,
                                },
                                (res) => {
                                    if (res && res.success) {
                                        this._showToast(
                                            chrome.i18n.getMessage('omnibarRuleRenamed', [newName]) ||
                                                `Rule renamed to "${newName}"`,
                                        );
                                    } else {
                                        this._showToast(
                                            res?.error ||
                                                chrome.i18n.getMessage('omnibarFailedRenameRule') ||
                                                'Failed to rename rule',
                                        );
                                    }
                                },
                            );
                            this.close();
                        } else if (selected.dataset.newUrl) {
                            const ruleName = selected.dataset.ruleName;
                            const oldUrl = selected.dataset.oldUrl;
                            const newUrl = selected.dataset.newUrl;
                            chrome.runtime.sendMessage(
                                {
                                    action: 'updateRuleDomain',
                                    ruleName: ruleName,
                                    oldUrl: oldUrl,
                                    newUrl: newUrl,
                                },
                                (res) => {
                                    if (res && res.success) {
                                        this._showToast(
                                            chrome.i18n.getMessage('omnibarRuleUrlUpdated') ||
                                                'Rule URL updated successfully',
                                        );
                                    } else {
                                        this._showToast(
                                            res?.error ||
                                                chrome.i18n.getMessage('omnibarFailedUpdateRuleUrl') ||
                                                'Failed to update rule URL',
                                        );
                                    }
                                },
                            );
                            this.close();
                        }
                    } else {
                        this._showToast(selected.dataset.ruleTitle);
                    }
                }
                return;
            }

            // -- ccr & ccg: Change Rule/Group Color (apply selected colors) ------
            if ((isCcr || isCcg) && this.selectedActionItems && this.selectedActionItems.size > 0) {
                const ids = Array.from(this.selectedActionItems);
                const listItems = Array.from(resultsList.getElementsByTagName('li'));
                const updates = [];
                const isRule = isCcr;
                const itemType = isRule ? 'ccr-item' : 'ccg-item';
                const mainType = isRule ? 'ccr-rule' : 'ccg-group';
                const subType = isRule ? 'ccr-color' : 'ccg-color';
                ids.forEach((id) => {
                    const [mainId, colorName] = id.split('::');
                    if (mainId && colorName) {
                        let groupId, specialGroupKey;
                        if (isRule) {
                            updates.push({
                                ruleName: mainId,
                                color: colorName,
                            });
                        } else {
                            if (mainId.startsWith('group_')) {
                                groupId = parseInt(mainId.replace('group_', ''), 10);
                            } else if (mainId.startsWith('special_')) {
                                specialGroupKey = mainId.replace('special_', '');
                            }
                            updates.push({
                                groupId,
                                specialGroupKey,
                                color: colorName,
                            });
                        }
                        const targetLi = listItems.find((item) => {
                            if (
                                item.dataset.type !== itemType ||
                                item.dataset[isRule ? 'ccrType' : 'ccgType'] !== mainType
                            )
                                return false;
                            return isRule
                                ? item.dataset.ruleName === mainId
                                : groupId !== undefined
                                  ? item.dataset.groupId === String(groupId)
                                  : item.dataset.specialGroupKey === specialGroupKey;
                        });
                        if (targetLi) {
                            const dot = targetLi.querySelector('.hint-omni-group-dot');
                            if (dot) {
                                const colorCircle = listItems.find((item) => {
                                    if (
                                        item.dataset.type !== itemType ||
                                        item.dataset[isRule ? 'ccrType' : 'ccgType'] !== subType ||
                                        item.dataset[isRule ? 'ccrColorName' : 'ccgColorName'] !== colorName
                                    )
                                        return false;
                                    return isRule
                                        ? item.dataset.ruleName === mainId
                                        : groupId !== undefined
                                          ? item.dataset.groupId === String(groupId)
                                          : item.dataset.specialGroupKey === specialGroupKey;
                                });
                                dot.style.backgroundColor = colorCircle
                                    ? colorCircle.dataset[isRule ? 'ccrColorValue' : 'ccgColorValue']
                                    : '#9e9e9e';
                            }
                        }
                    }
                });
                if (updates.length > 0) {
                    if (isRule) {
                        chrome.runtime.sendMessage({
                            action: 'updateRuleColor',
                            rules: updates,
                        });
                    } else {
                        chrome.runtime.sendMessage({
                            action: 'updateGroupColor',
                            groups: updates,
                        });
                    }
                }
                const count = updates.length;
                const colorI18n = updates[0]?.color
                    ? chrome.i18n.getMessage(`omnibarColorName_${updates[0].color}`) || updates[0].color
                    : '';
                if (isRule) {
                    this._showToast(
                        count > 1
                            ? `${chrome.i18n.getMessage('omnibarRuleColorUpdated') || 'Rule colors updated'} (${count} rules)`
                            : chrome.i18n.getMessage('omnibarRuleColorUpdated', [colorI18n]) || `Rule color updated`,
                    );
                } else {
                    this._showToast(
                        count > 1
                            ? `${chrome.i18n.getMessage('omnibarGroupColorUpdated') || 'Group colors updated'} (${count} groups)`
                            : chrome.i18n.getMessage('omnibarGroupColorUpdated', [colorI18n]) || `Group color updated`,
                    );
                }
                this.selectedActionItems.clear();
                this.close();
                return;
            }

            // -- qai: AI Query --------------------------------------
            if (currentLower.startsWith('qai:')) {
                const q = currentValue.substring(4).trim();
                if (q) {
                    this._renderResults(
                        [
                            {
                                title: chrome.i18n.getMessage('omnibarAiLoading') || '[LOADING] Consulting AI...',
                                url: q,
                                icon: '<svg width="24" height="24" aria-hidden="true" viewBox="0 0 471 471" xmlns="http://www.w3.org/2000/svg"><path fill="var(--text-color)" d="M235.5 471q0-48.866-18.84-91.845-18.252-42.978-50.044-74.771T91.845 254.34Q48.867 235.5 0 235.5q48.867 0 91.845-18.251 42.979-18.84 74.771-50.633t50.044-74.771Q235.5 48.867 235.5 0q0 48.867 18.251 91.845 18.84 42.978 50.633 74.771t74.771 50.633Q422.134 235.499 471 235.5q-48.866 0-91.845 18.84-42.978 18.252-74.771 50.044-31.793 31.793-50.633 74.771Q235.501 422.134 235.5 471"></path></svg>',
                            },
                        ],
                        'ai-hint',
                    );
                    chrome.runtime.sendMessage(
                        {
                            action: 'searchGemini',
                            query: q,
                        },
                        (response) => {
                            if (response && response.success) {
                                this._renderAIResponse(q, response.answer);
                            } else {
                                const errMsg = response?.error || 'Unknown error';
                                this._renderResults(
                                    [
                                        {
                                            title:
                                                chrome.i18n.getMessage('omnibarAiError') || '[ERR] Error consulting AI',
                                            url: errMsg,
                                            icon: '<svg width="24" height="24" aria-hidden="true" viewBox="0 0 471 471" xmlns="http://www.w3.org/2000/svg"><path fill="var(--text-color)" d="M235.5 471q0-48.866-18.84-91.845-18.252-42.978-50.044-74.771T91.845 254.34Q48.867 235.5 0 235.5q48.867 0 91.845-18.251 42.979-18.84 74.771-50.633t50.044-74.771Q235.5 48.867 235.5 0q0 48.867 18.251 91.845 18.84 42.978 50.633 74.771t74.771 50.633Q422.134 235.499 471 235.5q-48.866 0-91.845 18.84-42.978 18.252-74.771 50.044-31.793 31.793-50.633 74.771Q235.501 422.134 235.5 471"></path></svg>',
                                        },
                                    ],
                                    'ai-hint',
                                );
                            }
                        },
                    );
                }
                if (event.ctrlKey) {
                    this._keepOpenOnClose = true;
                    setTimeout(() => {
                        this._keepOpenOnClose = false;
                    }, 1000);
                }
                return;
            }

            // -- qaia: AI Agent ---------------------------------------
            if (currentLower.startsWith('qaia:')) {
                const q = currentValue.substring(5).trim();
                if (q) {
                    this._runOmniAgentQuery(q);
                }
                if (event.ctrlKey) {
                    this._keepOpenOnClose = true;
                    setTimeout(() => {
                        this._keepOpenOnClose = false;
                    }, 1000);
                }
                return;
            }
            if (count === 0) {
                this._executeDefaultSearch(currentValue);
                return;
            }

            // Clamp selectedIndex just in case
            const idx = Math.max(0, Math.min(this.selectedIndex, count - 1));
            const selectedItem = items[idx];
            const t = selectedItem?.dataset?.type || '';

            // -- Ctrl+Enter: expand conversation / note / image / message -----
            if (event.ctrlKey) {
                if (t === 'conversation') {
                    this._expandConversation(selectedItem);
                    return;
                }
                if (t === 'note') {
                    this._expandNote(selectedItem);
                    return;
                }
                if (t === 'message') {
                    this._expandMessage(selectedItem);
                    return;
                }
                if (t === 'image') {
                    this._expandImage(selectedItem);
                    return;
                }

                // For other types, run normal action but keep Omnibar open
                this._keepOpenOnClose = true;
                setTimeout(() => {
                    this._keepOpenOnClose = false;
                }, 1000);
            }

            // -- Enter normal or Ctrl+Enter fallback: copy / open --------------------------
            if (['conversation', 'note', 'message'].includes(t)) {
                const copyBtn = selectedItem.querySelector('.hint-omni-copy-btn');
                if (copyBtn) copyBtn.click();
            } else if (t === 'image') {
                this._copyImageToClipboard(selectedItem);
            } else if (selectedItem) {
                selectedItem.click();
            }
            return;
        }
        if (event.key === 'ArrowRight') {
            // Only autocomplete if cursor is at the end of the input
            const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
            if (atEnd && count > 0 && this.selectedIndex < count) {
                const item = items[this.selectedIndex];
                const title = item.dataset.title;
                if (title) {
                    const current = input.value;
                    const pBookmarks = this._getPrefixVal('b:', 'prefixSearchBookmarks');
                    const pHistory = this._getPrefixVal('h:', 'prefixSearchHistory');
                    const pClosed = this._getPrefixVal('c:', 'prefixSearchRecentlyClosed');
                    const pDeep = this._getPrefixVal('f:', 'prefixSearchText');
                    const pPopup = this._getPrefixVal('we:', 'omnibarPrefixPopupDesc');
                    const pPip = this._getPrefixVal('wp:', 'omnibarPrefixPipDesc');
                    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const pPattern = [pBookmarks, pHistory, pClosed, pDeep, pPopup, pPip].map(escapeRegExp).join('|');
                    const prefixMatch = current.match(new RegExp(`^(${pPattern})\\s*`));
                    const prefix = prefixMatch ? prefixMatch[0] : '';
                    input.value = prefix + title;
                    setTimeout(() => (input.selectionStart = input.selectionEnd = input.value.length), 0);
                    event.preventDefault();
                }
            }
            // If cursor is not at end, allow native cursor movement
        }
    }
    _executeDefaultSearch(query) {
        if (!query) return;
        const webSearchPrefixes = {};
        webSearchPrefixes[this._getPrefixVal('y:', 'prefixSearchYouTube')] = 'searchYoutube';
        webSearchPrefixes[this._getPrefixVal('am:', 'prefixSearchAmazon')] = 'searchAmazon';
        webSearchPrefixes[this._getPrefixVal('ams:', 'prefixSearchAmazonES')] = 'searchAmazonEs';
        webSearchPrefixes[this._getPrefixVal('g:', 'prefixSearchGoogle')] = 'searchGoogle';
        webSearchPrefixes[this._getPrefixVal('d:', 'prefixSearchDuckDuckGo')] = 'searchDuckDuckGo';
        webSearchPrefixes[this._getPrefixVal('w:', 'prefixSearchWikipedia')] = 'searchWikipedia';
        webSearchPrefixes[this._getPrefixVal('gm:', 'prefixSearchGoogleMaps')] = 'searchGoogleMaps';
        webSearchPrefixes[this._getPrefixVal('x:', 'prefixSearchX')] = 'searchX';
        let action = 'searchGoogle';
        let finalQuery = query;
        let handled = false;
        for (const [prefix, act] of Object.entries(webSearchPrefixes)) {
            if (query.startsWith(prefix)) {
                action = act;
                finalQuery = query.substring(prefix.length).trim();
                handled = true;
                break;
            }
        }
        if (!handled) {
            const nonUrlPrefixes = [
                this._getPrefixVal('b:', 'prefixSearchBookmarks'),
                this._getPrefixVal('h:', 'prefixSearchHistory'),
                this._getPrefixVal('c:', 'prefixSearchRecentlyClosed'),
                this._getPrefixVal('f:', 'prefixSearchText'),
                this._getPrefixVal('qai:', 'prefixQueryAI'),
                this._getPrefixVal('qaia:', 'prefixQueryAIAgent'),
                this._getPrefixVal('lai:', 'prefixListConversations'),
                this._getPrefixVal('limg:', 'prefixListImages'),
                this._getPrefixVal('lnt:', 'prefixListNotes'),
                this._getPrefixVal('we:', 'omnibarPrefixPopupDesc'),
                this._getPrefixVal('wp:', 'omnibarPrefixPipDesc'),
                this._getPrefixVal('bgr:', 'omnibarPrefixBackupDesc'),
            ];
            const isUrl =
                !nonUrlPrefixes.some((p) => query.startsWith(p)) &&
                ((query.includes('.') && !query.includes(' ')) || query.toLowerCase().startsWith('localhost'));
            if (isUrl) {
                let url = query;
                if (!/^(https?|file):\/\//i.test(url)) url = 'https://' + url;
                chrome.runtime.sendMessage({
                    action: 'openUrl',
                    url,
                });
                this.close();
                return;
            }
            const triggerPrefixes = [
                this._getPrefixVal('b:', 'prefixSearchBookmarks'),
                this._getPrefixVal('h:', 'prefixSearchHistory'),
                this._getPrefixVal('c:', 'prefixSearchRecentlyClosed'),
                this._getPrefixVal('f:', 'prefixSearchText'),
                this._getPrefixVal('we:', 'omnibarPrefixPopupDesc'),
                this._getPrefixVal('wp:', 'omnibarPrefixPipDesc'),
                this._getPrefixVal('bgr:', 'omnibarPrefixBackupDesc'),
            ];
            if (triggerPrefixes.some((p) => query.startsWith(p))) {
                finalQuery = query.substring(query.indexOf(':') + 1).trim();
                if (!finalQuery && !query.startsWith(this._getPrefixVal('f:', 'prefixSearchText'))) {
                    this.close();
                    return;
                }
            }
        }
        if (finalQuery && !query.startsWith(this._getPrefixVal('f:', 'prefixSearchText'))) {
            chrome.runtime.sendMessage({
                action,
                query: finalQuery,
            });
        }
        this.close();
    }
    _copyConversation(title, entryIdsJson) {
        const entryIds = (() => {
            try {
                return JSON.parse(entryIdsJson || '[]');
            } catch {
                return [];
            }
        })();
        if (!entryIds.length) {
            this.close();
            this._sendNotification(
                chrome.i18n.getMessage('errorCopyingTitle') || 'Error copying',
                chrome.i18n.getMessage('errorCopyingNoEntries') || 'No entries found in this conversation',
            );
            return;
        }
        chrome.runtime.sendMessage(
            {
                action: 'getOmnibarConversationContent',
                title,
                entryIds,
            },
            (res) => {
                if (res && res.success && res.entries) {
                    const plainText =
                        (title ? `${title}\n${'-'.repeat(40)}\n\n` : '') +
                        res.entries.map((e) => `**${e.query}**\n\n${e.answer}`).join('\n\n--\n\n');
                    const htmlText =
                        `<h3>${title || ''}</h3>` +
                        res.entries
                            .map(
                                (e) =>
                                    `<p><strong>${e.query.replace(/</g, '&lt;')}</strong></p>${_omniParseMarkdown(e.answer)}`,
                            )
                            .join('<hr>');
                    _omniCopyRich(plainText, htmlText)
                        .then(() => {
                            this.close();
                            this._sendNotification(
                                chrome.i18n.getMessage('copiedToClipboard') || 'Copied to clipboard',
                                chrome.i18n.getMessage('conversationCopied', [
                                    title || chrome.i18n.getMessage('untitled') || 'Untitled',
                                ]) || `Conversation "${title || 'Untitled'}" copied successfully`,
                            );
                        })
                        .catch((err) => {
                            this.close();
                            this._sendNotification(
                                chrome.i18n.getMessage('errorCopyingTitle') || 'Error copying',
                                chrome.i18n.getMessage('errorCopyingNoClipboard', [err.message]) ||
                                    `Could not access clipboard: ${err.message}`,
                            );
                        });
                } else {
                    this.close();
                    this._sendNotification(
                        chrome.i18n.getMessage('errorCopyingTitle') || 'Error copying',
                        res?.error || chrome.i18n.getMessage('errorCopying') || 'Could not copy to clipboard',
                    );
                }
            },
        );
    }
    _copyNote(li) {
        const title = li.dataset.title || '';
        const type = li.dataset.noteType || 'text';
        let plainText = li.dataset.notePlainText || li.dataset.noteContent || '';

        // Formatting for structured notes
        if (type === 'checklist' || type === 'kanban') {
            try {
                const content = JSON.parse(li.dataset.noteContentJson || '[]');
                if (Array.isArray(content)) {
                    if (type === 'checklist') {
                        plainText = content.map((item) => `${item.checked ? '[x]' : '[ ]'} ${item.text}`).join('\n');
                    } else if (type === 'kanban') {
                        const stateLabels = {
                            todo: chrome.i18n.getMessage('omnibarTodoLabel') || 'To Do',
                            inprogress: chrome.i18n.getMessage('omnibarInProgressLabel') || 'In Progress',
                            done: chrome.i18n.getMessage('omnibarDoneLabel') || 'Done',
                        };
                        plainText = content
                            .map((item) => `[${stateLabels[item.state] || item.state}] ${item.text}`)
                            .join('\n');
                    }
                }
            } catch (e) {
                console.error('Error parsing note content for copy:', e);
            }
        }
        const textToCopy = plainText ? `${title}\n\n${plainText}` : title;
        if (!textToCopy.trim()) {
            this.close();
            this._sendNotification(
                chrome.i18n.getMessage('errorCopyingTitle') || 'Error copying',
                chrome.i18n.getMessage('errorCopyingNoteEmpty') || 'The note is empty',
            );
            return;
        }
        navigator.clipboard
            .writeText(textToCopy)
            .then(() => {
                this.close();
                this._sendNotification(
                    chrome.i18n.getMessage('copiedToClipboard') || 'Copied to clipboard',
                    chrome.i18n.getMessage('noteCopiedOmni', [title]) || `Note "${title}" copied successfully`,
                );
            })
            .catch((err) => {
                this.close();
                this._sendNotification(
                    chrome.i18n.getMessage('errorCopyingTitle') || 'Error copying',
                    chrome.i18n.getMessage('errorCopyingNoClipboard', [err.message]) ||
                        `Could not access clipboard: ${err.message}`,
                );
            });
    }
    _copyImageToClipboard(li) {
        const imgId = li.dataset.imgId;
        const imgTitle = li.dataset.imgTitle || 'Image';
        const existingDataUrl = li.dataset.imgDataUrl;
        const doCopy = (dataUrl) => {
            fetch(dataUrl)
                .then((r) => r.blob())
                .then((blob) =>
                    navigator.clipboard.write([
                        new ClipboardItem({
                            [blob.type]: blob,
                        }),
                    ]),
                )
                .then(() => {
                    this.close();
                    this._sendNotification(
                        chrome.i18n.getMessage('copiedToClipboard') || 'Copied to clipboard',
                        chrome.i18n.getMessage('imageCopied', [imgTitle]) || `Image "${imgTitle}" copied successfully`,
                    );
                })
                .catch(() => {
                    navigator.clipboard
                        .writeText(dataUrl)
                        .then(() => {
                            this.close();
                            this._sendNotification(
                                chrome.i18n.getMessage('copiedToClipboard') || 'Copied to clipboard',
                                chrome.i18n.getMessage('imageUrlCopied', [imgTitle]) ||
                                    `Image URL "${imgTitle}" copied`,
                            );
                        })
                        .catch((err) =>
                            this._sendNotification(
                                chrome.i18n.getMessage('errorCopyingTitle') || 'Error copying',
                                err.message,
                            ),
                        );
                });
        };
        if (existingDataUrl) {
            doCopy(existingDataUrl);
            return;
        }
        chrome.runtime.sendMessage(
            {
                action: 'getOmnibarImageById',
                id: parseInt(imgId),
            },
            (res) => {
                if (res && res.dataUrl) {
                    li.dataset.imgDataUrl = res.dataUrl;
                    doCopy(res.dataUrl);
                } else
                    this._sendNotification(
                        chrome.i18n.getMessage('errorCopyingTitle') || 'Error copying',
                        chrome.i18n.getMessage('errorCopyingImageFail') || 'Could not load image',
                    );
            },
        );
    }
    _expandImage(li) {
        if (!this.shadow) return;
        const existing = li.querySelector('.hint-omni-img-expand');
        if (existing) {
            existing.remove();
            li.style.flexWrap = '';
            return;
        }
        const imgId = li.dataset.imgId;
        const imgTitle = li.dataset.imgTitle || 'Image';
        const existingDataUrl = li.dataset.imgDataUrl;
        const showExpand = (dataUrl) => {
            const expandEl = document.createElement('div');
            expandEl.className = 'hint-omni-img-expand hint-omni-img-expand-container';
            const img = document.createElement('img');
            img.src = dataUrl;
            img.className = 'hint-omni-img-preview';
            expandEl.appendChild(img);
            li.style.flexWrap = 'wrap';
            li.appendChild(expandEl);
        };
        if (existingDataUrl) {
            showExpand(existingDataUrl);
            return;
        }
        const loadEl = document.createElement('div');
        loadEl.className = 'hint-omni-img-expand hint-omni-conv-expand';
        loadEl.textContent = chrome.i18n.getMessage('loadingImages') || '[LOADING] Loading image...';
        li.style.flexWrap = 'wrap';
        li.appendChild(loadEl);
        chrome.runtime.sendMessage(
            {
                action: 'getOmnibarImageById',
                id: parseInt(imgId),
            },
            (res) => {
                if (res && res.dataUrl) {
                    li.dataset.imgDataUrl = res.dataUrl;
                    loadEl.remove();
                    showExpand(res.dataUrl);
                } else {
                    loadEl.textContent =
                        chrome.i18n.getMessage('errorCopyingImageFail') || '[ERR] Could not load image';
                }
            },
        );
    }
    _copyMessage(li) {
        const query = li.dataset.msgQuery || '';
        const answer = li.dataset.msgAnswer || '';
        const title = li.dataset.title || 'Message';
        const plainText = `**${query}**\n\n${answer}`;
        const htmlText = `<p><strong>${query.replace(/</g, '&lt;')}</strong></p>${_omniParseMarkdown(answer)}`;
        _omniCopyRich(plainText, htmlText)
            .then(() => {
                this.close();
                this._sendNotification(
                    chrome.i18n.getMessage('copiedToClipboard') || 'Copied to clipboard',
                    chrome.i18n.getMessage('textCopied', [title.substring(0, 40)]) ||
                        `"${title.substring(0, 40)}" copied`,
                );
            })
            .catch((err) =>
                this._sendNotification(chrome.i18n.getMessage('errorCopyingTitle') || 'Error copying', err.message),
            );
    }
    _expandMessage(li) {
        if (!this.shadow) return;
        const existing = li.querySelector('.hint-omni-conv-expand');
        if (existing) {
            existing.remove();
            li.style.flexWrap = '';
            return;
        }
        const query = li.dataset.msgQuery || '';
        const answer = li.dataset.msgAnswer || '';
        const expandEl = document.createElement('div');
        expandEl.className = 'hint-omni-conv-expand hint-omni-ai-md';
        expandEl.innerHTML = `<p class="hint-omni-expand-title">${query.replace(/</g, '&lt;')}</p><hr class="hint-omni-expand-sep">${_omniParseMarkdown(answer)}`;
        li.style.flexWrap = 'wrap';
        li.appendChild(expandEl);
    }
    _copyImage(imgId, imgTitle, li) {
        if (li) {
            this._copyImageToClipboard(li);
            return;
        }
        chrome.runtime.sendMessage({
            action: 'openImageFromOmnibar',
            id: parseInt(imgId || 0),
        });
        this.close();
    }
    _showImageModal(li) {
        this._expandImage(li);
    }
    _sendNotification(title, message) {
        chrome.runtime.sendMessage({
            action: 'showOmnibarNotification',
            title,
            message,
        });
    }
    _showToast(message) {
        // Legacy: kept for AI response toast (does NOT close omnibar)
        if (!this.shadow) return;
        let toast = this.shadow.getElementById('hint-omni-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'hint-omni-toast';
            toast.className = 'hint-omni-toast';
            const barEl = this.shadow.getElementById('hint-omni-bar');
            if (barEl) barEl.style.position = 'relative';
            if (barEl) barEl.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            if (toast) toast.style.opacity = '0';
        }, 2500);
    }

    /**
     * [AI INSTRUCTION]
     * Use this method to retrieve the user's customized prefix for any omnibar command.
     * DO NOT redefine a local `getPrefixVal` arrow function in your methods.
     * @param {string} defaultPrefix - The default prefix string (e.g. 'dg:').
     * @param {string} descKey - The registry key for the custom shortcut (e.g. 'prefixDeleteGroup').
     * @returns {string} The resolved prefix to use.
     */
    /**
     * The prefixes that send the query straight to a site.
     *
     * Same shape as the rest of the list so `@` can show them, and the single place
     * that knows which site each one goes to.
     */
    _getSiteSearchPrefixes() {
        const sites = [
            ['g:', 'prefixSearchGoogle', 'omnibarPrefixGoogleTitle', 'Google'],
            ['y:', 'prefixSearchYouTube', 'omnibarPrefixYouTubeTitle', 'YouTube'],
            ['d:', 'prefixSearchDuckDuckGo', 'omnibarPrefixDuckDuckGoTitle', 'DuckDuckGo'],
            ['w:', 'prefixSearchWikipedia', 'omnibarPrefixWikipediaTitle', 'Wikipedia'],
            ['gm:', 'prefixSearchGoogleMaps', 'omnibarPrefixGoogleMapsTitle', 'Google Maps'],
            ['x:', 'prefixSearchX', 'omnibarPrefixXTitle', 'X'],
            ['am:', 'prefixSearchAmazon', 'omnibarPrefixAmazonTitle', 'Amazon'],
            ['ams:', 'prefixSearchAmazonES', 'omnibarPrefixAmazonESTitle', 'Amazon ES'],
        ];
        const template = chrome.i18n.getMessage('omnibarPrefixSiteSearchDesc') || 'Search on $SITE$';
        return sites.map(([prefix, descKey, titleKey, site]) => ({
            prefix: this._getPrefixVal(prefix, descKey),
            title: chrome.i18n.getMessage(titleKey) || site,
            desc: template.replace('$SITE$', site).replace('$1', site),
        }));
    }

    _getPrefixVal(defaultPrefix, descKey) {
        if (this.registry) {
            const custom = this.registry.getRawShortcuts()[descKey];
            if (custom !== undefined) return custom;
        }
        return defaultPrefix;
    }

    /**
     * [AI INSTRUCTION]
     * Use this method whenever you need to inject a colored dot (e.g. for rules, tab groups, or tags).
     * Do not manually create a div with 'hint-omni-group-dot' class.
     * @param {HTMLElement} parent - The element to append the dot to.
     * @param {string} color - The color string (can be a system color name or hex).
     * @param {Function} [onClick] - Optional click handler for the dot.
     * @returns {HTMLElement} The created dot element.
     */
    _injectColorDot(parent, color, onClick) {
        const dot = document.createElement('div');
        dot.className = 'hint-omni-group-dot';
        dot.style.backgroundColor = color || '#9e9e9e';
        if (onClick) {
            dot.addEventListener('click', onClick);
        }
        parent.appendChild(dot);
        return dot;
    }

    /**
     * [AI INSTRUCTION]
     * Use this method to inject standard SVG icons into Omnibar list items.
     * Do not duplicate raw SVG strings if you can reuse standard ones.
     * @param {HTMLElement} parent - The list item to append to.
     * @param {string} svgHtml - The raw SVG string or an ID/name representing a standard SVG icon.
     * @param {string} [className='hint-omni-ai-prefix-icon'] - The class name for the span container.
     * @returns {HTMLElement} The created span element.
     */
    _injectSvgIcon(parent, svgHtml, className = 'hint-omni-ai-prefix-icon') {
        const iconEl = document.createElement('span');
        iconEl.className = className;
        iconEl.innerHTML = svgHtml;
        parent.appendChild(iconEl);
        return iconEl;
    }

    /**
     * [AI INSTRUCTION]
     * Use this method to validate and add an array of URLs to a specific rule.
     * @param {string} ruleName - The name of the rule.
     * @param {string[]} rawUrls - The array of raw URL strings to validate and add.
     */
    _addValidatedUrlsToRule(ruleName, rawUrls) {
        const validatedUrls = [];
        const invalidUrls = [];
        for (const rawUrl of rawUrls) {
            let u = rawUrl.trim();
            if (!u) continue;
            if (!u.match(/^[a-zA-Z]+:\/\//)) {
                u = 'https://' + u;
            }
            if (u.includes(' ')) {
                invalidUrls.push(rawUrl);
                continue;
            }
            try {
                const parsed = new URL(u);
                if (parsed.hostname.length === 0) throw new Error();
                validatedUrls.push(u);
            } catch {
                invalidUrls.push(rawUrl);
            }
        }
        if (invalidUrls.length > 0) {
            this._showToast(
                chrome.i18n.getMessage('omnibarInvalidUrlFormat', [invalidUrls.join(', ')]) ||
                    `Invalid URL format: ${invalidUrls.join(', ')}`,
            );
        }
        if (validatedUrls.length > 0) {
            chrome.runtime.sendMessage(
                {
                    action: 'addUrlsToRule',
                    ruleName: ruleName,
                    urls: validatedUrls,
                },
                (res) => {
                    if (res && res.success) {
                        this._showToast(
                            chrome.i18n.getMessage('omnibarAddedUrlsToRule', [
                                validatedUrls.length.toString(),
                                ruleName,
                            ]) || `Added ${validatedUrls.length} URLs to rule "${ruleName}"`,
                        );
                    } else {
                        this._showToast(
                            res?.error || chrome.i18n.getMessage('omnibarFailedAddUrls') || 'Failed to add URLs',
                        );
                    }
                },
            );
        }
    }
    _getThemeColors() {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isDark
            ? {
                  blue: '#8AB4F8',
                  red: '#F28B82',
                  yellow: '#FDD663',
                  green: '#81C995',
                  pink: '#FF8BCB',
                  purple: '#C58AF9',
                  cyan: '#78D9EC',
                  orange: '#FCAD70',
                  grey: '#DADCE0',
              }
            : {
                  blue: '#1A73E8',
                  red: '#D93025',
                  yellow: '#F9AB00',
                  green: '#188038',
                  pink: '#D01884',
                  purple: '#A142F4',
                  cyan: '#007B83',
                  orange: '#FA903E',
                  grey: '#5F6368',
              };
    }
    _getColorOptions() {
        const colors = this._getThemeColors();
        return ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'].map((name) => ({
            name,
            value: colors[name],
        }));
    }
    _getRuleColorValue(colorName) {
        return this._getThemeColors()[colorName] || '#9e9e9e';
    }
    _showRuleColorPickerPopup(dot, ruleName, currentColor) {
        if (!this.shadow) return;
        const existing = this.shadow.querySelector('.hint-omni-color-popup');
        if (existing) existing.remove();
        const popup = document.createElement('div');
        popup.className = 'hint-omni-color-popup';
        const RULE_COLORS = this._getColorOptions();
        RULE_COLORS.forEach((c) => {
            const item = document.createElement('div');
            item.className = 'hint-omni-color-popup-item';
            item.style.backgroundColor = c.value;
            item.title = c.name;
            if (currentColor === c.name) {
                item.style.border = '2px solid #fff';
            }
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                chrome.runtime.sendMessage(
                    {
                        action: 'updateRuleColor',
                        ruleName: ruleName,
                        color: c.name,
                    },
                    (res) => {
                        if (res && res.success) {
                            dot.style.backgroundColor = c.value;
                            this._showToast(
                                chrome.i18n.getMessage('omnibarRuleColorUpdated', [c.name]) ||
                                    `Rule color updated to ${c.name}`,
                            );
                        }
                    },
                );
                popup.remove();
            });
            popup.appendChild(item);
        });
        const rect = dot.getBoundingClientRect();
        const barEl = this.shadow.getElementById('hint-omni-bar');
        if (barEl) {
            const barRect = barEl.getBoundingClientRect();
            popup.style.top = `${rect.top - barRect.top - 4}px`;
            popup.style.left = `${rect.right - barRect.left + 8}px`;
            barEl.appendChild(popup);
        }
        const clickHandler = (e) => {
            if (!popup.contains(e.target) && e.target !== dot) {
                popup.remove();
                document.removeEventListener('click', clickHandler);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', clickHandler);
        }, 0);
    }
    _expandNote(li) {
        if (!this.shadow) return;
        const existingExpand = li.querySelector('.hint-omni-conv-expand');
        if (existingExpand) {
            existingExpand.remove();
            return;
        }
        const type = li.dataset.noteType || 'text';
        const noteId = li.dataset.noteId;
        const expandEl = document.createElement('div');
        expandEl.className = 'hint-omni-conv-expand hint-omni-note-expand';
        const _persistNote = (items) => {
            if (!noteId) return;
            li.dataset.noteContentJson = JSON.stringify(items);
            chrome.runtime.sendMessage({
                action: 'updateOmnibarNote',
                id: Number(noteId),
                content: items,
            });
        };
        if (type === 'checklist') {
            let items = [];
            try {
                items = JSON.parse(li.dataset.noteContentJson || '[]');
            } catch {}
            if (!items.length) {
                expandEl.textContent = chrome.i18n.getMessage('omnibarChecklistEmpty') || '(empty list)';
            } else {
                const list = document.createElement('div');
                list.className = 'hint-omni-interactive-list';
                items.forEach((item, idx) => {
                    const row = document.createElement('div');
                    row.className = 'hint-omni-interactive-row';
                    if (item.checked) row.classList.add('completed');
                    const checkBtn = document.createElement('button');
                    checkBtn.className = 'hint-omni-check-btn';
                    if (item.checked) checkBtn.classList.add('checked');
                    checkBtn.innerHTML = item.checked
                        ? `<svg class="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>`
                        : '';
                    checkBtn.title = item.checked ? chrome.i18n.getMessage('omnibarAgentOk') || '[OK]' : '[ ]';
                    const textSpan = document.createElement('span');
                    textSpan.textContent = item.text || '';
                    textSpan.className = 'hint-omni-item-text';
                    if (item.checked) textSpan.classList.add('completed');
                    const toggle = () => {
                        items[idx].checked = !items[idx].checked;
                        const c = items[idx].checked;
                        checkBtn.classList.toggle('checked', c);
                        textSpan.classList.toggle('completed', c);
                        row.classList.toggle('completed', c);
                        checkBtn.innerHTML = c
                            ? `<svg class="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>`
                            : '';
                        _persistNote(items);
                    };
                    checkBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggle();
                    });
                    textSpan.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggle();
                    });
                    row.appendChild(textSpan); // text LEFT
                    row.appendChild(checkBtn); // button RIGHT
                    list.appendChild(row);
                });
                expandEl.appendChild(list);
            }
        } else if (type === 'kanban') {
            let items = [];
            try {
                items = JSON.parse(li.dataset.noteContentJson || '[]');
            } catch {}
            const stateLabels = {
                todo: chrome.i18n.getMessage('omnibarKanbanTodo') || 'To Do',
                inprogress: chrome.i18n.getMessage('omnibarKanbanInProgress') || 'In Progress',
                done: chrome.i18n.getMessage('omnibarKanbanDone') || 'Done',
            };
            // Kanban state styles -- identical to listGroup .kanban-state-view
            const stateColors = {
                todo: 'var(--text-color)',
                inprogress: 'var(--text-color)',
                done: 'var(--text-on-color)',
            };
            const stateOrder = ['todo', 'inprogress', 'done'];
            if (!items.length) {
                expandEl.textContent = chrome.i18n.getMessage('omnibarKanbanEmpty') || '(empty board)';
            } else {
                const list = document.createElement('div');
                list.className = 'hint-omni-interactive-list';
                items.forEach((item, idx) => {
                    const row = document.createElement('div');
                    const currentState = item.state || 'todo';
                    const isDone = currentState === 'done';
                    row.className = 'hint-omni-interactive-row';
                    if (isDone) row.classList.add('completed');
                    const textSpan = document.createElement('span');
                    textSpan.textContent = item.text || '';
                    textSpan.className = 'hint-omni-item-text';
                    const applyStyle = (btn, state) => {
                        btn.className = 'hint-omni-kanban-btn';
                        btn.style.color = stateColors[state];
                    };
                    const stateBtn = document.createElement('button');
                    stateBtn.dataset.state = currentState;
                    stateBtn.textContent = stateLabels[currentState];
                    applyStyle(stateBtn, currentState);
                    stateBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const next = stateOrder[(stateOrder.indexOf(stateBtn.dataset.state) + 1) % stateOrder.length];
                        items[idx].state = next;
                        stateBtn.dataset.state = next;
                        stateBtn.textContent = stateLabels[next];
                        applyStyle(stateBtn, next);
                        const nowDone = next === 'done';
                        row.classList.toggle('completed', nowDone);
                        _persistNote(items);
                    });
                    row.appendChild(textSpan);
                    row.appendChild(stateBtn);
                    list.appendChild(row);
                });
                expandEl.appendChild(list);
            }
        } else {
            // Text note -- render HTML as-is
            const content = li.dataset.noteContent || li.dataset.notePlainText || '';
            if (content.startsWith('<') || content.includes('</')) {
                expandEl.innerHTML = content;
                expandEl.style.userSelect = 'text';
                expandEl.style.cursor = 'text';
            } else {
                expandEl.innerHTML = _omniParseMarkdown(content);
            }
        }
        li.appendChild(expandEl);
    }
    _expandConversation(li) {
        if (!this.shadow) return;

        // Toggle: if already expanded, collapse it
        const existingExpand = li.querySelector('.hint-omni-conv-expand');
        if (existingExpand) {
            existingExpand.remove();
            li.style.flexWrap = '';
            return;
        }
        const title = li.dataset.convTitle || '';
        const entryIdsJson = li.dataset.convEntryIds || '[]';
        const entryIds = (() => {
            try {
                return JSON.parse(entryIdsJson);
            } catch {
                return [];
            }
        })();
        if (!entryIds.length) return;

        // Show loading indicator
        const expandEl = document.createElement('div');
        expandEl.className = 'hint-omni-conv-expand';
        expandEl.textContent =
            chrome.i18n.getMessage('omnibarLoadingConversation') || '[LOADING] Loading conversation...';
        expandEl.style.userSelect = 'text';
        expandEl.style.cursor = 'text';
        li.style.flexWrap = 'wrap';
        li.appendChild(expandEl);
        chrome.runtime.sendMessage(
            {
                action: 'getOmnibarConversationContent',
                title,
                entryIds,
            },
            (res) => {
                if (res && res.success && res.text) {
                    expandEl.textContent = res.text;
                } else {
                    expandEl.textContent =
                        chrome.i18n.getMessage('omnibarAgentErr') ||
                        '[ERR]' +
                            ' ' +
                            (res?.error ||
                                chrome.i18n.getMessage('omnibarErrLoadingConversation') ||
                                'Could not load conversation');
                }
            },
        );
    }

    // -- Agent query runner ---------------------------------------------
    _extractJSON(text) {
        if (!text) return null;
        let s = text.trim();
        s = s
            .replace(/^```(?:json)?\s*/im, '')
            .replace(/\s*```\s*$/im, '')
            .trim();
        const startBrace = s.indexOf('{');
        const startBracket = s.indexOf('[');
        let start = -1;
        if (startBrace === -1 && startBracket === -1) return null;
        if (startBrace === -1) start = startBracket;
        else if (startBracket === -1) start = startBrace;
        else start = Math.min(startBrace, startBracket);
        const openChar = s[start];
        const closeChar = openChar === '{' ? '}' : ']';
        let depth = 0,
            inString = false,
            escape = false;
        for (let i = start; i < s.length; i++) {
            const c = s[i];
            if (escape) {
                escape = false;
                continue;
            }
            if (c === '\\' && inString) {
                escape = true;
                continue;
            }
            if (c === '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;
            if (c === openChar) depth++;
            else if (c === closeChar) {
                depth--;
                if (depth === 0) {
                    try {
                        return JSON.parse(s.substring(start, i + 1));
                    } catch {
                        return null;
                    }
                }
            }
        }
        return null;
    }
    _getOmniToolLabel(tool, params) {
        const i18n = (k) => chrome.i18n.getMessage(k) || k;
        try {
            switch (tool) {
                case 'getOpenTabs':
                    return i18n('toolGetOpenTabs');
                case 'getActiveTab':
                    return i18n('toolGetActiveTab');
                case 'getActiveTabContent':
                    return i18n('toolGetActiveTabContent');
                case 'findAndSwitchToTab':
                    return chrome.i18n.getMessage('toolFindAndSwitchToTab', [String(params.query || '')]);
                case 'switchToTab':
                    return chrome.i18n.getMessage('toolSwitchToTab', [String(params.tabId || '')]);
                case 'createNewTab':
                    return params.url
                        ? chrome.i18n.getMessage('toolCreateNewTabUrl', [
                              (() => {
                                  try {
                                      return new URL(params.url).hostname;
                                  } catch {
                                      return params.url;
                                  }
                              })(),
                          ])
                        : i18n('toolCreateNewTab');
                case 'closeTab':
                    return chrome.i18n.getMessage('toolCloseTab', [String(params.tabId || '')]);
                case 'closeTabs':
                    return chrome.i18n.getMessage('toolCloseTabs', [String((params.tabIds || []).length)]);
                case 'getTabGroups':
                    return i18n('toolGetTabGroups');
                case 'groupTabs':
                    return chrome.i18n.getMessage('toolGroupTabs', [String(params.groupName || '')]);
                case 'deleteTabGroup':
                    return chrome.i18n.getMessage('toolDeleteTabGroup', [String(params.groupId || '')]);
                case 'closeTabsInGroup':
                    return chrome.i18n.getMessage('toolCloseTabsInGroup', [
                        String(params.groupName || params.groupId || ''),
                    ]);
                case 'collapseTabGroup':
                    return chrome.i18n.getMessage('toolCollapseTabGroup', [
                        String(params.groupName || params.groupId || ''),
                    ]);
                case 'expandTabGroup':
                    return chrome.i18n.getMessage('toolExpandTabGroup', [
                        String(params.groupName || params.groupId || ''),
                    ]);
                case 'collapseAllGroups':
                    return i18n('toolCollapseAllGroups');
                case 'expandAllGroups':
                    return i18n('toolExpandAllGroups');
                case 'setGroupColor':
                    return chrome.i18n.getMessage('toolSetGroupColor', [
                        String(params.groupName || params.groupId || ''),
                        String(params.color || ''),
                    ]);
                case 'renameTabGroup':
                    return chrome.i18n.getMessage('toolRenameTabGroup', [
                        String(params.groupName || params.groupId || ''),
                        String(params.newName || ''),
                    ]);
                case 'moveTabToGroup':
                    return chrome.i18n.getMessage('toolMoveTabToGroup', [
                        String(params.tabId || ''),
                        String(params.groupName || params.groupId || ''),
                    ]);
                case 'regroupAllTabs':
                    return i18n('toolRegroupAllTabs');
                case 'removeDuplicateTabs':
                    return i18n('toolRemoveDuplicateTabs');
                case 'getRules':
                    return i18n('toolGetRules');
                case 'createRule':
                    return chrome.i18n.getMessage('toolCreateRule', [String(params.name || '')]);
                case 'updateRule':
                    return chrome.i18n.getMessage('toolUpdateRule', [String(params.name || '')]);
                case 'deleteRule':
                    return chrome.i18n.getMessage('toolDeleteRule', [String(params.name || '')]);
                case 'getActiveTheme':
                    return i18n('toolGetActiveTheme');
                case 'getSavedThemes':
                    return i18n('toolGetSavedThemes');
                case 'applyTheme':
                    return chrome.i18n.getMessage('toolApplyTheme', [String(params.themeName || '')]);
                case 'applyRandomTheme':
                    return i18n('toolApplyRandomTheme');
                case 'createAndApplyTheme':
                    return chrome.i18n.getMessage('toolCreateAndApplyTheme', [String(params.name || '')]);
                case 'updateTheme':
                    return chrome.i18n.getMessage('toolUpdateTheme', [String(params.name || '')]);
                case 'saveTheme':
                    return chrome.i18n.getMessage('toolSaveTheme', [String(params.name || '')]);
                case 'getBookmarks':
                    return i18n('toolGetBookmarks');
                case 'searchBookmarks':
                    return chrome.i18n.getMessage('toolSearchBookmarks', [String(params.query || '')]);
                case 'createBookmark':
                    return chrome.i18n.getMessage('toolCreateBookmark', [String(params.title || params.url || '')]);
                case 'getHistory':
                    return params.query
                        ? chrome.i18n.getMessage('toolGetHistoryQuery', [String(params.query)])
                        : i18n('toolGetHistory');
                case 'getRecentlyClosed':
                    return i18n('toolGetRecentlyClosed');
                case 'openUrl':
                    return chrome.i18n.getMessage('toolOpenUrl', [String(params.url || '')]);
                case 'searchGoogle':
                    return chrome.i18n.getMessage('toolSearchGoogle', [String(params.query || '')]);
                default:
                    return chrome.i18n.getMessage('omnibarAgentToolLabel', [tool]) || `[TOOL] ${tool}`;
            }
        } catch {
            return chrome.i18n.getMessage('omnibarAgentToolLabel', [tool]) || `[TOOL] ${tool}`;
        }
    }
    _renderAgentProgress(query, steps) {
        if (!this.shadow) return;
        const container = this.shadow.getElementById('hint-omni-results');
        const counter = this.shadow.getElementById('hint-omni-counter');
        container.innerHTML = '';
        counter.style.display = 'none';
        const li = document.createElement('li');
        li.className = 'hint-omni-result-item hint-omni-ai-response';
        const header = document.createElement('div');
        header.className = 'hint-omni-ai-header';
        const icon = document.createElement('span');
        icon.className = 'hint-omni-ai-icon';
        icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 16 16" fill="var(--text-on-color)"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"/></svg>`;
        const qTitle = document.createElement('span');
        qTitle.className = 'hint-omni-title hint-omni-ai-query-title';
        qTitle.textContent = query;
        header.appendChild(icon);
        header.appendChild(qTitle);
        li.appendChild(header);
        const stepsEl = document.createElement('div');
        stepsEl.className = 'hint-omni-agent-steps';
        steps.forEach((step) => {
            const row = document.createElement('div');
            row.className =
                'hint-omni-agent-step' + (step.status === 'done' ? ' done' : step.status === 'error' ? ' error' : '');
            const ico = document.createElement('span');
            ico.className = 'hint-omni-agent-step-icon';
            ico.textContent =
                step.status === 'done'
                    ? chrome.i18n.getMessage('omnibarAgentOk') || '[OK]'
                    : step.status === 'error'
                      ? chrome.i18n.getMessage('omnibarAgentErr') || '[ERR]'
                      : chrome.i18n.getMessage('omnibarAgentTool') || '[TOOL]';
            const lbl = document.createElement('span');
            lbl.textContent = step.label;
            row.appendChild(ico);
            row.appendChild(lbl);
            stepsEl.appendChild(row);
        });

        // Thinking indicator
        const thinking = document.createElement('div');
        thinking.className = 'hint-omni-agent-step hint-omni-agent-thinking';
        thinking.innerHTML = `<span class="hint-omni-agent-dots"><span>.</span><span>.</span><span>.</span></span><span>${chrome.i18n.getMessage('agentThinking') || 'Thinking...'}</span>`;
        stepsEl.appendChild(thinking);
        li.appendChild(stepsEl);
        container.appendChild(li);
    }
    _renderAgentResponse(query, steps, answer) {
        if (!this.shadow) return;
        const container = this.shadow.getElementById('hint-omni-results');
        const counter = this.shadow.getElementById('hint-omni-counter');
        container.innerHTML = '';
        counter.style.display = 'none';
        const li = document.createElement('li');
        li.className = 'hint-omni-result-item hint-omni-ai-response';
        const header = document.createElement('div');
        header.className = 'hint-omni-ai-header';
        const icon = document.createElement('span');
        icon.className = 'hint-omni-ai-icon';
        icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 16 16" fill="var(--text-color)"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"/></svg>`;
        const qTitle = document.createElement('span');
        qTitle.className = 'hint-omni-title hint-omni-ai-query-title';
        qTitle.textContent = query;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'hint-omni-copy-btn';
        copyBtn.title = chrome.i18n.getMessage('copyQuestionAnswer') || 'Copy question and answer';
        copyBtn.innerHTML = OMNI_COPY_SVG;
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const plainText = `**${query}**\n\n${answer}`;
            const htmlText = `<p><strong>${query.replace(/</g, '&lt;')}</strong></p>${_omniParseMarkdown(answer)}`;
            _omniCopyRich(plainText, htmlText).then(() => {
                const prev = copyBtn.innerHTML;
                copyBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                setTimeout(() => {
                    copyBtn.innerHTML = prev;
                }, 1500);
            });
        });
        header.appendChild(icon);
        header.appendChild(qTitle);
        header.appendChild(copyBtn);
        li.appendChild(header);

        // Steps summary
        if (steps.length > 0) {
            const stepsEl = document.createElement('div');
            stepsEl.className = 'hint-omni-agent-steps hint-omni-agent-steps-done';
            steps.forEach((step) => {
                const row = document.createElement('div');
                row.className =
                    'hint-omni-agent-step' +
                    (step.status === 'done' ? ' done' : step.status === 'error' ? ' error' : '');
                const ico = document.createElement('span');
                ico.className = 'hint-omni-agent-step-icon';
                ico.textContent =
                    step.status === 'done'
                        ? chrome.i18n.getMessage('omnibarAgentOk') || '[OK]'
                        : step.status === 'error'
                          ? chrome.i18n.getMessage('omnibarAgentErr') || '[ERR]'
                          : chrome.i18n.getMessage('omnibarAgentTool') || '[TOOL]';
                const lbl = document.createElement('span');
                lbl.textContent = step.label;
                row.appendChild(ico);
                row.appendChild(lbl);
                stepsEl.appendChild(row);
            });
            li.appendChild(stepsEl);
        }
        const answerEl = document.createElement('div');
        answerEl.className = 'hint-omni-ai-md hint-omni-ai-answer';
        answerEl.innerHTML = _omniParseMarkdown(answer);
        li.appendChild(answerEl);
        container.appendChild(li);
    }
    async _runOmniAgentQuery(userQuery) {
        const OMNI_AGENT_SYSTEM_PROMPT = `You are an intelligent browser tab management agent for a Chrome extension called "Intelligent Workspace".
Your job is to help users manage tabs, groups, bookmarks, history, rules, and themes by using tools one at a time.

AVAILABLE TOOLS (call one tool at a time):
TAB TOOLS:
- getOpenTabs -- lists all open tabs (returns [{id,title,url,active,groupId,pinned}])
- getActiveTab -- returns {id,title,url} of the currently active tab
- findAndSwitchToTab -- {query:string} -- finds existing tab by title/URL and switches to it
- switchToTab -- {tabId:number}
- createNewTab -- {url?:string}
- closeTab -- {tabId:number}
- closeTabs -- {tabIds:number[]}
- duplicateTab -- duplicates the active tab
- pinTab -- {tabId:number}
- unpinTab -- {tabId:number}
- muteAllTabs -- mutes all tabs that are currently audible
- unmuteAllTabs -- unmutes all tabs that are currently muted
- closeTabsWithSound -- closes ALL tabs that are currently playing audio

GROUP TOOLS:
- getTabGroups -- lists all tab groups (returns [{id,title,color,collapsed}])
- groupTabs -- {tabIds:number[], groupName:string} -- creates a new group
- deleteTabGroup -- {groupId:number} -- deletes group AND closes its tabs
- closeTabsInGroup -- {groupName?:string, groupId?:number}
- collapseTabGroup -- {groupName?:string, groupId?:number}
- expandTabGroup -- {groupName?:string, groupId?:number}
- collapseAllGroups -- collapses all tab groups
- expandAllGroups -- expands all tab groups
- setGroupColor -- {groupName?:string, groupId?:number, color:string} -- colors: blue,red,yellow,green,pink,purple,cyan,orange,grey
- renameTabGroup -- {groupName?:string, groupId?:number, newName:string}
- moveTabToGroup -- {tabId:number, groupName?:string, groupId?:number}
- regroupAllTabs -- re-applies all grouping rules
- removeDuplicateTabs -- removes duplicate open tabs

RULE TOOLS:
- getRules -- lists all configured grouping rules
- createRule -- {name:string, urls:string[], color?:string}
- updateRule -- {name:string, newName?:string, color?:string, urls?:string[], active?:boolean}
- deleteRule -- {name:string}

THEME TOOLS:
- getActiveTheme -- current UI theme info
- getSavedThemes -- saved themes list
- applyTheme -- {themeName:string}
- applyRandomTheme -- generates and applies a completely random theme
- createAndApplyTheme -- {name:string, colors?:{...}}
- updateTheme -- {name:string, colors:object}
- saveTheme -- {name:string}

BOOKMARK TOOLS:
- getBookmarks -- retrieves bookmark tree
- searchBookmarks -- {query:string}
- createBookmark -- {url:string, title:string, parentId?:string}

HISTORY TOOLS:
- getHistory -- {query?:string, maxResults?:number}
- getRecentlyClosed -- {maxResults?:number}

OTHER TOOLS:
- openUrl -- {url:string}
- searchGoogle -- {query:string}
- setLinkPreview -- {enabled:boolean} -- enables or disables floating link previews on webpages

STRICT RESPONSE FORMAT -- respond ONLY with a single raw JSON object:
When you need to call a tool: {"type":"tool_call","tool":"toolName","params":{},"reasoning":"why"}
When done: {"type":"final","response":"Your answer","actions_taken":["what was done"]}

IMPORTANT RULES:
- ONE tool call per response
- Always call a read/query tool first to get IDs before performing actions
- ALWAYS respond in the SAME LANGUAGE the user used`;
        const steps = [];
        const MAX_STEPS = 8;
        let finalResponse = null;
        const contents = [
            {
                role: 'user',
                parts: [
                    {
                        text: userQuery,
                    },
                ],
            },
        ];
        this._renderAgentProgress(userQuery, steps);
        for (let step = 0; step < MAX_STEPS; step++) {
            const geminiResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'geminiAgentStep',
                        systemPrompt: OMNI_AGENT_SYSTEM_PROMPT,
                        contents,
                    },
                    (response) =>
                        resolve(
                            chrome.runtime.lastError
                                ? {
                                      success: false,
                                      error: chrome.runtime.lastError.message,
                                  }
                                : response,
                        ),
                );
            });
            if (!geminiResult?.success) {
                finalResponse =
                    chrome.i18n.getMessage('omnibarAgentErrorPrefix', [geminiResult?.error || 'Error']) ||
                    `[ERR] ${geminiResult?.error || 'Error'}`;
                break;
            }
            contents.push({
                role: 'model',
                parts: [
                    {
                        text: geminiResult.answer,
                    },
                ],
            });
            const parsed = this._extractJSON(geminiResult.answer);
            if (!parsed || parsed.type === 'final') {
                finalResponse = parsed?.response || geminiResult.answer;
                break;
            }
            if (parsed.type === 'tool_call') {
                const toolName = parsed.tool;
                const toolParams = parsed.params || {};
                const label = this._getOmniToolLabel(toolName, toolParams);
                steps.push({
                    label,
                    status: 'running',
                });
                this._renderAgentProgress(userQuery, steps);
                const toolResult = await new Promise((resolve) => {
                    chrome.runtime.sendMessage(
                        {
                            action: 'geminiAgentToolCall',
                            tool: toolName,
                            params: toolParams,
                        },
                        (response) =>
                            resolve(
                                chrome.runtime.lastError
                                    ? {
                                          success: false,
                                          error: chrome.runtime.lastError.message,
                                      }
                                    : response,
                            ),
                    );
                });
                const ok = toolResult?.success === true;
                steps[steps.length - 1].status = ok ? 'done' : 'error';
                this._renderAgentProgress(userQuery, steps);
                const resultStr = ok
                    ? typeof toolResult.result === 'string'
                        ? toolResult.result
                        : JSON.stringify(toolResult.result)
                    : chrome.i18n.getMessage('omnibarAgentToolError', [
                          toolResult?.error || chrome.i18n.getMessage('omnibarToolFailed') || 'Tool failed',
                      ]) || `Error: ${toolResult?.error || 'Tool failed'}`;
                const truncated =
                    resultStr.length > 4000
                        ? resultStr.substring(0, 4000) +
                          (chrome.i18n.getMessage('omnibarTruncatedSuffix') || '...[truncated]')
                        : resultStr;
                contents.push({
                    role: 'user',
                    parts: [
                        {
                            text: `Tool result for "${toolName}": ${truncated}\n\nNow continue: either call another tool or provide the final answer.`,
                        },
                    ],
                });
                continue;
            }
            finalResponse = geminiResult.answer;
            break;
        }
        if (!finalResponse) finalResponse = chrome.i18n.getMessage('agentMaxStepsReached') || 'Max steps reached.';
        this._renderAgentResponse(userQuery, steps, finalResponse);
    }
    _renderAIResponse(query, answer) {
        if (!this.shadow) return;
        const container = this.shadow.getElementById('hint-omni-results');
        const counter = this.shadow.getElementById('hint-omni-counter');
        container.innerHTML = '';
        counter.style.display = 'none';
        const li = document.createElement('li');
        li.className = 'hint-omni-result-item hint-omni-ai-response';

        // -- Header: icon + query + copy button -----------------
        const header = document.createElement('div');
        header.className = 'hint-omni-ai-header';
        const icon = document.createElement('span');
        icon.className = 'hint-omni-ai-icon';
        icon.innerHTML = `<svg width="24" height="24" aria-hidden="true" viewBox="0 0 471 471" xmlns="http://www.w3.org/2000/svg"><path fill="var(--text-color)" d="M235.5 471q0-48.866-18.84-91.845-18.252-42.978-50.044-74.771T91.845 254.34Q48.867 235.5 0 235.5q48.867 0 91.845-18.251 42.979-18.84 74.771-50.633t50.044-74.771Q235.5 48.867 235.5 0q0 48.867 18.251 91.845 18.84 42.978 50.633 74.771t74.771 50.633Q422.134 235.499 471 235.5q-48.866 0-91.845 18.84-42.978 18.252-74.771 50.044-31.793 31.793-50.633 74.771Q235.501 422.134 235.5 471"></path></svg>`;
        icon.title = chrome.i18n.getMessage('omnibarIconGemini') || 'Gemini AI';
        const qTitle = document.createElement('span');
        qTitle.className = 'hint-omni-title hint-omni-ai-query-title';
        qTitle.textContent = query;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'hint-omni-copy-btn';
        copyBtn.title = chrome.i18n.getMessage('copyQuestionAnswer') || 'Copy question and answer';
        copyBtn.innerHTML = OMNI_COPY_SVG;
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const plainText = `**${query}**\n\n${answer}`;
            const htmlText = `<p><strong>${query.replace(/</g, '&lt;')}</strong></p>${_omniParseMarkdown(answer)}`;
            _omniCopyRich(plainText, htmlText).then(() => {
                const prev = copyBtn.innerHTML;
                copyBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                setTimeout(() => {
                    copyBtn.innerHTML = prev;
                }, 1500);
            });
        });
        header.appendChild(icon);
        header.appendChild(qTitle);
        header.appendChild(copyBtn);

        // -- Answer with markdown rendering ----------------------
        const answerEl = document.createElement('div');
        answerEl.className = 'hint-omni-ai-md hint-omni-ai-answer';
        answerEl.innerHTML = _omniParseMarkdown(answer);
        li.appendChild(header);
        li.appendChild(answerEl);
        container.appendChild(li);
    }
    _renderResults(items, type) {
        if (!this.shadow) return;
        this.hasNavigated = false;
        const container = this.shadow.getElementById('hint-omni-results');
        const counter = this.shadow.getElementById('hint-omni-counter');
        container.innerHTML = '';
        if (type === 'inpage') {
            counter.style.display = 'block';
            counter.textContent =
                chrome.i18n.getMessage('omnibarSearchCounter', [
                    (this.matches.length > 0 ? 1 : 0).toString(),
                    this.matches.length.toString(),
                ]) || `${this.matches.length > 0 ? 1 : 0}/${this.matches.length}`;
        } else {
            counter.style.display = 'none';
        }
        let finalItems = items;
        if ((type === 'dg' || type === 'dt' || type === 'dr-item' || type === 'bg-item') && items.length > 0) {
            const input = this.shadow.getElementById('hint-omni-input');
            const currentValue = input ? input.value : '';
            const currentLower = currentValue.toLowerCase();
            const isDg = type === 'dg';
            const isDrl = type === 'dr-item';
            const isBg =
                type === 'bg-item' && currentLower.startsWith(this._getPrefixVal('bg:', 'omnibarPrefixBackupNowDesc'));
            const isBgr =
                type === 'bg-item' && currentLower.startsWith(this._getPrefixVal('bgr:', 'omnibarPrefixBackupDesc'));
            let prefixVal;
            if (isDg) {
                prefixVal = this._getPrefixVal('dg:', 'prefixDeleteGroup');
            } else if (isDrl) {
                prefixVal = this._getPrefixVal('dr:', 'omnibarPrefixRulesDelete');
            } else if (isBg) {
                prefixVal = this._getPrefixVal('bg:', 'omnibarPrefixBackupNowDesc');
            } else if (isBgr) {
                prefixVal = this._getPrefixVal('bgr:', 'omnibarPrefixBackupDesc');
            } else {
                prefixVal = this._getPrefixVal('dt:', 'prefixDeleteTab');
            }
            const hasFilter = currentValue.trim().length > prefixVal.length;
            const count = items.length;
            let title = '';
            let specialType = '';
            let desc = '';
            if (isDg) {
                specialType = 'delete-all-groups';
                const totalTabs = items.reduce((sum, g) => sum + (g.tabCount || 0), 0);
                if (totalTabs > 0) {
                    title =
                        chrome.i18n.getMessage('omnibarDeleteAllGroupsDetail', [
                            count.toString(),
                            totalTabs.toString(),
                        ]) || `Delete ${count} groups and ${totalTabs} tabs`;
                } else {
                    title = hasFilter
                        ? chrome.i18n.getMessage('omnibarDeleteAllFilteredGroups', [count.toString()]) ||
                          `Delete all filtered groups (${count})`
                        : chrome.i18n.getMessage('omnibarDeleteAllGroups', [count.toString()]) ||
                          `Delete all groups (${count})`;
                }
                desc = chrome.i18n.getMessage('omnibarDeleteAllGroupsDesc') || 'Closes all tabs inside these groups';
            } else if (isDrl) {
                specialType = 'delete-all-rules';
                const rulesCount = items.filter((i) => i.type === 'dr-rule').length;
                const domainsCount = items.filter((i) => i.type !== 'dr-rule').length;
                if (rulesCount > 0 && domainsCount > 0) {
                    title =
                        chrome.i18n.getMessage('omnibarDeleteAllRulesDetail', [
                            rulesCount.toString(),
                            domainsCount.toString(),
                        ]) || `Delete ${rulesCount} rules and ${domainsCount} domains`;
                } else if (rulesCount > 0) {
                    title = hasFilter
                        ? chrome.i18n.getMessage('omnibarDeleteAllFilteredRules', [rulesCount.toString()]) ||
                          `Delete all filtered rules (${rulesCount})`
                        : chrome.i18n.getMessage('omnibarDeleteAllRules', [rulesCount.toString()]) ||
                          `Delete all rules (${rulesCount})`;
                } else {
                    title = `Delete ${domainsCount} domains`;
                }
                desc = hasFilter
                    ? chrome.i18n.getMessage('omnibarDeleteAllFilteredRulesDesc') || 'Deletes all filtered rules'
                    : chrome.i18n.getMessage('omnibarDeleteAllRulesDesc') || 'Deletes all these rules';
            } else if (isBg) {
                specialType = 'backup-all-groups';
                const totalTabs = items.reduce((sum, g) => sum + (g.count || 0), 0);
                title =
                    chrome.i18n.getMessage('omnibarBackupAllGroups', [count.toString(), totalTabs.toString()]) ||
                    `Backup all groups (${count} groups, ${totalTabs} tabs)`;
                desc = chrome.i18n.getMessage('omnibarBackupAllGroupsDesc') || 'Backs up all these groups';
            } else if (isBgr) {
                specialType = 'restore-all-groups';
                const groupsCount = items.filter((i) => i.type === 'bg-group').length;
                const tabsCount = items.filter((i) => i.type === 'bg-tab').length;
                if (groupsCount > 0 && tabsCount > 0) {
                    title =
                        chrome.i18n.getMessage('omnibarRestoreAllGroupsDetail', [
                            groupsCount.toString(),
                            tabsCount.toString(),
                        ]) || `Restore all backups (${groupsCount} groups, ${tabsCount} tabs)`;
                } else if (groupsCount > 0) {
                    title = hasFilter
                        ? chrome.i18n.getMessage('omnibarRestoreAllFilteredGroups', [groupsCount.toString()]) ||
                          `Restore all filtered groups (${groupsCount})`
                        : chrome.i18n.getMessage('omnibarRestoreAllGroups', [groupsCount.toString()]) ||
                          `Restore all groups (${groupsCount})`;
                } else {
                    title =
                        chrome.i18n.getMessage('omnibarRestoreAllTabs', [tabsCount.toString()]) ||
                        `Restore all tabs (${tabsCount})`;
                }
                desc = chrome.i18n.getMessage('omnibarRestoreAllGroupsDesc') || 'Restores all these backups';
            } else {
                specialType = 'delete-all-tabs';
                title = hasFilter
                    ? chrome.i18n.getMessage('omnibarDeleteAllFilteredTabs', [count.toString()]) ||
                      `Delete all filtered tabs (${count})`
                    : chrome.i18n.getMessage('omnibarDeleteAllTabs', [count.toString()]) ||
                      `Delete all tabs (${count})`;
                desc = chrome.i18n.getMessage('omnibarDeleteAllTabsDesc') || 'Closes all these tabs';
            }
            finalItems = [
                {
                    isSpecialAction: true,
                    specialType: specialType,
                    title: title,
                    url: desc,
                    rawItems: items,
                },
                ...items,
            ];
        }
        finalItems.slice(0, 50).forEach((data, idx) => {
            const li = document.createElement('li');
            li.className = 'hint-omni-result-item';
            li.dataset.index = idx;
            li.dataset.type = type;

            // Apply visual selection style if active
            if (!data.isSpecialAction) {
                let isSelected = false;
                if (type === 'dg') {
                    isSelected = data.id && this.selectedActionItems.has(data.id);
                } else if (type === 'dt') {
                    isSelected = data.id && this.selectedActionItems.has(data.id);
                } else if (type === 'bg-item') {
                    if (data.type === 'bg-group') {
                        isSelected = data.id && this.selectedActionItems.has(data.id);
                    } else {
                        isSelected = this.selectedActionItems.has(`${data.groupId}::${data.url}`);
                    }
                } else if (type === 'rl-item' || type === 'dr-item') {
                    const actionId =
                        data.type === 'rl-rule' || data.type === 'dr-rule' ? data.name : `${data.name}::${data.url}`;
                    isSelected = this.selectedActionItems.has(actionId);
                } else if (type === 'ccr-item') {
                    if (data.type === 'ccr-color') {
                        const ccrActionId = `${data.ruleName}::${data.name}`;
                        isSelected = ccrActionId && this.selectedActionItems.has(ccrActionId);
                    }
                } else if (type === 'ccg-item') {
                    if (data.type === 'ccg-color') {
                        const ccgActionId =
                            data.groupId !== undefined
                                ? `group_${data.groupId}::${data.name}`
                                : `special_${data.specialGroupKey}::${data.name}`;
                        isSelected = ccgActionId && this.selectedActionItems.has(ccgActionId);
                    }
                } else if (type === 'atr-tab' || type === 'cr-tab') {
                    const crActionId =
                        data.type === 'cr-add-manual' ? 'manual::' + (data.urls || []).join(',') : data.url;
                    isSelected = crActionId && this.selectedActionItems.has(crActionId);
                }
                if (isSelected) {
                    const isDelete = type === 'dg' || type === 'dt' || type === 'dr-item';
                    li.classList.add(isDelete ? 'action-selected' : 'action-selected-theme');
                }
            }
            let title = chrome.i18n.getMessage('omnibarNoTitle') || 'No Title',
                url = data.url || chrome.i18n.getMessage('omnibarNoUrl') || 'No URL',
                favIcon = '../../assets/icons/default_favicon.png';
            if (data.isSpecialAction) {
                title = data.title;
                url = data.url || '';
                favIcon = '';
                if (data.specialType === 'add-all-tabs') {
                    li.classList.add('add-all-filtered');
                    li.dataset.specialType = data.specialType;
                    const rawUrls = data.rawItems.map((item) => item.url).filter((u) => u !== undefined);
                    li.dataset.rawUrls = JSON.stringify(rawUrls);
                    this._injectSvgIcon(
                        li,
                        `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
                    );
                } else {
                    li.classList.add('delete-all-filtered');
                    li.dataset.specialType = data.specialType;
                    let rawIds = [];
                    if (data.specialType === 'restore-all-groups') {
                        const groupIds = new Set();
                        data.rawItems.forEach((item) => {
                            if (item.type === 'bg-group' && item.id !== undefined) {
                                groupIds.add(item.id);
                            } else if (item.type === 'bg-tab' && item.groupId !== undefined) {
                                groupIds.add(item.groupId);
                            }
                        });
                        rawIds = Array.from(groupIds);
                    } else if (data.specialType === 'delete-all-rules') {
                        rawIds = data.rawItems.map((item) =>
                            item.type === 'dr-rule' ? item.name : `${item.name}::${item.url}`,
                        );
                    } else {
                        rawIds = data.rawItems.map((item) => item.id).filter((id) => id !== undefined);
                    }
                    li.dataset.rawIds = JSON.stringify(rawIds);
                    if (data.specialType === 'backup-all-groups' || data.specialType === 'restore-all-groups') {
                        this._injectSvgIcon(
                            li,
                            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="var(--text-color)"/></svg>`,
                        );
                    } else {
                        this._injectSvgIcon(
                            li,
                            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
                        );
                    }
                }
            } else if (['tab', 'popup-tab', 'pip-tab', 'video-pip-tab', 'ae-tab', 'dt'].includes(type)) {
                title = data.title || chrome.i18n.getMessage('omnibarUntitledTab') || 'Untitled';
                li.dataset.tabId = data.id;
                li.dataset.windowId = data.windowId;
                li.dataset.url = data.url;
                favIcon = data.favIconUrl || favIcon;
                if (type === 'popup-tab') title = `${title}`;
                if (type === 'pip-tab') title = `${title}`;
                if (type === 'video-pip-tab') title = `${title}`;
            } else if (['b', 'h', 'c'].includes(type)) {
                title = data.title || data.url;
                li.dataset.url = data.url;
                favIcon = `https://www.google.com/s2/favicons?sz=16&domain_url=${encodeURIComponent(data.url)}`;
            } else if (type === 'dg') {
                title =
                    data.title || chrome.i18n.getMessage('omnibarGroupTitle', [data.color]) || `Group ${data.color}`;
                url = chrome.i18n.getMessage('omnibarClickDeleteGroup') || 'Click to delete group';
                favIcon = '';
                li.dataset.groupId = data.id;
                this._injectColorDot(li, data.color);
            } else if (type === 'inpage') {
                title = data.snippet;
                url = chrome.i18n.getMessage('omnibarMatchInPage') || 'Match in page';
                favIcon = '';
                li.dataset.matchIndex = idx;
            } else if (type === 'ai-hint') {
                title = data.title || '';
                url = data.url || '';
                favIcon = '';
                li.style.cursor = 'default';
                const iconEl = document.createElement('span');
                iconEl.innerHTML =
                    data.icon ||
                    '<svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"></path></svg>';
                iconEl.title = chrome.i18n.getMessage('omnibarIconAI') || 'AI';
                iconEl.className = 'hint-omni-ai-prefix-icon';
                li.appendChild(iconEl);
            } else if (type === 'tutorial-hint') {
                title = data.title || '';
                url = data.url || '';
                favIcon = '';
                li.style.cursor = 'default';
                if (data.icon) {
                    const iconEl = document.createElement('span');
                    iconEl.className = 'hint-omni-ai-prefix-icon';
                    iconEl.innerHTML = data.icon;
                    li.appendChild(iconEl);
                }
            } else if (type === 'conversation') {
                title = data.title || chrome.i18n.getMessage('omnibarUntitledConversation') || 'Untitled conversation';
                const dateStr = data.date ? new Date(data.date).toLocaleString() : '';
                const hint = chrome.i18n.getMessage('omnibarResultHint') || 'Enter to copy . Ctrl+Enter to expand';
                // The number of entries, which was being read from a name that was never
                // declared: the exception left the whole conversation list empty.
                const entryCount = data.entryCount ?? (data.entryIds || []).length;
                const countStr = entryCount ? ` . ${entryCount}` : '';
                url = `${dateStr}${countStr} . ${hint}`;
                favIcon = '';
                const iconEl = this._injectSvgIcon(
                    li,
                    data.isPersistent
                        ? OMNI_DB_SVG
                        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
                    'hint-omni-conv-icon',
                );
                iconEl.title = data.isPersistent
                    ? chrome.i18n.getMessage('omnibarIconDatabase') || 'Saved'
                    : chrome.i18n.getMessage('omnibarIconConversation') || 'Conversation';
                li.dataset.convTitle = data.title || '';
                li.dataset.convEntryIds = JSON.stringify(data.entryIds || []);
                li.style.cursor = 'default';
            } else if (type === 'image') {
                title = data.title || chrome.i18n.getMessage('omnibarUntitledImage') || 'Untitled image';
                url = data.date
                    ? chrome.i18n.getMessage('omnibarCapturedDate', [new Date(data.date).toLocaleString()]) ||
                      `Captured: ${new Date(data.date).toLocaleString()}`
                    : '';
                favIcon = '';
                if (data.dataUrl) {
                    const thumb = document.createElement('img');
                    thumb.src = data.dataUrl;
                    thumb.className = 'hint-omni-img-thumb';
                    thumb.title = chrome.i18n.getMessage('omnibarIconImage') || 'Image';
                    li.appendChild(thumb);
                } else {
                    const iconEl = this._injectSvgIcon(
                        li,
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g fill="var(--text-color)"><path d="M18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M11.943 1.25h.114c2.309 0 4.118 0 5.53.19 1.444.194 2.584.6 3.479 1.494.895.895 1.3 2.035 1.494 3.48.19 1.411.19 3.22.19 5.529v.088c0 1.909 0 3.471-.104 4.743-.104 1.28-.317 2.347-.795 3.235q-.314.586-.785 1.057c-.895.895-2.035 1.3-3.48 1.494-1.411.19-3.22.19-5.529.19h-.114c-2.309 0-4.118 0-5.53-.19-1.444-.194-2.584-.6-3.479-1.494-.793-.793-1.203-1.78-1.42-3.006-.215-1.203-.254-2.7-.262-4.558Q1.25 12.792 1.25 12v-.058c0-2.309 0-4.118.19-5.53.194-1.444.6-2.584 1.494-3.479.895-.895 2.035-1.3 3.48-1.494 1.411-.19 3.22-.19 5.529-.19m-5.33 1.676c-1.278.172-2.049.5-2.618 1.069-.57.57-.897 1.34-1.069 2.619-.174 1.3-.176 3.008-.176 5.386v.844l1.001-.876a2.3 2.3 0 0 1 3.141.104l4.29 4.29a2 2 0 0 0 2.564.222l.298-.21a3 3 0 0 1 3.732.225l2.83 2.547c.286-.598.455-1.384.545-2.493.098-1.205.099-2.707.099-4.653 0-2.378-.002-4.086-.176-5.386-.172-1.279-.5-2.05-1.069-2.62-.57-.569-1.34-.896-2.619-1.068-1.3-.174-3.008-.176-5.386-.176s-4.086.002-5.386.176"></path></g></svg>',
                        'hint-omni-img-placeholder',
                    );
                    iconEl.title = chrome.i18n.getMessage('omnibarIconImage') || 'Image';
                }
                if (data.id) li.dataset.imgId = data.id;
                li.dataset.imgTitle = data.title || chrome.i18n.getMessage('omnibarUntitledImage') || 'Imagen';
                if (data.dataUrl) li.dataset.imgDataUrl = data.dataUrl;
                const hint = chrome.i18n.getMessage('omnibarResultHint') || 'Enter to copy . Ctrl+Enter to expand';
                url = (url ? url + ' . ' : '') + hint;
            } else if (type === 'note') {
                title = data.title || chrome.i18n.getMessage('omnibarUntitledNote') || 'Untitled note';
                const hint = chrome.i18n.getMessage('omnibarResultHint') || 'Enter to copy . Ctrl+Enter to expand';
                url = (data.date ? `${new Date(data.date).toLocaleString()} . ` : '') + hint;
                favIcon = '';
                const iconEl = this._injectSvgIcon(
                    li,
                    `<svg class="note-icon" width="24" height="24" viewBox="-192 -192 2304 2304" fill="var(--text-color)">
                        <path d="m1784 1468-315 315v-315zm-541-339v113h-904v-113zm339-339v113H339V791h1242zM621 0c93 0 169 76 169 169 0 26-6 50-17 73l226 226-80 80-226-226c-22 11-47 17-73 17-93 0-169-76-169-169C452 76 528 0 621 0m395 226v113h791v1016h-452v452H113V339h226V226H0v1694h1421c45 0 88-18 120-50l329-329c32-32 50-75 50-120V226z"></path>
                    </svg>`,
                    'hint-omni-note-icon',
                );
                iconEl.title = chrome.i18n.getMessage('omnibarIconNote') || 'Note';
                if (data.id) li.dataset.noteId = data.id;
                if (data.content) li.dataset.noteContent = data.content;
                if (data.plainText) li.dataset.notePlainText = data.plainText;
                li.dataset.noteType = data.type || 'text';
                if (data.contentRaw && typeof data.contentRaw !== 'string') {
                    li.dataset.noteContentJson = JSON.stringify(data.contentRaw);
                }
                li.style.cursor = 'default';
            } else if (type === 'message') {
                title = data.query
                    ? data.query.substring(0, 60) + (data.query.length > 60 ? '...' : '')
                    : chrome.i18n.getMessage('omnibarMessageWithoutText') || 'Message without text';
                const dateStr = data.date ? new Date(data.date).toLocaleString() : '';
                const convName = data.convTitle ? ` . ${data.convTitle.substring(0, 30)}` : '';
                const hint = chrome.i18n.getMessage('omnibarResultHint') || 'Enter to copy . Ctrl+Enter to expand';
                url = `${dateStr}${convName} . ${hint}`;
                favIcon = '';
                const iconEl = this._injectSvgIcon(
                    li,
                    data.isPersistent
                        ? OMNI_DB_SVG
                        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
                    'hint-omni-msg-icon',
                );
                iconEl.title = data.isPersistent
                    ? chrome.i18n.getMessage('omnibarIconDatabase') || 'Saved'
                    : chrome.i18n.getMessage('omnibarIconMessage') || 'Message';
                li.dataset.msgQuery = data.query || '';
                li.dataset.msgAnswer = data.answer || '';
                li.style.cursor = 'default';
            } else if (type === 'prefix') {
                title = data.prefix + ' ' + (data.title || '');
                url = data.desc || '';
                favIcon = '';
                li.dataset.prefix = data.prefix;
            } else if (type === 'bg-item') {
                title = data.title;
                url = data.url;
                const pBgRender =
                    (this.registry && this.registry.getRawShortcuts()['omnibarPrefixBackupNowDesc']) || 'bg:';
                const isBgMode =
                    this.shadow && this.shadow.getElementById('hint-omni-input')
                        ? this.shadow.getElementById('hint-omni-input').value.toLowerCase().startsWith(pBgRender)
                        : false;
                li.dataset.bgType = isBgMode ? 'bg-backup-mode' : data.type;
                if (data.type === 'bg-group') {
                    li.dataset.groupId = data.id;
                    favIcon = '';
                    if (data.showDot !== false) {
                        this._injectColorDot(li, data.color);
                    }
                } else {
                    li.dataset.groupId = data.groupId;
                    li.dataset.tabTitle = data.title;
                    li.dataset.tabUrl = data.url;
                    favIcon = data.favIconUrl || favIcon;
                }
            } else if (type === 'cr-preview') {
                title = data.title;
                url = data.desc;
                favIcon = '';
                li.dataset.isValid = data.isValid;
                li.dataset.ruleName = data.name || '';
                li.dataset.ruleUrls = JSON.stringify(data.urls || []);
                li.dataset.ruleTitle = data.title || '';
                li.dataset.isNameOnly = data.isNameOnly ? 'true' : 'false';
                const iconEl = document.createElement('span');
                iconEl.className = 'hint-omni-ai-prefix-icon';
                if (data.isValid) {
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#2ecc71"/></svg>`;
                } else {
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#e74c3c"/></svg>`;
                }
                li.appendChild(iconEl);
            } else if (type === 'dr-item') {
                title = data.title;
                url = data.desc || data.url;
                li.dataset.drType = data.type; // 'dr-rule' or 'dr-url'
                if (data.type === 'dr-rule') {
                    li.dataset.ruleName = data.name;
                    li.dataset.ruleUrls = JSON.stringify(data.urls);
                    li.dataset.actionId = data.name;
                    favIcon = '';
                    const dot = document.createElement('div');
                    dot.className = 'hint-omni-group-dot';
                    dot.style.backgroundColor = data.color || '#9e9e9e';
                    dot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._showRuleColorPickerPopup(dot, data.name, data.color);
                    });
                    li.appendChild(dot);
                } else {
                    li.dataset.ruleName = data.name;
                    li.dataset.tabUrl = data.url;
                    li.dataset.actionId = `${data.name}::${data.url}`;
                    favIcon = `https://www.google.com/s2/favicons?sz=16&domain_url=${encodeURIComponent(data.url)}`;
                }
            } else if (type === 'rl-item') {
                title = data.title;
                url = data.url;
                li.dataset.rlType = data.type; // 'rl-rule' or 'rl-url'
                if (data.type === 'rl-rule') {
                    li.dataset.ruleName = data.name;
                    li.dataset.ruleUrls = JSON.stringify(data.urls);
                    li.dataset.actionId = data.name;
                    favIcon = '';
                    const dot = document.createElement('div');
                    dot.className = 'hint-omni-group-dot';
                    dot.style.backgroundColor = data.color || '#9e9e9e';
                    li.appendChild(dot);
                } else {
                    li.dataset.ruleName = data.name;
                    li.dataset.tabUrl = data.url;
                    li.dataset.actionId = `${data.name}::${data.url}`;
                    favIcon = `https://www.google.com/s2/favicons?sz=16&domain_url=${encodeURIComponent(data.url)}`;
                }
            } else if (type === 'ccr-item') {
                title = data.title;
                url = data.url;
                li.dataset.ccrType = data.type; // 'ccr-rule' or 'ccr-color'
                if (data.type === 'ccr-rule') {
                    li.dataset.ruleName = data.name;
                    li.dataset.ruleColor = data.color || 'grey';
                    li.dataset.ruleUrls = ''; // tree parent styling
                    favIcon = '';
                    const dot = document.createElement('div');
                    dot.className = 'hint-omni-group-dot';
                    dot.style.backgroundColor = this._getRuleColorValue(data.color);
                    li.appendChild(dot);
                } else {
                    li.dataset.ruleName = data.ruleName;
                    li.dataset.ccrColorName = data.name;
                    li.dataset.ccrColorValue = data.value;
                    li.dataset.isCurrentColor = data.isCurrent ? 'true' : 'false';
                    li.dataset.tabUrl = ''; // tree child styling
                    li.dataset.actionId = `${data.ruleName}::${data.name}`;
                    favIcon = '';
                    const colorCircle = document.createElement('div');
                    colorCircle.className = 'hint-omni-ccr-color-circle';
                    colorCircle.style.backgroundColor = data.value;
                    if (data.isCurrent) {
                        colorCircle.style.borderColor = 'var(--text-color)';
                        colorCircle.style.borderWidth = '2px';
                    }
                    li.appendChild(colorCircle);
                }
            } else if (type === 'ccg-item') {
                title = data.title;
                url = data.url;
                li.dataset.ccgType = data.type; // 'ccg-group' or 'ccg-color'
                if (data.type === 'ccg-group') {
                    if (data.groupId !== undefined) {
                        li.dataset.groupId = data.groupId;
                    }
                    if (data.specialGroupKey) {
                        li.dataset.specialGroupKey = data.specialGroupKey;
                    }
                    li.dataset.groupColor = data.color || 'grey';
                    li.dataset.ruleUrls = ''; // tree parent styling
                    favIcon = '';
                    const dot = document.createElement('div');
                    dot.className = 'hint-omni-group-dot';
                    dot.style.backgroundColor = this._getRuleColorValue(data.color);
                    li.appendChild(dot);
                } else {
                    if (data.groupId !== undefined) {
                        li.dataset.groupId = data.groupId;
                    }
                    if (data.specialGroupKey) {
                        li.dataset.specialGroupKey = data.specialGroupKey;
                    }
                    li.dataset.ccgColorName = data.name;
                    li.dataset.ccgColorValue = data.value;
                    li.dataset.isCurrentColor = data.isCurrent ? 'true' : 'false';
                    li.dataset.tabUrl = ''; // tree child styling
                    const actionId =
                        data.groupId !== undefined
                            ? `group_${data.groupId}::${data.name}`
                            : `special_${data.specialGroupKey}::${data.name}`;
                    li.dataset.actionId = actionId;
                    favIcon = '';
                    const colorCircle = document.createElement('div');
                    colorCircle.className = 'hint-omni-ccr-color-circle';
                    colorCircle.style.backgroundColor = data.value;
                    if (data.isCurrent) {
                        colorCircle.style.borderColor = 'var(--text-color)';
                        colorCircle.style.borderWidth = '2px';
                    }
                    li.appendChild(colorCircle);
                }
            } else if (type === 'atcr-item') {
                title = data.title;
                url = data.url;
                li.dataset.atcrType = data.type; // 'atcr-rule'
                li.dataset.ruleName = data.name;
                favIcon = '';
                const dot = document.createElement('div');
                dot.className = 'hint-omni-group-dot';
                dot.style.backgroundColor = data.color || '#9e9e9e';
                li.appendChild(dot);
            } else if (type === 'atr-tab') {
                title = data.title || 'Untitled';
                li.dataset.tabId = data.id;
                li.dataset.windowId = data.windowId;
                li.dataset.url = data.url;
                li.dataset.actionId = data.url;
                favIcon = data.favIconUrl || favIcon;
            } else if (type === 'atr-rule-select') {
                title = data.title;
                url = data.url;
                li.dataset.ruleName = data.ruleName;
                favIcon = '';
                const dot = document.createElement('div');
                dot.className = 'hint-omni-group-dot';
                dot.style.backgroundColor = data.color || '#9e9e9e';
                li.appendChild(dot);
            } else if (type === 'cr-tab') {
                if (data.type === 'cr-add-manual') {
                    title = data.title;
                    url = data.desc || '';
                    const manualUrls = data.urls || [];
                    li.dataset.itemSubtype = 'cr-add-manual';
                    li.dataset.urls = JSON.stringify(manualUrls);
                    li.dataset.actionId = 'manual::' + manualUrls.join(',');
                    favIcon = '';
                    const iconEl = document.createElement('span');
                    iconEl.className = 'hint-omni-ai-prefix-icon';
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="var(--action-color, #3498db)"/></svg>`;
                    li.appendChild(iconEl);
                } else {
                    title = data.title || chrome.i18n.getMessage('omnibarUntitledTab') || 'Untitled';
                    li.dataset.tabId = data.id;
                    li.dataset.windowId = data.windowId;
                    li.dataset.url = data.url;
                    li.dataset.actionId = data.url;
                    favIcon = data.favIconUrl || favIcon;
                }
            } else if (type === 'er-item') {
                title = data.title;
                // A URL row already says the URL in its title; the line underneath is
                // what the row does, not the URL a second time.
                url = (data.type === 'er-url' ? data.desc : data.url) || data.url || '';
                li.dataset.erType = data.type; // 'er-rule' or 'er-url'
                if (data.type === 'er-rule') {
                    li.dataset.ruleName = data.name;
                    li.dataset.ruleUrls = JSON.stringify(data.urls);
                    li.dataset.actionId = data.name;
                    favIcon = '';
                    const dot = document.createElement('div');
                    dot.className = 'hint-omni-group-dot';
                    dot.style.backgroundColor = data.color || '#9e9e9e';
                    dot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._showRuleColorPickerPopup(dot, data.name, data.color);
                    });
                    li.appendChild(dot);
                } else {
                    li.dataset.ruleName = data.name;
                    li.dataset.tabUrl = data.url;
                    // Choosing this row fills the box with `url:<rule>::<url>`, and it
                    // reads the URL from here: without it the box said "undefined".
                    li.dataset.url = data.url;
                    li.dataset.actionId = `${data.name}::${data.url}`;
                    favIcon = `https://www.google.com/s2/favicons?sz=16&domain_url=${encodeURIComponent(data.url)}`;
                }
            } else if (type === 'er-preview') {
                title = data.title;
                url = data.desc || '';
                favIcon = '';
                li.dataset.isValid = data.isValid;
                li.dataset.ruleTitle = data.title || '';
                if (data.type === 'er-preview-rule') {
                    li.dataset.ruleName = data.ruleName || '';
                    li.dataset.newName = data.newName || '';
                } else if (data.type === 'er-preview-url') {
                    li.dataset.ruleName = data.ruleName || '';
                    li.dataset.oldUrl = data.oldUrl || '';
                    li.dataset.newUrl = data.newUrl || '';
                }
                const iconEl = document.createElement('span');
                iconEl.className = 'hint-omni-ai-prefix-icon';
                if (data.isValid) {
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#2ecc71"/></svg>`;
                } else {
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#e74c3c"/></svg>`;
                }
                li.appendChild(iconEl);
            }
            li.dataset.title = title;
            const img = document.createElement('img');
            img.className = 'hint-omni-favicon';
            if (favIcon) {
                img.src = favIcon;
                img.onerror = () => {
                    img.onerror = null; // prevent infinite loop
                    img.style.display = 'none';
                };
            } else {
                img.style.display = 'none';
            }
            const txt = document.createElement('div');
            txt.className = 'hint-omni-text-container';
            const tSpan = document.createElement('span');
            tSpan.className = 'hint-omni-title';
            tSpan.textContent = title;
            const uSpan = document.createElement('span');
            uSpan.className = 'hint-omni-url';
            uSpan.textContent = url;
            txt.appendChild(tSpan);
            txt.appendChild(uSpan);
            li.appendChild(img);
            li.appendChild(txt);

            // -- Boton copiar (conversation / note / image / message) ----------
            if (['conversation', 'note', 'image', 'message'].includes(type)) {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'hint-omni-copy-btn';
                copyBtn.title = chrome.i18n.getMessage('omnibarCopyBtn') || 'Copy';
                copyBtn.innerHTML = OMNI_COPY_SVG;
                copyBtn.addEventListener('mousedown', (e) => e.stopPropagation());
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (type === 'conversation') {
                        this._copyConversation(li.dataset.convTitle, li.dataset.convEntryIds);
                    } else if (type === 'note') {
                        this._copyNote(li);
                    } else if (type === 'image') {
                        this._copyImageToClipboard(li);
                    } else if (type === 'message') {
                        this._copyMessage(li);
                    }
                });
                li.appendChild(copyBtn);
            }
            li.addEventListener('mouseenter', () => {
                if (this._keyboardNav) return;
                this.selectedIndex = idx;
                this.hasNavigated = true;
                Array.from(container.children).forEach((el) => el.classList.toggle('selected', el === li));
                if (type === 'inpage' && li.dataset.matchIndex) {
                    this._selectMatchInPage(this.matches[parseInt(li.dataset.matchIndex)]);
                }
            });
            li.addEventListener('click', async (e) => {
                if (e.target && e.target.closest && e.target.closest('.hint-omni-copy-btn')) return;
                // Ignore clicks on the expanded panel itself (allow text selection)
                if (e.target && e.target.closest && e.target.closest('.hint-omni-conv-expand, .hint-omni-img-expand'))
                    return;
                if (type === 'tutorial-hint') {
                    e.preventDefault();
                    return;
                }
                if (type === 'tab') {
                    chrome.runtime.sendMessage({
                        action: 'switchToTab',
                        tabId: parseInt(li.dataset.tabId),
                        windowId: parseInt(li.dataset.windowId),
                    });
                    this.close();
                } else if (type === 'popup-tab') {
                    chrome.runtime.sendMessage({
                        action: 'openPopupWindow',
                        url: li.dataset.url,
                    });
                    this.close();
                } else if (type === 'pip-tab') {
                    const url = li.dataset.url;
                    const tabId = parseInt(li.dataset.tabId);
                    const windowId = parseInt(li.dataset.windowId);
                    const isYouTube = url && (url.includes('youtube.com') || url.includes('youtu.be'));
                    if (!isYouTube && 'documentPictureInPicture' in window) {
                        try {
                            if (window.documentPictureInPicture.window) {
                                window.documentPictureInPicture.window.close();
                            }
                            let targetUrl = url;
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
                            const pipWindow = await requestItgPipWindow(targetUrl, 450, 600);
                            this.close();
                            pipWindow.document.body.style.margin = '0';
                            pipWindow.document.body.style.padding = '0';
                            pipWindow.document.body.style.overflow = 'hidden';
                            pipWindow.document.body.style.backgroundColor = '#1e1e1e';
                            chrome.runtime.sendMessage({
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
                            pipWindow.addEventListener('pagehide', () => {
                                resumeOriginalVideo(!document.hidden);
                            });
                            pipWindow.addEventListener('unload', () => {
                                resumeOriginalVideo(!document.hidden);
                            });
                            return;
                        } catch (err) {
                            console.warn('Omnibar direct PiP failed, attempting background fallback:', err);
                            this.close();
                        }
                    }
                    chrome.runtime.sendMessage({
                        action: 'openPipWindow',
                        tabId: tabId,
                        windowId: windowId,
                        url: url,
                    });
                } else if (type === 'video-pip-tab') {
                    const url = li.dataset.url;
                    const tabId = li.dataset.tabId ? parseInt(li.dataset.tabId) : null;
                    const windowId = li.dataset.windowId ? parseInt(li.dataset.windowId) : null;
                    if (tabId && windowId) {
                        chrome.runtime.sendMessage({
                            action: 'openVideoPipWindow',
                            tabId: tabId,
                            windowId: windowId,
                            url: url,
                        });
                    } else {
                        await openVideoPip(url);
                    }
                    this.close();
                } else if (type === 'prefix') {
                    const input = this.shadow.getElementById('hint-omni-input');
                    input.value = li.dataset.prefix;
                    input.focus();
                    this._handleInput({
                        target: input,
                    });
                } else if (type === 'inpage') {
                    this._selectMatchInPage(this.matches[parseInt(li.dataset.matchIndex)]);
                    this.close();
                } else if (type === 'ae-tab') {
                    chrome.runtime.sendMessage({
                        action: 'openAddToRuleFromOmnibar',
                        url: li.dataset.url,
                        title: li.dataset.title,
                    });
                    this.close();
                } else if (type === 'cr-preview') {
                    if (li.dataset.isValid === 'true') {
                        const name = li.dataset.ruleName;
                        const urls = JSON.parse(li.dataset.ruleUrls || '[]');
                        chrome.runtime.sendMessage(
                            {
                                action: 'createRuleFromOmnibar',
                                name: name,
                                urls: urls,
                            },
                            (response) => {
                                if (response && response.success) {
                                    this._showToast(
                                        chrome.i18n.getMessage('omnibarRuleCreated', [name]) ||
                                            `Rule "${name}" created successfully`,
                                    );
                                }
                            },
                        );
                        this.close();
                    } else {
                        this._showToast(li.dataset.ruleTitle);
                    }
                } else if (type === 'ccr-item' || type === 'ccg-item') {
                    const isRule = type === 'ccr-item';
                    const subType = isRule ? 'ccr-color' : 'ccg-color';
                    if (li.dataset[isRule ? 'ccrType' : 'ccgType'] === subType) {
                        this._handleMultiSelectionClick(e, li, () => {
                            this._handleKey(
                                new KeyboardEvent('keydown', {
                                    key: 'Enter',
                                    bubbles: true,
                                    cancelable: true,
                                    ctrlKey: e.ctrlKey,
                                    shiftKey: e.shiftKey,
                                    metaKey: e.metaKey,
                                }),
                            );
                        });
                    }
                } else if (type === 'dr-item') {
                    this._handleMultiSelectionClick(e, li, (ids) => {
                        chrome.runtime.sendMessage(
                            {
                                action: 'deleteRulesFromOmnibar',
                                items: ids,
                            },
                            (res) => {
                                if (res && res.success) {
                                    this._showToast(
                                        chrome.i18n.getMessage('omnibarRulesDeleted') || 'Rules deleted successfully',
                                    );
                                } else {
                                    this._showToast(
                                        chrome.i18n.getMessage('omnibarDeletedSuccessfully') || 'Deleted successfully',
                                    );
                                }
                            },
                        );
                        this.close();
                    });
                } else if (type === 'rl-item') {
                    this._handleMultiSelectionClick(e, li, (ids) => {
                        const urlsToOpen = [];
                        const items = Array.from(li.parentNode.children);
                        ids.forEach((id) => {
                            if (typeof id === 'string' && id.includes('::')) {
                                const [_, url] = id.split('::');
                                urlsToOpen.push(url);
                            } else {
                                const liEl = items.find(
                                    (item) =>
                                        item.dataset.type === 'rl-item' &&
                                        item.dataset.rlType === 'rl-rule' &&
                                        item.dataset.ruleName === id,
                                );
                                if (liEl && liEl.dataset.ruleUrls) {
                                    try {
                                        const urls = JSON.parse(liEl.dataset.ruleUrls);
                                        urlsToOpen.push(...urls);
                                    } catch {}
                                }
                            }
                        });
                        if (urlsToOpen.length > 0) {
                            chrome.runtime.sendMessage({
                                action: 'openMultipleUrls',
                                urls: urlsToOpen,
                            });
                        }
                        this.close();
                    });
                } else if (type === 'atcr-item') {
                    const ruleName = li.dataset.ruleName;
                    chrome.runtime.sendMessage(
                        {
                            action: 'getActiveTab',
                        },
                        (activeTab) => {
                            if (activeTab && activeTab.url) {
                                chrome.runtime.sendMessage(
                                    {
                                        action: 'addUrlsToRule',
                                        ruleName: ruleName,
                                        urls: [activeTab.url],
                                    },
                                    (res) => {
                                        if (res && res.success) {
                                            this._showToast(
                                                chrome.i18n.getMessage('omnibarAddedActiveTab', [ruleName]) ||
                                                    `Added active tab to rule "${ruleName}"`,
                                            );
                                        } else {
                                            this._showToast(
                                                res?.error ||
                                                    chrome.i18n.getMessage('omnibarFailedAddActiveTab') ||
                                                    'Failed to add active tab to rule',
                                            );
                                        }
                                    },
                                );
                            } else {
                                this._showToast(
                                    chrome.i18n.getMessage('omnibarFailedRetrieveActiveTab') ||
                                        'Failed to retrieve active tab URL',
                                );
                            }
                        },
                    );
                    this.close();
                } else if (type === 'atr-tab') {
                    e.preventDefault();
                    this._toggleActionItemSelection(li, e.shiftKey, true);
                } else if (type === 'atr-rule-select') {
                    // Clicking a rule in phase 2 triggers adding the URLs
                    const ruleName = li.dataset.ruleName;
                    const validatedUrls = [];
                    const invalidUrls = [];
                    for (const rawUrl of this.atrPendingUrls || []) {
                        let u = rawUrl.trim();
                        if (!u) continue;
                        if (!u.match(/^[a-zA-Z]+:\/\//)) u = 'https://' + u;
                        try {
                            const parsed = new URL(u);
                            if (parsed.hostname.length === 0) throw new Error();
                            validatedUrls.push(u);
                        } catch {
                            invalidUrls.push(rawUrl);
                        }
                    }
                    if (invalidUrls.length > 0) {
                        this._showToast(
                            chrome.i18n.getMessage('omnibarInvalidUrlFormat', [invalidUrls.join(', ')]) ||
                                `Invalid: ${invalidUrls.join(', ')}`,
                        );
                    }
                    if (validatedUrls.length > 0) {
                        chrome.runtime.sendMessage(
                            {
                                action: 'addUrlsToRule',
                                ruleName,
                                urls: validatedUrls,
                            },
                            (res) => {
                                if (res && res.success) {
                                    this._showToast(
                                        chrome.i18n.getMessage('omnibarAddedUrlsToRule', [
                                            validatedUrls.length.toString(),
                                            ruleName,
                                        ]) || `Added ${validatedUrls.length} URLs to "${ruleName}"`,
                                    );
                                } else {
                                    this._showToast(
                                        res?.error || chrome.i18n.getMessage('omnibarFailedAddUrls') || 'Failed',
                                    );
                                }
                            },
                        );
                    }
                    this.close();
                } else if (type === 'cr-tab') {
                    e.preventDefault();
                    this._toggleActionItemSelection(li, e.shiftKey, true);
                } else if (type === 'er-item') {
                    const input = this.shadow.getElementById('hint-omni-input');
                    const currentValue = input.value.trim();
                    const currentLower = currentValue.toLowerCase();
                    const pErl = this._getPrefixVal('er:', 'omnibarPrefixRulesEdit');
                    if (li.dataset.erType === 'er-rule') {
                        input.value = `${pErl} rule:${li.dataset.ruleName}, `;
                    } else {
                        input.value = `${pErl} url:${li.dataset.ruleName}::${li.dataset.url}, `;
                    }
                    input.focus();
                    this._handleInput({
                        target: input,
                    });
                } else if (type === 'er-preview') {
                    if (li.dataset.isValid === 'true') {
                        if (li.dataset.newName) {
                            chrome.runtime.sendMessage(
                                {
                                    action: 'updateRuleName',
                                    ruleName: li.dataset.ruleName,
                                    newName: li.dataset.newName,
                                },
                                (res) => {
                                    if (res && res.success) {
                                        this._showToast(
                                            chrome.i18n.getMessage('omnibarRuleRenamed', [li.dataset.newName]) ||
                                                `Rule renamed to "${li.dataset.newName}"`,
                                        );
                                    } else {
                                        this._showToast(
                                            res?.error ||
                                                chrome.i18n.getMessage('omnibarFailedRenameRule') ||
                                                'Failed to rename rule',
                                        );
                                    }
                                },
                            );
                        } else if (li.dataset.newUrl) {
                            chrome.runtime.sendMessage(
                                {
                                    action: 'updateRuleDomain',
                                    ruleName: li.dataset.ruleName,
                                    oldUrl: li.dataset.oldUrl,
                                    newUrl: li.dataset.newUrl,
                                },
                                (res) => {
                                    if (res && res.success) {
                                        this._showToast(
                                            chrome.i18n.getMessage('omnibarRuleUrlUpdated') ||
                                                'Rule URL updated successfully',
                                        );
                                    } else {
                                        this._showToast(
                                            res?.error ||
                                                chrome.i18n.getMessage('omnibarFailedUpdateRuleUrl') ||
                                                'Failed to update rule URL',
                                        );
                                    }
                                },
                            );
                        }
                        this.close();
                    } else {
                        this._showToast(li.dataset.ruleTitle);
                    }
                } else if (li.classList.contains('add-all-filtered')) {
                    // No-op on click for add-all; user must press Enter
                } else if (li.classList.contains('delete-all-filtered')) {
                    const isDg = li.dataset.specialType === 'delete-all-groups';
                    const isDrl = li.dataset.specialType === 'delete-all-rules';
                    const isBg = li.dataset.specialType === 'backup-all-groups';
                    const isBgr = li.dataset.specialType === 'restore-all-groups';
                    const ids = JSON.parse(li.dataset.rawIds || '[]');
                    if (isDg) {
                        chrome.runtime.sendMessage({
                            action: 'deleteTabGroups',
                            groupIds: ids,
                        });
                    } else if (isDrl) {
                        chrome.runtime.sendMessage(
                            {
                                action: 'deleteRulesFromOmnibar',
                                items: ids,
                            },
                            (res) => {
                                if (res && res.success) {
                                    this._showToast(
                                        chrome.i18n.getMessage('omnibarRulesDeleted') || 'Rules deleted successfully',
                                    );
                                }
                            },
                        );
                    } else if (isBg) {
                        chrome.runtime.sendMessage(
                            {
                                action: 'backupAllGroupsFromKey',
                                groupIds: ids,
                            },
                            (response) => {
                                if (response && response.success) {
                                    this._showToast(
                                        chrome.i18n.getMessage('omnibarGroupsBackedUp') ||
                                            'Groups backed up successfully',
                                    );
                                } else {
                                    this._showToast(response?.error || 'Failed to backup groups');
                                }
                            },
                        );
                    } else if (isBgr) {
                        chrome.runtime.sendMessage(
                            {
                                action: 'restoreAllGroupsFromKey',
                                groupIds: ids,
                            },
                            (response) => {
                                if (response && response.success) {
                                    this._showToast(
                                        chrome.i18n.getMessage('omnibarGroupsRestored', [ids.length.toString()]) ||
                                            `Restoring ${ids.length} backup(s)`,
                                    );
                                } else {
                                    this._showToast(response?.error || 'Failed to restore backups');
                                }
                            },
                        );
                    } else {
                        chrome.runtime.sendMessage({
                            action: 'deleteTabs',
                            tabIds: ids,
                        });
                    }
                    this.close();
                } else if (type === 'dg') {
                    this._handleMultiSelectionClick(e, li, (ids) => {
                        if (ids.length > 1) {
                            chrome.runtime.sendMessage({
                                action: 'deleteTabGroups',
                                groupIds: ids,
                            });
                        } else {
                            chrome.runtime.sendMessage({
                                action: 'deleteTabGroup',
                                groupId: ids[0],
                            });
                        }
                        this.close();
                    });
                } else if (type === 'dt') {
                    this._handleMultiSelectionClick(e, li, (ids) => {
                        chrome.runtime.sendMessage({
                            action: 'deleteTabs',
                            tabIds: ids,
                        });
                        this.close();
                    });
                } else if (type === 'bg-item') {
                    const currentInput = this.shadow.getElementById('hint-omni-input').value;
                    const pBgClick = this._getPrefixVal('bg:', 'omnibarPrefixBackupNowDesc');
                    if (currentInput.startsWith(pBgClick)) {
                        this._handleMultiSelectionClick(e, li, (ids) => {
                            chrome.runtime.sendMessage(
                                {
                                    action: 'backupAllGroupsFromKey',
                                    groupIds: ids,
                                },
                                (response) => {
                                    if (response && response.success) {
                                        this._showToast(
                                            chrome.i18n.getMessage('omnibarGroupsBackedUp') ||
                                                'Groups backed up successfully',
                                        );
                                    } else {
                                        this._showToast(response?.error || 'Failed to backup group');
                                    }
                                },
                            );
                            this.close();
                        });
                    } else {
                        this._handleMultiSelectionClick(e, li, (ids) => {
                            const groupIdsToRestore = [];
                            ids.forEach((id) => {
                                if (typeof id === 'number') {
                                    groupIdsToRestore.push(id);
                                } else {
                                    const liEl = Array.from(li.parentNode.children).find(
                                        (item) =>
                                            item.dataset.type === 'bg-item' &&
                                            `${item.dataset.groupId}::${item.dataset.tabUrl}` === id,
                                    );
                                    if (liEl) {
                                        chrome.runtime.sendMessage({
                                            action: 'restoreBackupTab',
                                            groupId: parseInt(liEl.dataset.groupId, 10),
                                            tabUrl: liEl.dataset.tabUrl,
                                            tabTitle: liEl.dataset.tabTitle,
                                        });
                                    }
                                }
                            });
                            if (groupIdsToRestore.length > 0) {
                                chrome.runtime.sendMessage(
                                    {
                                        action: 'restoreAllGroupsFromKey',
                                        groupIds: groupIdsToRestore,
                                    },
                                    (response) => {
                                        if (response && response.success) {
                                            this._showToast(
                                                chrome.i18n.getMessage('omnibarGroupsRestored', [
                                                    groupIdsToRestore.length.toString(),
                                                ]) || `Restoring ${groupIdsToRestore.length} backup(s)`,
                                            );
                                        } else {
                                            this._showToast(response?.error || 'Failed to restore backups');
                                        }
                                    },
                                );
                            }
                            this.close();
                        });
                    }
                } else if (li.dataset.url && !['conversation', 'note', 'image', 'message'].includes(type)) {
                    chrome.runtime.sendMessage({
                        action: 'openUrl',
                        url: li.dataset.url,
                    });
                    this.close();
                } else if (type === 'ai-hint') {
                    return;
                } else if (type === 'conversation') {
                    if (e.ctrlKey || e.metaKey) this._expandConversation(li);
                    // plain click: allow text selection, do nothing
                } else if (type === 'note') {
                    if (e.ctrlKey || e.metaKey) this._expandNote(li);
                } else if (type === 'message') {
                    if (e.ctrlKey || e.metaKey) this._expandMessage(li);
                } else if (type === 'image') {
                    if (e.ctrlKey || e.metaKey) this._expandImage(li);
                    // plain click: copy to clipboard
                    else this._copyImageToClipboard(li);
                }
            });
            container.appendChild(li);
        });
        this.selectedIndex = 0;
        this._updateSelection(container.children, false);
    }
    _itemMatchesQuery(itemType, itemData, query) {
        if (!query) return true;
        if (this.useRegex) {
            try {
                const regex = new RegExp(query, 'i');
                if (itemType === 'dg') {
                    const title = itemData.title || '';
                    const color = itemData.color || '';
                    return regex.test(title) || regex.test(color);
                } else if (itemType === 'text') {
                    return regex.test(itemData);
                } else {
                    // tab
                    const title = itemData.title || '';
                    const url = itemData.url || '';
                    return regex.test(title) || regex.test(url);
                }
            } catch {
                // Invalid regex, fallback to text search
            }
        }

        // Normal space-separated word filtering (order independent, all words must match)
        const words = query
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 0);
        if (words.length === 0) return true;
        if (itemType === 'dg') {
            const combined = ((itemData.title || '') + ' ' + (itemData.color || '')).toLowerCase();
            return words.every((word) => combined.includes(word));
        } else if (itemType === 'text') {
            const text = (itemData || '').toLowerCase();
            return words.every((word) => text.includes(word));
        } else {
            // tab
            const combined = ((itemData.title || '') + ' ' + (itemData.url || '')).toLowerCase();
            return words.every((word) => combined.includes(word));
        }
    }

    /**
     * [AI INSTRUCTION]
     * When building or modifying Omnibar prefixes that support multi-selection (via Ctrl/Shift + Click),
     * YOU MUST use this helper method inside the 'click' event listener for that item type instead of
     * writing custom if/else modifiers logic.
     *
     * This function standardizes the interaction flow:
     * 1. Ctrl/Meta + Click: Toggles selection of the item without executing the action.
     * 2. Shift + Click: Selects a range of items.
     * 3. Normal Click (or Enter key fallthrough):
     *    - If items are already selected, it executes the action on the selected batch.
     *    - If no items are selected, it temporarily selects the current item and executes the action on it immediately.
     *
     * @param {Event} e - The click or keyboard event.
     * @param {HTMLElement} li - The list item element being interacted with.
     * @param {Function} confirmAction - A callback function that receives an array of IDs to process.
     */
    _handleMultiSelectionClick(e, li, confirmAction) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this._toggleActionItemSelection(li, false, true);
        } else if (e.shiftKey) {
            e.preventDefault();
            this._toggleActionItemSelection(li, true, false);
        } else {
            if (!this.selectedActionItems) {
                this.selectedActionItems = new Set();
            }
            const getLiId = (item) => {
                const itemType = item.dataset.type;
                if (itemType === 'dg') return parseInt(item.dataset.groupId);
                if (itemType === 'bg-item')
                    return item.dataset.bgType === 'bg-group'
                        ? parseInt(item.dataset.groupId)
                        : `${item.dataset.groupId}::${item.dataset.tabUrl}`;
                if (itemType === 'dt') return parseInt(item.dataset.tabId);
                return item.dataset.actionId;
            };
            if (this.selectedActionItems.size > 0) {
                confirmAction(Array.from(this.selectedActionItems));
            } else {
                const actionId = getLiId(li);
                if (actionId !== undefined) {
                    this.selectedActionItems.add(actionId);
                }
                confirmAction(Array.from(this.selectedActionItems));
            }
        }
    }
    _toggleActionItemSelection(li, isShift, isCtrlOrSpace) {
        const resultsList = this.shadow.getElementById('hint-omni-results');
        const items = Array.from(resultsList.getElementsByTagName('li'));
        const idx = parseInt(li.dataset.index);
        const getLiId = (item) => {
            const itemType = item.dataset.type;
            if (itemType === 'dg') {
                return parseInt(item.dataset.groupId);
            } else if (itemType === 'bg-item') {
                if (item.dataset.bgType === 'bg-group') {
                    return parseInt(item.dataset.groupId);
                } else {
                    return `${item.dataset.groupId}::${item.dataset.tabUrl}`;
                }
            } else if (itemType === 'dt') {
                return parseInt(item.dataset.tabId);
            } else {
                return item.dataset.actionId;
            }
        };
        const isDeleteType = (itemType) => {
            return itemType === 'dg' || itemType === 'dt' || itemType === 'dr-item';
        };
        if (isShift && this.lastSelectedActionIdx !== null) {
            const min = Math.min(this.lastSelectedActionIdx, idx);
            const max = Math.max(this.lastSelectedActionIdx, idx);
            for (let i = min; i <= max; i++) {
                const item = items[i];
                if (
                    item &&
                    !item.classList.contains('delete-all-filtered') &&
                    !item.classList.contains('add-all-filtered')
                ) {
                    const id = getLiId(item);
                    if (id !== undefined && id !== null) {
                        this.selectedActionItems.add(id);
                        const isDelete = isDeleteType(item.dataset.type);
                        item.classList.add(isDelete ? 'action-selected' : 'action-selected-theme');
                    }
                }
            }
        } else {
            const id = getLiId(li);
            if (id !== undefined && id !== null) {
                const isDelete = isDeleteType(li.dataset.type);
                const className = isDelete ? 'action-selected' : 'action-selected-theme';
                if (this.selectedActionItems.has(id)) {
                    this.selectedActionItems.delete(id);
                    li.classList.remove('action-selected', 'action-selected-theme');
                } else {
                    this.selectedActionItems.add(id);
                    li.classList.add(className);
                }
            }
        }
        this.lastSelectedActionIdx = idx;
    }
    _updateSelection(items, selectInPage = true) {
        for (let i = 0; i < items.length; i++) {
            items[i].classList.toggle('selected', i === this.selectedIndex);
        }
        const target = items[this.selectedIndex];
        if (target) {
            const resultsList = this.shadow ? this.shadow.getElementById('hint-omni-results') : null;
            if (resultsList) {
                const offsetTop = target.offsetTop;
                const targetHeight = target.offsetHeight;
                const containerScrollTop = resultsList.scrollTop;
                const containerHeight = resultsList.clientHeight;

                if (offsetTop < containerScrollTop) {
                    resultsList.scrollTop = offsetTop;
                } else if (offsetTop + targetHeight > containerScrollTop + containerHeight) {
                    resultsList.scrollTop = offsetTop + targetHeight - containerHeight;
                }
            } else {
                target.scrollIntoView({
                    block: 'nearest',
                });
            }
        }
        const selected = items[this.selectedIndex];
        if (this.shadow && selected && selected.dataset.type === 'inpage') {
            const counter = this.shadow.getElementById('hint-omni-counter');
            if (counter)
                counter.textContent =
                    chrome.i18n.getMessage('omnibarSearchCounter', [
                        (this.selectedIndex + 1).toString(),
                        this.matches.length.toString(),
                    ]) || `${this.selectedIndex + 1}/${this.matches.length}`;
            if (selectInPage) {
                this._selectMatchInPage(this.matches[parseInt(selected.dataset.matchIndex)]);
            }
        }
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
    _selectMatchInPage(match) {
        if (!match) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        sel.addRange(range);
        const rect = range.getBoundingClientRect();
        let targetY = window.scrollY + rect.top - window.innerHeight * 0.3 + rect.height / 2;
        if (this.shadow) {
            const barEl = this.shadow.getElementById('hint-omni-bar');
            if (barEl) targetY -= barEl.getBoundingClientRect().height + 40;
        }
        window.scrollTo({
            top: targetY,
            behavior: 'smooth',
        });
    }
};

/**
 * @class HelpModal
 * @description Now uses HintCommon for data management, sharing validation and saving with customize_hints.
 */
/**
 * @class HelpModal
 */
