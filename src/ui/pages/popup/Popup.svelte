<script>
    /* global chrome */
    import { onMount, onDestroy } from 'svelte';
    import { t, tt } from '../../stores/i18nStore.js';
    import { i18nStore } from '../../stores/i18nStore.js';
    import { themeStore } from '../../stores/themeStore.js';
    import { settingsStore } from '../../stores/settingsStore.js';
    import { initializeKeyboardNavigation } from '../../../utils/keyboardNav.js';
    import ThemeSelector from '../../components/common/ThemeSelector.svelte';
    import SettingsSection from '../../components/common/SettingsSection.svelte';
    import DonationSection from '../../components/common/DonationSection.svelte';
    import FeedbackSection from '../../components/common/FeedbackSection.svelte';
    import Notification from '../../components/common/Notification.svelte';

    let shortcuts = [];
    let port = null;
    let isSidePanel = false;
    let contextsCache = null;

    onMount(async () => {
        await i18nStore.init();
        await themeStore.init();
        await settingsStore.init();

        initializeKeyboardNavigation();

        const urlParams = new URLSearchParams(window.location.search);
        isSidePanel = urlParams.get('context') === 'sidepanel';

        const commands = await chrome.commands.getAll();
        shortcuts = [
            { id: 'Collapse/Expand All Tabs', nameKey: 'collapseAllGroups', command: 'toggle-all-groups' },
            { id: 'Collapse/Expand Current Tabs', nameKey: 'collapseCurrentGroup', command: 'toggle-current-group' },
            { id: 'Toggle Alphabetical Sorting', nameKey: 'toggleAlphabeticalSort', command: 'toggle-sort-alpha' },
        ].map((s) => {
            const cmd = commands.find((c) => c.name === s.command);
            return { ...s, key: cmd?.shortcut || null };
        });

        if (!isSidePanel) {
            contextsCache =
                typeof chrome.runtime.getContexts === 'function'
                    ? await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })
                    : [];
            if (contextsCache.length > 0) {
                const { isPinned, isListGroupPinned, isGeminiPinned } = await chrome.storage.local.get([
                    'isPinned',
                    'isListGroupPinned',
                    'isGeminiPinned',
                ]);
                if (isGeminiPinned) {
                    window.location.replace('../listGroup/listGroup.html?view=gemini');
                    return;
                }
                if (isPinned) {
                    window.location.replace('../rules/rules.html');
                    return;
                }
                if (isListGroupPinned) {
                    window.location.replace('../listGroup/listGroup.html');
                    return;
                }
            }
        }

        port = chrome.runtime.connect({ name: isSidePanel ? 'sidepanel-connection' : 'popup-connection' });
        port.postMessage({ path: 'src/ui/pages/popup/popup.html' });
        chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: 'src/ui/pages/popup/popup.html' });
    });

    onDestroy(() => {
        if (port) {
            try {
                port.disconnect();
            } catch {
                /* ignore */
            }
        }
    });

    function handleThemeNavigate() {
        handleNavigation(
            null,
            '../savedThemes/savedThemes.html',
            'src/ui/pages/savedThemes/savedThemes.html',
            '../popup/popup.html',
        );
    }

    async function handleNavigation(event, popupUrl, sidePanelUrl, sourcePath) {
        if (event) event.preventDefault();
        if (contextsCache === null) {
            contextsCache =
                typeof chrome.runtime.getContexts === 'function'
                    ? await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })
                    : [];
        }
        const hasSidePanel = contextsCache.length > 0;
        const joinCharPopup = popupUrl.includes('?') ? '&' : '?';
        const joinCharSide = sidePanelUrl.includes('?') ? '&' : '?';

        await chrome.storage.local.set({
            navSource: `${sourcePath}${sourcePath.includes('?') ? '&' : '?'}context=sidepanel`,
        });
        const currentWin = await chrome.windows.getCurrent();
        const isPopupWindow = currentWin.type === 'popup';

        if (isSidePanel || hasSidePanel || isPopupWindow || (event && event.ctrlKey)) {
            window.location.href = `${popupUrl}${joinCharPopup}context=sidepanel`;
            if (isSidePanel) {
                chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: popupUrl });
            }
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
                if (tab) {
                    chrome.sidePanel.setOptions({
                        path: `${sidePanelUrl}${joinCharSide}context=sidepanel`,
                        enabled: true,
                    });
                    chrome.sidePanel.open({ windowId: tab.windowId });
                    window.close();
                }
            });
        }
    }

    function openRules(e) {
        handleNavigation(e, '../rules/rules.html', 'src/ui/pages/rules/rules.html', '../popup/popup.html');
    }
    function openListGroup(e) {
        handleNavigation(
            e,
            '../listGroup/listGroup.html',
            'src/ui/pages/listGroup/listGroup.html',
            '../popup/popup.html',
        );
    }
    function openGemini(e) {
        handleNavigation(
            e,
            '../listGroup/listGroup.html?view=gemini',
            'src/ui/pages/listGroup/listGroup.html?view=gemini',
            '../popup/popup.html',
        );
    }

    const shortcutDescriptions = {
        'Collapse/Expand All Tabs': 'Collapse/Expand All Groups',
        'Collapse/Expand Current Tabs': 'Collapse/Expand Current Groups',
        'Toggle Alphabetical Sorting': 'Toggle Alphabetical Sorting',
    };

    function getShortcutDesc(keyName) {
        return shortcutDescriptions[keyName] || keyName;
    }

    function openShortcutSettings(shortcutId) {
        const desc = encodeURIComponent(getShortcutDesc(shortcutId));
        chrome.tabs.create({ url: `chrome://extensions/shortcuts#:~:text=${desc}` });
    }
</script>

<svg style="display: none;" aria-hidden="true">
    <defs>
        <g id="icon-rules" fill="currentColor">
            <circle cx="2.5" cy="4" r="1.5"></circle>
            <circle cx="2.5" cy="12" r="1.5"></circle>
            <circle cx="2.5" cy="20" r="1.5"></circle>
            <path d="M9 4h13" stroke-width="3" fill="none"></path>
            <path d="M9 12h13" stroke-width="3" fill="none"></path>
            <path d="M9 20h13" stroke-width="3" fill="none"></path>
        </g>
        <g id="icon-list-group">
            <path
                fill="currentColor"
                d="M136 24H16v120h120Zm-32 88H48V56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm72-440.002h320v32H176zm0 88h256v32H176zm0 88h320v32H176zm0 88h256v32H176zm0 176h256v32H176zm0-88h320v32H176z"
            ></path>
        </g>
        <g id="icon-gemini">
            <path
                fill="currentColor"
                d="M235.5 471q0-48.866-18.84-91.845-18.252-42.978-50.044-74.771T91.845 254.34Q48.867 235.5 0 235.5q48.867 0 91.845-18.251 42.979-18.84 74.771-50.633t50.044-74.771Q235.5 48.867 235.5 0q0 48.867 18.251 91.845 18.84 42.978 50.633 74.771t74.771 50.633Q422.134 235.499 471 235.5q-48.866 0-91.845 18.84-42.978 18.252-74.771 50.044-31.793 31.793-50.633 74.771Q235.501 422.134 235.5 471"
            ></path>
        </g>
        <g id="icon-hints">
            <path
                d="M9 15v3a3 3 0 1 1-3-3zm0 0h6m-6 0V9m6 6v3a3 3 0 1 0 3-3zm0 0V9m0 0H9m6 0V6a3 3 0 1 1 3 3zM9 9V6a3 3 0 1 0-3 3z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
            ></path>
        </g>
    </defs>
</svg>

<div class="container">
    <Notification />
    <div class="sticky-header">
        <header class="header">
            <h1>{$t('appName')}</h1>
            <div class="header-actions">
                <button
                    id="rules-toggle"
                    type="button"
                    class="header-button"
                    title={$tt('openRulesPage')}
                    aria-label={$t('openRulesPage')}
                    onclick={openRules}
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-color)"
                        style="color: var(--text-color);"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"><use href="#icon-rules"></use></svg
                    >
                </button>
                <button
                    id="list-group-toggle"
                    type="button"
                    class="header-button"
                    title={$tt('listTabGroups')}
                    aria-label={$t('listTabGroups')}
                    onclick={openListGroup}
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 512 512"
                        style="color: var(--text-color);"
                        aria-hidden="true"
                        focusable="false"><use href="#icon-list-group"></use></svg
                    >
                </button>
            </div>
        </header>
    </div>

    <main>
        <ThemeSelector onNavigate={handleThemeNavigate} />

        <section class="section settings-rules">
            <SettingsSection onOpenRules={openRules} onOpenListGroup={openListGroup} onOpenGemini={openGemini} />
        </section>

        <section class="section keyboard-shortcuts">
            <div class="section-title">{$t('keyboardShortcuts')}</div>
            <div class="shortcuts-list" tabindex="0">
                {#each shortcuts as shortcut (shortcut.id)}
                    <div class="shortcut" data-shortcut-name={shortcut.id}>
                        <!-- Falls back to the raw key when a translation is missing -->
                        <span class="shortcut-name">{$t(shortcut.nameKey) || shortcut.nameKey}</span>
                        <span
                            class="shortcut-key"
                            role="button"
                            tabindex="0"
                            onclick={() => openShortcutSettings(shortcut.id)}
                            onkeydown={(e) => e.key === 'Enter' && openShortcutSettings(shortcut.id)}
                            >{shortcut.key || $t('notSet')}</span
                        >
                    </div>
                {/each}
            </div>
        </section>

        <DonationSection />

        <section class="section feedback-section">
            <div class="section-title">{$t('feedbackSupport')}</div>
            <FeedbackSection email="luis.brochero85@gmail.com" notificationKey="emailCopied" />
        </section>

        <section class="section acknowledgements-section">
            <div class="section-title">{$t('acknowledgements')}</div>
            <p class="section-description">
                <span>{$t('acknowledgementsDescPopupPart1')}</span>
                <span class="acknowledged-name">{$t('ThanksDesc_name')}</span>
                <span>{$t('acknowledgementsDescPopupPart2')}</span>
            </p>
        </section>

        <section class="section rating-section">
            <div class="section-title">{$t('rateExtensionTitle')}</div>
            <div class="rate-button-container">
                <a
                    href="https://chromewebstore.google.com/category/extensions"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rate-store-btn"
                    id="rate-store-link-popup"
                >
                    <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                    <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                    <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                    <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                    <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                    <span>{$t('rateExtensionBtn')}</span>
                </a>
            </div>
        </section>

        <div class="main-footer-wrapper">
            <a
                href="#footer"
                id="about-link-popup"
                class="footer-link"
                onclick={(e) => {
                    e.preventDefault();
                    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/about/about.html') });
                }}
            >
                <footer class="footer">
                    <div>Intelligent Workspace v1.0.0</div>
                    <div>{$t('developedBy')}</div>
                    <div class="color-dots">
                        <div class="color-dot" style="background-color: #5f6368"></div>
                        <div class="color-dot" style="background-color: #1a73e8"></div>
                        <div class="color-dot" style="background-color: #d93025"></div>
                        <div class="color-dot" style="background-color: #f9ab00"></div>
                        <div class="color-dot" style="background-color: #188038"></div>
                        <div class="color-dot" style="background-color: #d01884"></div>
                        <div class="color-dot" style="background-color: #a142f4"></div>
                        <div class="color-dot" style="background-color: #007b83"></div>
                        <div class="color-dot" style="background-color: #fa903e"></div>
                    </div>
                </footer>
            </a>
        </div>
    </main>
</div>
