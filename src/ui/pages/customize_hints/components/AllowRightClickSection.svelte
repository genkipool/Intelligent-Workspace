<script>
    /**
     * The switch for the right-click and copy unblocker.
     *
     * The flag lives in sync storage and the content script reads it there, so the
     * switch follows storage rather than its own state and every open window — and
     * every tab already loaded — agrees without a reload.
     */
    import { onMount } from 'svelte';
    import { getCurrentLang, loadMessages, resolveMessage } from '../../../../utils/i18n.js';

    const KEY = 'allowRightClickEnabled';

    let enabled = $state(true);
    let toggleTitle = $state('');

    async function updateTitle() {
        const key = enabled ? 'allowRightClickToggleDisable' : 'allowRightClickToggleEnable';
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
    }

    onMount(() => {
        chrome.storage.sync.get([KEY], (data) => {
            enabled = data?.[KEY] !== false;
            updateTitle();
        });
        const onChanged = (changes, area) => {
            if (area === 'sync' && changes[KEY]) {
                enabled = changes[KEY].newValue !== false;
                updateTitle();
            } else if (area === 'local' && changes['preferred-language']) {
                updateTitle();
            }
        };
        chrome.storage.onChanged.addListener(onChanged);
        return () => chrome.storage.onChanged.removeListener(onChanged);
    });
</script>

<section class="section itg-manage-section">
    <div class="section-header">
        <div class="section-header-alignment">
            <h2 class="section-title" data-i18n="allowRightClickSectionTitle">Right-click and copying</h2>
            <label class="switch" id="allow-right-click-toggle-label" title={toggleTitle}>
                <input
                    type="checkbox"
                    id="allow-right-click-toggle"
                    tabindex="0"
                    aria-label={toggleTitle}
                    checked={enabled}
                    onchange={toggle}
                />
                <span class="slider"></span>
            </label>
        </div>
    </div>
    <p class="allow-right-click-desc" data-i18n="allowRightClickDesc"></p>
</section>

<style>
    .allow-right-click-desc {
        font-size: 12px;
        line-height: 1.45;
        color: var(--text-color, #fff);
        opacity: 0.72;
        margin: 8px 0 4px 0;
        max-width: 70ch;
    }
</style>
