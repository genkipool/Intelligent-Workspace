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
    import { openModal, showRadioStationsModal } from '../../stores/modalStore.js';
    import {
        isPlayerVisible,
        tracks,
        radioStations,
        isRadioActive,
        currentRadioStation,
        activeTab,
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
        radioSearchResults,
        hasTracks,
        loadFolder,
        initMusicPlayer,
        playTrack,
        playRadioStation,
        removeTrack,
        removeFolder,
        removeRadioStation,
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
        isRadioSyncEnabled,
        toggleRadioSync,
        exportRadioStations,
        importRadioStations,
        hidePomodoroPanelIfOpen,
        SEEK_STEP_SECONDS,
    } from '../../stores/musicPlayerStore.js';

    let folderInput = $state(null);
    let filesInput = $state(null);
    let radioFileInput = $state(null);
    let searchInput = $state(null);
    let progressBar = $state(null);
    let resultsEl = $state(null);
    let addMenuEl = $state(null);
    let addBtnEl = $state(null);
    let isScrubbing = $state(false);
    let isAddMenuOpen = $state(false);
    let isDragOver = $state(false);

    /** The folder chooser is offered once per panel opening, never on every render. */
    let offeredFolderPicker = false;

    let trackLabel = $derived(
        $isRadioActive && $currentRadioStation
            ? $currentRadioStation.name
            : ($currentTrack?.title ?? $t('musicPlayerEmpty')),
    );

    let positionLabel = $derived.by(() => {
        if ($isRadioActive && $currentRadioStation) {
            return $isPlaying ? $t('musicPlayerRadioLive') : '';
        }
        return $currentTrack ? $t('musicPlayerTrackPosition', [$currentIndex + 1, $tracks.length]) : '';
    });

    let playButtonTitle = $derived.by(() => {
        if ($isPlaying) return $tt('musicPlayerPause');
        if ($isRadioActive && $currentRadioStation) {
            return $t('musicPlayerPlayTrack', [$currentRadioStation.name]);
        }
        if ($currentTrack) {
            return $t('musicPlayerPlayTrack', [$currentTrack.title]);
        }
        return $tt('musicPlayerPlay');
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
        isAddMenuOpen = false;
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
        isAddMenuOpen = false;
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

    function handleExportRadio() {
        const exported = exportRadioStations();
        if (exported) {
            showNotification('radioExportSuccess', false);
        } else {
            showNotification('radioExportEmpty', false);
        }
    }

    function handleTriggerImportRadio() {
        radioFileInput?.click();
    }

    async function handleRadioFileChange(event) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const res = await importRadioStations(parsed);
            if (res.success) {
                if (res.addedCount > 0) {
                    showNotification('radioImportSuccess', false, [res.addedCount]);
                } else {
                    showNotification('radioImportNoNew', false);
                }
            } else {
                showNotification('radioImportInvalidFile', true);
            }
        } catch {
            showNotification('radioImportInvalidFile', true);
        } finally {
            event.currentTarget.value = '';
        }
    }

    async function handleToggleSync() {
        const active = await toggleRadioSync();
        if (active) {
            showNotification('radioSyncActiveNotification', false);
        } else {
            showNotification('radioSyncDisabledNotification', false);
        }
    }

    function toggleAddMenu(event) {
        event.stopPropagation();
        isAddMenuOpen = !isAddMenuOpen;
    }

    function handleSearchKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeSearch();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if ($activeTab === 'radio') {
                const [first] = $radioSearchResults;
                if (first) {
                    playRadioStation(first);
                }
            } else {
                const [first] = $searchResults;
                if (first) {
                    playTrack(first);
                }
            }
        }
    }

    function handleResultClick(track) {
        playTrack(track);
    }

    function handleRadioResultClick(station) {
        playRadioStation(station);
    }

    function seekFromPointer(event) {
        if (!progressBar || $isRadioActive) return;
        seekRatio(ratioFromPointer(event.clientX, progressBar.getBoundingClientRect()));
    }

    function handleProgressPointerDown(event) {
        if (!$hasTracks || $isRadioActive) return;
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
        if ($isRadioActive) return;
        const steps = { ArrowLeft: -SEEK_STEP_SECONDS, ArrowRight: SEEK_STEP_SECONDS };
        if (!(event.key in steps)) return;
        event.preventDefault();
        if (steps[event.key] < 0) rewind();
        else fastForward();
    }

    function handleOpenRadioModal() {
        openModal(showRadioStationsModal);
    }

    function handleDragOver(e) {
        e.preventDefault();
        isDragOver = true;
    }

    function handleDragLeave(e) {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            isDragOver = false;
        }
    }

    async function handleDrop(e) {
        e.preventDefault();
        isDragOver = false;
        if (e.dataTransfer?.files?.length) {
            const files = Array.from(e.dataTransfer.files);
            const res = await loadFolder(files);
            handleLoadResult(res);
        }
    }

    function onWindowClick(event) {
        if (isAddMenuOpen && addMenuEl && !addMenuEl.contains(event.target) && !addBtnEl?.contains(event.target)) {
            isAddMenuOpen = false;
        }
    }

    onMount(() => {
        initMusicPlayer();
        window.addEventListener('click', onWindowClick);
        return () => {
            window.removeEventListener('click', onWindowClick);
        };
    });

    $effect(() => {
        if (!$isPlayerVisible) {
            offeredFolderPicker = false;
            isAddMenuOpen = false;
            return;
        }
        hidePomodoroPanelIfOpen();
        if (offeredFolderPicker || $tracks.length > 0 || $radioStations.length > 0) return;
        offeredFolderPicker = true;
        openFolderPicker();
    });

    $effect(() => {
        if ($isSearchOpen && searchInput) searchInput.focus();
    });

    $effect(() => {
        if (!$isSearchOpen || !resultsEl) return;
        void $searchResults;
        void $radioSearchResults;
        resultsEl.querySelector('.music-result.active, .saved-radio-item.active')?.scrollIntoView({ block: 'nearest' });
    });
</script>

<section
    id="music-player-panel"
    class="music-panel"
    class:hidden={!$isPlayerVisible}
    class:is-drag-over={isDragOver}
    aria-label={$t('musicPlayer')}
    aria-hidden={!$isPlayerVisible}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
>
    <!-- ① Track name / search box, Radio modal button, and unified Folder/Files button -->
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
                class:is-empty={!$currentTrack && !($isRadioActive && $currentRadioStation)}
                class:is-radio={$isRadioActive}
                title={$isRadioActive && $currentRadioStation
                    ? $t('musicPlayerNowPlaying', [$currentRadioStation.name])
                    : $currentTrack
                      ? $t('musicPlayerNowPlaying', [$currentTrack.title])
                      : $tt('musicPlayerSearch')}
                onclick={openSearch}
                disabled={!$hasTracks}
            >
                <span class="music-track-name">{trackLabel}</span>
                {#if $isRadioActive && positionLabel}
                    <span class="music-live-text-simple">{positionLabel}</span>
                {:else if positionLabel}
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

        <!-- Radio button: Opens modal to add and manage online radio stations -->
        <button
            type="button"
            class="music-icon-btn"
            class:active={$isRadioActive}
            title={$tt('musicPlayerRadioStations')}
            aria-label={$t('musicPlayerRadioStations')}
            onclick={handleOpenRadioModal}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false">
                <use href="#icon-radio"></use>
            </svg>
        </button>

        <!-- Unified Directory & Files button with dropdown menu -->
        <div class="music-add-menu-container">
            <button
                bind:this={addBtnEl}
                type="button"
                class="music-icon-btn music-add-folder-btn"
                title={$tt('musicPlayerSelectFolder')}
                aria-label={$t('musicPlayerSelectFolder')}
                aria-haspopup="true"
                aria-expanded={isAddMenuOpen}
                onclick={toggleAddMenu}
            >
                <svg width="16" height="16" aria-hidden="true" focusable="false">
                    <use href="#icon-add-folder"></use>
                </svg>
            </button>

            {#if isAddMenuOpen}
                <div bind:this={addMenuEl} class="music-dropdown-menu" role="menu">
                    <button
                        type="button"
                        class="music-dropdown-item"
                        role="menuitem"
                        onclick={() => openFolderPicker()}
                    >
                        <svg width="15" height="15" aria-hidden="true" focusable="false">
                            <use href="#icon-folder-open"></use>
                        </svg>
                        <span>{$t('musicPlayerAddFolderOption')}</span>
                    </button>
                    <button type="button" class="music-dropdown-item" role="menuitem" onclick={() => openFilesPicker()}>
                        <svg width="15" height="15" aria-hidden="true" focusable="false">
                            <use href="#icon-music"></use>
                        </svg>
                        <span>{$t('musicPlayerAddFilesOption')}</span>
                    </button>
                </div>
            {/if}
        </div>
    </div>

    <!-- ② 3-Tab Interface: Música, Radio, Todo (visible when search/list view is open) -->
    {#if $isSearchOpen}
        <div class="music-tabs" role="tablist">
            <button
                type="button"
                role="tab"
                class="music-tab-btn"
                class:active={$activeTab === 'music'}
                aria-selected={$activeTab === 'music'}
                onclick={() => activeTab.set('music')}
            >
                <svg width="14" height="14" aria-hidden="true" focusable="false">
                    <use href="#icon-music"></use>
                </svg>
                <span>{$t('musicTabMusic')}</span>
                {#if $tracks.length > 0}
                    <span class="music-tab-badge">{$tracks.length}</span>
                {/if}
            </button>
            <button
                type="button"
                role="tab"
                class="music-tab-btn"
                class:active={$activeTab === 'radio'}
                aria-selected={$activeTab === 'radio'}
                onclick={() => activeTab.set('radio')}
            >
                <svg width="14" height="14" aria-hidden="true" focusable="false">
                    <use href="#icon-radio"></use>
                </svg>
                <span>{$t('musicTabRadio')}</span>
                {#if $radioStations.length > 0}
                    <span class="music-tab-badge">{$radioStations.length}</span>
                {/if}
            </button>
            <button
                type="button"
                role="tab"
                class="music-tab-btn"
                class:active={$activeTab === 'all'}
                aria-selected={$activeTab === 'all'}
                onclick={() => activeTab.set('all')}
            >
                <svg width="14" height="14" aria-hidden="true" focusable="false">
                    <use href="#icon-playlist"></use>
                </svg>
                <span>{$t('musicTabAll')}</span>
                {#if $tracks.length + $radioStations.length > 0}
                    <span class="music-tab-badge">{$tracks.length + $radioStations.length}</span>
                {/if}
            </button>
        </div>

        <!-- Track & Radio List View -->
        <div bind:this={resultsEl} class="music-results" role="listbox" aria-label={$t('musicPlayerSearch')}>
            <!-- TAB 1: MUSIC ONLY -->
            {#if $activeTab === 'music'}
                {#if $searchResults.length === 0}
                    <p class="music-results-empty">{$t('musicPlayerNoResults')}</p>
                {:else if groupedResults.length === 1 && !groupedResults[0].folder}
                    {#each groupedResults[0].tracks as track (track.index)}
                        <div
                            class="music-result"
                            class:active={!$isRadioActive && track.index === $currentIndex}
                            role="option"
                            aria-selected={!$isRadioActive && track.index === $currentIndex}
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
                                <use
                                    href={!$isRadioActive && track.index === $currentIndex && $isPlaying
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
                {:else}
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
                                        class:active={!$isRadioActive && track.index === $currentIndex}
                                        role="option"
                                        aria-selected={!$isRadioActive && track.index === $currentIndex}
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
                                                href={!$isRadioActive && track.index === $currentIndex && $isPlaying
                                                    ? '#icon-speaker'
                                                    : '#icon-music'}
                                            ></use>
                                        </svg>
                                        <span
                                            class="music-result-name"
                                            title={$t('musicPlayerPlayTrack', [track.title])}>{track.title}</span
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

                <!-- TAB 2: RADIO ONLY -->
            {:else if $activeTab === 'radio'}
                {#if $radioSearchResults.length === 0}
                    <div class="radio-results-empty-container">
                        <p class="music-results-empty">{$t('radioStationEmptyList')}</p>
                    </div>
                {:else}
                    {#each $radioSearchResults as station (station.id)}
                        {@const isSelected = $isRadioActive && $currentRadioStation?.id === station.id}
                        {@const isPlayingThis = isSelected && $isPlaying}
                        <div
                            class="music-result music-radio-result"
                            class:active={isSelected}
                            role="option"
                            aria-selected={isSelected}
                            tabindex="0"
                            onclick={() => handleRadioResultClick(station)}
                            onkeydown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleRadioResultClick(station);
                                }
                            }}
                        >
                            <svg width="14" height="14" class="music-track-icon" aria-hidden="true" focusable="false">
                                <use href={isPlayingThis ? '#icon-speaker' : '#icon-radio'}></use>
                            </svg>
                            <div class="music-radio-meta">
                                <span class="music-result-name" title={station.name}>{station.name}</span>
                                <span class="music-radio-url-preview" title={station.url}>{station.url}</span>
                            </div>
                            <CloseItemButton
                                title={$tt('radioStationDelete')}
                                ariaLabel={$t('radioStationDelete')}
                                size={16}
                                onclick={() => removeRadioStation(station.id)}
                            />
                        </div>
                    {/each}
                {/if}

                <!-- TAB 3: ALL (MUSIC + RADIO) -->
            {:else}
                {#if $radioSearchResults.length > 0}
                    <details class="music-folder music-all-section" open>
                        <summary class="music-folder-title">
                            <span class="folder-icon-wrapper">
                                <svg width="16" height="16" aria-hidden="true" focusable="false">
                                    <use href="#icon-radio"></use>
                                </svg>
                            </span>
                            <span class="folder-name">{$t('radioStationSavedList')}</span>
                            <span class="music-folder-count">({$radioSearchResults.length})</span>
                        </summary>
                        <div class="music-folder-content">
                            {#each $radioSearchResults as station (station.id)}
                                {@const isSelected = $isRadioActive && $currentRadioStation?.id === station.id}
                                <div
                                    class="music-result music-radio-result"
                                    class:active={isSelected}
                                    role="option"
                                    aria-selected={isSelected}
                                    tabindex="0"
                                    onclick={() => handleRadioResultClick(station)}
                                    onkeydown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleRadioResultClick(station);
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
                                        <use href={isSelected && $isPlaying ? '#icon-speaker' : '#icon-radio'}></use>
                                    </svg>
                                    <span class="music-result-name" title={station.name}>{station.name}</span>
                                    <CloseItemButton
                                        title={$tt('radioStationDelete')}
                                        ariaLabel={$t('radioStationDelete')}
                                        size={16}
                                        onclick={() => removeRadioStation(station.id)}
                                    />
                                </div>
                            {/each}
                        </div>
                    </details>
                {/if}

                {#if $searchResults.length === 0 && $radioSearchResults.length === 0}
                    <p class="music-results-empty">{$t('musicPlayerNoResults')}</p>
                {:else if groupedResults.length === 1 && !groupedResults[0].folder}
                    {#each groupedResults[0].tracks as track (track.index)}
                        <div
                            class="music-result"
                            class:active={!$isRadioActive && track.index === $currentIndex}
                            role="option"
                            aria-selected={!$isRadioActive && track.index === $currentIndex}
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
                                <use
                                    href={!$isRadioActive && track.index === $currentIndex && $isPlaying
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
                {:else}
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
                                        class:active={!$isRadioActive && track.index === $currentIndex}
                                        role="option"
                                        aria-selected={!$isRadioActive && track.index === $currentIndex}
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
                                                href={!$isRadioActive && track.index === $currentIndex && $isPlaying
                                                    ? '#icon-speaker'
                                                    : '#icon-music'}
                                            ></use>
                                        </svg>
                                        <span
                                            class="music-result-name"
                                            title={$t('musicPlayerPlayTrack', [track.title])}>{track.title}</span
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
            {/if}
        </div>

        {#if $activeTab === 'radio'}
            <!-- Radio Tab Footer Toolbar (Fixed: Add, Export, Import, Sync) -->
            <div class="radio-tab-footer-toolbar">
                <button
                    type="button"
                    class="radio-footer-btn"
                    title={$tt('radioStationAddTooltip')}
                    aria-label={$t('radioStationAddBtn')}
                    onclick={handleOpenRadioModal}
                >
                    <span>{$t('radioStationAddBtn')}</span>
                </button>

                <button
                    type="button"
                    class="radio-footer-btn"
                    title={$tt('radioExportTooltip')}
                    aria-label={$t('radioExportBtn')}
                    onclick={handleExportRadio}
                >
                    <span>{$t('radioExportBtn')}</span>
                </button>

                <button
                    type="button"
                    class="radio-footer-btn"
                    title={$tt('radioImportTooltip')}
                    aria-label={$t('radioImportBtn')}
                    onclick={handleTriggerImportRadio}
                >
                    <span>{$t('radioImportBtn')}</span>
                </button>

                <button
                    type="button"
                    class="radio-footer-btn radio-sync-btn"
                    class:active={$isRadioSyncEnabled}
                    title={$isRadioSyncEnabled ? $tt('radioSyncEnabledTooltip') : $tt('radioSyncDisabledTooltip')}
                    aria-label={$t('radioSyncBtn')}
                    aria-pressed={$isRadioSyncEnabled}
                    onclick={handleToggleSync}
                >
                    <span>{$t('radioSyncBtn')}</span>
                </button>
            </div>
        {/if}
    {/if}

    <!-- ③ Progress, with elapsed and total times or LIVE indicator for radio -->
    <div class="music-row music-row-progress" class:is-radio={$isRadioActive}>
        <span class="music-time" aria-hidden="true">{formatTime($currentTime)}</span>

        {#if $isRadioActive}
            <div class="music-progress-radio-container" title={$tt('musicPlayerLiveStream')}></div>
            <span class="music-time music-time-live" aria-hidden="true">
                <svg width="13" height="13" aria-hidden="true" focusable="false">
                    <use href="#icon-radio"></use>
                </svg>
            </span>
        {:else}
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
        {/if}
    </div>

    <!-- ④ Transport & Volume Controls -->
    <div class="music-row music-row-controls">
        <div class="music-controls-center">
            <div class="music-transport">
                <button
                    type="button"
                    class="music-action-btn"
                    title={prevButtonTitle}
                    aria-label={prevButtonTitle}
                    onclick={playPrevious}
                    disabled={!$hasTracks}
                >
                    <svg width="18" height="18" aria-hidden="true" focusable="false">
                        <use href="#icon-track-prev"></use>
                    </svg>
                </button>
                <button
                    type="button"
                    class="music-action-btn"
                    title={$isRadioActive ? '' : $t('musicPlayerRewind', [SEEK_STEP_SECONDS])}
                    aria-label={$isRadioActive ? '' : $t('musicPlayerRewind', [SEEK_STEP_SECONDS])}
                    onclick={rewind}
                    disabled={!$hasTracks || $isRadioActive}
                >
                    <svg width="18" height="18" aria-hidden="true" focusable="false">
                        <use href="#icon-rewind"></use>
                    </svg>
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
                    <svg width="18" height="18" aria-hidden="true" focusable="false">
                        <use href="#icon-stop-solid"></use>
                    </svg>
                </button>
                <button
                    type="button"
                    class="music-action-btn"
                    title={$isRadioActive ? '' : $t('musicPlayerForward', [SEEK_STEP_SECONDS])}
                    aria-label={$isRadioActive ? '' : $t('musicPlayerForward', [SEEK_STEP_SECONDS])}
                    onclick={fastForward}
                    disabled={!$hasTracks || $isRadioActive}
                >
                    <svg width="18" height="18" aria-hidden="true" focusable="false">
                        <use href="#icon-fast-forward"></use>
                    </svg>
                </button>
                <button
                    type="button"
                    class="music-action-btn"
                    title={nextButtonTitle}
                    aria-label={nextButtonTitle}
                    onclick={() => playNext()}
                    disabled={!$hasTracks}
                >
                    <svg width="18" height="18" aria-hidden="true" focusable="false">
                        <use href="#icon-track-next"></use>
                    </svg>
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

    <!-- Hidden native file and directory pickers for browser fallback -->
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
    <input
        bind:this={radioFileInput}
        id="music-radio-import-input"
        type="file"
        class="hidden"
        accept=".json,application/json"
        aria-hidden="true"
        tabindex="-1"
        onchange={handleRadioFileChange}
    />
</section>
