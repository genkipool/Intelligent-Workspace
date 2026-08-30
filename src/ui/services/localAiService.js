/**
 * CHROME'S LOCAL AI (Gemini Nano, the Prompt API)
 *
 * A second engine behind the assistant, for the moment the API keys run out of quota.
 * It is the same model Chrome ships to the browser itself: it runs on the machine, it
 * costs nothing and it works offline, and it is smaller than the API in every other
 * way — a short context window, no Google Search grounding, and no tool calling, which
 * is what the agent is built out of.
 *
 * Two of those limits have to reach the interface rather than being discovered by a
 * user whose request silently does less than it did yesterday: while the local engine
 * is the one answering, the agent button and the file button are disabled. That is what
 * `localAiActive` is for — it is true only when the local model would be the one to
 * answer the next question: the user turned it on, the model is downloaded, and there
 * is no API key left with quota.
 *
 * Everything here degrades to "unsupported" on a browser without the API rather than
 * throwing: the extension also runs on Chrome versions and machines that never get it.
 */

import { writable, derived, get } from 'svelte/store';

import { getCurrentLang } from '../../utils/i18n.js';

export const STORAGE_KEYS = {
    ENABLED: 'localAiEnabled',
    API_KEY: 'geminiApiKey',
    API_KEYS_LIST: 'geminiApiKeysList',
    SELECTED_MODEL: 'selectedGeminiModel',
    TOOLS: 'localAiSupportsTools',
};

/**
 * What the local engine is called in the model selector and in the answers it writes.
 *
 * It is not a Gemini name on purpose: the API client only accepts a model whose name
 * contains "gemini" and falls back to its default otherwise, so this value can never be
 * sent to Google by accident.
 */
export const LOCAL_AI_MODEL_ID = 'chrome-local-ai';

/** The Gemini model the selector goes back to when the local one is uninstalled. */
const DEFAULT_REMOTE_MODEL = 'gemini-2.5-flash';

/** What the model reports about itself, in the order the interface cares about. */
export const LOCAL_AI_STATUS = {
    UNSUPPORTED: 'unsupported', // No Prompt API in this browser.
    UNAVAILABLE: 'unavailable', // The API is there, the machine does not qualify.
    DOWNLOADABLE: 'downloadable', // Not installed, but it can be.
    DOWNLOADING: 'downloading', // Chrome is fetching it right now.
    AVAILABLE: 'available', // Installed and ready.
};

/**
 * Whether the installed model can work as an agent.
 *
 * Nothing declares this. The API takes a `tools` option, but an option a browser does
 * not implement is silently dropped rather than refused — a WebIDL dictionary ignores
 * members it does not know — so accepting the call proves nothing. The only honest test
 * is to hand the model a tool and see whether it calls it, which is what
 * `detectToolSupport` does. It costs one short inference, so the answer is cached and
 * only re-taken when the user asks for it.
 */
export const localAiSupportsTools = writable(false);

function api() {
    return globalThis.LanguageModel;
}

/**
 * The languages Chrome will attest an answer in. Anything else is refused with a
 * console warning and the answer comes back unvouched for, so the extension's own
 * language is mapped into this list and everything else falls back to English.
 */
const OUTPUT_LANGUAGES = ['de', 'en', 'es', 'fr', 'ja'];

/**
 * What every session declares it will answer in.
 *
 * Not optional in practice: a `create()` without it is met with "No output language was
 * specified in a LanguageModel API request" and Chrome says the quality and the safety
 * attestation both suffer for it.
 */
async function outputLanguage() {
    try {
        const lang = (await getCurrentLang()) || 'en';
        const base = String(lang).split('-')[0].toLowerCase();
        return OUTPUT_LANGUAGES.includes(base) ? base : 'en';
    } catch {
        return 'en';
    }
}

/** The half of the session options that says which language the answer comes back in. */
async function outputOptions() {
    return { expectedOutputs: [{ type: 'text', languages: [await outputLanguage()] }] };
}

/**
 * Every call into the API is raced against the clock.
 *
 * `availability()` is documented as a lookup, but on a profile that has never seen the
 * model it can sit there without ever settling — measured in a fresh Chrome 151. An
 * await that never returns is worse than a "no": the modal would say it was still
 * asking for ever, and a question that failed against the API would hang in the
 * assistant instead of showing why.
 */
function withTimeout(promise, ms, fallback) {
    let timer;
    return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise((resolve) => {
            timer = setTimeout(() => {
                console.warn(`[LocalAI] The browser did not answer in ${ms}ms.`);
                resolve(fallback);
            }, ms);
        }),
    ]);
}

const AVAILABILITY_TIMEOUT = 8000;
const PROMPT_TIMEOUT = 120000;

/** The engine's own state, kept here so several components read one answer. */
export const localAiStatus = writable(LOCAL_AI_STATUS.UNSUPPORTED);
export const localAiEnabled = writable(false);
export const localAiSupportsImages = writable(false);
/** 0–1 while Chrome downloads the model, null when it is not downloading. */
export const localAiDownloadProgress = writable(null);

/** True while every API key is out of quota (or there is no key at all). */
const apiQuotaExhausted = writable(false);

/**
 * The local engine is what would answer the next question.
 *
 * Used to disable the agent and the attachments, so read it rather than reading the
 * preference: a preference that is on while a key still has quota changes nothing.
 */
export const localAiActive = derived(
    [localAiEnabled, localAiStatus, apiQuotaExhausted],
    ([$enabled, $status, $exhausted]) => $enabled && $status === LOCAL_AI_STATUS.AVAILABLE && $exhausted,
);

/**
 * Asks the browser whether the model is there.
 *
 * @param {{ inputs?: string[] }} [options] Ask about a session that takes these kinds of
 *        input ('image', 'audio') rather than text alone. Chrome answers for the build
 *        that would have to be installed to serve them, which is how the richer variant
 *        gets asked for at all.
 * @returns {Promise<string>} One of `LOCAL_AI_STATUS`.
 */
export async function checkAvailability({ inputs = [] } = {}) {
    const LanguageModel = api();
    if (!LanguageModel?.availability) return LOCAL_AI_STATUS.UNSUPPORTED;

    try {
        // The output language goes with every request, not only with `create()`:
        // `availability()` is a LanguageModel API request too, and asking without it is
        // met with "No output language was specified in a LanguageModel API request" in
        // the console of whichever page happened to ask.
        const options = await outputOptions();
        if (inputs.length) options.expectedInputs = inputs.map((type) => ({ type }));

        const availability = await withTimeout(
            LanguageModel.availability(options),
            AVAILABILITY_TIMEOUT,
            LOCAL_AI_STATUS.UNAVAILABLE,
        );
        return availability || LOCAL_AI_STATUS.UNAVAILABLE;
    } catch (error) {
        console.warn('[LocalAI] availability() failed:', error);
        return LOCAL_AI_STATUS.UNAVAILABLE;
    }
}

/** True when the browser would serve a session taking this kind of input. */
async function inputSupported(type) {
    const status = await checkAvailability({ inputs: [type] });
    return status !== LOCAL_AI_STATUS.UNAVAILABLE && status !== LOCAL_AI_STATUS.UNSUPPORTED;
}

/**
 * Counts the refreshes so a slow one cannot overwrite a fast one.
 *
 * These calls can take the full eight seconds, and two of them overlap as a matter of
 * course — the panel asks at boot, the modal asks when it opens. Without this the older
 * answer lands last and stamps "not installed" over a model that has just appeared.
 */
let refreshToken = 0;

/** Re-reads the browser and storage and updates every store above. */
export async function refreshLocalAiState() {
    const token = ++refreshToken;
    const stale = () => token !== refreshToken;

    const status = await checkAvailability();
    if (stale())
        return {
            status,
            images: get(localAiSupportsImages),
            agents: get(localAiSupportsTools),
            enabled: get(localAiEnabled),
        };
    localAiStatus.set(status);

    if (status === LOCAL_AI_STATUS.UNSUPPORTED || status === LOCAL_AI_STATUS.UNAVAILABLE) {
        localAiSupportsImages.set(false);
    } else {
        const withImages = await checkAvailability({ inputs: ['image'] });
        if (stale())
            return {
                status,
                images: get(localAiSupportsImages),
                agents: get(localAiSupportsTools),
                enabled: get(localAiEnabled),
            };
        localAiSupportsImages.set(
            withImages !== LOCAL_AI_STATUS.UNAVAILABLE && withImages !== LOCAL_AI_STATUS.UNSUPPORTED,
        );
    }

    const stored = await chrome.storage.local.get([
        STORAGE_KEYS.ENABLED,
        STORAGE_KEYS.API_KEY,
        STORAGE_KEYS.API_KEYS_LIST,
    ]);
    if (stale())
        return {
            status,
            images: get(localAiSupportsImages),
            agents: get(localAiSupportsTools),
            enabled: get(localAiEnabled),
        };

    localAiEnabled.set(!!stored[STORAGE_KEYS.ENABLED]);
    apiQuotaExhausted.set(isQuotaExhausted(stored));

    // Read, never re-taken here: the test costs an inference and this runs on every
    // panel boot. The modal is what takes it, once.
    const { [STORAGE_KEYS.TOOLS]: toolsKnown } = await chrome.storage.local.get(STORAGE_KEYS.TOOLS);
    localAiSupportsTools.set(!!toolsKnown);

    return {
        status,
        images: get(localAiSupportsImages),
        agents: get(localAiSupportsTools),
        enabled: get(localAiEnabled),
    };
}

function isQuotaExhausted(stored) {
    const list = stored[STORAGE_KEYS.API_KEYS_LIST] || [];
    const single = stored[STORAGE_KEYS.API_KEY];
    if (list.length === 0) return !single;
    return list.every((entry) => entry?.hasQuotaError);
}

/**
 * Where Chrome keeps the weights.
 *
 * The extension cannot read the disk, and the model is not its file anyway — it belongs
 * to the browser and is shared with everything else that asks for it. This is the
 * folder Chrome uses under the profile directory on each system, which is what a user
 * who wants to see it, or delete it by hand, is actually looking for.
 */
export function localAiModelDirectory() {
    const platform = navigator.userAgentData?.platform || navigator.userAgent;

    if (/win/i.test(platform)) {
        return '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\OptGuideOnDeviceModel';
    }
    if (/mac|darwin/i.test(platform)) {
        return '~/Library/Application Support/Google/Chrome/OptGuideOnDeviceModel';
    }
    return '~/.config/google-chrome/OptGuideOnDeviceModel';
}

/**
 * Stops using the local model and sends the user to where it can be removed.
 *
 * There is no API that deletes the weights: they are the browser's, so the honest thing
 * is to do our half — stop offering it, and let go of it in the selector — and open the
 * page where Chrome manages the model for the other half.
 */
export async function uninstallLocalAi() {
    await setLocalAiEnabled(false);

    const { [STORAGE_KEYS.SELECTED_MODEL]: selected } = await chrome.storage.local.get(STORAGE_KEYS.SELECTED_MODEL);
    if (selected === LOCAL_AI_MODEL_ID) {
        await chrome.storage.local.set({ [STORAGE_KEYS.SELECTED_MODEL]: DEFAULT_REMOTE_MODEL });
    }

    try {
        await chrome.tabs.create({ url: 'chrome://on-device-internals' });
    } catch (error) {
        console.warn('[LocalAI] Could not open the on-device model page:', error);
        return { success: true, openedPage: false };
    }

    return { success: true, openedPage: true };
}

/** Turns the fallback on or off and remembers it. */
export async function setLocalAiEnabled(enabled) {
    localAiEnabled.set(!!enabled);
    await chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: !!enabled });
}

/**
 * Downloads the model.
 *
 * Chrome only starts the download from a gesture the user made, which is why this is
 * called from the button in the modal and not from the code that discovers the model is
 * missing. The session it creates is thrown away: what is wanted is the download, and a
 * session held open reserves memory nobody is using yet.
 *
 * @param {(progress: number) => void} [onProgress] Fraction between 0 and 1.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function installLocalAi(onProgress) {
    const LanguageModel = api();
    if (!LanguageModel?.create) return { success: false, error: 'unsupported' };

    localAiDownloadProgress.set(0);
    localAiStatus.set(LOCAL_AI_STATUS.DOWNLOADING);

    /**
     * Which model gets installed is Chrome's call: it benchmarks the GPU and picks the
     * variant that fits, and there is no name to ask for — the API takes no model id.
     * The one lever a page does have is what it says it will send: asking for a session
     * that takes images and audio is asking for the fuller build rather than the
     * text-only floor, and Chrome downloads whatever serves that. Anything it will not
     * serve is dropped from the request, because asking for it would fail the call
     * instead of downgrading it.
     */
    const expectedInputs = [];
    for (const type of ['image', 'audio']) {
        if (await inputSupported(type)) expectedInputs.push({ type });
    }

    const monitor = (m) => {
        m.addEventListener('downloadprogress', (event) => {
            const progress = typeof event.loaded === 'number' ? event.loaded : 0;
            localAiDownloadProgress.set(progress);
            onProgress?.(progress);
        });
    };

    try {
        let session;
        try {
            const output = await outputOptions();
            session = await LanguageModel.create(
                expectedInputs.length ? { ...output, expectedInputs, monitor } : { ...output, monitor },
            );
        } catch (richError) {
            if (!expectedInputs.length) throw richError;
            // The fuller build was refused after all; the plain one is still worth having.
            console.warn('[LocalAI] Falling back to a text-only session:', richError);
            session = await LanguageModel.create({ ...(await outputOptions()), monitor });
        }
        session?.destroy?.();
        await setLocalAiEnabled(true);
        await refreshLocalAiState();
        return { success: true };
    } catch (error) {
        console.error('[LocalAI] Download failed:', error);
        await refreshLocalAiState();
        return { success: false, error: error?.message || 'download-failed' };
    } finally {
        localAiDownloadProgress.set(null);
    }
}

const TOOL_PROBE_TIMEOUT = 45000;

/**
 * Hands the model a tool and sees whether it calls it.
 *
 * A real inference, because there is no cheaper answer that means anything: a browser
 * without tool support drops the option without a word, and a model that has the
 * support but cannot follow a tool protocol is, for our purposes, a model that cannot
 * run the agent either. Whatever comes out is remembered, so this happens once.
 *
 * @param {{ force?: boolean }} [options] Take the test again instead of reading the
 *        remembered answer.
 */
export async function detectToolSupport({ force = false } = {}) {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.TOOLS);
    if (!force && typeof stored[STORAGE_KEYS.TOOLS] === 'boolean') {
        localAiSupportsTools.set(stored[STORAGE_KEYS.TOOLS]);
        return stored[STORAGE_KEYS.TOOLS];
    }

    const LanguageModel = api();
    if (!LanguageModel?.create) {
        localAiSupportsTools.set(false);
        return false;
    }

    let called = false;
    let session;

    try {
        session = await LanguageModel.create({
            ...(await outputOptions()),
            initialPrompts: [{ role: 'system', content: 'You answer by calling the tools you have been given.' }],
            tools: [
                {
                    name: 'itg_probe',
                    description: 'Returns the secret number. Call it whenever the secret number is asked for.',
                    inputSchema: { type: 'object', properties: {}, required: [] },
                    async execute() {
                        called = true;
                        return JSON.stringify({ number: 41 });
                    },
                },
            ],
        });
        await withTimeout(
            session.prompt('Call the itg_probe tool and tell me the secret number.'),
            TOOL_PROBE_TIMEOUT,
            null,
        );
    } catch (error) {
        console.warn('[LocalAI] Tool probe failed:', error);
    } finally {
        session?.destroy?.();
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.TOOLS]: called });
    localAiSupportsTools.set(called);
    return called;
}

const SYSTEM_PROMPT =
    'You are Intelligent Workspace, an advanced AI browser assistant specializing in managing tab groups, ' +
    'organizing browser tabs, answering user queries, and assisting with web productivity. ' +
    'Answer in the language of the question.';

/**
 * The local model's context is a fraction of the API's, so only the tail of the
 * conversation is carried over. Six turns is what fits comfortably next to a question
 * and its answer.
 */
const MAX_LOCAL_TURNS = 6;

/**
 * Answers a question with the local model.
 *
 * The shape of what comes back matches the API client's on purpose, so the conversation
 * view renders a local answer with the code that renders a remote one.
 *
 * @param {string} query The question.
 * @param {Array<{ role: string, parts: Array<{ text?: string }> }>} [contents] History
 *        in the API's format, as the store already builds it.
 */
export async function promptLocalAi(query, contents = null) {
    const LanguageModel = api();
    if (!LanguageModel?.create) return { success: false, error: 'unsupported' };

    let session;
    try {
        const initialPrompts = [{ role: 'system', content: SYSTEM_PROMPT }];

        if (Array.isArray(contents)) {
            // The last user turn is the question itself and is passed to `prompt()`.
            const history = contents.slice(0, -1).slice(-MAX_LOCAL_TURNS);
            for (const turn of history) {
                const text = (turn.parts || [])
                    .map((part) => part.text || '')
                    .join('')
                    .trim();
                if (!text) continue;
                initialPrompts.push({ role: turn.role === 'model' ? 'assistant' : 'user', content: text });
            }
        }

        session = await LanguageModel.create({ ...(await outputOptions()), initialPrompts });
        const answer = await withTimeout(session.prompt(query), PROMPT_TIMEOUT, null);

        if (!answer) return { success: false, error: 'empty-response' };

        return {
            success: true,
            answer,
            modelVersion: 'chrome-local-ai',
            modelId: 'chrome-local-ai',
            isLocalAi: true,
            groundingMetadata: null,
        };
    } catch (error) {
        console.error('[LocalAI] Prompt failed:', error);
        return { success: false, error: error?.message || 'local-ai-failed' };
    } finally {
        session?.destroy?.();
    }
}

/**
 * One step of the agent, answered locally.
 *
 * The agent's own protocol is JSON in and JSON out — the model names a tool, the worker
 * runs it, the result goes back in — so it needs no `tools` from the API at all. What
 * the tool probe buys is the knowledge that this model can hold a protocol like that in
 * the first place; the loop above it does not change.
 *
 * @param {string} systemPrompt The agent's instructions.
 * @param {Array<{ role: string, parts: Array<{ text?: string }> }>} contents The
 *        conversation so far, in the API's format, ending on the turn to answer.
 */
export async function promptLocalAiAgentStep(systemPrompt, contents) {
    const LanguageModel = api();
    if (!LanguageModel?.create) return { success: false, error: 'unsupported' };

    const turns = (contents || []).map((turn) => ({
        role: turn.role === 'model' ? 'assistant' : 'user',
        content: (turn.parts || [])
            .map((part) => part.text || '')
            .join('')
            .trim(),
    }));
    const last = turns.pop();

    let session;
    try {
        session = await LanguageModel.create({
            ...(await outputOptions()),
            initialPrompts: [{ role: 'system', content: systemPrompt }, ...turns.filter((t) => t.content)],
        });
        const answer = await withTimeout(session.prompt(last?.content || ''), PROMPT_TIMEOUT, null);
        if (!answer) return { success: false, error: 'empty-response' };
        return { success: true, answer, modelVersion: LOCAL_AI_MODEL_ID, isLocalAi: true };
    } catch (error) {
        console.error('[LocalAI] Agent step failed:', error);
        return { success: false, error: error?.message || 'local-ai-failed' };
    } finally {
        session?.destroy?.();
    }
}

/**
 * True when the local model is the engine right now: it was picked in the selector, or
 * the API has nothing left and the fallback is on.
 */
export async function isLocalAiEngine() {
    const stored = await chrome.storage.local.get([
        STORAGE_KEYS.SELECTED_MODEL,
        STORAGE_KEYS.ENABLED,
        STORAGE_KEYS.API_KEY,
        STORAGE_KEYS.API_KEYS_LIST,
    ]);
    if (stored[STORAGE_KEYS.SELECTED_MODEL] === LOCAL_AI_MODEL_ID) return true;
    if (!stored[STORAGE_KEYS.ENABLED]) return false;
    if (!isQuotaExhausted(stored)) return false;
    return (await checkAvailability()) === LOCAL_AI_STATUS.AVAILABLE;
}

/**
 * True when a question that failed against the API should be asked locally instead.
 * Kept as a function rather than read off the store so a caller that has just been told
 * "quota exhausted" is not answered from a store that has yet to hear about it.
 */
export async function shouldFallbackToLocalAi() {
    const stored = await chrome.storage.local.get([
        STORAGE_KEYS.ENABLED,
        STORAGE_KEYS.API_KEY,
        STORAGE_KEYS.API_KEYS_LIST,
    ]);
    if (!stored[STORAGE_KEYS.ENABLED]) return false;
    const status = await checkAvailability();
    localAiStatus.set(status);
    apiQuotaExhausted.set(isQuotaExhausted(stored));
    return status === LOCAL_AI_STATUS.AVAILABLE;
}

let watching = false;

/**
 * Keeps the stores in step with the quota, which is written by the worker as keys are
 * spent. Without this the agent button would stay enabled through the query that
 * exhausted the last key.
 */
export function watchLocalAiState() {
    if (watching) return;
    watching = true;

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEYS.ENABLED]) {
            localAiEnabled.set(!!changes[STORAGE_KEYS.ENABLED].newValue);
        }
        if (changes[STORAGE_KEYS.API_KEYS_LIST] || changes[STORAGE_KEYS.API_KEY]) {
            chrome.storage.local
                .get([STORAGE_KEYS.API_KEY, STORAGE_KEYS.API_KEYS_LIST])
                .then((stored) => apiQuotaExhausted.set(isQuotaExhausted(stored)));
        }
    });

    refreshLocalAiState();
}
