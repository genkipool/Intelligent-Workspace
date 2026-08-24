import { writable, derived, get } from 'svelte/store';
import { saveGeminiEntryToDb, getAllGeminiEntriesFromDb, deleteGeminiEntryFromDb } from '../../utils/db.js';
import { showNotification, getCurrentLang, loadMessages } from '../../utils/i18n.js';
import { handleAgentQuery, setSendButtonBusy, cancelAgentQuery } from '../../utils/agent-ui.js';
import { parseMarkdown } from '../content-renderer/content-renderer.js';
import { LOCAL_AI_MODEL_ID } from '../services/localAiService.js';
import {
    isGeminiViewActive as appIsGeminiViewActive,
    currentlySpeakingEntryId as noteSpeakingEntryId,
    isSpeechPaused as noteSpeechPaused,
    speechKeepAliveInterval as noteKeepAliveInterval,
} from './appStore.svelte.js';
import {
    createUtterance,
    startKeepAlive,
    stopKeepAlive,
    splitIntoSpeechChunks,
    cancelSpeech,
} from '../services/speechService.js';

const STORAGE_KEYS = {
    API_KEY: 'geminiApiKey',
    GEMINI_SCHEDULES: 'geminiSchedules',
    PERSISTENT_GEMINI: 'persistentGeminiConversationIds',
    GEMINI_SESSION_CONVERSATIONS: 'geminiSessionConversations',
};

export const MAX_GEMINI_SCHEDULES = 7;

/** Speaker id used when the controls bar reads the whole conversation instead of one entry. */
export const CONVERSATION_SPEECH_ID = '__conversation__';

/**
 * The notes reader keeps the state of its buttons in the DOM. When the assistant takes
 * the synthesizer over, that state has to be released or a note button stays lit with
 * nothing being read.
 */
function releaseDomReaders() {
    document.querySelectorAll('.read-aloud-btn.reading').forEach((btn) => {
        btn.classList.remove('reading', 'paused', 'ctrl-held');
        btn.setAttribute('data-i18n-title', 'readAloud');
    });
    const interval = get(noteKeepAliveInterval);
    if (interval) {
        clearInterval(interval);
        noteKeepAliveInterval.set(null);
    }
    noteSpeakingEntryId.set(null);
    noteSpeechPaused.set(false);
}

function createGeminiStore() {
    const state = writable({
        isViewActive: false,
        isStandaloneGemini: false,
        conversationHistory: [],
        combinedConversations: [],
        currentCombinedIndex: -1,
        persistentConversations: [],
        sessionConversations: [],
        selectedModel: 'gemini-2.5-flash',
        availableModels: [],
        modelDropdown: null,
        agentModeEnabled: false,
        pendingAttachments: [],
        isGlobalPlaybackActive: false,
        globalPlaybackChunks: [],
        currentGlobalChunkIndex: 0,
        currentlySpeakingEntryId: null,
        isSpeechPaused: false,
        speechKeepAliveInterval: null,
        calCurrentDate: new Date(),
        calSelectedDate: null,
        scheduleEditorState: { mode: 'add', scheduleIndex: -1 },
        isInitialized: false,
        _returnToMainView: false,
    });

    const { subscribe, update, set } = state;

    // The appStore flag is the source of truth for this view's visibility (the
    // services read and write it). It is mirrored here so GeminiPanel and
    // toggleView work no matter how the view was activated.
    appIsGeminiViewActive.subscribe((active) => {
        if (get(state).isViewActive !== active) {
            update((st) => ({ ...st, isViewActive: active }));
        }
    });

    async function updateCombinedConversationDisplay() {
        const s = get(state);
        const { [STORAGE_KEYS.PERSISTENT_GEMINI]: persistentIds = [] } = await chrome.storage.local.get(
            STORAGE_KEYS.PERSISTENT_GEMINI,
        );
        let finalPersistentConversations = [];
        if (persistentIds.length > 0) {
            const allEntries = await getAllGeminiEntriesFromDb();
            const persistentIdSet = new Set(persistentIds);
            const allPersistentEntries = allEntries.filter(
                (entry) => persistentIdSet.has(entry.id) && entry.isPersistent,
            );
            const groupedByTitle = allPersistentEntries.reduce((acc, entry) => {
                const title = entry.persistentTitle || 'Untitled';
                if (!acc[title]) acc[title] = [];
                acc[title].push(entry);
                return acc;
            }, {});
            finalPersistentConversations = Object.entries(groupedByTitle).map(([title, entries]) => ({
                title,
                entries: entries.sort((a, b) => a.id - b.id),
                timestamp: Math.max(...entries.map((e) => e.id)),
                isTemporary: false,
            }));
        }

        const combined = [...finalPersistentConversations, ...s.sessionConversations].sort(
            (a, b) => b.timestamp - a.timestamp,
        );

        let currentCombinedIndex = s.currentCombinedIndex;
        if (s.conversationHistory.length > 0) {
            const currentId = s.conversationHistory[0].id;
            currentCombinedIndex = combined.findIndex(
                (conv) => conv.entryIds?.includes(currentId) || conv.entries?.some((e) => e.id === currentId),
            );
        } else {
            currentCombinedIndex = -1;
        }

        update((st) => ({
            ...st,
            persistentConversations: finalPersistentConversations,
            combinedConversations: combined,
            currentCombinedIndex,
        }));
    }

    /**
     * Puts an answer onto the entry that asked for it.
     *
     * Shared by a new question and by a resend, so both finish the same way. The entry
     * is replaced rather than written into: the view is keyed on these objects, and
     * mutating one left the answer invisible.
     *
     * @param {number} entryId
     * @param {object} response what the assistant sent back
     * @param {{fallback?: object}} options `fallback` is the entry to put back when the
     *   call fails; without one the entry is dropped, which is right for a question that
     *   never got an answer but wrong for a resend, where the card was already there.
     */
    async function applyGeminiAnswer(entryId, response, { fallback = null } = {}) {
        setSendButtonBusy(false);
        const current = get(state).conversationHistory.find((e) => e.id === entryId);
        if (!current) return;

        let errorMsg = '';
        if (chrome.runtime.lastError) {
            errorMsg = chrome.runtime.lastError.message || 'Connection error';
        } else if (!response || response.error) {
            errorMsg = response && response.error ? response.error : 'Unknown error connecting to AI';
        }

        if (errorMsg) {
            // The API is out: either every key is spent or there is no key at all. If
            // the user installed Chrome's local model for exactly this, the question is
            // answered by it instead of being thrown away with a red message.
            const localAnswer = await answerWithLocalAi(current, entryId, response);
            if (localAnswer) {
                response = localAnswer;
                errorMsg = '';
            }
        }

        if (errorMsg) {
            if (fallback) {
                const restored = { ...fallback, isLoading: false };
                update((st) => ({
                    ...st,
                    conversationHistory: st.conversationHistory.map((e) => (e.id === entryId ? restored : e)),
                }));
                await saveGeminiEntryToDb(restored);
            } else {
                update((st) => ({
                    ...st,
                    conversationHistory: st.conversationHistory.filter((e) => e.id !== entryId),
                }));
                await deleteGeminiEntryFromDb(entryId);
            }
            chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });
            // The reason has to be shown: a quota or connection error used to leave the
            // question simply vanishing with no explanation.
            const { showErrorView } = await import('../services/viewsService.js');
            showErrorView(errorMsg);
            return;
        }

        const answered = { ...current, isLoading: false, data: response };
        update((st) => ({
            ...st,
            conversationHistory: st.conversationHistory.map((e) => (e.id === answered.id ? answered : e)),
        }));
        await saveGeminiEntryToDb(answered);
        chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });
    }

    /**
     * Chrome's local model, when the API has nothing left to give.
     *
     * Only the two failures the local engine is a genuine answer to are caught here —
     * quota gone and no key — so a blocked answer or a broken network still says so
     * rather than being quietly replaced by a smaller model's guess.
     *
     * @returns {Promise<object|null>} A response in the API client's shape, or null.
     */
    async function answerWithLocalAi(entry, entryId, response) {
        if (!entry?.query) return null;
        const exhausted = response?.allKeysExhausted || response?.error === 'NO_API_KEY';
        if (!exhausted) return null;

        const { shouldFallbackToLocalAi, promptLocalAi } = await import('../services/localAiService.js');
        if (!(await shouldFallbackToLocalAi())) return null;

        const result = await promptLocalAi(entry.query, buildGeminiHistoryContents(entryId));
        if (!result.success) return null;

        // The selector says who is answering. Falling back without moving it left the
        // panel claiming a Gemini model wrote what the local one did.
        await chrome.storage.local.set({ selectedGeminiModel: LOCAL_AI_MODEL_ID });
        update((st) => ({ ...st, selectedModel: LOCAL_AI_MODEL_ID }));
        return result;
    }

    /**
     * The local engine as a choice rather than as a rescue: the model selector lists it
     * whenever it is installed, and picking it sends the question straight there.
     *
     * @returns {Promise<object|null>} A response in the API client's shape, or null when
     *          the selected model is a remote one.
     */
    async function answerWithSelectedLocalAi(query, entryId) {
        if (get(state).selectedModel !== LOCAL_AI_MODEL_ID) return null;
        const { promptLocalAi } = await import('../services/localAiService.js');
        return await promptLocalAi(query, buildGeminiHistoryContents(entryId));
    }

    function buildGeminiHistoryContents(targetEntryId) {
        const s = get(state);
        const contents = [];
        for (const entry of s.conversationHistory) {
            if (entry.query && typeof entry.query === 'string') {
                if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
                    contents.push({ role: 'user', parts: [{ text: entry.query }] });
                    if (
                        entry.data &&
                        entry.data.answer &&
                        typeof entry.data.answer === 'string' &&
                        entry.id !== targetEntryId
                    ) {
                        contents.push({ role: 'model', parts: [{ text: entry.data.answer }] });
                    }
                }
            }
            if (entry.id === targetEntryId) break;
        }
        return contents;
    }

    /** Removes a session (temporary) conversation and the entries only it referenced. */
    async function deleteSessionConversation(timestamp) {
        const current = get(state);
        const target = current.sessionConversations.find((c) => c.timestamp === timestamp);
        if (!target) return;

        const remaining = current.sessionConversations.filter((c) => c.timestamp !== timestamp);
        const stillReferenced = new Set(remaining.flatMap((c) => c.entryIds || []));
        for (const id of target.entryIds || []) {
            if (!stillReferenced.has(id)) await deleteGeminiEntryFromDb(id);
        }

        // The combined list is cached separately and is what the UI reads, so it has to
        // be recomputed here or the deleted row stays on screen.
        update((st) => ({
            ...st,
            sessionConversations: remaining,
            combinedConversations: [...st.persistentConversations, ...remaining].sort(
                (a, b) => b.timestamp - a.timestamp,
            ),
        }));
        await chrome.storage.session.set({ [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: remaining });
    }

    async function deletePersistentConversationByTitle(title) {
        const s = get(state);
        const convToDelete = s.persistentConversations.find((c) => c.title === title && !c.isTemporary);
        if (!convToDelete) return;

        const idsToDelete = convToDelete.entries.map((e) => e.id);
        await Promise.all(idsToDelete.map((id) => deleteGeminiEntryFromDb(id)));

        const { [STORAGE_KEYS.PERSISTENT_GEMINI]: currentIds = [] } = await chrome.storage.local.get(
            STORAGE_KEYS.PERSISTENT_GEMINI,
        );
        const pSet = new Set(currentIds);
        idsToDelete.forEach((id) => pSet.delete(id));
        await chrome.storage.local.set({ [STORAGE_KEYS.PERSISTENT_GEMINI]: Array.from(pSet) });

        update((st) => ({
            ...st,
            persistentConversations: st.persistentConversations.filter((c) => c.title !== title),
        }));

        const s2 = get(state);
        if (s2.conversationHistory.length > 0 && s2.conversationHistory[0]?.persistentTitle === title) {
            update((st) => ({
                ...st,
                conversationHistory: [],
                currentCombinedIndex: -1,
            }));
        }

        showNotification('conversationDeleted');
        await updateCombinedConversationDisplay();
    }

    return {
        subscribe,

        init: async () => {
            const s = get(state);
            if (s.isInitialized) return;

            const data = await chrome.storage.local.get('selectedGeminiModel');
            const selectedModel = data.selectedGeminiModel || 'gemini-2.5-flash';

            const sessionData = await chrome.storage.session.get(STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS);
            const sessionConversations = sessionData[STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS] || [];

            let conversationHistory = [];
            let currentSessionConversationIndex = -1;

            if (sessionConversations.length > 0) {
                currentSessionConversationIndex = sessionConversations.length - 1;
                const activeConversation = sessionConversations[currentSessionConversationIndex];
                const validIds = new Set(activeConversation.entryIds);
                const allEntries = await getAllGeminiEntriesFromDb();
                const sessionEntries = allEntries.filter((entry) => validIds.has(entry.id));
                conversationHistory = sessionEntries.sort((a, b) => a.id - b.id);
            }

            const { [STORAGE_KEYS.PERSISTENT_GEMINI]: persistentIds = [] } = await chrome.storage.local.get(
                STORAGE_KEYS.PERSISTENT_GEMINI,
            );
            let persistentConversations = [];
            if (persistentIds.length > 0) {
                const allEntries = await getAllGeminiEntriesFromDb();
                const persistentIdSet = new Set(persistentIds);
                const allPersistentEntries = allEntries.filter(
                    (entry) => persistentIdSet.has(entry.id) && entry.isPersistent,
                );
                const groupedByTitle = allPersistentEntries.reduce((acc, entry) => {
                    const title = entry.persistentTitle || 'Untitled';
                    if (!acc[title]) acc[title] = [];
                    acc[title].push(entry);
                    return acc;
                }, {});
                persistentConversations = Object.entries(groupedByTitle).map(([title, entries]) => ({
                    title,
                    entries: entries.sort((a, b) => a.id - b.id),
                    timestamp: Math.max(...entries.map((e) => e.id)),
                    isTemporary: false,
                }));
            }

            const combinedConversations = [...persistentConversations, ...sessionConversations].sort(
                (a, b) => b.timestamp - a.timestamp,
            );

            const currentCombinedIndex = combinedConversations.findIndex(
                (conv) =>
                    conv.entryIds?.includes(conversationHistory[0]?.id) ||
                    conv.entries?.some((e) => e.id === conversationHistory[0]?.id),
            );

            const agentData = await chrome.storage.local.get('geminiAgentModeEnabled');
            const agentModeEnabled = !!agentData.geminiAgentModeEnabled;

            update((st) => ({
                ...st,
                selectedModel,
                sessionConversations,
                conversationHistory,
                persistentConversations,
                combinedConversations,
                currentCombinedIndex,
                agentModeEnabled,
                isInitialized: true,
            }));
        },

        initializeModelSelector: async () => {
            const data = await chrome.storage.local.get('selectedGeminiModel');
            let selectedModel = data.selectedGeminiModel || 'gemini-2.5-flash';

            const { checkAvailability, LOCAL_AI_STATUS } = await import('../services/localAiService.js');
            const localInstalled = (await checkAvailability()) === LOCAL_AI_STATUS.AVAILABLE;

            let remoteModels = null;
            try {
                const response = await chrome.runtime.sendMessage({ action: 'getAvailableGeminiModels' });
                if (response && response.success) {
                    remoteModels = response.models
                        .filter((m) => m.includes('gemini'))
                        .sort((a, b) => b.localeCompare(a));
                }
            } catch {
                remoteModels = null;
            }

            // The local model is one more line in the list, at the end: it is the one
            // that answers when the others cannot, and that is where the eye ends up.
            const availableModels = [...(remoteModels || []), ...(localInstalled ? [LOCAL_AI_MODEL_ID] : [])];

            if (availableModels.length === 0) {
                // Nothing was reachable — a key that failed, no key at all. Keep whatever
                // was chosen rather than pretending the list is empty.
                update((st) => ({ ...st, selectedModel, availableModels: [selectedModel] }));
                return;
            }

            if (!availableModels.includes(selectedModel)) {
                // With no Gemini model on offer and the local one installed, the local one
                // is not a fallback any more: it is the only thing that can answer.
                selectedModel = remoteModels?.length ? 'gemini-2.5-flash' : LOCAL_AI_MODEL_ID;
                await chrome.storage.local.set({ selectedGeminiModel: selectedModel });
            }

            update((st) => ({ ...st, selectedModel, availableModels }));
        },

        setSelectedModel: async (model) => {
            await chrome.storage.local.set({ selectedGeminiModel: model });
            update((st) => ({ ...st, selectedModel: model }));
        },

        cycleModel: async (direction) => {
            const s = get(state);
            if (s.availableModels.length <= 1) return;
            const currentIndex = s.availableModels.indexOf(s.selectedModel);
            let nextIndex;
            if (direction === 'next') {
                nextIndex = (currentIndex + 1) % s.availableModels.length;
            } else {
                nextIndex = (currentIndex - 1 + s.availableModels.length) % s.availableModels.length;
            }
            const newModel = s.availableModels[nextIndex];
            await chrome.storage.local.set({ selectedGeminiModel: newModel });
            update((st) => ({ ...st, selectedModel: newModel }));
        },

        switchToView: async () => {
            update((st) => ({ ...st, isViewActive: true }));
            appIsGeminiViewActive.set(true);
        },

        closeView: async (isSwitchingView = false) => {
            cancelAgentQuery();
            cancelSpeech();
            geminiStore.resetGlobalSpeechState();
            update((st) => ({
                ...st,
                isViewActive: false,
                _returnToMainView: !isSwitchingView,
            }));
            appIsGeminiViewActive.set(false);
        },

        toggleView: async () => {
            const s = get(state);
            if (s.isViewActive) {
                await geminiStore.closeView();
            } else {
                await geminiStore.switchToView();
            }
        },

        handleQuery: async (query) => {
            if (!query) return;

            let s = get(state);

            if (s.agentModeEnabled) {
                const currentAttachments = [...s.pendingAttachments];
                update((st) => ({ ...st, pendingAttachments: [] }));
                await handleAgentQuery(query, currentAttachments);
                return;
            }

            const isContinuingPersistent =
                s.currentCombinedIndex > -1 &&
                s.combinedConversations[s.currentCombinedIndex] &&
                !s.combinedConversations[s.currentCombinedIndex].isTemporary;

            let persistentTitle = '';
            if (isContinuingPersistent) {
                persistentTitle = s.combinedConversations[s.currentCombinedIndex].title;
            }

            // The attachments belong to the question, so they are kept on the entry and
            // shown next to it; before this they were sent and then forgotten.
            const attachmentsForEntry = get(state).pendingAttachments.map(({ name, mimeType }) => ({ name, mimeType }));

            const newEntry = {
                id: Date.now() + Math.random(),
                query,
                data: null,
                isLoading: true,
                isPersistent: isContinuingPersistent,
                persistentTitle,
                attachments: attachmentsForEntry,
            };

            await saveGeminiEntryToDb(newEntry);

            if (isContinuingPersistent) {
                const s2 = get(state);
                const persistentConv = s2.persistentConversations.find((c) => c.title === persistentTitle);
                if (persistentConv) {
                    persistentConv.entries.push(newEntry);
                    const { [STORAGE_KEYS.PERSISTENT_GEMINI]: currentIds = [] } = await chrome.storage.local.get(
                        STORAGE_KEYS.PERSISTENT_GEMINI,
                    );
                    const pSet = new Set(currentIds);
                    pSet.add(newEntry.id);
                    await chrome.storage.local.set({ [STORAGE_KEYS.PERSISTENT_GEMINI]: Array.from(pSet) });
                }
                update((st) => ({
                    ...st,
                    conversationHistory: [...st.conversationHistory, newEntry],
                    isViewActive: true,
                }));
            } else {
                const isContinuingTemporary =
                    s.currentCombinedIndex > -1 && s.combinedConversations[s.currentCombinedIndex]?.isTemporary;

                if (isContinuingTemporary) {
                    const s2 = get(state);
                    const activeSessionConv = s2.sessionConversations.find(
                        (c) => c.timestamp === s2.combinedConversations[s2.currentCombinedIndex].timestamp,
                    );
                    if (activeSessionConv) {
                        activeSessionConv.entryIds.push(newEntry.id);
                    }
                } else {
                    const title = query.substring(0, 40) + (query.length > 40 ? '...' : '');
                    const newSessionConv = {
                        title,
                        entryIds: [newEntry.id],
                        timestamp: Date.now(),
                        isTemporary: true,
                    };
                    update((st) => ({
                        ...st,
                        sessionConversations: [...st.sessionConversations, newSessionConv],
                    }));
                }

                const s2 = get(state);
                await chrome.storage.session.set({
                    [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: s2.sessionConversations,
                });

                update((st) => ({
                    ...st,
                    conversationHistory: [...st.conversationHistory, newEntry],
                    isViewActive: true,
                }));
            }

            // The question just gave the conversation a name and a place in the list, so
            // the selector has to be told about it: until this ran, a brand new
            // conversation stayed nameless and the button kept saying "select one".
            await updateCombinedConversationDisplay();

            chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });

            setSendButtonBusy(true);

            const s2 = get(state);
            const currentAttachments = [...s2.pendingAttachments];
            update((st) => ({ ...st, pendingAttachments: [] }));

            try {
                const localResponse = await answerWithSelectedLocalAi(query, newEntry.id);
                if (localResponse) {
                    await applyGeminiAnswer(newEntry.id, localResponse);
                    return;
                }

                chrome.runtime.sendMessage(
                    {
                        action: 'searchGemini',
                        query,
                        contents: buildGeminiHistoryContents(newEntry.id),
                        attachments: currentAttachments,
                    },
                    (response) => applyGeminiAnswer(newEntry.id, response),
                );
            } catch (e) {
                setSendButtonBusy(false);
                console.error('Error sending Gemini query:', e);
            }
        },

        archiveCurrentConversationIfNeeded: async () => {
            const s = get(state);
            if (s.conversationHistory.length === 0) return;

            const currentFirstEntryId = s.conversationHistory[0].id;
            const isAlreadyArchived = s.combinedConversations.some(
                (conv) =>
                    (conv.entryIds && conv.entryIds.includes(currentFirstEntryId)) ||
                    (conv.entries && conv.entries.some((e) => e.id === currentFirstEntryId)),
            );
            if (isAlreadyArchived) return;

            const firstQuestion = s.conversationHistory[0]?.query || 'Conversation';
            const title = firstQuestion.substring(0, 40) + (firstQuestion.length > 40 ? '...' : '');

            const newSessionConv = {
                title,
                entryIds: s.conversationHistory.map((entry) => entry.id),
                timestamp: Date.now(),
                isTemporary: true,
            };

            update((st) => ({
                ...st,
                sessionConversations: [...st.sessionConversations, newSessionConv],
            }));

            const s2 = get(state);
            await chrome.storage.session.set({
                [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: s2.sessionConversations,
            });
            await updateCombinedConversationDisplay();
        },

        /** Rebuilds the conversation list the picker and its label are drawn from. */
        refreshConversations: async () => {
            await updateCombinedConversationDisplay();
        },

        /** @param {Array<object>} list */
        setSessionConversations: (list) => {
            update((st) => ({ ...st, sessionConversations: Array.isArray(list) ? list : [] }));
        },

        /** @param {Array<object>} list */
        setPersistentConversations: (list) => {
            update((st) => ({ ...st, persistentConversations: Array.isArray(list) ? list : [] }));
        },

        /** @param {Array<object>} list */
        setCombinedConversations: (list) => {
            update((st) => ({ ...st, combinedConversations: Array.isArray(list) ? list : [] }));
        },

        /** @param {number} index */
        setCurrentCombinedIndex: (index) => {
            update((st) => ({ ...st, currentCombinedIndex: index }));
        },

        /**
         * Replaces the entries on screen.
         *
         * The conversation view renders this store and nothing else, so the imperative
         * side of the assistant writes its history through here instead of keeping a
         * second one of its own.
         *
         * @param {Array<object>} entries
         */
        setConversationHistory: (entries) => {
            update((st) => ({ ...st, conversationHistory: Array.isArray(entries) ? entries : [] }));
        },

        newConversation: async () => {
            await geminiStore.archiveCurrentConversationIfNeeded();
            update((st) => ({
                ...st,
                conversationHistory: [],
                currentCombinedIndex: -1,
            }));
            await updateCombinedConversationDisplay();
        },

        saveConversation: async (title) => {
            const s = get(state);
            if (s.conversationHistory.length === 0) {
                showNotification('errorEmptyConversation', true);
                return;
            }
            const savedEntryIds = s.conversationHistory.map((entry) => entry.id);
            const updatePromises = s.conversationHistory.map((entry) => {
                const updatedEntry = { ...entry, isPersistent: true, persistentTitle: title };
                return saveGeminiEntryToDb(updatedEntry);
            });
            await Promise.all(updatePromises);

            const { [STORAGE_KEYS.PERSISTENT_GEMINI]: currentIds = [] } = await chrome.storage.local.get(
                STORAGE_KEYS.PERSISTENT_GEMINI,
            );
            const pSet = new Set(currentIds);
            savedEntryIds.forEach((id) => pSet.add(id));
            await chrome.storage.local.set({ [STORAGE_KEYS.PERSISTENT_GEMINI]: Array.from(pSet) });

            const s2 = get(state);
            const sessionConvIndex = s2.sessionConversations.findIndex((conv) =>
                conv.entryIds.includes(savedEntryIds[0]),
            );
            if (sessionConvIndex > -1) {
                s2.sessionConversations.splice(sessionConvIndex, 1);
                await chrome.storage.session.set({
                    [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: s2.sessionConversations,
                });
            }

            showNotification('conversationSaved');
            await updateCombinedConversationDisplay();
        },

        loadConversation: async (conversation) => {
            await geminiStore.archiveCurrentConversationIfNeeded();

            if (conversation.isScheduled && !conversation.isRead) {
                const s = get(state);
                const sessionConv = s.sessionConversations.find((c) => c.timestamp === conversation.timestamp);
                if (sessionConv) {
                    sessionConv.isRead = true;
                    await chrome.storage.session.set({
                        [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: s.sessionConversations,
                    });
                }
            }

            // A saved conversation carries its entries; a session one only carries their
            // ids. Going by the ids whenever the entries are missing keeps a conversation
            // from opening empty just because it was not flagged as temporary.
            let history;
            if (Array.isArray(conversation.entries) && conversation.entries.length > 0) {
                history = conversation.entries;
            } else {
                const entryIds = new Set(conversation.entryIds || []);
                const allEntries = await getAllGeminiEntriesFromDb();
                history = allEntries.filter((e) => entryIds.has(e.id)).sort((a, b) => a.id - b.id);
            }

            const s2 = get(state);
            // By timestamp first, then by name: a saved conversation's timestamp is the
            // id of its newest entry, so it moves as the conversation grows.
            let currentCombinedIndex = s2.combinedConversations.findIndex(
                (c) => c.timestamp === conversation.timestamp,
            );
            if (currentCombinedIndex === -1) {
                currentCombinedIndex = s2.combinedConversations.findIndex((c) => c.title === conversation.title);
            }

            update((st) => ({
                ...st,
                conversationHistory: history,
                currentCombinedIndex,
                isViewActive: true,
            }));
        },

        cycleConversation: async (direction) => {
            const s = get(state);
            if (s.combinedConversations.length === 0) return;
            await geminiStore.archiveCurrentConversationIfNeeded();

            let newIndex;
            if (s.currentCombinedIndex === -1) {
                newIndex = 0;
            } else if (direction === 'next') {
                newIndex = (s.currentCombinedIndex + 1) % s.combinedConversations.length;
            } else {
                newIndex =
                    (s.currentCombinedIndex - 1 + s.combinedConversations.length) % s.combinedConversations.length;
            }

            const conversationToLoad = s.combinedConversations[newIndex];
            await geminiStore.loadConversation(conversationToLoad);
        },

        deleteEntry: async (entryId) => {
            await deleteGeminiEntryFromDb(entryId);

            // The entry also has to leave the conversations that list it, and a
            // conversation left with no entries is gone.
            const s = get(state);
            let changed = false;
            const sessionConversations = s.sessionConversations
                .map((conv) => {
                    const newIds = (conv.entryIds || []).filter((id) => id !== entryId);
                    if (newIds.length !== (conv.entryIds || []).length) changed = true;
                    return { ...conv, entryIds: newIds };
                })
                .filter((conv) => conv.entryIds.length > 0);

            const persistentConversations = s.persistentConversations
                .map((conv) => ({ ...conv, entries: (conv.entries || []).filter((e) => e.id !== entryId) }))
                .filter((conv) => conv.entries.length > 0);

            const conversationHistory = s.conversationHistory.filter((e) => e.id !== entryId);

            // One update for the whole removal: writing the history twice made the view
            // rebuild itself in between, and putting the conversation list in the history
            // — which is what used to happen when it emptied — painted cards out of it.
            update((st) => ({
                ...st,
                conversationHistory,
                sessionConversations,
                persistentConversations,
                currentCombinedIndex: conversationHistory.length === 0 ? -1 : st.currentCombinedIndex,
            }));

            if (changed) {
                await chrome.storage.session.set({
                    [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: sessionConversations,
                });
            }

            const { [STORAGE_KEYS.PERSISTENT_GEMINI]: currentIds = [] } = await chrome.storage.local.get(
                STORAGE_KEYS.PERSISTENT_GEMINI,
            );
            if (currentIds.includes(entryId)) {
                await chrome.storage.local.set({
                    [STORAGE_KEYS.PERSISTENT_GEMINI]: currentIds.filter((id) => id !== entryId),
                });
            }

            chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });
        },

        deleteConversation: async () => {
            const s = get(state);
            if (s.conversationHistory.length === 0 || s.currentCombinedIndex === -1) {
                showNotification('errorNoConversationToDelete', true);
                return;
            }

            const conversationToDelete = s.combinedConversations[s.currentCombinedIndex];
            if (!conversationToDelete) return;

            const idsToDelete = s.conversationHistory.map((entry) => entry.id);
            await Promise.all(idsToDelete.map((id) => deleteGeminiEntryFromDb(id)));

            if (conversationToDelete.isTemporary) {
                update((st) => ({
                    ...st,
                    sessionConversations: st.sessionConversations.filter(
                        (c) => c.timestamp !== conversationToDelete.timestamp,
                    ),
                }));
                const s2 = get(state);
                await chrome.storage.session.set({
                    [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: s2.sessionConversations,
                });
            } else {
                update((st) => ({
                    ...st,
                    persistentConversations: st.persistentConversations.filter(
                        (c) => c.title !== conversationToDelete.title,
                    ),
                }));
                const { [STORAGE_KEYS.PERSISTENT_GEMINI]: currentIds = [] } = await chrome.storage.local.get(
                    STORAGE_KEYS.PERSISTENT_GEMINI,
                );
                const pSet = new Set(currentIds);
                idsToDelete.forEach((id) => pSet.delete(id));
                await chrome.storage.local.set({ [STORAGE_KEYS.PERSISTENT_GEMINI]: Array.from(pSet) });
            }

            update((st) => ({
                ...st,
                conversationHistory: [],
                currentCombinedIndex: -1,
            }));

            showNotification('conversationDeleted');
            await updateCombinedConversationDisplay();
        },

        /**
         * Asks the same question again on the same card.
         *
         * It used to delete the entry and ask afresh, so the card disappeared, the list
         * closed the gap and a new card appeared at the bottom — a jump on screen for
         * what the button calls "replace its answer". Now the card stays put and simply
         * goes back to waiting.
         */
        resendEntry: async (query, entryId) => {
            const previous = get(state).conversationHistory.find((e) => e.id === entryId);
            if (!previous || !query) return;

            const waiting = { ...previous, isLoading: true, data: null };
            update((st) => ({
                ...st,
                conversationHistory: st.conversationHistory.map((e) => (e.id === entryId ? waiting : e)),
            }));
            await saveGeminiEntryToDb(waiting);
            setSendButtonBusy(true);

            try {
                chrome.runtime.sendMessage(
                    {
                        action: 'searchGemini',
                        query,
                        contents: buildGeminiHistoryContents(entryId),
                        attachments: [],
                    },
                    (response) => applyGeminiAnswer(entryId, response, { fallback: previous }),
                );
            } catch (e) {
                setSendButtonBusy(false);
                console.error('Error resending Gemini query:', e);
            }
        },

        submitEdit: async (entryId, newQuery) => {
            const s = get(state);
            const entryIndex = s.conversationHistory.findIndex((e) => e.id === entryId);
            if (entryIndex === -1 || !newQuery) return;

            const originalQuery = s.conversationHistory[entryIndex].query;
            if (newQuery === originalQuery) return;

            update((st) => {
                st.conversationHistory[entryIndex] = {
                    ...st.conversationHistory[entryIndex],
                    query: newQuery,
                    data: null,
                    isLoading: true,
                };
                return { ...st, conversationHistory: [...st.conversationHistory] };
            });

            const s2 = get(state);
            await saveGeminiEntryToDb(s2.conversationHistory[entryIndex]);
            chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });

            chrome.runtime.sendMessage(
                { action: 'searchGemini', query: newQuery, contents: buildGeminiHistoryContents(entryId) },
                async (response) => {
                    const s3 = get(state);
                    const finalEntryIndex = s3.conversationHistory.findIndex((e) => e.id === entryId);
                    if (finalEntryIndex === -1) return;

                    let errorMsg = '';
                    if (chrome.runtime.lastError) {
                        errorMsg = chrome.runtime.lastError.message || 'Connection error';
                    } else if (!response || response.error) {
                        errorMsg = response && response.error ? response.error : 'Unknown error connecting to AI';
                    }

                    if (errorMsg) {
                        update((st) => ({
                            ...st,
                            conversationHistory: st.conversationHistory.filter((e) => e.id !== entryId),
                        }));
                        await deleteGeminiEntryFromDb(entryId);
                        chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });
                        return;
                    }

                    s3.conversationHistory[finalEntryIndex].data = response;
                    s3.conversationHistory[finalEntryIndex].isLoading = false;
                    await saveGeminiEntryToDb(s3.conversationHistory[finalEntryIndex]);
                    chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });
                    update((st) => ({ ...st, conversationHistory: [...st.conversationHistory] }));
                },
            );
        },

        htmlToSpeechText: (htmlString) => {
            if (!htmlString) return '';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlString;
            let speechText = '';
            function traverse(node) {
                if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
                if (node.nodeType === Node.TEXT_NODE) {
                    speechText += node.textContent.trim() + ' ';
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.tagName === 'IMG') {
                        const altText = node.getAttribute('alt') || '';
                        if (altText) {
                            speechText += `${chrome.i18n.getMessage('ttsImageDescription') || 'Image: '}${altText}. `;
                        } else {
                            speechText += `${chrome.i18n.getMessage('ttsImageWithoutDescription') || 'Image without description.'} `;
                        }
                    } else if (node.tagName === 'A') {
                        const linkText = node.textContent.trim();
                        if (linkText) {
                            speechText += `${chrome.i18n.getMessage('ttsLinkDescription') || 'Link: '}${linkText}. `;
                        }
                    } else if (node.tagName === 'LI') {
                        speechText += `${chrome.i18n.getMessage('ttsListItem') || 'List item: '} `;
                    }
                    for (let child = node.firstChild; child; child = child.nextSibling) {
                        traverse(child);
                    }
                }
            }
            traverse(tempDiv);
            return speechText.replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim();
        },

        /**
         * Reads a single conversation entry: its question and then its answer, the same
         * text the original extension read.
         */
        /**
         * The answer as it should be heard.
         *
         * What is stored is markdown, and reading it as HTML left the emphasis marks in
         * the text, so the voice spelled out "asterisk asterisk" around every bold word.
         * Rendering it first is what the card on screen does too.
         */
        answerToSpeechText: (answer) => {
            if (!answer) return '';
            return geminiStore
                .htmlToSpeechText(parseMarkdown(answer))
                .replace(/[*_`~]{1,3}/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
        },

        readEntryAloud: (entry, ctrlHeld) => {
            if (!entry?.data?.answer && !entry?.query) return;
            const answer = geminiStore.answerToSpeechText(entry.data?.answer || '');
            const text = entry.query ? `${entry.query}. ${answer}` : answer;
            geminiStore.startSpeech(entry.id, text, ctrlHeld);
        },

        /** Reads the whole conversation from the controls bar, entry after entry. */
        readConversationAloud: (entries, ctrlHeld) => {
            const list = entries || [];
            if (list.length === 0) return;
            const text = list
                .map((entry) => {
                    const answer = geminiStore.answerToSpeechText(entry.data?.answer || '');
                    return entry.query ? `${entry.query}. ${answer}` : answer;
                })
                .filter(Boolean)
                .join('. ');
            geminiStore.startSpeech(CONVERSATION_SPEECH_ID, text, ctrlHeld);
        },

        /**
         * Play / pause / resume for whoever asked to be read, plus stop on Ctrl+click,
         * mirroring the notes reader so both behave the same way.
         */
        startSpeech: (speakerId, text, ctrlHeld) => {
            const s = get(state);
            const isCurrentSpeaker = s.isGlobalPlaybackActive && s.currentlySpeakingEntryId === speakerId;

            if (isCurrentSpeaker) {
                // The button shows a stop icon while Ctrl is held, so honour it.
                if (ctrlHeld) {
                    geminiStore.stopSpeech();
                    return;
                }
                if (s.isSpeechPaused) {
                    speechSynthesis.resume();
                    stopKeepAlive(s.speechKeepAliveInterval);
                    update((st) => ({ ...st, isSpeechPaused: false, speechKeepAliveInterval: startKeepAlive() }));
                } else {
                    speechSynthesis.pause();
                    stopKeepAlive(s.speechKeepAliveInterval);
                    update((st) => ({ ...st, isSpeechPaused: true, speechKeepAliveInterval: null }));
                }
                return;
            }

            // Whatever else was talking (another entry, a note) gives up the synthesizer.
            geminiStore.stopSpeech();
            releaseDomReaders();

            const chunks = splitIntoSpeechChunks(text);
            if (chunks.length === 0) {
                showNotification('geminiNoContentToRead', true);
                return;
            }

            update((st) => ({
                ...st,
                isGlobalPlaybackActive: true,
                globalPlaybackChunks: chunks,
                currentGlobalChunkIndex: 0,
                currentlySpeakingEntryId: speakerId,
                isSpeechPaused: false,
                speechKeepAliveInterval: startKeepAlive(),
            }));

            geminiStore.speakNextGlobalChunk();
        },

        speakNextGlobalChunk: () => {
            const s = get(state);
            if (!s.isGlobalPlaybackActive || s.isSpeechPaused) return;

            if (s.currentGlobalChunkIndex >= s.globalPlaybackChunks.length) {
                geminiStore.resetGlobalSpeechState();
                return;
            }

            // Cancelling a reading can still deliver a late event for the chunk that was
            // being spoken; without this stamp it would advance the reading that replaced it.
            const speakerId = s.currentlySpeakingEntryId;
            const chunkIndex = s.currentGlobalChunkIndex;
            const isStale = () => {
                const current = get(state);
                return (
                    !current.isGlobalPlaybackActive ||
                    current.currentlySpeakingEntryId !== speakerId ||
                    current.currentGlobalChunkIndex !== chunkIndex
                );
            };

            const utterance = createUtterance(s.globalPlaybackChunks[chunkIndex]);
            utterance.onend = () => {
                if (isStale()) return;
                update((st) => ({ ...st, currentGlobalChunkIndex: st.currentGlobalChunkIndex + 1 }));
                geminiStore.speakNextGlobalChunk();
            };
            utterance.onerror = (event) => {
                if (isStale()) return;
                // 'interrupted' just means someone else took the synthesizer over.
                if (event.error !== 'interrupted') {
                    console.error('Error in speech synthesis:', event.error);
                    showNotification('errorReadingAloud', true);
                }
                geminiStore.resetGlobalSpeechState();
            };

            update((st) => ({ ...st, currentSpeechUtterance: utterance }));
            speechSynthesis.speak(utterance);
        },

        /** Stops the reading on demand: silences the synthesizer and clears the state. */
        stopSpeech: () => {
            if (get(state).isGlobalPlaybackActive) cancelSpeech();
            geminiStore.resetGlobalSpeechState();
        },

        /**
         * Clears the playback state without touching the synthesizer. Cancelling here
         * would cut off whoever took the synthesizer over (a note, another entry), since
         * that hand-over is precisely what fires the 'interrupted' error that lands here.
         */
        resetGlobalSpeechState: () => {
            const s = get(state);
            stopKeepAlive(s.speechKeepAliveInterval);
            update((st) => ({
                ...st,
                isGlobalPlaybackActive: false,
                globalPlaybackChunks: [],
                currentGlobalChunkIndex: 0,
                currentlySpeakingEntryId: null,
                isSpeechPaused: false,
                speechKeepAliveInterval: null,
            }));
        },

        downloadEntry: (entry) => {
            if (!entry || entry.isLoading || !entry.data) {
                showNotification('errorEntryNotReady', true);
                return;
            }
            const title = entry.query?.substring(0, 40) || 'gemini-entry';
            const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:800px;margin:auto;padding:20px">
<h2>${entry.query || ''}</h2>
<div>${entry.data.answer || ''}</div>
</body></html>`;
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        toggleAgentMode: async () => {
            const s = get(state);
            const newVal = !s.agentModeEnabled;
            await chrome.storage.local.set({ geminiAgentModeEnabled: newVal });
            update((st) => ({ ...st, agentModeEnabled: newVal }));
        },

        addAttachments: async (files) => {
            if (!files || files.length === 0) return;
            const maxFiles = 3;
            const maxSize = 5 * 1024 * 1024;
            const validTypes = [
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/heic',
                'image/heif',
                'application/pdf',
                'text/plain',
                'text/csv',
            ];

            const s = get(state);
            let pending = [...s.pendingAttachments];

            for (const file of files) {
                if (pending.length >= maxFiles) {
                    showNotification('geminiMaxFilesReached', true);
                    break;
                }
                if (!validTypes.includes(file.type)) {
                    showNotification('geminiUnsupportedFileType', true);
                    continue;
                }
                if (file.size > maxSize) {
                    showNotification('geminiFileTooLarge', true);
                    continue;
                }
                try {
                    const base64Data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    let fileName = file.name;
                    if (!fileName || fileName === 'image.png' || fileName === 'image.jpg') {
                        const ext = file.type.split('/')[1] || 'png';
                        fileName = `pasted_image_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
                    }
                    // The id is what identifies the chip in the preview list. Neither the
                    // name nor the data can play that part: the same file can be attached
                    // twice, and removeAttachment splices from the middle, so keying the
                    // list by position would leave the wrong chip on screen.
                    pending.push({
                        id: crypto.randomUUID(),
                        name: fileName,
                        mimeType: file.type,
                        data: base64Data,
                    });
                } catch (error) {
                    console.error('Error reading file:', error);
                }
            }

            update((st) => ({ ...st, pendingAttachments: pending }));
        },

        removeAttachment: (index) => {
            update((st) => {
                const pending = [...st.pendingAttachments];
                pending.splice(index, 1);
                return { ...st, pendingAttachments: pending };
            });
        },

        clearAttachments: () => {
            update((st) => ({ ...st, pendingAttachments: [] }));
        },

        getCombinedConversations: () => {
            return get(state).combinedConversations;
        },

        getConversationHistory: () => {
            return get(state).conversationHistory;
        },

        deletePersistentConversationByTitle,
        deleteSessionConversation,

        saveSchedule: async (scheduleData) => {
            const { [STORAGE_KEYS.GEMINI_SCHEDULES]: schedules = [] } = await chrome.storage.local.get(
                STORAGE_KEYS.GEMINI_SCHEDULES,
            );
            if (!scheduleData || !scheduleData.schedule) {
                showNotification('errorInvalidSchedule', true);
                return;
            }
            // The title is kept: the form demands one, the list of schedules shows it
            // and editing reads it back. Dropping it here left every saved schedule
            // nameless, both in the list and in the form when reopened.
            const newSchedule = { ...scheduleData.schedule };
            const mode = scheduleData.mode || 'add';
            const editIndex = scheduleData.editIndex != null ? scheduleData.editIndex : -1;
            if (mode === 'edit' && editIndex !== -1 && editIndex < schedules.length) {
                schedules[editIndex] = newSchedule;
            } else {
                schedules.push(newSchedule);
            }
            await chrome.storage.local.set({ [STORAGE_KEYS.GEMINI_SCHEDULES]: schedules });
            chrome.runtime.sendMessage({ action: 'geminiSchedulesUpdated' });
            showNotification(mode === 'edit' ? 'scheduleUpdated' : 'scheduleAdded', false, [
                scheduleData.schedule.title,
            ]);
        },

        deleteSchedule: async (index) => {
            const { [STORAGE_KEYS.GEMINI_SCHEDULES]: schedules = [] } = await chrome.storage.local.get(
                STORAGE_KEYS.GEMINI_SCHEDULES,
            );
            schedules.splice(index, 1);
            await chrome.storage.local.set({ [STORAGE_KEYS.GEMINI_SCHEDULES]: schedules });
            chrome.runtime.sendMessage({ action: 'geminiSchedulesUpdated' });
            showNotification('scheduleDeleted');
        },

        /**
         * Validates and stores an API key.
         *
         * The reason for a refusal is returned rather than left in `#gemini-api-key-error`:
         * the Svelte modal only renders that node once it already has an error, so
         * writing into it announced nothing, and the caller closed the modal anyway.
         *
         * @returns {Promise<{ok: boolean, errorKey?: string}>}
         */
        saveApiKey: async () => {
            const input = document.getElementById('gemini-api-key-input');
            const modal = input?.closest('.modal-content');
            if (!modal) return { ok: false, errorKey: 'errorValidatingApiKey' };

            const lang = await getCurrentLang();
            const messages = await loadMessages(lang);
            const t = (key) => messages[key]?.message || key;

            const saveBtn = modal.querySelector('.modal-btn-save');
            const apiKey = input.value.trim();
            const errorMsg = modal.querySelector('#gemini-api-key-error');

            input.classList.remove('input-error');
            saveBtn?.classList.remove('error-state');
            if (errorMsg) {
                errorMsg.textContent = '';
                errorMsg.classList.add('hidden');
            }

            if (!apiKey) {
                if (errorMsg) {
                    errorMsg.textContent = t('geminiApiKeyEmpty');
                    errorMsg.classList.remove('hidden');
                }
                input.classList.add('input-error');
                saveBtn?.classList.add('error-state');
                return { ok: false, errorKey: 'geminiApiKeyEmpty' };
            }

            saveBtn.disabled = true;
            const originalText = saveBtn.textContent;
            saveBtn.textContent = t('checkingApiKey');

            try {
                const response = await chrome.runtime.sendMessage({ action: 'validateApiKey', apiKey });
                if (response && response.success) {
                    const storageData = await chrome.storage.local.get(['geminiApiKeysList', STORAGE_KEYS.API_KEY]);
                    let keysList = storageData.geminiApiKeysList || [];
                    const existingIndex = keysList.findIndex((k) => k.key === apiKey);
                    if (existingIndex !== -1) {
                        if (errorMsg) {
                            errorMsg.textContent = t('duplicateApiKeyError');
                            errorMsg.classList.remove('hidden');
                        }
                        input.classList.add('input-error');
                        saveBtn.classList.add('error-state');
                        saveBtn.disabled = false;
                        saveBtn.textContent = originalText;
                        return { ok: false, errorKey: 'duplicateApiKeyError' };
                    }
                    if (keysList.length >= 10) {
                        if (errorMsg) {
                            errorMsg.textContent = t('geminiMaxApiKeysReached');
                            errorMsg.classList.remove('hidden');
                        }
                        input.classList.add('input-error');
                        saveBtn.classList.add('error-state');
                        saveBtn.disabled = false;
                        saveBtn.textContent = originalText;
                        return { ok: false, errorKey: 'geminiMaxApiKeysReached' };
                    }
                    keysList.push({
                        key: apiKey,
                        addedAt: Date.now(),
                        tokensUsed: 0,
                        quotaLimit: 1000000,
                        name: t('geminiApiKeyNameDefault'),
                        tier: t('geminiFreeTier'),
                    });
                    await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: apiKey, geminiApiKeysList: keysList });
                    update((st) => ({ ...st, apiKeys: keysList }));
                    showNotification('apiKeySaved');
                    saveBtn.disabled = false;
                    saveBtn.textContent = originalText;
                    input.value = '';
                    return { ok: true };
                }
                if (errorMsg) {
                    errorMsg.textContent = t('geminiInvalidApiKey');
                    errorMsg.classList.remove('hidden');
                }
                input.classList.add('input-error');
                saveBtn.classList.add('error-state');
                saveBtn.disabled = false;
                saveBtn.textContent = originalText;
                return { ok: false, errorKey: 'geminiInvalidApiKey' };
            } catch {
                if (errorMsg) {
                    errorMsg.textContent = t('geminiApiKeyValidationError');
                    errorMsg.classList.remove('hidden');
                }
                input.classList.add('input-error');
                saveBtn.classList.add('error-state');
                saveBtn.disabled = false;
                saveBtn.textContent = originalText;
                return { ok: false, errorKey: 'geminiApiKeyValidationError' };
            }
        },

        deleteApiKey: async (index) => {
            const storageData = await chrome.storage.local.get(['geminiApiKeysList', STORAGE_KEYS.API_KEY]);
            let keysList = storageData.geminiApiKeysList || [];
            const keyString = keysList[index]?.key;
            keysList.splice(index, 1);
            const updateData = { geminiApiKeysList: keysList };
            if (storageData[STORAGE_KEYS.API_KEY] === keyString) {
                updateData[STORAGE_KEYS.API_KEY] = keysList.length > 0 ? keysList[0].key : '';
            }
            await chrome.storage.local.set(updateData);
            update((st) => ({ ...st, apiKeys: keysList }));
            showNotification('apiKeyDeleted');
        },

        reset: () => {
            set({
                isViewActive: false,
                isStandaloneGemini: false,
                conversationHistory: [],
                combinedConversations: [],
                currentCombinedIndex: -1,
                persistentConversations: [],
                sessionConversations: [],
                selectedModel: 'gemini-2.5-flash',
                availableModels: [],
                modelDropdown: null,
                agentModeEnabled: false,
                pendingAttachments: [],
                isGlobalPlaybackActive: false,
                globalPlaybackChunks: [],
                currentGlobalChunkIndex: 0,
                currentlySpeakingEntryId: null,
                isSpeechPaused: false,
                speechKeepAliveInterval: null,
                calCurrentDate: new Date(),
                calSelectedDate: null,
                scheduleEditorState: { mode: 'add', scheduleIndex: -1 },
                isInitialized: false,
            });
        },
    };
}

export const geminiStore = createGeminiStore();

export const conversationHistory = derived(geminiStore, ($g) => $g.conversationHistory);
export const combinedConversations = derived(geminiStore, ($g) => $g.combinedConversations);
export const sessionConversations = derived(geminiStore, ($g) => $g.sessionConversations);
export const persistentConversations = derived(geminiStore, ($g) => $g.persistentConversations);
export const currentCombinedIndex = derived(geminiStore, ($g) => $g.currentCombinedIndex);
export const isGeminiViewActive = derived(geminiStore, ($g) => $g.isViewActive);
export const selectedModel = derived(geminiStore, ($g) => $g.selectedModel);
export const availableModels = derived(geminiStore, ($g) => $g.availableModels);
export const pendingAttachments = derived(geminiStore, ($g) => $g.pendingAttachments);
export const agentModeEnabled = derived(geminiStore, ($g) => $g.agentModeEnabled);
