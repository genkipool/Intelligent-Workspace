/**
 * notesService.js — Refactored from notes.js
 *
 * Contains ALL exported functions from notes.js with:
 * - state.X → store imports from appStore.svelte.js (via get())
 * - dom.X → direct document.getElementById/querySelector
 * - fn.X() → direct function imports
 * - STORAGE_KEYS from state.js
 */

import { get } from 'svelte/store';
import { tick } from 'svelte';

/** Waits for a node that a Svelte view mounts in response to a store change. */
async function waitForElement(selector, attempts = 30) {
    for (let i = 0; i < attempts; i++) {
        const el = document.querySelector(selector);
        if (el) return el;
        await tick();
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return null;
}

import { applyTranslations, showNotification } from '../../utils/i18n.js';
import { bindModalSaveButton } from '../../utils/modal-save-close.js';
import { openModal, showNoteModal } from '@/ui/stores/modalStore.js';
import { renderNoteEntry as renderNoteEntryFromModule } from '../content-renderer/content-renderer.js';

import {
    getScreenshotFromDb,
    getAllScreenshotIdsFromDb,
    getNoteFromDb,
    saveNoteToDb,
    deleteNoteFromDb,
    getAllNoteIdsFromDb,
} from '../../utils/db.js';

import { STORAGE_KEYS } from './constants.js';
import { getGroupInfoMap, autolink, animateAndRemove } from './utils.js';

import {
    isNotesViewActive,
    currentNotesContext,
    activeNoteFilters,
    currentSpeechUtterance,
    currentlySpeakingEntryId,
    speechKeepAliveInterval,
    isSpeechPaused,
} from '../stores/appStore.svelte.js';

import { listGroupStore } from '../stores/listGroupStore.js';
import { createUtterance, startKeepAlive, splitIntoSpeechChunks } from './speechService.js';

import { fetchData, renderGroups, updateDuplicateCountBadge } from './groupsService.js';
import { htmlToSpeechText } from './geminiService.js';
import {
    closeUrlInPanel,
    updateHeaderButtonsVisibility,
    updateScrollButtons,
    updateBackButtonTooltip,
    restoreMainView,
    openUrlInPanel,
    showWelcomeMessage,
    updateExpandAllButtonState,
} from './viewsService.js';
import { applySearchAndFilter } from './searchService.js';
import { showScreenshotGallery } from './screenshotsService.js';

/**
 * The notes and screenshots whose group or subgroup no longer exists.
 *
 * They are what the indicators at the top of the list count, and what the orphan
 * views show, so both read them from here.
 */
export async function getOrphanContent() {
    const allGroupDataRaw = await fetchData();
    const groupInfoMap = await getGroupInfoMap();

    const existingContextKeys = new Set();

    for (const item of allGroupDataRaw) {
        if (item.group.id === -100) {
            existingContextKeys.add('g_ungrouped');
            const domainsInUngrouped = new Set(
                item.tabs
                    .map((tab) => {
                        try {
                            return new URL(tab.url).hostname.replace(/^www\./, '');
                        } catch {
                            return null;
                        }
                    })
                    .filter(Boolean),
            );
            domainsInUngrouped.forEach((domain) => existingContextKeys.add(`s_ungrouped_${domain}`));
            continue;
        }

        const groupInfo = groupInfoMap.get(item.group.id);
        // The key the notes were filed under comes from the background's map, but a
        // group re-created by hand is on screen before the background has registered
        // it. Its title is the key a manual group gets, so counting it too is what
        // sends the notes home as soon as the group is back.
        const keys = new Set();
        if (groupInfo?.key) keys.add(groupInfo.key);
        const titleKey = (item.group.title || '').replace(/\u200B/g, '').trim();
        if (titleKey) keys.add(titleKey);
        if (keys.size === 0) continue;

        const domainsInGroup = new Set(
            item.tabs
                .map((tab) => {
                    try {
                        return new URL(tab.url).hostname.replace(/^www\./, '');
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean),
        );

        for (const key of keys) {
            existingContextKeys.add(`g_${key}`);
            domainsInGroup.forEach((domain) => existingContextKeys.add(`s_${key}_${domain}`));
        }
    }

    const allNoteIds = await getAllNoteIdsFromDb();
    const notePromises = allNoteIds.map((id) => getNoteFromDb(id));
    const allNotes = (await Promise.all(notePromises)).filter(Boolean);

    existingContextKeys.add('g_pomodoro');

    const orphanNotes = allNotes.filter((note) => note.contextKey && !existingContextKeys.has(note.contextKey));

    const allScreenshotIds = await getAllScreenshotIdsFromDb();
    const screenshotPromises = allScreenshotIds.map((id) => getScreenshotFromDb(id));
    const allScreenshots = (await Promise.all(screenshotPromises)).filter(Boolean);

    const orphanScreenshots = allScreenshots.filter(
        (screenshot) => screenshot.contextKey && !existingContextKeys.has(screenshot.contextKey),
    );

    return { orphanNotes, orphanScreenshots };
}

/**
 * Files every stored note and screenshot under the session key of the group that owns
 * it right now.
 *
 * Notes and images are saved in the database against a stable key built from the group
 * title, but the views look them up by the group's numeric id of this session. Delete a
 * group and create it again and that number changes, so its content stayed unreachable
 * from the card even though it was never lost. The original rebuilt this map on every
 * render; this is that pass.
 */
export async function syncContentSessionKeys() {
    const allGroupData = await fetchData();
    const groupInfoMap = await getGroupInfoMap();

    const normalizeText = (text) =>
        !text
            ? ''
            : text
                  .replace(/^(g_|s_)/, '')
                  .replace(/[\u200B\s]+/g, '')
                  .trim();

    const nameToGroupIdMap = new Map();
    for (const [id, info] of groupInfoMap.entries()) {
        nameToGroupIdMap.set(String(id), id);
        if (info.key) nameToGroupIdMap.set(normalizeText(info.key), id);
        if (info.title) nameToGroupIdMap.set(normalizeText(info.title), id);
    }
    allGroupData.forEach((item) => {
        nameToGroupIdMap.set(String(item.group.id), item.group.id);
        const cleanTitle = normalizeText(item.group.title);
        if (cleanTitle) nameToGroupIdMap.set(cleanTitle, item.group.id);
    });

    const knownGroupNames = Array.from(nameToGroupIdMap.keys()).sort((a, b) => b.length - a.length);

    const resolveSessionKeyFromDbKey = (dbContextKey) => {
        if (!dbContextKey) return null;
        if (dbContextKey.includes('ungrouped')) return dbContextKey;

        if (dbContextKey.startsWith('g_')) {
            const nameInDb = normalizeText(dbContextKey);
            if (nameToGroupIdMap.has(nameInDb)) return `g_${nameToGroupIdMap.get(nameInDb)}`;
        } else if (dbContextKey.startsWith('s_')) {
            const content = dbContextKey.substring(2);
            for (const groupName of knownGroupNames) {
                if (groupName && normalizeText(content).startsWith(groupName)) {
                    const parts = content.split('_');
                    return `s_${nameToGroupIdMap.get(groupName)}_${parts[parts.length - 1]}`;
                }
            }
        }
        return null;
    };

    const { [STORAGE_KEYS.NOTES]: notesData = {} } = await chrome.storage.session.get(STORAGE_KEYS.NOTES);
    const { [STORAGE_KEYS.SCREENSHOTS]: screenshotData = {} } = await chrome.storage.session.get(
        STORAGE_KEYS.SCREENSHOTS,
    );

    const fileUnderSessionKey = (index, item) => {
        const sessionKey = resolveSessionKeyFromDbKey(item.contextKey);
        if (!sessionKey) return;
        if (!index[sessionKey]) index[sessionKey] = [];
        if (!index[sessionKey].includes(item.id)) index[sessionKey].push(item.id);
    };

    const noteIds = await getAllNoteIdsFromDb();
    const notes = (await Promise.all(noteIds.map((id) => getNoteFromDb(id)))).filter(Boolean);
    notes.forEach((note) => fileUnderSessionKey(notesData, note));

    const screenshotIds = await getAllScreenshotIdsFromDb();
    const screenshots = (await Promise.all(screenshotIds.map((id) => getScreenshotFromDb(id)))).filter(Boolean);
    screenshots.forEach((screenshot) => fileUnderSessionKey(screenshotData, screenshot));

    await chrome.storage.session.set({
        [STORAGE_KEYS.NOTES]: notesData,
        [STORAGE_KEYS.SCREENSHOTS]: screenshotData,
    });
}

export async function getOrphanNotes() {
    return (await getOrphanContent()).orphanNotes;
}

export async function getOrphanScreenshots() {
    return (await getOrphanContent()).orphanScreenshots;
}

export async function updateOrphanIndicators() {
    const hiddenContextContainer = document.getElementById('hidden-context-container');
    if (!hiddenContextContainer) return;

    const { orphanNotes, orphanScreenshots } = await getOrphanContent();

    const currentNotesIndicator = hiddenContextContainer.querySelector('#orphan-notes-btn');
    if (orphanNotes.length > 0) {
        if (currentNotesIndicator) {
            currentNotesIndicator.querySelector('.note-count-badge').textContent = orphanNotes.length;
            const newIndicator = currentNotesIndicator.cloneNode(true);
            newIndicator.addEventListener('click', () => handleOrphanNotesClick(orphanNotes));
            currentNotesIndicator.parentNode.replaceChild(newIndicator, currentNotesIndicator);
        } else {
            const notesIndicatorTemplate = document.getElementById('orphan-notes-btn-template');
            if (notesIndicatorTemplate) {
                const notesIndicator = notesIndicatorTemplate.content.cloneNode(true).firstElementChild;
                notesIndicator.querySelector('.note-count-badge').textContent = orphanNotes.length;
                notesIndicator.addEventListener('click', () => handleOrphanNotesClick(orphanNotes));
                hiddenContextContainer.appendChild(notesIndicator);
            }
        }
    } else if (currentNotesIndicator) {
        currentNotesIndicator.remove();
    }

    const currentScreenshotsIndicator = hiddenContextContainer.querySelector('#orphan-screenshots-btn');
    if (orphanScreenshots.length > 0) {
        if (currentScreenshotsIndicator) {
            currentScreenshotsIndicator.querySelector('.screenshot-count-badge').textContent = orphanScreenshots.length;
            const newIndicator = currentScreenshotsIndicator.cloneNode(true);
            newIndicator.addEventListener('click', () => handleOrphanScreenshotsClick(orphanScreenshots));
            currentScreenshotsIndicator.parentNode.replaceChild(newIndicator, currentScreenshotsIndicator);
        } else {
            const screenshotsIndicatorTemplate = document.getElementById('orphan-screenshots-btn-template');
            if (screenshotsIndicatorTemplate) {
                const screenshotsIndicator = screenshotsIndicatorTemplate.content.cloneNode(true).firstElementChild;
                screenshotsIndicator.querySelector('.screenshot-count-badge').textContent = orphanScreenshots.length;
                screenshotsIndicator.addEventListener('click', () => handleOrphanScreenshotsClick(orphanScreenshots));
                hiddenContextContainer.appendChild(screenshotsIndicator);
            }
        }
    } else if (currentScreenshotsIndicator) {
        currentScreenshotsIndicator.remove();
    }

    hiddenContextContainer.classList.toggle('hidden', hiddenContextContainer.childElementCount === 0);
    applyTranslations(hiddenContextContainer);
}

export async function toggleNotePersistence(noteToToggle) {
    if (!noteToToggle) return;

    const isCurrentlyPersistent = noteToToggle.isPersistent || false;
    noteToToggle.isPersistent = !isCurrentlyPersistent;

    await saveNoteToDb(noteToToggle);

    const { [STORAGE_KEYS.PERSISTENT_NOTES]: currentIds = [] } = await chrome.storage.local.get(
        STORAGE_KEYS.PERSISTENT_NOTES,
    );
    const persistentSet = new Set(currentIds);

    if (noteToToggle.isPersistent) {
        persistentSet.add(noteToToggle.id);
        showNotification('archivedNote');
    } else {
        persistentSet.delete(noteToToggle.id);
        showNotification('unarchivedNote');
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.PERSISTENT_NOTES]: Array.from(persistentSet) });

    await updateOrphanIndicators();

    if (get(isNotesViewActive)) {
        const noteElement = document.querySelector(`.note-entry[data-note-id="${noteToToggle.id}"]`);
        if (noteElement) {
            const pinBtn = noteElement.querySelector('.archived-note-btn');
            if (pinBtn) {
                pinBtn.classList.toggle('active', noteToToggle.isPersistent);
                const pinTooltipKey = noteToToggle.isPersistent ? 'unarchivedNoteTitle' : 'archivedNoteTitle';
                pinBtn.setAttribute('data-i18n-title', pinTooltipKey);
                applyTranslations(pinBtn);
            }
        }
    }
}

export async function handleOrphanNotesClick(orphanNotes) {
    if (orphanNotes.length > 0) {
        await showNotesView({ type: 'orphan' }, orphanNotes);
    }
}

export async function handleOrphanScreenshotsClick(orphanScreenshots) {
    if (orphanScreenshots.length > 0) {
        await showScreenshotGallery('orphan', null, null, orphanScreenshots);
    }
}

export function getNoteHandlers(context) {
    return {
        onEdit: openNoteModal,
        onCopy: (note) => {
            let textToRead = '';
            if (note.type === 'checklist' && Array.isArray(note.content)) {
                textToRead = note.content.map((item) => `${item.checked ? '[x]' : '[ ]'} ${item.text}`).join('\n');
            } else if (note.type === 'kanban' && Array.isArray(note.content)) {
                const stateLabels = {
                    todo: chrome.i18n.getMessage('kanbanDefaultTodo') || 'To Do',
                    inprogress: chrome.i18n.getMessage('kanbanDefaultInProgress') || 'In Progress',
                    done: chrome.i18n.getMessage('kanbanDefaultDone') || 'Done',
                };
                textToRead = note.content
                    .map((item) => `[${stateLabels[item.state] || item.state}] ${item.text}`)
                    .join('\n');
            } else {
                textToRead = note.content;
            }
            navigator.clipboard.writeText(`${note.title}\n\n${textToRead}`);
            showNotification('noteCopied');
        },
        onDelete: deleteNote,
        onUpdate: async (updatedNote) => {
            await saveNoteToDb(updatedNote);
        },
        onReadAloud: (note, readBtn) => {
            let textChunks = [];
            let currentChunkIndex = 0;
            let isCancelled = false;

            const readAloudTitle = chrome.i18n.getMessage('readAloud') || 'Play';
            const stopReadingTitle = chrome.i18n.getMessage('stopReadingAloud') || 'Stop reading';

            const resetSpeechState = (buttonToReset) => {
                const interval = get(speechKeepAliveInterval);
                if (interval) {
                    clearInterval(interval);
                    speechKeepAliveInterval.set(null);
                }
                buttonToReset.classList.remove('reading', 'paused', 'ctrl-held');
                buttonToReset.setAttribute('data-i18n-title', 'readAloud');
                buttonToReset.title = readAloudTitle;
                currentlySpeakingEntryId.set(null);
                isSpeechPaused.set(false);
            };

            const isReading = readBtn.classList.contains('reading');
            const isPaused = readBtn.classList.contains('paused');

            if (isReading && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                isCancelled = true;
                speechSynthesis.cancel();
                resetSpeechState(readBtn);
                return;
            }

            if (isReading && isPaused) {
                speechSynthesis.resume();
                readBtn.classList.remove('paused');
                readBtn.title = stopReadingTitle;
                isSpeechPaused.set(false);
                const existingInterval = get(speechKeepAliveInterval);
                if (existingInterval) clearInterval(existingInterval);
                speechKeepAliveInterval.set(startKeepAlive());
                return;
            }

            if (isReading) {
                speechSynthesis.pause();
                readBtn.classList.add('paused');
                readBtn.title = readAloudTitle;
                isSpeechPaused.set(true);
                const interval = get(speechKeepAliveInterval);
                if (interval) {
                    clearInterval(interval);
                    speechKeepAliveInterval.set(null);
                }
                return;
            }

            if (!isReading) {
                if (speechSynthesis.speaking) {
                    isCancelled = true;
                    speechSynthesis.cancel();
                    document.querySelectorAll('.read-aloud-btn.reading').forEach((btn) => resetSpeechState(btn));
                }

                currentlySpeakingEntryId.set(note.id);
                isCancelled = false;
                currentChunkIndex = 0;
                isSpeechPaused.set(false);

                let textToRead = '';
                const noteTitle = note.title || '';

                switch (note.type) {
                    case 'checklist':
                        const statusCompleted = chrome.i18n.getMessage('ttsChecklistCompleted') || 'completed';
                        const statusPending = chrome.i18n.getMessage('ttsChecklistPending') || 'pending';
                        textToRead = noteTitle + '. ';
                        if (Array.isArray(note.content)) {
                            textToRead += note.content
                                .map((item) => `${item.text}, ${item.checked ? statusCompleted : statusPending}.`)
                                .join(' ');
                        }
                        break;

                    case 'kanban':
                        const stateLabels = {
                            todo: chrome.i18n.getMessage('kanbanDefaultTodo') || 'To Do',
                            inprogress: chrome.i18n.getMessage('kanbanDefaultInProgress') || 'In Progress',
                            done: chrome.i18n.getMessage('kanbanDefaultDone') || 'Done',
                        };
                        textToRead = noteTitle + '. ';
                        if (Array.isArray(note.content)) {
                            textToRead += note.content
                                .map((item) => `${item.text}, ${stateLabels[item.state || 'todo']}.`)
                                .join(' ');
                        }
                        break;

                    case 'text':
                    default:
                        const readableContent = htmlToSpeechText(note.content);
                        textToRead = `${noteTitle}. ${readableContent}`;
                        break;
                }

                textChunks = splitIntoSpeechChunks(textToRead);
                if (textChunks.length === 0) return;

                const speakNextChunk = () => {
                    if (isCancelled || currentChunkIndex >= textChunks.length) {
                        resetSpeechState(readBtn);
                        return;
                    }
                    const chunk = textChunks[currentChunkIndex];
                    currentSpeechUtterance.set(createUtterance(chunk));
                    const utterance = get(currentSpeechUtterance);
                    utterance.onend = speakNextChunk;
                    utterance.onerror = (event) => {
                        const interval = get(speechKeepAliveInterval);
                        if (interval) clearInterval(interval);
                        if (event.error === 'interrupted') return;
                        console.error('Error in speech synthesis:', event.error);
                        showNotification('errorReadingAloud', true);
                    };
                    speechSynthesis.speak(utterance);
                    currentChunkIndex++;
                };

                readBtn.classList.add('reading');
                readBtn.setAttribute('data-i18n-title', 'stopReadingAloud');
                readBtn.title = stopReadingTitle;

                speakNextChunk();

                const existingInterval = get(speechKeepAliveInterval);
                if (existingInterval) clearInterval(existingInterval);
                speechKeepAliveInterval.set(startKeepAlive());
            }
        },
        onFilter: handleNoteFilter,
        onTogglePersistence: toggleNotePersistence,
        onOpenFileInPanel: openUrlInPanel,
    };
}

export async function showNotesView(context, orphanNotes = null) {
    closeUrlInPanel(true);

    const groupListContainer = document.getElementById('groups-list');
    const hiddenGroupsContainer = document.getElementById('hidden-groups-container');
    const hiddenContextContainer = document.getElementById('hidden-context-container');
    if (groupListContainer) groupListContainer.style.display = 'none';
    if (hiddenGroupsContainer) hiddenGroupsContainer.style.display = 'none';
    if (hiddenContextContainer) hiddenContextContainer.style.display = 'none';

    // NotesView mounts and unmounts #notes-view from listGroupState; it must not be
    // removed by hand.
    isNotesViewActive.set(true);
    currentNotesContext.set(context);
    const mainHeaderTitle = document.getElementById('main-header-title');
    if (mainHeaderTitle) {
        // The attribute alone does not repaint the title; it has to be translated now.
        mainHeaderTitle.setAttribute('data-i18n', 'notesViewTitle');
        applyTranslations(mainHeaderTitle);
    }
    let notes;
    if (context.type === 'orphan' && orphanNotes) {
        notes = orphanNotes;
    } else if (context.type === 'pomodoro') {
        const sessionResult = await chrome.storage.session.get(STORAGE_KEYS.NOTES);
        const allNotesIndex = sessionResult[STORAGE_KEYS.NOTES] || {};
        const pomoNoteIds = allNotesIndex['g_pomodoro'] || [];
        const pomoNotePromises = pomoNoteIds.map((id) => getNoteFromDb(id));
        const pomoNotes = (await Promise.all(pomoNotePromises)).filter(Boolean);

        const allNoteIds = await getAllNoteIdsFromDb();
        const allNotePromises = allNoteIds.map((id) => getNoteFromDb(id));
        const allNotes = (await Promise.all(allNotePromises)).filter(Boolean);
        const extraPomoNotes = allNotes.filter((n) => n.pomoData && !pomoNoteIds.includes(n.id));
        notes = [...pomoNotes, ...extraPomoNotes];
    } else {
        const { type, id, secondaryId } = context;
        const sessionResult = await chrome.storage.session.get(STORAGE_KEYS.NOTES);
        const allNotesIndex = sessionResult[STORAGE_KEYS.NOTES] || {};

        let noteIdsSet = new Set();
        const isUngroupedContext = (type === 'group' && id === -100) || (type === 'subgroup' && secondaryId === -100);

        if (isUngroupedContext) {
            if (type === 'group') {
                const groupKey = 'g_ungrouped';
                if (allNotesIndex[groupKey]) {
                    allNotesIndex[groupKey].forEach((noteId) => noteIdsSet.add(noteId));
                }
                const subgroupPrefix = 's_ungrouped_';
                for (const key in allNotesIndex) {
                    if (key.startsWith(subgroupPrefix)) {
                        allNotesIndex[key].forEach((noteId) => noteIdsSet.add(noteId));
                    }
                }
            } else {
                const key = `s_ungrouped_${id}`;
                if (allNotesIndex[key]) {
                    allNotesIndex[key].forEach((noteId) => noteIdsSet.add(noteId));
                }
            }
        } else {
            const groupSessionKey = type === 'group' ? `g_${id}` : `g_${secondaryId}`;
            const subgroupSessionKey = type === 'subgroup' ? `s_${secondaryId}_${id}` : null;

            if (type === 'group') {
                if (allNotesIndex[groupSessionKey]) {
                    allNotesIndex[groupSessionKey].forEach((noteId) => noteIdsSet.add(noteId));
                }
                const subgroupPrefix = `s_${id}_`;
                for (const key in allNotesIndex) {
                    if (key.startsWith(subgroupPrefix)) {
                        allNotesIndex[key].forEach((noteId) => noteIdsSet.add(noteId));
                    }
                }
            } else {
                if (allNotesIndex[subgroupSessionKey]) {
                    allNotesIndex[subgroupSessionKey].forEach((noteId) => noteIdsSet.add(noteId));
                }
            }
        }

        const { [STORAGE_KEYS.PERSISTENT_NOTES]: persistentNoteIdsArray = [] } = await chrome.storage.local.get(
            STORAGE_KEYS.PERSISTENT_NOTES,
        );

        if (persistentNoteIdsArray.length > 0) {
            const groupInfoMap = await getGroupInfoMap();
            const groupId = type === 'group' ? id : secondaryId;
            const groupInfo = groupInfoMap.get(groupId);

            if (groupInfo && groupInfo.key) {
                const stableGroupKey = groupInfo.key;

                const persistentNotePromises = persistentNoteIdsArray.map((noteId) => getNoteFromDb(noteId));
                const allPersistentNotes = (await Promise.all(persistentNotePromises)).filter(Boolean);

                allPersistentNotes.forEach((note) => {
                    const { contextKey } = note;
                    if (!contextKey) return;

                    let isMatch = false;
                    if (type === 'group') {
                        const groupContextKey = `g_${stableGroupKey}`;
                        const subgroupPrefix = `s_${stableGroupKey}_`;
                        if (contextKey === groupContextKey || contextKey.startsWith(subgroupPrefix)) {
                            isMatch = true;
                        }
                    } else {
                        const subgroupContextKey = `s_${stableGroupKey}_${id}`;
                        if (contextKey === subgroupContextKey) {
                            isMatch = true;
                        }
                    }

                    if (isMatch) {
                        noteIdsSet.add(note.id);
                    }
                });
            }
        }

        const noteIds = Array.from(noteIdsSet);
        const notePromises = noteIds.map((noteId) => getNoteFromDb(noteId));
        notes = (await Promise.all(notePromises)).filter(Boolean);
    }

    listGroupStore.updateState({
        isNotesViewActive: true,
        currentNotesContext: context,
    });

    await renderNotesList(notes, context);

    updateHeaderButtonsVisibility();
    updateDuplicateCountBadge();
    updateScrollButtons();
    updateBackButtonTooltip();
}

/**
 * Fills #notes-list-container with the note cards. The container is mounted by
 * NotesView, so we wait a tick for it before writing into it.
 */
async function renderNotesList(notes, context) {
    const listContainer = await waitForElement('#notes-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (!notes || notes.length === 0) {
        showWelcomeMessage(listContainer, 'notes');
        return;
    }

    notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const handlers = getNoteHandlers(context);
    const isOrphan = context.type === 'orphan';
    const isPomodoro = context.type === 'pomodoro';

    notes.forEach((note) => {
        const noteContext = isOrphan
            ? { title: chrome.i18n.getMessage('orphanNoteTitle') || 'Orphan Note', isOrphan: true }
            : context;
        const noteEntry = renderNoteEntryFromModule(note, noteContext, handlers);
        const domainSpan = noteEntry.querySelector('.entry-footer .entry-domain');

        if (domainSpan) {
            const { contextKey } = note;
            if (isPomodoro) {
                domainSpan.style.display = 'none';
            } else if (isOrphan) {
                let orphanContextText = chrome.i18n.getMessage('orphanNoteContext') || 'Context Lost';
                if (contextKey) {
                    const parts = contextKey.split('_');
                    if (contextKey.startsWith('g_') && parts.length > 1) {
                        orphanContextText = parts.slice(1).join('_');
                    } else if (contextKey.startsWith('s_') && parts.length > 2) {
                        orphanContextText = parts.slice(2).join('_');
                    }
                }
                domainSpan.textContent = orphanContextText;
                domainSpan.classList.add('is-orphan');
            } else if (contextKey && contextKey.startsWith('s_')) {
                const parts = contextKey.split('_');
                if (parts.length >= 3) domainSpan.textContent = parts.slice(2).join('_');
                else domainSpan.style.display = 'none';
            } else {
                domainSpan.textContent = context.title;
                domainSpan.classList.add('is-group-title');
            }
        }
        listContainer.appendChild(noteEntry);
    });

    applyTranslations(document.getElementById('notes-view'));
}

export function closeNotesView(isSwitchingView = false) {
    isNotesViewActive.set(false);
    currentNotesContext.set(null);
    activeNoteFilters.set({ cat: null, context: null, type: null, pomo: null });

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    listGroupStore.updateState({
        isNotesViewActive: false,
        currentNotesContext: null,
        activeNoteFilters: { cat: null, context: null, type: null, pomo: null },
    });

    if (!isSwitchingView) {
        restoreMainView();
    }
}

export async function deleteNote(noteId) {
    const noteEl = document.querySelector(`.note-entry[data-note-id="${noteId}"]`);
    if (noteEl) {
        animateAndRemove(noteEl, false);
    }

    const noteToDelete = await getNoteFromDb(noteId);
    await deleteNoteFromDb(noteId);

    if (noteToDelete && noteToDelete.isPersistent) {
        const { [STORAGE_KEYS.PERSISTENT_NOTES]: currentIds = [] } = await chrome.storage.local.get(
            STORAGE_KEYS.PERSISTENT_NOTES,
        );
        const persistentSet = new Set(currentIds);
        if (persistentSet.has(noteId)) {
            persistentSet.delete(noteId);
            await chrome.storage.local.set({
                [STORAGE_KEYS.PERSISTENT_NOTES]: Array.from(persistentSet),
            });
        }
    }

    const sessionResult = await chrome.storage.session.get(STORAGE_KEYS.NOTES);
    const allNotesIndex = sessionResult[STORAGE_KEYS.NOTES] || {};
    let wasDeleted = false;
    for (const key in allNotesIndex) {
        const initialLength = allNotesIndex[key].length;
        allNotesIndex[key] = allNotesIndex[key].filter((id) => id !== noteId);
        if (allNotesIndex[key].length < initialLength) {
            wasDeleted = true;
        }
        if (allNotesIndex[key].length === 0) {
            delete allNotesIndex[key];
        }
    }
    if (wasDeleted) {
        await chrome.storage.session.set({
            [STORAGE_KEYS.NOTES]: allNotesIndex,
        });
    }

    showNotification('noteDeleted');

    if (get(isNotesViewActive)) {
        const context = get(currentNotesContext);
        if (context?.type === 'orphan') {
            // Orphans are not filed under any context key, so asking for them by
            // context returns nothing and the view emptied after deleting one note.
            // What is left is every note whose context no longer exists.
            const remaining = await getOrphanNotes();
            if (remaining.length > 0) await showNotesView(context, remaining);
            else await closeNotesView();
        } else {
            await showNotesView(context);
        }
    }

    await updateOrphanIndicators();
    await renderGroups();
}

export function validateNoteForm(modalContent) {
    if (!modalContent) return false;

    const titleInput = modalContent.querySelector('#note-title-input');
    const saveBtn = modalContent.querySelector('.modal-btn-save');
    const activeType = modalContent.querySelector('.note-type-btn.active').dataset.type;
    const addChecklistItemBtn = modalContent.querySelector('#add-checklist-item-btn');
    const addKanbanItemBtn = modalContent.querySelector('#add-kanban-item-btn');

    let isValid = true;
    let hasListError = false;

    if (titleInput.value.trim() === '') {
        isValid = false;
        titleInput.classList.add('input-error');
    } else {
        titleInput.classList.remove('input-error');
    }

    if (activeType === 'text') {
        const contentEditor = modalContent.querySelector('#note-content-editor');
        const hasContent = contentEditor.textContent.trim() !== '' || contentEditor.querySelector('img') !== null;
        if (!hasContent) {
            isValid = false;
            contentEditor.classList.add('input-error');
        } else {
            contentEditor.classList.remove('input-error');
        }
        addChecklistItemBtn.classList.remove('error-state-text');
        addKanbanItemBtn.classList.remove('error-state-text');
    } else {
        const itemInputs = modalContent.querySelectorAll('.checklist-item-input, .kanban-item-input');

        if (itemInputs.length === 0) {
            isValid = false;
            hasListError = true;
        } else {
            itemInputs.forEach((itemInput) => {
                if (itemInput.value.trim() === '') {
                    isValid = false;
                    hasListError = true;
                    itemInput.classList.add('input-error');
                } else {
                    itemInput.classList.remove('input-error');
                }
            });
        }

        if (activeType === 'checklist') {
            addChecklistItemBtn.classList.toggle('error-state-text', hasListError);
            addKanbanItemBtn.classList.remove('error-state-text');
        } else {
            addKanbanItemBtn.classList.toggle('error-state-text', hasListError);
            addChecklistItemBtn.classList.remove('error-state-text');
        }
    }

    saveBtn.classList.toggle('error-state', !isValid);

    return isValid;
}

export function handleNoteFilter(type, value) {
    const filters = get(activeNoteFilters);
    if (filters[type] === value) {
        filters[type] = null;
    } else {
        filters[type] = value;
    }
    activeNoteFilters.set(filters);
    applySearchAndFilter();
}

export async function openNoteModal(context, noteToEdit = null, options = {}) {
    openModal(showNoteModal, { context, note: noteToEdit, options });
}

export function closeNoteModal() {
    const modalOverlay = document.body.querySelector('.modal-overlay .note-modal')?.closest('.modal-overlay');
    if (modalOverlay) {
        modalOverlay.remove();
    }
}

export async function handleSaveNote(context, noteId = null, options = {}) {
    const modalContent = document.querySelector('.note-modal');
    if (!modalContent) return;

    const title = modalContent.querySelector('#note-title-input').value.trim();
    const activeType = modalContent.querySelector('.note-type-btn.active').dataset.type;
    let content;

    switch (activeType) {
        case 'checklist':
            content = Array.from(modalContent.querySelectorAll('.checklist-item'))
                .map((item) => ({
                    text: item.querySelector('.checklist-item-input').value,
                    checked: false,
                }))
                .filter((item) => item.text.trim());
            break;

        case 'kanban':
            content = Array.from(modalContent.querySelectorAll('.kanban-item'))
                .map((item) => ({
                    text: item.querySelector('.kanban-item-input').value,
                    state: item.querySelector('.kanban-item-state').dataset.state,
                }))
                .filter((item) => item.text.trim());
            break;

        default:
            const contentEditor = modalContent.querySelector('#note-content-editor');
            autolink(contentEditor);
            content = contentEditor.innerHTML.trim();
            break;
    }

    let selectedCategory = 'Work';
    const activeCategoryBtn = modalContent.querySelector('.note-categories .category-btn.active');

    if (activeCategoryBtn) {
        if (activeCategoryBtn.classList.contains('custom')) {
            const customValue = modalContent.querySelector('#note-custom-tag-input').value.trim();
            selectedCategory = customValue || activeCategoryBtn.dataset.category || 'Custom';
        } else {
            selectedCategory = activeCategoryBtn.dataset.category;
        }
    }

    const { type, id, secondaryId } = context;
    let contextKey;
    let sessionKey;

    if (type === 'orphan') {
        contextKey = 'g_pomodoro';
        sessionKey = 'g_pomodoro';
    } else if ((type === 'group' && id === -100) || (type === 'subgroup' && secondaryId === -100)) {
        if (type === 'group') {
            contextKey = 'g_ungrouped';
            sessionKey = 'g_ungrouped';
        } else {
            contextKey = `s_ungrouped_${id}`;
            sessionKey = `s_ungrouped_${id}`;
        }
    } else {
        const groupId = type === 'group' ? id : secondaryId;
        const groupInfoMap = await getGroupInfoMap();
        const groupInfo = groupInfoMap.get(groupId);

        if (!groupInfo || !groupInfo.key) {
            console.error('Could not find stable key for context. Note save canceled.', context);
            showNotification('errorSavingNote', true);
            return;
        }

        const stableGroupKey = groupInfo.key;
        contextKey = type === 'group' ? `g_${stableGroupKey}` : `s_${stableGroupKey}_${id}`;
        sessionKey = type === 'group' ? `g_${groupId}` : `s_${groupId}_${id}`;
    }

    const noteData = {
        id: noteId || Date.now() + Math.random(),
        title,
        content,
        category: selectedCategory,
        contextKey,
        type: activeType,
        modifiedTimestamp: new Date().toISOString(),
    };

    if (!noteId && window._pendingPomoData) {
        noteData.pomoData = { ...window._pendingPomoData };
        delete window._pendingPomoData;
    }

    if (noteId) {
        const existingNote = await getNoteFromDb(noteId);
        noteData.timestamp = existingNote ? existingNote.timestamp : noteData.modifiedTimestamp;
        noteData.isPersistent = existingNote ? existingNote.isPersistent : false;
    } else {
        noteData.timestamp = noteData.modifiedTimestamp;
        noteData.isPersistent = false;
    }

    await saveNoteToDb(noteData);

    if (noteData.pomoData && window._onPomoNoteSaved) {
        window._onPomoNoteSaved();
    }

    const sessionResult = await chrome.storage.session.get(STORAGE_KEYS.NOTES);
    const allNotesIndex = sessionResult[STORAGE_KEYS.NOTES] || {};

    if (!allNotesIndex[sessionKey]) allNotesIndex[sessionKey] = [];
    if (!allNotesIndex[sessionKey].includes(noteData.id)) {
        allNotesIndex[sessionKey].push(noteData.id);
    }
    await chrome.storage.session.set({ [STORAGE_KEYS.NOTES]: allNotesIndex });

    showNotification(noteId ? 'noteUpdated' : 'noteSaved');
    if (!options.keepOpen) {
        modalContent.closest('.modal-overlay')?.remove();
    }

    if (get(isNotesViewActive)) {
        await renderGroups();
        await showNotesView(get(currentNotesContext));
    } else {
        await renderGroups();
    }
}

export function initNotesEvents() {
    const addNoteViewBtn = document.getElementById('add-note-view-btn');
    if (addNoteViewBtn) {
        addNoteViewBtn.addEventListener('click', () => {
            const ctx = get(currentNotesContext);
            if (!ctx) return;
            // An orphan note belongs to a group that is gone, so there is nothing to
            // file a new one under; the ungrouped context is the one that is always
            // there, and it is where the note lands.
            openNoteModal(ctx.type === 'orphan' ? { type: 'group', id: -100 } : ctx);
        });
    }

    const orphanNotesBtn = document.getElementById('orphan-notes-btn');
    if (orphanNotesBtn) {
        orphanNotesBtn.addEventListener('click', () => handleOrphanNotesClick([]));
    }
}
