<script>
    import { t } from '../../stores/i18nStore.js';
    import TypedConfirmModal from '../common/TypedConfirmModal.svelte';

    let { show = false, onClose } = $props();

    async function deleteAll() {
        const response = await chrome.runtime.sendMessage({ action: 'deleteAllBookmarks' });
        if (!response?.success) {
            console.error('Error deleting bookmarks:', response);
        }
    }
</script>

<TypedConfirmModal
    {show}
    {onClose}
    titleId="delete-bookmarks-title"
    title={$t('deleteAllBookmarksConfirmTitle')}
    onConfirm={deleteAll}
>
    {#snippet body()}
        <p>{$t('deleteAllBookmarksConfirmDesc')}</p>
    {/snippet}
</TypedConfirmModal>
