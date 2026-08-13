<script>
    import ApiKeyModal from './ApiKeyModal.svelte';
    import NoteModal from './NoteModal.svelte';
    import CookieEditorModal from './CookieEditorModal.svelte';
    import GeminiScheduleModal from './GeminiScheduleModal.svelte';
    import QrCodeModal from './QrCodeModal.svelte';
    import AddToRuleModal from './AddToRuleModal.svelte';
    import SaveConversationModal from './SaveConversationModal.svelte';
    import ViewConversationsModal from './ViewConversationsModal.svelte';
    import SpecialDeleteModal from './SpecialDeleteModal.svelte';
    import DeleteAllBookmarksConfirmModal from './DeleteAllBookmarksConfirmModal.svelte';
    import AddToBookmarkModal from './AddToBookmarkModal.svelte';
    import DeleteHistoryConfirmModal from './DeleteHistoryConfirmModal.svelte';

    import {
        showApiKeyModal,
        showNoteModal,
        showCookieEditorModal,
        showGeminiScheduleModal,
        showQrCodeModal,
        showAddToRuleModal,
        showSaveConversationModal,
        showViewConversationsModal,
        showSpecialDeleteModal,
        showDeleteAllBookmarksConfirmModal,
        showAddToBookmarkModal,
        showDeleteHistoryConfirmModal,
        modalData,
        openModal,
        closeModal,
    } from '../../stores/modalStore.js';

    import { handleSaveNote } from '../../services/notesService.js';
    import { saveCookieChanges } from '../../services/groupsService.js';
    import {
        saveAddToRule,
        deleteAllSpecialItems,
        deleteSpecialItem,
        resetSpecialScan,
    } from '../../services/bookmarksService.js';
    import { geminiStore } from '../../stores/geminiStore.js';
</script>

{#if $showApiKeyModal}
    <ApiKeyModal
        show={$showApiKeyModal}
        apiKeys={$modalData?.apiKeys || []}
        onClose={() => closeModal(showApiKeyModal)}
        onSave={async () => {
            await geminiStore.saveApiKey();
            closeModal(showApiKeyModal);
        }}
        onDelete={async (index) => {
            await geminiStore.deleteApiKey(index);
        }}
    />
{/if}

{#if $showNoteModal}
    <NoteModal
        show={$showNoteModal}
        note={$modalData?.note ?? null}
        onClose={() => closeModal(showNoteModal)}
        onSave={async (noteData) => {
            await handleSaveNote($modalData?.context, noteData.id);
            closeModal(showNoteModal);
        }}
    />
{/if}

{#if $showCookieEditorModal}
    <CookieEditorModal
        show={$showCookieEditorModal}
        cookies={$modalData?.cookies || []}
        onClose={() => closeModal(showCookieEditorModal)}
        onSave={async (cookies) => {
            await saveCookieChanges($modalData?.url, $modalData?.originalCookies, cookies);
            closeModal(showCookieEditorModal);
        }}
    />
{/if}

{#if $showGeminiScheduleModal}
    <GeminiScheduleModal
        show={$showGeminiScheduleModal}
        schedules={$modalData?.schedules || []}
        onClose={() => closeModal(showGeminiScheduleModal)}
        onSave={async (schedule) => {
            await geminiStore.saveSchedule(schedule);
            closeModal(showGeminiScheduleModal);
        }}
        onDelete={async (idx) => {
            await geminiStore.deleteSchedule(idx);
        }}
    />
{/if}

{#if $showQrCodeModal}
    <QrCodeModal
        show={$showQrCodeModal}
        url={$modalData?.url || ''}
        title={$modalData?.title || ''}
        onClose={() => closeModal(showQrCodeModal)}
    />
{/if}

{#if $showAddToRuleModal}
    <AddToRuleModal
        show={$showAddToRuleModal}
        url={$modalData?.url || ''}
        rules={$modalData?.rules || []}
        onClose={() => closeModal(showAddToRuleModal)}
        onSelect={async (ruleName) => {
            await saveAddToRule($modalData?.url, ruleName);
            closeModal(showAddToRuleModal);
        }}
    />
{/if}

{#if $showSaveConversationModal}
    <SaveConversationModal
        show={$showSaveConversationModal}
        onClose={() => closeModal(showSaveConversationModal)}
        onSave={async (title) => {
            await geminiStore.saveConversation(title);
            closeModal(showSaveConversationModal);
        }}
    />
{/if}

{#if $showViewConversationsModal}
    <ViewConversationsModal
        show={$showViewConversationsModal}
        conversations={$modalData?.conversations || []}
        onClose={() => closeModal(showViewConversationsModal)}
        onSelect={async (conv) => {
            const conversations = geminiStore.getCombinedConversations();
            const found =
                conversations.find((c) => c.timestamp === conv.timestamp && c.title === conv.title) ||
                conversations.find((c) => c.timestamp === conv.timestamp) ||
                conversations.find((c) => c.title === conv.title) ||
                conv;
            await geminiStore.loadConversation(found);
            closeModal(showViewConversationsModal);
        }}
        onDelete={async (conv) => {
            if (conv.isTemporary) await geminiStore.deleteSessionConversation(conv.timestamp);
            else await geminiStore.deletePersistentConversationByTitle(conv.title);
            openModal(showViewConversationsModal, { conversations: geminiStore.getCombinedConversations() });
        }}
    />
{/if}

{#if $showSpecialDeleteModal}
    <SpecialDeleteModal
        show={$showSpecialDeleteModal}
        titleKey={$modalData?.titleKey || 'oldBookmarks'}
        descriptionKey={$modalData?.descriptionKey || 'oldBookmarksDesc'}
        type={$modalData?.type || 'old'}
        items={$modalData?.items || []}
        isLoading={$modalData?.isLoading || false}
        emptyMessageKey={$modalData?.emptyMessageKey || 'noItemsFound'}
        scanProgress={$modalData?.scanProgress || { current: 0, total: 0 }}
        onClose={() => closeModal(showSpecialDeleteModal)}
        onDeleteAll={async (ids) => {
            await deleteAllSpecialItems(ids, $modalData?.type);
        }}
        onDeleteItem={async (item) => {
            await deleteSpecialItem(item);
        }}
        onReset={async () => {
            await resetSpecialScan();
        }}
    />
{/if}

{#if $showDeleteAllBookmarksConfirmModal}
    <DeleteAllBookmarksConfirmModal
        show={$showDeleteAllBookmarksConfirmModal}
        onClose={() => closeModal(showDeleteAllBookmarksConfirmModal)}
    />
{/if}

{#if $showAddToBookmarkModal}
    <AddToBookmarkModal
        show={$showAddToBookmarkModal}
        tab={$modalData?.tab || {}}
        mode={$modalData?.mode || 'add'}
        bookmarkData={$modalData?.bookmarkData || null}
        onClose={() => closeModal(showAddToBookmarkModal)}
        onSaved={() => closeModal(showAddToBookmarkModal)}
    />
{/if}

{#if $showDeleteHistoryConfirmModal}
    <DeleteHistoryConfirmModal
        show={$showDeleteHistoryConfirmModal}
        dateLabel={$modalData?.dateLabel || ''}
        urlsToDelete={$modalData?.urlsToDelete || []}
        onClose={() => closeModal(showDeleteHistoryConfirmModal)}
        onDeleted={$modalData?.onDeleted}
    />
{/if}
