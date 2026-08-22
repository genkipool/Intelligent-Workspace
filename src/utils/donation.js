import { showNotification } from './i18n.js';

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

export function initializeDonationLinks() {
    const handleCryptoClick = (event, currency) => {
        event.preventDefault();
        const address = donationData.addresses[currency];
        if (address) {
            navigator.clipboard
                .writeText(address)
                .then(() => {
                    showNotification('addressCopied');
                })
                .catch((err) => {
                    console.error(`Failed to copy ${currency} address: `, err);
                    showNotification('errorCopyingAddress', true);
                });
        } else {
            console.error(`Failed to copy ${currency} address: `);
            showNotification('errorCopyingAddress', true);
        }
    };

    const handlePaypalClick = async (event) => {
        if (event) event.preventDefault();
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
    };

    const bitcoinLink = document.getElementById('bitcoin-link');
    const cardanoLink = document.getElementById('cardano-link');
    const radixLink = document.getElementById('radix-link');
    const paypalLink = document.getElementById('paypal-link');

    if (bitcoinLink) {
        bitcoinLink.addEventListener('click', (e) => handleCryptoClick(e, 'bitcoin'));
    }
    if (cardanoLink) {
        cardanoLink.addEventListener('click', (e) => handleCryptoClick(e, 'cardano'));
    }
    if (radixLink) {
        radixLink.addEventListener('click', (e) => handleCryptoClick(e, 'radix'));
    }
    if (paypalLink) {
        paypalLink.addEventListener('click', handlePaypalClick);
    }
}
