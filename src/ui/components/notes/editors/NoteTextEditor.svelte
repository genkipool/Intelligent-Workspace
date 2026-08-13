<script>
    import { t, tt } from '../../../stores/i18nStore.js';

    let { contentHTML = $bindable(''), showValidation = false, noteType = 'text' } = $props();

    let contentEditor = $state(null);

    // The rich editor owns its own DOM while the user types
    $effect(() => {
        const html = contentHTML;
        if (!contentEditor || contentEditor.innerHTML === html) return;
        const hadFocus = document.activeElement === contentEditor;
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

    function onContentInput(e) {
        contentHTML = e.currentTarget.innerHTML;
    }

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
                    return;
                }

                contentHTML += htmlInsert + '\u00A0';
            };

            reader.readAsDataURL(file);
        }
        e.target.value = '';
    }

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
</script>

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
