<script>
    import { onMount } from 'svelte';
    import { i18nStore, t, tt } from '../../stores/i18nStore.js';
    import { themeStore } from '../../stores/themeStore.js';
    import Icons from '../../components/Icons.svelte';
    import Notification from '../../components/common/Notification.svelte';
    import ContributionSection from '../../components/common/ContributionSection.svelte';
    import FeedbackSection from '../../components/common/FeedbackSection.svelte';
    import ScrollButtons from '../../components/common/ScrollButtons.svelte';
    import VersionHistorySection from './components/VersionHistorySection.svelte';
    import FeatureCategoriesSection from './components/FeatureCategoriesSection.svelte';
    import DataUseSection from './components/DataUseSection.svelte';
    import PermissionsSection from './components/PermissionsSection.svelte';
    import LicenseSection from './components/LicenseSection.svelte';

    import AppLogo from '../../components/common/AppLogo.svelte';
    import teamImg from '../../../../assets/images/about/team.png';
    import { initializeKeyboardNavigation } from '../../../utils/keyboardNav.js';

    const YOUTUBE_URL = 'https://www.youtube.com/@IntelligentWorkspace';

    onMount(async () => {
        await i18nStore.init();
        await themeStore.init();
        initializeKeyboardNavigation();
    });

    // `<title data-i18n="aboutApp">` is filled in by the page that loads
    // `i18n-init.js`, and this one does not, so the browser tab came up nameless.
    // Setting it from the store also keeps it right when the language changes.
    $effect(() => {
        const titulo = $t('aboutApp');
        if (titulo) document.title = titulo;
    });

    function goBack() {
        if (chrome && chrome.tabs) {
            chrome.tabs.query({ url: chrome.runtime.getURL('src/ui/pages/popup/popup.html') }, (popupTabs) => {
                chrome.tabs.query({ url: chrome.runtime.getURL('src/ui/pages/rules/rules.html') }, (rulesTabs) => {
                    if (rulesTabs.length > 0) {
                        chrome.tabs.update(rulesTabs[0].id, { active: true });
                        chrome.windows.update(rulesTabs[0].windowId, { focused: true });
                    } else if (popupTabs.length > 0) {
                        chrome.tabs.update(popupTabs[0].id, { active: true });
                        chrome.windows.update(popupTabs[0].windowId, { focused: true });
                    } else {
                        chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/rules/rules.html') });
                    }
                    window.close();
                });
            });
        } else {
            window.history.back();
        }
    }
</script>

<!--
    The sprite with the <symbol> definitions. Without it the five features drawn with
    <use href="#icon-..."> rendered an empty 24x20 hole: the markup was there, the
    symbols were not.
-->
<Icons />

<div class="page-container">
    <Notification />
    <header class="header-main">
        <button
            type="button"
            onclick={goBack}
            class="back-button"
            title={$tt('backToMainPopup')}
            aria-label={$t('backToMainPopup')}
        >
            <span class="material-icons-sharp" translate="no" aria-hidden="true">arrow_back_ios_new</span>
        </button>
        <h2>{$t('aboutApp')}</h2>
        <div class="header-spacer"></div>
    </header>

    <main class="content-area">
        <section class="intro-section card">
            <div class="intro-content">
                <AppLogo class="app-logo" />
                <div class="intro-text">
                    <h1>{$t('appName')}</h1>
                    <p class="app-tagline">{$t('appDescription')}</p>
                </div>
            </div>
        </section>

        <DataUseSection />

        <VersionHistorySection />

        <FeatureCategoriesSection />

        <div class="info-grid">
            <PermissionsSection />

            <section id="feedback-section" class="feedback-section card">
                <h3>{$t('teamTitle')}</h3>
                <div class="team-content">
                    <img src={teamImg} alt={$t('teamPhotoAlt') || 'Team photo'} class="team-photo" />
                    <div class="team-members">
                        <p class="team-member">
                            <strong>{$t('teamMember1Name')}</strong><span>{$t('teamMember1Role')}</span>
                        </p>
                        <p class="team-member">
                            <strong>{$t('teamMember2Name')}</strong><span>{$t('teamMember2Role')}</span>
                        </p>
                    </div>
                </div>
                <h3>{$t('feedbackSupport')}</h3>
                <p>{$t('feedbackDescText')}</p>
                <FeedbackSection variant="about" email="intelligent.tab.group@gmail.com" />
                <h3 class="contribution-title">{$t('contribution')}</h3>
                <p>{$t('contributionDescText')}</p>
                <ContributionSection variant="about" />
                <h3 class="acknowledgements-title">{$t('acknowledgements')}</h3>
                <p class="acknowledgements-text">
                    <span>{$t('ThanksDesc_nameThanksDesc_part1')}</span><span class="acknowledged-name"
                        >{$t('ThanksDesc_name')}</span
                    ><span class="acknowledged-end">{$t('ThanksDesc_end')}</span>
                </p>
                <p class="acknowledgements-text">
                    <span>{$t('ThanksDesc_nameThanksDesc_part2')}</span><span class="acknowledged-name"
                        >{$t('ThanksDesc_name')}</span
                    ><span>{$t('ThanksDesc_nameThanksDesc_part3')}</span>
                </p>
                <h3 class="social-media-title">{$t('socialMediaTitle')}</h3>
                <div class="github-link-wrapper youtube-link-wrapper">
                    <a href={YOUTUBE_URL} target="_blank" rel="noopener noreferrer" class="feedback-link">
                        <svg class="youtube-logo" viewBox="0 0 28 20" aria-hidden="true">
                            <path
                                d="M27.4 3.1a3.5 3.5 0 0 0-2.46-2.48C22.77 0 14 0 14 0S5.23 0 3.06.62A3.5 3.5 0 0 0 .6 3.1C0 5.28 0 10 0 10s0 4.72.6 6.9a3.5 3.5 0 0 0 2.46 2.48C5.23 20 14 20 14 20s8.77 0 10.94-.62a3.5 3.5 0 0 0 2.46-2.48C28 14.72 28 10 28 10s0-4.72-.6-6.9"
                                fill="#f00"
                            />
                            <path d="M11.2 14.29 18.5 10l-7.3-4.29z" fill="#fff" />
                        </svg>
                        <span>{$t('youtubeChannel')}</span>
                    </a>
                </div>
                <h3 class="rate-extension-title">{$t('rateExtensionTitle')}</h3>
                <p class="rate-extension-desc">{$t('rateExtensionDesc')}</p>
                <div class="rate-button-container">
                    <a
                        href="https://chromewebstore.google.com/detail/cmkbnppbnhoklenlngmbdfecgbnlojoo/reviews"
                        id="rate-store-link"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="rate-store-btn"
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
        </div>

        <LicenseSection />
    </main>

    <footer class="page-footer">
        <p>(c) <span id="current-year">{$t('nameOrganitation')}</span></p>
        <p><span>{$t('appName')}</span> - <span>{$t('tagline')}</span></p>
    </footer>

    <ScrollButtons />
</div>
