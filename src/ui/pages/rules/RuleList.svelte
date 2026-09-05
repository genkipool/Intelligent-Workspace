<script>
    import RuleCard from './RuleCard.svelte';
    import { foldForSearch } from '../../services/utils.js';
    import { t } from '../../stores/i18nStore.js';
    import {
        rulesStore,
        expandedStatesStore,
        sortStatesStore,
        searchQueryStore,
        sortAlphaStore,
    } from './rulesStore.js';
    import { showNotification } from '../../../utils/i18n.js';

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

    // Filtering and sorting only change what is shown; every callback still has to name
    // the rule by its position in the stored list, so each entry carries that index.
    let searchFiltered = $derived(
        $rulesStore
            .map((rule, storedIndex) => ({ rule, storedIndex }))
            .filter(({ rule }) => {
                if (!$searchQueryStore) return true;
                // Folded: rules get named by their user, so "Diseño" has to be findable
                // as "diseno". See `foldForSearch` in services/utils.js.
                const query = foldForSearch($searchQueryStore);
                const nameMatch = rule.name ? foldForSearch(rule.name).includes(query) : false;
                const urlMatch = rule.urls ? rule.urls.some((u) => foldForSearch(u).includes(query)) : false;
                return nameMatch || urlMatch;
            }),
    );

    let displayRules = $derived.by(() => {
        const hasStarred = $rulesStore.some((r) => r.isStarred);
        const visible =
            isSmallScreen && hasStarred ? searchFiltered.filter(({ rule }) => rule.isStarred) : searchFiltered;
        if (!$sortAlphaStore) return visible;
        return [...visible].sort((a, b) =>
            (a.rule.name || '').toLowerCase().localeCompare((b.rule.name || '').toLowerCase()),
        );
    });

    let hasSearch = $derived($searchQueryStore && $searchQueryStore.trim().length > 0);

    // The card travels through the list as it is dragged, exactly as in the original:
    // `previewOrder` is the arrangement being shown, and it only becomes the stored one
    // when the card is dropped.
    let draggingIndex = $state(-1);
    let previewOrder = $state(null);

    let orderedRules = $derived.by(() => {
        if (!previewOrder) return displayRules;
        const byStoredIndex = new Map(displayRules.map((entry) => [entry.storedIndex, entry]));
        const preview = previewOrder.map((i) => byStoredIndex.get(i)).filter(Boolean);
        // A rule appearing mid-drag (a card added elsewhere) falls back to the plain list.
        return preview.length === displayRules.length ? preview : displayRules;
    });

    // A 1×1 transparent gif in place of the browser's card-sized ghost.
    const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';

    function clearDrag() {
        draggingIndex = -1;
        previewOrder = null;
    }

    function onDragStart(e, storedIndex) {
        // Reordering an alphabetical view would write an order the view does not show.
        if ($sortAlphaStore) {
            e.preventDefault();
            showNotification('disableDragDrop', true);
            return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', storedIndex.toString());
        const ghost = new Image();
        ghost.src = TRANSPARENT_PIXEL;
        e.dataTransfer.setDragImage(ghost, 0, 0);
        // Applied on the next tick: a card restyled during dragstart cancels the drag.
        setTimeout(() => {
            draggingIndex = storedIndex;
            previewOrder = displayRules.map((entry) => entry.storedIndex);
        }, 0);
    }

    function onDragOver(e, storedIndex) {
        if ($sortAlphaStore || draggingIndex === -1 || !previewOrder) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (storedIndex === draggingIndex) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const isOverTop = e.clientY < rect.top + rect.height / 2;
        const next = previewOrder.filter((i) => i !== draggingIndex);
        const at = next.indexOf(storedIndex);
        if (at === -1) return;
        next.splice(isOverTop ? at : at + 1, 0, draggingIndex);
        if (next.join(',') !== previewOrder.join(',')) previewOrder = next;
    }

    function onDrop(e) {
        if ($sortAlphaStore || !previewOrder) return;
        e.preventDefault();
        const order = previewOrder;
        const movedIndex = draggingIndex;
        clearDrag();
        onreorderRule?.({ order, movedIndex });
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
        {#each orderedRules as { rule, storedIndex } (rule.name || storedIndex)}
            <RuleCard
                {rule}
                index={storedIndex}
                isDraggable={!$sortAlphaStore}
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
                isDragging={draggingIndex === storedIndex}
                ondragstart={(e) => onDragStart(e, storedIndex)}
                ondragover={(e) => onDragOver(e, storedIndex)}
                ondragend={clearDrag}
                ondrop={onDrop}
            />
        {/each}
    {/if}
</div>
