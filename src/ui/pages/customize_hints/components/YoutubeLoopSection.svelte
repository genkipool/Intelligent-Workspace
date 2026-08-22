<script>
    /**
     * YouTube Loop settings section.
     *
     * Enables or disables the loop repeat button and menu on YouTube video player
     * and YouTube Shorts.
     */
    import { onMount } from 'svelte';
    import { getCurrentLang, loadMessages, resolveMessage } from '../../../../utils/i18n.js';

    const KEY = 'youtubeLoopEnabled';

    let enabled = $state(true);
    let toggleTitle = $state('');

    async function updateTitle() {
        const key = enabled ? 'youtubeLoopToggleDisable' : 'youtubeLoopToggleEnable';
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
    }

    onMount(() => {
        chrome.storage.sync.get([KEY], (data) => {
            enabled = data?.[KEY] !== false;
            updateTitle();
        });
        const onChanged = (changes, area) => {
            if ((area === 'sync' || area === 'local') && changes[KEY] !== undefined) {
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
            <h2 class="section-title" data-i18n="youtubeLoopSectionTitle">YouTube Loop</h2>
            <label class="switch" id="youtube-loop-toggle-label" title={toggleTitle}>
                <input
                    type="checkbox"
                    id="youtube-loop-toggle"
                    tabindex="0"
                    aria-label={toggleTitle}
                    checked={enabled}
                    onchange={toggle}
                />
                <span class="slider"></span>
            </label>
        </div>
    </div>
    <p class="section-desc" data-i18n="youtubeLoopSectionDesc"></p>
</section>

<style>
    .section-desc {
        font-size: 12px;
        line-height: 1.45;
        color: var(--text-color, #fff);
        opacity: 0.72;
        margin: 8px 0 4px 0;
        max-width: 70ch;
    }
</style>
