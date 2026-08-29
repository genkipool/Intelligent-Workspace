/**
 * [AI INSTRUCTION]
 * THE ONE PLACE THAT KNOWS WHICH DONATION OPTIONS EXIST.
 *
 * REUSE: every surface that shows donation options reads this table. Do not write a
 * second list of addresses, icons or labels anywhere. The addresses used to live in
 * BOTH `src/utils/donation.js` and `DonationSection.svelte`, and the two had already
 * started to drift — that file is gone and this one replaced it.
 *
 * ADDING A PROVIDER is one entry here plus its i18n keys. Nothing else changes: the
 * popup and the about page both derive their lists from `providersFor()`, and the
 * click behaviour comes from `kind`.
 *
 * ORDER IS THE RENDER ORDER. The popup shows the four `popup` entries in the order
 * below; the about page shows all six in a 3-column grid, so rows 1 and 2 fall out of
 * this order rather than out of any markup.
 */

import bitcoinImg from '../../assets/images/donation/bitcoin.svg';
import cardanoImg from '../../assets/images/donation/cardano.svg';
import radixImg from '../../assets/images/donation/radix.png';
import paypalImg from '../../assets/images/donation/paypal.png';
import stripeImg from '../../assets/images/donation/stripe.svg';
import googlePayImg from '../../assets/images/donation/google-pay.svg';
import applePayImg from '../../assets/images/donation/apple-pay.svg';
import ethereumImg from '../../assets/images/donation/ethereum.svg';

/**
 * `kind` decides what a click does, and nothing else in the codebase branches on the
 * provider id:
 *   - `payment` opens the hosted payment page (side panel from the popup, new tab from
 *     the about page). `method` is passed to that page so it can preselect the wallet.
 *   - `crypto` copies `address` to the clipboard.
 */
export const DONATION_PROVIDERS = [
    {
        id: 'stripe',
        kind: 'payment',
        method: 'card',
        img: stripeImg,
        alt: 'Stripe',
        labelKey: 'stripe',
        titleKey: 'donateWithStripe',
        ariaLabelKey: 'openStripeDonation',
        surfaces: ['popup', 'about'],
    },
    {
        id: 'googlePay',
        kind: 'payment',
        method: 'google_pay',
        img: googlePayImg,
        alt: 'Google Pay',
        labelKey: 'googlePay',
        titleKey: 'donateWithGooglePay',
        ariaLabelKey: 'openGooglePayDonation',
        surfaces: ['popup', 'about'],
    },
    {
        /**
         * [AI NOTE] Apple Pay only renders on Apple hardware. On Chrome for Linux or
         * Windows this tile opens the panel and no Apple Pay button appears — the sheet
         * falls back to the card form, and says so. That is the intended behaviour, not
         * a bug: Stripe decides eligibility, and forcing the button to show with
         * `applePay: 'always'` would only produce one that cannot complete.
         */
        id: 'applePay',
        kind: 'payment',
        method: 'apple_pay',
        img: applePayImg,
        alt: 'Apple Pay',
        labelKey: 'applePay',
        titleKey: 'donateWithApplePay',
        ariaLabelKey: 'openApplePayDonation',
        surfaces: ['popup', 'about'],
    },
    {
        id: 'paypal',
        kind: 'payment',
        method: 'paypal',
        img: paypalImg,
        alt: 'PayPal',
        labelKey: 'paypal',
        titleKey: 'donateWithPaypal',
        ariaLabelKey: 'openPaypalDonation',
        surfaces: ['popup', 'about'],
    },
    {
        id: 'bitcoin',
        kind: 'crypto',
        address: '35TwBQX6ij8eUm7WjpJpVCgJYHdZXqqFnQ',
        img: bitcoinImg,
        alt: 'Bitcoin',
        labelKey: 'bitcoin',
        titleKey: 'donateWithBitcoin',
        ariaLabelKey: 'copyBitcoinAddress',
        surfaces: ['about'],
    },
    {
        id: 'ethereum',
        kind: 'crypto',
        address: '0xbCC8B94f02ee4e4Cc4F651287F5B3c38d9daFda7',
        img: ethereumImg,
        alt: 'Ethereum',
        labelKey: 'ethereum',
        titleKey: 'donateWithEthereum',
        ariaLabelKey: 'copyEthereumAddress',
        surfaces: ['about'],
    },
    {
        // The coins are the about page's second row. They left the popup when the four
        // gateways filled it, but the addresses are live and people use them.
        id: 'cardano',
        kind: 'crypto',
        address:
            'addr1q85skr0l9avpstwnkqfzm42mv46y6d6c4tyly7ehhzlqkytmrdu4ze7z7rpp2sm55jdpsphpthxkgw25ekx7mn3ruwks5mnlla',
        img: cardanoImg,
        alt: 'Cardano',
        labelKey: 'cardano',
        titleKey: 'donateWithCardano',
        ariaLabelKey: 'copyCardanoAddress',
        surfaces: ['about'],
    },
    {
        id: 'radix',
        kind: 'crypto',
        address: 'account_rdx16y3jpuhgkcfmntg39uv56t0s3klnxnk28k0jszjky8ngpz5945xkj7',
        img: radixImg,
        alt: 'Radix',
        labelKey: 'radix',
        titleKey: 'donateWithRadix',
        ariaLabelKey: 'copyRadixAddress',
        surfaces: ['about'],
    },
];

/** @param {'popup'|'about'} surface */
export function providersFor(surface) {
    return DONATION_PROVIDERS.filter((provider) => provider.surfaces.includes(surface));
}

export function getProvider(id) {
    return DONATION_PROVIDERS.find((provider) => provider.id === id) || null;
}
