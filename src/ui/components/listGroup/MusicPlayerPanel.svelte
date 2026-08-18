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
    import CloseItemButton from '../common/CloseItemButton.svelte';
    import { formatTime, ratioFromPointer, groupTracksByFolder } from '../../services/musicPlayer/playlist.js';
    import {
        canPickDirectory,
        pickDirectory,
        canPickFiles,
        pickFiles,
    } from '../../services/musicPlayer/folderPicker.js';
    import {
        isPlayerVisible,
        tracks,
        currentTrack,
        currentIndex,
        isPlaying,
        currentTime,
        duration,
        progressRatio,
        volume,
        isMuted,
        isSearchOpen,
        searchQuery,
        searchResults,
        hasTracks,
        loadFolder,
        initMusicPlayer,
        playTrack,
        removeTrack,
        removeFolder,
        togglePlay,
        stop,
        playNext,
        playPrevious,
        rewind,
        fastForward,
        seekRatio,
        setVolume,
        toggleMute,
        openSearch,
        closeSearch,
        SEEK_STEP_SECONDS,
    } from '../../stores/musicPlayerStore.js';

    let folderInput = $state(null);
    let filesInput = $state(null);
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

    let groupedResults = $derived(groupTracksByFolder($searchResults));

    function handleLoadResult(res) {
        if (!res) return;
        if (res.duplicates > 0) {
            if (res.loaded === 0) {
                showNotification('musicPlayerAllDuplicates', true);
            } else {
                showNotification('musicPlayerDuplicatesIgnored', true, [res.duplicates]);
            }
        }
    }

    /**
     * Asks for the folder using the directory picker dialog.
     */
    async function openFolderPicker() {
        if (canPickDirectory()) {
            try {
                const picked = await pickDirectory();
                if (!picked) return;
                const res = await loadFolder(picked.items, { folder: picked.folder });
                handleLoadResult(res);
                return;
            } catch {
                // fall through to input
            }
        }
        folderInput?.click();
    }

    /**
     * Asks to choose multiple audio files directly.
     */
    async function openFilesPicker() {
        if (!canPickFiles()) {
            filesInput?.click();
            return;
        }
        try {
            const picked = await pickFiles();
            if (!picked) return;
            const res = await loadFolder(picked.items, { folder: '' });
            handleLoadResult(res);
        } catch {
            filesInput?.click();
        }
    }

    async function handleFolderPicked(event) {
        // Copied out first: `files` is live, so clearing the input would empty the very
        // list being read. The input is cleared because it keeps its value, and picking
        // the same folder twice would otherwise go unnoticed.
        const files = Array.from(event.currentTarget.files);
        event.currentTarget.value = '';
        const res = await loadFolder(files);
        handleLoadResult(res);
    }

    async function handleFilesPicked(event) {
        const files = Array.from(event.currentTarget.files);
        event.currentTarget.value = '';
        const res = await loadFolder(files);
        handleLoadResult(res);
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
        openFolderPicker();
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
            title={$tt('musicPlayerSelectFiles')}
            aria-label={$t('musicPlayerSelectFiles')}
            onclick={() => openFilesPicker()}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false">
                <use href="#icon-music"></use>
            </svg>
        </button>
        <button
            type="button"
            class="music-icon-btn"
            title={$tt('musicPlayerSelectFolder')}
            aria-label={$t('musicPlayerSelectFolder')}
            onclick={() => openFolderPicker()}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false">
                <use href="#icon-add-folder"></use>
            </svg>
        </button>
    </div>

    {#if $isSearchOpen}
        <!-- ② Search results, nested by folder when folders exist (matching Bookmarks tree style) -->
        <div bind:this={resultsEl} class="music-results" role="listbox" aria-label={$t('musicPlayerSearch')}>
            {#if $searchResults.length === 0}
                <p class="music-results-empty">{$t('musicPlayerNoResults')}</p>
            {:else if groupedResults.length === 1 && !groupedResults[0].folder}
                <!-- Flat list if no folders are present -->
                {#each groupedResults[0].tracks as track (track.index)}
                    <div
                        class="music-result"
                        class:active={track.index === $currentIndex}
                        role="option"
                        aria-selected={track.index === $currentIndex}
                        tabindex="0"
                        onclick={() => handleResultClick(track)}
                        onkeydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleResultClick(track);
                            }
                        }}
                    >
                        <svg width="14" height="14" class="music-track-icon" aria-hidden="true" focusable="false">
                            <use href={track.index === $currentIndex && $isPlaying ? '#icon-speaker' : '#icon-music'}
                            ></use>
                        </svg>
                        <span class="music-result-name" title={$t('musicPlayerPlayTrack', [track.title])}
                            >{track.title}</span
                        >
                        <CloseItemButton
                            title={$tt('musicPlayerRemoveTrack')}
                            ariaLabel={$t('musicPlayerRemoveTrack')}
                            size={16}
                            onclick={() => removeTrack(track.index)}
                        />
                    </div>
                {/each}
            {:else}
                <!-- Nested folder view matching Bookmarks view structure -->
                {#each groupedResults as group (group.folder)}
                    <details class="music-folder" open>
                        <summary class="music-folder-title">
                            <span class="folder-icon-wrapper">
                                <svg
                                    class="folder-icon folder-icon-closed"
                                    width="16"
                                    height="16"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <use href="#icon-folder-closed"></use>
                                </svg>
                                <svg
                                    class="folder-icon folder-icon-open"
                                    width="16"
                                    height="16"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <use href="#icon-folder-open"></use>
                                </svg>
                            </span>
                            <span class="folder-name" title={group.folder || $t('otherGroupName')}>
                                {group.folder || $t('otherGroupName')}
                            </span>
                            <span class="music-folder-count">({group.tracks.length})</span>
                            <button
                                type="button"
                                class="action-btn delete-group-btn music-folder-delete-btn"
                                title={$tt('musicPlayerRemoveFolder')}
                                aria-label={$t('musicPlayerRemoveFolder')}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    removeFolder(group.folder);
                                }}
                            >
                                <svg width="14" height="14" aria-hidden="true" focusable="false">
                                    <use href="#icon-trash"></use>
                                </svg>
                            </button>
                        </summary>
                        <div class="music-folder-content">
                            {#each group.tracks as track (track.index)}
                                <div
                                    class="music-result"
                                    class:active={track.index === $currentIndex}
                                    role="option"
                                    aria-selected={track.index === $currentIndex}
                                    tabindex="0"
                                    onclick={() => handleResultClick(track)}
                                    onkeydown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleResultClick(track);
                                        }
                                    }}
                                >
                                    <svg
                                        width="14"
                                        height="14"
                                        class="music-track-icon"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <use
                                            href={track.index === $currentIndex && $isPlaying
                                                ? '#icon-speaker'
                                                : '#icon-music'}
                                        ></use>
                                    </svg>
                                    <span class="music-result-name" title={$t('musicPlayerPlayTrack', [track.title])}
                                        >{track.title}</span
                                    >
                                    <CloseItemButton
                                        title={$tt('musicPlayerRemoveTrack')}
                                        ariaLabel={$t('musicPlayerRemoveTrack')}
                                        size={16}
                                        onclick={() => removeTrack(track.index)}
                                    />
                                </div>
                            {/each}
                        </div>
                    </details>
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

    <!-- ④ Transport & Volume -->
    <div class="music-row music-row-controls">
        <div class="music-controls-center">
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
                    <svg width="18" height="18" aria-hidden="true" focusable="false"
                        ><use href="#icon-rewind"></use></svg
                    >
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

            <div class="music-controls-divider"></div>

            <div class="music-volume-control">
                <button
                    type="button"
                    class="music-action-btn music-mute-btn"
                    title={$tt($isMuted || $volume === 0 ? 'musicPlayerUnmute' : 'musicPlayerMute')}
                    aria-label={$t($isMuted || $volume === 0 ? 'musicPlayerUnmute' : 'musicPlayerMute')}
                    onclick={toggleMute}
                >
                    <svg width="16" height="16" aria-hidden="true" focusable="false">
                        <use href={$isMuted || $volume === 0 ? '#icon-speaker-muted' : '#icon-speaker'}></use>
                    </svg>
                </button>
                <input
                    type="range"
                    class="music-volume-slider"
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
    <input
        bind:this={filesInput}
        id="music-files-input"
        type="file"
        class="hidden"
        accept="audio/*"
        multiple
        aria-hidden="true"
        tabindex="-1"
        onchange={handleFilesPicked}
    />
</section>
