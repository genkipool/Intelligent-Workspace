import { initializeActiveTheme } from '../../../utils/theme.js';
import {
    initializeTranslations,
    applyTranslations,
    showNotification,
    getCurrentLang,
    loadMessages,
    resolveMessage,
} from '../../../utils/i18n.js';
import { exportHintsConfig, importHintsConfig } from '../../../utils/importExport.js';

// Resolved when the page initialises: `hint_common.js` publishes window.HintCommon
// as a side effect, so reading it at module scope would depend on import order.
let HintCommon;
let STORAGE_KEYS;
let COMMON_COMMANDS;

export async function initCustomizeHints() {
    HintCommon = window.HintCommon;
    if (!HintCommon) {
        console.error('[customizeHints] HintCommon is not available; the page cannot initialise.');
        return;
    }
    ({ STORAGE_KEYS, BUILT_IN_COMMANDS: COMMON_COMMANDS } = HintCommon);

    await initializeActiveTheme();
    await initializeTranslations();

    // Elements - Site Shortcuts
    const commandForm = document.getElementById('add-command-form');
    const customList = document.getElementById('custom-commands-list');
    const noCommandsMessage = document.getElementById('no-commands-message');

    // Main inputs
    const commandKeysInput = document.getElementById('command-keys');
    if (commandKeysInput) {
        commandKeysInput.maxLength = 4;
        commandKeysInput.addEventListener('keydown', HintCommon.preventInputSpace);
    }

    // Elements - Snippets
    const snippetsList = document.getElementById('snippets-list');

    const snippetTriggerInput = document.getElementById('snippet-trigger');
    if (snippetTriggerInput) {
        snippetTriggerInput.maxLength = 5;
        snippetTriggerInput.addEventListener('keydown', HintCommon.preventInputSpace);
    }

    // Elements - General
    const builtInContainer = document.getElementById('built-in-categories');
    const homeButton = document.getElementById('home-btn');
    const restoreButton = document.getElementById('restore-defaults-btn');

    let customCommands = [];
    let snippets = {};
    let customShortcutsOverrides = {};
    let linkPreviewBlacklist = [];
    let linkPreviewTriggerKey = '';
    let snippetPopupTriggerKey = '$$';
    let isRendering = false;
    let currentMessages = {};

    const refreshI18nMessages = async () => {
        const lang = await getCurrentLang();
        currentMessages = await loadMessages(lang);
    };

    const getI18nText = (key, fallback = '') => {
        if (!key) return fallback;
        const entry = currentMessages[key];
        if (entry) {
            const text = resolveMessage(entry, [], 'message');
            if (text) return text;
        }
        return chrome.i18n.getMessage(key) || fallback || key;
    };

    await refreshI18nMessages();

    // Placeholder helper
    const setupContentEditablePlaceholder = (el) => {
        if (el.innerText.trim() === '') {
            el.innerHTML = '';
        }
        el.addEventListener('blur', () => {
            el.scrollTop = 0;
            el.scrollLeft = 0;
            if (el.innerText.trim() === '') {
                el.innerHTML = '';
            }
        });
        return () => {
            el.innerHTML = '';
            delete el.dataset.html;
        };
    };

    const clearShortcutDesc = setupContentEditablePlaceholder(document.getElementById('command-desc'));
    const clearSnippetExp = setupContentEditablePlaceholder(document.getElementById('snippet-expansion'));

    // Initialize format buttons
    const initFormatButtons = () => {
        // Format button for snippet expansion only
        const snippetExpWrapper = document.querySelector('.snippet-expansion-wrapper');
        if (snippetExpWrapper) {
            const snippetExpField = document.getElementById('snippet-expansion');
            const formatBtn = HintCommon.RichTextFormatter.createFormatButton();
            const openModal = (e) => {
                e.preventDefault();
                HintCommon.RichTextFormatter.showModal(snippetExpField);
            };
            formatBtn.addEventListener('click', openModal);
            if (snippetExpField) {
                snippetExpField.addEventListener('click', openModal);
            }
            snippetExpWrapper.appendChild(formatBtn);
        }
    };

    initFormatButtons();

    homeButton.addEventListener('click', () => {
        window.location.href = '../popup/popup.html?context=sidepanel';
    });

    // --- DATA HANDLING ---

    const loadData = async () => {
        // Prefer HintCommon for fresh data, falling back to direct storage for bulk loads
        const data = await chrome.storage.sync.get([
            STORAGE_KEYS.COMMANDS,
            STORAGE_KEYS.SNIPPETS,
            STORAGE_KEYS.CUSTOM_SHORTCUTS,
            STORAGE_KEYS.LINK_PREVIEW_BLACKLIST,
            STORAGE_KEYS.LINK_PREVIEW_TRIGGER_KEY,
            STORAGE_KEYS.SNIPPET_POPUP_TRIGGER_KEY,
        ]);
        customCommands = data[STORAGE_KEYS.COMMANDS] || [];
        snippets = data[STORAGE_KEYS.SNIPPETS] || {};
        customShortcutsOverrides = data[STORAGE_KEYS.CUSTOM_SHORTCUTS] || {};
        linkPreviewBlacklist = data[STORAGE_KEYS.LINK_PREVIEW_BLACKLIST] || [];
        linkPreviewTriggerKey = data[STORAGE_KEYS.LINK_PREVIEW_TRIGGER_KEY] || '';
        snippetPopupTriggerKey = data[STORAGE_KEYS.SNIPPET_POPUP_TRIGGER_KEY] || '$$';
    };

    let ignoreUpdatesUntil = 0;

    // These saving helpers are kept ONLY for online editing (bulk updates or partial edits)
    // For Add/Delete we will use HintCommon directly.
    const saveCommands = async (commands, options = {}) => {
        if (options.skipRender) ignoreUpdatesUntil = Date.now() + 500;
        await HintCommon.Commands.saveAll(commands); // DELEGATED TO HINTCOMMON
        // We do not need to update customCommands here manually because the onMessage listener will do it,
        // unless skipRender is true.
        if (options.skipRender) customCommands = commands;
    };

    const saveSnippets = async (newSnippets, options = {}) => {
        if (options.skipRender) ignoreUpdatesUntil = Date.now() + 500;
        await HintCommon.Snippets.saveAll(newSnippets); // DELEGATED TO HINTCOMMON
        if (options.skipRender) snippets = newSnippets;
    };

    const saveCustomShortcuts = async (newOverrides, options = {}) => {
        if (options.skipRender) ignoreUpdatesUntil = Date.now() + 500;
        await chrome.storage.sync.set({ [STORAGE_KEYS.CUSTOM_SHORTCUTS]: newOverrides });
        customShortcutsOverrides = newOverrides;
        chrome.runtime.sendMessage({ action: 'hintCommandsUpdated' });
        if (!options.skipRender) await renderBuiltInCommands();
    };

    // --- VALIDATION & CONFLICT INFO ---
    const getKeyConflictInfo = (keys, type, excludingKey, category = 'global') => {
        if (!keys) return null;
        const k = keys.trim().toLowerCase();
        const ex = excludingKey ? excludingKey.trim().toLowerCase() : null;

        if (category === 'omnibar') {
            for (const [defKey, descKey] of Object.entries(COMMON_COMMANDS.categoryOmnibarPrefixes)) {
                const currentKey = (customShortcutsOverrides[descKey] || defKey).toLowerCase();
                if (currentKey === k && currentKey !== ex) {
                    return getI18nText(descKey, defKey);
                }
            }
            return null;
        }

        // 1. Check built-in commands
        for (const catKey in COMMON_COMMANDS) {
            if (catKey === 'categoryOmnibarPrefixes') continue;
            for (const [defKey, descKey] of Object.entries(COMMON_COMMANDS[catKey])) {
                const currentKey = (customShortcutsOverrides[descKey] || defKey).toLowerCase();
                if (currentKey === k && currentKey !== ex) {
                    return getI18nText(descKey, defKey);
                }
            }
        }

        // 2. Check link preview trigger key
        if (
            category !== 'triggerKey' &&
            linkPreviewTriggerKey &&
            linkPreviewTriggerKey.toLowerCase() === k &&
            linkPreviewTriggerKey.toLowerCase() !== ex
        ) {
            return getI18nText('previewTriggerKeyLabel', 'Link preview');
        }

        // 2.5 Check snippet popup menu trigger key
        if (
            category !== 'snippetMenuTriggerKey' &&
            snippetPopupTriggerKey &&
            snippetPopupTriggerKey.toLowerCase() === k &&
            snippetPopupTriggerKey.toLowerCase() !== ex
        ) {
            return getI18nText('snippetHelpPopupTitle', 'Menú de Acceso Rápido');
        }

        // 3. Check custom site commands
        if (customCommands) {
            const foundCmd = customCommands.find(
                (cmd) => cmd.keys.toLowerCase() === k && cmd.keys.toLowerCase() !== ex,
            );
            if (foundCmd) {
                const title = foundCmd.description ? HintCommon.stripHtml(foundCmd.description) : foundCmd.url;
                return title || foundCmd.keys;
            }
        }

        // 4. Check snippets
        if (snippets) {
            const foundTrigger = Object.keys(snippets).find(
                (trig) => trig.toLowerCase() === k && trig.toLowerCase() !== ex,
            );
            if (foundTrigger) {
                return `Snippet (${foundTrigger})`;
            }
        }

        return null;
    };

    const isKeySequenceTaken = (keys, type, excludingKey, category = 'global') => {
        return getKeyConflictInfo(keys, type, excludingKey, category) !== null;
    };

    // --- RENDERING ---

    const createCommandItem = (cmd, isCustom, isSnippet = false, extraData = {}) => {
        const li = HintCommon.DOM.create('li', {
            className: `command-item ${isCustom ? 'is-custom' : ''}`,
        });

        // Safe SVG icon
        const deleteBtn = HintCommon.DOM.create('button', { className: 'delete-command-btn' });
        deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

        if (isCustom) {
            li.dataset.keys = cmd.keys;
            li.dataset.url = cmd.url || '';
            li.dataset.description = cmd.description || '';
            li.classList.add('shortcuts-grid');

            const fullTitle = cmd.description ? `${cmd.url || ''}\n${cmd.description}` : cmd.url || '';
            const category = extraData.category || 'custom-site';

            // 1. Keys Span
            const keySpan = HintCommon.DOM.create(
                'span',
                {
                    className: 'command-keys',
                    autocomplete: 'off',
                    spellcheck: 'false',
                    contenteditable: 'true',
                    'data-type': 'keys',
                    'data-category': category,
                },
                cmd.keys,
            );

            // 2. URL Span
            const urlSpan = HintCommon.DOM.create(
                'span',
                {
                    className: 'command-url',
                    autocomplete: 'off',
                    spellcheck: 'false',
                    contenteditable: 'true',
                    'data-type': 'url',
                    title: fullTitle,
                },
                cmd.url || '',
            );

            // 3. Description Span (no wrapper for shortcuts)
            const descSpan = HintCommon.DOM.create(
                'span',
                {
                    className: 'command-description',
                    contenteditable: 'true',
                    'data-type': 'description',
                    'data-html': cmd.description || '',
                    'data-i18n-title': 'placeholderDesc',
                    title: getI18nText('placeholderDesc', 'Description'),
                },
                HintCommon.stripHtml(cmd.description || ''),
            );

            deleteBtn.dataset.keys = cmd.keys;

            li.append(keySpan, urlSpan, descSpan, deleteBtn);
        } else {
            const currentKey = customShortcutsOverrides[extraData.originalDesc] || cmd.keys;
            const category = extraData.category || 'unknown';
            const isNonEditable =
                extraData.originalDesc === 'hintDesc_group_tab_nav' || (cmd.keys && cmd.keys.includes('+'));

            let keyContent = currentKey;
            if (extraData.originalDesc === 'hintDesc_group_tab_nav') {
                li.classList.add('command-item-group-nav');
                const groupLabel = chrome.i18n.getUILanguage().startsWith('es') ? '<grupo><n>' : '<group><n>';
                keyContent = [
                    HintCommon.DOM.create('span', { className: 'group-nav-part' }, 'Alt'),
                    HintCommon.DOM.create('span', { className: 'group-nav-plus' }, '+'),
                    HintCommon.DOM.create('span', { className: 'group-nav-part' }, groupLabel),
                    HintCommon.DOM.create('span', { className: 'group-nav-plus' }, '+'),
                    HintCommon.DOM.create('span', { className: 'group-nav-part' }, 'Enter'),
                ];
            }

            const keySpan = HintCommon.DOM.create(
                'span',
                {
                    className: `command-keys ${isNonEditable ? 'non-editable' : ''}`,
                    autocomplete: 'off',
                    spellcheck: 'false',
                    contenteditable: isNonEditable ? 'false' : 'true',
                    'data-original-desc': extraData.originalDesc,
                    'data-original-key': cmd.keys,
                    'data-type': 'builtin',
                    'data-category': category,
                },
                keyContent,
            );

            const descSpan = HintCommon.DOM.create(
                'span',
                {
                    className: 'command-description',
                    'data-i18n': extraData.originalDesc,
                    'data-i18n-title': extraData.originalDesc,
                    title: cmd.description,
                },
                cmd.description,
            );

            // Spacer div for layout consistency
            const spacer = HintCommon.DOM.create('div');

            li.append(keySpan, descSpan, spacer);
        }

        // --- LISTENERS (Kept the same as before, copied here for context) ---
        const editables = li.querySelectorAll('[contenteditable]');
        editables.forEach((el) => {
            const type = el.dataset.type;
            const category = el.dataset.category;

            HintCommon.setupInlineEdit(el, {
                category: category,
                useHtml: type === 'description',
                blurOnEnter: type !== 'description',
                required: type !== 'description',
                validate: (val) => {
                    const newVal = val.toLowerCase();

                    if (type === 'keys' && isCustom) {
                        const originalKeys = li.dataset.keys;
                        // Default value is 'true' if not defined for custom sites
                        if (newVal !== originalKeys && isKeySequenceTaken(newVal, 'mapping', originalKeys, 'global')) {
                            return false;
                        }
                    } else if (type === 'builtin') {
                        const oldKey = customShortcutsOverrides[extraData.originalDesc] || extraData.originalKey;
                        // Here we pass the real category (e.g., 'omnibar' or 'navigation')
                        const isOmnibar = extraData.category === 'omnibar';
                        const checkCat = isOmnibar ? 'omnibar' : 'global';

                        if (newVal !== oldKey && isKeySequenceTaken(newVal, 'mapping', oldKey, checkCat)) {
                            return false;
                        }
                    }
                    return true;
                },
                onError: (val) => {
                    if (!val && type !== 'description') {
                        showNotification('errorFieldRequired', true);
                    } else if (type === 'keys' || type === 'builtin') {
                        const oldKey = isCustom
                            ? li.dataset.keys
                            : customShortcutsOverrides[extraData.originalDesc] || extraData.originalKey;
                        const isOmnibar = extraData.category === 'omnibar';
                        const checkCat = isOmnibar ? 'omnibar' : 'global';
                        const conflict = getKeyConflictInfo(val, 'mapping', oldKey, checkCat);
                        if (conflict) {
                            showNotification('errorTriggerTakenBy', true, [conflict]);
                        } else {
                            showNotification('errorTriggerTaken', true);
                        }
                    }
                },
                onSave: async (newVal) => {
                    // Built-in saving logic
                    if (type === 'builtin') {
                        const newMap = { ...customShortcutsOverrides };
                        if (newVal === extraData.originalKey) delete newMap[extraData.originalDesc];
                        else newMap[extraData.originalDesc] = newVal;
                        await saveCustomShortcuts(newMap, { skipRender: true });
                        return;
                    }

                    // The row doesn't exist yet, we only save if it's not empty
                    if (isCustom) {
                        const originalKeys = li.dataset.keys;
                        // Get fresh values from DOM in case other fields changed
                        const currentKeys =
                            type === 'keys'
                                ? newVal
                                : li.querySelector('[data-type="keys"]').innerText.trim().toLowerCase();
                        const currentUrl =
                            type === 'url' ? newVal : li.querySelector('[data-type="url"]').innerText.trim();
                        const descEl = li.querySelector('[data-type="description"]');
                        const currentDesc =
                            type === 'description' ? newVal : descEl.dataset.html || descEl.innerText.trim();

                        li.dataset.keys = currentKeys;
                        li.dataset.url = currentUrl;
                        li.dataset.description = currentDesc;

                        // The row already exists, we update it
                        // Update UI titles
                        const fullTitle = currentDesc ? `${currentUrl}\n${currentDesc}` : currentUrl;
                        li.querySelector('[data-type="url"]').title = fullTitle;

                        const updated = customCommands.map((c) =>
                            c.keys === originalKeys
                                ? { keys: currentKeys, url: currentUrl, description: currentDesc }
                                : c,
                        );
                        await saveCommands(updated, { skipRender: true });
                    }
                },
            });

            // Additional UI helpers
            el.addEventListener('focus', () => {
                if (isCustom) li.classList.add('is-editing-custom');
            });
            el.addEventListener('blur', () => {
                setTimeout(() => {
                    if (!li.contains(document.activeElement)) li.classList.remove('is-editing-custom');
                }, 50);
            });

            if (type === 'keys' || type === 'builtin') {
                el.addEventListener('keydown', HintCommon.preventInputSpace);
            }
        });

        return li;
    };

    // --- REDESIGNED SNIPPET COMPONENT ---
    const createSnippetItem = (trigger, expansion, variables = []) => {
        const li = HintCommon.DOM.create('li', {
            className: 'command-item snippet-item snippet-item-container',
            dataset: { trigger: trigger, expansion: expansion },
        });

        // 1. Main Row
        const mainRow = HintCommon.DOM.create('div', { className: 'snippet-main-row' });

        const keySpan = HintCommon.DOM.create(
            'span',
            {
                className: 'command-keys',
                autocomplete: 'off',
                spellcheck: 'false',
                contenteditable: 'true',
                'data-type': 'trigger',
                'data-category': 'snippet',
            },
            trigger,
        );

        // Expansion Span with Format Button
        const expWrapper = HintCommon.DOM.create('div', {
            className: 'snippet-expansion-wrapper',
        });

        const expSpan = HintCommon.DOM.create(
            'span',
            {
                className: 'command-description snippet-expansion',
                contenteditable: 'true',
                'data-type': 'expansion',
                'data-html': expansion || '',
                'data-category': 'snippet',
            },
            HintCommon.stripHtml(expansion || ''),
        );

        const openExpModal = (e) => {
            e.preventDefault();
            e.stopPropagation();
            HintCommon.RichTextFormatter.showModal(expSpan);
        };

        expSpan.addEventListener('click', openExpModal);

        const formatBtn = HintCommon.RichTextFormatter.createFormatButton();
        formatBtn.addEventListener('click', openExpModal);

        expWrapper.append(expSpan, formatBtn);

        const deleteBtn = HintCommon.DOM.create('button', {
            className: 'delete-command-btn',
            dataset: { trigger: trigger },
        });
        deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

        mainRow.append(keySpan, expWrapper, deleteBtn);
        li.appendChild(mainRow);

        // 2. Variables List
        const varsContainer = HintCommon.DOM.create('div', { className: 'snippet-variables-list' });

        variables.forEach((v, idx) => {
            const row = HintCommon.DOM.create('div', { className: 'variable-row', dataset: { index: idx } });

            const idInput = HintCommon.DOM.create('input', {
                className: 'var-id',
                value: v.id,
                maxlength: '3',
                title: chrome.i18n.getMessage('varIdLabel') || 'ID',
            });
            const wordInput = HintCommon.DOM.create('input', {
                className: 'var-name',
                value: v.word,
                maxlength: '50',
                title: chrome.i18n.getMessage('varWordLabel') || 'Word to replace',
            });
            const defInput = HintCommon.DOM.create('input', {
                className: 'var-value',
                value: v.defaultValue || '',
                maxlength: '1000',
                title: chrome.i18n.getMessage('varDefaultLabel') || 'Default value',
            });

            // Attach Logic (copied from previous version, but with secure elements)
            const validateRow = () => {
                const currentExp = li.querySelector('[data-type="expansion"]').innerText;

                const toggleErr = (el, condition) => {
                    if (condition) el.classList.add('itg-input-error');
                    else el.classList.remove('itg-input-error');
                };

                toggleErr(idInput, !idInput.value.trim());

                if (!wordInput.value.trim() || !currentExp.includes(wordInput.value.trim())) {
                    wordInput.classList.add('itg-input-error');
                    if (!currentExp.includes(wordInput.value.trim()))
                        wordInput.title = chrome.i18n.getMessage('errorVarWordNotFound');
                } else {
                    wordInput.classList.remove('itg-input-error');
                    wordInput.title = '';
                }

                toggleErr(defInput, !defInput.value.trim());
                updateUsage();
            };

            idInput.addEventListener('keydown', HintCommon.preventInputSpace);
            [idInput, wordInput, defInput].forEach((input) => {
                input.addEventListener('input', validateRow);
                input.addEventListener('focus', () => (input.dataset.originalVal = input.value));
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        if (input.dataset.originalVal !== undefined) input.value = input.dataset.originalVal;
                        input.classList.remove('itg-input-error');
                        input.blur();
                        validateRow();
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    }
                });
                input.addEventListener('blur', () => {
                    if (input.classList.contains('itg-input-error')) {
                        if (input.dataset.originalVal !== undefined) input.value = input.dataset.originalVal;
                        input.classList.remove('itg-input-error');
                        validateRow();
                    }
                });
            });

            row.append(idInput, wordInput, defInput);
            varsContainer.appendChild(row);
        });

        li.appendChild(varsContainer);

        // 3. Usage Footer
        const footer = HintCommon.DOM.create('div', { className: 'snippet-usage-footer' });
        const usageText = HintCommon.DOM.create('span', { className: 'usage-text' });
        const copyBtn = HintCommon.DOM.create('button', {
            className: 'snippet-copy-usage-btn',
            title: chrome.i18n.getMessage('copyButtonTitle') || 'Copy',
        });
        copyBtn.innerHTML = `<svg width="16" height="16" viewBox="-2.4 -2.4 28.80 28.80" fill="none" xmlns="http://www.w3.org/2000/svg"><g fill-rule="evenodd" clip-rule="evenodd" fill="var(--text-color)"><path d="M6.25 5.25c0-2.747 2.187-5 4.917-5h6.666c2.73 0 4.917 2.253 4.917 5v8.5c0 2.747-2.187 5-4.917 5a.75.75 0 0 1 0-1.5c1.873 0 3.417-1.553 3.417-3.5v-8.5c0-1.947-1.544-3.5-3.417-3.5h-6.666c-1.873 0-3.417 1.553-3.417 3.5a.75.75 0 0 1-1.5 0"></path><path d="M1.25 10.25c0-2.747 2.187-5 4.917-5h6.666c2.73 0 4.917 2.253 4.917 5v8.5c0 2.747-2.187 5-4.917 5H6.167c-2.73 0-4.917-2.253-4.917-5zm4.917-3.5c-1.873 0-3.417 1.553-3.417 3.5v8.5c0 1.947 1.544 3.5 3.417 3.5h6.666c1.873 0 3.417-1.553 3.417-3.5v-8.5c0-1.947-1.544-3.5-3.417-3.5z"></path></g></svg>`;

        footer.append(usageText, copyBtn);

        // Add Variable Count Input
        const countInput = HintCommon.DOM.create('input', {
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

            // Settings Modal Global Variables
            const currentVars = [];
            varsContainer.querySelectorAll('.variable-row').forEach((row) => {
                currentVars.push({
                    id: row.querySelector('.var-id').value,
                    word: row.querySelector('.var-name').value,
                    defaultValue: row.querySelector('.var-value').value,
                });
            });

            // Adjust variables array
            if (newCount > currentVars.length) {
                // Add new variables
                for (let i = currentVars.length; i < newCount; i++) {
                    // Simple fallback
                    // Try to increment ID if it looks like a number or $number
                    let nextId = '$' + (i + 1);
                    currentVars.push({ id: nextId, word: '', defaultValue: '' });
                }
            } else if (newCount < currentVars.length) {
                // Remove variables
                currentVars.splice(newCount);
            }

            // Re-render only this row to show errors
            varsContainer.innerHTML = '';
            currentVars.forEach((v, idx) => {
                const row = HintCommon.DOM.create('div', { className: 'variable-row', dataset: { index: idx } });

                const idInput = HintCommon.DOM.create('input', {
                    className: 'var-id',
                    value: v.id,
                    maxlength: '3',
                    title: chrome.i18n.getMessage('varIdLabel') || 'ID',
                });
                const wordInput = HintCommon.DOM.create('input', {
                    className: 'var-name',
                    value: v.word,
                    maxlength: '50',
                    title: chrome.i18n.getMessage('varWordLabel') || 'Word to replace',
                });
                const defInput = HintCommon.DOM.create('input', {
                    className: 'var-value',
                    value: v.defaultValue || '',
                    maxlength: '1000',
                    title: chrome.i18n.getMessage('varDefaultLabel') || 'Default value',
                });

                // Attach Validation Logic (Reused)
                const validateRow = () => {
                    const currentExp = li.querySelector('[data-type="expansion"]').innerText;
                    const toggleErr = (el, condition) => {
                        if (condition) el.classList.add('itg-input-error');
                        else el.classList.remove('itg-input-error');
                    };
                    toggleErr(idInput, !idInput.value.trim());

                    if (!wordInput.value.trim() || !currentExp.includes(wordInput.value.trim())) {
                        wordInput.classList.add('itg-input-error');
                        if (!currentExp.includes(wordInput.value.trim()))
                            wordInput.title = chrome.i18n.getMessage('errorVarWordNotFound');
                    } else {
                        wordInput.classList.remove('itg-input-error');
                        wordInput.title = '';
                    }
                    toggleErr(defInput, !defInput.value.trim());
                    updateUsage();
                };

                idInput.addEventListener('keydown', HintCommon.preventInputSpace);
                [idInput, wordInput, defInput].forEach((input) => {
                    input.addEventListener('input', validateRow);
                    input.addEventListener('focus', () => (input.dataset.originalVal = input.value));
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            if (input.dataset.originalVal !== undefined) input.value = input.dataset.originalVal;
                            input.classList.remove('itg-input-error');
                            input.blur();
                            validateRow();
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            input.blur();
                        }
                    });
                    input.addEventListener('blur', () => {
                        if (input.classList.contains('itg-input-error')) {
                            if (input.dataset.originalVal !== undefined) input.value = input.dataset.originalVal;
                            input.classList.remove('itg-input-error');
                            validateRow();
                        }
                    });
                });

                row.append(idInput, wordInput, defInput);
                varsContainer.appendChild(row);
            });

            // Trigger save update (using the existing change listener flow)
            // We can manually trigger a change event on the container to save
            varsContainer.dispatchEvent(new Event('change', { bubbles: true }));
            updateUsage();
        });

        footer.append(countInput);

        li.appendChild(footer);

        const updateUsage = () => {
            const trig = mainRow.querySelector('[data-type="trigger"]').innerText.trim();
            const vars = [];
            varsContainer.querySelectorAll('.variable-row').forEach((row) => {
                vars.push({
                    id: row.querySelector('.var-id').value.trim(),
                    defaultValue: row.querySelector('.var-value').value.trim(),
                });
            });
            const text = HintCommon.generateSnippetUsageText(trig, vars);
            usageText.innerText = text;
            copyBtn.dataset.text = text;
        };
        updateUsage();

        // --- Event Listeners Globales del Item (Change / Editable) ---
        // (Kept identical to your previous version, just ensure to use them over the 'li' and 'mainRow' references created here)

        varsContainer.addEventListener('change', async (e) => {
            if (e.target.tagName === 'INPUT' || e.target === varsContainer) {
                const newVars = [];
                let hasError = false;
                // FIX: Use local dates to avoid time zone issues with toISOString
                const currentExp = mainRow.querySelector('[data-type="expansion"]').innerText;

                varsContainer.querySelectorAll('.variable-row').forEach((row) => {
                    const id = row.querySelector('.var-id').value.trim();
                    const word = row.querySelector('.var-name').value.trim();
                    const def = row.querySelector('.var-value').value.trim();

                    if (!id || !word || !def) hasError = true;
                    if (word && !HintCommon.validateSnippetVar(word, currentExp)) {
                        row.querySelector('.var-name').classList.add('itg-input-error');
                        hasError = true;
                    } else {
                        row.querySelector('.var-name').classList.remove('itg-input-error');
                    }
                    newVars.push({ id, word, defaultValue: def });
                });

                if (!hasError) {
                    const currentTrig = li.dataset.trigger;
                    const expEl = mainRow.querySelector('[data-type="expansion"]');
                    const savedExp = expEl.dataset.html || expEl.innerText.trim();
                    const newSnippets = { ...snippets };
                    newSnippets[currentTrig] = { expansion: savedExp, variables: newVars };
                    await saveSnippets(newSnippets, { skipRender: true });
                    updateUsage();
                }
            }
        });

        // --- Inline Edits Logic with HintCommon ---
        const editables = mainRow.querySelectorAll('[contenteditable]');
        editables.forEach((el) => {
            const type = el.dataset.type;

            HintCommon.setupInlineEdit(el, {
                category: type === 'trigger' ? 'snippet' : null,
                useHtml: type === 'expansion',
                blurOnEnter: type === 'trigger',
                validate: (val) => {
                    if (type === 'trigger') {
                        // It is an update (rename) if the trigger has changed
                        return val && !HintCommon.isKeyInUse(val, 'snippet', li.dataset.trigger, { snippets });
                    }
                    if (type === 'expansion') {
                        const varNames = Array.from(varsContainer.querySelectorAll('.var-name')).map((i) =>
                            i.value.trim(),
                        );
                        return !varNames.some((name) => !val.includes(name));
                    }
                    return true;
                },
                onError: (val) => {
                    if (type === 'trigger') {
                        if (!val) {
                            showNotification('errorFieldRequired', true);
                        } else {
                            const conflict = getKeyConflictInfo(val, 'snippet', li.dataset.trigger, 'snippet');
                            if (conflict) {
                                showNotification('errorTriggerTakenBy', true, [conflict]);
                            } else {
                                showNotification('errorTriggerTaken', true);
                            }
                        }
                    } else if (type === 'expansion') {
                        showNotification('errorVarWordNotFound', true);
                    }
                },
                onSave: async (newVal) => {
                    const originalTrigger = li.dataset.trigger;
                    const newSnippets = { ...snippets };

                    if (type === 'trigger') {
                        const data = newSnippets[originalTrigger];
                        delete newSnippets[originalTrigger];
                        newSnippets[newVal] = data;
                        li.dataset.trigger = newVal;
                    } else {
                        if (typeof newSnippets[originalTrigger] === 'object')
                            newSnippets[originalTrigger].expansion = newVal;
                        else newSnippets[originalTrigger] = newVal;
                        li.dataset.expansion = newVal;
                    }
                    await saveSnippets(newSnippets, { skipRender: true });
                },
                onAfter: () => updateUsage(),
            });

            if (type === 'trigger') {
                el.addEventListener('keydown', HintCommon.preventInputSpace);
            }
        });

        copyBtn.addEventListener('click', () => {
            const text = copyBtn.dataset.text;
            navigator.clipboard.writeText(text).then(() => {
                showNotification('snippetCopiedSuccess');
            });
        });

        return li;
    };

    const renderCustomCommands = () => {
        if (customCommands.length === 0) noCommandsMessage.classList.add('itg-display-block');
        else noCommandsMessage.classList.remove('itg-display-block');

        const existingItems = Array.from(customList.querySelectorAll('.command-item.is-custom'));
        const existingMap = new Map();
        existingItems.forEach((el) => {
            const key = el.dataset.keys;
            existingMap.set(key, el);
            el.dataset.updated = 'false';
        });

        customCommands.forEach((cmd) => {
            let item = existingMap.get(cmd.keys);
            if (item) {
                item.dataset.updated = 'true';
                const keySpan = item.querySelector('[data-type="keys"]');
                if (keySpan && keySpan.innerText !== cmd.keys && document.activeElement !== keySpan) {
                    keySpan.innerText = cmd.keys;
                }
                const urlSpan = item.querySelector('[data-type="url"]');
                if (urlSpan) {
                    if (urlSpan.innerText !== (cmd.url || '') && document.activeElement !== urlSpan) {
                        urlSpan.innerText = cmd.url || '';
                    }
                    const fullTitle = cmd.description ? `${cmd.url || ''}\n${cmd.description}` : cmd.url || '';
                    if (urlSpan.title !== fullTitle) urlSpan.title = fullTitle;
                }
                const descSpan = item.querySelector('[data-type="description"]');
                if (descSpan && document.activeElement !== descSpan) {
                    const currentHtml = descSpan.dataset.html || '';
                    if (currentHtml !== (cmd.description || '')) {
                        descSpan.dataset.html = cmd.description || '';
                        descSpan.innerText = HintCommon.stripHtml(cmd.description || '');
                    }
                }
                if (item.dataset.url !== (cmd.url || '')) item.dataset.url = cmd.url || '';
                if (item.dataset.description !== (cmd.description || ''))
                    item.dataset.description = cmd.description || '';
            } else {
                const newItem = createCommandItem(cmd, true, false, { category: 'custom-site' });
                newItem.dataset.updated = 'true';
                customList.appendChild(newItem);
            }
        });

        existingItems.forEach((item) => {
            if (item.dataset.updated === 'false') item.remove();
            else delete item.dataset.updated;
        });

        applyTranslations(customList);
    };

    const renderSnippets = () => {
        const existingItems = Array.from(snippetsList.querySelectorAll('.snippet-item-container'));
        const existingMap = new Map();
        existingItems.forEach((el) => {
            const trigger = el.dataset.trigger;
            existingMap.set(trigger, el);
            el.dataset.updated = 'false';
        });

        Object.entries(snippets).forEach(([trigger, data]) => {
            if (!data) return; // Skip invalid entries
            let item = existingMap.get(trigger);
            const expansion = typeof data === 'string' ? data : data.expansion || '';
            const variables = typeof data === 'object' && Array.isArray(data.variables) ? data.variables : [];

            if (item) {
                item.dataset.updated = 'true';

                const trigSpan = item.querySelector('[data-type="trigger"]');
                if (trigSpan && trigSpan.innerText !== trigger && document.activeElement !== trigSpan) {
                    trigSpan.innerText = trigger;
                    item.dataset.trigger = trigger;
                }

                const expSpan = item.querySelector('[data-type="expansion"]');
                if (expSpan && document.activeElement !== expSpan) {
                    const currentHtml = expSpan.dataset.html || '';
                    if (currentHtml !== expansion) {
                        expSpan.dataset.html = expansion;
                        expSpan.innerText = HintCommon.stripHtml(expansion);
                        item.dataset.expansion = expansion;
                    }
                }

                const varsContainer = item.querySelector('.snippet-variables-list');
                const currentVarRows = varsContainer.querySelectorAll('.variable-row');

                if (variables.length !== currentVarRows.length || JSON.stringify(variables) !== item.dataset.reqVars) {
                    const newItem = createSnippetItem(trigger, expansion, variables);
                    newItem.dataset.updated = 'true';
                    newItem.dataset.reqVars = JSON.stringify(variables);
                    item.replaceWith(newItem);
                } else {
                    item.dataset.reqVars = JSON.stringify(variables);
                }
            } else {
                const newItem = createSnippetItem(trigger, expansion, variables);
                newItem.dataset.updated = 'true';
                newItem.dataset.reqVars = JSON.stringify(variables);
                snippetsList.appendChild(newItem);
            }
        });

        existingItems.forEach((item) => {
            if (item.dataset.updated === 'false') item.remove();
            else delete item.dataset.updated;
        });

        const snippetTriggerContainer = document.getElementById('snippet-trigger-container');
        if (snippetTriggerContainer) {
            let triggerItem = snippetTriggerContainer.querySelector('#snippet-menu-trigger-item');
            if (!triggerItem) {
                triggerItem = createSnippetTriggerKeyItem('snippet-menu-trigger-item', 'snippet-menu-trigger-key');
                snippetTriggerContainer.appendChild(triggerItem);
            }
            const inputEl = triggerItem.querySelector('.snippet-menu-trigger-input');
            if (inputEl && document.activeElement !== inputEl) {
                inputEl.value = snippetPopupTriggerKey || '$$';
            }
            updateSnippetTriggerDisplays(snippetPopupTriggerKey || '$$');
            applyTranslations(snippetTriggerContainer);
        }
    };

    const renderBlacklist = () => {
        const blacklistList = document.getElementById('blacklist-list');
        if (!blacklistList) return;

        const existingItems = Array.from(blacklistList.children);
        const existingMap = new Map();
        existingItems.forEach((el) => {
            const domain = el.dataset.domain;
            existingMap.set(domain, el);
            el.dataset.updated = 'false';
        });

        linkPreviewBlacklist.forEach((domain) => {
            let item = existingMap.get(domain);
            if (item) {
                item.dataset.updated = 'true';
            } else {
                item = document.createElement('li');
                item.className = 'command-item is-custom blacklist-item';
                item.dataset.domain = domain;

                const domainSpan = document.createElement('span');
                domainSpan.className = 'command-description blacklist-domain';
                domainSpan.contentEditable = 'true';
                domainSpan.spellcheck = false;
                domainSpan.textContent = domain;

                domainSpan.addEventListener('blur', () => {
                    const currentDomain = item.dataset.domain;
                    const newDomain = domainSpan.textContent.trim().toLowerCase();
                    if (!newDomain) {
                        domainSpan.textContent = currentDomain;
                        showNotification('errorFieldRequired', true);
                    } else if (newDomain !== currentDomain) {
                        if (linkPreviewBlacklist.includes(newDomain)) {
                            domainSpan.textContent = currentDomain;
                            showNotification('errorTriggerTaken', true);
                        } else {
                            item.dataset.domain = newDomain;
                            chrome.runtime.sendMessage({
                                action: 'editLinkPreviewBlacklist',
                                oldDomain: currentDomain,
                                newDomain: newDomain,
                            });
                        }
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

                item.appendChild(domainSpan);

                const delBtn = document.createElement('button');
                delBtn.className = 'delete-command-btn';
                delBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                delBtn.title = chrome.i18n.getMessage('removeBtnTitle') || 'Remove';
                delBtn.addEventListener('click', () => {
                    chrome.runtime.sendMessage({ action: 'removeLinkPreviewBlacklist', domain: item.dataset.domain });
                });
                item.appendChild(delBtn);

                item.dataset.updated = 'true';
                blacklistList.appendChild(item);
            }
        });

        existingItems.forEach((item) => {
            if (item.dataset.updated === 'false') item.remove();
            else delete item.dataset.updated;
        });

        const blacklistTriggerContainer = document.getElementById('blacklist-trigger-container');
        if (blacklistTriggerContainer) {
            let triggerItem = blacklistTriggerContainer.querySelector('#blacklist-preview-trigger-item');
            if (!triggerItem) {
                triggerItem = createTriggerKeyItem('blacklist-preview-trigger-item', 'blacklist-preview-trigger-key');
                blacklistTriggerContainer.appendChild(triggerItem);
            }
            const inputEl = triggerItem.querySelector('.preview-trigger-key-input');
            if (inputEl && document.activeElement !== inputEl) {
                inputEl.value = linkPreviewTriggerKey;
            }
            applyTranslations(blacklistTriggerContainer);
        }
    };

    const syncTriggerKeyInputs = (value, error = false, activeInput = null) => {
        document.querySelectorAll('.preview-trigger-key-input').forEach((input) => {
            if (!error) input.classList.remove('error');
            if (input !== activeInput) {
                input.value = value;
            }
        });
    };

    const setupTriggerKeyInputEvents = (input) => {
        let errorTimeout = null;

        input.addEventListener('keydown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape' || e.key === 'Enter') {
                input.blur();
                return;
            }
            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (errorTimeout) clearTimeout(errorTimeout);
                input.value = '';
                input.classList.remove('error');
                linkPreviewTriggerKey = '';
                syncTriggerKeyInputs('', false, input);
                chrome.runtime.sendMessage({ action: 'setLinkPreviewTriggerKey', triggerKey: '' });
                return;
            }

            let keyVal = e.key.toLowerCase();
            if (keyVal === ' ') keyVal = 'space';

            const conflict = getKeyConflictInfo(keyVal, 'mapping', linkPreviewTriggerKey, 'triggerKey');
            if (conflict) {
                input.value = keyVal;
                input.classList.add('error');
                showNotification('errorTriggerTakenBy', true, [conflict]);
                if (errorTimeout) clearTimeout(errorTimeout);
                errorTimeout = setTimeout(() => {
                    input.classList.remove('error');
                    input.value = linkPreviewTriggerKey;
                    syncTriggerKeyInputs(linkPreviewTriggerKey, false, input);
                }, 2000);
                return;
            }

            if (errorTimeout) clearTimeout(errorTimeout);
            input.classList.remove('error');
            input.value = keyVal;
            linkPreviewTriggerKey = keyVal;
            syncTriggerKeyInputs(keyVal, false, input);
            chrome.runtime.sendMessage({ action: 'setLinkPreviewTriggerKey', triggerKey: keyVal });
        });

        input.addEventListener('focus', () => {
            if (errorTimeout) clearTimeout(errorTimeout);
            input.classList.remove('error');
        });

        input.addEventListener('blur', () => {
            if (!input.classList.contains('error')) {
                input.value = linkPreviewTriggerKey;
                syncTriggerKeyInputs(linkPreviewTriggerKey, false, input);
            }
        });
    };

    const createTriggerKeyItem = (itemId, inputId) => {
        const triggerItem = document.createElement('li');
        triggerItem.id = itemId;
        triggerItem.className = 'command-item preview-trigger-key-item';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = inputId;
        input.className = 'command-keys preview-trigger-key-input';
        input.maxLength = 15;
        input.placeholder = '-';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.cursor = 'pointer';
        input.style.margin = '0';
        input.autocomplete = 'off';
        input.spellcheck = false;

        setupTriggerKeyInputEvents(input);

        const descContainer = document.createElement('div');
        descContainer.className = 'command-description';
        descContainer.setAttribute('data-i18n-title', 'previewTriggerKeyTooltip');
        descContainer.title = getI18nText('previewTriggerKeyTooltip');
        descContainer.style.display = 'flex';
        descContainer.style.alignItems = 'center';
        descContainer.style.gap = '8px';
        descContainer.style.whiteSpace = 'normal';

        const labelSpan = document.createElement('span');
        labelSpan.style.fontWeight = '500';
        labelSpan.setAttribute('data-i18n', 'previewTriggerKeyLabel');
        labelSpan.textContent = getI18nText('previewTriggerKeyLabel');

        const tooltipSpan = document.createElement('span');
        tooltipSpan.style.fontSize = '0.85rem';
        tooltipSpan.style.opacity = '0.7';
        tooltipSpan.setAttribute('data-i18n', 'previewTriggerKeyTooltip');
        tooltipSpan.textContent = getI18nText('previewTriggerKeyTooltip');

        descContainer.appendChild(labelSpan);
        descContainer.appendChild(tooltipSpan);

        const spacer = document.createElement('div');

        triggerItem.appendChild(input);
        triggerItem.appendChild(descContainer);
        triggerItem.appendChild(spacer);

        return triggerItem;
    };

    const updateSnippetTriggerDisplays = (val) => {
        const triggerStr = val || '$$';
        document.querySelectorAll('.snippet-trigger-display, .snippet-popup-trigger-code').forEach((el) => {
            el.textContent = triggerStr;
            el.style.color = 'var(--text-on-color)';
        });
    };

    const createSnippetTriggerKeyItem = (itemId, inputId) => {
        const triggerItem = document.createElement('li');
        triggerItem.id = itemId;
        triggerItem.className = 'command-item snippet-trigger-key-item';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = inputId;
        input.className = 'command-keys snippet-menu-trigger-input';
        input.maxLength = 2;
        input.placeholder = '$$';
        input.value = snippetPopupTriggerKey || '$$';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.cursor = 'text';
        input.style.margin = '0';
        input.autocomplete = 'off';
        input.spellcheck = false;

        let errorTimeout = null;

        const validateAndSave = () => {
            const trimmed = input.value.trim();
            if (!trimmed) {
                input.value = snippetPopupTriggerKey || '$$';
                input.classList.remove('error');
                return true;
            }
            if (trimmed === snippetPopupTriggerKey) {
                input.classList.remove('error');
                return true;
            }
            const conflict = getKeyConflictInfo(trimmed, 'snippet', snippetPopupTriggerKey, 'snippetMenuTriggerKey');
            if (conflict) {
                input.classList.add('error');
                showNotification('errorTriggerTakenBy', true, [conflict]);
                if (errorTimeout) clearTimeout(errorTimeout);
                errorTimeout = setTimeout(() => {
                    input.classList.remove('error');
                    input.value = snippetPopupTriggerKey || '$$';
                }, 2000);
                return false;
            }
            if (errorTimeout) clearTimeout(errorTimeout);
            input.classList.remove('error');
            snippetPopupTriggerKey = trimmed;
            updateSnippetTriggerDisplays(trimmed);
            chrome.runtime.sendMessage({ action: 'setSnippetPopupTriggerKey', triggerKey: trimmed });
            return true;
        };

        input.addEventListener('focus', () => {
            if (errorTimeout) clearTimeout(errorTimeout);
            input.classList.remove('error');
        });

        input.addEventListener('input', () => {
            if (errorTimeout) clearTimeout(errorTimeout);
            input.classList.remove('error');
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const ok = validateAndSave();
                if (ok) {
                    input.blur();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (errorTimeout) clearTimeout(errorTimeout);
                input.classList.remove('error');
                input.value = snippetPopupTriggerKey || '$$';
                input.blur();
            }
        });

        input.addEventListener('blur', () => {
            validateAndSave();
        });

        const descSpan = HintCommon.DOM.create(
            'span',
            {
                className: 'command-description',
                'data-i18n': 'snippetHelpPopupTitle',
                'data-i18n-title': 'snippetHelpPopupTitle',
                title: getI18nText('snippetHelpPopupTitle', 'Menú de Acceso Rápido'),
            },
            getI18nText('snippetHelpPopupTitle', 'Menú de Acceso Rápido'),
        );

        const spacer = document.createElement('div');

        triggerItem.appendChild(input);
        triggerItem.appendChild(descSpan);
        triggerItem.appendChild(spacer);

        return triggerItem;
    };

    const renderBuiltInCommands = async () => {
        await refreshI18nMessages();
        const omniList = document.getElementById('omnibar-prefixes-list');

        const updateOrAppendItem = (container, cmd, extraData) => {
            const existingItem = container
                .querySelector(`[data-original-desc="${extraData.originalDesc}"]`)
                ?.closest('.command-item');
            if (existingItem) {
                existingItem.dataset.updated = 'true';
                const keySpan = existingItem.querySelector('[data-type="builtin"]');
                const currentKey = customShortcutsOverrides[extraData.originalDesc] || cmd.keys;
                if (keySpan && keySpan.innerText !== currentKey && document.activeElement !== keySpan) {
                    keySpan.innerText = currentKey;
                    keySpan.classList.remove('error');
                }
                const descSpan = existingItem.querySelector('.command-description');
                if (descSpan && cmd.description) {
                    descSpan.textContent = cmd.description;
                    descSpan.title = cmd.description;
                    descSpan.setAttribute('data-i18n', extraData.originalDesc);
                    descSpan.setAttribute('data-i18n-title', extraData.originalDesc);
                }
            } else {
                const newItem = createCommandItem(cmd, false, false, extraData);
                newItem.dataset.updated = 'true';
                container.appendChild(newItem);
            }
        };

        for (const categoryKey in COMMON_COMMANDS) {
            if (categoryKey === 'categoryOmnibarPrefixes' && omniList) {
                Array.from(omniList.children).forEach((el) => (el.dataset.updated = 'false'));
                Object.entries(COMMON_COMMANDS[categoryKey]).forEach(([keys, descKey]) => {
                    const description = getI18nText(descKey, descKey);
                    updateOrAppendItem(
                        omniList,
                        { keys, description },
                        { originalKey: keys, originalDesc: descKey, category: 'omnibar' },
                    );
                });
                Array.from(omniList.children).forEach((el) => {
                    if (el.dataset.updated === 'false') el.remove();
                    else delete el.dataset.updated;
                });
                continue;
            }

            let categoryContainer = builtInContainer.querySelector(
                `.category-container[data-category="${categoryKey}"]`,
            );
            let categoryList;

            if (!categoryContainer) {
                categoryContainer = document.createElement('div');
                categoryContainer.className = 'category-container';
                categoryContainer.dataset.category = categoryKey;
                const categoryTitle = document.createElement('h3');
                categoryTitle.className = 'category-title';
                categoryTitle.setAttribute('data-i18n', categoryKey);
                categoryTitle.textContent = getI18nText(categoryKey);
                categoryContainer.appendChild(categoryTitle);
                categoryList = document.createElement('ul');
                categoryList.className = 'commands-list';
                categoryContainer.appendChild(categoryList);
                builtInContainer.appendChild(categoryContainer);
            } else {
                categoryList = categoryContainer.querySelector('.commands-list');
                const title = categoryContainer.querySelector('.category-title');
                if (title) {
                    title.setAttribute('data-i18n', categoryKey);
                    title.textContent = getI18nText(categoryKey) || title.textContent;
                }
            }

            Array.from(categoryList.children).forEach((el) => (el.dataset.updated = 'false'));
            Object.entries(COMMON_COMMANDS[categoryKey]).forEach(([keys, descKey]) => {
                const description = getI18nText(descKey, descKey);
                let category = categoryKey.replace('category', '').toLowerCase();
                if (category === 'omnibarprefixes') category = 'omnibar';
                updateOrAppendItem(
                    categoryList,
                    { keys, description },
                    { originalKey: keys, originalDesc: descKey, category },
                );

                if (descKey === 'hintDesc_vp') {
                    let triggerItem = categoryList.querySelector('#preview-trigger-item');
                    if (!triggerItem) {
                        triggerItem = createTriggerKeyItem('preview-trigger-item', 'preview-trigger-key');
                        categoryList.appendChild(triggerItem);
                    }
                    triggerItem.dataset.updated = 'true';
                    const inputEl = triggerItem.querySelector('.preview-trigger-key-input');
                    if (inputEl && document.activeElement !== inputEl) {
                        inputEl.value = linkPreviewTriggerKey;
                    }
                }
            });
            Array.from(categoryList.children).forEach((el) => {
                if (el.dataset.updated === 'false') el.remove();
                else delete el.dataset.updated;
            });
        }
        applyTranslations(builtInContainer);
    };

    const renderAll = async () => {
        if (isRendering) return;
        isRendering = true;

        try {
            await loadData();
            renderCustomCommands();
            renderSnippets();
            renderBlacklist();

            await renderBuiltInCommands();
        } catch (err) {
            console.error('Error in renderAll:', err);
        } finally {
            isRendering = false;
        }
    };

    // --- FORM HANDLERS ---

    const addBlacklistBtn = document.getElementById('add-blacklist-btn');
    if (addBlacklistBtn) {
        const domainInput = document.getElementById('blacklist-domain');
        const tryAddDomain = () => {
            const domain = domainInput.value.trim().toLowerCase();
            if (!domain) {
                showNotification('errorFieldRequired', true);
                return;
            }
            if (linkPreviewBlacklist.includes(domain)) {
                domainInput.classList.add('itg-input-error');
                setTimeout(() => domainInput.classList.remove('itg-input-error'), 1500);
                showNotification('errorTriggerTaken', true);
                return;
            }
            chrome.runtime.sendMessage({ action: 'addLinkPreviewBlacklist', domain });
            domainInput.value = '';
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

    commandForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const keysInput = document.getElementById('command-keys');
        const urlInput = document.getElementById('command-url');
        const descInput = document.getElementById('command-desc');

        const keys = keysInput.value.trim().toLowerCase();
        const url = urlInput.value.trim();
        const description =
            descInput.innerHTML === descInput.getAttribute('data-i18n-placeholder')
                ? ''
                : descInput.dataset.html || descInput.innerHTML;

        if (!keys || !url) {
            showNotification('errorFieldRequired', true);
            return;
        }

        const conflict = getKeyConflictInfo(keys, 'mapping', null, 'global');
        if (conflict) {
            // Force global category for sites
            keysInput.classList.add('error');
            setTimeout(() => keysInput.classList.remove('error'), 1500);
            showNotification('errorTriggerTakenBy', true, [conflict]);
            return;
        }

        // OPTIMIZED: USING HINTCOMMON
        await HintCommon.Commands.add(keys, url, description);

        // CHANGE: Force immediate render
        await renderAll();

        commandForm.reset();
        clearShortcutDesc();
    });

    // --- SNIPPET LOGIC ---
    const triggerInput = document.getElementById('snippet-trigger');
    const expansionInput = document.getElementById('snippet-expansion');
    const varCountInput = document.getElementById('snippet-var-count');
    const varsContainer = document.getElementById('snippet-variables-container');
    const addSnippetBtn = document.getElementById('add-snippet-btn');

    const updateVariablesUI = () => {
        const count = parseInt(varCountInput.value) || 0;

        // Save current state
        const currentValues = [];
        varsContainer.querySelectorAll('.itg-var-row').forEach((row) => {
            currentValues.push({
                id: row.querySelector('.itg-var-id').value,
                word: row.querySelector('.itg-var-word').value,
                def: row.querySelector('.itg-var-default').value,
            });
        });

        varsContainer.innerHTML = '';

        for (let i = 1; i <= count; i++) {
            const prev = currentValues[i - 1] || { id: `$${i}`, word: '', def: '' };

            const row = HintCommon.DOM.create('div', { className: 'itg-var-row' });

            const idInput = HintCommon.DOM.create('input', {
                type: 'text',
                className: 'itg-manage-input itg-var-id itg-var-id-input',
                maxlength: '3',
                placeholder: `$${i}`,
                title: chrome.i18n.getMessage('varIdLabel') || 'ID',
                value: prev.id,
            });

            const wordInput = HintCommon.DOM.create('input', {
                type: 'text',
                className: 'itg-manage-input itg-var-word itg-var-flex-input',
                maxlength: '50',
                placeholder: chrome.i18n.getMessage('placeholderVarWord') || 'Word to replace',
                value: prev.word,
            });

            const defInput = HintCommon.DOM.create('input', {
                type: 'text',
                className: 'itg-manage-input itg-var-default itg-var-flex-input',
                maxlength: '1000',
                placeholder: chrome.i18n.getMessage('placeholderVarDefault') || 'Default value',
                value: prev.def,
            });

            idInput.addEventListener('keydown', HintCommon.preventInputSpace);
            wordInput.addEventListener('input', () => validateVariableWord(wordInput));

            if (prev.word) validateVariableWord(wordInput); // Re-validate when restoring

            row.append(idInput, wordInput, defInput);
            varsContainer.appendChild(row);
        }
    };

    const validateVariableWord = (input) => {
        const word = input.value.trim();
        const currentContent =
            expansionInput.innerHTML === expansionInput.getAttribute('data-i18n-placeholder')
                ? ''
                : expansionInput.dataset.html || expansionInput.innerHTML;
        const expansionText = HintCommon.stripHtml(currentContent);
        if (!HintCommon.validateSnippetVar(word, expansionText)) {
            input.classList.add('itg-input-error');
            input.title = chrome.i18n.getMessage('errorVarWordNotFound');
        } else {
            input.classList.remove('itg-input-error');
            input.title = '';
        }
    };

    if (varCountInput) {
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
    }
    if (expansionInput)
        expansionInput.addEventListener('input', () => {
            varsContainer.querySelectorAll('.itg-var-word').forEach((inp) => validateVariableWord(inp));
        });

    if (addSnippetBtn) {
        addSnippetBtn.addEventListener('click', async () => {
            const trigger = triggerInput.value.trim();
            const expansion =
                expansionInput.innerHTML === expansionInput.getAttribute('data-i18n-placeholder')
                    ? ''
                    : expansionInput.dataset.html || expansionInput.innerHTML;

            if (!trigger || !expansion) {
                showNotification('errorEmptyFields', true);
                return;
            }

            const conflict = getKeyConflictInfo(trigger, 'snippet', null, 'snippet');
            if (conflict) {
                triggerInput.classList.add('itg-input-error');
                setTimeout(() => triggerInput.classList.remove('itg-input-error'), 1500);
                showNotification('errorTriggerTakenBy', true, [conflict]);
                return;
            }

            let hasError = false;
            // Refresh the whole table to ensure order and consistency
            // Track if error is specifically about not found word
            let isWordNotFoundError = false;

            const variables = [];
            const rows = varsContainer.querySelectorAll('.itg-var-row');

            rows.forEach((row) => {
                const idInput = row.querySelector('.itg-var-id');
                const wordInput = row.querySelector('.itg-var-word');
                const defInput = row.querySelector('.itg-var-default');

                const id = idInput.value.trim();
                const word = wordInput.value.trim();
                const def = defInput.value.trim();
                const expansionText = HintCommon.stripHtml(expansion);

                // 1. Use centralized validation
                const validation = HintCommon.validateSnippetVariableRow(id, word, def, expansionText);

                if (!validation.isValid) {
                    hasError = true;
                    // Switch listener
                    // Detect if the specific error is that the word doesn't exist
                    if (validation.errors.word === 'errorVarWordNotFound') {
                        isWordNotFoundError = true;
                    }
                }

                // 2. Helper to apply error class and message (tooltip)
                const setFeedback = (input, errorKey) => {
                    if (errorKey) {
                        input.classList.add('itg-input-error');
                        // Get translated message
                        input.title = chrome.i18n.getMessage(errorKey) || errorKey;
                    } else {
                        input.classList.remove('itg-input-error');
                        input.title = '';
                    }
                };

                // 3. Apply specific feedback to the inputs
                setFeedback(idInput, validation.errors.id);
                setFeedback(wordInput, validation.errors.word);
                setFeedback(defInput, validation.errors.def);

                if (id) variables.push({ id, word, defaultValue: def });
            });

            if (hasError) {
                // If it's not a rename, just add/upsert
                // If we detect that the word is missing, use the specific message 'errorSnippetVarNotFound'
                // Otherwise, use the generic 'errorSnippetIncomplete'
                const errorKey = isWordNotFoundError ? 'errorSnippetVarNotFound' : 'errorSnippetIncomplete';
                showNotification(errorKey, true);
                return;
            }

            // OPTIMIZED: USING HINTCOMMON
            await HintCommon.Snippets.add(trigger, expansion, variables);

            // Force immediate render (Previous correction)
            await renderAll();

            showNotification('snippetAddedSuccess');

            triggerInput.value = '';
            clearSnippetExp();
            varCountInput.value = 0;
            updateVariablesUI();
        });
    }

    // --- INTERACTION ---

    customList.addEventListener('click', async (e) => {
        // CHANGE: Added async
        const deleteBtn = e.target.closest('.delete-command-btn');
        if (deleteBtn) {
            e.stopPropagation();
            const keys = deleteBtn.closest('.command-item').dataset.keys;

            // OPTIMIZED: USING HINTCOMMON
            await HintCommon.Commands.remove(keys); // CHANGE: Added await

            // CHANGE: Force immediate render
            await renderAll();
            return;
        }
    });

    snippetsList.addEventListener('click', async (e) => {
        // CHANGE: Added async
        const deleteBtn = e.target.closest('.delete-command-btn');
        if (deleteBtn) {
            e.stopPropagation();
            const trigger = deleteBtn.dataset.trigger;

            // OPTIMIZED: USING HINTCOMMON
            await HintCommon.Snippets.remove(trigger); // CHANGE: Added await

            // CHANGE: Force immediate render
            await renderAll();
            return;
        }

        const copyBtn = e.target.closest('.itg-copy-snippet-btn-small');
        if (copyBtn) {
            e.stopPropagation();
            // Redundant logic removed in SnippetItem creation, but
            // Adjustment if it goes below the window
            // sometimes it is useful if rendering HTML string instead of DOM elements.
            // Given we use createElement in renderSnippets, the listener there is sufficient, but
            // this block is a "catch-all" for security if something fails in the individual binding.
            // However, since we removed the button in createSnippetItem, this block is now dead code.
            // It is kept for consistency if you decide to put the button back,
            // but functionally now only the footer button acts.
        }
    });

    // --- NOTIFICATION ---
    const utilsForExport = { showNotification };

    // --- IMPORT / EXPORT ---
    const exportBtn = document.getElementById('export-config-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportHintsConfig(utilsForExport));
    }

    const importBtn = document.getElementById('import-config-btn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = async (e) => {
                if (e.target.files.length > 0) {
                    const success = await importHintsConfig(e.target.files[0], utilsForExport);
                    if (success) {
                        await renderAll();
                    }
                    input.value = '';
                }
            };
            input.click();
        });
    }

    // --- RESTORE ---
    restoreButton.addEventListener('click', async () => {
        await saveCustomShortcuts({});
        linkPreviewTriggerKey = '';
        snippetPopupTriggerKey = '$$';
        await chrome.runtime.sendMessage({ action: 'setLinkPreviewTriggerKey', triggerKey: '' });
        await chrome.runtime.sendMessage({ action: 'setSnippetPopupTriggerKey', triggerKey: '$$' });
        syncTriggerKeyInputs('', false, null);
        updateSnippetTriggerDisplays('$$');
        const snippetInput = document.getElementById('snippet-menu-trigger-key');
        if (snippetInput) snippetInput.value = '$$';
        showNotification('restoredDefaults');
    });

    // --- SYNC ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'hintCommandsUpdated' || request.action === 'snippetsUpdated') {
            // No longer needed here as onChanged handles it globally, but kept for direct trigger messages if any
            renderAll();
        }
        if (request.action === 'snippetPopupTriggerKeyUpdated') {
            snippetPopupTriggerKey = request.triggerKey || '$$';
            updateSnippetTriggerDisplays(snippetPopupTriggerKey);
            const snippetInput = document.getElementById('snippet-menu-trigger-key');
            if (snippetInput && document.activeElement !== snippetInput) {
                snippetInput.value = snippetPopupTriggerKey;
            }
        }
    });

    // New storage listener for real-time synchronization between windows
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;

        if (Date.now() < ignoreUpdatesUntil) return;

        if (
            changes[STORAGE_KEYS.COMMANDS] ||
            changes[STORAGE_KEYS.SNIPPETS] ||
            changes[STORAGE_KEYS.CUSTOM_SHORTCUTS] ||
            changes[STORAGE_KEYS.LINK_PREVIEW_BLACKLIST] ||
            changes[STORAGE_KEYS.LINK_PREVIEW_TRIGGER_KEY] ||
            changes[STORAGE_KEYS.SNIPPET_POPUP_TRIGGER_KEY]
        ) {
            // Debounce render if many changes happen fast
            clearTimeout(window._renderTimeout);
            window._renderTimeout = setTimeout(() => {
                renderAll();
            }, 50);
        }
    });

    // Search filter
    const searchInput = document.getElementById('commands-search-input');
    const searchBarContainer = searchInput?.closest('.search-bar-container');

    // Build section list for @ dropdown
    const getSectionList = () => {
        const sections = [];
        document
            .querySelectorAll('.category-container, .omnibar-section-container, .itg-manage-section')
            .forEach((section) => {
                const titleEl = section.querySelector('.category-title, .section-title');
                if (titleEl) {
                    const name = titleEl.textContent.trim();
                    if (name) {
                        const count = section.querySelectorAll('.command-item').length;
                        sections.push({ name, count, el: section });
                    }
                }
            });
        return sections;
    };

    // Create @ section filter dropdown
    let atDropdown = null;
    let atDropdownItems = null;
    let atHighlightIndex = -1;

    const createAtDropdown = () => {
        if (!searchBarContainer) return null;
        let dropdown = searchBarContainer.querySelector('.at-section-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'at-section-dropdown';
            searchBarContainer.appendChild(dropdown);
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
        const current = searchInput.value;
        const atIdx = current.lastIndexOf('@');
        if (atIdx >= 0) {
            searchInput.value = current.substring(0, atIdx) + '@' + sectionName;
        } else {
            searchInput.value = (current ? current + ' ' : '') + '@' + sectionName;
        }
        hideAtDropdown();
        applySearchFilter();
        searchInput.focus();
    };

    const applySearchFilter = () => {
        const query = searchInput.value;
        const lowerQuery = query.toLowerCase().trim();

        // Extract @ section filter
        let sectionFilter = null;
        const atIdx = query.lastIndexOf('@');
        if (atIdx >= 0) {
            sectionFilter = query.substring(atIdx + 1).trim();
        }

        // Filter items by text content
        HintCommon.filterItems(query, document.querySelectorAll('.command-item'), {
            onComplete: () => {
                document
                    .querySelectorAll('.category-container, .omnibar-section-container, .itg-manage-section')
                    .forEach((section) => {
                        const items = section.querySelectorAll('.command-item');
                        const hasVisible = Array.from(items).some((el) => el.style.display !== 'none');

                        // Check if section title matches query
                        const titleEl = section.querySelector('.category-title, .section-title');
                        let titleMatch = false;
                        if (titleEl && lowerQuery) {
                            titleMatch = titleEl.textContent.toLowerCase().includes(lowerQuery);
                        }

                        // Check if @ section filter matches this section
                        let sectionFilterMatch = false;
                        if (sectionFilter && titleEl) {
                            sectionFilterMatch = titleEl.textContent
                                .toLowerCase()
                                .includes(sectionFilter.toLowerCase());
                        }

                        const show = !lowerQuery || hasVisible || titleMatch || sectionFilterMatch;
                        section.style.display = show ? '' : 'none';

                        // If section title matches or @ filter matches, show all items
                        if (show && (titleMatch || sectionFilterMatch)) {
                            items.forEach((item) => {
                                item.style.display = '';
                            });
                        }
                    });
            },
        });

        // Update scroll buttons visibility after filter
        if (scrollButtonsContainer) {
            const scrollableEl = document.querySelector('.content-scroll');
            if (scrollableEl) {
                const scrollableDistance = scrollableEl.scrollHeight - scrollableEl.clientHeight;
                scrollButtonsContainer.classList.toggle('visible', scrollableDistance > 0);
            }
        }
    };

    searchInput.addEventListener('input', () => {
        const val = searchInput.value;
        const atIdx = val.lastIndexOf('@');
        if (atIdx >= 0) {
            const afterAt = val.substring(atIdx + 1);
            showAtDropdown(afterAt);
        } else {
            hideAtDropdown();
        }
        applySearchFilter();
    });

    // Keyboard navigation for @ dropdown
    searchInput.addEventListener('keydown', (e) => {
        if (!atDropdown || !atDropdown.classList.contains('visible')) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (atDropdownItems && atDropdownItems.length > 0) {
                atHighlightIndex = Math.min(atHighlightIndex + 1, atDropdownItems.length - 1);
                atDropdownItems.forEach((el, i) => el.classList.toggle('highlighted', i === atHighlightIndex));
                if (atDropdownItems[atHighlightIndex]) {
                    atDropdownItems[atHighlightIndex].scrollIntoView({ block: 'nearest' });
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (atDropdownItems && atDropdownItems.length > 0) {
                atHighlightIndex = Math.max(atHighlightIndex - 1, 0);
                atDropdownItems.forEach((el, i) => el.classList.toggle('highlighted', i === atHighlightIndex));
                if (atDropdownItems[atHighlightIndex]) {
                    atDropdownItems[atHighlightIndex].scrollIntoView({ block: 'nearest' });
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

    // Hide dropdown on blur (with delay to allow click)
    searchInput.addEventListener('blur', () => {
        setTimeout(hideAtDropdown, 200);
    });

    renderAll();

    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area === 'local' && changes['preferred-language']) {
            await refreshI18nMessages();
            await renderBuiltInCommands();
            await applyTranslations();
        }
    });

    // Focus search input on load
    if (searchInput) searchInput.focus();

    // Floating scroll buttons
    const scrollUpBtn = document.getElementById('itg-scroll-up');
    const scrollDownBtn = document.getElementById('itg-scroll-down');
    const scrollButtonsContainer = document.querySelector('.itg-scroll-buttons-float');
    const scrollableElement = document.querySelector('.content-scroll');
    const scrollEventTarget = scrollableElement || window;
    const scrollActionTarget = scrollableElement || window;

    if (scrollUpBtn && scrollDownBtn && scrollButtonsContainer) {
        const updateScrollButtons = () => {
            let scrollTop, scrollHeight, clientHeight;
            if (scrollableElement) {
                scrollTop = scrollableElement.scrollTop;
                scrollHeight = scrollableElement.scrollHeight;
                clientHeight = scrollableElement.clientHeight;
            } else {
                scrollTop = window.scrollY || document.documentElement.scrollTop;
                scrollHeight = document.documentElement.scrollHeight;
                clientHeight = window.innerHeight;
            }

            const scrollableDistance = scrollHeight - clientHeight;

            if (scrollableDistance > 0) {
                scrollButtonsContainer.classList.add('visible');
                if (scrollTop < 10) {
                    scrollUpBtn.classList.add('itg-display-none');
                    scrollUpBtn.classList.remove('itg-display-flex');
                } else {
                    scrollUpBtn.classList.remove('itg-display-none');
                    scrollUpBtn.classList.add('itg-display-flex');
                }
                if (scrollTop >= scrollableDistance - 10) {
                    scrollDownBtn.classList.add('itg-display-none');
                    scrollDownBtn.classList.remove('itg-display-flex');
                } else {
                    scrollDownBtn.classList.remove('itg-display-none');
                    scrollDownBtn.classList.add('itg-display-flex');
                }
            } else {
                scrollButtonsContainer.classList.remove('visible');
            }
        };

        scrollUpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            scrollActionTarget.scrollTo({ top: 0, behavior: 'smooth' });
        });

        scrollDownBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetHeight = scrollableElement
                ? scrollableElement.scrollHeight
                : document.documentElement.scrollHeight;
            scrollActionTarget.scrollTo({ top: targetHeight, behavior: 'smooth' });
        });

        scrollEventTarget.addEventListener('scroll', updateScrollButtons);
        window.addEventListener('resize', updateScrollButtons);

        setTimeout(updateScrollButtons, 100);
        requestAnimationFrame(updateScrollButtons);
    }
    // --- SNIPPET HELP MODAL ---
    const snippetHelpBtn = document.getElementById('snippet-help-btn');
    const snippetHelpModal = document.getElementById('snippet-help-modal');
    const closeSnippetHelpBtn = document.getElementById('close-snippet-help');

    if (snippetHelpBtn && snippetHelpModal && closeSnippetHelpBtn) {
        const toggleHelpModal = (show) => {
            if (show) {
                updateSnippetTriggerDisplays(snippetPopupTriggerKey || '$$');
                snippetHelpModal.classList.add('visible');
            } else {
                snippetHelpModal.classList.remove('visible');
            }
        };

        snippetHelpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleHelpModal(true);
        });

        closeSnippetHelpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleHelpModal(false);
        });

        snippetHelpModal.addEventListener('click', (e) => {
            if (e.target === snippetHelpModal) {
                toggleHelpModal(false);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && snippetHelpModal.classList.contains('visible')) {
                toggleHelpModal(false);
            }
        });
    }
}
