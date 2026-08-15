<script>
    import { popupVisibility } from './popupVisibility.svelte.js';
    import { onMount } from 'svelte';
    import { t } from '../../../stores/i18nStore.js';

    // `selected` marks the option currently in force. Without it the popup opened
    // with nothing highlighted, unlike the same list in the settings modal.
    let { show = false, position = { x: 0, y: 0 }, selected = 'start', onclose, onselect } = $props();

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

    // Choosing does not close: the buttons show which option is in force, so the
    // popup stays up and the highlight moves to what was just picked. It closes on
    // a click outside or Escape, like the rest of them.
    function select(value) {
        onselect?.({ value });
    }
</script>

{#if popup.render}
    <div
        class="misc-sort-popup"
        class:open={popup.open}
        style="left: {popup.position.x}px; top: {popup.position.y}px;"
        bind:this={popupEl}
    >
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
