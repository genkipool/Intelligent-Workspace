<script>
    import { onMount } from 'svelte';
    import { t } from '../../../stores/i18nStore.js';

    let {
        show = false,
        position = { x: 0, y: 0 },
        lock = $bindable(''),
        openKey = $bindable(''),
        loupe = $bindable(''),
        checked = $bindable(''),
        warning = $bindable(''),
        onclose,
        onreset,
    } = $props();

    let popupEl = $state(null);

    function handleClickOutside(e) {
        if (popupEl && !popupEl.contains(e.target)) {
            onclose?.();
        }
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            onclose?.();
        }
    }

    onMount(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeydown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeydown);
        };
    });

    function resetToDefaults() {
        onreset?.();
    }
</script>

{#if show}
    <div class="prefix-config-popup open" style="left: {position.x}px; top: {position.y}px;" bind:this={popupEl}>
        <h3>{$t('configurePrefixesTitle')}</h3>
        <div class="prefix-entry">
            <label>{$t('prefixLockLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                id="prefix-lock-input"
                autocomplete="off"
                placeholder=""
                bind:value={lock}
            />
        </div>
        <div class="prefix-entry">
            <label>{$t('prefixKeyLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                id="prefix-openKey-input"
                autocomplete="off"
                placeholder=""
                bind:value={openKey}
            />
        </div>
        <div class="prefix-entry">
            <label>{$t('prefixLoupeLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                id="prefix-loupe-input"
                autocomplete="off"
                placeholder=""
                bind:value={loupe}
            />
        </div>
        <div class="prefix-entry">
            <label>{$t('prefixEmptyLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                id="prefix-checked-input"
                autocomplete="off"
                placeholder=""
                bind:value={checked}
            />
        </div>
        <div class="prefix-entry">
            <label>{$t('prefixWarningLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                id="prefix-warning-input"
                autocomplete="off"
                placeholder=""
                bind:value={warning}
            />
        </div>
        <div class="popup-actions">
            <button class="popup-reset-btn" id="reset-prefixes-btn" onclick={resetToDefaults}
                >{$t('resetPrefixes')}</button
            >
        </div>
    </div>
{/if}
