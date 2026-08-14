/**
 * geminiService.js — Service extracted from gemini.js
 *
 * Functions: handleDownloadConversation, updateCombinedConversationDisplay, loadSelectedConversation, updateScheduledConversationBadge, switchToGeminiView, htmlToSpeechText, createApiKeyModal, updateGeminiButtonState, updateGeminiConversationButtonState, loadConversationFromDb, addGeminiEntryToDOM, handleClearCurrentConversation, handleGeminiQuery
 */

import { get, writable } from 'svelte/store';
import { isGeminiViewActive, searchToggles } from '../stores/appStore.svelte.js';
import { openModal, showApiKeyModal as showApiKeyModalStore } from '../stores/modalStore.js';
import { geminiStore } from '../stores/geminiStore.js';
import { renderGeminiResponse, parseMarkdown } from '../content-renderer/content-renderer.js';
import '../../lib/marked.js';
import { applyTranslations, showNotification } from '../../utils/i18n.js';
import { saveGeminiEntryToDb, getAllGeminiEntriesFromDb, deleteGeminiEntryFromDb } from '../../utils/db.js';
import { STORAGE_KEYS, MAX_GEMINI_SCHEDULES } from './constants.js';
import { sanitizeFilename, copyRichTextToClipboard } from './utils.js';
import {
    closeUrlInPanel,
    closeBookmarksView,
    manageViewVisibility,
    showWelcomeMessage,
    updateExpandAllButtonState,
    updateBackButtonTooltip,
    updateHeaderButtonsVisibility,
    updateScrollButtons,
} from './viewsService.js';
import { closeScreenshotGallery } from './screenshotsService.js';
import { closeNotesView } from './notesService.js';
import { updateSubButtonVisibility } from './settingsService.js';
import { updateDuplicateCountBadge } from './groupsService.js';

export const geminiConversationHistory = writable([]);
export const geminiPersistentConversations = writable([]);
export const geminiCombinedConversations = writable([]);
export const geminiCurrentCombinedIndex = writable(-1);
export const geminiSessionConversations = writable([]);
export const geminiCurrentSessionConversationIndex = writable(-1);

export async function handleDownloadConversation() {
    if (get(geminiConversationHistory).length === 0) {
        showNotification('errorEmptyConversation', true);
        return;
    }

    const fullConversationTitle =
        document.querySelector('#persistent-conversation-display')?.textContent || 'Gemini Conversation';

    const entriesHtml = get(geminiConversationHistory)
        .map(
            (entry, i) =>
                `<div style="margin-bottom:16px;padding:12px;border:1px solid #ddd;border-radius:8px">
          <strong style="color:#1a73e8">Q${i + 1}:</strong>
          <p>${entry.query || ''}</p>
          <strong style="color:#1a73e8">A:</strong>
          <div>${entry.data?.answer || ''}</div>
        </div>`,
        )
        .join('');

    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${fullConversationTitle}</title></head>
<body style="font-family:sans-serif;max-width:800px;margin:auto;padding:20px">
<h1>${fullConversationTitle}</h1>
${entriesHtml}
</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(fullConversationTitle)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function updateCombinedConversationDisplay() {
    const { [STORAGE_KEYS.PERSISTENT_GEMINI]: persistentIds = [] } = await chrome.storage.local.get(
        STORAGE_KEYS.PERSISTENT_GEMINI,
    );
    let finalPersistentConversations = [];
    if (persistentIds.length > 0) {
        const allEntries = await getAllGeminiEntriesFromDb();
        const persistentIdSet = new Set(persistentIds);
        const allPersistentEntries = allEntries.filter((entry) => persistentIdSet.has(entry.id) && entry.isPersistent);
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
    geminiPersistentConversations.set(finalPersistentConversations);

    geminiCombinedConversations.set(
        [...get(geminiPersistentConversations), ...get(geminiSessionConversations)].sort(
            (a, b) => b.timestamp - a.timestamp,
        ),
    );

    if (get(geminiConversationHistory).length > 0) {
        const currentId = get(geminiConversationHistory)[0].id;
        geminiCurrentCombinedIndex.set(
            get(geminiCombinedConversations).findIndex(
                (conv) => conv.entryIds?.includes(currentId) || conv.entries?.some((e) => e.id === currentId),
            ),
        );
    } else {
        geminiCurrentCombinedIndex.set(-1);
    }

    // The name on the button is rendered by the page component from the live store.
    // Writing it here as well overwrote it with this module's own stores, which the
    // assistant no longer keeps up to date: the button kept the previous conversation's
    // name after starting a new one.
}

export async function loadSelectedConversation(conversation) {
    await geminiStore.archiveCurrentConversationIfNeeded();

    if (conversation.isScheduled && !conversation.isRead) {
        const sessionConv = get(geminiSessionConversations).find((c) => c.timestamp === conversation.timestamp);
        if (sessionConv) {
            sessionConv.isRead = true;
            await chrome.storage.session.set({
                [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: get(geminiSessionConversations),
            });
            await updateScheduledConversationBadge();
        }
    }

    if (conversation.isTemporary) {
        const entryIds = new Set(conversation.entryIds);
        const allEntries = await getAllGeminiEntriesFromDb();
        geminiConversationHistory.set(allEntries.filter((e) => entryIds.has(e.id)).sort((a, b) => a.id - b.id));
    } else {
        geminiConversationHistory.set(conversation.entries);
    }

    geminiCurrentCombinedIndex.set(
        get(geminiCombinedConversations).findIndex((c) => c.timestamp === conversation.timestamp),
    );

    switchToGeminiView();
    await updateCombinedConversationDisplay();
}

export async function updateScheduledConversationBadge() {
    const geminiToggleBtn = document.getElementById('gemini-toggle-btn');
    const openGeminiViewBtn = document.getElementById('open-gemini-view-btn');
    const badge = openGeminiViewBtn ? openGeminiViewBtn.querySelector('.gemini-notification-badge') : null;

    if (!badge || !openGeminiViewBtn) return;

    if (get(isGeminiViewActive)) {
        badge.classList.add('hidden');
        if (geminiToggleBtn) geminiToggleBtn.classList.remove('has-unread-notifications');
        updateSubButtonVisibility();
        return;
    }

    const unreadCount = get(geminiSessionConversations).filter((conv) => conv.isScheduled && !conv.isRead).length;

    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.remove('hidden');
        if (geminiToggleBtn) geminiToggleBtn.classList.add('has-unread-notifications');
    } else {
        badge.classList.add('hidden');
        if (geminiToggleBtn) geminiToggleBtn.classList.remove('has-unread-notifications');
    }

    updateSubButtonVisibility();
}

export async function switchToGeminiView() {
    isGeminiViewActive.set(true);
    closeUrlInPanel(true);
    closeScreenshotGallery(true);
    closeNotesView(true);
    closeBookmarksView(true);

    const visibilityControlsPanel = document.getElementById('visibility-controls-panel');
    const actionVisibilityControlsPanel = document.getElementById('action-visibility-controls-panel');
    if (visibilityControlsPanel) visibilityControlsPanel.classList.add('hidden');
    if (actionVisibilityControlsPanel) actionVisibilityControlsPanel.classList.add('hidden');
    const pomodoroPanel = document.getElementById('pomodoro-panel');
    if (pomodoroPanel) pomodoroPanel.classList.add('hidden');

    const mainHeaderTitle = document.getElementById('main-header-title');
    if (mainHeaderTitle) {
        mainHeaderTitle.setAttribute('data-i18n', 'geminiViewTitle');
        const titleText = chrome.i18n.getMessage('geminiViewTitle');
        if (titleText) mainHeaderTitle.textContent = titleText;
    }

    // Coming back to the assistant always shows the conversation, whatever hid it —
    // an error box that was closed, or one left behind by a new question.
    document.getElementById('gemini-conversation-view')?.classList.remove('showing-error');
    document.querySelector('.container .error-message-container.active-view')?.remove();

    manageViewVisibility('#gemini-conversation-view');
    const container = document.querySelector('.container');
    if (container) container.classList.add('gemini-view-active');

    const geminiNotificationBadge = document
        .getElementById('open-gemini-view-btn')
        ?.querySelector('.gemini-notification-badge');
    if (geminiNotificationBadge) geminiNotificationBadge.classList.add('hidden');

    const hasUnread = get(geminiSessionConversations).some((conv) => conv.isScheduled && !conv.isRead);
    if (hasUnread) {
        const updated = get(geminiSessionConversations).map((conv) => {
            if (conv.isScheduled && !conv.isRead) conv.isRead = true;
            return conv;
        });
        geminiSessionConversations.set(updated);
        chrome.storage.session
            .set({ [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: get(geminiSessionConversations) })
            .catch(() => {});
    }

    const geminiInputContainer = document.getElementById('gemini-input-container');
    if (geminiInputContainer) {
        geminiInputContainer.classList.remove('hidden');
        applyTranslations(geminiInputContainer);
    }

    const geminiModelSelectorContainer = document.getElementById('gemini-model-selector-container');
    if (geminiModelSelectorContainer) {
        geminiModelSelectorContainer.classList.remove('hidden');
        geminiStore.initializeModelSelector();
        applyTranslations(geminiModelSelectorContainer);
    }

    updateExpandAllButtonState();
    updateBackButtonTooltip();
    updateSubButtonVisibility();
    updateHeaderButtonsVisibility();
    updateDuplicateCountBadge();
    const geminiTextarea = document.getElementById('gemini-textarea');
    if (geminiTextarea) geminiTextarea.focus();
    updateScrollButtons();
}

/** An answer as rich text, for the clipboard: the same HTML the card renders. */
export function markdownToHtml(markdown) {
    return parseMarkdown(markdown || '');
}

/** The same answer as plain text, with the markdown resolved rather than spelled out. */
export function markdownToPlainText(markdown) {
    const holder = document.createElement('div');
    holder.innerHTML = parseMarkdown(markdown || '');
    return (holder.textContent || '').trim();
}

export function htmlToSpeechText(htmlString) {
    if (!htmlString) return '';

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;
    let speechText = '';

    function traverse(node) {
        if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') {
            return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            speechText += node.textContent.trim() + ' ';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();

            switch (tagName) {
                case 'img':
                    const altText = node.getAttribute('alt');
                    if (altText) {
                        speechText += `${chrome.i18n.getMessage('ttsImageDescription') || 'Image: '}${altText}. `;
                    } else {
                        speechText += `${chrome.i18n.getMessage('ttsImageWithoutDescription') || 'Image without description.'} `;
                    }
                    break;
                case 'a':
                    const linkText = node.textContent.trim();
                    speechText += `${chrome.i18n.getMessage('ttsLinkDescription') || 'Link: '}${linkText}. `;
                    return;
                case 'iframe':
                    let contentDescription = chrome.i18n.getMessage('ttsEmbeddedContent') || 'Embedded content.';
                    const src = node.getAttribute('src');
                    if (src && src.includes('youtube.com/embed')) {
                        contentDescription = chrome.i18n.getMessage('ttsYouTubeVideo') || 'Embedded YouTube video.';
                    }
                    speechText += contentDescription;
                    return;
                case 'br':
                    speechText += '. ';
                    break;
                case 'li':
                    speechText += `${chrome.i18n.getMessage('ttsListItem') || 'List item: '} `;
                    for (const child of node.childNodes) {
                        traverse(child);
                    }
                    speechText += '. ';
                    return;
                case 'p':
                case 'div':
                case 'h1':
                case 'h2':
                case 'h3':
                case 'h4':
                case 'h5':
                case 'h6':
                case 'blockquote':
                    for (const child of node.childNodes) {
                        traverse(child);
                    }
                    speechText += '. ';
                    return;
            }

            for (const child of node.childNodes) {
                traverse(child);
            }
        }
    }

    traverse(tempDiv);
    return speechText.replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim();
}

export async function createApiKeyModal() {
    // The modal lists the keys it is handed; opening it with nothing meant the saved
    // keys never showed up.
    const { geminiApiKeysList = [] } = await chrome.storage.local.get('geminiApiKeysList');
    openModal(showApiKeyModalStore, { apiKeys: geminiApiKeysList });
}

export async function updateGeminiButtonState() {
    const geminiToggleBtn = document.getElementById('gemini-toggle-btn');
    if (!geminiToggleBtn) return;

    try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
        if (data[STORAGE_KEYS.API_KEY]) {
            geminiToggleBtn.dataset.apiKeyExists = 'true';
        } else {
            geminiToggleBtn.dataset.apiKeyExists = 'false';
        }
    } catch (e) {
        console.error('Error checking API key:', e);
        geminiToggleBtn.dataset.apiKeyExists = 'false';
    }
}

export function updateGeminiConversationButtonState() {
    // The conversation view is mounted with an inline display rather than the `hidden`
    // class the original toggled, so looking for that class always answered "visible"
    // and left the search switch pressed on a page that had it turned off. Whether the
    // assistant view is open is what the switch reflects, and the toolbar draws it from
    // the store.
    searchToggles.update((toggles) => ({ ...toggles, gemini: get(isGeminiViewActive) }));
}

export async function loadConversationFromDb() {
    try {
        const sessionData = await chrome.storage.session.get(STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS);
        geminiSessionConversations.set(sessionData[STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS] || []);
        if (get(geminiSessionConversations).length > 0) {
            geminiCurrentSessionConversationIndex.set(get(geminiSessionConversations).length - 1);
            const activeConversation = get(geminiSessionConversations)[get(geminiCurrentSessionConversationIndex)];
            const validIds = new Set(activeConversation.entryIds);
            const allEntries = await getAllGeminiEntriesFromDb();
            const sessionEntries = allEntries.filter((entry) => validIds.has(entry.id));
            geminiConversationHistory.set(sessionEntries.sort((a, b) => a.id - b.id));
        } else {
            geminiConversationHistory.set([]);
            geminiCurrentSessionConversationIndex.set(-1);
        }
    } catch (e) {
        console.error('Error loading conversation from IndexedDB:', e);
        geminiConversationHistory.set([]);
        geminiSessionConversations.set([]);
        geminiCurrentSessionConversationIndex.set(-1);
    }
    updateGeminiConversationButtonState();
    updateSubButtonVisibility();
}

function geminiEntryEventListeners(container, entry) {
    const resendBtn = container.querySelector('.resend-entry-btn');
    const readAloudBtn = container.querySelector('.read-aloud-btn');
    const editBtn = container.querySelector('.edit-entry-btn');
    const downloadBtn = container.querySelector('.download-entry-btn');
    const copyBtn = container.querySelector('.copy-entry-btn');
    const deleteBtn = container.querySelector('.delete-entry-btn');

    resendBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        geminiStore.resendEntry(entry.query, entry.id);
    });

    readAloudBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        geminiStore.readEntryAloud(entry, e.ctrlKey || e.metaKey);
    });

    editBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const editContainer = container.querySelector('.gemini-edit-container');
        if (editContainer) {
            editContainer.classList.toggle('hidden');
        } else {
            const textarea = container.querySelector('.gemini-edit-textarea');
            if (textarea) {
                textarea.value = entry?.query || '';
                container.querySelector('.gemini-edit-container')?.classList.remove('hidden');
            }
        }
    });

    downloadBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDownloadConversation();
    });

    copyBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = entry?.data?.answer || entry?.query || '';
        if (text) {
            navigator.clipboard.writeText(text).catch(() => {});
        }
    });

    deleteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        geminiStore.deleteEntry(entry.id);
        container.remove();
    });
}

export function addGeminiEntryToDOM(entry) {
    const geminiConvView = document.getElementById('gemini-conversation-view');
    if (!geminiConvView) return;
    let entryContainer = geminiConvView.querySelector(`.gemini-entry[data-entry-id="${entry.id}"]`);
    const isNew = !entryContainer;

    if (isNew) {
        const template = document.getElementById('gemini-entry-template');
        entryContainer = template.content.cloneNode(true).firstElementChild;
        entryContainer.dataset.entryId = entry.id;
        geminiConvView.appendChild(entryContainer);
    }

    if (isNew) {
        const iconEl = entryContainer.querySelector('.entry-icon');
        if (iconEl && (iconEl.tagName === 'IMG' || iconEl.tagName === 'SPAN')) {
            iconEl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!entry.isAgent) createApiKeyModal();
            });

            if (entry.isAgent) {
                const agentSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                agentSvg.setAttribute('width', '24');
                agentSvg.setAttribute('height', '24');
                agentSvg.setAttribute('viewBox', '0 0 16 16');
                agentSvg.setAttribute('fill', 'currentColor');
                agentSvg.classList.add('entry-icon', 'entry-icon-agent');
                agentSvg.setAttribute('data-i18n-title', 'configureApiKeyTooltip');
                agentSvg.innerHTML =
                    '<path fill-rule="evenodd" clip-rule="evenodd" d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"/>';
                agentSvg.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    createApiKeyModal();
                });
                iconEl.replaceWith(agentSvg);
            }
        }
        applyTranslations(entryContainer);
    }

    renderGeminiResponse(entryContainer, entry);
    entryContainer.open = true;

    if (entry.isAgent && Array.isArray(entry.agentSteps) && entry.agentSteps.length > 0) {
        const agentStepsEl = entryContainer.querySelector('.agent-steps');
        if (agentStepsEl) {
            agentStepsEl.classList.remove('hidden');
            agentStepsEl.innerHTML = '';
            entry.agentSteps.forEach((step) => {
                const div = document.createElement('div');
                div.className = 'agent-step-indicator';
                if (step.status === 'done') div.classList.add('agent-step-done');
                if (step.status === 'error') div.classList.add('agent-step-error');
                const icon = document.createElement('span');
                icon.className = 'agent-step-icon';
                icon.textContent = step.status === 'done' ? '✓' : step.status === 'error' ? '✗' : '⚙';
                const label = document.createElement('span');
                label.textContent = step.text;
                div.appendChild(icon);
                div.appendChild(label);
                agentStepsEl.appendChild(div);
            });
        }
    }

    if (isNew) {
        geminiEntryEventListeners(entryContainer, entry);
    }

    return entryContainer;
}

export async function handleClearCurrentConversation() {
    if (get(geminiConversationHistory).length === 0 || get(geminiCurrentCombinedIndex) === -1) {
        showNotification('errorNoConversationToDelete', true);
        return;
    }

    const conversationToDelete = get(geminiCombinedConversations)[get(geminiCurrentCombinedIndex)];
    if (!conversationToDelete) return;

    const idsToDelete = get(geminiConversationHistory).map((entry) => entry.id);

    await Promise.all(idsToDelete.map((id) => deleteGeminiEntryFromDb(id)));

    if (conversationToDelete.isTemporary) {
        geminiSessionConversations.set(
            get(geminiSessionConversations).filter((c) => c.timestamp !== conversationToDelete.timestamp),
        );
        await chrome.storage.session.set({
            [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: get(geminiSessionConversations),
        });
    } else {
        geminiPersistentConversations.set(
            get(geminiPersistentConversations).filter((c) => c.title !== conversationToDelete.title),
        );
        const { [STORAGE_KEYS.PERSISTENT_GEMINI]: currentIds = [] } = await chrome.storage.local.get(
            STORAGE_KEYS.PERSISTENT_GEMINI,
        );
        const persistentSet = new Set(currentIds);
        idsToDelete.forEach((id) => persistentSet.delete(id));
        await chrome.storage.local.set({ [STORAGE_KEYS.PERSISTENT_GEMINI]: Array.from(persistentSet) });
    }

    geminiConversationHistory.set([]);
    geminiCurrentCombinedIndex.set(-1);

    showNotification('conversationDeleted');

    await updateCombinedConversationDisplay();
    updateHeaderButtonsVisibility();
    updateGeminiConversationButtonState();
    updateSubButtonVisibility();
    updateScrollButtons();
    await updateScheduledConversationBadge();
}

export async function handleGeminiQuery(query) {
    if (!query) return;
    await geminiStore.handleQuery(query);
}

export function initGeminiEvents() {
    // The copy button is wired by the page component, which reads the live store; a
    // second listener here would run against the legacy one and copy nothing.

    const addApiKeyBtn = document.getElementById('add-api-key-btn');
    if (addApiKeyBtn) {
        addApiKeyBtn.addEventListener('click', createApiKeyModal);
    }

    const openGeminiViewBtn = document.getElementById('open-gemini-view-btn');
    const badge = openGeminiViewBtn?.querySelector('.gemini-notification-badge');
    if (badge) {
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            (async () => {
                const { [STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS]: sessionConvs = [] } =
                    await chrome.storage.session.get(STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS);
                const latestUnread = sessionConvs
                    .filter((conv) => conv.isScheduled && !conv.isRead)
                    .sort((a, b) => b.timestamp - a.timestamp)[0];
                if (latestUnread) await loadSelectedConversation(latestUnread);
                switchToGeminiView();
            })();
        });
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'geminiConversationUpdated') {
            (async () => {
                await loadConversationFromDb();
                await updateCombinedConversationDisplay();
                updateHeaderButtonsVisibility();
                updateGeminiConversationButtonState();
            })();
            updateScheduledConversationBadge();
            return true;
        }

        if (message.action === 'geminiQueryStarted') {
            geminiConversationHistory.update((h) => [...h, message.entry]);
            updateHeaderButtonsVisibility();
            updateGeminiConversationButtonState();
            sendResponse({ status: 'received' });
            return true;
        }

        if (message.action === 'geminiQueryCompleted') {
            geminiConversationHistory.update((h) => {
                const idx = h.findIndex((e) => e.id === message.entry.id);
                if (idx !== -1) h[idx] = message.entry;
                return h;
            });
            updateHeaderButtonsVisibility();
            updateGeminiConversationButtonState();
            if (!get(isGeminiViewActive)) {
                (async () => {
                    try {
                        const sessionData = await chrome.storage.session.get(STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS);
                        const convs = sessionData[STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS] || [];
                        const unreadCount = convs.filter((c) => c.isScheduled && !c.isRead).length;
                        geminiSessionConversations.set(convs);
                        const badge = document
                            .getElementById('open-gemini-view-btn')
                            ?.querySelector('.gemini-notification-badge');
                        if (badge) {
                            if (unreadCount > 0) {
                                badge.textContent = unreadCount;
                                badge.classList.remove('hidden');
                                document.getElementById('gemini-toggle-btn')?.classList.add('has-unread-notifications');
                            } else {
                                badge.classList.add('hidden');
                                document
                                    .getElementById('gemini-toggle-btn')
                                    ?.classList.remove('has-unread-notifications');
                            }
                        }
                        updateSubButtonVisibility();
                    } catch (e) {
                        updateScheduledConversationBadge();
                    }
                })();
            }
            sendResponse({ status: 'received' });
            return true;
        }
    });
}
