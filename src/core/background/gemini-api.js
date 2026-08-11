/**
 * [AI INSTRUCTION]
 * CENTRALIZED GEMINI API CLIENT
 * Do not duplicate fetch, quota, retry, or key-rotation logic anywhere else!
 * - Use `fetchGeminiResponse` for generic multi-turn, tool-enabled, and attachment calls (used by Omnibar & UI).
 * - Use `fetchGeminiResponseWithContext` for JSON-enforced, low-temperature agentic calls (used by Agent).
 * Both use the internal `_executeGeminiAPI` which correctly manages Google API constraints.
 */

async function fetchAvailableModels() {
    const { geminiApiKey, geminiApiKeysList } = await chrome.storage.local.get(['geminiApiKey', 'geminiApiKeysList']);
    const apiKey =
        geminiApiKey || (geminiApiKeysList && geminiApiKeysList.length > 0 ? geminiApiKeysList[0].key : null);

    if (!apiKey) {
        console.warn('[Gemini] API Key not found for fetching models.');
        return { success: false, error: 'NO_API_KEY' };
    }

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
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
        return { success: false, error: `Network error: ${error.message}` };
    }
}

/**
 * Internal executor that abstracts away token usage tracking, 429 backoff,
 * API Key rotation, and tool-permission fallbacks.
 */
async function _executeGeminiRequest(requestBodyBuilder, options = {}) {
    const { isAgent = false, useSearchTool = false } = options;
    const logPrefix = isAgent ? '[Agent Gemini]' : '[Gemini]';

    const storageData = await chrome.storage.local.get(['geminiApiKeysList', 'geminiApiKey', 'selectedGeminiModel']);
    const activeKey = storageData.geminiApiKey;
    let keysList = storageData.geminiApiKeysList || [];

    if (keysList.length === 0 && activeKey) {
        keysList = [{ key: activeKey }];
    }

    if (keysList.length === 0) {
        console.warn(`${logPrefix} API Key not found.`);
        return { success: false, error: 'NO_API_KEY' };
    }

    let defaultModel = isAgent ? 'gemini-2.0-flash' : 'gemini-2.5-flash';
    let MODEL_NAME = storageData.selectedGeminiModel || defaultModel;

    if (!MODEL_NAME.includes('gemini')) {
        MODEL_NAME = defaultModel;
    }

    let startIndex = keysList.findIndex((k) => k.key === activeKey);
    if (startIndex === -1) startIndex = 0;

    let lastError = 'Unknown error';

    for (let attempt = 0; attempt < keysList.length; attempt++) {
        const currentIndex = (startIndex + attempt) % keysList.length;
        const currentKeyObj = keysList[currentIndex];
        const currentKey = currentKeyObj.key;

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${currentKey}`;

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

                response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });

                if (response.status === 429 && r < retries) {
                    continue;
                }
                break;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
                console.error(`${logPrefix} API Error:`, errorMessage, errorData);

                const isQuotaError =
                    response.status === 429 ||
                    errorMessage.includes('quota') ||
                    errorMessage.includes('RESOURCE_EXHAUSTED') ||
                    errorMessage.includes('exceeded') ||
                    errorMessage.includes('billing');

                const isToolQuotaError =
                    applySearchTool &&
                    (response.status === 403 ||
                        errorMessage.includes('grounding') ||
                        errorMessage.includes('google_search') ||
                        errorMessage.includes('Search Grounding'));

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

                    const existingIndex = updatedKeysList.findIndex((k) => k.key === currentKey);
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

                        await chrome.storage.local.set({ geminiApiKeysList: updatedKeysList });
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
                    error: 'The response was blocked for security reasons.',
                    isToolQuotaError: false,
                    isQuotaError: false,
                };
            }
            return {
                ok: false,
                error: 'No content found in API response.',
                isToolQuotaError: false,
                isQuotaError: false,
            };
        };

        try {
            if (attempt > 0) {
                console.warn(`${logPrefix} Switched active key to index ${currentIndex} due to previous key failure.`);
                await chrome.storage.local.set({ geminiApiKey: currentKey });
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
                    const qeIdx = qeList.findIndex((k) => k.key === currentKey);
                    if (qeIdx !== -1) {
                        qeList[qeIdx].hasQuotaError = true;
                        await chrome.storage.local.set({ geminiApiKeysList: qeList });
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
            return { success: false, error: `Network error: ${error.message}` };
        }
    }

    console.error(`${logPrefix} All available API keys have exhausted their quota.`);
    return { success: false, error: lastError || 'All API keys have exhausted their quota.' };
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
