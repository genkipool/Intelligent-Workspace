<script>
    import {
        visibleControlsForView,
        getActiveScrollableElement,
        adjustScrollButtonsForGeminiView,
    } from '../../services/viewsService.js';
    import ScrollButtons, { updateScrollButtons } from '../../components/common/ScrollButtons.svelte';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    import ConfirmDialog from '../../components/common/ConfirmDialog.svelte';
    import HiddenGroupsBar from '../../components/listGroup/HiddenGroupsBar.svelte';
    import PomodoroPopups from '../../components/listGroup/PomodoroPopups.svelte';
    import PomodoroPanel from '../../components/listGroup/PomodoroPanel.svelte';
    import MusicPlayerPanel from '../../components/listGroup/MusicPlayerPanel.svelte';
    import PersistentConversationControls from '../../components/listGroup/PersistentConversationControls.svelte';
    import { onMount, tick } from 'svelte';
    import { groupStore, groupsStore } from '../../stores/groupStore.js';
    import { listGroupStore, listGroupState } from '../../stores/listGroupStore.js';
    import { i18nStore, t, tt } from '../../stores/i18nStore.js';
    import { initializeActiveTheme } from '../../../utils/theme.js';
    import GroupCard from '../../components/listGroup/GroupCard.svelte';
    import { initListGroup, initPomodoro } from './listGroup.js';
    import Icons from '../../components/Icons.svelte';
    import VanillaTemplates from '../../components/listGroup/VanillaTemplates.svelte';
    import HistoryView from '../../components/history/HistoryView.svelte';
    import RecentView from '../../components/recent/RecentView.svelte';
    import ReadingListView from '../../components/reading/ReadingListView.svelte';
    import DownloadsView from '../../components/downloads/DownloadsView.svelte';
    import { downloadsStatusFilter, downloadStats, downloadsStore } from '../../stores/downloadsStore.js';

    import BookmarksView from '../../components/bookmarks/BookmarksView.svelte';
    import NotesView from '../../components/notes/NotesView.svelte';
    import ScreenshotGalleryView from '../../components/screenshots/ScreenshotGalleryView.svelte';

    import ModalHost from '../../components/listGroup/ModalHost.svelte';
    import ListGroupToolbar from './components/ListGroupToolbar.svelte';
    import { overlayViewOpening } from '../../stores/appStore.svelte.js';
    import {
        showApiKeyModal,
        showSaveConversationModal,
        showGeminiScheduleModal,
        openModal,
    } from '../../stores/modalStore.js';
    import { geminiStore, conversationHistory, CONVERSATION_SPEECH_ID } from '../../stores/geminiStore.js';
    import {
        renderContext,
        renderContextReady,
        loadRenderContext,
        initRenderContextListeners,
    } from '../../stores/renderContextStore.js';
    import GeminiPanel from '../../components/gemini/GeminiPanel.svelte';
    import ImportPanel from '../../components/common/ImportPanel.svelte';
    import { handleDownloadConversation, markdownToHtml, markdownToPlainText } from '../../services/geminiService.js';
    import { copyRichTextToClipboard } from '../../services/utils.js';
    import { showNotification } from '../../../utils/i18n.js';

    // The page can be opened straight into a view, and the URL says which one before
    // any storage is read. Without this the title rendered as the group list and the
    // boot corrected it a few frames later, which read as the header flashing.
    const VIEW_TITLE_KEYS = {
        groups: 'listTabGroups',
        bookmarks: 'bookmarksViewTitle',
        history: 'historyViewTitle',
        recent: 'recentlyClosedViewTitle',
        reading: 'readingListViewTitle',
        downloads: 'downloadsViewTitle',
        gemini: 'geminiViewTitle',
        notes: 'notesViewTitle',
        gallery: 'screenshotGalleryTitle',
    };
    /**
     * The views painted *over* the group list rather than replacing it. They still get
     * their own header, their own controls and their own initial layout — everything
     * the assistant has always had — which is what stops the page showing the group
     * list's chrome for a moment on the way in.
     */
    const OVERLAY_VIEWS = new Set(['notes', 'gallery', 'gemini']);
    const requestedView = new URLSearchParams(window.location.search).get('view');
    const initialTitleKey = VIEW_TITLE_KEYS[requestedView] || 'listTabGroups';

    // The markup used to start laid out for the group list whatever the URL asked for,
    // so opening another view showed the group shell for a few frames before the boot
    // swapped it. The initial layout now comes from the same per-view configuration
    // the boot itself uses, so there is nothing to swap.
    const initialView = VIEW_TITLE_KEYS[requestedView] ? requestedView : 'groups';
    /**
     * Whether the group list is on screen at the first paint.
     *
     * An overlay view keeps the group *controls* — that is what `initialView` decides —
     * but not the groups themselves showing underneath while it loads. Opening the
     * notes or the gallery from the popup used to paint the whole group list and cover
     * it a few frames later, which read as the panel flashing. The assistant never did,
     * because it is a view of its own and `initialView` already hid the list for it.
     */
    const groupsVisibleAtBoot = initialView === 'groups';

    /**
     * Claim the header before the first paint.
     *
     * `currentMainView` starts as 'groups', so the toolbar's own title would read
     * "Listar Grupos" from the very first frame however the page was opened — the boot
     * only gets to say otherwise a hundred milliseconds later, and that gap is the
     * flash. The views painted over the group list say so here instead, and
     * `openOverlayView` clears it once the view's own flag is up.
     */
    if (OVERLAY_VIEWS.has(requestedView)) overlayViewOpening.set(requestedView);
    const initiallyVisible = visibleControlsForView(initialView);
    const wantsAssistantView = initialView === 'gemini';

    /**
     * Controls whose visibility is decided by data rather than by the view: how many
     * duplicate tabs there are, whether anything is playing audio, whether the gallery
     * has anything to download. They start hidden and the routine that knows the answer
     * reveals them — showing one and taking it straight back is the flash this whole
     * arrangement exists to avoid.
     */
    const DATA_DRIVEN_CONTROLS = ['remove-duplicates-btn', 'mute-all-tabs-btn', 'download-all-screenshots-btn'];

    /**
     * Whether a control is hidden at the very first paint.
     *
     * One table and two exceptions. The table is `viewConfig`, the same one
     * `updateHeaderButtonsVisibility` settles the toolbar with a few frames later, so
     * the first frame and the settled one agree — which is the whole trick. The
     * assistant used to have its list written out here instead, which is why it was the
     * only view that did not flash; now every view has one.
     */
    function startsHidden(id) {
        // Not a question about the view: how many duplicates there are, whether
        // anything is playing, whether there are screenshots to download. Hidden until
        // the answer arrives.
        if (DATA_DRIVEN_CONTROLS.includes(id)) return true;
        // The way back to the groups, pointless only when you are already on them.
        if (id === 'list-groups-btn') return initialView === 'groups';
        return !initiallyVisible.has(id);
    }

    let hiddenGroupIds = $derived($listGroupState.hiddenGroupIds ?? new Set());
    let visibleGroups = $derived(($groupsStore ?? []).filter((g) => g?.group && !hiddenGroupIds.has(g.group.id)));

    $effect(() => {
        visibleGroups;
        tick().then(updateScrollButtons);
    });

    onMount(async () => {
        initNumberSpinnerArrows();
        const errors = [];
        const catchErrors = async (name, fn) => {
            try {
                await fn();
            } catch (e) {
                errors.push(name + ': ' + (e.message || e));
                console.error(`[ListGroup] ${name} failed:`, e);
            }
        };
        // Everything starts at once, but only the inits the header chrome depends on
        // hold up initListGroup — it is what puts the page on screen. The rest feed
        // the group list, which renders behind the shell, so making the page wait for
        // them just delayed the first paint.
        // The palette is already on screen from the localStorage mirror, and the
        // assistant store is only needed when the assistant is the requested view.
        const themeMirrored = document.documentElement.hasAttribute('data-theme');
        const wantsAssistant = requestedView === 'gemini';

        const blocking = [
            catchErrors('i18nStore.init', () => i18nStore.init()),
            catchErrors('listGroupStore.init', () => listGroupStore.init()),
            // The group cards strip their stored prefix from the title, so rendering
            // before this lands shows one name and then the other.
            catchErrors('loadRenderContext', () => loadRenderContext()),
        ];
        const background = [
            catchErrors('groupStore.init', () => groupStore.init()),
            catchErrors('initPomodoro', () => initPomodoro()),
        ];
        const theme = catchErrors('initializeActiveTheme', () => initializeActiveTheme());
        const gemini = catchErrors('geminiStore.init', () => geminiStore.init());
        (themeMirrored ? background : blocking).push(theme);
        (wantsAssistant ? blocking : background).push(gemini);

        const deferred = Promise.all(background);
        await Promise.all(blocking);
        await catchErrors('initListGroup', () => initListGroup());
        await deferred;
        initRenderContextListeners();
        // Final refresh: the background groups tabs ~300 ms after they are created and
        // may emit refreshUI before the listener is registered, so render once more
        // with the grouping already settled.
        const { renderGroups } = await import('../../services/groupsService.js');
        await catchErrors('renderGroups', () => renderGroups());

        // Ensure we smoothly scroll to the currently active tab once loaded
        setTimeout(() => {
            const activeTabEl = document.querySelector('.tab-item.active');
            if (activeTabEl) {
                activeTabEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 250);

        if (errors.length > 0) {
            const div = document.createElement('div');
            div.style.cssText =
                'position:fixed;bottom:0;left:0;right:0;background:#c00;color:#fff;padding:8px;font:12px monospace;z-index:99999;white-space:pre-wrap;';
            div.textContent = errors.join('\n');
            document.body.appendChild(div);
        }

        // (modal callbacks are imported/inlined directly in template handlers)

        // The header button opens the assistant. The one inside the search bar does not:
        // a plain click switches the search into Gemini mode (handled by searchService),
        // and only Ctrl+click or a long press opens the assistant — swallowing its click
        // meant the search mode could never be turned on.
        try {
            const openAssistant = document.getElementById('open-gemini-view-btn');
            if (openAssistant) {
                openAssistant.addEventListener(
                    'click',
                    (e) => {
                        e.stopImmediatePropagation();
                        geminiStore.toggleView();
                    },
                    true,
                );
            }

            const searchToggle = document.getElementById('gemini-toggle-btn');
            if (searchToggle) {
                let longPressTimer = null;
                let wasLongPress = false;

                searchToggle.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    wasLongPress = false;
                    longPressTimer = setTimeout(() => {
                        wasLongPress = true;
                        geminiStore.toggleView();
                    }, 500);
                });
                searchToggle.addEventListener('mouseup', () => clearTimeout(longPressTimer));
                searchToggle.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
                searchToggle.addEventListener(
                    'click',
                    (e) => {
                        if (wasLongPress) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            wasLongPress = false;
                            return;
                        }
                        if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            geminiStore.toggleView();
                        }
                        // A plain click falls through to searchService's own handler.
                    },
                    true,
                );
            }
        } catch (e) {
            console.error('[ListGroup] could not wire the Gemini buttons:', e);
        }
    });

    let historyLen = $derived($conversationHistory?.length || 0);

    /** Copies the whole conversation as plain text. The button had no handler at all. */
    /**
     * Copies the whole conversation the way the original did: the title in capitals,
     * then every question in bold followed by its answer. The old version wrote "Q1:"
     * in front of each question and threw the formatting away.
     */
    async function handleCopyConversation() {
        const entries = $conversationHistory || [];
        if (entries.length === 0) {
            showNotification('errorEmptyConversation', true);
            return;
        }

        const title = (currentConversationTitle || $t('geminiConversationDefaultTitle') || 'Gemini Conversation')
            .replace(/<[^>]*>/g, '')
            .toUpperCase();

        const htmlBody = entries
            .map((entry) => {
                const question = (entry.query || '').replace(/</g, '&lt;');
                const answer = markdownToHtml(entry.data?.answer || '…');
                return `<strong style="color:black;">${question}</strong><br>${answer}`;
            })
            .join('<br>');

        const plainBody = entries
            .map((entry) => `${entry.query || ''}\n${markdownToPlainText(entry.data?.answer || '…').trim()}`)
            .join('\n\n');

        const html =
            `<div style="font-size: 1.5em; font-weight: bold; text-transform: uppercase; margin-bottom: 0;">` +
            `${title}</div><br><br>${htmlBody}`;
        const ok = await copyRichTextToClipboard(html, `${title}\n\n\n${plainBody}`);
        showNotification(ok ? 'geminiHistoryCopied' : 'errorCopying', !ok);
    }

    /** Reads the conversation aloud, entry by entry. Also had no handler. */
    function handleReadWholeConversation(e) {
        const entries = $conversationHistory || [];
        if (entries.length === 0) {
            showNotification('errorEmptyConversation', true);
            return;
        }
        geminiStore.readConversationAloud(entries, e.ctrlKey || e.metaKey);
    }

    /**
     * Name of the conversation on screen.
     *
     * A conversation only earns a name once its first query has been answered, so
     * until then the button keeps saying "select a conversation" — and the moment the
     * name exists it appears here, because it is read from the store.
     */
    let currentConversationTitle = $derived.by(() => {
        const conversations = $geminiStore.combinedConversations || [];
        const current = conversations[$geminiStore.currentCombinedIndex];
        return current?.title || '';
    });

    // Play / pause / resume / stop icons for the whole-conversation reader, driven by
    // the store instead of by hand-written inline styles.
    let isReadingConversation = $derived(
        $geminiStore.isGlobalPlaybackActive && $geminiStore.currentlySpeakingEntryId === CONVERSATION_SPEECH_ID,
    );
    let isConversationPaused = $derived(isReadingConversation && $geminiStore.isSpeechPaused);

    async function handleNewGeminiConversation() {
        await geminiStore.newConversation();
    }

    function handleSaveGeminiConversation() {
        if (historyLen === 0) {
            showNotification('errorEmptyConversation', true);
            return;
        }
        openModal(showSaveConversationModal);
    }

    async function handleScheduleGemini() {
        const data = await chrome.storage.local.get(['geminiApiKeysList', 'geminiApiKey']);
        if ((data.geminiApiKeysList?.length || 0) === 0 && !data.geminiApiKey) {
            openModal(showApiKeyModal);
            return;
        }
        const schedules = (await chrome.storage.local.get('geminiSchedules'))['geminiSchedules'] || [];
        openModal(showGeminiScheduleModal, { schedules });
    }
</script>

<Icons />
<PomodoroPopups />

<div class="container" class:gemini-view-active={wantsAssistantView}>
    <div class="sticky-header">
        <ListGroupToolbar
            {initialTitleKey}
            {startsHidden}
            {handleNewGeminiConversation}
            {handleSaveGeminiConversation}
            {handleScheduleGemini}
            {isReadingConversation}
            {isConversationPaused}
            {handleReadWholeConversation}
            {handleDownloadConversation}
            {handleCopyConversation}
        />
        <section id="view-toggle-panel" class="hidden-context-container hidden">
            <button
                type="button"
                id="view-groups-btn"
                class="control-btn active"
                title={$tt('listTabGroups')}
                aria-pressed="true"
                class:hidden={startsHidden('view-groups-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-circle"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-bookmarks-view-btn"
                class="control-btn"
                title={$tt('toggleBookmarksViewTooltip')}
                aria-pressed="false"
                class:hidden={startsHidden('toggle-bookmarks-view-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-bookmark"></use>
                </svg>
            </button>
            <button
                type="button"
                id="view-history-btn"
                class="control-btn"
                title={$tt('viewHistory')}
                aria-pressed="false"
                class:hidden={startsHidden('view-history-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-history"></use>
                </svg>
            </button>

            <!-- Recently Closed Button -->
            <button
                type="button"
                id="view-recent-btn"
                class="control-btn"
                title={$tt('viewRecentlyClosed')}
                aria-pressed="false"
                class:hidden={startsHidden('view-recent-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-recent"></use>
                </svg>
            </button>

            <!-- Reading List Button -->
            <button
                type="button"
                id="view-reading-list-btn"
                class="control-btn"
                title={$tt('viewReadingList')}
                aria-pressed="false"
                class:hidden={startsHidden('view-reading-list-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-reading-list"></use>
                </svg>
            </button>

            <!-- Downloads Button -->
            <button
                type="button"
                id="view-downloads-btn"
                class="control-btn"
                title={$tt('viewDownloads')}
                aria-pressed="false"
                class:hidden={startsHidden('view-downloads-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-download"></use>
                </svg>
            </button>
            <button
                type="button"
                id="backup-all-btn"
                class="control-btn"
                title={$tt('backupAllGroupsTooltip')}
                class:hidden={startsHidden('backup-all-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-backup"></use>
                </svg>
            </button>
            <button
                type="button"
                id="restore-all-btn"
                class="control-btn"
                title={$tt('restoreAllGroupsTooltip')}
                class:hidden={startsHidden('restore-all-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-restore"></use>
                </svg>
            </button>
            <button
                type="button"
                id="export-bookmarks-btn"
                class="control-btn"
                title={$tt('exportBookmarksTooltip')}
                class:hidden={startsHidden('export-bookmarks-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-export"></use>
                </svg>
            </button>
            <button
                type="button"
                id="import-bookmarks-btn"
                class="control-btn"
                title={$tt('importBookmarksTooltip')}
                class:hidden={startsHidden('import-bookmarks-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-import"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-visibility-controls-btn"
                class="control-btn"
                title={$tt('toggleVisibilityControls')}
                class:hidden={startsHidden('toggle-visibility-controls-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-eye"></use>
                </svg>
            </button>
            <div class="history-filter-wrapper" style="position: relative;">
                <button
                    type="button"
                    id="history-date-filter-btn"
                    class="control-btn"
                    title={$tt('filterByDate')}
                    class:hidden={startsHidden('history-date-filter-btn')}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-calendar"></use>
                    </svg>
                </button>
                <!-- NEW: Custom calendar container -->
                <div id="custom-calendar-popup" class="custom-calendar hidden">
                    <div class="calendar-header">
                        <button type="button" id="cal-prev-btn">&lt;</button>
                        <span id="cal-month-year"></span>
                        <button type="button" id="cal-next-btn">&gt;</button>
                    </div>
                    <div class="calendar-weekdays">
                        <span>{$t('daySunInitial') || 'S'}</span>
                        <span>{$t('dayMonInitial') || 'M'}</span>
                        <span>{$t('dayTueInitial') || 'T'}</span>
                        <span>{$t('dayWedInitial') || 'W'}</span>
                        <span>{$t('dayThuInitial') || 'T'}</span>
                        <span>{$t('dayFriInitial') || 'F'}</span>
                        <span>{$t('daySatInitial') || 'S'}</span>
                    </div>
                    <div id="calendar-days-grid" class="calendar-grid"></div>
                    <div class="calendar-footer">
                        <button type="button" id="cal-clear-btn">{$t('reset') || 'Reset'}</button>
                    </div>
                </div>
            </div>

            <!-- Downloads Filter Wrapper with hover popup -->
            <div class="downloads-filter-wrapper" style="position: relative;">
                <button
                    type="button"
                    id="downloads-filter-btn"
                    class="control-btn"
                    title={$tt('filterDownloads') || 'Filtrar descargas'}
                    class:hidden={startsHidden('downloads-filter-btn')}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-filter"></use>
                    </svg>
                </button>
                <!-- Downloads Filter Hover Popup -->
                <div id="custom-downloads-filter-popup" class="custom-downloads-filter-popup">
                    <button
                        type="button"
                        class="filter-popup-option"
                        class:active={$downloadsStatusFilter === 'all'}
                        onclick={() => downloadsStatusFilter.set('all')}
                    >
                        <span class="filter-option-label">{$t('downloadFilterAll') || 'Todas'}</span>
                        <span class="chip-count">{$downloadStats.total}</span>
                    </button>
                    {#if $downloadStats.inProgress > 0}
                        <button
                            type="button"
                            class="filter-popup-option chip-in-progress"
                            class:active={$downloadsStatusFilter === 'in_progress'}
                            onclick={() => downloadsStatusFilter.set('in_progress')}
                        >
                            <span class="pulse-dot"></span>
                            <span class="filter-option-label">{$t('downloadStatusInProgress') || 'En progreso'}</span>
                            <span class="chip-count">{$downloadStats.inProgress}</span>
                        </button>
                    {/if}
                    <button
                        type="button"
                        class="filter-popup-option"
                        class:active={$downloadsStatusFilter === 'complete'}
                        onclick={() => downloadsStatusFilter.set('complete')}
                    >
                        <span class="filter-option-label">{$t('downloadFilterComplete') || 'Completadas'}</span>
                        <span class="chip-count">{$downloadStats.complete}</span>
                    </button>
                    <button
                        type="button"
                        class="filter-popup-option chip-failed"
                        class:active={$downloadsStatusFilter === 'interrupted'}
                        onclick={() => downloadsStatusFilter.set('interrupted')}
                    >
                        <span class="filter-option-label"
                            >{$t('downloadFilterPausedFailed') || 'Pausadas / Errores'}</span
                        >
                        <span class="chip-count">{$downloadStats.interrupted + $downloadStats.paused}</span>
                    </button>
                </div>
            </div>

            <!-- Open Downloads Folder Button -->
            <button
                type="button"
                id="open-downloads-folder-btn"
                class="control-btn"
                title={$tt('openDownloadsFolder')}
                class:hidden={startsHidden('open-downloads-folder-btn')}
                onclick={() => downloadsStore.openDownloadsFolder()}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-folder-open"></use>
                </svg>
            </button>

            <button
                type="button"
                id="toggle-bookmarks-sort-panel-btn"
                class="control-btn"
                title={$tt('toggleSortOptionsTooltip')}
                class:hidden={startsHidden('toggle-bookmarks-sort-panel-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-filter"></use>
                </svg>
            </button>
            <button
                type="button"
                id="delete-all-bookmarks-btn"
                class="control-btn"
                title={$tt('deleteAllBookmarksTooltip')}
                class:hidden={startsHidden('delete-all-bookmarks-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-trash"></use>
                </svg>
            </button>
            <button
                type="button"
                id="regroup-btn"
                class="control-btn"
                title={$tt('regroupBtnTooltip')}
                aria-label={$t('regroupBtnTooltip')}
                class:hidden={startsHidden('regroup-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-regroup"></use>
                </svg>
            </button>
        </section>

        <PomodoroPanel />

        <MusicPlayerPanel />

        <section id="visibility-controls-panel" class="hidden">
            <button
                type="button"
                id="sort-by-name-btn"
                class="control-btn sort-option-btn hidden"
                data-sort-by="title"
                title={$tt('sortByNameTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-sort-name"></use>
                </svg>
            </button>
            <button
                type="button"
                id="sort-by-date-btn"
                class="control-btn sort-option-btn hidden"
                data-sort-by="dateAdded"
                title={$tt('sortByDateTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-sort-date"></use>
                </svg>
            </button>
            <button
                type="button"
                id="sort-by-count-btn"
                class="control-btn sort-option-btn hidden"
                data-sort-by="count"
                title={$tt('sortByCountTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-sort-count"></use>
                </svg>
            </button>
            <button
                type="button"
                id="sort-by-access-btn"
                class="control-btn sort-option-btn hidden"
                data-sort-by="lastAccessed"
                title={$tt('sortByLastAccessTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-sort-access"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-group-actions-btn"
                class="control-btn"
                title={$tt('toggleGroupActionsTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-domain-headers-btn"
                class="control-btn"
                title={$tt('toggleSubgroupsTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-tree"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-subgroup-actions-btn"
                class="control-btn"
                title={$tt('toggleSubgroupActionsTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box-nested-1"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-tab-actions-btn"
                class="control-btn"
                title={$tt('toggleTabActionsTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box-nested-2"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-folder-actions-btn"
                class="control-btn"
                title={$tt('toggleFolderActionsTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-folder-closed"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-child-folders-btn"
                class="control-btn"
                title={$tt('toggleChildFoldersTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-child-folders"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-child-folder-actions-btn"
                class="control-btn"
                title={$tt('toggleChildFolderActionsTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box-nested-1"></use>
                </svg>
            </button>
            <button
                type="button"
                id="toggle-bookmark-actions-btn"
                class="control-btn"
                title={$tt('toggleBookmarkActionsTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box-nested-2"></use>
                </svg>
            </button>
            <button
                type="button"
                id="delete-mode-all-btn"
                class="control-btn delete-option-btn hidden"
                title={$tt('deleteAllBookmarksTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-trash"></use>
                </svg>
            </button>
            <button
                type="button"
                id="delete-mode-old-btn"
                class="control-btn delete-option-btn hidden"
                title={$tt('deleteOldBookmarksTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-trash-old"></use>
                </svg>
            </button>
            <button
                type="button"
                id="delete-mode-broken-btn"
                class="control-btn delete-option-btn hidden"
                title={$tt('deleteBrokenBookmarksTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-trash-broken"></use>
                </svg>
            </button>
        </section>
        <HiddenGroupsBar />
        <PersistentConversationControls {currentConversationTitle} />
    </div>

    <section id="groups-list" class="groups-list" tabindex="-1" style:display={groupsVisibleAtBoot ? null : 'none'}>
        <!-- Waits for the render context: a card rendered without it shows the group's
             full name and then swaps to the prefix-stripped one. -->
        {#if $renderContextReady}
            {#each visibleGroups as g, i (g.group.id ?? `g-${i}`)}
                <GroupCard
                    group={g.group}
                    tabs={g.tabs}
                    liveTabs={g.liveTabs ?? []}
                    backupRows={g.rows ?? []}
                    isPinned={$listGroupState.pinnedGroupIds?.has(g.group.id)}
                    isBackup={g.isBackup ?? false}
                    renderContext={$renderContext}
                />
            {/each}
        {/if}
        <a
            href="#about"
            id="about-link-list-group"
            class="footer-link"
            onclick={(e) => {
                e.preventDefault();
                chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/about/about.html') });
            }}
        >
            <footer class="footer">
                <div>Intelligent Workspace v1.0.0</div>
                <div class="color-dots">
                    {#each ['#5F6368', '#1A73E8', '#D93025', '#F9AB00', '#188038', '#D01884', '#A142F4', '#007B83', '#FA903E'] as color (color)}
                        <div class="color-dot" style="background-color: {color};"></div>
                    {/each}
                </div>
                <div>{$t('developedBy')}</div>
            </footer>
        </a>
    </section>

    <!-- Every view stays mounted; the containers
     existen en el DOM con display:none y los servicios los muestran/ocultan.
     Montarlas condicionalmente rompe las consultas DOM síncronas de los servicios. -->
    <BookmarksView />
    <GeminiPanel />
    <HistoryView />
    <RecentView />
    <ReadingListView />
    <DownloadsView />
    <NotesView />
    <ScreenshotGalleryView />

    <div id="drag-announcer" aria-live="assertive" class="visually-hidden"></div>
    <!-- Every view scrolls in its own container, so which one is asked each time. -->
    <ScrollButtons
        target={getActiveScrollableElement}
        minScroll={10}
        edge={5}
        onupdate={adjustScrollButtonsForGeminiView}
    />
</div>
<dialog id="import-bookmarks-popup" class="import-modal" closedby="any">
    <div class="modal-content-import">
        <h2 class="title-modal">{$t('importBookmarksTitle')}</h2>
        <p>{$t('importMark')}</p>
        <form class="import-buttons" method="dialog">
            <button class="import-button" id="add-bookmarks-btn" type="button" value="add">{$t('add')}</button>
            <button class="import-button" id="overwrite-bookmarks-btn" type="button" value="overwrite"
                >{$t('overwrite')}</button
            >
            <button class="import-button" id="cancel-import-bookmarks-btn" type="button" value="cancel"
                >{$t('cancel')}</button
            >
        </form>
    </div>
</dialog>

<!-- Shown and hidden by bookmarksService through the element id. -->
<ImportPanel
    alwaysMounted={true}
    sectionId="bookmark-drag-drop-panel"
    titleKey="importBookmarksTitle"
    titleClass="title-import-rules"
    dropTextKey="dragDropBookmarks"
    selectFileKey="selectBookmarksFile"
    fileInputId="bookmark-file-input"
    backButtonId="back-from-bookmark-import-btn"
    cancelButtonId="cancel-bookmark-import-drop-btn"
    cancelTitleKey="cancelBookmarksImport"
/>

<ModalHost />

<VanillaTemplates />

<ConfirmDialog />
