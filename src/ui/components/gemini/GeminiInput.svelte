<script>
    import { geminiStore, pendingAttachments } from '../../stores/geminiStore.js';
    import { t, tt } from '../../stores/i18nStore.js';
    let { visible = false, onsend } = $props();

    let textarea = $state(null);
    let textareaValue = $state('');
    let attachments = $derived($pendingAttachments);

    function autoResize() {
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }

    async function handleSend() {
        const query = textareaValue.trim();
        if (!query) return;

        onsend?.({ query });
        textareaValue = '';
        autoResize();
    }

    function handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    function handlePaste(e) {
        const files = e.clipboardData?.files;
        if (files?.length) {
            const validTypes = [
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/heic',
                'image/heif',
                'application/pdf',
                'text/plain',
                'text/csv',
            ];
            let hasValid = false;
            for (const f of files) {
                if (validTypes.includes(f.type)) {
                    hasValid = true;
                    break;
                }
            }
            if (hasValid) {
                e.preventDefault();
                geminiStore.addAttachments(files);
            }
        }
    }

    function handleDragOver(e) {
        e.preventDefault();
    }

    function handleDrop(e) {
        const files = e.dataTransfer?.files;
        if (files?.length) {
            const validTypes = [
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/heic',
                'image/heif',
                'application/pdf',
                'text/plain',
                'text/csv',
            ];
            let hasValid = false;
            for (const f of files) {
                if (validTypes.includes(f.type)) {
                    hasValid = true;
                    break;
                }
            }
            if (hasValid) {
                e.preventDefault();
                geminiStore.addAttachments(files);
            }
        }
    }

    function removeAttachment(index) {
        geminiStore.removeAttachment(index);
    }

    export function focus() {
        textarea?.focus();
    }

    /** The microphone button lives in the panel header and needs this textarea. */
    export function getTextarea() {
        return textarea;
    }
</script>

{#if visible}
    <div id="gemini-input-container" class="gemini-input-container">
        {#if attachments.length > 0}
            <div id="gemini-attachment-preview" class="gemini-attachment-preview">
                {#each attachments as fileObj, i (fileObj.id ?? i)}
                    <div class="gemini-attachment-chip">
                        {#if fileObj.mimeType.startsWith('image/')}
                            <img src={fileObj.data} class="preview-img" alt={fileObj.name} />
                        {:else if fileObj.mimeType === 'application/pdf'}
                            <span>📄</span>
                        {:else}
                            <span>📝</span>
                        {/if}
                        <span title={fileObj.name}>{fileObj.name}</span>
                        <button
                            type="button"
                            class="remove-attachment-btn"
                            data-index={i}
                            title="Remove"
                            onclick={() => removeAttachment(i)}
                        >
                            <svg viewBox="0 0 24 24" width="14" height="14">
                                <path
                                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
                                />
                            </svg>
                        </button>
                    </div>
                {/each}
            </div>
        {/if}
        <div class="gemini-input-wrapper">
            <textarea
                id="gemini-textarea"
                bind:this={textarea}
                bind:value={textareaValue}
                placeholder={$t('askGeminiPlaceholder')}
                rows="1"
                translate="no"
                oninput={autoResize}
                onkeydown={handleKeydown}
                onpaste={handlePaste}
                ondragover={handleDragOver}
                ondrop={handleDrop}
            ></textarea>
            <button id="gemini-send-btn" class="gemini-send" title={$tt('send')} onclick={handleSend} type="button">
                <svg width="24" height="24">
                    <use href="#icon-send"></use>
                </svg>
            </button>
        </div>
        <div id="gemini-error-message" class="gemini-error-message hidden"></div>
    </div>
{/if}
