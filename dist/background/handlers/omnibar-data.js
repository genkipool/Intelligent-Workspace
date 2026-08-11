/**
 * [AI INSTRUCTION]
 * OMNIBAR DATA HANDLER — Serves IndexedDB data for the Omnibar UI.
 *
 * All operations here are read-only database queries formatted for
 * the omnibar suggestion UI.
 *
 * Dependencies: openDb() (from db.js),
 *               NOTES_STORE_NAME, CONVERSATION_STORE_NAME, STORE_NAME (from state.js)
 */

function handleGetOmnibarNotes(sendResponse) {
    (async () => {
        try {
            const db = await openDb();
            // Get all notes from IndexedDB
            const allNotes = await new Promise((resolve, reject) => {
                const tx = db.transaction([NOTES_STORE_NAME], 'readonly');
                const store = tx.objectStore(NOTES_STORE_NAME);
                const req = store.getAll();
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror = (e) => reject(e.target.error);
            });

            // Get persistent + session note IDs
            const { persistentNoteIds: persistentIds = [] } = await chrome.storage.local.get('persistentNoteIds');
            const persistentIdSet = new Set(persistentIds);

            const { groupNotes: sessionNotesData = {} } = await chrome.storage.session.get('groupNotes');
            const sessionNoteIds = new Set();
            Object.values(sessionNotesData).forEach((ids) => ids.forEach((id) => sessionNoteIds.add(id)));

            // Filter to only notes that are accessible (persistent or session)
            const notes = allNotes
                .filter((n) => persistentIdSet.has(n.id) || sessionNoteIds.has(n.id))
                .map((n) => {
                    let plainText = '';
                    if (typeof n.content === 'string') {
                        plainText = n.content
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                    } else if (Array.isArray(n.content)) {
                        plainText = n.content
                            .map((item) => (typeof item === 'string' ? item : item.text || item.content || ''))
                            .join(' ')
                            .trim();
                    }
                    return {
                        id: n.id,
                        title: n.title || 'Untitled note',
                        type: n.type || 'text',
                        plainText: plainText.substring(0, 200),
                        content: typeof n.content === 'string' ? n.content : JSON.stringify(n.content),
                        contentRaw: n.content,
                        date: n.timestamp ? new Date(n.timestamp).getTime() : n.id,
                    };
                })
                .sort((a, b) => b.date - a.date);

            sendResponse({ success: true, notes });
        } catch (error) {
            console.error('[background.js] Error getting omnibar notes:', error);
            sendResponse({ success: false, notes: [], error: error.message });
        }
    })();
}

function handleGetOmnibarConversationContent(message, sendResponse) {
    (async () => {
        try {
            const { title, entryIds } = message;
            if (!entryIds || entryIds.length === 0) {
                sendResponse({ success: false, error: 'No entry IDs provided' });
                return;
            }

            const db = await openDb();
            const allEntries = await new Promise((resolve, reject) => {
                const tx = db.transaction([CONVERSATION_STORE_NAME], 'readonly');
                const store = tx.objectStore(CONVERSATION_STORE_NAME);
                const req = store.getAll();
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror = (e) => reject(e.target.error);
            });

            const idSet = new Set(entryIds);
            const entries = allEntries.filter((e) => idSet.has(e.id)).sort((a, b) => a.id - b.id);

            if (entries.length === 0) {
                sendResponse({ success: false, error: 'No entries found for this conversation' });
                return;
            }

            const entries_out = entries
                .map((e) => ({
                    query: e.query || '',
                    answer: e.data && e.data.answer ? e.data.answer : '',
                }))
                .filter((e) => e.query || e.answer);

            // Keep backward-compatible text field too
            const lines = entries_out
                .map((e) => {
                    const parts = [];
                    if (e.query) parts.push(`**${e.query}**`);
                    if (e.answer) parts.push(e.answer);
                    return parts.join('\n\n');
                })
                .filter(Boolean);
            const header = title ? `${title}\n${'-'.repeat(40)}\n` : '';
            const text = `${header}${lines.join('\n\n--\n\n')}`;
            sendResponse({ success: true, text, entries: entries_out });
        } catch (error) {
            console.error('[background.js] Error getting conversation content:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}

function handleGetOmnibarConversations(sendResponse) {
    (async () => {
        try {
            const db = await openDb();
            const allEntries = await new Promise((resolve, reject) => {
                const tx = db.transaction([CONVERSATION_STORE_NAME], 'readonly');
                const store = tx.objectStore(CONVERSATION_STORE_NAME);
                const req = store.getAll();
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror = (e) => reject(e.target.error);
            });

            // -- Persistent conversations --------------------------------------
            const { persistentGeminiConversationIds: persistentIds = [] } = await chrome.storage.local.get(
                'persistentGeminiConversationIds',
            );
            const persistentIdSet = new Set(persistentIds);
            const persistentEntries = allEntries.filter((e) => persistentIdSet.has(e.id));

            const grouped = {};
            persistentEntries.forEach((entry) => {
                const title = entry.persistentTitle || 'Untitled';
                if (!grouped[title]) grouped[title] = [];
                grouped[title].push(entry);
            });

            const persistentConversations = Object.entries(grouped)
                .map(([title, entries]) => {
                    const sorted = entries.sort((a, b) => a.id - b.id);
                    return {
                        title,
                        date: Math.max(...sorted.map((e) => e.id)),
                        entryCount: sorted.length,
                        entryIds: sorted.map((e) => e.id),
                        isPersistent: true,
                    };
                })
                .sort((a, b) => b.date - a.date);

            // -- Session conversations -----------------------------------------
            const { [GEMINI_SESSION_CONVERSATIONS_KEY]: sessionConvs = [] } = await chrome.storage.session.get(
                GEMINI_SESSION_CONVERSATIONS_KEY,
            );
            const persistentEntryIdSet = new Set(persistentIds);

            const sessionConversations = sessionConvs
                .filter((conv) => conv.entryIds && conv.entryIds.length > 0)
                .map((conv, idx) => ({
                    title: conv.title || `Conversation ${idx + 1}`,
                    date: conv.timestamp || 0,
                    entryCount: conv.entryIds.length,
                    entryIds: conv.entryIds,
                    isPersistent: false,
                    isTemporary: true,
                }))
                .filter((conv) => !conv.entryIds.every((id) => persistentEntryIdSet.has(id)))
                .sort((a, b) => b.date - a.date);

            sendResponse({ success: true, conversations: [...persistentConversations, ...sessionConversations] });
        } catch (error) {
            console.error('[background.js] Error getting omnibar conversations:', error);
            sendResponse({ success: false, conversations: [], error: error.message });
        }
    })();
}

function handleGetOmnibarImageById(message, sendResponse) {
    (async () => {
        try {
            const db = await openDb();
            const screenshot = await new Promise((resolve, reject) => {
                const tx = db.transaction([STORE_NAME], 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(message.id);
                req.onsuccess = (e) => resolve(e.target.result || null);
                req.onerror = (e) => reject(e.target.error);
            });
            if (screenshot && screenshot.dataUrl) {
                sendResponse({ success: true, dataUrl: screenshot.dataUrl });
            } else {
                sendResponse({ success: false, error: 'Image not found' });
            }
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
}

function handleGetOmnibarAllMessages(sendResponse) {
    (async () => {
        try {
            const db = await openDb();
            const allEntries = await new Promise((resolve, reject) => {
                const tx = db.transaction([CONVERSATION_STORE_NAME], 'readonly');
                const store = tx.objectStore(CONVERSATION_STORE_NAME);
                const req = store.getAll();
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror = (e) => reject(e.target.error);
            });

            const { persistentGeminiConversationIds: persistentIds = [] } = await chrome.storage.local.get(
                'persistentGeminiConversationIds',
            );
            const persistentIdSet = new Set(persistentIds);

            const { [GEMINI_SESSION_CONVERSATIONS_KEY]: sessionConvs = [] } = await chrome.storage.session.get(
                GEMINI_SESSION_CONVERSATIONS_KEY,
            );
            const sessionIdSet = new Set();
            const sessionIdToConv = {};
            sessionConvs.forEach((c) =>
                (c.entryIds || []).forEach((id) => {
                    sessionIdSet.add(id);
                    sessionIdToConv[id] = c.title || '';
                }),
            );

            const messages = allEntries
                .filter((e) => (persistentIdSet.has(e.id) || sessionIdSet.has(e.id)) && e.query && !e.isLoading)
                .map((e) => ({
                    id: e.id,
                    query: e.query || '',
                    answer: e.data && e.data.answer ? e.data.answer : '',
                    date: e.id,
                    isPersistent: persistentIdSet.has(e.id),
                    convTitle: e.persistentTitle || sessionIdToConv[e.id] || '',
                }))
                .sort((a, b) => b.date - a.date);

            sendResponse({ success: true, messages });
        } catch (error) {
            console.error('[background.js] Error getting all AI messages:', error);
            sendResponse({ success: false, messages: [], error: error.message });
        }
    })();
}

function handleGetOmnibarScreenshots(sendResponse) {
    (async () => {
        try {
            const db = await openDb();
            const { persistentScreenshotIds: persistentIds = [] } =
                await chrome.storage.local.get('persistentScreenshotIds');
            const persistentIdSet = new Set(persistentIds);

            const allScreenshots = await new Promise((resolve, reject) => {
                const tx = db.transaction([STORE_NAME], 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.getAll();
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror = (e) => reject(e.target.error);
            });

            const { groupScreenshots: sessionScreenshotData = {} } =
                await chrome.storage.session.get('groupScreenshots');
            const sessionScreenshotIds = new Set();
            Object.values(sessionScreenshotData).forEach((ids) => ids.forEach((id) => sessionScreenshotIds.add(id)));

            const screenshots = allScreenshots
                .filter((s) => persistentIdSet.has(s.id) || sessionScreenshotIds.has(s.id))
                .map((s) => ({
                    id: s.id,
                    title: s.title || s.name || `Screenshot ${s.id}`,
                    date: s.timestamp || s.id || 0,
                    dataUrl: s.dataUrl ? s.dataUrl.substring(0, 100) + '...' : null,
                }))
                .sort((a, b) => b.date - a.date);

            const thumbnailScreenshots = await Promise.all(
                screenshots.slice(0, 30).map(async (s) => {
                    const full = allScreenshots.find((ss) => ss.id === s.id);
                    return { ...s, dataUrl: full?.dataUrl || null };
                }),
            );

            sendResponse({ success: true, screenshots: thumbnailScreenshots });
        } catch (error) {
            console.error('[background.js] Error getting omnibar screenshots:', error);
            sendResponse({ success: false, screenshots: [], error: error.message });
        }
    })();
}
function handleUpdateOmnibarNote(message, sendResponse) {
    (async () => {
        try {
            const db = await openDb();
            const note = await new Promise((resolve, reject) => {
                const tx = db.transaction([NOTES_STORE_NAME], 'readonly');
                const req = tx.objectStore(NOTES_STORE_NAME).get(message.id);
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });
            if (!note) {
                sendResponse({
                    success: false,
                    error: 'Note not found',
                });
                return;
            }
            note.content = message.content;
            note.modifiedAt = Date.now();
            await new Promise((resolve, reject) => {
                const tx = db.transaction([NOTES_STORE_NAME], 'readwrite');
                const req = tx.objectStore(NOTES_STORE_NAME).put(note);
                req.onsuccess = () => resolve();
                req.onerror = (e) => reject(e.target.error);
            });
            // Broadcast to all extension pages so listGroup can refresh in real-time
            chrome.runtime
                .sendMessage({
                    action: 'noteUpdatedFromOmnibar',
                    id: message.id,
                })
                .catch(() => {});
            sendResponse({
                success: true,
            });
        } catch (error) {
            sendResponse({
                success: false,
                error: error.message,
            });
        }
    })();
}
