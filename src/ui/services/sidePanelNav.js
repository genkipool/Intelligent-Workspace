/**
 * [AI INSTRUCTION]
 * THE THREE BUTTONS THAT END EVERY SIDE-PANEL HEADER.
 *
 * Go to the group list, go home, go back where you came from. The web activity panel
 * wrote them out — three handlers and three action descriptors — and the pomodoro
 * panel needed exactly the same three, which is the moment to move them rather than
 * paste them: two panels whose back button disagrees about what `navSource` means are
 * two products.
 *
 * This is navigation *within* an open side panel, so it is always `window.location`
 * plus a `sidePanelPathUpdated` to the worker — without that message a pinned panel
 * reopens on the path it was pinned at. Getting *into* the panel from the popup is a
 * different question with four cases of its own, and that one lives in
 * `panelNavigation.js`.
 */

/** The panel's own home, relative to any page under `src/ui/pages/`. */
const HOME = '../popup/popup.html?context=sidepanel';
/** The group list, same. */
const GROUPS = '../listGroup/listGroup.html?context=sidepanel';

/**
 * @param {string} here Where the calling page is, with its query — what the page it
 *   hands over to should come back to.
 */
export function createPanelNav(here) {
    /** Points the panel at `url` and tells the worker, so a pin follows the move. */
    function go(url) {
        window.location.href = url;
        chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: url.split('?')[0] });
    }

    async function goToGroups() {
        await chrome.storage.local.set({ navSource: here });
        go(GROUPS);
    }

    function goHome() {
        go(HOME);
    }

    async function goBack() {
        const { navSource } = await chrome.storage.local.get('navSource');
        await chrome.storage.local.set({ navSource: here });
        if (navSource) {
            window.location.href = navSource;
            return;
        }
        goHome();
    }

    return { goToGroups, goHome, goBack };
}

/**
 * The descriptors `SidePanelHeader` needs for those three buttons, in the order every
 * header carries them. A page prepends whatever is its own — the pin, say — and hands
 * the whole list over.
 *
 * No `viewBox` on any of them, unlike the rules page. That page's sprite holds its
 * icons in `<g>` elements, which carry no coordinate system of their own, so its
 * buttons supply one. `PanelNavIcons.svelte` uses `<symbol>`, which does — and setting
 * it again on the `<svg>` applies it twice, which is what left the house icon drawn at
 * the wrong scale and off centre inside its button.
 *
 * @param {{ t: Function, tt: Function, nav: ReturnType<typeof createPanelNav> }} deps
 *   `t`/`tt` are the resolved translators, i.e. `$t` and `$tt` at the call site.
 */
export function panelNavActions({ t, tt, nav }) {
    return [
        {
            id: 'list-groups-btn',
            class: 'buttom-list-group',
            icon: '#panel-list-group',
            ariaLabel: t('listTabGroups'),
            title: tt('listTabGroups'),
            onclick: nav.goToGroups,
        },
        {
            id: 'home-btn',
            class: 'home-button',
            icon: '#panel-home',
            ariaLabel: t('backToHome'),
            title: tt('backToHome'),
            onclick: nav.goHome,
        },
        {
            class: 'back-button',
            icon: '#panel-back',
            ariaLabel: t('backToMainPopup'),
            title: tt('backToHome'),
            onclick: nav.goBack,
        },
    ];
}
