import { get } from 'svelte/store';

import { unhighlight, highlight, debounce } from './utils.js';

import {
    isBookmarksViewActive,
    isGeminiViewActive,
    isNotesViewActive,
    isPopupWindow,
    isUrlViewActive,
    lastIframeSearchResultCount,
    lastSearchTerm,
    searchState,
    activeNoteFilters,
    expandedGroupStates,
    expandedSubgroupStates,
    viewExpandStates,
    currentHistoryDateFilter,
    searchToggles,
} from '../stores/appStore.svelte.js';

import { hiddenGroupIds } from './groupsService.js';
import { saveListGroupSettings } from './settingsService.js';
import { handleGeminiQuery } from './geminiService.js';
import { isLikelyDomain } from './groupsService.js';
import {
    openUrlInPanel,
    fetchContentForReaderView,
    renderHistoryView,
    renderDownloadsView,
    updateExpandAllButtonState,
    updateScrollButtons,
} from './viewsService.js';

export function initSearchEvents() {
    const _searchToggleBtn = document.getElementById('search-toggle-btn');
    const _searchInput = document.getElementById('search-input');
    const _geminiToggleBtn = document.getElementById('gemini-toggle-btn');
    const _webSearchToggleBtn = document.getElementById('web-search-toggle-btn');
    const _regexToggleBtn = document.getElementById('regex-toggle-btn');

    if (_searchToggleBtn) {
        _searchToggleBtn.addEventListener('click', () => {
            const searchControls = document.querySelector('.search-and-controls');
            if (searchControls) {
                const isExpanding = !searchControls.classList.contains('search-expanded');
                searchControls.classList.toggle('search-expanded');
                if (isExpanding && _searchInput) _searchInput.focus();
            }
        });
    }

    if (_searchInput) {
        _searchInput.addEventListener('blur', (e) => {
            setTimeout(() => {
                const searchControls = document.querySelector('.search-and-controls');
                if (searchControls && searchControls.classList.contains('search-expanded')) {
                    if (
                        document.activeElement !== _searchToggleBtn &&
                        !searchControls.contains(document.activeElement)
                    ) {
                        searchControls.classList.remove('search-expanded');
                    }
                }
            }, 100);
        });

        _searchInput.addEventListener('input', debounce(applySearchAndFilter, 250));
        _searchInput.addEventListener('keydown', handleSearchEnter);

        const searchContainer = _searchInput.closest('.search-container');
        if (searchContainer) {
            /**
             * The bar drops its three toggles when there is no room for them.
             *
             * A width of zero is not "no room": it is what an element that is not being
             * displayed measures, and the bar is hidden for a frame whenever a view is
             * opened over the group list. Reading that as narrow latched the compact
             * class, and the bar painted stripped-down for a frame after it came back —
             * which is precisely the flicker people saw on the way into the notes and
             * the gallery. An element that is not rendered has no width worth having an
             * opinion about, so this one waits until it does.
             */
            const updateSearchBtnVisibility = () => {
                requestAnimationFrame(() => {
                    if (!searchContainer || !searchContainer.isConnected) return;
                    const width = searchContainer.offsetWidth;
                    if (width === 0) return;
                    const compact = width <= 110;
                    if (searchContainer.classList.contains('search-container--compact') !== compact) {
                        searchContainer.classList.toggle('search-container--compact', compact);
                    }
                });
            };
            updateSearchBtnVisibility();
            const searchContainerObserver = new ResizeObserver(updateSearchBtnVisibility);
            searchContainerObserver.observe(searchContainer);
        }
    }

    if (_geminiToggleBtn) _geminiToggleBtn.addEventListener('click', () => handleSearchToggle('gemini'));
    if (_webSearchToggleBtn) _webSearchToggleBtn.addEventListener('click', () => handleSearchToggle('web'));
    if (_regexToggleBtn) {
        _regexToggleBtn.addEventListener('click', () => {
            // The store is what the toolbar draws from, so the switch is flipped there
            // and the attribute follows.
            searchToggles.update((t) => ({ ...t, regex: !t.regex }));
            saveListGroupSettings();
            applySearchAndFilter();
        });
    }
}

export function handleSearchToggle(clickedButtonName) {
    // Only one of the two searches can be on: turning one on turns the other off.
    const clicked = clickedButtonName === 'gemini' ? 'gemini' : 'web';
    const other = clicked === 'gemini' ? 'web' : 'gemini';

    searchToggles.update((t) => {
        if (t[clicked]) return { ...t, [clicked]: false };
        return { ...t, [clicked]: true, [other]: false };
    });

    saveListGroupSettings();
    applySearchAndFilter();
}

/** The group and subgroup arrangement as it was before the current search started. */
let preSearchExpansion = null;

/**
 * Emptying the box by hand does not fire `input`, so the filter has to be re-run:
 * otherwise the groups that the query had hidden stay hidden and the list looks empty.
 */
function clearSearchInput(input) {
    input.value = '';
    lastSearchTerm.set('');
    applySearchAndFilter();
}

export async function handleSearchEnter(event) {
    if (event.key === 'Escape') {
        const _searchInput = document.getElementById('search-input');
        if (_searchInput) {
            _searchInput.blur();
            try {
                if (document.body && typeof document.body.click === 'function') {
                    document.body.click();
                } else if (document.documentElement && typeof document.documentElement.click === 'function') {
                    document.documentElement.click();
                }
            } catch {}
        }
        return;
    }
    if (event.key !== 'Enter') return;

    const _searchInput = document.getElementById('search-input');
    const _geminiToggleBtn = document.getElementById('gemini-toggle-btn');
    const _webSearchToggleBtn = document.getElementById('web-search-toggle-btn');

    if (!_searchInput) return;

    const currentQuery = _searchInput.value;
    const isGeminiSearchActive = _geminiToggleBtn ? _geminiToggleBtn.getAttribute('aria-pressed') === 'true' : false;
    const iframeViewer = document.getElementById('side-panel-iframe-viewer');

    if (get(isUrlViewActive) && iframeViewer) {
        if (!currentQuery) return;

        if (get(lastIframeSearchResultCount) > 0) {
            iframeViewer.contentWindow.postMessage({ type: 'find-next-in-iframe' }, '*');
        } else {
            const isWebSearchActive = _webSearchToggleBtn
                ? _webSearchToggleBtn.getAttribute('aria-pressed') === 'true'
                : false;
            if (isWebSearchActive) {
                const searchUrl = isLikelyDomain(currentQuery)
                    ? 'https://' + currentQuery
                    : `https://www.google.com/search?q=${encodeURIComponent(currentQuery)}`;
                openUrlInPanel(searchUrl);
                clearSearchInput(_searchInput);
            }
        }
        return;
    }

    const trimmedQuery = currentQuery.trim();

    if (isGeminiSearchActive) {
        event.preventDefault();
        if (!trimmedQuery) return;

        if (trimmedQuery === get(lastSearchTerm) && get(searchState).results.length > 0) {
            findNextHighlight();
            return;
        }

        if (get(searchState).results.length === 0) {
            await handleGeminiQuery(trimmedQuery);
            clearSearchInput(_searchInput);
        }
        return;
    }

    if (!trimmedQuery) return;

    if (trimmedQuery === get(lastSearchTerm) && get(searchState).results.length > 0) {
        findNextHighlight();
        return;
    }

    const isWebSearchActive = _webSearchToggleBtn ? _webSearchToggleBtn.getAttribute('aria-pressed') === 'true' : false;
    const shouldNavigate = isWebSearchActive || get(isPopupWindow) || isLikelyDomain(trimmedQuery);

    if (shouldNavigate && get(searchState).results.length === 0) {
        const isReaderView = get(isUrlViewActive) && document.querySelector('.reader-view.active-view');
        const wantsPanel = event.ctrlKey || event.metaKey || get(isUrlViewActive) || get(isPopupWindow);

        if (isReaderView) {
            const searchUrl = isLikelyDomain(trimmedQuery)
                ? 'https://' + trimmedQuery
                : `https://www.google.com/search?q=${encodeURIComponent(trimmedQuery)}`;

            fetchContentForReaderView(searchUrl);
        } else if (wantsPanel) {
            const searchUrl = isLikelyDomain(trimmedQuery)
                ? 'https://' + trimmedQuery
                : `https://www.google.com/search?q=${encodeURIComponent(trimmedQuery)}`;
            openUrlInPanel(searchUrl);
        } else {
            if (isLikelyDomain(trimmedQuery)) {
                chrome.tabs.create({
                    url: 'https://' + trimmedQuery,
                    active: true,
                });
            } else {
                chrome.runtime.sendMessage({
                    action: 'searchGoogle',
                    query: trimmedQuery,
                });
            }
        }

        clearSearchInput(_searchInput);
    }
}

export function findNextHighlight() {
    const _searchState = get(searchState);
    if (_searchState.results.length === 0) return;

    const previousElement = _searchState.results[_searchState.currentIndex];
    if (previousElement) {
        previousElement.classList.remove('current-highlight');
    }

    const newIndex = _searchState.currentIndex + 1;
    const nextCurrentIndex = newIndex >= _searchState.results.length ? 0 : newIndex;

    _searchState.currentIndex = nextCurrentIndex;

    const nextElement = _searchState.results[nextCurrentIndex];
    if (nextElement) {
        nextElement.classList.add('current-highlight');
        const nextTabTitle = nextElement.closest('.tab-title');
        if (nextTabTitle) {
            nextTabTitle.classList.add('show-overflow');
        }
        nextElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }

    searchState.set(_searchState);
}

export function applySearchAndFilter() {
    document.querySelectorAll('.tab-title.show-overflow').forEach((el) => {
        el.classList.remove('show-overflow');
    });

    const _searchInput = document.getElementById('search-input');
    const _regexToggleBtn = document.getElementById('regex-toggle-btn');
    const _hiddenGroupsContainer = document.getElementById('hidden-groups-container');
    const _geminiConversationView = document.getElementById('gemini-conversation-view');

    if (!_searchInput) return;

    const keywordSearch = _searchInput.value;
    lastSearchTerm.set(keywordSearch);

    if (!keywordSearch) {
        lastIframeSearchResultCount.set(0);
    }

    document.querySelectorAll('.current-highlight').forEach((el) => el.classList.remove('current-highlight'));
    searchState.set({ results: [], currentIndex: -1 });

    const isRegex = _regexToggleBtn ? _regexToggleBtn.getAttribute('aria-pressed') === 'true' : false;
    let searchRegex = null;

    const normalizeForSearch = (text) => {
        if (!text) return '';
        return text.toLowerCase();
    };

    const lowerCaseKeywordSearch = keywordSearch.toLowerCase();

    _searchInput.classList.remove('invalid-regex');
    if (isRegex && keywordSearch) {
        try {
            searchRegex = new RegExp(keywordSearch, 'i');
        } catch {
            _searchInput.classList.add('invalid-regex');
            return;
        }
    }

    if (get(isUrlViewActive)) {
        const readerView = document.querySelector('.reader-view.active-view');
        const iframeViewer = document.getElementById('side-panel-iframe-viewer');

        if (readerView) {
            unhighlight(readerView);
            if (keywordSearch) {
                highlight(readerView, keywordSearch, isRegex);
                const results = Array.from(readerView.querySelectorAll('.search-highlight'));
                searchState.set({ results, currentIndex: -1 });
                findNextHighlight();
            }
        } else if (iframeViewer) {
            iframeViewer.contentWindow.postMessage(
                {
                    type: 'search-in-iframe',
                    payload: {
                        term: keywordSearch,
                        isRegex: isRegex,
                    },
                },
                '*',
            );
        }
        return;
    }
    const historyContainer = document.getElementById('history-view-container');
    if (historyContainer && historyContainer.style.display !== 'none') {
        const _currentHistoryDateFilter = get(currentHistoryDateFilter);
        renderHistoryView(_currentHistoryDateFilter?.start, _currentHistoryDateFilter?.end);
        return;
    }

    const downloadsContainer = document.getElementById('downloads-view-container');
    if (downloadsContainer && downloadsContainer.style.display !== 'none') {
        renderDownloadsView();
        return;
    }

    const hasHiddenGroups = _hiddenGroupsContainer ? _hiddenGroupsContainer.childElementCount > 0 : 0;
    if (_hiddenGroupsContainer) _hiddenGroupsContainer.classList.toggle('hidden', !hasHiddenGroups || !!keywordSearch);

    if (get(isGeminiViewActive) && _geminiConversationView) {
        _geminiConversationView.querySelectorAll('.gemini-entry').forEach((entry) => {
            const queryEl = entry.querySelector('.entry-title');
            const contentEl = entry.querySelector('.entry-content');

            unhighlight(queryEl);
            unhighlight(contentEl);

            if (keywordSearch) {
                highlight(queryEl, keywordSearch, isRegex);
                highlight(contentEl, keywordSearch, isRegex);
            }

            const queryText = queryEl ? queryEl.textContent : '';
            const contentText = contentEl ? contentEl.textContent : '';
            const queryMatches = searchRegex
                ? searchRegex.test(queryText)
                : normalizeForSearch(queryText).includes(lowerCaseKeywordSearch);
            const contentMatches = searchRegex
                ? searchRegex.test(contentText)
                : normalizeForSearch(contentText).includes(lowerCaseKeywordSearch);
            const isVisible = !keywordSearch || queryMatches || contentMatches;
            entry.classList.toggle('hidden', !isVisible);

            if (isVisible && keywordSearch) {
                entry.open = true;
            } else if (!keywordSearch) {
                entry.open = get(viewExpandStates).gemini;
            }
        });
        updateExpandAllButtonState();
        if (keywordSearch) {
            const results = Array.from(_geminiConversationView.querySelectorAll('.search-highlight'));
            searchState.set({ results, currentIndex: -1 });
            findNextHighlight();
        }
        return;
    }

    if (get(isBookmarksViewActive)) {
        const bookmarksContainer = document.getElementById('bookmarks-list');
        unhighlight(bookmarksContainer);
        if (keywordSearch) {
            highlight(bookmarksContainer, keywordSearch, isRegex);
        }

        const allItems = bookmarksContainer.querySelectorAll('.bookmark-item, .bookmark-folder');

        allItems.forEach((item) => {
            const titleEl = item.querySelector('.bookmark-title, .folder-name');
            const titleText = titleEl ? titleEl.textContent : '';
            const matches =
                !keywordSearch ||
                (searchRegex
                    ? searchRegex.test(titleText)
                    : normalizeForSearch(titleText).includes(lowerCaseKeywordSearch));

            item.classList.toggle('hidden', !matches);
            if (matches) {
                let parent = item.parentElement.closest('.bookmark-folder');
                while (parent) {
                    parent.classList.remove('hidden');
                    parent.open = true;
                    parent = parent.parentElement.closest('.bookmark-folder');
                }
            }
        });
        updateExpandAllButtonState();
        return;
    }

    if (get(isNotesViewActive)) {
        const notesView = document.getElementById('notes-view');
        if (notesView) {
            notesView.querySelectorAll('.note-entry').forEach((entry) => {
                const titleEl = entry.querySelector('.entry-title');
                const contentEl = entry.querySelector('.entry-content');

                unhighlight(titleEl);
                unhighlight(contentEl);

                let isVisible = true;

                const _activeNoteFilters = get(activeNoteFilters);

                const tagBtn = entry.querySelector('.note-tag');
                if (_activeNoteFilters.cat && (!tagBtn || tagBtn.dataset.category !== _activeNoteFilters.cat)) {
                    isVisible = false;
                }

                const domainBtn = entry.querySelector('.entry-domain');
                if (
                    isVisible &&
                    _activeNoteFilters.context &&
                    (!domainBtn || domainBtn.dataset.context !== _activeNoteFilters.context)
                ) {
                    isVisible = false;
                }

                const typeBtn = entry.querySelector('.note-type');
                if (
                    isVisible &&
                    _activeNoteFilters.type &&
                    (!typeBtn || typeBtn.dataset.type !== _activeNoteFilters.type)
                ) {
                    isVisible = false;
                }

                if (isVisible && _activeNoteFilters.pomo === 'pomodoro') {
                    const hasPomoFilter = entry.querySelector('.note-pomo-filter:not(.hidden)');
                    if (!hasPomoFilter) isVisible = false;
                }

                if (isVisible && keywordSearch) {
                    highlight(titleEl, keywordSearch, isRegex);
                    highlight(contentEl, keywordSearch, isRegex);

                    const titleText = titleEl ? titleEl.textContent : '';
                    const contentText = contentEl ? contentEl.textContent : '';
                    const titleMatches = searchRegex
                        ? searchRegex.test(titleText)
                        : titleText.toLowerCase().includes(lowerCaseKeywordSearch);
                    const contentMatches = searchRegex
                        ? searchRegex.test(contentText)
                        : contentText.toLowerCase().includes(lowerCaseKeywordSearch);

                    if (!titleMatches && !contentMatches) {
                        isVisible = false;
                    }
                }

                entry.classList.toggle('hidden', !isVisible);

                if (isVisible && keywordSearch) {
                    entry.open = true;
                }
            });

            notesView.querySelectorAll('.filter-btn').forEach((btn) => {
                const _activeNoteFilters = get(activeNoteFilters);
                const btnType = btn.classList.contains('note-tag')
                    ? 'cat'
                    : btn.classList.contains('note-type')
                      ? 'type'
                      : btn.classList.contains('note-pomo-filter')
                        ? 'pomo'
                        : 'context';
                const btnValue = btn.dataset.category || btn.dataset.type || btn.dataset.pomo || btn.dataset.context;

                btn.classList.toggle('selected', _activeNoteFilters[btnType] === btnValue);
            });

            updateExpandAllButtonState();
            if (keywordSearch) {
                const results = Array.from(notesView.querySelectorAll('.search-highlight'));
                searchState.set({ results, currentIndex: -1 });
                findNextHighlight();
            }
        }
        return;
    }

    const _groupListContainer = document.getElementById('groups-list');
    if (!_groupListContainer) return;

    // Searching opens the cards that match and shuts the ones that do not, and a
    // <details> that is opened from code reports it exactly like a click, so those
    // passes were being written down as the user's own choice. The arrangement is put
    // aside when a search starts and handed back when it ends.
    if (keywordSearch && !preSearchExpansion) {
        preSearchExpansion = {
            groups: new Map(get(expandedGroupStates)),
            subgroups: new Map(get(expandedSubgroupStates)),
        };
    } else if (!keywordSearch && preSearchExpansion) {
        expandedGroupStates.set(new Map(preSearchExpansion.groups));
        expandedSubgroupStates.set(new Map(preSearchExpansion.subgroups));
        preSearchExpansion = null;
    }

    const _hiddenGroupIds = get(hiddenGroupIds);
    const _expandedGroupStates = get(expandedGroupStates);
    const _expandedSubgroupStates = get(expandedSubgroupStates);
    const _viewExpandStates = get(viewExpandStates);

    _groupListContainer.querySelectorAll('.group-item').forEach((groupEl) => {
        unhighlight(groupEl);
        if (keywordSearch) {
            highlight(groupEl, keywordSearch, isRegex);
        }

        const groupId = parseInt(groupEl.dataset.groupId, 10);
        const groupTitleEl = groupEl.querySelector('.group-title');
        const groupTitleText = groupTitleEl ? groupTitleEl.textContent : '';
        const groupTitleMatches =
            !!keywordSearch &&
            (searchRegex
                ? searchRegex.test(groupTitleText)
                : normalizeForSearch(groupTitleText).includes(lowerCaseKeywordSearch));
        const isNormallyHidden = _hiddenGroupIds.has(groupId);
        let hasMatchingChild = false;

        groupEl.querySelectorAll('.domain-subgroup').forEach((subgroup) => {
            const domainTitleEl = subgroup.querySelector('.domain-title');
            const domainTitleText = domainTitleEl ? domainTitleEl.textContent : '';
            const subgroupTitleMatches =
                !!keywordSearch &&
                (searchRegex
                    ? searchRegex.test(domainTitleText)
                    : normalizeForSearch(domainTitleText).includes(lowerCaseKeywordSearch));
            let hasMatchingTab = false;
            subgroup.querySelectorAll('.tab-item').forEach((tabEl) => {
                const tabTitleEl = tabEl.querySelector('.tab-title');
                const tabTitleText = tabTitleEl ? tabTitleEl.textContent : '';
                const tabMatches =
                    !!keywordSearch &&
                    (searchRegex
                        ? searchRegex.test(tabTitleText)
                        : normalizeForSearch(tabTitleText).includes(lowerCaseKeywordSearch));
                if (tabMatches) hasMatchingTab = true;
                const isTabVisible = groupTitleMatches || subgroupTitleMatches || tabMatches;
                tabEl.classList.toggle('hidden', !!keywordSearch && !isTabVisible);
            });
            const isSubgroupVisible = groupTitleMatches || subgroupTitleMatches || hasMatchingTab;
            subgroup.classList.toggle('hidden', !!keywordSearch && !isSubgroupVisible);
            if (subgroupTitleMatches || hasMatchingTab) hasMatchingChild = true;
            if (keywordSearch) {
                if (subgroupTitleMatches || hasMatchingTab) subgroup.open = true;
                else subgroup.open = false;
            } else {
                const subGroupKey = `${groupId}_${domainTitleText}`;
                const storedState = _expandedSubgroupStates.get(subGroupKey);
                subgroup.open = storedState !== undefined ? storedState : _viewExpandStates.groups;
            }
        });
        // A card without a tab list (a collapsed placeholder, a hidden group) must not
        // abort the loop: the groups after it would stay hidden with no way back.
        const tabListContainer = groupEl.querySelector('.tab-list-container');
        tabListContainer?.querySelectorAll(':scope > .tab-item').forEach((tabEl) => {
            const tabTitleEl = tabEl.querySelector('.tab-title');
            const tabTitleText = tabTitleEl ? tabTitleEl.textContent : '';
            const tabMatches =
                !!keywordSearch &&
                (searchRegex
                    ? searchRegex.test(tabTitleText)
                    : normalizeForSearch(tabTitleText).includes(lowerCaseKeywordSearch));
            if (tabMatches) hasMatchingChild = true;
            const isTabVisible = groupTitleMatches || tabMatches;
            tabEl.classList.toggle('hidden', !!keywordSearch && !isTabVisible);
        });
        const isMatch = groupTitleMatches || hasMatchingChild;
        if (keywordSearch) {
            groupEl.classList.toggle('hidden', !isMatch);
        } else {
            groupEl.classList.toggle('hidden', isNormallyHidden);
        }
        if (keywordSearch) {
            if (isMatch) groupEl.open = true;
        } else {
            const storedState = _expandedGroupStates.get(groupId);
            groupEl.open = storedState !== undefined ? storedState : _viewExpandStates.groups;
        }
    });

    updateExpandAllButtonState();
    updateScrollButtons();
    if (keywordSearch) {
        const results = Array.from(_groupListContainer.querySelectorAll('.search-highlight'));
        searchState.set({ results, currentIndex: -1 });
        findNextHighlight();
    }
}
