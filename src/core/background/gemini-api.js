/**
 * [AI INSTRUCTION]
 * CENTRALIZED GEMINI API CLIENT
 * Do not duplicate fetch, quota, retry, or key-rotation logic anywhere else!
 * - Use `fetchGeminiResponse` for generic multi-turn, tool-enabled, and attachment calls (used by Omnibar & UI).
 * - Use `fetchGeminiResponseWithContext` for JSON-enforced, low-temperature agentic calls (used by Agent).
 * Both use the internal `_executeGeminiAPI` which correctly manages Google API constraints.
 */

/**
 * THE KEY GOES IN A HEADER, NEVER IN THE QUERY STRING.
 *
 * The API accepts `?key=…` and that is how these three call sites used to be written. It
 * works, and it is still the wrong place for it: a query string is the part of a request
 * that gets written down — proxy logs, `Referer` headers, crash dumps, the address bar of
 * anyone who copies a failing URL into a bug report — while a header is not. The Chrome Web
 * Store says so as a rule rather than a suggestion ("don't encode data in request headers or
 * query parameters, even over HTTPS"), and Google's own Gemini documentation reaches the
 * same place from the other direction by naming `x-goog-api-key` as the way to send it.
 *
 * The key is the user's own, which is what makes this worth doing rather than shrugging at:
 * it is the credential they pasted in, and leaking it spends their quota, not ours.
 *
 * No preflight is involved. The extension holds `<all_urls>`, so these fetches are made with
 * the extension's own privileges and never become CORS requests, which is why a custom header
 * costs nothing here that it would cost on a web page.
 */
function geminiRequestInit(apiKey, init = {}) {
    return {
        ...init,
        headers: { ...init.headers, 'x-goog-api-key': apiKey },
    };
}

/** The one endpoint used to list models — and, because it is the cheapest call there is, to check a key. */
const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function _obfuscateKey(str) {
    if (!str || typeof str !== 'string') return str;
    if (str.startsWith('enc_')) return str;
    try {
        return 'enc_' + btoa(unescape(encodeURIComponent(str)));
    } catch {
        return str;
    }
}

function _deobfuscateKey(str) {
    if (!str || typeof str !== 'string') return str;
    if (!str.startsWith('enc_')) return str;
    try {
        return decodeURIComponent(escape(atob(str.slice(4))));
    } catch {
        return str;
    }
}

async function fetchAvailableModels() {
    let apiKey = null;
    if (chrome.storage && chrome.storage.session) {
        try {
            const sess = await chrome.storage.session.get(['geminiApiKey', 'geminiApiKeysList']);
            apiKey =
                sess.geminiApiKey ||
                (sess.geminiApiKeysList && sess.geminiApiKeysList.length > 0 ? sess.geminiApiKeysList[0].key : null);
        } catch {}
    }
    if (!apiKey) {
        const { geminiApiKey, geminiApiKeysList } = await chrome.storage.local.get([
            'geminiApiKey',
            'geminiApiKeysList',
        ]);
        apiKey =
            _deobfuscateKey(geminiApiKey) ||
            (geminiApiKeysList && geminiApiKeysList.length > 0 ? _deobfuscateKey(geminiApiKeysList[0].key) : null);
        if (apiKey && chrome.storage && chrome.storage.session) {
            chrome.storage.session.set({ geminiApiKey: apiKey }).catch(() => {});
        }
    }

    if (!apiKey) {
        console.warn('[Gemini] API Key not found for fetching models.');
        return { success: false, error: 'NO_API_KEY' };
    }

    try {
        const response = await fetch(GEMINI_MODELS_URL, geminiRequestInit(apiKey));
        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error?.message || getI18nMsg('httpErrorStatus', [String(response.status)]);
            console.error('[Gemini] API Error fetching models:', errorMessage);
            return { success: false, error: errorMessage };
        }
        const data = await response.json();

        const models = data.models
            .filter(
                (model) =>
                    model.name.includes('gemini') && model.supportedGenerationMethods.includes('generateContent'),
            )
            .map((model) => model.name.replace('models/', ''));

        return { success: true, models };
    } catch (error) {
        console.error('[Gemini] Network or fetch error fetching models:', error);
        return { success: false, error: getI18nMsg('networkErrorDetail', [error.message]) };
    }
}

/**
 * Internal executor that abstracts away token usage tracking, 429 backoff,
 * API Key rotation, and tool-permission fallbacks.
 */
async function _executeGeminiRequest(requestBodyBuilder, options = {}) {
    const { isAgent = false, useSearchTool = false } = options;
    const logPrefix = isAgent ? '[Agent Gemini]' : '[Gemini]';

    let storageData = null;
    if (chrome.storage && chrome.storage.session) {
        try {
            const sess = await chrome.storage.session.get(['geminiApiKeysList', 'geminiApiKey', 'selectedGeminiModel']);
            if (sess.geminiApiKey || (sess.geminiApiKeysList && sess.geminiApiKeysList.length > 0)) {
                storageData = sess;
            }
        } catch {}
    }
    if (!storageData) {
        const localData = await chrome.storage.local.get(['geminiApiKeysList', 'geminiApiKey', 'selectedGeminiModel']);
        storageData = {
            selectedGeminiModel: localData.selectedGeminiModel,
            geminiApiKey: _deobfuscateKey(localData.geminiApiKey),
            geminiApiKeysList: (localData.geminiApiKeysList || []).map((k) => ({
                ...k,
                key: _deobfuscateKey(k.key),
            })),
        };
        if (chrome.storage && chrome.storage.session) {
            chrome.storage.session
                .set({
                    geminiApiKey: storageData.geminiApiKey,
                    geminiApiKeysList: storageData.geminiApiKeysList,
                })
                .catch(() => {});
        }
    }
    const activeKey = storageData.geminiApiKey;
    let keysList = storageData.geminiApiKeysList || [];

    if (keysList.length === 0 && activeKey) {
        keysList = [{ key: activeKey }];
    }

    if (keysList.length === 0) {
        console.warn(`${logPrefix} API Key not found.`);
        // Flagged, not merely reported: the caller may have a local model to fall back
        // on, and "no key" and "no quota left" are the same situation to it.
        return { success: false, error: 'NO_API_KEY', allKeysExhausted: true };
    }

    // The session mirror only carries the keys, so the model picked in the selector is
    // read from local storage; without this every request fell back to the default.
    let selectedModel = storageData.selectedGeminiModel;
    if (!selectedModel) {
        ({ selectedGeminiModel: selectedModel } = await chrome.storage.local.get('selectedGeminiModel'));
    }

    const defaultModel = 'gemini-2.5-flash';
    let MODEL_NAME = selectedModel || defaultModel;

    if (!MODEL_NAME.includes('gemini')) {
        MODEL_NAME = defaultModel;
    }

    let startIndex = keysList.findIndex((k) => k.key === activeKey);
    if (startIndex === -1) startIndex = 0;

    let lastError = getI18nMsg('unknownError');

    for (let attempt = 0; attempt < keysList.length; attempt++) {
        const currentIndex = (startIndex + attempt) % keysList.length;
        const currentKeyObj = keysList[currentIndex];
        const currentKey = currentKeyObj.key;

        const API_URL = `${GEMINI_MODELS_URL}/${MODEL_NAME}:generateContent`;

        const makeRequest = async (applySearchTool) => {
            const requestBody = requestBodyBuilder();

            if (applySearchTool) {
                requestBody['tools'] = [{ google_search: {} }];
                if (typeof logMessage === 'function')
                    logMessage(`${logPrefix} Using 'google_search' tool for model ${MODEL_NAME}`);
            } else {
                if (typeof logMessage === 'function')
                    logMessage(`${logPrefix} Sending request WITHOUT google_search tool for model ${MODEL_NAME}`);
            }

            console.log(`${logPrefix} API Request to model ${MODEL_NAME}:`, requestBody);

            let response;
            let retries = 3;
            let delay = 1500;
            for (let r = 0; r <= retries; r++) {
                if (r > 0) {
                    console.warn(
                        `${logPrefix} Retrying request due to 429 rate limit (attempt ${r + 1}/${retries + 1}). Waiting ${delay}ms...`,
                    );
                    await new Promise((res) => setTimeout(res, delay));
                    delay *= 2;
                }

                response = await fetch(
                    API_URL,
                    geminiRequestInit(currentKey, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody),
                    }),
                );

                if (response.status === 429 && r < retries) {
                    continue;
                }
                break;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                // The API's own text is what the quota checks read; the translated
                // fallback is only for the user when the API said nothing.
                const apiMessage = errorData.error?.message || '';
                const errorMessage = apiMessage || getI18nMsg('httpErrorStatus', [String(response.status)]);
                console.error(`${logPrefix} API Error:`, errorMessage, errorData);

                const isQuotaError =
                    response.status === 429 ||
                    apiMessage.includes('quota') ||
                    apiMessage.includes('RESOURCE_EXHAUSTED') ||
                    apiMessage.includes('exceeded') ||
                    apiMessage.includes('billing');

                const isToolQuotaError =
                    applySearchTool &&
                    (response.status === 403 ||
                        apiMessage.includes('grounding') ||
                        apiMessage.includes('google_search') ||
                        apiMessage.includes('Search Grounding'));

                return { ok: false, error: errorMessage, isToolQuotaError, isQuotaError };
            }

            const data = await response.json();
            console.log(`${logPrefix} API Response from model ${MODEL_NAME}:`, data);
            const parts = data.candidates?.[0]?.content?.parts || [];
            const text =
                parts
                    .map((p) => p.text || '')
                    .join('')
                    .trim() || null;
            const groundingMetadata = applySearchTool
                ? data.candidates?.[0]?.groundingMetadata
                : data.candidates?.[0]?.groundingMetadata || null;

            if (text) {
                try {
                    const tokensConsumed = data.usageMetadata?.totalTokenCount || 0;
                    const now = Date.now();
                    const dayMS = 24 * 60 * 60 * 1000;

                    const updatedStorageData = await chrome.storage.local.get(['geminiApiKeysList']);
                    let updatedKeysList = updatedStorageData.geminiApiKeysList || [];

                    const existingIndex = updatedKeysList.findIndex((k) => _deobfuscateKey(k.key) === currentKey);
                    if (existingIndex !== -1) {
                        if (tokensConsumed > 0) {
                            updatedKeysList[existingIndex].tokensUsed =
                                (updatedKeysList[existingIndex].tokensUsed || 0) + tokensConsumed;
                        }

                        updatedKeysList[existingIndex].queries = updatedKeysList[existingIndex].queries || [];
                        updatedKeysList[existingIndex].queries.push({ timestamp: now, tokens: tokensConsumed });
                        updatedKeysList[existingIndex].queries = updatedKeysList[existingIndex].queries.filter((q) => {
                            const ts = typeof q === 'object' ? q.timestamp : q;
                            return now - ts <= dayMS;
                        });

                        updatedKeysList[existingIndex].lastUsedAt = now;
                        updatedKeysList[existingIndex].hasQuotaError = false;

                        const encodedKeysList = updatedKeysList.map((k) => ({ ...k, key: _obfuscateKey(k.key) }));
                        await chrome.storage.local.set({ geminiApiKeysList: encodedKeysList });
                        if (chrome.storage && chrome.storage.session) {
                            const sessionKeysList = updatedKeysList.map((k) => ({ ...k, key: _deobfuscateKey(k.key) }));
                            await chrome.storage.session.set({ geminiApiKeysList: sessionKeysList }).catch(() => {});
                        }
                    }
                } catch (err) {
                    console.error(`${logPrefix} Error tracking token/query usage:`, err);
                }

                return {
                    ok: true,
                    result: {
                        success: true,
                        answer: text,
                        usageMetadata: data.usageMetadata,
                        modelVersion: MODEL_NAME,
                        modelId: MODEL_NAME,
                        groundingMetadata: groundingMetadata,
                    },
                };
            }

            const blockReason = data.candidates?.[0]?.finishReason;
            if (blockReason === 'SAFETY') {
                return {
                    ok: false,
                    error: getI18nMsg('geminiResponseBlocked'),
                    isToolQuotaError: false,
                    isQuotaError: false,
                };
            }
            return {
                ok: false,
                error: getI18nMsg('geminiResponseEmpty'),
                isToolQuotaError: false,
                isQuotaError: false,
            };
        };

        try {
            if (attempt > 0) {
                console.warn(`${logPrefix} Switched active key to index ${currentIndex} due to previous key failure.`);
                await chrome.storage.local.set({ geminiApiKey: _obfuscateKey(currentKey) });
                if (chrome.storage && chrome.storage.session) {
                    await chrome.storage.session.set({ geminiApiKey: currentKey }).catch(() => {});
                }
            }

            // First attempt
            let req = await makeRequest(useSearchTool);
            if (req.ok) return req.result;

            lastError = req.error;

            // Second attempt (Fallback without tools if permission failed)
            if (useSearchTool && req.isToolQuotaError && !req.isQuotaError) {
                console.warn(`${logPrefix} Retrying without google_search tool due to tool-specific permission error.`);
                req = await makeRequest(false);
                if (req.ok) return req.result;
                lastError = req.error;
            }

            if (req.isQuotaError) {
                console.warn(`${logPrefix} API Key ${currentKey.substring(0, 5)}... exhausted quota. Rotating...`);
                try {
                    const qeStorage = await chrome.storage.local.get(['geminiApiKeysList']);
                    let qeList = qeStorage.geminiApiKeysList || [];
                    const qeIdx = qeList.findIndex((k) => _deobfuscateKey(k.key) === currentKey);
                    if (qeIdx !== -1) {
                        qeList[qeIdx].hasQuotaError = true;
                        const encodedQeList = qeList.map((k) => ({ ...k, key: _obfuscateKey(k.key) }));
                        await chrome.storage.local.set({ geminiApiKeysList: encodedQeList });
                        if (chrome.storage && chrome.storage.session) {
                            const sessionQeList = qeList.map((k) => ({ ...k, key: _deobfuscateKey(k.key) }));
                            await chrome.storage.session.set({ geminiApiKeysList: sessionQeList }).catch(() => {});
                        }
                    }
                } catch (storageErr) {
                    console.error(`${logPrefix} Failed to update API key quota status in storage:`, storageErr);
                }
                continue;
            } else {
                return { success: false, error: req.error };
            }
        } catch (error) {
            console.error(`${logPrefix} Network or fetch error:`, error);
            return { success: false, error: getI18nMsg('networkErrorDetail', [error.message]) };
        }
    }

    console.error(`${logPrefix} All available API keys have exhausted their quota.`);
    return {
        success: false,
        error: lastError || getI18nMsg('geminiAllKeysExhausted'),
        allKeysExhausted: true,
    };
}

/**
 * Main chat / retrieval endpoint. Used for unstructured Q&A.
 */
async function fetchGeminiResponse(query, contentsHistory = null, attachments = []) {
    const requestBodyBuilder = () => {
        let currentContents =
            contentsHistory && Array.isArray(contentsHistory) && contentsHistory.length > 0
                ? contentsHistory
                : [{ role: 'user', parts: [{ text: query }] }];

        if (attachments && attachments.length > 0) {
            const lastIndex = currentContents.length - 1;
            const lastContent = currentContents[lastIndex];
            if (lastContent.role === 'user') {
                const newParts = [...lastContent.parts];
                for (const att of attachments) {
                    const base64Data = att.data.split(',')[1];
                    newParts.push({
                        inline_data: {
                            mime_type: att.mimeType,
                            data: base64Data,
                        },
                    });
                }
                currentContents[lastIndex] = { role: 'user', parts: newParts };
            }
        }

        return {
            system_instruction: {
                parts: [
                    {
                        text: 'You are Intelligent Workspace, an advanced AI browser assistant specializing in managing tab groups, organizing browser tabs, answering user queries, and assisting with web productivity.',
                    },
                ],
            },
            contents: currentContents,
        };
    };

    return await _executeGeminiRequest(requestBodyBuilder, { isAgent: false, useSearchTool: true });
}

/** The id the model selector gives Chrome's local model (see localAiService.js). */
const LOCAL_AI_MODEL_ID = 'chrome-local-ai';

/** The languages the local model will attest an answer in; anything else asks for English. */
const LOCAL_AI_OUTPUT_LANGUAGES = ['de', 'en', 'es', 'fr', 'ja'];

const LOCAL_AI_SYSTEM_PROMPT =
    'You are Intelligent Workspace, an advanced AI browser assistant specializing in managing tab groups, ' +
    'organizing browser tabs, answering user queries, and assisting with web productivity. ' +
    'Answer in the language of the question.';

/**
 * Asks Chrome's local model from the worker.
 *
 * The Prompt API exists only in documents, so the question goes through the offscreen
 * document; the answer comes back in the same shape as an API one.
 */
async function fetchLocalAiResponse(query) {
    try {
        const stored = await chrome.storage.local.get(ItgLanguages.STORAGE_KEY);
        const lang = String(ItgLanguages.pickLanguage(stored?.[ItgLanguages.STORAGE_KEY]) || 'en')
            .split('-')[0]
            .toLowerCase();
        await ensureOffscreenDocument('Answer a scheduled query with the on-device model', ['WORKERS']);
        const response = await chrome.runtime.sendMessage({
            action: 'offscreenLocalAiPrompt',
            query,
            systemPrompt: LOCAL_AI_SYSTEM_PROMPT,
            language: LOCAL_AI_OUTPUT_LANGUAGES.includes(lang) ? lang : 'en',
            timeoutMs: 120000,
        });
        if (response?.success) {
            return {
                success: true,
                answer: response.answer,
                modelVersion: LOCAL_AI_MODEL_ID,
                modelId: LOCAL_AI_MODEL_ID,
                isLocalAi: true,
                groundingMetadata: null,
            };
        }
        await loadI18nMessages();
        const code = response?.error;
        const LOCAL_AI_ERROR_KEYS = {
            unsupported: 'localAiErrorUnsupported',
            unavailable: 'localAiErrorNotEligible',
            downloadable: 'localAiStatusDownloadable',
            downloading: 'localAiStatusDownloading',
            'empty-response': 'localAiErrorEmpty',
        };
        const key = LOCAL_AI_ERROR_KEYS[code] || 'localAiErrorGeneric';
        if (key === 'localAiErrorGeneric') console.error('[LocalAI] Scheduled prompt failed:', code);
        return { success: false, error: getI18nMsg(key) || code || getI18nMsg('unknownError') };
    } catch (error) {
        console.error('[LocalAI] Scheduled prompt failed:', error);
        await loadI18nMessages().catch(() => {});
        return { success: false, error: getI18nMsg('localAiErrorGeneric') || String(error?.message || error) };
    } finally {
        // Shared with the Pomodoro chimes: left open only while something still uses it.
        if (!(await isMusicPlayingOffscreen())) await chrome.offscreen.closeDocument().catch(() => {});
    }
}

/**
 * A scheduled query, answered by whichever model the selector has on now: the local one
 * when it is picked, the chosen Gemini model otherwise — and the local one again when
 * the keys have nothing left and the user turned the fallback on, as in the panel.
 */
async function fetchScheduledGeminiResponse(query) {
    const { selectedGeminiModel, localAiEnabled } = await chrome.storage.local.get([
        'selectedGeminiModel',
        'localAiEnabled',
    ]);
    if (selectedGeminiModel === LOCAL_AI_MODEL_ID) return fetchLocalAiResponse(query);
    const response = await fetchGeminiResponse(query);
    if (!response.success && response.allKeysExhausted && localAiEnabled) return fetchLocalAiResponse(query);
    return response;
}

/**
 * Agent endpoint. Enforces JSON parsing and provides context explicitly.
 */
async function fetchGeminiResponseWithContext(systemPrompt, contents) {
    const requestBodyBuilder = () => {
        return {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
            },
        };
    };

    return await _executeGeminiRequest(requestBodyBuilder, { isAgent: true, useSearchTool: false });
}
