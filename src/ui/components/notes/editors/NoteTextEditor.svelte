<script>
    import { t, tt } from '../../../stores/i18nStore.js';
    import { sanitizeNoteHtml } from '../../../../utils/noteHtml.js';

    let { contentHTML = $bindable(''), showValidation = false, noteType = 'text' } = $props();

    let contentEditor = $state(null);

    let stats = $derived.by(() => {
        if (!contentHTML) return { words: 0, chars: 0 };
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHTML;
        const text = (tempDiv.textContent || '').replace(/\u00A0/g, ' ').replace(/\r?\n$/, '');
        const chars = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
        return { words, chars };
    });

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

    /**
     * Inserts HTML where the caret is, keeping the browser's own undo stack.
     *
     * `execCommand` is deprecated and still the only call that edits a
     * `contenteditable` without throwing its history away; the Range below is what
     * answers when a browser has finally dropped it.
     */
    function insertHtmlAtCaret(html) {
        if (document.execCommand('insertHTML', false, html)) return;

        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const template = document.createElement('template');
        template.innerHTML = html;
        const fragment = template.content;
        const last = fragment.lastChild;
        range.insertNode(fragment);
        if (last) {
            range.setStartAfter(last);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    function handlePaste(e) {
        const clipboard = e.clipboardData;
        if (!clipboard) return;

        for (const item of clipboard.items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    contentHTML += `<img src="${dataUrl}" alt="${$t('pastedImageAltText')}" />\u00A0`;
                };
                reader.readAsDataURL(file);
                return;
            }
        }

        // Rich text arrives measured for the page it was copied from — table widths,
        // pixel sizes, floats — and pasted raw it lays itself out over the note card.
        // Only the formatting is kept; see sanitizeNoteHtml.
        const html = clipboard.getData('text/html');
        if (!html) return;

        e.preventDefault();
        const clean = sanitizeNoteHtml(html);
        if (clean) insertHtmlAtCaret(clean);
        else insertHtmlAtCaret(clipboard.getData('text/plain'));
        contentHTML = contentEditor?.innerHTML ?? contentHTML;
    }
</script>

<div class="note-editor active">
    <div class="form-group" style="padding: 0;">
        <div class="note-content-wrapper">
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
            <span class="note-editor-stats" title={$tt('noteStatsTooltipText', [stats.words, stats.chars])}>
                {$t('noteEditorStatsWordsChars', [stats.words, stats.chars])}
            </span>
        </div>
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
