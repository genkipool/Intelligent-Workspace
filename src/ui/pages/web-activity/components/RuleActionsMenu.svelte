<script>
    /**
     * [AI INSTRUCTION]
     * THE SAME THREE THINGS AS RuleControls, BEHIND A ⋮ BUTTON.
     *
     * For the rules table in the side panel: a column a quarter of the page's width
     * has room for a value or for three buttons, not both. Same props as RuleControls
     * and the same states (a half with nothing set cannot be paused or cleared), so
     * the two stay one control drawn two ways.
     *
     * The popup lives at the topmost modal dialog or the body (see portal.js) and is
     * placed by hand, like the time picker: inside the settings drawer that is the
     * only place it can be seen and clicked.
     */
    import { tick } from 'svelte';
    import { t, tt } from '../../../stores/i18nStore.js';
    import { portal } from '../../../actions/portal.js';

    const ICON = 13;

    let {
        isSet = false,
        enabled = true,
        editTitle = '',
        enableKey = 'webActivityEnableLimit',
        disableKey = 'webActivityDisableLimit',
        clearKey = 'webActivityRemoveLimit',
        onEdit,
        onToggle,
        onClear,
    } = $props();

    let open = $state(false);
    let triggerEl = $state(null);
    let menuEl = $state(null);
    let menuStyle = $state('');

    const toggleLabel = $derived(!isSet ? $t('webActivityNothingToToggle') : $t(enabled ? disableKey : enableKey));

    /** Under the button, right edges aligned; above it when there is no room below. */
    function place() {
        if (!triggerEl || !menuEl) return;
        const rect = triggerEl.getBoundingClientRect();
        const pad = 6;
        let top = rect.bottom + 4;
        if (top + menuEl.offsetHeight > window.innerHeight - pad) top = rect.top - menuEl.offsetHeight - 4;
        let left = rect.right - menuEl.offsetWidth;
        left = Math.min(Math.max(pad, left), window.innerWidth - menuEl.offsetWidth - pad);
        menuStyle = `top: ${Math.max(pad, top)}px; left: ${left}px;`;
    }

    async function openMenu() {
        open = true;
        await tick();
        place();
        menuEl?.querySelector('button:not(:disabled)')?.focus();
    }

    function close(refocus = true) {
        if (!open) return;
        open = false;
        if (refocus) triggerEl?.focus();
    }

    function run(action) {
        close(false);
        action?.();
    }

    /** Capture: the dialogs around it stop clicks on their way up. */
    function handleOutside(event) {
        if (!open) return;
        if (menuEl?.contains(event.target) || triggerEl?.contains(event.target)) return;
        close(false);
    }

    /**
     * Escape closes the menu and no more (the dialog and the drawer under it listen for
     * it too); the arrows move between the items, Tab leaves.
     */
    function handleKeydown(event) {
        if (!open) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }
        if (event.key === 'Tab') {
            close(false);
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const items = [...(menuEl?.querySelectorAll('button:not(:disabled)') || [])];
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement);
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        items[(next + items.length) % items.length].focus();
    }
</script>

<svelte:window
    onclickcapture={handleOutside}
    onkeydowncapture={handleKeydown}
    onresize={() => close(false)}
    onscrollcapture={place}
/>

<button
    bind:this={triggerEl}
    class="wa-icon-btn wa-more-btn"
    class:is-open={open}
    type="button"
    title={$tt('moreOptions')}
    aria-label={$t('moreOptions')}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open ? close() : openMenu())}
>
    <svg width={ICON} height={ICON} aria-hidden="true" focusable="false"><use href="#wa-more"></use></svg>
</button>

{#if open}
    <div class="wa-actions-menu" role="menu" use:portal bind:this={menuEl} style={menuStyle}>
        <button type="button" role="menuitem" onclick={() => run(onEdit)}>
            <svg width={ICON} height={ICON} aria-hidden="true" focusable="false"><use href="#wa-edit"></use></svg>
            <span>{editTitle}</span>
        </button>
        <button type="button" role="menuitem" disabled={!isSet} onclick={() => run(() => onToggle(!enabled))}>
            <svg width={ICON} height={ICON} aria-hidden="true" focusable="false"><use href="#wa-power"></use></svg>
            <span>{toggleLabel}</span>
        </button>
        <button type="button" role="menuitem" class="is-danger" disabled={!isSet} onclick={() => run(onClear)}>
            <svg width={ICON} height={ICON} aria-hidden="true" focusable="false"><use href="#wa-close"></use></svg>
            <span>{$t(clearKey)}</span>
        </button>
    </div>
{/if}

<style>
    /* Out at the drawer or the body, so only these rules and the theme tokens reach it. */
    .wa-actions-menu {
        position: fixed;
        z-index: 10002;
        display: flex;
        flex-direction: column;
        min-width: 180px;
        max-width: min(260px, calc(100vw - 12px));
        padding: 4px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background-color: var(--bg-panel-color);
        color: var(--text-color);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }

    .wa-actions-menu button {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 7px 9px;
        border: none;
        border-radius: 6px;
        background: none;
        color: inherit;
        font-family: var(--sans);
        font-size: 0.82rem;
        line-height: 1.3;
        text-align: left;
        cursor: pointer;
    }

    .wa-actions-menu button:hover:not(:disabled),
    .wa-actions-menu button:focus-visible {
        background-color: color-mix(in srgb, var(--interactive-color) 14%, transparent);
        outline: none;
    }

    .wa-actions-menu button.is-danger:not(:disabled) {
        color: var(--error-color);
    }

    .wa-actions-menu button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .wa-actions-menu svg {
        flex-shrink: 0;
    }
</style>
