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
    import ActionButtonGrid from '../../components/common/ActionButtonGrid.svelte';
    import DonationSection from '../../components/common/DonationSection.svelte';
    import FeedbackSection from '../../components/common/FeedbackSection.svelte';
    import Notification from '../../components/common/Notification.svelte';
    import SidePanelHeader from '../../components/common/SidePanelHeader.svelte';
    import '../../../core/services/webActivitySchema.js';
    import { saveSettings } from '../../services/webActivityService.js';
    import { navigateToPanel, primePanelContexts } from '../../services/panelNavigation.js';
    import { warmPaymentOrigin } from '../../services/paymentService.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let port = null;
    let isSidePanel = false;
    let contextsCache = null;

    onMount(async () => {
        warmPaymentOrigin();
        await i18nStore.init();
        await themeStore.init();
        await settingsStore.init();

        initializeKeyboardNavigation();

        const urlParams = new URLSearchParams(window.location.search);
        isSidePanel = urlParams.get('context') === 'sidepanel';

        if (!isSidePanel) {
            /**
             * THIS PAGE NO LONGER BOUNCES TO THE PINNED VIEW.
             *
             * It used to: if anything was pinned and a side panel was open, it replaced
             * itself with the pinned page. That is already the toolbar button's job —
             * `chrome.action.onClicked` opens the pinned path directly and never loads
             * this page — so the only thing left that could reach it was somebody
             * asking for the main panel on purpose: the `ph` shortcut, the home button,
             * a `navSource` hand-back. All three showed the panel for a frame and then
             * threw it away for the pinned one, which is exactly the "it goes there and
             * comes straight back" nobody could explain.
             */
            // Resolved here during boot and handed over, so the first click does not
            // pay for a second round-trip to the worker.
            contextsCache =
                typeof chrome.runtime.getContexts === 'function'
                    ? await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })
                    : [];
            primePanelContexts(contextsCache);
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

    /**
     * The decision itself lives in `services/panelNavigation.js`, because the donation
     * icons need exactly the same one and used to carry their own copy of it.
     */
    function handleNavigation(event, popupUrl, sidePanelUrl, sourcePath) {
        return navigateToPanel({ event, popupUrl, sidePanelUrl, sourcePath });
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

    /**
     * The two buttons in the top bar, in the order they have always been drawn.
     *
     * `viewBox` on both, because this page's sprite is `<g>` elements, which carry no
     * coordinate system of their own. The rules icon also needs its stroke here: its
     * three lines are bare paths with `fill="none"`, so with nothing painting them
     * the button would show three dots and no rules.
     */
    let headerActions = $derived([
        {
            id: 'rules-toggle',
            class: 'header-button',
            icon: '#icon-rules',
            viewBox: '0 0 24 24',
            svgAttrs: {
                fill: 'none',
                stroke: 'var(--text-color)',
                'stroke-width': '2',
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
            },
            ariaLabel: $t('openRulesPage'),
            title: $tt('openRulesPage'),
            onclick: openRules,
        },
        {
            id: 'list-group-toggle',
            class: 'header-button',
            icon: '#icon-list-group',
            viewBox: '0 0 512 512',
            ariaLabel: $t('listTabGroups'),
            title: $tt('listTabGroups'),
            onclick: openListGroup,
        },
    ]);

    function openListGroupView(view) {
        return (e) =>
            handleNavigation(
                e,
                `../listGroup/listGroup.html?view=${view}`,
                `src/ui/pages/listGroup/listGroup.html?view=${view}`,
                '../popup/popup.html',
            );
    }

    /**
     * Whether the clock is running, mirrored from the same key the settings page
     * writes. Both are views of one setting, so both listen: flipping it here moves
     * the switch on a settings page that is already open, and the other way round.
     */
    let trackingEnabled = $state(true);
    let onSettingsChanged = null;

    onMount(async () => {
        const { [WA.KEYS.SETTINGS]: stored } = await chrome.storage.local.get(WA.KEYS.SETTINGS);
        trackingEnabled = { ...WA.DEFAULT_SETTINGS, ...(stored || {}) }.enabled !== false;

        onSettingsChanged = (changes, area) => {
            if (area !== 'local' || !changes[WA.KEYS.SETTINGS]) return;
            trackingEnabled =
                { ...WA.DEFAULT_SETTINGS, ...(changes[WA.KEYS.SETTINGS].newValue || {}) }.enabled !== false;
        };
        chrome.storage.onChanged.addListener(onSettingsChanged);
    });

    onDestroy(() => {
        if (onSettingsChanged) chrome.storage.onChanged.removeListener(onSettingsChanged);
    });

    /** Through the worker, which is what stops the clock now rather than at the next event. */
    async function setTracking(next) {
        const { [WA.KEYS.SETTINGS]: stored } = await chrome.storage.local.get(WA.KEYS.SETTINGS);
        const settings = { ...WA.DEFAULT_SETTINGS, ...(stored || {}), enabled: next };
        trackingEnabled = next;
        await saveSettings(settings);
    }

    // Two views of the group list and two full dashboards, all reached the same way
    // as the block above; only the icon and the destination change.
    const quickAccessItems = [
        {
            id: 'quick-notes-btn',
            titleKey: 'notesViewTitle',
            labelKey: 'quickAccessNotesBtn',
            tooltipKey: 'quickAccessNotesBtn',
            icon: '#icon-note',
            viewBox: '0 0 24 24',
            onClick: openListGroupView('notes'),
        },
        {
            id: 'quick-gallery-btn',
            titleKey: 'screenshotGalleryTitle',
            labelKey: 'quickAccessGalleryBtn',
            tooltipKey: 'quickAccessGalleryBtn',
            icon: '#icon-screenshot',
            viewBox: '0 0 24 24',
            onClick: openListGroupView('gallery'),
        },
        {
            id: 'quick-pomodoro-dashboard-btn',
            titleKey: 'pomodoroTitle',
            labelKey: 'pomodoroTitle',
            tooltipKey: 'pomodoroOpenTimer',
            icon: '#icon-pomodoro',
            viewBox: '0 0 512 512',
            svgAttrs: { fill: 'currentColor' },
            // The side panel, not a tab, for the same reason as web activity below it:
            // a timer is watched *while* working, beside the work. The panel's own
            // first button opens the full dashboard in a tab when the question stops
            // being "how long is left" and becomes "how has the month gone".
            onClick: (e) =>
                handleNavigation(
                    e,
                    '../pomodoro-dashboard/dashboard.html',
                    'src/ui/pages/pomodoro-dashboard/dashboard.html',
                    '../popup/popup.html',
                ),
        },
        {
            id: 'quick-web-activity-btn',
            titleKey: 'webActivityTitle',
            labelKey: 'webActivityPanelBtn',
            tooltipKey: 'webActivityPanelTitle',
            icon: '#icon-activity',
            viewBox: '0 0 24 24',
            // The side panel, not a tab: the activity is read while browsing, beside
            // the browsing. The panel's own resize button opens the full dashboard.
            onClick: (e) =>
                handleNavigation(
                    e,
                    '../web-activity/web-activity.html',
                    'src/ui/pages/web-activity/web-activity.html',
                    '../popup/popup.html',
                ),
        },
    ];
</script>

<!--
    Beside "Web activity", because it is the switch that decides whether there is any.
    It is the popup's own `mini-switch`, the same one the rules and navigation rows two
    lines up already use — a different-looking control for the same kind of setting,
    in the same grid, would be the odd one out on this page whatever it looked like
    elsewhere. It writes through the worker, so the clock stops now rather than at the
    next tab switch, and it and the settings page follow the same stored key.
-->
{#snippet trackingToggle()}
    <label class="switch mini-switch" id="web-activity-toggle-label" title={$tt('webActivityTrackingEnabled')}>
        <input
            type="checkbox"
            id="web-activity-enabled-toggle"
            tabindex="0"
            checked={trackingEnabled}
            aria-label={$t('webActivityTrackingEnabled')}
            onchange={(e) => setTracking(e.currentTarget.checked)}
        />
        <span class="slider"></span>
    </label>
{/snippet}

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
        <g id="icon-note" fill="none" stroke="currentColor" stroke-width="1.5">
            <path
                d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 1.6.376 3.112 1.043 4.453.178.356.237.763.134 1.148l-.595 2.226a1.3 1.3 0 0 0 1.591 1.592l2.226-.596a1.63 1.63 0 0 1 1.149.133A9.96 9.96 0 0 0 12 22Z"
            ></path>
            <path d="M8 10.5h8M8 14h5.5" stroke-linecap="round"></path>
        </g>
        <g
            id="icon-screenshot"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6"></path>
            <path
                d="M3 16.8V9.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C4.52 6 5.08 6 6.2 6h1.055c.123 0 .184 0 .24-.006a1 1 0 0 0 .725-.448c.03-.048.058-.103.113-.213.11-.22.165-.33.228-.425a2 2 0 0 1 1.447-.895C10.123 4 10.246 4 10.492 4h3.018c.246 0 .37 0 .482.013a2 2 0 0 1 1.448.895c.063.095.118.205.228.425.055.11.082.165.113.213a1 1 0 0 0 .724.447c.057.007.118.007.241.007H17.8c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C21 7.52 21 8.08 21 9.2v7.6c0 1.12 0 1.68-.218 2.108a2 2 0 0 1-.874.874C19.48 20 18.92 20 17.8 20H6.2c-1.12 0-1.68 0-2.108-.218a2 2 0 0 1-.874-.874C3 18.48 3 17.92 3 16.8"
            ></path>
        </g>
        <g id="icon-pomodoro">
            <path
                fill="currentColor"
                d="M360 80c4.8-12.8 8-27.2 8-44.8 0-4.8-1.6-4.8-4.8-8s-8-4.8-12.8-4.8c-19.2 1.6-40 9.6-60.8 24-6.4-11.2-12.8-22.4-22.4-33.6C264 9.6 259.2 8 256 8c-4.8 0-9.6 1.6-11.2 6.4-9.6 11.2-17.6 20.8-24 33.6q-26.4-21.6-57.6-24c-4.8 0-9.6 1.6-12.8 4.8S144 35.2 144 40c0 16 1.6 28.8 6.4 40C59.2 104 0 176 0 260.8 0 376 108.8 504 256 504s256-128 256-243.2c0-88-59.2-156.8-152-180.8m-65.6 8c1.6 0 1.6-1.6 1.6-3.2 12.8-11.2 24-19.2 36.8-24-4.8 19.2-19.2 48-57.6 56C280 105.6 288 96 294.4 88M256 49.6c4.8 6.4 8 12.8 9.6 20.8-11.2 12.8-19.2 28.8-25.6 48-1.6 0-3.2-1.6-4.8-1.6 1.6-32 8-51.2 20.8-67.2m-48 28.8c-1.6 6.4-3.2 14.4-4.8 22.4-11.2-8-20.8-20.8-25.6-40 11.2 3.2 20.8 9.6 30.4 17.6M256 472C128 472 32 360 32 260.8c0-73.6 52.8-132.8 134.4-152 12.8 16 27.2 25.6 43.2 32 1.6 0 1.6 0 3.2 1.6 12.8 4.8 27.2 8 36.8 9.6h1.6c6.4 0 11.2-3.2 14.4-8 24-3.2 54.4-12.8 76.8-35.2 84.8 17.6 139.2 76.8 139.2 152C480 360 384 472 256 472"
            ></path>
        </g>
        <g
            id="icon-activity"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M3 12h4l3 8 4-16 3 8h4"></path>
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
        <SidePanelHeader
            headerClass="header"
            titleClass=""
            title={$t('appName')}
            actionsClass="header-actions"
            actions={headerActions}
        />
    </div>

    <main>
        <ThemeSelector onNavigate={handleThemeNavigate} />

        <section class="section settings-rules">
            <SettingsSection onOpenRules={openRules} onOpenListGroup={openListGroup} onOpenGemini={openGemini} />
        </section>

        <section class="section settings-rules quick-access">
            <ActionButtonGrid items={quickAccessItems} toggles={{ 'quick-web-activity-btn': trackingToggle }} />
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
