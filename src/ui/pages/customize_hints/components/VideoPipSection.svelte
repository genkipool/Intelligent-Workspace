<script>
    /**
     * Video Picture-in-Picture settings section.
     *
     * Master switch enables/disables video PiP buttons and features across YouTube,
     * Shorts, TikTok and HTML5 video players, along with automatic PiP triggers.
     */
    import { onMount } from 'svelte';
    import { getCurrentLang, loadMessages, resolveMessage } from '../../../../utils/i18n.js';

    const PIP_KEY = 'videoPipEnabled';
    const AUTO_KEYS = { scroll: 'itgAutoPipOnScroll', hidden: 'itgAutoPipOnHidden' };

    let enabled = $state(true);
    let toggleTitle = $state('');
    let onScroll = $state(false);
    let onHidden = $state(false);

    async function updateTitle() {
        const key = enabled ? 'videoPipToggleDisable' : 'videoPipToggleEnable';
        const fallback = enabled ? 'Turn off' : 'Turn on';
        try {
            const messages = await loadMessages(await getCurrentLang());
            toggleTitle = resolveMessage(messages[key], [], 'message') || chrome.i18n.getMessage(key) || fallback;
        } catch {
            toggleTitle = chrome.i18n.getMessage(key) || fallback;
        }
    }

    function togglePip(event) {
        enabled = event.currentTarget.checked;
        updateTitle();
        chrome.storage.sync.set({ [PIP_KEY]: enabled });
        chrome.storage.local.set({ [PIP_KEY]: enabled });
    }

    function toggleAuto(name) {
        if (!enabled) return;
        if (name === 'scroll') {
            const next = !onScroll;
            onScroll = next;
            chrome.storage.local.set({ [AUTO_KEYS.scroll]: next });
        } else if (name === 'hidden') {
            const next = !onHidden;
            onHidden = next;
            chrome.storage.local.set({ [AUTO_KEYS.hidden]: next });
        }
    }

    onMount(() => {
        chrome.storage.sync.get([PIP_KEY], (syncData) => {
            enabled = syncData?.[PIP_KEY] !== false;
            updateTitle();
        });
        chrome.storage.local.get([AUTO_KEYS.scroll, AUTO_KEYS.hidden], (data) => {
            if (data) {
                onScroll = data[AUTO_KEYS.scroll] === true;
                onHidden = data[AUTO_KEYS.hidden] === true;
            }
        });

        const onChanged = (changes, area) => {
            if ((area === 'sync' || area === 'local') && changes[PIP_KEY] !== undefined) {
                enabled = changes[PIP_KEY].newValue !== false;
                updateTitle();
            }
            if (area === 'local') {
                if (changes[AUTO_KEYS.scroll] !== undefined) {
                    onScroll = changes[AUTO_KEYS.scroll].newValue === true;
                }
                if (changes[AUTO_KEYS.hidden] !== undefined) {
                    onHidden = changes[AUTO_KEYS.hidden].newValue === true;
                }
                if (changes['preferred-language']) {
                    updateTitle();
                }
            }
        };
        chrome.storage.onChanged.addListener(onChanged);
        return () => chrome.storage.onChanged.removeListener(onChanged);
    });
</script>

<section class="section itg-manage-section">
    <div class="section-header">
        <div class="section-header-alignment">
            <h2 class="section-title" data-i18n="videoPipSectionTitle">Picture-in-Picture (Video)</h2>
            <label class="switch" id="video-pip-toggle-label" title={toggleTitle}>
                <input
                    type="checkbox"
                    id="video-pip-toggle"
                    tabindex="0"
                    aria-label={toggleTitle}
                    checked={enabled}
                    onchange={togglePip}
                />
                <span class="slider"></span>
            </label>
        </div>
    </div>
    <p class="section-desc" data-i18n="videoPipSectionDesc"></p>

    <div class="autopip-grid" class:is-disabled={!enabled}>
        <button
            type="button"
            class="autopip-card"
            class:is-selected={enabled && onScroll}
            disabled={!enabled}
            onclick={() => toggleAuto('scroll')}
            aria-pressed={enabled && onScroll}
            data-i18n-aria-label="autoPipOnScrollTitle"
        >
            <strong class="autopip-card-title" data-i18n="autoPipOnScrollTitle">Open automatically on scroll</strong>
            <p class="autopip-card-desc" data-i18n="autoPipOnScrollDesc"></p>
        </button>

        <button
            type="button"
            class="autopip-card"
            class:is-selected={enabled && onHidden}
            disabled={!enabled}
            onclick={() => toggleAuto('hidden')}
            aria-pressed={enabled && onHidden}
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
    .section-desc {
        font-size: 12px;
        line-height: 1.45;
        color: var(--text-color, #fff);
        opacity: 0.72;
        margin: 8px 0 10px 0;
        max-width: 70ch;
    }

    .autopip-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
        padding: 8px 0 16px 0;
        transition: opacity 0.2s ease;
    }

    .autopip-grid.is-disabled {
        opacity: 0.45;
        pointer-events: none;
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

    .autopip-card:hover:not(:disabled) {
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

    .autopip-card:disabled {
        cursor: not-allowed;
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
