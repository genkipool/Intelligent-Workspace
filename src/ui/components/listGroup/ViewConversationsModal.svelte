<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    /**
     * @typedef {object} Conversation
     * @property {string} title
     * @property {Array} [entries] - persistent conversation entries
     * @property {Array<number>} [entryIds] - temporary conversation entry IDs
     * @property {number} timestamp
     * @property {boolean} isTemporary
     * @property {boolean} [isScheduled]
     * @property {boolean} [isRead]
     */

    /** @type {{ show: boolean, conversations: Conversation[], onClose: () => void, onSelect: (conv: Conversation) => void, onDelete: (conv: Conversation) => void }} */
    let { show = false, conversations = [], onClose, onSelect, onDelete } = $props();

    let searchTerm = $state('');
    let deleting = $state(null); // timestamp of conversation being deleted (for animation)

    let filteredConversations = $derived.by(() => {
        const term = searchTerm.toLowerCase().trim();
        if (!term) return conversations;
        return conversations.filter((c) => c.title.toLowerCase().includes(term));
    });

    let noResultsMessage = $derived(
        filteredConversations.length === 0
            ? conversations.length === 0
                ? $t('noSavedConversations')
                : $t('noConversationsFoundForSearch')
            : '',
    );

    let hasConversations = $derived(conversations.length > 0);

    function handleClose() {
        searchTerm = '';
        deleting = null;
        onClose?.();
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            handleClose();
        }
    }

    function handleSelect(conv) {
        onSelect?.(conv);
    }

    async function handleDelete(conv) {
        deleting = conv.isTemporary ? conv.timestamp : conv.title;

        try {
            await onDelete?.(conv);
        } finally {
            // Allow animation to complete before resetting
            setTimeout(() => {
                deleting = null;
            }, 300);
        }
    }

    function formatDate(timestamp) {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleString();
    }

    function getCreationTimestamp(conv) {
        if (conv.isTemporary) {
            return conv.entryIds?.[0] || conv.timestamp;
        }
        return conv.entries?.[0]?.id || conv.timestamp;
    }

    function hasMultipleEntries(conv) {
        if (conv.isTemporary) {
            return (conv.entryIds?.length || 0) > 1;
        }
        return (conv.entries?.length || 0) > 1;
    }

    function getLastTimestamp(conv) {
        if (conv.isTemporary) {
            const ids = conv.entryIds;
            return ids?.[ids.length - 1];
        }
        const entries = conv.entries;
        return entries?.[entries.length - 1]?.id || conv.timestamp;
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-conversations-title"
        tabindex="-1"
        use:dismissOnBackdrop={handleClose}
        onkeydown={handleKeydown}
    >
        <div class="modal-content view-conversations-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 id="view-conversations-title">{$t('savedConversationsTitle')}</h2>
                <button type="button" class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button
                >
            </div>

            <div class="modal-body">
                <div class="search-container">
                    <span class="search-icon">
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                    </span>
                    <label for="conversation-search-input" class="visually-hidden"
                        >{$t('searchConversationsPlaceholder')}</label
                    >
                    <input
                        type="search"
                        id="conversation-search-input"
                        placeholder={$t('searchConversationsPlaceholder')}
                        autocomplete="off"
                        bind:value={searchTerm}
                    />
                </div>

                <ul id="saved-conversations-list">
                    {#each filteredConversations as conv (conv.isTemporary ? conv.timestamp : conv.title)}
                        <li
                            class:fading-out={deleting === (conv.isTemporary ? conv.timestamp : conv.title)}
                            class:is-scheduled={conv.isScheduled}
                        >
                            <button type="button" class="conversation-select-btn" onclick={() => handleSelect(conv)}>
                                <div class="conversation-info">
                                    <span class="conversation-title" title={conv.title}>{conv.title}</span>
                                    <div class="conversation-date-row">
                                        <span class="conversation-date">{formatDate(getCreationTimestamp(conv))}</span>
                                        {#if !conv.isTemporary}
                                            <span class="conversation-status status-saved"
                                                >{$t('conversationStatusSaved')}</span
                                            >
                                        {:else}
                                            <span class="conversation-status status-unsaved"
                                                >{$t('conversationStatusUnsaved')}</span
                                            >
                                        {/if}
                                        {#if conv.isScheduled}
                                            <span class="conversation-status status-scheduled"
                                                >{$t('conversationStatusScheduled')}</span
                                            >
                                        {/if}
                                    </div>
                                    {#if hasMultipleEntries(conv)}
                                        <div class="conversation-edited-date-row">
                                            <span
                                                class="conversation-edited-date"
                                                title={$tt('conversationEditedDateTooltip')}
                                            >
                                                {formatDate(getLastTimestamp(conv))}
                                            </span>
                                        </div>
                                    {/if}
                                </div>
                            </button>
                            <button
                                type="button"
                                class="delete-conversation-btn"
                                title={$tt('deleteConversation')}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(conv);
                                }}>&times;</button
                            >
                        </li>
                    {/each}
                </ul>

                {#if !hasConversations || filteredConversations.length === 0}
                    <p class="no-conversations-msg">{$t(noResultsMessage)}</p>
                {/if}
            </div>
        </div>
    </div>
{/if}
