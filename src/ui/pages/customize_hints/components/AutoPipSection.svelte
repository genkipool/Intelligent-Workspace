<script>
    /**
     * The two automatic picture-in-picture triggers.
     *
     * The same two flags the player button's hover menu writes and the `as` / `ah`
     * commands flip, so all three are views of one setting rather than three copies
     * of it — which is why the switches follow storage instead of local state.
     */
    import { onMount } from 'svelte';

    const KEYS = { scroll: 'itgAutoPipOnScroll', hidden: 'itgAutoPipOnHidden' };

    let onScroll = $state(false);
    let onHidden = $state(false);

    function save(name, enabled) {
        chrome.storage.local.set({ [KEYS[name]]: enabled });
    }

    onMount(() => {
        chrome.storage.local.get(Object.values(KEYS), (data) => {
            onScroll = data[KEYS.scroll] === true;
            onHidden = data[KEYS.hidden] === true;
        });
        const onChanged = (changes, area) => {
            if (area !== 'local') return;
            if (changes[KEYS.scroll]) onScroll = changes[KEYS.scroll].newValue === true;
            if (changes[KEYS.hidden]) onHidden = changes[KEYS.hidden].newValue === true;
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
    <ul class="commands-list itg-manage-list">
        <li class="command-item">
            <div class="command-info">
                <span class="command-description" data-i18n="autoPipOnScrollTitle"></span>
                <small class="command-hint" data-i18n="autoPipOnScrollDesc"></small>
            </div>
            <label class="switch">
                <input
                    type="checkbox"
                    checked={onScroll}
                    onchange={(e) => save('scroll', e.currentTarget.checked)}
                    data-i18n-aria-label="autoPipOnScrollTitle"
                />
                <span class="slider"></span>
            </label>
        </li>
        <li class="command-item">
            <div class="command-info">
                <span class="command-description" data-i18n="autoPipOnHiddenTitle"></span>
                <small class="command-hint" data-i18n="autoPipOnHiddenDesc"></small>
            </div>
            <label class="switch">
                <input
                    type="checkbox"
                    checked={onHidden}
                    onchange={(e) => save('hidden', e.currentTarget.checked)}
                    data-i18n-aria-label="autoPipOnHiddenTitle"
                />
                <span class="slider"></span>
            </label>
        </li>
    </ul>
</section>
