<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import NoteTextEditor from '../notes/editors/NoteTextEditor.svelte';
    import NoteChecklistEditor from '../notes/editors/NoteChecklistEditor.svelte';
    import NoteKanbanEditor from '../notes/editors/NoteKanbanEditor.svelte';
    import { sanitizeNoteHtml } from '../../../utils/noteHtml.js';

    /** @type {{ show: boolean, note: object|null, onClose: () => void, onSave: (data: object) => void }} */
    let { show, note = null, onClose, onSave } = $props();

    // --- Reactive state ---
    let title = $state('');
    let noteType = $state('text');
    let contentHTML = $state(''); // for text type
    let checklistItems = $state([]); // { text, checked }[]
    let kanbanItems = $state([]); // { text, state }[]
    let selectedCategory = $state('Work');
    let customCategory = $state('');
    let showCustomInput = $state(false);
    let hasAttemptedSave = $state(false);

    let titleInput = $state(null);

    // The title field takes focus when the modal opens.
    $effect(() => {
        if (show && titleInput) titleInput.focus();
    });

    const CATEGORIES = ['Work', 'Personal', 'Ideas', 'Research', 'Important', 'Leisure', 'School', 'ToDo'];

    // --- Reset / populate on note change ---
    $effect(() => {
        if (show) {
            if (note) {
                // Edit mode: populate from existing note
                title = note.title || '';
                noteType = note.type || 'text';
                selectedCategory = note.category || 'Work';
                customCategory = '';
                showCustomInput = ![
                    'Work',
                    'Personal',
                    'Ideas',
                    'Research',
                    'Important',
                    'Leisure',
                    'School',
                    'ToDo',
                ].includes(note.category);

                if (note.type === 'checklist' && Array.isArray(note.content)) {
                    checklistItems = note.content.map((item) => ({ text: item.text, checked: item.checked || false }));
                    kanbanItems = [];
                    contentHTML = '';
                } else if (note.type === 'kanban' && Array.isArray(note.content)) {
                    kanbanItems = note.content.map((item) => ({ text: item.text, state: item.state || 'todo' }));
                    checklistItems = [];
                    contentHTML = '';
                } else {
                    // Reopening an old note is the moment its markup gets cleaned for
                    // good: what the editor shows is what saving writes back.
                    contentHTML = sanitizeNoteHtml(note.content || '');
                    checklistItems = [];
                    kanbanItems = [];
                }
            } else {
                // Create mode: defaults
                title = '';
                noteType = 'text';
                contentHTML = '';
                checklistItems = [];
                kanbanItems = [];
                selectedCategory = 'Work';
                customCategory = '';
                showCustomInput = false;
            }
            hasAttemptedSave = false;
        }
    });

    // --- Validation ---
    let isContentValid = $derived.by(() => {
        if (noteType === 'text') {
            const textOnly = contentHTML.replace(/<[^>]*>/g, '').trim();
            const hasMedia = /<img|<audio|<video|<a/i.test(contentHTML);
            return textOnly.length > 0 || hasMedia;
        }
        if (noteType === 'checklist') {
            const valid = checklistItems.filter((i) => i.text.trim().length > 0);
            return valid.length > 0;
        }
        if (noteType === 'kanban') {
            const valid = kanbanItems.filter((i) => i.text.trim().length > 0);
            return valid.length > 0;
        }
        return false;
    });

    let isCategoryValid = $derived.by(() => {
        if (showCustomInput) {
            return customCategory.trim().length > 0;
        }
        return true;
    });

    let isValid = $derived(title.trim().length > 0 && isContentValid && isCategoryValid);

    let showValidation = $derived(hasAttemptedSave);

    // --- Handlers ---
    function handleClose() {
        onClose?.();
    }

    function selectCategory(cat) {
        selectedCategory = cat;
        if (cat === 'Custom') {
            showCustomInput = true;
            // focus custom input after render
            requestAnimationFrame(() => {
                const el = document.getElementById('note-custom-tag-input');
                el?.focus();
            });
        } else {
            showCustomInput = false;
            customCategory = '';
        }
    }

    function handleTypeChange(type) {
        if (type === noteType) return;
        // Convert content
        let lines = [];
        if (noteType === 'text') {
            // Extract plain text lines from HTML
            const temp = document.createElement('div');
            temp.innerHTML = contentHTML;
            temp.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
            temp.querySelectorAll('p, div').forEach((block) => block.appendChild(document.createTextNode('\n')));
            lines = (temp.textContent || '')
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
        } else if (noteType === 'checklist') {
            lines = checklistItems.map((item) => item.text);
        } else if (noteType === 'kanban') {
            lines = kanbanItems.map((item) => item.text);
        }

        noteType = type;

        if (type === 'text') {
            contentHTML = lines.join('<br>');
            checklistItems = [];
            kanbanItems = [];
        } else if (type === 'checklist') {
            if (lines.length === 0) {
                checklistItems = [{ text: '', checked: false }];
            } else {
                checklistItems = lines.map((text) => ({ text, checked: false }));
            }
            contentHTML = '';
            kanbanItems = [];
        } else if (type === 'kanban') {
            if (lines.length === 0) {
                kanbanItems = [{ text: '', state: 'todo' }];
            } else {
                kanbanItems = lines.map((text) => ({ text, state: 'todo' }));
            }
            contentHTML = '';
            checklistItems = [];
        }
    }

    function handleSave() {
        hasAttemptedSave = true;
        if (!isValid) return;

        let content;
        if (noteType === 'checklist') {
            content = checklistItems
                .filter((item) => item.text.trim().length > 0)
                .map((item) => ({ text: item.text, checked: item.checked }));
        } else if (noteType === 'kanban') {
            content = kanbanItems
                .filter((item) => item.text.trim().length > 0)
                .map((item) => ({ text: item.text, state: item.state }));
        } else {
            content = contentHTML;
        }

        const finalCategory = showCustomInput && customCategory.trim() ? customCategory.trim() : selectedCategory;

        onSave({
            id: note?.id || null,
            title: title.trim(),
            content,
            category: finalCategory,
            type: noteType,
        });
    }
</script>

<div
    class="modal-overlay"
    class:visible={show}
    role="dialog"
    aria-modal="true"
    aria-labelledby="note-modal-title"
    tabindex="-1"
    use:dismissOnBackdrop={handleClose}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
>
    <div class="modal-content note-modal" role="none" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
            <h2 id="note-modal-title">
                {$t(note ? 'editNote' : 'createNote')}
            </h2>
            <button type="button" class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button>
        </div>

        <!-- Title input -->
        <div class="form-group">
            <label for="note-title-input">{$t('noteTitle')}</label>
            <input
                type="text"
                id="note-title-input"
                placeholder={$t('noteTitlePlaceholder')}
                autocomplete="off"
                spellcheck="false"
                maxlength="100"
                bind:value={title}
                class:input-error={showValidation && title.trim().length === 0}
                bind:this={titleInput}
            />
        </div>

        <!-- Type selector label -->
        <div class="form-group" style="padding: 0 16px;">
            <div class="field-label">{$t('noteTypeLabel')}</div>
        </div>

        <!-- Type selector buttons -->
        <div class="note-type-selector">
            <button
                type="button"
                class="note-type-btn"
                class:active={noteType === 'text'}
                data-type="text"
                onclick={() => handleTypeChange('text')}>{$t('noteTypeText')}</button
            >
            <button
                type="button"
                class="note-type-btn"
                class:active={noteType === 'checklist'}
                data-type="checklist"
                onclick={() => handleTypeChange('checklist')}>{$t('noteTypeChecklist')}</button
            >
            <button
                type="button"
                class="note-type-btn"
                class:active={noteType === 'kanban'}
                data-type="kanban"
                onclick={() => handleTypeChange('kanban')}>{$t('noteTypeKanban')}</button
            >
        </div>

        <!-- Editor container -->
        <div class="note-editor-container">
            {#if noteType === 'text'}
                <NoteTextEditor bind:contentHTML {showValidation} {noteType} />
            {:else if noteType === 'checklist'}
                <NoteChecklistEditor bind:items={checklistItems} {showValidation} />
            {:else if noteType === 'kanban'}
                <NoteKanbanEditor bind:items={kanbanItems} {showValidation} />
            {/if}
        </div>

        <!-- Category selector -->
        <div class="form-group">
            <div class="field-label">{$t('noteCategory')}</div>
            <div class="note-categories">
                {#each CATEGORIES as cat (cat)}
                    <button
                        type="button"
                        class="category-btn"
                        class:active={selectedCategory === cat && !showCustomInput}
                        data-category={cat}
                        onclick={() => selectCategory(cat)}>{$t('noteCat' + cat)}</button
                    >
                {/each}
                <button
                    type="button"
                    class="category-btn custom"
                    class:active={showCustomInput}
                    data-category="Custom"
                    onclick={() => selectCategory('Custom')}>{$t('noteCatCustom')}</button
                >
            </div>
            <label for="note-custom-tag-input" class="visually-hidden">{$t('noteCustomTagPlaceholder')}</label>
            <input
                type="text"
                id="note-custom-tag-input"
                class:visible={showCustomInput}
                placeholder={$t('noteCustomTagPlaceholder')}
                autocomplete="off"
                spellcheck="false"
                maxlength="15"
                bind:value={customCategory}
            />
        </div>

        <!-- Action buttons -->
        <div class="modal-actions">
            <button
                type="button"
                class="modal-btn-save"
                class:error-state={showValidation && !isValid}
                onclick={handleSave}>{$t('save')}</button
            >
        </div>
    </div>
</div>
