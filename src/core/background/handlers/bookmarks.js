async function getDuplicateBookmarkUrls() {
    const bookmarkTree = await chrome.bookmarks.getTree();
    const urlMap = new Map();
    const duplicateUrls = new Set();

    function traverse(nodes) {
        for (const node of nodes) {
            if (node.url) {
                if (urlMap.has(node.url)) {
                    // If we've seen this URL already, it's a duplicate.
                    duplicateUrls.add(node.url);
                } else {
                    urlMap.set(node.url, true);
                }
            }
            if (node.children) {
                traverse(node.children);
            }
        }
    }

    traverse(bookmarkTree);
    return duplicateUrls;
}

async function getAllBookmarkUrls() {
    const urlSet = new Set();
    const bookmarkTree = await chrome.bookmarks.getTree();

    function traverse(nodes) {
        for (const node of nodes) {
            if (node.url) {
                urlSet.add(node.url);
            }
            if (node.children) {
                traverse(node.children);
            }
        }
    }

    traverse(bookmarkTree);
    return urlSet;
}

async function handleGetOldBookmarks(sendResponse) {
    try {
        const bookmarks = await getAllBookmarkNodes();
        // CORRECTION: 2 years in milliseconds (approx)
        const twoYearsAgo = Date.now() - 1000 * 60 * 60 * 24 * 365 * 2;
        const oldBookmarks = [];

        for (const bm of bookmarks) {
            // Try to get the last visit from history
            const visits = await chrome.history.getVisits({ url: bm.url });
            let lastVisitTime = 0;

            if (visits && visits.length > 0) {
                // Sort by time descending and take the first one
                lastVisitTime = visits.sort((a, b) => b.visitTime - a.visitTime)[0].visitTime;
            } else {
                // If not in history (Chrome deletes old history), use dateAdded
                lastVisitTime = bm.dateAdded || 0;
            }

            // If the last visit (or creation) is more than 2 years ago
            if (lastVisitTime > 0 && lastVisitTime < twoYearsAgo) {
                oldBookmarks.push({
                    id: bm.id,
                    title: bm.title,
                    url: bm.url,
                    dateLastUsed: lastVisitTime, // Send this to show it in the UI
                    dateAdded: bm.dateAdded,
                });
            }
        }

        sendResponse({ success: true, bookmarks: oldBookmarks });
    } catch (error) {
        console.error('Error fetching old bookmarks:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Helper to flatten the tree
async function getAllBookmarkNodes() {
    const tree = await chrome.bookmarks.getTree();
    const result = [];
    const traverse = (node) => {
        if (node.url) {
            result.push(node);
        }
        if (node.children) {
            node.children.forEach(traverse);
        }
    };
    traverse(tree[0]);
    return result;
}

async function deleteAllBookmarks() {
    try {
        // Root folder IDs: '1' (Bar), '2' (Other), '3' (Mobile)
        const rootFolderIds = ['1', '2', '3'];
        const deletionPromises = [];

        for (const rootId of rootFolderIds) {
            try {
                // 1. Get direct children of the root folder.
                const children = await chrome.bookmarks.getChildren(rootId);

                // 2. Create a deletion promise for EACH child, not for the root.
                for (const childNode of children) {
                    deletionPromises.push(chrome.bookmarks.removeTree(childNode.id));
                }
            } catch (error) {
                // This error is expected if a root folder (e.g., 'Mobile') does not exist.
                if (error.message && error.message.includes("Can't find bookmark for id")) {
                    logMessage(`Root folder with ID '${rootId}' not found, skipping.`);
                } else {
                    // If it's another type of error, rethrow so the main catch handles it.
                    throw error;
                }
            }
        }

        // 3. Wait for all deletion operations to finish.
        if (deletionPromises.length > 0) {
            await Promise.all(deletionPromises);
        }

        logMessage('All bookmarks and subfolders have been deleted, root folders remain.');
        return { success: true };
    } catch (error) {
        console.error('Catastrophic error during bookmark deletion:', error);
        return { success: false, error: error.message };
    }
}

function handleDeleteAllBookmarks(message, sendResponse) {
    deleteAllBookmarks().then((response) => {
        if (response.success) {
            bookmarkTreeCache = null;
            duplicateUrlSetCache = null;
            chrome.runtime.sendMessage({
                action: 'bookmarksChanged',
                notification: { key: 'allBookmarksDeletedSuccess' },
            });
        }
        sendResponse(response);
    });
    return true;
}

async function getDuplicateBookmarks(remove = false) {
    const bookmarkTree = await chrome.bookmarks.getTree();
    const urlMap = new Map();
    const duplicatesToRemove = [];

    // Recursive function to traverse bookmark tree
    function traverse(nodes) {
        for (const node of nodes) {
            if (node.url) {
                if (urlMap.has(node.url)) {
                    // If we've seen this URL already, the current node is a duplicate
                    duplicatesToRemove.push(node);
                } else {
                    // If it's the first time we see the URL, save it
                    urlMap.set(node.url, node);
                }
            }
            if (node.children) {
                traverse(node.children);
            }
        }
    }

    traverse(bookmarkTree);
    const removedIds = [];

    if (remove && duplicatesToRemove.length > 0) {
        // If 'remove' option is active, delete duplicates
        for (const bookmark of duplicatesToRemove) {
            try {
                await chrome.bookmarks.remove(bookmark.id);
                removedIds.push(bookmark.id); // Save the ID of the deleted bookmark
            } catch (error) {
                console.warn(`Failed to delete duplicate bookmark (it may no longer exist): ${bookmark.title}`, error);
            }
        }
    }

    // Return duplicate count and IDs
    return { count: duplicatesToRemove.length, removedIds: removedIds };
}

async function handleSearchBookmarks(message, sendResponse) {
    try {
        // Use .trim() to ensure space-only queries are treated as empty
        const query = message.query ? message.query.trim() : '';
        let bookmarksToShow = [];

        if (query) {
            // If there is a query, search all bookmarks as before.
            logMessage(`[Omnibar] Searching bookmarks with query: "${query}"`);
            bookmarksToShow = await chrome.bookmarks.search(query);
        } else {
            // If NO query, get 50 most recent.
            logMessage('[Omnibar] Empty query, getting 50 most recent bookmarks.');
            bookmarksToShow = await chrome.bookmarks.getRecent(50);
        }

        logMessage(`[Omnibar] Sending ${bookmarksToShow.length} bookmark result(s).`);
        sendResponse({ success: true, results: bookmarksToShow });
    } catch (error) {
        console.error('Error searching or getting recent bookmarks for omnibar:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function createBookmarksRecursivelyInBackground(nodes, parentId, existingUrlsSet, existingChildren = []) {
    // Helper function to find an existing folder by name (case-insensitive)
    const findFolder = (name) => {
        return existingChildren.find((child) => !child.url && child.title.toLowerCase() === name.toLowerCase());
    };

    for (const node of nodes) {
        if (node.url) {
            // It's a bookmark
            if (existingUrlsSet.has(node.url)) {
                continue; // Skip duplicate
            }
            const bookmarkDetails = { parentId, title: node.title, url: node.url };
            try {
                const newBookmark = await chrome.bookmarks.create(bookmarkDetails);
                existingUrlsSet.add(newBookmark.url); // Add to processed URLs list
            } catch (error) {
                console.warn(`Failed to create bookmark "${node.title}": `, error);
            }
        } else {
            // It's a folder
            const existingFolder = findFolder(node.title);
            let newParentId = parentId;
            let newChildren = [];

            if (existingFolder) {
                // Folder already exists, reuse it
                newParentId = existingFolder.id;
                newChildren = existingFolder.children || [];
            } else {
                // Folder is new, create it
                const folderDetails = { parentId, title: node.title };
                try {
                    const newFolder = await chrome.bookmarks.create(folderDetails);
                    newParentId = newFolder.id;
                    // No existing children in a newly created folder
                    newChildren = [];
                } catch (error) {
                    console.warn(`Failed to create folder "${node.title}": `, error);
                    continue; // If folder cannot be created, skip its children
                }
            }

            if (node.children && node.children.length > 0) {
                await createBookmarksRecursivelyInBackground(node.children, newParentId, existingUrlsSet, newChildren);
            }
        }
    }
}

function handleAddImportedBookmarks(message, sendResponse) {
    (async () => {
        try {
            const existingUrlsSet = await getAllBookmarkUrls();
            const { bookmarks, importType } = message.payload;

            if (importType === 'folder') {
                // If it's a loose folder, put it in "Other bookmarks" (id: '2')
                const [existingTree] = await chrome.bookmarks.getTree();
                const otherBookmarksNode = existingTree.children.find((n) => n.id === '2');
                await createBookmarksRecursivelyInBackground(
                    [bookmarks],
                    '2',
                    existingUrlsSet,
                    otherBookmarksNode?.children || [],
                );
            } else {
                // Original logic for full tree (Array)
                const [existingTree] = await chrome.bookmarks.getTree();
                const rootChildren = bookmarks[0]?.children;
                if (!rootChildren) throw new Error('Format error');

                const mappings = [
                    { id: '1', key: 'bookmarksBar' },
                    { id: '2', key: 'otherBookmarks' },
                    { id: '3', key: 'mobileBookmarks' },
                ];

                for (const map of mappings) {
                    const imported = rootChildren.find((node) => node.id === map.id && node.children);
                    const local = existingTree.children.find((n) => n.id === map.id);
                    if (imported) {
                        await createBookmarksRecursivelyInBackground(
                            imported.children,
                            map.id,
                            existingUrlsSet,
                            local?.children || [],
                        );
                    }
                }
            }

            chrome.runtime.sendMessage({ action: 'bookmarksChanged', notification: { key: 'bookmarksAdded' } });
            sendResponse({ success: true });
        } catch (error) {
            console.error(error);
            sendResponse({ success: false, errorKey: 'errorImportingBookmarks' });
        }
    })();
}

function handleOverwriteBookmarks(message, sendResponse) {
    (async () => {
        try {
            // 1. Delete all
            await deleteAllBookmarks();

            // 2. CRITICAL CACHE CLEANUP post-deletion
            bookmarkTreeCache = null;
            duplicateUrlSetCache = null;

            const { bookmarks, importType } = message.payload;
            const emptyUrlSet = new Set();

            // 3. Create new bookmarks
            if (importType === 'folder') {
                await createBookmarksRecursivelyInBackground([bookmarks], '2', emptyUrlSet, []);
            } else {
                const rootChildren = bookmarks[0]?.children;
                if (!rootChildren) throw new Error('Format error');

                const ids = ['1', '2', '3'];
                for (const id of ids) {
                    const imported = rootChildren.find((node) => node.id === id && node.children);
                    if (imported) {
                        await createBookmarksRecursivelyInBackground(imported.children, id, emptyUrlSet, []);
                    }
                }
            }

            // 4. SECOND CACHE CLEANUP to ensure handleGetBookmarks returns fresh data
            bookmarkTreeCache = null;
            duplicateUrlSetCache = null;

            // 5. Notify UI
            chrome.runtime.sendMessage({
                action: 'bookmarksChanged',
                notification: { key: 'bookmarksOverwritten' },
            });

            sendResponse({ success: true });
        } catch (error) {
            console.error('Error in overwriteBookmarks:', error);
            sendResponse({ success: false, errorKey: 'errorOverwritingBookmarks' });
        }
    })();
    return true; // Keeps channel open for sendResponse
}

function handleCreateBookmark(payload, sendResponse) {
    (async () => {
        const { parentId, title, url } = payload;

        try {
            if (!title) {
                throw new Error('Title is mandatory to create a bookmark or folder.');
            }
            const newBookmark = await chrome.bookmarks.create({
                parentId: parentId || undefined,
                title,
                url: url || undefined,
            });

            sendResponse({ success: true, bookmark: newBookmark });
        } catch (error) {
            console.error('Error creating bookmark:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
}

// background.js

function handleUpdateBookmark(payload, sendResponse) {
    (async () => {
        const { id, changes } = payload;
        try {
            if (!id || !changes) {
                throw new Error('ID or changes not provided.');
            }
            const updatedBookmark = await chrome.bookmarks.update(id, changes);
            // Important: chrome.bookmarks.onChanged listener in background.js
            // already handles cache cleanup automatically.
            sendResponse({ success: true, bookmark: updatedBookmark });
        } catch (error) {
            console.error('Error updating bookmark:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true; // Keep channel open for asynchronous response
}

function handleMoveBookmark(payload, sendResponse) {
    (async () => {
        const { id, destination } = payload;
        try {
            if (!id || !destination) {
                throw new Error('ID or destination not provided.');
            }
            const movedBookmark = await chrome.bookmarks.move(id, destination);
            sendResponse({ success: true, bookmark: movedBookmark });
        } catch (error) {
            console.error('Error moving bookmark:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
}

function handleDeleteBookmarkTree(payload, sendResponse) {
    (async () => {
        const { id } = payload;
        try {
            if (!id) {
                throw new Error('ID no proporcionado para eliminar el marcador.');
            }
            // removeTree deletes the folder and all its content
            await chrome.bookmarks.removeTree(id);
            sendResponse({ success: true });
        } catch (error) {
            console.error('Error deleting bookmark tree:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
}

/**
 * Gets recent bookmarks or searches through them.
 */
async function handleGetBookmarks(sendResponse) {
    try {
        // If cache exists, return it immediately (FAST PATH)
        if (bookmarkTreeCache && duplicateUrlSetCache) {
            sendResponse({
                success: true,
                bookmarks: bookmarkTreeCache,
                duplicateUrlSet: Array.from(duplicateUrlSetCache),
            });
            return;
        }

        // If no cache, generate it (SLOW PATH)
        const [bookmarkTree, duplicateUrlSet] = await Promise.all([
            chrome.bookmarks.getTree(),
            getDuplicateBookmarkUrls(), // You already have this function in background.js
        ]);

        // Save results in background script cache
        bookmarkTreeCache = bookmarkTree;
        duplicateUrlSetCache = duplicateUrlSet;

        sendResponse({
            success: true,
            bookmarks: bookmarkTreeCache,
            duplicateUrlSet: Array.from(duplicateUrlSetCache),
        });
    } catch (error) {
        console.error('Error getting bookmark tree in background:', error);
        sendResponse({ success: false, error: error.message });
    }
}
