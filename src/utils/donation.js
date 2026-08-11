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

    const handlePaypalClick = (event) => {
        event.preventDefault();
        const url = donationData.urls.paypal;
        if (url) {
            chrome.tabs.create({ url: url });
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
