// offscreen.js -- runs in an offscreen document, plays Pomodoro sounds via Web Audio
import { getMusicTrackFromDb } from '../../../utils/db.js';

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'pomodoroPlaySound') {
        playSound(msg.soundType);
    }
});

function playSound(type) {
    try {
        const ctx = new AudioContext();
        const master = ctx.createGain();
        master.gain.value = 0.75;
        master.connect(ctx.destination);

        const schedule = {
            work: [
                [523.25, 0],
                [659.25, 0.28],
                [783.99, 0.56],
                [1046.5, 0.84],
            ],
            break: [
                [783.99, 0],
                [659.25, 0.32],
                [523.25, 0.64],
            ],
            allDone: [
                [523.25, 0],
                [659.25, 0.15],
                [783.99, 0.3],
                [1046.5, 0.45],
                [783.99, 0.65],
                [1046.5, 0.8],
                [1318.5, 0.95],
            ],
        }[type] || [[880, 0]];

        const waveType = type === 'break' ? 'triangle' : 'sine';

        schedule.forEach(([freq, delay]) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.connect(g);
            g.connect(master);
            osc.frequency.value = freq;
            osc.type = waveType;
            const t0 = ctx.currentTime + delay;
            g.gain.setValueAtTime(0, t0);
            g.gain.linearRampToValueAtTime(0.5, t0 + 0.06);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
            osc.start(t0);
            osc.stop(t0 + 0.75);
        });

        // Close context after all sounds finish
        const totalDuration = (schedule[schedule.length - 1][1] + 1.2) * 1000;
        setTimeout(() => ctx.close(), totalDuration);
    } catch (e) {
        console.warn('[Offscreen] Audio error:', e);
    }
}

// ─── Music player ────────────────────────────────────────────────────
// The audio lives here rather than in the panel that controls it: an offscreen
// document outlives whichever page opened it, so the music keeps going when the
// panel is hidden, when the view changes and when the page is closed altogether.
//
// An offscreen document may only use `chrome.runtime` — `chrome.storage` is not
// there — so the folder's names and order arrive with the commands, and the audio
// itself is read from IndexedDB, which is a web API and does work here. The state
// travels back as messages; the service worker is what files it away.

/** Often enough for a moving progress bar, rarely enough not to flood messaging. */
const STATE_REPORT_MS = 250;

const music = {
    audio: null,
    tracks: [],
    radioStations: [],
    currentRadio: null,
    index: -1,
    objectUrl: null,
    reportTimer: null,
    activeTab: 'all',
};

function musicAudio() {
    if (music.audio) return music.audio;
    const audio = new Audio();
    audio.preload = 'metadata';
    music.audio = audio;
    for (const event of ['play', 'pause', 'durationchange', 'loadedmetadata', 'seeked']) {
        audio.addEventListener(event, reportMusicState);
    }
    audio.addEventListener('ended', async () => {
        if (!music.currentRadio) {
            if (music.activeTab === 'all' && music.index >= music.tracks.length - 1 && music.radioStations.length > 0) {
                await playRadioStation(music.radioStations[0], { autoplay: true });
            } else {
                playMusicIndex(music.index + 1, { wrap: false });
            }
        }
    });
    audio.addEventListener('error', reportMusicState);
    audio.addEventListener('play', startMusicReporting);
    for (const event of ['pause', 'ended', 'emptied']) audio.addEventListener(event, stopMusicReporting);
    return audio;
}

function musicSnapshot() {
    const audio = music.audio;
    const isRadio = Boolean(music.currentRadio);
    const title = isRadio ? music.currentRadio.name || 'Radio' : music.tracks[music.index]?.title || '';
    return {
        index: isRadio ? -1 : music.index,
        count: isRadio ? music.radioStations.length : music.tracks.length,
        title,
        isRadio,
        currentRadio: music.currentRadio,
        isPlaying: Boolean(audio && !audio.paused && !audio.ended),
        currentTime: audio?.currentTime || 0,
        duration: !isRadio && Number.isFinite(audio?.duration) ? audio.duration : 0,
        volume: audio ? audio.volume : 1,
        isMuted: Boolean(audio?.muted),
    };
}

function reportMusicState() {
    // Sent to whoever is listening: the panel paints it, and the service worker keeps
    // a copy so a page opened later knows what is playing.
    chrome.runtime.sendMessage({ action: 'musicState', state: musicSnapshot() }).catch(() => {});
}

function startMusicReporting() {
    if (music.reportTimer) return;
    music.reportTimer = setInterval(reportMusicState, STATE_REPORT_MS);
}

function stopMusicReporting() {
    clearInterval(music.reportTimer);
    music.reportTimer = null;
    reportMusicState();
}

function releaseMusicUrl() {
    if (music.objectUrl) {
        URL.revokeObjectURL(music.objectUrl);
        music.objectUrl = null;
    }
}

/**
 * Takes in the folder the player was given: names and order only, since the audio
 * is read from IndexedDB one track at a time.
 *
 * @param {Array<{index: number, title: string}>} tracks
 */
function setMusicPlaylist(tracks) {
    music.tracks = Array.isArray(tracks) ? tracks : [];
}

/**
 * Sets available radio stations for cycling.
 * @param {Array<{id: string, name: string, url: string}>} stations
 */
function setRadioStations(stations) {
    music.radioStations = Array.isArray(stations) ? stations : [];
}

/**
 * Plays a radio station stream URL directly.
 * @param {{id: string, name: string, url: string}} station
 * @param {{autoplay?: boolean}} options
 */
async function playRadioStation(station, { autoplay = true } = {}) {
    if (!station || !station.url) return;
    releaseMusicUrl();
    music.index = -1;
    music.currentRadio = station;

    const audio = musicAudio();
    audio.src = station.url;
    audio.load();
    if (autoplay) {
        await audio.play().catch((err) => {
            console.warn('[Offscreen] Radio play error:', err);
        });
    }
    reportMusicState();
}

/**
 * @param {number} index
 * @param {{autoplay?: boolean, wrap?: boolean}} options
 */
async function playMusicIndex(index, { autoplay = true, wrap = true, startAt = 0 } = {}) {
    if (music.tracks.length === 0) return;

    let target = index;
    if (target >= music.tracks.length) {
        // Reaching the end of the folder stops; only the buttons wrap around.
        if (!wrap) {
            musicAudio().pause();
            musicAudio().currentTime = 0;
            reportMusicState();
            return;
        }
        target = 0;
    }
    if (target < 0) target = music.tracks.length - 1;

    const blob = await getMusicTrackFromDb(target);
    if (!blob) return;

    releaseMusicUrl();
    music.currentRadio = null;
    music.index = target;
    music.objectUrl = URL.createObjectURL(blob);
    const audio = musicAudio();
    audio.src = music.objectUrl;
    audio.load();
    // Carrying on from where a previous copy of this document was cut off.
    if (startAt > 0) {
        await new Promise((resolve) => audio.addEventListener('loadedmetadata', resolve, { once: true }));
        audio.currentTime = startAt;
    }
    if (autoplay) await audio.play().catch(() => {});
    reportMusicState();
}

async function handleMusicCommand(msg) {
    const audio = musicAudio();
    if (Array.isArray(msg.tracks)) setMusicPlaylist(msg.tracks);
    if (Array.isArray(msg.radioStations)) setRadioStations(msg.radioStations);
    if (typeof msg.activeTab === 'string') music.activeTab = msg.activeTab;

    switch (msg.cmd) {
        case 'loadPlaylist':
            music.currentRadio = null;
            await playMusicIndex(msg.index ?? 0, { autoplay: Boolean(msg.autoplay), startAt: msg.startAt || 0 });
            break;
        case 'setPlaylist':
            if (typeof msg.index === 'number') music.index = msg.index;
            break;
        case 'playRadio':
            if (msg.station) {
                await playRadioStation(msg.station, { autoplay: msg.autoplay !== false });
            }
            break;
        case 'setRadioStations':
            if (Array.isArray(msg.radioStations)) setRadioStations(msg.radioStations);
            break;
        case 'playIndex':
            music.currentRadio = null;
            await playMusicIndex(msg.index, { autoplay: true });
            break;
        case 'play':
            if (music.currentRadio) {
                if (!audio.src || audio.src === '' || audio.src === 'about:blank') {
                    audio.src = music.currentRadio.url;
                    audio.load();
                }
                await audio.play().catch(() => {});
            } else if (music.index === -1) {
                await playMusicIndex(0, { autoplay: true });
            } else {
                await audio.play().catch(() => {});
            }
            break;
        case 'pause':
            audio.pause();
            break;
        case 'stop':
            audio.pause();
            audio.currentTime = 0;
            if (music.currentRadio) {
                // Free stream connection
                audio.removeAttribute('src');
                audio.load();
            }
            break;
        case 'next':
            if (music.activeTab === 'all') {
                if (music.currentRadio && music.radioStations.length > 0) {
                    const currentIdx = music.radioStations.findIndex((s) => s.id === music.currentRadio?.id);
                    if (currentIdx >= 0 && currentIdx < music.radioStations.length - 1) {
                        await playRadioStation(music.radioStations[currentIdx + 1], { autoplay: true });
                    } else if (music.tracks.length > 0) {
                        await playMusicIndex(0, { autoplay: true });
                    } else {
                        await playRadioStation(music.radioStations[0], { autoplay: true });
                    }
                } else if (music.tracks.length > 0) {
                    if (music.index >= 0 && music.index < music.tracks.length - 1) {
                        await playMusicIndex(music.index + 1, { autoplay: true });
                    } else if (music.radioStations.length > 0) {
                        await playRadioStation(music.radioStations[0], { autoplay: true });
                    } else {
                        await playMusicIndex(0, { autoplay: true });
                    }
                }
            } else if (music.currentRadio && music.radioStations.length > 0) {
                const currentIdx = music.radioStations.findIndex((s) => s.id === music.currentRadio?.id);
                const nextIdx = (currentIdx + 1) % music.radioStations.length;
                await playRadioStation(music.radioStations[nextIdx], { autoplay: true });
            } else {
                await playMusicIndex(music.index + 1);
            }
            break;
        case 'previous':
            if (music.activeTab === 'all') {
                if (music.currentRadio && music.radioStations.length > 0) {
                    const currentIdx = music.radioStations.findIndex((s) => s.id === music.currentRadio?.id);
                    if (currentIdx > 0) {
                        await playRadioStation(music.radioStations[currentIdx - 1], { autoplay: true });
                    } else if (music.tracks.length > 0) {
                        await playMusicIndex(music.tracks.length - 1, { autoplay: true });
                    } else {
                        await playRadioStation(music.radioStations[music.radioStations.length - 1], { autoplay: true });
                    }
                } else if (music.tracks.length > 0) {
                    if (music.index > 0) {
                        await playMusicIndex(music.index - 1, { autoplay: true });
                    } else if (music.radioStations.length > 0) {
                        await playRadioStation(music.radioStations[music.radioStations.length - 1], { autoplay: true });
                    } else {
                        await playMusicIndex(music.tracks.length - 1, { autoplay: true });
                    }
                }
            } else if (music.currentRadio && music.radioStations.length > 0) {
                const currentIdx = music.radioStations.findIndex((s) => s.id === music.currentRadio?.id);
                const prevIdx = (currentIdx - 1 + music.radioStations.length) % music.radioStations.length;
                await playRadioStation(music.radioStations[prevIdx], { autoplay: true });
            } else {
                await playMusicIndex(music.index - 1);
            }
            break;
        case 'seekRatio':
            if (!music.currentRadio && Number.isFinite(audio.duration) && audio.duration > 0) {
                audio.currentTime = Math.min(Math.max(0, audio.duration * msg.ratio), audio.duration);
            }
            break;
        case 'nudge':
            if (!music.currentRadio && Number.isFinite(audio.duration)) {
                audio.currentTime = Math.min(Math.max(0, (audio.currentTime || 0) + msg.seconds), audio.duration);
            }
            break;
        case 'setVolume':
            if (typeof msg.volume === 'number') {
                audio.volume = Math.max(0, Math.min(1, msg.volume));
                if (audio.volume > 0) audio.muted = false;
            }
            break;
        case 'setMuted':
            if (typeof msg.isMuted === 'boolean') {
                audio.muted = msg.isMuted;
            }
            break;
        default:
            break;
    }
    reportMusicState();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'musicCommand') {
        handleMusicCommand(msg).catch((error) => console.warn('[Offscreen] Music command failed:', error));
        return;
    }
    if (msg?.action === 'musicRequestState') {
        sendResponse(musicSnapshot());
        return true;
    }
    // `musicIsBusy` lets the Pomodoro chime decide whether it may close this document.
    if (msg?.action === 'musicIsBusy') {
        sendResponse({ busy: Boolean(music.audio && !music.audio.paused) });
        return true;
    }
    return undefined;
});
