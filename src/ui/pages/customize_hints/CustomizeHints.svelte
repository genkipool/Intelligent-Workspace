<script>
    /**
     * Keyboard navigation & snippets page.
     *
     * The markup is the page shell; every list is rendered and wired by
     * initCustomizeHints(), which owns commands, snippets, blacklist, search,
     * import/export and the storage synchronisation.
     */
    import { onMount } from 'svelte';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    import { initCustomizeHints } from './customize_hints.js';

    // Link preview on/off. The same flag the keyboard shortcut and the context menu
    // toggle, so all three always agree.
    let linkPreviewEnabled = $state(true);
    let previewToggleTitle = $state('');

    function updateToggleTitle() {
        const key = linkPreviewEnabled ? 'linkPreviewToggleDisable' : 'linkPreviewToggleEnable';
        const message = chrome.i18n.getMessage(key);
        previewToggleTitle = message || (linkPreviewEnabled ? 'Disable link preview' : 'Enable link preview');
    }

    async function toggleLinkPreview(event) {
        const enabled = event.currentTarget.checked;
        linkPreviewEnabled = enabled;
        updateToggleTitle();
        try {
            await chrome.runtime.sendMessage({ action: 'toggleLinkPreview', enabled });
        } catch {
            /* the background may be asleep; the stored flag below is what is read */
        }
    }

    onMount(() => {
        initNumberSpinnerArrows();
        initCustomizeHints();

        chrome.storage.local.get(['linkPreviewEnabled'], (data) => {
            linkPreviewEnabled = data.linkPreviewEnabled !== false;
            updateToggleTitle();
        });
        // Kept in step with the shortcut, the context menu and any other window.
        const onStorageChanged = (changes) => {
            if (!changes.linkPreviewEnabled) return;
            linkPreviewEnabled = changes.linkPreviewEnabled.newValue !== false;
            updateToggleTitle();
        };
        chrome.storage.onChanged.addListener(onStorageChanged);
        return () => chrome.storage.onChanged.removeListener(onStorageChanged);
    });
</script>

<div class="container option-page">
    <header class="header">
        <h1 data-i18n="customizeCommandsTitle"></h1>
        <button id="home-btn" class="header-button" data-i18n-title="backToHome" data-i18n-aria-label="backToHome">
            <svg
                width="20"
                height="20"
                viewBox="2 2 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
            >
                <g stroke-width="0"></g>
                <g stroke-linecap="round" stroke-linejoin="round"></g>
                <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="m12 3.188 9.45 7.087-.45 1.35h-.75v8.625H3.75v-8.625H3l-.45-1.35zm-6.75 6.937v8.625h13.5v-8.625L12 5.063z"
                    fill="var(--text-color)"
                ></path>
            </svg>
        </button>
    </header>

    <main class="content-scroll">
        <!-- Search bar for filtering commands -->
        <div class="search-bar-container">
            <input
                type="search"
                id="commands-search-input"
                class="search-input"
                data-i18n-placeholder="searchCommandsPlaceholder"
                autocomplete="off"
                spellcheck="false"
            />
        </div>
        <!-- Comandos Personalizados -->
        <!-- Comandos Personalizados (Site Shortcuts) -->
        <!-- Comandos Integrados -->
        <section class="section">
            <div id="built-in-categories"></div>
            <!-- Omnibar Prefixes -->
            <div class="omnibar-section-container">
                <h3 class="category-title" data-i18n="categoryOmnibarPrefixes">Omnibar Prefixes</h3>
                <ul id="omnibar-prefixes-list" class="commands-list"></ul>
            </div>
        </section>

        <!-- Comandos Personalizados (Site Shortcuts) -->
        <section class="section itg-manage-section">
            <div class="section-header">
                <h2 class="section-title" data-i18n="manageCustomSitesTitle">Manage Site Shortcuts</h2>
            </div>
            <form id="add-command-form" class="itg-manage-form">
                <div class="form-group-inline shortcuts-grid">
                    <input
                        type="text"
                        id="command-keys"
                        class="itg-manage-input"
                        required
                        autocomplete="off"
                        spellcheck="false"
                        data-i18n-placeholder="placeholderKey"
                    />
                    <input
                        type="url"
                        id="command-url"
                        class="itg-manage-input"
                        required
                        autocomplete="off"
                        spellcheck="false"
                        data-i18n-placeholder="placeholderUrl"
                    />
                    <div class="command-description-wrapper">
                        <div
                            id="command-desc"
                            class="itg-manage-input"
                            contenteditable="true"
                            data-i18n-placeholder="placeholderDesc"
                        ></div>
                    </div>
                    <button type="submit" class="button add-btn" data-i18n-title="addCommandButton">+</button>
                </div>
            </form>
            <ul id="custom-commands-list" class="commands-list itg-manage-list"></ul>
            <p id="no-commands-message" class="no-commands-message" data-i18n="noCustomCommands"></p>
        </section>

        <!-- Snippets Section -->
        <section class="section itg-manage-section snippet-section">
            <div class="section-header">
                <div class="section-header-alignment">
                    <h2 class="section-title" data-i18n="manageSnippetsTitle">Manage Snippets</h2>
                    <button id="snippet-help-btn" class="icon-btn help-btn" data-i18n-aria-label="help">
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="manage-form-container">
                <div class="form-group-inline snippet-form-row">
                    <input
                        type="text"
                        id="snippet-trigger"
                        class="itg-manage-input snippet-trigger-input"
                        required
                        autocomplete="off"
                        spellcheck="false"
                        data-i18n-placeholder="placeholderTrigger"
                        maxlength="5"
                    />

                    <div class="snippet-expansion-wrapper">
                        <div
                            id="snippet-expansion"
                            class="itg-manage-input snippet-expansion-input"
                            contenteditable="true"
                            data-i18n-placeholder="placeholderExpansion"
                        ></div>
                    </div>

                    <div class="input-with-label snippet-var-count-container">
                        <input
                            type="number"
                            id="snippet-var-count"
                            class="itg-manage-input snippet-var-count-input"
                            min="0"
                            max="50"
                            value="0"
                        />
                    </div>
                    <button id="add-snippet-btn" class="button add-btn snippet-add-btn">+</button>
                </div>

                <div id="snippet-variables-container" class="snippet-vars-container"></div>

                <div class="snippet-preview-container itg-display-none">
                    <span id="snippet-copy-preview"></span>
                    <span id="snippet-copy-feedback" data-i18n="copied">Copied!</span>
                    <button id="snippet-copy-btn" type="button"></button>
                </div>
            </div>
            <ul id="snippets-list" class="commands-list itg-manage-list"></ul>
        </section>

        <!-- Link Preview Blacklist Section -->
        <section class="section itg-manage-section blacklist-section">
            <div class="section-header">
                <div class="section-header-alignment">
                    <h2 class="section-title" data-i18n="managePreviewBlacklistTitle">Link Preview Blacklist</h2>
                    <!-- The blacklist decides where previews are suppressed; this switch
                         decides whether they happen at all. -->
                    <label class="switch preview-toggle" id="link-preview-toggle-label" title={previewToggleTitle}>
                        <input
                            type="checkbox"
                            id="link-preview-toggle"
                            tabindex="0"
                            aria-label={previewToggleTitle}
                            checked={linkPreviewEnabled}
                            onchange={toggleLinkPreview}
                        />
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            <div class="manage-form-container">
                <div class="form-group-inline" style="display: flex; gap: 8px;">
                    <input
                        type="text"
                        id="blacklist-domain"
                        class="itg-manage-input"
                        required
                        autocomplete="off"
                        spellcheck="false"
                        data-i18n-placeholder="placeholderDomain"
                        style="flex: 1;"
                    />
                    <button id="add-blacklist-btn" class="button add-btn">+</button>
                </div>
            </div>
            <ul id="blacklist-list" class="commands-list itg-manage-list"></ul>
        </section>

        <div class="itg-scroll-buttons-float">
            <button id="itg-scroll-up" data-i18n-aria-label="scrollToTop">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-linecap="square"></path>
                </svg>
            </button>
            <button id="itg-scroll-down" data-i18n-aria-label="scrollToBottom">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path d="M6 9L12 15L18 9" stroke="var(--text-color)" stroke-linecap="square"></path>
                </svg>
            </button>
        </div>

        <!-- Snippet Help Modal -->
        <div id="snippet-help-modal" class="snippet-help-modal">
            <div class="snippet-help-modal-content">
                <div class="snippet-help-modal-header">
                    <h2 data-i18n="snippetHelpTitle"></h2>
                    <button id="close-snippet-help" class="snippet-help-close-btn">&times;</button>
                </div>
                <div class="snippet-help-modal-body">
                    <section class="help-section">
                        <h3 data-i18n="snippetHelpIntroTitle"></h3>
                        <p data-i18n="snippetHelpIntroDesc"></p>
                        <div class="itg-info-note">
                            <span class="label label-inline" data-i18n="snippetHelpVarNoteLabel"></span>
                            <span data-i18n="snippetHelpVarNote"></span>
                        </div>
                    </section>

                    <div class="help-divider"></div>

                    <section class="help-section">
                        <h3 data-i18n="snippetHelpBasicTitle"></h3>
                        <p data-i18n="sh_basic_desc" class="help-section-desc"></p>
                        <div class="example-box">
                            <div class="example-row">
                                <span class="label" data-i18n="sh_trigger"></span>
                                <code>/hi</code>
                            </div>
                            <div class="example-row">
                                <span class="label" data-i18n="sh_expansion"></span>
                                <span
                                    ><span data-i18n="sh_exp_hi"></span><span data-i18n="sh_juan"></span><span
                                        data-i18n="sh_exp_how_are_you"
                                    ></span></span
                                >
                            </div>
                            <div class="example-usage">
                                <div class="usage-row">
                                    <span class="label" data-i18n="sh_usage"></span>
                                    <code>/hi</code> <span data-i18n="sh_plus_space"></span>
                                </div>
                                <div class="usage-row">
                                    <span class="label" data-i18n="sh_result"></span>
                                    <span data-i18n="sh_basic_res"></span>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="help-section">
                        <h3 data-i18n="snippetHelpOneVarTitle"></h3>
                        <p data-i18n="sh_var_desc" class="help-section-desc"></p>
                        <div class="example-box">
                            <div class="example-row">
                                <span class="label" data-i18n="sh_trigger"></span>
                                <code>/hi</code>
                            </div>
                            <div class="example-row">
                                <span class="label" data-i18n="sh_expansion"></span>
                                <span
                                    ><span data-i18n="sh_exp_hi"></span><span class="var-highlight" data-i18n="sh_juan"
                                    ></span><span data-i18n="sh_exp_free_tomorrow"></span></span
                                >
                            </div>
                            <div class="variable-details">
                                <div class="var-row">
                                    <span class="label" data-i18n="sh_id_label"></span><span class="id_var">$1</span>
                                </div>
                                <div class="var-row">
                                    <span class="label" data-i18n="sh_var_label_1"></span>
                                    <span class="var-highlight" data-i18n="sh_juan"></span>
                                </div>
                                <div class="var-row">
                                    <span class="label" data-i18n="sh_def_label"></span>
                                    <span class="value_default" data-i18n="sh_juan"></span>
                                </div>
                            </div>
                            <div class="example-usage">
                                <div class="usage-group">
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_usage"></span>
                                        <code>/hi</code> <span data-i18n="sh_plus_space"></span>
                                    </div>
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_result"></span>
                                        <span data-i18n="sh_var_res1"></span>
                                    </div>
                                </div>
                                <div class="usage-group">
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_usage"></span>
                                        <code>/hi$1Alvaro</code> <span data-i18n="sh_plus_space"></span>
                                    </div>
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_result"></span>
                                        <span data-i18n="sh_var_res2"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="help-section">
                        <h3 data-i18n="snippetHelpMultiVarTitle"></h3>
                        <p data-i18n="sh_multivar_desc" class="help-section-desc"></p>
                        <div class="example-box">
                            <div class="example-row">
                                <span class="label" data-i18n="sh_trigger"></span>
                                <code>/hi</code>
                            </div>
                            <div class="example-row">
                                <span class="label" data-i18n="sh_expansion"></span>
                                <span
                                    ><span data-i18n="sh_exp_hi"></span><span class="var-highlight" data-i18n="sh_juan"
                                    ></span><span data-i18n="sh_exp_free_prefix"></span><span
                                        class="var-highlight"
                                        data-i18n="sh_tomorrow"
                                    ></span><span data-i18n="sh_exp_question">?</span></span
                                >
                            </div>
                            <div class="variable-details">
                                <div class="var-row">
                                    <span class="label" data-i18n="sh_id_label"></span><span class="id_var">$1</span>
                                </div>
                                <div class="var-row">
                                    <span class="label" data-i18n="sh_var_label_1"></span>
                                    <span class="var-highlight" data-i18n="sh_juan"></span>
                                </div>
                                <div class="var-row">
                                    <span class="label" data-i18n="sh_def_label"></span>
                                    <span class="value_default" data-i18n="sh_juan"></span>
                                </div>
                                <br />
                                <div class="var-row">
                                    <span class="label" data-i18n="sh_id_label"></span>
                                    <span class="id_var">$2</span>
                                </div>
                                <div class="var-row">
                                    <span class="label" data-i18n="sh_var_label_2"></span>
                                    <span class="var-highlight" data-i18n="sh_tomorrow"></span>
                                </div>
                                <div class="var-row">
                                    <span class="label" data-i18n="sh_def_label"></span>
                                    <span class="value_default" data-i18n="sh_tomorrow"></span>
                                </div>
                            </div>
                            <div class="example-usage">
                                <div class="usage-group">
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_usage"></span>
                                        <code>/hi</code> <span data-i18n="sh_plus_space"></span>
                                    </div>
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_result"></span>
                                        <span data-i18n="sh_multivar_res1"></span>
                                    </div>
                                </div>
                                <div class="usage-group">
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_usage"></span>
                                        <code>/hi$1Alvaro</code> <span data-i18n="sh_plus_space"></span>
                                    </div>
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_result"></span>
                                        <span data-i18n="sh_multivar_res2"></span>
                                    </div>
                                </div>
                                <div class="usage-group">
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_usage"></span>
                                        <code>/hi$1Alvaro$2today</code> <span data-i18n="sh_plus_space"></span>
                                    </div>
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_result"></span>
                                        <span data-i18n="sh_multivar_res3"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="help-section">
                        <h3 data-i18n="snippetHelpSpacesTitle">Example with Multiple Variables and Spaces</h3>
                        <p data-i18n="sh_spaces_desc" class="help-section-desc-spaced"></p>
                        <div class="example-box">
                            <div class="example-usage">
                                <div class="usage-group">
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_usage">Usage:</span>
                                        <code>/hi$1Alvaro$2to__go__for__a__coffee</code>
                                        <span data-i18n="sh_plus_space">+ Space</span>
                                    </div>
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_result">Result:</span>
                                        <span data-i18n="sh_space_res"
                                            >Hello Alvaro, are you free to go for a coffee?</span
                                        >
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="help-section">
                        <h3 data-i18n="snippetHelpPopupTitle">Quick Access Popup</h3>
                        <p class="help-section-text">
                            <span data-i18n="snippetHelpPopupDescPrefix">Type</span>
                            <code>$$</code>
                            <span data-i18n="snippetHelpPopupDescSuffix"
                                >in any text field to open a menu with your top 5 most used snippets.</span
                            >
                        </p>
                    </section>

                    <section class="help-section">
                        <h3 data-i18n="snippetHelpForcePlainTitle">Force Plain Text</h3>
                        <p data-i18n="sh_force_plain_desc" class="help-section-desc"></p>
                        <div class="example-box">
                            <div class="example-row">
                                <span class="label" data-i18n="sh_trigger"></span>
                                <code>/hi</code>
                            </div>
                            <div class="example-row">
                                <span class="label" data-i18n="sh_expansion"></span>
                                <span
                                    ><span data-i18n="sh_exp_hi"></span><b><span data-i18n="sh_juan"></span></b><span
                                        data-i18n="sh_exp_how_are_you"
                                    ></span></span
                                >
                            </div>
                            <div class="example-usage">
                                <div class="usage-group">
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_usage"></span>
                                        <code>/hi</code> <span data-i18n="sh_plus_space"></span>
                                    </div>
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_result"></span>
                                        <span data-i18n="sh_force_plain_res_with"></span>
                                    </div>
                                </div>
                                <div class="usage-group">
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_usage"></span>
                                        <code>/hi#</code> <span data-i18n="sh_plus_space"></span>
                                    </div>
                                    <div class="usage-row">
                                        <span class="label" data-i18n="sh_result"></span>
                                        <span data-i18n="sh_force_plain_res_without"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </main>
    <section class="space"></section>

    <footer class="footer-fixed">
        <button
            id="restore-defaults-btn"
            class="button button-danger"
            data-i18n="resetClusterDefaults"
            data-i18n-title="restoreDefaultsTitle"
        ></button>
        <button id="export-config-btn" class="button button-secondary" data-i18n="exportConfig">Export</button>
        <button id="import-config-btn" class="button button-secondary" data-i18n="importConfig">Import</button>
    </footer>
</div>
