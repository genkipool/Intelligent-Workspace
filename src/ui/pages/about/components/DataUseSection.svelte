<!--
    The in-product half of the Chrome Web Store's disclosure requirements.

    The listing is what actually satisfies the policy — Google's own remediation guidance
    for the prominent-disclosure violation says "prominent disclosure of data collection in
    the extension's Chrome Web Store listing is sufficient", and the detailed description
    names every feature that touches data on purpose. This section is the same account,
    kept where somebody who already installed the extension can find it without going back
    to the store, which is the "may be provided elsewhere" the same guidance allows.

    It is deliberately NOT a gate, a modal or a first-run tab: nothing here interrupts
    anyone. Keep it that way. If a future feature sends something new off the device, add
    it to the list below AND to the listing — a destination that appears in one and not the
    other is the discrepancy that costs a review.
-->
<script>
    import { t } from '../../../stores/i18nStore.js';

    // The policy is published one page per language, the way the payment page is.
    // An unknown language falls back to English, which is what the site does too.
    const href = (chrome.i18n.getUILanguage() || '').toLowerCase().startsWith('es')
        ? 'https://intelligentworkspace.genkipool.com/es/privacy'
        : 'https://intelligentworkspace.genkipool.com/privacy';
</script>

<section id="privacy-section" class="data-use-section card">
    <h3>{$t('dataUseTitle')}</h3>
    <p>{$t('dataUseIntro')}</p>

    <h4>{$t('dataUseLocalTitle')}</h4>
    <p>{$t('dataUseLocalBody')}</p>

    <h4>{$t('dataUseSyncTitle')}</h4>
    <p>{$t('dataUseSyncBody')}</p>

    <h4>{$t('dataUseLeavesTitle')}</h4>
    <ul>
        <li>{$t('dataUseGeminiItem')}</li>
        <li>{$t('dataUseRadioItem')}</li>
        <li>{$t('dataUseOcrItem')}</li>
        <li>{$t('dataUseDonationItem')}</li>
    </ul>

    <h4>{$t('dataUseNeverTitle')}</h4>
    <p>{$t('dataUseNeverBody')}</p>

    <p>
        <a {href} target="_blank" rel="noopener noreferrer">{$t('dataUsePolicyLink')}</a>
    </p>
</section>

<style>
    .data-use-section h4 {
        margin: 18px 0 6px;
        font-size: 14px;
    }

    .data-use-section ul {
        margin: 6px 0 0;
        padding-left: 20px;
    }

    .data-use-section li {
        margin-bottom: 8px;
        line-height: 1.6;
    }
</style>
