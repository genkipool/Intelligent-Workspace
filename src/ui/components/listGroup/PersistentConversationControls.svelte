<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { geminiStore } from '../../stores/geminiStore.js';
    import { openModal, showViewConversationsModal } from '../../stores/modalStore.js';

    let { currentConversationTitle = '' } = $props();

    function handleCyclePrevious() {
        geminiStore.cycleConversation('previous');
    }

    function handleCycleNext() {
        geminiStore.cycleConversation('next');
    }

    function handleViewConversations() {
        const combined = geminiStore.getCombinedConversations();
        openModal(showViewConversationsModal, { conversations: combined });
    }
</script>

<section id="action-visibility-controls-panel" class="hidden"></section>
<section id="hidden-context-container" class="hidden-context-container hidden"></section>
<section id="persistent-conversation-controls" class="hidden-groups-container hidden">
    <button id="cycle-previous-conversation-btn" title={$tt('previousSavedConversation')} onclick={handleCyclePrevious}>
        <svg width="16" height="16" aria-hidden="true" focusable="false">
            <use href="#icon-prev"></use>
        </svg>
    </button>
    <button id="persistent-conversation-display" title={$tt('viewSavedConversations')} onclick={handleViewConversations}
        >{currentConversationTitle || $t('selectConversationPlaceholder')}</button
    >
    <button id="cycle-next-conversation-btn" title={$tt('nextSavedConversation')} onclick={handleCycleNext}>
        <svg width="16" height="16" aria-hidden="true" focusable="false">
            <use href="#icon-next"></use>
        </svg>
    </button>
</section>
