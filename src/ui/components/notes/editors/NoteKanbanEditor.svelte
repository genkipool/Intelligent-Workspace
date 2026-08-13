<script>
    import { tick } from 'svelte';
    import { t } from '../../../stores/i18nStore.js';

    let { items = $bindable([]), showValidation = false } = $props();

    const KANBAN_STATES = ['todo', 'inprogress', 'done'];
    const KANBAN_STATE_I18N = {
        todo: 'kanbanDefaultTodo',
        inprogress: 'kanbanDefaultInProgress',
        done: 'kanbanDefaultDone',
    };

    async function focusLastItemInput() {
        await tick();
        const inputs = document.querySelectorAll('#kanban-items-container .kanban-item-input');
        inputs[inputs.length - 1]?.focus();
    }

    function addItem() {
        items = [...items, { text: '', state: 'todo' }];
        focusLastItemInput();
    }

    function removeItem(index) {
        items = items.filter((_, i) => i !== index);
    }

    function cycleState(index) {
        const item = items[index];
        const currentIdx = KANBAN_STATES.indexOf(item.state);
        const nextState = KANBAN_STATES[(currentIdx + 1) % KANBAN_STATES.length];
        items = items.map((it, i) => (i === index ? { ...it, state: nextState } : it));
    }
</script>

<div class="note-editor active">
    <div id="kanban-items-container">
        {#each items as item, i (i)}
            <div class="kanban-item">
                <button type="button" class="kanban-item-state" data-state={item.state} onclick={() => cycleState(i)}
                    >{$t(KANBAN_STATE_I18N[item.state])}</button
                >
                <input
                    type="text"
                    class="kanban-item-input"
                    class:input-error={showValidation && item.text.trim().length === 0}
                    placeholder={$t('addKanbanCardPlaceholder')}
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
        id="add-kanban-item-btn"
        class="add-item-btn"
        class:error-state-text={showValidation && items.length === 0}
        onclick={addItem}>{$t('addCard')}</button
    >
</div>
