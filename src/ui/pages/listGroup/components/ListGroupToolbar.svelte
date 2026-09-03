<script>
    import { t, tt } from '../../../stores/i18nStore.js';
    import { isCtrlHeld } from '../../../stores/modifierKeysStore.js';
    import {
        searchToggles,
        currentMainView,
        overlayViewOpening,
        isNotesViewActive,
        isGalleryViewActive,
        isGeminiViewActive,
    } from '../../../stores/appStore.svelte.js';
    import MusicPlayerButton from '../../../components/listGroup/MusicPlayerButton.svelte';
    import MuteAllButton from '../../../components/listGroup/MuteAllButton.svelte';
    import SidePanelHeader from '../../../components/common/SidePanelHeader.svelte';
    import SearchAndControls from '../../../components/common/SearchAndControls.svelte';

    let {
        initialTitleKey = 'listTabGroups',
        startsHidden = () => false,
        handleNewGeminiConversation = () => {},
        handleSaveGeminiConversation = () => {},
        handleScheduleGemini = () => {},
        isReadingConversation = false,
        isConversationPaused = false,
        handleReadWholeConversation = () => {},
        handleDownloadConversation = () => {},
        handleCopyConversation = () => {},
    } = $props();

    const VIEW_TITLE_MAP = {
        groups: 'listTabGroups',
        bookmarks: 'bookmarksViewTitle',
        history: 'historyViewTitle',
        recent: 'recentlyClosedViewTitle',
        reading: 'readingListViewTitle',
        downloads: 'downloadsViewTitle',
        gemini: 'geminiViewTitle',
    };

    /**
     * The header's name for what is on screen.
     *
     * The views painted over the group list come first: while one of them is opening
     * `currentMainView` is 'groups', and taking its word for it made the header say
     * "Listar Grupos" for a frame in the middle of opening the notes. `overlayViewOpening`
     * is set before that switch and the flags stay up for as long as the view does, so
     * between them there is no moment when nobody is claiming the header.
     */
    const OVERLAY_TITLE_MAP = {
        notes: 'notesViewTitle',
        gallery: 'screenshotGalleryTitle',
        gemini: 'geminiViewTitle',
    };

    let overlayTitleKey = $derived(
        OVERLAY_TITLE_MAP[$overlayViewOpening] ||
            ($isNotesViewActive
                ? 'notesViewTitle'
                : $isGalleryViewActive
                  ? 'screenshotGalleryTitle'
                  : $isGeminiViewActive
                    ? 'geminiViewTitle'
                    : null),
    );

    let titleKey = $derived(overlayTitleKey || VIEW_TITLE_MAP[$currentMainView] || initialTitleKey);

    /**
     * The header's buttons. No handlers: this page attaches them by id from plain JS,
     * so the ids and classes here are the contract and must stay exactly as they were.
     */
    let headerActions = $derived([
        {
            id: 'pin-toggle',
            class: 'pin-button header-action-btn',
            pressed: 'false',
            hidden: startsHidden('pin-toggle'),
            icon: '#icon-pin',
            title: $tt('pinListPage'),
        },
        {
            id: 'rules-toggle',
            class: 'header-action-btn',
            icon: '#icon-rules',
            ariaLabel: $t('openRulesPage'),
            title: $tt('openRulesPage'),
        },
        {
            id: 'list-groups-btn',
            class: 'header-action-btn',
            hidden: startsHidden('list-groups-btn'),
            icon: '#icon-tab-groups',
            title: $tt('listTabGroups'),
        },
        {
            id: 'home-btn',
            class: 'home-button header-action-btn',
            icon: '#icon-home',
            ariaLabel: $t('backToHome'),
            title: $tt('backToHome'),
        },
        {
            id: 'main-back-btn',
            class: 'back-button header-action-btn',
            icon: '#icon-back',
            ariaLabel: $t('backToMainPopup'),
            title: $tt('backButton'),
        },
    ]);
</script>

<!--
    The same bar as the rules page and the activity panel. It keeps its own wrapper
    class and its own `header-actions` box, because this page's stylesheet and its
    vanilla listeners both target them: the buttons here carry no `onclick`, they are
    wired by id from `listGroupInit.js` and `viewsService.js`.
-->
<SidePanelHeader
    title={$t(titleKey)}
    titleId="main-header-title"
    titleClass=""
    titleI18n={titleKey}
    headerClass="header"
    actionsClass="header-actions"
    actions={headerActions}
/>
<SearchAndControls>
    {#snippet search()}
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
            <button
                id="gemini-toggle-btn"
                type="button"
                aria-pressed={$searchToggles.gemini}
                title={$tt('enableGeminiSearch')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-gemini"></use>
                </svg>
            </button>
            <button
                id="web-search-toggle-btn"
                type="button"
                aria-pressed={$searchToggles.web}
                title={$tt('enableWebSearch')}
            >
                <svg width="24" height="24" aria-hidden="true" focusable="false">
                    <use href="#icon-web-search"></use>
                </svg>
            </button>
            <button
                id="regex-toggle-btn"
                type="button"
                aria-pressed={$searchToggles.regex}
                title={$tt('enableRegexSearch')}
            >
                <svg width="14" height="14" aria-hidden="true" focusable="false">
                    <use href="#icon-regex"></use>
                </svg>
            </button>
        </div>
    {/snippet}

    {#snippet controls()}
        <button
            id="search-toggle-btn"
            type="button"
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
            type="button"
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
            type="button"
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
            type="button"
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
            type="button"
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
            type="button"
            class="control-btn"
            class:hidden={startsHidden('open-gemini-view-btn')}
            title={$tt('openSettingsGemini')}
        >
            <svg width="22" height="22" aria-hidden="true" focusable="false">
                <use href="#icon-gemini"></use>
            </svg>
            <span class="gemini-notification-badge hidden">0</span>
        </button>
        <MusicPlayerButton hidden={startsHidden('open-music-player-btn')} />
        <button
            id="open-pomodoro-btn"
            type="button"
            class="control-btn"
            class:hidden={startsHidden('open-pomodoro-btn')}
            title={$tt('pomodoroMethodPomodoroTitle')}
        >
            <svg width="22" height="22" aria-hidden="true" focusable="false">
                <use href="#icon-pomodoro"></use>
            </svg>
        </button>
        <MuteAllButton hidden={startsHidden('mute-all-tabs-btn')} />
        <button
            id="remove-duplicates-btn"
            type="button"
            class="control-btn"
            title={$tt('removeDuplicateTabs')}
            class:hidden={startsHidden('remove-duplicates-btn')}
        >
            <svg width="24" height="24" aria-hidden="true" focusable="false">
                <use href="#icon-duplicates"></use>
            </svg>
            <span id="duplicate-badge" class="duplicate-badge hidden"></span>
        </button>
        <!-- From the same table as every other control, so opening straight into the
                 notes paints this button on the first frame instead of a moment later. -->
        <button
            id="add-note-view-btn"
            type="button"
            class="control-btn"
            class:hidden={startsHidden('add-note-view-btn')}
            title={$tt('addNewNote')}
        >
            <svg width="24" height="24" aria-hidden="true" focusable="false">
                <use href="#icon-add-note"></use>
            </svg>
        </button>
        <button
            type="button"
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
            type="button"
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
            type="button"
            class="control-btn hidden"
            title={$tt('copyGeminiHistory')}
            onclick={handleCopyConversation}
        >
            <svg width="24" height="24" aria-hidden="true" focusable="false">
                <use href="#icon-copy"></use>
            </svg>
        </button>
        <button id="reader-view-btn" type="button" class="control-btn hidden" title={$tt('enterReaderView')}>
            <svg width="24" height="24" aria-hidden="true" focusable="false">
                <use href="#icon-reader"></use>
            </svg>
        </button>
        <button id="header-screenshot-btn" type="button" class="control-btn hidden" title={$tt('captureWebpage')}>
            <svg width="24" height="24" aria-hidden="true" focusable="false">
                <use href="#icon-screenshot"></use>
            </svg>
        </button>
        <button
            id="download-all-screenshots-btn"
            type="button"
            class="control-btn hidden gallery-header-btn"
            title={$tt('downloadAllScreenshots')}
        >
            <svg width="24" height="24" aria-hidden="true" focusable="false">
                <use href="#icon-download-all"></use>
            </svg>
        </button>

        <button
            id="expand-all-btn"
            type="button"
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
            type="button"
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
            type="button"
            class="control-btn"
            class:hidden={startsHidden('toggle-view-panel-btn')}
            title={$tt('toggleAdvancedToolsTooltip')}
        >
            <svg width="24" height="24" aria-hidden="true" focusable="false">
                <use href="#icon-more-vertical"></use>
            </svg>
        </button>
    {/snippet}
</SearchAndControls>
