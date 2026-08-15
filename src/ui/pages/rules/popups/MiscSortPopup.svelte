<script>
    import { onMount } from 'svelte';
    import { t } from '../../../stores/i18nStore.js';

    // `selected` marks the option currently in force. Without it the popup opened
    // with nothing highlighted, unlike the same list in the settings modal.
    let { show = false, position = { x: 0, y: 0 }, selected = 'start', onclose, onselect } = $props();

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
    <div class="misc-sort-popup open" style="left: {position.x}px; top: {position.y}px;" bind:this={popupEl}>
        <h3>{$t('miscSortTitle')}</h3>
        <div class="misc-sort-options-container">
            <button
                type="button"
                class="option-button"
                data-value="start"
                class:selected={selected === 'start'}
                aria-pressed={selected === 'start'}
                onclick={() => select('start')}>{$t('miscSortStart')}</button
            >
            <button
                type="button"
                class="option-button"
                data-value="end"
                class:selected={selected === 'end'}
                aria-pressed={selected === 'end'}
                onclick={() => select('end')}>{$t('miscSortEnd')}</button
            >
            <button
                type="button"
                class="option-button"
                data-value="alpha"
                class:selected={selected === 'alpha'}
                aria-pressed={selected === 'alpha'}
                onclick={() => select('alpha')}>{$t('miscSortAlpha')}</button
            >
        </div>
    </div>
{/if}
