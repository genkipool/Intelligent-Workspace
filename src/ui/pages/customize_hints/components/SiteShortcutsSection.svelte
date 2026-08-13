<section class="section itg-manage-section">
    <div class="section-header">
        <h2 class="section-title" data-i18n="manageCustomSitesTitle">Manage Site Shortcuts</h2>
    </div>
    <form id="add-command-form" class="itg-manage-form">
        <div class="form-group-inline shortcuts-grid">
            <input
                type="text"
                id="command-keys"
                class="itg-manage-input"
                required
                autocomplete="off"
                spellcheck="false"
                data-i18n-placeholder="placeholderKey"
            />
            <input
                type="url"
                id="command-url"
                class="itg-manage-input"
                required
                autocomplete="off"
                spellcheck="false"
                data-i18n-placeholder="placeholderUrl"
            />
            <div class="command-description-wrapper">
                <div
                    id="command-desc"
                    class="itg-manage-input"
                    contenteditable="true"
                    data-i18n-placeholder="placeholderDesc"
                ></div>
            </div>
            <button type="submit" class="button add-btn" data-i18n-title="addCommandButton">+</button>
        </div>
    </form>
    <ul id="custom-commands-list" class="commands-list itg-manage-list"></ul>
    <p id="no-commands-message" class="no-commands-message" data-i18n="noCustomCommands"></p>
</section>
