/* global chrome, speechSynthesis, SpeechSynthesisUtterance */

/**
 * Single entry point for text-to-speech.
 *
 * Notes and the AI assistant used to build their own utterances, which is why they
 * ended up reading with different voices: the notes reader followed the UI language
 * while the assistant was pinned to 'en-US'. Everything now goes through here, so
 * both sound the same — the voice the notes reader has always used.
 */

/** Reading language: the extension UI language, as the notes reader has always done. */
export function getSpeechLang() {
    return chrome.i18n.getUILanguage() || 'en-US';
}

export function createUtterance(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getSpeechLang();
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
