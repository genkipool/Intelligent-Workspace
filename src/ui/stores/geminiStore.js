import { writable, derived, get } from 'svelte/store';
import { saveGeminiEntryToDb, getAllGeminiEntriesFromDb, deleteGeminiEntryFromDb } from '../../utils/db.js';
import { showNotification, getCurrentLang, loadMessages, applyTranslations } from '../../utils/i18n.js';
import {
    openModal,
    showSaveConversationModal,
    showViewConversationsModal,
    showApiKeyModal,
    showGeminiScheduleModal,
} from './modalStore.js';
import { handleAgentQuery, setSendButtonBusy, cancelAgentQuery } from '../../utils/agent-ui.js';
import { isGeminiViewActive as appIsGeminiViewActive } from './appStore.svelte.js';

const STORAGE_KEYS = {
    API_KEY: 'geminiApiKey',
    GEMINI_SCHEDULES: 'geminiSchedules',
    PERSISTENT_GEMINI: 'persistentGeminiConversationIds',
    GEMINI_SESSION_CONVERSATIONS: 'geminiSessionConversations',
};

export const MAX_GEMINI_SCHEDULES = 7;

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
            const selectedModel = data.selectedGeminiModel || 'gemini-2.5-flash';

            let availableModels;
            try {
                const response = await chrome.runtime.sendMessage({ action: 'getAvailableGeminiModels' });
                if (response && response.success) {
                    availableModels = response.models
                        .filter((m) => m.includes('gemini'))
                        .sort((a, b) => b.localeCompare(a));
                    if (!availableModels.includes(selectedModel)) {
                        await chrome.storage.local.set({ selectedGeminiModel: 'gemini-2.5-flash' });
                        update((st) => ({ ...st, selectedModel: 'gemini-2.5-flash' }));
                    }
                } else {
                    availableModels = [selectedModel];
                }
            } catch {
                availableModels = [selectedModel];
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
            if (typeof speechSynthesis !== 'undefined') {
                if (speechSynthesis.speaking || speechSynthesis.pending) {
                    speechSynthesis.cancel();
                }
            }
            update((st) => ({
                ...st,
                isViewActive: false,
                _returnToMainView: !isSwitchingView,
                isGlobalPlaybackActive: false,
                globalPlaybackChunks: [],
                currentGlobalChunkIndex: 0,
                currentlySpeakingEntryId: null,
                isSpeechPaused: false,
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

            chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });

            setSendButtonBusy(true);

            const s2 = get(state);
            const currentAttachments = [...s2.pendingAttachments];
            update((st) => ({ ...st, pendingAttachments: [] }));

            try {
                chrome.runtime.sendMessage(
                    {
                        action: 'searchGemini',
                        query,
                        contents: buildGeminiHistoryContents(newEntry.id),
                        attachments: currentAttachments,
                    },
                    async (response) => {
                        setSendButtonBusy(false);
                        const s3 = get(state);
                        const historyEntry = s3.conversationHistory.find((e) => e.id === newEntry.id);
                        if (!historyEntry) return;

                        let errorMsg = '';
                        if (chrome.runtime.lastError) {
                            errorMsg = chrome.runtime.lastError.message || 'Connection error';
                        } else if (!response || response.error) {
                            errorMsg = response && response.error ? response.error : 'Unknown error connecting to AI';
                        }

                        if (errorMsg) {
                            update((st) => ({
                                ...st,
                                conversationHistory: st.conversationHistory.filter((e) => e.id !== newEntry.id),
                            }));
                            await deleteGeminiEntryFromDb(newEntry.id);
                            chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });
                            return { error: errorMsg };
                        }

                        // Replaced rather than mutated: the view is keyed on these entry
                        // objects, so writing into one in place left the answer invisible
                        // and the entry stuck on "waiting for Gemini".
                        const answered = { ...historyEntry, isLoading: false, data: response };
                        update((st) => ({
                            ...st,
                            conversationHistory: st.conversationHistory.map((e) =>
                                e.id === answered.id ? answered : e,
                            ),
                        }));
                        await saveGeminiEntryToDb(answered);
                        chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });
                    },
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

            let history;
            if (conversation.isTemporary) {
                const entryIds = new Set(conversation.entryIds);
                const allEntries = await getAllGeminiEntriesFromDb();
                history = allEntries.filter((e) => entryIds.has(e.id)).sort((a, b) => a.id - b.id);
            } else {
                history = conversation.entries;
            }

            const s2 = get(state);
            const currentCombinedIndex = s2.combinedConversations.findIndex(
                (c) => c.timestamp === conversation.timestamp,
            );

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
            const s = get(state);
            update((st) => ({
                ...st,
                conversationHistory: st.conversationHistory.filter((e) => e.id !== entryId),
            }));
            await deleteGeminiEntryFromDb(entryId);

            let s2 = get(state);
            let changed = false;
            s2.sessionConversations = s2.sessionConversations
                .map((conv) => {
                    const newIds = conv.entryIds.filter((id) => id !== entryId);
                    if (newIds.length !== conv.entryIds.length) changed = true;
                    return { ...conv, entryIds: newIds };
                })
                .filter((conv) => conv.entryIds.length > 0);

            if (changed) {
                await chrome.storage.session.set({
                    [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: s2.sessionConversations,
                });
            }

            if (s2.conversationHistory.length === 0) {
                update((st) => ({
                    ...st,
                    conversationHistory: s2.sessionConversations,
                    currentCombinedIndex: -1,
                }));
            }

            update((st) => ({ ...st }));
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

        resendEntry: async (query, entryId) => {
            await geminiStore.deleteEntry(entryId);
            const s = get(state);
            if (s.conversationHistory.length === 0) {
                update((st) => ({ ...st, currentCombinedIndex: -1 }));
            }
            await updateCombinedConversationDisplay();
            if (query) {
                await geminiStore.handleQuery(query);
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

        handleGlobalReadAloud: async (entry, ctrlHeld) => {
            const s = get(state);
            if (!entry?.data?.answer && !entry?.query) return;

            if (s.currentlySpeakingEntryId === entry.id && s.isGlobalPlaybackActive) {
                if (s.isSpeechPaused) {
                    update((st) => ({ ...st, isSpeechPaused: false }));
                    speechSynthesis.resume();
                } else {
                    update((st) => ({ ...st, isSpeechPaused: true }));
                    speechSynthesis.pause();
                }
                geminiStore.syncSpeechUI();
                return;
            }

            if (s.isGlobalPlaybackActive) {
                if (typeof speechSynthesis !== 'undefined') {
                    try {
                        speechSynthesis.cancel();
                    } catch (e) {
                        /* ignore */
                    }
                }
                if (s.speechKeepAliveInterval) {
                    clearInterval(s.speechKeepAliveInterval);
                }
            }

            const isQAPlayback = !!ctrlHeld;
            let speechText = '';
            if (isQAPlayback && entry.query) {
                speechText = entry.query + '. ' + (geminiStore.htmlToSpeechText(entry.data?.answer || '') || '');
            } else {
                speechText = geminiStore.htmlToSpeechText(entry.data?.answer || entry.query || '') || '';
            }
            if (!speechText) {
                showNotification('geminiNoContentToRead', true);
                return;
            }

            const chunks = speechText.match(/[^.!?]+[.!?]+/g) || [speechText];
            const cleanChunks = chunks.map((c) => c.trim()).filter((c) => c.length > 0);
            if (cleanChunks.length === 0) return;

            const keepAliveInterval = setInterval(() => {
                try {
                    if (
                        typeof speechSynthesis !== 'undefined' &&
                        (speechSynthesis.speaking || speechSynthesis.pending)
                    ) {
                        speechSynthesis.pause();
                        speechSynthesis.resume();
                    }
                } catch (e) {
                    /* ignore */
                }
            }, 10000);

            update((st) => ({
                ...st,
                isGlobalPlaybackActive: true,
                globalPlaybackChunks: cleanChunks,
                currentGlobalChunkIndex: 0,
                currentlySpeakingEntryId: entry.id,
                isSpeechPaused: false,
                speechKeepAliveInterval: keepAliveInterval,
            }));

            geminiStore.speakNextGlobalChunk();
        },

        speakNextGlobalChunk: () => {
            const s = get(state);
            if (!s.isGlobalPlaybackActive || s.isSpeechPaused) return;

            if (s.currentGlobalChunkIndex >= s.globalPlaybackChunks.length) {
                if (s.speechKeepAliveInterval) {
                    clearInterval(s.speechKeepAliveInterval);
                }
                update((st) => ({
                    ...st,
                    isGlobalPlaybackActive: false,
                    globalPlaybackChunks: [],
                    currentGlobalChunkIndex: 0,
                    currentlySpeakingEntryId: null,
                    speechKeepAliveInterval: null,
                }));
                geminiStore.syncSpeechUI();
                return;
            }

            const text = s.globalPlaybackChunks[s.currentGlobalChunkIndex];
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            utterance.onend = () => {
                const s2 = get(state);
                if (s2.currentGlobalChunkIndex < s2.globalPlaybackChunks.length) {
                    update((st) => ({ ...st, currentGlobalChunkIndex: st.currentGlobalChunkIndex + 1 }));
                    geminiStore.speakNextGlobalChunk();
                }
            };
            utterance.onerror = () => {
                geminiStore.resetGlobalSpeechState();
            };

            try {
                speechSynthesis.speak(utterance);
            } catch (e) {
                geminiStore.resetGlobalSpeechState();
            }
        },

        resetGlobalSpeechState: () => {
            if (typeof speechSynthesis !== 'undefined') {
                try {
                    if (speechSynthesis.speaking || speechSynthesis.pending) {
                        speechSynthesis.cancel();
                    }
                } catch (e) {
                    /* ignore */
                }
            }
            const s = get(state);
            if (s.speechKeepAliveInterval) {
                clearInterval(s.speechKeepAliveInterval);
            }
            update((st) => ({
                ...st,
                isGlobalPlaybackActive: false,
                globalPlaybackChunks: [],
                currentGlobalChunkIndex: 0,
                currentlySpeakingEntryId: null,
                isSpeechPaused: false,
                speechKeepAliveInterval: null,
            }));
            geminiStore.syncSpeechUI();
        },

        syncSpeechUI: () => {
            const s = get(state);
            document.querySelectorAll('.gemini-entry').forEach((el) => {
                const entryId = el.dataset.entryId;
                const playBtn = el.querySelector('.icon-play');
                const pauseBtn = el.querySelector('.icon-pause');
                const resumeBtn = el.querySelector('.icon-refresh');
                const stopBtn = el.querySelector('.icon-stop');
                if (!playBtn || !pauseBtn) return;

                if (s.currentlySpeakingEntryId === entryId) {
                    if (s.isSpeechPaused) {
                        playBtn.style.display = 'none';
                        pauseBtn.style.display = 'none';
                        if (resumeBtn) resumeBtn.style.display = '';
                        if (stopBtn) stopBtn.style.display = '';
                        el.classList.add('reading');
                        el.classList.remove('paused');
                    } else {
                        playBtn.style.display = 'none';
                        pauseBtn.style.display = '';
                        if (resumeBtn) resumeBtn.style.display = 'none';
                        if (stopBtn) stopBtn.style.display = '';
                        el.classList.add('reading');
                        el.classList.remove('paused');
                    }
                } else if (s.isGlobalPlaybackActive) {
                    playBtn.style.display = '';
                    pauseBtn.style.display = 'none';
                    if (resumeBtn) resumeBtn.style.display = 'none';
                    if (stopBtn) stopBtn.style.display = 'none';
                    el.classList.remove('reading');
                    el.classList.remove('paused');
                } else {
                    playBtn.style.display = '';
                    pauseBtn.style.display = 'none';
                    if (resumeBtn) resumeBtn.style.display = 'none';
                    if (stopBtn) stopBtn.style.display = 'none';
                    el.classList.remove('reading');
                    el.classList.remove('paused');
                }
            });
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
                    pending.push({ name: fileName, mimeType: file.type, data: base64Data });
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
            const newSchedule = { ...scheduleData.schedule };
            delete newSchedule.title;
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

        saveApiKey: async () => {
            const input = document.getElementById('gemini-api-key-input');
            const modal = input?.closest('.modal-content');
            if (!modal) return false;

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
                return false;
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
                        return false;
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
                        return false;
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
                    return true;
                }
                if (errorMsg) {
                    errorMsg.textContent = t('geminiInvalidApiKey');
                    errorMsg.classList.remove('hidden');
                }
                input.classList.add('input-error');
                saveBtn.classList.add('error-state');
                saveBtn.disabled = false;
                saveBtn.textContent = originalText;
                return false;
            } catch {
                if (errorMsg) {
                    errorMsg.textContent = t('geminiApiKeyValidationError');
                    errorMsg.classList.remove('hidden');
                }
                input.classList.add('input-error');
                saveBtn.classList.add('error-state');
                saveBtn.disabled = false;
                saveBtn.textContent = originalText;
                return false;
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
export const isGeminiViewActive = derived(geminiStore, ($g) => $g.isViewActive);
export const selectedModel = derived(geminiStore, ($g) => $g.selectedModel);
export const availableModels = derived(geminiStore, ($g) => $g.availableModels);
export const pendingAttachments = derived(geminiStore, ($g) => $g.pendingAttachments);
export const agentModeEnabled = derived(geminiStore, ($g) => $g.agentModeEnabled);
