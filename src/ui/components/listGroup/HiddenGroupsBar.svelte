<script>
    import { listGroupStore, listGroupState } from '../../stores/listGroupStore.js';
    import { groupsStore } from '../../stores/groupStore.js';
    import { renderContext } from '../../stores/renderContextStore.js';
    import { hiddenYoutubeView } from '../../stores/appStore.svelte.js';
    import { tt } from '../../stores/i18nStore.js';
    import { deleteAllTabsInGroup } from '../../services/groupsService.js';
    import { getThemeColors } from '../../services/constants.js';
    import { restoreYoutubeView, discardYoutubeView } from '../../services/viewsService.js';
    import DeleteBadge from '../common/DeleteBadge.svelte';

    let hiddenGroupIds = $derived($listGroupState.hiddenGroupIds ?? new Set());
    let hiddenGroups = $derived(($groupsStore ?? []).filter((g) => g?.group && hiddenGroupIds.has(g.group.id)));

    /*
     * The palette is copied into the store while the panel initialises, so it is still
     * empty for the first paints. Resolving it here as well is what keeps a circle that
     * appears before then from being painted with no colour at all — which is exactly
     * what happened to the YouTube one, parked from a view the user was already on.
     */
    let themeColors = $derived({ ...getThemeColors(), ...($listGroupState.themeColors ?? {}) });

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

<!--
    One circle of the bar. A hidden group and the parked YouTube player are the same
    control — a coloured disc with an initial and a delete badge — and differ only in
    what they restore, so the markup is written once.
-->
{#snippet indicator({ color, initial, label, onopen, deleteLabel, ondelete, extraClass = '' })}
    <div class="hidden-group-wrapper {extraClass}">
        <button
            type="button"
            class="hidden-group-indicator"
            style="background-color: {color};"
            title={label}
            aria-label={label}
            onclick={onopen}
        >
            <span class="hidden-group-initial">{initial}</span>
        </button>
        <DeleteBadge title={deleteLabel} ariaLabel={deleteLabel} showOnParentHover={true} onclick={ondelete} />
    </div>
{/snippet}

<section
    id="hidden-groups-container"
    class="hidden-groups-container"
    class:hidden={hiddenGroups.length === 0 && !$hiddenYoutubeView}
>
    {#each hiddenGroups as g (g.group.id)}
        {@const groupInfo = $renderContext?.groupInfoMap?.get(g.group.id) || {}}
        {@const rawTitle = (
            groupInfo?.type === 'manual' && groupInfo?.key ? groupInfo.key : groupInfo?.title || g.group?.title || ''
        ).replace(/\u200B/g, '')}
        {@const cleanTitle = rawTitle.startsWith('_hidden_') ? rawTitle.substring(8) : rawTitle}
        {@render indicator({
            color: themeColors[g.group?.color] ?? themeColors.grey,
            initial: (cleanTitle.trim().charAt(0) || 'G').toUpperCase(),
            label: cleanTitle ? `${$tt('showGroup')}: ${cleanTitle}` : $tt('showGroup'),
            onopen: () => listGroupStore.actions.unhideGroup(g.group.id),
            deleteLabel: $tt('deleteGroupTabs'),
            ondelete: (e) => handleDeleteHiddenGroup(e, g.group, g.tabs),
        })}
    {/each}

    {#if $hiddenYoutubeView}
        {@render indicator({
            color: themeColors.red,
            initial: 'Y',
            label: $tt('showYouTubePlayer'),
            onopen: restoreYoutubeView,
            deleteLabel: $tt('closeYouTubePlayer'),
            ondelete: discardYoutubeView,
            extraClass: 'youtube-indicator',
        })}
    {/if}
</section>
