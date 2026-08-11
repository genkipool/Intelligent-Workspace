<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import TabItem from './TabItem.svelte';
    import { listGroupState } from '../../stores/listGroupStore.js';
    import { listGroupStore } from '../../stores/listGroupStore.js';
    import { updateExpandAllButtonState, updateScrollButtons } from '../../services/viewsService.js';
    import { renderNotesButton, renderScreenshotButton } from '../../services/groupsService.js';
    import { createOverflowMenu } from '../../services/contextMenuService.js';
    import { actionVisibilitySettings, expandedSubgroupStates } from '../../stores/appStore.svelte.js';
    import { showNotification } from '@/utils/i18n.js';

    let { domain = '', tabs = [], groupId, isNew = false, renderContext = {} } = $props();

    // Derived values from renderContext
    let seenTabIds = $derived(renderContext.seenTabIds || new Set());
    let duplicateUrlSet = $derived(renderContext.duplicateUrlSet || new Set());
    let screenshotData = $derived(renderContext.screenshotData || {});
    let notesData = $derived(renderContext.notesData || {});
    let customRules = $derived(renderContext.customRules || []);
    let pageModes = $derived(renderContext.pageModes || {});
    let groupInfoMap = $derived(renderContext.groupInfoMap || new Map());

    let totalSubgroupTabs = $derived(tabs.length);
    let seenSubgroupTabsCount = $derived(tabs.filter((t) => seenTabIds.has(t.id)).length);
    let isAllSeen = $derived(seenSubgroupTabsCount === totalSubgroupTabs && totalSubgroupTabs > 0);

    let subGroupKey = $derived(`${groupId}_${domain}`);

    // Store integration for open state
    // Same shared map the services use, so folding everything at once and folding one
    // by hand cannot disagree.
    let isOpen = $derived.by(() => {
        const stored = $expandedSubgroupStates.get(subGroupKey);
        return stored !== undefined ? stored : $listGroupState.viewExpandStates.groups;
    });

    function toggleOpen(e) {
        if (e.target.closest('.subgroup-actions')) return;
    }

    /**
     * Records the state the subgroup ended up in.
     *
     * `<details>` flips `open` as its default action, so a click handler still saw the
     * previous value and stored the opposite of what the user just did.
     */
    function handleToggled(e) {
        const open = e.currentTarget.open;
        if (open === isOpen) return;
        expandedSubgroupStates.update((states) => {
            states.set(subGroupKey, open);
            return states;
        });

        try {
            updateExpandAllButtonState();
        } catch (e) {}
        try {
            updateScrollButtons();
        } catch (e) {}
    }

    function copyUrls(e) {
        e.stopPropagation();
        const urls = tabs.map((t) => t.url).join('\n');
        navigator.clipboard.writeText(urls).then(() => {
            showNotification('urlsCopied', false, [tabs.length]);
        });
    }

    function deleteSubgroup(e) {
        e.stopPropagation();
        listGroupStore.actions.deleteAllTabsInSubgroup(tabs);
    }

    let subgroupEl = $state(null);
    let subgroupActionsEl = $state(null);
    let subgroupContext = $derived({ type: 'subgroup', id: domain, secondaryId: groupId });

    $effect(() => {
        if (!subgroupActionsEl) return;
        renderNotesButton(subgroupActionsEl, subgroupContext, notesData || {});
        renderScreenshotButton(subgroupActionsEl, subgroupContext, screenshotData || {});
    });

    $effect(() => {
        if (!subgroupActionsEl || !subgroupEl) return;
        $actionVisibilitySettings; // dependencia reactiva: reconstruye el overflow al cambiar
        createOverflowMenu(subgroupActionsEl, 'domain-subgroup-template', subgroupEl);
    });
</script>

<details bind:this={subgroupEl} class="domain-subgroup" data-domain={domain} open={isOpen} ontoggle={handleToggled}>
    <summary class="domain-header" onclick={toggleOpen}>
        <span class="domain-title">{domain}</span>
        <span class="tab-count" class:all-seen={isAllSeen}>{seenSubgroupTabsCount}/{totalSubgroupTabs}</span>

        <div class="subgroup-actions" draggable="false" bind:this={subgroupActionsEl}>
            <div class="create-rule-btn action-btn" role="button" tabindex="0" title={$tt('createRuleFromSubgroup')}>
                <svg width="14" height="14"><use href="#icon-create-rule"></use></svg>
            </div>
            <div class="add-to-rule-btn action-btn" role="button" tabindex="0" title={$tt('addSubgroupToExistingRule')}>
                <svg width="14" height="14"><use href="#icon-add-to-rule"></use></svg>
            </div>
            <div
                class="copy-subgroup-urls-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('copySubGroupAllUrls')}
                onclick={copyUrls}
            >
                <svg width="14" height="14"><use href="#icon-copy"></use></svg>
            </div>
            <div
                class="delete-subgroup-btn action-btn"
                role="button"
                tabindex="0"
                title={$tt('deleteSubgroupTabs')}
                onclick={deleteSubgroup}
            >
                <svg width="14" height="14"><use href="#icon-trash"></use></svg>
            </div>
        </div>
    </summary>
    <div class="subgroup-tab-list">
        {#each tabs as tab (tab.id)}
            <TabItem {tab} {renderContext} subgroupContext={{ type: 'subgroup', id: domain, secondaryId: groupId }} />
        {/each}
    </div>
</details>
