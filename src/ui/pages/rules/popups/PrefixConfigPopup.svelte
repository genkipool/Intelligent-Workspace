<script>
    import { popupVisibility } from './popupVisibility.svelte.js';
    import { onMount } from 'svelte';
    import { t } from '../../../stores/i18nStore.js';
    import { duplicateMarkerFields, firstCharacter } from '../modules/prefixMarkers.js';

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

    const popup = popupVisibility(
        () => show,
        () => position,
    );

    let popupEl = $state(null);

    // The single-character and no-repeats rules live next to the settings modal's copy
    // of this form, so both behave the same way.
    let values = $derived({ lock, openKey, loupe, checked, warning });
    let duplicates = $derived(duplicateMarkerFields(values));

    function handleInput(e, assign) {
        const trimmed = firstCharacter(e.currentTarget.value);
        e.currentTarget.value = trimmed;
        assign(trimmed);
    }

    function handleClickOutside(e) {
        // Only the primary button dismisses. A right click is what opens these, and
        // mousedown runs before contextmenu, so closing here would undo the toggle
        // before openPopupOnContextMenu ever saw the popup as open.
        if (e.button !== 0) return;
        if (popupEl && !popupEl.contains(e.target)) {
            onclose?.();
        }
    }

    // A right click elsewhere still dismisses, but the trigger buttons get the last
    // word: openPopupOnContextMenu calls preventDefault, so when it has handled the
    // event this stays out of the way and lets its toggle decide.
    function handleContextMenuOutside(e) {
        if (e.defaultPrevented) return;
        if (popupEl && !popupEl.contains(e.target)) onclose?.();
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            onclose?.();
        }
    }

    onMount(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('contextmenu', handleContextMenuOutside);
        document.addEventListener('keydown', handleKeydown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('contextmenu', handleContextMenuOutside);
            document.removeEventListener('keydown', handleKeydown);
        };
    });

    function resetToDefaults() {
        onreset?.();
    }
</script>

{#if popup.render}
    <div
        class="prefix-config-popup"
        class:open={popup.open}
        style="left: {popup.position.x}px; top: {popup.position.y}px;"
        bind:this={popupEl}
    >
        <h3>{$t('configurePrefixesTitle')}</h3>
        <div class="prefix-entry">
            <label>{$t('prefixLockLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                class:duplicate={duplicates.has('lock')}
                id="prefix-lock-input"
                autocomplete="off"
                placeholder=""
                value={lock}
                oninput={(e) => handleInput(e, (v) => (lock = v))}
            />
        </div>
        <div class="prefix-entry">
            <label>{$t('prefixKeyLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                class:duplicate={duplicates.has('openKey')}
                id="prefix-openKey-input"
                autocomplete="off"
                placeholder=""
                value={openKey}
                oninput={(e) => handleInput(e, (v) => (openKey = v))}
            />
        </div>
        <div class="prefix-entry">
            <label>{$t('prefixLoupeLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                class:duplicate={duplicates.has('loupe')}
                id="prefix-loupe-input"
                autocomplete="off"
                placeholder=""
                value={loupe}
                oninput={(e) => handleInput(e, (v) => (loupe = v))}
            />
        </div>
        <div class="prefix-entry">
            <label>{$t('prefixEmptyLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                class:duplicate={duplicates.has('checked')}
                id="prefix-checked-input"
                autocomplete="off"
                placeholder=""
                value={checked}
                oninput={(e) => handleInput(e, (v) => (checked = v))}
            />
        </div>
        <div class="prefix-entry">
            <label>{$t('prefixWarningLabel')}</label>
            <input
                type="text"
                class="prefix-input"
                class:duplicate={duplicates.has('warning')}
                id="prefix-warning-input"
                autocomplete="off"
                placeholder=""
                value={warning}
                oninput={(e) => handleInput(e, (v) => (warning = v))}
            />
        </div>
        <div class="popup-actions">
            <button type="button" class="popup-reset-btn" id="reset-prefixes-btn" onclick={resetToDefaults}
                >{$t('resetPrefixes')}</button
            >
        </div>
    </div>
{/if}
