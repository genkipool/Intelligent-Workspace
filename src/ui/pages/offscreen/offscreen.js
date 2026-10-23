// offscreen.js -- runs in an offscreen document: plays Pomodoro sounds via Web Audio,
// answers scheduled assistant queries with Chrome's local model, which the worker cannot
// reach (the Prompt API only exists in documents), and copies text a page would not let
// its content script copy.

let isMusicActive = false;

/** Local-model prompts in flight; the worker must not close the document under them. */
let pendingLocalPrompts = 0;

/**
 * Checks whether any audio or background music is actively playing in this offscreen document.
 */
function isMusicPlaying() {
    if (isMusicActive) return true;
    const audioElements = typeof document !== 'undefined' ? document.querySelectorAll('audio') : [];
    for (const audio of audioElements) {
        if (!audio.paused && !audio.ended && audio.currentTime > 0) {
            return true;
        }
    }
    return false;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'pomodoroPlaySound') {
        playSound(msg.soundType);
    } else if (msg?.action === 'musicIsBusy') {
        sendResponse({ busy: isMusicPlaying() || pendingLocalPrompts > 0 });
        return true;
    } else if (msg?.action === 'setMusicBusy') {
        isMusicActive = Boolean(msg.busy);
        sendResponse({ success: true, busy: isMusicActive });
        return true;
    } else if (msg?.action === 'offscreenLocalAiPrompt') {
        pendingLocalPrompts++;
        promptLocalModel(msg)
            .then(sendResponse)
            .finally(() => pendingLocalPrompts--);
        return true;
    } else if (msg?.action === 'offscreenCopyText') {
        sendResponse({ success: copyText(msg.text) });
        return true;
    }
});

/**
 * Puts text on the clipboard for a page that would not allow it.
 *
 * An offscreen document never has focus, so the async Clipboard API refuses it; the
 * old copy command does not ask for focus, and the extension's `clipboardWrite`
 * permission is what lets it through.
 */
function copyText(text) {
    if (!text) return false;
    const scratch = document.createElement('textarea');
    scratch.value = text;
    document.body.appendChild(scratch);
    scratch.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        scratch.remove();
    }
}

/**
 * One question to the local model, without a conversation behind it.
 *
 * Nothing but chrome.runtime exists in an offscreen document, so the worker hands over
 * everything that would otherwise be read from storage (the language, the system
 * prompt), and a failure comes back as a code or Chrome's own text for the worker to
 * translate. Every step is on the clock: with the model missing, `availability()` and
 * `create()` can both sit there without ever settling.
 */
async function promptLocalModel({ query, systemPrompt, language, timeoutMs }) {
    const LanguageModel = globalThis.LanguageModel;
    if (!LanguageModel?.create) return { success: false, error: 'unsupported' };
    const expectedOutputs = [{ type: 'text', languages: [language || 'en'] }];
    let session;
    const work = (async () => {
        const status = await Promise.race([
            LanguageModel.availability({ expectedOutputs }),
            new Promise((resolve) => setTimeout(() => resolve('timeout'), 8000)),
        ]);
        if (status !== 'available') return { success: false, error: status };
        session = await LanguageModel.create({
            expectedOutputs,
            initialPrompts: [{ role: 'system', content: systemPrompt }],
        });
        const answer = await session.prompt(query);
        return answer ? { success: true, answer } : { success: false, error: 'empty-response' };
    })();
    try {
        return await Promise.race([
            work,
            new Promise((resolve) =>
                setTimeout(() => resolve({ success: false, error: 'timeout' }), timeoutMs || 120000),
            ),
        ]);
    } catch (error) {
        return { success: false, error: String(error?.message || error) };
    } finally {
        // A session still being created when the clock ran out is destroyed once it lands.
        if (session) session.destroy?.();
        else work.then(() => session?.destroy?.()).catch(() => {});
    }
}

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
