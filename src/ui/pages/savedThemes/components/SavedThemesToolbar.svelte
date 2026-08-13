<script>
    let {
        currentStorageArea = 'sync',
        onSetStorageArea = () => {},
        onNavigate = () => {},
        onCreateTheme = () => {},
        onOpenSchedule = () => {},
        onExportThemes = () => {},
        onOpenImport = () => {},
    } = $props();
</script>

<div class="sticky-header">
    <header class="header">
        <h1 data-i18n="savedThemes"></h1>
        <div class="header-actions">
            <button
                type="button"
                id="storage-sync-btn"
                class="storage-btn"
                class:active={currentStorageArea === 'sync'}
                data-i18n-title="storageSyncSavedLimit"
                onclick={() => onSetStorageArea('sync')}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                        d="M12 16v-6m0 0-3 2m3-2 3 2m8 3a4 4 0 0 0-4.07-4A7.002 7.002 0 0 0 5.669 9.01 5 5 0 0 0 6 19h13a4 4 0 0 0 4-4"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
            <button
                type="button"
                id="storage-local-btn"
                class="storage-btn"
                class:active={currentStorageArea === 'local'}
                data-i18n-title="storageLocalSavedLimit"
                onclick={() => onSetStorageArea('local')}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                        d="m13 7-1.116-2.231c-.32-.642-.481-.963-.72-1.198a2 2 0 0 0-.748-.462C10.1 3 9.74 3 9.022 3H5.2c-1.12 0-1.68 0-2.108.218a2 2 0 0 0-.874.874C2 4.52 2 5.08 2 6.2V7m0 0h15.2c1.68 0 2.52 0 3.162.327a3 3 0 0 1 1.311 1.311C22 9.28 22 10.12 22 11.8v4.4c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311C19.72 21 18.88 21 17.2 21H6.8c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311C2 18.72 2 17.88 2 16.2zm7 7 3 3m0 0 3-3m-3 3v-6"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
            <button
                type="button"
                id="list-group-toggle"
                class="rules-button"
                data-i18n-title="listTabGroups"
                onclick={() => onNavigate('../listGroup/listGroup.html')}
            >
                <svg width="20" height="20" viewBox="0 0 512 512" fill="var(--text-color)">
                    <path
                        d="M136 24H16v120h120Zm-32 88H48V56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm72-440.002h320v32H176zm0 88h256v32H176zm0 88h320v32H176zm0 88h256v32H176zm0 176h256v32H176zm0-88h320v32H176z"
                    />
                </svg>
            </button>
            <button
                type="button"
                id="rules-toggle"
                class="rules-button"
                data-i18n-title="openRulesPage"
                onclick={() => onNavigate('../rules/rules.html')}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-color)"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <circle cx="2.5" cy="4" r="1.5" fill="var(--text-color)"></circle>
                    <circle cx="2.5" cy="12" r="1.5" fill="var(--text-color)"></circle>
                    <circle cx="2.5" cy="20" r="1.5" fill="var(--text-color)"></circle>
                    <path d="M9 4h13" stroke-width="3"></path>
                    <path d="M9 12h13" stroke-width="3"></path>
                    <path d="M9 20h13" stroke-width="3"></path>
                </svg>
            </button>
            <button
                type="button"
                id="home-btn"
                class="home-button"
                data-i18n-title="backToHome"
                onclick={() => onNavigate('../popup/popup.html')}
            >
                <svg width="20" height="20" viewBox="2 2 20 20" fill="var(--text-color)">
                    <path
                        fill-rule="evenodd"
                        clip-rule="evenodd"
                        d="m12 3.188 9.45 7.087-.45 1.35h-.75v8.625H3.75v-8.625H3l-.45-1.35zm-6.75 6.937v8.625h13.5v-8.625L12 5.063z"
                    />
                </svg>
            </button>
        </div>
    </header>
    <div class="theme-actions-container">
        <button
            type="button"
            id="create-theme-btn"
            class="theme-action"
            data-i18n="createThemeTitle"
            onclick={onCreateTheme}
        ></button>
        <button
            type="button"
            id="view-all-schedules-btn"
            class="theme-action"
            data-i18n="scheduleThemes"
            onclick={onOpenSchedule}
        ></button>
        <button type="button" id="export-themes-btn" class="theme-action" data-i18n="export" onclick={onExportThemes}
        ></button>
        <button type="button" id="import-themes-btn" class="theme-action" data-i18n="import" onclick={onOpenImport}
        ></button>
    </div>
</div>
