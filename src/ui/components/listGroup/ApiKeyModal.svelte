<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import {
        LOCAL_AI_STATUS,
        localAiStatus,
        localAiSupportsImages,
        localAiSupportsTools,
        localAiDownloadProgress,
        refreshLocalAiState,
        detectToolSupport,
        installLocalAi,
        uninstallLocalAi,
        localAiModelDirectory,
    } from '../../services/localAiService.js';

    let { show = false, apiKeys = [], onClose, onSave, onDelete } = $props();

    /** 'api' keeps the keys; 'local' is Chrome's own model. */
    let activeTab = $state('api');

    // Loaded here rather than by whoever opens the modal: four different call sites
    // opened it, and the ones that forgot to pass the list showed no saved keys at all.
    let loadedKeys = $state([]);
    const keys = $derived(apiKeys.length > 0 ? apiKeys : loadedKeys);

    $effect(() => {
        if (!show) return;
        chrome.storage.local.get('geminiApiKeysList').then(({ geminiApiKeysList = [] }) => {
            loadedKeys = geminiApiKeysList;
        });
    });

    // The browser is asked every time the tab is opened, not once at boot: the model can
    // be installed, or deleted for want of disk space, while the page stays open.
    let checkingLocalAi = $state(false);

    const GUIDE_STEPS = [
        'localAiGuideStep1',
        'localAiGuideStep2',
        'localAiGuideStep3',
        'localAiGuideStep4',
        'localAiGuideStep5',
        'localAiGuideStep6',
    ];

    /** True while the tool test is running, which is the only slow part of the check. */
    let probingTools = $state(false);

    async function checkLocalAi({ retest = false } = {}) {
        checkingLocalAi = true;
        const state = await refreshLocalAiState();
        checkingLocalAi = false;

        // Only worth asking of a model that is actually there, and only asked once
        // unless the user presses the reload button.
        if (state.status !== LOCAL_AI_STATUS.AVAILABLE) return;
        probingTools = true;
        await detectToolSupport({ force: retest });
        probingTools = false;
    }

    $effect(() => {
        if (!show || activeTab !== 'local') return;
        checkLocalAi();
    });

    /**
     * Installing and removing the model happen in Chrome's own pages, so the user comes
     * back to this tab having changed exactly what it is describing. Asking again on the
     * way back is the difference between a live answer and yesterday's.
     *
     * It is not the whole story: a browser that is already running keeps the answer it
     * had until it restarts, which is what `localAiStaleHint` is for.
     */
    $effect(() => {
        if (!show || activeTab !== 'local') return;
        const onVisible = () => {
            if (!document.hidden) checkLocalAi();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    });

    let installing = $state(false);
    let installError = $state('');
    const modelDirectory = localAiModelDirectory();

    const localStatus = $derived($localAiStatus);
    const isInstalled = $derived(localStatus === LOCAL_AI_STATUS.AVAILABLE);
    const downloadPercent = $derived(
        $localAiDownloadProgress === null ? null : Math.round($localAiDownloadProgress * 100),
    );

    const statusKey = $derived(
        {
            [LOCAL_AI_STATUS.AVAILABLE]: 'localAiStatusAvailable',
            [LOCAL_AI_STATUS.DOWNLOADING]: 'localAiStatusDownloading',
            [LOCAL_AI_STATUS.DOWNLOADABLE]: 'localAiStatusDownloadable',
            [LOCAL_AI_STATUS.UNAVAILABLE]: 'localAiStatusUnavailable',
        }[localStatus] || 'localAiStatusUnsupported',
    );

    async function handleInstallLocalAi() {
        installing = true;
        installError = '';
        // Turning it on is the point of the button: the model is downloaded so it can
        // answer when the quota runs out, so the preference is not a second decision.
        const result = await installLocalAi();
        installing = false;
        if (!result.success) {
            installError = result.error === 'unsupported' ? $t('localAiUnsupportedHelp') : $t('localAiInstallError');
        }
    }

    /**
     * Half an uninstall is all an extension can do: the weights belong to Chrome. This
     * stops offering the model and opens the page where Chrome removes it.
     */
    let uninstallNote = $state('');

    async function handleUninstall() {
        installError = '';
        const result = await uninstallLocalAi();
        uninstallNote = result.openedPage ? $t('localAiUninstallOpened') : $t('localAiUninstallHelp');
        await checkLocalAi();
    }

    /**
     * Cuts a guide step into the three things it is made of: ordinary words, what
     * matters (written `**like this**`), and a chrome:// address. The address becomes a
     * button because Chrome will not follow a link to its own pages from a page, while
     * an extension may open one in a tab.
     *
     * The template that renders these is kept on one line and marked
     * `prettier-ignore`: the pieces sit inside a sentence, and a line break between two
     * of them is a space in the middle of a word or before a comma.
     */
    function guideParts(text) {
        return text
            .split(/(\*\*[^*]+\*\*|chrome:\/\/[^\s,;)»]+)/)
            .filter(Boolean)
            .map((part) => {
                if (part.startsWith('**')) return { kind: 'mark', value: part.slice(2, -2) };
                if (part.startsWith('chrome://')) {
                    // A full stop at the end of a sentence is not part of the address,
                    // and a flag URL ends in letters, so it can only be punctuation.
                    return part.endsWith('.')
                        ? [
                              { kind: 'link', value: part.slice(0, -1) },
                              { kind: 'text', value: '.' },
                          ]
                        : { kind: 'link', value: part };
                }
                return { kind: 'text', value: part };
            })
            .flat();
    }

    /** Opens one of Chrome's own pages, which is where the model is really managed. */
    async function openChromePage(url) {
        try {
            await chrome.tabs.create({ url });
        } catch (error) {
            console.warn('[LocalAI] Could not open', url, error);
        }
    }

    function handleAccept() {
        if (isInstalled) {
            onClose?.();
            return;
        }
        handleInstallLocalAi();
    }

    let apiKeyValue = $state('');
    let showKey = $state(false);
    let error = $state('');
    let saving = $state(false);

    function handleInput() {
        if (error) {
            error = '';
        }
    }

    function handleToggleVisibility() {
        showKey = !showKey;
    }

    async function handleSave() {
        const key = apiKeyValue.trim();
        if (!key) {
            error = $t('geminiApiKeyEmpty');
            return;
        }

        saving = true;
        error = '';

        try {
            await onSave({ key });
            apiKeyValue = '';
        } catch (e) {
            error = e.message || $t('errorValidatingApiKey');
        } finally {
            saving = false;
        }
    }

    function handleKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
    }

    function handleOverlayDismiss() {
        onClose?.();
    }

    function handleOverlayKeydown(e) {
        if (e.key === 'Escape') {
            onClose?.();
        }
    }

    function handleDelete(index) {
        onDelete?.(index);
    }

    function maskKey(keyStr) {
        if (!keyStr) return '';
        return keyStr.length > 9 ? keyStr.substring(0, 5) + '...' + keyStr.substring(keyStr.length - 4) : keyStr;
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabindex="-1"
        use:dismissOnBackdrop={handleOverlayDismiss}
        onkeydown={handleOverlayKeydown}
    >
        <div class="modal-content api-key-modal">
            <div class="modal-header">
                <h2 id="modal-title">{$t('geminiApiKeyTitle')}</h2>
                <button type="button" class="close-modal-btn" title={$tt('close')} onclick={onClose}>&times;</button>
            </div>

            <div class="api-modal-tabs">
                <button
                    type="button"
                    class="api-modal-tab-btn"
                    class:active={activeTab === 'api'}
                    onclick={() => (activeTab = 'api')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path
                            d="M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5z"
                        ></path>
                    </svg>
                    <span>{$t('geminiApiKeyTabApi')}</span>
                </button>
                <button
                    type="button"
                    class="api-modal-tab-btn"
                    class:active={activeTab === 'local'}
                    onclick={() => (activeTab = 'local')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="4" y="4" width="16" height="16" rx="3"></rect>
                        <rect x="9" y="9" width="6" height="6"></rect>
                        <line x1="9" y1="1" x2="9" y2="4"></line>
                        <line x1="15" y1="1" x2="15" y2="4"></line>
                        <line x1="9" y1="20" x2="9" y2="23"></line>
                        <line x1="15" y1="20" x2="15" y2="23"></line>
                        <line x1="1" y1="9" x2="4" y2="9"></line>
                        <line x1="1" y1="15" x2="4" y2="15"></line>
                        <line x1="20" y1="9" x2="23" y2="9"></line>
                        <line x1="20" y1="15" x2="23" y2="15"></line>
                    </svg>
                    <span>{$t('geminiApiKeyTabLocal')}</span>
                </button>
            </div>

            <div class="modal-body">
                {#if activeTab === 'api'}
                    <p>{$t('geminiApiKeyDescription')}</p>
                    <p class="get-api-key-link-container">
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                            >{$t('geminiGetApiKeyLink')}</a
                        >
                    </p>
                    <div class="modal-input-container">
                        <label for="gemini-api-key-input" class="visually-hidden">{$t('geminiApiKeyInputLabel')}</label>
                        <div class="api-key-input-wrapper">
                            <input
                                type={showKey ? 'text' : 'password'}
                                id="gemini-api-key-input"
                                placeholder={$t('geminiApiKeyInputLabel')}
                                bind:value={apiKeyValue}
                                oninput={handleInput}
                                onkeydown={handleKeydown}
                                class:input-error={!!error}
                            />
                            <button
                                type="button"
                                class="toggle-password-btn"
                                title={showKey ? $tt('hideApiKeyTitle') : $tt('showApiKeyTitle')}
                                aria-label={showKey ? $t('hideApiKeyTitle') : $t('showApiKeyTitle')}
                                onclick={handleToggleVisibility}
                            >
                                {#if showKey}
                                    <svg width="18" height="18">
                                        <use href="#icon-eye-off"></use>
                                    </svg>
                                {:else}
                                    <svg width="18" height="18">
                                        <use href="#icon-eye"></use>
                                    </svg>
                                {/if}
                            </button>
                        </div>
                        {#if error}
                            <div id="gemini-api-key-error" class="modal-error-message">{error}</div>
                        {/if}
                    </div>

                    <div class="saved-api-keys-section">
                        <div
                            class="saved-api-keys-header-row"
                            style="display:flex;align-items:center;margin-bottom:4px;"
                        >
                            <h3 style="margin:0;">{$t('geminiSavedKeys')}</h3>
                            <span
                                class="api-keys-counter"
                                style="margin-left:auto;font-size:0.8em;opacity:0.7;font-weight:normal;"
                                >{keys.length}/10</span
                            >
                        </div>
                        <div id="saved-api-keys-list" class="saved-api-keys-list">
                            {#if keys.length === 0}
                                <div class="no-keys-message">{$t('geminiSavedKeysEmpty')}</div>
                            {:else}
                                {#each keys as keyData, i (keyData.key)}
                                    <div class="saved-api-key-item" class:has-quota-error={keyData.hasQuotaError}>
                                        <div class="saved-api-key-header">
                                            <div class="api-key-name-wrapper">
                                                <input
                                                    type="text"
                                                    class="api-key-name-input"
                                                    value={keyData.name || $t('geminiApiKeyNameDefault')}
                                                    placeholder={$t('geminiApiKeyName')}
                                                    maxlength="50"
                                                    title={keyData.name || $t('geminiApiKeyNameDefault')}
                                                    onchange={async (e) => {
                                                        const newName =
                                                            e.currentTarget.value.trim() ||
                                                            $t('geminiApiKeyNameDefault');
                                                        e.currentTarget.value = newName;
                                                        e.currentTarget.title = newName;
                                                        const { geminiApiKeysList = [] } =
                                                            await chrome.storage.local.get('geminiApiKeysList');
                                                        if (geminiApiKeysList[i]) {
                                                            geminiApiKeysList[i].name = newName;
                                                            await chrome.storage.local.set({ geminiApiKeysList });
                                                        }
                                                    }}
                                                />
                                                {#if keyData.hasQuotaError}
                                                    <span
                                                        class="api-key-quota-badge"
                                                        style="margin-left:6px; font-size:0.72em; color:var(--error-color); font-weight:bold; white-space:nowrap;"
                                                        >{$t('geminiQuotaErrorIndicator')}</span
                                                    >
                                                {/if}
                                            </div>
                                            <button
                                                type="button"
                                                class="saved-api-key-delete-btn"
                                                title={$tt('deleteApiKeyTooltip')}
                                                onclick={() => handleDelete(i)}>&times;</button
                                            >
                                        </div>
                                        <div class="api-key-value-row">
                                            <span class="saved-api-key-masked" title={keyData.key}
                                                >{maskKey(keyData.key)}</span
                                            >
                                            <button
                                                type="button"
                                                class="copy-api-key-btn"
                                                title={$tt('copyApiKeyTooltip')}
                                                onclick={async () => {
                                                    try {
                                                        await navigator.clipboard.writeText(keyData.key);
                                                    } catch (err) {
                                                        console.error('Error copying API Key:', err);
                                                    }
                                                }}
                                            >
                                                <svg
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="var(--text-color)"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                >
                                                    <g fill-rule="evenodd" clip-rule="evenodd" fill="var(--text-color)">
                                                        <path
                                                            d="M7.4 6.6c0-2.198 1.75-4 3.934-4h5.333c2.184 0 3.934 1.802 3.934 4v6.8c0 2.198-1.75 4-3.934 4a0.6 0.6 0 0 1 0-1.2c1.498 0 2.734-1.242 2.734-2.8v-6.8c0-1.558-1.235-2.8-2.734-2.8h-5.333c-1.498 0-2.734 1.242-2.734 2.8a0.6 0.6 0 0 1-1.2 0"
                                                        ></path>
                                                        <path
                                                            d="M3.4 10.6c0-2.198 1.75-4 3.934-4h5.333c2.184 0 3.934 1.802 3.934 4v6.8c0 2.198-1.75 4-3.934 4H7.334c-2.184 0-3.934-1.802-3.934-4zm3.934-2.8c-1.498 0-2.734 1.242-2.734 2.8v6.8c0 1.558 1.235 2.8 2.734 2.8h5.333c1.498 0 2.734-1.242 2.734-2.8v-6.8c0-1.558-1.235-2.8-2.734-2.8z"
                                                        ></path>
                                                    </g>
                                                </svg>
                                            </button>
                                        </div>
                                        <details class="api-stats-dropdown">
                                            <summary class="stats-toggle-btn">{$t('apiStatsLabel')}</summary>
                                            <div class="api-stats-content">
                                                {#if keyData.hasQuotaError}
                                                    <div
                                                        class="api-stats-row"
                                                        style="border-left:3px solid var(--error-color);padding-left:6px;margin-bottom:4px;"
                                                    >
                                                        <span
                                                            class="stat-label"
                                                            style="color:var(--error-color);font-weight:bold;"
                                                            >{$t('geminiQuotaErrorIndicator')}</span
                                                        >
                                                    </div>
                                                {/if}
                                                <div class="api-stats-row">
                                                    <span class="stat-label">{$t('geminiLastUsed')}:</span>
                                                    <span class="stat-value" style="font-size:0.85em;">
                                                        {keyData.lastUsedAt
                                                            ? new Date(keyData.lastUsedAt).toLocaleString()
                                                            : $t('geminiNeverUsed')}
                                                    </span>
                                                </div>
                                                <div class="api-stats-row">
                                                    <span class="stat-label">{$t('geminiTotalTokens')}:</span>
                                                    <span class="stat-value"
                                                        >{(keyData.tokensUsed || 0).toLocaleString()}</span
                                                    >
                                                </div>
                                                <div class="api-stats-row">
                                                    <span class="stat-label">{$t('tokensConsumedMinute')}:</span>
                                                    <span class="stat-value"
                                                        >{(keyData.tokensThisMinute || 0).toLocaleString()}</span
                                                    >
                                                </div>
                                                <div class="api-stats-row">
                                                    <span class="stat-label">{$t('tokensConsumedDay')}:</span>
                                                    <span class="stat-value"
                                                        >{(keyData.tokensToday || 0).toLocaleString()}</span
                                                    >
                                                </div>
                                                <div class="api-stats-row">
                                                    <span class="stat-label">{$t('queriesConsumedMinute')}:</span>
                                                    <span class="stat-value"
                                                        >{(keyData.queriesThisMinute || 0).toLocaleString()}</span
                                                    >
                                                </div>
                                                <div class="api-stats-row">
                                                    <span class="stat-label">{$t('queriesConsumedDay')}:</span>
                                                    <span class="stat-value"
                                                        >{(keyData.queriesToday || 0).toLocaleString()}</span
                                                    >
                                                </div>
                                            </div>
                                        </details>
                                    </div>
                                {/each}
                            {/if}
                        </div>
                    </div>
                {:else}
                    <p>{$t('localAiIntro')}</p>

                    <div
                        class="local-ai-status"
                        class:is-ready={isInstalled}
                        class:is-blocked={localStatus === LOCAL_AI_STATUS.UNSUPPORTED ||
                            localStatus === LOCAL_AI_STATUS.UNAVAILABLE}
                    >
                        <span class="local-ai-dot"></span>
                        <span>
                            {#if checkingLocalAi}
                                {$t('localAiStatusChecking')}
                            {:else if downloadPercent !== null}
                                {$t('localAiStatusDownloading')} {downloadPercent}%
                            {:else}
                                {$t(statusKey)}
                            {/if}
                        </span>
                        <button
                            type="button"
                            class="local-ai-recheck"
                            title={$t('localAiRecheck')}
                            aria-label={$t('localAiRecheck')}
                            onclick={() => checkLocalAi({ retest: true })}
                            disabled={checkingLocalAi || installing}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="M20 11a8 8 0 1 0-2.3 5.7"></path>
                                <polyline points="20 4 20 11 13 11"></polyline>
                            </svg>
                        </button>
                        {#if isInstalled}
                            <button
                                type="button"
                                class="local-ai-uninstall"
                                onclick={handleUninstall}
                                disabled={checkingLocalAi || installing}
                            >
                                {$t('localAiUninstallBtn')}
                            </button>
                        {/if}
                    </div>

                    <!-- Not while the browser is still being asked: until it answers the
                         status is only a default, and the wrong explanation under it reads
                         as an answer. -->
                    {#if checkingLocalAi}
                        <!-- nothing to explain yet -->
                    {:else if localStatus === LOCAL_AI_STATUS.UNSUPPORTED}
                        <p class="local-ai-help">{$t('localAiUnsupportedHelp')}</p>
                    {:else if localStatus === LOCAL_AI_STATUS.UNAVAILABLE}
                        <p class="local-ai-help">{$t('localAiUnavailableHelp')}</p>
                    {/if}

                    <p class="local-ai-help local-ai-stale">{$t('localAiStaleHint')}</p>

                    <!-- Folded, because it is only needed when something goes wrong; and
                         first among the sections, because when it is needed it is the
                         only thing on this tab that helps. -->
                    <details class="local-ai-guide">
                        <summary>{$t('localAiGuideTitle')}</summary>
                        {#snippet sentence(
                            text,
                        )}<!-- prettier-ignore -->{#each guideParts(text) as part, i (i)}{#if part.kind === 'link'}<button type="button" class="chrome-link" onclick={() => openChromePage(part.value)}>{part.value}</button>{:else if part.kind === 'mark'}<mark>{part.value}</mark>{:else}{part.value}{/if}{/each}{/snippet}
                        <ol>
                            {#each GUIDE_STEPS as step (step)}
                                <li>{@render sentence($t(step))}</li>
                            {/each}
                        </ol>
                        <p class="local-ai-help">{@render sentence($t('localAiGuideModelChoice'))}</p>
                        <!-- Chrome does not let a page link to its own pages, so these
                             open in a tab of their own instead. -->
                        <div class="local-ai-guide-links">
                            <button type="button" onclick={() => openChromePage('chrome://settings/system')}>
                                {$t('localAiGuideOpenSettings')}
                            </button>
                            <button type="button" onclick={() => openChromePage('chrome://on-device-internals')}>
                                {$t('localAiGuideOpenInternals')}
                            </button>
                        </div>
                    </details>

                    <div class="local-ai-section">
                        <h3>{$t('localAiCapabilities')}</h3>
                        <ul class="local-ai-caps">
                            <li class:supported={$localAiSupportsImages}>
                                {$localAiSupportsImages ? $t('localAiImagesYes') : $t('localAiImagesNo')}
                            </li>
                            <li class:supported={$localAiSupportsTools}>
                                {#if probingTools}
                                    {$t('localAiAgentsChecking')}
                                {:else if $localAiSupportsTools}
                                    {$t('localAiAgentsYes')}
                                {:else}
                                    {$t('localAiAgentsNo')}
                                {/if}
                            </li>
                            <li>{$t('localAiWebNo')}</li>
                        </ul>
                        <p class="local-ai-help">{$t('localAiWebNote')}</p>
                        <p class="local-ai-help">{$t('localAiLimitsNote')}</p>
                        {#if isInstalled}
                            <p class="local-ai-help">{$t('localAiAgentProbeNote')}</p>
                        {/if}
                    </div>

                    <!-- What the download costs is a question about a download that has
                         not happened yet; once it has, the folder below answers it. -->
                    {#if !isInstalled}
                        <div class="local-ai-section">
                            <h3>{$t('localAiSizeTitle')}</h3>
                            <p class="local-ai-help">{$t('localAiSizeDescription')}</p>
                        </div>
                    {/if}

                    {#if isInstalled}
                        <div class="local-ai-section">
                            <h3>{$t('localAiLocationTitle')}</h3>
                            <p class="local-ai-help">{$t('localAiLocationHelp')}</p>
                            <code class="local-ai-path">{modelDirectory}</code>
                            <p class="local-ai-help">{$t('localAiModelUnknown')}</p>
                        </div>
                    {/if}

                    {#if uninstallNote}
                        <p class="local-ai-help local-ai-note">{uninstallNote}</p>
                    {/if}

                    {#if installError}
                        <div class="modal-error-message">{installError}</div>
                    {/if}
                {/if}
            </div>
            <div class="modal-actions">
                {#if activeTab === 'api'}
                    <button
                        type="button"
                        class="modal-btn-save"
                        class:error-state={!!error}
                        disabled={saving}
                        onclick={handleSave}
                    >
                        {saving ? $t('checkingApiKey') : $t('addApiKeyBtn')}
                    </button>
                {:else}
                    <!-- The button is the whole decision: it downloads the model and turns
                         the fallback on, so a user who wanted it does not have to find a
                         second control afterwards. -->
                    <!-- Only "no such API" and "already there" close the door. A machine
                         Chrome says does not qualify is still worth one attempt: the
                         check itself can go unanswered, and a refusal from `create()` is
                         a real answer where a dead button is only a guess. -->
                    <button
                        type="button"
                        class="modal-btn-save"
                        disabled={installing || (!isInstalled && localStatus === LOCAL_AI_STATUS.UNSUPPORTED)}
                        onclick={handleAccept}
                    >
                        {#if installing}
                            {$t('localAiInstallingBtn')}{downloadPercent === null ? '' : ` ${downloadPercent}%`}
                        {:else if isInstalled}
                            {$t('localAiAcceptBtn')}
                        {:else}
                            {$t('localAiAcceptInstallBtn')}
                        {/if}
                    </button>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    /* The tabs are the group list's, the same shape the QR modal uses: one row under the
       header, the active one underlined in the interactive colour. */
    .api-modal-tabs {
        display: flex;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-color);
    }

    .api-modal-tab-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 14px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-color);
        opacity: 0.65;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .api-modal-tab-btn:hover {
        opacity: 1;
        background: var(--bg-panel-color);
    }

    .api-modal-tab-btn.active {
        opacity: 1;
        color: var(--interactive-color);
        border-bottom-color: var(--interactive-color);
        font-weight: 600;
    }

    /* A line the eye can read without reading: the dot is the answer, the sentence is
       the detail. Green-ish is the interactive colour, so a theme change carries it. */
    .local-ai-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        margin: 10px 0;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--bg-panel-color);
        font-size: 0.9em;
        text-align: left;
    }

    .local-ai-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--border-color);
        flex-shrink: 0;
    }

    .local-ai-status.is-ready .local-ai-dot {
        background: var(--interactive-color);
    }

    .local-ai-status.is-blocked .local-ai-dot {
        background: var(--error-color);
    }

    .local-ai-uninstall {
        margin-left: auto;
        background: transparent;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        color: var(--text-color);
        font-size: 0.8em;
        padding: 3px 8px;
        cursor: pointer;
        white-space: nowrap;
    }

    .local-ai-uninstall:hover:not(:disabled) {
        border-color: var(--error-color);
        color: var(--error-color);
    }

    .local-ai-uninstall:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .local-ai-recheck {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: auto;
        padding: 3px;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: var(--text-color);
        opacity: 0.65;
        cursor: pointer;
    }

    .local-ai-recheck:hover:not(:disabled) {
        opacity: 1;
        color: var(--interactive-color);
    }

    .local-ai-recheck:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    /* The re-check sits next to the state it refreshes, so the uninstall button loses
       the automatic margin that used to push it to the right. */
    .local-ai-status .local-ai-uninstall {
        margin-left: 6px;
    }

    .local-ai-stale {
        margin-top: -4px;
        margin-bottom: 12px;
        font-size: 0.8em;
    }

    .local-ai-guide {
        text-align: left;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--bg-panel-color);
        padding: 8px 10px;
    }

    .local-ai-guide summary {
        cursor: pointer;
        font-size: 0.9em;
        font-weight: 600;
        list-style-position: inside;
    }

    .local-ai-guide ol {
        margin: 10px 0 8px;
        padding-left: 18px;
        font-size: 0.85em;
        line-height: 1.5;
    }

    .local-ai-guide li {
        margin-bottom: 8px;
    }

    .local-ai-guide mark {
        background: transparent;
        color: var(--text-on-color);
        font-weight: 600;
    }

    .local-ai-guide .chrome-link {
        padding: 0;
        border: none;
        background: none;
        color: var(--interactive-color);
        font: inherit;
        text-decoration: underline;
        cursor: pointer;
    }

    .local-ai-guide .chrome-link:hover {
        color: var(--text-on-color);
    }

    .local-ai-guide-links {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
    }

    .local-ai-guide-links button {
        flex: 1 1 auto;
        padding: 5px 8px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-color);
        color: var(--text-color);
        font-size: 0.8em;
        cursor: pointer;
    }

    .local-ai-guide-links button:hover {
        border-color: var(--interactive-color);
        color: var(--interactive-color);
    }

    .local-ai-section {
        text-align: left;
        margin-top: 14px;
    }

    .local-ai-section h3 {
        margin: 0 0 6px;
        font-size: 0.95em;
    }

    .local-ai-caps {
        list-style: none;
        margin: 0 0 6px;
        padding: 0;
        font-size: 0.9em;
    }

    /* Each line says yes or no on its own, because a list of ticks and crosses is read
       as a checklist of things that are all there. */
    .local-ai-caps li {
        position: relative;
        padding-left: 18px;
        margin-bottom: 3px;
    }

    .local-ai-caps li::before {
        content: '✕';
        position: absolute;
        left: 0;
        color: var(--error-color);
    }

    .local-ai-caps li.supported::before {
        content: '✓';
        color: var(--interactive-color);
    }

    .local-ai-help {
        font-size: 0.85em;
        opacity: 0.8;
        text-align: left;
        margin: 0;
        line-height: 1.45;
    }

    /* A path is read character by character, so it gets a box of its own and is
       allowed to break: a Windows profile path does not fit a panel in one line. */
    .local-ai-path {
        display: block;
        margin-top: 6px;
        padding: 6px 8px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-color);
        font-family: monospace;
        font-size: 0.8em;
        text-align: left;
        word-break: break-all;
        user-select: all;
    }

    .local-ai-note {
        margin-top: 12px;
        color: var(--interactive-color);
        opacity: 1;
    }
</style>
