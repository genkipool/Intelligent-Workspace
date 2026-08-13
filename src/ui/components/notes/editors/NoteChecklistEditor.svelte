<script>
    import { tick } from 'svelte';
    import { t } from '../../../stores/i18nStore.js';

    let { items = $bindable([]), showValidation = false } = $props();

    async function focusLastItemInput() {
        await tick();
        const inputs = document.querySelectorAll('#checklist-items-container .checklist-item-input');
        inputs[inputs.length - 1]?.focus();
    }

    function addItem() {
        items = [...items, { text: '', checked: false }];
        focusLastItemInput();
    }

    function removeItem(index) {
        items = items.filter((_, i) => i !== index);
    }
</script>

<div class="note-editor active">
    <div id="checklist-items-container">
        {#each items as item, i (i)}
            <div class="checklist-item">
                <input
                    type="text"
                    class="checklist-item-input"
                    class:input-error={showValidation && item.text.trim().length === 0}
                    placeholder={$t('checklistItemPlaceholder')}
                    bind:value={item.text}
                />
                <button type="button" class="delete-item-btn" onclick={() => removeItem(i)}>&times;</button>
            </div>
        {/each}
    </div>
</div>

<div class="note-editor-actions">
    <button
        type="button"
        id="add-checklist-item-btn"
        class="add-item-btn"
        class:error-state-text={showValidation && items.length === 0}
        onclick={addItem}>{$t('addChecklistItem')}</button
    >
</div>
