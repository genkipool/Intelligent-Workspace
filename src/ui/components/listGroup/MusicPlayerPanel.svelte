<script>
    /**
     * The music player's panel.
     *
     * Everything it shows comes from `musicPlayerStore`, and every button calls back
     * into it. No playback state lives here — and none lives in this page at all: the
     * sound is made by the offscreen document, so hiding the panel, changing view or
     * closing the page leaves the music going.
     */
    import { onMount } from 'svelte';
    import { t, tt } from '../../stores/i18nStore.js';
    import { showNotification } from '../../../utils/i18n.js';
    import { formatTime, ratioFromPointer } from '../../services/musicPlayer/playlist.js';
    import { canPickDirectory, pickDirectory } from '../../services/musicPlayer/folderPicker.js';
    import {
        isPlayerVisible,
        tracks,
        playlistFolder,
        currentTrack,
        currentIndex,
        isPlaying,
        currentTime,
        duration,
        progressRatio,
        isSearchOpen,
        searchQuery,
        searchResults,
        hasTracks,
        loadFolder,
        initMusicPlayer,
        playTrack,
        togglePlay,
        stop,
        playNext,
        playPrevious,
        rewind,
        fastForward,
        seekRatio,
        openSearch,
        closeSearch,
        SEEK_STEP_SECONDS,
    } from '../../stores/musicPlayerStore.js';

    let folderInput = $state(null);
    let searchInput = $state(null);
    let progressBar = $state(null);
    let resultsEl = $state(null);
    let isScrubbing = $state(false);
    /** The folder chooser is offered once per panel opening, never on every render. */
    let offeredFolderPicker = false;

    let trackLabel = $derived($currentTrack?.title ?? $t('musicPlayerEmpty'));
    let positionLabel = $derived(
        $currentTrack ? $t('musicPlayerTrackPosition', [$currentIndex + 1, $tracks.length]) : '',
    );
    let playButtonTitle = $derived(
        $isPlaying
            ? $tt('musicPlayerPause')
            : $currentTrack
              ? $t('musicPlayerPlayTrack', [$currentTrack.title])
              : $tt('musicPlayerPlay'),
    );

    /** Announces what a pick brought in, or that it brought nothing playable. */
    function reportLoad({ loaded, folder, trimmed }) {
        if (loaded === 0) {
            showNotification('musicPlayerNoAudioInFolder', true);
            return;
        }
        if (trimmed) {
            showNotification('musicPlayerFolderTooBig', true, [loaded]);
            return;
        }
        // A pick with no folder name behind it gets its own wording instead of an
        // empty pair of quotes.
        if (folder) showNotification('musicPlayerFolderLoaded', false, [loaded, folder]);
        else showNotification('musicPlayerTracksLoaded', false, [loaded]);
    }

    /**
     * Asks for the folder, preferring the picker that does not talk about uploading.
     * The directory input is only reached when that picker is missing or unusable.
     */
    async function openFolderPicker({ allowInputFallback = true } = {}) {
        if (!canPickDirectory()) {
            if (allowInputFallback) folderInput?.click();
            return;
        }
        try {
            const picked = await pickDirectory();
            if (!picked) return; // the picker was closed without choosing
            reportLoad(await loadFolder(picked.items, { folder: picked.folder }));
        } catch {
            // A picker the browser refused falls back to the input, except when the
            // player opened it by itself: an unasked-for upload prompt is worse than
            // no prompt at all.
            if (allowInputFallback) folderInput?.click();
        }
    }

    async function handleFolderPicked(event) {
        // Copied out first: `files` is live, so clearing the input would empty the very
        // list being read. The input is cleared because it keeps its value, and picking
        // the same folder twice would otherwise go unnoticed.
        const files = Array.from(event.currentTarget.files);
        event.currentTarget.value = '';
        reportLoad(await loadFolder(files));
    }

    function handleSearchKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeSearch();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const [first] = $searchResults;
            if (first) {
                playTrack(first);
                closeSearch();
            }
        }
    }

    function handleResultClick(track) {
        playTrack(track);
        closeSearch();
    }

    function seekFromPointer(event) {
        if (!progressBar) return;
        seekRatio(ratioFromPointer(event.clientX, progressBar.getBoundingClientRect()));
    }

    function handleProgressPointerDown(event) {
        if (!$hasTracks) return;
        isScrubbing = true;
        progressBar?.setPointerCapture?.(event.pointerId);
        seekFromPointer(event);
    }

    function handleProgressPointerMove(event) {
        if (isScrubbing) seekFromPointer(event);
    }

    function handleProgressPointerUp(event) {
        if (!isScrubbing) return;
        isScrubbing = false;
        progressBar?.releasePointerCapture?.(event.pointerId);
    }

    /** Arrow keys nudge the track, so the bar is usable without a pointer. */
    function handleProgressKeydown(event) {
        const steps = { ArrowLeft: -SEEK_STEP_SECONDS, ArrowRight: SEEK_STEP_SECONDS };
        if (!(event.key in steps)) return;
        event.preventDefault();
        if (steps[event.key] < 0) rewind();
        else fastForward();
    }

    // A page opened while the music plays picks the state up from the offscreen
    // player instead of starting blank.
    onMount(() => {
        initMusicPlayer();
    });

    // Opening the panel with nothing loaded goes straight to the folder chooser:
    // an empty player has exactly one useful action.
    $effect(() => {
        if (!$isPlayerVisible) {
            offeredFolderPicker = false;
            return;
        }
        if (offeredFolderPicker || $tracks.length > 0) return;
        offeredFolderPicker = true;
        // Called straight away, not on a timer: the picker needs the click that
        // opened the panel to still count as the gesture behind it.
        openFolderPicker({ allowInputFallback: false });
    });

    // The search box only exists once the name field turns into one, so focus waits
    // for it to be on screen.
    $effect(() => {
        if ($isSearchOpen && searchInput) searchInput.focus();
    });

    // Opening the list on a long folder should land on the track being played, not
    // at the top of an alphabet that may be far from it.
    $effect(() => {
        if (!$isSearchOpen || !resultsEl) return;
        void $searchResults;
        resultsEl.querySelector('.music-result.active')?.scrollIntoView({ block: 'nearest' });
    });
</script>

<section
    id="music-player-panel"
    class="music-panel"
    class:hidden={!$isPlayerVisible}
    aria-label={$t('musicPlayer')}
    aria-hidden={!$isPlayerVisible}
>
    <!-- ① Track name, which doubles as the search box, and the folder chooser -->
    <div class="music-row music-row-title">
        {#if $isSearchOpen}
            <div class="music-search-wrap">
                <svg class="music-search-icon" width="16" height="16" aria-hidden="true" focusable="false">
                    <use href="#icon-search"></use>
                </svg>
                <input
                    bind:this={searchInput}
                    bind:value={$searchQuery}
                    type="search"
                    class="music-search-input"
                    placeholder={$t('musicPlayerSearchPlaceholder')}
                    title={$tt('musicPlayerSearch')}
                    aria-label={$t('musicPlayerSearch')}
                    onkeydown={handleSearchKeydown}
                />
            </div>
            <button type="button" class="music-icon-btn" title={$tt('musicPlayerCloseSearch')} onclick={closeSearch}>
                <svg width="16" height="16" aria-hidden="true" focusable="false">
                    <use href="#icon-close"></use>
                </svg>
            </button>
        {:else}
            <button
                type="button"
                class="music-title-field"
                class:is-empty={!$currentTrack}
                title={$currentTrack ? $t('musicPlayerNowPlaying', [$currentTrack.title]) : $tt('musicPlayerSearch')}
                onclick={openSearch}
                disabled={!$hasTracks}
            >
                <span class="music-track-name">{trackLabel}</span>
                {#if positionLabel}
                    <span class="music-track-position">{positionLabel}</span>
                {/if}
            </button>
            <button
                type="button"
                class="music-icon-btn"
                title={$tt('musicPlayerSearch')}
                aria-label={$t('musicPlayerSearch')}
                onclick={openSearch}
                disabled={!$hasTracks}
            >
                <svg width="16" height="16" aria-hidden="true" focusable="false">
                    <use href="#icon-search"></use>
                </svg>
            </button>
        {/if}
        <button
            type="button"
            class="music-icon-btn"
            title={$hasTracks
                ? `${$tt('musicPlayerChangeFolder')}${$playlistFolder ? ` — ${$playlistFolder}` : ''}`
                : $tt('musicPlayerSelectFolder')}
            aria-label={$hasTracks ? $t('musicPlayerChangeFolder') : $t('musicPlayerSelectFolder')}
            onclick={() => openFolderPicker()}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false">
                <use href="#icon-add-folder"></use>
            </svg>
        </button>
    </div>

    {#if $isSearchOpen}
        <!-- ② Search results, only while the name field is a search box -->
        <div bind:this={resultsEl} class="music-results" role="listbox" aria-label={$t('musicPlayerSearch')}>
            {#if $searchResults.length === 0}
                <p class="music-results-empty">{$t('musicPlayerNoResults')}</p>
            {:else}
                {#each $searchResults as track (track.index)}
                    <button
                        type="button"
                        class="music-result"
                        class:active={track.index === $currentIndex}
                        role="option"
                        aria-selected={track.index === $currentIndex}
                        title={$t('musicPlayerPlayTrack', [track.title])}
                        onclick={() => handleResultClick(track)}
                    >
                        <svg width="14" height="14" aria-hidden="true" focusable="false">
                            <use href={track.index === $currentIndex && $isPlaying ? '#icon-speaker' : '#icon-music'}
                            ></use>
                        </svg>
                        <span class="music-result-name">{track.title}</span>
                    </button>
                {/each}
            {/if}
        </div>
    {/if}

    <!-- ③ Progress, with the elapsed and total times around it -->
    <div class="music-row music-row-progress">
        <span class="music-time" aria-hidden="true">{formatTime($currentTime)}</span>
        <div
            bind:this={progressBar}
            class="music-progress"
            class:scrubbing={isScrubbing}
            role="slider"
            tabindex="0"
            aria-label={$t('musicPlayerSeek')}
            aria-valuemin={0}
            aria-valuemax={Math.round($duration)}
            aria-valuenow={Math.round($currentTime)}
            aria-valuetext={`${formatTime($currentTime)} / ${formatTime($duration)}`}
            title={$tt('musicPlayerSeek')}
            onpointerdown={handleProgressPointerDown}
            onpointermove={handleProgressPointerMove}
            onpointerup={handleProgressPointerUp}
            onpointercancel={handleProgressPointerUp}
            onkeydown={handleProgressKeydown}
        >
            <div class="music-progress-fill" style:width={`${$progressRatio * 100}%`}></div>
            <span class="music-progress-thumb" style:left={`${$progressRatio * 100}%`}></span>
        </div>
        <span class="music-time" aria-hidden="true">{formatTime($duration)}</span>
    </div>

    <!-- ④ Transport -->
    <div class="music-row music-row-controls">
        <div class="music-transport">
            <button
                type="button"
                class="music-action-btn"
                title={$tt('musicPlayerPrevious')}
                aria-label={$t('musicPlayerPrevious')}
                onclick={playPrevious}
                disabled={!$hasTracks}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false"
                    ><use href="#icon-track-prev"></use></svg
                >
            </button>
            <button
                type="button"
                class="music-action-btn"
                title={$t('musicPlayerRewind', [SEEK_STEP_SECONDS])}
                aria-label={$t('musicPlayerRewind', [SEEK_STEP_SECONDS])}
                onclick={rewind}
                disabled={!$hasTracks}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false"><use href="#icon-rewind"></use></svg>
            </button>
            <button
                type="button"
                class="music-action-btn music-play-btn"
                title={playButtonTitle}
                aria-label={playButtonTitle}
                onclick={togglePlay}
                disabled={!$hasTracks}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href={$isPlaying ? '#icon-pause-solid' : '#icon-play-solid'}></use>
                </svg>
            </button>
            <button
                type="button"
                class="music-action-btn"
                title={$tt('musicPlayerStop')}
                aria-label={$t('musicPlayerStop')}
                onclick={stop}
                disabled={!$hasTracks}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false"
                    ><use href="#icon-stop-solid"></use></svg
                >
            </button>
            <button
                type="button"
                class="music-action-btn"
                title={$t('musicPlayerForward', [SEEK_STEP_SECONDS])}
                aria-label={$t('musicPlayerForward', [SEEK_STEP_SECONDS])}
                onclick={fastForward}
                disabled={!$hasTracks}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false"
                    ><use href="#icon-fast-forward"></use></svg
                >
            </button>
            <button
                type="button"
                class="music-action-btn"
                title={$tt('musicPlayerNext')}
                aria-label={$t('musicPlayerNext')}
                onclick={() => playNext()}
                disabled={!$hasTracks}
            >
                <svg width="18" height="18" aria-hidden="true" focusable="false"
                    ><use href="#icon-track-next"></use></svg
                >
            </button>
        </div>

        {#if $hasTracks}
            <span class="music-count" title={$playlistFolder}>{$t('musicPlayerTrackCount', [$tracks.length])}</span>
        {:else}
            <button type="button" class="music-empty-hint" onclick={() => openFolderPicker()}>
                {$t('musicPlayerEmptyHint')}
            </button>
        {/if}
    </div>

    <input
        bind:this={folderInput}
        id="music-folder-input"
        type="file"
        class="hidden"
        accept="audio/*"
        multiple
        webkitdirectory
        aria-hidden="true"
        tabindex="-1"
        onchange={handleFolderPicked}
    />
</section>
