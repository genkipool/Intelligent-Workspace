/**
 * Voice dictation for the assistant (microphone button).
 *
 * Recognition runs continuously: the browser ends a session after a pause, so it is
 * restarted until the user stops it themselves. Interim words are written into the
 * textarea as they are spoken and replaced in place once they firm up, which is what
 * makes dictating a long sentence workable.
 */
import { writable, get } from 'svelte/store';
import { showNotification, getCurrentLang } from '../../utils/i18n.js';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/** Errors that mean the microphone was refused rather than something going wrong. */
const PERMISSION_ERRORS = new Set(['not-allowed', 'service-not-allowed']);

/** `true` while recognition is listening, used for the button state. */
export const isListening = writable(false);

/** `true` while the user is speaking a phrase that has not firmed up yet. */
export const interimTranscript = writable('');

export const isVoiceSupported = !!SpeechRecognition;

let recognition = null;
/** Set while the user wants to keep dictating, so silence does not end the session. */
let keepListening = false;
let permissionWindowId = null;
/** Where the not-yet-final words currently sit in the textarea. */
let interimRange = null;

export function stopVoiceInput() {
    keepListening = false;
    interimRange = null;
    interimTranscript.set('');
    if (recognition) {
        const current = recognition;
        recognition = null;
        try {
            current.stop();
        } catch {
            // Already stopped; nothing to undo.
        }
    }
    isListening.set(false);
}

/**
 * Writes text at the caret, replacing whatever interim text is already there.
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {string} transcript
 * @param {boolean} isFinal - Final text stays; interim text is replaced next time.
 */
function writeTranscript(textarea, transcript, isFinal) {
    if (!textarea || !transcript) return;

    let start;
    let end;
    if (interimRange) {
        ({ start, end } = interimRange);
    } else {
        start = textarea.selectionStart;
        end = textarea.selectionEnd;
    }

    const value = textarea.value;
    const before = value.substring(0, start);
    const after = value.substring(end);
    const spaceBefore = before.endsWith(' ') || before === '' ? '' : ' ';
    const spaceAfter = after.startsWith(' ') || after === '' ? '' : ' ';

    textarea.value = before + spaceBefore + transcript + spaceAfter + after;

    const cursor = start + spaceBefore.length + transcript.length;
    textarea.selectionStart = textarea.selectionEnd = cursor;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Final words are left alone; interim ones are overwritten by the next result.
    interimRange = isFinal ? null : { start, end: cursor + spaceAfter.length };
    interimTranscript.set(isFinal ? '' : transcript);
}

async function startRecognition(textarea, { onPermissionDenied } = {}) {
    if (recognition) return;

    // Resolved before starting: setting `lang` after start() left the first phrases
    // being transcribed with the browser's own language instead of the extension's,
    // which is what made dictation come out wrong.
    const lang = await getCurrentLang();
    if (recognition) return;

    const instance = new SpeechRecognition();
    recognition = instance;
    keepListening = true;
    interimRange = null;

    // Events from a session we already replaced must not touch the UI.
    const isCurrent = () => recognition === instance;

    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = lang === 'es' ? 'es-ES' : 'en-US';
    // Ask for alternatives so the engine can settle on the best one rather than the
    // first guess it manages to emit.
    instance.maxAlternatives = 3;

    instance.onstart = () => {
        if (isCurrent()) isListening.set(true);
    };

    instance.onresult = (event) => {
        if (!isCurrent()) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            writeTranscript(textarea, result[0]?.transcript, result.isFinal);
        }
    };

    instance.onerror = (event) => {
        if (!isCurrent()) return;
        if (PERMISSION_ERRORS.has(event.error)) {
            stopVoiceInput();
            onPermissionDenied?.();
            return;
        }
        // 'no-speech' and 'aborted' are ordinary parts of a long dictation.
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        console.error('Speech recognition error:', event.error);
        showNotification('geminiVoiceError', true, [event.error]);
        stopVoiceInput();
    };

    instance.onend = () => {
        if (!isCurrent()) return;
        // The browser ends a session after a pause; keep going until the user stops.
        if (keepListening) {
            try {
                instance.start();
                return;
            } catch {
                // Restart refused (for instance the tab lost focus): fall through.
            }
        }
        recognition = null;
        stopVoiceInput();
        textarea?.focus();
    };

    try {
        instance.start();
    } catch (error) {
        console.error('Failed to start speech recognition:', error);
        showNotification('geminiVoiceError', true, [error.message || error]);
        stopVoiceInput();
    }
}

/**
 * Opens the permission page next to the browser window and starts dictating as soon as
 * the microphone is granted.
 */
async function requestMicrophonePermission(textarea) {
    // Asking twice would stack windows on top of each other.
    if (permissionWindowId !== null) {
        try {
            await chrome.windows.update(permissionWindowId, { focused: true });
            return;
        } catch {
            permissionWindowId = null;
        }
    }

    const width = 360;
    const height = 420;
    let left = Math.round((screen.width - width) / 2);
    let top = Math.round((screen.height - height) / 2);

    try {
        const currentWin = await chrome.windows.getCurrent();
        if (currentWin?.width) {
            left = Math.round(currentWin.left + currentWin.width - width - 24);
            top = Math.round(currentWin.top + 100);
        }
    } catch (err) {
        console.error('Failed to query active browser window bounds:', err);
    }

    try {
        const win = await chrome.windows.create({
            url: chrome.runtime.getURL('src/ui/pages/permission/permission.html'),
            type: 'popup',
            width,
            height,
            left,
            top,
        });
        permissionWindowId = win?.id ?? null;
        if (permissionWindowId !== null) {
            const forget = (closedId) => {
                if (closedId !== permissionWindowId) return;
                permissionWindowId = null;
                chrome.windows.onRemoved.removeListener(forget);
            };
            chrome.windows.onRemoved.addListener(forget);
        }
    } catch (err) {
        console.error('Failed to open the microphone permission window:', err);
        return;
    }

    try {
        const status = await navigator.permissions?.query({ name: 'microphone' });
        if (!status) return;
        // One handler per request, released as soon as it has done its job.
        const onChange = () => {
            if (status.state !== 'granted') return;
            status.removeEventListener('change', onChange);
            if (!get(isListening)) void startRecognition(textarea);
        };
        status.addEventListener('change', onChange);
    } catch (err) {
        console.error('Microphone permission watch failed:', err);
    }
}

/**
 * Toggles dictation.
 *
 * Recognition is attempted straight away rather than pre-checking the permission: the
 * Permissions API reports "prompt" for a microphone that has in fact been granted to
 * the extension, which used to pop the permission window open on every single click.
 * The window is only opened if the attempt is actually refused.
 */
export async function toggleVoiceInput(textarea) {
    if (!isVoiceSupported) {
        showNotification('geminiVoiceNotSupported', true);
        return;
    }
    if (get(isListening) || recognition) {
        stopVoiceInput();
        return;
    }
    await startRecognition(textarea, { onPermissionDenied: () => requestMicrophonePermission(textarea) });
}
