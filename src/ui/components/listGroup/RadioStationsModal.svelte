<script>
    import { SvelteSet } from 'svelte/reactivity';
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import { deaccent, foldForSearch } from '../../services/utils.js';
    import {
        radioStations,
        currentRadioStation,
        isRadioActive,
        isPlaying,
        addRadioStation,
        removeRadioStation,
        playRadioStation,
        pause,
        DEFAULT_RADIO_STATIONS,
    } from '../../stores/musicPlayerStore.js';

    let { show = false, onClose } = $props();

    let searchQuery = $state('');
    let activeModalTab = $state('online'); // 'online' | 'saved'
    let isSearching = $state(false);
    let onlineStations = $state([]);
    let selectedStationUuids = new SvelteSet();
    let searchTimeout = null;
    let searchInput = $state(null);
    let searchError = $state('');

    $effect(() => {
        if (show) {
            searchQuery = '';
            onlineStations = [];
            selectedStationUuids.clear();
            searchError = '';
            setTimeout(() => {
                searchInput?.focus();
            }, 60);
        } else {
            searchQuery = '';
            onlineStations = [];
            selectedStationUuids.clear();
            searchError = '';
        }
    });

    let filteredSavedStations = $derived.by(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return $radioStations;
        const words = query.split(/\s+/).filter(Boolean);
        return $radioStations.filter((s) => {
            const haystack = `${s.name || ''} ${s.url || ''}`.toLowerCase();
            return words.every((w) => haystack.includes(w));
        });
    });

    let sortedOnlineStations = $derived.by(() => {
        if (!onlineStations || onlineStations.length === 0) return [];
        return [...onlineStations].sort((a, b) => {
            const addedA = isStationAdded(a) ? 1 : 0;
            const addedB = isStationAdded(b) ? 1 : 0;
            return addedB - addedA;
        });
    });

    let unaddedOnlineCount = $derived(sortedOnlineStations.filter((s) => !isStationAdded(s)).length);

    function filterAndRankOnlineStations(results, query) {
        if (!Array.isArray(results)) return [];
        /*
         * Folded — lowercased and stripped of accents — on BOTH sides of every
         * comparison below. The filter here is strict: a word that is not found throws
         * the station away entirely, so `ole` against `Radio Olé` used to discard the
         * very station the reader was looking for, even when the directory had returned
         * it. What gets rendered is still `s.name` with its accents.
         */
        const trimmed = foldForSearch(query.trim());
        const words = trimmed.split(/\s+/).filter(Boolean);
        if (words.length === 0) return [];

        // 1. Strict filter: every search word must be present in name, tags, country, or state
        const valid = results.filter((s) => {
            if (!s.name || (!s.url_resolved && !s.url)) return false;
            const haystack = foldForSearch(`${s.name} ${s.tags || ''} ${s.country || ''} ${s.state || ''}`);
            return words.every((word) => haystack.includes(word));
        });

        // 2. Score and sort by relevance
        return valid.sort((a, b) => {
            // Already added stations always first
            const addedA = isStationAdded(a) ? 1 : 0;
            const addedB = isStationAdded(b) ? 1 : 0;
            if (addedA !== addedB) return addedB - addedA;

            const nameA = foldForSearch(a.name || '');
            const nameB = foldForSearch(b.name || '');

            // Exact full phrase matching
            const exactA = nameA === trimmed ? 1 : 0;
            const exactB = nameB === trimmed ? 1 : 0;
            if (exactA !== exactB) return exactB - exactA;

            const startsA = nameA.startsWith(trimmed) ? 1 : 0;
            const startsB = nameB.startsWith(trimmed) ? 1 : 0;
            if (startsA !== startsB) return startsB - startsA;

            const containsPhraseA = nameA.includes(trimmed) ? 1 : 0;
            const containsPhraseB = nameB.includes(trimmed) ? 1 : 0;
            if (containsPhraseA !== containsPhraseB) return containsPhraseB - containsPhraseA;

            // All words present in station name (vs in tags)
            const allInNameA = words.every((w) => nameA.includes(w)) ? 1 : 0;
            const allInNameB = words.every((w) => nameB.includes(w)) ? 1 : 0;
            if (allInNameA !== allInNameB) return allInNameB - allInNameA;

            // Popularity / clickcount / votes
            const votesA = (a.votes || 0) + (a.clickcount || 0);
            const votesB = (b.votes || 0) + (b.clickcount || 0);
            if (votesA !== votesB) return votesB - votesA;

            // Bitrate (higher audio quality first)
            const bitrateA = a.bitrate || 0;
            const bitrateB = b.bitrate || 0;
            return bitrateB - bitrateA;
        });
    }

    async function togglePlayOnlineStation(station, event) {
        if (event) event.stopPropagation();
        const url = station.url_resolved || station.url;
        if (!url) return;

        const isCurrentlyPlayingThis =
            $isRadioActive &&
            $isPlaying &&
            ($currentRadioStation?.url === url ||
                $currentRadioStation?.id === station.stationuuid ||
                $currentRadioStation?.name === station.name);

        if (isCurrentlyPlayingThis) {
            await pause();
        } else {
            const existing = $radioStations.find(
                (s) =>
                    (s.url && s.url.toLowerCase() === url.toLowerCase()) ||
                    (s.name && s.name.toLowerCase() === (station.name || '').toLowerCase()),
            );
            const stationToPlay = existing || {
                id: station.stationuuid || `radio_${Date.now()}`,
                name: station.name || 'Radio',
                url,
            };
            await playRadioStation(stationToPlay);
        }
    }

    async function searchRadioBrowser(query) {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            onlineStations = [];
            isSearching = false;
            return;
        }

        isSearching = true;
        searchError = '';

        const servers = [
            'https://de1.api.radio-browser.info',
            'https://nl1.api.radio-browser.info',
            'https://at1.api.radio-browser.info',
        ];

        /*
         * THE DIRECTORY MATCHES ON THE LETTERS IT WAS GIVEN, accents included, so asking
         * for what the reader typed is not enough on its own. Somebody looking for
         * `Música` types `musica`, and somebody looking for `Musica` types `música`; the
         * search has to work in both directions, and only the server knows which spelling
         * the station was registered under.
         *
         * So both spellings are asked for — in parallel, since they go to the same mirror
         * — and the answers are merged. When the query has no accents either way there is
         * only one variant and this costs nothing.
         */
        const variants = [...new Set([trimmed, deaccent(trimmed)])];

        /**
         * Merges answers from several requests, keeping each station once and in the
         * order the directory returned it — which is its own popularity ranking, and
         * worth not shuffling. A plain object as the index rather than a `Map`: this is
         * a throwaway lookup inside one call, not component state.
         */
        const mergeStations = (lists) => {
            const seen = Object.create(null);
            const merged = [];
            for (const list of lists) {
                if (!Array.isArray(list)) continue;
                for (const station of list) {
                    const key = station.stationuuid || `${station.name}|${station.url_resolved || station.url}`;
                    if (!key || seen[key]) continue;
                    seen[key] = true;
                    merged.push(station);
                }
            }
            return merged;
        };

        const askServer = async (buildUrl) => {
            const answers = await Promise.all(
                variants.map(async (variant) => {
                    try {
                        const response = await fetch(buildUrl(variant), { signal: AbortSignal.timeout(5000) });
                        return response.ok ? await response.json() : null;
                    } catch {
                        return null;
                    }
                }),
            );
            const merged = mergeStations(answers);
            return merged.length > 0 ? merged : null;
        };

        let results = null;
        for (const server of servers) {
            // Primary search: query by name with active stream filter and clickcount sorting
            results = await askServer(
                (variant) =>
                    `${server}/json/stations/search?name=${encodeURIComponent(variant)}&hidebroken=true&order=clickcount&reverse=true&limit=60`,
            );
            if (results) break;
        }

        // Fallback to /byname if search returned no results
        if (!results || results.length === 0) {
            for (const server of servers) {
                results = await askServer(
                    (variant) => `${server}/json/stations/byname/${encodeURIComponent(variant)}?limit=60`,
                );
                if (results) break;
            }
        }

        isSearching = false;
        const ranked = filterAndRankOnlineStations(results, trimmed);
        if (ranked.length > 0) {
            onlineStations = ranked;
        } else {
            onlineStations = [];
            searchError = $t('radioNoOnlineResults', [trimmed]);
        }
    }

    function handleSearchInput(e) {
        const query = e.currentTarget.value;
        searchQuery = query;
        clearTimeout(searchTimeout);

        if (query.trim().length >= 2) {
            searchTimeout = setTimeout(() => {
                searchRadioBrowser(query);
            }, 320);
        } else {
            onlineStations = [];
            isSearching = false;
        }
    }

    function handleSearchKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(searchTimeout);
            searchRadioBrowser(searchQuery);
        }
    }

    function isStationAdded(station) {
        const url = (station.url_resolved || station.url || '').toLowerCase();
        const name = (station.name || '').toLowerCase();
        return $radioStations.some(
            (s) => (s.url && s.url.toLowerCase() === url) || (s.name && s.name.toLowerCase() === name),
        );
    }

    function toggleSelectStation(uuid) {
        if (selectedStationUuids.has(uuid)) {
            selectedStationUuids.delete(uuid);
        } else {
            selectedStationUuids.add(uuid);
        }
    }

    function toggleSelectAll() {
        const available = sortedOnlineStations.filter((s) => !isStationAdded(s));
        if (selectedStationUuids.size === available.length && available.length > 0) {
            selectedStationUuids.clear();
        } else {
            selectedStationUuids.clear();
            for (const s of available) {
                selectedStationUuids.add(s.stationuuid);
            }
        }
    }

    async function handleAddSelected() {
        const toAdd = sortedOnlineStations.filter((s) => selectedStationUuids.has(s.stationuuid) && !isStationAdded(s));
        for (const st of toAdd) {
            const url = st.url_resolved || st.url;
            if (url) {
                await addRadioStation(st.name, url);
            }
        }
        selectedStationUuids.clear();
    }

    async function handleAddPreset(preset) {
        const exists = $radioStations.some(
            (s) =>
                s.url.toLowerCase() === preset.url.toLowerCase() || s.name.toLowerCase() === preset.name.toLowerCase(),
        );
        if (!exists) {
            await addRadioStation(preset.name, preset.url);
        }
    }

    async function handleTogglePlay(station, event) {
        if (event) event.stopPropagation();
        const isThisStation = $isRadioActive && $currentRadioStation?.id === station.id;
        if (isThisStation && $isPlaying) {
            await pause();
        } else {
            await playRadioStation(station);
        }
    }

    async function handleDelete(stationId) {
        await removeRadioStation(stationId);
    }

    function handleClose() {
        onClose?.();
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="radio-modal-title"
        tabindex="-1"
        use:dismissOnBackdrop={handleClose}
        onkeydown={(e) => e.key === 'Escape' && handleClose()}
    >
        <div
            class="modal-content radio-stations-modal"
            role="none"
            onmousedown={(e) => e.stopPropagation()}
            onmouseup={(e) => e.stopPropagation()}
            onclick={(e) => e.stopPropagation()}
        >
            <div class="modal-header">
                <h2 id="radio-modal-title">{$t('radioStationsModalTitle')}</h2>
                <button type="button" class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button
                >
            </div>

            <div class="modal-body radio-modal-body">
                <!-- Search Online Stations Input with ample spacing -->
                <div class="form-group radio-search-group">
                    <label for="radio-search-input" class="field-label radio-search-label">
                        {$t('searchRadioStations')}
                    </label>
                    <div class="radio-search-input-wrapper">
                        <svg class="radio-search-icon" width="16" height="16" aria-hidden="true" focusable="false">
                            <use href="#icon-search"></use>
                        </svg>
                        <input
                            bind:this={searchInput}
                            type="search"
                            id="radio-search-input"
                            placeholder={$t('searchRadioPlaceholder')}
                            value={searchQuery}
                            oninput={handleSearchInput}
                            onkeydown={handleSearchKeydown}
                            autocomplete="off"
                            spellcheck="false"
                        />
                        {#if isSearching}
                            <span class="radio-search-spinner" aria-hidden="true"></span>
                        {/if}
                    </div>
                </div>

                <!-- Presets (Los 40 & BBC only) -->
                <div class="form-group radio-presets-group">
                    <div class="field-label">{$t('radioPresetsTitle')}</div>
                    <div class="radio-presets-list">
                        {#each DEFAULT_RADIO_STATIONS as preset (preset.id)}
                            {@const isAdded = $radioStations.some(
                                (s) =>
                                    s.url.toLowerCase() === preset.url.toLowerCase() ||
                                    s.name.toLowerCase() === preset.name.toLowerCase(),
                            )}
                            <button
                                type="button"
                                class="radio-preset-chip"
                                class:is-added={isAdded}
                                title={isAdded ? preset.name : $t('radioStationAddBtn') + ': ' + preset.name}
                                disabled={isAdded}
                                onclick={() => handleAddPreset(preset)}
                            >
                                <svg width="12" height="12" aria-hidden="true" focusable="false">
                                    <use href={isAdded ? '#icon-check' : '#icon-add-circle'}></use>
                                </svg>
                                <span>{preset.name}</span>
                            </button>
                        {/each}
                    </div>
                </div>

                <!-- Modal Sub-Tabs: Online Search Results vs Saved Stations -->
                <div class="radio-modal-tabs">
                    <button
                        type="button"
                        class="radio-modal-tab-btn"
                        class:active={activeModalTab === 'online'}
                        onclick={() => (activeModalTab = 'online')}
                    >
                        <svg width="14" height="14" aria-hidden="true" focusable="false">
                            <use href="#icon-search"></use>
                        </svg>
                        <span>{$t('radioSearchOnlineTab')}</span>
                        {#if onlineStations.length > 0}
                            <span class="radio-modal-tab-badge">{onlineStations.length}</span>
                        {/if}
                    </button>
                    <button
                        type="button"
                        class="radio-modal-tab-btn"
                        class:active={activeModalTab === 'saved'}
                        onclick={() => (activeModalTab = 'saved')}
                    >
                        <svg width="14" height="14" aria-hidden="true" focusable="false">
                            <use href="#icon-radio"></use>
                        </svg>
                        <span>{$t('radioSavedTab')}</span>
                        <span class="radio-modal-tab-badge">{$radioStations.length}</span>
                    </button>
                </div>

                <!-- TAB 1: ONLINE SEARCH RESULTS -->
                {#if activeModalTab === 'online'}
                    <div class="radio-online-container">
                        {#if isSearching}
                            <div class="radio-loading-state">
                                <span class="radio-search-spinner large" aria-hidden="true"></span>
                                <p>{$t('radioSearching')}</p>
                            </div>
                        {:else if onlineStations.length > 0}
                            <!-- Multi-selection Toolbar -->
                            <div class="radio-selection-bar">
                                <button
                                    type="button"
                                    class="radio-select-all-btn"
                                    onclick={toggleSelectAll}
                                    disabled={unaddedOnlineCount === 0}
                                >
                                    <svg width="13" height="13" aria-hidden="true" focusable="false">
                                        <use
                                            href={selectedStationUuids.size > 0 &&
                                            selectedStationUuids.size === unaddedOnlineCount
                                                ? '#icon-check'
                                                : '#icon-add-circle'}
                                        ></use>
                                    </svg>
                                    <span>
                                        {selectedStationUuids.size > 0 &&
                                        selectedStationUuids.size === unaddedOnlineCount
                                            ? $t('radioDeselectAll')
                                            : $t('radioSelectAll')}
                                    </span>
                                </button>
                            </div>

                            <!-- Online Station Results List (Selectable Button Rows) -->
                            <div class="radio-online-list" role="list">
                                {#each sortedOnlineStations as station (station.stationuuid)}
                                    {@const streamUrl = station.url_resolved || station.url}
                                    {@const added = isStationAdded(station)}
                                    {@const isSelected = selectedStationUuids.has(station.stationuuid)}
                                    {@const isStationPlaying =
                                        $isRadioActive &&
                                        $isPlaying &&
                                        ($currentRadioStation?.url === streamUrl ||
                                            $currentRadioStation?.id === station.stationuuid ||
                                            $currentRadioStation?.name === station.name)}
                                    <div
                                        class="radio-online-item"
                                        class:is-selected={isSelected}
                                        class:is-added={added}
                                        class:active={isStationPlaying}
                                        role="button"
                                        tabindex={added ? -1 : 0}
                                        aria-pressed={isSelected}
                                        onclick={() => !added && toggleSelectStation(station.stationuuid)}
                                        onkeydown={(e) => {
                                            if (!added && (e.key === 'Enter' || e.key === ' ')) {
                                                e.preventDefault();
                                                toggleSelectStation(station.stationuuid);
                                            }
                                        }}
                                    >
                                        <!-- Play/Pause Stream Audio Button -->
                                        <button
                                            type="button"
                                            class="radio-preview-btn"
                                            class:is-previewing={isStationPlaying}
                                            title={isStationPlaying
                                                ? $t('musicPlayerPause') + ': ' + station.name
                                                : $t('radioStationPlay') + ': ' + station.name}
                                            aria-label={isStationPlaying
                                                ? $t('musicPlayerPause') + ': ' + station.name
                                                : $t('radioStationPlay') + ': ' + station.name}
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                togglePlayOnlineStation(station, e);
                                            }}
                                        >
                                            <svg width="14" height="14" aria-hidden="true" focusable="false">
                                                <use href={isStationPlaying ? '#icon-pause-solid' : '#icon-play-solid'}
                                                ></use>
                                            </svg>
                                        </button>

                                        <!-- Station Info with strict overflow containment -->
                                        <div class="radio-online-info">
                                            <div class="radio-online-name-row">
                                                <span class="radio-online-name" title={station.name}
                                                    >{station.name}</span
                                                >
                                                {#if isStationPlaying}
                                                    <span class="saved-radio-live-text"
                                                        >{$t('musicPlayerRadioLive')}</span
                                                    >
                                                {/if}
                                            </div>
                                            <div class="radio-online-badges">
                                                {#if station.country}
                                                    <span class="radio-badge country-badge">{station.country}</span>
                                                {/if}
                                                {#if station.bitrate && station.bitrate > 0}
                                                    <span class="radio-badge bitrate-badge"
                                                        >{$t('radioBitrate', [station.bitrate])}</span
                                                    >
                                                {/if}
                                                {#if station.tags}
                                                    <span class="radio-badge tags-badge" title={station.tags}>
                                                        {station.tags.split(',').slice(0, 2).join(', ')}
                                                    </span>
                                                {/if}
                                            </div>
                                        </div>

                                        <!-- Selection Indicator on the right (Checkmark if selected, Added badge if added) -->
                                        {#if added}
                                            <span class="radio-added-text">{$t('radioAddedBadge')}</span>
                                        {:else if isSelected}
                                            <span class="radio-selected-icon" aria-hidden="true">
                                                <svg width="16" height="16" focusable="false">
                                                    <use href="#icon-check"></use>
                                                </svg>
                                            </span>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="radio-empty-state">
                                <p class="radio-empty-text">
                                    {searchError ||
                                        (searchQuery.trim()
                                            ? $t('radioNoOnlineResults', [searchQuery.trim()])
                                            : $t('searchRadioPlaceholder'))}
                                </p>
                            </div>
                        {/if}
                    </div>

                    <!-- TAB 2: SAVED RADIO STATIONS -->
                {:else}
                    <div class="form-group saved-radio-section">
                        <div class="saved-radio-header">
                            <div class="field-label">{$t('radioStationSavedList')}</div>
                            <span class="saved-radio-counter"
                                >{filteredSavedStations.length} / {$radioStations.length}</span
                            >
                        </div>

                        <div class="saved-radio-list" role="list">
                            {#if filteredSavedStations.length === 0}
                                <div class="radio-empty-state">
                                    <p class="radio-empty-text">
                                        {searchQuery.trim() ? $t('noRadioStationsFound') : $t('radioStationEmptyList')}
                                    </p>
                                </div>
                            {:else}
                                {#each filteredSavedStations as station (station.id)}
                                    {@const isCurrentPlaying =
                                        $isRadioActive && $currentRadioStation?.id === station.id && $isPlaying}
                                    {@const isCurrentSelected =
                                        $isRadioActive && $currentRadioStation?.id === station.id}
                                    <div
                                        class="saved-radio-item"
                                        class:active={isCurrentSelected}
                                        role="listitem"
                                        onclick={() => handleTogglePlay(station)}
                                    >
                                        <button
                                            type="button"
                                            class="saved-radio-play-btn"
                                            class:is-playing={isCurrentPlaying}
                                            title={isCurrentPlaying
                                                ? $t('musicPlayerPause') + ': ' + station.name
                                                : $t('radioStationPlay') + ': ' + station.name}
                                            aria-label={isCurrentPlaying
                                                ? $t('musicPlayerPause') + ': ' + station.name
                                                : $t('radioStationPlay') + ': ' + station.name}
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                handleTogglePlay(station);
                                            }}
                                        >
                                            <svg width="14" height="14" aria-hidden="true" focusable="false">
                                                <use href={isCurrentPlaying ? '#icon-pause-solid' : '#icon-play-solid'}
                                                ></use>
                                            </svg>
                                        </button>

                                        <div class="saved-radio-info">
                                            <div class="saved-radio-name-row">
                                                <span class="saved-radio-name" title={station.name}>{station.name}</span
                                                >
                                                {#if isCurrentPlaying}
                                                    <span class="saved-radio-live-text"
                                                        >{$t('musicPlayerRadioLive')}</span
                                                    >
                                                {/if}
                                            </div>
                                            <span class="saved-radio-url" title={station.url}>{station.url}</span>
                                        </div>

                                        <button
                                            type="button"
                                            class="action-btn delete-group-btn saved-radio-delete-btn"
                                            title={$tt('radioStationDelete')}
                                            aria-label={$t('radioStationDelete')}
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(station.id);
                                            }}
                                        >
                                            <svg width="14" height="14" aria-hidden="true" focusable="false">
                                                <use href="#icon-trash"></use>
                                            </svg>
                                        </button>
                                    </div>
                                {/each}
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Footer: only show action button if online items are selected -->
            {#if activeModalTab === 'online' && selectedStationUuids.size > 0}
                <div class="modal-actions">
                    <button type="button" class="modal-btn-save" onclick={handleAddSelected}>
                        {$t('radioAddSelected', [selectedStationUuids.size])}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}
