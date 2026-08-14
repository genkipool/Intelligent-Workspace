<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { SvelteSet } from 'svelte/reactivity';

    let {
        folderTree = [],
        isLoading = false,
        selectedFolderId = $bindable(null),
        mode = 'add',
        bookmarkData = null,
        onSelectFolder = () => {},
        onCreateFolder = () => {},
        onRenameFolder = () => {},
        onDeleteFolder = () => {},
    } = $props();

    const FOLDER_ACTIONS = [
        { name: 'create', tooltip: 'createNewFolder', icon: '#icon-create-rule' },
        { name: 'edit', tooltip: 'editFolderName', icon: '#icon-edit' },
        { name: 'delete', tooltip: 'deleteFolder', icon: '#icon-trash' },
    ];
    const ROOT_FOLDER_IDS = ['1', '2', '3'];

    let searchQuery = $state('');
    let currentActionIndex = $state(0);
    /** @type {import('svelte/reactivity').SvelteSet<string>} */
    let expandedFolders = new SvelteSet();
    let newFolderParentId = $state(null);
    let newFolderName = $state('');
    let editingFolderId = $state(null);
    let editFolderNameInput = $state('');

    let currentAction = $derived(FOLDER_ACTIONS[currentActionIndex]);
    let searchTerm = $derived(searchQuery.toLowerCase().trim());
    let hasSearch = $derived(searchTerm.length > 0);

    let filteredTree = $derived.by(() => annotateTree(folderTree, searchTerm));

    $effect(() => {
        if (folderTree && folderTree.length > 0) {
            function collectAllFolders(nodes) {
                for (const node of nodes) {
                    if (node.id) expandedFolders.add(node.id);
                    if (node.children) collectAllFolders(node.children);
                }
            }
            collectAllFolders(folderTree);
        }
    });

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


    function annotateTree(nodes, query) {
        if (!nodes || !Array.isArray(nodes)) return [];
        return nodes
            .filter((n) => !n.url)
            .map((node) => {
                const titleLower = (node.title || '').toLowerCase();
                const isMatched = query ? titleLower.includes(query) : false;
                const childNodes = node.children ? annotateTree(node.children, query) : [];
                const hasVisibleChildren = childNodes.some((c) => c._visible);
                return {
                    ...node,
                    children: childNodes.length > 0 ? childNodes : node.children ? [] : undefined,
                    _matched: isMatched,
                    _visible: !query || isMatched || hasVisibleChildren,
                };
            });
    }

    function isExpanded(folderId) {
        return expandedFolders.has(folderId);
    }

    function toggleExpand(folderId) {
        if (expandedFolders.has(folderId)) {
            expandedFolders.delete(folderId);
        } else {
            expandedFolders.add(folderId);
        }
    }

    function getExpandableFolders(nodes) {
        let ids = [];
        for (const n of nodes) {
            if (n.children && n.children.some((c) => c.children)) {
                ids.push(n.id);
                ids = ids.concat(getExpandableFolders(n.children));
            }
        }
        return ids;
    }

    let allExpandable = $derived(getExpandableFolders(filteredTree));
    let toggleAllExpanded = $derived(allExpandable.length > 0 && allExpandable.every((id) => expandedFolders.has(id)));

    function toggleAllFolders() {
        if (toggleAllExpanded) {
            allExpandable.forEach((id) => expandedFolders.delete(id));
        } else {
            allExpandable.forEach((id) => expandedFolders.add(id));
        }
    }

    function cycleAction() {
        currentActionIndex = (currentActionIndex + 1) % FOLDER_ACTIONS.length;
    }

    function handleFolderClick(folderId, e) {
        e?.stopPropagation();
        selectedFolderId = folderId;
        toggleExpand(folderId);
        onSelectFolder(folderId);
    }

    function startCreateFolder(parentId) {
        newFolderParentId = parentId;
        newFolderName = '';
        expandedFolders.add(parentId);
    }

    function cancelCreateFolder() {
        newFolderParentId = null;
        newFolderName = '';
    }

    async function handleNewFolderKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (newFolderName.trim() && newFolderParentId) {
                await onCreateFolder(newFolderParentId, newFolderName.trim());
                newFolderParentId = null;
                newFolderName = '';
            }
        } else if (e.key === 'Escape') {
            cancelCreateFolder();
        }
    }

    function startEditFolder(node) {
        editingFolderId = node.id;
        editFolderNameInput = node.title || '';
    }

    async function confirmEditFolder() {
        if (!editingFolderId) return;
        const trimmed = editFolderNameInput.trim();
        if (trimmed) {
            await onRenameFolder(editingFolderId, trimmed);
        }
        editingFolderId = null;
    }

    function handleEditKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmEditFolder();
        } else if (e.key === 'Escape') {
            editingFolderId = null;
        }
    }

    function handlePerFolderAction(node, e) {
        e?.stopPropagation();
        if (ROOT_FOLDER_IDS.includes(node.id)) {
            startCreateFolder(node.id);
            return;
        }
        if (currentAction.name === 'create') {
            startCreateFolder(node.id);
        } else if (currentAction.name === 'edit') {
            startEditFolder(node);
        } else if (currentAction.name === 'delete') {
            onDeleteFolder(node);
        }
    }

    function applyMainAction() {
        const targetId = selectedFolderId || '1';
        const node = findNodeById(folderTree, targetId);
        if (node) {
            handlePerFolderAction(node);
        }
    }

    function findNodeById(nodes, id) {
        for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
                const found = findNodeById(n.children, id);
                if (found) return found;
            }
        }
        return null;
    }

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
</script>

<div class="rules-selection-label">{$t('bookmarkFolders')}</div>

<div class="search-and-actions-container">
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
        type="button"
        aria-pressed={String(toggleAllExpanded)}
        title={$tt(toggleAllExpanded ? 'collapseAllFolders' : 'expandAllFolders')}
        disabled={allExpandable.length === 0}
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
            type="button"
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
            type="button"
            title={$tt('nextAction')}
            onclick={cycleAction}
        >
            <svg width="16" height="16" aria-hidden="true" focusable="false">
                <use href="#icon-chevron-right"></use>
            </svg>
        </button>
    </div>
</div>

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
        <button class="new-folder-cancel action-btn" type="button" title={$tt('cancel')} onclick={cancelCreateFolder}>
            <svg width="16" height="16">
                <use href="#icon-close-stroke"></use>
            </svg>
        </button>
    </div>
{/if}

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
                                    {@render highlightName(node.title || $t('untitledFolder'), searchTerm)}
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
                                type="button"
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

{#snippet highlightName(name, term)}
    {#each splitHighlight(name, term) as part (part.key)}
        {#if part.highlighted}
            <span class="search-highlight">{part.text}</span>
        {:else}
            {part.text}
        {/if}
    {/each}
{/snippet}
