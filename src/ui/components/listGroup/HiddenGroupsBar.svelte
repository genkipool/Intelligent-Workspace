<script>
    import { listGroupStore, listGroupState } from '../../stores/listGroupStore.js';
    import { groupsStore } from '../../stores/groupStore.js';
    import { renderContext } from '../../stores/renderContextStore.js';
    import { tt } from '../../stores/i18nStore.js';
    import { deleteAllTabsInGroup } from '../../services/groupsService.js';
    import DeleteBadge from '../common/DeleteBadge.svelte';

    let hiddenGroupIds = $derived($listGroupState.hiddenGroupIds ?? new Set());
    let hiddenGroups = $derived(($groupsStore ?? []).filter((g) => g?.group && hiddenGroupIds.has(g.group.id)));

    async function handleDeleteHiddenGroup(e, group, tabs) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        if (!group) return;
        try {
            if (tabs && tabs.length > 0) {
                await listGroupStore.actions.deleteAllTabsInGroup(group.id, tabs);
            }
            await deleteAllTabsInGroup(group.id);
            await listGroupStore.actions.unhideGroup(group.id);
        } catch (err) {
            console.error('Error deleting hidden group:', err);
        }
    }
</script>

<section
    id="hidden-groups-container"
    class="hidden-groups-container"
    class:hidden={hiddenGroups.length === 0 && !$listGroupState.hiddenYoutubeView}
>
    {#each hiddenGroups as g (g.group.id)}
        {@const groupInfo = $renderContext?.groupInfoMap?.get(g.group.id) || {}}
        {@const rawTitle = (
            groupInfo?.type === 'manual' && groupInfo?.key ? groupInfo.key : groupInfo?.title || g.group?.title || ''
        ).replace(/\u200B/g, '')}
        {@const cleanTitle = rawTitle.startsWith('_hidden_') ? rawTitle.substring(8) : rawTitle}
        {@const initial = (cleanTitle.trim().charAt(0) || 'G').toUpperCase()}
        <div class="hidden-group-wrapper">
            <button
                type="button"
                class="hidden-group-indicator"
                style="background-color: {$listGroupState.themeColors[g.group?.color] || 'grey'};"
                title={cleanTitle ? `${$tt('showGroup')}: ${cleanTitle}` : $tt('showGroup')}
                aria-label={cleanTitle ? `${$tt('showGroup')}: ${cleanTitle}` : $tt('showGroup')}
                onclick={() => listGroupStore.actions.unhideGroup(g.group.id)}
            >
                <span class="hidden-group-initial">{initial}</span>
            </button>
            <DeleteBadge
                title={$tt('deleteGroupTabs')}
                ariaLabel={$tt('deleteGroupTabs')}
                showOnParentHover={true}
                onclick={(e) => handleDeleteHiddenGroup(e, g.group, g.tabs)}
            />
        </div>
    {/each}
</section>
