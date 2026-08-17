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
    index: -1,
    objectUrl: null,
    reportTimer: null,
};

function musicAudio() {
    if (music.audio) return music.audio;
    const audio = new Audio();
    audio.preload = 'metadata';
    music.audio = audio;
    for (const event of ['play', 'pause', 'durationchange', 'loadedmetadata', 'seeked']) {
        audio.addEventListener(event, reportMusicState);
    }
    audio.addEventListener('ended', () => playMusicIndex(music.index + 1, { wrap: false }));
    audio.addEventListener('error', reportMusicState);
    audio.addEventListener('play', startMusicReporting);
    for (const event of ['pause', 'ended', 'emptied']) audio.addEventListener(event, stopMusicReporting);
    return audio;
}

function musicSnapshot() {
    const audio = music.audio;
    return {
        index: music.index,
        count: music.tracks.length,
        title: music.tracks[music.index]?.title || '',
        isPlaying: Boolean(audio && !audio.paused && !audio.ended),
        currentTime: audio?.currentTime || 0,
        duration: Number.isFinite(audio?.duration) ? audio.duration : 0,
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
    switch (msg.cmd) {
        case 'loadPlaylist':
            await playMusicIndex(msg.index ?? 0, { autoplay: Boolean(msg.autoplay), startAt: msg.startAt || 0 });
            break;
        case 'playIndex':
            await playMusicIndex(msg.index, { autoplay: true });
            break;
        case 'play':
            if (music.index === -1) await playMusicIndex(0, { autoplay: true });
            else await audio.play().catch(() => {});
            break;
        case 'pause':
            audio.pause();
            break;
        case 'stop':
            audio.pause();
            audio.currentTime = 0;
            break;
        case 'next':
            await playMusicIndex(music.index + 1);
            break;
        case 'previous':
            await playMusicIndex(music.index - 1);
            break;
        case 'seekRatio':
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
                audio.currentTime = Math.min(Math.max(0, audio.duration * msg.ratio), audio.duration);
            }
            break;
        case 'nudge':
            if (Number.isFinite(audio.duration)) {
                audio.currentTime = Math.min(Math.max(0, (audio.currentTime || 0) + msg.seconds), audio.duration);
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
