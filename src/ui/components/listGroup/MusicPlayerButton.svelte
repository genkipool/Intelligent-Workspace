<script>
    /**
     * The toolbar's music button and the quick controls that appear under it.
     *
     * The popup is fixed to the viewport rather than nested in the button so the
     * toolbar's flex row is untouched — the button stays a plain sibling of the
     * other controls, which is what the show/hide bookkeeping in viewsService
     * expects — and so the popup can never be clipped by the toolbar's bounds.
     */
    import { t, tt } from '../../stores/i18nStore.js';
    import {
        isPlayerVisible,
        isPlaying,
        hasTracks,
        tracks,
        radioStations,
        currentIndex,
        currentTrack,
        isRadioActive,
        currentRadioStation,
        activeTab,
        volume,
        isMuted,
        setVolume,
        toggleMute,
        togglePanel,
        togglePlay,
        stop,
        playNext,
        playPrevious,
    } from '../../stores/musicPlayerStore.js';

    let { hidden = false } = $props();

    /** Long enough that crossing the toolbar does not flash the popup open. */
    const OPEN_DELAY_MS = 220;
    const CLOSE_DELAY_MS = 160;
    const GAP = 6;

    let buttonEl = $state(null);
    let popupEl = $state(null);
    let isPopupOpen = $state(false);
    let popupPosition = $state({ top: 0, left: 0 });
    let openTimer = null;
    let closeTimer = null;
    // Where the pointer is, so pressing a control inside the popup — which blurs the
    // toolbar button — does not read as leaving it.
    let pointerOnButton = false;
    let pointerOnPopup = false;

    let buttonTitle = $derived.by(() => {
        if ($isPlaying) {
            if ($isRadioActive && $currentRadioStation) {
                return `${$t('musicPlayerNowPlaying', [$currentRadioStation.name])} (${$t('musicPlayerRadioLive')}) — ${$isPlayerVisible ? $t('musicPlayerHide') : $t('musicPlayerShow')}`;
            }
            if ($currentTrack) {
                return `${$t('musicPlayerNowPlaying', [$currentTrack.title])} — ${$isPlayerVisible ? $t('musicPlayerHide') : $t('musicPlayerShow')}`;
            }
        }
        return `${$t('musicPlayer')} — ${$isPlayerVisible ? $t('musicPlayerHide') : $t('musicPlayerShow')}`;
    });

    let nextButtonTitle = $derived.by(() => {
        if (!$hasTracks) return $tt('musicPlayerNext');

        if ($activeTab === 'all') {
            if ($isRadioActive) {
                const rIdx = $radioStations.findIndex((s) => s.id === $currentRadioStation?.id);
                if (rIdx >= 0 && rIdx < $radioStations.length - 1) {
                    return $t('musicPlayerNextStation', [$radioStations[rIdx + 1].name]);
                }
                if ($tracks.length > 0) {
                    return $t('musicPlayerNextTrack', [$tracks[0].title]);
                }
                if ($radioStations.length > 0) {
                    return $t('musicPlayerNextStation', [$radioStations[0].name]);
                }
            } else {
                if ($currentIndex >= 0 && $currentIndex < $tracks.length - 1) {
                    return $t('musicPlayerNextTrack', [$tracks[$currentIndex + 1].title]);
                }
                if ($radioStations.length > 0) {
                    return $t('musicPlayerNextStation', [$radioStations[0].name]);
                }
                if ($tracks.length > 0) {
                    return $t('musicPlayerNextTrack', [$tracks[0].title]);
                }
            }
        } else if ($activeTab === 'radio' || $isRadioActive) {
            if ($radioStations.length > 0) {
                const rIdx = $radioStations.findIndex((s) => s.id === $currentRadioStation?.id);
                const nextIdx = (rIdx + 1) % $radioStations.length;
                return $t('musicPlayerNextStation', [$radioStations[nextIdx].name]);
            }
        } else {
            if ($tracks.length > 0) {
                const nextIdx = ($currentIndex + 1) % $tracks.length;
                return $t('musicPlayerNextTrack', [$tracks[nextIdx].title]);
            }
        }
        return $tt('musicPlayerNext');
    });

    let prevButtonTitle = $derived.by(() => {
        if (!$hasTracks) return $tt('musicPlayerPrevious');

        if ($activeTab === 'all') {
            if ($isRadioActive) {
                const rIdx = $radioStations.findIndex((s) => s.id === $currentRadioStation?.id);
                if (rIdx > 0) {
                    return $t('musicPlayerPreviousStation', [$radioStations[rIdx - 1].name]);
                }
                if ($tracks.length > 0) {
                    return $t('musicPlayerPreviousTrack', [$tracks[$tracks.length - 1].title]);
                }
                if ($radioStations.length > 0) {
                    return $t('musicPlayerPreviousStation', [$radioStations[$radioStations.length - 1].name]);
                }
            } else {
                if ($currentIndex > 0) {
                    return $t('musicPlayerPreviousTrack', [$tracks[$currentIndex - 1].title]);
                }
                if ($radioStations.length > 0) {
                    return $t('musicPlayerPreviousStation', [$radioStations[$radioStations.length - 1].name]);
                }
                if ($tracks.length > 0) {
                    return $t('musicPlayerPreviousTrack', [$tracks[$tracks.length - 1].title]);
                }
            }
        } else if ($activeTab === 'radio' || $isRadioActive) {
            if ($radioStations.length > 0) {
                const rIdx = $radioStations.findIndex((s) => s.id === $currentRadioStation?.id);
                const prevIdx = (rIdx - 1 + $radioStations.length) % $radioStations.length;
                return $t('musicPlayerPreviousStation', [$radioStations[prevIdx].name]);
            }
        } else {
            if ($tracks.length > 0) {
                const prevIdx = ($currentIndex - 1 + $tracks.length) % $tracks.length;
                return $t('musicPlayerPreviousTrack', [$tracks[prevIdx].title]);
            }
        }
        return $tt('musicPlayerPrevious');
    });

    /**
     * Puts the popup under the button, flipping it above and pulling it back inside
     * the window when there is no room, the way the header popups behave.
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
        // With nothing playing there is nothing to control, so the popup stays away.
        if (!$isPlaying) return;
        clearTimeout(closeTimer);
        openTimer = setTimeout(() => {
            if ($isPlaying) {
                isPopupOpen = true;
            }
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

    function handleClick() {
        clearTimeout(openTimer);
        isPopupOpen = false;
        togglePanel();
    }

    // The popup is measured only once it exists, and re-measured whenever what it
    // contains could have changed width.
    $effect(() => {
        if (isPopupOpen && popupEl) {
            void $isPlaying;
            positionPopup();
        }
    });

    $effect(() => {
        // Nothing playing means nothing to hover over.
        if (!$isPlaying) isPopupOpen = false;
    });

    $effect(() => () => {
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
    });
</script>

<button
    bind:this={buttonEl}
    id="open-music-player-btn"
    type="button"
    class="control-btn"
    class:hidden
    class:music-btn-playing={$isPlaying}
    title={buttonTitle}
    aria-label={$t('musicPlayer')}
    aria-pressed={$isPlayerVisible}
    onclick={handleClick}
    onmouseenter={handleButtonEnter}
    onmouseleave={handleButtonLeave}
    onfocus={scheduleOpen}
    onfocusout={handleFocusOut}
>
    <svg width="22" height="22" aria-hidden="true" focusable="false">
        <use href={$isRadioActive ? '#icon-radio' : '#icon-music'}></use>
    </svg>
</button>

{#if isPopupOpen}
    <div
        bind:this={popupEl}
        class="music-quick-popup"
        role="toolbar"
        aria-label={$t('musicPlayer')}
        style:top={`${popupPosition.top}px`}
        style:left={`${popupPosition.left}px`}
        onmouseenter={handlePopupEnter}
        onmouseleave={handlePopupLeave}
        onfocusout={handleFocusOut}
    >
        <button
            type="button"
            class="music-quick-btn"
            title={prevButtonTitle}
            aria-label={prevButtonTitle}
            onclick={playPrevious}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-track-prev"></use></svg>
        </button>
        <button
            type="button"
            class="music-quick-btn"
            title={$isPlaying ? $tt('musicPlayerPause') : $tt('musicPlayerPlay')}
            aria-label={$isPlaying ? $t('musicPlayerPause') : $t('musicPlayerPlay')}
            onclick={togglePlay}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false">
                <use href={$isPlaying ? '#icon-pause-solid' : '#icon-play-solid'}></use>
            </svg>
        </button>
        <button
            type="button"
            class="music-quick-btn"
            title={$tt('musicPlayerStop')}
            aria-label={$t('musicPlayerStop')}
            onclick={stop}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-stop-solid"></use></svg>
        </button>
        <button
            type="button"
            class="music-quick-btn"
            title={nextButtonTitle}
            aria-label={nextButtonTitle}
            onclick={() => playNext()}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-track-next"></use></svg>
        </button>

        <div class="music-quick-divider"></div>

        <div class="music-quick-volume">
            <button
                type="button"
                class="music-quick-btn music-mute-btn"
                title={$isMuted ? $tt('musicPlayerUnmute') : $tt('musicPlayerMute')}
                aria-label={$isMuted ? $t('musicPlayerUnmute') : $t('musicPlayerMute')}
                onclick={toggleMute}
            >
                <svg width="14" height="14" aria-hidden="true" focusable="false">
                    <use href={$isMuted || $volume === 0 ? '#icon-speaker-muted' : '#icon-speaker'}></use>
                </svg>
            </button>
            <input
                type="range"
                class="music-volume-slider music-quick-volume-slider"
                min="0"
                max="1"
                step="0.01"
                value={$isMuted ? 0 : $volume}
                style:--vol-pct={`${($isMuted ? 0 : $volume) * 100}%`}
                title={$tt('musicPlayerVolume')}
                aria-label={$t('musicPlayerVolume')}
                oninput={(e) => setVolume(parseFloat(e.currentTarget.value))}
            />
        </div>
    </div>
{/if}
