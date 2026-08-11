<script>
    import { onMount } from 'svelte';
    import { geminiStore, conversationHistory } from '../../stores/geminiStore.js';
    import { t } from '../../stores/i18nStore.js';
    import GeminiEntry from './GeminiEntry.svelte';
    import { showNotification } from '../../../utils/i18n.js';

    let { visible = false, onopenapikey } = $props();

    let entries = $derived($conversationHistory);

    let viewEl = $state();
    let showWelcome = $derived(entries.length === 0);

    $effect(() => {
        if (visible && viewEl) {
            viewEl.scrollTop = viewEl.scrollHeight;
        }
    });

    function handleResend(detail) {
        const { entry } = detail;
        geminiStore.resendEntry(entry.query, entry.id);
    }

    function handleDelete(detail) {
        const { entry } = detail;
        geminiStore.deleteEntry(entry.id);
    }

    function handleEdit(detail) {
        const { entry } = detail;
        const entryEl = viewEl?.querySelector(`.gemini-entry[data-entry-id="${entry.id}"]`);
        if (entryEl) {
            const cmp = entryEl.__svelte?.component;
            if (cmp?.enterEditMode) cmp.enterEditMode();
        }
    }

    function handleSaveEdit(detail) {
        const { entry, newQuery } = detail;
        geminiStore.submitEdit(entry.id, newQuery);
    }

    function handleCopy(detail) {
        const { entry, ctrlKey } = detail;
        const entryToCopy = entries.find((e) => e.id === entry.id);
        if (!entryToCopy || !entryToCopy.data) return;

        const answerMarkdown = entryToCopy.data.answer || '';
        const textRenderer = new window.marked.TextRenderer();

        if (ctrlKey) {
            const question = entryToCopy.query || '';
            const answerHtml = window.marked.parse(answerMarkdown);
            const answerPlainText = window.marked.parseInline(answerMarkdown, { renderer: textRenderer }).trim();
            const htmlContent = `<strong>${question}</strong><br><br>${answerHtml}`;
            const plainTextContent = `${question}\n\n${answerPlainText}`;
            copyRichText(htmlContent, plainTextContent);
            showNotification('geminiQACopied');
        } else {
            const answerHtml = window.marked.parse(answerMarkdown);
            const answerPlainText = window.marked.parseInline(answerMarkdown, { renderer: textRenderer }).trim();
            copyRichText(answerHtml, answerPlainText);
            showNotification('geminiAnswerCopied');
        }
    }

    async function copyRichText(html, plain) {
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([plain], { type: 'text/plain' }),
                }),
            ]);
        } catch {
            try {
                await navigator.clipboard.writeText(plain);
            } catch (err) {
                console.error('Copy failed:', err);
                showNotification('errorCopying', true);
            }
        }
    }

    function handleDownload(detail) {
        const { entry } = detail;
        if (!entry.isLoading && entry.data) {
            geminiStore.downloadEntry(entry);
        } else {
            showNotification('errorEntryNotReady', true);
        }
    }

    function handleReadAloud(detail) {
        const { entry, ctrlKey } = detail;
        geminiStore.handleGlobalReadAloud(entry, ctrlKey);
    }

    function handleIconClick(detail) {
        onopenapikey?.();
    }
</script>

<div id="gemini-conversation-view" bind:this={viewEl} style="display: {visible ? 'block' : 'none'}">
    {#if showWelcome}
        <div class="gemini-welcome-message">
            <h3>{$t('geminiWelcomeTitle')}</h3>
            <p>{$t('geminiWelcomeBody')}</p>
        </div>
    {:else}
        {#each entries as entry (entry.id)}
            <GeminiEntry
                {entry}
                onresend={handleResend}
                ondelete={handleDelete}
                onedit={handleEdit}
                onsaveedit={handleSaveEdit}
                oncopy={handleCopy}
                ondownload={handleDownload}
                onreadaloud={handleReadAloud}
                oniconclick={handleIconClick}
            />
        {/each}
    {/if}
</div>
