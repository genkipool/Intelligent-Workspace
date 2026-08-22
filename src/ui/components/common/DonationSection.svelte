<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { notificationStore } from '../../stores/notificationStore.js';
    import { copyText } from '../../../utils/copyText.js';

    // The about page ships its own stylesheet for this block; emitting the class names
    // it targets keeps the icons sized. Without them the images fell back to their
    // intrinsic size and blew the page's grid column open.
    let { variant = 'popup' } = $props();
    const isAbout = $derived(variant === 'about');

    import bitcoinImg from '../../../../assets/images/donation/bitcoin.svg';
    import cardanoImg from '../../../../assets/images/donation/cardano.svg';
    import radixImg from '../../../../assets/images/donation/radix.png';
    import paypalImg from '../../../../assets/images/donation/paypal.png';

    const donationData = {
        addresses: {
            bitcoin: '35TwBQX6ij8eUm7WjpJpVCgJYHdZXqqFnQ',
            cardano:
                'addr1q85skr0l9avpstwnkqfzm42mv46y6d6c4tyly7ehhzlqkytmrdu4ze7z7rpp2sm55jdpsphpthxkgw25ekx7mn3ruwks5mnlla',
            radix: 'account_rdx16y3jpuhgkcfmntg39uv56t0s3klnxnk28k0jszjky8ngpz5945xkj7',
        },
        urls: {
            paypal: 'https://www.paypal.com/paypalme/GENKIPOOL',
        },
    };

    async function copyDonationAddress(currency) {
        const ok = await copyText(donationData.addresses[currency]);
        notificationStore.show($t(ok ? 'addressCopied' : 'errorCopyingAddress'), ok ? 'success' : 'error');
    }

    async function openPaypal(event) {
        if (event) event.preventDefault();
        if (isAbout) {
            chrome.tabs.create({ url: donationData.urls.paypal, active: true });
            return;
        }
        const paypalUrl = encodeURIComponent(donationData.urls.paypal);
        const popupUrl = `../listGroup/listGroup.html?view=url&url=${paypalUrl}`;
        const sidePanelUrl = `src/ui/pages/listGroup/listGroup.html?view=url&url=${paypalUrl}`;

        const urlParams = new URLSearchParams(window.location.search);
        const isSidePanel = urlParams.get('context') === 'sidepanel';

        let contextsCache = [];
        if (typeof chrome.runtime?.getContexts === 'function') {
            try {
                contextsCache = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] });
            } catch {
                contextsCache = [];
            }
        }
        const hasSidePanel = (contextsCache?.length || 0) > 0;
        const currentWin = await chrome.windows?.getCurrent().catch(() => null);
        const isPopupWindow = currentWin?.type === 'popup';

        if (isSidePanel || hasSidePanel || isPopupWindow || (event && event.ctrlKey)) {
            window.location.href = `${popupUrl}&context=sidepanel`;
            if (isSidePanel) {
                chrome.runtime?.sendMessage?.({ action: 'sidePanelPathUpdated', path: popupUrl });
            }
        } else {
            chrome.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
                if (tab && chrome.sidePanel?.setOptions) {
                    chrome.sidePanel.setOptions({
                        path: `${sidePanelUrl}&context=sidepanel`,
                        enabled: true,
                    });
                    chrome.sidePanel.open({ windowId: tab.windowId });
                    window.close();
                } else {
                    chrome.tabs.create({ url: donationData.urls.paypal });
                }
            });
        }
    }

    const imageItems = [
        {
            id: 'donation-bitcoin',
            iconId: 'bitcoin-link',
            img: bitcoinImg,
            alt: 'Bitcoin',
            labelKey: 'bitcoin',
            action: () => copyDonationAddress('bitcoin'),
            ariaLabelKey: 'copyBitcoinAddress',
            titleKey: 'donateWithBitcoin',
        },
        {
            id: 'donation-cardano',
            iconId: 'cardano-link',
            img: cardanoImg,
            alt: 'Cardano',
            labelKey: 'cardano',
            action: () => copyDonationAddress('cardano'),
            ariaLabelKey: 'copyCardanoAddress',
            titleKey: 'donateWithCardano',
        },
        {
            id: 'donation-radix',
            iconId: 'radix-link',
            img: radixImg,
            alt: 'Radix',
            labelKey: 'radix',
            action: () => copyDonationAddress('radix'),
            ariaLabelKey: 'copyRadixAddress',
            titleKey: 'donateWithRadix',
        },
        {
            id: 'donation-paypal',
            iconId: 'paypal-link',
            img: paypalImg,
            alt: 'Paypal',
            labelKey: 'paypal',
            action: openPaypal,
            ariaLabelKey: 'openPaypalPage',
            titleKey: 'donateWithPaypal',
        },
    ];
</script>

<section class="donation-section">
    {#if !isAbout}
        <div class="donation-title">{$t('donation')}</div>
    {/if}
    <div class={isAbout ? 'donation-links-container' : 'donation-options'}>
        {#each imageItems as item (item.id)}
            <div
                class={isAbout ? 'donation-link' : 'donation-option'}
                id={item.id}
                role="button"
                tabindex="0"
                aria-label={$t(item.ariaLabelKey)}
                title={$tt(item.titleKey)}
                onclick={(e) => item.action(e)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && item.action(e)}
            >
                {#if isAbout}
                    <img src={item.img} alt={item.alt} class="donation-icon" />
                {:else}
                    <div class="donation-icon-container" id={item.iconId}>
                        <img src={item.img} alt={item.alt} />
                    </div>
                {/if}
                <div class="donation-label">{$t(item.labelKey)}</div>
            </div>
        {/each}
    </div>
</section>
