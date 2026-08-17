<script>
    /**
     * The two automatic picture-in-picture triggers.
     *
     * The same two flags the player button's hover menu writes and the `as` / `ah`
     * commands flip, so all three are views of one setting rather than three copies
     * of it — which is why the buttons follow storage instead of local state.
     */
    import { onMount } from 'svelte';

    const KEYS = { scroll: 'itgAutoPipOnScroll', hidden: 'itgAutoPipOnHidden' };

    let onScroll = $state(false);
    let onHidden = $state(false);

    function toggle(name) {
        if (name === 'scroll') {
            const next = !onScroll;
            onScroll = next;
            chrome.storage.local.set({ [KEYS.scroll]: next });
        } else if (name === 'hidden') {
            const next = !onHidden;
            onHidden = next;
            chrome.storage.local.set({ [KEYS.hidden]: next });
        }
    }

    onMount(() => {
        chrome.storage.local.get([KEYS.scroll, KEYS.hidden], (data) => {
            if (data) {
                onScroll = data[KEYS.scroll] === true;
                onHidden = data[KEYS.hidden] === true;
            }
        });
        const onChanged = (changes, area) => {
            if (area !== 'local') return;
            if (changes[KEYS.scroll] !== undefined) {
                onScroll = changes[KEYS.scroll].newValue === true;
            }
            if (changes[KEYS.hidden] !== undefined) {
                onHidden = changes[KEYS.hidden].newValue === true;
            }
        };
        chrome.storage.onChanged.addListener(onChanged);
        return () => chrome.storage.onChanged.removeListener(onChanged);
    });
</script>

<section class="section itg-manage-section">
    <div class="section-header">
        <div class="section-header-alignment">
            <h2 class="section-title" data-i18n="autoPipSectionTitle">Automatic Picture-in-Picture</h2>
        </div>
    </div>
    <div class="autopip-grid">
        <button
            type="button"
            class="autopip-card"
            class:is-selected={onScroll}
            onclick={() => toggle('scroll')}
            aria-pressed={onScroll}
            data-i18n-aria-label="autoPipOnScrollTitle"
        >
            <strong class="autopip-card-title" data-i18n="autoPipOnScrollTitle">Open automatically on scroll</strong>
            <p class="autopip-card-desc" data-i18n="autoPipOnScrollDesc"></p>
        </button>

        <button
            type="button"
            class="autopip-card"
            class:is-selected={onHidden}
            onclick={() => toggle('hidden')}
            aria-pressed={onHidden}
            data-i18n-aria-label="autoPipOnHiddenTitle"
        >
            <strong class="autopip-card-title" data-i18n="autoPipOnHiddenTitle"
                >Open automatically when leaving the tab</strong
            >
            <p class="autopip-card-desc" data-i18n="autoPipOnHiddenDesc"></p>
        </button>
    </div>
</section>

<style>
    .autopip-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
        padding: 8px 0 16px 0;
    }

    .autopip-card {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        text-align: left;
        padding: 14px 16px;
        border-radius: 10px;
        background: var(--bg-panel-color, rgba(255, 255, 255, 0.05));
        border: 1.5px solid var(--border-color, rgba(255, 255, 255, 0.12));
        color: var(--text-color, #fff);
        cursor: pointer;
        transition:
            background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
            border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
            box-shadow 0.2s ease;
        position: relative;
        overflow: hidden;
        user-select: none;
        box-sizing: border-box;
        font: inherit;
    }

    .autopip-card:hover {
        border-color: var(--action-color, var(--interactive-color, #ff4444));
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    }

    .autopip-card:focus-visible {
        outline: 2px solid var(--action-color, var(--interactive-color, #ff4444));
        outline-offset: 2px;
    }

    .autopip-card.is-selected {
        background: color-mix(
            in srgb,
            var(--action-color, var(--interactive-color, #ff4444)) 14%,
            var(--bg-panel-color, #1e1e1e)
        );
        border-color: var(--action-color, var(--interactive-color, #ff4444));
        box-shadow:
            0 0 0 1px var(--action-color, var(--interactive-color, #ff4444)),
            0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .autopip-card-title {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--text-color, #fff);
        margin-bottom: 6px;
        line-height: 1.35;
    }

    .autopip-card-desc {
        font-size: 12px;
        line-height: 1.45;
        color: var(--text-color, #fff);
        opacity: 0.72;
        margin: 0;
    }
</style>
