/**
 * State and commands for the music player.
 *
 * The sound itself is made by the offscreen document, not by this page: that is what
 * lets the music carry on when the panel is hidden, when the view changes and when
 * the page is closed. This module is the remote control — it hands the picked folder
 * over, sends commands, and mirrors the state that comes back so the panel, the
 * toolbar button and its hover popup all show the same thing.
 */
import { writable, derived, get } from 'svelte/store';
import {
    buildPlaylist,
    filterTracks,
    resolveCanonicalFolder,
    isSameOrSubfolderMatch,
    normalizeFolderPath,
} from '../services/musicPlayer/playlist.js';
import {
    saveMusicTracksToDb,
    appendMusicTracksToDb,
    clearMusicTracksInDb,
    removeMusicTrackFromDb,
    removeMusicTracksByIndicesFromDb,
    getRadioStationsFromDb,
    saveRadioStationsToDb,
    deleteRadioStationFromDb,
} from '../../utils/db.js';

/** How far the rewind and fast-forward buttons jump, in seconds. */
export const SEEK_STEP_SECONDS = 10;

const PLAYLIST_KEY = 'musicPlaylist';
const RADIO_STATIONS_KEY = 'musicPlayerRadioStations';
const RADIO_SYNC_KEY = 'musicPlayerRadioStationsSync';
const RADIO_SYNC_ENABLED_KEY = 'musicPlayerRadioSyncEnabled';
const STATE_KEY = 'musicPlayerState';
/** What the browser will hold for one folder before the rest is left out. */
const MAX_TRACKS = 500;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

export const DEFAULT_RADIO_STATIONS = [
    {
        id: 'radio_los40',
        name: 'Los 40',
        url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_SC.mp3',
    },
    {
        id: 'radio_bbc',
        name: 'BBC World Service',
        url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service',
    },
];

/** Is the player panel on screen? */
export const isPlayerVisible = writable(false);
/** The whole picked folder, in playing order. */
export const tracks = writable([]);
/** The saved radio stations. */
export const radioStations = writable([]);
/** Whether radio sync across browsers is enabled. */
export const isRadioSyncEnabled = writable(false);
/** Whether radio mode is currently playing/active. */
export const isRadioActive = writable(false);
/** Currently selected/playing radio station. */
export const currentRadioStation = writable(null);
/** Active tab in playlist view: 'music' | 'radio' | 'all' */
export const activeTab = writable('music');
/** The folder those tracks came from, for the empty state and the tooltips. */
export const playlistFolder = writable('');
/** Position in `tracks`, or -1 when nothing is loaded. */
export const currentIndex = writable(-1);
export const isPlaying = writable(false);
export const currentTime = writable(0);
export const duration = writable(0);
export const volume = writable(1);
export const isMuted = writable(false);
/** Is the track name at the top acting as a search box? */
export const isSearchOpen = writable(false);
export const searchQuery = writable('');

export const currentTrack = derived(
    [tracks, currentIndex, isRadioActive, currentRadioStation],
    ([$tracks, $index, $isRadio, $currentRadio]) => {
        if ($isRadio && $currentRadio) {
            return {
                id: $currentRadio.id,
                title: $currentRadio.name,
                name: $currentRadio.name,
                url: $currentRadio.url,
                isRadio: true,
            };
        }
        return $tracks[$index] ?? null;
    },
);

/** Filter radio stations by search query */
export function filterRadioStations(stations, query) {
    const words = String(query || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return stations;
    return stations.filter((station) => {
        const haystack = `${station.name} ${station.url}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
    });
}

/** The tracks the search box is showing; the whole folder when nothing is typed. */
export const searchResults = derived([tracks, searchQuery], ([$tracks, $query]) => filterTracks($tracks, $query));

/** The radio stations the search box is showing. */
export const radioSearchResults = derived([radioStations, searchQuery], ([$radios, $query]) =>
    filterRadioStations($radios, $query),
);

export const hasTracks = derived(
    [tracks, radioStations],
    ([$tracks, $radios]) => $tracks.length > 0 || $radios.length > 0,
);

/** 0–1, for the progress bar's width. */
export const progressRatio = derived([currentTime, duration], ([$time, $duration]) =>
    $duration > 0 ? Math.min(1, $time / $duration) : 0,
);

// ─── Talking to the offscreen player ──────────────────────────────────

let offscreenPending = null;

/**
 * Makes sure the offscreen player is there and listening.
 *
 * It is checked before every command rather than once: Chrome closes an offscreen
 * document opened for audio after a spell of silence, so a paused player is torn
 * down and has to be built again. Only the service worker may create it, and a fresh
 * one knows nothing — hence the `created` answer, which tells the caller to hand the
 * folder over again.
 */
function ensureOffscreen() {
    offscreenPending ??= (async () => {
        try {
            const answer = await chrome.runtime.sendMessage({ action: 'musicEnsureOffscreen' });
            if (!answer?.success) return false;
            // Creating the document does not mean its script has run yet, and a command
            // sent before it listens is simply lost — so it is asked until it answers.
            for (let attempt = 0; attempt < 30; attempt++) {
                try {
                    if (await chrome.runtime.sendMessage({ action: 'musicRequestState' })) break;
                } catch {
                    // Not listening yet.
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return Boolean(answer.created);
        } finally {
            offscreenPending = null;
        }
    })();
    return offscreenPending;
}

function post(cmd, extra = {}) {
    return chrome.runtime.sendMessage({ action: 'musicCommand', cmd, ...extra }).catch(() => {
        // Nobody listening means nothing is playing; the state stays as it was.
    });
}

/**
 * Sends a command, handing the folder over first when the player had to be built
 * again.
 *
 * A rebuilt offscreen document starts empty — it cannot read storage — so it is
 * given the names, the track it was on and how far in, and only then the command.
 */
async function sendCommand(cmd, extra = {}) {
    const created = await ensureOffscreen();
    if (created && cmd !== 'loadPlaylist' && cmd !== 'playRadio') {
        if (get(isRadioActive) && get(currentRadioStation)) {
            await post('playRadio', {
                station: get(currentRadioStation),
                radioStations: get(radioStations),
                autoplay: false,
                activeTab: get(activeTab),
            });
        } else {
            await post('loadPlaylist', {
                tracks: get(tracks),
                index: Math.max(get(currentIndex), 0),
                startAt: get(currentTime),
                autoplay: false,
                activeTab: get(activeTab),
            });
        }
    }
    await post(cmd, { ...extra, activeTab: get(activeTab) });
}

/**
 * The offscreen player reports about four times a second. Between reports the
 * position is carried forward here, so the progress bar moves smoothly instead of
 * stepping.
 */
let lastReportAt = 0;
let interpolationFrame = null;

function stopInterpolating() {
    if (interpolationFrame !== null) {
        cancelAnimationFrame(interpolationFrame);
        interpolationFrame = null;
    }
}

function startInterpolating() {
    if (interpolationFrame !== null) return;
    const tick = () => {
        if (!get(isPlaying)) {
            interpolationFrame = null;
            return;
        }
        const elapsed = (performance.now() - lastReportAt) / 1000;
        const predicted = interpolationBase + elapsed;
        const total = get(duration);
        currentTime.set(total > 0 ? Math.min(predicted, total) : predicted);
        interpolationFrame = requestAnimationFrame(tick);
    };
    interpolationFrame = requestAnimationFrame(tick);
}

const VOLUME_KEY = 'musicPlayerVolume';
let interpolationBase = 0;

/** Takes in a state report from the offscreen player. */
function applyState(state) {
    if (!state) return;
    if (state.isRadio) {
        isRadioActive.set(true);
        currentRadioStation.set(state.currentRadio ?? null);
        currentIndex.set(-1);
    } else {
        isRadioActive.set(false);
        currentRadioStation.set(null);
        currentIndex.set(state.index ?? -1);
    }
    isPlaying.set(Boolean(state.isPlaying));
    duration.set(state.duration || 0);
    currentTime.set(state.currentTime || 0);
    if (typeof state.volume === 'number') volume.set(state.volume);
    if (typeof state.isMuted === 'boolean') isMuted.set(state.isMuted);
    interpolationBase = state.currentTime || 0;
    lastReportAt = performance.now();
    if (state.isPlaying) startInterpolating();
    else stopInterpolating();
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
        if (message?.action === 'musicState') applyState(message.state);
    });
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync') {
            if (changes[RADIO_SYNC_ENABLED_KEY]) {
                isRadioSyncEnabled.set(!!changes[RADIO_SYNC_ENABLED_KEY].newValue);
            }
            if (changes[RADIO_SYNC_KEY] && changes[RADIO_SYNC_KEY].newValue) {
                const newSynced = changes[RADIO_SYNC_KEY].newValue;
                if (Array.isArray(newSynced) && get(isRadioSyncEnabled)) {
                    radioStations.set(newSynced);
                    saveRadioStationsToDb(newSynced);
                }
            }
        }
    });
}

/**
 * Loads saved radio stations from IndexedDB (with sync & local storage migration).
 */
export async function loadRadioStations() {
    try {
        // 1. Check sync state
        let isSyncOn = false;
        try {
            const syncData = await chrome.storage.sync.get([RADIO_SYNC_ENABLED_KEY, RADIO_SYNC_KEY]);
            isSyncOn = !!syncData[RADIO_SYNC_ENABLED_KEY];
            isRadioSyncEnabled.set(isSyncOn);

            if (isSyncOn && Array.isArray(syncData[RADIO_SYNC_KEY]) && syncData[RADIO_SYNC_KEY].length > 0) {
                const syncList = syncData[RADIO_SYNC_KEY];
                radioStations.set(syncList);
                await saveRadioStationsToDb(syncList);
                return;
            }
        } catch {
            // Ignore sync errors
        }

        // 2. Read from IndexedDB
        const dbStations = await getRadioStationsFromDb();
        if (Array.isArray(dbStations) && dbStations.length > 0) {
            const hasOldDefaults = dbStations.some(
                (s) => s.id === 'radio_1' || s.id === 'radio_2' || s.id === 'radio_4',
            );
            if (hasOldDefaults) {
                const cleaned = dbStations.filter((s) => !['radio_1', 'radio_2', 'radio_4'].includes(s.id));
                const finalStations = cleaned.length > 0 ? cleaned : DEFAULT_RADIO_STATIONS;
                radioStations.set(finalStations);
                await saveRadioStationsToDb(finalStations);
                if (isSyncOn) {
                    await chrome.storage.sync.set({ [RADIO_SYNC_KEY]: finalStations }).catch(() => {});
                }
            } else {
                radioStations.set(dbStations);
            }
            return;
        }

        // 3. Fallback: migrate from legacy chrome.storage.local
        const { [RADIO_STATIONS_KEY]: stored } = await chrome.storage.local.get(RADIO_STATIONS_KEY);
        if (Array.isArray(stored) && stored.length > 0) {
            const cleaned = stored.filter((s) => !['radio_1', 'radio_2', 'radio_4'].includes(s.id));
            const finalStations = cleaned.length > 0 ? cleaned : DEFAULT_RADIO_STATIONS;
            radioStations.set(finalStations);
            await saveRadioStationsToDb(finalStations);
            await chrome.storage.local.remove(RADIO_STATIONS_KEY);
            if (isSyncOn) {
                await chrome.storage.sync.set({ [RADIO_SYNC_KEY]: finalStations }).catch(() => {});
            }
        } else {
            radioStations.set(DEFAULT_RADIO_STATIONS);
            await saveRadioStationsToDb(DEFAULT_RADIO_STATIONS);
            if (isSyncOn) {
                await chrome.storage.sync.set({ [RADIO_SYNC_KEY]: DEFAULT_RADIO_STATIONS }).catch(() => {});
            }
        }
    } catch {
        radioStations.set(DEFAULT_RADIO_STATIONS);
    }
}

/**
 * Toggles synchronization across browsers via chrome.storage.sync.
 * @param {boolean} [forced]
 * @returns {Promise<boolean>}
 */
export async function toggleRadioSync(forced) {
    const current = get(isRadioSyncEnabled);
    const next = typeof forced === 'boolean' ? forced : !current;
    isRadioSyncEnabled.set(next);

    try {
        if (next) {
            const currentStations = get(radioStations);
            await chrome.storage.sync.set({
                [RADIO_SYNC_ENABLED_KEY]: true,
                [RADIO_SYNC_KEY]: currentStations,
            });
        } else {
            await chrome.storage.sync.set({
                [RADIO_SYNC_ENABLED_KEY]: false,
            });
        }
    } catch (err) {
        console.error('Failed to toggle radio sync:', err);
    }
    return next;
}

/**
 * Adds a new radio station and persists it in IndexedDB (and sync if enabled).
 * @param {string} name
 * @param {string} url
 */
export async function addRadioStation(name, url) {
    const trimmedName = String(name || '').trim();
    const trimmedUrl = String(url || '').trim();
    if (!trimmedName || !trimmedUrl) return null;

    const newStation = {
        id: `radio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: trimmedName,
        url: trimmedUrl,
        dateAdded: Date.now(),
    };

    const current = get(radioStations);
    const updated = [...current, newStation];
    radioStations.set(updated);
    await saveRadioStationsToDb(updated);
    if (get(isRadioSyncEnabled)) {
        await chrome.storage.sync.set({ [RADIO_SYNC_KEY]: updated }).catch(() => {});
    }
    await sendCommand('setRadioStations', { radioStations: updated });
    return newStation;
}

/**
 * Removes a radio station by ID and persists changes in IndexedDB (and sync if enabled).
 * @param {string} id
 */
export async function removeRadioStation(id) {
    const current = get(radioStations);
    const updated = current.filter((s) => s.id !== id);
    radioStations.set(updated);
    await deleteRadioStationFromDb(id);
    if (get(isRadioSyncEnabled)) {
        await chrome.storage.sync.set({ [RADIO_SYNC_KEY]: updated }).catch(() => {});
    }
    await sendCommand('setRadioStations', { radioStations: updated });

    if (get(isRadioActive) && get(currentRadioStation)?.id === id) {
        if (updated.length > 0) {
            await playRadioStation(updated[0]);
        } else {
            await stop();
            isRadioActive.set(false);
            currentRadioStation.set(null);
        }
    }
}

/**
 * Updates an existing radio station.
 * @param {string} id
 * @param {{name: string, url: string}} param1
 */
export async function updateRadioStation(id, { name, url }) {
    const current = get(radioStations);
    const updated = current.map((s) => (s.id === id ? { ...s, name: name.trim(), url: url.trim() } : s));
    radioStations.set(updated);
    await saveRadioStationsToDb(updated);
    if (get(isRadioSyncEnabled)) {
        await chrome.storage.sync.set({ [RADIO_SYNC_KEY]: updated }).catch(() => {});
    }
    await sendCommand('setRadioStations', { radioStations: updated });

    if (get(isRadioActive) && get(currentRadioStation)?.id === id) {
        currentRadioStation.set({ ...get(currentRadioStation), name: name.trim(), url: url.trim() });
    }
}

/**
 * Exports current radio stations to a downloadable JSON file.
 * @returns {boolean}
 */
export function exportRadioStations() {
    const stations = get(radioStations);
    if (!stations || stations.length === 0) return false;

    const exportData = {
        app: 'Intelligent_Workspace',
        version: 1,
        type: 'radioStations',
        exportedAt: new Date().toISOString(),
        stations: stations.map((s) => ({
            name: s.name,
            url: s.url,
        })),
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `radio_stations_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 250);
    return true;
}

/**
 * Imports radio stations from parsed JSON data, filtering out malformed and duplicate entries.
 * @param {any} parsedData
 * @returns {Promise<{success: boolean, addedCount: number, skippedCount: number, error?: string}>}
 */
export async function importRadioStations(parsedData) {
    let list = [];
    if (Array.isArray(parsedData)) {
        list = parsedData;
    } else if (parsedData && Array.isArray(parsedData.stations)) {
        list = parsedData.stations;
    } else if (parsedData && Array.isArray(parsedData.radioStations)) {
        list = parsedData.radioStations;
    } else {
        return { success: false, addedCount: 0, skippedCount: 0, error: 'invalid_format' };
    }

    const current = get(radioStations);
    const existingUrls = new Set(current.map((s) => (s.url || '').toLowerCase().trim()));
    const existingNames = new Set(current.map((s) => (s.name || '').toLowerCase().trim()));

    const newToAdd = [];
    let skippedCount = 0;

    for (const item of list) {
        if (!item || typeof item !== 'object') {
            skippedCount++;
            continue;
        }
        const name = String(item.name || item.stationName || '').trim();
        const url = String(item.url || item.streamUrl || item.url_resolved || '').trim();

        if (!name || !url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
            skippedCount++;
            continue;
        }

        const normUrl = url.toLowerCase();
        const normName = name.toLowerCase();

        if (existingUrls.has(normUrl) || existingNames.has(normName)) {
            skippedCount++;
            continue;
        }

        existingUrls.add(normUrl);
        existingNames.add(normName);

        newToAdd.push({
            id: `radio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name,
            url,
            dateAdded: Date.now(),
        });
    }

    if (newToAdd.length > 0) {
        const updated = [...current, ...newToAdd];
        radioStations.set(updated);
        await saveRadioStationsToDb(updated);
        if (get(isRadioSyncEnabled)) {
            await chrome.storage.sync.set({ [RADIO_SYNC_KEY]: updated }).catch(() => {});
        }
        await sendCommand('setRadioStations', { radioStations: updated });
    }

    return {
        success: true,
        addedCount: newToAdd.length,
        skippedCount,
    };
}

/**
 * Plays a radio station.
 * @param {{id: string, name: string, url: string}} station
 */
export async function playRadioStation(station) {
    if (!station) return;
    isRadioActive.set(true);
    currentRadioStation.set(station);
    currentIndex.set(-1);
    currentTime.set(0);
    duration.set(0);
    await sendCommand('playRadio', { station, radioStations: get(radioStations), autoplay: true });
}

/**
 * Picks up whatever was already going.
 *
 * A page opened while music plays — or reopened after being closed — reads the folder
 * from storage and the position from the copy the service worker files away, so it
 * shows the truth straight away without waking the player just to ask.
 */
export async function initMusicPlayer() {
    try {
        await loadRadioStations();
        const { [PLAYLIST_KEY]: playlist, [VOLUME_KEY]: storedVolume } = await chrome.storage.local.get([
            PLAYLIST_KEY,
            VOLUME_KEY,
        ]);
        if (playlist?.tracks?.length) {
            tracks.set(playlist.tracks);
            playlistFolder.set(playlist.folder || '');
        }
        if (storedVolume !== undefined) {
            volume.set(storedVolume.volume ?? 1);
            isMuted.set(Boolean(storedVolume.isMuted));
        }
        const { [STATE_KEY]: state } = await chrome.storage.session.get(STATE_KEY);
        if (state) applyState(state);
    } catch {
        // A player with nothing to show is the right answer when storage says nothing.
    }
}

// ─── Commands ─────────────────────────────────────────────────────────

/**
 * Adds audio files of a picked folder or files to the playlist (or initializes it).
 * Deduplicates files so existing paths or songs are never added twice.
 *
 * @param {FileList|File[]|Array<{file: File, path: string}>} entries
 * @param {{folder?: string, autoplay?: boolean}} options
 * @returns {Promise<{loaded: number, folder: string, trimmed: boolean, duplicates: number, totalPicked: number}>}
 */
export async function loadFolder(entries, { folder: folderName = '', autoplay = false } = {}) {
    const existingTracks = get(tracks);
    const defaultFolder = folderName || (entries?.[0]?.folder ?? '');
    const newPlaylist = buildPlaylist(entries, defaultFolder);
    const folder = folderName || newPlaylist[0]?.folder || get(playlistFolder) || '';
    if (newPlaylist.length === 0) {
        return { loaded: 0, folder, trimmed: false, duplicates: 0, totalPicked: 0 };
    }

    const totalPicked = newPlaylist.length;

    // Collect all existing distinct folder paths
    const existingFolders = new Set(existingTracks.map((t) => t.folder).filter(Boolean));

    // Align new tracks with existing folder hierarchy if subfolder already exists (e.g. musica2 -> musica/musica2)
    const normalizedNewPlaylist = newPlaylist.map((track) => {
        const canonicalFolder = resolveCanonicalFolder(track.folder, existingFolders);
        const resolvedPath = canonicalFolder ? `${canonicalFolder}/${track.fileName}` : track.fileName;
        return {
            ...track,
            folder: canonicalFolder,
            path: resolvedPath,
        };
    });

    // Helper to test if a new track matches an existing track
    function isTrackDuplicate(newTr) {
        const newFileName = String(newTr.fileName || '').toLowerCase();
        const newSize = newTr.size || 0;
        const newFolder = String(newTr.folder || '').toLowerCase();
        const newPath = String(newTr.path || '').toLowerCase();

        return existingTracks.some((exTr) => {
            const exFileName = String(exTr.fileName || '').toLowerCase();
            const exFolder = String(exTr.folder || '').toLowerCase();
            const exPath = String(exTr.path || '').toLowerCase();
            const exSize = exTr.size || 0;

            // Exact path match
            if (exPath === newPath) return true;

            // Same filename in same folder or matched subfolder
            if (exFileName === newFileName) {
                if (!newFolder && !exFolder) return true;
                if (isSameOrSubfolderMatch(exFolder, newFolder)) return true;
                // If both size and title match identically
                if (newSize > 0 && exSize > 0 && newSize === exSize) return true;
            }
            return false;
        });
    }

    const uniqueNewTracks = [];
    let duplicateCount = 0;
    const addedKeysThisBatch = new Set();

    for (const track of normalizedNewPlaylist) {
        const trackKey = `${track.folder || ''}::${track.fileName}`.toLowerCase();
        if (addedKeysThisBatch.has(trackKey) || isTrackDuplicate(track)) {
            duplicateCount++;
        } else {
            addedKeysThisBatch.add(trackKey);
            uniqueNewTracks.push(track);
        }
    }

    if (uniqueNewTracks.length === 0) {
        return { loaded: 0, folder, trimmed: false, duplicates: duplicateCount, totalPicked };
    }

    const startIndex = existingTracks.length;
    const kept = [];
    let currentBytes = existingTracks.reduce((sum, t) => sum + (t.size || 0), 0);

    for (const track of uniqueNewTracks) {
        if (existingTracks.length + kept.length >= MAX_TRACKS || currentBytes + track.size > MAX_TOTAL_BYTES) break;
        currentBytes += track.size;
        kept.push({ ...track, index: startIndex + kept.length });
    }

    if (kept.length === 0) {
        return { loaded: 0, folder, trimmed: true, duplicates: duplicateCount, totalPicked };
    }

    if (existingTracks.length === 0) {
        await saveMusicTracksToDb(kept.map((track) => ({ index: track.index, blob: track.file })));
    } else {
        await appendMusicTracksToDb(kept.map((track) => ({ index: track.index, blob: track.file })));
    }

    const meta = kept.map(({ index, title, fileName, folder: trFolder, path, size }) => ({
        index,
        title,
        fileName,
        folder: trFolder,
        path,
        size,
    }));
    const combinedTracks = [...existingTracks, ...meta];

    await chrome.storage.local.set({ [PLAYLIST_KEY]: { folder, tracks: combinedTracks } });

    tracks.set(combinedTracks);
    if (!get(playlistFolder)) {
        playlistFolder.set(folder);
    }

    if (existingTracks.length === 0) {
        currentIndex.set(-1);
        currentTime.set(0);
        duration.set(0);
        searchQuery.set('');
        await sendCommand('loadPlaylist', { tracks: combinedTracks, index: 0, autoplay });
    } else {
        await sendCommand('setPlaylist', { tracks: combinedTracks });
    }

    return {
        loaded: kept.length,
        folder,
        trimmed: kept.length < uniqueNewTracks.length,
        duplicates: duplicateCount,
        totalPicked,
    };
}

/** Forgets the folder, in the page and in the browser's storage. */
export async function clearPlaylist() {
    await sendCommand('stop');
    await clearMusicTracksInDb();
    await chrome.storage.local.remove(PLAYLIST_KEY);
    tracks.set([]);
    playlistFolder.set('');
    currentIndex.set(-1);
}

/**
 * Removes all tracks belonging to a folder (or matching subfolders).
 * @param {string} folderNameToRemove
 */
export async function removeFolder(folderNameToRemove) {
    const allTracks = get(tracks);
    const indicesToRemove = new Set();
    const targetFolder = normalizeFolderPath(folderNameToRemove);

    allTracks.forEach((t) => {
        const trFolder = normalizeFolderPath(t.folder);
        if (!targetFolder && !trFolder) {
            indicesToRemove.add(t.index);
        } else if (trFolder === targetFolder || isSameOrSubfolderMatch(trFolder, targetFolder)) {
            indicesToRemove.add(t.index);
        }
    });

    if (indicesToRemove.size === 0) return;
    if (indicesToRemove.size === allTracks.length) {
        await clearPlaylist();
        return;
    }

    const current = get(currentIndex);
    const playing = get(isPlaying);
    const isCurrentTrackRemoved = indicesToRemove.has(current);

    await removeMusicTracksByIndicesFromDb(indicesToRemove);

    const updatedTracks = allTracks
        .filter((t) => !indicesToRemove.has(t.index))
        .map((t, idx) => ({ ...t, index: idx }));

    const rootFolder = get(playlistFolder);
    await chrome.storage.local.set({ [PLAYLIST_KEY]: { folder: rootFolder, tracks: updatedTracks } });
    tracks.set(updatedTracks);

    if (isCurrentTrackRemoved) {
        const nextIdx = Math.min(current, updatedTracks.length - 1);
        if (playing) {
            await sendCommand('loadPlaylist', { tracks: updatedTracks, index: nextIdx, autoplay: true });
        } else {
            await sendCommand('loadPlaylist', { tracks: updatedTracks, index: nextIdx, autoplay: false });
        }
    } else {
        const remainingBeforeCurrent = allTracks.filter(
            (t) => t.index < current && !indicesToRemove.has(t.index),
        ).length;
        currentIndex.set(remainingBeforeCurrent);
        await sendCommand('setPlaylist', { tracks: updatedTracks, index: remainingBeforeCurrent });
    }
}

/**
 * Removes a track from the playlist and database.
 * @param {number} trackIndex
 */
export async function removeTrack(trackIndex) {
    const allTracks = get(tracks);
    if (trackIndex < 0 || trackIndex >= allTracks.length) return;

    if (allTracks.length <= 1) {
        await clearPlaylist();
        return;
    }

    const current = get(currentIndex);
    const playing = get(isPlaying);

    await removeMusicTrackFromDb(trackIndex);

    const updatedTracks = allTracks.filter((_, idx) => idx !== trackIndex).map((t, idx) => ({ ...t, index: idx }));

    const folder = get(playlistFolder);
    await chrome.storage.local.set({ [PLAYLIST_KEY]: { folder, tracks: updatedTracks } });
    tracks.set(updatedTracks);

    if (current === trackIndex) {
        // If the removed track is the one playing/selected, play or cue the next one (or previous if last)
        const nextIdx = Math.min(trackIndex, updatedTracks.length - 1);
        if (playing) {
            await sendCommand('loadPlaylist', { tracks: updatedTracks, index: nextIdx, autoplay: true });
        } else {
            await sendCommand('loadPlaylist', { tracks: updatedTracks, index: nextIdx, autoplay: false });
        }
    } else {
        const nextIdx = current > trackIndex ? current - 1 : current;
        currentIndex.set(nextIdx);
        await sendCommand('setPlaylist', { tracks: updatedTracks, index: nextIdx });
    }
}

/** @param {number} index */
export async function playTrackAt(index) {
    if (index < 0 || index >= get(tracks).length) return;
    isRadioActive.set(false);
    currentRadioStation.set(null);
    await sendCommand('playIndex', { index, tracks: get(tracks) });
}

/** Plays a track the search results or playlist handed back. */
export async function playTrack(track) {
    if (!track) return;
    if (track.isRadio || track.url) {
        await playRadioStation(track);
    } else {
        await playTrackAt(track.index);
    }
}

export async function play() {
    if (get(isRadioActive)) {
        await sendCommand('play');
    } else {
        await sendCommand('play', { tracks: get(tracks) });
    }
}

export async function pause() {
    await sendCommand('pause');
}

export async function togglePlay() {
    if (get(isPlaying)) await pause();
    else await play();
}

export async function stop() {
    await sendCommand('stop');
}

export async function playNext() {
    const tab = get(activeTab);
    const radioList = get(radioStations);
    const musicList = get(tracks);
    const isRadio = get(isRadioActive);

    if (tab === 'all') {
        if (isRadio) {
            const currentStation = get(currentRadioStation);
            const rIdx = radioList.findIndex((s) => s.id === currentStation?.id);
            if (rIdx >= 0 && rIdx < radioList.length - 1) {
                await playRadioStation(radioList[rIdx + 1]);
            } else if (musicList.length > 0) {
                await playTrackAt(0);
            } else if (radioList.length > 0) {
                await playRadioStation(radioList[0]);
            }
        } else {
            const currentIdx = get(currentIndex);
            if (currentIdx >= 0 && currentIdx < musicList.length - 1) {
                await playTrackAt(currentIdx + 1);
            } else if (radioList.length > 0) {
                await playRadioStation(radioList[0]);
            } else if (musicList.length > 0) {
                await playTrackAt(0);
            }
        }
    } else if (tab === 'radio' || isRadio) {
        if (radioList.length > 0) {
            const currentStation = get(currentRadioStation);
            const rIdx = radioList.findIndex((s) => s.id === currentStation?.id);
            const nextIdx = (rIdx + 1) % radioList.length;
            await playRadioStation(radioList[nextIdx]);
        }
    } else {
        if (musicList.length > 0) {
            const currentIdx = get(currentIndex);
            const nextIdx = (currentIdx + 1) % musicList.length;
            await playTrackAt(nextIdx);
        }
    }
}

export async function playPrevious() {
    const tab = get(activeTab);
    const radioList = get(radioStations);
    const musicList = get(tracks);
    const isRadio = get(isRadioActive);

    if (tab === 'all') {
        if (isRadio) {
            const currentStation = get(currentRadioStation);
            const rIdx = radioList.findIndex((s) => s.id === currentStation?.id);
            if (rIdx > 0) {
                await playRadioStation(radioList[rIdx - 1]);
            } else if (musicList.length > 0) {
                await playTrackAt(musicList.length - 1);
            } else if (radioList.length > 0) {
                await playRadioStation(radioList[radioList.length - 1]);
            }
        } else {
            const currentIdx = get(currentIndex);
            if (currentIdx > 0) {
                await playTrackAt(currentIdx - 1);
            } else if (radioList.length > 0) {
                await playRadioStation(radioList[radioList.length - 1]);
            } else if (musicList.length > 0) {
                await playTrackAt(musicList.length - 1);
            }
        }
    } else if (tab === 'radio' || isRadio) {
        if (radioList.length > 0) {
            const currentStation = get(currentRadioStation);
            const rIdx = radioList.findIndex((s) => s.id === currentStation?.id);
            const prevIdx = (rIdx - 1 + radioList.length) % radioList.length;
            await playRadioStation(radioList[prevIdx]);
        }
    } else {
        if (musicList.length > 0) {
            const currentIdx = get(currentIndex);
            const prevIdx = (currentIdx - 1 + musicList.length) % musicList.length;
            await playTrackAt(prevIdx);
        }
    }
}

/** @param {number} ratio 0–1, from a click or drag on the progress bar */
export async function seekRatio(ratio) {
    if (get(isRadioActive)) return;
    // Moved here and now so the bar follows the pointer without waiting for the
    // report to come back.
    const total = get(duration);
    if (total > 0) {
        currentTime.set(total * ratio);
        interpolationBase = total * ratio;
        lastReportAt = performance.now();
    }
    await sendCommand('seekRatio', { ratio });
}

/** @param {number} seconds negative to rewind */
export async function nudge(seconds) {
    if (get(isRadioActive)) return;
    await sendCommand('nudge', { seconds });
}

export function rewind() {
    return nudge(-SEEK_STEP_SECONDS);
}

export function fastForward() {
    return nudge(SEEK_STEP_SECONDS);
}

export function hidePomodoroPanelIfOpen() {
    const pomoPanel = document.getElementById('pomodoro-panel');
    if (pomoPanel && !pomoPanel.classList.contains('hidden')) {
        const pomoCloseBtn = document.getElementById('pomodoro-close-btn');
        if (pomoCloseBtn) {
            pomoCloseBtn.click();
        } else {
            pomoPanel.classList.add('hidden');
            chrome.storage?.local?.set({ pomodoroPanelOpen: false });
        }
    }
}

export function togglePanel() {
    isPlayerVisible.update((visible) => {
        const next = !visible;
        if (next) {
            hidePomodoroPanelIfOpen();
        }
        return next;
    });
}

export function showPanel() {
    isPlayerVisible.set(true);
    hidePomodoroPanelIfOpen();
}

export function hidePanel() {
    isPlayerVisible.set(false);
}

export function openSearch() {
    isSearchOpen.set(true);
}

export function closeSearch() {
    isSearchOpen.set(false);
    searchQuery.set('');
}

/**
 * Changes the volume (0 to 1).
 * @param {number} newVolume
 */
export async function setVolume(newVolume) {
    const clamped = Math.max(0, Math.min(1, newVolume));
    volume.set(clamped);
    if (clamped > 0 && get(isMuted)) {
        isMuted.set(false);
    }
    await chrome.storage.local.set({ [VOLUME_KEY]: { volume: clamped, isMuted: get(isMuted) } });
    await sendCommand('setVolume', { volume: clamped });
}

/**
 * Toggles mute on/off.
 */
export async function toggleMute() {
    const muted = !get(isMuted);
    isMuted.set(muted);
    await chrome.storage.local.set({ [VOLUME_KEY]: { volume: get(volume), isMuted: muted } });
    await sendCommand('setMuted', { isMuted: muted });
}
