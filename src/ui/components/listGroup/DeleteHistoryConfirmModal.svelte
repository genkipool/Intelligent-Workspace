<script>
    import { t } from '../../stores/i18nStore.js';
    import TypedConfirmModal from '../common/TypedConfirmModal.svelte';

    let { show = false, dateLabel = '', urlsToDelete = [], onClose, onDeleted } = $props();

    async function deleteHistory() {
        const response = await chrome.runtime.sendMessage({
            action: 'deleteHistoryUrls',
            urls: urlsToDelete,
        });
        if (response?.success) {
            onDeleted?.();
        }
    }
</script>

<TypedConfirmModal
    {show}
    {onClose}
    titleId="delete-history-title"
    title={$t('deleteHistoryForDate')}
    onConfirm={deleteHistory}
>
    {#snippet body()}
        <p>
            {$t('deleteHistoryConfirmDesc')} <strong>{dateLabel}</strong>?<br />
            <span class="modal-warning-text">{$t('actionCannotBeUndone')}</span>
        </p>
    {/snippet}
</TypedConfirmModal>
