<script>
    import { popupVisibility } from './popupVisibility.svelte.js';
    import { onMount } from 'svelte';
    import { t, tt } from '../../../stores/i18nStore.js';

    let { show = false, position = { x: 0, y: 0 }, selectedMode = 'sync', onclose, onselect } = $props();

    const popup = popupVisibility(
        () => show,
        () => position,
    );

    let popupEl = $state(null);

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

    // Choosing does not close: switching area reloads the rules and raises two
    // notifications, and the popup staying up is what shows the selection moved.
    // It closes on a click outside or Escape.
    function select(value) {
        // Picking the mode already in use is not a change.
        if (value === selectedMode) return;
        onselect?.({ value });
    }
</script>

{#if popup.render}
    <div
        class="storage-config-popup misc-sort-popup"
        class:open={popup.open}
        style="left: {popup.position.x}px; top: {popup.position.y}px;"
        bind:this={popupEl}
    >
        <h3>{$t('configureStorageTitle')}</h3>
        <div class="misc-sort-options-container">
            <button
                type="button"
                class="option-button"
                class:selected={selectedMode === 'sync'}
                data-value="sync"
                title={$tt('storageSyncDesc')}
                onclick={() => select('sync')}>{$t('storageSync')}</button
            >
            <button
                type="button"
                class="option-button"
                class:selected={selectedMode === 'local'}
                data-value="local"
                title={$tt('storageLocalDesc')}
                onclick={() => select('local')}>{$t('storageLocal')}</button
            >
        </div>
    </div>
{/if}
