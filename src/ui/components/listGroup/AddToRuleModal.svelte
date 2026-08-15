<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    /** @type {{
        show: boolean,
        url: string,
        rules: Array<{ name: string, urls: string[], active: boolean }>,
        onClose: () => void,
        onSelect: (ruleName: string) => void
    }} */
    let { show = false, url = '', rules = [], onClose, onSelect } = $props();

    let searchQuery = $state('');
    let urlText = $state('');

    // Reset urlText and searchQuery when the modal opens.
    // urlText must be $state (not $derived) because the user can edit the textarea freely.
    // searchQuery must be $state because it's bound to the search input.
    // The reset only happens on open, so $derived would not work here.
    $effect(() => {
        if (show) {
            const urls = url
                .split(/[\n,]+/)
                .map((u) => u.trim())
                .filter((u) => u.length > 0);
            urlText = [...new Set(urls)].join('\n');
            searchQuery = '';
        }
    });

    let filteredRules = $derived.by(() => {
        const lowerSearch = searchQuery.toLowerCase().trim();
        if (!lowerSearch) return rules;
        return rules.filter((rule) => {
            const matchesName = rule.name.toLowerCase().includes(lowerSearch);
            const matchesUrl = rule.urls && rule.urls.some((u) => u.toLowerCase().includes(lowerSearch));
            return matchesName || matchesUrl;
        });
    });

    function handleOverlayDismiss() {
        onClose?.();
    }

    function handleOverlayKeydown(e) {
        if (e.key === 'Escape') {
            onClose?.();
        }
    }

    function handleRuleSelect(ruleName) {
        const rawUrls = urlText.trim();
        if (!rawUrls) return;
        onSelect?.(ruleName);
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
                <button type="button" class="close-modal-btn" title={$tt('close')} onclick={onClose}>&times;</button>
            </div>

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
                        title={rule.urls?.join('\n') || ''}
                        onclick={() => handleRuleSelect(rule.name)}
                    >
                        {rule.name}
                    </button>
                {/each}
            </div>

            {#if filteredRules.length === 0}
                <p class="no-rules-found-modal">{$t('noRulesFoundForSearch')}</p>
            {/if}
        </div>
    </div>
{/if}
