<script>
    /**
     * [AI INSTRUCTION]
     * THE CONTRIBUTION ICONS, ON BOTH SURFACES.
     *
     * This component renders and nothing else. Which providers exist lives in
     * `config/contributionProviders.js`, and what a click does lives in
     * `services/contributionService.js`. It used to hold its own copy of the addresses and
     * its own hand-written side-panel navigation; both are gone.
     *
     * The about page ships its own stylesheet for this block, so the class names it
     * targets are emitted here. Without them the images fall back to their intrinsic
     * size and blow that page's grid column open.
     */
    import { t, tt } from '../../stores/i18nStore.js';
    import { providersFor } from '../../../config/contributionProviders.js';
    import { handleContributionClick } from '../../services/contributionService.js';

    let { variant = 'popup' } = $props();
    const isAbout = $derived(variant === 'about');
    const providers = $derived(providersFor(isAbout ? 'about' : 'popup'));

    const activate = (provider, event) => handleContributionClick(provider, { variant, event });
</script>

<section class="contribution-section">
    {#if !isAbout}
        <div class="contribution-title">{$t('contribution')}</div>
    {/if}
    <div class={isAbout ? 'contribution-links-container' : 'contribution-options'}>
        {#each providers as provider (provider.id)}
            <div
                class={isAbout ? 'contribution-link' : 'contribution-option'}
                id="contribution-{provider.id}"
                role="button"
                tabindex="0"
                aria-label={$t(provider.ariaLabelKey)}
                title={$tt(provider.titleKey)}
                onclick={(e) => activate(provider, e)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && activate(provider, e)}
            >
                {#if isAbout}
                    <img src={provider.img} alt={provider.alt} class="contribution-icon" />
                {:else}
                    <div class="contribution-icon-container" id="{provider.id}-link">
                        <img src={provider.img} alt={provider.alt} />
                    </div>
                {/if}
                <div class="contribution-label">{$t(provider.labelKey)}</div>
            </div>
        {/each}
    </div>
</section>
