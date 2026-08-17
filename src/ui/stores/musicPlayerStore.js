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
import { buildPlaylist, filterTracks } from '../services/musicPlayer/playlist.js';
import { saveMusicTracksToDb, clearMusicTracksInDb } from '../../utils/db.js';

/** How far the rewind and fast-forward buttons jump, in seconds. */
export const SEEK_STEP_SECONDS = 10;

const PLAYLIST_KEY = 'musicPlaylist';
const STATE_KEY = 'musicPlayerState';
/** What the browser will hold for one folder before the rest is left out. */
const MAX_TRACKS = 500;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

/** Is the player panel on screen? */
export const isPlayerVisible = writable(false);
/** The whole picked folder, in playing order. */
export const tracks = writable([]);
/** The folder those tracks came from, for the empty state and the tooltips. */
export const playlistFolder = writable('');
/** Position in `tracks`, or -1 when nothing is loaded. */
export const currentIndex = writable(-1);
export const isPlaying = writable(false);
export const currentTime = writable(0);
export const duration = writable(0);
/** Is the track name at the top acting as a search box? */
export const isSearchOpen = writable(false);
export const searchQuery = writable('');

export const currentTrack = derived([tracks, currentIndex], ([$tracks, $index]) => $tracks[$index] ?? null);

/** The tracks the search box is showing; the whole folder when nothing is typed. */
export const searchResults = derived([tracks, searchQuery], ([$tracks, $query]) => filterTracks($tracks, $query));

export const hasTracks = derived(tracks, ($tracks) => $tracks.length > 0);

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
    if (created && cmd !== 'loadPlaylist') {
        await post('loadPlaylist', {
            tracks: get(tracks),
            index: Math.max(get(currentIndex), 0),
            startAt: get(currentTime),
            autoplay: false,
        });
    }
    await post(cmd, extra);
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

let interpolationBase = 0;

/** Takes in a state report from the offscreen player. */
function applyState(state) {
    if (!state) return;
    currentIndex.set(state.index ?? -1);
    isPlaying.set(Boolean(state.isPlaying));
    duration.set(state.duration || 0);
    currentTime.set(state.currentTime || 0);
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

/**
 * Picks up whatever was already going.
 *
 * A page opened while music plays — or reopened after being closed — reads the folder
 * from storage and the position from the copy the service worker files away, so it
 * shows the truth straight away without waking the player just to ask.
 */
export async function initMusicPlayer() {
    try {
        const { [PLAYLIST_KEY]: playlist } = await chrome.storage.local.get(PLAYLIST_KEY);
        if (playlist?.tracks?.length) {
            tracks.set(playlist.tracks);
            playlistFolder.set(playlist.folder || '');
        }
        const { [STATE_KEY]: state } = await chrome.storage.session.get(STATE_KEY);
        if (state) applyState(state);
    } catch {
        // A player with nothing to show is the right answer when storage says nothing.
    }
}

// ─── Commands ─────────────────────────────────────────────────────────

/**
 * Replaces the playlist with the audio files of a picked folder.
 *
 * The audio is copied into IndexedDB because that is the only way it can reach the
 * offscreen document that plays it — and it is what makes the folder survive the page
 * being closed. Nothing starts on its own: the first track is cued up and waits.
 *
 * @param {FileList|File[]|Array<{file: File, path: string}>} entries
 * @param {{folder?: string, autoplay?: boolean}} options
 * @returns {Promise<{loaded: number, folder: string, trimmed: boolean}>}
 */
export async function loadFolder(entries, { folder: folderName = '', autoplay = false } = {}) {
    const playlist = buildPlaylist(entries);
    const folder = folderName || playlist[0]?.folder || '';
    if (playlist.length === 0) return { loaded: 0, folder, trimmed: false };

    // Whatever will not fit is left out rather than filling the disk quietly.
    const kept = [];
    let bytes = 0;
    for (const track of playlist) {
        if (kept.length >= MAX_TRACKS || bytes + track.size > MAX_TOTAL_BYTES) break;
        bytes += track.size;
        kept.push({ ...track, index: kept.length });
    }

    await saveMusicTracksToDb(kept.map((track) => ({ index: track.index, blob: track.file })));
    // The metadata is kept apart from the audio: listing the folder should not mean
    // reading every track back out.
    const meta = kept.map(({ index, title, fileName, path, size }) => ({ index, title, fileName, path, size }));
    await chrome.storage.local.set({ [PLAYLIST_KEY]: { folder, tracks: meta } });

    tracks.set(meta);
    playlistFolder.set(folder);
    currentIndex.set(-1);
    currentTime.set(0);
    duration.set(0);
    searchQuery.set('');

    await sendCommand('loadPlaylist', { tracks: meta, index: 0, autoplay });
    return { loaded: kept.length, folder, trimmed: kept.length < playlist.length };
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

/** @param {number} index */
export async function playTrackAt(index) {
    if (index < 0 || index >= get(tracks).length) return;
    await sendCommand('playIndex', { index, tracks: get(tracks) });
}

/** Plays a track the search results handed back. */
export async function playTrack(track) {
    if (!track) return;
    await playTrackAt(track.index);
}

export async function play() {
    await sendCommand('play', { tracks: get(tracks) });
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
    await sendCommand('next', { tracks: get(tracks) });
}

export async function playPrevious() {
    await sendCommand('previous', { tracks: get(tracks) });
}

/** @param {number} ratio 0–1, from a click or drag on the progress bar */
export async function seekRatio(ratio) {
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
    await sendCommand('nudge', { seconds });
}

export function rewind() {
    return nudge(-SEEK_STEP_SECONDS);
}

export function fastForward() {
    return nudge(SEEK_STEP_SECONDS);
}

export function togglePanel() {
    isPlayerVisible.update((visible) => !visible);
}

export function showPanel() {
    isPlayerVisible.set(true);
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
