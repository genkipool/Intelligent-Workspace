<script>
    let { previewToggleTitle = '', linkPreviewEnabled = true, onToggleLinkPreview = () => {} } = $props();
</script>

<section class="section itg-manage-section blacklist-section">
    <div class="section-header">
        <div class="section-header-alignment">
            <h2 class="section-title" data-i18n="previewSectionTitle">Preview</h2>
            <!-- The blacklist decides where previews are suppressed; this switch
                 decides whether they happen at all. -->
            <label class="switch preview-toggle" id="link-preview-toggle-label" title={previewToggleTitle}>
                <input
                    type="checkbox"
                    id="link-preview-toggle"
                    tabindex="0"
                    aria-label={previewToggleTitle}
                    checked={linkPreviewEnabled}
                    onchange={onToggleLinkPreview}
                />
                <span class="slider"></span>
            </label>
        </div>
    </div>
    <ul
        id="blacklist-trigger-container"
        class="commands-list"
        style="padding: 0; margin-top: 8px; margin-bottom: 12px;"
    ></ul>
    <div class="manage-form-container">
        <div class="section-subtitle" data-i18n="managePreviewBlacklistTitle">Link Preview Blacklist</div>
        <div class="form-group-inline" style="display: flex; gap: 8px;">
            <input
                type="text"
                id="blacklist-domain"
                class="itg-manage-input"
                required
                autocomplete="off"
                spellcheck="false"
                data-i18n-placeholder="placeholderDomain"
                style="flex: 1;"
            />
            <button id="add-blacklist-btn" type="button" class="button add-btn">+</button>
        </div>
    </div>
    <ul id="blacklist-list" class="commands-list itg-manage-list"></ul>
</section>
