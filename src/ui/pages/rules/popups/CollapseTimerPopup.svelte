<script>
    import { onMount } from 'svelte';
    import { t } from '../../../stores/i18nStore.js';

    let {
        show = false,
        position = { x: 0, y: 0 },
        inactiveTime = $bindable(0),
        activeTime = $bindable(0),
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
    <div class="collapse-timer-popup open" style="left: {position.x}px; top: {position.y}px;" bind:this={popupEl}>
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
        <button class="popup-reset-btn" id="reset-timer-btn" onclick={resetToDefaults}>{$t('resetTimer')}</button>
    </div>
{/if}
