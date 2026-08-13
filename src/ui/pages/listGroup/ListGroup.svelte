<script>
    import { hiddenControlsForView } from '../../services/viewsService.js';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    import ConfirmDialog from '../../components/common/ConfirmDialog.svelte';
    import DeleteBadge from '../../components/common/DeleteBadge.svelte';
    import CountBadge from '../../components/common/CountBadge.svelte';
    import { onMount } from 'svelte';
    import { copyText } from '../../../utils/copyText.js';
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

    import BookmarksView from '../../components/bookmarks/BookmarksView.svelte';
    import NotesView from '../../components/notes/NotesView.svelte';
    import ScreenshotGalleryView from '../../components/screenshots/ScreenshotGalleryView.svelte';

    import ApiKeyModal from '../../components/listGroup/ApiKeyModal.svelte';
    import NoteModal from '../../components/listGroup/NoteModal.svelte';
    import CookieEditorModal from '../../components/listGroup/CookieEditorModal.svelte';
    import GeminiScheduleModal from '../../components/listGroup/GeminiScheduleModal.svelte';
    import QrCodeModal from '../../components/listGroup/QrCodeModal.svelte';
    import AddToRuleModal from '../../components/listGroup/AddToRuleModal.svelte';
    import SaveConversationModal from '../../components/listGroup/SaveConversationModal.svelte';
    import ViewConversationsModal from '../../components/listGroup/ViewConversationsModal.svelte';
    import SpecialDeleteModal from '../../components/listGroup/SpecialDeleteModal.svelte';
    import DeleteAllBookmarksConfirmModal from '../../components/listGroup/DeleteAllBookmarksConfirmModal.svelte';
    import AddToBookmarkModal from '../../components/listGroup/AddToBookmarkModal.svelte';
    import DeleteHistoryConfirmModal from '../../components/listGroup/DeleteHistoryConfirmModal.svelte';
    import {
        showApiKeyModal,
        showNoteModal,
        showCookieEditorModal,
        showGeminiScheduleModal,
        showQrCodeModal,
        showAddToRuleModal,
        showSaveConversationModal,
        showViewConversationsModal,
        showSpecialDeleteModal,
        showDeleteAllBookmarksConfirmModal,
        showAddToBookmarkModal,
        showDeleteHistoryConfirmModal,
        modalData,
        openModal,
        closeModal,
    } from '../../stores/modalStore.js';
    import { handleSaveNote } from '../../services/notesService.js';
    import { saveCookieChanges } from '../../services/groupsService.js';
    import {
        saveAddToRule,
        deleteAllSpecialItems,
        deleteSpecialItem,
        resetSpecialScan,
    } from '../../services/bookmarksService.js';
    import { geminiStore, conversationHistory, CONVERSATION_SPEECH_ID } from '../../stores/geminiStore.js';
    import {
        renderContext,
        renderContextReady,
        loadRenderContext,
        initRenderContextListeners,
    } from '../../stores/renderContextStore.js';
    import GeminiPanel from '../../components/gemini/GeminiPanel.svelte';
    import ImportPanel from '../../components/common/ImportPanel.svelte';
    import { currentMainView, isGeminiViewActive } from '../../stores/appStore.svelte.js';
    import { isCtrlHeld } from '../../stores/modifierKeysStore.js';
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
        gemini: 'geminiViewTitle',
    };
    const initialTitleKey = VIEW_TITLE_KEYS[new URLSearchParams(window.location.search).get('view')] || 'listTabGroups';

    // The markup used to start laid out for the group list whatever the URL asked for,
    // so opening another view showed the group shell for a few frames before the boot
    // swapped it. The initial layout now comes from the same per-view configuration
    // the boot itself uses, so there is nothing to swap.
    const initialView = VIEW_TITLE_KEYS[new URLSearchParams(window.location.search).get('view')]
        ? new URLSearchParams(window.location.search).get('view')
        : 'groups';
    const initiallyHidden = hiddenControlsForView(initialView);
    const wantsAssistantView = initialView === 'gemini';

    // Controls that only ever apply to the assistant, which is not one of the main
    // views and so does not appear in the per-view configuration.
    const ASSISTANT_CONTROLS = ['add-api-key-btn', 'schedule-gemini-btn'];
    // Whether these two apply is decided by the tabs — the duplicate count and whether
    // anything is playing audio — so they start hidden and the routine that knows the
    // answer reveals them.
    const DATA_DRIVEN_CONTROLS = ['remove-duplicates-btn', 'mute-all-tabs-btn'];

    function startsHidden(id) {
        if (DATA_DRIVEN_CONTROLS.includes(id)) return true;
        if (wantsAssistantView) {
            return ![
                'search-toggle-btn',
                'expand-all-btn',
                'list-groups-btn',
                'pin-toggle',
                ...ASSISTANT_CONTROLS,
            ].includes(id);
        }
        if (ASSISTANT_CONTROLS.includes(id)) return true;
        if (id === 'list-groups-btn') return initialView === 'groups';
        return initiallyHidden.has(id);
    }

    let hiddenGroupIds = $derived($listGroupState.hiddenGroupIds ?? new Set());
    let visibleGroups = $derived(
        ($groupsStore ?? []).filter((g) => g?.group && !hiddenGroupIds.has(g.group.id)),
    );
    let hiddenGroups = $derived(
        ($groupsStore ?? []).filter((g) => g?.group && hiddenGroupIds.has(g.group.id)),
    );

    async function handleDeleteHiddenGroup(e, group, tabs) {
        e.stopPropagation();
        if (!group) return;
        if (tabs && tabs.length > 0) {
            await listGroupStore.actions.deleteAllTabsInGroup(group.id, tabs);
        }
        await listGroupStore.actions.unhideGroup(group.id);
    }

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
        const wantsAssistant = new URLSearchParams(window.location.search).get('view') === 'gemini';

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

    function handleCyclePrevious() {
        geminiStore.cycleConversation('previous');
    }

    function handleCycleNext() {
        geminiStore.cycleConversation('next');
    }

    function handleViewConversations() {
        const combined = geminiStore.getCombinedConversations();
        openModal(showViewConversationsModal, { conversations: combined });
    }
</script>

<Icons />

<!-- POMODORO TIME: CALENDAR POPUP -->
<div id="pomo-custom-calendar-popup" class="pomo-custom-calendar hidden">
    <div class="pomo-cal-header">
        <button id="pomo-cal-prev-btn" type="button">&lt;</button>
        <span id="pomo-cal-month-year"></span>
        <button id="pomo-cal-next-btn" type="button">&gt;</button>
    </div>
    <div class="pomo-cal-weekdays">
        <span>{$t('daySunInitial') || 'S'}</span><span>{$t('dayMonInitial') || 'M'}</span>
        <span>{$t('dayTueInitial') || 'T'}</span><span>{$t('dayWedInitial') || 'W'}</span>
        <span>{$t('dayThuInitial') || 'T'}</span><span>{$t('dayFriInitial') || 'F'}</span>
        <span>{$t('daySatInitial') || 'S'}</span>
    </div>
    <div id="pomo-calendar-days-grid" class="pomo-cal-grid"></div>
    <div class="pomo-cal-footer">
        <button id="pomo-cal-clear-btn" type="button">{$t('reset') || 'Today'}</button>
    </div>
</div>

<!-- POMODORO TIME: TIME POPUP -->
<div id="pomo-custom-time-popup" class="custom-time-picker hidden">
    <div class="time-picker-main-row">
        <div class="time-arrows">
            <button class="time-arrow-btn" data-unit="hour" data-dir="up" type="button">▲</button>
            <button class="time-arrow-btn" data-unit="hour" data-dir="down" type="button">▼</button>
        </div>
        <div class="time-input-container">
            <input type="text" id="pomo-input-hour" maxlength="2" inputmode="numeric" placeholder="00" />
            <span>:</span>
            <input type="text" id="pomo-input-minute" maxlength="2" inputmode="numeric" placeholder="00" />
        </div>
        <div class="time-arrows">
            <button class="time-arrow-btn" data-unit="minute" data-dir="up" type="button">▲</button>
            <button class="time-arrow-btn" data-unit="minute" data-dir="down" type="button">▼</button>
        </div>
    </div>
    <div class="time-picker-label">{$t('format24h') || '24h'}</div>
</div>

<div class="container" class:gemini-view-active={wantsAssistantView}>
    <div class="sticky-header">
        <header class="header">
            <h1 id="main-header-title">{$t(initialTitleKey)}</h1>
            <div class="header-actions">
                <button
                    id="pin-toggle"
                    class="pin-button header-action-btn"
                    type="button"
                    aria-pressed="false"
                    title={$tt('pinListPage')}
                    class:hidden={startsHidden('pin-toggle')}
                >
                    <svg width="20" height="20" aria-hidden="true" focusable="false">
                        <use href="#icon-pin"></use>
                    </svg>
                </button>
                <button
                    id="rules-toggle"
                    class="header-action-btn"
                    title={$tt('openRulesPage')}
                    aria-label={$t('openRulesPage')}
                >
                    <svg width="20" height="20" aria-hidden="true" focusable="false">
                        <use href="#icon-rules"></use>
                    </svg>
                </button>
                <button
                    id="list-groups-btn"
                    class="header-action-btn"
                    class:hidden={startsHidden('list-groups-btn')}
                    type="button"
                    title={$tt('listTabGroups')}
                >
                    <svg width="20" height="20" aria-hidden="true" focusable="false">
                        <use href="#icon-tab-groups"></use>
                    </svg>
                </button>
                <button
                    id="home-btn"
                    class="home-button header-action-btn"
                    type="button"
                    aria-label={$t('backToHome')}
                    title={$tt('backToHome')}
                >
                    <svg width="20" height="20" aria-hidden="true" focusable="false">
                        <use href="#icon-home"></use>
                    </svg>
                </button>
                <button
                    id="main-back-btn"
                    class="back-button header-action-btn"
                    type="button"
                    aria-label={$t('backToMainPopup')}
                    title={$tt('backButton')}
                >
                    <svg width="20" height="20" aria-hidden="true" focusable="false">
                        <use href="#icon-back"></use>
                    </svg>
                </button>
            </div>
        </header>
        <div class="search-and-controls">
            <div class="search-container">
                <label for="search-input" class="visually-hidden">{$t('searchGroupPlaceholder')}</label>
                <input
                    type="search"
                    id="search-input"
                    class="search-input"
                    autocomplete="off"
                    spellcheck="false"
                    translate="no"
                    title={$tt('searchBarHelpTooltip')}
                />
                <button id="gemini-toggle-btn" aria-pressed="true" title={$tt('enableGeminiSearch')}>
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-gemini"></use>
                    </svg>
                </button>
                <button id="web-search-toggle-btn" aria-pressed="false" title={$tt('enableWebSearch')}>
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-web-search"></use>
                    </svg>
                </button>
                <button id="regex-toggle-btn" aria-pressed="false" title={$tt('enableRegexSearch')}>
                    <svg width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-regex"></use>
                    </svg>
                </button>
            </div>
            <div class="controls-container">
                <button
                    id="search-toggle-btn"
                    class="control-btn"
                    title={$tt('toggleSearch')}
                    class:hidden={startsHidden('search-toggle-btn')}
                >
                    <svg width="24" height="24" transform="scale(-1 1)" aria-hidden="true" focusable="false">
                        <use href="#icon-search-global"></use>
                    </svg>
                </button>
                <button
                    id="new-gemini-conversation-btn"
                    class="control-btn hidden"
                    title={$tt('newGeminiConversation')}
                    onclick={handleNewGeminiConversation}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-new-chat"></use>
                    </svg>
                </button>
                <button
                    id="save-gemini-conversation-btn"
                    class="control-btn hidden"
                    title={$tt('saveGeminiConversation')}
                    onclick={handleSaveGeminiConversation}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-save-chat"></use>
                    </svg>
                </button>
                <!-- NEW API KEY BUTTON (ONLY FOR NEW CONVERSATIONS) -->
                <button
                    id="add-api-key-btn"
                    class="control-btn"
                    class:hidden={startsHidden('add-api-key-btn')}
                    title={$tt('addApiKeyBtn')}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-key"></use>
                    </svg>
                </button>
                <button
                    id="schedule-gemini-btn"
                    class="control-btn"
                    class:hidden={startsHidden('schedule-gemini-btn')}
                    title={$tt('scheduleGeminiQuery')}
                    onclick={handleScheduleGemini}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-clock"></use>
                    </svg>
                </button>
                <button
                    id="open-gemini-view-btn"
                    class="control-btn"
                    class:hidden={startsHidden('open-gemini-view-btn')}
                    title={$tt('openSettingsGemini')}
                >
                    <svg width="22" height="22" aria-hidden="true" focusable="false">
                        <use href="#icon-gemini"></use>
                    </svg>
                    <span class="gemini-notification-badge hidden">0</span>
                </button>
                <button
                    id="open-pomodoro-btn"
                    class="control-btn"
                    class:hidden={startsHidden('open-pomodoro-btn')}
                    title={$tt('pomodoroMethodPomodoroTitle')}
                >
                    <svg width="22" height="22" aria-hidden="true" focusable="false">
                        <use href="#icon-pomodoro"></use>
                    </svg>
                </button>
                <button
                    id="mute-all-tabs-btn"
                    class="control-btn"
                    title={$tt('muteAllTabs')}
                    class:hidden={startsHidden('mute-all-tabs-btn')}
                >
                    <svg class="icon-speaker" width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-speaker"></use>
                    </svg>
                    <svg class="icon-speaker-muted hidden" width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-speaker-muted"></use>
                    </svg>
                </button>
                <button
                    id="remove-duplicates-btn"
                    class="control-btn"
                    title={$tt('removeDuplicateTabs')}
                    class:hidden={startsHidden('remove-duplicates-btn')}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-duplicates"></use>
                    </svg>
                    <span id="duplicate-badge" class="duplicate-badge hidden"></span>
                </button>
                <button id="add-note-view-btn" class="control-btn hidden" title={$tt('addNewNote')}>
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-add-note"></use>
                    </svg>
                </button>
                <button
                    class="read-aloud-btn control-btn hidden"
                    class:reading={isReadingConversation}
                    class:paused={isConversationPaused}
                    class:ctrl-held={isReadingConversation && $isCtrlHeld}
                    title={$tt(isReadingConversation ? 'stopReadingAloud' : 'readAloud')}
                    onclick={handleReadWholeConversation}
                >
                    <svg class="icon-play" width="20" height="20" aria-hidden="true" focusable="false">
                        <use href="#icon-play"></use>
                    </svg>
                    <svg class="icon-pause" width="20" height="20" aria-hidden="true" focusable="false">
                        <use href="#icon-pause"></use>
                    </svg>
                    <svg class="icon-resume" width="20" height="20" aria-hidden="true" focusable="false">
                        <use href="#icon-resume"></use>
                    </svg>
                    <svg class="icon-stop" width="20" height="20" aria-hidden="true" focusable="false">
                        <use href="#icon-stop"></use>
                    </svg>
                </button>
                <button
                    id="download-gemini-btn"
                    class="control-btn hidden"
                    title={$tt('downloadGeminiConversation')}
                    onclick={handleDownloadConversation}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-download"></use>
                    </svg>
                </button>
                <button
                    id="copy-gemini-btn"
                    class="control-btn hidden"
                    title={$tt('copyGeminiHistory')}
                    onclick={handleCopyConversation}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-copy"></use>
                    </svg>
                </button>
                <button id="reader-view-btn" class="control-btn hidden" title={$tt('enterReaderView')}>
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-reader"></use>
                    </svg>
                </button>
                <button id="header-screenshot-btn" class="control-btn hidden" title={$tt('captureWebpage')}>
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-screenshot"></use>
                    </svg>
                </button>
                <button
                    id="download-all-screenshots-btn"
                    class="control-btn hidden gallery-header-btn"
                    title={$tt('downloadAllScreenshots')}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-download-all"></use>
                    </svg>
                </button>

                <button
                    id="expand-all-btn"
                    class="control-btn"
                    title={$tt('collapseAllGroups')}
                    aria-pressed="true"
                    class:hidden={startsHidden('expand-all-btn')}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-expand-all"></use>
                    </svg>
                </button>

                <button
                    id="delete-all-context-btn"
                    class="control-btn"
                    class:hidden={startsHidden('delete-all-context-btn')}
                    title={$tt('closeAllButActiveGroup')}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-trash"></use>
                    </svg>
                </button>

                <button
                    id="toggle-view-panel-btn"
                    class="control-btn"
                    class:hidden={startsHidden('toggle-view-panel-btn')}
                    title={$tt('toggleAdvancedToolsTooltip')}
                >
                    <svg width="24" height="24" aria-hidden="true" focusable="false">
                        <use href="#icon-more-vertical"></use>
                    </svg>
                </button>
            </div>
        </div>
        <section id="view-toggle-panel" class="hidden-context-container hidden">
            <button
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
            <button
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
                        <button id="cal-prev-btn">&lt;</button>
                        <span id="cal-month-year"></span>
                        <button id="cal-next-btn">&gt;</button>
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
                        <button id="cal-clear-btn">{$t('reset') || 'Reset'}</button>
                    </div>
                </div>
            </div>

            <button
                id="toggle-bookmarks-sort-panel-btn"
                class="control-btn"
                title={$tt('toggleSortOptionsTooltip')}
                class:hidden={startsHidden('toggle-bookmarks-sort-panel-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-sort"></use>
                </svg>
            </button>
            <button
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
                id="regroup-btn"
                class="control-btn"
                title={$tt('contextMenuRegroupAll')}
                class:hidden={startsHidden('regroup-btn')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-regroup"></use>
                </svg>
            </button>
        </section>

        <!-- ═══════════════════════════════════════════════
             POMODORO PANEL — 3 Divisions
             ═══════════════════════════════════════════════ -->
        <section id="pomodoro-panel" class="pomodoro-panel hidden">
            <!-- ① CONTROLS ROW: mode tabs + all action buttons -->
            <div class="pomo-row pomo-row-controls">
                <div class="pomo-mode-tabs">
                    <button class="pomo-mode-btn active" data-mode="work" title={$tt('pomodoroWork')} tabindex="-1">
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-target"></use>
                        </svg>
                    </button>
                    <button class="pomo-mode-btn" data-mode="short" title={$tt('pomodoroShortBreak')} tabindex="-1">
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-coffee"></use>
                        </svg>
                    </button>
                    <button class="pomo-mode-btn" data-mode="long" title={$tt('pomodoroLongBreak')} tabindex="-1">
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-relax"></use>
                        </svg>
                    </button>
                </div>
                <div class="pomo-divider" title={$tt('dragToMovePanel')}></div>
                <div class="pomo-actions" title={$tt('dragToMovePanel')}>
                    <button id="pomodoro-reset-btn" class="pomo-action-btn" title={$tt('pomodoroReset')}>
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-pomo-reset"></use>
                        </svg>
                    </button>
                    <button id="pomodoro-start-btn" class="pomo-action-btn pomo-play-btn" title={$tt('pomodoroStart')}>
                        <svg class="icon-play" width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-play-solid"></use>
                        </svg>
                        <svg class="icon-pause hidden" width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-pause-solid"></use>
                        </svg>
                        <svg class="icon-stop hidden" width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-stop-solid"></use>
                        </svg>
                    </button>
                    <button id="pomodoro-skip-btn" class="pomo-action-btn" title={$tt('pomodoroSkip')}>
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-skip"></use>
                        </svg>
                    </button>
                    <div class="pomo-divider"></div>
                    <button
                        id="pomodoro-dashboard-btn"
                        class="pomo-action-btn pomo-icon-only"
                        title={$tt('pomodoroDashboard')}
                    >
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-dashboard"></use>
                        </svg>
                    </button>
                    <button
                        id="pomodoro-note-btn"
                        class="pomo-action-btn pomo-icon-only"
                        title={$tt('pomodoroCreateNote')}
                    >
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-add-note"></use>
                        </svg>
                    </button>
                    <button id="pomodoro-stats-btn" class="pomo-action-btn pomo-icon-only" title={$tt('pomodoroStats')}>
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-stats"></use>
                        </svg>
                    </button>
                    <button
                        id="pomodoro-settings-btn"
                        class="pomo-action-btn pomo-icon-only"
                        title={$tt('pomodoroSettings')}
                    >
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-settings"></use>
                        </svg>
                    </button>
                    <button id="pomodoro-close-btn" class="pomo-action-btn pomo-icon-only" title={$tt('pomodoroClose')}>
                        <svg width="18" height="18" aria-hidden="true" focusable="false">
                            <use href="#icon-close-stroke"></use>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- ② PROJECT ROW: project name display -->
            <div class="pomo-row pomo-row-project" id="pomo-row-project">
                <input
                    id="pomo-project-inline"
                    class="pomo-project-inline-input"
                    type="text"
                    maxlength="100"
                    autocomplete="off"
                    placeholder={$t('pomodoroProjectName')}
                />
            </div>

            <!-- ③ TIMER ROW: big time + project name -->
            <div class="pomo-row pomo-row-timer">
                <!-- Top-left: Reset task (zero out stats) -->
                <button
                    id="pomo-task-reset-btn"
                    class="pomo-corner-btn pomo-corner-tl"
                    title={$tt('pomodoroTaskReset')}
                >
                    <svg width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-rotate-ccw"></use>
                    </svg>
                </button>
                <!-- Top-right: Note button with counter -->
                <button
                    id="pomo-note-corner-btn"
                    class="pomo-corner-btn pomo-corner-tr"
                    title={$tt('pomodoroCreateNote')}
                >
                    <svg width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-add-note"></use>
                    </svg>
                    <span id="pomo-note-counter" class="pomo-note-counter hidden">0</span>
                </button>
                <!-- Center content -->
                <input
                    id="pomo-project-display"
                    class="pomo-project-name pomo-project-edit"
                    type="text"
                    placeholder=""
                    maxlength="100"
                    autocomplete="off"
                />
                <span id="pomodoro-time" class="pomo-time">25:00</span>
                <!-- Bottom-left: Finish task -->
                <button
                    id="pomo-task-finish-btn"
                    class="pomo-corner-btn pomo-corner-bl"
                    title={$tt('pomodoroTaskFinish')}
                >
                    <svg width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-check"></use>
                    </svg>
                </button>
                <!-- Bottom-right: Save stats (archive icon) -->
                <button
                    id="pomo-save-stats-btn"
                    class="pomo-corner-btn pomo-corner-br"
                    title={$tt('pomodoroSaveStats')}
                >
                    <svg width="14" height="14" aria-hidden="true" focusable="false">
                        <use href="#icon-archive-note"></use>
                    </svg>
                </button>
            </div>

            <!-- ③ PROGRESS ROW: cycles bar -->
            <div class="pomo-row pomo-row-progress">
                <span class="pomo-cycles-current" id="pomo-cycles-current">0</span>
                <div class="pomo-cycles-track" id="pomo-cycles-track">
                    <div class="pomo-cycles-fill" id="pomo-cycles-fill"></div>
                    <span class="pomo-cycles-pct" id="pomo-cycles-pct">0%</span>
                </div>
                <span class="pomo-cycles-total" id="pomo-cycles-total">8</span>
            </div>

            <!-- ④ SETTINGS PANEL (expandable below) -->
            <div id="pomodoro-settings-panel" class="pomo-settings-panel hidden">
                <div class="pomo-settings-header">{$t('pomodoroSettingsTitle') || 'Configuration'}</div>
                <div class="pomo-settings-body">
                    <!-- Project group (FIRST) -->
                    <div class="pomo-settings-group">
                        <div class="pomo-settings-group-label">{$t('pomodoroSettingsProject') || 'Project'}</div>
                        <div class="pomo-settings-row3">
                            <div class="pomo-sf pomo-sf-wide">
                                <label for="pomodoro-project-name">{$t('pomodoroProjectName') || 'Name'}</label>
                                <input
                                    type="text"
                                    id="pomodoro-project-name"
                                    placeholder="Mi proyecto"
                                    class="pomo-text-input"
                                />
                            </div>
                            <div class="pomo-sf">
                                <label for="pomodoro-project-tag">{$t('pomodoroProjectTag') || 'Tag'}</label>
                                <input
                                    type="text"
                                    id="pomodoro-project-tag"
                                    placeholder="#tag"
                                    class="pomo-text-input"
                                />
                            </div>
                            <div class="pomo-sf">
                                <label for="pomodoro-project-folder">{$t('pomodoroProjectFolder') || 'Folder'}</label>
                                <input
                                    type="text"
                                    id="pomodoro-project-folder"
                                    placeholder="/"
                                    class="pomo-text-input"
                                />
                            </div>
                        </div>
                    </div>
                    <!-- Method group -->
                    <div class="pomo-settings-group">
                        <div class="pomo-settings-group-label">{$t('pomodoroMethodLabel') || 'Method'}</div>
                        <div class="pomo-method-btns">
                            <button
                                type="button"
                                class="pomo-method-btn active"
                                id="pomo-method-pomodoro"
                                data-method="pomodoro"
                                title={$tt('pomodoroMethodPomodoroTitle')}
                            >
                                <svg width="14" height="14" aria-hidden="true" focusable="false">
                                    <use href="#icon-pomodoro"></use>
                                </svg>
                                <span>{$t('pomodoroMethodPomodoro') || 'Pomodoro'}</span>
                            </button>
                            <button
                                type="button"
                                class="pomo-method-btn"
                                id="pomo-method-cronometro"
                                data-method="cronometro"
                                title={$tt('pomodoroMethodCronometroTitle')}
                            >
                                <svg width="14" height="14" aria-hidden="true" focusable="false">
                                    <use href="#icon-stopwatch"></use>
                                </svg>
                                <span>{$t('pomodoroMethodCronometro') || 'Stopwatch'}</span>
                            </button>
                            <button
                                type="button"
                                class="pomo-method-btn"
                                id="pomo-method-temporizador"
                                data-method="temporizador"
                                title={$tt('pomodoroMethodTemporizadorTitle')}
                            >
                                <svg width="14" height="14" aria-hidden="true" focusable="false">
                                    <use href="#icon-timer"></use>
                                </svg>
                                <span>{$t('pomodoroMethodTemporizador') || 'Timer'}</span>
                            </button>
                            <button
                                type="button"
                                class="pomo-method-btn"
                                id="pomo-method-tiempo"
                                data-method="tiempo"
                                title={$tt('pomodoroMethodTiempoTitle')}
                            >
                                <svg width="14" height="14" aria-hidden="true" focusable="false">
                                    <use href="#icon-calendar-time"></use>
                                </svg>
                                <span>{$t('pomodoroMethodTiempo') || 'Time'}</span>
                            </button>
                        </div>
                    </div>
                    <!-- Method: Pomodoro specific settings -->
                    <div id="pomo-method-section-pomodoro">
                        <!-- Timers group -->
                        <div class="pomo-settings-group">
                            <div class="pomo-settings-group-label">{$t('pomodoroSettingsTimers') || 'Timers'}</div>
                            <div class="pomo-settings-row3">
                                <div class="pomo-sf">
                                    <label for="pomodoro-work-input">{$t('pomodoroWork') || 'Pomodoro'}</label>
                                    <div class="pomo-num-wrap">
                                        <button class="pomo-num-btn" data-target="pomodoro-work-input" data-delta="-1"
                                            >−</button
                                        >
                                        <input
                                            type="number"
                                            id="pomodoro-work-input"
                                            min="1"
                                            max="120"
                                            value="25"
                                            class="pomo-num-input"
                                        />
                                        <button class="pomo-num-btn" data-target="pomodoro-work-input" data-delta="1"
                                            >+</button
                                        >
                                    </div>
                                    <span class="pomo-unit">min</span>
                                </div>
                                <div class="pomo-sf">
                                    <label for="pomodoro-short-input">{$t('pomodoroShortBreak') || 'Short break'}</label
                                    >
                                    <div class="pomo-num-wrap">
                                        <button class="pomo-num-btn" data-target="pomodoro-short-input" data-delta="-1"
                                            >−</button
                                        >
                                        <input
                                            type="number"
                                            id="pomodoro-short-input"
                                            min="1"
                                            max="60"
                                            value="5"
                                            class="pomo-num-input"
                                        />
                                        <button class="pomo-num-btn" data-target="pomodoro-short-input" data-delta="1"
                                            >+</button
                                        >
                                    </div>
                                    <span class="pomo-unit">min</span>
                                </div>
                                <div class="pomo-sf">
                                    <label for="pomodoro-long-input">{$t('pomodoroLongBreak') || 'Long break'}</label>
                                    <div class="pomo-num-wrap">
                                        <button class="pomo-num-btn" data-target="pomodoro-long-input" data-delta="-1"
                                            >−</button
                                        >
                                        <input
                                            type="number"
                                            id="pomodoro-long-input"
                                            min="1"
                                            max="120"
                                            value="15"
                                            class="pomo-num-input"
                                        />
                                        <button class="pomo-num-btn" data-target="pomodoro-long-input" data-delta="1"
                                            >+</button
                                        >
                                    </div>
                                    <span class="pomo-unit">min</span>
                                </div>
                            </div>
                        </div>
                        <!-- Cycles group -->
                        <div class="pomo-settings-group">
                            <div class="pomo-settings-group-label" title={$tt('pomodoroSettingsCyclesTitle')}>
                                {$t('pomodoroSettingsCycles') || 'Cycle & Session'}
                            </div>
                            <div class="pomo-settings-row2">
                                <div class="pomo-sf">
                                    <label for="pomodoro-sessions-input"
                                        >{$t('pomodoroSessionsBeforeLong') || 'Pomodoros for the long break'}</label
                                    >
                                    <div class="pomo-num-wrap">
                                        <button
                                            class="pomo-num-btn"
                                            data-target="pomodoro-sessions-input"
                                            data-delta="-1">−</button
                                        >
                                        <input
                                            type="number"
                                            id="pomodoro-sessions-input"
                                            min="1"
                                            max="12"
                                            value="4"
                                            class="pomo-num-input"
                                        />
                                        <button
                                            class="pomo-num-btn"
                                            data-target="pomodoro-sessions-input"
                                            data-delta="1">+</button
                                        >
                                    </div>
                                    <span class="pomo-unit pomo-unit-cycle-info" id="pomo-unit-cycle-info"
                                        >{$t('pomodoroUnitCycleInfo') || 'to complete a cycle'}</span
                                    >
                                </div>
                                <div class="pomo-sf">
                                    <label for="pomodoro-endafter-input"
                                        >{$t('pomodoroEndAfter') || 'Pomodoros to finish'}</label
                                    >
                                    <div class="pomo-num-wrap">
                                        <button
                                            class="pomo-num-btn"
                                            data-target="pomodoro-endafter-input"
                                            data-delta="-1">−</button
                                        >
                                        <input
                                            type="number"
                                            id="pomodoro-endafter-input"
                                            min="1"
                                            max="20"
                                            value="8"
                                            class="pomo-num-input"
                                        />
                                        <button
                                            class="pomo-num-btn"
                                            data-target="pomodoro-endafter-input"
                                            data-delta="1">+</button
                                        >
                                    </div>
                                    <span class="pomo-unit pomo-unit-sessions" id="pomo-unit-sessions"
                                        >{$t('pomodoroUnitSessions') || 'sessions'}</span
                                    >
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Method: Stopwatch specific settings (now merged into general options) -->
                    <div id="pomo-method-section-cronometro" class="hidden"></div>
                    <!-- Method: Temporizador specific settings -->
                    <div id="pomo-method-section-temporizador" class="hidden">
                        <div class="pomo-settings-group">
                            <div class="pomo-settings-group-label">{$t('pomodoroSettingsTimers') || 'Time'}</div>
                            <div class="pomo-settings-row3">
                                <div class="pomo-sf">
                                    <label for="pomodoro-timer-hours">{$t('pomodoroTimerHours') || 'Hours'}</label>
                                    <div class="pomo-num-wrap">
                                        <button class="pomo-num-btn" data-target="pomodoro-timer-hours" data-delta="-1"
                                            >−</button
                                        >
                                        <input
                                            type="number"
                                            id="pomodoro-timer-hours"
                                            min="0"
                                            max="23"
                                            value="0"
                                            class="pomo-num-input"
                                        />
                                        <button class="pomo-num-btn" data-target="pomodoro-timer-hours" data-delta="1"
                                            >+</button
                                        >
                                    </div>
                                    <span class="pomo-unit">h</span>
                                </div>
                                <div class="pomo-sf">
                                    <label for="pomodoro-timer-minutes">{$t('pomodoroTimerMinutes') || 'Minutes'}</label
                                    >
                                    <div class="pomo-num-wrap">
                                        <button
                                            class="pomo-num-btn"
                                            data-target="pomodoro-timer-minutes"
                                            data-delta="-1">−</button
                                        >
                                        <input
                                            type="number"
                                            id="pomodoro-timer-minutes"
                                            min="0"
                                            max="59"
                                            value="25"
                                            class="pomo-num-input"
                                        />
                                        <button class="pomo-num-btn" data-target="pomodoro-timer-minutes" data-delta="1"
                                            >+</button
                                        >
                                    </div>
                                    <span class="pomo-unit">min</span>
                                </div>
                                <div class="pomo-sf">
                                    <label for="pomodoro-timer-seconds">{$t('pomodoroTimerSeconds') || 'Seconds'}</label
                                    >
                                    <div class="pomo-num-wrap">
                                        <button
                                            class="pomo-num-btn"
                                            data-target="pomodoro-timer-seconds"
                                            data-delta="-1">−</button
                                        >
                                        <input
                                            type="number"
                                            id="pomodoro-timer-seconds"
                                            min="0"
                                            max="59"
                                            value="0"
                                            class="pomo-num-input"
                                        />
                                        <button class="pomo-num-btn" data-target="pomodoro-timer-seconds" data-delta="1"
                                            >+</button
                                        >
                                    </div>
                                    <span class="pomo-unit">sec</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Method: Time specific settings -->
                    <div id="pomo-method-section-tiempo" class="hidden">
                        <div class="pomo-settings-group">
                            <div class="pomo-settings-group-label">{$t('pomodoroEndTime') || 'End time'}</div>
                            <div class="pomo-tiempo-datetime-row">
                                <div class="pomo-tiempo-field">
                                    <div class="field-label">{$t('pomodoroEndDate') || 'Date'}</div>
                                    <div class="custom-input-trigger pomo-date-trigger" id="pomo-end-date-trigger">
                                        <span class="val-placeholder">YYYY-MM-DD</span>
                                    </div>
                                </div>
                                <div class="pomo-tiempo-field">
                                    <div class="field-label">{$t('pomodoroEndTimeLabel') || 'Time'}</div>
                                    <div
                                        class="custom-input-trigger time-trigger pomo-time-trigger"
                                        id="pomo-end-time-trigger"
                                    >
                                        00:00
                                    </div>
                                </div>
                            </div>
                            <!-- Add seconds to timer display - moved to options section -->
                        </div>
                    </div>
                    <!-- Options group -->
                    <div class="pomo-settings-group">
                        <div class="pomo-settings-group-label">{$t('pomodoroSettingsOptions') || 'Options'}</div>
                        <div class="pomo-toggles-row">
                            <label class="pomo-toggle-label hidden" id="pomo-cronometro-stop-row">
                                <input type="checkbox" id="pomodoro-cronometro-stop-toggle" />
                                <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                                <span>{$t('pomodoroStopFinalizeNoPause') || 'Stop finishes the task (no pause)'}</span>
                            </label>
                            <label class="pomo-toggle-label hidden" id="pomo-temporizador-stop-row">
                                <input type="checkbox" id="pomodoro-temporizador-stop-toggle" />
                                <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                                <span>{$t('pomodoroStopFinalizeNoPause') || 'Stop finishes the task (no pause)'}</span>
                            </label>
                            <label class="pomo-toggle-label hidden" id="pomo-tiempo-seconds-row">
                                <input type="checkbox" id="pomo-tiempo-show-seconds" />
                                <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                                <span>{$t('pomodoroAddSecondsToTime') || 'Add seconds to time'}</span>
                            </label>
                            <label class="pomo-toggle-label" id="pomo-opt-hide-project-row">
                                <input type="checkbox" id="pomodoro-hide-project-toggle" />
                                <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                                <span>{$t('pomodoroHideProject') || 'Hide project name'}</span>
                            </label>
                            <label class="pomo-toggle-label" id="pomo-opt-hide-progress-row">
                                <input type="checkbox" id="pomodoro-hide-progress-toggle" />
                                <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                                <span>{$t('pomodoroHideProgress') || 'Hide progress bar'}</span>
                            </label>
                            <label class="pomo-toggle-label" id="pomo-opt-sound-row">
                                <input type="checkbox" id="pomodoro-sound-toggle" checked />
                                <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                                <span>{$t('pomodoroSound') || 'Sound'}</span>
                            </label>
                            <label class="pomo-toggle-label" id="pomo-opt-autostart-row">
                                <input type="checkbox" id="pomodoro-autostart-toggle" checked />
                                <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                                <span>{$t('pomodoroAutostart') || 'Auto-start'}</span>
                            </label>
                            <label class="pomo-toggle-label" id="pomo-opt-autosave-row">
                                <input type="checkbox" id="pomodoro-autosave-toggle" checked />
                                <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                                <span>{$t('pomodoroAutosave') || 'Auto-save'}</span>
                            </label>
                            <label class="pomo-toggle-label" id="pomo-opt-autofinish-row">
                                <input type="checkbox" id="pomodoro-autofinish-toggle" checked />
                                <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
                                <span>{$t('pomodoroAutofinish') || 'Auto-finish'}</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ⑤ STATISTICS PANEL (expandable below) -->
            <div id="pomodoro-stats-panel" class="pomo-stats-panel hidden">
                <div class="pomo-settings-header pomo-stats-header">
                    <span class="pomo-stats-title-text">{$t('pomodoroStats') || 'Statistics'}</span>
                    <!-- Project selector (Gemini-style) -->
                    <div class="pomo-project-selector-wrapper" id="pomo-project-selector-wrapper">
                        <button id="pomo-stat-project-btn" class="pomo-project-selector-btn" type="button">
                            <span id="pomo-stat-project-name"
                                >{$t('pomodoroCurrentSessionLabel') || '— current session —'}</span
                            >
                        </button>
                    </div>
                    <div id="pomo-project-dropdown" class="pomo-project-dropdown">
                        <div class="pomo-dropdown-search-container">
                            <span class="pomo-search-icon">
                                <svg width="14" height="14" aria-hidden="true" focusable="false">
                                    <use href="#icon-search"></use>
                                </svg>
                            </span>
                            <label for="pomo-project-search-input" class="visually-hidden"
                                >{$t('pomoSearchProjectPlaceholder')}</label
                            >
                            <input
                                type="search"
                                id="pomo-project-search-input"
                                placeholder={$t('pomoSearchProjectPlaceholder') || 'Search project…'}
                                autocomplete="off"
                            />
                        </div>
                        <ul id="pomo-project-list"></ul>
                    </div>
                </div>
                <div class="pomo-stats-grid">
                    <div class="pomo-stat">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsFocusTime') || 'Focus'}</span>
                        <span class="pomo-stat-val" id="stat-focus-time">—</span>
                    </div>
                    <div class="pomo-stat">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsBreakTime') || 'Break'}</span>
                        <span class="pomo-stat-val" id="stat-break-time">—</span>
                    </div>
                    <div class="pomo-stat">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsTotalTime') || 'Total'}</span>
                        <span class="pomo-stat-val" id="stat-total-time">—</span>
                    </div>
                    <div class="pomo-stat" title={$tt('dashboardTotalTimePaused')}>
                        <span class="pomo-stat-lbl">{$t('dashboardInterruptionTime') || 'Interruption'}</span>
                        <span class="pomo-stat-val" id="stat-interrupt-time">—</span>
                    </div>
                    <div class="pomo-stat">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsCompletedCycles') || 'Pomodoros'}</span>
                        <span class="pomo-stat-val" id="stat-completed-cycles">—</span>
                    </div>
                    <div class="pomo-stat">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsSessions') || 'Sessions'}</span>
                        <span class="pomo-stat-val" id="stat-completed-sessions">—</span>
                    </div>
                    <div class="pomo-stat">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsAvgFocusDuration') || 'Avg. focus'}</span>
                        <span class="pomo-stat-val" id="stat-avg-focus">—</span>
                    </div>
                    <div class="pomo-stat">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsFocusInterruptions') || 'Interruptions'}</span>
                        <span class="pomo-stat-val" id="stat-interruptions">—</span>
                    </div>
                    <div class="pomo-stat">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsStarted') || 'Started'}</span>
                        <span class="pomo-stat-val" id="stat-started">—</span>
                    </div>
                    <div class="pomo-stat">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsFinished') || 'Estimated end'}</span>
                        <span class="pomo-stat-val" id="stat-finished">—</span>
                    </div>
                    <div class="pomo-stat pomo-stat-wide">
                        <span class="pomo-stat-lbl">{$t('pomodoroStatsEfficiency') || 'Efficiency'}</span>
                        <div class="pomo-eff-bar" title={$tt('pomodoroEfficiencyTooltip')}>
                            <div class="pomo-eff-fill" id="stat-efficiency-fill"></div>
                            <span class="pomo-eff-pct" id="stat-efficiency-pct">0%</span>
                        </div>
                    </div>
                </div>
                <!-- Task completion stats -->
                <div id="pomo-task-stats-section" class="pomo-task-stats-section hidden">
                    <div class="pomo-task-stats-header">{$t('pomodoroTaskStatsHeader') || 'Completed tasks'}</div>
                    <div id="pomo-task-stats-list" class="pomo-task-stats-list"></div>
                    <div class="pomo-task-stats-summary">
                        <span class="pomo-task-stat-item"
                            ><strong>{$t('pomodoroStatTotalTasks') || 'Total tasks:'}</strong>
                            <span id="stat-total-tasks">—</span></span
                        >
                        <span class="pomo-task-stat-item"
                            ><strong>{$t('pomodoroStatTotalTaskTime') || 'Total time in tasks:'}</strong>
                            <span id="stat-total-task-time">—</span></span
                        >
                        <span class="pomo-task-stat-item"
                            ><strong>{$t('pomodoroStatTasksCycle') || 'Completed in pomodoro:'}</strong>
                            <span id="stat-all-tasks-cycle">—</span></span
                        >
                    </div>
                </div>
                <div class="pomo-stats-actions">
                    <button id="pomodoro-clear-stats-btn" class="pomo-clear-btn"
                        >{$t('pomodoroStatsClearBtn') || 'Clear statistics'}</button
                    >
                    <button id="pomodoro-export-stats-btn" class="pomo-clear-btn pomo-export-btn"
                        >{$t('pomodoroExport') || 'Export'}</button
                    >
                    <button id="pomodoro-import-stats-btn" class="pomo-clear-btn pomo-export-btn"
                        >{$t('pomodoroImport') || 'Import'}</button
                    >
                    <input type="file" id="pomodoro-import-stats-input" accept=".json" style="display:none" />
                </div>
            </div>
        </section>

        <section id="visibility-controls-panel" class="hidden">
            <button
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
                id="sort-by-access-btn"
                class="control-btn sort-option-btn hidden"
                data-sort-by="lastAccessed"
                title={$tt('sortByLastAccessTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-sort-access"></use>
                </svg>
            </button>
            <button id="toggle-group-actions-btn" class="control-btn" title={$tt('toggleGroupActionsTooltip')}>
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box"></use>
                </svg>
            </button>
            <button id="toggle-domain-headers-btn" class="control-btn" title={$tt('toggleSubgroupsTooltip')}>
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-tree"></use>
                </svg>
            </button>
            <button id="toggle-subgroup-actions-btn" class="control-btn" title={$tt('toggleSubgroupActionsTooltip')}>
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box-nested-1"></use>
                </svg>
            </button>
            <button id="toggle-tab-actions-btn" class="control-btn" title={$tt('toggleTabActionsTooltip')}>
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box-nested-2"></use>
                </svg>
            </button>
            <button id="toggle-folder-actions-btn" class="control-btn" title={$tt('toggleFolderActionsTooltip')}>
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-folder-closed"></use>
                </svg>
            </button>
            <button id="toggle-child-folders-btn" class="control-btn" title={$tt('toggleChildFoldersTooltip')}>
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-child-folders"></use>
                </svg>
            </button>
            <button
                id="toggle-child-folder-actions-btn"
                class="control-btn"
                title={$tt('toggleChildFolderActionsTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box-nested-1"></use>
                </svg>
            </button>
            <button id="toggle-bookmark-actions-btn" class="control-btn" title={$tt('toggleBookmarkActionsTooltip')}>
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-box-nested-2"></use>
                </svg>
            </button>
            <button
                id="delete-mode-all-btn"
                class="control-btn delete-option-btn hidden"
                title={$tt('deleteAllBookmarksTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-trash"></use>
                </svg>
            </button>
            <button
                id="delete-mode-old-btn"
                class="control-btn delete-option-btn hidden"
                title={$tt('deleteOldBookmarksTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-trash-old"></use>
                </svg>
            </button>
            <button
                id="delete-mode-broken-btn"
                class="control-btn delete-option-btn hidden"
                title={$tt('deleteBrokenBookmarksTooltip')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-trash-broken"></use>
                </svg>
            </button>
        </section>
        <section
            id="hidden-groups-container"
            class="hidden-groups-container"
            class:hidden={hiddenGroups.length === 0 && !$listGroupState.hiddenYoutubeView}
        >
            {#each hiddenGroups as g (g.group.id)}
                {@const groupInfo = $renderContext?.groupInfoMap?.get(g.group.id) || {}}
                {@const rawTitle = (groupInfo?.type === 'manual' && groupInfo?.key ? groupInfo.key : (groupInfo?.title || g.group?.title || '')).replace(/\u200B/g, '')}
                {@const cleanTitle = rawTitle.startsWith('_hidden_') ? rawTitle.substring(8) : rawTitle}
                {@const initial = (cleanTitle.trim().charAt(0) || 'G').toUpperCase()}
                <div class="hidden-group-wrapper">
                    <button
                        type="button"
                        class="hidden-group-indicator"
                        style="background-color: {$listGroupState.themeColors[g.group?.color] || 'grey'};"
                        title={cleanTitle ? `${$tt('showGroup')}: ${cleanTitle}` : $tt('showGroup')}
                        aria-label={cleanTitle ? `${$tt('showGroup')}: ${cleanTitle}` : $tt('showGroup')}
                        onclick={() => listGroupStore.actions.unhideGroup(g.group.id)}
                    >
                        <span class="hidden-group-initial">{initial}</span>
                    </button>
                    <DeleteBadge
                        title={$tt('deleteGroupTabs')}
                        ariaLabel={$tt('deleteGroupTabs')}
                        showOnParentHover={true}
                        onclick={(e) => handleDeleteHiddenGroup(e, g.group, g.tabs)}
                    />
                </div>
            {/each}
        </section>
        <section id="action-visibility-controls-panel" class="hidden"></section>
        <section id="hidden-context-container" class="hidden-context-container hidden"></section>
        <section id="persistent-conversation-controls" class="hidden-groups-container hidden">
            <button
                id="cycle-previous-conversation-btn"
                title={$tt('previousSavedConversation')}
                onclick={handleCyclePrevious}
            >
                <svg width="16" height="16" aria-hidden="true" focusable="false">
                    <use href="#icon-prev"></use>
                </svg>
            </button>
            <button
                id="persistent-conversation-display"
                title={$tt('viewSavedConversations')}
                onclick={handleViewConversations}
                >{currentConversationTitle || $t('selectConversationPlaceholder')}</button
            >
            <button id="cycle-next-conversation-btn" title={$tt('nextSavedConversation')} onclick={handleCycleNext}>
                <svg width="16" height="16" aria-hidden="true" focusable="false">
                    <use href="#icon-next"></use>
                </svg>
            </button>
        </section>
    </div>

    <section
        id="groups-list"
        class="groups-list"
        tabindex="-1"
        style:display={initialView === 'groups' ? null : 'none'}
    >
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
    <NotesView />
    <ScreenshotGalleryView />

    <div id="drag-announcer" aria-live="assertive" class="visually-hidden"></div>
    <div id="scroll-buttons" class="scroll-buttons">
        <button id="scroll-up" aria-label={$t('scrollToTop')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-linecap="square" />
            </svg>
        </button>
        <button id="scroll-down" aria-label={$t('scrollToBottom')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M6 9L12 15L18 9" stroke="var(--text-color)" stroke-linecap="square" />
            </svg>
        </button>
    </div>
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

{#if $showApiKeyModal}
    <ApiKeyModal
        show={$showApiKeyModal}
        apiKeys={$modalData?.apiKeys || []}
        onClose={() => closeModal(showApiKeyModal)}
        onSave={async () => {
            await geminiStore.saveApiKey();
            closeModal(showApiKeyModal);
        }}
        onDelete={async (index) => {
            await geminiStore.deleteApiKey(index);
        }}
    />
{/if}

{#if $showNoteModal}
    <NoteModal
        show={$showNoteModal}
        note={$modalData?.note ?? null}
        onClose={() => closeModal(showNoteModal)}
        onSave={async (noteData) => {
            await handleSaveNote($modalData?.context, noteData.id);
            closeModal(showNoteModal);
        }}
    />
{/if}

{#if $showCookieEditorModal}
    <CookieEditorModal
        show={$showCookieEditorModal}
        cookies={$modalData?.cookies || []}
        onClose={() => closeModal(showCookieEditorModal)}
        onSave={async (cookies) => {
            await saveCookieChanges($modalData?.url, $modalData?.originalCookies, cookies);
            closeModal(showCookieEditorModal);
        }}
    />
{/if}

{#if $showGeminiScheduleModal}
    <GeminiScheduleModal
        show={$showGeminiScheduleModal}
        schedules={$modalData?.schedules || []}
        onClose={() => closeModal(showGeminiScheduleModal)}
        onSave={async (schedule) => {
            await geminiStore.saveSchedule(schedule);
            closeModal(showGeminiScheduleModal);
        }}
        onDelete={async (idx) => {
            await geminiStore.deleteSchedule(idx);
        }}
    />
{/if}

{#if $showQrCodeModal}
    <QrCodeModal
        show={$showQrCodeModal}
        url={$modalData?.url || ''}
        title={$modalData?.title || ''}
        onClose={() => closeModal(showQrCodeModal)}
    />
{/if}

{#if $showAddToRuleModal}
    <AddToRuleModal
        show={$showAddToRuleModal}
        url={$modalData?.url || ''}
        rules={$modalData?.rules || []}
        onClose={() => closeModal(showAddToRuleModal)}
        onSelect={async (ruleName) => {
            await saveAddToRule($modalData?.url, ruleName);
            closeModal(showAddToRuleModal);
        }}
    />
{/if}

{#if $showSaveConversationModal}
    <SaveConversationModal
        show={$showSaveConversationModal}
        onClose={() => closeModal(showSaveConversationModal)}
        onSave={async (title) => {
            await geminiStore.saveConversation(title);
            closeModal(showSaveConversationModal);
        }}
    />
{/if}

{#if $showViewConversationsModal}
    <ViewConversationsModal
        show={$showViewConversationsModal}
        conversations={$modalData?.conversations || []}
        onClose={() => closeModal(showViewConversationsModal)}
        onSelect={async (conv) => {
            // The modal shows the list as it was when it opened, and a saved
            // conversation's timestamp moves whenever it gains an entry. Requiring both
            // fields to still match is why a conversation sometimes opened empty.
            const conversations = geminiStore.getCombinedConversations();
            const found =
                conversations.find((c) => c.timestamp === conv.timestamp && c.title === conv.title) ||
                conversations.find((c) => c.timestamp === conv.timestamp) ||
                conversations.find((c) => c.title === conv.title) ||
                conv;
            await geminiStore.loadConversation(found);
            closeModal(showViewConversationsModal);
        }}
        onDelete={async (conv) => {
            // Session conversations are keyed by timestamp, saved ones by title; only
            // the latter was handled, so deleting a session one did nothing.
            if (conv.isTemporary) await geminiStore.deleteSessionConversation(conv.timestamp);
            else await geminiStore.deletePersistentConversationByTitle(conv.title);
            // The modal renders the snapshot it was opened with; hand it the new list.
            openModal(showViewConversationsModal, { conversations: geminiStore.getCombinedConversations() });
        }}
    />
{/if}

{#if $showSpecialDeleteModal}
    <SpecialDeleteModal
        show={$showSpecialDeleteModal}
        titleKey={$modalData?.titleKey || 'oldBookmarks'}
        descriptionKey={$modalData?.descriptionKey || 'oldBookmarksDesc'}
        type={$modalData?.type || 'old'}
        items={$modalData?.items || []}
        isLoading={$modalData?.isLoading || false}
        emptyMessageKey={$modalData?.emptyMessageKey || 'noItemsFound'}
        scanProgress={$modalData?.scanProgress || { current: 0, total: 0 }}
        onClose={() => closeModal(showSpecialDeleteModal)}
        onDeleteAll={async (ids) => {
            await deleteAllSpecialItems(ids, $modalData?.type);
        }}
        onDeleteItem={async (item) => {
            await deleteSpecialItem(item);
        }}
        onReset={async () => {
            await resetSpecialScan();
        }}
    />
{/if}

{#if $showDeleteAllBookmarksConfirmModal}
    <DeleteAllBookmarksConfirmModal
        show={$showDeleteAllBookmarksConfirmModal}
        onClose={() => closeModal(showDeleteAllBookmarksConfirmModal)}
    />
{/if}

{#if $showAddToBookmarkModal}
    <AddToBookmarkModal
        show={$showAddToBookmarkModal}
        tab={$modalData?.tab || {}}
        mode={$modalData?.mode || 'add'}
        bookmarkData={$modalData?.bookmarkData || null}
        onClose={() => closeModal(showAddToBookmarkModal)}
        onSaved={() => closeModal(showAddToBookmarkModal)}
    />
{/if}

{#if $showDeleteHistoryConfirmModal}
    <DeleteHistoryConfirmModal
        show={$showDeleteHistoryConfirmModal}
        dateLabel={$modalData?.dateLabel || ''}
        urlsToDelete={$modalData?.urlsToDelete || []}
        onClose={() => closeModal(showDeleteHistoryConfirmModal)}
        onDeleted={$modalData?.onDeleted}
    />
{/if}

<VanillaTemplates />

<ConfirmDialog />
