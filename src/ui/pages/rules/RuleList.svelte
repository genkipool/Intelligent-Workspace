<script>
    import RuleCard from './RuleCard.svelte';
    import { t } from '../../stores/i18nStore.js';
    import { rulesStore, expandedStatesStore, sortStatesStore, searchQueryStore } from './rulesStore.js';

    let {
        storageMode = 'sync',
        onreorderRule,
        ontoggleStar,
        ondeleteRule,
        oneditRule,
        ontoggleActive,
        ontoggleExpand,
        ondeleteDomain,
        oneditDomain,
        onchangeColor,
        ontoggleSort,
        onupdateRuleName,
        onoverflowchange,
    } = $props();

    // On screens ≤600px, starred rules take over the list when there is at least one.
    let isSmallScreen = $state(window.matchMedia('(width <= 600px)').matches);
    $effect(() => {
        const mq = window.matchMedia('(width <= 600px)');
        const onChange = () => (isSmallScreen = mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    });

    let searchFiltered = $derived(
        $rulesStore.filter((rule) => {
            if (!$searchQueryStore) return true;
            const query = $searchQueryStore.toLowerCase();
            const nameMatch = rule.name ? rule.name.toLowerCase().includes(query) : false;
            const urlMatch = rule.urls ? rule.urls.some((u) => u.toLowerCase().includes(query)) : false;
            return nameMatch || urlMatch;
        }),
    );

    let displayRules = $derived.by(() => {
        const hasStarred = $rulesStore.some((r) => r.isStarred);
        return isSmallScreen && hasStarred ? searchFiltered.filter((r) => r.isStarred) : searchFiltered;
    });

    let hasSearch = $derived($searchQueryStore && $searchQueryStore.trim().length > 0);

    function onDragStart(e, index) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function onDrop(e, targetIndex) {
        e.preventDefault();
        const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (sourceIndex !== targetIndex) {
            onreorderRule?.({ sourceIndex, targetIndex });
        }
    }
</script>

<div id="rules-items-list">
    {#if displayRules.length === 0}
        <div class="no-rules-message">
            {#if hasSearch}
                <span>{$t('noRulesFoundForSearch')}</span>
            {:else if $rulesStore.length === 0}
                <span>{$t(`noRulesDefined_${storageMode}`)}</span>
            {:else}
                <span>{$t(`noStarredRules_${storageMode}`)}</span>
            {/if}
            <span class="no-rules-icon">
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href={storageMode === 'sync' ? '#icon-sync' : '#icon-local'}></use>
                </svg>
            </span>
        </div>
    {:else}
        {#each displayRules as rule, index (rule.name || index)}
            <RuleCard
                {rule}
                {index}
                isExpanded={$expandedStatesStore.get(rule.name)}
                isAlphaSort={$sortStatesStore.get(rule.name)}
                searchTerm={$searchQueryStore}
                {ontoggleStar}
                {ondeleteRule}
                {oneditRule}
                {ontoggleActive}
                {ontoggleExpand}
                {ondeleteDomain}
                {oneditDomain}
                {onchangeColor}
                {ontoggleSort}
                {onupdateRuleName}
                {onoverflowchange}
                ondragstart={(e) => onDragStart(e, index)}
                ondragover={(e) => onDragOver(e)}
                ondrop={(e) => onDrop(e, index)}
            />
        {/each}
    {/if}
</div>
