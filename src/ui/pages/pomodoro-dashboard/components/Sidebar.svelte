<script>
    import { tt } from '../../../stores/i18nStore.js';

    let {
        folderNames = [],
        folderMap = {},
        projectCounts = {},
        activeProject = null,
        activeFolder = null,
        openFolders = new Set(),
        closedFolders = new Set(),
        sidebarQuery = '',
        standaloneProjs = [],
        ontoggleFolder,
        onselectProject,
        onrenameProject,
    } = $props();

    let editingProject = $state(null);
    let editingName = $state('');
    let editInputEl = $state(null);

    let matchesQuery = $derived.by(
        () => (name) => !sidebarQuery || name.toLowerCase().includes(sidebarQuery.toLowerCase()),
    );

    function toggleFolder(folder, isProjectInThisFolder) {
        ontoggleFolder?.({ folder, isProjectInThisFolder });
    }

    function selectProject(p) {
        if (editingProject === p) return;
        onselectProject?.({ project: p });
    }

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
            onrenameProject?.({ oldName, newName });
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

{#each folderNames as folder (folder)}
    {@const projects = [...(folderMap[folder] || [])].sort()}
    {@const folderMatches = matchesQuery(folder)}
    {@const anyProjectMatches = projects.some((p) => matchesQuery(p))}
    {#if folderMatches || anyProjectMatches}
        {@const count = projects.reduce((a, p) => a + (projectCounts[p] || 0), 0)}
        {@const isProjectInThisFolder = activeProject && projects.includes(activeProject)}
        {@const q = sidebarQuery.toLowerCase()}
        {@const isOpen = (openFolders.has(folder) || isProjectInThisFolder || q) && !closedFolders.has(folder)}
        {@const isActiveFolder = activeFolder === folder && !activeProject}

        <div class="folder-block" class:open={isOpen}>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="folder-row"
                class:active={isActiveFolder}
                data-folder={folder}
                onclick={(e) => {
                    if (e.target === e.currentTarget) toggleFolder(folder, isProjectInThisFolder);
                }}
            >
                <span class="folder-arrow" onclick={() => toggleFolder(folder, isProjectInThisFolder)}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l8 7-8 7" /></svg>
                </span>
                <span class="si-folder-icon" onclick={() => toggleFolder(folder, isProjectInThisFolder)}>
                    {#if activeFolder === folder || q || projects.includes(activeProject)}
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
                            ><path
                                d="M4 9V6.472a2 2 0 0 1 .211-.894L5 4h5l1 2h10a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2h-2"
                            /><path
                                d="M17.236 9H2.31a1 1 0 0 0-.965 1.263l2.254 8.263A2 2 0 0 0 5.528 20H19.69a1 1 0 0 0 .965-1.263l-2.455-9A1 1 0 0 0 17.236 9Z"
                            /></svg
                        >
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
                            ><path
                                d="M3 8.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C4.52 5 5.08 5 6.2 5h3.475c.489 0 .733 0 .963.055.204.05.4.13.579.24.201.123.374.296.72.642l.126.126c.346.346.519.519.72.642q.271.165.579.24c.23.055.474.055.963.055H17.8c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C21 8.52 21 9.08 21 10.2v5.6c0 1.12 0 1.68-.218 2.108a2 2 0 0 1-.874.874C19.48 19 18.92 19 17.8 19H6.2c-1.12 0-1.68 0-2.108-.218a2 2 0 0 1-.874-.874C3 17.48 3 16.92 3 15.8z"
                            /></svg
                        >
                    {/if}
                </span>
                <span class="folder-label" onclick={() => toggleFolder(folder, isProjectInThisFolder)}>{folder}</span>
                <span class="folder-count" onclick={() => toggleFolder(folder, isProjectInThisFolder)}>{count}</span>
            </div>
            <!-- The inner wrapper is what clips while the folder grows; see
                 `.folder-children` in dashboard.css. -->
            <div class="folder-children">
                <div class="folder-children-inner">
                    {#each projects as p (p)}
                        {#if matchesQuery(p) || matchesQuery(folder)}
                            {@const cnt = projectCounts[p] || 0}
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div
                                class="sidebar-item"
                                class:active={activeProject === p}
                                data-project={p}
                                onclick={() => selectProject(p)}
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
                </div>
            </div>
        </div>
    {/if}
{/each}

{#if folderNames.length > 0 && standaloneProjs.length > 0}
    <div class="sidebar-divider"></div>
{/if}

{#each standaloneProjs as p (p)}
    {@const cnt = projectCounts[p] || 0}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="sidebar-item" class:active={activeProject === p} data-project={p} onclick={() => selectProject(p)}>
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
{/each}
