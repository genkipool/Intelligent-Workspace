<script>
    /**
     * [AI INSTRUCTION]
     * THE LICENCE, SAID IN THE READER'S OWN LANGUAGE.
     *
     * A summary, not a second copy of the terms: `LICENSE` at the root of the
     * repository is the licence, this is what it means, and the first link at the
     * bottom goes to it. That file already carries both languages one after the other;
     * here the reader gets theirs, the way every other word on this page works.
     *
     * The second link goes to the terms of service on the website, which is the other
     * document this section is the doorway to — and the only place in the product that
     * says, in full, that a contribution is a voluntary tip and buys nothing.
     *
     * If the terms in `LICENSE` change, these strings change with them — a summary
     * that has drifted from what it summarises is worse than no summary at all.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
    import { siteUrl } from '../../../../config/site.js';

    const LICENSE_URL = 'https://github.com/genkipool/Intelligent-Workspace/blob/main/LICENSE';

    /**
     * The terms of service, which are the other half of this section: the licence says
     * what you may do with the code, the terms say what you are agreeing to by using the
     * extension — and, the part that actually needed writing down, that a contribution is
     * a voluntary tip that buys nothing.
     *
     * Published one page per language; `config/site.js` picks the reader's.
     */
    const TERMS_URL = siteUrl('terms');
</script>

<section class="license-section card">
    <h3>{$t('licenseTitle')}</h3>
    <p class="license-copyright">{$t('licenseCopyright')}</p>
    <p>{$t('licenseIntro')}</p>

    <div class="license-terms">
        <div class="license-terms-block">
            <h4>
                <span class="material-icons-sharp license-term-icon allowed" translate="no" aria-hidden="true"
                    >check_circle</span
                >
                {$t('licenseAllowedTitle')}
            </h4>
            <ul>
                <li>{$t('licenseAllowed1')}</li>
                <li>{$t('licenseAllowed2')}</li>
            </ul>
        </div>

        <div class="license-terms-block">
            <h4>
                <span class="material-icons-sharp license-term-icon forbidden" translate="no" aria-hidden="true"
                    >cancel</span
                >
                {$t('licenseForbiddenTitle')}
            </h4>
            <ul>
                <li>{$t('licenseForbidden1')}</li>
                <li>{$t('licenseForbidden2')}</li>
                <li>{$t('licenseForbidden3')}</li>
            </ul>
        </div>
    </div>

    <div class="license-links">
        <a
            class="license-full-link"
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={$tt('licenseFullTextTitle')}
        >
            <span class="material-icons-sharp" translate="no" aria-hidden="true">description</span>
            <span>{$t('licenseFullTextLink')}</span>
        </a>

        <a
            class="license-full-link"
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={$tt('termsLinkTitle')}
        >
            <span class="material-icons-sharp" translate="no" aria-hidden="true">gavel</span>
            <span>{$t('termsLink')}</span>
        </a>
    </div>
</section>

<style>
    .license-copyright {
        font-weight: 500;
        color: var(--text-on-color);
    }

    /* Two columns where there is room, one underneath the other where there is not —
       the same shape `.info-grid` gives the cards above this one. */
    .license-terms {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--spacing-xl);
        margin: var(--spacing-md) 0;
    }

    @media (max-width: 768px) {
        .license-terms {
            grid-template-columns: 1fr;
            gap: var(--spacing-lg);
        }
    }

    .license-terms-block h4 {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
        margin: 0 0 var(--spacing-sm);
        font-size: var(--h4-size);
        font-weight: 500;
        color: var(--text-on-color);
    }

    .license-term-icon {
        font-size: var(--h4-size);
    }

    /* Both icons wear a colour of the chosen theme, so the block follows it the way the
       rest of the page does. `--success-color` is not one of them — the theme defines
       exactly nine — so this used to be a hard-coded green that stayed the same green
       whichever theme was on.

       Told apart by more than the colour, too: the two icons are a tick and a cross, so
       the distinction survives both a theme whose accent is close to its error colour
       and a reader who cannot separate the two. */
    .license-term-icon.allowed {
        color: var(--text-on-color);
    }

    .license-term-icon.forbidden {
        color: var(--error-color);
    }

    .license-terms-block ul {
        margin: 0;
        padding-left: var(--spacing-lg);
    }

    .license-terms-block li {
        margin-bottom: var(--spacing-xs);
    }

    /* Side by side where there is room, stacked where there is not — the two links are a
       pair, not a link and an afterthought. */
    .license-links {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-sm) var(--spacing-xl);
    }

    .license-full-link {
        display: inline-flex;
        align-items: center;
        gap: var(--spacing-xs);
        color: var(--interactive-color);
        text-decoration: none;
        font-weight: 500;
    }

    .license-full-link:hover,
    .license-full-link:focus-visible {
        text-decoration: underline;
    }
</style>
