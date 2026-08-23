<script>
    import AnchoredPopup from './AnchoredPopup.svelte';
    import { t } from '../../../stores/i18nStore.js';
    import { PREFIX_ENTRIES, duplicateMarkerFields, firstCharacter } from '../modules/prefixMarkers.js';

    /**
     * The markers arrive as one object rather than five separate bindings. They were
     * five because the rows were written out five times; now the rows come from
     * `PREFIX_ENTRIES`, and an object is what an `{#each}` can index — which is also
     * the shape the settings modal's copy of this form already used.
     */
    let { show = false, trigger = null, prefixes = $bindable({}), onclose, onreset } = $props();

    // The single-character and no-repeats rules live next to the settings modal's copy
    // of this form, so both behave the same way.
    let duplicates = $derived(duplicateMarkerFields(prefixes));

    function handleInput(e, field) {
        const trimmed = firstCharacter(e.currentTarget.value);
        e.currentTarget.value = trimmed;
        prefixes[field] = trimmed;
    }

    function resetToDefaults() {
        onreset?.();
    }
</script>

<AnchoredPopup {show} {trigger} {onclose} class="prefix-config-popup">
    <h3>{$t('configurePrefixesTitle')}</h3>
    {#each PREFIX_ENTRIES as entry (entry.field)}
        <div class="prefix-entry">
            <label for="prefix-{entry.field}-input">{$t(entry.labelKey)}</label>
            <input
                type="text"
                class="prefix-input"
                class:duplicate={duplicates.has(entry.field)}
                id="prefix-{entry.field}-input"
                autocomplete="off"
                spellcheck="false"
                translate="no"
                placeholder=""
                value={prefixes[entry.field]}
                oninput={(e) => handleInput(e, entry.field)}
            />
        </div>
    {/each}
    <div class="popup-actions">
        <button type="button" class="popup-reset-btn" id="reset-prefixes-btn" translate="no" onclick={resetToDefaults}
            >{$t('resetPrefixes')}</button
        >
    </div>
</AnchoredPopup>
