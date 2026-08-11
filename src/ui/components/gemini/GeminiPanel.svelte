<script>
    import { onMount } from 'svelte';
    import {
        geminiStore,
        isGeminiViewActive,
        conversationHistory,
        agentModeEnabled,
        selectedModel,
        availableModels,
    } from '../../stores/geminiStore.js';
    import { listGroupStore, listGroupState } from '../../stores/listGroupStore.js';
    import { t, tt } from '../../stores/i18nStore.js';
    import { showNotification, applyTranslations } from '../../../utils/i18n.js';
    import { cancelAgentQuery, setSendButtonBusy } from '../../../utils/agent-ui.js';
    import GeminiConversationView from './GeminiConversationView.svelte';
    import GeminiInput from './GeminiInput.svelte';
    import ModelSelector from './ModelSelector.svelte';
    import {
        openModal,
        showSaveConversationModal,
        showViewConversationsModal,
        showApiKeyModal,
        showGeminiScheduleModal,
    } from '../../stores/modalStore.js';
    import { getAllGeminiEntriesFromDb } from '../../../utils/db.js';
    import {
        updateBackButtonTooltip,
        updateHeaderButtonsVisibility,
        restoreMainView,
    } from '../../services/viewsService.js';
    import { switchToGeminiView } from '../../services/geminiService.js';
    import { updateSubButtonVisibility } from '../../services/settingsService.js';
    import { toggleVoiceInput, isListening } from '../../services/voiceInputService.js';

    const STORAGE_KEYS = {
        API_KEY: 'geminiApiKey',
        GEMINI_SCHEDULES: 'geminiSchedules',
    };

    let hasApiKey = $state(false);
    let conversationView = $state();
    let geminiInput = $state();

    let isActive = $derived($isGeminiViewActive);

    // The URL names the requested view before any store has been set, so the panel is
    // laid out from the very first frame instead of appearing once the boot switches
    // to it. Only the layout is anticipated: entering the view stays driven by the
    // store below, so none of its side effects run early.
    let anticipateBoot = $state(new URLSearchParams(window.location.search).get('view') === 'gemini');
    let isLaidOut = $derived(isActive || anticipateBoot);

    $effect(() => {
        if ($isGeminiViewActive) anticipateBoot = false;
    });
    let history = $derived($conversationHistory);
    let agentMode = $derived($agentModeEnabled);

    let previousActive = false;

    $effect(() => {
        if (isActive && !previousActive) {
            previousActive = true;
            enterGeminiView();
        }
    });

    $effect(() => {
        if (!isActive && previousActive) {
            previousActive = false;
            leaveGeminiView();
        }
    });

    function enterGeminiView() {
        // The service performs every side effect of entering the view: hiding other
        // views, the title, container classes, badges, textarea focus, scroll buttons…
        switchToGeminiView();
        applyTranslations(document.getElementById('gemini-panel-wrapper'));
    }

    function leaveGeminiView() {
        cancelAgentQuery();

        const container = document.querySelector('.container');
        if (container) container.classList.remove('gemini-view-active');

        const searchContainer = document.querySelector('#search-container');
        if (searchContainer) searchContainer.classList.remove('hidden');

        const headerTitle = document.getElementById('main-header-title');
        if (headerTitle) {
            headerTitle.removeAttribute('data-i18n');
            const originalText = chrome.i18n.getMessage('listGroupViewTitle');
            if (originalText) headerTitle.textContent = originalText;
        }

        updateSubButtonVisibility?.();
        updateHeaderButtonsVisibility?.();
        updateBackButtonTooltip?.();

        if ($geminiStore._returnToMainView) {
            restoreMainView?.();
        }
    }

    function handleAgentModeToggle() {
        geminiStore.toggleAgentMode();
        focusInput();
    }

    onMount(async () => {
        await geminiStore.init();
        checkApiKey();
    });

    async function checkApiKey() {
        try {
            const data = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
            hasApiKey = !!data[STORAGE_KEYS.API_KEY];
        } catch {
            hasApiKey = false;
        }
    }

    async function handleSend(detail) {
        const { query } = detail;
        if (!query) return;

        const data = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
        if (!data[STORAGE_KEYS.API_KEY]) {
            openModal(showApiKeyModal);
            return;
        }

        await geminiStore.handleQuery(query);
    }

    async function openSaveConvModal() {
        if (history.length === 0) {
            showNotification('errorEmptyConversation', true);
            return;
        }
        openModal(showSaveConversationModal);
    }

    function openViewConversations() {
        const combined = geminiStore.getCombinedConversations();
        openModal(showViewConversationsModal, { conversations: combined });
    }

    function openApiKeyModal() {
        openModal(showApiKeyModal);
    }

    async function openScheduleModal() {
        const data = await chrome.storage.local.get(['geminiApiKeysList', STORAGE_KEYS.API_KEY]);
        if ((data.geminiApiKeysList?.length || 0) === 0 && !data[STORAGE_KEYS.API_KEY]) {
            openModal(showApiKeyModal);
            return;
        }
        const schedules =
            (await chrome.storage.local.get(STORAGE_KEYS.GEMINI_SCHEDULES))[STORAGE_KEYS.GEMINI_SCHEDULES] || [];
        openModal(showGeminiScheduleModal, { schedules });
    }

    async function handleNewConversation() {
        await geminiStore.newConversation();
    }

    async function handleCycleConversation(direction) {
        await geminiStore.cycleConversation(direction);
    }

    async function handleClearConversation() {
        await geminiStore.deleteConversation();
    }

    let fileInput = $state(null);

    async function handleFilesPicked(e) {
        const files = [...(e.currentTarget.files || [])];
        if (files.length > 0) await geminiStore.addAttachments(files);
        // Reset so picking the same file twice in a row still fires a change.
        e.currentTarget.value = '';
    }

    function handleVoiceClick() {
        toggleVoiceInput(geminiInput?.getTextarea());
    }

    function focusInput() {
        geminiInput?.focus();
    }

    function handleModelRefetch() {
        geminiStore.initializeModelSelector();
    }

    function handleModelSelected() {
        focusInput();
    }
</script>

<div
    id="gemini-panel-wrapper"
    style="display: {isLaidOut ? 'contents' : 'none'};"
    role="region"
    aria-label="Gemini panel"
>
    <div id="gemini-model-selector-container">
        <button
            id="gemini-voice-btn"
            class="agent-mode-btn"
            class:listening={$isListening}
            type="button"
            aria-pressed={String($isListening)}
            title={$tt('geminiVoiceTooltip')}
            onclick={handleVoiceClick}
        >
            <svg width="18" height="18"><use href="#icon-microphone"></use></svg>
        </button>
        <!-- The visually hidden input is the real control; the button is what the user
             sees, so it forwards the click and the input reports back. -->
        <input
            type="file"
            id="gemini-file-input"
            class="visually-hidden"
            multiple
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf,text/plain"
            bind:this={fileInput}
            onchange={handleFilesPicked}
        />
        <button
            id="gemini-attach-file-btn"
            class="agent-mode-btn"
            type="button"
            title={$tt('geminiAttachFileTooltip')}
            onclick={() => fileInput?.click()}
        >
            <svg width="18" height="18"><use href="#icon-upload"></use></svg>
        </button>
        <button
            id="gemini-agent-mode-btn"
            class="agent-mode-btn"
            type="button"
            aria-pressed={String(agentMode)}
            title={agentMode ? $t('agentModeTitleDisable') : $t('agentModeTitleEnable')}
            onclick={handleAgentModeToggle}
        >
            <svg width="18" height="18"><use href="#icon-agent"></use></svg>
        </button>
        <ModelSelector
            onrefetchmodels={handleModelRefetch}
            onmodelselected={handleModelSelected}
            onmodelcycled={handleModelSelected}
        />
    </div>

    <GeminiConversationView bind:this={conversationView} visible={isLaidOut} onopenapikey={openApiKeyModal} />

    <GeminiInput bind:this={geminiInput} visible={isLaidOut} {hasApiKey} onsend={handleSend} />
</div>
