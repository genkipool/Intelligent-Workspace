/* global chrome, speechSynthesis, SpeechSynthesisUtterance */

/**
 * Single entry point for text-to-speech.
 *
 * Notes and the AI assistant used to build their own utterances, which is why they
 * ended up reading with different voices: the notes reader followed the UI language
 * while the assistant was pinned to 'en-US'. Everything now goes through here, so
 * both sound the same.
 *
 * Left alone, the voice is whatever the browser considers default for the language
 * of its own interface. The navigation settings page can name one instead, and that
 * choice reaches every reader — these ones and the page reader in the content
 * script, which reads the same stored object.
 */

/** Where the navigation settings page stores the chosen voice. Synced, like the rest. */
export const SPEECH_SETTINGS_KEY = 'itg-speech-settings';

/** Empty `voiceURI` means "whatever the browser picks", which is the old behaviour. */
export const DEFAULT_SPEECH_SETTINGS = Object.freeze({ voiceURI: '', rate: 1, pitch: 1, volume: 1 });

/**
 * The settings are cached rather than read per utterance: `createUtterance()` is
 * called from inside `onend` handlers, sentence after sentence, and it cannot await.
 */
let speechSettings = { ...DEFAULT_SPEECH_SETTINGS };

export function getSpeechSettings() {
    return { ...speechSettings };
}

async function loadSpeechSettings() {
    try {
        const stored = await chrome.storage.sync.get(SPEECH_SETTINGS_KEY);
        speechSettings = { ...DEFAULT_SPEECH_SETTINGS, ...(stored?.[SPEECH_SETTINGS_KEY] || {}) };
    } catch {
        /* the defaults are the browser's own behaviour, so nothing is lost */
    }
}

if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    loadSpeechSettings();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !changes[SPEECH_SETTINGS_KEY]) return;
        speechSettings = { ...DEFAULT_SPEECH_SETTINGS, ...(changes[SPEECH_SETTINGS_KEY].newValue || {}) };
    });
}

// The list arrives asynchronously on a cold profile, and it stays empty until it is
// asked for once. This is that first ask.
if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();

/** Reading language: the extension UI language, as the notes reader has always done. */
export function getSpeechLang() {
    return chrome.i18n.getUILanguage() || 'en-US';
}

/** The chosen voice, if it is installed; `null` leaves the choice to the browser. */
export function resolveVoice() {
    if (!speechSettings.voiceURI || typeof speechSynthesis === 'undefined') return null;
    return speechSynthesis.getVoices().find((voice) => voice.voiceURI === speechSettings.voiceURI) || null;
}

function clampSpeech(value, low, high, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(high, Math.max(low, number));
}

export function createUtterance(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = resolveVoice();

    if (voice) {
        utterance.voice = voice;
        // The voice's own language, not the interface's: a Spanish voice handed an
        // 'en-US' tag reads Spanish text with an English accent.
        utterance.lang = voice.lang;
    } else {
        utterance.lang = getSpeechLang();
    }

    // Clamped rather than trusted, and with `??` rather than `||`: the lowest pitch
    // there is happens to be zero, and `0 || 1` quietly turns the bottom of the slider
    // back into the middle — which is why the low end sounded like no change at all.
    utterance.rate = clampSpeech(speechSettings.rate, 0.25, 4, 1);
    utterance.pitch = clampSpeech(speechSettings.pitch, 0, 2, 1);
    utterance.volume = clampSpeech(speechSettings.volume, 0, 1, 1);
    return utterance;
}

/**
 * Chrome drops long readings after ~15 s of speech. Pausing and resuming on a timer
 * keeps the queue alive; the timer clears itself once nothing is being spoken.
 */
export function startKeepAlive() {
    const intervalId = setInterval(() => {
        if (speechSynthesis.speaking && !speechSynthesis.paused) {
            speechSynthesis.pause();
            speechSynthesis.resume();
        } else if (!speechSynthesis.speaking) {
            clearInterval(intervalId);
        }
    }, 10000);
    return intervalId;
}

export function stopKeepAlive(intervalId) {
    if (intervalId) clearInterval(intervalId);
}

/** Splits text into sentence-sized chunks, which is what the synthesizer handles best. */
export function splitIntoSpeechChunks(text) {
    const sentences = (text || '').match(/[^.!?]+[.!?]*|[^.!?\s]+/g) || [];
    return sentences.map((sentence) => sentence.trim()).filter(Boolean);
}

export function cancelSpeech() {
    if (typeof speechSynthesis === 'undefined') return;
    try {
        if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    } catch {
        /* nothing to cancel */
    }
}
