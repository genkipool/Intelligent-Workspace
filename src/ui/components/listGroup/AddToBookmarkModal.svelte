<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import { notificationStore } from '../../stores/notificationStore.js';
    import BookmarkFolderTree from './BookmarkFolderTree.svelte';

    /**
     * @type {{
     *   show: boolean,
     *   tab: { title?: string, url?: string },
     *   mode: string,
     *   bookmarkData: ({ id: string, title: string, url: string, parentId: string })|null,
     *   onClose: () => void,
     *   onSaved: () => void
     * }}
     */
    let { show = false, tab = {}, mode = 'add', bookmarkData = null, onClose, onSaved } = $props();

    let title = $state('');
    let url = $state('');
    let folderTree = $state([]);
    let isLoading = $state(false);
    let selectedFolderId = $state(null);
    let saving = $state(false);

    $effect(() => {
        if (show) {
            title = mode === 'edit' && bookmarkData ? bookmarkData.title || '' : tab.title || '';
            url = mode === 'edit' && bookmarkData ? bookmarkData.url || '' : tab.url || '';
            selectedFolderId = mode === 'edit' && bookmarkData?.parentId ? bookmarkData.parentId : null;
            saving = false;
            loadBookmarks();
        }
    });

    async function loadBookmarks() {
        isLoading = true;
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
            if (response.success && response.bookmarks) {
                folderTree = response.bookmarks.flatMap((node) =>
                    node.id === '0' && node.children ? node.children : [node],
                );
            } else {
                folderTree = [];
            }
        } catch (err) {
            console.error('Error fetching bookmarks:', err);
            folderTree = [];
        } finally {
            isLoading = false;
        }
    }

    async function handleCreateFolder(parentId, folderName) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'createBookmarkFolder',
                payload: { parentId, title: folderName },
            });
            if (response.success && response.folder) {
                await loadBookmarks();
                selectedFolderId = response.folder.id;
                notificationStore.show($t('folderCreated'), 'success');
                return response.folder;
            }
            throw new Error(response.error);
        } catch (err) {
            console.error('Error creating folder:', err);
            notificationStore.show($t('errorCreatingFolder'), 'error');
            return null;
        }
    }

    async function handleRenameFolder(folderId, newTitle) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'updateBookmark',
                payload: { id: folderId, changes: { title: newTitle } },
            });
            if (response.success) {
                await loadBookmarks();
                notificationStore.show($t('folderRenamed'), 'success');
            } else {
                throw new Error(response.error);
            }
        } catch (err) {
            console.error('Error renaming folder:', err);
            notificationStore.show($t('errorRenamingFolder'), 'error');
        }
    }

    async function handleDeleteFolder(node) {
        if (!node) return;
        try {
            await chrome.runtime.sendMessage({ action: 'deleteBookmarkTree', payload: { id: node.id } });
            await loadBookmarks();
            if (selectedFolderId === node.id) selectedFolderId = null;
            notificationStore.show($t('folderDeleted'), 'success');
        } catch (err) {
            console.error('Error deleting folder:', err);
            notificationStore.show($t('errorDeletingFolder'), 'error');
        }
    }

    async function handleSave() {
        const titleVal = title.trim();
        const urlVal = url.trim();
        if (!titleVal || !urlVal) {
            notificationStore.show($t('bookmarkTitleUrlRequired'), 'error');
            return false;
        }
        saving = true;
        let targetParentId = selectedFolderId;
        if (!targetParentId) {
            targetParentId = mode === 'edit' && bookmarkData?.parentId ? bookmarkData.parentId : '1';
        }
        try {
            if (mode === 'edit' && bookmarkData) {
                const response = await chrome.runtime.sendMessage({
                    action: 'updateBookmark',
                    payload: { id: bookmarkData.id, changes: { title: titleVal, url: urlVal } },
                });
                if (!response?.success) throw new Error(response?.error || 'Error updating bookmark');
                if (targetParentId !== bookmarkData.parentId) {
                    const moveResponse = await chrome.runtime.sendMessage({
                        action: 'moveBookmark',
                        payload: { id: bookmarkData.id, destination: { parentId: targetParentId } },
                    });
                    if (!moveResponse?.success) throw new Error(moveResponse?.error || 'Error moving bookmark');
                }
                notificationStore.show($t('bookmarkUpdated'), 'success');
            } else {
                const response = await chrome.runtime.sendMessage({
                    action: 'createBookmark',
                    payload: { parentId: targetParentId, title: titleVal, url: urlVal },
                });
                if (!response?.success) throw new Error(response?.error || 'Error creating bookmark');
                await chrome.storage.local.set({ lastUsedBookmarkFolderId: targetParentId });
                notificationStore.show($t('bookmarkSaved'), 'success');
            }
            onSaved?.();
            onClose?.();
            return true;
        } catch (err) {
            console.error('Error saving bookmark:', err);
            notificationStore.show($t('errorSavingBookmark'), 'error');
            return false;
        } finally {
            saving = false;
        }
    }

    function handleClose() {
        onClose?.();
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-bookmark-modal-title"
        tabindex="-1"
        use:dismissOnBackdrop={handleClose}
        onkeydown={(e) => e.key === 'Escape' && handleClose()}
    >
        <div class="modal-content add-to-bookmark-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 id="add-to-bookmark-modal-title">
                    {mode === 'edit' && bookmarkData ? $t('editBookmark') : $t('addToBookmarkFolder')}
                </h2>
                <button class="close-modal-btn" type="button" title={$tt('close')} onclick={handleClose}>&times;</button
                >
            </div>

            <div class="modal-body">
                <div class="form-group">
                    <label for="bookmark-title-input">{$t('bookmarkTargetTitleLabel')}</label>
                    <input
                        id="bookmark-title-input"
                        type="text"
                        bind:value={title}
                        placeholder={$t('bookmarkTitlePlaceholder')}
                        autocomplete="off"
                        spellcheck="false"
                        translate="no"
                    />
                </div>
                <div class="form-group">
                    <label for="bookmark-url-input">{$t('bookmarkTargetUrlLabel')}</label>
                    <input
                        id="bookmark-url-input"
                        type="url"
                        bind:value={url}
                        placeholder="https://"
                        autocomplete="off"
                        spellcheck="false"
                        translate="no"
                    />
                </div>

                <BookmarkFolderTree
                    {folderTree}
                    {isLoading}
                    bind:selectedFolderId
                    {mode}
                    {bookmarkData}
                    onSelectFolder={(id) => (selectedFolderId = id)}
                    onCreateFolder={handleCreateFolder}
                    onRenameFolder={handleRenameFolder}
                    onDeleteFolder={handleDeleteFolder}
                />
            </div>

            <div class="modal-actions">
                <button
                    id="save-bookmark-btn"
                    class="modal-btn-save"
                    type="button"
                    disabled={saving}
                    onclick={handleSave}
                >
                    {mode === 'edit' && bookmarkData ? $t('updateBookmark') : $t('saveBookmark')}
                </button>
            </div>
        </div>
    </div>
{/if}
