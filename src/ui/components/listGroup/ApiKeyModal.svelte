<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let { show = false, apiKeys = [], onClose, onSave, onDelete } = $props();

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
                <button class="close-modal-btn" title={$tt('close')} onclick={onClose}>&times;</button>
            </div>

            <div class="modal-body">
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
                    <div class="saved-api-keys-header-row" style="display:flex;align-items:center;margin-bottom:4px;">
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
                                            <span class="api-key-name-display"
                                                >{keyData.name || $t('geminiApiKeyNameDefault')}</span
                                            >
                                            {#if keyData.hasQuotaError}
                                                <span class="api-key-quota-badge"
                                                    >{$t('geminiQuotaErrorIndicator')}</span
                                                >
                                            {/if}
                                        </div>
                                        <button
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
            </div>
            <div class="modal-actions">
                <button class="modal-btn-save" class:error-state={!!error} disabled={saving} onclick={handleSave}>
                    {saving ? $t('checkingApiKey') : $t('addApiKeyBtn')}
                </button>
            </div>
        </div>
    </div>
{/if}
