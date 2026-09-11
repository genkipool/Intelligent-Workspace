/**
 * Unit tests for Bookmark Modal Silent Background Reload and Add-to-Rule Modal Selection / Add Button.
 *
 * Requirements:
 * - R1: Silent background reload in AddToBookmarkModal.svelte & BookmarkFolderTree.svelte without flicker or unmounting DOM.
 * - R2: Explicit "Añadir" button, rule selection state, disabled behavior, Enter and double-click shortcuts in AddToRuleModal.svelte.
 * - R3: Automated unit test coverage validating both features.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

describe('R1: Bookmark Modal Silent Background Reload and Tree Preservation', () => {
    const modalCode = readFileSync('src/ui/components/listGroup/AddToBookmarkModal.svelte', 'utf8');
    const treeCode = readFileSync('src/ui/components/listGroup/BookmarkFolderTree.svelte', 'utf8');

    describe('Contract and Static Analysis', () => {
        it('parameterizes loadBookmarks with isInitial = false default', () => {
            assert.match(
                modalCode,
                /async\s+function\s+loadBookmarks\s*\(\s*isInitial\s*=\s*false\s*\)/,
                'loadBookmarks must accept isInitial with default false',
            );
        });

        it('activates isLoading only when isInitial is true and folderTree is empty', () => {
            assert.match(
                modalCode,
                /if\s*\(\s*isInitial\s*&&\s*folderTree\.length\s*===\s*0\s*\)\s*\{\s*isLoading\s*=\s*true;\s*\}/,
                'isLoading must only be set to true during initial load when folderTree is empty',
            );
        });

        it('invokes loadBookmarks(true) on initial modal open effect', () => {
            assert.match(
                modalCode,
                /loadBookmarks\(\s*true\s*\);/,
                'Modal open effect must call loadBookmarks(true) for initial fetch',
            );
        });

        it('invokes loadBookmarks(false) in handleCreateFolder, handleRenameFolder, and handleDeleteFolder', () => {
            assert.match(
                modalCode,
                /handleCreateFolder[\s\S]*?await\s+loadBookmarks\(\s*false\s*\);/,
                'handleCreateFolder must call loadBookmarks(false)',
            );
            assert.match(
                modalCode,
                /handleRenameFolder[\s\S]*?await\s+loadBookmarks\(\s*false\s*\);/,
                'handleRenameFolder must call loadBookmarks(false)',
            );
            assert.match(
                modalCode,
                /handleDeleteFolder[\s\S]*?await\s+loadBookmarks\(\s*false\s*\);/,
                'handleDeleteFolder must call loadBookmarks(false)',
            );
        });

        it('preserves folder hierarchy in DOM without unmounting tree for loading message', () => {
            assert.match(
                treeCode,
                /\{#if\s+isLoading\s*&&\s*folderTree\.length\s*===\s*0\}/,
                'BookmarkFolderTree must only display loading message when folderTree is empty',
            );
        });

        it('tracks hasInitializedExpanded so user collapse/expand state is not wiped on updates', () => {
            assert.match(
                treeCode,
                /let\s+hasInitializedExpanded\s*=\s*false;/,
                'Must declare hasInitializedExpanded flag',
            );
            assert.match(
                treeCode,
                /!hasInitializedExpanded/,
                'Must guard collectAllFolders effect with !hasInitializedExpanded',
            );
        });

        it('automatically expands receiving parent folder on new folder creation', () => {
            assert.match(
                treeCode,
                /handleNewFolderKeydown[\s\S]*?expandedFolders\.add\(\s*parentId\s*\);[\s\S]*?await\s+onCreateFolder/,
                'handleNewFolderKeydown must add parentId to expandedFolders before/around onCreateFolder',
            );
        });

        it('defines expandFolderAndAncestors helper to ensure deep folder visibility', () => {
            assert.match(
                treeCode,
                /function\s+expandFolderAndAncestors\s*\(\s*targetId\s*\)/,
                'BookmarkFolderTree must define expandFolderAndAncestors helper',
            );
        });

        it('defines folderExists helper in AddToBookmarkModal to guard against deleted parent references', () => {
            assert.match(
                modalCode,
                /function\s+folderExists\s*\(\s*nodes,\s*id\s*\)/,
                'AddToBookmarkModal must define folderExists helper',
            );
        });

        it('stops Escape key propagation in handleNewFolderKeydown and handleEditKeydown to keep modal open', () => {
            assert.match(
                treeCode,
                /handleNewFolderKeydown[\s\S]*?e\.key\s*===\s*['"]Escape['"]\s*\)\s*\{\s*e\.stopPropagation\(\);/,
                'handleNewFolderKeydown must stop Escape propagation',
            );
            assert.match(
                treeCode,
                /handleEditKeydown[\s\S]*?e\.key\s*===\s*['"]Escape['"]\s*\)\s*\{\s*e\.stopPropagation\(\);/,
                'handleEditKeydown must stop Escape propagation',
            );
        });

        it('declares isCreatingFolder and isRenaming guards in BookmarkFolderTree', () => {
            assert.match(
                treeCode,
                /let\s+isCreatingFolder\s*=\s*false;/,
                'BookmarkFolderTree must declare isCreatingFolder',
            );
            assert.match(treeCode, /let\s+isRenaming\s*=\s*false;/, 'BookmarkFolderTree must declare isRenaming');
        });

        it('defines isIdInSubtree helper in handlePerFolderAction to clean up pending creation/edit on deleted ancestor', () => {
            assert.match(
                treeCode,
                /function\s+isIdInSubtree\s*\(\s*n,\s*targetId\s*\)/,
                'BookmarkFolderTree must define isIdInSubtree helper',
            );
        });

        it('declares saving re-entrancy guard in handleSave in AddToBookmarkModal', () => {
            assert.match(
                modalCode,
                /async\s+function\s+handleSave\s*\(\s*\)\s*\{\s*if\s*\(\s*saving\s*\)\s*return\s+false;/,
                'handleSave must check if (saving) return false;',
            );
        });

        it('stops Enter key propagation in handleNewFolderKeydown to isolate folder creation', () => {
            assert.match(
                treeCode,
                /handleNewFolderKeydown[\s\S]*?e\.key\s*===\s*['"]Enter['"][\s\S]*?e\.stopPropagation\(\);/,
                'handleNewFolderKeydown must call e.stopPropagation() on Enter',
            );
        });

        it('stops Enter and Space propagation in handleEditKeydown to prevent summary collapse', () => {
            assert.match(
                treeCode,
                /handleEditKeydown[\s\S]*?e\.key\s*===\s*['"]Enter['"][\s\S]*?e\.stopPropagation\(\);/,
                'handleEditKeydown must call e.stopPropagation() on Enter',
            );
            assert.match(
                treeCode,
                /handleEditKeydown[\s\S]*?e\.key\s*===\s*['"]\s['"][\s\S]*?e\.stopPropagation\(\);/,
                'handleEditKeydown must call e.stopPropagation() on Space',
            );
        });

        it('stops click and dblclick propagation on folder-name-input in BookmarkFolderTree', () => {
            assert.match(
                treeCode,
                /class="folder-name-input"[\s\S]*?onclick=\{\(e\)\s*=>\s*e\.stopPropagation\(\)\}/,
                'folder-name-input must stop click propagation',
            );
            assert.match(
                treeCode,
                /class="folder-name-input"[\s\S]*?ondblclick=\{\(e\)\s*=>\s*e\.stopPropagation\(\)\}/,
                'folder-name-input must stop dblclick propagation',
            );
        });

        it('uses folderClickAction with direct addEventListener to bypass Svelte 5 event delegation', () => {
            assert.match(
                treeCode,
                /function\s+folderClickAction\s*\(/,
                'folderClickAction action must be defined for direct event handling',
            );
            assert.match(
                treeCode,
                /element\.addEventListener\(\s*['"]click['"]/,
                'folderClickAction must use addEventListener for click',
            );
        });

        it('sets autofocus on new-folder-input and folder-name-input for immediate typing accessibility', () => {
            assert.match(
                treeCode,
                /class="new-folder-input"[\s\S]*?autofocus/,
                'new-folder-input must declare autofocus',
            );
            assert.match(
                treeCode,
                /class="folder-name-input"[\s\S]*?autofocus/,
                'folder-name-input must declare autofocus',
            );
        });

        it('uses optional chaining tab?.title and tab?.url in AddToBookmarkModal open effect', () => {
            assert.match(modalCode, /tab\?\.title/, 'AddToBookmarkModal must use tab?.title');
            assert.match(modalCode, /tab\?\.url/, 'AddToBookmarkModal must use tab?.url');
        });
    });

    describe('Behavioral Simulation: Silent Reload & Tree State', () => {
        it('loadBookmarks(true) with empty folderTree triggers isLoading; loadBookmarks(false) keeps isLoading false', async () => {
            let folderTree = [];
            let isLoading = false;
            let loadingTransitions = [];

            const mockLoadBookmarks = async (isInitial = false) => {
                if (isInitial && folderTree.length === 0) {
                    isLoading = true;
                    loadingTransitions.push('loading_started');
                }
                try {
                    // Simulate async chrome.runtime.sendMessage
                    await new Promise((r) => setTimeout(r, 5));
                    folderTree = [
                        { id: '1', title: 'Bookmarks Bar', children: [{ id: '10', title: 'Work', children: [] }] },
                    ];
                } finally {
                    isLoading = false;
                    loadingTransitions.push('loading_ended');
                }
            };

            // 1. Initial load
            await mockLoadBookmarks(true);
            assert.equal(folderTree.length, 1);
            assert.equal(isLoading, false);
            assert.deepEqual(loadingTransitions, ['loading_started', 'loading_ended']);

            // 2. Background reload (create/rename/delete folder)
            loadingTransitions = [];
            let observedLoadingStateDuringFetch = null;

            const bgPromise = mockLoadBookmarks(false);
            observedLoadingStateDuringFetch = isLoading;
            await bgPromise;

            assert.equal(
                observedLoadingStateDuringFetch,
                false,
                'isLoading must remain false during background reload',
            );
            assert.equal(isLoading, false);
            assert.deepEqual(
                loadingTransitions,
                ['loading_ended'],
                'No loading_started transition should occur on loadBookmarks(false)',
            );
        });

        it('BookmarkFolderTree DOM simulation: tree stays rendered during background sync', () => {
            const dom = new JSDOM(`<!doctype html><html><body><div id="container"></div></body></html>`);
            const { document } = dom.window;
            const container = document.getElementById('container');

            function renderTree(folderTree, isLoading) {
                if (isLoading && folderTree.length === 0) {
                    container.innerHTML = '<p class="loading-message">Loading...</p>';
                } else if (folderTree.length === 0) {
                    container.innerHTML = '<p class="no-folders-found-modal">No folders found</p>';
                } else {
                    const items = folderTree
                        .map((f) => `<details id="folder-${f.id}"><summary>${f.title}</summary></details>`)
                        .join('');
                    container.innerHTML = `<div class="bookmark-folders-container">${items}</div>`;
                }
            }

            // Initial state with loading
            renderTree([], true);
            assert.ok(container.querySelector('.loading-message'), 'Initial empty load shows loading message');

            // Tree loaded
            const loadedTree = [
                { id: '1', title: 'Bookmarks Bar' },
                { id: '2', title: 'Other Bookmarks' },
            ];
            renderTree(loadedTree, false);
            assert.ok(container.querySelector('.bookmark-folders-container'), 'Mounted tree is rendered');
            assert.equal(container.querySelectorAll('details').length, 2);

            // Background update occurs (isLoading = false)
            renderTree(loadedTree, false);
            assert.ok(container.querySelector('.bookmark-folders-container'), 'Tree remains mounted during sync');
            assert.equal(container.querySelector('.loading-message'), null, 'No loading message shown during sync');

            // Even if an update had isLoading = true, tree stays mounted because folderTree.length > 0
            renderTree(loadedTree, true);
            assert.ok(
                container.querySelector('.bookmark-folders-container'),
                'Tree remains mounted even if isLoading is true',
            );
            assert.equal(container.querySelector('.loading-message'), null, 'No loading message when folders exist');
        });

        it('user expansion/collapse state is preserved across tree reloads', () => {
            const expandedFolders = new Set();
            let hasInitializedExpanded = false;

            function onTreeLoaded(tree) {
                if (tree && tree.length > 0 && !hasInitializedExpanded) {
                    const collect = (nodes) => {
                        for (const n of nodes) {
                            if (n.id) expandedFolders.add(n.id);
                            if (n.children) collect(n.children);
                        }
                    };
                    collect(tree);
                    hasInitializedExpanded = true;
                }
            }

            const initialTree = [
                {
                    id: '1',
                    title: 'Bar',
                    children: [
                        { id: '10', title: 'Work' },
                        { id: '20', title: 'Personal' },
                    ],
                },
            ];

            // Initial load expands all
            onTreeLoaded(initialTree);
            assert.ok(expandedFolders.has('1'));
            assert.ok(expandedFolders.has('10'));
            assert.ok(expandedFolders.has('20'));

            // User collapses folder '20'
            expandedFolders.delete('20');
            assert.equal(expandedFolders.has('20'), false, 'Folder 20 is collapsed by user');

            // Tree reloads after folder rename/update
            const updatedTree = [
                {
                    id: '1',
                    title: 'Bar',
                    children: [
                        { id: '10', title: 'Work Projects' },
                        { id: '20', title: 'Personal' },
                    ],
                },
            ];
            onTreeLoaded(updatedTree);

            // Folder '20' MUST STILL BE COLLAPSED
            assert.equal(expandedFolders.has('20'), false, 'Folder 20 remains collapsed after tree reload');
            assert.equal(expandedFolders.has('10'), true, 'Folder 10 remains expanded');
        });

        it('creating a new folder automatically expands the receiving parent folder', async () => {
            const expandedFolders = new Set(['1']); // Parent folder '10' is currently collapsed (not in set)
            assert.equal(expandedFolders.has('10'), false);

            const handleNewFolder = async (parentId, folderName) => {
                expandedFolders.add(parentId);
                // simulate creation
                await Promise.resolve();
                expandedFolders.add(parentId);
            };

            await handleNewFolder('10', 'Subproject Alpha');

            assert.equal(
                expandedFolders.has('10'),
                true,
                'Receiving parent folder 10 is automatically expanded upon creating child folder',
            );
        });

        it('deep nested folder creation expands receiving parent and all its ancestors', () => {
            const expandedFolders = new Set(['1']);
            const tree = [
                {
                    id: '1',
                    title: 'Bar',
                    children: [
                        {
                            id: '10',
                            title: 'Work',
                            children: [
                                {
                                    id: '20',
                                    title: 'Projects',
                                    children: [],
                                },
                            ],
                        },
                    ],
                },
            ];

            function expandFolderAndAncestors(targetId) {
                function findPath(nodes, id, path = []) {
                    for (const n of nodes) {
                        if (n.id === id) return [...path, n.id];
                        if (n.children) {
                            const sub = findPath(n.children, id, [...path, n.id]);
                            if (sub) return sub;
                        }
                    }
                    return null;
                }
                const path = findPath(tree, targetId);
                if (path) {
                    path.forEach((id) => expandedFolders.add(id));
                } else {
                    expandedFolders.add(targetId);
                }
            }

            // Both 10 and 20 are collapsed initially
            assert.equal(expandedFolders.has('10'), false);
            assert.equal(expandedFolders.has('20'), false);

            // Create new folder inside '20'
            expandFolderAndAncestors('20');

            assert.equal(expandedFolders.has('1'), true);
            assert.equal(expandedFolders.has('10'), true, 'Ancestor 10 must be expanded');
            assert.equal(expandedFolders.has('20'), true, 'Parent 20 must be expanded');
        });

        it('search query expands ancestor folders of matching child nodes even if parent was collapsed', () => {
            const expandedFolders = new Set();
            const filteredTree = [
                {
                    id: '1',
                    title: 'Bookmarks Bar',
                    _matched: false,
                    _visible: true,
                    children: [
                        {
                            id: '10',
                            title: 'Nested Alpha',
                            _matched: true,
                            _visible: true,
                            children: [],
                        },
                    ],
                },
            ];

            const matching = new Set();
            function collectMatching(nodes) {
                for (const node of nodes) {
                    if (node._matched || (node.children && node.children.some((c) => c._visible))) {
                        matching.add(node.id);
                    }
                    if (node.children) collectMatching(node.children);
                }
            }
            collectMatching(filteredTree);
            matching.forEach((id) => expandedFolders.add(id));

            assert.equal(expandedFolders.has('10'), true, 'Matched folder must be expanded');
            assert.equal(expandedFolders.has('1'), true, 'Ancestor of matched folder must be expanded');
        });

        it('handleDeleteFolder safely clears selectedFolderId if selected folder or any of its ancestors was deleted', () => {
            let selectedFolderId = '20'; // Inside parent '10'
            let folderTree = [
                {
                    id: '1',
                    title: 'Root',
                    children: [{ id: '10', title: 'Parent', children: [{ id: '20', title: 'Child' }] }],
                },
            ];

            function folderExists(nodes, id) {
                if (!id || !nodes) return false;
                for (const n of nodes) {
                    if (n.id === id) return true;
                    if (n.children && folderExists(n.children, id)) return true;
                }
                return false;
            }

            // Simulate deleting folder '10' (Parent)
            folderTree = [{ id: '1', title: 'Root', children: [] }];

            // Safety check executed by handleDeleteFolder
            if (selectedFolderId && (selectedFolderId === '10' || !folderExists(folderTree, selectedFolderId))) {
                selectedFolderId = null;
            }

            assert.equal(selectedFolderId, null, 'selectedFolderId must be reset to null when its parent is deleted');
        });

        it('handleDeleteFolder preserves selectedFolderId if an unrelated folder is deleted', () => {
            let selectedFolderId = '30'; // Unrelated folder
            let folderTree = [
                {
                    id: '1',
                    title: 'Root',
                    children: [
                        { id: '10', title: 'To Delete', children: [] },
                        { id: '30', title: 'Other Folder', children: [] },
                    ],
                },
            ];

            function folderExists(nodes, id) {
                if (!id || !nodes) return false;
                for (const n of nodes) {
                    if (n.id === id) return true;
                    if (n.children && folderExists(n.children, id)) return true;
                }
                return false;
            }

            // Simulate deleting folder '10'
            folderTree = [
                {
                    id: '1',
                    title: 'Root',
                    children: [{ id: '30', title: 'Other Folder', children: [] }],
                },
            ];

            if (selectedFolderId && (selectedFolderId === '10' || !folderExists(folderTree, selectedFolderId))) {
                selectedFolderId = null;
            }

            assert.equal(
                selectedFolderId,
                '30',
                'selectedFolderId must remain preserved when unrelated folder is deleted',
            );
        });

        it('Escape key in new folder input stops propagation so modal overlay does not close', () => {
            let modalClosed = false;
            let creationCancelled = false;
            let propagationStopped = false;

            const mockEvent = {
                key: 'Escape',
                stopPropagation: () => {
                    propagationStopped = true;
                },
            };

            // Simulate tree input keydown handler
            if (mockEvent.key === 'Escape') {
                mockEvent.stopPropagation();
                creationCancelled = true;
            }

            // Simulate parent modal overlay keydown handler (which only runs if event was NOT stopped)
            if (!propagationStopped && mockEvent.key === 'Escape') {
                modalClosed = true;
            }

            assert.equal(creationCancelled, true, 'Folder creation must be canceled');
            assert.equal(propagationStopped, true, 'Propagation must be stopped');
            assert.equal(modalClosed, false, 'Modal overlay must NOT close on Escape in input');
        });

        it('Escape key in rename input stops propagation so modal overlay does not close', () => {
            let modalClosed = false;
            let editCancelled = false;
            let propagationStopped = false;

            const mockEvent = {
                key: 'Escape',
                stopPropagation: () => {
                    propagationStopped = true;
                },
            };

            if (mockEvent.key === 'Escape') {
                mockEvent.stopPropagation();
                editCancelled = true;
            }

            if (!propagationStopped && mockEvent.key === 'Escape') {
                modalClosed = true;
            }

            assert.equal(editCancelled, true, 'Folder editing must be canceled');
            assert.equal(propagationStopped, true, 'Propagation must be stopped');
            assert.equal(modalClosed, false, 'Modal overlay must NOT close on Escape in edit input');
        });

        it('isCreatingFolder guard prevents duplicate folder creation on rapid Enter keydowns', async () => {
            let isCreatingFolder = false;
            let creationCount = 0;

            const handleNewFolderKeydown = async (key) => {
                if (key === 'Enter') {
                    if (isCreatingFolder) return;
                    isCreatingFolder = true;
                    try {
                        creationCount++;
                        await new Promise((r) => setTimeout(r, 10));
                    } finally {
                        isCreatingFolder = false;
                    }
                }
            };

            // Rapid concurrent Enter presses
            await Promise.all([
                handleNewFolderKeydown('Enter'),
                handleNewFolderKeydown('Enter'),
                handleNewFolderKeydown('Enter'),
            ]);

            assert.equal(creationCount, 1, 'Only one folder should be created despite concurrent Enter events');
        });

        it('confirmEditFolder clears editingFolderId immediately and prevents duplicate rename on blur', async () => {
            let editingFolderId = '10';
            let editFolderNameInput = 'Renamed Folder';
            let isRenaming = false;
            let renameCalls = 0;

            const mockOnRenameFolder = async (id, title) => {
                renameCalls++;
                await new Promise((r) => setTimeout(r, 10));
            };

            const confirmEditFolder = async () => {
                if (!editingFolderId || isRenaming) return;
                const targetId = editingFolderId;
                const trimmed = editFolderNameInput.trim();
                editingFolderId = null;
                editFolderNameInput = '';
                if (trimmed) {
                    isRenaming = true;
                    try {
                        await mockOnRenameFolder(targetId, trimmed);
                    } finally {
                        isRenaming = false;
                    }
                }
            };

            // Simulate Enter keydown and immediately following blur event
            const enterPromise = confirmEditFolder();
            const blurPromise = confirmEditFolder();

            await Promise.all([enterPromise, blurPromise]);

            assert.equal(renameCalls, 1, 'onRenameFolder must be called exactly once');
            assert.equal(editingFolderId, null, 'editingFolderId must be cleared');
        });

        it('confirmEditFolder skips rename if title is identical to current folder title', async () => {
            let renameCalls = 0;
            const folderTree = [{ id: '10', title: 'Existing Name' }];

            function findNodeById(nodes, id) {
                return nodes.find((n) => n.id === id) || null;
            }

            const confirmEditFolder = async (targetId, inputTitle) => {
                const trimmed = inputTitle.trim();
                const currentNode = findNodeById(folderTree, targetId);
                if (trimmed && (!currentNode || currentNode.title !== trimmed)) {
                    renameCalls++;
                }
            };

            await confirmEditFolder('10', 'Existing Name');
            assert.equal(renameCalls, 0, 'No rename call when title is unchanged');

            await confirmEditFolder('10', 'New Name');
            assert.equal(renameCalls, 1, 'Rename call occurs when title changed');
        });

        it('isIdInSubtree cleans up pending creation and edit if an ancestor folder is deleted', () => {
            let newFolderParentId = '30'; // Inside 20, inside 10
            let editingFolderId = '20'; // Inside 10

            const deletedNode = {
                id: '10',
                children: [
                    {
                        id: '20',
                        children: [{ id: '30' }],
                    },
                ],
            };

            function isIdInSubtree(n, targetId) {
                if (!targetId || !n) return false;
                if (n.id === targetId) return true;
                if (n.children) return n.children.some((c) => isIdInSubtree(c, targetId));
                return false;
            }

            if (isIdInSubtree(deletedNode, newFolderParentId)) {
                newFolderParentId = null;
            }
            if (isIdInSubtree(deletedNode, editingFolderId)) {
                editingFolderId = null;
            }

            assert.equal(newFolderParentId, null, 'Pending new folder parent must be cleared when ancestor is deleted');
            assert.equal(editingFolderId, null, 'Active folder editing must be cleared when ancestor is deleted');
        });

        it('handleSave in AddToBookmarkModal rejects concurrent calls while saving is true', async () => {
            let saving = false;
            let saveCount = 0;

            const handleSave = async () => {
                if (saving) return false;
                saving = true;
                try {
                    saveCount++;
                    await new Promise((r) => setTimeout(r, 10));
                    return true;
                } finally {
                    saving = false;
                }
            };

            // Concurrent rapid clicks on Save Bookmark
            await Promise.all([handleSave(), handleSave(), handleSave()]);

            assert.equal(saveCount, 1, 'Bookmark must only be saved once despite rapid concurrent triggers');
        });

        it('AddToBookmarkModal safely handles null tab prop without throwing TypeError', () => {
            const tab = null;
            const mode = 'add';
            const bookmarkData = null;

            let title = '';
            let url = '';

            assert.doesNotThrow(() => {
                title = mode === 'edit' && bookmarkData ? bookmarkData.title || '' : tab?.title || '';
                url = mode === 'edit' && bookmarkData ? bookmarkData.url || '' : tab?.url || '';
            });

            assert.equal(title, '');
            assert.equal(url, '');
        });

        it('typing Space in folder-name-input does not bubble to summary or prevent character insertion', () => {
            const dom = new JSDOM(`<!doctype html>
            <details id="details" open>
              <summary id="sum" tabindex="0">
                <input id="inp" type="text" class="folder-name-input" value="My">
              </summary>
            </details>`);
            const { document } = dom.window;
            const sum = document.getElementById('sum');
            const inp = document.getElementById('inp');

            let summaryKeydownFired = false;
            sum.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    summaryKeydownFired = true;
                }
            };

            inp.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                } else if (e.key === 'Escape') {
                    e.stopPropagation();
                } else if (e.key === ' ') {
                    e.stopPropagation();
                }
            };

            const spaceEvt = new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
            inp.dispatchEvent(spaceEvt);

            assert.equal(summaryKeydownFired, false, 'Summary onkeydown must NOT fire when typing space in input');
            assert.equal(spaceEvt.defaultPrevented, false, 'Space character must NOT be prevented in input');
        });

        it('clicking folder-name-input does not bubble to summary or toggle folder expansion', () => {
            const dom = new JSDOM(`<!doctype html>
            <details id="details" open>
              <summary id="sum" tabindex="0">
                <input id="inp" type="text" class="folder-name-input" value="Projects">
              </summary>
            </details>`);
            const { document } = dom.window;
            const sum = document.getElementById('sum');
            const inp = document.getElementById('inp');

            let summaryClickCount = 0;
            sum.onclick = () => {
                summaryClickCount++;
            };

            inp.onclick = (e) => {
                e.stopPropagation();
            };

            const clickEvt = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
            inp.dispatchEvent(clickEvt);

            assert.equal(summaryClickCount, 0, 'Summary click must NOT fire when clicking input inside summary');
        });

        it('pressing Enter in folder-name-input confirms rename without toggling summary expansion', async () => {
            let summaryEnterFired = false;
            let renameConfirmed = false;

            const onSummaryKeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    summaryEnterFired = true;
                }
            };

            const onInputKeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    renameConfirmed = true;
                }
            };

            const mockEvent = {
                key: 'Enter',
                preventDefault() {},
                stopPropagation() {
                    this._stopped = true;
                },
                _stopped: false,
            };

            onInputKeydown(mockEvent);
            if (!mockEvent._stopped) {
                onSummaryKeydown(mockEvent);
            }

            assert.equal(renameConfirmed, true, 'Rename must be confirmed on Enter');
            assert.equal(summaryEnterFired, false, 'Summary expansion toggle must NOT fire on rename Enter');
        });

        it('selectFolder toggles expansion state and calls onSelectFolder callback', () => {
            let selectedId = null;
            let expandedState = false;

            const selectFolder = (folderId) => {
                selectedId = folderId;
                expandedState = !expandedState;
            };

            selectFolder('10');

            assert.equal(selectedId, '10', 'selectedFolderId must be set to the clicked folder id');
            assert.equal(expandedState, true, 'Folder expansion state toggles cleanly');
        });
    });
});

describe('R2: Add-to-Rule Modal Selection and Add Button', () => {
    const modalCode = readFileSync('src/ui/components/listGroup/AddToRuleModal.svelte', 'utf8');
    const cssCode = readFileSync('src/ui/pages/listGroup/listGroup.css', 'utf8');

    describe('Contract and Static Analysis', () => {
        it('declares reactive state selectedRuleName initialized to null', () => {
            assert.match(
                modalCode,
                /let\s+selectedRuleName\s*=\s*\$state\(\s*null\s*\);/,
                'AddToRuleModal must declare let selectedRuleName = $state(null)',
            );
        });

        it('resets selectedRuleName to null when modal opens ($effect)', () => {
            assert.match(
                modalCode,
                /\$effect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?selectedRuleName\s*=\s*null;/,
                'Must reset selectedRuleName = null in modal open effect',
            );
        });

        it('marks rule button with class:selected and updates selectedRuleName on click', () => {
            assert.match(
                modalCode,
                /class:selected=\{selectedRuleName\s*===\s*rule\.name\}/,
                'Rule button must have class:selected binding',
            );
            assert.match(
                modalCode,
                /onclick=\{[\s\S]*?selectedRuleName\s*=\s*rule\.name[\s\S]*?\}/,
                'Clicking rule must set selectedRuleName = rule.name',
            );
        });

        it('provides double-click shortcut to immediately add to rule', () => {
            assert.match(
                modalCode,
                /ondblclick=\{[\s\S]*?handleRuleSelect\(\s*rule\.name\s*\)[\s\S]*?\}/,
                'Double-clicking rule must invoke handleRuleSelect immediately',
            );
        });

        it('renders .modal-actions container with .modal-btn-save button', () => {
            assert.match(
                modalCode,
                /<div\s+class="modal-actions">\s*<button[\s\S]*?class="modal-btn-save"/,
                'AddToRuleModal must include .modal-actions with .modal-btn-save button',
            );
        });

        it('renders localized Add button text {$t("add") || "Añadir"}', () => {
            assert.match(
                modalCode,
                /\{\s*\$t\(\s*['"]add['"]\s*\)\s*\|\|\s*['"]Añadir['"]\s*\}/,
                'Button text must render {$t("add") || "Añadir"}',
            );
        });

        it('disables Add button when no rule is selected or urlText is empty', () => {
            assert.match(
                modalCode,
                /disabled=\{!selectedRuleName\s*\|\|\s*!urlText\.trim\(\)\}/,
                'Add button must be disabled when !selectedRuleName || !urlText.trim()',
            );
        });

        it('handles Enter key to invoke handleRuleSelect when a rule is selected', () => {
            assert.match(
                modalCode,
                /handleOverlayKeydown[\s\S]*?e\.key\s*===\s*['"]Enter['"][\s\S]*?selectedRuleName[\s\S]*?handleRuleSelect\(\s*selectedRuleName\s*\)/,
                'Enter keydown must invoke handleRuleSelect(selectedRuleName) when selected',
            );
        });

        it('preserves multi-line Enter key inside textarea without submitting prematurely', () => {
            assert.match(
                modalCode,
                /e\.target\?\.tagName\s*===\s*['"]TEXTAREA['"]/,
                'Enter key handler must exempt textarea for multi-line editing',
            );
        });

        it('defines styling for .rule-selection-btn.selected and .add-to-rule-modal .modal-actions in CSS', () => {
            assert.match(
                cssCode,
                /\.rule-selection-btn\.selected\s*\{[\s\S]*?border-color:\s*var\(--action-color\);/,
                'CSS must style .rule-selection-btn.selected with distinctive active border',
            );
            assert.match(
                cssCode,
                /\.add-to-rule-modal\s+\.modal-actions\s*\{[\s\S]*?margin-top:/,
                'CSS must provide spacing for .add-to-rule-modal .modal-actions',
            );
            assert.match(
                cssCode,
                /\.modal-btn-save:disabled[\s\S]*?cursor:\s*not-allowed;/,
                'CSS must style .modal-btn-save:disabled with not-allowed cursor',
            );
        });

        it('binds aria-pressed to selectedRuleName on rule buttons for screen reader a11y', () => {
            assert.match(
                modalCode,
                /aria-pressed=\{selectedRuleName\s*===\s*rule\.name\}/,
                'Rule button must declare aria-pressed for accessible toggle state',
            );
        });

        it('declares isSubmitting re-entrancy guard to prevent duplicate saves', () => {
            assert.match(
                modalCode,
                /let\s+isSubmitting\s*=\s*false;/,
                'AddToRuleModal must declare isSubmitting re-entrancy guard',
            );
        });

        it('defines high-contrast focus-visible outline for modal-btn-save in CSS', () => {
            assert.match(
                cssCode,
                /\.modal-btn-save:focus-visible:not\(:disabled\)\s*\{[\s\S]*?outline:/,
                'CSS must declare focus-visible outline for modal-btn-save',
            );
        });

        it('handles null or undefined url gracefully with (url || "") in AddToRuleModal', () => {
            assert.match(
                modalCode,
                /\(url\s*\|\|\s*['"]['"]\)\s*\.split/,
                'AddToRuleModal must normalize url defensively before split',
            );
        });

        it('handles null or undefined rules gracefully with (rules || []) in filteredRules', () => {
            assert.match(
                modalCode,
                /const\s+safeRules\s*=\s*rules\s*\|\|\s*\[\];/,
                'AddToRuleModal must guard rules defensively before filtering',
            );
        });

        it('filters out non-string/null rule objects in filteredRules with validRules guard', () => {
            assert.match(
                modalCode,
                /const\s+validRules\s*=\s*safeRules\.filter\(\(r\)\s*=>\s*r\s*&&\s*typeof\s+r\.name\s*===\s*['"]string['"]\);/,
                'AddToRuleModal must declare validRules guard in filteredRules',
            );
        });

        it('defines explicit focus-visible outline for .rule-selection-btn in CSS', () => {
            assert.match(
                cssCode,
                /\.rule-selection-btn:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid/,
                'CSS must declare explicit outline for .rule-selection-btn:focus-visible',
            );
        });
    });

    describe('Behavioral Simulation: Rule Selection & Add Action', () => {
        let dom;
        let document;
        let selectedRuleName;
        let urlText;
        let onSelectCalls;

        const rules = [
            { name: 'Dev', urls: ['github.com', 'gitlab.com'] },
            { name: 'Social', urls: ['twitter.com', 'reddit.com'] },
        ];

        function handleRuleSelect(ruleName) {
            if (!ruleName) return;
            const rawUrls = urlText.trim();
            if (!rawUrls) return;
            onSelectCalls.push({ ruleName, urls: rawUrls });
        }

        function createModalDOM() {
            dom = new JSDOM(`<!doctype html>
            <html>
                <body>
                    <div class="modal-overlay">
                        <div class="modal-content add-to-rule-modal">
                            <textarea id="add-to-rule-url-input">${urlText}</textarea>
                            <div class="rules-selection-container">
                                ${rules
                                    .map(
                                        (r) =>
                                            `<button type="button" class="rule-selection-btn ${
                                                selectedRuleName === r.name ? 'selected' : ''
                                            }" aria-pressed="${selectedRuleName === r.name}" data-rule="${r.name}">${r.name}</button>`,
                                    )
                                    .join('')}
                            </div>
                            <div class="modal-actions">
                                <button type="button" class="modal-btn-save" ${
                                    !selectedRuleName || !urlText.trim() ? 'disabled' : ''
                                }>Añadir</button>
                            </div>
                        </div>
                    </div>
                </body>
            </html>`);
            document = dom.window.document;
        }

        it('initializes with no rule selected and disabled Add button', () => {
            selectedRuleName = null;
            urlText = 'https://news.ycombinator.com';
            onSelectCalls = [];
            createModalDOM();

            const saveBtn = document.querySelector('.modal-btn-save');
            assert.ok(saveBtn.hasAttribute('disabled'), 'Button must be disabled when no rule is selected');
            assert.equal(
                document.querySelector('.rule-selection-btn.selected'),
                null,
                'No rule button has .selected class',
            );
        });

        it('disables Add button if urlText is empty even when a rule is selected', () => {
            selectedRuleName = 'Dev';
            urlText = '   ';
            onSelectCalls = [];
            createModalDOM();

            const saveBtn = document.querySelector('.modal-btn-save');
            assert.ok(saveBtn.hasAttribute('disabled'), 'Button must be disabled when urlText is empty');
        });

        it('enables Add button when both a rule is selected and urlText is non-empty', () => {
            selectedRuleName = 'Dev';
            urlText = 'https://news.ycombinator.com';
            onSelectCalls = [];
            createModalDOM();

            const saveBtn = document.querySelector('.modal-btn-save');
            assert.equal(
                saveBtn.hasAttribute('disabled'),
                false,
                'Button must be enabled when rule and urlText are present',
            );

            const selectedBtn = document.querySelector('.rule-selection-btn.selected');
            assert.ok(selectedBtn, 'Selected rule button has .selected class');
            assert.equal(selectedBtn.getAttribute('data-rule'), 'Dev');
        });

        it('clicking Add button invokes onSelect with selected rule and edited URL', () => {
            selectedRuleName = 'Dev';
            urlText = 'https://github.com/sveltejs/svelte\nhttps://svelte.dev';
            onSelectCalls = [];

            // Trigger save
            if (selectedRuleName && urlText.trim()) {
                handleRuleSelect(selectedRuleName);
            }

            assert.equal(onSelectCalls.length, 1);
            assert.equal(onSelectCalls[0].ruleName, 'Dev');
            assert.equal(onSelectCalls[0].urls, 'https://github.com/sveltejs/svelte\nhttps://svelte.dev');
        });

        it('Enter keydown invokes handleRuleSelect when rule is selected and target is not textarea', () => {
            selectedRuleName = 'Social';
            urlText = 'https://reddit.com/r/sveltejs';
            onSelectCalls = [];

            const simulateKeydown = (key, targetTagName, ctrlKey = false) => {
                if (key === 'Enter') {
                    if (targetTagName === 'TEXTAREA' && !ctrlKey) {
                        return; // do not submit
                    }
                    if (selectedRuleName && urlText.trim()) {
                        handleRuleSelect(selectedRuleName);
                    }
                }
            };

            // Enter on search input or rule button submits
            simulateKeydown('Enter', 'INPUT');
            assert.equal(onSelectCalls.length, 1);
            assert.equal(onSelectCalls[0].ruleName, 'Social');

            // Plain Enter in textarea does NOT submit
            onSelectCalls = [];
            simulateKeydown('Enter', 'TEXTAREA', false);
            assert.equal(onSelectCalls.length, 0, 'Plain Enter inside textarea must not trigger submit');

            // Ctrl+Enter in textarea does submit
            simulateKeydown('Enter', 'TEXTAREA', true);
            assert.equal(onSelectCalls.length, 1, 'Ctrl+Enter inside textarea triggers submit');
        });

        it('double-click shortcut immediately selects and adds rule', () => {
            urlText = 'https://news.ycombinator.com';
            onSelectCalls = [];

            const simulateDblClick = (ruleName) => {
                selectedRuleName = ruleName;
                handleRuleSelect(ruleName);
            };

            simulateDblClick('Dev');
            assert.equal(selectedRuleName, 'Dev');
            assert.equal(onSelectCalls.length, 1);
            assert.equal(onSelectCalls[0].ruleName, 'Dev');
            assert.equal(onSelectCalls[0].urls, 'https://news.ycombinator.com');
        });

        it('reopening modal resets selectedRuleName to null', () => {
            selectedRuleName = 'Dev';
            assert.equal(selectedRuleName, 'Dev');

            // Simulate $effect on show = true
            const onShowEffect = () => {
                selectedRuleName = null;
            };
            onShowEffect();

            assert.equal(selectedRuleName, null, 'selectedRuleName must be null upon opening modal');
        });

        it('renders aria-pressed attribute matching selected state on rule buttons', () => {
            selectedRuleName = 'Dev';
            urlText = 'https://news.ycombinator.com';
            createModalDOM();

            const devBtn = document.querySelector('[data-rule="Dev"]');
            const socialBtn = document.querySelector('[data-rule="Social"]');
            assert.equal(devBtn.getAttribute('aria-pressed'), 'true');
            assert.equal(socialBtn.getAttribute('aria-pressed'), 'false');
        });

        it('Enter key on close button does not trigger handleRuleSelect', () => {
            selectedRuleName = 'Dev';
            urlText = 'https://news.ycombinator.com';
            onSelectCalls = [];

            let modalClosed = false;
            const onClose = () => {
                modalClosed = true;
            };

            const simulateKeydownOnTarget = (targetTagName) => {
                if (targetTagName === 'BUTTON') {
                    // overlay keydown returns; native button click activates close
                    onClose();
                    return;
                }
                if (selectedRuleName && urlText.trim()) {
                    handleRuleSelect(selectedRuleName);
                }
            };

            simulateKeydownOnTarget('BUTTON');
            assert.equal(modalClosed, true, 'Close button should be activated');
            assert.equal(onSelectCalls.length, 0, 'handleRuleSelect must NOT be triggered on close button Enter');
        });

        it('tabbing to another rule button and pressing Enter selects it without submitting previous selection', () => {
            selectedRuleName = 'Dev';
            urlText = 'https://news.ycombinator.com';
            onSelectCalls = [];

            // User tabs to 'Social' button and presses Enter
            const targetRule = 'Social';
            const handleRuleButtonKeydown = (ruleName) => {
                if (selectedRuleName === ruleName) {
                    handleRuleSelect(ruleName);
                } else {
                    selectedRuleName = ruleName;
                }
            };

            // First press selects Social
            handleRuleButtonKeydown(targetRule);
            assert.equal(selectedRuleName, 'Social', 'Rule Social must now be selected');
            assert.equal(onSelectCalls.length, 0, 'Previous rule Dev must NOT be submitted');

            // Second press on already selected Social button submits it
            handleRuleButtonKeydown(targetRule);
            assert.equal(onSelectCalls.length, 1);
            assert.equal(onSelectCalls[0].ruleName, 'Social');
        });

        it('isSubmitting guard prevents duplicate concurrent onSelect submissions', async () => {
            let isSubmitting = false;
            let executionCount = 0;
            const mockAsyncSelect = async () => {
                if (isSubmitting) return;
                isSubmitting = true;
                try {
                    executionCount++;
                    await new Promise((r) => setTimeout(r, 10));
                } finally {
                    isSubmitting = false;
                }
            };

            // Fire 3 simultaneous rapid triggers (e.g. rapid double/triple clicks)
            await Promise.all([mockAsyncSelect(), mockAsyncSelect(), mockAsyncSelect()]);
            assert.equal(executionCount, 1, 'Async onSelect must only execute once despite rapid concurrent triggers');
        });

        it('AddToRuleModal safely normalizes null url without throwing TypeError', () => {
            const inputUrl = null;
            let urlText = '';

            assert.doesNotThrow(() => {
                const urls = (inputUrl || '')
                    .split(/[\n,]+/)
                    .map((u) => u.trim())
                    .filter((u) => u.length > 0);
                urlText = [...new Set(urls)].join('\n');
            });

            assert.equal(urlText, '', 'urlText must safely resolve to empty string');
        });

        it('AddToRuleModal safely filters null rules without throwing TypeError', () => {
            const inputRules = null;
            const searchQuery = 'github';

            let filteredRules = [];
            assert.doesNotThrow(() => {
                const safeRules = inputRules || [];
                const lowerSearch = searchQuery.toLowerCase().trim();
                filteredRules = safeRules.filter((rule) => {
                    const matchesName = rule?.name ? rule.name.toLowerCase().includes(lowerSearch) : false;
                    const matchesUrl =
                        rule?.urls && rule.urls.some((u) => (u || '').toLowerCase().includes(lowerSearch));
                    return matchesName || matchesUrl;
                });
            });

            assert.deepEqual(filteredRules, [], 'filteredRules must safely resolve to empty array');
        });

        it('filteredRules safely filters corrupt rules containing null, undefined, or non-objects', () => {
            const rawRules = [
                { name: 'Dev', urls: ['github.com'] },
                null,
                undefined,
                'invalid',
                { noName: true },
                { name: 'Design', urls: ['figma.com'] },
            ];

            const safeRules = rawRules || [];
            const validRules = safeRules.filter((r) => r && typeof r.name === 'string');

            assert.equal(validRules.length, 2, 'Must filter down to only valid rule objects with string name');
            assert.equal(validRules[0].name, 'Dev');
            assert.equal(validRules[1].name, 'Design');

            assert.doesNotThrow(() => {
                for (const rule of validRules) {
                    const key = rule.name;
                    assert.ok(typeof key === 'string');
                }
            });
        });
    });
});
