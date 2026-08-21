<section class="section itg-manage-section snippet-section">
    <div class="section-header">
        <div class="section-header-alignment">
            <h2 class="section-title" data-i18n="snippetMenuSectionTitle">Activar menú de Snippets</h2>
            <button id="snippet-help-btn" type="button" class="icon-btn help-btn" data-i18n-aria-label="help">
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                >
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            </button>
        </div>
    </div>
    <ul
        id="snippet-trigger-container"
        class="commands-list"
        style="padding: 0; margin-top: 8px; margin-bottom: 12px;"
    ></ul>
    <div class="manage-form-container">
        <div class="section-subtitle" data-i18n="manageSnippetsTitle">Configurar Snippets (Auto-completado)</div>
        <div class="form-group-inline snippet-form-row">
            <input
                type="text"
                id="snippet-trigger"
                class="itg-manage-input snippet-trigger-input"
                required
                autocomplete="off"
                spellcheck="false"
                data-i18n-placeholder="placeholderTrigger"
                maxlength="5"
            />

            <div class="snippet-expansion-wrapper">
                <div
                    id="snippet-expansion"
                    class="itg-manage-input snippet-expansion-input"
                    contenteditable="true"
                    data-i18n-placeholder="placeholderExpansion"
                ></div>
            </div>

            <div class="input-with-label snippet-var-count-container">
                <input
                    type="number"
                    id="snippet-var-count"
                    class="itg-manage-input snippet-var-count-input"
                    min="0"
                    max="50"
                    value="0"
                />
            </div>
            <button id="add-snippet-btn" type="button" class="button add-btn snippet-add-btn">+</button>
        </div>

        <div id="snippet-variables-container" class="snippet-vars-container"></div>

        <div class="snippet-preview-container itg-display-none">
            <span id="snippet-copy-preview"></span>
            <span id="snippet-copy-feedback" data-i18n="copied">Copied!</span>
            <button id="snippet-copy-btn" type="button"></button>
        </div>
    </div>
    <ul id="snippets-list" class="commands-list itg-manage-list"></ul>
</section>
