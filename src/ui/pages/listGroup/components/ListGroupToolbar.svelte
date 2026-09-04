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
    import { pickImageFiles, pickImageFolder } from '../../../services/screenshotsService.js';
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
     * The two ways of adding pictures to the gallery.
     *
     * "Some images" and "a whole folder" are two different native dialogs, so the one
     * button in the header has to ask which before it opens either. The menu is placed
     * from the button's own rectangle and fixed to the viewport: the toolbar is a
     * tight row of icons with several boxes around it, and anchoring to any of them
     * risks the menu being clipped by one.
     */
    let isUploadMenuOpen = $state(false);
    let uploadMenuPosition = $state({ top: 0, right: 0 });
    let uploadBtnEl = $state(null);
    let uploadMenuEl = $state(null);

    function toggleUploadMenu() {
        if (isUploadMenuOpen) {
            isUploadMenuOpen = false;
            return;
        }
        const rect = uploadBtnEl?.getBoundingClientRect();
        if (rect) {
            uploadMenuPosition = {
                top: rect.bottom + 6,
                right: Math.max(6, window.innerWidth - rect.right),
            };
        }
        isUploadMenuOpen = true;
    }

    function chooseImages() {
        isUploadMenuOpen = false;
        pickImageFiles();
    }

    function chooseFolder() {
        isUploadMenuOpen = false;
        pickImageFolder();
    }

    // Leaving the gallery takes the button away with it, and a menu hanging off a
    // button that is no longer there is just a floating box.
    $effect(() => {
        if (!$isGalleryViewActive) isUploadMenuOpen = false;
    });

    function handleDocumentPointerDown(event) {
        if (!isUploadMenuOpen) return;
        if (uploadMenuEl?.contains(event.target) || uploadBtnEl?.contains(event.target)) return;
        isUploadMenuOpen = false;
    }

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
        <!-- Pictures from disk, beside the button that takes them out again. One
             button for two pickers, because "some images" and "a folder" are two
             different native dialogs and no input can offer both. -->
        <button
            bind:this={uploadBtnEl}
            id="upload-images-btn"
            type="button"
            class="control-btn gallery-header-btn"
            class:hidden={startsHidden('upload-images-btn')}
            title={$tt('uploadImagesTooltip')}
            aria-haspopup="menu"
            aria-expanded={isUploadMenuOpen}
            onclick={toggleUploadMenu}
        >
            <svg width="24" height="24" aria-hidden="true" focusable="false">
                <use href="#icon-upload"></use>
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

<svelte:window
    onpointerdown={handleDocumentPointerDown}
    onkeydown={(e) => e.key === 'Escape' && (isUploadMenuOpen = false)}
    onresize={() => (isUploadMenuOpen = false)}
/>

<!-- The upload menu is placed against the viewport rather than against the button,
     so that no ancestor of the crowded toolbar can clip it. -->
{#if isUploadMenuOpen}
    <div
        bind:this={uploadMenuEl}
        class="upload-dropdown-menu"
        role="menu"
        style:top="{uploadMenuPosition.top}px"
        style:right="{uploadMenuPosition.right}px"
    >
        <button type="button" class="upload-dropdown-item" role="menuitem" onclick={chooseImages}>
            <svg width="15" height="15" aria-hidden="true" focusable="false">
                <use href="#icon-screenshot"></use>
            </svg>
            <span>{$t('uploadImagesFilesOption')}</span>
        </button>
        <button type="button" class="upload-dropdown-item" role="menuitem" onclick={chooseFolder}>
            <svg width="15" height="15" aria-hidden="true" focusable="false">
                <use href="#icon-folder-open"></use>
            </svg>
            <span>{$t('uploadImagesFolderOption')}</span>
        </button>
    </div>
{/if}

<!-- The fallback behind the two pickers above, and what a test can fill in. -->
<input
    id="gallery-upload-files-input"
    type="file"
    class="hidden"
    accept="image/*"
    multiple
    aria-hidden="true"
    tabindex="-1"
/>
<input
    id="gallery-upload-folder-input"
    type="file"
    class="hidden"
    accept="image/*"
    multiple
    webkitdirectory
    aria-hidden="true"
    tabindex="-1"
/>

<style>
    .upload-dropdown-menu {
        position: fixed;
        z-index: 1200;
        display: flex;
        flex-direction: column;
        min-width: 190px;
        padding: 4px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background-color: var(--bg-panel-color);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
    }

    .upload-dropdown-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border: none;
        border-radius: 6px;
        background: none;
        color: var(--text-color);
        font-size: 0.82rem;
        text-align: left;
        cursor: pointer;
    }

    .upload-dropdown-item:hover {
        background-color: var(--bg-color);
        color: var(--action-color);
    }

    .upload-dropdown-item:focus-visible {
        outline: 2px solid var(--interactive-color);
        outline-offset: -2px;
    }
</style>
