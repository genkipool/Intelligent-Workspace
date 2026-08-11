<script>
    import { onMount } from 'svelte';
    import { t, tt } from '../../../stores/i18nStore.js';

    let { show = false, position = { x: 0, y: 0 }, onclose, onselect } = $props();

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

    function select(value) {
        onselect?.({ value });
        onclose?.();
    }
</script>

{#if show}
    <div
        class="storage-config-popup misc-sort-popup open"
        style="left: {position.x}px; top: {position.y}px;"
        bind:this={popupEl}
    >
        <h3>{$t('configureStorageTitle')}</h3>
        <div class="misc-sort-options-container">
            <button
                class="option-button"
                data-value="sync"
                title={$tt('storageSyncDesc')}
                onclick={() => select('sync')}>{$t('storageSync')}</button
            >
            <button
                class="option-button"
                data-value="local"
                title={$tt('storageLocalDesc')}
                onclick={() => select('local')}>{$t('storageLocal')}</button
            >
        </div>
    </div>
{/if}
