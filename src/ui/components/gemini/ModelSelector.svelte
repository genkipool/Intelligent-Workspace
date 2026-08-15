<script>
    import { onMount } from 'svelte';
    import { geminiStore, selectedModel, availableModels } from '../../stores/geminiStore.js';
    import { t, tt } from '../../stores/i18nStore.js';

    let { onrefetchmodels, onmodelselected, onmodelcycled } = $props();

    let searchTerm = $state('');
    let dropdownVisible = $state(false);

    let filteredModels = $derived($availableModels.filter((m) => m.toLowerCase().includes(searchTerm.toLowerCase())));

    function toggleDropdown() {
        if ($availableModels.length <= 1) {
            onrefetchmodels?.();
        }
        dropdownVisible = !dropdownVisible;
        if (dropdownVisible) {
            searchTerm = '';
        }
    }

    function selectModel(model) {
        geminiStore.setSelectedModel(model);
        dropdownVisible = false;
        onmodelselected?.();
    }

    function cycle(direction) {
        geminiStore.cycleModel(direction);
        onmodelcycled?.();
    }

    // The dropdown is a sibling of the wrapper, not a child, so checking only the
    // wrapper treated clicks on the search box or on a model as clicks outside and shut
    // the popup before it could be used.
    function handleClickOutside(e) {
        if (!dropdownVisible) return;
        if (e.target.closest('.gemini-model-selector-wrapper, .gemini-model-dropdown')) return;
        dropdownVisible = false;
    }

    onMount(() => {
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    });
</script>

<div class="gemini-model-selector-wrapper" role="combobox" aria-expanded={dropdownVisible}>
    <button
        id="cycle-prev-model-btn"
        class="model-cycle-btn"
        title={$tt('geminiPreviousModel')}
        onclick={() => cycle('previous')}
        type="button"
    >
        <svg width="16" height="16" aria-hidden="true" focusable="false">
            <use href="#icon-prev"></use>
        </svg>
    </button>
    <button
        id="gemini-model-selector-btn"
        class="gemini-model-selector"
        type="button"
        title={$tt('geminiChangeModelTooltip')}
        onclick={toggleDropdown}
    >
        {$selectedModel}
    </button>
    <button
        id="cycle-next-model-btn"
        class="model-cycle-btn"
        title={$tt('geminiNextModel')}
        onclick={() => cycle('next')}
        type="button"
    >
        <svg width="16" height="16" aria-hidden="true" focusable="false">
            <use href="#icon-next"></use>
        </svg>
    </button>
</div>

{#if dropdownVisible}
    <div class="gemini-model-dropdown visible" role="listbox">
        <div class="dropdown-search-container">
            <span class="search-icon">
                <svg width="14" height="14">
                    <use href="#icon-search"></use>
                </svg>
            </span>
            <label for="gemini-model-search-input" class="visually-hidden">
                {$t('searchModelPlaceholder')}
            </label>
            <input
                type="search"
                id="gemini-model-search-input"
                placeholder={$t('searchModelPlaceholder')}
                autocomplete="off"
                bind:value={searchTerm}
            />
        </div>
        <ul>
            {#each filteredModels as model (model)}
                <li
                    class="gemini-model-item"
                    class:active={model === $selectedModel}
                    class:hidden={false}
                    role="option"
                    aria-selected={model === $selectedModel}
                >
                    <button type="button" data-model={model} onclick={() => selectModel(model)}>
                        {model}
                    </button>
                </li>
            {/each}
        </ul>
    </div>
{/if}
