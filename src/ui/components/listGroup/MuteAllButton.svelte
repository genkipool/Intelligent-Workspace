<script>
    /**
     * The toolbar's speaker button and the two things it can do.
     *
     * The button itself is still driven from groupsService by hand — it decides when
     * to show it and which of the two icons to use — because the rest of the panel's
     * audio bookkeeping lives there. This component adds the hover menu: silence
     * everything (or bring it back), and jump to the tab the sound is coming from.
     *
     * Two things can be making noise, and they are silenced in different ways: a tab
     * playing audio, which Chrome can mute, and the page reader, whose voice does
     * not go through the tab at all — the tab is not even `audible` — and which has
     * to be told to pause from inside the page it is reading.
     */
    import { t, tt } from '../../stores/i18nStore.js';
    import { isProgrammaticActivation } from '../../stores/appStore.svelte.js';
    import { getValidStandardTabs, toggleMuteAllSources, isEverythingSilenced } from '../../services/groupsService.js';
    import { getReadAloudReadings } from '../../services/readAloudService.js';

    let { hidden = false } = $props();

    /** Long enough that crossing the toolbar does not flash the menu open. */
    const OPEN_DELAY_MS = 220;
    const CLOSE_DELAY_MS = 160;
    const GAP = 6;

    let buttonEl = $state(null);
    let popupEl = $state(null);
    let isPopupOpen = $state(false);
    let popupPosition = $state({ top: 0, left: 0 });
    let silenced = $state(false);
    /** The tab the sound is coming from, which is where "go to it" leads. */
    let soundingTab = $state(null);
    let openTimer = null;
    let closeTimer = null;
    // Where the pointer is, so pressing a control inside the menu — which blurs the
    // toolbar button — does not read as leaving it.
    let pointerOnButton = false;
    let pointerOnPopup = false;

    /**
     * The tab worth jumping to.
     *
     * A reading comes first: it is the one sound the tab strip gives no sign of, so
     * it is the one somebody is most likely hunting for. Otherwise it is whichever
     * tab is playing, and failing that one that has been silenced — which is still
     * the tab the button is talking about.
     */
    async function findSoundingTab() {
        const [tabs, readings] = await Promise.all([getValidStandardTabs(), getReadAloudReadings()]);
        if (readings.length > 0) {
            return { tabId: readings[0].tabId, windowId: readings[0].windowId };
        }
        const audible = tabs.find((tab) => tab.audible && !tab.mutedInfo?.muted) || tabs.find((tab) => tab.audible);
        const muted = tabs.find((tab) => tab.mutedInfo?.muted);
        const tab = audible || muted;
        return tab ? { tabId: tab.id, windowId: tab.windowId } : null;
    }

    /**
     * Puts the menu under the button, flipping it above and pulling it back inside
     * the window when there is no room, the way the other toolbar popups behave.
     */
    function positionPopup() {
        if (!buttonEl || !popupEl) return;
        const button = buttonEl.getBoundingClientRect();
        const popup = popupEl.getBoundingClientRect();
        let top = button.bottom + GAP;
        if (top + popup.height > window.innerHeight - GAP) {
            top = Math.max(GAP, button.top - popup.height - GAP);
        }
        let left = button.left + button.width / 2 - popup.width / 2;
        left = Math.min(Math.max(GAP, left), window.innerWidth - popup.width - GAP);
        popupPosition = { top, left };
    }

    function scheduleOpen() {
        clearTimeout(closeTimer);
        openTimer = setTimeout(async () => {
            // Nothing is making noise, so there is nothing to offer.
            if (buttonEl?.classList.contains('hidden')) return;
            silenced = isEverythingSilenced();
            soundingTab = await findSoundingTab();
            if (soundingTab) isPopupOpen = true;
        }, OPEN_DELAY_MS);
    }

    function scheduleClose() {
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
            if (pointerOnButton || pointerOnPopup) return;
            isPopupOpen = false;
        }, CLOSE_DELAY_MS);
    }

    function handleButtonEnter() {
        pointerOnButton = true;
        scheduleOpen();
    }

    function handleButtonLeave() {
        pointerOnButton = false;
        scheduleClose();
    }

    function handlePopupEnter() {
        pointerOnPopup = true;
        clearTimeout(closeTimer);
    }

    function handlePopupLeave() {
        pointerOnPopup = false;
        scheduleClose();
    }

    /** Keyboard users get the menu too; it closes once focus leaves it for good. */
    function handleFocusOut(event) {
        if (popupEl?.contains(event.relatedTarget) || buttonEl?.contains(event.relatedTarget)) return;
        scheduleClose();
    }

    /**
     * The click on the button itself belongs to groupsService, which silences every
     * tab and every reading at once. All this does is get the menu out of the way.
     */
    function handleButtonClick() {
        clearTimeout(openTimer);
        isPopupOpen = false;
    }

    async function handleMute() {
        isPopupOpen = false;
        await toggleMuteAllSources();
    }

    /** Brings the tab the sound is coming from to the front, window and all. */
    async function handleGoToTab() {
        isPopupOpen = false;
        if (!soundingTab) return;
        isProgrammaticActivation.set(true);
        setTimeout(() => isProgrammaticActivation.set(false), 1000);
        await chrome.tabs.update(soundingTab.tabId, { active: true }).catch(() => {});
        if (Number.isFinite(soundingTab.windowId)) {
            await chrome.windows.update(soundingTab.windowId, { focused: true }).catch(() => {});
        }
    }

    // Measured only once it exists, and again whenever its label could have changed
    // width.
    $effect(() => {
        if (isPopupOpen && popupEl) {
            void silenced;
            positionPopup();
        }
    });

    $effect(() => () => {
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
    });
</script>

<!--
    The markup of the button is deliberately plain: groupsService reaches in by id
    and swaps the two icons' `hidden` class by hand, so nothing here may re-render
    them or the two would fight over which one is showing.
-->
<button
    bind:this={buttonEl}
    id="mute-all-tabs-btn"
    type="button"
    class="control-btn"
    class:hidden
    title={$tt('muteAllTabs')}
    onclick={handleButtonClick}
    onmouseenter={handleButtonEnter}
    onmouseleave={handleButtonLeave}
    onfocus={scheduleOpen}
    onfocusout={handleFocusOut}
>
    <svg class="icon-speaker" width="24" height="24" aria-hidden="true" focusable="false">
        <use href="#icon-speaker"></use>
    </svg>
    <svg class="icon-speaker-muted hidden" width="24" height="24" aria-hidden="true" focusable="false">
        <use href="#icon-speaker-muted"></use>
    </svg>
</button>

{#if isPopupOpen}
    <div
        bind:this={popupEl}
        class="audio-sources-popup"
        role="menu"
        style:top={`${popupPosition.top}px`}
        style:left={`${popupPosition.left}px`}
        onmouseenter={handlePopupEnter}
        onmouseleave={handlePopupLeave}
        onfocusout={handleFocusOut}
    >
        <button
            type="button"
            role="menuitem"
            class="audio-sources-item"
            title={silenced ? $tt('audioSourceUnmute') : $tt('audioSourceMute')}
            onclick={handleMute}
        >
            <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href={silenced ? '#icon-speaker' : '#icon-speaker-muted'}></use>
            </svg>
            <span>{silenced ? $t('audioSourceUnmute') : $t('audioSourceMute')}</span>
        </button>
        <button
            type="button"
            role="menuitem"
            class="audio-sources-item"
            title={$tt('audioSourceGoToTab')}
            onclick={handleGoToTab}
        >
            <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-external"></use>
            </svg>
            <span>{$t('audioSourceGoToTab')}</span>
        </button>
    </div>
{/if}
