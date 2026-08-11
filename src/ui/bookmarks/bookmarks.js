import { confirmAction } from '../stores/confirmStore.js';
import { get } from 'svelte/store';
import { prefetchCache, isPopupWindow } from '../stores/appStore.svelte.js';
import { prefetchUrl } from '../services/prefetchService.js';

function collectBookmarkUrls(node) {
    let urls = [];
    if (node.url) {
        urls.push(node.url);
    }
    if (node.children) {
        for (const child of node.children) {
            urls = urls.concat(collectBookmarkUrls(child));
        }
    }
    return urls;
}

function attachDragAndDropEvents(el, node, isFolder) {
    const isRootFolder = isFolder && ['0', '1', '2', '3'].includes(node.id);

    // Only allow non-root elements to be dragged
    el.draggable = !isRootFolder;

    if (!isRootFolder) {
        el.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            const dragData = { id: node.id, isFolder: isFolder, parentId: node.parentId };
            e.dataTransfer.setData('application/json', JSON.stringify(dragData));
            e.dataTransfer.effectAllowed = 'move';
            el.classList.add('dragging');
        });

        el.addEventListener('dragend', (e) => {
            e.stopPropagation();
            el.classList.remove('dragging');
            document.querySelectorAll('.drag-over-folder').forEach((c) => c.classList.remove('drag-over-folder'));
        });
    }

    el.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow dropping
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        // Remove previous highlights
        document.querySelectorAll('.drag-over-folder').forEach((c) => c.classList.remove('drag-over-folder'));

        if (isFolder) {
            // Visual feedback for dropping into this folder
            el.classList.add('drag-over-folder');
        } else {
            // If dragging over a bookmark item, highlight its parent folder if accessible, or just let it drop in the same parent
            const parentEl = el.closest('.bookmark-folder');
            if (parentEl) parentEl.classList.add('drag-over-folder');
        }
    });

    el.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        if (isFolder) {
            el.classList.remove('drag-over-folder');
        }
    });

    el.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.drag-over-folder').forEach((c) => c.classList.remove('drag-over-folder'));

        try {
            const dataStr = e.dataTransfer.getData('application/json');
            if (!dataStr) return;
            const data = JSON.parse(dataStr);

            // Cannot drop a folder into itself or if it's the same node
            if (!data || !data.id || data.id === node.id) return;

            const targetParentId = isFolder ? node.id : node.parentId;

            // If trying to move to the exact same parent, skip (since we don't have manual ordering anyway)
            if (data.parentId === targetParentId) return;

            // Send message to background script to move the bookmark
            const response = await chrome.runtime.sendMessage({
                action: 'moveBookmark',
                payload: { id: data.id, destination: { parentId: targetParentId } },
            });

            if (response && response.success) {
                // The 'bookmarksChanged' listener or the background script events will trigger a re-render.
            } else {
                console.error('Failed to move bookmark:', response?.error);
            }
        } catch (err) {
            console.error('Drop error:', err);
        }
    });
}

function showInlineCreateFolderInput(parentId, folderEl) {
    // 1. Ensure the parent folder is open
    if (!folderEl.open) {
        folderEl.open = true;
    }

    const contentContainer = folderEl.querySelector('.bookmark-folder-content');

    // 2. Check if already exists to toggle
    const existingTemp = contentContainer.querySelector('.temp-creation');
    if (existingTemp) {
        existingTemp.remove();
        return;
    }

    // 3. Crear el contenedor temporal
    const tempContainer = document.createElement('div');
    tempContainer.className = 'bookmark-item temp-creation';
    tempContainer.style.display = 'flex';
    tempContainer.style.alignItems = 'center';
    tempContainer.style.gap = '8px';
    tempContainer.style.padding = '8px 4px';

    // 3. Add folder icon (visual)
    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
        </svg>
    `;
    iconSpan.style.display = 'flex';
    iconSpan.style.opacity = '0.7';

    // 4. Add text field
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'folder-name-input'; // Reutiliza estilos existentes
    input.placeholder = chrome.i18n.getMessage('enterFolderNamePlaceholder') || 'Folder Name';
    input.style.flexGrow = '1';

    tempContainer.appendChild(iconSpan);
    tempContainer.appendChild(input);

    // Insertar al principio de la lista de hijos
    contentContainer.prepend(tempContainer);
    input.focus();

    // 5. Logica de Guardado y Cancelacion
    let isSaving = false;

    const saveFolder = async () => {
        if (isSaving) return;
        isSaving = true;

        const title = input.value.trim();

        if (title) {
            try {
                // Ask the background to create the bookmark
                const response = await chrome.runtime.sendMessage({
                    action: 'createBookmark',
                    payload: {
                        parentId: parentId,
                        title: title,
                    },
                });

                if (response && response.success) {
                    // Eliminamos el input temporal.
                    // The view refreshes itself through the 'bookmarksChanged' listener
                    tempContainer.remove();
                } else {
                    console.error('Error creating folder:', response.error);
                    // Opcional: Mostrar error visual en el input
                    input.classList.add('input-error');
                    isSaving = false;
                    input.focus();
                }
            } catch (error) {
                console.error('Communication error:', error);
                tempContainer.remove();
            }
        } else {
            // If empty, just cancel
            tempContainer.remove();
        }
    };

    const cancelCreation = () => {
        tempContainer.remove();
    };

    // Event Listeners
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur(); // Dispara el evento blur que llama a saveFolder
        } else if (e.key === 'Escape') {
            e.preventDefault();
            // Prevent blur from saving when cancelling
            input.removeEventListener('blur', onBlur);
            cancelCreation();
        }
    });

    const onBlur = () => {
        saveFolder();
    };

    input.addEventListener('blur', onBlur);
}

function createBookmarkElement(bookmark, itemTemplate, duplicateUrlSet, utils) {
    const bookmarkEl = itemTemplate.content.cloneNode(true).firstElementChild;
    bookmarkEl.dataset.bookmarkId = bookmark.id;

    const favicon = bookmarkEl.querySelector('.favicon');
    favicon.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(bookmark.url)}&size=16`;
    favicon.onerror = () => {
        favicon.src = '../../../../assets/icons/icon16.png';
    };

    const titleEl = bookmarkEl.querySelector('.bookmark-title');
    titleEl.textContent = bookmark.title;
    titleEl.title = `${bookmark.title}\n${bookmark.url}`;

    if (duplicateUrlSet.has(bookmark.url)) {
        bookmarkEl.classList.add('is-duplicate');
    }

    const actionsContainer = bookmarkEl.querySelector('.bookmark-actions');
    if (actionsContainer) {
        // --- COPIADO INDIVIDUAL ---
        actionsContainer.querySelector('.copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard
                .writeText(bookmark.url)
                .then(() => {
                    if (utils && typeof utils.showNotification === 'function') {
                        utils.showNotification('urlCopied');
                    }
                })
                .catch((err) => {
                    console.error('Error al copiar:', err);
                    if (utils && typeof utils.showNotification === 'function') {
                        utils.showNotification('errorCopying', true);
                    }
                });
        });

        // Boton Eliminar
        actionsContainer.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.bookmarks.remove(bookmark.id, () => {
                bookmarkEl.remove();
                if (utils && utils.showNotification) utils.showNotification('bookmarkDeleted');
            });
        });

        // Add to rule
        actionsContainer.querySelector('.add-to-rule-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (utils && utils.showAddToRuleModal) {
                utils.showAddToRuleModal(bookmark.url, bookmark.title);
            }
        });

        // Edit Bookmark
        actionsContainer.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (utils && utils.openAddToBookmarkModal) {
                // Open the modal in edit mode with current bookmark data
                utils.openAddToBookmarkModal(
                    { title: bookmark.title, url: bookmark.url }, // tab object format
                    'edit', // mode
                    { id: bookmark.id, title: bookmark.title, url: bookmark.url, parentId: bookmark.parentId }, // bookmarkData
                );
            }
        });

        if (utils && utils.createOverflowMenu) {
            utils.createOverflowMenu(actionsContainer, 'bookmark-item-template', bookmarkEl);
        }
    }

    attachDragAndDropEvents(bookmarkEl, bookmark, false);

    bookmarkEl.addEventListener('mouseenter', () => {
        const url = bookmark.url;
        if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
            prefetchUrl(url);
        }
    });

    bookmarkEl.addEventListener('click', (e) => {
        // Prevent opening if the click was inside the bookmark-actions container
        if (e.target.closest('.bookmark-actions')) return;

        const isCtrlClick = e.ctrlKey || e.metaKey;
        const url = bookmark.url;
        const isWebUrl = url && (url.startsWith('http:') || url.startsWith('https:'));

        if (get(isPopupWindow)) {
            e.preventDefault();
            if (isWebUrl) {
                if (utils && typeof utils.openUrlInPanel === 'function') {
                    utils.openUrlInPanel(url);
                } else {
                    chrome.tabs.create({ url: url });
                }
            } else {
                chrome.tabs.create({ url: url });
            }
            return;
        }

        // Side Panel logic: Ctrl+Click opens in panel, Click opens in new tab
        if (isCtrlClick && isWebUrl) {
            e.preventDefault();
            if (utils && typeof utils.openUrlInPanel === 'function') {
                utils.openUrlInPanel(url);
            }
            return;
        }

        chrome.tabs.create({ url: url });
    });

    return bookmarkEl;
}

export async function initializeBookmarksView(container, utils, sortBy = 'dateAdded', isAllExpanded) {
    const bookmarkItemTemplate = document.getElementById('bookmark-item-template');
    const bookmarkFolderTemplate = document.getElementById('bookmark-folder-template');

    if (!bookmarkItemTemplate || !bookmarkFolderTemplate) {
        console.error('Bookmark templates not found.');
        container.innerHTML = `<p class="no-groups-message" data-i18n="errorFetchingBookmarks"></p>`;
        if (utils.applyTranslations) utils.applyTranslations(container);
        return;
    }

    const currentFolderElements = container.querySelectorAll('details.bookmark-folder');
    const isFirstRender = currentFolderElements.length === 0;

    const openFolderIds = new Set();
    const closedFolderIds = new Set();

    if (!isFirstRender) {
        currentFolderElements.forEach((folder) => {
            const id = folder.dataset.folderId;
            if (folder.open) openFolderIds.add(id);
            else closedFolderIds.add(id);
        });
    }

    let bookmarkTree;
    let duplicateUrlSet;

    const cachedBookmarks = get(prefetchCache).bookmarks;
    if (cachedBookmarks) {
        bookmarkTree = cachedBookmarks.tree;
        duplicateUrlSet = new Set(cachedBookmarks.duplicateUrlSet || []);
    } else {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
            if (response && response.success && response.bookmarks) {
                bookmarkTree = response.bookmarks;
                duplicateUrlSet = new Set(response.duplicateUrlSet || []);
                prefetchCache.update((c) => ({
                    ...c,
                    bookmarks: { tree: bookmarkTree, duplicateUrlSet: response.duplicateUrlSet },
                }));
            } else {
                container.innerHTML = `<p class="no-groups-message" data-i18n="noBookmarksFound"></p>`;
                if (utils.applyTranslations) utils.applyTranslations(container);
                return;
            }
        } catch (error) {
            console.error('Error getting bookmark tree:', error);
            container.innerHTML = `<p class="no-groups-message" data-i18n="errorFetchingBookmarks"></p>`;
            if (utils.applyTranslations) utils.applyTranslations(container);
            return;
        }
    }

    container.innerHTML = '';

    const countSubfolders = (folderNode) => {
        if (!folderNode.children) return 0;
        return folderNode.children.filter((child) => child.children).length;
    };

    const countTotalBookmarks = (folderNode) => {
        let count = 0;
        if (folderNode.children) {
            for (const child of folderNode.children) {
                if (child.url) count++;
                else if (child.children) count += countTotalBookmarks(child);
            }
        }
        return count;
    };

    const sortBookmarkNodes = (nodes, sortBy) => {
        const folders = nodes.filter((node) => node.children);
        const bookmarks = nodes.filter((node) => node.url);
        folders.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        switch (sortBy) {
            case 'title':
                bookmarks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
                break;
            case 'lastAccessed':
                bookmarks.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0));
                break;
            case 'dateAdded':
            default:
                bookmarks.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
                break;
        }
        if (sortBy === 'count') {
            folders.sort((a, b) => countTotalBookmarks(b) - countTotalBookmarks(a));
        }
        return [...folders, ...bookmarks];
    };

    const collectUrlsInternal = (node) => {
        let urls = [];
        if (node.url) urls.push(node.url);
        if (node.children) {
            for (const child of node.children) {
                urls = urls.concat(collectUrlsInternal(child));
            }
        }
        return urls;
    };

    const renderBookmarkNode = (node, parentContainer, duplicateUrlSet) => {
        if (node.url) {
            const bookmarkEl = createBookmarkElement(node, bookmarkItemTemplate, duplicateUrlSet, utils);
            parentContainer.appendChild(bookmarkEl);
        } else if (node.children) {
            if (node.id === '0') {
                const sortedChildren = sortBookmarkNodes(node.children, sortBy);
                sortedChildren.forEach((childNode) => renderBookmarkNode(childNode, parentContainer, duplicateUrlSet));
                return;
            }

            const folderEl = bookmarkFolderTemplate.content.cloneNode(true).firstElementChild;
            folderEl.dataset.folderId = node.id;

            // Configuracion de apertura inicial
            if (isFirstRender) {
                folderEl.open = isAllExpanded;
            } else {
                if (openFolderIds.has(node.id)) folderEl.open = true;
                else if (closedFolderIds.has(node.id)) folderEl.open = false;
                else folderEl.open = isAllExpanded;
            }

            let displayTitle = node.title;
            if (!displayTitle) {
                if (node.id === '1') displayTitle = chrome.i18n.getMessage('bookmarkBar') || 'Bookmarks Bar';
                else if (node.id === '2') displayTitle = chrome.i18n.getMessage('otherBookmarks') || 'Other Bookmarks';
                else if (node.id === '3')
                    displayTitle = chrome.i18n.getMessage('mobileBookmarks') || 'Mobile Bookmarks';
                else displayTitle = 'Untitled Folder';
            }

            const nameEl = folderEl.querySelector('.folder-name');
            nameEl.textContent = displayTitle;

            // --- POBLAR CONTADORES ---
            const subfolderCount = countSubfolders(node);
            const totalBookmarks = countTotalBookmarks(node);

            const folderCountContainer = folderEl.querySelector('.folder-count-container');
            const bookmarkCountContainer = folderEl.querySelector('.bookmark-count-container');

            if (subfolderCount > 0) {
                folderEl.querySelector('.subfolder-count').textContent = subfolderCount;
                folderCountContainer.classList.remove('hidden');
            }
            if (totalBookmarks > 0) {
                folderEl.querySelector('.bookmark-count').textContent = totalBookmarks;
                bookmarkCountContainer.classList.remove('hidden');
            }

            const contentContainer = folderEl.querySelector('.bookmark-folder-content');

            const editFolderBtn = folderEl.querySelector('.edit-folder-btn');
            if (editFolderBtn) {
                editFolderBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (folderEl.querySelector('.folder-name-input')) return;

                    const originalName = nameEl.textContent;
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'folder-name-input';
                    input.value = originalName;

                    let isCancelled = false; // Flag local

                    const saveChanges = async () => {
                        const newName = input.value.trim();

                        // If cancelled with ESC, restore name and exit without saving
                        if (isCancelled || !newName || newName === originalName) {
                            nameEl.textContent = originalName;
                            if (input.parentNode) input.replaceWith(nameEl);
                            return;
                        }

                        try {
                            const response = await chrome.runtime.sendMessage({
                                action: 'updateBookmark',
                                payload: { id: node.id, changes: { title: newName } },
                            });

                            if (response && response.success) {
                                nameEl.textContent = newName;
                                node.title = newName;
                                if (utils.showNotification) utils.showNotification('folderRenamed');
                            } else {
                                nameEl.textContent = originalName;
                            }
                        } catch (error) {
                            nameEl.textContent = originalName;
                        }

                        if (input.parentNode) input.replaceWith(nameEl);
                    };

                    input.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') {
                            ev.preventDefault();
                            input.blur();
                        }
                        if (ev.key === 'Escape') {
                            ev.preventDefault();
                            ev.stopPropagation(); // Evitamos que otros scripts procesen este Esc
                            isCancelled = true; // Activamos cancelacion
                            input.blur(); // Al perder el foco, saveChanges no guardara
                        }
                    });

                    input.addEventListener('blur', saveChanges);

                    nameEl.replaceWith(input);
                    input.focus();
                    input.select();
                });
            }

            const addFolderBtn = folderEl.querySelector('.add-folder-btn');
            if (addFolderBtn) {
                // Stops the input's 'blur' from firing when this button is clicked
                addFolderBtn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
                addFolderBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showInlineCreateFolderInput(node.id, folderEl);
                });
            }

            const deleteFolderBtn = folderEl.querySelector('.delete-folder-btn');
            if (deleteFolderBtn) {
                deleteFolderBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (await confirmAction({ messageKey: 'confirmDeleteFolder', params: [displayTitle] })) {
                        const response = await chrome.runtime.sendMessage({
                            action: 'deleteBookmarkTree',
                            payload: { id: node.id },
                        });
                        if (response && response.success) folderEl.remove();
                    }
                });
            }

            const copyAllBtn = folderEl.querySelector('.copy-all-btn');
            if (copyAllBtn) {
                copyAllBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Collect every URL through the internal helper
                    const urlsToCopy = collectUrlsInternal(node);

                    if (urlsToCopy.length > 0) {
                        const textToCopy = urlsToCopy.join('\n');

                        // --- COPIADO DE CARPETA ---
                        navigator.clipboard
                            .writeText(textToCopy)
                            .then(() => {
                                if (utils && utils.showNotification) {
                                    // Pass the URL count for the "X URLs copied" message
                                    utils.showNotification('urlsCopied', false, [urlsToCopy.length]);
                                }
                            })
                            .catch((err) => {
                                console.error('Error al copiar carpeta:', err);
                                if (utils && utils.showNotification) {
                                    utils.showNotification('errorCopying', true);
                                }
                            });
                    } else {
                        if (utils && utils.showNotification) {
                            utils.showNotification('noUrlsToCopy', true);
                        }
                    }
                });
            }

            const openAllBtn = folderEl.querySelector('.open-all-btn');
            if (openAllBtn) {
                openAllBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const urlsToOpen = collectUrlsInternal(node);
                    if (urlsToOpen.length > 0) {
                        if (utils && utils.createTabsInBatches) {
                            await utils.createTabsInBatches(urlsToOpen.map((url) => ({ url })));
                            if (utils.showNotification) {
                                // Using ctrlClickToOpen as it has the message "All URLs have been opened"
                                utils.showNotification('ctrlClickToOpen');
                            }
                        }
                    } else {
                        if (utils && utils.showNotification) {
                            utils.showNotification('noUrlsToOpen', true);
                        }
                    }
                });
            }

            const exportFolderBtn = folderEl.querySelector('.export-folder-btn');
            if (exportFolderBtn) {
                exportFolderBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (utils && utils.exportBookmarkFolder) {
                        utils.exportBookmarkFolder(node, utils);
                    }
                });
            }

            if (utils && utils.createOverflowMenu) {
                const folderActions = folderEl.querySelector('.folder-actions');
                if (folderActions) {
                    utils.createOverflowMenu(folderActions, 'bookmark-folder-template', folderEl);
                }
            }

            const isRootFolder = ['1', '2', '3'].includes(node.id);
            if (isRootFolder) {
                if (editFolderBtn) editFolderBtn.style.display = 'none';
                if (deleteFolderBtn) deleteFolderBtn.style.display = 'none';
            }

            if (node.children.length > 0) {
                const sortedChildren = sortBookmarkNodes(node.children, sortBy);
                sortedChildren.forEach((childNode) => renderBookmarkNode(childNode, contentContainer, duplicateUrlSet));
            }

            attachDragAndDropEvents(folderEl, node, true);

            parentContainer.appendChild(folderEl);
        }
    };

    const fragment = document.createDocumentFragment();
    if (bookmarkTree && bookmarkTree.length > 0) {
        bookmarkTree.forEach((rootNode) => renderBookmarkNode(rootNode, fragment, duplicateUrlSet));

        if (fragment.hasChildNodes()) {
            container.appendChild(fragment);
        } else {
            container.innerHTML = `<p class="no-groups-message" data-i18n="noBookmarksFound"></p>`;
        }
    } else {
        container.innerHTML = `<p class="no-groups-message" data-i18n="noBookmarksFound"></p>`;
    }

    if (utils.applyTranslations) utils.applyTranslations(container);
    if (utils.updateScrollButtons) utils.updateScrollButtons();
}

export function clearBookmarkCache() {
    // Redundant now, kept as a fallback
    chrome.runtime.sendMessage({ action: 'forceClearBookmarkCache' });
}
