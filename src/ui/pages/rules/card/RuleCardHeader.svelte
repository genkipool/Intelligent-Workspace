<script>
    import { t, tt } from '../../../stores/i18nStore.js';
    import { showUrlTooltip, hideUrlTooltip } from '../urlTooltip.js';

    let {
        rule,
        index,
        isExpanded = false,
        isStarred = false,
        isDraggable = true,
        isAlphaSort = false,
        isLargeScreen = true,
        groupColorHex = '',
        searchTerm = '',
        ondragstart,
        onchangeColor = () => {},
        onupdateRuleName = () => {},
        onOpenAllUrls = () => {},
        onCopyRuleUrls = () => {},
    } = $props();

    let isEditingName = $state(false);
    let editingNameValue = $state('');
    let ruleNameInputEl = $state(null);

    function startEditingName() {
        isEditingName = true;
        editingNameValue = rule.name;
        setTimeout(() => {
            if (ruleNameInputEl) ruleNameInputEl.focus();
        }, 0);
    }

    function handleNameEditBlur() {
        saveEditedName();
    }

    function handleNameEditKeydown(e) {
        if (e.key === 'Enter') {
            saveEditedName();
        } else if (e.key === 'Escape') {
            isEditingName = false;
            editingNameValue = rule.name;
        }
    }

    function saveEditedName() {
        if (!isEditingName) return;
        isEditingName = false;
        const newName = editingNameValue.trim();
        if (newName && newName !== rule.name) {
            onupdateRuleName?.({ index, newName });
        }
    }

    function splitOnTerm(text, term) {
        if (!term) return [{ text, match: false, key: '0' }];
        const lower = text.toLowerCase();
        const tLower = term.toLowerCase();
        const parts = [];
        let cursor = 0;
        let idx = lower.indexOf(tLower, cursor);
        let key = 0;
        while (idx !== -1) {
            if (idx > cursor) {
                parts.push({ text: text.slice(cursor, idx), match: false, key: String(key++) });
            }
            parts.push({ text: text.slice(idx, idx + term.length), match: true, key: String(key++) });
            cursor = idx + term.length;
            idx = lower.indexOf(tLower, cursor);
        }
        if (cursor < text.length) {
            parts.push({ text: text.slice(cursor), match: false, key: String(key++) });
        }
        return parts;
    }
</script>

<div class="rule-info" class:header-expanded={isExpanded} class:is-empty={!rule.urls || rule.urls.length === 0}>
    <button
        id="starButton"
        class="star-button"
        type="button"
        data-index={index}
        title={$tt(isStarred ? 'unstarRule' : 'starRule')}
        aria-label={$t(isStarred ? 'unstarRule' : 'starRule')}
        aria-pressed={isStarred}
    >
        <svg
            class="star-svg"
            class:starred={isStarred}
            width="25"
            height="25"
            viewBox="0 0 100 100"
            fill={isStarred ? 'var(--action-color)' : 'var(--bg-color)'}
            stroke={isStarred ? 'var(--action-color)' : 'var(--bg-color)'}
            aria-hidden="true"
            focusable="false"
        >
            <use href="#icon-star"></use>
        </svg>
    </button>
    <button
        class="drag-handle"
        draggable={isDraggable}
        tabindex="0"
        type="button"
        title={$tt('reorderRule')}
        aria-label={$t('dragRule')}
        {ondragstart}
    >
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            style="color: var(--action-color);"
            aria-hidden="true"
            focusable="false"
        >
            <use href="#icon-drag"></use>
        </svg>
    </button>
    <span
        class="color-indicator"
        id="colorIndicator"
        data-index={index}
        style="background-color: {groupColorHex}"
        tabindex="0"
        role="button"
        title={$tt('changeRuleColor')}
        aria-label={$t('changeColor')}
        onkeydown={(e) => e.key === 'Enter' && onchangeColor({ currentTarget: e.currentTarget })}
    ></span>

    {#if isEditingName}
        <input
            bind:this={ruleNameInputEl}
            class="rule-name-edit"
            type="text"
            bind:value={editingNameValue}
            onkeydown={handleNameEditKeydown}
            onblur={handleNameEditBlur}
            spellcheck="false"
            translate="no"
            autocomplete="off"
        />
    {:else}
        <h3
            id="ruleName"
            class="rule-name"
            tabindex="0"
            role="button"
            data-original-text={rule.name}
            data-urls={(rule.urls || []).join('\n')}
            title={$tt('ruleNameTooltip')}
            aria-label={$tt('ruleNameTooltip')}
            ondblclick={startEditingName}
            oncontextmenu={(e) => {
                e.preventDefault();
                onOpenAllUrls();
            }}
            onkeydown={(e) => e.key === 'Enter' && onCopyRuleUrls()}
            onmouseenter={(e) => showUrlTooltip(e.currentTarget, rule.urls)}
            onmouseleave={hideUrlTooltip}
            onfocus={(e) => showUrlTooltip(e.currentTarget, rule.urls)}
            onblur={hideUrlTooltip}
        >
            {#each splitOnTerm(rule.name, searchTerm) as part (part.key)}
                {#if part.match}
                    <span class="search-highlight">{part.text}</span>
                {:else}
                    {part.text}
                {/if}
            {/each}
        </h3>
    {/if}

    <button
        class="sort-domains-btn"
        type="button"
        aria-pressed={isAlphaSort}
        style="display: {isExpanded ? 'inline-block' : 'none'};"
        title={$tt(isAlphaSort ? 'viewOriginalOrder' : 'sortAlphabeticallyButton')}
    >
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
            <use href="#icon-sort"></use>
        </svg>
    </button>
    <button
        class="collapse-btn"
        type="button"
        tabindex="0"
        data-index={index}
        style="display: {isExpanded && isLargeScreen ? 'inline-block' : 'none'};"
        title={$tt('collapseSection')}
        aria-label={$t('collapseSection')}
    >
        <span class="svg-deploy">
            <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                style="color: var(--text-on-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-chevron-up"></use>
            </svg>
        </span>
    </button>
</div>
