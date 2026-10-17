import { showNotification as notify, msg as localizedMsg, pluralKey } from './i18n.js';
import { sanitizeThemeColors } from './theme.js';
import { sanitizeNoteHtml } from './noteHtml.js';

// Strict definition of limits per command according to customize_hints.js
const COMMAND_LIMITS = {
    // Navigation and Scrolling (Limit: 1)
    hintDesc_j: 1,
    hintDesc_k: 1,
    hintDesc_h_tab: 1,
    hintDesc_l_tab: 1,
    hintDesc_d: 1,
    hintDesc_u: 1,

    // Page Actions (Limit: 2)
    hintDesc_r: 2,
    hintDesc_R: 2,
    hintDesc_h_tab_page: 2,
    hintDesc_l_tab_page: 2,
    hintDesc_at: 2,
    hintDesc_c: 2,
    hintDesc_vs: 2,
    hintDesc_vp: 2,
    hintDesc_bg: 2,
    hintDesc_br: 2,
    hintDesc_ar: 2,
    hintDesc_cs: 2,
    captureFullPageScroll: 2,
    captureFullPageSplit: 2,
    hintDesc_ca: 2,
    hintDesc_ao: 2,
    hintDesc_wp: 2,
    hintDesc_wv: 2,
    hintDesc_we: 2,

    // Tab Management (Limit: 2)
    hintDesc_t: 2,
    hintDesc_x: 2,
    hintDesc_yt: 2,
    hintDesc_s: 2,
    hintDesc_ts: 2,
    hintDesc_i: 2,
    hintDesc_o: 2,
    hintDesc_dg: 2,
    captureGroupTabsVisible: 2,
    captureGroupTabsFullPage: 2,
    captureGroupTabsFullPageParts: 2,
    hintDesc_so: 2,
    hintDesc_st: 2,
    hintDesc_ph: 2,
    hintDesc_pt: 2,
    hintDesc_pl: 2,
    hintDesc_pk: 2,
    hintDesc_ps: 2,
    hintDesc_pa: 2,
    hintDesc_pw: 2,
    hintDesc_pg: 2,
    hintDesc_pn: 2,

    // Hints Mode (Limit: 2)
    hintDesc_f: 2,
    hintDesc_cf: 2,

    // Site Shortcuts (Built-in) (Limit: 2)
    hintDesc_gy: 2,
    hintDesc_gm: 2,
    hintDesc_gp: 2,
    hintDesc_gx: 2,
    hintDesc_gi: 2,
    hintDesc_gu: 2,
    hintDesc_gc: 2,
    hintDesc_gg: 2,

    // Display Modes (Limit: 2)
    hintDesc_mb: 2,
    hintDesc_mB: 2,
    hintDesc_ms: 2,
    hintDesc_mS: 2,
    hintDesc_mp: 2,
    hintDesc_mP: 2,
    hintDesc_ml: 2,
    hintDesc_mL: 2,
    hintDesc_me: 2,
    hintDesc_mE: 2,

    // Omnibar Prefixes (Limit: 4)
    prefixSearchText: 4,
    prefixSearchBookmarks: 4,
    prefixSearchHistory: 4,
    prefixSearchRecentlyClosed: 4,
    prefixSearchGoogle: 4,
    prefixSearchYouTube: 4,
    prefixSearchDuckDuckGo: 4,
    prefixSearchWikipedia: 4,
    prefixDeleteGroup: 4,
    prefixDeleteTab: 4,
    prefixSplitTabs: 4,
    prefixSearchGoogleMaps: 4,
    prefixSearchX: 4,
    prefixSearchAmazon: 4,
    prefixSearchAmazonES: 4,
    prefixReadAloud: 4,
    omnibarPrefixSidePanelDesc: 4,
    omnibarPrefixCaptureVisibleDesc: 4,
    omnibarPrefixCaptureFullPageDesc: 4,
    omnibarPrefixCapturePartsDesc: 4,
    omnibarPrefixCaptureAreaDesc: 4,
    omnibarPrefixChangeRuleColor: 4,
    omnibarPrefixChangeGroupColor: 4,
};

/**
 * Exports an array of themes to a JSON file.
 * @param {Array<Object>} themes - The themes to export.
 * @param {string} fileName - The suggested file name.
 * @param {Object} utils - Utility functions { showNotification }.
 */
export async function exportThemes(themes, fileName, utils) {
    if (!themes || themes.length === 0) {
        utils.showNotification('noThemesToExport', true);
        return;
    }

    try {
        const json = JSON.stringify(themes, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        utils.showNotification(pluralKey('themesExportedSuccessfully', themes.length), false, [themes.length], true);
    } catch (error) {
        console.error('Error exporting themes:', error);
        utils.showNotification('errorExportingThemes', true);
    }
}

export async function processAndSaveImportedThemes(themesToImport, storage, maxThemes, utils) {
    try {
        if (themesToImport.length === 0) {
            utils.showNotification('errorImportingThemesInvalidFormat', true, true);
            return { success: false, importedCount: 0, themes: [] };
        }

        const { savedThemes: existingThemes = [] } = await storage.get('savedThemes');

        if (existingThemes.length + themesToImport.length > maxThemes) {
            utils.showNotification('maxThemesReached', true, [maxThemes]);
            return { success: false, importedCount: 0, themes: [] };
        }

        const lang = await utils.getCurrentLang();
        const messages = await utils.loadMessages(lang);
        const defaultName = messages.themeDefaultName?.message || 'Theme';

        const existingThemeNames = new Set(existingThemes.map((t) => t.name.toLowerCase()));
        const validNewThemes = [];
        let nextThemeNumber = existingThemes.length + 1;

        for (const theme of themesToImport) {
            const rawColors = theme.colors || theme;
            // Every theme value ends up as a CSS variable on every extension page, so only
            // keys holding a real CSS colour are kept; a file whose action colour is not one
            // is refused like any other malformed theme.
            const themeColors = rawColors && typeof rawColors === 'object' ? sanitizeThemeColors(rawColors) : null;
            if (!themeColors || !themeColors.actionColor) {
                utils.showNotification('errorImportingThemesInvalidFormat', true, true);
                continue;
            }

            let themeName = theme.name;
            if (themeName && themeName.length > 20) {
                utils.showNotification('themeNameTooLongError', true, [themeName], true);
                continue;
            }

            if (!themeName) {
                while (existingThemeNames.has(`${defaultName} ${nextThemeNumber}`.toLowerCase())) {
                    nextThemeNumber++;
                }
                themeName = `${defaultName} ${nextThemeNumber}`;
                nextThemeNumber++;
            }

            if (!existingThemeNames.has(themeName.toLowerCase())) {
                validNewThemes.push({ name: themeName, colors: themeColors });
                existingThemeNames.add(themeName.toLowerCase());
            } else {
                utils.showNotification('duplicateThemeNameInFile', true, [themeName], true);
            }
        }

        if (validNewThemes.length > 0) {
            const finalThemes = [...existingThemes, ...validNewThemes];
            await storage.set({ savedThemes: finalThemes });
            return { success: true, importedCount: validNewThemes.length, themes: validNewThemes };
        } else {
            return { success: false, importedCount: 0, themes: [] };
        }
    } catch (error) {
        console.error('Error processing and saving themes:', error);
        utils.showNotification('errorImportingThemesInvalidFormat', true, true);
        return { success: false, importedCount: 0, themes: [] };
    }
}

export function exportCookies(cookieElements, pageUrl, utils) {
    if (!cookieElements || cookieElements.length === 0) {
        utils.showNotification('noCookiesToExport', true);
        return;
    }

    const cookiesToExport = [];
    cookieElements.forEach((card) => {
        const dateTrigger = card.querySelector('.cookie-expiration-date-trigger');
        const timeTrigger = card.querySelector('.cookie-expiration-time-trigger');
        let expirationDate = null;
        if (dateTrigger && timeTrigger) {
            const dateVal = dateTrigger.dataset.selectedDate || '';
            if (dateVal && !dateTrigger.querySelector('.val-placeholder')) {
                const timeVal = timeTrigger.textContent.trim() || '00:00';
                const ms = new Date(`${dateVal}T${timeVal}:00`).getTime();
                if (!isNaN(ms)) expirationDate = Math.floor(ms / 1000);
            }
        }
        cookiesToExport.push({
            name: card.querySelector('.cookie-name').textContent,
            value: card.querySelector('.cookie-value').value,
            domain: card.querySelector('.cookie-domain').value,
            path: card.querySelector('.cookie-path').value,
            secure: card.querySelector('.cookie-secure').checked,
            httpOnly: card.querySelector('.cookie-httponly').checked,
            sameSite: card.querySelector('.cookie-samesite').value,
            expirationDate,
        });
    });

    try {
        const json = JSON.stringify(cookiesToExport, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const hostname = new URL(pageUrl).hostname;
        a.download = `cookies-${hostname}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting cookies:', error);
        utils.showNotification('errorExportingCookies', true);
    }
}

export function processCookieFile(file, originalCookies, utils) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedCookies = JSON.parse(event.target.result);
                if (!Array.isArray(importedCookies)) {
                    throw new Error('The imported JSON is not an array.');
                }

                const validatedCookies = [];
                for (const cookie of importedCookies) {
                    if (cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string') {
                        validatedCookies.push({
                            name: cookie.name,
                            value: cookie.value,
                            domain: cookie.domain || '',
                            path: cookie.path || '/',
                            expirationDate: cookie.expirationDate,
                            httpOnly: !!cookie.httpOnly,
                            secure: !!cookie.secure,
                            sameSite: cookie.sameSite,
                        });
                    }
                }

                if (validatedCookies.length === 0) {
                    utils.showNotification('noValidCookiesInFile', true);
                    return reject('No valid cookies found in file.');
                }

                // Merge: imported ones have priority over originals
                const mergedCookiesMap = new Map(originalCookies.map((c) => [c.name + c.domain + c.path, c]));
                validatedCookies.forEach((c) => mergedCookiesMap.set(c.name + c.domain + c.path, c));

                resolve(Array.from(mergedCookiesMap.values()));
            } catch (error) {
                console.error('Error processing imported cookie file:', error);
                utils.showNotification('errorImportingCookiesInvalid', true);
                reject(error);
            }
        };
        reader.onerror = (error) => {
            console.error('Error reading file:', error);
            utils.showNotification('errorReadingFile', true);
            reject(error);
        };
        reader.readAsText(file);
    });
}

export async function exportBookmarks() {
    try {
        const bookmarkTree = await chrome.bookmarks.getTree();
        if (!bookmarkTree || bookmarkTree.length === 0) {
            notify('noBookmarksToExport', true);
            return;
        }

        const json = JSON.stringify(bookmarkTree, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tab-group-bookmarks.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify('bookmarksExported');
    } catch (error) {
        console.error('Error exporting bookmarks:', error);
        notify('errorExportingBookmarks', true);
    }
}

async function parseAndValidateImportedBookmarks(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);

                // Case 1: Array (Full legacy export)
                if (Array.isArray(importedData)) {
                    if (!importedData[0] || !importedData[0].children) {
                        throw new Error('Invalid full tree format');
                    }
                    resolve({ type: 'full', data: importedData });
                }
                // Case 2: Object with children (New Folder Export)
                else if (typeof importedData === 'object' && importedData.children) {
                    resolve({ type: 'folder', data: importedData });
                } else {
                    throw new Error('Unknown JSON format');
                }
            } catch (error) {
                console.error('Error parsing bookmarks file:', error);
                notify('errorImportingBookmarksInvalid', true);
                reject(error);
            }
        };
        reader.onerror = () => {
            notify('errorReadingFile', true);
            reject('Error reading file');
        };
        reader.readAsText(file);
    });
}

export async function addImportedBookmarks(file) {
    try {
        const result = await parseAndValidateImportedBookmarks(file);

        chrome.runtime.sendMessage(
            {
                action: 'addImportedBookmarks',
                payload: {
                    bookmarks: result.data,
                    importType: result.type, // We send if it's 'full' or 'folder'
                },
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    notify('errorImportingBookmarks', true);
                    return;
                }
                if (!response.success) {
                    notify(response.errorKey || 'errorImportingBookmarks', true);
                }
            },
        );
        return true;
    } catch {
        return false;
    }
}

export async function overwriteBookmarks(file) {
    try {
        const result = await parseAndValidateImportedBookmarks(file);

        chrome.runtime.sendMessage(
            {
                action: 'overwriteBookmarks',
                payload: {
                    bookmarks: result.data,
                    importType: result.type, // We send if it's 'full' or 'folder'
                },
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    notify('errorOverwritingBookmarks', true);
                    return;
                }
                if (!response.success) {
                    notify(response.errorKey || 'errorOverwritingBookmarks', true);
                }
            },
        );
        return true;
    } catch {
        return false;
    }
}

export async function exportBookmarkFolder(folderNode, utils) {
    try {
        if (!folderNode) {
            if (utils && utils.showNotification) utils.showNotification('noBookmarksToExport', true);
            return;
        }

        // Convert folder node (which already contains its children) to JSON
        const json = JSON.stringify(folderNode, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;

        // We clean the folder name for the file name
        const safeName = (folderNode.title || 'folder').replace(/[/\\?%*:|"<>]/g, '-');
        a.download = `bookmarks-${safeName}.json`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (utils && utils.showNotification) {
            utils.showNotification('bookmarksExported');
        }
    } catch (error) {
        console.error('Error exporting folder:', error);
        if (utils && utils.showNotification) utils.showNotification('errorExportingBookmarks', true);
    }
}

// --- HINTS CONFIGURATION IMPORT/EXPORT ---

/**
 * Validates a single site shortcut object.
 * @param {Object} site
 * @returns {string|null} Error message or null if valid.
 */
function validateSiteShortcut(site) {
    if (!site || typeof site !== 'object') {
        return localizedMsg('val_invalid_obj') || 'Invalid object';
    }
    if (!site.keys || typeof site.keys !== 'string') {
        return localizedMsg('val_missing_keys') || 'Missing keys';
    }
    if (!site.url || typeof site.url !== 'string') {
        return localizedMsg('val_missing_url') || 'Missing URL';
    }

    // Limits
    if (site.keys.length > 20) {
        return localizedMsg('val_keys_too_long', [site.keys]) || `Key '${site.keys}' too long`;
    }
    if (site.url.length > 2000) {
        return localizedMsg('val_url_too_long', [site.keys]) || `URL for '${site.keys}' too long`;
    }
    if (site.description && site.description.length > 200) {
        return localizedMsg('val_desc_too_long', [site.keys]) || `Description for '${site.keys}' too long`;
    }

    return null;
}

/**
 * Validates a single snippet entry using localized messages.
 * @param {string} trigger
 * @param {string} expansion
 * @returns {string|null} Error message or null if valid.
 */
function validateSnippet(trigger, expansion) {
    if (!trigger || typeof trigger !== 'string') {
        return localizedMsg('val_invalid_trigger') || 'Invalid trigger';
    }

    let expansionText = expansion;
    if (typeof expansion === 'object') {
        if (!expansion.expansion || typeof expansion.expansion !== 'string') {
            return localizedMsg('val_invalid_expansion') || 'Invalid expansion object';
        }
        expansionText = expansion.expansion;

        if (expansion.variables && !Array.isArray(expansion.variables)) {
            return localizedMsg('val_invalid_variables');
        }
    } else if (typeof expansion !== 'string') {
        return localizedMsg('val_invalid_expansion') || 'Invalid expansion';
    }

    // Limits
    if (trigger.length > 5) {
        return localizedMsg('val_trigger_too_long', [trigger]);
    }
    if (expansionText.length > 5000) {
        return localizedMsg('val_expansion_too_long', [trigger]) || `Expansion for '${trigger}' too long`;
    }

    if (typeof expansion === 'object' && expansion.variables) {
        if (expansion.variables.length > 50) {
            return localizedMsg('val_too_many_variables', [trigger]);
        }
    }

    return null;
}

function validateOverride(key, value) {
    if (!key || typeof key !== 'string') {
        return localizedMsg('val_invalid_override_key') || 'Invalid override key';
    }
    if (typeof value !== 'string') {
        return localizedMsg('val_invalid_override_value') || 'Invalid override value';
    }

    // Determine the limit: Use COMMAND_LIMITS value or 4 by default
    const limit = typeof COMMAND_LIMITS !== 'undefined' && COMMAND_LIMITS[key] !== undefined ? COMMAND_LIMITS[key] : 4;

    if (value.length > limit) {
        // Markers: $1 = value, $2 = key, $3 = limit
        const errorMsg = localizedMsg('val_override_too_long', [value, key, limit.toString()]);

        return errorMsg || `Override '${value}' too long for key '${key}' (Max ${limit})`;
    }

    return null;
}

export async function exportHintsConfig(utils) {
    try {
        const storageData = await chrome.storage.sync.get([
            'userHintCommands', // Custom Sites: [{keys, url, description}, ...]
            'itg-user-snippets', // Snippets: { trigger: expansion, ... }
            'itg-ui-custom-shortcuts', // Built-in Overrides: { descriptionKey: customKey, ... }
            'linkPreviewTriggerKey', // Link preview trigger key
            'linkPreviewBlacklist', // Link preview blacklist
            'snippetPopupTriggerKey', // Snippet popup trigger key
        ]);

        const sites = storageData['userHintCommands'] || [];
        const snippets = storageData['itg-user-snippets'] || {};
        const overrides = storageData['itg-ui-custom-shortcuts'] || {};
        const linkPreviewTriggerKey = storageData['linkPreviewTriggerKey'] || '';
        const linkPreviewBlacklist = storageData['linkPreviewBlacklist'] || [];
        const snippetPopupTriggerKey = storageData['snippetPopupTriggerKey'] || '$$';

        const hasCustomConfig =
            sites.length > 0 ||
            Object.keys(snippets).length > 0 ||
            Object.keys(overrides).length > 0 ||
            Boolean(linkPreviewTriggerKey) ||
            snippetPopupTriggerKey !== '$$' ||
            (Array.isArray(linkPreviewBlacklist) && linkPreviewBlacklist.length > 0);

        if (!hasCustomConfig) {
            utils.showNotification('noConfigToExport', true);
            return;
        }

        const exportData = {
            type: 'itg-hints-config',
            version: 1,
            timestamp: Date.now(),
            data: {
                sites,
                snippets,
                overrides,
                linkPreviewTriggerKey,
                linkPreviewBlacklist,
                snippetPopupTriggerKey,
            },
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hints-config-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        utils.showNotification('configExported', false);
    } catch (error) {
        console.error('Error exporting hints config:', error);
        utils.showNotification('errorExportingConfig', true);
    }
}

export async function importHintsConfig(file, utils) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                let json;
                try {
                    json = JSON.parse(event.target.result);
                } catch {
                    // Translation: "Invalid JSON format"
                    const msg = localizedMsg('val_invalid_json_format') || 'Invalid JSON format';
                    throw new Error(msg);
                }

                if (!json || json.type !== 'itg-hints-config' || !json.data) {
                    // Translation: "Invalid file type (missing itg-hints-config type)"
                    const msg =
                        localizedMsg('val_invalid_file_type') || 'Invalid file type (missing itg-hints-config type)';
                    throw new Error(msg);
                }

                const {
                    sites = [],
                    snippets = {},
                    overrides = {},
                    linkPreviewTriggerKey = '',
                    linkPreviewBlacklist = [],
                    snippetPopupTriggerKey = '',
                } = json.data;
                const errors = [];

                if (Array.isArray(sites)) {
                    sites.forEach((site) => {
                        const err = validateSiteShortcut(site);
                        if (err) errors.push(localizedMsg('val_prefix_site', [err]));
                    });
                }

                if (typeof snippets === 'object') {
                    Object.entries(snippets).forEach(([trigger, expansion]) => {
                        const err = validateSnippet(trigger, expansion);
                        if (err) errors.push(localizedMsg('val_prefix_snippet', [err]));
                    });
                }

                // Overrides validation (Integrated to comply with specific limits per category)
                if (typeof overrides === 'object') {
                    Object.entries(overrides).forEach(([key, value]) => {
                        const err = validateOverride(key, value);
                        if (err) errors.push(localizedMsg('val_prefix_override', [err]));
                    });
                }

                if (errors.length > 0) {
                    const details = errors.slice(0, 2).join(', ') + (errors.length > 2 ? '...' : '');
                    // We send the key and parameter. showNotification handles the rest.
                    console.error(details);
                    utils.showNotification('importErrors', true, [details]);
                    resolve(false);
                    return;
                }

                // Saving logic...
                const currentData = await chrome.storage.sync.get([
                    'userHintCommands',
                    'itg-user-snippets',
                    'itg-ui-custom-shortcuts',
                ]);

                // The file may come from someone else and this HTML is rendered in the
                // editor and expanded into pages, so only its formatting is stored. The
                // editor's own cleaner keeps what the editor can produce (font sizes, font
                // colours); the note cleaner stands in where hint_common.js is not loaded.
                // Plain text (no tag at all) is stored exactly as written.
                const cleanHtml = (html) =>
                    typeof html !== 'string' || !/<[a-z!/?]/i.test(html)
                        ? html
                        : globalThis.HintCommon?.sanitizeHtml
                          ? globalThis.HintCommon.sanitizeHtml(html)
                          : sanitizeNoteHtml(html);
                const cleanSnippets = {};
                for (const [trigger, value] of Object.entries(snippets || {})) {
                    cleanSnippets[trigger] =
                        value && typeof value === 'object'
                            ? { ...value, expansion: cleanHtml(value.expansion) }
                            : cleanHtml(value);
                }

                const existingSites = currentData.userHintCommands || [];
                const sitesMap = new Map(existingSites.map((site) => [site.keys, site]));

                // Insert/Overwrite with imported sites
                sites.forEach((site) => {
                    sitesMap.set(
                        site.keys,
                        site && typeof site.description === 'string'
                            ? { ...site, description: cleanHtml(site.description) }
                            : site,
                    );
                });

                // Convert back to array
                const mergedSites = Array.from(sitesMap.values());

                const syncUpdates = {
                    userHintCommands: mergedSites, // Use the sanitized list
                    'itg-user-snippets': { ...(currentData['itg-user-snippets'] || {}), ...cleanSnippets },
                    'itg-ui-custom-shortcuts': { ...(currentData['itg-ui-custom-shortcuts'] || {}), ...overrides },
                };

                if (typeof linkPreviewTriggerKey === 'string') {
                    syncUpdates.linkPreviewTriggerKey = linkPreviewTriggerKey.trim().toLowerCase();
                    await chrome.storage.local.set({ linkPreviewTriggerKey: syncUpdates.linkPreviewTriggerKey });
                }

                if (typeof snippetPopupTriggerKey === 'string' && snippetPopupTriggerKey.trim()) {
                    syncUpdates.snippetPopupTriggerKey = snippetPopupTriggerKey.trim();
                    await chrome.storage.local.set({ snippetPopupTriggerKey: syncUpdates.snippetPopupTriggerKey });
                }

                if (Array.isArray(linkPreviewBlacklist)) {
                    syncUpdates.linkPreviewBlacklist = linkPreviewBlacklist;
                    await chrome.storage.local.set({ linkPreviewBlacklist });
                }

                await chrome.storage.sync.set(syncUpdates);

                chrome.runtime.sendMessage({ action: 'hintCommandsUpdated' });
                chrome.runtime.sendMessage({ action: 'snippetsUpdated' });
                if (syncUpdates.linkPreviewTriggerKey !== undefined) {
                    chrome.runtime.sendMessage({
                        action: 'linkPreviewTriggerKeyUpdated',
                        triggerKey: syncUpdates.linkPreviewTriggerKey,
                    });
                }
                if (syncUpdates.snippetPopupTriggerKey !== undefined) {
                    chrome.runtime.sendMessage({
                        action: 'snippetPopupTriggerKeyUpdated',
                        triggerKey: syncUpdates.snippetPopupTriggerKey,
                    });
                }

                utils.showNotification('configImported', false);
                resolve(true);
            } catch (error) {
                console.error('Import error:', error);

                // IMPORTANT: We build the detail message here
                const errorDetail = error.message || localizedMsg('unknownError') || 'Unknown error';

                // We call the notification passing the detail as parameter for $1
                // This will show: "Import errors: Invalid file type..."
                console.error(errorDetail);
                utils.showNotification('importErrors', true, [errorDetail]);

                resolve(false);
            }
        };
        reader.readAsText(file);
    });
}
