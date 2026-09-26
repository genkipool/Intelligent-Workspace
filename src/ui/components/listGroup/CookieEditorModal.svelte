<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { SvelteMap } from 'svelte/reactivity';
    import DateField from '../common/DateField.svelte';
    import TimeField from '../common/TimeField.svelte';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import ImportPanel from '../common/ImportPanel.svelte';
    import { showNotification } from '../../../utils/i18n.js';
    import { tick } from 'svelte';

    /** @type {{ show: boolean, cookies: Array<{name: string, value: string, domain: string, path: string, expirationDate?: number, httpOnly: boolean, secure: boolean, sameSite: string}>, onClose: () => void, onSave: (cookies: Array) => void, onImport: () => void, onExport: () => void }} */
    let { show, cookies, onClose, onSave, onImport, onExport } = $props();

    // Internal state
    let searchQuery = $state('');
    let workingCookies = $state([]);
    let showImportPanel = $state(false);
    let importError = $state('');

    let cookieUidCounter = 0;
    function withCookieUid(cookie) {
        if (cookie._uid) return cookie;
        return { ...cookie, _uid: ++cookieUidCounter };
    }

    function cleanCookie(cookie) {
        const copy = { ...cookie };
        // A name typed for a new cookie is sent without stray spaces around it.
        if (copy._isNew) copy.name = copy.name.trim();
        delete copy._uid;
        delete copy._isNew;
        return copy;
    }

    // Sync workingCookies with the cookies prop when the modal opens
    let wasPreviouslyShown = false;
    $effect(() => {
        if (show && !wasPreviouslyShown) {
            workingCookies = cookies.map((c) => withCookieUid({ ...c }));
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

    /**
     * A blank cookie at the end of the list, created in the browser on save.
     *
     * Only a new cookie gets a name field: the name is part of what identifies a
     * cookie, so renaming an existing one would really be deleting it and making
     * another. The domain starts empty, which the worker turns into a host-only cookie
     * for the tab's own host — what a site setting it itself would get.
     */
    async function addCookie() {
        searchQuery = '';
        const cookie = withCookieUid({
            name: '',
            value: '',
            domain: '',
            path: '/',
            expirationDate: undefined,
            httpOnly: false,
            secure: false,
            sameSite: 'lax',
            _isNew: true,
        });
        workingCookies = [...workingCookies, cookie];
        await tick();
        const input = document.querySelector(`.cookie-entry-card[data-cookie-uid="${cookie._uid}"] .cookie-name-input`);
        input?.scrollIntoView({ block: 'nearest' });
        input?.focus();
    }

    function deleteCookie(index) {
        workingCookies = workingCookies.filter((_, i) => i !== index);
    }

    function updateCookie(index, field, value) {
        workingCookies = workingCookies.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    }

    function resetCookies() {
        workingCookies = cookies.map((c) => withCookieUid({ ...c }));
        searchQuery = '';
    }

    function handleSave() {
        const unnamed = workingCookies.find((c) => c._isNew && !c.name.trim());
        if (unnamed) {
            showNotification('cookieNameRequired', true);
            document.querySelector(`.cookie-entry-card[data-cookie-uid="${unnamed._uid}"] .cookie-name-input`)?.focus();
            return;
        }
        onSave(workingCookies.map(cleanCookie));
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
            const mergedMap = new SvelteMap(workingCookies.map((c) => [c.name + c.domain + c.path, c]));
            validated.forEach((c) => mergedMap.set(c.name + c.domain + c.path, withCookieUid(c)));
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
                const json = JSON.stringify(workingCookies.map(cleanCookie), null, 2);
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
                    <button type="button" class="close-modal-btn" title={$tt('close')} onclick={onClose}>&times;</button
                    >
                </div>
                <div class="modal-body cookie-editor-body">
                    <div class="cookie-modal-actions-header">
                        <button
                            type="button"
                            id="add-cookie-btn"
                            class="modal-btn-action"
                            title={$tt('addCookie')}
                            onclick={addCookie}>{$t('addCookie')}</button
                        >
                        <button type="button" id="export-cookies-btn" class="modal-btn-action" onclick={handleExport}
                            >{$t('export')}</button
                        >
                        <button type="button" id="import-cookies-btn" class="modal-btn-action" onclick={openImportPanel}
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
                            {#each filteredCookies as cookie, i (cookie._uid ?? i)}
                                <details
                                    class="cookie-entry-card header-with-controls"
                                    data-cookie-uid={cookie._uid}
                                    open
                                >
                                    <summary>
                                        <span class="header-main cookie-name"
                                            >{cookie._isNew && !cookie.name.trim()
                                                ? $t('newCookie')
                                                : cookie.name}</span
                                        >
                                    </summary>
                                    <!-- Controls follow the <summary> rather than sit in it: see header-with-controls. -->
                                    <button
                                        type="button"
                                        class="delete-cookie-btn action-btn header-controls"
                                        title={$tt('deleteCookie')}
                                        onclick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            deleteCookie(workingCookies.indexOf(cookie));
                                        }}>&times;</button
                                    >
                                    <div class="cookie-form-grid">
                                        {#if cookie._isNew}
                                            <div class="form-group full-width">
                                                <div class="field-label">{$t('cookieName')}</div>
                                                <input
                                                    type="text"
                                                    class="cookie-name-input"
                                                    spellcheck="false"
                                                    autocomplete="off"
                                                    value={cookie.name}
                                                    oninput={(e) =>
                                                        updateCookie(
                                                            workingCookies.indexOf(cookie),
                                                            'name',
                                                            e.target.value,
                                                        )}
                                                />
                                            </div>
                                        {/if}
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
                                                placeholder={cookie._isNew ? $t('cookieDomainHostOnly') : ''}
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
                                                <button type="button">
                                                    <selectedcontent></selectedcontent>
                                                    <svg
                                                        class="picker-icon"
                                                        width="10"
                                                        height="10"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        stroke-width="3"
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        aria-hidden="true"
                                                        focusable="false"
                                                    >
                                                        <path d="m6 9 6 6 6-6" />
                                                    </svg>
                                                </button>
                                                <option value="unspecified">{$t('cookieSameSiteUnspecified')}</option>
                                                <option value="no_restriction">None</option>
                                                <option value="lax">Lax</option>
                                                <option value="strict">Strict</option>
                                            </select>
                                        </div>
                                        <!-- Two toggles styled like the rest of the extension's
                                             selectable buttons. Each is still a checkbox, so the
                                             keyboard, screen readers and the save code that reads
                                             `.checked` all keep working. -->
                                        <div class="form-group full-width cookie-flags">
                                            {#each [['httpOnly', 'cookie-httponly', 'cookieHttpOnly'], ['secure', 'cookie-secure', 'cookieSecure']] as [field, inputClass, labelKey] (field)}
                                                <label class="cookie-flag" title={$tt(labelKey)}>
                                                    <input
                                                        type="checkbox"
                                                        class="{inputClass} visually-hidden"
                                                        checked={cookie[field]}
                                                        onchange={(e) =>
                                                            updateCookie(
                                                                workingCookies.indexOf(cookie),
                                                                field,
                                                                e.target.checked,
                                                            )}
                                                    />
                                                    <span>{$t(labelKey)}</span>
                                                    <svg
                                                        class="cookie-flag-check"
                                                        width="12"
                                                        height="12"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        stroke-width="3"
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        aria-hidden="true"
                                                        focusable="false"><path d="M20 6 9 17l-5-5" /></svg
                                                    >
                                                </label>
                                            {/each}
                                        </div>
                                    </div>
                                </details>
                            {/each}
                        </div>
                    {/if}
                </div>
                <div class="modal-actions">
                    <button type="button" class="modal-btn-cancel modal-btn-reset" onclick={resetCookies}
                        >{$t('reset')}</button
                    >
                    <button type="button" class="modal-btn-save" onclick={handleSave}>{$t('save')}</button>
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
                <p class="import-error">{importError}</p>
            {/if}
        {/if}
    </div>
{/if}
