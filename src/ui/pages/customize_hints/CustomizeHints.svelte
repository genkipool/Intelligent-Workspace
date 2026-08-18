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
    import { getCurrentLang, loadMessages, resolveMessage } from '../../../utils/i18n.js';
    import SiteShortcutsSection from './components/SiteShortcutsSection.svelte';
    import SnippetsSection from './components/SnippetsSection.svelte';
    import BlacklistSection from './components/BlacklistSection.svelte';
    import AutoPipSection from './components/AutoPipSection.svelte';
    import SnippetHelpModal from './components/SnippetHelpModal.svelte';
    import Notification from '../../components/common/Notification.svelte';

    // Link preview on/off. The same flag the keyboard shortcut and the context menu
    // toggle, so all three always agree.
    let linkPreviewEnabled = $state(true);
    let previewToggleTitle = $state('');

    async function updateToggleTitle() {
        const key = linkPreviewEnabled ? 'linkPreviewToggleDisable' : 'linkPreviewToggleEnable';
        try {
            const lang = await getCurrentLang();
            const messages = await loadMessages(lang);
            const message = resolveMessage(messages[key], [], 'message');
            previewToggleTitle =
                message ||
                chrome.i18n.getMessage(key) ||
                (linkPreviewEnabled ? 'Disable link preview' : 'Enable link preview');
        } catch {
            previewToggleTitle =
                chrome.i18n.getMessage(key) || (linkPreviewEnabled ? 'Disable link preview' : 'Enable link preview');
        }
    }

    async function toggleLinkPreview(event) {
        const enabled = event.currentTarget.checked;
        linkPreviewEnabled = enabled;
        await updateToggleTitle();
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
        const onStorageChanged = (changes, area) => {
            if (area === 'local' && (changes.linkPreviewEnabled || changes['preferred-language'])) {
                if (changes.linkPreviewEnabled) {
                    linkPreviewEnabled = changes.linkPreviewEnabled.newValue !== false;
                }
                updateToggleTitle();
            }
        };
        chrome.storage.onChanged.addListener(onStorageChanged);
        return () => chrome.storage.onChanged.removeListener(onStorageChanged);
    });
</script>

<div class="container option-page">
    <Notification />
    <header class="header">
        <h1 data-i18n="customizeCommandsTitle"></h1>
        <button
            type="button"
            id="home-btn"
            class="header-button"
            data-i18n-title="backToHome"
            data-i18n-aria-label="backToHome"
        >
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
        <SiteShortcutsSection />

        <!-- Automatic Picture-in-Picture -->
        <AutoPipSection />

        <!-- Snippets Section -->
        <SnippetsSection />

        <!-- Link Preview Blacklist Section -->
        <BlacklistSection {previewToggleTitle} {linkPreviewEnabled} onToggleLinkPreview={toggleLinkPreview} />

        <div class="itg-scroll-buttons-float">
            <button id="itg-scroll-up" type="button" data-i18n-aria-label="scrollToTop">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-linecap="square"></path>
                </svg>
            </button>
            <button id="itg-scroll-down" type="button" data-i18n-aria-label="scrollToBottom">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <path d="M6 9L12 15L18 9" stroke="var(--text-color)" stroke-linecap="square"></path>
                </svg>
            </button>
        </div>

        <!-- Snippet Help Modal -->
        <SnippetHelpModal />
    </main>
    <section class="space"></section>

    <footer class="footer-fixed">
        <button
            type="button"
            id="restore-defaults-btn"
            class="button button-danger"
            data-i18n="resetClusterDefaults"
            data-i18n-title="restoreDefaultsTitle"
        ></button>
        <button type="button" id="export-config-btn" class="button button-secondary" data-i18n="exportConfig"
            >Export</button
        >
        <button type="button" id="import-config-btn" class="button button-secondary" data-i18n="importConfig"
            >Import</button
        >
    </footer>
</div>
