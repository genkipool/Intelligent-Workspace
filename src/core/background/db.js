function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        // Schema lives in /services/dbSchema.js, shared with the pages.
        const request = indexedDB.open(ITG_DB_SCHEMA.name, ITG_DB_SCHEMA.version);

        request.onerror = (event) => {
            console.error('Error opening IndexedDB:', event.target.error);
            reject('Error opening the database.');
        };

        request.onupgradeneeded = (event) => {
            ITG_DB_SCHEMA.upgrade(event.target.result, event.target.transaction);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
    });
    return dbPromise;
}

async function openSearchUrl(baseUrl, query) {
    const searchUrl = baseUrl + encodeURIComponent(query);
    try {
        const urlPattern = new URL(baseUrl).origin + '/*';
        const tabs = await chrome.tabs.query({ url: urlPattern });
        const reusableTab = tabs.find((t) => !t.pinned);

        if (reusableTab) {
            await chrome.tabs.update(reusableTab.id, { url: searchUrl, active: true });
            await chrome.windows.update(reusableTab.windowId, { focused: true });
        } else {
            await chrome.tabs.create({ url: searchUrl, active: true });
        }
    } catch (e) {
        console.error(`Error opening search URL for query "${query}":`, e);
        await chrome.tabs.create({ url: searchUrl, active: true });
    }
}

async function handleValidateApiKey(message, sendResponse) {
    const { apiKey } = message;

    if (!apiKey) {
        sendResponse({ success: false, error: 'API key is empty.' });
        return;
    }

    // We use a lightweight API endpoint to verify the key's validity.
    const validationUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(validationUrl);
        if (response.ok) {
            // The key is valid if the request is successful.
            sendResponse({ success: true });
        } else {
            // If there's an error, the key is invalid or there's another problem.
            const errorData = await response.json();
            const errorMessage = errorData.error?.message || `HTTP error! Status: ${response.status}`;
            console.warn(`API Key validation failed: ${errorMessage}`);
            sendResponse({ success: false, error: errorMessage });
        }
    } catch (error) {
        // Catch network errors (e.g., no internet connection).
        console.error('Network error during API Key validation:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function saveTabModes() {
    try {
        await chrome.storage.session.set({ tabModes: Object.fromEntries(tabModes) });
    } catch (error) {
        console.error('Error saving tabModes to session storage:', error);
    }
}

async function loadTabModes() {
    try {
        const data = await chrome.storage.session.get('tabModes');
        if (data.tabModes) {
            // We convert the saved object back to a Map
            tabModes = new Map(Object.entries(data.tabModes));
        } else {
            tabModes = new Map();
        }
    } catch (error) {
        console.error('Error loading tabModes from session storage:', error);
        tabModes = new Map();
    }
}

async function saveGeminiEntryToDb(entry) {
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

/** The times of day a scheduled query runs at, whichever shape it was saved in. */
function geminiScheduleTimes(schedule) {
    if (Array.isArray(schedule.times) && schedule.times.length > 0) return schedule.times;
    if (schedule.startTime) return [schedule.startTime];
    if (schedule.startDateTime) return [schedule.startDateTime.split('T')[1]?.substring(0, 5) || '00:00'];
    return [];
}

/**
 * The runs of a scheduled query that are due and have not happened yet.
 *
 * A query can be set to several times of day, so "has it run today" is no longer
 * enough to tell: each date-and-time is its own run, remembered in `firedSlots`.
 * Schedules saved before that existed carry `lastTriggered` or `hasBeenTriggered`
 * instead, and those are honoured so an upgrade does not replay them.
 */
function dueGeminiSlots(schedule, now) {
    const times = geminiScheduleTimes(schedule);
    if (times.length === 0) return [];

    const pad = (n) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let candidates = [];
    if (schedule.type === 'repeating') {
        if (!Array.isArray(schedule.days) || !schedule.days.includes(now.getDay())) return [];
        candidates = times.filter((time) => currentTime >= time).map((time) => `${today}T${time}`);
    } else {
        const date = schedule.startDate || (schedule.startDateTime || '').split('T')[0];
        if (!date) return [];
        candidates = times.filter((time) => new Date(`${date}T${time}:00`) <= now).map((time) => `${date}T${time}`);
    }

    const fired = new Set(schedule.firedSlots || []);
    if (!schedule.firedSlots) {
        // Nothing was recorded slot by slot before, so the old marks stand in for it.
        if (schedule.type === 'repeating') {
            const lastTriggeredToday =
                schedule.lastTriggered && new Date(schedule.lastTriggered).toDateString() === now.toDateString();
            if (lastTriggeredToday) candidates.forEach((slot) => fired.add(slot));
        } else if (schedule.hasBeenTriggered) {
            candidates.forEach((slot) => fired.add(slot));
        }
    }

    return candidates.filter((slot) => !fired.has(slot));
}

async function checkGeminiSchedules() {
    const { [GEMINI_SCHEDULES_KEY]: schedules = [] } = await chrome.storage.local.get(GEMINI_SCHEDULES_KEY);
    if (schedules.length === 0) return;

    const now = new Date();
    let storageNeedsUpdate = false;

    // We get the session conversations ONLY ONCE at the start.
    const { [GEMINI_SESSION_CONVERSATIONS_KEY]: sessionConvs = [] } = await chrome.storage.session.get(
        GEMINI_SESSION_CONVERSATIONS_KEY,
    );

    const updatedSchedulesPromises = schedules.map(async (schedule) => {
        // Trigger logic (unchanged)
        if (schedule.lastTriggered && now.getTime() - new Date(schedule.lastTriggered).getTime() < 60000) {
            return schedule;
        }
        const pendingSlots = dueGeminiSlots(schedule, now);
        const shouldTrigger = pendingSlots.length > 0;

        if (shouldTrigger) {
            logMessage(
                `[Scheduler] Launching scheduled Gemini task: "${schedule.query}" with title: "${schedule.title}"`,
            );

            const firstEntry = {
                id: Date.now() + Math.random(),
                query: schedule.query,
                isLoading: true,
                data: null,
            };

            // 1. Look for an existing conversation with the same title in the current session.
            // console.error("sessionConvs: ", sessionConvs, "c.title: ", c.title, "===", schedule.title, "schedule.title" );
            let existingConv = sessionConvs.find((c) => c.title === schedule.title);

            if (existingConv) {
                // 2. If it exists, APPEND the new entry to the existing conversation.
                logMessage(`[Scheduler] An existing conversation with title "${schedule.title}" was found. Appending.`);
                existingConv.entryIds.push(firstEntry.id);
                existingConv.timestamp = firstEntry.id; // We update it to be the most recent
                existingConv.isRead = false; // We mark it as unread
            } else {
                // 3. If it doesn't exist, we CREATE a new session conversation.
                logMessage(`[Scheduler] No conversation was found. Creating a new one for "${schedule.title}".`);
                const newSessionConversation = {
                    title: schedule.title,
                    entryIds: [firstEntry.id],
                    timestamp: firstEntry.id,
                    isTemporary: true,
                    isScheduled: true,
                    isRead: false,
                };
                sessionConvs.push(newSessionConversation);
            }

            // 4. We save the session conversations array (either modified or with a new element).
            await chrome.storage.session.set({ [GEMINI_SESSION_CONVERSATIONS_KEY]: sessionConvs });

            await saveGeminiEntryToDb(firstEntry);

            chrome.runtime.sendMessage({
                action: 'geminiQueryStarted',
                entry: firstEntry,
            });

            const response = await fetchGeminiResponse(schedule.query);

            if (response.success) {
                firstEntry.isLoading = false;
                firstEntry.data = response;

                await saveGeminiEntryToDb(firstEntry);

                logMessage(`[Scheduler] Notifying UI about completed Gemini entry for query: "${schedule.query}"`);

                chrome.runtime.sendMessage({
                    action: 'geminiQueryCompleted',
                    entry: firstEntry,
                });

                chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });

                const shortAnswer = response.answer.substring(0, 150) + (response.answer.length > 150 ? '...' : '');
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '/assets/icons/icon128.png',
                    title: getI18nMsg('geminiResponseTitle', [schedule.title]) || `Gemini Response: ${schedule.title}`,
                    message: `Query: "${schedule.query}"\nAnswer: ${shortAnswer}`,
                });

                // Every run that was due is written off, not just the one that fired:
                // if the browser was closed over two of them, the query is launched
                // once rather than firing a burst on the way back.
                schedule.firedSlots = [...(schedule.firedSlots || []), ...pendingSlots].slice(-50);
                if (schedule.type === 'repeating') {
                    schedule.lastTriggered = now.toISOString();
                } else {
                    const allTimes = geminiScheduleTimes(schedule);
                    schedule.hasBeenTriggered = schedule.firedSlots.length >= allTimes.length;
                }
                storageNeedsUpdate = true;
            } else {
                const errorEntry = { ...firstEntry, isLoading: false, data: { error: response.error } };
                await saveGeminiEntryToDb(errorEntry);
                chrome.runtime.sendMessage({ action: 'geminiQueryCompleted', entry: errorEntry });
                chrome.runtime.sendMessage({ action: 'geminiConversationUpdated' });

                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '/assets/icons/icon128.png',
                    title: getI18nMsg('geminiTaskError') || 'Gemini Task Error',
                    message: `Could not execute query: "${schedule.query}". Error: ${response.error}`,
                });
                if (schedule.type === 'onetime') {
                    schedule.hasBeenTriggered = true;
                    storageNeedsUpdate = true;
                }
            }
        }
        return schedule;
    });

    const updatedSchedules = await Promise.all(updatedSchedulesPromises);

    const finalSchedules = updatedSchedules.filter((schedule) => {
        if (schedule.type === 'onetime' && schedule.hasBeenTriggered) {
            storageNeedsUpdate = true;
            return false;
        }
        return true;
    });

    if (storageNeedsUpdate) {
        await chrome.storage.local.set({ [GEMINI_SCHEDULES_KEY]: finalSchedules });
    }
}

async function saveScreenshotToDb(screenshot) {
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

async function deleteScreenshotFromDb(id) {
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

async function cleanupOrphanScreenshots() {
    logMessage('[Cleanup] Starting orphan screenshot cleanup process.');
    try {
        const allGroups = await chrome.tabGroups.query({});
        const allTabs = await chrome.tabs.query({});
        const { [SCREENSHOT_STORAGE_KEY]: storedScreenshots = {} } =
            await chrome.storage.session.get(SCREENSHOT_STORAGE_KEY);

        if (Object.keys(storedScreenshots).length === 0) {
            logMessage('[Cleanup] No screenshots found in session storage. Nothing to clean.');
            return;
        }

        const validKeys = new Set();
        const tabsByGroupId = allTabs.reduce((acc, tab) => {
            if (tab.groupId !== -1) {
                (acc[tab.groupId] = acc[tab.groupId] || []).push(tab);
            }
            return acc;
        }, {});

        allGroups.forEach((group) => {
            validKeys.add(`g_${group.id}`);
            const tabsInGroup = tabsByGroupId[group.id] || [];
            tabsInGroup.forEach((tab) => {
                try {
                    const domain = new URL(tab.url).hostname.replace(/^www\./, '');
                    validKeys.add(`s_${group.id}_${domain}`);
                } catch {
                    /* ignore invalid URLs */
                }
            });
        });

        const updatedScreenshots = { ...storedScreenshots };
        let screenshotIdsToDelete = [];
        let cleanedKeysCount = 0;

        for (const key in updatedScreenshots) {
            if (!validKeys.has(key)) {
                logMessage(`[Cleanup] Found orphan screenshot key: ${key}. Marking for deletion.`);
                screenshotIdsToDelete.push(...updatedScreenshots[key].map((s) => s.id));
                delete updatedScreenshots[key];
                cleanedKeysCount++;
            }
        }

        screenshotIdsToDelete = [...new Set(screenshotIdsToDelete)];

        if (screenshotIdsToDelete.length > 0) {
            logMessage(`[Cleanup] Deleting ${screenshotIdsToDelete.length} orphan screenshots from IndexedDB.`);
            for (const screenshotId of screenshotIdsToDelete) {
                await deleteScreenshotFromDb(screenshotId);
            }

            await chrome.storage.session.set({ [SCREENSHOT_STORAGE_KEY]: updatedScreenshots });
            logMessage(`[Cleanup] Removed ${cleanedKeysCount} orphan keys from session storage.`);
        } else {
            logMessage('[Cleanup] No orphan screenshots found to delete.');
        }
    } catch (error) {
        console.error('[Cleanup] Error during orphan screenshot cleanup:', error);
    }
}

async function saveBackupToDb(backupData) {
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

async function getAllBackupsFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([BACKUPS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(BACKUPS_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (event) => resolve(event.target.result || []);
        request.onerror = (event) => {
            console.error('Error fetching all backups from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function getBackupFromDb(groupId) {
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

async function deleteBackupFromDb(groupId) {
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
