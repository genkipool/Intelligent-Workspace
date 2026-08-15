<script>
    import { popupVisibility } from './popupVisibility.svelte.js';
    import { onMount } from 'svelte';
    import { t } from '../../../stores/i18nStore.js';

    let { show = false, position = { x: 0, y: 0 }, discardingTime = $bindable(10), onclose, onreset } = $props();

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

    function resetToDefaults() {
        onreset?.();
    }
</script>

{#if popup.render}
    <div
        class="discarding-config-popup"
        class:open={popup.open}
        style="left: {popup.position.x}px; top: {popup.position.y}px;"
        bind:this={popupEl}
    >
        <h3>{$t('configureDiscarding')}</h3>
        <label>
            <span>{$t('discardingTime')}</span>
            <input
                type="number"
                class="collapse-time discarding-time-input"
                id="discarding-time"
                min="1"
                step="1"
                max="9999"
                maxlength="4"
                bind:value={discardingTime}
            />
            <small>{$t('discardingTimeDesc')}</small>
        </label>
        <button type="button" class="popup-reset-btn" id="reset-discarding-btn" onclick={resetToDefaults}
            >{$t('resetDiscarding')}</button
        >
    </div>
{/if}
