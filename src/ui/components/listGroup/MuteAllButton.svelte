<script>
    /**
     * The toolbar's speaker button and the list of what is making noise.
     *
     * The button itself is still driven from groupsService by hand — it decides when
     * to show it, which of the two icons to use and what a click does — because the
     * rest of the panel's audio bookkeeping lives there. This component adds the
     * hover popup, which names every source of sound and lets each one be silenced
     * or jumped to on its own.
     *
     * Two things can be making noise, and they are silenced in different ways: a tab
     * playing audio, which Chrome can mute, and the page reader, whose voice does
     * not go through the tab at all — the tab is not even `audible` — and which has
     * to be told to pause from inside the page it is reading.
     */
    import { t, tt } from '../../stores/i18nStore.js';
    import { isProgrammaticActivation } from '../../stores/appStore.svelte.js';
    import { getValidStandardTabs } from '../../services/groupsService.js';
    import { getReadAloudReadings, controlReadAloud } from '../../services/readAloudService.js';

    let { hidden = false } = $props();

    /** Long enough that crossing the toolbar does not flash the popup open. */
    const OPEN_DELAY_MS = 220;
    const CLOSE_DELAY_MS = 160;
    const GAP = 6;
    /** While the popup is open the list is kept honest; a video can end under it. */
    const REFRESH_MS = 1500;

    let buttonEl = $state(null);
    let popupEl = $state(null);
    let isPopupOpen = $state(false);
    let popupPosition = $state({ top: 0, left: 0 });
    let sources = $state([]);
    let openTimer = null;
    let closeTimer = null;
    let refreshTimer = null;
    // Where the pointer is, so pressing a control inside the popup — which blurs the
    // toolbar button — does not read as leaving it.
    let pointerOnButton = false;
    let pointerOnPopup = false;

    /**
     * Everything that is making noise, or has been silenced and could make it again.
     *
     * A muted tab stays on the list on purpose: the popup is also how the sound is
     * brought back, and a tab that has been silenced stops being `audible`, so
     * dropping it would make the control that silenced it disappear with it.
     */
    async function collectSources() {
        const [tabs, readings] = await Promise.all([getValidStandardTabs(), getReadAloudReadings()]);

        const fromTabs = tabs
            .filter((tab) => tab.audible || tab.mutedInfo?.muted)
            .map((tab) => ({
                kind: 'tab',
                tabId: tab.id,
                windowId: tab.windowId,
                title: tab.title || tab.url || '',
                favIconUrl: tab.favIconUrl || '',
                muted: !!tab.mutedInfo?.muted,
            }));

        const fromReadings = readings.map((reading) => ({
            kind: 'reading',
            tabId: reading.tabId,
            windowId: reading.windowId,
            title: reading.title,
            favIconUrl: reading.favIconUrl,
            paused: reading.paused,
        }));

        // A tab that is both playing something and being read out loud gets a row for
        // each: they are two separate sounds, silenced in two different ways.
        return [...fromReadings, ...fromTabs];
    }

    async function refreshSources() {
        sources = await collectSources();
        // Nothing left to control, or the panel moved to a view this button does not
        // belong to and groupsService has hidden it out from under the popup.
        if (sources.length === 0 || buttonEl?.classList.contains('hidden')) isPopupOpen = false;
    }

    /**
     * Puts the popup under the button, flipping it above and pulling it back inside
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
            await refreshSources();
            // Nothing is making noise, so there is nothing to offer.
            if (sources.length > 0) isPopupOpen = true;
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

    /** Keyboard users get the popup too; it closes once focus leaves it for good. */
    function handleFocusOut(event) {
        if (popupEl?.contains(event.relatedTarget) || buttonEl?.contains(event.relatedTarget)) return;
        scheduleClose();
    }

    /**
     * The click on the button itself belongs to groupsService, which silences every
     * tab and every reading at once. All this does is get the popup out of the way.
     */
    function handleButtonClick() {
        clearTimeout(openTimer);
        isPopupOpen = false;
    }

    async function toggleTab(source) {
        await chrome.tabs.update(source.tabId, { muted: !source.muted });
        await refreshSources();
    }

    async function toggleReading(source) {
        await controlReadAloud(source.tabId, source.paused ? 'resume' : 'pause');
        await refreshSources();
    }

    async function stopReading(source) {
        await controlReadAloud(source.tabId, 'stop');
        await refreshSources();
    }

    /** Brings the tab a sound is coming from to the front, window and all. */
    async function goToTab(source) {
        isProgrammaticActivation.set(true);
        setTimeout(() => isProgrammaticActivation.set(false), 1000);
        await chrome.tabs.update(source.tabId, { active: true }).catch(() => {});
        if (Number.isFinite(source.windowId)) {
            await chrome.windows.update(source.windowId, { focused: true }).catch(() => {});
        }
        isPopupOpen = false;
    }

    function sourceStatus(source) {
        if (source.kind === 'reading') {
            return source.paused ? $t('audioSourceReadingPaused') : $t('audioSourceReading');
        }
        return source.muted ? $t('audioSourceMuted') : '';
    }

    // Measured only once it exists, and again whenever its contents could have
    // changed height.
    $effect(() => {
        if (isPopupOpen && popupEl) {
            void sources.length;
            positionPopup();
        }
    });

    $effect(() => {
        clearInterval(refreshTimer);
        if (isPopupOpen) refreshTimer = setInterval(refreshSources, REFRESH_MS);
        return () => clearInterval(refreshTimer);
    });

    $effect(() => () => {
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
        clearInterval(refreshTimer);
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
        role="group"
        aria-label={$t('audioSourcesTitle')}
        style:top={`${popupPosition.top}px`}
        style:left={`${popupPosition.left}px`}
        onmouseenter={handlePopupEnter}
        onmouseleave={handlePopupLeave}
        onfocusout={handleFocusOut}
    >
        <p class="audio-sources-title">{$t('audioSourcesTitle')}</p>
        <ul class="audio-sources-list">
            {#each sources as source (`${source.kind}-${source.tabId}`)}
                <li class="audio-source-row" class:is-silent={source.muted || source.paused}>
                    {#if source.kind === 'reading'}
                        <svg class="audio-source-icon" width="16" height="16" aria-hidden="true" focusable="false">
                            <use href="#icon-read-aloud"></use>
                        </svg>
                    {:else if source.favIconUrl}
                        <img class="audio-source-icon" src={source.favIconUrl} alt="" />
                    {:else}
                        <svg class="audio-source-icon" width="16" height="16" aria-hidden="true" focusable="false">
                            <use href="#icon-speaker"></use>
                        </svg>
                    {/if}

                    <span class="audio-source-text">
                        <span class="audio-source-name" title={source.title}>{source.title}</span>
                        {#if sourceStatus(source)}
                            <span class="audio-source-status">{sourceStatus(source)}</span>
                        {/if}
                    </span>

                    {#if source.kind === 'reading'}
                        <button
                            type="button"
                            class="audio-source-btn"
                            title={source.paused ? $tt('audioSourceResumeReading') : $tt('audioSourcePauseReading')}
                            aria-label={source.paused ? $t('audioSourceResumeReading') : $t('audioSourcePauseReading')}
                            onclick={() => toggleReading(source)}
                        >
                            <svg width="14" height="14" aria-hidden="true" focusable="false">
                                <use href={source.paused ? '#icon-play-solid' : '#icon-pause-solid'}></use>
                            </svg>
                        </button>
                        <button
                            type="button"
                            class="audio-source-btn"
                            title={$tt('audioSourceStopReading')}
                            aria-label={$t('audioSourceStopReading')}
                            onclick={() => stopReading(source)}
                        >
                            <svg width="14" height="14" aria-hidden="true" focusable="false">
                                <use href="#icon-stop-solid"></use>
                            </svg>
                        </button>
                    {:else}
                        <button
                            type="button"
                            class="audio-source-btn"
                            title={source.muted ? $tt('audioSourceUnmute') : $tt('audioSourceMute')}
                            aria-label={source.muted ? $t('audioSourceUnmute') : $t('audioSourceMute')}
                            onclick={() => toggleTab(source)}
                        >
                            <svg width="14" height="14" aria-hidden="true" focusable="false">
                                <use href={source.muted ? '#icon-speaker-muted' : '#icon-speaker'}></use>
                            </svg>
                        </button>
                    {/if}

                    <button
                        type="button"
                        class="audio-source-btn"
                        title={$tt('audioSourceGoToTab')}
                        aria-label={$t('audioSourceGoToTab')}
                        onclick={() => goToTab(source)}
                    >
                        <svg width="14" height="14" aria-hidden="true" focusable="false">
                            <use href="#icon-external"></use>
                        </svg>
                    </button>
                </li>
            {/each}
        </ul>
    </div>
{/if}
