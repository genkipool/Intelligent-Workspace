import { extractYouTubeVideoIdFromUrl, createYouTubeEmbed } from '../../utils/youtubeEmbed.js';
import { sanitizeNoteHtml } from '../../utils/noteHtml.js';

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function highlightSyntax(code, language) {
    const lang = language.toLowerCase();
    if (lang !== 'python' && lang !== 'py') {
        return escapeHtml(code);
    }
    const tokenDefinitions = [
        { type: 'comment', regex: /#.*/ },
        { type: 'string', regex: /("""[\s\S]*?"""|'''[\s\S]*?'''|".*?"|'.*?')/ },
        { type: 'decorator', regex: /@\w+/ },
        { type: 'function', regex: /(?<=\bdef\s+)\w+/ },
        { type: 'class-name', regex: /(?<=\bclass\s+)\w+/ },
        {
            type: 'keyword',
            regex: /\b(def|class|if|else|elif|for|while|return|import|from|as|try|except|finally|with|in|is|not|and|or|True|False|None)\b/,
        },
        { type: 'builtin', regex: /\b(print|input|int|str|isinstance|len|range|dict|list|set|tuple|type)\b/ },
        { type: 'number', regex: /\b\d+(\.\d*)?\b/ },
        { type: 'operator', regex: /[+\-*/%=<>&|~^]+/ },
    ];
    const combinedRegex = new RegExp(tokenDefinitions.map((def) => `(${def.regex.source})`).join('|'), 'gm');
    let resultHtml = '';
    let lastIndex = 0;
    code.replace(combinedRegex, (match, ...args) => {
        const offset = args[args.length - 2];
        if (offset > lastIndex) {
            resultHtml += escapeHtml(code.substring(lastIndex, offset));
        }
        for (let i = 0; i < tokenDefinitions.length; i++) {
            if (args[i]) {
                const tokenType = tokenDefinitions[i].type;
                const tokenContent = args[i];
                resultHtml += `<span class="token ${tokenType}">${escapeHtml(tokenContent)}</span>`;
                break;
            }
        }
        lastIndex = offset + match.length;
    });
    if (lastIndex < code.length) {
        resultHtml += escapeHtml(code.substring(lastIndex));
    }
    return resultHtml;
}

/**
 * The markdown the assistant answers with, as HTML.
 *
 * Exported because copying and reading aloud have to end up with the same text the
 * card shows; `window.marked` is not available once the page is bundled.
 */
export function parseMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    html = html
        .replace(/^\s*### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^\s*## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^\s*# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^\s*[\*-] (.*$)/gim, '<ul><li>$1</li></ul>')
        .replace(/^\s*(\d+)\. (.*$)/gim, '<ol start="$1"><li>$2</li></ol>')
        .replace(/<\/ul>\s*<ul>/g, '')
        .replace(/<\/ol>\s*<ol>/g, '');
    return html
        .split(/\n{2,}/)
        .map((paragraph) => {
            if (paragraph.match(/^\s*<(h[1-3]|ul|ol)/)) {
                return paragraph;
            }
            return paragraph.trim() ? `<p>${paragraph.replace(/\n/g, '<br>')}</p>` : '';
        })
        .join('');
}

// --- GEMINI RENDERER ---
/**
 * Renders Gemini response content within an existing container.
 * @param {HTMLElement} entryContainer - The <details class="entry-card"> element already created.
 * @param {object} entry - The complete conversation entry object.
 */
export function renderGeminiResponse(entryContainer, entry) {
    const { data, query, isLoading } = entry;

    const queryEl = entryContainer.querySelector('.entry-title');
    const contentEl = entryContainer.querySelector('.entry-content');
    const existingFooter = entryContainer.querySelector('.entry-footer');
    if (existingFooter) existingFooter.remove();

    // Clean up any footers that might exist from a previous render
    entryContainer.querySelectorAll('.entry-footer').forEach((footer) => footer.remove());

    if (!queryEl || !contentEl) {
        console.error(
            "Gemini or Note entry template does not contain '.entry-title' or '.entry-content' elements.",
            entryContainer,
        );
        return;
    }

    contentEl.innerHTML = '';

    queryEl.textContent = query;
    queryEl.dataset.originalText = query;

    if (isLoading) {
        const loadingP = document.createElement('p');
        loadingP.textContent = chrome.i18n.getMessage('geminiWaitingForResponse') || "Waiting for Gemini's response...";
        contentEl.appendChild(loadingP);
        entryContainer.classList.add('loading');
    } else {
        entryContainer.classList.remove('loading');
        if (data && data.error) {
            contentEl.innerHTML = `<div class="gemini-error">${data.error}</div>`;
        } else if (data && data.answer) {
            const rawText = data.answer;
            contentEl.dataset.rawText = rawText;
            const parts = rawText.split(/```(\w*)\n([\s\S]*?)\n```/);
            parts.forEach((part, index) => {
                if (index % 3 === 0) {
                    if (part.trim()) {
                        contentEl.insertAdjacentHTML('beforeend', parseMarkdown(part));
                    }
                } else if (index % 3 === 1) {
                    const language = part.trim().toLowerCase() || 'plaintext';
                    const code = parts[index + 1] || '';
                    const pre = document.createElement('pre');
                    const codeEl = document.createElement('code');
                    codeEl.className = `language-${language}`;
                    codeEl.innerHTML = highlightSyntax(code, language);
                    pre.appendChild(codeEl);
                    contentEl.appendChild(pre);
                }
            });
        }
    }

    // If there is search metadata, create and add its footer.
    if (!isLoading && data && data.groundingMetadata) {
        const groundingFooter = document.createElement('div');
        groundingFooter.className = 'entry-footer gemini-footer grounding-footer';

        const groundingContainer = document.createElement('div');
        groundingContainer.className = 'grounding-container';

        // Section for performed searches
        if (data.groundingMetadata.webSearchQueries && data.groundingMetadata.webSearchQueries.length > 0) {
            const queriesHeader = document.createElement('h4');
            queriesHeader.setAttribute('data-i18n', 'geminiWebSearchQueries');
            groundingContainer.appendChild(queriesHeader);

            const queriesList = document.createElement('ul');
            queriesList.className = 'grounding-list';
            data.groundingMetadata.webSearchQueries.forEach((queryText) => {
                const li = document.createElement('li');
                li.textContent = queryText;
                queriesList.appendChild(li);
            });
            groundingContainer.appendChild(queriesList);
        }

        // Section for web sources
        if (data.groundingMetadata.groundingChunks && data.groundingMetadata.groundingChunks.length > 0) {
            const sourcesHeader = document.createElement('h4');
            sourcesHeader.setAttribute('data-i18n', 'geminiWebSources');
            groundingContainer.appendChild(sourcesHeader);

            const sourcesList = document.createElement('ul');
            sourcesList.className = 'grounding-list';
            const seenUris = new Set();
            data.groundingMetadata.groundingChunks.forEach((chunk) => {
                if (chunk.web && chunk.web.uri && !seenUris.has(chunk.web.uri)) {
                    const li = document.createElement('li');
                    const a = document.createElement('a');
                    a.href = chunk.web.uri;
                    a.textContent = chunk.web.title || new URL(chunk.web.uri).hostname;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    li.appendChild(a);
                    sourcesList.appendChild(li);
                    seenUris.add(chunk.web.uri);
                }
            });
            groundingContainer.appendChild(sourcesList);
        }

        if (groundingContainer.hasChildNodes()) {
            groundingFooter.appendChild(groundingContainer);
            entryContainer.appendChild(groundingFooter);
        }
    }

    // Create footer for usage information, if available.
    if (!isLoading && data && data.usageMetadata) {
        const footer = document.createElement('div');
        footer.className = 'entry-footer gemini-footer';
        const { promptTokenCount, candidatesTokenCount, totalTokenCount } = data.usageMetadata;
        const modelLabel = chrome.i18n.getMessage('geminiFooterModel') || 'Model';
        const modelVersion = data.modelVersion ? data.modelVersion.split('/').pop() : 'N/A';
        const promptText = chrome.i18n.getMessage('geminiFooterPrompt', [String(promptTokenCount || 0)]);
        const responseText = chrome.i18n.getMessage('geminiFooterResponse', [String(candidatesTokenCount || 0)]);
        const totalText = chrome.i18n.getMessage('geminiFooterTotal', [String(totalTokenCount || 0)]);

        footer.innerHTML = `
            <span title="${modelLabel}: ${modelVersion}">${modelLabel}: ${modelVersion}</span>
            <span title="${promptText}">${promptText}</span>
            <span title="${responseText}">${responseText}</span>
            <span title="${totalText}">${totalText}</span>
        `;
        entryContainer.appendChild(footer);
    }
}

/**
 * Renders a note entry and configures its listeners.
 * @param {object} note - The note object from DB.
 * @param {object} context - The context (group/subgroup) the note belongs to.
 * @param {object} handlers - An object with functions to handle events (edit, copy, delete).
 * @returns {HTMLElement} - The note's <details> element, ready to be added to the DOM.
 */

export function renderNoteEntry(note, context, handlers) {
    const noteEntryTemplate = document.getElementById('note-entry-template');
    const entryEl = noteEntryTemplate.content.cloneNode(true).firstElementChild;
    entryEl.dataset.noteId = note.id;
    entryEl.open = true;

    // --- DOM Elements ---
    const titleEl = entryEl.querySelector('.entry-title');
    const contentEl = entryEl.querySelector('.entry-content');
    const tagEl = entryEl.querySelector('.note-tag');
    const domainEl = entryEl.querySelector('.entry-domain');
    const typeEl = entryEl.querySelector('.note-type');
    const dateEl = entryEl.querySelector('.note-date');
    const statsEl = entryEl.querySelector('.note-stats');
    const modifiedDateEl = entryEl.querySelector('.note-modified-date');

    // Internal function to update note statistics
    function updateStats(currentNote, statsElement) {
        if (!statsElement) return;
        statsElement.textContent = '';
        let statsTooltipText = '';

        switch (currentNote.type) {
            case 'checklist':
                const totalItems = currentNote.content ? currentNote.content.length : 0;
                const completedItems = currentNote.content
                    ? currentNote.content.filter((item) => item.checked).length
                    : 0;
                if (totalItems > 0) {
                    const percentage = Math.round((completedItems / totalItems) * 100);
                    statsElement.textContent = `${completedItems}/${totalItems} (${percentage}%)`;
                    statsTooltipText = chrome.i18n.getMessage('noteStatsTooltipChecklist', [
                        String(completedItems),
                        String(totalItems),
                    ]);
                }
                break;
            case 'kanban':
                const totalCards = currentNote.content ? currentNote.content.length : 0;
                const completedCards = currentNote.content
                    ? currentNote.content.filter((card) => card.state === 'done').length
                    : 0;
                if (totalCards > 0) {
                    const percentage = Math.round((completedCards / totalCards) * 100);
                    statsElement.textContent = `${completedCards}/${totalCards} (${percentage}%)`;
                    statsTooltipText = chrome.i18n.getMessage('noteStatsTooltipKanban', [
                        String(completedCards),
                        String(totalCards),
                    ]);
                }
                break;
            case 'text':
            default:
                if (typeof currentNote.content === 'string') {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = currentNote.content;
                    const textContent = tempDiv.textContent || '';
                    const charCount = textContent.length;
                    const wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
                    statsElement.textContent = chrome.i18n.getMessage('noteStatsWordsChars', [
                        String(wordCount),
                        String(charCount),
                    ]);
                    statsTooltipText = chrome.i18n.getMessage('noteStatsTooltipText', [
                        String(wordCount),
                        String(charCount),
                    ]);
                }
                break;
        }
        statsElement.title = statsTooltipText;
    }

    if (titleEl) titleEl.textContent = note.title;

    contentEl.innerHTML = '';
    note.type = note.type || 'text';

    if (typeEl) {
        const typeI18nKeys = {
            text: 'noteTypeText',
            checklist: 'noteTypeChecklist',
            kanban: 'noteTypeKanban',
        };
        const i18nKey = typeI18nKeys[note.type] || 'noteTypeText';
        typeEl.setAttribute('data-i18n', i18nKey);
        typeEl.dataset.type = note.type;
        const translatedTypeText = chrome.i18n.getMessage(i18nKey) || note.type;
        const filterTooltip = chrome.i18n.getMessage('filterByTypeTooltip', [translatedTypeText]);
        typeEl.title = filterTooltip;
        if (handlers.onFilter) {
            typeEl.addEventListener('click', (e) => {
                e.stopPropagation();
                handlers.onFilter('type', typeEl.dataset.type);
            });
        }
    }

    switch (note.type) {
        case 'checklist':
            contentEl.style.whiteSpace = 'normal';
            const checklistContainer = document.createElement('div');
            checklistContainer.className = 'note-interactive-list';
            if (Array.isArray(note.content)) {
                note.content.forEach((item, index) => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'note-interactive-item';
                    if (item.checked) itemEl.classList.add('completed');
                    const textSpan = document.createElement('span');
                    textSpan.textContent = item.text;
                    textSpan.className = 'note-item-text';
                    const checkIconTemplate = document.getElementById('checklist-check-icon-template');
                    const checkButton = document.createElement('button');
                    checkButton.className = 'note-checklist-button';
                    checkButton.setAttribute('aria-pressed', String(item.checked));
                    if (item.checked) checkButton.classList.add('checked');
                    if (checkIconTemplate) checkButton.appendChild(checkIconTemplate.content.cloneNode(true));
                    textSpan.addEventListener('click', () => checkButton.click());
                    itemEl.appendChild(textSpan);
                    itemEl.appendChild(checkButton);
                    checkButton.addEventListener('click', () => {
                        const newCheckedState = !note.content[index].checked;
                        note.content[index].checked = newCheckedState;
                        checkButton.setAttribute('aria-pressed', String(newCheckedState));
                        checkButton.classList.toggle('checked', newCheckedState);
                        itemEl.classList.toggle('completed', newCheckedState);
                        updateStats(note, statsEl);
                        if (handlers.onUpdate) handlers.onUpdate(note);
                    });
                    checklistContainer.appendChild(itemEl);
                });
            }
            contentEl.appendChild(checklistContainer);
            break;
        case 'kanban':
            contentEl.style.whiteSpace = 'normal';
            const kanbanContainer = document.createElement('div');
            kanbanContainer.className = 'note-interactive-list';
            if (Array.isArray(note.content)) {
                const states = ['todo', 'inprogress', 'done'];
                const stateLabels = {
                    todo: chrome.i18n.getMessage('kanbanDefaultTodo') || 'To Do',
                    inprogress: chrome.i18n.getMessage('kanbanDefaultInProgress') || 'In Progress',
                    done: chrome.i18n.getMessage('kanbanDefaultDone') || 'Done',
                };
                note.content.forEach((item, index) => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'note-interactive-item';
                    const textSpan = document.createElement('span');
                    textSpan.textContent = item.text;
                    textSpan.className = 'note-item-text';
                    const stateBtn = document.createElement('button');
                    stateBtn.className = 'kanban-state-view';
                    const currentState = item.state || 'todo';
                    stateBtn.dataset.state = currentState;
                    stateBtn.textContent = stateLabels[currentState];
                    itemEl.appendChild(textSpan);
                    itemEl.appendChild(stateBtn);
                    stateBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const currentStateIndex = states.indexOf(stateBtn.dataset.state);
                        const nextState = states[(currentStateIndex + 1) % states.length];
                        note.content[index].state = nextState;
                        stateBtn.dataset.state = nextState;
                        stateBtn.textContent = stateLabels[nextState];
                        updateStats(note, statsEl);
                        if (handlers.onUpdate) handlers.onUpdate(note);
                    });
                    kanbanContainer.appendChild(itemEl);
                });
            }
            contentEl.appendChild(kanbanContainer);
            break;
        case 'text':
        default:
            if (contentEl) {
                // Cleaned on the way in as well; cleaned again here so a note saved
                // before that — with a pasted table's widths still on it — is drawn
                // inside its card rather than over it.
                contentEl.innerHTML = sanitizeNoteHtml(note.content);

                // Find all links within the rendered note content.
                contentEl.querySelectorAll('a').forEach((link) => {
                    // Attempt to extract a YouTube video ID from the link href.
                    const videoId = extractYouTubeVideoIdFromUrl(link.href);

                    // If a valid ID is found...
                    if (videoId) {
                        // Create the embedded video element.
                        const videoEmbed = createYouTubeEmbed(videoId);
                        // Insert the embedded video immediately after the link element.
                        link.insertAdjacentElement('afterend', videoEmbed);
                    }
                });
            }
            break;
    }

    // Add event handlers for PDFs after rendering content.
    if (note.type === 'text' && handlers.onOpenFileInPanel) {
        contentEl.querySelectorAll('a[href^="data:application/pdf"]').forEach((link) => {
            link.title = chrome.i18n.getMessage('notePdfOpenTooltip');

            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (e.ctrlKey || e.metaKey) {
                    fetch(link.href)
                        .then((res) => res.blob())
                        .then((blob) => {
                            const blobUrl = URL.createObjectURL(blob);
                            chrome.tabs.create({ url: blobUrl, active: true });
                        });
                } else {
                    handlers.onOpenFileInPanel(link.href, { fromNotes: true });
                }
            });
        });
    }

    if (tagEl) {
        const predefinedCategories = [
            'Work',
            'Personal',
            'Ideas',
            'Research',
            'Important',
            'Leisure',
            'School',
            'ToDo',
        ];
        let translatedCategoryName;
        let i18nKey = '';

        if (predefinedCategories.includes(note.category)) {
            i18nKey = `noteCat${note.category}`;
            translatedCategoryName = chrome.i18n.getMessage(i18nKey);
        } else {
            translatedCategoryName = note.category;
        }

        if (i18nKey) {
            tagEl.setAttribute('data-i18n', i18nKey);
        }

        tagEl.dataset.category = note.category;
        tagEl.textContent = translatedCategoryName;
        const filterTooltip = chrome.i18n.getMessage('filterByCategoryTooltip', [translatedCategoryName]);
        tagEl.title = filterTooltip;
        if (handlers.onFilter) {
            tagEl.addEventListener('click', (e) => {
                e.stopPropagation();
                handlers.onFilter('cat', tagEl.dataset.category);
            });
        }
    }

    if (domainEl) {
        const { contextKey } = note;
        let contextText = '';
        if (context.isOrphan) {
            contextText = chrome.i18n.getMessage('orphanNoteContext') || 'Context Lost';
            if (contextKey) {
                if (contextKey === 'g_general') {
                    contextText = chrome.i18n.getMessage('generalNotesContext') || 'General';
                } else {
                    const parts = contextKey.split('_');
                    if (contextKey.startsWith('g_') && parts.length > 1) {
                        contextText = parts.slice(1).join('_');
                    } else if (contextKey.startsWith('s_') && parts.length > 2) {
                        contextText = parts.slice(2).join('_');
                    }
                }
            }
            domainEl.classList.add('is-orphan');
        } else if (contextKey && contextKey.startsWith('s_')) {
            const parts = contextKey.split('_');
            if (parts.length >= 3) contextText = parts.slice(2).join('_');
        } else {
            contextText = context.title;
            domainEl.classList.add('is-group-title');
        }
        domainEl.textContent = contextText;
        domainEl.dataset.context = contextText;
        const filterByContextTooltip = chrome.i18n.getMessage('filterByContextTooltip', [contextText]);
        domainEl.title = filterByContextTooltip;
        if (handlers.onFilter) {
            domainEl.addEventListener('click', () => {
                handlers.onFilter('context', domainEl.dataset.context);
            });
        }
    }

    updateStats(note, statsEl);

    // Pomodoro stats in footer
    const pomoFilterBtn = entryEl.querySelector('.note-pomo-filter');
    if (note.pomoData) {
        if (pomoFilterBtn) {
            pomoFilterBtn.classList.remove('hidden');
            if (handlers.onFilter) {
                pomoFilterBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handlers.onFilter('pomo', 'pomodoro');
                });
            }
        }
    }

    if (dateEl) {
        const creationDate = new Date(note.timestamp).toLocaleString();
        dateEl.textContent = creationDate;
        const creationDateTooltip = chrome.i18n.getMessage('creationDateTooltip') || 'Creation date:';
        dateEl.title = `${creationDateTooltip} ${creationDate}`;
    }

    if (modifiedDateEl && note.modifiedTimestamp && note.timestamp !== note.modifiedTimestamp) {
        const modifiedDate = new Date(note.modifiedTimestamp).toLocaleString();
        modifiedDateEl.textContent = modifiedDate;
        const modifiedDateTooltip = chrome.i18n.getMessage('modifiedDateTooltip') || 'Modification date:';
        modifiedDateEl.title = `${modifiedDateTooltip} ${modifiedDate}`;
    }

    const pinBtn = entryEl.querySelector('.archived-note-btn');
    if (pinBtn) {
        const isPersistent = note.isPersistent || false;
        pinBtn.classList.toggle('active', isPersistent);
        pinBtn.setAttribute('data-i18n-title', isPersistent ? 'unarchivedNoteTitle' : 'archivedNoteTitle');
        if (handlers.onTogglePersistence) {
            pinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handlers.onTogglePersistence(note);
            });
        }
    }
    // An orphan used to lose its edit button, because saving from a list gathered out of
    // every context had nowhere to file the note back to. An edit no longer re-files
    // anything — handleSaveNote keeps the note's own context — so the button belongs on
    // every card, wherever the list was opened from.
    const editBtn = entryEl.querySelector('.edit-entry-btn');
    if (editBtn && handlers.onEdit) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handlers.onEdit(context, note);
        });
    }
    entryEl.querySelector('.copy-entry-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onCopy(note);
    });
    entryEl.querySelector('.delete-entry-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onDelete(note.id);
    });

    const readBtn = entryEl.querySelector('.read-aloud-btn');
    if (readBtn && handlers.onReadAloud) {
        readBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handlers.onReadAloud(note, readBtn);
        });
    }

    return entryEl;
}
