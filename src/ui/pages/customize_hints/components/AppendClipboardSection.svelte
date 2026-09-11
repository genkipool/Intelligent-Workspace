<script>
    /**
     * The switch and status for the cumulative clipboard copy feature.
     *
     * Linked and synchronized with the keyboard shortcuts help modal (? modal)
     * and sync storage, so any window or open tab agrees without a reload.
     */
    import { onMount } from 'svelte';
    import { getCurrentLang, loadMessages, resolveMessage } from '../../../../utils/i18n.js';

    const KEY = 'appendClipboardEnabled';

    let enabled = $state(true);
    let toggleTitle = $state('');
    let assignedKey = $state('y');

    async function updateTitle() {
        const key = enabled ? 'appendClipboardToggleDisable' : 'appendClipboardToggleEnable';
        const fallback = enabled ? 'Turn off' : 'Turn on';
        try {
            const messages = await loadMessages(await getCurrentLang());
            toggleTitle = resolveMessage(messages[key], [], 'message') || chrome.i18n.getMessage(key) || fallback;
        } catch {
            toggleTitle = chrome.i18n.getMessage(key) || fallback;
        }
    }

    function toggle(event) {
        enabled = event.currentTarget.checked;
        updateTitle();
        chrome.storage.sync.set({ [KEY]: enabled });
        chrome.storage.local.set({ [KEY]: enabled });
        try {
            chrome.runtime.sendMessage({
                action: 'appendClipboardEnabledUpdated',
                enabled,
            });
        } catch {}
    }

    function updateAssignedKey(shortcuts) {
        if (shortcuts && shortcuts['hintDesc_y']) {
            assignedKey = shortcuts['hintDesc_y'];
        } else {
            assignedKey = 'y';
        }
    }

    onMount(() => {
        chrome.storage.sync.get([KEY, 'itg-ui-custom-shortcuts'], (data) => {
            enabled = data?.[KEY] !== false;
            updateAssignedKey(data?.['itg-ui-custom-shortcuts']);
            updateTitle();
        });

        const onChanged = (changes, area) => {
            if ((area === 'sync' || area === 'local') && changes[KEY]) {
                enabled = changes[KEY].newValue !== false;
                updateTitle();
            }
            if (area === 'sync' && changes['itg-ui-custom-shortcuts']) {
                updateAssignedKey(changes['itg-ui-custom-shortcuts'].newValue);
            }
            if (area === 'local' && changes['preferred-language']) {
                updateTitle();
            }
        };
        chrome.storage.onChanged.addListener(onChanged);
        return () => chrome.storage.onChanged.removeListener(onChanged);
    });
</script>

<section class="section itg-manage-section" id="append-clipboard-settings">
    <div class="section-header">
        <div class="section-header-alignment">
            <h2 class="section-title" data-i18n="appendClipboardSectionTitle">Cumulative clipboard copy</h2>
            <label class="switch" id="append-clipboard-toggle-label" title={toggleTitle}>
                <input
                    type="checkbox"
                    id="append-clipboard-toggle"
                    tabindex="0"
                    aria-label={toggleTitle}
                    checked={enabled}
                    onchange={toggle}
                />
                <span class="slider"></span>
            </label>
        </div>
    </div>
    <p class="append-clipboard-desc" data-i18n="appendClipboardDesc"></p>
    <div class="append-clipboard-shortcut-badge">
        <span class="append-clipboard-key-label" data-i18n="appendClipboardAssignedKey">Shortcut key</span>:
        <kbd class="append-clipboard-key">{assignedKey}</kbd>
    </div>
</section>

<style>
    .append-clipboard-desc {
        font-size: 12px;
        line-height: 1.45;
        color: var(--text-color, #fff);
        opacity: 0.72;
        margin: 8px 0 6px 0;
        max-width: 70ch;
    }
    .append-clipboard-shortcut-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text-color, #fff);
        opacity: 0.85;
        margin-top: 4px;
    }
    .append-clipboard-key {
        display: inline-block;
        min-width: 20px;
        padding: 2px 6px;
        font-size: 11px;
        font-family: inherit;
        font-weight: 600;
        text-align: center;
        background: var(--bg-panel-color, rgba(255, 255, 255, 0.08));
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
        border-radius: 4px;
        color: var(--text-color, #fff);
    }
</style>
