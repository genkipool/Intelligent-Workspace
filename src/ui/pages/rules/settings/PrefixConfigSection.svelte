<script>
    import SettingsToggleSection from './SettingsToggleSection.svelte';
    import { t } from '../../../stores/i18nStore.js';
    import { PREFIX_ENTRIES, duplicateMarkerFields, firstCharacter } from '../modules/prefixMarkers.js';

    let {
        isPrefixesEnabled = $bindable(true),
        currentUserPrefixes = $bindable({ lock: '🔒', openKey: '🗝️', loupe: '🔍', checked: '', warning: '⚠️' }),
        onreset = () => {},
    } = $props();

    // Same rules as the popup on the toolbar: one character per marker, and no two
    // markers alike.
    let duplicates = $derived(duplicateMarkerFields(currentUserPrefixes));

    function handleInput(e, field) {
        const trimmed = firstCharacter(e.currentTarget.value);
        e.currentTarget.value = trimmed;
        currentUserPrefixes[field] = trimmed;
    }
</script>

<SettingsToggleSection
    id="modal-prefixes-section"
    icon="#icon-prefixes"
    viewBox="0 0 512 512"
    label={$t('togglePrefixes') || 'Prefixes'}
    bind:checked={isPrefixesEnabled}
>
    <div class="prefix-config-popup">
        <h3>{$t('configurePrefixesTitle')}</h3>
        {#each PREFIX_ENTRIES as entry (entry.field)}
            <div class="prefix-entry">
                <label for="modal-prefix-{entry.field}-input">{$t(entry.labelKey) || entry.fallback}</label>
                <input
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    translate="no"
                    class="prefix-input"
                    class:duplicate={duplicates.has(entry.field)}
                    id="modal-prefix-{entry.field}-input"
                    placeholder=""
                    value={currentUserPrefixes[entry.field]}
                    oninput={(e) => handleInput(e, entry.field)}
                />
            </div>
        {/each}
        <div class="popup-actions">
            <button id="modal-reset-prefixes-btn" type="button" class="popup-reset-btn" translate="no" onclick={onreset}
                >{$t('resetClusterDefaults') || 'Reset to defaults'}</button
            >
        </div>
    </div>
</SettingsToggleSection>
