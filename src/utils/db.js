const DB_NAME = 'Intelligent_Workspace';
const STORE_NAME = 'screenshots';
const CONVERSATION_STORE_NAME = 'geminiConversations';
const NOTES_STORE_NAME = 'notesStore'; // New store for notes
const BACKUPS_STORE_NAME = 'backupsGroups';
const POMO_STATS_STORE_NAME = 'pomodoroStats';
let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 6);
        request.onerror = (event) => {
            console.error('Error opening IndexedDB:', event.target.error);
            reject('Error opening the database.');
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(CONVERSATION_STORE_NAME)) {
                db.createObjectStore(CONVERSATION_STORE_NAME, { keyPath: 'id' });
            }
            if (db.objectStoreNames.contains(NOTES_STORE_NAME)) {
                const transaction = event.target.transaction;
                if (transaction) {
                    const store = transaction.objectStore(NOTES_STORE_NAME);
                    if (store.autoIncrement) {
                        db.deleteObjectStore(NOTES_STORE_NAME);
                        db.createObjectStore(NOTES_STORE_NAME, { keyPath: 'id' });
                    }
                }
            } else {
                db.createObjectStore(NOTES_STORE_NAME, { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains(BACKUPS_STORE_NAME)) {
                db.createObjectStore(BACKUPS_STORE_NAME, { keyPath: 'group.id' });
            }

            if (!db.objectStoreNames.contains(POMO_STATS_STORE_NAME)) {
                const pomoStore = db.createObjectStore(POMO_STATS_STORE_NAME, { keyPath: 'id' });
                pomoStore.createIndex('projectName', 'projectName', { unique: false });
                pomoStore.createIndex('savedAt', 'savedAt', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
    });
    return dbPromise;
}

export async function saveScreenshotToDb(screenshot) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(screenshot);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error saving to IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getScreenshotFromDb(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function deleteScreenshotFromDb(id) {
    if (id === undefined || id === null) {
        return Promise.resolve();
    }

    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getAllScreenshotIdsFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function saveNoteToDb(note) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([NOTES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(NOTES_STORE_NAME);
        const request = store.put(note);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error saving note to IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getNoteFromDb(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([NOTES_STORE_NAME], 'readonly');
        const store = transaction.objectStore(NOTES_STORE_NAME);
        const request = store.get(id);

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function deleteNoteFromDb(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([NOTES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(NOTES_STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function clearAllNotesFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([NOTES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(NOTES_STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error clearing notes store in IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function clearNotesForContext(contextKey, numericContextKey = null) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([NOTES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(NOTES_STORE_NAME);
        const request = store.openCursor();
        let deletedCount = 0;
        const deletedPersistentIds = [];

        const isGroupDelete1 = contextKey ? contextKey.startsWith('g_') : false;
        const groupPrefix1 = isGroupDelete1 ? `s_${contextKey.substring(2)}` : null;

        const isGroupDelete2 = numericContextKey ? numericContextKey.startsWith('g_') : false;
        const groupPrefix2 = isGroupDelete2 ? `s_${numericContextKey.substring(2)}` : null;

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                let shouldDelete = false;
                const note = cursor.value;
                const noteContextKey = note.contextKey;

                if (noteContextKey) {
                    if (isGroupDelete1 && (noteContextKey === contextKey || noteContextKey.startsWith(groupPrefix1))) {
                        shouldDelete = true;
                    } else if (
                        isGroupDelete2 &&
                        (noteContextKey === numericContextKey || noteContextKey.startsWith(groupPrefix2))
                    ) {
                        shouldDelete = true;
                    } else if (!isGroupDelete1 && noteContextKey === contextKey) {
                        shouldDelete = true;
                    } else if (!isGroupDelete2 && numericContextKey && noteContextKey === numericContextKey) {
                        shouldDelete = true;
                    }
                }

                if (shouldDelete) {
                    if (note.isPersistent) {
                        deletedPersistentIds.push(note.id);
                    }
                    cursor.delete();
                    deletedCount++;
                }
                cursor.continue();
            } else {
                resolve({ deletedCount, deletedPersistentIds });
            }
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getAllNoteIdsFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([NOTES_STORE_NAME], 'readonly');
        const store = transaction.objectStore(NOTES_STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function clearScreenshotsForContext(contextKey, numericContextKey = null) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();
        let deletedCount = 0;
        const deletedPersistentIds = [];

        const isGroupDelete1 = contextKey ? contextKey.startsWith('g_') : false;
        const groupPrefix1 = isGroupDelete1 ? `s_${contextKey.substring(2)}` : null;

        const isGroupDelete2 = numericContextKey ? numericContextKey.startsWith('g_') : false;
        const groupPrefix2 = isGroupDelete2 ? `s_${numericContextKey.substring(2)}` : null;

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                let shouldDelete = false;
                const screenshot = cursor.value;
                const screenshotContextKey = screenshot.contextKey;

                if (screenshotContextKey) {
                    if (
                        isGroupDelete1 &&
                        (screenshotContextKey === contextKey || screenshotContextKey.startsWith(groupPrefix1))
                    ) {
                        shouldDelete = true;
                    } else if (
                        isGroupDelete2 &&
                        (screenshotContextKey === numericContextKey || screenshotContextKey.startsWith(groupPrefix2))
                    ) {
                        shouldDelete = true;
                    } else if (!isGroupDelete1 && screenshotContextKey === contextKey) {
                        shouldDelete = true;
                    } else if (!isGroupDelete2 && numericContextKey && screenshotContextKey === numericContextKey) {
                        shouldDelete = true;
                    }
                }

                if (shouldDelete) {
                    if (screenshot.isPersistent) {
                        deletedPersistentIds.push(screenshot.id);
                    }
                    cursor.delete();
                    deletedCount++;
                }
                cursor.continue();
            } else {
                resolve({ deletedCount, deletedPersistentIds });
            }
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Saves or updates a single Gemini conversation entry in IndexedDB.
 * @param {object} entry - The conversation entry object.
 */
export async function saveGeminiEntryToDb(entry) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONVERSATION_STORE_NAME);
        const request = store.put(entry);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error saving Gemini entry in IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getGeminiEntryFromDb(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONVERSATION_STORE_NAME);
        const request = store.get(id);

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Gets all Gemini conversation entries from IndexedDB.
 * @returns {Promise<Array<object>>} - A promise that resolves to an array with all entries.
 */
export async function getAllGeminiEntriesFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONVERSATION_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => {
            console.error('Error fetching Gemini entries from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Deletes a single Gemini conversation entry from IndexedDB by its ID.
 * @param {number} entryId - The ID of the entry to delete.
 */
export async function deleteGeminiEntryFromDb(entryId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONVERSATION_STORE_NAME);
        const request = store.delete(entryId);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error deleting Gemini entry from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Deletes all Gemini conversation entries from IndexedDB.
 */
export async function clearAllGeminiEntriesFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONVERSATION_STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error clearing Gemini conversations in IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getAllGeminiIdsFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONVERSATION_STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function saveBackupToDb(backupData) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([BACKUPS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(BACKUPS_STORE_NAME);
        const request = store.put(backupData);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error saving backup to IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getAllBackupsFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([BACKUPS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(BACKUPS_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => {
            console.error('Error fetching all backups from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getBackupFromDb(groupId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([BACKUPS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(BACKUPS_STORE_NAME);
        const request = store.get(groupId);

        request.onsuccess = (event) => resolve(event.target.result || null);
        request.onerror = (event) => {
            console.error('Error fetching backup from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function deleteBackupFromDb(groupId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([BACKUPS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(BACKUPS_STORE_NAME);
        const request = store.delete(groupId);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error deleting backup from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}
// ─── Pomodoro Stats Store ──────────────────────────────
export async function savePomoStatsToDb(statsEntry) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([POMO_STATS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(POMO_STATS_STORE_NAME);
        const request = store.put(statsEntry);
        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error saving pomo stats:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getAllPomoStatsFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([POMO_STATS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(POMO_STATS_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result || []);
        request.onerror = (event) => {
            console.error('Error fetching pomo stats:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getPomoStatsByProjectFromDb(projectName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([POMO_STATS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(POMO_STATS_STORE_NAME);
        const index = store.index('projectName');
        const request = index.getAll(projectName);
        request.onsuccess = (event) => resolve(event.target.result || []);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function deletePomoStatsFromDb(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([POMO_STATS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(POMO_STATS_STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function clearPomoStatsFromDb(projectName) {
    const db = await openDb();
    return new Promise(async (resolve, reject) => {
        try {
            const transaction = db.transaction([POMO_STATS_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(POMO_STATS_STORE_NAME);
            if (projectName) {
                const index = store.index('projectName');
                const keys = await new Promise((res, rej) => {
                    const kr = index.getAllKeys(projectName);
                    kr.onsuccess = (e) => res(e.target.result);
                    kr.onerror = (e) => rej(e.target.error);
                });
                await Promise.all(
                    keys.map(
                        (k) =>
                            new Promise((res, rej) => {
                                const dr = store.delete(k);
                                dr.onsuccess = () => res();
                                dr.onerror = (e) => rej(e.target.error);
                            }),
                    ),
                );
            } else {
                await new Promise((res, rej) => {
                    const cr = store.clear();
                    cr.onsuccess = () => res();
                    cr.onerror = (e) => rej(e.target.error);
                });
            }
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}
