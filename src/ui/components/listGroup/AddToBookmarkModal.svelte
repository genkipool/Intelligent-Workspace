<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import { notificationStore } from '../../stores/notificationStore.js';
    import { SvelteSet } from 'svelte/reactivity';

    /**
     * @type {{
     *   show: boolean,
     *   tab: { title?: string, url?: string },
     *   mode: string,
     *   bookmarkData: ({ id: string, title: string, url: string, parentId: string })|null,
     *   onClose: () => void,
     *   onSaved: () => void
     * }}
     */
    let { show = false, tab = {}, mode = 'add', bookmarkData = null, onClose, onSaved } = $props();

    // ── Constants ──────────────────────────────────────────────────────
    const FOLDER_ACTIONS = [
        { name: 'create', tooltip: 'createNewFolder', icon: '#icon-create-rule' },
        { name: 'edit', tooltip: 'editFolderName', icon: '#icon-edit' },
        { name: 'delete', tooltip: 'deleteFolder', icon: '#icon-trash' },
    ];
    const ROOT_FOLDER_IDS = ['1', '2', '3'];

    // ── Reactive state ─────────────────────────────────────────────────
    let title = $state('');
    let url = $state('');
    let searchQuery = $state('');
    let folderTree = $state([]);
    let isLoading = $state(false);
    let currentActionIndex = $state(0);
    let selectedFolderId = $state(null);
    /** @type {import('svelte/reactivity').SvelteSet<string>} */
    let expandedFolders = new SvelteSet();
    let newFolderParentId = $state(null);
    let newFolderName = $state('');
    let editingFolderId = $state(null);
    let saving = $state(false);

    // ── Derived ────────────────────────────────────────────────────────
    let currentAction = $derived(FOLDER_ACTIONS[currentActionIndex]);
    let searchTerm = $derived(searchQuery.toLowerCase().trim());
    let hasSearch = $derived(searchTerm.length > 0);

    /**
     * Annotate the folder tree with _visible and _matched flags for search filtering.
     * Only non-leaf nodes (folders) are included.
     */
    let filteredTree = $derived.by(() => annotateTree(folderTree, searchTerm));

    // ── Effects ────────────────────────────────────────────────────────
    $effect(() => {
        if (show) {
            // Reset all modal state
            title = mode === 'edit' && bookmarkData ? bookmarkData.title || '' : tab.title || '';
            url = mode === 'edit' && bookmarkData ? bookmarkData.url || '' : tab.url || '';
            searchQuery = '';
            selectedFolderId = null;
            currentActionIndex = 0;
            expandedFolders.clear();
            newFolderParentId = null;
            newFolderName = '';
            editingFolderId = null;
            saving = false;
            loadBookmarks();
        }
    });

    // Auto-expand matching folders during search
    $effect(() => {
        if (hasSearch) {
            const matching = new SvelteSet();
            function collectMatching(nodes) {
                for (const node of nodes) {
                    if (node._matched) matching.add(node.id);
                    if (node.children) collectMatching(node.children);
                }
            }
            collectMatching(filteredTree);
            matching.forEach((id) => expandedFolders.add(id));
        }
    });

    // ── Bookmark loading ───────────────────────────────────────────────
    async function loadBookmarks() {
        isLoading = true;
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
            if (response.success && response.bookmarks) {
                // chrome.bookmarks.getTree() returns the root node (id '0'); it
                // omits it and directly displays its children ("Bookmarks Bar",
                // "Other Bookmarks"...).
                folderTree = response.bookmarks.flatMap((node) =>
                    node.id === '0' && node.children ? node.children : [node],
                );
                // In edit mode, auto-select and expand to the current parent folder
                if (mode === 'edit' && bookmarkData?.parentId) {
                    selectedFolderId = bookmarkData.parentId;
                    expandToFolder(bookmarkData.parentId, folderTree);
                }
            } else {
                folderTree = [];
            }
        } catch (err) {
            console.error('Error fetching bookmarks:', err);
            folderTree = [];
        } finally {
            isLoading = false;
        }
    }

    function expandToFolder(folderId, nodes) {
        if (!nodes) return;
        for (const node of nodes) {
            if (node.id === folderId) {
                expandedFolders.add(folderId);
                return true;
            }
            if (node.children) {
                if (expandToFolder(folderId, node.children)) {
                    expandedFolders.add(node.id);
                    return true;
                }
            }
        }
        return false;
    }

    // ── Tree annotation for search ─────────────────────────────────────
    function annotateTree(nodes, term) {
        if (!term) {
            return nodes
                .filter((n) => n.children)
                .map((n) => ({
                    ...n,
                    _visible: true,
                    _matched: false,
                    children: n.children ? annotateTree(n.children, term) : [],
                }));
        }
        return nodes
            .filter((n) => n.children)
            .map((node) => {
                const children = node.children ? annotateTree(node.children, term) : [];
                const nameMatch = (node.title || '').toLowerCase().includes(term);
                const childMatch = children.some((c) => c._visible);
                return {
                    ...node,
                    _visible: nameMatch || childMatch,
                    _matched: nameMatch,
                    children,
                };
            });
    }

    // ── Node lookup ────────────────────────────────────────────────────
    function findNodeById(nodes, id) {
        if (!nodes) return null;
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                const found = findNodeById(node.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    function removeNodeFromCache(nodeId, nodes) {
        if (!nodes) return false;
        for (let i = nodes.length - 1; i >= 0; i--) {
            if (nodes[i].id === nodeId) {
                nodes.splice(i, 1);
                return true;
            }
            if (nodes[i].children) {
                if (removeNodeFromCache(nodeId, nodes[i].children)) return true;
            }
        }
        return false;
    }

    // ── Expand / collapse ──────────────────────────────────────────────
    function isExpanded(id) {
        return expandedFolders.has(id);
    }

    function toggleFolder(id) {
        if (expandedFolders.has(id)) {
            expandedFolders.delete(id);
        } else {
            expandedFolders.add(id);
        }
    }

    function toggleAllFolders() {
        if (!hasSearch) {
            const expandable = getExpandableFolders(filteredTree);
            const allExpanded = expandable.length > 0 && expandable.every((id) => expandedFolders.has(id));
            if (allExpanded) {
                expandable.forEach((id) => expandedFolders.delete(id));
            } else {
                expandable.forEach((id) => expandedFolders.add(id));
            }
        }
    }

    /** Collect IDs of folders that have visible children */
    function getExpandableFolders(nodes) {
        const ids = [];
        for (const node of nodes) {
            if (node.children && node.children.some((c) => c.children)) {
                ids.push(node.id);
                ids.push(...getExpandableFolders(node.children));
            }
        }
        return ids;
    }

    let toggleAllExpanded = $derived.by(() => {
        const expandable = getExpandableFolders(filteredTree);
        return expandable.length > 0 && expandable.every((id) => expandedFolders.has(id));
    });

    // ── Folder click ───────────────────────────────────────────────────
    function handleFolderClick(nodeId, event) {
        if (event.target.closest('.folder-action-btn, .new-folder-input, .folder-name-input, .new-folder-cancel'))
            return;
        selectedFolderId = nodeId;
        if (!hasSearch) {
            toggleFolder(nodeId);
        }
    }

    // ── Action cycling ─────────────────────────────────────────────────
    function cycleAction() {
        currentActionIndex = (currentActionIndex + 1) % FOLDER_ACTIONS.length;
    }

    function applyMainAction() {
        if (currentAction.name === 'create') {
            // Create a new folder — if a folder is selected use it as parent, else use '2' (Bookmarks Bar)
            const parentId = selectedFolderId || '2';
            newFolderParentId = parentId;
            newFolderName = '';
            return;
        }
        if (!selectedFolderId) {
            notificationStore.show($t('selectFolderToAction'), 'error');
            return;
        }
        const folderNode = findNodeById(folderTree, selectedFolderId);
        if (!folderNode) return;
        if (currentAction.name === 'edit') {
            editingFolderId = selectedFolderId;
        } else if (currentAction.name === 'delete') {
            deleteFolder(selectedFolderId);
        }
    }

    function handlePerFolderAction(node, event) {
        event.stopPropagation();
        event.preventDefault();
        const action = ROOT_FOLDER_IDS.includes(node.id) ? FOLDER_ACTIONS[0] : currentAction;
        if (action.name === 'create') {
            newFolderParentId = node.id;
            newFolderName = '';
        } else if (action.name === 'edit') {
            editingFolderId = node.id;
        } else if (action.name === 'delete') {
            deleteFolder(node.id);
        }
    }

    // ── Create folder ──────────────────────────────────────────────────
    async function createNewFolder(name, parentId) {
        const parentNode = findNodeById(folderTree, parentId);
        if (parentNode?.children) {
            const isDuplicate = parentNode.children.some(
                (child) => !child.url && child.title?.toLowerCase() === name.toLowerCase(),
            );
            if (isDuplicate) {
                notificationStore.show($t('errorDuplicateFolderName'), 'error');
                return null;
            }
        }
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'createBookmark',
                payload: { title: name, parentId: parentId || '2' },
            });
            if (response.success && response.bookmark) {
                notificationStore.show($t('folderCreated'), 'success');
                await loadBookmarks();
                // Select the new folder
                selectedFolderId = response.bookmark.id;
                return response.bookmark;
            }
            throw new Error(response.error || 'Unknown error');
        } catch (err) {
            console.error('Error creating folder:', err);
            notificationStore.show($t('errorCreatingFolder'), 'error');
            return null;
        }
    }

    async function confirmCreateFolder() {
        const name = newFolderName.trim();
        if (!name) {
            newFolderParentId = null;
            return;
        }
        const parentId = newFolderParentId || '2';
        const created = await createNewFolder(name, parentId);
        if (created) {
            newFolderParentId = null;
            newFolderName = '';
        }
    }

    function cancelCreateFolder() {
        newFolderParentId = null;
        newFolderName = '';
    }

    function handleNewFolderKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmCreateFolder();
        } else if (e.key === 'Escape') {
            cancelCreateFolder();
        }
    }

    // ── Edit folder ────────────────────────────────────────────────────
    let editFolderNameInput = $state('');
    let editingFolderOriginalName = $state('');

    function startEditFolder(id) {
        const node = findNodeById(folderTree, id);
        if (!node) return;
        editingFolderId = id;
        editingFolderOriginalName = node.title || '';
        editFolderNameInput = node.title || '';
    }

    async function confirmEditFolder() {
        const newName = editFolderNameInput.trim();
        const node = findNodeById(folderTree, editingFolderId);
        if (!node) {
            editingFolderId = null;
            return;
        }
        if (newName && newName !== editingFolderOriginalName) {
            const parentNode = findNodeById(folderTree, node.parentId);
            if (parentNode?.children) {
                const isDuplicate = parentNode.children.some(
                    (child) =>
                        !child.url &&
                        child.id !== editingFolderId &&
                        child.title?.toLowerCase() === newName.toLowerCase(),
                );
                if (isDuplicate) {
                    notificationStore.show($t('errorDuplicateFolderName'), 'error');
                    return;
                }
            }
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'updateBookmark',
                    payload: { id: editingFolderId, changes: { title: newName } },
                });
                if (response.success) {
                    // We need the tree to reflect the change — reload
                    await loadBookmarks();
                    notificationStore.show($t('folderRenamed'), 'success');
                } else {
                    throw new Error(response.error);
                }
            } catch (err) {
                console.error('Error renaming folder:', err);
                notificationStore.show($t('errorRenamingFolder'), 'error');
            }
        }
        editingFolderId = null;
    }

    function cancelEditFolder() {
        editingFolderId = null;
    }

    function handleEditKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmEditFolder();
        } else if (e.key === 'Escape') {
            cancelEditFolder();
        }
    }

    // ── Delete folder ──────────────────────────────────────────────────
    async function deleteFolder(folderId) {
        const node = findNodeById(folderTree, folderId);
        if (!node) return;
        try {
            await chrome.runtime.sendMessage({ action: 'deleteBookmarkTree', payload: { id: folderId } });
            removeNodeFromCache(folderId, folderTree);
            // Trigger reactivity via shallow copy
            folderTree = [...folderTree];
            if (selectedFolderId === folderId) selectedFolderId = null;
            notificationStore.show($t('folderDeleted'), 'success');
        } catch (err) {
            console.error('Error deleting folder:', err);
            notificationStore.show($t('errorDeletingFolder'), 'error');
        }
    }

    // ── Save bookmark ──────────────────────────────────────────────────
    async function handleSave() {
        const titleVal = title.trim();
        const urlVal = url.trim();
        if (!titleVal || !urlVal) {
            notificationStore.show($t('bookmarkTitleUrlRequired'), 'error');
            return false;
        }
        saving = true;
        let targetParentId = selectedFolderId;
        // If there is an active new-folder input, create the folder first
        if (newFolderParentId !== null) {
            const name = newFolderName.trim();
            if (name) {
                const created = await createNewFolder(name, newFolderParentId);
                if (!created) {
                    saving = false;
                    return false;
                }
                targetParentId = created.id;
                newFolderParentId = null;
                newFolderName = '';
            }
        }
        if (!targetParentId) {
            targetParentId = mode === 'edit' && bookmarkData?.parentId ? bookmarkData.parentId : '1';
        }
        try {
            let response;
            if (mode === 'edit' && bookmarkData) {
                // Update metadata
                response = await chrome.runtime.sendMessage({
                    action: 'updateBookmark',
                    payload: { id: bookmarkData.id, changes: { title: titleVal, url: urlVal } },
                });
                if (!response?.success) throw new Error(response?.error || 'Error updating bookmark');
                // Move if folder changed
                if (targetParentId !== bookmarkData.parentId) {
                    const moveResponse = await chrome.runtime.sendMessage({
                        action: 'moveBookmark',
                        payload: { id: bookmarkData.id, destination: { parentId: targetParentId } },
                    });
                    if (!moveResponse?.success) throw new Error(moveResponse?.error || 'Error moving bookmark');
                }
                notificationStore.show($t('bookmarkUpdated'), 'success');
            } else {
                response = await chrome.runtime.sendMessage({
                    action: 'createBookmark',
                    payload: { parentId: targetParentId, title: titleVal, url: urlVal },
                });
                if (!response?.success) throw new Error(response?.error || 'Error creating bookmark');
                await chrome.storage.local.set({ lastUsedBookmarkFolderId: targetParentId });
                notificationStore.show($t('bookmarkSaved'), 'success');
            }
            onSaved?.();
            onClose?.();
            return true;
        } catch (err) {
            console.error('Error saving bookmark:', err);
            notificationStore.show($t('errorSavingBookmark'), 'error');
            return false;
        } finally {
            saving = false;
        }
    }

    // ── Close ──────────────────────────────────────────────────────────
    function handleClose() {
        onClose?.();
    }

    // ── Search highlighting ───────────────────────────────────────────
    /**
     * Split text into highlighted/non-highlighted parts for search highlighting.
     */
    function splitHighlight(text, term) {
        if (!term || !text) return [{ text: text || '', highlighted: false, key: 0 }];
        const escaped = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        const parts = [];
        let lastIndex = 0;
        let key = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ text: text.substring(lastIndex, match.index), highlighted: false, key: key++ });
            }
            parts.push({ text: match[0], highlighted: true, key: key++ });
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
            parts.push({ text: text.substring(lastIndex), highlighted: false, key: key++ });
        }
        if (parts.length === 0) {
            parts.push({ text: text || '', highlighted: false, key: 0 });
        }
        return parts;
    }

    // ── Action icon helper ─────────────────────────────────────────────
    function folderActionIcon(node) {
        if (ROOT_FOLDER_IDS.includes(node.id)) {
            return '#icon-create-rule';
        }
        return currentAction.icon;
    }

    function folderActionTooltip(node) {
        if (ROOT_FOLDER_IDS.includes(node.id)) {
            return $t('createNewFolder');
        }
        return $t(currentAction.tooltip);
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-bookmark-modal-title"
        tabindex="-1"
        use:dismissOnBackdrop={handleClose}
        onkeydown={(e) => e.key === 'Escape' && handleClose()}
    >
        <div class="modal-content add-to-bookmark-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 id="add-to-bookmark-modal-title">
                    {mode === 'edit' && bookmarkData ? $t('editBookmark') : $t('addToBookmarkFolder')}
                </h2>
                <button class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button>
            </div>

            <div class="modal-body">
                <!-- ── Form inputs ─────────────────────────────── -->
                <div class="form-group">
                    <label for="bookmark-title-input">{$t('bookmarkTargetTitleLabel')}</label>
                    <input
                        id="bookmark-title-input"
                        type="text"
                        bind:value={title}
                        placeholder={$t('bookmarkTitlePlaceholder')}
                        autocomplete="off"
                        spellcheck="false"
                        translate="no"
                    />
                </div>
                <div class="form-group">
                    <label for="bookmark-url-input">{$t('bookmarkTargetUrlLabel')}</label>
                    <input
                        id="bookmark-url-input"
                        type="url"
                        bind:value={url}
                        placeholder="https://"
                        autocomplete="off"
                        spellcheck="false"
                        translate="no"
                    />
                </div>

                <!-- ── Folder section ──────────────────────────── -->
                <div class="rules-selection-label">{$t('bookmarkFolders')}</div>

                <div class="search-and-actions-container">
                    <!-- Search -->
                    <div class="search-container-modal">
                        <label for="search-folders-modal-input" class="visually-hidden">
                            {$t('searchFolderPlaceholder')}
                        </label>
                        <input
                            id="search-folders-modal-input"
                            type="search"
                            autocomplete="off"
                            spellcheck="false"
                            translate="no"
                            placeholder={$t('searchFolderPlaceholder')}
                            bind:value={searchQuery}
                        />
                    </div>

                    <button
                        id="toggle-folders-btn"
                        class="control-btn"
                        aria-pressed={String(toggleAllExpanded)}
                        title={$tt(toggleAllExpanded ? 'collapseAllFolders' : 'expandAllFolders')}
                        disabled={getExpandableFolders(filteredTree).length === 0}
                        onclick={toggleAllFolders}
                    >
                        <svg class="toggle-icon-closed" width="16" height="16" aria-hidden="true" focusable="false">
                            <use href="#icon-folder-closed"></use>
                        </svg>
                        <svg class="toggle-icon-open" width="16" height="16" aria-hidden="true" focusable="false">
                            <use href="#icon-folder-open"></use>
                        </svg>
                    </button>
                    <div id="folder-actions-controller" class="folder-actions-controller">
                        <button
                            id="main-folder-action-btn"
                            class="control-btn main-action-btn"
                            title={$tt(currentAction.tooltip)}
                            onclick={applyMainAction}
                        >
                            <svg width="16" height="16" aria-hidden="true" focusable="false">
                                <use href={currentAction.icon}></use>
                            </svg>
                        </button>
                        <button
                            id="next-folder-action-btn"
                            class="control-btn cycle-action-btn"
                            title={$tt('nextAction')}
                            onclick={cycleAction}
                        >
                            <svg width="16" height="16" aria-hidden="true" focusable="false">
                                <use href="#icon-chevron-right"></use>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- ── New folder inline input ─────────────────── -->
                {#if newFolderParentId !== null}
                    <div class="new-folder-container">
                        <input
                            type="text"
                            class="new-folder-input"
                            placeholder={$t('enterFolderNamePlaceholder')}
                            maxlength="100"
                            autocomplete="off"
                            bind:value={newFolderName}
                            onkeydown={handleNewFolderKeydown}
                        />
                        <button class="new-folder-cancel action-btn" title={$tt('cancel')} onclick={cancelCreateFolder}>
                            <svg width="16" height="16">
                                <use href="#icon-close-stroke"></use>
                            </svg>
                        </button>
                    </div>
                {/if}

                <!-- ── Folder tree ─────────────────────────────── -->
                <div id="bookmark-folders-container" class="bookmark-folders-container">
                    {#if isLoading}
                        <p class="loading-message">{$t('loading') || 'Loading...'}</p>
                    {:else if filteredTree.length === 0}
                        <p class="no-folders-found-modal">{$t('noFoldersFound')}</p>
                    {:else}
                        {#snippet renderFolder(node)}
                            {#if node._visible}
                                <details
                                    class="bookmark-folder-item"
                                    class:no-children={!node.children?.some((c) => c.children)}
                                    open={isExpanded(node.id)}
                                >
                                    <summary
                                        class="bookmark-folder-summary"
                                        data-folder-id={node.id}
                                        class:selected={selectedFolderId === node.id}
                                        class:current-folder={mode === 'edit' && bookmarkData?.parentId === node.id}
                                        tabindex="0"
                                        onclick={(e) => handleFolderClick(node.id, e)}
                                        onkeydown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleFolderClick(node.id, e);
                                            }
                                        }}
                                    >
                                        <span class="folder-icon-wrapper">
                                            {#if hasSearch && node._matched}
                                                <svg width="16" height="16" aria-hidden="true" focusable="false">
                                                    <use href="#icon-folder-open"></use>
                                                </svg>
                                            {:else}
                                                <svg width="16" height="16" aria-hidden="true" focusable="false">
                                                    <use href="#icon-folder"></use>
                                                </svg>
                                            {/if}
                                        </span>

                                        {#if editingFolderId === node.id}
                                            <input
                                                type="text"
                                                class="folder-name-input"
                                                autocomplete="off"
                                                bind:value={editFolderNameInput}
                                                onkeydown={handleEditKeydown}
                                                onblur={confirmEditFolder}
                                            />
                                        {:else}
                                            <span class="folder-name">
                                                {#if hasSearch && node._matched}
                                                    {@render highlightName(
                                                        node.title || $t('untitledFolder'),
                                                        searchTerm,
                                                    )}
                                                {:else}
                                                    {node.title || $t('untitledFolder')}
                                                {/if}
                                            </span>
                                        {/if}

                                        {#if node.children?.some((c) => c.children)}
                                            <span class="folder-child-count">
                                                {node.children.filter((c) => c.children).length}
                                            </span>
                                        {/if}

                                        <div class="folder-action-btn-container">
                                            <button
                                                class="folder-action-btn in-folder-action-btn"
                                                title={folderActionTooltip(node)}
                                                onclick={(e) => handlePerFolderAction(node, e)}
                                                onkeydown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        handlePerFolderAction(node, e);
                                                    }
                                                }}
                                            >
                                                <svg width="16" height="16" aria-hidden="true" focusable="false">
                                                    <use href={folderActionIcon(node)}></use>
                                                </svg>
                                            </button>
                                        </div>
                                    </summary>
                                    {#if node.children?.length}
                                        <div class="bookmark-folder-children">
                                            {#each node.children as child (child.id)}
                                                {#if child.children}
                                                    {@render renderFolder(child)}
                                                {/if}
                                            {/each}
                                        </div>
                                    {/if}
                                </details>
                            {/if}
                        {/snippet}

                        {#each filteredTree as node (node.id)}
                            {@render renderFolder(node)}
                        {/each}
                    {/if}
                </div>

                {#if !isLoading && filteredTree.length > 0 && !filteredTree.some((n) => n._visible)}
                    <p class="no-folders-found-modal">{$t('noFoldersFoundForSearch')}</p>
                {/if}
            </div>

            <div class="modal-actions">
                <button id="save-bookmark-btn" class="modal-btn-save" disabled={saving} onclick={handleSave}>
                    {mode === 'edit' && bookmarkData ? $t('updateBookmark') : $t('saveBookmark')}
                </button>
            </div>
        </div>
    </div>
{/if}

{#snippet highlightName(name, term)}
    {#each splitHighlight(name, term) as part (part.key)}
        {#if part.highlighted}
            <span class="search-highlight">{part.text}</span>
        {:else}
            {part.text}
        {/if}
    {/each}
{/snippet}
