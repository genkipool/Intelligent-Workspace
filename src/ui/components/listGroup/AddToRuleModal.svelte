<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    /** @type {{
        show: boolean,
        url: string,
        rules: Array<{ name: string, urls: string[], active: boolean }>,
        onClose: () => void,
        onSelect: (ruleName: string, editedUrl: string) => void
    }} */
    let { show = false, url = '', rules = [], onClose, onSelect } = $props();

    let searchQuery = $state('');
    let urlText = $state('');
    let selectedRuleName = $state(null);

    // Reset urlText and searchQuery when the modal opens.
    // urlText must be $state (not $derived) because the user can edit the textarea freely.
    // searchQuery must be $state because it's bound to the search input.
    // The reset only happens on open, so $derived would not work here.
    $effect(() => {
        if (show) {
            const urls = (url || '')
                .split(/[\n,]+/)
                .map((u) => u.trim())
                .filter((u) => u.length > 0);
            urlText = [...new Set(urls)].join('\n');
            searchQuery = '';
            selectedRuleName = null;
        }
    });

    let filteredRules = $derived.by(() => {
        const safeRules = rules || [];
        const validRules = safeRules.filter((r) => r && typeof r.name === 'string');
        const lowerSearch = searchQuery.toLowerCase().trim();
        if (!lowerSearch) return validRules;
        return validRules.filter((rule) => {
            const matchesName = rule.name.toLowerCase().includes(lowerSearch);
            const matchesUrl = rule.urls && rule.urls.some((u) => (u || '').toLowerCase().includes(lowerSearch));
            return matchesName || matchesUrl;
        });
    });

    let isSubmitting = false;

    function handleOverlayDismiss() {
        onClose?.();
    }

    function handleOverlayKeydown(e) {
        if (e.key === 'Escape') {
            onClose?.();
        } else if (e.key === 'Enter') {
            if (e.target?.tagName === 'TEXTAREA' && !(e.ctrlKey || e.metaKey)) {
                return;
            }
            if (e.target?.tagName === 'BUTTON') {
                return;
            }
            if (selectedRuleName && urlText.trim()) {
                e.preventDefault();
                handleRuleSelect(selectedRuleName);
            }
        }
    }

    async function handleRuleSelect(ruleName) {
        if (isSubmitting || !ruleName) return;
        const rawUrls = urlText.trim();
        if (!rawUrls) return;
        isSubmitting = true;
        try {
            await onSelect?.(ruleName, rawUrls);
        } finally {
            isSubmitting = false;
        }
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-rule-modal-title"
        tabindex="-1"
        use:dismissOnBackdrop={handleOverlayDismiss}
        onkeydown={handleOverlayKeydown}
    >
        <div class="modal-content add-to-rule-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2 id="add-to-rule-modal-title">{$t('addToExistingRule')}</h2>
                <button class="close-modal-btn" type="button" title={$tt('close')} onclick={onClose}>&times;</button>
            </div>

            <div class="modal-body">
                <div class="search-container-modal">
                    <label for="search-rules-modal-input" class="visually-hidden">{$t('searchRulePlaceholder')}</label>
                    <input
                        type="search"
                        id="search-rules-modal-input"
                        autocomplete="off"
                        spellcheck="false"
                        translate="no"
                        placeholder={$t('searchRulePlaceholder')}
                        bind:value={searchQuery}
                    />
                </div>

                <div class="form-group">
                    <label for="add-to-rule-url-input">{$t('urlToAdd')}</label>
                    <textarea
                        id="add-to-rule-url-input"
                        bind:value={urlText}
                        autocomplete="off"
                        spellcheck="false"
                        translate="no"
                    ></textarea>
                </div>

                <div class="rules-selection-label">{$t('rules')}</div>

                <div class="rules-selection-container">
                    {#each filteredRules as rule (rule.name)}
                        <button
                            type="button"
                            class="rule-selection-btn"
                            class:selected={selectedRuleName === rule.name}
                            aria-pressed={selectedRuleName === rule.name}
                            title={rule.urls?.join('\n') || ''}
                            onclick={() => (selectedRuleName = rule.name)}
                            ondblclick={() => {
                                selectedRuleName = rule.name;
                                handleRuleSelect(rule.name);
                            }}
                            onkeydown={(e) => {
                                if (e.key === 'Enter' && selectedRuleName === rule.name) {
                                    e.preventDefault();
                                    handleRuleSelect(rule.name);
                                }
                            }}
                        >
                            {rule.name}
                        </button>
                    {/each}
                </div>

                {#if filteredRules.length === 0}
                    <p class="no-rules-found-modal">{$t('noRulesFoundForSearch')}</p>
                {/if}
            </div>

            <div class="modal-actions">
                <button
                    type="button"
                    class="modal-btn-save"
                    disabled={!selectedRuleName || !urlText.trim()}
                    onclick={() => selectedRuleName && handleRuleSelect(selectedRuleName)}
                >
                    {$t('add') || 'Añadir'}
                </button>
            </div>
        </div>
    </div>
{/if}
