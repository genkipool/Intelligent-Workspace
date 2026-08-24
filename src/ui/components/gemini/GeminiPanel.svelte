<script>
    import { onMount } from 'svelte';
    import { geminiStore, isGeminiViewActive, agentModeEnabled, selectedModel } from '../../stores/geminiStore.js';
    import { t, tt } from '../../stores/i18nStore.js';
    import { applyTranslations } from '../../../utils/i18n.js';
    import { cancelAgentQuery } from '../../../utils/agent-ui.js';
    import GeminiConversationView from './GeminiConversationView.svelte';
    import GeminiInput from './GeminiInput.svelte';
    import ModelSelector from './ModelSelector.svelte';
    import { openModal, showApiKeyModal } from '../../stores/modalStore.js';
    import {
        updateBackButtonTooltip,
        updateHeaderButtonsVisibility,
        restoreMainView,
    } from '../../services/viewsService.js';
    import { switchToGeminiView } from '../../services/geminiService.js';
    import { updateSubButtonVisibility } from '../../services/settingsService.js';
    import { toggleVoiceInput, isListening } from '../../services/voiceInputService.js';
    import {
        localAiActive,
        localAiSupportsImages,
        localAiSupportsTools,
        watchLocalAiState,
        LOCAL_AI_MODEL_ID,
    } from '../../services/localAiService.js';

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
    let agentMode = $derived($agentModeEnabled);

    /**
     * What the local model can be asked for is not a fixed list: whether it takes images,
     * and whether it can hold a tool protocol well enough to run the agent, are answered
     * by the browser and by a test the modal takes once. Rather than let a question be
     * sent and quietly come back as something less, each control the current model cannot
     * honour is disabled while it is the engine.
     */
    // Chosen in the selector, or reached because the quota ran out: either way it is
    // the local model that will answer, and it can do less than the API.
    let localAi = $derived($localAiActive || $selectedModel === LOCAL_AI_MODEL_ID);
    let agentDisabled = $derived(localAi && !$localAiSupportsTools);
    let attachDisabled = $derived(localAi && !$localAiSupportsImages);

    $effect(() => {
        // A mode left on from before the quota ran out would send the next question
        // down the agent path, which the local model cannot answer at all.
        if (agentDisabled && $agentModeEnabled) geminiStore.toggleAgentMode();
    });

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
        watchLocalAiState();
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
        // With the local model installed and turned on there is something to answer
        // with, so asking for a key would be asking for what is no longer needed.
        if (!data[STORAGE_KEYS.API_KEY] && !localAi) {
            openModal(showApiKeyModal);
            return;
        }

        await geminiStore.handleQuery(query);
    }

    function openApiKeyModal() {
        openModal(showApiKeyModal);
    }

    let fileInput = $state(null);

    async function handleFilesPicked(e) {
        // The input is taken and cleared before anything is awaited: once an await
        // has passed, the event's `currentTarget` is null, so clearing it afterwards
        // threw and left the file sitting in the input — picking the same file again
        // fired no change event at all, and nothing was attached.
        const input = e.currentTarget;
        const files = [...(input.files || [])];
        input.value = '';
        if (files.length > 0) await geminiStore.addAttachments(files);
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
            disabled={attachDisabled}
            title={attachDisabled ? $t('localAiDisabledByLocal') : $tt('geminiAttachFileTooltip')}
            onclick={() => fileInput?.click()}
        >
            <svg width="18" height="18"><use href="#icon-upload"></use></svg>
        </button>
        <button
            id="gemini-agent-mode-btn"
            class="agent-mode-btn"
            type="button"
            aria-pressed={String(agentMode)}
            disabled={agentDisabled}
            title={agentDisabled
                ? $t('localAiDisabledByLocal')
                : agentMode
                  ? $t('agentModeTitleDisable')
                  : $t('agentModeTitleEnable')}
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

    <GeminiInput
        bind:this={geminiInput}
        visible={isLaidOut}
        {hasApiKey}
        attachmentsDisabled={attachDisabled}
        onsend={handleSend}
    />
</div>
