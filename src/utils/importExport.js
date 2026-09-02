import { showNotification as notify } from './i18n.js';

let elements;
let globals;
// Filled in by `initializeImportExport`, which nothing calls any more: the pages that
// used it are Svelte now and import these functions directly. Anything reached from
// those pages must therefore not go through `utils` — see the bookmark helpers below,
// which report through `notify` instead.
let utils;

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
    omnibarPrefixCaptureVisibleDesc: 4,
    omnibarPrefixCaptureFullPageDesc: 4,
    omnibarPrefixCapturePartsDesc: 4,
    omnibarPrefixCaptureAreaDesc: 4,
    omnibarPrefixChangeRuleColor: 4,
    omnibarPrefixChangeGroupColor: 4,
};

async function exportRules() {
    try {
        const data = await utils.getRuleStorage();
        const rulesToExport = data.customRules || [];
        if (rulesToExport.length === 0) {
            utils.showNotification('noRulesToExport', true);
            return;
        }
        const json = JSON.stringify(rulesToExport, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tab-group-rules.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        utils.showNotification('rulesExported');
    } catch (error) {
        console.error('Error exporting rules:', error);
        utils.showNotification('errorExportingRules', true);
    }
}

function showImportPopup() {
    if (!elements.importPopup) return;
    elements.importPopup.returnValue = '';

    if (elements.themeDragDropPanel && elements.themeDragDropPanel.style.display !== 'none') {
        hideDragDropImportPanel();
    }
    elements.importPopup.showModal();
    utils.applyTranslations();
}

function hideImportPopup() {
    if (!elements.importPopup) return;
    elements.importPopup.close();
}

async function parseAndValidateImportedRules(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedRules = JSON.parse(event.target.result);
                if (
                    !Array.isArray(importedRules) ||
                    !importedRules.every(
                        (r) =>
                            r &&
                            typeof r.name === 'string' &&
                            typeof r.color === 'string' &&
                            Array.isArray(r.urls) &&
                            typeof r.active === 'boolean',
                    )
                ) {
                    throw new Error('Invalid rule format in JSON file.');
                }
                const cleanedRules = importedRules.map((r) => ({
                    name: r.name,
                    color: r.color,
                    urls: r.urls.map((u) => String(u).trim()).filter((u) => u),
                    active: r.active ?? true,
                    isStarred: r.isStarred ?? false,
                }));

                const importedNames = cleanedRules.map((r) => r.name.trim().toLowerCase());
                const duplicateNamesInFile = importedNames.filter((name, idx) => importedNames.indexOf(name) !== idx);
                if (duplicateNamesInFile.length) {
                    utils.showNotification('duplicateRuleNameInFile', true, [duplicateNamesInFile.join(', ')], true);
                    reject('Duplicate rule names in file');
                    return;
                }

                for (const rule of cleanedRules) {
                    const validationResult = utils.validateDuplicateUrlsWithinRule(rule.urls, rule.name);
                    if (!validationResult.valid) {
                        utils.showNotification(validationResult.message, true, validationResult.params, true);
                        reject('Duplicate URLs within rule');
                        return;
                    }
                }

                resolve(cleanedRules);
            } catch (error) {
                console.error('Error parsing imported file:', error);
                utils.showNotification('errorImportingRulesInvalid', true);
                reject(error);
            }
        };
        reader.onerror = () => {
            console.error('Error reading file.');
            utils.showNotification('errorReadingFile', true);
            reject('Error reading file');
        };
        reader.readAsText(file);
    });
}

async function addImportedRules(file) {
    let success = false;
    try {
        const importedRules = await parseAndValidateImportedRules(file);
        const data = await utils.getRuleStorage();
        const existingRules = data.customRules || [];
        const existingRuleNames = new Set(existingRules.map((r) => r.name.trim().toLowerCase()));

        const rulesToAdd = [];
        const addedRuleNames = [];

        // Object to accumulate all validation errors
        const validationErrors = {
            longNames: new Set(),
            spaceNames: new Set(),
            duplicateNames: new Set(),
            urlConflicts: new Set(),
        };

        for (const importedRule of importedRules) {
            const importedNameLower = importedRule.name.trim().toLowerCase();
            let isValid = true;

            // --- START OF CHANGE ---
            // 1. Validate name length
            if (importedRule.name.length > 16) {
                validationErrors.longNames.add(importedRule.name);
                isValid = false;
            }

            // 2. Validate no spaces in name
            if (/\s/.test(importedRule.name)) {
                validationErrors.spaceNames.add(importedRule.name);
                isValid = false;
            }
            // --- END OF CHANGE ---

            // 3. Validate duplicates against existing rules
            if (existingRuleNames.has(importedNameLower)) {
                validationErrors.duplicateNames.add(importedRule.name);
                isValid = false;
            }

            // 4. Validate URL conflicts against existing rules and those to be added
            const potentialCombinedRules = [...existingRules, ...rulesToAdd];
            const urlValidation = utils.validateUrlsInOtherRules(importedRule.urls, potentialCombinedRules, null);
            if (!urlValidation.valid) {
                validationErrors.urlConflicts.add(`'${urlValidation.params[0]}' in rule '${urlValidation.params[1]}'`);
                isValid = false;
            }

            if (isValid) {
                rulesToAdd.push(importedRule);
                addedRuleNames.push(importedRule.name);
            }
        }

        // Show all accumulated error notifications (using the queue)
        if (validationErrors.longNames.size > 0) {
            const names = Array.from(validationErrors.longNames).join(', ');
            utils.showNotification('ruleNameTooLongError', true, [names], true);
        }
        if (validationErrors.spaceNames.size > 0) {
            const names = Array.from(validationErrors.spaceNames).join(', ');
            utils.showNotification('ruleNameNoSpacesError', true, [names], true);
        }
        if (validationErrors.duplicateNames.size > 0) {
            const names = Array.from(validationErrors.duplicateNames).join(', ');
            utils.showNotification('duplicateRuleNameInFile', true, [names], true);
        }
        if (validationErrors.urlConflicts.size > 0) {
            const conflicts = Array.from(validationErrors.urlConflicts).join('; ');
            utils.showNotification('urlInOtherRule', true, [conflicts, ''], true);
        }

        // Proceed to add only if there are valid rules to add
        if (rulesToAdd.length > 0) {
            const finalRules = [...existingRules, ...rulesToAdd];
            await utils.setRuleStorage(finalRules);
            globals.storageRules = finalRules;
            requestAnimationFrame(utils.loadRules);
            await utils.groupTabs();
            chrome.runtime.sendMessage({ action: 'rulesUpdated' });
            utils.showNotification('rulesAdded', false, [addedRuleNames.join(', ')], true);
            success = true;
        } else if (importedRules.length > 0) {
            utils.showNotification('noNewRulesAdded', true, [], true);
        }
    } catch (error) {
        console.error('Error adding rules:', error);
        // Parsing errors are already notified, no need for another generic notification
    }
    return success;
}
async function overwriteRules(file) {
    let success = false;
    try {
        const importedRules = await parseAndValidateImportedRules(file);
        let hasErrors = false;

        // 1. Validate name length
        const longRuleNames = importedRules.map((r) => r.name).filter((name) => name.length > 16);
        if (longRuleNames.length > 0) {
            utils.showNotification('ruleNameTooLongError', true, [longRuleNames.join(', ')], true);
            hasErrors = true;
        }

        // 2. Validate no spaces in names
        const spaceRuleNames = importedRules.map((r) => r.name).filter((name) => /\s/.test(name));
        if (spaceRuleNames.length > 0) {
            utils.showNotification('ruleNameNoSpacesError', true, [spaceRuleNames.join(', ')], true);
            hasErrors = true;
        }

        // 3. Validate duplicate URLs between rules WITHIN the file
        const allImportedUrlsNorm = importedRules.flatMap((r) => r.urls.map(utils.normalizeUrl));
        const uniqueImportedUrls = new Set(allImportedUrlsNorm);
        if (allImportedUrlsNorm.length !== uniqueImportedUrls.size) {
            const urlCounts = {};
            const crossRuleDuplicates = new Set();
            importedRules.forEach((r) => {
                const ruleUrlsNorm = new Set(r.urls.map(utils.normalizeUrl));
                ruleUrlsNorm.forEach((normUrl) => {
                    urlCounts[normUrl] = (urlCounts[normUrl] || 0) + 1;
                    if (urlCounts[normUrl] > 1) crossRuleDuplicates.add(normUrl);
                });
            });
            if (crossRuleDuplicates.size > 0) {
                const exampleUrl = importedRules
                    .find((r) => r.urls.some((u) => utils.normalizeUrl(u) === [...crossRuleDuplicates][0]))
                    ?.urls.find((u) => utils.normalizeUrl(u) === [...crossRuleDuplicates][0]);
                utils.showNotification(
                    'duplicateUrlsAcrossRulesFile',
                    true,
                    [exampleUrl || [...crossRuleDuplicates][0]],
                    true,
                );
                hasErrors = true;
            }
        }

        if (hasErrors) {
            return false;
        }

        await utils.setRuleStorage(importedRules);
        globals.storageRules = importedRules;
        requestAnimationFrame(utils.loadRules);
        await utils.groupTabs();
        chrome.runtime.sendMessage({ action: 'rulesUpdated' });
        utils.showNotification('rulesImported', false, [], true);
        success = true;
    } catch (error) {
        console.error('Error overwriting rules:', error);
        // No notification needed here, parseAndValidateImportedRules already does it.
    }
    return success;
}

function triggerImport(overwrite) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (overwrite) await overwriteRules(file);
            else await addImportedRules(file);
        }
    };
    input.click();
}

function showDragDropImportPanel(importAction) {
    if (elements.importPopup) elements.importPopup.close();
    if (elements.container) {
        elements.container.style.display = 'none';
    }
    if (elements.themeDragDropPanel) {
        elements.themeDragDropPanel.style.display = 'flex';
        elements.themeDragDropPanel.dataset.importAction = importAction;
        utils.applyTranslations();

        if (elements.themeFileInput) {
            setTimeout(() => {
                elements.themeFileInput.click();
            }, 100);
        }
    }
}

export function hideDragDropImportPanel() {
    if (elements.themeDragDropPanel) {
        elements.themeDragDropPanel.style.display = 'none';
        elements.themeDragDropPanel.removeAttribute('data-import-action');
        if (elements.themeFileInput) {
            elements.themeFileInput.value = '';
        }
    }
    if (elements.container) {
        elements.container.style.display = '';
    }

    if (utils.manageFooterPosition) {
        requestAnimationFrame(() => {
            utils.manageFooterPosition();
            if (utils.updateScrollButtons) {
                utils.updateScrollButtons();
            }
        });
    }
}

export function initializeImportExport(els, glbs, utls) {
    elements = els;
    globals = glbs;
    utils = utls;

    // Main button listeners
    if (elements.exportRulesBtn) {
        elements.exportRulesBtn.addEventListener('click', exportRules);
    }
    if (elements.importRulesBtn) {
        elements.importRulesBtn.addEventListener('click', showImportPopup);
    }

    // Import popup listeners
    if (elements.importPopup) {
        elements.importPopup.addEventListener('close', () => {
            const returnValue = elements.importPopup.returnValue;
            const isDragDropVisible =
                elements.themeDragDropPanel && elements.themeDragDropPanel.style.display !== 'none';
            if (!isDragDropVisible) {
                if (returnValue === 'add') triggerImport(false);
                else if (returnValue === 'overwrite') triggerImport(true);

                if (elements.container && elements.container.style.display === 'none') {
                    elements.container.style.display = 'block';
                }
            }
        });
    }
    if (elements.addRulesBtnInPopup) {
        elements.addRulesBtnInPopup.addEventListener('click', (e) => {
            if (window.matchMedia('(width <= 600px)').matches) {
                e.preventDefault();
                showDragDropImportPanel('add');
            }
        });
    }
    if (elements.overwriteRulesBtnInPopup) {
        elements.overwriteRulesBtnInPopup.addEventListener('click', (e) => {
            if (window.matchMedia('(width <= 600px)').matches) {
                e.preventDefault();
                showDragDropImportPanel('overwrite');
            }
        });
    }

    // Listeners for drag and drop panel
    if (elements.themeDropZone) {
        elements.themeDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.themeDropZone.classList.add('drag-over');
        });
        elements.themeDropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            elements.themeDropZone.classList.remove('drag-over');
        });
        elements.themeDropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            elements.themeDropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                const action = elements.themeDragDropPanel.dataset.importAction;
                const success = action === 'add' ? await addImportedRules(file) : await overwriteRules(file);
                if (success) hideDragDropImportPanel();
            }
        });
    }

    elements.themeDropZone.addEventListener('click', () => {
        if (elements.themeFileInput) {
            elements.themeFileInput.click();
        }
    });

    if (elements.themeFileInput) {
        elements.themeFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const action = elements.themeDragDropPanel.dataset.importAction;
                const success = action === 'add' ? await addImportedRules(file) : await overwriteRules(file);
                if (success) hideDragDropImportPanel();
                e.target.value = '';
            }
        });
    }
    if (elements.themeDragDropPanelBackButton) {
        elements.themeDragDropPanelBackButton.addEventListener('click', () => {
            hideDragDropImportPanel();
            showImportPopup();
        });
    }
    if (elements.themeDragDropPanelCancelButton) {
        elements.themeDragDropPanelCancelButton.addEventListener('click', () => {
            hideDragDropImportPanel();
            hideImportPopup();
        });
    }
}

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
        utils.showNotification('themesExportedSuccessfully', false, [themes.length], true);
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
            const themeColors = theme.colors || theme;
            if (typeof themeColors !== 'object' || !themeColors.actionColor) {
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
        return chrome.i18n.getMessage('val_invalid_obj') || 'Invalid object';
    }
    if (!site.keys || typeof site.keys !== 'string') {
        return chrome.i18n.getMessage('val_missing_keys') || 'Missing keys';
    }
    if (!site.url || typeof site.url !== 'string') {
        return chrome.i18n.getMessage('val_missing_url') || 'Missing URL';
    }

    // Limits
    if (site.keys.length > 20) {
        return chrome.i18n.getMessage('val_keys_too_long', [site.keys]) || `Key '${site.keys}' too long`;
    }
    if (site.url.length > 2000) {
        return chrome.i18n.getMessage('val_url_too_long', [site.keys]) || `URL for '${site.keys}' too long`;
    }
    if (site.description && site.description.length > 200) {
        return chrome.i18n.getMessage('val_desc_too_long', [site.keys]) || `Description for '${site.keys}' too long`;
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
        return chrome.i18n.getMessage('val_invalid_trigger') || 'Invalid trigger';
    }

    let expansionText = expansion;
    if (typeof expansion === 'object') {
        if (!expansion.expansion || typeof expansion.expansion !== 'string') {
            return chrome.i18n.getMessage('val_invalid_expansion') || 'Invalid expansion object';
        }
        expansionText = expansion.expansion;

        if (expansion.variables && !Array.isArray(expansion.variables)) {
            return 'Invalid variables format';
        }
    } else if (typeof expansion !== 'string') {
        return chrome.i18n.getMessage('val_invalid_expansion') || 'Invalid expansion';
    }

    // Limits
    if (trigger.length > 5) {
        return chrome.i18n.getMessage('val_trigger_too_long', [trigger]) || `Trigger '${trigger}' too long (Max 5)`;
    }
    if (expansionText.length > 5000) {
        return chrome.i18n.getMessage('val_expansion_too_long', [trigger]) || `Expansion for '${trigger}' too long`;
    }

    if (typeof expansion === 'object' && expansion.variables) {
        if (expansion.variables.length > 50) {
            return `Snippet '${trigger}' has too many variables (Max 50)`;
        }
    }

    return null;
}

function validateOverride(key, value) {
    if (!key || typeof key !== 'string') {
        return chrome.i18n.getMessage('val_invalid_override_key') || 'Invalid override key';
    }
    if (typeof value !== 'string') {
        return chrome.i18n.getMessage('val_invalid_override_value') || 'Invalid override value';
    }

    // Determine the limit: Use COMMAND_LIMITS value or 4 by default
    const limit = typeof COMMAND_LIMITS !== 'undefined' && COMMAND_LIMITS[key] !== undefined ? COMMAND_LIMITS[key] : 4;

    if (value.length > limit) {
        // Markers: $1 = value, $2 = key, $3 = limit
        const errorMsg = chrome.i18n.getMessage('val_override_too_long', [value, key, limit.toString()]);

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
                    const msg = chrome.i18n.getMessage('val_invalid_json_format') || 'Invalid JSON format';
                    throw new Error(msg);
                }

                if (!json || json.type !== 'itg-hints-config' || !json.data) {
                    // Translation: "Invalid file type (missing itg-hints-config type)"
                    const msg =
                        chrome.i18n.getMessage('val_invalid_file_type') ||
                        'Invalid file type (missing itg-hints-config type)';
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
                        if (err) errors.push(`Site: ${err}`);
                    });
                }

                if (typeof snippets === 'object') {
                    Object.entries(snippets).forEach(([trigger, expansion]) => {
                        const err = validateSnippet(trigger, expansion);
                        if (err) errors.push(`Snippet: ${err}`);
                    });
                }

                // Overrides validation (Integrated to comply with specific limits per category)
                if (typeof overrides === 'object') {
                    Object.entries(overrides).forEach(([key, value]) => {
                        const err = validateOverride(key, value);
                        if (err) errors.push(`Override: ${err}`);
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

                const existingSites = currentData.userHintCommands || [];
                const sitesMap = new Map(existingSites.map((site) => [site.keys, site]));

                // Insert/Overwrite with imported sites
                sites.forEach((site) => {
                    sitesMap.set(site.keys, site);
                });

                // Convert back to array
                const mergedSites = Array.from(sitesMap.values());

                const syncUpdates = {
                    userHintCommands: mergedSites, // Use the sanitized list
                    'itg-user-snippets': { ...(currentData['itg-user-snippets'] || {}), ...snippets },
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
                const errorDetail = error.message || 'Unknown error';

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
