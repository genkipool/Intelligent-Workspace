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
    import SidePanelHeader from '../../components/common/SidePanelHeader.svelte';
    import SnippetsSection from './components/SnippetsSection.svelte';
    import BlacklistSection from './components/BlacklistSection.svelte';
    import VideoPipSection from './components/VideoPipSection.svelte';
    import YoutubeLoopSection from './components/YoutubeLoopSection.svelte';
    import AllowRightClickSection from './components/AllowRightClickSection.svelte';
    import ReaderSection from './components/ReaderSection.svelte';
    import VoiceSection from './components/VoiceSection.svelte';
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

    /**
     * `?section=` brings the page up already looking at what the caller cares about —
     * the reader's own settings button opens it that way. It waits a beat because the
     * command list below is built by `initCustomizeHints()` and until it is there the
     * page has no height to scroll through.
     */
    function scrollToRequestedSection() {
        const wanted = new URLSearchParams(location.search).get('section');
        if (!wanted) return;
        setTimeout(() => {
            const target = document.getElementById(`${wanted}-settings`);
            target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 400);
    }

    onMount(() => {
        initNumberSpinnerArrows();
        initCustomizeHints();
        scrollToRequestedSection();

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

    /**
     * The one navigation button this page has. The id is what `customize_hints.js`
     * looks up to attach its handler, and the classes are the ones the group list and
     * the themes page use for the same button.
     */
    const headerActions = [
        {
            id: 'home-btn',
            class: 'home-button header-action-btn',
            i18nTitle: 'backToHome',
            i18nAriaLabel: 'backToHome',
        },
    ];
</script>

<!-- Drawn here rather than pointed at a sprite: this page has no icon sheet. -->
{#snippet homeIcon()}
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
{/snippet}

<div class="container option-page">
    <Notification />
    <!-- The bar every other page of this extension wears. It had the same markup but
         none of the styling — this page's stylesheet never defined `.header` — which
         is why its one button sat unstyled and out of place. -->
    <SidePanelHeader
        title=""
        titleClass=""
        titleI18n="customizeCommandsTitle"
        headerClass="header"
        actionsClass="header-actions"
        actions={headerActions}
        icons={{ 'home-btn': homeIcon }}
    />

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

        <!-- Snippets Section -->
        <SnippetsSection />

        <!-- Link Preview Blacklist Section -->
        <BlacklistSection {previewToggleTitle} {linkPreviewEnabled} onToggleLinkPreview={toggleLinkPreview} />

        <!-- Picture-in-Picture (Video) -->
        <VideoPipSection />

        <!-- YouTube Loop -->
        <YoutubeLoopSection />

        <!-- Right-click and copying -->
        <AllowRightClickSection />

        <!-- Page reader -->
        <ReaderSection />

        <!-- Reading voice -->
        <VoiceSection />

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
