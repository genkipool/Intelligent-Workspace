<script>
    /**
     * What the page reader puts on the page.
     *
     * Three switches, all on to begin with, over one stored object: the panel, the
     * mark that follows the word being said, and the highlight over the paragraph
     * being read. `src/utils/readAloud.js` watches the same key, so a switch flipped
     * here reaches a reading already in progress rather than the next one.
     *
     * The section carries an id because the reader's own settings button opens this
     * page scrolled to it.
     */
    import { onMount } from 'svelte';

    const KEY = 'itg-reader-settings';
    const DEFAULTS = {
        showPanel: true,
        showWordMark: true,
        showBlockMark: true,
        blockOpacity: 0.3,
        wordOpacity: 0.8,
    };

    const TOGGLES = [
        {
            key: 'showPanel',
            labelKey: 'readerShowPanelLabel',
            descKey: 'readerShowPanelDesc',
            cmdContainerId: 'reader-cmd-panel',
        },
        {
            key: 'showWordMark',
            labelKey: 'readerShowWordLabel',
            descKey: 'readerShowWordDesc',
            cmdContainerId: 'reader-cmd-word',
        },
        {
            key: 'showBlockMark',
            labelKey: 'readerShowBlockLabel',
            descKey: 'readerShowBlockDesc',
            cmdContainerId: 'reader-cmd-block',
        },
    ];

    /** How solid each mark is. Kept as sliders because the right value is a matter of
     *  how busy the page underneath happens to be. */
    const OPACITIES = [
        { key: 'blockOpacity', labelKey: 'readerBlockOpacityLabel', min: 0.05, max: 0.6, step: 0.01 },
        { key: 'wordOpacity', labelKey: 'readerWordOpacityLabel', min: 0.2, max: 1, step: 0.01 },
    ];

    let settings = $state({ ...DEFAULTS });

    function save(next) {
        settings = next;
        chrome.storage.sync.set({ [KEY]: { ...next } });
    }

    function toggle(key, checked) {
        save({ ...settings, [key]: checked });
    }

    function setOpacity(key, value) {
        save({ ...settings, [key]: Number(value) });
    }

    onMount(() => {
        chrome.storage.sync.get([KEY], (data) => {
            settings = { ...DEFAULTS, ...(data?.[KEY] || {}) };
        });
        const onChanged = (changes, area) => {
            if (area === 'sync' && changes[KEY]) settings = { ...DEFAULTS, ...(changes[KEY].newValue || {}) };
        };
        chrome.storage.onChanged.addListener(onChanged);
        return () => chrome.storage.onChanged.removeListener(onChanged);
    });
</script>

<section class="section itg-manage-section" id="read-aloud-settings">
    <div class="section-header">
        <div class="section-header-alignment">
            <h2 class="section-title" data-i18n="readerSectionTitle">Page reader</h2>
        </div>
    </div>
    <p class="section-desc" data-i18n="readerSectionDesc"></p>

    <div class="reader-toggles">
        {#each TOGGLES as item (item.key)}
            <label class="reader-toggle">
                <span class="reader-toggle-text">
                    <strong data-i18n={item.labelKey}></strong>
                    <span class="reader-toggle-desc" data-i18n={item.descKey}></span>
                </span>
                <span class="switch">
                    <input
                        type="checkbox"
                        checked={settings[item.key]}
                        onchange={(event) => toggle(item.key, event.currentTarget.checked)}
                    />
                    <span class="slider"></span>
                </span>
            </label>
            <div id={item.cmdContainerId} class="reader-switch-command"></div>
        {/each}

        <div class="reader-sliders">
            {#each OPACITIES as item (item.key)}
                <div class="reader-slider-row">
                    <span class="reader-slider-label" data-i18n={item.labelKey}></span>
                    <input
                        class="reader-slider"
                        type="range"
                        min={item.min}
                        max={item.max}
                        step={item.step}
                        value={settings[item.key]}
                        aria-label={chrome.i18n.getMessage(item.labelKey) || item.key}
                        oninput={(event) => setOpacity(item.key, event.currentTarget.value)}
                    />
                    <output class="reader-slider-value">{Math.round(Number(settings[item.key]) * 100)}%</output>
                </div>
            {/each}
        </div>
    </div>

    <!-- The keys that drive all of the above. `customize_hints.js` renders the
         reader command category in here rather than among the global commands. -->
    <div id="read-aloud-commands" class="reader-commands"></div>
</section>

<style>
    .section-desc {
        font-size: 12px;
        line-height: 1.45;
        color: var(--text-color, #fff);
        opacity: 0.72;
        margin: 8px 0 12px 0;
        max-width: 70ch;
    }

    .reader-toggles {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-bottom: 12px;
        max-width: 640px;
    }

    .reader-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.15s ease;
    }

    .reader-toggle:hover {
        background: var(--bg-panel-color, rgba(255, 255, 255, 0.05));
    }

    .reader-switch-command {
        padding: 0 12px 6px 12px;
    }

    :global(.reader-inline-commands-list) {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    :global(.reader-inline-commands-list .command-item) {
        padding: 6px 10px;
    }

    .reader-toggle-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .reader-toggle-text strong {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-color, #fff);
    }

    .reader-sliders {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 6px;
        margin-bottom: 6px;
    }

    .reader-slider-row {
        display: grid;
        grid-template-columns: minmax(120px, 260px) 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 6px 12px;
    }

    .reader-slider-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-color, #fff);
    }

    .reader-slider {
        width: 100%;
        accent-color: var(--action-color, var(--interactive-color, #3498db));
        cursor: pointer;
    }

    .reader-slider-value {
        font-size: 12px;
        min-width: 4ch;
        text-align: right;
        opacity: 0.75;
        font-variant-numeric: tabular-nums;
        color: var(--text-color, #fff);
    }

    .reader-commands {
        padding-bottom: 8px;
    }

    @media (max-width: 520px) {
        .reader-slider-row {
            grid-template-columns: 1fr auto;
        }

        .reader-slider-label {
            grid-column: 1 / -1;
        }
    }

    .reader-toggle-desc {
        font-size: 12px;
        line-height: 1.4;
        color: var(--text-color, #fff);
        opacity: 0.7;
    }
</style>
