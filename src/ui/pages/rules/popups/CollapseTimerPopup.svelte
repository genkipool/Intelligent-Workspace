<script>
    import { popupVisibility } from './popupVisibility.svelte.js';
    import { onMount } from 'svelte';
    import { t } from '../../../stores/i18nStore.js';

    let {
        show = false,
        trigger = null,
        inactiveTime = $bindable(0),
        activeTime = $bindable(0),
        onclose,
        onreset,
    } = $props();

    let popupEl = $state(null);

    const popup = popupVisibility({
        isOpen: () => show,
        getTrigger: () => trigger,
        getElement: () => popupEl,
    });

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
        class="collapse-timer-popup"
        class:open={popup.open}
        style="left: {popup.position.x}px; top: {popup.position.y}px;"
        bind:this={popupEl}
    >
        <h3>{$t('configureCollapseTimer')}</h3>
        <label>
            <span>{$t('inactiveTime')}</span>
            <input
                type="number"
                class="collapse-time timer-inactive-input"
                id="inactive-time"
                min="0"
                step="0.1"
                max="99999"
                maxlength="5"
                bind:value={inactiveTime}
            />
            <small>{$t('inactiveTimeDesc')}</small>
        </label>
        <label>
            <span>{$t('activeTime')}</span>
            <input
                type="number"
                class="collapse-time timer-active-input"
                id="active-time"
                min="0"
                step="0.1"
                max="99999"
                maxlength="5"
                bind:value={activeTime}
            />
            <small>{$t('activeTimeDesc')}</small>
        </label>
        <button type="button" class="popup-reset-btn" id="reset-timer-btn" onclick={resetToDefaults}
            >{$t('resetTimer')}</button
        >
    </div>
{/if}
