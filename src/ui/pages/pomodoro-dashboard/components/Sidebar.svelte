<script>
    import { t, tt } from '../../../stores/i18nStore.js';

    let {
        folderNames = [],
        folderMap = {},
        projectCounts = {},
        standaloneProjs = [],
        totalCount = 0,
        activeProject = null,
        activeFolder = null,
        openFolders = new Set(),
        query = '',
        view = 'dashboard',
        onQuery,
        onSelectAll,
        onSelectProject,
        onSelectFolder,
        onToggleFolder,
        onRenameProject,
        onOpenSettings,
    } = $props();

    let editingProject = $state(null);
    let editingName = $state('');
    let editInputEl = $state(null);

    const needle = $derived(query.trim().toLowerCase());
    const matchesQuery = $derived.by(() => (name) => !needle || name.toLowerCase().includes(needle));

    /**
     * A search always opens what it found; otherwise the folder is open because the
     * reader opened it. Selecting a folder or project opens it too, by adding it to
     * openFolders in the parent.
     */
    const isOpen = (folder) => !!needle || openFolders.has(folder);

    const hasMatchingFolders = $derived.by(() => {
        return folderNames.some((folder) => {
            const projects = folderMap[folder] || [];
            return matchesQuery(folder) || [...projects].some((p) => matchesQuery(p));
        });
    });

    const hasMatchingStandalone = $derived.by(() => {
        return standaloneProjs.some((p) => matchesQuery(p));
    });

    const hasAnyMatching = $derived(hasMatchingFolders || hasMatchingStandalone);

    function startEditing(p) {
        editingProject = p;
        editingName = p;
        setTimeout(() => {
            if (editInputEl) {
                editInputEl.focus();
                editInputEl.select();
            }
        }, 0);
    }

    function saveEditing(oldName) {
        if (!editingProject) return;
        const newName = editingName.trim().slice(0, 18);
        editingProject = null;
        if (newName && newName !== oldName) {
            onRenameProject?.(oldName, newName);
        }
    }

    function handleEditKeydown(e, oldName) {
        if (e.key === 'Enter') {
            saveEditing(oldName);
        } else if (e.key === 'Escape') {
            editingProject = null;
        }
    }
</script>

<aside class="sidebar">
    <div class="sidebar-header">
        <div class="sidebar-top-label">{$t('dashboardProjects') || 'Projects'}</div>
        <div class="sidebar-search">
            <svg
                class="search-icon"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                focusable="false"
            >
                <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" />
                <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <input
                type="text"
                placeholder={$t('dashboardSearch')}
                value={query}
                oninput={(e) => onQuery?.(e.currentTarget.value)}
            />
        </div>
    </div>

    <!-- All projects item -->
    <div class="sidebar-all">
        <div
            class="sidebar-item"
            class:active={view !== 'settings' && !activeProject && !activeFolder}
            role="button"
            tabindex="0"
            title={$tt('dashboardAllProjects') || 'All projects'}
            onclick={() => onSelectAll?.()}
            onkeydown={(e) => e.key === 'Enter' && onSelectAll?.()}
        >
            <span class="si-name">{$t('dashboardAllProjects') || 'All projects'}</span>
            {#if totalCount > 0}
                <span class="si-count">{totalCount}</span>
            {/if}
        </div>
    </div>

    <!-- Folders + projects tree -->
    <div class="sidebar-scroll">
        {#each folderNames as folder (folder)}
            {@const projects = [...(folderMap[folder] || [])].sort()}
            {@const folderMatches = matchesQuery(folder)}
            {@const anyProjectMatches = projects.some((p) => matchesQuery(p))}
            {#if folderMatches || anyProjectMatches}
                {@const count = projects.reduce((a, p) => a + (projectCounts[p] || 0), 0)}
                {@const open = isOpen(folder)}
                {@const isActiveFolder = view !== 'settings' && activeFolder === folder && !activeProject}

                <div class="folder-block" class:open>
                    <div
                        class="folder-row"
                        class:active={isActiveFolder}
                        role="button"
                        tabindex="0"
                        data-folder={folder}
                        title={folder}
                        onclick={() => onSelectFolder?.(folder)}
                        onkeydown={(e) => {
                            if (e.key === 'Enter') {
                                onSelectFolder?.(folder);
                                return;
                            }
                            if (e.key === 'ArrowRight' && !open) {
                                e.preventDefault();
                                onToggleFolder?.(folder);
                            } else if (e.key === 'ArrowLeft' && open) {
                                e.preventDefault();
                                onToggleFolder?.(folder);
                            }
                        }}
                    >
                        <span
                            class="folder-arrow"
                            role="button"
                            tabindex="0"
                            aria-expanded={open}
                            title={open ? $tt('collapseFolder') : $tt('expandFolder')}
                            aria-label={open ? $tt('collapseFolder') : $tt('expandFolder')}
                            onclick={(e) => {
                                e.stopPropagation();
                                onToggleFolder?.(folder);
                            }}
                            onkeydown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onToggleFolder?.(folder);
                                }
                            }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5l8 7-8 7" />
                            </svg>
                        </span>
                        <span class="si-folder-icon">
                            {#if open || isActiveFolder || (activeProject && projects.includes(activeProject))}
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    style="flex-shrink:0"
                                >
                                    <path
                                        d="M4 9V6.472a2 2 0 0 1 .211-.894L5 4h5l1 2h10a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2h-2"
                                    />
                                    <path
                                        d="M17.236 9H2.31a1 1 0 0 0-.965 1.263l2.254 8.263A2 2 0 0 0 5.528 20H19.69a1 1 0 0 0 .965-1.263l-2.455-9A1 1 0 0 0 17.236 9Z"
                                    />
                                </svg>
                            {:else}
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    style="flex-shrink:0"
                                >
                                    <path
                                        d="M3 8.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C4.52 5 5.08 5 6.2 5h3.475c.489 0 .733 0 .963.055.204.05.4.13.579.24.201.123.374.296.72.642l.126.126c.346.346.519.519.72.642q.271.165.579.24c.23.055.474.055.963.055H17.8c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C21 8.52 21 9.08 21 10.2v5.6c0 1.12 0 1.68-.218 2.108a2 2 0 0 1-.874.874C19.48 19 18.92 19 17.8 19H6.2c-1.12 0-1.68 0-2.108-.218a2 2 0 0 1-.874-.874C3 17.48 3 16.92 3 15.8z"
                                    />
                                </svg>
                            {/if}
                        </span>
                        <span class="folder-label">{folder}</span>
                        <span class="folder-count">{count}</span>
                    </div>

                    <div class="folder-children">
                        <div class="folder-children-inner">
                            {#each projects as p (p)}
                                {#if matchesQuery(p) || folderMatches}
                                    {@const cnt = projectCounts[p] || 0}
                                    <div
                                        class="sidebar-item"
                                        class:active={view !== 'settings' && activeProject === p}
                                        data-project={p}
                                        role="button"
                                        tabindex="0"
                                        title={p}
                                        onclick={() => onSelectProject?.(p)}
                                        onkeydown={(e) => e.key === 'Enter' && onSelectProject?.(p)}
                                    >
                                        {#if editingProject === p}
                                            <input
                                                bind:this={editInputEl}
                                                class="si-edit-input"
                                                type="text"
                                                maxlength="18"
                                                bind:value={editingName}
                                                onkeydown={(e) => handleEditKeydown(e, p)}
                                                onblur={() => saveEditing(p)}
                                                onclick={(e) => e.stopPropagation()}
                                            />
                                        {:else}
                                            <span class="si-name">{p}</span>
                                            <button
                                                type="button"
                                                class="si-edit-btn"
                                                title={$tt('editProjectName') || 'Edit name'}
                                                aria-label={$tt('editProjectName') || 'Edit name'}
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    startEditing(p);
                                                }}
                                            >
                                                <svg
                                                    width="12"
                                                    height="12"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    aria-hidden="true"
                                                    focusable="false"
                                                >
                                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"
                                                    ></path>
                                                </svg>
                                            </button>
                                            <span class="si-count">{cnt}</span>
                                        {/if}
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}
        {/each}

        {#if folderNames.length > 0 && standaloneProjs.length > 0 && hasMatchingStandalone}
            <div class="sidebar-divider"></div>
        {/if}

        {#each standaloneProjs as p (p)}
            {#if matchesQuery(p)}
                {@const cnt = projectCounts[p] || 0}
                <div
                    class="sidebar-item"
                    class:active={view !== 'settings' && activeProject === p}
                    data-project={p}
                    role="button"
                    tabindex="0"
                    title={p}
                    onclick={() => onSelectProject?.(p)}
                    onkeydown={(e) => e.key === 'Enter' && onSelectProject?.(p)}
                >
                    {#if editingProject === p}
                        <input
                            bind:this={editInputEl}
                            class="si-edit-input"
                            type="text"
                            maxlength="18"
                            bind:value={editingName}
                            onkeydown={(e) => handleEditKeydown(e, p)}
                            onblur={() => saveEditing(p)}
                            onclick={(e) => e.stopPropagation()}
                        />
                    {:else}
                        <span class="si-name">{p}</span>
                        <button
                            type="button"
                            class="si-edit-btn"
                            title={$tt('editProjectName') || 'Edit name'}
                            aria-label={$tt('editProjectName') || 'Edit name'}
                            onclick={(e) => {
                                e.stopPropagation();
                                startEditing(p);
                            }}
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                            </svg>
                        </button>
                        <span class="si-count">{cnt}</span>
                    {/if}
                </div>
            {/if}
        {/each}

        {#if !hasAnyMatching}
            <div class="no-data-msg">{$t('dashboardNoProjects') || 'No projects found'}</div>
        {/if}
    </div>

    <!-- Pinned to the bottom: Settings -->
    <div class="sidebar-footer">
        <div
            class="sidebar-item"
            class:active={view === 'settings'}
            role="button"
            tabindex="0"
            title={$tt('pomodoroSettingsHint')}
            onclick={() => onOpenSettings?.()}
            onkeydown={(e) => e.key === 'Enter' && onOpenSettings?.()}
        >
            <svg
                class="si-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
                focusable="false"
            >
                <circle cx="12" cy="12" r="3" />
                <path
                    d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                />
            </svg>
            <span class="si-name">{$t('pomodoroSettingsTitle')}</span>
        </div>
    </div>
</aside>
