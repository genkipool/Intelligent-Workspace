/**
 * Tests for bookmark folder and item rule actions:
 * - "Crear una regla desde esta carpeta" (createRuleBtn)
 * - "Añadir esta carpeta a una regla existente" (addToRuleBtn)
 * - Single bookmark item create/add rule actions
 * - Overflow menu integration
 * - Bubble fallback in groupsService.js handleRuleActionClick
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

describe('Bookmark Folder & Item Rules Actions', () => {
    describe('Source Code Contract & Static Verification', () => {
        const bookmarksJs = readFileSync('src/ui/bookmarks/bookmarks.js', 'utf8');
        const groupsServiceJs = readFileSync('src/ui/services/groupsService.js', 'utf8');
        const contextMenuServiceJs = readFileSync('src/ui/services/contextMenuService.js', 'utf8');

        it('bookmarks.js imports getDomainOrSubdomainUrl', () => {
            assert.match(
                bookmarksJs,
                /import\s*\{[^}]*getDomainOrSubdomainUrl[^}]*\}\s*from\s*['"]\.\.\/services\/utils\.js['"]/,
                'bookmarks.js must import getDomainOrSubdomainUrl',
            );
        });

        it('bookmarks.js defines navigateToCreateRule', () => {
            assert.match(
                bookmarksJs,
                /function\s+navigateToCreateRule\s*\(/,
                'bookmarks.js must define navigateToCreateRule',
            );
        });

        it('createBookmarkElement sets dataset.url on bookmarkEl', () => {
            assert.match(
                bookmarksJs,
                /bookmarkEl\.dataset\.url\s*=\s*bookmark\.url;/,
                'createBookmarkElement must assign dataset.url',
            );
        });

        it('createBookmarkElement wires up create-rule-btn and add-to-rule-btn', () => {
            assert.match(
                bookmarksJs,
                /actionsContainer\.querySelector\(['"]\.create-rule-btn['"]\)/,
                'createBookmarkElement must find .create-rule-btn',
            );
            assert.match(
                bookmarksJs,
                /actionsContainer\.querySelector\(['"]\.add-to-rule-btn['"]\)/,
                'createBookmarkElement must find .add-to-rule-btn',
            );
        });

        it('renderBookmarkNode wires up create-rule-btn and add-to-rule-btn on folderEl', () => {
            assert.match(
                bookmarksJs,
                /folderEl\.querySelector\(['"]\.create-rule-btn['"]\)/,
                'renderBookmarkNode must wire .create-rule-btn for folders',
            );
            assert.match(
                bookmarksJs,
                /folderEl\.querySelector\(['"]\.add-to-rule-btn['"]\)/,
                'renderBookmarkNode must wire .add-to-rule-btn for folders',
            );
        });

        it('groupsService.js checks bookmarkItem before bookmarkFolder in addToRuleTarget', () => {
            const addToRuleIdx = groupsServiceJs.indexOf('const addToRuleTarget =');
            assert.ok(addToRuleIdx !== -1, 'addToRuleTarget block must exist');
            const addToRuleCode = groupsServiceJs.slice(addToRuleIdx);

            const itemCheckIdx = addToRuleCode.indexOf('bookmarkItem && !bookmarkItem.classList.contains');
            const folderCheckIdx = addToRuleCode.indexOf('else if (bookmarkFolder)');

            assert.ok(itemCheckIdx !== -1, 'bookmarkItem check must exist in addToRuleTarget');
            assert.ok(folderCheckIdx !== -1, 'bookmarkFolder check must exist in addToRuleTarget');
            assert.ok(
                itemCheckIdx < folderCheckIdx,
                'bookmarkItem must be checked before bookmarkFolder in addToRuleTarget',
            );
        });

        it('contextMenuService.js has data-i18n-title fallback for overflow popup item text', () => {
            assert.match(
                contextMenuServiceJs,
                /data-i18n-title/,
                'contextMenuService.js must include data-i18n-title fallback',
            );
        });

        it('bookmarks.js marks empty folders and hides create-rule, add-to-rule, export, and open-all buttons', () => {
            assert.match(
                bookmarksJs,
                /const\s+isEmptyFolder\s*=\s*totalBookmarks\s*===\s*0;/,
                'bookmarks.js must check if folder is empty (totalBookmarks === 0)',
            );
            assert.match(
                bookmarksJs,
                /folderEl\.classList\.add\(['"]is-empty['"]\);/,
                'bookmarks.js must add is-empty class to folderEl',
            );
            assert.match(
                bookmarksJs,
                /createRuleBtn\.classList\.add\(['"]hidden['"]\);/,
                'bookmarks.js must add hidden class to createRuleBtn on empty folders',
            );
            assert.match(
                bookmarksJs,
                /addToRuleBtn\.classList\.add\(['"]hidden['"]\);/,
                'bookmarks.js must add hidden class to addToRuleBtn on empty folders',
            );
            assert.match(
                bookmarksJs,
                /exportFolderBtn\.classList\.add\(['"]hidden['"]\);/,
                'bookmarks.js must add hidden class to exportFolderBtn on empty folders',
            );
            assert.match(
                bookmarksJs,
                /openAllBtn\.classList\.add\(['"]hidden['"]\);/,
                'bookmarks.js must add hidden class to openAllBtn on empty folders',
            );
        });

        it('contextMenuService.js excludes restricted empty folder actions in overflow and context menus', () => {
            assert.match(
                contextMenuServiceJs,
                /if\s*\(\s*isEmptyFolder\s*&&\s*isRestrictedEmptyFolderAction\s*\)\s*return;/,
                'contextMenuService.js must exclude restricted actions for empty folders',
            );
        });

        it('listGroup.css ensures create-rule, add-to-rule, export, and open-all buttons are hidden for is-empty folders', () => {
            const listGroupCss = readFileSync('src/ui/pages/listGroup/listGroup.css', 'utf8');
            assert.match(
                listGroupCss,
                /\.bookmark-folder\.is-empty\s+\.folder-actions\s+\.create-rule-btn/,
                'listGroup.css must hide create-rule-btn in .bookmark-folder.is-empty',
            );
            assert.match(
                listGroupCss,
                /\.bookmark-folder\.is-empty\s+\.folder-actions\s+\.add-to-rule-btn/,
                'listGroup.css must hide add-to-rule-btn in .bookmark-folder.is-empty',
            );
            assert.match(
                listGroupCss,
                /\.bookmark-folder\.is-empty\s+\.folder-actions\s+\.export-folder-btn/,
                'listGroup.css must hide export-folder-btn in .bookmark-folder.is-empty',
            );
            assert.match(
                listGroupCss,
                /\.bookmark-folder\.is-empty\s+\.folder-actions\s+\.open-all-btn/,
                'listGroup.css must hide open-all-btn in .bookmark-folder.is-empty',
            );
        });
    });

    describe('Functional Execution: Folder & Bookmark Rules Actions', () => {
        let dom;
        let document;
        let window;
        let fakeStorage;
        let lastNotification;
        let lastAddToRuleCall;
        let mockUtils;

        beforeEach(() => {
            fakeStorage = {};
            lastNotification = null;
            lastAddToRuleCall = null;

            dom = new JSDOM(
                `<!DOCTYPE html>
<html>
<body>
    <div id="bookmarks-view-container">
        <section id="bookmarks-list" class="bookmarks-list" tabindex="-1"></section>
    </div>

    <template id="bookmark-item-template">
        <div class="bookmark-item" role="link" tabindex="0">
            <img src="" alt="Favicon" class="favicon" />
            <span class="bookmark-title"></span>
            <div class="bookmark-actions">
                <button type="button" class="action-btn create-rule-btn" data-i18n-title="createRule"></button>
                <button type="button" class="action-btn add-to-rule-btn" data-i18n-title="addToRule"></button>
                <button type="button" class="action-btn edit-btn" data-i18n-title="editBookmark"></button>
                <button type="button" class="action-btn copy-btn" data-i18n-title="copyUrl"></button>
                <button type="button" class="action-btn delete-btn" data-i18n-title="deleteBookmark"></button>
            </div>
        </div>
    </template>

    <template id="bookmark-folder-template">
        <details class="bookmark-folder" open>
            <summary class="bookmark-folder-header">
                <span class="folder-title">
                    <span class="folder-name"></span>
                    <div class="folder-counters">
                        <span class="badge folder-count-container hidden">
                            <span class="subfolder-count"></span>
                        </span>
                        <span class="badge bookmark-count-container hidden">
                            <span class="bookmark-count"></span>
                        </span>
                    </div>
                </span>
            </summary>
            <div class="folder-actions header-controls">
                <div class="action-btn add-folder-btn" role="button" tabindex="0"></div>
                <div class="action-btn open-all-btn" role="button" tabindex="0"></div>
                <div class="action-btn create-rule-btn" role="button" tabindex="0" data-i18n-title="createRuleFromFolder"></div>
                <div class="action-btn add-to-rule-btn" role="button" tabindex="0" data-i18n-title="addFolderToExistingRule"></div>
                <div class="action-btn export-folder-btn" role="button" tabindex="0"></div>
                <div class="action-btn edit-folder-btn" role="button" tabindex="0"></div>
                <div class="action-btn copy-all-btn" role="button" tabindex="0"></div>
                <div class="action-btn delete-folder-btn" role="button" tabindex="0"></div>
            </div>
            <div class="bookmark-folder-content"></div>
        </details>
    </template>
</body>
</html>`,
                { url: 'chrome-extension://test-id/src/ui/pages/listGroup/listGroup.html?view=bookmarks' },
            );

            let lastNavigatedUrl = null;
            window = new Proxy(dom.window, {
                get(target, prop) {
                    if (prop === 'location') {
                        return {
                            pathname: '/src/ui/pages/listGroup/listGroup.html',
                            search: '?view=bookmarks',
                            get href() {
                                return (
                                    lastNavigatedUrl ||
                                    'chrome-extension://test-id/src/ui/pages/listGroup/listGroup.html?view=bookmarks'
                                );
                            },
                            set href(val) {
                                lastNavigatedUrl = val;
                            },
                        };
                    }
                    return target[prop];
                },
            });
            document = dom.window.document;
            globalThis.window = window;
            globalThis.document = document;

            globalThis.chrome = {
                runtime: {
                    id: 'test-id',
                    sendMessage: async (msg) => {
                        return { success: true };
                    },
                },
                storage: {
                    local: {
                        set: (obj, cb) => {
                            Object.assign(fakeStorage, obj);
                            if (cb) cb();
                            return Promise.resolve();
                        },
                        get: (key, cb) => {
                            const res = typeof key === 'string' ? { [key]: fakeStorage[key] } : fakeStorage;
                            if (cb) cb(res);
                            return Promise.resolve(res);
                        },
                    },
                },
                i18n: {
                    getMessage: (key) => key,
                },
                tabs: {
                    create: () => {},
                },
                bookmarks: {
                    remove: (id, cb) => cb && cb(),
                },
            };

            mockUtils = {
                showNotification: (key, isError = false, params = []) => {
                    lastNotification = { key, isError, params };
                },
                applyTranslations: () => {},
                updateScrollButtons: () => {},
                updateExpandAllButtonState: () => {},
                createOverflowMenu: () => {},
                showAddToRuleModal: (urls, title) => {
                    lastAddToRuleCall = { urls, title };
                },
                exportBookmarkFolder: () => {},
                openAddToBookmarkModal: () => {},
            };
        });

        it('renders bookmark folder and sets dataset.url on bookmark items', async () => {
            const { initializeBookmarksView } = await import('../src/ui/bookmarks/bookmarks.js');
            const { prefetchCache } = await import('../src/ui/stores/appStore.svelte.js');

            const tree = [
                {
                    id: '10',
                    title: 'Development Folder',
                    children: [
                        {
                            id: '101',
                            title: 'GitHub Issues',
                            url: 'https://github.com/org/repo/issues/42?filter=open#section',
                        },
                        {
                            id: '102',
                            title: 'Google Docs',
                            url: 'https://docs.google.com/document/d/123/edit?usp=sharing',
                        },
                    ],
                },
            ];

            prefetchCache.set({ bookmarks: { tree, duplicateUrlSet: [] } });

            const container = document.getElementById('bookmarks-list');
            await initializeBookmarksView(container, mockUtils, 'dateAdded', true);

            const items = container.querySelectorAll('.bookmark-item');
            assert.equal(items.length, 2);
            assert.equal(items[0].dataset.url, 'https://github.com/org/repo/issues/42?filter=open#section');
            assert.equal(items[1].dataset.url, 'https://docs.google.com/document/d/123/edit?usp=sharing');
        });

        it('clicking create-rule-btn on folder extracts all unique domain URLs and redirects to rules.html', async () => {
            const { initializeBookmarksView } = await import('../src/ui/bookmarks/bookmarks.js');
            const { prefetchCache } = await import('../src/ui/stores/appStore.svelte.js');

            const tree = [
                {
                    id: '20',
                    title: 'Work Tools',
                    children: [
                        { id: '201', title: 'Tool A1', url: 'https://tool.example.com/dashboard/home?user=1' },
                        { id: '202', title: 'Tool A2', url: 'https://tool.example.com/settings' }, // duplicate domain
                        {
                            id: 'sub2',
                            title: 'Subfolder',
                            children: [
                                { id: '203', title: 'Tool B', url: 'https://analytics.google.com/analytics/web/' },
                            ],
                        },
                    ],
                },
            ];

            prefetchCache.set({ bookmarks: { tree, duplicateUrlSet: [] } });

            const container = document.getElementById('bookmarks-list');
            await initializeBookmarksView(container, mockUtils, 'dateAdded', true);

            const folder = container.querySelector('.bookmark-folder');
            const createRuleBtn = folder.querySelector('.create-rule-btn');
            assert.ok(createRuleBtn, 'create-rule-btn must exist in folder header');

            createRuleBtn.click();

            // Verify navSource was set in chrome.storage.local
            assert.ok(fakeStorage.navSource, 'navSource must be stored in storage');
            assert.match(fakeStorage.navSource, /view=bookmarks/);

            // Verify window.location.href was updated with domain/subdomain URLs
            const expectedUrls = ['https://tool.example.com', 'https://analytics.google.com'].join('\n');
            const encodedUrls = encodeURIComponent(expectedUrls);
            const encodedName = encodeURIComponent('Work Tools');

            assert.match(window.location.href, /rules\.html\?action=create/);
            assert.match(window.location.href, new RegExp(`url=${encodedUrls}`));
            assert.match(window.location.href, new RegExp(`name=${encodedName}`));
            assert.match(window.location.href, /returnTo=listGroup/);
        });

        it('clicking add-to-rule-btn on folder opens modal with unique domain URLs and folder title', async () => {
            const { initializeBookmarksView } = await import('../src/ui/bookmarks/bookmarks.js');
            const { prefetchCache } = await import('../src/ui/stores/appStore.svelte.js');

            const tree = [
                {
                    id: '30',
                    title: 'Projects Folder',
                    children: [
                        { id: '301', title: 'Project Page', url: 'https://jira.company.org/browse/PROJ-123' },
                        { id: '302', title: 'Project Board', url: 'https://jira.company.org/secure/RapidBoard.jspa' },
                        { id: '303', title: 'Docs', url: 'https://confluence.company.org/pages/viewpage.action' },
                    ],
                },
            ];

            prefetchCache.set({ bookmarks: { tree, duplicateUrlSet: [] } });

            const container = document.getElementById('bookmarks-list');
            await initializeBookmarksView(container, mockUtils, 'dateAdded', true);

            const folder = container.querySelector('.bookmark-folder');
            const addToRuleBtn = folder.querySelector('.add-to-rule-btn');
            assert.ok(addToRuleBtn, 'add-to-rule-btn must exist in folder header');

            addToRuleBtn.click();

            assert.ok(lastAddToRuleCall, 'showAddToRuleModal should have been called');
            const expectedUrls = ['https://jira.company.org', 'https://confluence.company.org'].join('\n');
            assert.equal(lastAddToRuleCall.urls, expectedUrls);
            assert.equal(lastAddToRuleCall.title, 'Projects Folder');
        });

        it('hides create-rule, add-to-rule, export-folder, and open-all buttons when folder is empty', async () => {
            const { initializeBookmarksView } = await import('../src/ui/bookmarks/bookmarks.js');
            const { prefetchCache } = await import('../src/ui/stores/appStore.svelte.js');

            const tree = [
                {
                    id: '40',
                    title: 'Empty Folder',
                    children: [],
                },
            ];

            prefetchCache.set({ bookmarks: { tree, duplicateUrlSet: [] } });

            const container = document.getElementById('bookmarks-list');
            await initializeBookmarksView(container, mockUtils, 'dateAdded', true);

            const folder = container.querySelector('.bookmark-folder');
            assert.ok(folder.classList.contains('is-empty'), 'empty folder must have is-empty class');
            assert.equal(folder.dataset.totalBookmarks, '0', 'empty folder must have totalBookmarks=0');

            const createRuleBtn = folder.querySelector('.create-rule-btn');
            assert.ok(createRuleBtn, 'create-rule-btn exists in DOM');
            assert.ok(createRuleBtn.classList.contains('hidden'), 'create-rule-btn must have hidden class');
            assert.equal(createRuleBtn.style.display, 'none', 'create-rule-btn must have display: none');

            const addToRuleBtn = folder.querySelector('.add-to-rule-btn');
            assert.ok(addToRuleBtn, 'add-to-rule-btn exists in DOM');
            assert.ok(addToRuleBtn.classList.contains('hidden'), 'add-to-rule-btn must have hidden class');
            assert.equal(addToRuleBtn.style.display, 'none', 'add-to-rule-btn must have display: none');

            const exportFolderBtn = folder.querySelector('.export-folder-btn');
            assert.ok(exportFolderBtn, 'export-folder-btn exists in DOM');
            assert.ok(exportFolderBtn.classList.contains('hidden'), 'export-folder-btn must have hidden class');
            assert.equal(exportFolderBtn.style.display, 'none', 'export-folder-btn must have display: none');

            const openAllBtn = folder.querySelector('.open-all-btn');
            assert.ok(openAllBtn, 'open-all-btn exists in DOM');
            assert.ok(openAllBtn.classList.contains('hidden'), 'open-all-btn must have hidden class');
            assert.equal(openAllBtn.style.display, 'none', 'open-all-btn must have display: none');
        });

        it('hides rule, export, and open-all buttons when folder contains only empty subfolders', async () => {
            const { initializeBookmarksView } = await import('../src/ui/bookmarks/bookmarks.js');
            const { prefetchCache } = await import('../src/ui/stores/appStore.svelte.js');

            const tree = [
                {
                    id: '50',
                    title: 'Parent Empty Folder',
                    children: [
                        {
                            id: '51',
                            title: 'Child Empty Folder',
                            children: [],
                        },
                    ],
                },
            ];

            prefetchCache.set({ bookmarks: { tree, duplicateUrlSet: [] } });

            const container = document.getElementById('bookmarks-list');
            await initializeBookmarksView(container, mockUtils, 'dateAdded', true);

            const folders = container.querySelectorAll('.bookmark-folder');
            assert.equal(folders.length, 2);

            folders.forEach((folder) => {
                assert.ok(folder.classList.contains('is-empty'));
                assert.equal(folder.dataset.totalBookmarks, '0');

                const createBtn = folder.querySelector('.create-rule-btn');
                const addBtn = folder.querySelector('.add-to-rule-btn');
                const exportBtn = folder.querySelector('.export-folder-btn');
                const openBtn = folder.querySelector('.open-all-btn');

                assert.ok(createBtn.classList.contains('hidden'));
                assert.equal(createBtn.style.display, 'none');
                assert.ok(addBtn.classList.contains('hidden'));
                assert.equal(addBtn.style.display, 'none');
                assert.ok(exportBtn.classList.contains('hidden'));
                assert.equal(exportBtn.style.display, 'none');
                assert.ok(openBtn.classList.contains('hidden'));
                assert.equal(openBtn.style.display, 'none');
            });
        });

        it('does not hide rule, export, and open-all buttons when folder has bookmarks', async () => {
            const { initializeBookmarksView } = await import('../src/ui/bookmarks/bookmarks.js');
            const { prefetchCache } = await import('../src/ui/stores/appStore.svelte.js');

            const tree = [
                {
                    id: '55',
                    title: 'Non Empty Folder',
                    children: [{ id: '551', title: 'A Bookmark', url: 'https://example.com' }],
                },
            ];

            prefetchCache.set({ bookmarks: { tree, duplicateUrlSet: [] } });

            const container = document.getElementById('bookmarks-list');
            await initializeBookmarksView(container, mockUtils, 'dateAdded', true);

            const folder = container.querySelector('.bookmark-folder');
            assert.ok(!folder.classList.contains('is-empty'), 'non-empty folder must not have is-empty class');
            assert.equal(folder.dataset.totalBookmarks, '1');

            const createRuleBtn = folder.querySelector('.create-rule-btn');
            assert.ok(!createRuleBtn.classList.contains('hidden'), 'create-rule-btn must not have hidden class');
            assert.notEqual(createRuleBtn.style.display, 'none');

            const addToRuleBtn = folder.querySelector('.add-to-rule-btn');
            assert.ok(!addToRuleBtn.classList.contains('hidden'), 'add-to-rule-btn must not have hidden class');
            assert.notEqual(addToRuleBtn.style.display, 'none');

            const exportFolderBtn = folder.querySelector('.export-folder-btn');
            assert.ok(!exportFolderBtn.classList.contains('hidden'), 'export-folder-btn must not have hidden class');
            assert.notEqual(exportFolderBtn.style.display, 'none');

            const openAllBtn = folder.querySelector('.open-all-btn');
            assert.ok(!openAllBtn.classList.contains('hidden'), 'open-all-btn must not have hidden class');
            assert.notEqual(openAllBtn.style.display, 'none');
        });

        it('single bookmark item create-rule and add-to-rule buttons only target the bookmark domain', async () => {
            const { initializeBookmarksView } = await import('../src/ui/bookmarks/bookmarks.js');
            const { prefetchCache } = await import('../src/ui/stores/appStore.svelte.js');

            const tree = [
                {
                    id: '60',
                    title: 'Folder With Single Bookmark',
                    children: [
                        {
                            id: '601',
                            title: 'My Specific Bookmark',
                            url: 'https://sub.domain.example.com/very/long/path?param=1&other=2#anchor',
                        },
                    ],
                },
            ];

            prefetchCache.set({ bookmarks: { tree, duplicateUrlSet: [] } });

            const container = document.getElementById('bookmarks-list');
            await initializeBookmarksView(container, mockUtils, 'dateAdded', true);

            const item = container.querySelector('.bookmark-item');
            const itemAddBtn = item.querySelector('.add-to-rule-btn');

            itemAddBtn.click();

            assert.ok(lastAddToRuleCall, 'showAddToRuleModal should have been called');
            assert.equal(lastAddToRuleCall.urls, 'https://sub.domain.example.com');
            assert.equal(lastAddToRuleCall.title, 'My Specific Bookmark');

            const itemCreateBtn = item.querySelector('.create-rule-btn');
            itemCreateBtn.click();

            const encodedUrl = encodeURIComponent('https://sub.domain.example.com');
            const encodedName = encodeURIComponent('My Specific Bookmark');
            assert.match(window.location.href, new RegExp(`url=${encodedUrl}`));
            assert.match(window.location.href, new RegExp(`name=${encodedName}`));
        });

        it('handleRuleActionClick in groupsService.js handles bubbling clicks on folders and bookmarks correctly', async () => {
            const { handleRuleActionClick } = await import('../src/ui/services/groupsService.js');
            const bookmarksContainer = document.getElementById('bookmarks-view-container');
            bookmarksContainer.addEventListener('click', handleRuleActionClick);

            const { initializeBookmarksView } = await import('../src/ui/bookmarks/bookmarks.js');
            const { prefetchCache } = await import('../src/ui/stores/appStore.svelte.js');

            const tree = [
                {
                    id: '70',
                    title: 'Bubbling Test Folder',
                    children: [
                        {
                            id: '701',
                            title: 'Item In Folder',
                            url: 'https://bubbling-test.org/item1?query=abc',
                        },
                    ],
                },
            ];

            prefetchCache.set({ bookmarks: { tree, duplicateUrlSet: [] } });

            const container = document.getElementById('bookmarks-list');
            await initializeBookmarksView(container, mockUtils, 'dateAdded', true);

            const item = container.querySelector('.bookmark-item');
            const itemAddBtn = item.querySelector('.add-to-rule-btn');

            // Dispatch click on item add-to-rule
            itemAddBtn.click();
            assert.ok(lastAddToRuleCall);
            assert.equal(lastAddToRuleCall.urls, 'https://bubbling-test.org');
            assert.equal(lastAddToRuleCall.title, 'Item In Folder');

            // Reset and click folder add-to-rule
            lastAddToRuleCall = null;
            const folder = container.querySelector('.bookmark-folder');
            const folderAddBtn = folder.querySelector('.add-to-rule-btn');
            folderAddBtn.click();
            assert.ok(lastAddToRuleCall);
            assert.equal(lastAddToRuleCall.urls, 'https://bubbling-test.org');
            assert.equal(lastAddToRuleCall.title, 'Bubbling Test Folder');
        });

        it('shows notification when bookmark has no valid web URL to create or add rule', async () => {
            const { initializeBookmarksView } = await import('../src/ui/bookmarks/bookmarks.js');
            const { prefetchCache } = await import('../src/ui/stores/appStore.svelte.js');

            const tree = [
                {
                    id: '90',
                    title: 'Folder Without Web URLs',
                    children: [
                        {
                            id: '901',
                            title: 'Empty URL Bookmark',
                            url: '   ',
                        },
                    ],
                },
            ];

            prefetchCache.set({ bookmarks: { tree, duplicateUrlSet: [] } });

            const container = document.getElementById('bookmarks-list');
            await initializeBookmarksView(container, mockUtils, 'dateAdded', true);

            const item = container.querySelector('.bookmark-item');
            const itemAddBtn = item.querySelector('.add-to-rule-btn');
            itemAddBtn.click();

            assert.ok(lastNotification, 'showNotification should be called when no valid domain URLs exist');
            assert.equal(lastNotification.key, 'noUrlsToCopy');
            assert.equal(lastNotification.isError, true);
        });
    });
});
