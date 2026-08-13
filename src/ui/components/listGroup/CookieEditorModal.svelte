<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import DateField from '../common/DateField.svelte';
    import TimeField from '../common/TimeField.svelte';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import ImportPanel from '../common/ImportPanel.svelte';

    /** @type {{ show: boolean, cookies: Array<{name: string, value: string, domain: string, path: string, expirationDate?: number, httpOnly: boolean, secure: boolean, sameSite: string}>, onClose: () => void, onSave: (cookies: Array) => void, onImport: () => void, onExport: () => void }} */
    let { show, cookies, onClose, onSave, onImport, onExport } = $props();

    // Internal state
    let searchQuery = $state('');
    let workingCookies = $state([]);
    let showImportPanel = $state(false);
    let importError = $state('');

    // Sync workingCookies with the cookies prop when the modal opens
    let wasPreviouslyShown = false;
    $effect(() => {
        if (show && !wasPreviouslyShown) {
            workingCookies = cookies.map((c) => ({ ...c }));
            searchQuery = '';
            showImportPanel = false;
            importError = '';
        }
        wasPreviouslyShown = show;
    });

    let filteredCookies = $derived.by(() => {
        if (!searchQuery.trim()) return workingCookies;
        const q = searchQuery.toLowerCase().trim();
        return workingCookies.filter((c) => c.name.toLowerCase().includes(q));
    });

    function addCookie() {
        workingCookies = [
            ...workingCookies,
            {
                name: '',
                value: '',
                domain: '',
                path: '/',
                expirationDate: undefined,
                httpOnly: false,
                secure: false,
                sameSite: 'lax',
            },
        ];
    }

    function deleteCookie(index) {
        workingCookies = workingCookies.filter((_, i) => i !== index);
    }

    function updateCookie(index, field, value) {
        workingCookies = workingCookies.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    }

    function resetCookies() {
        workingCookies = cookies.map((c) => ({ ...c }));
        searchQuery = '';
    }

    function handleSave() {
        onSave(workingCookies);
    }

    /** Cookie expiry is a unix timestamp; the shared fields work in date and time. */
    function expirationDate(cookie) {
        if (!cookie.expirationDate) return '';
        const d = new Date(cookie.expirationDate * 1000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function expirationTime(cookie) {
        if (!cookie.expirationDate) return '00:00';
        const d = new Date(cookie.expirationDate * 1000);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    function parseExpiration(date, time) {
        if (!date) return undefined;
        const ms = new Date(`${date}T${time || '00:00'}`).getTime();
        return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
    }

    // --- Import Panel Handlers ---

    function openImportPanel() {
        if (onImport) {
            onImport();
        } else {
            showImportPanel = true;
            importError = '';
        }
    }

    function closeImportPanel() {
        showImportPanel = false;
        importError = '';
        isDragging = false;
    }

    async function processImportFile(file) {
        if (file.type !== 'application/json') {
            importError = $t('invalidJsonFile');
            return;
        }

        try {
            const text = await file.text();
            const imported = JSON.parse(text);
            if (!Array.isArray(imported)) {
                importError = $t('invalidJsonFile');
                return;
            }

            // Validate and merge
            const validated = imported
                .filter((c) => c && typeof c.name === 'string' && typeof c.value === 'string')
                .map((c) => ({
                    name: c.name,
                    value: c.value,
                    domain: c.domain || '',
                    path: c.path || '/',
                    expirationDate: c.expirationDate,
                    httpOnly: !!c.httpOnly,
                    secure: !!c.secure,
                    sameSite: c.sameSite || 'lax',
                }));

            if (validated.length === 0) {
                importError = $t('noValidCookiesInFile');
                return;
            }

            // Merge imported over existing (keyed by name+domain+path)
            const mergedMap = new Map(workingCookies.map((c) => [c.name + c.domain + c.path, c]));
            validated.forEach((c) => mergedMap.set(c.name + c.domain + c.path, c));
            workingCookies = Array.from(mergedMap.values());
            closeImportPanel();
        } catch (err) {
            console.error('Error importing cookies:', err);
            importError = $t('errorImportingCookiesInvalid');
        }
    }

    // --- Export handler ---
    function handleExport() {
        if (onExport) {
            onExport();
        } else {
            // Default export via callback to parent
            try {
                const json = JSON.stringify(workingCookies, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'cookies-export.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error('Error exporting cookies:', err);
            }
        }
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-modal-title"
        tabindex="-1"
        use:dismissOnBackdrop={onClose}
    >
        {#if !showImportPanel}
            <!-- Cookie Editor Modal -->
            <div class="modal-content cookie-editor-modal">
                <div class="modal-header">
                    <h2 id="cookie-modal-title">{$t('cookieEditorTitle')}</h2>
                    <button class="close-modal-btn" title={$tt('close')} onclick={onClose}>&times;</button>
                </div>
                <div class="modal-body cookie-editor-body">
                    <div class="cookie-modal-actions-header">
                        <button id="export-cookies-btn" class="modal-btn-action" onclick={handleExport}
                            >{$t('export')}</button
                        >
                        <button id="import-cookies-btn" class="modal-btn-action" onclick={openImportPanel}
                            >{$t('import')}</button
                        >
                    </div>
                    <div class="cookie-search-container">
                        <label for="cookie-search-input">{$t('searchCookies')}</label>
                        <input
                            type="search"
                            id="cookie-search-input"
                            placeholder={$t('searchCookiePlaceholder')}
                            bind:value={searchQuery}
                        />
                    </div>
                    {#if filteredCookies.length === 0}
                        <!--
                            El original distingue "no hay cookies" (noCookiesFound) de
                            "el filtro no encuentra ninguna" (#no-cookies-found-msg).
                        -->
                        <p>{$t('noCookiesFound')}</p>
                        <p id="no-cookies-found-msg" class:hidden={!searchQuery.trim()}>
                            {$t('noCookiesFoundForSearch')}
                        </p>
                    {:else}
                        <div class="cookie-entries">
                            {#each filteredCookies as cookie, i (cookie.name + cookie.domain + cookie.path)}
                                <details class="cookie-entry-card" open>
                                    <summary>
                                        <span class="cookie-name">{cookie.name}</span>
                                        <button
                                            class="delete-cookie-btn action-btn"
                                            title={$tt('deleteCookie')}
                                            onclick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                deleteCookie(workingCookies.indexOf(cookie));
                                            }}>&times;</button
                                        >
                                    </summary>
                                    <div class="cookie-form-grid">
                                        <div class="form-group full-width">
                                            <div class="field-label">{$t('cookieValue')}</div>
                                            <textarea
                                                rows="3"
                                                class="cookie-value"
                                                value={cookie.value}
                                                oninput={(e) =>
                                                    updateCookie(
                                                        workingCookies.indexOf(cookie),
                                                        'value',
                                                        e.target.value,
                                                    )}
                                            ></textarea>
                                        </div>
                                        <div class="form-group">
                                            <div class="field-label">{$t('cookieDomain')}</div>
                                            <input
                                                type="text"
                                                class="cookie-domain"
                                                value={cookie.domain}
                                                oninput={(e) =>
                                                    updateCookie(
                                                        workingCookies.indexOf(cookie),
                                                        'domain',
                                                        e.target.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="form-group">
                                            <div class="field-label">{$t('cookiePath')}</div>
                                            <input
                                                type="text"
                                                class="cookie-path"
                                                value={cookie.path}
                                                oninput={(e) =>
                                                    updateCookie(
                                                        workingCookies.indexOf(cookie),
                                                        'path',
                                                        e.target.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="form-group">
                                            <div class="field-label">{$t('cookieExpiration')}</div>
                                            <div class="datetime-row">
                                                <DateField
                                                    value={expirationDate(cookie)}
                                                    allowPast={true}
                                                    onchange={(date) =>
                                                        updateCookie(
                                                            workingCookies.indexOf(cookie),
                                                            'expirationDate',
                                                            parseExpiration(date, expirationTime(cookie)),
                                                        )}
                                                />
                                                <TimeField
                                                    value={expirationTime(cookie)}
                                                    onchange={(time) =>
                                                        updateCookie(
                                                            workingCookies.indexOf(cookie),
                                                            'expirationDate',
                                                            parseExpiration(expirationDate(cookie), time),
                                                        )}
                                                />
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <div class="field-label">{$t('cookieSameSite')}</div>
                                            <select
                                                class="cookie-samesite"
                                                value={cookie.sameSite}
                                                onchange={(e) =>
                                                    updateCookie(
                                                        workingCookies.indexOf(cookie),
                                                        'sameSite',
                                                        e.target.value,
                                                    )}
                                            >
                                                <option value="no_restriction">None</option>
                                                <option value="lax">Lax</option>
                                                <option value="strict">Strict</option>
                                            </select>
                                        </div>
                                        <div class="form-group checkbox-group">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    class="cookie-httponly"
                                                    checked={cookie.httpOnly}
                                                    onchange={(e) =>
                                                        updateCookie(
                                                            workingCookies.indexOf(cookie),
                                                            'httpOnly',
                                                            e.target.checked,
                                                        )}
                                                />
                                                <span>{$t('cookieHttpOnly')}</span>
                                            </label>
                                        </div>
                                        <div class="form-group checkbox-group">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    class="cookie-secure"
                                                    checked={cookie.secure}
                                                    onchange={(e) =>
                                                        updateCookie(
                                                            workingCookies.indexOf(cookie),
                                                            'secure',
                                                            e.target.checked,
                                                        )}
                                                />
                                                <span>{$t('cookieSecure')}</span>
                                            </label>
                                        </div>
                                    </div>
                                </details>
                            {/each}
                        </div>
                    {/if}
                </div>
                <div class="modal-actions">
                    <button class="modal-btn-cancel modal-btn-reset" onclick={resetCookies}>{$t('reset')}</button>
                    <button class="modal-btn-save" onclick={handleSave}>{$t('save')}</button>
                </div>
            </div>
        {:else}
            <!-- Drag-and-Drop Import Panel -->
            <!-- Same panel the rules, bookmarks and themes imports use, so the
                 cookie import looks like every other one and keeps its cancel action. -->
            <ImportPanel
                show={true}
                sectionId="cookie-drag-drop-panel"
                sectionClass="cookie-import-panel"
                headerClass="header"
                headerTag="h1"
                titleKey="importCookiesTitle"
                titleClass="title-import-themes"
                dropTextKey="dragDropCookie"
                dropIcon="🍪"
                selectFileKey="selectCookieFile"
                fileInputId="cookie-file-input"
                backButtonId="back-from-cookie-import-btn"
                backTitleKey="backToCookieEditor"
                cancelButtonId="cancel-cookie-import-drop"
                cancelTitleKey="backToCookieEditor"
                onback={closeImportPanel}
                onfile={processImportFile}
            />
            {#if importError}
                <p class="import-error">{$t(importError)}</p>
            {/if}
        {/if}
    </div>
{/if}
