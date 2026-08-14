<script>
    import { t, tt } from '../../../stores/i18nStore.js';
    import { isCtrlHeld } from '../../../stores/modifierKeysStore.js';
    import { searchToggles } from '../../../stores/appStore.svelte.js';

    let {
        initialTitleKey = 'titleTabGroups',
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
</script>

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
            type="button"
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
    <div class="controls-container">
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
        <button
            id="mute-all-tabs-btn"
            type="button"
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
        <button id="add-note-view-btn" type="button" class="control-btn hidden" title={$tt('addNewNote')}>
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
    </div>
</div>
