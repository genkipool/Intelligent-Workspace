<script>
    import { onMount } from 'svelte';

    import { getThemeColors } from '../../../services/constants.js';
    import { t, tt } from '../../../stores/i18nStore.js';

    /**
     * @property {boolean} [absolute] - Placed inside the panel that owns the colour
     * indicator, with coordinates relative to it, the way the app's own colour popups
     * sit. Left `false` the coordinates are viewport ones.
     * @property {string|null} [groupKey] - What the popup is currently editing. It is
     * handed back on close so the owner only clears the selection it asked for, and
     * moving to another indicator cancels a close that is still animating.
     */
    let { show = false, position = { x: 0, y: 0 }, absolute = false, groupKey = null, onclose, onselect } = $props();

    const themeColors = getThemeColors();

    let popupEl = $state(null);
    let hiding = $state(false);

    // Rules use 8 colours (grey excluded).
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

    function handleClickOutside(e) {
        if (popupEl && !popupEl.contains(e.target)) {
            close();
        }
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            close();
        }
    }

    // Every way out of the popup — clicking outside, clicking the indicator again,
    // Escape or picking a colour — leaves through here, so the collapse animation is
    // always the same one.
    let closeTimer = null;
    let closingKey = null;

    function close() {
        if (closeTimer) return;
        hiding = true;
        closingKey = groupKey;
        closeTimer = setTimeout(() => {
            closeTimer = null;
            hiding = false;
            onclose?.(closingKey);
        }, 300);
    }

    // Reopening on a different indicator during the collapse keeps the popup alive
    // and moves it, the way a freshly created one would appear there.
    $effect(() => {
        if (closeTimer && groupKey && groupKey !== closingKey) {
            clearTimeout(closeTimer);
            closeTimer = null;
            hiding = false;
        }
    });

    function select(color) {
        onselect?.({ color });
        close();
    }

    onMount(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeydown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeydown);
        };
    });
</script>

{#if show}
    <!-- Raised above the panel so it is not clipped by the card's overflow. -->
    <div
        class="color-popup"
        class:hiding
        style="position: {absolute ? 'absolute' : 'fixed'}; left: {position.x}px; top: {position.y}px; z-index: 2000;"
        bind:this={popupEl}
    >
        {#each colors as color (color)}
            <div
                class="color-popup-item"
                role="button"
                tabindex="0"
                translate="no"
                style="background-color: {themeColors[color]}"
                title={$tt('selectSpecificColor', [$t(color) || color])}
                aria-label={$tt('selectSpecificColor', [$t(color) || color])}
                onclick={() => select(color)}
                onkeydown={(e) => e.key === 'Enter' && select(color)}
            ></div>
        {/each}
    </div>
{/if}
