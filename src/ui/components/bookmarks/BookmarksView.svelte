<script>
    // The page can be opened straight into this view, and the URL says so before any
    // store is set. Laying it out from the first frame stops the group shell being
    // painted and swapped a few frames later. The boot still drives it afterwards.
    const startsVisible = new URLSearchParams(window.location.search).get('view') === 'bookmarks';
</script>

<!--
    Contenedor de la vista de marcadores: réplica exacta del markup original
    (listGroup.html). El renderizado de carpetas/items lo hace el port vanilla
    initializeBookmarksView (src/ui/bookmarks/bookmarks.js) y la visibilidad la
    gestiona viewsService.toggleViews, igual que en el original.
-->
<div id="bookmarks-view-container" style:display={startsVisible ? null : 'none'}>
    <section id="bookmarks-list" class="bookmarks-list" tabindex="-1"></section>

    <template id="bookmark-item-template">
        <div class="bookmark-item" role="link" tabindex="0">
            <img src="" alt="Favicon" class="favicon" />
            <span class="bookmark-title"></span>
            <div class="bookmark-actions">
                <button type="button" class="action-btn create-rule-btn" data-i18n-title="createRule">
                    <svg width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-create-rule"></use>
                    </svg>
                </button>
                <button type="button" class="action-btn add-to-rule-btn" data-i18n-title="addToRule">
                    <svg width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-add-to-rule"></use>
                    </svg>
                </button>
                <button type="button" class="action-btn edit-btn" data-i18n-title="editBookmark">
                    <svg width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-edit"></use>
                    </svg>
                </button>
                <button type="button" class="action-btn copy-btn" data-i18n-title="copyUrl">
                    <svg width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-copy"></use>
                    </svg>
                </button>
                <button type="button" class="action-btn delete-btn" data-i18n-title="deleteBookmark">
                    <svg class="icon-close" width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-close"></use>
                    </svg>
                </button>
                <template data-template-id="overflow-actions-template"></template>
            </div>
        </div>
    </template>

    <template id="special-delete-modal-template">
        <div class="modal-overlay">
            <div class="modal-content special-delete-modal">
                <div class="modal-header">
                    <h2 class="modal-title"></h2>
                    <button type="button" class="restart-scan-btn control-btn hidden" data-i18n-title="restartScan">
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-refresh"></use>
                        </svg>
                    </button>
                    <button type="button" class="close-modal-btn">&times;</button>
                </div>

                <div class="modal-body">
                    <p class="modal-description"></p>

                    <div class="modal-filters hidden">
                        <button type="button" class="filter-btn active" data-filter="all" data-i18n="filterAll"
                        ></button>
                        <button type="button" class="filter-btn" data-filter="4xx" data-i18n="filter4xx"></button>
                        <button type="button" class="filter-btn" data-filter="5xx" data-i18n="filter5xx"></button>
                        <button type="button" class="filter-btn" data-filter="timeout" data-i18n="filterTimeouts"
                        ></button>
                        <button type="button" class="filter-btn" data-filter="other" data-i18n="filterOther"></button>
                    </div>

                    <div class="scanning-progress-container hidden">
                        <div class="progress-labels">
                            <span class="progress-count-current">0</span>
                            <span class="progress-count-total">0</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill" style="width: 0%">
                                <span class="progress-percentage">0%</span>
                            </div>
                        </div>
                        <p class="scanning-status-text" data-i18n="scanningBookmarks">Scanning...</p>
                    </div>

                    <div class="bookmarks-delete-list-container hidden">
                        <ul class="bookmarks-delete-list"></ul>
                    </div>
                </div>

                <div class="modal-footer">
                    <span class="items-count-label">0 items</span>
                    <button type="button" class="modal-btn-delete-all-listed error-state"></button>
                </div>
            </div>
        </div>
    </template>

    <template id="delete-list-item-template">
        <li class="delete-list-item card-style">
            <div class="delete-item-info">
                <a href="#" target="_blank" class="delete-item-title" rel="noopener noreferrer"></a>
                <span class="delete-item-url"></span>
                <span class="delete-item-error"></span>
            </div>
            <button type="button" class="delete-item-action-btn" data-i18n-title="deleteButton">
                <svg width="18" height="18" aria-hidden="true" focusable="false">
                    <use href="#icon-trash"></use>
                </svg>
            </button>
        </li>
    </template>

    <template id="bookmark-folder-template">
        <details class="bookmark-folder">
            <summary class="bookmark-folder-title">
                <span class="folder-icon-wrapper">
                    <svg
                        class="folder-icon folder-icon-closed"
                        width="16"
                        height="16"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <use href="#icon-folder-closed"></use>
                    </svg>
                    <svg class="folder-icon-open" width="16" height="16" aria-hidden="true" focusable="false">
                        <use href="#icon-folder-open"></use>
                    </svg>
                </span>
                <span class="folder-name"></span>
                <div class="folder-counters">
                    <span class="folder-count-container hidden" data-i18n-title="folderCountTooltip">
                        <span class="subfolder-count"></span>
                        <span class="counter-icon">
                            <svg width="14" height="14" aria-hidden="true" focusable="false">
                                <use href="#icon-folder-closed"></use>
                            </svg>
                        </span>
                    </span>
                    <span class="bookmark-count-container hidden" data-i18n-title="bookmarkCountTooltip">
                        <span class="bookmark-count"></span>
                        <span class="counter-icon">
                            <svg width="14" height="14" aria-hidden="true" focusable="false">
                                <use href="#icon-bookmark"></use>
                            </svg>
                        </span>
                    </span>
                </div>
                <div class="folder-actions">
                    <div class="action-btn add-folder-btn" role="button" tabindex="0" data-i18n-title="addNewFolder">
                        <svg width="14" height="14">
                            <use href="#icon-add-folder"></use>
                        </svg>
                    </div>
                    <div class="action-btn open-all-btn" role="button" tabindex="0" data-i18n-title="openAllBookmarks">
                        <svg width="14" height="14">
                            <use href="#icon-open-all"></use>
                        </svg>
                    </div>
                    <div
                        class="action-btn create-rule-btn"
                        role="button"
                        tabindex="0"
                        data-i18n-title="createRuleFromFolder"
                    >
                        <svg width="14" height="14">
                            <use href="#icon-create-rule"></use>
                        </svg>
                    </div>
                    <div
                        class="action-btn add-to-rule-btn"
                        role="button"
                        tabindex="0"
                        data-i18n-title="addFolderToExistingRule"
                    >
                        <svg width="14" height="14">
                            <use href="#icon-add-to-rule"></use>
                        </svg>
                    </div>
                    <div
                        class="action-btn export-folder-btn"
                        role="button"
                        tabindex="0"
                        data-i18n-title="exportBookmarks"
                    >
                        <svg width="14" height="14">
                            <use href="#icon-export"></use>
                        </svg>
                    </div>
                    <div class="action-btn edit-folder-btn" role="button" tabindex="0" data-i18n-title="editFolderName">
                        <svg width="14" height="14">
                            <use href="#icon-edit"></use>
                        </svg>
                    </div>
                    <div class="action-btn copy-all-btn" role="button" tabindex="0" data-i18n-title="copyAllBookmarks">
                        <svg width="14" height="14">
                            <use href="#icon-copy"></use>
                        </svg>
                    </div>
                    <div
                        class="action-btn delete-folder-btn"
                        role="button"
                        tabindex="0"
                        data-i18n-title="deleteBookmarkFolder"
                    >
                        <svg width="14" height="14">
                            <use href="#icon-trash"></use>
                        </svg>
                    </div>
                    <template data-template-id="overflow-actions-template"></template>
                </div>
            </summary>
            <div class="bookmark-folder-content"></div>
        </details>
    </template>
</div>
