<script>
    let { syncThemesCount = 0, localThemesCount = 0, maxSyncThemes = 20, maxLocalThemes = 30 } = $props();

    const COLOR_DOTS = [
        '#5F6368',
        '#1A73E8',
        '#D93025',
        '#F9AB00',
        '#188038',
        '#D01884',
        '#A142F4',
        '#007B83',
        '#FA903E',
    ];

    function openAboutPage(e) {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/about/about.html') });
    }
</script>

<div class="main-footer-wrapper">
    <footer class="storage-info-footer">
        <span id="storage-limits-info"
            >{`Sync: ${syncThemesCount}/${maxSyncThemes} | Local: ${localThemesCount}/${maxLocalThemes}`}</span
        >
    </footer>
    <a href="#" id="about-link-saved-themes" class="footer-link" onclick={openAboutPage}>
        <footer class="footer">
            <div>Intelligent Workspace v1.0.0</div>
            <div class="color-dots">
                {#each COLOR_DOTS as color (color)}
                    <div class="color-dot" style="background-color: {color};"></div>
                {/each}
            </div>
            <div data-i18n="developedBy"></div>
        </footer>
    </a>
</div>
