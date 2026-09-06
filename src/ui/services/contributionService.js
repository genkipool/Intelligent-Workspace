/**
 * [AI INSTRUCTION]
 * WHAT A CLICK ON A CONTRIBUTION ICON DOES.
 *
 * REUSE: the popup and the about page both call `handleContributionClick`. Neither knows
 * about clipboards, side panels or payment URLs — they render `contributionProviders.js`
 * and hand the entry back here.
 *
 * The branch is on `kind`, never on the provider id: adding a fourth gateway must not
 * mean adding a fourth `if` in this file.
 */

import { get } from 'svelte/store';
import { t } from '../stores/i18nStore.js';
import { notificationStore } from '../stores/notificationStore.js';
import { copyText } from '../../utils/copyText.js';
import { navigateToPanel } from './panelNavigation.js';
import { buildPaymentUrl } from './paymentService.js';

const PANEL_PAGE_FROM_POPUP = '../listGroup/listGroup.html';
const PANEL_PAGE_FROM_ROOT = 'src/ui/pages/listGroup/listGroup.html';

async function copyAddress(provider) {
    const ok = await copyText(provider.address);
    const translate = get(t);
    notificationStore.show(translate(ok ? 'addressCopied' : 'errorCopyingAddress'), ok ? 'success' : 'error');
}

/**
 * @param {object} provider Entry from `contributionProviders.js`.
 * @param {object} options
 * @param {'popup'|'about'} options.variant Which surface was clicked.
 * @param {Event|null} [options.event]
 */
export async function handleContributionClick(provider, { variant, event = null }) {
    if (!provider) return;

    if (provider.kind === 'crypto') {
        if (event) event.preventDefault();
        await copyAddress(provider);
        return;
    }

    // The about page is a full tab of its own: there is no panel to open a form in, so
    // the hosted page opens as a normal page. No nonce, because there is no bridge.
    if (variant === 'about') {
        if (event) event.preventDefault();
        chrome.tabs.create({ url: buildPaymentUrl(provider), active: true });
        return;
    }

    // The panel resolves the provider from the query string on boot, which is the same
    // contract `?view=url` already uses. The nonce is minted inside the panel, not
    // here: it has to belong to the frame that ends up on screen.
    await navigateToPanel({
        event,
        popupUrl: `${PANEL_PAGE_FROM_POPUP}?view=payment&provider=${provider.id}`,
        sidePanelUrl: `${PANEL_PAGE_FROM_ROOT}?view=payment&provider=${provider.id}`,
        sourcePath: '../popup/popup.html',
    });
}
