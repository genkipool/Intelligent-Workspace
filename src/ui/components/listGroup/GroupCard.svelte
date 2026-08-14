<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import TabItem from './TabItem.svelte';
    import Subgroup from './Subgroup.svelte';
    import { listGroupStore, listGroupState } from '../../stores/listGroupStore.js';
    import { animateAndRemove } from '../../services/utils.js';
    import { showNotification } from '@/utils/i18n.js';
    import { deleteBackupFromDb } from '../../../utils/db.js';
    import { handleBackupGroup, handleRestoreGroup, toggleColorPopup } from '../../services/groupsService.js';
    import { backedUpGroupData, expandedGroupStates } from '../../stores/appStore.svelte.js';
    import GroupActions from './GroupActions.svelte';

    /**
     * `liveTabs` are the tabs already restored from this backup: real tabs again.
     * `backupRows` is the card's list, already merged and ordered by the store.
     */
    let {
        group = {},
        tabs = [],
        liveTabs = [],
        backupRows = [],
        isPinned = false,
        renderContext = {},
        isBackup = false,
    } = $props();

    // Derived values from renderContext
    let seenTabIds = $derived(renderContext.seenTabIds || new Set());
    let duplicateUrlSet = $derived(renderContext.duplicateUrlSet || new Set());
    let screenshotData = $derived(renderContext.screenshotData || {});
    let notesData = $derived(renderContext.notesData || {});
    let customRules = $derived(renderContext.customRules || []);
    let pageModes = $derived(renderContext.pageModes || {});
    let groupInfoMap = $derived(renderContext.groupInfoMap || new Map());
    let groupPrefixState = $derived(renderContext.groupPrefixState || {});

    let hasActiveTab = $derived(tabs.some((t) => t.active));

    // Ensure the group containing the active tab is expanded so it is visible
    $effect(() => {
        if (hasActiveTab && group.id !== undefined) {
            const stored = $expandedGroupStates.get(group.id);
            if (stored === false) {
                expandedGroupStates.update((map) => {
                    const next = new Map(map);
                    next.set(group.id, true);
                    return next;
                });
            }
        }
    });

    // Derived from the shared map rather than mirrored into local state. The mirror
    // was written back by an effect that depended on the whole store, so toggling one
    // group re-evaluated every card and could snap a different one open or shut.
    let isExpanded = $derived.by(() => {
        if (hasActiveTab) return true;
        const stored = $expandedGroupStates.get(group.id);
        return stored !== undefined ? stored : $listGroupState.viewExpandStates.groups;
    });

    let isHidden = $derived(group.title && group.title.startsWith('_hidden_'));

    let info = $derived(groupInfoMap.get(group.id) || {});

    // Builds the visible group title, stripping zero-width marks and the stored prefix
    let displayTitle = $derived.by(() => {
        let baseDisplayName;
        if (info && Object.keys(info).length > 0) {
            if (info.type === 'manual' && info.key) {
                baseDisplayName = info.key.replace(/\u200B/g, '');
            } else if (info.title) {
                baseDisplayName = info.title.replace(/\u200B/g, '');
            } else {
                baseDisplayName = (info.key || group.title || '?').replace(/\u200B/g, '');
            }
        } else {
            baseDisplayName = (group.title || '?').replace(/\u200B/g, '');
        }
        const identifier = `${baseDisplayName.trim()}_${group.id}`;
        const prefixInfo = groupPrefixState instanceof Map ? groupPrefixState.get(identifier) : undefined;
        const storedPrefix = prefixInfo && prefixInfo.prefix ? prefixInfo.prefix.replace(/\u200B/g, '') : '';
        let name = baseDisplayName;
        if (storedPrefix && name.startsWith(storedPrefix)) {
            name = name.substring(storedPrefix.length).trim();
        }
        if (isHidden) name = name.substring(8);
        return name;
    });
    let tabCount = $derived(tabs.length);
    // A backup card counts how many of its tabs are back in the browser.
    let backupCount = $derived(`${liveTabs.length} / ${liveTabs.length + tabs.length}`);
    let seenCount = $derived(tabs.filter((t) => seenTabIds.has(t.id)).length);
    let isAllSeen = $derived(seenCount === tabCount && tabCount > 0);

    let isUngrouped = $derived(group.id === -100);

    let subGroupsMap = $derived(
        tabs.reduce((acc, tab) => {
            let domain = 'other';
            try {
                domain = new URL(tab.url).hostname.replace(/^www\./, '');
            } catch (e) {}
            if (!acc[domain]) acc[domain] = [];
            acc[domain].push(tab);
            return acc;
        }, {}),
    );

    let domains = $derived(Object.keys(subGroupsMap));
    let hasSubgroups = $derived(tabs.length > 1 && domains.length > 1);

    // Native Svelte Action for Drag and Drop
    function useDraggable(node) {
        let customDragImage = null;

        function handleDragStart(e) {
            e.dataTransfer.effectAllowed = 'move';

            // Set dragged data (to be read by drop zone if needed)
            e.dataTransfer.setData('text/plain', group.id);

            const header = node.querySelector('.group-header');
            if (header) {
                customDragImage = header.cloneNode(true);
                customDragImage.style.width = `${header.offsetWidth}px`;
                customDragImage.style.opacity = '0.85';
                customDragImage.style.position = 'absolute';
                customDragImage.style.top = '-9999px';
                customDragImage.style.left = '-9999px';
                customDragImage.style.backgroundColor = 'var(--bg-panel-color)';
                customDragImage.style.padding = '12px 14px';
                customDragImage.style.borderRadius = 'var(--border-radius)';
                customDragImage.style.border = '1px solid var(--border-color)';
                customDragImage.style.boxSizing = 'border-box';
                customDragImage.style.margin = '0';
                document.body.appendChild(customDragImage);

                const offsetX = e.clientX - header.getBoundingClientRect().left;
                e.dataTransfer.setDragImage(customDragImage, offsetX, 20);
            }

            setTimeout(() => {
                node.classList.add('dragging');
            }, 0);
        }

        function handleDragEnd(e) {
            node.classList.remove('dragging');
            if (customDragImage) {
                customDragImage.remove();
                customDragImage = null;
            }
        }

        function handleDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const rect = node.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            const deadZone = rect.height * 0.2;

            if (relativeY < rect.height / 2 - deadZone / 2) {
                node.classList.add('drag-over-top');
                node.classList.remove('drag-over-bottom');
            } else if (relativeY > rect.height / 2 + deadZone / 2) {
                node.classList.add('drag-over-bottom');
                node.classList.remove('drag-over-top');
            } else {
                node.classList.remove('drag-over-top', 'drag-over-bottom');
            }
        }

        function handleDragLeave(e) {
            node.classList.remove('drag-over-top', 'drag-over-bottom');
        }

        function handleDrop(e) {
            e.preventDefault();
            const isOverTop = node.classList.contains('drag-over-top');
            node.classList.remove('drag-over-top', 'drag-over-bottom');

            const draggedGroupId = e.dataTransfer.getData('text/plain');
            if (!draggedGroupId || draggedGroupId == group.id) return;

            import('../../stores/listGroupStore.js')
                .then((module) => {
                    module.listGroupStore.actions.reorderGroup(draggedGroupId, group.id, isOverTop);
                })
                .catch((err) => console.error(err));
        }

        node.addEventListener('dragstart', handleDragStart);
        node.addEventListener('dragend', handleDragEnd);
        node.addEventListener('dragover', handleDragOver);
        node.addEventListener('dragleave', handleDragLeave);
        node.addEventListener('drop', handleDrop);

        return {
            destroy() {
                node.removeEventListener('dragstart', handleDragStart);
                node.removeEventListener('dragend', handleDragEnd);
                node.removeEventListener('dragover', handleDragOver);
                node.removeEventListener('dragleave', handleDragLeave);
                node.removeEventListener('drop', handleDrop);
                if (customDragImage) customDragImage.remove();
            },
        };
    }

    function handleToggleOpen(e) {
        if (isBackup || isUngrouped) {
            e.preventDefault();
            return;
        }
        // Clicks on the actions, the colour dot or the rename field are not a request
        // to fold the group.
        if (e.target.closest('.group-actions, .color-indicator, .group-title-input')) {
            e.preventDefault();
        }
    }

    /**
     * Records the state the group ended up in.
     *
     * `<details>` flips `open` as its default action, so the click handler still saw
     * the previous value and stored the opposite of what the user just did.
     */
    function handleToggled(e) {
        const open = e.currentTarget.open;
        if (open === isExpanded) return;
        expandedGroupStates.update((states) => {
            states.set(group.id, open);
            return states;
        });
    }

    function togglePin(e) {
        e.stopPropagation();
        listGroupStore.actions.togglePinState(group.id);
    }

    async function deleteGroupAction(e) {
        e.stopPropagation();
        if (isBackup) {
            const backupData = $backedUpGroupData[group.id];
            if (backupData && backupData.linkedGroupId) {
                try {
                    const tabsToUngroup = await chrome.tabs.query({ groupId: backupData.linkedGroupId });
                    if (tabsToUngroup.length > 0) {
                        await chrome.tabs.ungroup(tabsToUngroup.map((t) => t.id));
                    }
                } catch (err) {}
            }
            const remaining = { ...$backedUpGroupData };
            delete remaining[group.id];
            backedUpGroupData.set(remaining);
            await deleteBackupFromDb(group.id);
        } else if (isUngrouped) {
            await listGroupStore.actions.deleteAllUngroupedTabs();
        } else {
            await listGroupStore.actions.deleteAllTabsInGroup(group.id, tabs);
        }
    }

    function handleBackup(e) {
        e.stopPropagation();
        handleBackupGroup(group.id);
    }

    function handleRestore(e) {
        e.stopPropagation();
        handleRestoreGroup(group.id, false);
    }

    function handleHide(e) {
        e.stopPropagation();
        listGroupStore.actions.hideGroup(group.id);
    }

    function copyUrls(e) {
        e.stopPropagation();
        const urls = tabs.map((t) => t.url).join('\n');
        navigator.clipboard.writeText(urls).then(() => {
            showNotification('urlsCopied', false, [tabs.length]);
        });
    }

    // Context handed to the injected buttons (notes, screenshots and overflow); it is
    // built from the group title's base name.
    let noteContext = $derived({ type: 'group', id: group.id, title: displayTitle });

    let groupEl = $state(null);

    async function colorIndicatorClick(e) {
        e.preventDefault();
        e.stopPropagation();
        if (isBackup) {
            handleRestoreGroup(group.id, false);
        } else {
            await toggleColorPopup(e.currentTarget, group.id);
        }
    }
</script>

<details
    bind:this={groupEl}
    use:useDraggable
    class="group-item"
    class:backed-up={isBackup}
    draggable="true"
    open={isExpanded}
    ontoggle={handleToggled}
    data-group-id={group.id}
>
    <summary class="group-header" onclick={handleToggleOpen}>
        <span
            class="color-indicator"
            class:hidden={isUngrouped}
            role="button"
            tabindex="0"
            title={isBackup ? $tt('restoreGroupTooltip') : null}
            style="background-color: {$listGroupState.themeColors[group.color] || 'grey'};"
            onclick={colorIndicatorClick}
        >
            {isBackup ? 'B' : ''}
        </span>
        <h3
            class="group-title"
            data-base-name={displayTitle}
            data-prefix=""
            style:cursor={isUngrouped ? 'default' : null}
        >
            {displayTitle}
        </h3>
        {#if isBackup}
            <span class="group-tab-count">{backupCount}</span>
        {:else}
            <span class="group-tab-count" class:all-seen={isAllSeen}>{seenCount}/{tabCount}</span>
        {/if}

        <GroupActions
            {group}
            {groupEl}
            {isBackup}
            {isUngrouped}
            {isPinned}
            {info}
            {noteContext}
            {notesData}
            {screenshotData}
            onbackup={handleBackup}
            onrestore={handleRestore}
            ontogglepin={togglePin}
            onhide={handleHide}
            oncopyurls={copyUrls}
            ondelete={deleteGroupAction}
        />
    </summary>

    <div class="tab-list-container">
        {#if isBackup}
            {#each backupRows as row (row.key)}
                <TabItem
                    tab={row.tab}
                    {renderContext}
                    groupContext={{ type: row.isBackup ? 'backup' : 'group', id: group.id }}
                    isBackup={row.isBackup}
                />
            {/each}
        {:else if hasSubgroups}
            {#each domains as domain (domain)}
                <Subgroup {domain} tabs={subGroupsMap[domain]} groupId={group.id} {renderContext} />
            {/each}
        {:else}
            {#each tabs as tab (tab.id)}
                <TabItem {tab} {renderContext} groupContext={{ type: 'group', id: group.id }} />
            {/each}
        {/if}
    </div>
</details>
