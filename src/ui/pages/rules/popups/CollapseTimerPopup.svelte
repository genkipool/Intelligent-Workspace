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

    function handleNumericKeydown(e) {
        if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
            e.preventDefault();
        }
    }

    function handleInactiveInput(e) {
        let val = e.currentTarget.value;
        if (val !== '') {
            const num = Number.parseFloat(val);
            if (!Number.isNaN(num) && num > 1440) {
                e.currentTarget.value = '1440';
                inactiveTime = 1440;
                return;
            }
            if (!Number.isNaN(num) && num < 0) {
                e.currentTarget.value = '0';
                inactiveTime = 0;
                return;
            }
        }
        inactiveTime = val === '' ? 0 : Number.parseFloat(val) || 0;
    }

    function handleActiveInput(e) {
        let val = e.currentTarget.value;
        if (val !== '') {
            const num = Number.parseFloat(val);
            if (!Number.isNaN(num) && num > 1440) {
                e.currentTarget.value = '1440';
                activeTime = 1440;
                return;
            }
            if (!Number.isNaN(num) && num < 0) {
                e.currentTarget.value = '0';
                activeTime = 0;
                return;
            }
        }
        activeTime = val === '' ? 0 : Number.parseFloat(val) || 0;
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
                max="1440"
                maxlength="6"
                value={inactiveTime}
                onkeydown={handleNumericKeydown}
                oninput={handleInactiveInput}
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
                max="1440"
                maxlength="6"
                value={activeTime}
                onkeydown={handleNumericKeydown}
                oninput={handleActiveInput}
            />
            <small>{$t('activeTimeDesc')}</small>
        </label>
        <button type="button" class="popup-reset-btn" id="reset-timer-btn" translate="no" onclick={resetToDefaults}
            >{$t('resetTimer')}</button
        >
    </div>
{/if}
