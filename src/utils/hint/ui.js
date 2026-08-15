/**
 * @class ShadowUI
 * @description Handles creation and injection of Shadow DOM and its styles.
 */
var ShadowUI = class ShadowUI {
    constructor() {
        this.hostId = 'itg-hint-shadow-host';
        this.host = null;
        this.root = null;
        this.filterObserver = null;
    }
    init() {
        const body = document.body;
        if (!body) return;
        this.host = document.createElement('div');
        this.host.id = this.hostId;
        this.host.style.cssText =
            'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
        body.insertAdjacentElement('afterbegin', this.host);
        this.root = this.host.attachShadow({
            mode: 'open',
        });
        const styleUrl = chrome.runtime.getURL('src/styles/hint_content.css');
        Utils.loadStyle(this.root, styleUrl);
        Utils.loadThemes(this.root);
        this.initFilterSync();
    }
    applyTheme(theme) {
        if (!this.host || !theme) return;
        const pageMode = document.documentElement.getAttribute('data-itg-page-mode');
        Utils.applyThemeToHost(this.host, theme, pageMode);
    }
    initFilterSync() {
        const sync = () => {
            const pageFilter = window.getComputedStyle(document.documentElement).filter;
            if (this.host.style.filter !== pageFilter) {
                this.host.style.filter = pageFilter;
            }
        };
        this.filterObserver = new MutationObserver(sync);
        this.filterObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style', 'itg-mode-applied'],
        });
        sync();
    }
    getContainer() {
        return this.root;
    }
    cleanup() {
        if (this.filterObserver) {
            this.filterObserver.disconnect();
            this.filterObserver = null;
        }
        if (this.host && this.host.parentNode) {
            this.host.parentNode.removeChild(this.host);
            this.host = null;
        }
    }
};

/**
 * @class ScrollManager
 */
var ScrollManager = class ScrollManager {
    getActiveScrollableElement() {
        const potentialContainers = [
            'groups-list',
            'gemini-conversation-view',
            'notes-view',
            'screenshot-gallery-view',
        ];
        for (const id of potentialContainers) {
            const el = document.getElementById(id);
            if (el && el.offsetParent !== null) {
                return el;
            }
        }
        return null;
    }
    canScrollX(direction) {
        const activePanel = this.getActiveScrollableElement();
        if (activePanel) {
            if (direction < 0) {
                return activePanel.scrollLeft > 0;
            } else {
                return activePanel.scrollLeft + activePanel.clientWidth < activePanel.scrollWidth - 1;
            }
        } else {
            const docEl = document.documentElement;
            if (direction < 0) {
                return window.scrollX > 0;
            } else {
                return window.scrollX + window.innerWidth < docEl.scrollWidth - 1;
            }
        }
    }
    scroll(x, y) {
        const activePanel = this.getActiveScrollableElement();
        if (activePanel) activePanel.scrollBy(x, y);
        else window.scrollBy(x, y);
    }
    scrollToEdge(toTop) {
        const activePanel = this.getActiveScrollableElement();
        if (activePanel) activePanel.scrollTo(0, toTop ? 0 : activePanel.scrollHeight);
        else window.scrollTo(0, toTop ? 0 : document.body.scrollHeight);
    }
};

/**
 * @class HintEngine
 * @description Core logic for generating and activating hints.
 */

/**
 * @class HelpModal
 * @description Now uses HintCommon for data management, sharing validation and saving with customize_hints.
 */
/**
 * @class HelpModal
 */
var HelpModal = class HelpModal {
    constructor(shadowUI, commandRegistry, snippetManager, linkPreviewManager) {
        this.shadowUI = shadowUI;
        this.registry = commandRegistry;
        this.snippetManager = snippetManager;
        this.linkPreviewManager = linkPreviewManager;
        this.visible = false;
    }
    updateLinkPreviewToggle(enabled) {
        // Deprecated: UI toggle removed.
    }
    updateLinkPreviewBlacklist(blacklist) {
        if (!this.visible) return;
        const shadowRoot = this.shadowUI.getContainer();
        if (!shadowRoot) return;
        const container = shadowRoot.querySelector('#itg-preview-blacklist-section');
        if (container) {
            this._renderBlacklist(container, blacklist);
        }
    }
    updateLinkPreviewTriggerKey(triggerKey) {
        if (!this.visible) return;
        const shadowRoot = this.shadowUI.getContainer();
        if (!shadowRoot) return;
        const inputEl = shadowRoot.querySelector('#itg-modal-preview-trigger-input');
        if (inputEl && document.activeElement !== inputEl) {
            inputEl.value = (triggerKey || '').trim().toLowerCase();
        }
    }
    async toggle() {
        const h = HintCommon.DOM.create;
        const modalId = 'hint-help-modal';
        const shadowRoot = this.shadowUI.getContainer();
        let modal = shadowRoot.getElementById(modalId);
        if (modal) {
            const hasErrors = !!modal.querySelector('.itg-input-error');
            if (hasErrors) {
                const activeErr = modal.querySelector('.itg-input-error');
                if (activeErr && activeErr.focus) activeErr.focus();
                return false;
            }
            modal.remove();
            this.visible = false;
            if (this._modalKeyHandler) {
                window.removeEventListener('keydown', this._modalKeyHandler);
                this._modalKeyHandler = null;
            }
            return true;
        }
        modal = h('div', {
            id: modalId,
            style: `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.7); z-index: 2147483630; display: flex; justify-content: center; align-items: center; pointer-events: auto;`,
        });

        // Help Modal scroll Lock Fix
        modal.addEventListener(
            'wheel',
            (e) => {
                const scrollContainer = modal.querySelector('#itg-help-body');
                if (scrollContainer) {
                    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
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
        let isMouseDownOnModal = false;
        modal.addEventListener('mousedown', (e) => {
            isMouseDownOnModal = e.target === modal;
        });
        modal.addEventListener('mouseup', (e) => {
            if (e.target === modal && isMouseDownOnModal) {
                this.toggle();
            }
            isMouseDownOnModal = false;
        });
        const content = h('div', {
            id: 'hint-help-modal-content',
            spellcheck: 'false',
            autocomplete: 'off',
        });
        modal.appendChild(content);
        const body = h('div', {
            id: 'itg-help-body',
            className: 'itg-modal-body',
        });
        const footer = h('div', {
            id: 'itg-help-footer',
        });
        content.appendChild(body);
        content.appendChild(footer);
        const btnScrollUp = h('button', {
            id: 'itg-scroll-up',
            'data-i18n-aria-label': 'scrollToTop',
        });
        btnScrollUp.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-linecap="square"></path></svg>`;
        const btnScrollDown = h('button', {
            id: 'itg-scroll-down',
            'data-i18n-aria-label': 'scrollToBottom',
        });
        btnScrollDown.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="var(--text-color)" stroke-linecap="square"></path></svg>`;
        const scrollButtons = h(
            'div',
            {
                className: 'itg-scroll-buttons-float',
            },
            [btnScrollUp, btnScrollDown],
        );
        content.appendChild(scrollButtons);
        const headerContainer = h('div', {
            className: 'itg-help-header-container',
            style: 'display: flex; justify-content: center; align-items: center; margin-bottom: 16px;',
        });
        const titleEl = h(
            'h2',
            {
                'data-i18n': 'helpModalTitle',
                style: 'margin: 0;',
            },
            chrome.i18n.getMessage('helpModalTitle') || 'Navigation Shortcuts',
        );
        headerContainer.appendChild(titleEl);
        body.appendChild(headerContainer);

        // Search bar for filtering commands
        const searchContainer = h('div', {
            className: 'help-modal-search-container',
            style: 'position: sticky; top: 0; z-index: 1; background-color: var(--bg-panel-color); padding: 0 0 12px 0;',
        });
        const searchInput = h('input', {
            type: 'search',
            id: 'help-modal-search-input',
            className: 'help-modal-search-input',
            placeholder: chrome.i18n.getMessage('searchCommandsPlaceholder') || 'Search commands...',
            autocomplete: 'off',
            spellcheck: 'false',
        });
        searchContainer.appendChild(searchInput);
        body.appendChild(searchContainer);
        searchInput.value = ''; // Reset search on open

        const mappings = this.registry.getMappings();
        const builtInCategories = HintCommon.BUILT_IN_COMMANDS;
        for (const catKey in builtInCategories) {
            if (catKey === 'categoryOmnibarPrefixes') continue;
            const catName = chrome.i18n.getMessage(catKey) || catKey.replace(/([A-Z])/g, ' $1').trim();
            const cleanCat = catKey.replace('category', '').toLowerCase();
            body.appendChild(h('h3', {}, catName));
            const table = h('table');
            body.appendChild(table);
            const commands = builtInCategories[catKey];
            for (const [defKey, descKey] of Object.entries(commands)) {
                let currentKey = defKey;
                // Check if this descKey has an override in current mappings
                const activeKey = Object.keys(mappings).find((k) => mappings[k].description === descKey);
                if (activeKey) {
                    currentKey = activeKey;
                }
                const description = chrome.i18n.getMessage(descKey) || descKey;
                let cellContentNode;
                if (currentKey === 'f') {
                    const hintLabel = chrome.i18n.getMessage('hintKeyDefault') || 'Hint';
                    cellContentNode = h(
                        'div',
                        {
                            className: 'itg-internal-desc-container',
                        },
                        [
                            h('strong', {}, description),
                            h(
                                'table',
                                {
                                    className: 'itg-internal-desc-table',
                                },
                                [
                                    h('tr', {}, [
                                        h(
                                            'td',
                                            {
                                                className: 'itg-internal-desc-key',
                                            },
                                            hintLabel,
                                        ),
                                        h(
                                            'td',
                                            {},
                                            chrome.i18n.getMessage('hintClickDesc') || 'Open link in current tab',
                                        ),
                                    ]),
                                    h('tr', {}, [
                                        h(
                                            'td',
                                            {
                                                className: 'itg-internal-desc-key',
                                            },
                                            `Ctrl + ${hintLabel}`,
                                        ),
                                        h(
                                            'td',
                                            {},
                                            chrome.i18n.getMessage('hintNewTabDesc') ||
                                                'Open link in new tab (Background)',
                                        ),
                                    ]),
                                    h('tr', {}, [
                                        h(
                                            'td',
                                            {
                                                className: 'itg-internal-desc-key',
                                            },
                                            `Shift + ${hintLabel}`,
                                        ),
                                        h(
                                            'td',
                                            {},
                                            chrome.i18n.getMessage('hintNewWindowDesc') || 'Open link in new window',
                                        ),
                                    ]),
                                ],
                            ),
                        ],
                    );
                } else if (currentKey === 'cf') {
                    const hintLabel = chrome.i18n.getMessage('hintKeyDefault') || 'Hint';
                    cellContentNode = h(
                        'div',
                        {
                            className: 'itg-internal-desc-container',
                        },
                        [
                            h('strong', {}, description),
                            h(
                                'table',
                                {
                                    className: 'itg-internal-desc-table',
                                },
                                [
                                    h('tr', {}, [
                                        h(
                                            'td',
                                            {
                                                className: 'itg-internal-desc-key',
                                            },
                                            hintLabel,
                                        ),
                                        h('td', {}, chrome.i18n.getMessage('hintCopyUrlDesc') || 'Copy link URL'),
                                    ]),
                                    h('tr', {}, [
                                        h(
                                            'td',
                                            {
                                                className: 'itg-internal-desc-key',
                                            },
                                            `Shift + ${hintLabel}`,
                                        ),
                                        h('td', {}, chrome.i18n.getMessage('hintCopyTextDesc') || 'Copy item text'),
                                    ]),
                                ],
                            ),
                        ],
                    );
                } else {
                    cellContentNode = document.createTextNode(description);
                }
                const tdKey = h(
                    'td',
                    {
                        className: 'itg-editable-key',
                        'data-key': currentKey,
                        'data-desc': descKey,
                        // We'll use this for saving
                        'data-category': cleanCat,
                        contenteditable: 'true',
                    },
                    currentKey,
                );
                const tdDesc = h(
                    'td',
                    {
                        className: 'itg-description-cell',
                    },
                    cellContentNode,
                );
                table.appendChild(h('tr', {}, [tdKey, tdDesc]));
                if (descKey === 'hintDesc_vp') {
                    const trTrigger = h('tr', {
                        id: 'itg-modal-preview-trigger-row',
                    });
                    const tdInput = h('td', {
                        style: 'padding: 0; width: 120px; vertical-align: middle;',
                    });
                    const inputEl = h('input', {
                        type: 'text',
                        id: 'itg-modal-preview-trigger-input',
                        maxlength: '15',
                        placeholder: '-',
                        className: 'itg-editable-key',
                        style: 'display: block; width: 100%; box-sizing: border-box; text-align: center; font-family: inherit; font-weight: bold; font-size: inherit; background-color: var(--bg-color); border: 1px solid transparent; border-bottom: 1px solid var(--border-color); color: var(--text-color); border-radius: 4px; padding: 8px; margin: 0; cursor: pointer;',
                        autocomplete: 'off',
                        spellcheck: 'false',
                    });
                    inputEl.value =
                        this.linkPreviewManager && this.linkPreviewManager.triggerKey
                            ? this.linkPreviewManager.triggerKey
                            : '';
                    inputEl.addEventListener('keydown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.key === 'Escape' || e.key === 'Enter') {
                            inputEl.blur();
                            return;
                        }
                        if (e.key === 'Backspace' || e.key === 'Delete') {
                            inputEl.value = '';
                            chrome.runtime.sendMessage({
                                action: 'setLinkPreviewTriggerKey',
                                triggerKey: '',
                            });
                            return;
                        }
                        let keyVal = e.key.toLowerCase();
                        if (keyVal === ' ') keyVal = 'space';
                        inputEl.value = keyVal;
                        chrome.runtime.sendMessage({
                            action: 'setLinkPreviewTriggerKey',
                            triggerKey: keyVal,
                        });
                    });
                    inputEl.addEventListener('blur', () => {
                        inputEl.value = inputEl.value.trim().toLowerCase();
                    });
                    tdInput.appendChild(inputEl);
                    const tdDesc = h(
                        'td',
                        {
                            className: 'itg-description-cell',
                            style: 'padding: 8px; vertical-align: middle;',
                            title: chrome.i18n.getMessage('previewTriggerKeyTooltip') || '',
                        },
                        chrome.i18n.getMessage('previewTriggerKeyLabel') || 'Hold key to preview link:',
                    );
                    trTrigger.appendChild(tdInput);
                    trTrigger.appendChild(tdDesc);
                    table.appendChild(trTrigger);
                }
            }
        }

        // --- OMNIBAR SECTION CORRECTION ---
        const omnibarCat = chrome.i18n.getMessage('categoryOmnibarPrefixes') || 'Omnibar Prefixes';
        body.appendChild(h('h3', {}, omnibarCat));
        const omnibarTable = h('table');
        body.appendChild(omnibarTable);
        const omnibarCommands = builtInCategories.categoryOmnibarPrefixes || {};
        // Get raw overrides
        const rawOverrides = this.registry.getRawShortcuts();
        for (const [defPref, msgKey] of Object.entries(omnibarCommands)) {
            // Check if an override exists for this ID (msgKey)
            const currentPref = rawOverrides[msgKey] || defPref;
            const tdKey = h(
                'td',
                {
                    className: 'itg-editable-key',
                    'data-key': currentPref,
                    'data-desc': msgKey,
                    // msgKey is the stable ID
                    'data-category': 'omnibar',
                    contenteditable: 'true',
                },
                currentPref,
            );
            const tdDesc = h('td', {}, chrome.i18n.getMessage(msgKey) || msgKey);
            omnibarTable.appendChild(h('tr', {}, [tdKey, tdDesc]));
        }

        // ... (Rest of Custom Site and Snippets sections remain the same)
        const pinBtnSites = h('button', {
            className: 'itg-pin-btn',
            'data-section': 'itg-custom-sites-section',
        });
        pinBtnSites.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-width="2" stroke-linecap="square"></path></svg>`;
        const customSitesSection = h(
            'div',
            {
                className: 'itg-manage-section',
                id: 'itg-custom-sites-section',
            },
            [
                h(
                    'div',
                    {
                        className: 'itg-manage-header',
                    },
                    [
                        h('h3', {}, chrome.i18n.getMessage('manageSiteShortcuts') || 'Manage Site Shortcuts'),
                        pinBtnSites,
                    ],
                ),
                h(
                    'div',
                    {
                        className: 'itg-manage-form',
                    },
                    [
                        h('input', {
                            type: 'text',
                            id: 'itg-new-site-key',
                            className: 'itg-manage-input',
                            maxlength: '4',
                            placeholder: chrome.i18n.getMessage('placeholderKey') || 'Key',
                            autocomplete: 'off',
                        }),
                        h('input', {
                            type: 'text',
                            id: 'itg-new-site-url',
                            className: 'itg-manage-input',
                            placeholder: chrome.i18n.getMessage('placeholderUrl') || 'URL',
                            autocomplete: 'off',
                        }),
                        h('input', {
                            type: 'text',
                            id: 'itg-new-site-desc',
                            className: 'itg-manage-input',
                            placeholder: chrome.i18n.getMessage('placeholderDesc') || 'Description',
                            autocomplete: 'off',
                        }),
                        h(
                            'button',
                            {
                                id: 'itg-add-site-btn',
                                className: 'itg-manage-btn-add',
                            },
                            chrome.i18n.getMessage('addBtn') || '+',
                        ),
                    ],
                ),
                h('ul', {
                    id: 'itg-custom-sites-list',
                    className: 'itg-manage-list',
                }),
            ],
        );
        body.appendChild(customSitesSection);
        const pinBtnSnippets = h('button', {
            className: 'itg-pin-btn',
            'data-section': 'itg-snippets-section',
        });
        pinBtnSnippets.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-width="2" stroke-linecap="square"></path></svg>`;
        const snippetsSection = h(
            'div',
            {
                className: 'itg-manage-section',
                id: 'itg-snippets-section',
            },
            [
                h(
                    'div',
                    {
                        className: 'itg-manage-header',
                    },
                    [
                        h('h3', {}, chrome.i18n.getMessage('manageSnippets') || 'Manage Snippets (Autocomplete)'),
                        pinBtnSnippets,
                    ],
                ),
                h('div', {
                    id: 'itg-snippet-form-error',
                    style: 'display: none; color: var(--error-color); font-size: 12px; margin-bottom: 8px; font-weight: bold;',
                }),
                h(
                    'div',
                    {
                        className: 'itg-manage-form snippets',
                        style: 'display: flex; gap: 10px; align-items: center;',
                    },
                    [
                        h('input', {
                            type: 'text',
                            id: 'itg-new-snippet-trigger',
                            className: 'itg-manage-input',
                            maxlength: '5',
                            placeholder: chrome.i18n.getMessage('placeholderKey') || 'Trigger',
                            autocomplete: 'off',
                            style: 'width: 80px;',
                        }),
                        h(
                            'div',
                            {
                                className: 'itg-hint-snippet-expansion-wrapper',
                                style: 'flex: 1; min-width: 0;',
                            },
                            [
                                h('div', {
                                    id: 'itg-new-snippet-expansion',
                                    className: 'itg-manage-input',
                                    contenteditable: 'true',
                                    style: 'flex: 1; min-height:32px; height:auto; max-height:96px; padding:6px 8px; display:block; overflow-y:auto; overflow-x:hidden; white-space:pre-wrap; word-break:break-word; overflow-wrap:break-word; line-height:1.4;',
                                    'data-placeholder': chrome.i18n.getMessage('placeholderExpansion') || 'Expansion',
                                }),
                                h('button', {
                                    id: 'itg-snippet-format-btn',
                                    className: 'itg-hint-format-btn',
                                    type: 'button',
                                    title: chrome.i18n.getMessage('formatText') || 'Format text',
                                }),
                            ],
                        ),
                        h(
                            'div',
                            {
                                style: 'display: flex; align-items: center; gap: 5px;',
                            },
                            [
                                h('input', {
                                    type: 'number',
                                    id: 'itg-new-snippet-var-count',
                                    className: 'itg-manage-input',
                                    min: '0',
                                    max: '50',
                                    value: '0',
                                    style: 'width: 50px; text-align: center;',
                                }),
                            ],
                        ),
                        h(
                            'button',
                            {
                                id: 'itg-add-snippet-btn',
                                className: 'itg-manage-btn-add',
                                style: 'width: 32px; height: 32px; padding: 0;',
                            },
                            '+',
                        ),
                    ],
                ),
                h('div', {
                    id: 'itg-inline-format-editor',
                    className: 'itg-inline-editor-section',
                }),
                h('div', {
                    id: 'itg-new-snippet-variables-container',
                    style: 'display: flex; flex-direction: column; gap: 5px; margin-top: 10px;',
                }),
                h('ul', {
                    id: 'itg-snippets-list',
                    className: 'itg-manage-list',
                }),
            ],
        );
        body.appendChild(snippetsSection);

        // Add Preview Blacklist Section
        const blacklistSection = h(
            'section',
            {
                id: 'itg-preview-blacklist-section',
                className: 'itg-manage-section',
            },
            [
                h(
                    'div',
                    {
                        className: 'itg-section-header',
                    },
                    [
                        h(
                            'h3',
                            {
                                className: 'itg-section-title',
                            },
                            chrome.i18n.getMessage('managePreviewBlacklistTitle') || 'Link Preview Blacklist',
                        ),
                    ],
                ),
                h(
                    'div',
                    {
                        className: 'itg-manage-form',
                        style: 'display: flex; gap: 8px; margin-bottom: 10px;',
                    },
                    [
                        h('input', {
                            type: 'text',
                            id: 'itg-new-blacklist-domain',
                            className: 'itg-manage-input',
                            style: 'flex: 1;',
                            placeholder: chrome.i18n.getMessage('placeholderDomain') || 'e.g. youtube.com',
                        }),
                        h(
                            'button',
                            {
                                id: 'itg-add-blacklist-btn',
                                className: 'itg-manage-btn-add',
                                style: 'width: 32px; height: 32px; padding: 0;',
                            },
                            '+',
                        ),
                    ],
                ),
                h('ul', {
                    id: 'itg-blacklist-list',
                    className: 'itg-manage-list',
                }),
            ],
        );
        body.appendChild(blacklistSection);
        const resetBtn = h(
            'button',
            {
                id: 'itg-reset-shortcuts',
                'data-i18n': 'resetDefaults',
            },
            chrome.i18n.getMessage('resetDefaults') || 'Reset to Defaults',
        );
        const footerHint = h(
            'p',
            {
                className: 'itg-help-footer-hint',
                'data-i18n': 'helpModalCloseHint',
            },
            chrome.i18n.getMessage('helpModalCloseHint') || 'Press Shift+? or Esc to close',
        );
        footer.appendChild(resetBtn);
        footer.appendChild(footerHint);
        shadowRoot.appendChild(modal);
        this.visible = true;
        this._renderCustomSites(body);
        this._renderSnippets(body);
        this._renderBlacklist(body);
        this._setupManagementListeners(body);
        this._setupPinListeners(body);
        this._setupFloatingScrollButtons(content);
        await this._restorePinnedSections(body);
        chrome.runtime.sendMessage(
            {
                action: 'getActiveTheme',
            },
            (theme) => {
                if (theme && theme.colors) {
                    const cssVars = Object.entries(theme.colors)
                        .map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
                        .join(' ');
                    content.style.cssText += cssVars;
                }
            },
        );
        content.querySelectorAll('.itg-editable-key').forEach((el) => {
            this._attachKeyListeners(el);
        });
        const handleKeyDown = (e) => {
            // Don't act if the event comes from inside a shadow DOM (e.g., omnibar input)
            // composedPath()[0] is the actual element that triggered the event
            const origin = e.composedPath && e.composedPath()[0];
            if (origin && origin !== e.target) return; // shadow DOM event -> ignore
            // Also don't act if a native input has focus
            if (
                document.activeElement &&
                Utils &&
                Utils.isInputLikeElement &&
                Utils.isInputLikeElement(document.activeElement)
            )
                return;
            if (e.key === 'Escape' || (e.key === '?' && e.shiftKey)) {
                if (this.toggle()) {
                    window.removeEventListener('keydown', this._modalKeyHandler);
                    this._modalKeyHandler = null;
                }
            }
        };
        this._modalKeyHandler = handleKeyDown;
        window.addEventListener('keydown', this._modalKeyHandler);

        // Search filter for help modal
        const modalSearchInput = shadowRoot.getElementById('help-modal-search-input');
        if (modalSearchInput) {
            const searchContainer = modalSearchInput.closest('.help-modal-search-container');

            // Build section list from the rendered body
            const getSectionList = () => {
                const sections = [];
                const bodyEl = shadowRoot.getElementById('itg-help-body');
                const children = Array.from(bodyEl.children);
                for (let i = 0; i < children.length; i++) {
                    const el = children[i];
                    if (el.tagName === 'H3') {
                        const table = children[i + 1];
                        if (table && table.tagName === 'TABLE') {
                            const name = el.textContent.trim();
                            const count = table.querySelectorAll('tr').length;
                            sections.push({
                                name,
                                count,
                                h3: el,
                                table,
                                type: 'category',
                            });
                            i++;
                        }
                    } else if (el.classList && el.classList.contains('itg-manage-section')) {
                        const nameEl = el.querySelector('h3') || el.querySelector('.section-title');
                        if (nameEl) {
                            const name = nameEl.textContent.trim();
                            const count = el.querySelectorAll('.command-item').length;
                            sections.push({
                                name,
                                count,
                                el,
                                type: 'manage',
                            });
                        }
                    }
                }
                return sections;
            };

            // @ dropdown management
            let atDropdown = null;
            let atDropdownItems = null;
            let atHighlightIndex = -1;
            const createAtDropdown = () => {
                if (!searchContainer) return null;
                let dropdown = searchContainer.querySelector('.at-section-dropdown');
                if (!dropdown) {
                    dropdown = document.createElement('div');
                    dropdown.className = 'at-section-dropdown';
                    searchContainer.appendChild(dropdown);
                }
                return dropdown;
            };
            const showAtDropdown = (filterText) => {
                if (!atDropdown) atDropdown = createAtDropdown();
                if (!atDropdown) return;
                const sections = getSectionList();
                const lower = filterText.toLowerCase().trim();
                const filtered = !lower ? sections : sections.filter((s) => s.name.toLowerCase().includes(lower));
                atDropdown.innerHTML = '';
                atHighlightIndex = -1;
                if (filtered.length === 0) {
                    atDropdown.classList.remove('visible');
                    return;
                }
                filtered.forEach((s, idx) => {
                    const item = document.createElement('div');
                    item.className = 'at-section-dropdown-item';
                    item.dataset.sectionName = s.name;
                    item.innerHTML = `<span class="at-section-icon">@</span><span class="at-section-label">${s.name}</span><span class="at-section-count">${s.count}</span>`;
                    item.addEventListener('click', () => {
                        selectAtSection(s.name);
                    });
                    item.addEventListener('mouseenter', () => {
                        atDropdownItems?.forEach((el) => el.classList.remove('highlighted'));
                        item.classList.add('highlighted');
                        atHighlightIndex = idx;
                    });
                    atDropdown.appendChild(item);
                });
                atDropdownItems = atDropdown.querySelectorAll('.at-section-dropdown-item');
                atDropdown.classList.add('visible');
            };
            const hideAtDropdown = () => {
                if (atDropdown) atDropdown.classList.remove('visible');
                atDropdownItems = null;
                atHighlightIndex = -1;
            };
            const selectAtSection = (sectionName) => {
                const current = modalSearchInput.value;
                const atIdx = current.lastIndexOf('@');
                if (atIdx >= 0) {
                    modalSearchInput.value = current.substring(0, atIdx) + '@' + sectionName;
                } else {
                    modalSearchInput.value = (current ? current + ' ' : '') + '@' + sectionName;
                }
                hideAtDropdown();
                applyModalSearchFilter();
                modalSearchInput.focus();
            };
            const applyModalSearchFilter = () => {
                const query = modalSearchInput.value.toLowerCase().trim();
                const bodyEl = shadowRoot.getElementById('itg-help-body');
                const children = Array.from(bodyEl.children);

                // Extract @ section filter
                let sectionFilter = null;
                const atIdx = query.lastIndexOf('@');
                if (atIdx >= 0) {
                    sectionFilter = query
                        .substring(atIdx + 1)
                        .trim()
                        .toLowerCase();
                }
                for (let i = 0; i < children.length; i++) {
                    const el = children[i];
                    if (el.tagName === 'H3') {
                        // h3 followed by a table → category section
                        const table = children[i + 1];
                        if (table && table.tagName === 'TABLE') {
                            const rows = table.querySelectorAll('tr');
                            const h3Text = el.textContent.toLowerCase().trim();

                            // Check if heading matches query or @ section filter
                            let headingMatch = false;
                            if (query) {
                                headingMatch = h3Text.includes(query);
                            }
                            if (!headingMatch && sectionFilter) {
                                headingMatch = h3Text.includes(sectionFilter);
                            }
                            let anyRowMatch = !query || headingMatch;
                            if (query && !headingMatch) {
                                anyRowMatch = Array.from(rows).some((tr) =>
                                    tr.textContent.toLowerCase().includes(query),
                                );
                            }
                            el.style.display = anyRowMatch ? '' : 'none';
                            table.style.display = anyRowMatch ? '' : 'none';
                            rows.forEach((tr) => {
                                tr.style.display =
                                    !query || headingMatch || tr.textContent.toLowerCase().includes(query)
                                        ? ''
                                        : 'none';
                            });
                            i++; // skip the table
                        }
                    } else if (el.classList && el.classList.contains('itg-manage-section')) {
                        // Manage section with its own heading inside
                        const items = el.querySelectorAll('.command-item');
                        const titleEl = el.querySelector('h3') || el.querySelector('.section-title');
                        let titleMatch = false;
                        if (titleEl && query) {
                            titleMatch = titleEl.textContent.toLowerCase().trim().includes(query);
                        }
                        if (!titleMatch && sectionFilter && titleEl) {
                            titleMatch = titleEl.textContent.toLowerCase().trim().includes(sectionFilter);
                        }
                        const hasMatch =
                            !query ||
                            titleMatch ||
                            Array.from(items).some((item) => item.textContent.toLowerCase().includes(query));
                        el.style.display = hasMatch ? '' : 'none';
                        items.forEach((item) => {
                            item.style.display =
                                !query || titleMatch || item.textContent.toLowerCase().includes(query) ? '' : 'none';
                        });
                    }
                }
            };
            modalSearchInput.addEventListener('input', () => {
                const val = modalSearchInput.value;
                const atIdx = val.lastIndexOf('@');
                if (atIdx >= 0) {
                    const afterAt = val.substring(atIdx + 1);
                    showAtDropdown(afterAt);
                } else {
                    hideAtDropdown();
                }
                applyModalSearchFilter();
                // Update scroll buttons after filter
                const sb = content.querySelector('.itg-scroll-buttons-float');
                if (sb) {
                    const sh = body.scrollHeight,
                        ch = body.clientHeight;
                    sb.classList.toggle('visible', sh - ch > 0);
                }
            });

            // Keyboard navigation for @ dropdown
            modalSearchInput.addEventListener('keydown', (e) => {
                if (!atDropdown || !atDropdown.classList.contains('visible')) return;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (atDropdownItems && atDropdownItems.length > 0) {
                        atHighlightIndex = Math.min(atHighlightIndex + 1, atDropdownItems.length - 1);
                        atDropdownItems.forEach((el, i) => el.classList.toggle('highlighted', i === atHighlightIndex));
                        if (atDropdownItems[atHighlightIndex]) {
                            atDropdownItems[atHighlightIndex].scrollIntoView({
                                block: 'nearest',
                            });
                        }
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (atDropdownItems && atDropdownItems.length > 0) {
                        atHighlightIndex = Math.max(atHighlightIndex - 1, 0);
                        atDropdownItems.forEach((el, i) => el.classList.toggle('highlighted', i === atHighlightIndex));
                        if (atDropdownItems[atHighlightIndex]) {
                            atDropdownItems[atHighlightIndex].scrollIntoView({
                                block: 'nearest',
                            });
                        }
                    }
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    if (atHighlightIndex >= 0 && atDropdownItems && atDropdownItems[atHighlightIndex]) {
                        e.preventDefault();
                        const name = atDropdownItems[atHighlightIndex].dataset.sectionName;
                        if (name) selectAtSection(name);
                    }
                } else if (e.key === 'Escape') {
                    hideAtDropdown();
                }
            });

            // Hide dropdown on blur
            modalSearchInput.addEventListener('blur', () => {
                setTimeout(hideAtDropdown, 200);
            });

            // Focus search input on modal open
            modalSearchInput.focus();
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                await this.registry.resetToDefaults();
                // REPLACED: We use smart rendering instead of toggle()
                this._refreshUI();
            });
        }
        if (chrome.i18n && chrome.i18n.getMessage) {
            modal
                .querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label]')
                .forEach((el) => {
                    if (el.dataset.i18n) {
                        el.textContent = chrome.i18n.getMessage(el.dataset.i18n) || el.textContent;
                    }
                    if (el.dataset.i18nTitle) {
                        el.title = chrome.i18n.getMessage(el.dataset.i18nTitle) || el.title;
                    }
                    if (el.dataset.i18nPlaceholder) {
                        el.placeholder = chrome.i18n.getMessage(el.dataset.i18nPlaceholder) || el.placeholder;
                    }
                    if (el.dataset.i18nAriaLabel) {
                        el.setAttribute(
                            'aria-label',
                            chrome.i18n.getMessage(el.dataset.i18nAriaLabel) || el.getAttribute('aria-label'),
                        );
                    }
                });
        }
    }

    // SAVE LISTENER CORRECTION
    _attachKeyListeners(el) {
        HintCommon.setupInlineEdit(el, {
            category: el.dataset.category,
            blurOnEnter: true,
            validate: (val) => {
                // WE PASS THE CATEGORY TO SEPARATE NAMESPACES
                return !this._isKeyInUse(val, 'mapping', el.dataset.desc, el.dataset.category);
            },
            onSave: async (newVal) => {
                const oldKey = el.dataset.key;
                const descKey = el.dataset.desc;
                if (newVal && newVal !== oldKey) {
                    await this.registry.updateShortcut(descKey, newVal);
                    el.dataset.key = newVal;
                }
            },
        });
        el.addEventListener('keydown', (e) => {
            if (HintCommon.preventInputSpace(e)) return;
        });
    }
    _setupFloatingScrollButtons(container) {
        const scrollUpBtn = container.querySelector('#itg-scroll-up');
        const scrollDownBtn = container.querySelector('#itg-scroll-down');
        const scrollButtons = container.querySelector('.itg-scroll-buttons-float');
        const modal = container.querySelector('#itg-help-body');
        if (!scrollUpBtn || !scrollDownBtn || !scrollButtons || !modal) return;
        const updateScrollButtons = () => {
            const scrollableHeight = modal.scrollHeight - modal.clientHeight;
            const scrollTop = modal.scrollTop;
            if (scrollableHeight <= 0) {
                scrollButtons.classList.remove('visible');
                return;
            }
            scrollButtons.classList.add('visible');
            scrollUpBtn.style.display = scrollTop < 5 ? 'none' : 'flex';
            scrollDownBtn.style.display = scrollTop >= scrollableHeight - 5 ? 'none' : 'flex';
        };
        scrollUpBtn.addEventListener('click', () => {
            modal.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        });
        scrollDownBtn.addEventListener('click', () => {
            modal.scrollTo({
                top: modal.scrollHeight,
                behavior: 'smooth',
            });
        });
        modal.addEventListener('scroll', updateScrollButtons);
        updateScrollButtons();
    }
    _setupPinListeners(container) {
        container.querySelectorAll('.itg-pin-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const sectionId = btn.dataset.section;
                const section = container.querySelector(`#${sectionId}`);
                if (section) {
                    this._toggleSectionPosition(section, btn, container);
                }
            });
        });
    }
    async _restorePinnedSections(container) {
        const data = await chrome.storage.sync.get(HintCommon.STORAGE_KEYS.PINNED_SECTIONS);
        const pinnedSections = data[HintCommon.STORAGE_KEYS.PINNED_SECTIONS] || {};
        const title = container.querySelector('h2');
        for (const [sectionId, isPinned] of Object.entries(pinnedSections)) {
            if (isPinned) {
                const section = container.querySelector(`#${sectionId}`);
                const btn = section?.querySelector('.itg-pin-btn');
                if (section && btn) {
                    section.dataset.pinned = 'false'; // Reset first
                    if (title && title.nextSibling) {
                        container.insertBefore(section, title.nextSibling);
                    } else {
                        container.prepend(section);
                    }
                    section.dataset.pinned = 'true';
                    btn.classList.add('pinned');
                    btn.innerHTML =
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="var(--text-color)" stroke-width="2" stroke-linecap="square"></path></svg>';
                }
            }
        }
    }
    async _toggleSectionPosition(section, btn, container) {
        const isPinned = section.dataset.pinned === 'true';
        const sectionId = section.id;
        if (!isPinned) {
            // Pin to top (below Title)
            const title = container.querySelector('h2');
            if (title && title.nextSibling) {
                container.insertBefore(section, title.nextSibling);
            } else {
                container.prepend(section);
            }
            section.dataset.pinned = 'true';
            btn.classList.add('pinned');
            btn.innerHTML =
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="var(--text-color)" stroke-width="2" stroke-linecap="square"></path></svg>';
            section.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        } else {
            // Unpin (move to bottom)
            container.append(section);
            section.dataset.pinned = 'false';
            btn.classList.remove('pinned');
            btn.innerHTML =
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-width="2" stroke-linecap="square"></path></svg>';
        }

        // Save pin state to storage
        const data = await chrome.storage.sync.get(HintCommon.STORAGE_KEYS.PINNED_SECTIONS);
        const pinnedSections = data[HintCommon.STORAGE_KEYS.PINNED_SECTIONS] || {};
        pinnedSections[sectionId] = section.dataset.pinned === 'true';
        await chrome.storage.sync.set({
            [HintCommon.STORAGE_KEYS.PINNED_SECTIONS]: pinnedSections,
        });
    }
    async _renderBlacklist(container, blacklistArray = null) {
        const list = container.querySelector('#itg-blacklist-list');
        if (!list) return;
        const h = HintCommon.DOM.create;
        const renderList = (blacklist) => {
            const existingMap = new Map();
            Array.from(list.children).forEach((el) => {
                const domain = el.dataset.domain;
                if (domain) existingMap.set(domain, el);
                el.dataset.updated = 'false';
            });
            blacklist.forEach((domain) => {
                let li = existingMap.get(domain);
                if (!li) {
                    const domainSpan = h(
                        'span',
                        {
                            className: 'itg-manage-item-desc itg-blacklist-domain',
                            contenteditable: 'true',
                            spellcheck: 'false',
                        },
                        domain,
                    );
                    li = h(
                        'li',
                        {
                            className: 'itg-manage-item blacklist-item',
                        },
                        [
                            domainSpan,
                            h(
                                'button',
                                {
                                    className: 'itg-manage-btn-delete',
                                    title: chrome.i18n.getMessage('removeBtnTitle') || 'Remove',
                                },
                                'x',
                            ),
                        ],
                    );
                    li.dataset.domain = domain;
                    domainSpan.addEventListener('blur', () => {
                        const currentDomain = li.dataset.domain;
                        const newDomain = domainSpan.textContent.trim().toLowerCase();
                        if (newDomain && newDomain !== currentDomain) {
                            li.dataset.domain = newDomain;
                            chrome.runtime.sendMessage({
                                action: 'editLinkPreviewBlacklist',
                                oldDomain: currentDomain,
                                newDomain: newDomain,
                            });
                        } else {
                            domainSpan.textContent = currentDomain;
                        }
                    });
                    domainSpan.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            domainSpan.blur();
                        }
                    });
                    const delBtn = li.querySelector('.itg-manage-btn-delete');
                    delBtn.addEventListener('click', () => {
                        chrome.runtime.sendMessage({
                            action: 'removeLinkPreviewBlacklist',
                            domain: li.dataset.domain,
                        });
                    });
                    list.appendChild(li);
                } else {
                    li.dataset.updated = 'true';
                }
            });
            Array.from(list.children).forEach((el) => {
                if (el.dataset.updated === 'false') el.remove();
                else delete el.dataset.updated;
            });
        };
        if (blacklistArray) {
            renderList(blacklistArray);
        } else {
            chrome.storage.sync.get(['linkPreviewBlacklist'], (res) => {
                renderList(res.linkPreviewBlacklist || []);
            });
        }
    }
    async _renderCustomSites(container) {
        //
        const list = container.querySelector('#itg-custom-sites-list');
        if (!list) return;
        const h = HintCommon.DOM.create;
        const userCmds = await HintCommon.Commands.getAll();
        const existingMap = new Map();
        Array.from(list.children).forEach((el) => {
            const key = el.querySelector('.itg-manage-item-key')?.dataset.oldkey;
            if (key) existingMap.set(key, el);
            el.dataset.updated = 'false';
        });
        userCmds.forEach((cmd, index) => {
            let li = existingMap.get(cmd.keys);
            const fullUrl = cmd.url || '';
            const fullDesc = cmd.description || '';
            const fullTitle = fullDesc ? `${fullUrl}\n${fullDesc}` : fullUrl;
            if (!li) {
                li = h(
                    'li',
                    {
                        className: 'itg-manage-item',
                    },
                    [
                        h('span', {
                            className: 'itg-manage-item-key',
                            contenteditable: 'true',
                            'data-prop': 'keys',
                            'data-category': 'custom-site',
                            title: chrome.i18n.getMessage('placeholderKey') || 'Key',
                        }),
                        h('span', {
                            className: 'itg-manage-item-desc',
                            contenteditable: 'true',
                            'data-prop': 'url',
                        }),
                        h('span', {
                            className: 'itg-manage-item-desc',
                            contenteditable: 'true',
                            'data-prop': 'description',
                            spellcheck: 'true',
                            title: chrome.i18n.getMessage('placeholderDesc') || 'Description',
                        }),
                        h(
                            'button',
                            {
                                className: 'itg-manage-btn-delete',
                            },
                            'x',
                        ),
                    ],
                );
                this._attachCustomSiteItemListeners(li, container);
                list.appendChild(li);
            }
            li.dataset.updated = 'true';
            const keySpan = li.querySelector('[data-prop="keys"]');
            if (keySpan) {
                keySpan.dataset.index = index;
                keySpan.dataset.oldkey = cmd.keys;
                if (keySpan.innerText !== cmd.keys && document.activeElement !== keySpan) {
                    keySpan.innerText = cmd.keys;
                }
            }
            const urlSpan = li.querySelector('[data-prop="url"]');
            if (urlSpan) {
                urlSpan.dataset.index = index;
                urlSpan.title = fullTitle;
                if (urlSpan.innerText !== fullUrl && document.activeElement !== urlSpan) {
                    urlSpan.innerText = fullUrl;
                }
            }
            const descSpan = li.querySelector('[data-prop="description"]');
            if (descSpan) {
                descSpan.dataset.index = index;
                if (descSpan.innerText !== fullDesc && document.activeElement !== descSpan) {
                    descSpan.innerText = fullDesc;
                }
            }
            const delBtn = li.querySelector('.itg-manage-btn-delete');
            if (delBtn) delBtn.dataset.key = cmd.keys;
        });
        Array.from(list.children).forEach((el) => {
            if (el.dataset.updated === 'false') el.remove();
            else delete el.dataset.updated;
        });
    }
    _attachCustomSiteItemListeners(li, container) {
        li.querySelectorAll('[contenteditable="true"]').forEach((el) => {
            const prop = el.dataset.prop;
            HintCommon.setupInlineEdit(el, {
                category: prop === 'keys' ? 'custom-site' : null,
                blurOnEnter: prop !== 'description',
                // Description allows enter
                required: prop !== 'description',
                // Description is optional
                validate: (val) => {
                    if (prop === 'keys') {
                        // FIX: Real-time collision validation
                        return !this._isKeyInUse(val, 'mapping', el.dataset.oldkey);
                    }
                    return true; // URL and Desc don't have complex collision validation
                },
                onSave: async (newVal) => {
                    const idx = parseInt(el.dataset.index);
                    const cmds = await HintCommon.Commands.getAll();
                    if (cmds[idx]) {
                        cmds[idx][prop] = newVal;
                        await HintCommon.Commands.saveAll(cmds);
                        await this.registry.loadUserCommands();
                        this._renderCustomSites(container);
                    }
                },
            });
            if (prop === 'keys') {
                el.addEventListener('keydown', HintCommon.preventInputSpace);
            }
        });
        const delBtn = li.querySelector('.itg-manage-btn-delete');
        if (delBtn) {
            delBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await HintCommon.Commands.remove(delBtn.dataset.key);
                await this.registry.loadUserCommands();
                this._renderCustomSites(container);
            });
        }
    }
    async _renderSnippets(container) {
        const list = container.querySelector('#itg-snippets-list');
        if (!list) return;
        const h = HintCommon.DOM.create;
        await this.snippetManager.load();
        const snippets = this.snippetManager.snippets;
        const existingMap = new Map();
        Array.from(list.children).forEach((el) => {
            const trigger = el.dataset.trigger;
            if (trigger) existingMap.set(trigger, el);
            el.dataset.updated = 'false';
        });
        const copyIconSVG = OMNI_COPY_SVG;
        Object.entries(snippets).forEach(([trigger, data]) => {
            const expansion = typeof data === 'string' ? data : data.expansion;
            const variables = typeof data === 'object' && Array.isArray(data.variables) ? data.variables : [];
            let li = existingMap.get(trigger);
            let needFullRebuild = false;
            if (li) {
                const varContainer = li.querySelector('.snippet-variables-list');
                if (varContainer && varContainer.children.length !== variables.length) {
                    needFullRebuild = true;
                }
            }
            if (!li || needFullRebuild) {
                if (li) li.remove();
                li = h('li', {
                    className: 'snippet-item-container',
                    'data-trigger': trigger,
                });
                const expSpanEl = h('span', {
                    className: 'itg-manage-item-desc',
                    contenteditable: 'true',
                    'data-prop': 'expansion',
                    spellcheck: 'true',
                    'data-category': 'snippet',
                });
                const expFormatBtn = h('button', {
                    className: 'itg-hint-format-btn itg-snippet-item-format-btn',
                    type: 'button',
                    title: chrome.i18n.getMessage('formatText') || 'Format text',
                });
                expFormatBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M840 192h-56v-72c0-13.3-10.7-24-24-24H168c-13.3 0-24 10.7-24 24v272c0 13.3 10.7 24 24 24h592c13.3 0 24-10.7 24-24V256h32v200H465c-22.1 0-40 17.9-40 40v136h-44c-4.4 0-8 3.6-8 8v228c0 .6.1 1.3.2 1.9-.1 2-.2 4.1-.2 6.1 0 46.4 37.6 84 84 84s84-37.6 84-84c0-2.1-.1-4.1-.2-6.1.1-.6.2-1.2.2-1.9V640c0-4.4-3.6-8-8-8h-44V520h351c22.1 0 40-17.9 40-40V232c0-22.1-17.9-40-40-40M720 352H208V160h512zM477 876c0 11-9 20-20 20s-20-9-20-20V696h40z" fill="currentColor"/></svg>`;
                const expWrapper = h('div', {
                    className: 'itg-hint-snippet-expansion-wrapper itg-snippet-item-exp-wrapper',
                    style: 'flex: 1; min-width: 0;',
                });
                expWrapper.appendChild(expSpanEl);
                expWrapper.appendChild(expFormatBtn);
                const mainRow = h(
                    'div',
                    {
                        className: 'snippet-main-row',
                    },
                    [
                        h('span', {
                            className: 'itg-manage-item-key',
                            contenteditable: 'true',
                            'data-prop': 'trigger',
                            'data-category': 'snippet',
                        }),
                        expWrapper,
                        h(
                            'button',
                            {
                                className: 'itg-manage-btn-delete',
                                title: chrome.i18n.getMessage('deleteSnippetTooltip') || 'Delete snippet',
                            },
                            'x',
                        ),
                    ],
                );
                li.appendChild(mainRow);

                // Inline editor container for this item
                const itemInlineEditor = h('div', {
                    className: 'itg-inline-editor-section itg-snippet-item-inline-editor',
                });
                li.appendChild(itemInlineEditor);

                // Format button toggle logic for saved items
                expFormatBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const delBtn = mainRow.querySelector('.itg-manage-btn-delete');
                    const isExpanded = itemInlineEditor.classList.contains('itg-inline-editor-expanded');
                    if (isExpanded) {
                        itemInlineEditor.classList.remove('itg-inline-editor-expanded');
                        expFormatBtn.classList.remove('itg-format-btn-active');
                        if (delBtn) delBtn.title = chrome.i18n.getMessage('deleteSnippetTooltip') || 'Delete snippet';
                    } else {
                        HintCommon.RichTextFormatter.showInline(itemInlineEditor, expSpanEl, async (formattedHtml) => {
                            expSpanEl.dataset.html = formattedHtml;
                            expSpanEl.innerText = HintCommon.stripHtml(formattedHtml);
                            expSpanEl.dataset.itgUpdating = 'true';
                            expSpanEl.dispatchEvent(new Event('blur'));
                            itemInlineEditor.classList.remove('itg-inline-editor-expanded');
                            expFormatBtn.classList.remove('itg-format-btn-active');
                            if (delBtn)
                                delBtn.title = chrome.i18n.getMessage('deleteSnippetTooltip') || 'Delete snippet';
                        });
                        itemInlineEditor.classList.add('itg-inline-editor-expanded');
                        expFormatBtn.classList.add('itg-format-btn-active');
                        if (delBtn)
                            delBtn.title =
                                chrome.i18n.getMessage('closeFormatNoApplyTooltip') ||
                                'Close text formatting without applying changes';
                    }
                });
                const varsContainer = h('div', {
                    className: 'snippet-variables-list',
                });
                variables.forEach(() => {
                    const row = h(
                        'div',
                        {
                            className: 'variable-row',
                        },
                        [
                            h('input', {
                                className: 'var-id',
                                maxlength: '3',
                                title: chrome.i18n.getMessage('varIdLabel') || 'ID',
                                placeholder: chrome.i18n.getMessage('varIdLabel') || 'ID',
                            }),
                            h('input', {
                                className: 'var-name',
                                maxlength: '50',
                                title: chrome.i18n.getMessage('varWordLabel') || 'Word',
                                placeholder: chrome.i18n.getMessage('varWordLabel') || 'Word',
                            }),
                            h('input', {
                                className: 'var-value',
                                maxlength: '1000',
                                title: chrome.i18n.getMessage('varDefaultLabel') || 'Default',
                                placeholder: chrome.i18n.getMessage('placeholderDefaultValue') || 'Default',
                            }),
                        ],
                    );
                    varsContainer.appendChild(row);
                });
                li.appendChild(varsContainer);
                const footer = h('div', {
                    className: 'snippet-usage-footer',
                });
                const usageText = h('span', {
                    className: 'usage-text',
                });
                const copyBtn = h('button', {
                    className: 'snippet-copy-usage-btn',
                });
                copyBtn.innerHTML = copyIconSVG;
                footer.appendChild(usageText);
                footer.appendChild(copyBtn);

                // Add Variable Count Input
                const countInput = h('input', {
                    type: 'number',
                    className: 'itg-manage-input',
                    min: '0',
                    max: '50',
                    value: variables.length.toString(),
                    title: chrome.i18n.getMessage('variableCountTitle') || 'Number of variables',
                    style: 'width: 50px; text-align: center; margin-left: 8px;',
                });
                countInput.addEventListener('change', () => {
                    let newCount = parseInt(countInput.value) || 0;
                    if (newCount < 0) newCount = 0;
                    if (newCount > 50) newCount = 50;
                    countInput.value = newCount;
                    const currentVars = [];
                    varsContainer.querySelectorAll('.variable-row').forEach((row) => {
                        currentVars.push({
                            id: row.querySelector('.var-id').value,
                            word: row.querySelector('.var-name').value,
                            defaultValue: row.querySelector('.var-value').value,
                        });
                    });
                    if (newCount > currentVars.length) {
                        for (let i = currentVars.length; i < newCount; i++) {
                            let nextId = '$' + (i + 1);
                            currentVars.push({
                                id: nextId,
                                word: '',
                                defaultValue: '',
                            });
                        }
                    } else if (newCount < currentVars.length) {
                        currentVars.splice(newCount);
                    }

                    // Re-render variables list
                    varsContainer.innerHTML = '';
                    currentVars.forEach((v) => {
                        const row = h(
                            'div',
                            {
                                className: 'variable-row',
                            },
                            [
                                h('input', {
                                    className: 'var-id',
                                    maxlength: '3',
                                    title: chrome.i18n.getMessage('varIdLabel') || 'ID',
                                    placeholder: chrome.i18n.getMessage('varIdLabel') || 'ID',
                                    value: v.id,
                                }),
                                h('input', {
                                    className: 'var-name',
                                    maxlength: '50',
                                    title: chrome.i18n.getMessage('varWordLabel') || 'Word',
                                    placeholder: chrome.i18n.getMessage('varWordLabel') || 'Word',
                                    value: v.word,
                                }),
                                h('input', {
                                    className: 'var-value',
                                    maxlength: '1000',
                                    title: chrome.i18n.getMessage('varDefaultLabel') || 'Default',
                                    placeholder: chrome.i18n.getMessage('varDefaultLabel') || 'Default',
                                    value: v.defaultValue || '',
                                }),
                            ],
                        );
                        row.querySelector('.var-id').addEventListener('keydown', HintCommon.preventInputSpace);
                        varsContainer.appendChild(row);
                    });

                    // Trigger save
                    varsContainer.dispatchEvent(
                        new Event('change', {
                            bubbles: true,
                        }),
                    );

                    // Update usage text
                    const trig = mainRow.querySelector('[data-prop="trigger"]').innerText.trim();
                    const usageStr = HintCommon.generateSnippetUsageText(trig, currentVars);
                    if (usageText) usageText.innerText = usageStr;
                    if (copyBtn) copyBtn.dataset.text = usageStr;
                });
                footer.appendChild(countInput);
                li.appendChild(footer);
                this._attachSnippetItemListeners(li, container);
                list.appendChild(li);
            }
            li.dataset.updated = 'true';
            li.dataset.trigger = trigger;
            const trigSpan = li.querySelector('[data-prop="trigger"]');
            if (trigSpan) {
                trigSpan.dataset.oldtrig = trigger;
                if (trigSpan.innerText !== trigger && document.activeElement !== trigSpan) {
                    trigSpan.innerText = trigger;
                }
            }
            const expSpan = li.querySelector('[data-prop="expansion"]');
            if (expSpan && document.activeElement !== expSpan) {
                const currentHtml = expSpan.dataset.html || '';
                if (currentHtml !== expansion) {
                    expSpan.dataset.html = expansion;
                    expSpan.innerText = HintCommon.stripHtml(expansion);
                }
            }
            const varRows = li.querySelectorAll('.variable-row');
            variables.forEach((v, idx) => {
                const row = varRows[idx];
                if (row) {
                    const setVal = (sel, val) => {
                        const inp = row.querySelector(sel);
                        if (inp && inp.value !== val && document.activeElement !== inp) inp.value = val;
                    };
                    setVal('.var-id', v.id);
                    setVal('.var-name', v.word);
                    setVal('.var-value', v.defaultValue || '');
                }
            });
            const usageText = li.querySelector('.usage-text');
            const copyBtn = li.querySelector('.snippet-copy-usage-btn');
            const delBtn = li.querySelector('.itg-manage-btn-delete');
            const usageStr = HintCommon.generateSnippetUsageText(trigger, variables);
            if (usageText) usageText.innerText = usageStr;
            if (copyBtn) copyBtn.dataset.text = usageStr;
            if (delBtn) delBtn.dataset.trigger = trigger;
        });
        Array.from(list.children).forEach((el) => {
            if (el.dataset.updated === 'false') el.remove();
            else delete el.dataset.updated;
        });
    }
    _attachSnippetItemListeners(li, container) {
        const mainRow = li.querySelector('.snippet-main-row');
        const varsContainer = li.querySelector('.snippet-variables-list');
        const usageText = li.querySelector('.usage-text');
        const copyBtn = li.querySelector('.snippet-copy-usage-btn');
        const updateUsage = () => {
            const trig = mainRow.querySelector('[data-prop="trigger"]').innerText.trim();
            const vars = [];
            varsContainer.querySelectorAll('.variable-row').forEach((row) => {
                vars.push({
                    id: row.querySelector('.var-id').value.trim(),
                    defaultValue: row.querySelector('.var-value').value.trim(),
                });
            });
            const text = HintCommon.generateSnippetUsageText(trig, vars);
            if (usageText) usageText.innerText = text;
            if (copyBtn) copyBtn.dataset.text = text;
        };

        // Copy Button Logic
        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const text = copyBtn.dataset.text;
                navigator.clipboard.writeText(text).then(() => {
                    const original = copyBtn.innerHTML;
                    copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--interactive-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    setTimeout(() => (copyBtn.innerHTML = original), 1500);
                });
            });
        }

        // Delete Button Logic (or close format section if open)
        const delBtn = li.querySelector('.itg-manage-btn-delete');
        if (delBtn) {
            delBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                // Check if the format editor is currently open
                const itemInlineEditor = li.querySelector('.itg-inline-editor-section');
                const expFormatBtn = li.querySelector('.itg-snippet-item-format-btn');
                if (itemInlineEditor && itemInlineEditor.classList.contains('itg-inline-editor-expanded')) {
                    // Close the format section without applying
                    itemInlineEditor.classList.remove('itg-inline-editor-expanded');
                    if (expFormatBtn) expFormatBtn.classList.remove('itg-format-btn-active');
                    delBtn.title = chrome.i18n.getMessage('deleteSnippetTooltip') || 'Delete snippet';
                    return;
                }
                // Otherwise, delete the snippet
                await HintCommon.Snippets.remove(delBtn.dataset.trigger);
                this._renderSnippets(container);
            });
        }

        // Inline Edit for Trigger & Expansion
        mainRow.querySelectorAll('[contenteditable]').forEach((el) => {
            const prop = el.dataset.prop;
            HintCommon.setupInlineEdit(el, {
                category: prop === 'trigger' ? 'snippet' : null,
                useHtml: prop === 'expansion',
                blurOnEnter: prop === 'trigger',
                validate: (val) => {
                    if (prop === 'trigger') {
                        return val && !this._isKeyInUse(val, 'snippet', el.dataset.oldtrig);
                    }
                    if (prop === 'expansion') {
                        // Check variables exist
                        const varNames = Array.from(varsContainer.querySelectorAll('.var-name')).map((i) =>
                            i.value.trim(),
                        );
                        return !varNames.some((name) => !val.includes(name));
                    }
                    return true;
                },
                onSave: async (newVal) => {
                    const oldTrig = li.dataset.trigger; // Correctly get the current trigger from the li
                    const expEl = mainRow.querySelector('[data-prop="expansion"]');
                    const currentExp = prop === 'expansion' ? newVal : expEl.dataset.html || expEl.innerText.trim();
                    const currentVars = Array.from(varsContainer.querySelectorAll('.variable-row')).map((r) => ({
                        id: r.querySelector('.var-id').value.trim(),
                        word: r.querySelector('.var-name').value.trim(),
                        defaultValue: r.querySelector('.var-value').value.trim(),
                    }));
                    if (prop === 'trigger') {
                        await HintCommon.Snippets.rename(oldTrig, newVal, currentExp, currentVars);
                        li.dataset.trigger = newVal;
                        // Update dataset.oldtrig of all children editables
                        mainRow
                            .querySelectorAll('[contenteditable]')
                            .forEach((child) => (child.dataset.oldtrig = newVal));
                    } else {
                        await HintCommon.Snippets.add(oldTrig, newVal, currentVars);
                        // If it was expansion, sync the dataset.html for next read
                        if (prop === 'expansion') {
                            expEl.dataset.html = newVal;
                        }
                    }
                },
                onAfter: () => updateUsage(),
            });

            // Prevent spaces in trigger
            if (prop === 'trigger') {
                el.addEventListener('keydown', HintCommon.preventInputSpace);
            }
        });

        // Variables Inputs Change Listener
        varsContainer.addEventListener('change', async (e) => {
            if (e.target.tagName === 'INPUT' || e.target === varsContainer) {
                const newVars = [];
                let error = false;
                const expEl = mainRow.querySelector('[data-prop="expansion"]');
                const currentExp = expEl.dataset.html || expEl.innerText;
                varsContainer.querySelectorAll('.variable-row').forEach((r) => {
                    const id = r.querySelector('.var-id').value.trim();
                    const word = r.querySelector('.var-name').value.trim();
                    const def = r.querySelector('.var-value').value.trim();
                    if (!id || !word || !def) error = true;
                    if (word && !HintCommon.validateSnippetVar(word, currentExp)) {
                        r.querySelector('.var-name').classList.add('itg-input-error');
                        error = true;
                    } else {
                        r.querySelector('.var-name').classList.remove('itg-input-error');
                    }
                    newVars.push({
                        id,
                        word,
                        defaultValue: def,
                    });
                });
                if (!error) {
                    const currentTrig = mainRow.querySelector('[data-prop="trigger"]').innerText.trim();
                    await HintCommon.Snippets.add(currentTrig, currentExp, newVars);
                    updateUsage();
                }
            }
        });
        varsContainer.querySelectorAll('.var-id').forEach((inp) => {
            inp.addEventListener('keydown', HintCommon.preventInputSpace);
        });
    }
    _setupManagementListeners(container) {
        //
        // Add Blacklist Logic
        const addBlacklistBtn = container.querySelector('#itg-add-blacklist-btn');
        if (addBlacklistBtn) {
            const domainInput = container.querySelector('#itg-new-blacklist-domain');
            const tryAddDomain = () => {
                const domain = domainInput.value.trim().toLowerCase();
                if (domain) {
                    chrome.runtime.sendMessage({
                        action: 'addLinkPreviewBlacklist',
                        domain,
                    });
                    domainInput.value = '';
                }
            };
            addBlacklistBtn.addEventListener('click', (e) => {
                e.preventDefault();
                tryAddDomain();
            });
            domainInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    tryAddDomain();
                }
            });
        }
        const addSiteBtn = container.querySelector('#itg-add-site-btn');
        if (addSiteBtn) {
            const keyInput = container.querySelector('#itg-new-site-key');
            keyInput.addEventListener('keydown', HintCommon.preventInputSpace);
            const tryAddSite = async () => {
                const keys = keyInput.value.trim();
                const url = container.querySelector('#itg-new-site-url').value.trim();
                const desc = container.querySelector('#itg-new-site-desc').value.trim();
                const cmds = await HintCommon.Commands.getAll();
                const context = {
                    customCommands: cmds,
                };
                if (keys && url && desc && !HintCommon.isKeyInUse(keys, 'mapping', null, context)) {
                    await HintCommon.Commands.add(keys, url, desc);
                    keyInput.value = '';
                    container.querySelector('#itg-new-site-url').value = '';
                    container.querySelector('#itg-new-site-desc').value = '';
                    keyInput.classList.remove('itg-input-error');
                    this._renderCustomSites(container);
                } else {
                    keyInput.classList.add('itg-input-error');
                    keyInput.focus();
                }
            };
            addSiteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                tryAddSite();
            });
            keyInput.addEventListener('input', () => {
                const val = keyInput.value.trim();
                if (!val) keyInput.classList.remove('itg-input-error');
                else if (this._isKeyInUse(val)) keyInput.classList.add('itg-input-error');
                else keyInput.classList.remove('itg-input-error');
            });
            [
                keyInput,
                container.querySelector('#itg-new-site-url'),
                container.querySelector('#itg-new-site-desc'),
            ].forEach((inp) => {
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        tryAddSite();
                    }
                });
            });
        }

        // Add Snippet Logic
        const addSnippetBtn = container.querySelector('#itg-add-snippet-btn');
        if (addSnippetBtn) {
            const expansionInput = container.querySelector('#itg-new-snippet-expansion');
            const triggerInput = container.querySelector('#itg-new-snippet-trigger');
            const varCountInput = container.querySelector('#itg-new-snippet-var-count');
            const varsContainer = container.querySelector('#itg-new-snippet-variables-container');
            const formErrorEl = container.querySelector('#itg-snippet-form-error');
            const inlineEditor = container.querySelector('#itg-inline-format-editor');
            const formatBtn = container.querySelector('#itg-snippet-format-btn');

            // Set format button icon
            if (formatBtn) {
                formatBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M840 192h-56v-72c0-13.3-10.7-24-24-24H168c-13.3 0-24 10.7-24 24v272c0 13.3 10.7 24 24 24h592c13.3 0 24-10.7 24-24V256h32v200H465c-22.1 0-40 17.9-40 40v136h-44c-4.4 0-8 3.6-8 8v228c0 .6.1 1.3.2 1.9-.1 2-.2 4.1-.2 6.1 0 46.4 37.6 84 84 84s84-37.6 84-84c0-2.1-.1-4.1-.2-6.1.1-.6.2-1.2.2-1.9V640c0-4.4-3.6-8-8-8h-44V520h351c22.1 0 40-17.9 40-40V232c0-22.1-17.9-40-40-40M720 352H208V160h512zM477 876c0 11-9 20-20 20s-20-9-20-20V696h40z" fill="currentColor"/></svg>`;

                // Toggle inline editor on click
                formatBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isExpanded = inlineEditor.classList.contains('itg-inline-editor-expanded');
                    if (isExpanded) {
                        inlineEditor.classList.remove('itg-inline-editor-expanded');
                        formatBtn.classList.remove('itg-format-btn-active');
                    } else {
                        HintCommon.RichTextFormatter.showInline(inlineEditor, expansionInput, (formattedHtml) => {
                            // Apply content back to expansion input
                            expansionInput.dataset.html = formattedHtml;
                            expansionInput.innerText = HintCommon.stripHtml(formattedHtml);
                            expansionInput.dataset.itgUpdating = 'true';
                            expansionInput.dispatchEvent(
                                new Event('input', {
                                    bubbles: true,
                                }),
                            );
                            inlineEditor.classList.remove('itg-inline-editor-expanded');
                            formatBtn.classList.remove('itg-format-btn-active');
                        });
                        inlineEditor.classList.add('itg-inline-editor-expanded');
                        formatBtn.classList.add('itg-format-btn-active');
                    }
                });
            }
            const updatePlaceholder = () => {
                const isPlaceholder = expansionInput.innerHTML === expansionInput.dataset.placeholder;
                expansionInput.style.opacity = isPlaceholder ? '0.5' : '1';
            };
            expansionInput.addEventListener('focus', () => {
                if (expansionInput.innerHTML === expansionInput.dataset.placeholder) {
                    expansionInput.innerHTML = '';
                    updatePlaceholder();
                }
            });
            expansionInput.addEventListener('blur', () => {
                if (expansionInput.innerHTML === '') {
                    expansionInput.innerHTML = expansionInput.dataset.placeholder;
                    updatePlaceholder();
                }
            });
            if (expansionInput.innerHTML === '') expansionInput.innerHTML = expansionInput.dataset.placeholder;
            updatePlaceholder();

            // FORCE PLAIN TEXT PASTE in Expansion
            expansionInput.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text');
                document.execCommand('insertText', false, text);
            });
            const h = HintCommon.DOM.create;
            const updateVariablesUI = () => {
                const count = parseInt(varCountInput.value) || 0;

                // SAVE CURRENT VALUES before wiping
                const currentRows = Array.from(varsContainer.children);
                const savedData = currentRows.map((row) => ({
                    id: row.querySelector('.itg-var-id').value,
                    word: row.querySelector('.itg-var-word').value,
                    def: row.querySelector('.itg-var-default').value,
                }));
                varsContainer.innerHTML = '';
                const validateRow = (row) => {
                    const id = row.querySelector('.itg-var-id').value.trim();
                    const word = row.querySelector('.itg-var-word').value.trim();
                    const def = row.querySelector('.itg-var-default').value.trim();
                    const isPlaceholder = expansionInput.innerHTML === expansionInput.dataset.placeholder;
                    const expText = isPlaceholder ? '' : expansionInput.innerText;
                    const validation = HintCommon.validateSnippetVariableRow(id, word, def, expText);
                    const setErr = (sel, isErr) => {
                        const el = row.querySelector(sel);
                        if (isErr) el.classList.add('itg-input-error');
                        else el.classList.remove('itg-input-error');
                    };
                    setErr('.itg-var-id', validation.errors.id);
                    setErr('.itg-var-word', validation.errors.word);
                    setErr('.itg-var-default', validation.errors.def);
                };
                for (let i = 0; i < count; i++) {
                    // Restore or create default
                    const data = savedData[i] || {
                        id: `$${i + 1}`,
                        word: '',
                        def: '',
                    };
                    const row = h(
                        'div',
                        {
                            style: 'display: flex; gap: 5px; align-items: center;',
                        },
                        [
                            h('input', {
                                type: 'text',
                                className: 'itg-manage-input itg-var-id',
                                value: data.id,
                                maxlength: '3',
                                style: 'width: 50px;',
                                placeholder: `$${i + 1}`,
                            }),
                            h('input', {
                                type: 'text',
                                className: 'itg-manage-input itg-var-word',
                                value: data.word,
                                placeholder: chrome.i18n.getMessage('placeholderVarWord') || 'Word in text',
                                maxlength: '50',
                                style: 'flex: 1;',
                            }),
                            h('input', {
                                type: 'text',
                                className: 'itg-manage-input itg-var-default',
                                value: data.def,
                                placeholder: chrome.i18n.getMessage('placeholderVarDefault') || 'Default value',
                                maxlength: '1000',
                                style: 'flex: 1;',
                            }),
                        ],
                    );
                    varsContainer.appendChild(row);
                    const idInp = row.querySelector('.itg-var-id');
                    if (idInp) idInp.addEventListener('keydown', HintCommon.preventInputSpace);
                    row.querySelectorAll('input').forEach((inp) => {
                        inp.addEventListener('input', () => validateRow(row));
                        inp.addEventListener('blur', () => validateRow(row));
                    });

                    // Re-validate if it has content (restored)
                    if (data.word) validateRow(row);
                }
            };
            const clampCount = () => {
                let val = parseInt(varCountInput.value);
                if (val > 50) varCountInput.value = 50;
                if (val < 0 || isNaN(val)) varCountInput.value = 0;
                updateVariablesUI();
            };
            varCountInput.addEventListener('input', clampCount);
            varCountInput.addEventListener('paste', (e) => {
                setTimeout(clampCount, 0);
            });
            expansionInput.addEventListener('input', () => {
                varsContainer.querySelectorAll('div').forEach((row) => {
                    const wordInput = row.querySelector('.itg-var-word');
                    if (wordInput) wordInput.dispatchEvent(new Event('input', { bubbles: true }));
                });
            });
            addSnippetBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const trigger = triggerInput.value.trim();
                const isPlaceholder =
                    expansionInput.classList.contains('itg-is-placeholder') ||
                    expansionInput.innerText === expansionInput.dataset.placeholder;

                // FIX: Use innerText to grab clean content without styling spans
                const expansion = isPlaceholder ? '' : expansionInput.innerText;
                triggerInput.classList.remove('itg-input-error');
                let finalErrorMessage = null;
                let hasError = false;
                if (!trigger || !expansion) {
                    finalErrorMessage =
                        chrome.i18n.getMessage('errorEmptyFields') || 'Please fill trigger and expansion';
                    hasError = true;
                    if (!trigger) triggerInput.classList.add('itg-input-error');
                }
                if (!hasError) {
                    const snips = await HintCommon.Snippets.getAll();
                    const context = {
                        snippets: snips,
                    };
                    if (HintCommon.isKeyInUse(trigger, 'snippet', null, context)) {
                        hasError = true;
                        triggerInput.classList.add('itg-input-error');
                        finalErrorMessage = chrome.i18n.getMessage('errorTriggerTaken') || 'Trigger already in use';
                    } else {
                        const variables = [];
                        const rows = varsContainer.querySelectorAll('div');
                        let varsError = false;
                        rows.forEach((row) => {
                            const idInp = row.querySelector('.itg-var-id');
                            const wordInp = row.querySelector('.itg-var-word');
                            const defInp = row.querySelector('.itg-var-default');
                            const id = idInp.value.trim();
                            const word = wordInp.value.trim();
                            const def = defInp.value.trim();
                            const validation = HintCommon.validateSnippetVariableRow(id, word, def, expansion);
                            const setErr = (input, errorKey) => {
                                if (errorKey) {
                                    input.style.borderColor = 'var(--error-color, red)';
                                    input.classList.add('itg-input-error');
                                    input.title = chrome.i18n.getMessage(errorKey);
                                    if (!finalErrorMessage) {
                                        finalErrorMessage = chrome.i18n.getMessage(errorKey);
                                    }
                                } else {
                                    input.style.borderColor = '';
                                    input.classList.remove('itg-input-error');
                                    input.title = '';
                                }
                            };
                            if (!validation.isValid) {
                                varsError = true;
                                setErr(idInp, validation.errors.id);
                                setErr(wordInp, validation.errors.word);
                                setErr(defInp, validation.errors.def);
                            } else {
                                setErr(idInp, null);
                                setErr(wordInp, null);
                                setErr(defInp, null);
                            }
                            if (id)
                                variables.push({
                                    id,
                                    word,
                                    defaultValue: def,
                                });
                        });
                        if (varsError) {
                            hasError = true;
                            if (!finalErrorMessage) {
                                finalErrorMessage =
                                    chrome.i18n.getMessage('errorSnippetIncomplete') ||
                                    'Please check the highlighted fields';
                            }
                        }
                        if (!hasError) {
                            await HintCommon.Snippets.add(trigger, expansion, variables);
                            triggerInput.value = '';
                            expansionInput.innerHTML = expansionInput.dataset.placeholder;
                            varCountInput.value = 0;
                            varCountInput.dispatchEvent(new Event('input', { bubbles: true }));
                            this._renderSnippets(container);
                        }
                    }
                }
                if (hasError) {
                    formErrorEl.textContent = finalErrorMessage;
                    formErrorEl.style.display = 'block';
                    if (!trigger && document.activeElement !== triggerInput) triggerInput.focus();
                } else {
                    formErrorEl.style.display = 'none';
                    formErrorEl.textContent = '';
                }
            });
            const trigInput = container.querySelector('#itg-new-snippet-trigger');
            trigInput.addEventListener('input', () => {
                const val = trigInput.value.trim();
                if (!val) {
                    trigInput.classList.remove('itg-input-error');
                } else if (this._isKeyInUse(val, 'snippet')) {
                    trigInput.classList.add('itg-input-error');
                } else {
                    trigInput.classList.remove('itg-input-error');
                }
            });
            trigInput.addEventListener('keydown', (e) => {
                if (HintCommon.preventInputSpace(e)) return;
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addSnippetBtn.click();
                }
            });
        }
    }
    _checkOmnibarCollision(key, excludeDescId) {
        const builtIn = HintCommon.BUILT_IN_COMMANDS.categoryOmnibarPrefixes;
        const rawOverrides = this.registry.getRawShortcuts();
        for (const [defKey, descKey] of Object.entries(builtIn)) {
            // If it is the same command we are editing, skip
            if (descKey === excludeDescId) continue;

            // Current key for this command (custom or default)
            const currentKey = rawOverrides[descKey] || defKey;
            if (currentKey === key) return true;
        }
        return false;
    }

    // Updated main validation with category context
    _isKeyInUse(key, type, excludeId, category) {
        const context = {
            checkMapping: (k, ex) => {
                // If it is Omnibar, isolated validation
                if (category === 'omnibar') {
                    return this._checkOmnibarCollision(k, excludeId);
                }

                // If it is Global
                if (k === ex) return false;
                // this.registry.mappings ONLY contains global shortcuts, not prefixes
                if (this.registry.mappings[k]) return true;
                return false;
            },
            snippets: this.snippetManager.snippets,
        };

        // Use the correct type to enable snippet validation in HintCommon
        return HintCommon.isKeyInUse(key, type || 'mapping', excludeId, context);
    }
    _refreshUI() {
        const mappings = this.registry.getMappings();
        const rawOverrides = this.registry.getRawShortcuts();
        const builtIn = HintCommon.BUILT_IN_COMMANDS;
        const container = this.shadowUI.getContainer();

        // 1. Update static keys (Built-in + Omnibar)
        container.querySelectorAll('.itg-editable-key').forEach((el) => {
            const desc = el.dataset.desc;
            const cat = el.dataset.category;
            let currentKey = '';
            if (cat === 'omnibar') {
                // Find default key for this desc
                const defKey = Object.keys(builtIn.categoryOmnibarPrefixes).find(
                    (k) => builtIn.categoryOmnibarPrefixes[k] === desc,
                );
                // Use override or default
                currentKey = rawOverrides[desc] || defKey;
            } else {
                // Global Commands: search in active mappings
                const activeKey = Object.keys(mappings).find((k) => mappings[k].description === desc);
                if (activeKey) {
                    currentKey = activeKey;
                } else {
                    // Fallback if not in mappings (rare, but safe)
                    for (const c in builtIn) {
                        if (c === 'categoryOmnibarPrefixes') continue;
                        const found = Object.keys(builtIn[c]).find((k) => builtIn[c][k] === desc);
                        if (found) {
                            currentKey = found;
                            break;
                        }
                    }
                }
            }

            // Update DOM only if changed
            if (currentKey && el.innerText !== currentKey) {
                el.innerText = currentKey;
                el.dataset.key = currentKey;
                el.classList.remove('itg-input-error');
            }
        });

        // 2. Reload dynamic lists (Custom Sites and Snippets)
        const body = container.getElementById('itg-help-body');
        this._renderCustomSites(body);
        this._renderSnippets(body);
    }
    cleanup() {
        if (this._modalKeyHandler) {
            window.removeEventListener('keydown', this._modalKeyHandler);
            this._modalKeyHandler = null;
        }
    }
};

// Global cross-frame media controller listener
// Injected into all child frames via manifest (all_frames: true) to universally pause media on preview close
