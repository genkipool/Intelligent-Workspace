<script>
    import { tick } from 'svelte';
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

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

    // Saved selection range for text editor
    let savedRange = null;

    let titleInput = $state(null);
    let contentEditor = $state(null);

    // The rich editor owns its own DOM while the user types: re-rendering its HTML from
    // state on every keystroke would rebuild the nodes and collapse the caret to the
    // start. Content is therefore only pushed in when it changed from the outside
    // (opening a note, switching the type, inserting a pasted or uploaded file).
    $effect(() => {
        const html = contentHTML;
        if (!contentEditor || contentEditor.innerHTML === html) return;
        const hadFocus = document.activeElement === contentEditor;
        // The editor is deliberately uncontrolled: Svelte must not own the nodes the
        // browser edits under the caret, so the write is done by hand.
        // eslint-disable-next-line svelte/no-dom-manipulating
        contentEditor.innerHTML = html;
        if (hadFocus) placeCaretAtEnd(contentEditor);
    });

    function placeCaretAtEnd(el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    }

    // The title field takes focus when the modal opens.
    $effect(() => {
        if (show && titleInput) titleInput.focus();
    });

    const CATEGORIES = ['Work', 'Personal', 'Ideas', 'Research', 'Important', 'Leisure', 'School', 'ToDo'];

    const KANBAN_STATES = ['todo', 'inprogress', 'done'];
    const KANBAN_STATE_I18N = {
        todo: 'kanbanDefaultTodo',
        inprogress: 'kanbanDefaultInProgress',
        done: 'kanbanDefaultDone',
    };

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
                    contentHTML = note.content || '';
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
            savedRange = null;
        }
    });

    // --- Derived: editor validity ---
    let isValid = $derived.by(() => {
        const titleOk = title.trim().length > 0;
        if (!titleOk) return false;

        if (noteType === 'text') {
            // Must have text content or an <img> tag
            const hasText = contentHTML.replace(/<[^>]*>/g, '').trim().length > 0;
            const hasImg = /<img[^>]*>/i.test(contentHTML);
            return hasText || hasImg;
        } else if (noteType === 'checklist') {
            return checklistItems.length > 0 && checklistItems.every((item) => item.text.trim().length > 0);
        } else if (noteType === 'kanban') {
            return kanbanItems.length > 0 && kanbanItems.every((item) => item.text.trim().length > 0);
        }
        return false;
    });

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

    /** A row added by hand is a row about to be typed into, so it takes the caret. */
    async function focusLastItemInput(selector) {
        await tick();
        const inputs = document.querySelectorAll(selector);
        inputs[inputs.length - 1]?.focus();
    }

    function addChecklistItem() {
        checklistItems = [...checklistItems, { text: '', checked: false }];
        focusLastItemInput('#checklist-items-container .checklist-item-input');
    }

    function removeChecklistItem(index) {
        checklistItems = checklistItems.filter((_, i) => i !== index);
    }

    function addKanbanItem() {
        kanbanItems = [...kanbanItems, { text: '', state: 'todo' }];
        focusLastItemInput('#kanban-items-container .kanban-item-input');
    }

    function removeKanbanItem(index) {
        kanbanItems = kanbanItems.filter((_, i) => i !== index);
    }

    function cycleKanbanState(index) {
        const item = kanbanItems[index];
        const currentIdx = KANBAN_STATES.indexOf(item.state);
        const nextState = KANBAN_STATES[(currentIdx + 1) % KANBAN_STATES.length];
        kanbanItems = kanbanItems.map((it, i) => (i === index ? { ...it, state: nextState } : it));
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

    // --- File upload handler (text editor) ---
    function handleFileUpload(e) {
        const files = e.target.files;
        if (!files) return;

        for (const file of files) {
            if (!file) continue;
            const reader = new FileReader();

            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                let htmlInsert = '';

                if (file.type.startsWith('image/')) {
                    htmlInsert = `<img src="${dataUrl}" alt="${file.name}" />`;
                } else if (file.type.startsWith('audio/')) {
                    htmlInsert = `<audio controls src="${dataUrl}"></audio>`;
                } else if (file.type.startsWith('video/')) {
                    htmlInsert = `<video controls src="${dataUrl}"></video>`;
                } else if (file.type === 'application/pdf') {
                    htmlInsert = `<a href="${dataUrl}" target="_blank" rel="noopener noreferrer">${file.name}</a>`;
                } else {
                    return; // unsupported, skip
                }

                contentHTML += htmlInsert + '\u00A0';
            };

            reader.readAsDataURL(file);
        }
        e.target.value = '';
    }

    // --- Paste handler (text editor) ---
    function handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    contentHTML += `<img src="${dataUrl}" alt="{$t('pastedImageAltText')}" />\u00A0`;
                };
                reader.readAsDataURL(file);
                return;
            }
        }
    }

    // Restore saved range and insert at cursor position indirectly via contentHTML
    // For the contenteditable editor, we handle changes via input event
    function onContentInput(e) {
        contentHTML = e.currentTarget.innerHTML;
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
            <button class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button>
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
            <!-- TEXT editor -->
            {#if noteType === 'text'}
                <div class="note-editor active">
                    <div class="form-group" style="padding: 0;">
                        <div
                            id="note-content-editor"
                            class="note-content-editable"
                            class:input-error={showValidation &&
                                noteType === 'text' &&
                                contentHTML.replace(/<[^>]*>/g, '').trim().length === 0 &&
                                !/<img[^>]*>/i.test(contentHTML)}
                            contenteditable="true"
                            role="textbox"
                            aria-multiline="true"
                            translate="no"
                            style="white-space: pre-wrap;"
                            data-i18n-placeholder={$t('noteContentPlaceholder')}
                            bind:this={contentEditor}
                            oninput={onContentInput}
                            onpaste={handlePaste}
                        ></div>
                        <label for="note-file-input" class="note-file-upload-label" title={$tt('uploadFileTooltip')}>
                            <svg width="16" height="16">
                                <use href="#icon-upload"></use>
                            </svg>
                            <span>{$t('uploadFile')}</span>
                        </label>
                        <input
                            type="file"
                            id="note-file-input"
                            class="visually-hidden"
                            accept="image/*, audio/*, video/*, .pdf"
                            multiple
                            onchange={handleFileUpload}
                        />
                    </div>
                </div>
            {/if}

            <!-- CHECKLIST editor -->
            {#if noteType === 'checklist'}
                <div class="note-editor active">
                    <div id="checklist-items-container">
                        {#each checklistItems as item, i (i)}
                            <div class="checklist-item">
                                <input
                                    type="text"
                                    class="checklist-item-input"
                                    class:input-error={showValidation && item.text.trim().length === 0}
                                    placeholder={$t('checklistItemPlaceholder')}
                                    bind:value={item.text}
                                />
                                <button type="button" class="delete-item-btn" onclick={() => removeChecklistItem(i)}
                                    >&times;</button
                                >
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- KANBAN editor -->
            {#if noteType === 'kanban'}
                <div class="note-editor active">
                    <div id="kanban-items-container">
                        {#each kanbanItems as item, i (i)}
                            <div class="kanban-item">
                                <button
                                    type="button"
                                    class="kanban-item-state"
                                    data-state={item.state}
                                    onclick={() => cycleKanbanState(i)}>{$t(KANBAN_STATE_I18N[item.state])}</button
                                >
                                <input
                                    type="text"
                                    class="kanban-item-input"
                                    class:input-error={showValidation && item.text.trim().length === 0}
                                    placeholder={$t('addKanbanCardPlaceholder')}
                                    bind:value={item.text}
                                />
                                <button type="button" class="delete-item-btn" onclick={() => removeKanbanItem(i)}
                                    >&times;</button
                                >
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

        <!-- Add item buttons -->
        <div class="note-editor-actions">
            {#if noteType === 'checklist'}
                <button
                    type="button"
                    id="add-checklist-item-btn"
                    class="add-item-btn"
                    class:error-state-text={showValidation && checklistItems.length === 0}
                    onclick={addChecklistItem}>{$t('addChecklistItem')}</button
                >
            {:else if noteType === 'kanban'}
                <button
                    type="button"
                    id="add-kanban-item-btn"
                    class="add-item-btn"
                    class:error-state-text={showValidation && kanbanItems.length === 0}
                    onclick={addKanbanItem}>{$t('addCard')}</button
                >
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
