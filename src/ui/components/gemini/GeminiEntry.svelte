<script>
    import { onMount } from 'svelte';
    import { t, tt } from '../../stores/i18nStore.js';
    import { geminiStore } from '../../stores/geminiStore.js';
    import { isCtrlHeld } from '../../stores/modifierKeysStore.js';
    import { renderGeminiResponse } from '../../content-renderer/content-renderer.js';

    let {
        entry = null,
        onresend,
        ondelete,
        onedit,
        onsaveedit,
        ondownload,
        oncopy,
        onreadaloud,
        oniconclick,
    } = $props();

    let entryEl = $state();
    let isEditing = $state(false);
    let editText = $state('');

    let isSpeaking = $state(false);
    let isPaused = $state(false);
    let unsubscribe;

    $effect(() => {
        if (entry && entryEl) {
            renderGeminiResponse(entryEl, entry);
        }
    });

    onMount(() => {
        unsubscribe = geminiStore.subscribe(($store) => {
            isSpeaking = $store.isGlobalPlaybackActive && $store.currentlySpeakingEntryId === entry?.id;
            isPaused = isSpeaking && $store.isSpeechPaused;
        });
        return () => unsubscribe?.();
    });

    export function enterEditMode() {
        isEditing = true;
        editText = entry?.query || '';
    }

    export function exitEditMode() {
        isEditing = false;
    }

    function handleResend() {
        onresend?.({ entry });
    }

    function handleDelete() {
        ondelete?.({ entry });
    }

    function handleEdit() {
        enterEditMode();
        onedit?.({ entry });
    }

    function handleDownload() {
        ondownload?.({ entry });
    }

    function handleCopy(e) {
        oncopy?.({ entry, ctrlKey: e.ctrlKey || e.metaKey });
    }

    function handleReadAloud(e) {
        onreadaloud?.({ entry, ctrlKey: e.ctrlKey || e.metaKey });
    }

    function handleSaveEdit() {
        if (editText.trim() && editText !== entry.query) {
            onsaveedit?.({ entry, newQuery: editText.trim() });
        }
        isEditing = false;
    }

    function handleEditKeydown(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSaveEdit();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            isEditing = false;
        }
    }

    function handleIconClick(e) {
        e.preventDefault();
        e.stopPropagation();
        oniconclick?.({ entry });
    }
</script>

<details
    class="entry-card gemini-entry"
    data-entry-id={entry?.id}
    class:loading={entry?.isLoading}
    class:editing={isEditing}
    bind:this={entryEl}
    open
>
    <summary class="entry-header">
        <div class="entry-header-top">
            {#if entry?.isAgent}
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    class="entry-icon entry-icon-agent"
                    title={$tt('configureApiKeyTooltip')}
                    onclick={handleIconClick}
                >
                    <path
                        fill-rule="evenodd"
                        clip-rule="evenodd"
                        d="M8.48 4h4l.5.5v2.03h.52l.5.5V8l-.5.5h-.52v3l-.5.5H9.36l-2.5 2.76L6 14.4V12H3.5l-.5-.64V8.5h-.5L2 8v-.97l.5-.5H3V4.36L3.53 4h4V2.86A1 1 0 0 1 7 2a1 1 0 0 1 2 0 1 1 0 0 1-.52.83zM12 8V5H4v5.86l2.5.14H7v2.19l1.8-2.04.35-.15H12zm-2.12.51a2.7 2.7 0 0 1-1.37.74v-.01a2.71 2.71 0 0 1-2.42-.74l-.7.71c.34.34.745.608 1.19.79.45.188.932.286 1.42.29a3.7 3.7 0 0 0 2.58-1.07zM6.49 6.5h-1v1h1zm3 0h1v1h-1z"
                    />
                </svg>
            {:else}
                <span
                    class="entry-icon entry-icon-gemini"
                    title={$tt('configureApiKeyTooltip')}
                    onclick={handleIconClick}
                >
                    <svg width="24" height="24" aria-hidden="true">
                        <use href="#icon-gemini"></use>
                    </svg>
                </span>
            {/if}
            <div class="entry-actions">
                <div
                    class="resend-entry-btn action-btn"
                    title={$tt('resendQuery')}
                    onclick={(e) => {
                        e.stopPropagation();
                        handleResend();
                    }}
                >
                    <svg class="icon-resume" width="20" height="20">
                        <use href="#icon-resume"></use>
                    </svg>
                </div>
                <div
                    class="read-aloud-btn action-btn"
                    class:reading={isSpeaking}
                    class:paused={isPaused}
                    class:ctrl-held={isSpeaking && $isCtrlHeld}
                    title={$tt(isSpeaking ? 'stopReadingAloud' : 'readAloud')}
                    onclick={(e) => {
                        e.stopPropagation();
                        handleReadAloud(e);
                    }}
                >
                    <svg class="icon-play" width="20" height="20"><use href="#icon-play"></use></svg>
                    <svg class="icon-pause" width="20" height="20"><use href="#icon-pause"></use></svg>
                    <svg class="icon-resume" width="20" height="20"><use href="#icon-refresh"></use></svg>
                    <svg class="icon-stop" width="20" height="20"><use href="#icon-stop"></use></svg>
                </div>
                <div
                    class="edit-entry-btn action-btn"
                    title={$tt('editGeminiQuery')}
                    onclick={(e) => {
                        e.stopPropagation();
                        handleEdit();
                    }}
                >
                    <svg width="20" height="20"><use href="#icon-edit"></use></svg>
                </div>
                <div
                    class="download-entry-btn action-btn"
                    title={$tt('downloadGeminiEntry')}
                    onclick={(e) => {
                        e.stopPropagation();
                        handleDownload();
                    }}
                >
                    <svg width="20" height="20"><use href="#icon-download"></use></svg>
                </div>
                <div
                    class="copy-entry-btn action-btn"
                    title={$tt('copyGeminiResponse')}
                    onclick={(e) => {
                        e.stopPropagation();
                        handleCopy(e);
                    }}
                >
                    <svg width="20" height="20"><use href="#icon-copy"></use></svg>
                </div>
                <!-- While editing this doubles as the cancel control: deleting the whole
                     entry is not what backing out of an edit should do. -->
                <div
                    class="delete-entry-btn action-btn"
                    title={isEditing ? $tt('cancelEdit') : $tt('deleteGeminiQuery')}
                    onclick={(e) => {
                        e.stopPropagation();
                        if (isEditing) exitEditMode();
                        else handleDelete();
                    }}
                >
                    <svg width="20" height="20"><use href="#icon-close-stroke"></use></svg>
                </div>
            </div>
        </div>
        {#if isEditing}
            <div class="gemini-edit-container">
                <textarea
                    class="gemini-edit-textarea"
                    translate="no"
                    bind:value={editText}
                    onkeydown={handleEditKeydown}
                ></textarea>
                <div class="gemini-edit-actions">
                    <button class="gemini-edit-btn-save" onclick={handleSaveEdit}>{$t('send')}</button>
                </div>
            </div>
        {:else}
            <h2 data-original-text={entry?.query || ''} class="entry-title">{entry?.query || ''}</h2>
            {#if entry?.attachments?.length}
                <!-- The files that were sent with this question, shown where it was asked. -->
                <div class="entry-attachments">
                    {#each entry.attachments as file (file.name)}
                        <span class="entry-attachment-chip" title={file.name}>
                            <svg width="12" height="12" aria-hidden="true"><use href="#icon-upload"></use></svg>
                            <span class="entry-attachment-name">{file.name}</span>
                        </span>
                    {/each}
                </div>
            {/if}
        {/if}
    </summary>
    {#if entry?.isAgent && entry?.agentSteps?.length}
        <div class="agent-steps">
            <!-- The steps are only ever appended (agent-ui.js), never removed or
                 reordered, so a step's position is its identity. -->
            {#each entry.agentSteps as step, i (i)}
                <div
                    class="agent-step-indicator"
                    class:agent-step-done={step.status === 'done'}
                    class:agent-step-error={step.status === 'error'}
                >
                    <span class="agent-step-icon"
                        >{step.status === 'done' ? '✓' : step.status === 'error' ? '✗' : '⚙'}</span
                    >
                    <span>{step.text}</span>
                </div>
            {/each}
        </div>
    {/if}
    <div class="entry-content"></div>
    <div class="entry-footer"></div>
</details>

<style>
    .entry-attachments {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 6px 0 2px;
    }

    .entry-attachment-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        max-width: 100%;
        padding: 2px 8px;
        border: 1px solid var(--border-color);
        border-radius: 10px;
        background-color: var(--bg-color);
        color: var(--text-color);
        font-size: 0.75rem;
    }

    .entry-attachment-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 180px;
    }
</style>
