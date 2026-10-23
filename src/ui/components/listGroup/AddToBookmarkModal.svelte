<script>
    import ModalShell from '../common/ModalShell.svelte';
    import { t } from '../../stores/i18nStore.js';
    // The group list paints notices with showNotification and never mounts
    // <Notification />, so notificationStore writes from here were never seen.
    import { showNotification } from '../../../utils/i18n.js';
    import { untrack } from 'svelte';
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
            // Read non-show props inside untrack to prevent this effect from
            // re-running when tab properties change in the background (e.g. page
            // title finishes loading), which would reset selectedFolderId to null.
            untrack(() => {
                title = mode === 'edit' && bookmarkData ? bookmarkData.title || '' : tab?.title || '';
                url = mode === 'edit' && bookmarkData ? bookmarkData.url || '' : tab?.url || '';
                selectedFolderId = mode === 'edit' && bookmarkData?.parentId ? bookmarkData.parentId : null;
                saving = false;
                loadBookmarks(true);
            });
        }
    });

    async function loadBookmarks(isInitial = false) {
        if (isInitial && folderTree.length === 0) {
            isLoading = true;
        }
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
                await loadBookmarks(false);
                selectedFolderId = response.folder.id;
                showNotification('folderCreated');
                return response.folder;
            }
            throw new Error(response.error);
        } catch (err) {
            console.error('Error creating folder:', err);
            showNotification('errorCreatingFolder', true);
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
                await loadBookmarks(false);
                showNotification('folderRenamed');
            } else {
                throw new Error(response.error);
            }
        } catch (err) {
            console.error('Error renaming folder:', err);
            showNotification('errorRenamingFolder', true);
        }
    }

    function folderExists(nodes, id) {
        if (!id || !nodes || !Array.isArray(nodes)) return false;
        for (const n of nodes) {
            if (n.id === id) return true;
            if (n.children && folderExists(n.children, id)) return true;
        }
        return false;
    }

    async function handleDeleteFolder(node) {
        if (!node) return;
        try {
            await chrome.runtime.sendMessage({ action: 'deleteBookmarkTree', payload: { id: node.id } });
            await loadBookmarks(false);
            if (selectedFolderId && (selectedFolderId === node.id || !folderExists(folderTree, selectedFolderId))) {
                selectedFolderId = null;
            }
            showNotification('folderDeleted');
        } catch (err) {
            console.error('Error deleting folder:', err);
            showNotification('errorDeletingFolder', true);
        }
    }

    async function handleSave() {
        if (saving) return false;
        const titleVal = title.trim();
        const urlVal = url.trim();
        if (!titleVal || !urlVal) {
            showNotification('bookmarkTitleUrlRequired', true);
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
                showNotification('bookmarkUpdated');
            } else {
                const response = await chrome.runtime.sendMessage({
                    action: 'createBookmark',
                    payload: { parentId: targetParentId, title: titleVal, url: urlVal },
                });
                if (!response?.success) throw new Error(response?.error || 'Error creating bookmark');
                await chrome.storage.local.set({ lastUsedBookmarkFolderId: targetParentId });
                showNotification('bookmarkSaved');
            }
            onSaved?.();
            onClose?.();
            return true;
        } catch (err) {
            console.error('Error saving bookmark:', err);
            showNotification('errorSavingBookmark', true);
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
    <ModalShell
        titleId="add-to-bookmark-modal-title"
        title={mode === 'edit' && bookmarkData ? $t('editBookmark') : $t('addToBookmarkFolder')}
        contentClass="add-to-bookmark-modal"
        onclose={handleClose}
    >
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
                onSelectFolder={(id) => (selectedFolderId = id)}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
            />
        </div>

        <div class="modal-actions">
            <button id="save-bookmark-btn" class="modal-btn-save" type="button" disabled={saving} onclick={handleSave}>
                {mode === 'edit' && bookmarkData ? $t('updateBookmark') : $t('saveBookmark')}
            </button>
        </div>
    </ModalShell>
{/if}
