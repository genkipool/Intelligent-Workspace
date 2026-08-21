import { writable } from 'svelte/store';

export const showApiKeyModal = writable(false);
export const showNoteModal = writable(false);
export const showCookieEditorModal = writable(false);
export const showSaveConversationModal = writable(false);
export const showViewConversationsModal = writable(false);
export const showGeminiScheduleModal = writable(false);
export const showQrCodeModal = writable(false);
export const showAddToRuleModal = writable(false);
export const showSpecialDeleteModal = writable(false);
export const showDeleteAllBookmarksConfirmModal = writable(false);
export const showAddToBookmarkModal = writable(false);
export const showDeleteHistoryConfirmModal = writable(false);
export const showRadioStationsModal = writable(false);

export const modalData = writable(null);

export function openModal(store, data = null) {
    modalData.set(data);
    store.set(true);
}

export function closeModal(store) {
    modalData.set(null);
    store.set(false);
}
