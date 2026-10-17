<script>
    import { LANGUAGE_STORAGE_KEY, localizedText } from '../../../../utils/i18n.js';
    /**
     * YouTube Loop settings section.
     *
     * Enables or disables the loop repeat button and menu on YouTube video player
     * and YouTube Shorts.
     */
    import { onMount } from 'svelte';
    import ToggleSectionHeader from './ToggleSectionHeader.svelte';

    const KEY = 'youtubeLoopEnabled';

    let enabled = $state(true);
    let toggleTitle = $state('');

    async function updateTitle() {
        const key = enabled ? 'youtubeLoopToggleDisable' : 'youtubeLoopToggleEnable';
        toggleTitle = await localizedText(key, enabled ? 'Turn off' : 'Turn on');
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
            } else if (area === 'local' && changes[LANGUAGE_STORAGE_KEY]) {
                updateTitle();
            }
        };
        chrome.storage.onChanged.addListener(onChanged);
        return () => chrome.storage.onChanged.removeListener(onChanged);
    });
</script>

<section class="section itg-manage-section">
    <ToggleSectionHeader
        titleKey="youtubeLoopSectionTitle"
        title="YouTube Loop"
        toggleId="youtube-loop-toggle"
        {toggleTitle}
        checked={enabled}
        onchange={toggle}
    />
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
