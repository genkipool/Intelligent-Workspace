/**
 * groups-renderer.js — Auto-extracted module from listGroup.js
 *
 * Functions: createPageModePopup, showQrCodeModal, isLikelyDomain, updateMuteButtonState, updateAudibleIndicatorTooltip, syncAllTabIndicators, handleRuleActionClick, openCookieEditorModal, saveCookieChanges, deleteAllUngroupedTabs, updateDuplicateCountBadge, scrollToActiveGroupIfNeeded, renderNotesButton, renderScreenshotButton, renderGroupTitle, renderTabCount, updateGroupElement, handleFocusAfterRender, showCookieImportPanel, hideCookieImportPanel, handleCookieFileImport, exportCookiesFromModal, handleBackupAllGroups, handleRestoreAllGroups, handleRestoreSingleTab, handleBackupGroup, createTabsInBatches, handleRestoreGroup, renderGroups, unGroupAndRemoveAllTabsInGroup, fetchData, makeGroupTitleEditable, handleTabActivation, createGroupElement, deleteAllTabsInGroup, deleteAllTabsInSubgroup, hideGroup, unhideGroup, togglePinState, initDragAndDrop, renderTabsForGroup, updateCounters, createTabElement, toggleColorPopup, positionColorPopup, closeColorPopup, moveSplitGroup, changeGroupColor, handleRemoveDuplicates
 */

import { applyTranslations, showNotification, getCurrentLang, loadMessages } from '../../../../utils/i18n.js';

import {
    saveBackupToDb,
    deleteBackupFromDb,
    getAllNoteIdsFromDb,
    getNoteFromDb,
    getAllScreenshotIdsFromDb,
    getScreenshotFromDb,
} from '../../../../utils/db.js';

import { dom } from './dom.js';
import { state, STORAGE_KEYS, noteConfig, screenshotConfig, colors } from './state.js';
import { getGroupInfoMap, getGroupPrefixState, animateAndRemove, correctFaviconUrl, dataUrlToBlob } from './utils.js';
import { fn } from './fn.js';
import { listGroupStore } from '../../stores/listGroupStore.js';
import { prefetchUrl } from './prefetch.js';

export function createPageModePopup(container, tabEl, pageModes) {
    let popupEl = null;
    let hideTimeout;

    const removePopup = () => {
        if (popupEl) {
            // Use a class for the exit animation
            popupEl.classList.remove('visible');
            setTimeout(() => {
                if (popupEl) {
                    popupEl.remove();
                    popupEl = null;
                }
            }, 200); // Matches the transition duration
        }
    };

    const showPopup = () => {
        clearTimeout(hideTimeout);
        if (popupEl) return;

        const popupTemplate = document.getElementById('page-mode-popup-template');
        popupEl = popupTemplate.content.cloneNode(true).firstElementChild;

        const tabId = parseInt(tabEl.dataset.tabId, 10);
        const tabMode = pageModes.tabModes[tabId];
        const globalMode = pageModes.globalMode;
        const effectiveMode = tabMode !== undefined ? tabMode : globalMode;

        popupEl.querySelectorAll('.page-mode-item').forEach((item) => {
            if (item.dataset.mode === effectiveMode) {
                item.classList.add('active');
            }

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const mode = item.dataset.mode;

                if (!isNaN(tabId)) {
                    chrome.runtime.sendMessage(
                        {
                            action: 'setPageMode',
                            mode: mode,
                            scope: 'tab',
                            tabId: tabId,
                        },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                console.error('Error sending setPageMode message:', chrome.runtime.lastError.message);
                                showNotification('errorApplyingMode', true);
                            } else if (response && response.success) {
                                showNotification('modeAppliedSuccessfully', false, [item.textContent]);
                                renderGroups();
                            }
                        },
                    );
                }
                removePopup();
            });
        });

        container.appendChild(popupEl);

        // Force reflow for the animation to work
        requestAnimationFrame(() => {
            popupEl.classList.add('visible');
        });
        applyTranslations(popupEl);
    };

    container.addEventListener('mouseenter', showPopup);
    container.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(removePopup, 200);
    });
}

export function showQrCodeModal(url) {
    // If a modal already exists, do nothing to avoid duplicates
    if (document.querySelector('.modal-overlay')) return;

    const modalTemplate = document.getElementById('qr-code-modal-template');
    const modalClone = modalTemplate.content.cloneNode(true);
    const modalOverlay = modalClone.querySelector('.modal-overlay');
    document.body.appendChild(modalOverlay);

    const qrContainer = modalOverlay.querySelector('#qrcode-container');
    const urlDisplay = modalOverlay.querySelector('#qrcode-url-display');
    const closeBtn = modalOverlay.querySelector('.close-modal-btn');

    // Function to close and remove the modal
    const closeModal = () => {
        modalOverlay.remove();
    };

    // Assign closure events
    closeBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    // 1. Array with the IDs of the SVG templates you added to the HTML.
    const logoIds = ['dino-svg', 'logo-svg-1', 'logo-svg-2', 'logo-svg-3'];

    // 2. Choose a random ID from the array.
    const randomId = logoIds[Math.floor(Math.random() * logoIds.length)];

    // 3. Get the SVG content from the template and convert it to a Data URI.
    const svgTemplate = document.getElementById(randomId);
    const svgString = svgTemplate.innerHTML;
    const randomSvgUri = 'data:image/svg+xml;base64,' + btoa(svgString);

    // 4. Generate the QR code with the new library and the random logo.
    const qrCode = new QRCodeStyling({
        width: 256,
        height: 256,
        data: url,
        image: randomSvgUri, // We use the random SVG image
        dotsOptions: {
            color: '#000000',
            type: 'rounded',
        },
        backgroundOptions: {
            color: '#ffffff', // White background for maximum compatibility
        },
        cornersSquareOptions: {
            type: 'extra-rounded',
        },
        imageOptions: {
            imageSize: 0.4, // The logo will occupy 40%
            margin: 4, // A small margin around the logo
        },
    });

    // The new library needs to add the QR to a DOM element.
    qrContainer.innerHTML = ''; // We clear the container just in case.
    qrCode.append(qrContainer);

    // Show URL below the QR code
    urlDisplay.textContent = url;

    // Apply translations for the modal title
    if (modalOverlay) {
        applyTranslations(modalOverlay);
    } else {
        applyTranslations();
    }
}

export function isLikelyDomain(str) {
    return !str.includes(' ') && str.includes('.');
}

export async function getValidStandardTabs() {
    const allWindows = await chrome.windows.getAll({ populate: true });
    const validWindows = allWindows.filter((win) => win.type === 'normal' && !win.alwaysOnTop);
    return validWindows.flatMap((win) => win.tabs || []);
}

export async function updateMuteButtonState() {
    const btn = document.getElementById('mute-all-tabs-btn');
    if (!btn) return;
    const iconSpeaker = btn.querySelector('.icon-speaker');
    const iconMuted = btn.querySelector('.icon-speaker-muted');

    const allTabs = await getValidStandardTabs();
    // audible: tab is producing unmuted audio output
    const audibleUnmuted = allTabs.filter((t) => t.audible && !(t.mutedInfo && t.mutedInfo.muted));
    // muted: tab has been explicitly muted (was likely audible before)
    const explicitlyMuted = allTabs.filter((t) => t.mutedInfo && t.mutedInfo.muted);

    const hasAudibleUnmuted = audibleUnmuted.length > 0;
    const hasMuted = explicitlyMuted.length > 0;

    if (!hasAudibleUnmuted && !hasMuted) {
        btn.classList.add('hidden');
        return;
    }

    btn.classList.remove('hidden');

    if (!hasAudibleUnmuted && hasMuted) {
        // All audio activity is muted → show muted icon
        iconSpeaker.classList.add('hidden');
        iconMuted.classList.remove('hidden');
        btn.title = chrome.i18n.getMessage('unmuteAllTabs');
    } else {
        // Some tabs still producing sound → show speaker icon
        iconSpeaker.classList.remove('hidden');
        iconMuted.classList.add('hidden');
        btn.title = chrome.i18n.getMessage('muteAllTabs');
    }
}

export async function updateAudibleIndicatorTooltip(indicator, isMuted) {
    const key = isMuted ? 'toggleMuteUnmute' : 'toggleMuteMute';
    indicator.dataset.i18nTitle = key;
    const lang = await getCurrentLang();
    const messages = await loadMessages(lang);
    const msg = messages[key];
    if (msg) indicator.title = msg.description || msg.message || '';
}

export function syncAllTabIndicators(forceMuted) {
    // Update all visible per-tab audible-indicator elements
    document.querySelectorAll('.audible-indicator').forEach((indicator) => {
        indicator.classList.toggle('muted', forceMuted);
        updateAudibleIndicatorTooltip(indicator, forceMuted);
    });
}

export function handleRuleActionClick(e) {
    const createRuleTarget = e.target.closest('.create-rule-btn');
    if (createRuleTarget) {
        e.stopPropagation();
        e.preventDefault();

        // We look if the click comes from a subgroup (specific domain) or from a full group header
        const subGroup = createRuleTarget.closest('.domain-subgroup');
        const groupItem = createRuleTarget.closest('.group-item');
        const bookmarkFolder = createRuleTarget.closest('.bookmark-folder');
        const bookmarkItem = createRuleTarget.closest('.bookmark-item');

        let urlsArray = [];
        let ruleName = '';

        if (subGroup) {
            // SUBGROUP CONTEXT: Tabs within the specific domain
            const tabs = subGroup.querySelectorAll('.tab-item');
            urlsArray = Array.from(tabs).map((t) => t.dataset.url);
            ruleName = subGroup.querySelector('.domain-title').textContent.trim();
        } else if (groupItem) {
            // GROUP CONTEXT: All tabs in the group (can be from multiple domains)
            const tabs = groupItem.querySelectorAll('.tab-item');
            urlsArray = Array.from(tabs).map((t) => t.dataset.url);
            const titleEl = groupItem.querySelector('.group-title');
            // We prefer dataset.baseName because it is already clean of invisible prefixes and emojis
            ruleName = titleEl.dataset.baseName || titleEl.textContent.trim();
        } else if (bookmarkFolder) {
            // BOOKMARKS CONTEXT: Full folder
            const bookmarks = bookmarkFolder.querySelectorAll('.bookmark-title');
            urlsArray = Array.from(bookmarks).map(
                (b) => b.title.split('\n')[1] || b.closest('.bookmark-item').dataset.url || '',
            );
            ruleName = bookmarkFolder.querySelector('.folder-name').textContent.trim();
        } else if (bookmarkItem && !bookmarkItem.classList.contains('bookmark-folder')) {
            // BOOKMARKS CONTEXT: Individual bookmark
            urlsArray = [bookmarkItem.querySelector('.bookmark-title').title.split('\n')[1] || ''];
            ruleName = bookmarkItem.querySelector('.bookmark-title').textContent.trim();
        }

        // DATA CLEANUP: Unique URLs without duplicates and empty filtering
        const uniqueUrls = [...new Set(urlsArray)]
            .map((url) => url.trim())
            .filter((url) => url !== '')
            .join('\n');

        // Final cleanup of the name: we remove zero-width control characters (\u200B)
        const cleanRuleName = ruleName.replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();

        if (uniqueUrls.length > 0) {
            const encodedUrl = encodeURIComponent(uniqueUrls);
            const encodedName = encodeURIComponent(cleanRuleName);

            const currentPage = window.location.pathname.split('/').pop();
            // We save the source so the "Back" button knows how to return to the current view
            chrome.storage.local.set({ navSource: `../listGroup/${currentPage}?view=${state.currentMainView}` }, () => {
                // We redirect to the rules page passing the required parameters
                window.location.href = `../rules/rules.html?action=create&url=${encodedUrl}&name=${encodedName}&returnTo=listGroup`;
            });
        }
    }
    const addToRuleTarget = e.target.closest('.add-to-rule-btn');
    if (addToRuleTarget) {
        e.stopPropagation();
        e.preventDefault();

        const tabItem = addToRuleTarget.closest('.tab-item');
        const subGroup = addToRuleTarget.closest('.domain-subgroup');
        const groupItem = addToRuleTarget.closest('.group-item');
        const bookmarkFolder = addToRuleTarget.closest('.bookmark-folder');
        const bookmarkItem = addToRuleTarget.closest('.bookmark-item');

        let url = '';
        let title = '';

        if (tabItem) {
            url = tabItem.dataset.url;
            title = tabItem.querySelector('.tab-title').textContent;
        } else if (subGroup) {
            const tabs = subGroup.querySelectorAll('.tab-item');
            url = Array.from(tabs)
                .map((t) => t.dataset.url)
                .join('\n');
            title = subGroup.querySelector('.domain-title').textContent;
        } else if (groupItem) {
            const tabs = groupItem.querySelectorAll('.tab-item');
            url = Array.from(tabs)
                .map((t) => t.dataset.url)
                .join('\n');
            title =
                groupItem.querySelector('.group-title').dataset.baseName ||
                groupItem.querySelector('.group-title').textContent;
        } else if (bookmarkFolder) {
            const bookmarks = bookmarkFolder.querySelectorAll('.bookmark-title');
            url = Array.from(bookmarks)
                .map((b) => b.title.split('\n')[1] || '')
                .filter((u) => u !== '')
                .join('\n');
            title = bookmarkFolder.querySelector('.folder-name').textContent;
        } else if (bookmarkItem && !bookmarkItem.classList.contains('bookmark-folder')) {
            url = bookmarkItem.querySelector('.bookmark-title').title.split('\n')[1] || '';
            title = bookmarkItem.querySelector('.bookmark-title').textContent;
        }

        if (url) {
            fn.showAddToRuleModal(url, title);
        }
    }
}

let cookiePickerState = null;

export function readCookieExpirationFromCard(card) {
    const dateTrigger = card.querySelector('.cookie-expiration-date-trigger');
    const timeTrigger = card.querySelector('.cookie-expiration-time-trigger');
    if (!dateTrigger || !timeTrigger) return undefined;
    const dateVal = dateTrigger.dataset.selectedDate || '';
    if (!dateVal || dateTrigger.querySelector('.val-placeholder')) return undefined;
    const timeVal = timeTrigger.textContent.trim() || '00:00';
    const ms = new Date(`${dateVal}T${timeVal}:00`).getTime();
    return isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

function setCookieExpirationOnCard(card, expirationUnix) {
    const dateTrigger = card.querySelector('.cookie-expiration-date-trigger');
    const timeTrigger = card.querySelector('.cookie-expiration-time-trigger');
    if (!dateTrigger || !timeTrigger) return;
    if (!expirationUnix) {
        delete dateTrigger.dataset.selectedDate;
        dateTrigger.innerHTML = '<span class="val-placeholder">YYYY-MM-DD</span>';
        timeTrigger.textContent = '00:00';
        return;
    }
    const d = new Date(expirationUnix * 1000);
    const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dateTrigger.dataset.selectedDate = formatted;
    dateTrigger.textContent = formatted;
    timeTrigger.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function destroyCookieDateTimePickers() {
    if (cookiePickerState?.abort) cookiePickerState.abort.abort();
    cookiePickerState = null;
    document.getElementById('cookie-custom-calendar-popup')?.classList.add('hidden');
    document.getElementById('cookie-custom-time-popup')?.classList.add('hidden');
}

function initCookieDateTimePickers(modalOverlay) {
    destroyCookieDateTimePickers();

    const calendarPopup = document.getElementById('cookie-custom-calendar-popup');
    const timePopup = document.getElementById('cookie-custom-time-popup');
    const inputHour = document.getElementById('cookie-input-hour');
    const inputMinute = document.getElementById('cookie-input-minute');
    if (!calendarPopup || !timePopup || !inputHour || !inputMinute) return;

    if (timePopup.parentElement !== document.body) document.body.appendChild(timePopup);
    if (calendarPopup.parentElement !== document.body) document.body.appendChild(calendarPopup);

    const abort = new AbortController();
    const signal = abort.signal;
    const state = {
        calCurrentDate: new Date(),
        activeTrigger: null,
        activePopup: null,
    };

    const monthNames = [
        chrome.i18n.getMessage('monthJanuary') || 'January',
        chrome.i18n.getMessage('monthFebruary') || 'February',
        chrome.i18n.getMessage('monthMarch') || 'March',
        chrome.i18n.getMessage('monthApril') || 'April',
        chrome.i18n.getMessage('monthMay') || 'May',
        chrome.i18n.getMessage('monthJune') || 'June',
        chrome.i18n.getMessage('monthJuly') || 'July',
        chrome.i18n.getMessage('monthAugust') || 'August',
        chrome.i18n.getMessage('monthSeptember') || 'September',
        chrome.i18n.getMessage('monthOctober') || 'October',
        chrome.i18n.getMessage('monthNovember') || 'November',
        chrome.i18n.getMessage('monthDecember') || 'December',
    ];

    const hidePopups = () => {
        calendarPopup.classList.add('hidden');
        timePopup.classList.add('hidden');
        state.activeTrigger = null;
        state.activePopup = null;
    };

    const updatePopupPosition = () => {
        if (!state.activeTrigger || !state.activePopup || state.activePopup.classList.contains('hidden')) return;
        const rect = state.activeTrigger.getBoundingClientRect();
        const popupWidth = state.activePopup.offsetWidth;
        const popupHeight = state.activePopup.offsetHeight;
        const padding = 5;
        let top = rect.bottom + padding;
        if (top + popupHeight > window.innerHeight) top = rect.top - popupHeight - padding;
        let left = rect.left;
        if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - padding;
        state.activePopup.style.top = `${top}px`;
        state.activePopup.style.left = `${Math.max(padding, left)}px`;
    };

    const renderCalendar = () => {
        const monthYearEl = calendarPopup.querySelector('#cookie-cal-month-year');
        const gridEl = calendarPopup.querySelector('#cookie-calendar-days-grid');
        const year = state.calCurrentDate.getFullYear();
        const month = state.calCurrentDate.getMonth();
        monthYearEl.textContent = `${monthNames[month]} ${year}`;
        gridEl.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const selectedDate = state.activeTrigger?.dataset?.selectedDate;
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day empty';
            fragment.appendChild(empty);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = day;
            const formatted = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            if (selectedDate === formatted) dayEl.classList.add('selected');
            dayEl.addEventListener(
                'click',
                (e) => {
                    e.stopPropagation();
                    state.activeTrigger.dataset.selectedDate = formatted;
                    state.activeTrigger.textContent = formatted;
                    hidePopups();
                },
                { signal },
            );
            fragment.appendChild(dayEl);
        }
        gridEl.appendChild(fragment);
    };

    const updateTimeTrigger = () => {
        if (!state.activeTrigger) return;
        let hh = inputHour.value.replace(/\D/g, '');
        let mm = inputMinute.value.replace(/\D/g, '');
        if (hh !== '' && parseInt(hh, 10) > 23) hh = '23';
        if (mm !== '' && parseInt(mm, 10) > 59) mm = '59';
        state.activeTrigger.textContent = `${hh.padStart(2, '0').slice(-2)}:${mm.padStart(2, '0').slice(-2)}`;
    };

    modalOverlay.addEventListener(
        'click',
        (e) => {
            const dateTrigger = e.target.closest('.cookie-expiration-date-trigger');
            const timeTrigger = e.target.closest('.cookie-expiration-time-trigger');
            if (dateTrigger) {
                e.stopPropagation();
                if (!calendarPopup.classList.contains('hidden') && state.activeTrigger === dateTrigger) {
                    hidePopups();
                    return;
                }
                timePopup.classList.add('hidden');
                state.activeTrigger = dateTrigger;
                state.activePopup = calendarPopup;
                calendarPopup.classList.remove('hidden');
                renderCalendar();
                requestAnimationFrame(() => updatePopupPosition());
                return;
            }
            if (timeTrigger) {
                e.stopPropagation();
                if (!timePopup.classList.contains('hidden') && state.activeTrigger === timeTrigger) {
                    hidePopups();
                    return;
                }
                calendarPopup.classList.add('hidden');
                state.activeTrigger = timeTrigger;
                state.activePopup = timePopup;
                const parts = timeTrigger.textContent.split(':');
                if (timeTrigger.textContent === '00:00') {
                    const now = new Date();
                    inputHour.value = String(now.getHours()).padStart(2, '0');
                    inputMinute.value = String(now.getMinutes()).padStart(2, '0');
                } else {
                    inputHour.value = parts[0] || '00';
                    inputMinute.value = parts[1] || '00';
                }
                timePopup.classList.remove('hidden');
                requestAnimationFrame(() => updatePopupPosition());
            }
        },
        { signal },
    );

    calendarPopup.querySelector('#cookie-cal-prev-btn').addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
            state.calCurrentDate.setMonth(state.calCurrentDate.getMonth() - 1);
            renderCalendar();
        },
        { signal },
    );
    calendarPopup.querySelector('#cookie-cal-next-btn').addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
            state.calCurrentDate.setMonth(state.calCurrentDate.getMonth() + 1);
            renderCalendar();
        },
        { signal },
    );
    calendarPopup.querySelector('#cookie-cal-clear-btn').addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
            if (state.activeTrigger?.classList.contains('cookie-expiration-date-trigger')) {
                delete state.activeTrigger.dataset.selectedDate;
                state.activeTrigger.innerHTML = '<span class="val-placeholder">YYYY-MM-DD</span>';
            }
            hidePopups();
        },
        { signal },
    );

    [inputHour, inputMinute].forEach((input) => {
        input.addEventListener(
            'input',
            (ev) => {
                let val = ev.target.value.replace(/\D/g, '');
                if (input === inputHour && parseInt(val, 10) > 23) val = '23';
                if (input === inputMinute && parseInt(val, 10) > 59) val = '59';
                ev.target.value = val;
                if (input === inputHour && val.length === 2) {
                    inputMinute.focus();
                    inputMinute.select();
                }
                updateTimeTrigger();
            },
            { signal },
        );
        input.addEventListener(
            'blur',
            () => {
                if (input.value === '') input.value = '00';
                input.value = input.value.padStart(2, '0');
                updateTimeTrigger();
            },
            { signal },
        );
    });

    timePopup.querySelectorAll('.time-arrow-btn').forEach((btn) => {
        btn.addEventListener(
            'click',
            (e) => {
                e.stopPropagation();
                const unit = btn.dataset.unit;
                const dir = btn.dataset.dir;
                if (unit === 'hour') {
                    let val = parseInt(inputHour.value, 10) || 0;
                    val = dir === 'up' ? (val + 1) % 24 : (val - 1 + 24) % 24;
                    inputHour.value = val.toString().padStart(2, '0');
                } else {
                    let val = parseInt(inputMinute.value, 10) || 0;
                    val = dir === 'up' ? (val + 1) % 60 : (val - 1 + 60) % 60;
                    inputMinute.value = val.toString().padStart(2, '0');
                }
                updateTimeTrigger();
            },
            { signal },
        );
    });

    document.addEventListener(
        'mousedown',
        (e) => {
            if (!modalOverlay.isConnected) return;
            if (calendarPopup.contains(e.target) || timePopup.contains(e.target)) return;
            if (e.target.closest('.cookie-expiration-date-trigger, .cookie-expiration-time-trigger')) return;
            hidePopups();
        },
        { signal },
    );

    cookiePickerState = { abort };
}

export async function openCookieEditorModal(url) {
    if (document.querySelector('.cookie-editor-modal')) return;

    const modalTemplate = document.getElementById('cookie-editor-modal-template');
    const cookieEntryTemplate = document.getElementById('cookie-entry-template');

    if (!modalTemplate || !cookieEntryTemplate) {
        console.error('One or more cookie modal templates were not found.');
        return;
    }

    const response = await chrome.runtime.sendMessage({ action: 'getCookiesForUrl', url });
    if (!response.success) {
        showNotification('errorFetchingCookies', true);
        console.error('Failed to fetch cookies:', response.error);
        return;
    }
    const originalCookies = response.cookies;

    const modalClone = modalTemplate.content.cloneNode(true);
    const modalOverlay = modalClone.querySelector('.modal-overlay');
    const modalContent = modalOverlay.querySelector('.modal-content');
    const body = modalContent.querySelector('.cookie-editor-body');
    const saveBtn = modalContent.querySelector('.modal-btn-save');
    const resetBtn = modalContent.querySelector('.modal-btn-reset');
    const closeBtn = modalContent.querySelector('.close-modal-btn');

    const searchInput = modalContent.querySelector('#cookie-search-input');
    // The declaration of noResultsMsg is kept here.
    const noResultsMsg = modalContent.querySelector('#no-cookies-found-msg');

    body.dataset.url = url;

    const importBtn = modalContent.querySelector('#import-cookies-btn');
    const exportBtn = modalContent.querySelector('#export-cookies-btn');

    const closeModal = () => {
        destroyCookieDateTimePickers();
        modalOverlay.remove();
        delete window.renderCookiesInModal;
    };

    const renderCookies = (cookiesToRender) => {
        body.querySelectorAll('.cookie-entry-card').forEach((card) => card.remove());
        const existingNoCookiesMsg = body.querySelector('p:not(#no-cookies-found-msg)');
        if (existingNoCookiesMsg) existingNoCookiesMsg.remove();

        if (cookiesToRender.length === 0) {
            const noCookiesMsgEl = document.createElement('p');
            noCookiesMsgEl.setAttribute('data-i18n', 'noCookiesFound');
            body.appendChild(noCookiesMsgEl);
            return;
        }

        cookiesToRender.forEach((cookie, index) => {
            const cardClone = cookieEntryTemplate.content.cloneNode(true);
            const card = cardClone.querySelector('.cookie-entry-card');

            card.querySelector('.cookie-name').textContent = cookie.name;
            card.querySelector('.cookie-value').value = cookie.value;
            card.querySelector('.cookie-domain').value = cookie.domain;
            card.querySelector('.cookie-path').value = cookie.path;

            setCookieExpirationOnCard(card, cookie.expirationDate || null);

            card.querySelector('.cookie-samesite').value = cookie.sameSite;

            const httpOnlyCheckbox = card.querySelector('.cookie-httponly');
            const secureCheckbox = card.querySelector('.cookie-secure');
            httpOnlyCheckbox.id = `httpOnly-${index}`;
            httpOnlyCheckbox.nextElementSibling.setAttribute('for', `httpOnly-${index}`);
            httpOnlyCheckbox.checked = cookie.httpOnly;
            secureCheckbox.id = `secure-${index}`;
            secureCheckbox.nextElementSibling.setAttribute('for', `secure-${index}`);
            secureCheckbox.checked = cookie.secure;

            card.querySelector('.delete-cookie-btn').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.remove();
            });

            body.appendChild(card);
        });
        applyTranslations(modalOverlay);
    };

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const allCards = body.querySelectorAll('.cookie-entry-card');
        let visibleCount = 0;

        allCards.forEach((card) => {
            const cookieName = card.querySelector('.cookie-name').textContent.toLowerCase();
            const isVisible = cookieName.includes(searchTerm);
            card.classList.toggle('hidden', !isVisible);
            if (isVisible) {
                visibleCount++;
            }
        });

        // A check is added to ensure that noResultsMsg exists before using it.
        if (noResultsMsg) {
            noResultsMsg.classList.toggle('hidden', visibleCount > 0 || allCards.length === 0);
        }
    });

    window.renderCookiesInModal = renderCookies;
    renderCookies(JSON.parse(JSON.stringify(originalCookies)));

    closeBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => e.target === modalOverlay && closeModal());
    resetBtn.addEventListener('click', () => {
        searchInput.value = '';
        renderCookies(JSON.parse(JSON.stringify(originalCookies)));
        searchInput.dispatchEvent(new Event('input'));
    });
    saveBtn.addEventListener('click', async () => {
        await saveCookieChanges(url, originalCookies, body);
        closeModal();
    });

    exportBtn.addEventListener('click', exportCookiesFromModal);

    importBtn.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 600px)').matches) {
            showCookieImportPanel();
        } else {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.onchange = (e) => handleCookieFileImport(e.target.files[0]);
            fileInput.click();
        }
    });

    document.body.appendChild(modalOverlay);
    initCookieDateTimePickers(modalOverlay);
    applyTranslations(modalOverlay);
}

export async function saveCookieChanges(url, originalCookies, modalBody) {
    const currentCookieElements = modalBody.querySelectorAll('.cookie-entry-card');
    const currentCookiesMap = new Map();
    const originalCookiesMap = new Map(originalCookies.map((c) => [c.name + c.domain + c.path, c]));

    currentCookieElements.forEach((card) => {
        const name = card.querySelector('.cookie-name').textContent;
        const domain = card.querySelector('.cookie-domain').value;
        const path = card.querySelector('.cookie-path').value;
        const cookie = {
            name,
            value: card.querySelector('.cookie-value').value,
            domain,
            path,
            secure: card.querySelector('.cookie-secure').checked,
            httpOnly: card.querySelector('.cookie-httponly').checked,
            sameSite: card.querySelector('.cookie-samesite').value,
            expirationDate: readCookieExpirationFromCard(card),
        };
        currentCookiesMap.set(name + domain + path, cookie);
    });

    const promises = [];

    // Identify cookies to delete
    for (const [key, originalCookie] of originalCookiesMap.entries()) {
        if (!currentCookiesMap.has(key)) {
            promises.push(chrome.runtime.sendMessage({ action: 'removeCookie', url, cookie: originalCookie }));
        }
    }

    // Identify cookies to add or update
    for (const [key, currentCookie] of currentCookiesMap.entries()) {
        const originalCookie = originalCookiesMap.get(key);
        // Compare the current object with the original to see if there are changes
        // A deeper comparison than just the value is needed
        const originalComparable = originalCookie
            ? {
                  ...originalCookie,
                  expirationDate: originalCookie.expirationDate ? Math.floor(originalCookie.expirationDate) : undefined,
              }
            : null;
        const currentComparable = {
            ...currentCookie,
            expirationDate: currentCookie.expirationDate ? Math.floor(currentCookie.expirationDate) : undefined,
        };
        // Remove properties that cannot be directly compared or are not relevant
        delete originalComparable?.hostOnly;
        delete originalComparable?.session;
        delete originalComparable?.storeId;
        if (!originalCookie || JSON.stringify(originalComparable) !== JSON.stringify(currentComparable)) {
            promises.push(chrome.runtime.sendMessage({ action: 'setCookie', url, cookie: currentCookie }));
        }
    }

    try {
        const results = await Promise.all(promises);
        const hasErrors = results.some((r) => r && r.success === false);

        if (hasErrors) {
            showNotification('errorUpdatingCookies', true);
            console.error(
                'Failed to save some cookie changes:',
                results.filter((r) => !r.success),
            );
        } else {
            showNotification('cookiesUpdated');
        }
    } catch (error) {
        showNotification('errorUpdatingCookies', true);
        console.error('Failed to save cookie changes:', error);
    }
}

export async function deleteAllUngroupedTabs() {
    try {
        // Find all tabs that do not belong to any group.
        const ungroupedTabs = await chrome.tabs.query({
            groupId: chrome.tabGroups.TAB_GROUP_ID_NONE,
        });
        // Filter the extension panel itself to avoid closing itself.
        const tabsToClose = ungroupedTabs.filter((tab) => !tab.url.startsWith('chrome-extension://'));

        if (tabsToClose.length > 0) {
            const tabIds = tabsToClose.map((t) => t.id);
            await chrome.tabs.remove(tabIds);
        }
    } catch (error) {
        console.error(`Error removing ungrouped tabs:`, error);
        showNotification('errorRemovingTabs', true);
    }
}

export async function updateDuplicateCountBadge() {
    if (!dom.duplicateBadge || !dom.removeDuplicatesBtn) return;

    // 1. Determine if we are in a relevant view (groups or bookmarks).
    const isGroupsViewActive =
        !state.isBookmarksViewActive &&
        !state.isGeminiViewActive &&
        !state.isNotesViewActive &&
        !state.isGalleryViewActive &&
        !state.isUrlViewActive;
    const isRelevantView = state.isBookmarksViewActive || isGroupsViewActive;

    // 2. If NOT in a relevant view, hide button and terminate execution.
    if (!isRelevantView) {
        dom.duplicateBadge.classList.add('hidden');
        dom.removeDuplicatesBtn.classList.add('hidden');
        return;
    }
    // 3. If in a relevant view, proceed to check for duplicates.
    // Button is NOT hidden here, waits for count result.
    const tooltipKey = state.isBookmarksViewActive ? 'removeDuplicateBookmarksTooltip' : 'removeDuplicateTabs';
    dom.removeDuplicatesBtn.setAttribute('data-i18n-title', tooltipKey);
    applyTranslations(dom.removeDuplicatesBtn);

    if (state.isBookmarksViewActive) {
        // Logic for bookmarks
        chrome.runtime.sendMessage({ action: 'getDuplicateBookmarkCount' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting duplicate bookmark count:', chrome.runtime.lastError.message);
                dom.duplicateBadge.classList.add('hidden');
                dom.removeDuplicatesBtn.classList.add('hidden');
                return;
            }

            const hasDuplicates = response && response.success && response.count > 0;

            if (hasDuplicates) {
                const duplicateCount = response.count;
                dom.duplicateBadge.textContent = duplicateCount > 999 ? '999+' : String(duplicateCount);
                dom.duplicateBadge.classList.remove('hidden');
                dom.removeDuplicatesBtn.classList.remove('hidden');
            } else {
                dom.duplicateBadge.classList.add('hidden');
                dom.removeDuplicatesBtn.classList.add('hidden');
            }
        });
    } else {
        // Tab groups view logic
        try {
            const groupInfoMap = await getGroupInfoMap();
            let splitGroupId = -1;
            for (const [id, info] of groupInfoMap.entries()) {
                if (info.type === 'manual' && info.key === 'Split') {
                    splitGroupId = id;
                    break;
                }
            }
            const tabs = await chrome.tabs.query({});
            const tabsForDuplicateCheck = tabs.filter((tab) => tab.groupId !== splitGroupId);
            const urlCounts = tabsForDuplicateCheck.reduce((acc, tab) => {
                if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
                    acc[tab.url] = (acc[tab.url] || 0) + 1;
                }
                return acc;
            }, {});

            const duplicateCount = Object.values(urlCounts).reduce((sum, count) => {
                return sum + (count > 1 ? count - 1 : 0);
            }, 0);

            if (duplicateCount > 0) {
                dom.duplicateBadge.textContent = duplicateCount > 999 ? '999+' : String(duplicateCount);
                dom.duplicateBadge.classList.remove('hidden');
                dom.removeDuplicatesBtn.classList.remove('hidden');
            } else {
                dom.duplicateBadge.classList.add('hidden');
                dom.removeDuplicatesBtn.classList.add('hidden');
            }
        } catch (e) {
            console.error('Error updating duplicate tab count dom.duplicateBadge:', e);
            dom.duplicateBadge.classList.add('hidden');
            dom.removeDuplicatesBtn.classList.add('hidden');
        }
    }
}

export function scrollToActiveGroupIfNeeded() {
    // Initial guards, unchanged.
    if (document.hasFocus() || state.isUrlViewActive || state.isGeminiViewActive) {
        return;
    }

    const activeTabEl = document.querySelector('.tab-item.active');
    const scrollableContainer = dom.groupListContainer; // Correct container is #groups-list

    if (!activeTabEl || !scrollableContainer) {
        return;
    }

    const parentGroup = activeTabEl.closest('details.group-item');
    if (!parentGroup) {
        return;
    }

    const parentSubgroup = activeTabEl.closest('details.domain-subgroup');

    // Open 'details' so calculations are correct, unchanged.
    if (parentSubgroup && !parentSubgroup.open) {
        parentSubgroup.open = true;
    }
    if (parentGroup && !parentGroup.open) {
        parentGroup.open = true;
    }

    // Use requestAnimationFrame to ensure DOM has updated.
    requestAnimationFrame(() => {
        const containerRect = scrollableContainer.getBoundingClientRect();
        const tabRect = activeTabEl.getBoundingClientRect();

        // 1. CHECK VISIBILITY (Adapted logic)
        // The tab is visible if it is completely within the scroll area.
        const isTabVisible = tabRect.top >= containerRect.top && tabRect.bottom <= containerRect.bottom;

        // If everything is already visible correctly, do nothing.
        if (isTabVisible) {
            return;
        }

        // 2. POSITION CALCULATIONS (Adapted logic)
        // Calculate absolute positions within total scroll content.
        const tabScrollOffset = tabRect.top - containerRect.top + scrollableContainer.scrollTop;
        const groupRect = parentGroup.getBoundingClientRect();
        const groupScrollOffset = groupRect.top - containerRect.top + scrollableContainer.scrollTop;

        // Visible area is simply the scroll container height. No header to subtract.
        const visibleAreaHeight = scrollableContainer.clientHeight;

        let targetScrollTop;

        // 3. KEY DECISION LOGIC (Original logic, intact)
        // Height from group start to active tab bottom.
        const contentHeightUntilTabBottom = tabScrollOffset + activeTabEl.offsetHeight - groupScrollOffset;

        // Decide whether to prioritize tab or group based on whether everything fits.
        if (contentHeightUntilTabBottom > visibleAreaHeight) {
            // Group is too large to fit with the tab.
            // TAB PRIORITY: place it at the start of scroll.
            targetScrollTop = tabScrollOffset;
        } else {
            // There is enough space.
            // GROUP PRIORITY: place it at the start of scroll.
            targetScrollTop = groupScrollOffset;
        }

        // 4. EXECUTE SCROLL
        scrollableContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth',
        });
    });
}

export function renderNotesButton(actionsContainer, context, notesData) {
    const { type, id, secondaryId, title } = context;
    let totalNoteIds = new Set();

    if (type === 'group') {
        // Special key for ungrouped tabs group
        const groupKey = id === -100 ? 'g_ungrouped' : `g_${id}`;
        if (notesData[groupKey]) {
            notesData[groupKey].forEach((noteId) => totalNoteIds.add(noteId));
        }
        // Include subgroup notes as well
        const subgroupPrefix = id === -100 ? 's_ungrouped_' : `s_${id}_`;
        for (const key in notesData) {
            if (key.startsWith(subgroupPrefix)) {
                notesData[key].forEach((noteId) => totalNoteIds.add(noteId));
            }
        }
    } else {
        const key = secondaryId === -100 ? `s_ungrouped_${id}` : `s_${secondaryId}_${id}`;
        if (notesData[key]) {
            notesData[key].forEach((noteId) => totalNoteIds.add(noteId));
        }
    }
    const noteCount = totalNoteIds.size;
    let noteBtn = actionsContainer.querySelector('.view-notes-btn');

    if (!noteBtn) {
        const noteBtnTemplate = document.getElementById('add-note-btn-template');
        noteBtn = noteBtnTemplate.content.cloneNode(true).firstElementChild;
        noteBtn.addEventListener('click', (e) => {
            if (e.target.closest('.delete-notes-btn, .note-count-badge')) return;
            e.stopPropagation();
            e.preventDefault();
            fn.openNoteModal(context);
        });
        const copyBtn = actionsContainer.querySelector('.copy-group-urls-btn, .copy-subgroup-urls-btn');
        if (copyBtn) {
            actionsContainer.insertBefore(noteBtn, copyBtn);
        } else {
            actionsContainer.appendChild(noteBtn);
        }
    }

    const deleteBtn = noteBtn.querySelector('.delete-notes-btn');
    if (deleteBtn && !deleteBtn.dataset.listenersBound) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await fn.clearAllContextDataUI(context, noteConfig);
        });
        deleteBtn.dataset.listenersBound = 'true';
    }

    const noteCountBadge = noteBtn.querySelector('.note-count-badge');
    if (noteCountBadge && !noteCountBadge.dataset.listenersBound) {
        noteCountBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            fn.showNotesView(context);
        });
        noteCountBadge.dataset.listenersBound = 'true';
    }

    // 'has-notes' class is added or removed on the main button.
    if (noteCount > 0) {
        noteCountBadge.textContent = noteCount;
        noteCountBadge.classList.remove('hidden');
        noteBtn.classList.add('has-notes');
    } else {
        noteCountBadge.classList.add('hidden');
        noteBtn.classList.remove('has-notes');
    }
}

export function renderScreenshotButton(actionsContainer, context, screenshotData) {
    const { type, id, secondaryId, title } = context;
    let totalScreenshotIds = new Set();
    if (type === 'group') {
        const groupKey = id === -100 ? 'g_ungrouped' : `g_${id}`;
        if (screenshotData[groupKey]) {
            screenshotData[groupKey].forEach((screenshotId) => totalScreenshotIds.add(screenshotId));
        }
        // Include subgroup screenshots as well
        const subgroupPrefix = id === -100 ? 's_ungrouped_' : `s_${id}_`;
        for (const key in screenshotData) {
            if (key.startsWith(subgroupPrefix)) {
                screenshotData[key].forEach((screenshotId) => totalScreenshotIds.add(screenshotId));
            }
        }
    } else {
        // type === 'subgroup'
        const key = secondaryId === -100 ? `s_ungrouped_${id}` : `s_${secondaryId}_${id}`;
        if (screenshotData[key]) {
            screenshotData[key].forEach((screenshotId) => totalScreenshotIds.add(screenshotId));
        }
    }
    const screenshotCount = totalScreenshotIds.size;
    let galleryBtn = actionsContainer.querySelector('.view-screenshots-btn');

    if (screenshotCount > 0) {
        if (!galleryBtn) {
            const galleryBtnTemplate = document.getElementById('view-screenshots-btn-template');
            galleryBtn = galleryBtnTemplate.content.cloneNode(true).firstElementChild;

            galleryBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                fn.showScreenshotGallery(type, id, secondaryId || title);
            });

            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'delete-screenshots-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = chrome.i18n.getMessage('deleteAllScreenshotsContext') || 'Eliminar todas las capturas';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                // preventDefault is not needed here as stopPropagation is usually enough,
                // but it doesn't hurt to add it if you notice issues.
                e.preventDefault();
                await fn.clearAllContextDataUI({ type, id, secondaryId }, screenshotConfig);
            });
            galleryBtn.appendChild(deleteBtn);
            actionsContainer.prepend(galleryBtn);
        }

        galleryBtn.classList.remove('hidden');
        galleryBtn.querySelector('.screenshot-count-badge').textContent = screenshotCount;
    } else if (galleryBtn) {
        // Delete the button if there are no more captures
        galleryBtn.remove();
    }
}

export function renderGroupTitle(groupTitleEl, group, groupInfoMap, groupPrefixState) {
    const info = groupInfoMap.get(group.id);
    let baseDisplayName;

    // CORRECTION: Add an `else` block to handle case where `info` is undefined.
    if (info) {
        if (info.type === 'manual' && info.key) {
            baseDisplayName = info.key.replace(/\u200B/g, '');
        } else if (info.title) {
            baseDisplayName = info.title.replace(/\u200B/g, '');
        } else {
            // Fallback if 'info' object exists but lacks title or key.
            baseDisplayName = (info.key || group.title || '?').replace(/\u200B/g, '');
        }
    } else {
        baseDisplayName = (group.title || '?').replace(/\u200B/g, '');
    }

    const identifierBase = baseDisplayName.trim();
    const identifier = `${identifierBase}_${group.id}`;
    const prefixInfo = groupPrefixState.get(identifier);
    const storedPrefix = prefixInfo && prefixInfo.prefix ? prefixInfo.prefix.replace(/\u200B/g, '') : '';

    let potentiallyDirtyDisplayName = baseDisplayName;
    if (storedPrefix && potentiallyDirtyDisplayName.startsWith(storedPrefix)) {
        potentiallyDirtyDisplayName = potentiallyDirtyDisplayName.substring(storedPrefix.length).trim();
    }

    const finalBaseDisplayName = potentiallyDirtyDisplayName;
    const finalDisplayName = finalBaseDisplayName;

    if (groupTitleEl.textContent !== finalDisplayName) {
        groupTitleEl.textContent = finalDisplayName;
    }
    groupTitleEl.dataset.baseName = finalBaseDisplayName;
    groupTitleEl.dataset.prefix = '';
}

export function renderTabCount(tabCountEl, tabs, seenTabIds) {
    const totalTabs = tabs.length;
    const seenTabsCount = tabs.filter((t) => seenTabIds.has(t.id)).length;
    tabCountEl.textContent = `${seenTabsCount}/${totalTabs}`;
    tabCountEl.classList.toggle('all-seen', seenTabsCount === totalTabs && totalTabs > 0);
}

// Removed updateGroupElement for Svelte migration

export function handleFocusAfterRender() {
    if (state.elementToFocusAfterRender) {
        const { type, groupId } = state.elementToFocusAfterRender;
        let elementToFocus = null;

        const groupItem = document.querySelector(`.group-item[data-group-id='${groupId}']`);
        if (groupItem) {
            if (type === 'color-indicator') {
                elementToFocus = groupItem.querySelector('.color-indicator');
            } else if (type === 'group-title') {
                elementToFocus = groupItem.querySelector('.group-title');
            }
        }

        if (elementToFocus) {
            elementToFocus.focus();
        }

        // Clears the variable so it doesn't run again on the next render.
        state.elementToFocusAfterRender = null;
    }
}

export function showCookieImportPanel() {
    const cookieModal = document.querySelector('.cookie-editor-modal');
    if (cookieModal) cookieModal.closest('.modal-overlay').style.display = 'none';

    const panelTemplate = document.getElementById('cookie-drag-drop-panel-template');
    if (!panelTemplate) return;

    const panel = panelTemplate.content.cloneNode(true).firstElementChild;
    document.body.appendChild(panel);

    const dropZone = panel.querySelector('.drop-zone');
    const fileInput = panel.querySelector('#cookie-file-input');
    const backBtn = panel.querySelector('#back-from-cookie-import-btn');

    panel.style.display = 'flex';

    const handleFile = (file) => {
        if (file && file.type === 'application/json') {
            handleCookieFileImport(file);
        } else {
            if (!file) {
                hideCookieImportPanel();
            } else {
                showNotification('invalidJsonFile', true);
            }
        }
    };

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('highlight');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('highlight'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('highlight');
        handleFile(e.dataTransfer.files[0]);
    });
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    backBtn.addEventListener('click', hideCookieImportPanel);
    applyTranslations(panel);

    setTimeout(() => {
        fileInput.click();
    }, 100);
}

export function hideCookieImportPanel() {
    const panel = document.getElementById('cookie-drag-drop-panel');
    if (panel) panel.remove();

    const cookieModal = document.querySelector('.cookie-editor-modal');
    if (cookieModal) cookieModal.closest('.modal-overlay').style.display = 'flex';
}

export async function handleCookieFileImport(file) {
    const modalBody = document.querySelector('.cookie-editor-body');
    if (!modalBody) return;

    const originalUrl = modalBody.dataset.url;
    const response = await chrome.runtime.sendMessage({ action: 'getCookiesForUrl', url: originalUrl });
    const originalCookies = response.success ? response.cookies : [];

    try {
        const finalCookies = await processCookieFile(file, originalCookies, { showNotification });

        const renderFn = window.renderCookiesInModal;
        if (renderFn) {
            renderFn(finalCookies);

            const searchInput = document.querySelector('#cookie-search-input');
            if (dom.searchInput) {
                dom.searchInput.dispatchEvent(new Event('input'));
            }
        }

        showNotification('cookiesImported', false, [finalCookies.length - originalCookies.length]);
    } catch (error) {
        console.error('Error importing cookies file:', error);
    } finally {
        hideCookieImportPanel();
    }
}

export function exportCookiesFromModal() {
    const modalBody = document.querySelector('.cookie-editor-body');
    if (!modalBody) return;

    const cookieElements = modalBody.querySelectorAll('.cookie-entry-card');
    const url = modalBody.dataset.url;
    exportCookies(cookieElements, url, { showNotification });
}

export async function handleBackupAllGroups() {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeGroupId = activeTab ? activeTab.groupId : -1;

    const allGroupDataRaw = await fetchData();
    const groupsToBackup = allGroupDataRaw.filter(
        (item) =>
            item.group.id !== activeGroupId &&
            !state.backedUpGroupData.hasOwnProperty(item.group.id) &&
            item.group.id !== -100, // Do not backup virtual group "Ungrouped"
    );

    if (groupsToBackup.length === 0) {
        showNotification('noGroupsToBackup', true);
        return;
    }

    const allTabIdsToRemove = [];
    const allGroupEls = [...document.querySelectorAll('#groups-list .group-item')];

    const backupPromises = groupsToBackup.map(async (item) => {
        const groupData = item;
        const originalIndex = allGroupEls.findIndex((el) => parseInt(el.dataset.groupId, 10) === groupData.group.id);

        // Look for the group element in the DOM to get its original base title.
        const groupEl = originalIndex !== -1 ? allGroupEls[originalIndex] : null;
        const groupTitleEl = groupEl ? groupEl.querySelector('.group-title') : null;
        // Use title from 'dataset.baseName' as main source.
        const originalTitle = groupTitleEl ? groupTitleEl.dataset.baseName : groupData.group.title;

        // Create backup object, overwriting title with the original.
        const backupObject = {
            group: {
                ...groupData.group, // Copy other properties.
                title: originalTitle, // Ensure original title is used.
            },
            tabs: groupData.tabs.map((t) => ({
                url: t.url,
                title: t.title,
                favIconUrl: t.favIconUrl,
                pinned: t.pinned,
            })),
            index: originalIndex >= 0 ? originalIndex : Infinity,
            createdAt: Date.now(),
        };

        state.backedUpGroupData[groupData.group.id] = backupObject;
        groupData.tabs.forEach((t) => allTabIdsToRemove.push(t.id));

        return saveBackupToDb(backupObject);
    });

    await Promise.all(backupPromises);

    if (allTabIdsToRemove.length > 0) {
        try {
            await chrome.tabs.remove(allTabIdsToRemove);
            showNotification('allGroupsBackedUp', false, [groupsToBackup.length]);
        } catch (e) {
            console.error('Error removing tabs during bulk backup:', e);
            showNotification('errorBackupGroup', true);
            await fn.loadState();
            await renderGroups();
        }
    }
}

export async function handleRestoreAllGroups() {
    const groupIdsToRestore = Object.keys(state.backedUpGroupData).map((id) => parseInt(id, 10));

    if (groupIdsToRestore.length === 0) {
        showNotification('noGroupsToRestore', true);
        return;
    }

    // Process each restoration sequentially, but skip intermediate renders.
    // Each handleRestoreGroup with skipRender=true avoids N redundant renderGroups() calls.
    for (const groupId of groupIdsToRestore) {
        await handleRestoreGroup(groupId, true, true); // suppressNotification=true, skipRender=true
    }

    showNotification('allGroupsRestored', false, [groupIdsToRestore.length]);

    // A single render at the end of the entire process to update UI.
    await renderGroups();
}

export async function handleRestoreSingleTab(groupId, tabToRestore, backupTabEl) {
    const backupData = state.backedUpGroupData[groupId];
    if (!backupData) {
        console.error(`Backup data not found for group ${groupId}`);
        showNotification('errorRestoreGroup', true);
        return;
    }

    // Suppress background UI refreshes for 1000ms so our smooth surgical DOM update isn't wiped out by background events
    state.isProgrammaticActivation = true;
    setTimeout(() => {
        state.isProgrammaticActivation = false;
    }, 1000);
    state.isPerformingProgrammaticUpdate = true;

    // Update clicked tab item opacity immediately to look like a live tab
    if (backupTabEl) {
        backupTabEl.classList.remove('backup-tab-item');
        backupTabEl.style.opacity = '1';
    }

    const groupEl = backupTabEl
        ? backupTabEl.closest('.group-item')
        : document.querySelector(`.group-item[data-group-id="${groupId}"]`);

    try {
        let targetGroupId = backupData.linkedGroupId;
        const newTab = await chrome.tabs.create({ url: tabToRestore.url, active: true });

        if (!targetGroupId) {
            const newGroupId = await chrome.tabs.group({ tabIds: [newTab.id] });
            await chrome.tabGroups.update(newGroupId, {
                title: backupData.group.title,
                color: backupData.group.color,
            });
            backupData.linkedGroupId = newGroupId;
            targetGroupId = newGroupId;
        } else {
            await chrome.tabs.group({ groupId: targetGroupId, tabIds: [newTab.id] });
        }

        const tabIndex = backupData.tabs.findIndex((t) => t.url === tabToRestore.url && t.title === tabToRestore.title);
        if (tabIndex > -1) {
            backupData.tabs.splice(tabIndex, 1);
        }

        const isFullyRestored = backupData.tabs.length === 0;

        if (isFullyRestored) {
            state.restoredGroupIds.add(targetGroupId);
            delete state.backedUpGroupData[groupId];
            await deleteBackupFromDb(groupId);
            showNotification('groupRestored', false, [backupData.group.title]);

            if (groupEl) {
                groupEl.classList.remove('backed-up');
                groupEl.dataset.groupId = targetGroupId;
                const colorIndicator = groupEl.querySelector('.color-indicator');
                if (colorIndicator) {
                    colorIndicator.textContent = '';
                    colorIndicator.removeAttribute('data-i18n-title');
                    colorIndicator.title = '';
                }
            }
        } else {
            await saveBackupToDb(backupData);
            showNotification('singleTabRestored', false, [tabToRestore.title]);

            if (groupEl) {
                const tabCountEl = groupEl.querySelector('.group-tab-count');
                if (tabCountEl) {
                    let liveTabCount = 0;
                    try {
                        const liveTabs = await chrome.tabs.query({ groupId: targetGroupId });
                        liveTabCount = liveTabs.length;
                    } catch (e) {}
                    const backedUpCount = backupData.tabs.length;
                    tabCountEl.textContent = `${liveTabCount} / ${liveTabCount + backedUpCount}`;
                }
            }
        }
    } catch (error) {
        console.error('Error during restoration of a single tab:', error);
        showNotification('errorRestoreTab', true);
        await renderGroups();
    } finally {
        state.isPerformingProgrammaticUpdate = false;
    }
}

export async function handleBackupGroup(groupId) {
    const allGroupDataRaw = await fetchData();
    const groupData = allGroupDataRaw.find((item) => item.group.id === groupId);

    if (!groupData) {
        console.error(`Group data for ID ${groupId} not found for backup.`);
        showNotification('errorBackupGroup', true);
        return;
    }

    const allGroupEls = [...document.querySelectorAll('#groups-list .group-item')];
    const originalIndex = allGroupEls.findIndex((el) => parseInt(el.dataset.groupId, 10) === groupId);

    // Search for the group element in the DOM to get its original base title.
    const groupEl = allGroupEls.find((el) => parseInt(el.dataset.groupId, 10) === groupId);
    const groupTitleEl = groupEl ? groupEl.querySelector('.group-title') : null;
    // Use title from 'dataset.baseName' as main source, with a fallback to API title.
    const originalTitle = groupTitleEl ? groupTitleEl.dataset.baseName : groupData.group.title;

    // Create backup object, overwriting title with the original.
    const backupObject = {
        group: {
            ...groupData.group, // Copy properties like id, color, etc.
            title: originalTitle, // Ensure title is the full original.
        },
        tabs: groupData.tabs.map((t) => ({
            url: t.url,
            title: t.title,
            favIconUrl: t.favIconUrl,
            pinned: t.pinned,
        })),
        index: originalIndex >= 0 ? originalIndex : Infinity,
        createdAt: Date.now(),
    };

    // Update in-memory state for UI
    state.backedUpGroupData[groupId] = backupObject;

    const tabIdsToRemove = groupData.tabs.map((t) => t.id);
    if (tabIdsToRemove.length > 0) {
        try {
            // Parallelize: IndexedDB save and tab removal are independent operations.
            await Promise.all([saveBackupToDb(backupObject), chrome.tabs.remove(tabIdsToRemove)]);
            showNotification('groupBackedUp', false, [originalTitle]);
        } catch (e) {
            console.error('Error during backup:', e);
            // Revert if either operation fails
            delete state.backedUpGroupData[groupId];
            await deleteBackupFromDb(groupId); // Safe: no-op if save didn't complete
            showNotification('errorBackupGroup', true);
        }
    } else {
        await saveBackupToDb(backupObject);
        await renderGroups();
    }
}

export async function createTabsInBatches(tabsToCreate, batchSize = 4, delay = 100) {
    const createdTabs = [];
    for (let i = 0; i < tabsToCreate.length; i += batchSize) {
        const batch = tabsToCreate.slice(i, i + batchSize);
        const creationPromises = batch.map((tabInfo) =>
            chrome.tabs.create({
                url: tabInfo.url,
                active: false, // Crucial! Creates the tab in the background and suspended.
                pinned: tabInfo.pinned || false,
            }),
        );
        const newTabs = await Promise.all(creationPromises);
        createdTabs.push(...newTabs);
        // Wait a brief moment before processing next batch to not saturate the browser.
        if (i + batchSize < tabsToCreate.length) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    return createdTabs;
}

export async function handleRestoreGroup(groupId, suppressNotification = false, skipRender = false) {
    const backupData = state.backedUpGroupData[groupId];

    if (!backupData || !backupData.tabs || backupData.tabs.length === 0) {
        console.error(`Backup data for ID ${groupId} is invalid or empty.`);
        if (!suppressNotification) showNotification('errorRestoreGroup', true);
        return;
    }

    // Suppress background UI refreshes while batch restoring tabs
    state.isProgrammaticActivation = true;
    state.isPerformingProgrammaticUpdate = true;

    const groupEl = document.querySelector(`.group-item[data-group-id="${groupId}"]`);
    if (groupEl) {
        groupEl.classList.remove('backed-up');
        const colorIndicator = groupEl.querySelector('.color-indicator');
        if (colorIndicator) {
            colorIndicator.textContent = '';
            colorIndicator.removeAttribute('data-i18n-title');
            colorIndicator.title = '';
        }
        groupEl.querySelectorAll('.backup-tab-item').forEach((tabEl) => {
            tabEl.classList.remove('backup-tab-item');
            tabEl.style.opacity = '1';
        });
    }

    try {
        const createdTabs = await createTabsInBatches(backupData.tabs);

        const newTabIds = createdTabs.map((t) => t.id);
        const newGroupId = await chrome.tabs.group({ tabIds: newTabIds });
        await chrome.tabGroups.update(newGroupId, {
            title: backupData.group.title,
            color: backupData.group.color,
        });

        if (groupEl) {
            groupEl.dataset.groupId = newGroupId;
        }

        state.restoredGroupIds.add(newGroupId);
        delete state.backedUpGroupData[groupId];
        await deleteBackupFromDb(groupId);

        if (!suppressNotification) {
            showNotification('groupRestored', false, [backupData.group.title]);
        }
    } catch (e) {
        console.error('Error restoring group:', e);
        if (!suppressNotification) showNotification('errorRestoreGroup', true);
    } finally {
        state.isProgrammaticActivation = false;
        state.isPerformingProgrammaticUpdate = false;
        // Skip render when called in bulk (handleRestoreAllGroups renders once at the end)
        if (!skipRender) {
            await renderGroups();
        }
    }
}

let renderDebounceTimer = null;
let isRendering = false;
let pendingRender = false;

export async function renderGroups() {
    if (typeof fn.closeOverflowMenu === 'function') {
        fn.closeOverflowMenu();
    }
    if (isRendering) {
        pendingRender = true;
        return;
    }

    if (renderDebounceTimer) clearTimeout(renderDebounceTimer);

    if (state.isInitialRender) {
        isRendering = true;
        try {
            await performRender();
        } finally {
            isRendering = false;
            if (pendingRender) {
                pendingRender = false;
                renderGroups();
            }
        }
        return;
    }

    return new Promise((resolve) => {
        renderDebounceTimer = setTimeout(async () => {
            isRendering = true;
            try {
                await performRender();
            } finally {
                isRendering = false;
                renderDebounceTimer = null;
                if (pendingRender) {
                    pendingRender = false;
                    renderGroups();
                }
                resolve();
            }
        }, 50);
    });
}

async function performRender() {
    // --- PHASE 1: Data collection ---
    const pageModes = await chrome.runtime.sendMessage({ action: 'getPageModes' });
    const allGroupDataRaw = await fetchData();
    await fn.loadState();
    await fn.loadSplitScreenState();
    const groupInfoMap = await getGroupInfoMap();
    const groupPrefixState = await getGroupPrefixState();
    const sessionData = await chrome.storage.session.get('tabsEverActive');

    // Initialize with session data
    const { [STORAGE_KEYS.SCREENSHOTS]: screenshotData = {} } = await chrome.storage.session.get(
        STORAGE_KEYS.SCREENSHOTS,
    );
    const { [STORAGE_KEYS.NOTES]: notesData = {} } = await chrome.storage.session.get(STORAGE_KEYS.NOTES);
    const seenTabIds = new Set(sessionData.tabsEverActive || []);

    // --- PHASE 1.1: CREATE MATCH MAP (NAME -> ID) ---
    const normalizeText = (text) => {
        if (!text) return '';
        return text
            .replace(/^(g_|s_)/, '')
            .replace(/[\u200B\s]+/g, '')
            .trim();
    };

    const nameToGroupIdMap = new Map();

    // 1. Map from groupInfoMap
    for (const [id, info] of groupInfoMap.entries()) {
        nameToGroupIdMap.set(String(id), id);
        if (info.key) nameToGroupIdMap.set(normalizeText(info.key), id);
        if (info.title) nameToGroupIdMap.set(normalizeText(info.title), id);
    }

    // 2. Map from current visible titles
    allGroupDataRaw.forEach((item) => {
        nameToGroupIdMap.set(String(item.group.id), item.group.id);
        if (item.group.title) {
            const cleanTitle = normalizeText(item.group.title);
            if (cleanTitle) {
                nameToGroupIdMap.set(cleanTitle, item.group.id);
            }
        }
    });

    const knownGroupNames = Array.from(nameToGroupIdMap.keys()).sort((a, b) => b.length - a.length);

    // --- PHASE 1.2: HELPER TO RECOVER CURRENT ID ---
    const resolveSessionKeyFromDbKey = (dbContextKey) => {
        if (!dbContextKey) return null;

        if (dbContextKey.includes('ungrouped')) {
            return dbContextKey;
        }

        if (dbContextKey.startsWith('g_')) {
            const nameInDb = normalizeText(dbContextKey);
            if (nameToGroupIdMap.has(nameInDb)) {
                const currentGroupId = nameToGroupIdMap.get(nameInDb);
                return `g_${currentGroupId}`;
            }
        } else if (dbContextKey.startsWith('s_')) {
            const content = dbContextKey.substring(2);
            const cleanContent = content.replace(/[\u200B]+/g, '');

            for (const groupName of knownGroupNames) {
                const normalizedContentStart = normalizeText(content);
                if (normalizedContentStart.startsWith(groupName)) {
                    const groupId = nameToGroupIdMap.get(groupName);
                    const parts = content.split('_');
                    const domain = parts[parts.length - 1];
                    return `s_${groupId}_${domain}`;
                }
            }
        }
        return null;
    };

    // --- PHASE 1.5: Notes Synchronization ---
    const allNoteIds = await getAllNoteIdsFromDb();
    if (allNoteIds.length > 0) {
        const notePromises = allNoteIds.map((id) => getNoteFromDb(id));
        const allNotes = (await Promise.all(notePromises)).filter(Boolean);

        allNotes.forEach((note) => {
            // Recover valid session key for the current group
            const sessionKey = resolveSessionKeyFromDbKey(note.contextKey);

            if (sessionKey) {
                if (!notesData[sessionKey]) notesData[sessionKey] = [];
                // Avoid duplicates if it already existed
                if (!notesData[sessionKey].includes(note.id)) {
                    notesData[sessionKey].push(note.id);
                }
            }
        });
    }

    // --- PHASE 1.6: Screenshots Synchronization ---
    const allScreenshotIds = await getAllScreenshotIdsFromDb();
    if (allScreenshotIds.length > 0) {
        const screenshotPromises = allScreenshotIds.map((id) => getScreenshotFromDb(id));
        const allScreenshots = (await Promise.all(screenshotPromises)).filter(Boolean);

        allScreenshots.forEach((screenshot) => {
            const sessionKey = resolveSessionKeyFromDbKey(screenshot.contextKey);

            if (sessionKey) {
                if (!screenshotData[sessionKey]) screenshotData[sessionKey] = [];
                if (!screenshotData[sessionKey].includes(screenshot.id)) {
                    screenshotData[sessionKey].push(screenshot.id);
                }
            }
        });
    }

    // --- CRITICAL CORRECTION: SAVE SYNCHRONIZED DATA IN SESSION ---
    // This ensures that when notes/gallery view is opened, data is there.
    await chrome.storage.session.set({
        [STORAGE_KEYS.NOTES]: notesData,
        [STORAGE_KEYS.SCREENSHOTS]: screenshotData,
    });

    const storage = await fn.getStorage();
    const { customRules = [] } = await storage.get('customRules');

    // --- PHASE 2: Data Preparation and Ordering ---
    const allGroupData = allGroupDataRaw.filter((item) => !state.pendingDeletionGroupIds.has(item.group.id));

    let splitGroupId = -1;
    for (const [id, info] of groupInfoMap.entries()) {
        if (info.type === 'manual' && info.key === 'Split') {
            splitGroupId = id;
            break;
        }
    }
    const allTabs = await getValidStandardTabs();
    const tabsForDuplicateCheck = allTabs.filter((tab) => tab.groupId !== splitGroupId);
    const urlCounts = tabsForDuplicateCheck.reduce((acc, tab) => {
        if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
            acc[tab.url] = (acc[tab.url] || 0) + 1;
        }
        return acc;
    }, {});
    const duplicateUrlSet = new Set();
    for (const url in urlCounts) {
        if (urlCounts[url] > 1) {
            duplicateUrlSet.add(url);
        }
    }

    dom.hiddenGroupsContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const hiddenGroupData = allGroupDataRaw.filter((item) => state.hiddenGroupIds.has(item.group.id));
    hiddenGroupData.forEach((item) => {
        const indicatorEl = dom.hiddenIndicatorTemplate.content.cloneNode(true).firstElementChild;
        indicatorEl.style.backgroundColor = state.themeColors[item.group.color];
        const groupInfo = groupInfoMap.get(item.group.id);
        const fullTitle = groupInfo && groupInfo.key ? groupInfo.key : item.group.title || 'Untitled Group';
        const initial = fullTitle.trim().charAt(0).toUpperCase() || '?';
        indicatorEl.querySelector('.hidden-group-initial').textContent = initial;
        indicatorEl.title = `${chrome.i18n.getMessage('showGroup') || 'Show group'}: ${fullTitle}`;
        indicatorEl.addEventListener('click', () => unhideGroup(item.group.id));
        fragment.appendChild(indicatorEl);
    });
    dom.hiddenGroupsContainer.appendChild(fragment);
    if (state.hiddenYoutubeView) fn.createYoutubeIndicator();
    dom.hiddenGroupsContainer.classList.toggle('hidden', dom.hiddenGroupsContainer.childElementCount === 0);

    // Update orphan indicators with the new mapping logic
    fn.updateOrphanIndicators();

    const backedUpItems = Object.values(state.backedUpGroupData).map((backup) => ({
        ...backup,
        isBackup: true,
    }));

    const combinedData = [...allGroupData, ...backedUpItems];

    const existingNoGroupsMessage = dom.groupListContainer.querySelector('.no-groups-message');
    if (existingNoGroupsMessage) {
        existingNoGroupsMessage.remove();
    }

    if (combinedData.length === 0) {
        dom.groupListContainer.querySelectorAll('.group-item').forEach((el) => el.remove());
        const noGroupsMessage = document.createElement('p');
        noGroupsMessage.className = 'no-groups-message';
        noGroupsMessage.setAttribute('data-i18n', 'noGroupsMessage');
        dom.groupListContainer.appendChild(noGroupsMessage);
    } else {
        const groupDataMap = new Map(allGroupData.map((item) => [item.group.id, item]));
        let lastPinnedGroupData = null;
        let groupsToProcess = [...allGroupData];
        if (state.pinnedAtLastPositionId && groupDataMap.has(state.pinnedAtLastPositionId)) {
            lastPinnedGroupData = groupDataMap.get(state.pinnedAtLastPositionId);
            groupsToProcess = groupsToProcess.filter((item) => item.group.id !== state.pinnedAtLastPositionId);
        }
        const finalOrderedList = new Array(groupsToProcess.length).fill(null);
        const unpinnedItems = [];
        const userDefinedPinnedOrder = state.userDefinedOrder.filter(
            (id) => id !== state.pinnedAtLastPositionId && groupDataMap.has(id),
        );
        groupsToProcess.forEach((item) => {
            const isPinned = state.pinnedGroupIds.has(item.group.id) && item.group.id !== state.pinnedAtLastPositionId;
            if (isPinned) {
                const pinnedPosition = userDefinedPinnedOrder.indexOf(item.group.id);
                if (pinnedPosition !== -1 && pinnedPosition < finalOrderedList.length) {
                    finalOrderedList[pinnedPosition] = item;
                } else {
                    unpinnedItems.push(item);
                }
            } else {
                unpinnedItems.push(item);
            }
        });
        let unpinnedIdx = 0;
        for (let i = 0; i < finalOrderedList.length; i++) {
            if (finalOrderedList[i] === null && unpinnedItems[unpinnedIdx]) {
                finalOrderedList[i] = unpinnedItems[unpinnedIdx++];
            }
        }
        const sortedGroups = finalOrderedList.filter(Boolean);
        if (lastPinnedGroupData) sortedGroups.push(lastPinnedGroupData);

        const liveGroupIds = new Set(allGroupData.map((item) => item.group.id));
        const backupsToInsert = Object.values(state.backedUpGroupData)
            .filter((data) => !liveGroupIds.has(data.group.id))
            .map((data) => ({ ...data, isBackup: true }))
            .sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity));

        backupsToInsert.forEach((backup) => {
            const insertionIndex = Math.min(backup.index, sortedGroups.length);
            sortedGroups.splice(insertionIndex, 0, backup);
        });

        const finalGroupData = sortedGroups;

        listGroupStore.updateState({
            renderedGroups: finalGroupData,
            hiddenGroupsData: hiddenGroupData,
            renderContext: {
                groupInfoMap,
                groupPrefixState,
                seenTabIds,
                duplicateUrlSet,
                screenshotData,
                notesData,
                customRules,
                pageModes,
            },
        });

        if (state.isInitialRender && state.viewExpandStates.groups) {
            finalGroupData.forEach((item) => {
                const groupId = item.group.id;
                if (!isNaN(groupId)) {
                    state.expandedGroupStates.set(groupId, true);
                    const tabs = item.tabs || [];
                    const tabsByDomain = tabs.reduce((acc, tab) => {
                        try {
                            const domain = new URL(tab.url).hostname.replace(/^www./, '');
                            (acc[domain] = acc[domain] || []).push(tab);
                        } catch (e) {
                            (acc['other'] = acc['other'] || []).push(tab);
                        }
                        return acc;
                    }, {});
                    Object.keys(tabsByDomain).forEach((domain) => {
                        const subGroupKey = `${groupId}_${domain}`;
                        state.expandedSubgroupStates.set(subGroupKey, true);
                    });
                }
            });
        }
        state.isInitialRender = false;

        initDragAndDrop();
        fn.applySearchAndFilter();
        fn.updateExpandAllButtonState();
        updateDuplicateCountBadge();
        handleFocusAfterRender();
        scrollToActiveGroupIfNeeded();
        state.restoredGroupIds.clear();
    }
}
export async function unGroupAndRemoveAllTabsInGroup(groupId) {
    try {
        const tabsInGroup = await chrome.tabs.query({
            groupId: parseInt(groupId, 10),
        });
        if (tabsInGroup.length > 0) {
            const tabIds = tabsInGroup.map((t) => t.id);
            // First ungroup the tabs
            await chrome.tabs.ungroup(tabIds);
            // Then, close the already ungrouped tabs
            await chrome.tabs.remove(tabIds);
        }
    } catch (error) {
        console.error(`Error ungrouping and deleting tabs from group ${groupId}:`, error);
        showNotification('errorRemovingTabs', true);
    }
}

export async function fetchData() {
    const storage = await fn.getStorage();
    const {
        clusterConfig = {
            specialGroups: {
                misc: {
                    enabled: false,
                },
            },
        },
    } = await storage.get('clusterConfig');
    const isMiscEnabled = clusterConfig?.specialGroups?.misc?.enabled ?? false;

    const allGroupsRaw = await chrome.tabGroups.query({});
    const allTabs = await getValidStandardTabs();

    // --- INICIO DE LA MODIFICACIÓN ---
    // Create a set of group IDs that are linked to a backup.
    const linkedGroupIds = new Set(
        Object.values(state.backedUpGroupData)
            .map((backup) => backup.linkedGroupId)
            .filter(Boolean), // Filtrar valores nulos o indefinidos
    );

    // Filter the active groups list to exclude those that are linked.
    const groups = allGroupsRaw.filter((group) => !linkedGroupIds.has(group.id));
    // --- FIN DE LA MODIFICACIÓN ---

    const tabsByGroupId = {};
    const ungroupedTabs = [];

    allTabs.forEach((tab) => {
        if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
            (tabsByGroupId[tab.groupId] = tabsByGroupId[tab.groupId] || []).push(tab);
        } else {
            const isNewTab = tab.url === 'chrome://newtab/';
            if (isMiscEnabled && isNewTab) {
                // Do nothing
            } else {
                if (!tab.url.startsWith('chrome-extension://')) {
                    ungroupedTabs.push(tab);
                }
            }
        }
    });

    const groupData = groups
        .map((group) => ({
            group,
            tabs: tabsByGroupId[group.id] || [],
        }))
        .filter((item) => item.tabs.length > 0);

    if (ungroupedTabs.length > 0) {
        const ungroupedTitle = chrome.i18n.getMessage('ungroupedTabsTitle');
        const ungroupedVirtualGroup = {
            group: {
                id: -100,
                title: ungroupedTitle,
                color: 'grey',
                collapsed: false,
            },
            tabs: ungroupedTabs,
        };
        groupData.push(ungroupedVirtualGroup);
    }

    groupData.sort((a, b) => {
        const tabsA = a.tabs;
        const tabsB = b.tabs;

        if (tabsA.length === 0 && tabsB.length === 0) return 0;
        if (tabsA.length === 0) return 1;
        if (tabsB.length === 0) return -1;

        const indexA = Math.min(...tabsA.map((t) => t.index));
        const indexB = Math.min(...tabsB.map((t) => t.index));

        return indexA - indexB;
    });

    return groupData;
}

export async function makeGroupTitleEditable(groupTitleEl, focusAfterEdit = false) {
    const groupItem = groupTitleEl.closest('.group-item');
    if (!groupItem) return;
    const groupId = parseInt(groupItem.dataset.groupId, 10);
    if (groupId === -100) return;
    const groupInfoMap = await getGroupInfoMap();
    const info = groupInfoMap.get(groupId);
    const summaryEl = groupTitleEl.closest('.group-header');
    const uneditableSpecialKeys = ['Chrome', 'Files', 'Extensions', 'Misc'];

    if (info && (info.type === 'rule' || (info.type === 'special' && uneditableSpecialKeys.includes(info.key)))) {
        showNotification('renameInRulesManager', true);
        return;
    }

    const currentBaseDisplayName = groupTitleEl.dataset.baseName || '';
    // console.log("currentBaseDisplayName: ", currentBaseDisplayName); // Log for debugging

    const inputEl = document.createElement('input');
    // Add property to know if editing was cancelled.
    inputEl.isCancelled = false;
    inputEl.type = 'text';
    inputEl.maxLength = 16;
    inputEl.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text/plain');
        const currentText = inputEl.value;
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        const potentialResult = currentText.substring(0, start) + pastedText + currentText.substring(end);
        inputEl.value = potentialResult.substring(0, 16);
    });
    inputEl.value = currentBaseDisplayName;
    inputEl.className = 'group-title-input';
    inputEl.spellcheck = false;

    if (summaryEl) {
        summaryEl.classList.add('is-editing');
    }

    groupTitleEl.replaceWith(inputEl);
    inputEl.focus();
    inputEl.select();

    // Save reference to the input being edited.
    state.currentlyEditingInput = inputEl;

    const saveChanges = async () => {
        // VERY IMPORTANT! Detach 'blur' listener so it doesn't run twice
        inputEl.removeEventListener('blur', saveChanges);

        state.currentlyEditingInput = null;
        if (summaryEl) summaryEl.classList.remove('is-editing');

        if (inputEl.isCancelled) {
            groupTitleEl.textContent = currentBaseDisplayName;
        } else {
            const newTitle = inputEl.value.trim();
            if (newTitle && newTitle !== currentBaseDisplayName) {
                try {
                    await chrome.tabGroups.update(groupId, { title: newTitle });
                    groupTitleEl.textContent = newTitle;
                    groupTitleEl.dataset.baseName = newTitle;
                } catch (error) {
                    console.error('Error updating group title:', error);
                    groupTitleEl.textContent = currentBaseDisplayName;
                }
            } else {
                groupTitleEl.textContent = currentBaseDisplayName;
            }
        }

        // Only replace input if it is still in the DOM
        if (inputEl.parentNode) {
            inputEl.replaceWith(groupTitleEl);
        }

        if (focusAfterEdit) {
            state.elementToFocusAfterRender = { type: 'group-title', groupId: groupId };
        }
    };

    inputEl.addEventListener('blur', saveChanges);
    inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            // Stop event here so it doesn't propagate to other listeners like hint_content.js
            event.preventDefault();
            event.stopPropagation();

            inputEl.isCancelled = true;
            inputEl.blur();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            inputEl.blur();
        }
    });
}

export function handleTabActivation(event, tabItemEl) {
    const url = tabItemEl.dataset.url;
    const context = tabItemEl._context || null;

    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
            fn.openUrlInPanel(url, context);
        }
        return true;
    }

    if (state.isPopupWindow) {
        event.preventDefault();
        if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
            fn.openUrlInPanel(url, context);
        }
        return true;
    }

    return false;
}

// Removed createGroupElement for Svelte migration

export async function deleteAllTabsInGroup(groupId) {
    try {
        const tabsInGroup = await chrome.tabs.query({
            groupId: parseInt(groupId, 10),
        });
        if (tabsInGroup.length > 0) {
            const tabIds = tabsInGroup.map((t) => t.id);
            await chrome.tabs.remove(tabIds);
        }
    } catch (error) {
        console.error(`Error removing tabs for group ${groupId}:`, error);
        showNotification('errorRemovingTabs', true);
    }
}

export async function deleteAllTabsInSubgroup(tabs) {
    if (!tabs || tabs.length === 0) return;
    try {
        const tabIds = tabs.map((t) => t.id);
        await chrome.tabs.remove(tabIds);
    } catch (error) {
        console.error(`Error removing tabs for subgroup:`, error);
        showNotification('errorRemovingTabs', true);
    }
}

export async function hideGroup(groupId) {
    const numericId = parseInt(groupId, 10);
    state.hiddenGroupIds.add(numericId);
    await fn.saveState();
    await renderGroups();
}

export async function unhideGroup(groupId) {
    const numericId = parseInt(groupId, 10);
    state.hiddenGroupIds.delete(numericId);
    await fn.saveState();
    await renderGroups();
}

export async function togglePinState(groupId) {
    const numericId = parseInt(groupId, 10);
    const isCurrentlyPinned = state.pinnedGroupIds.has(numericId);

    if (isCurrentlyPinned) {
        state.pinnedGroupIds.delete(numericId);
        if (state.pinnedAtLastPositionId === numericId) {
            state.pinnedAtLastPositionId = null;
        }
        state.userDefinedOrder = state.userDefinedOrder.filter((id) => id !== numericId);
        if (state.pinnedGroupIds.size === 0) {
            state.userDefinedOrder = [];
            state.pinnedAtLastPositionId = null;
        }
    } else {
        state.pinnedGroupIds.add(numericId);
        const currentGroupElements = [...dom.groupListContainer.querySelectorAll('.group-item:not(.hidden)')];
        const currentOrderIds = currentGroupElements.map((item) => parseInt(item.dataset.groupId, 10));

        if (currentOrderIds.length > 0 && currentOrderIds[currentOrderIds.length - 1] === numericId) {
            state.pinnedAtLastPositionId = numericId;
        }

        state.userDefinedOrder = currentOrderIds;
    }

    await fn.saveState();
    await renderGroups();
}

export function initDragAndDrop() {
    const draggables = [...dom.groupListContainer.querySelectorAll('.group-item[draggable="true"]')];
    let dragSrcEl = null;
    let customDragImage = null;
    let lastDragOverEl = null; // Variable to track the last hovered element

    draggables.forEach((draggable) => {
        draggable.addEventListener('dragstart', (e) => {
            dragSrcEl = e.currentTarget;
            e.dataTransfer.effectAllowed = 'move';

            const header = dragSrcEl.querySelector('.group-header');
            if (header) {
                customDragImage = header.cloneNode(true);
                customDragImage.style.width = `${header.offsetWidth}px`;
                customDragImage.style.opacity = '0.85';
                customDragImage.style.position = 'absolute';
                customDragImage.style.top = '-9999px';
                customDragImage.style.left = '-9999px';
                customDragImage.style.backgroundColor = 'var(--bg-panel-color)';
                customDragImage.style.padding = '12px 14px';
                customDragImage.style.borderRadius = 'var(--border-radius)';
                customDragImage.style.border = '1px solid var(--border-color)';
                customDragImage.style.boxSizing = 'border-box';
                customDragImage.style.margin = '0';
                document.body.appendChild(customDragImage);

                const offsetX = e.clientX - header.getBoundingClientRect().left;
                e.dataTransfer.setDragImage(customDragImage, offsetX, 20);
            }

            setTimeout(() => {
                if (dragSrcEl) {
                    dragSrcEl.classList.add('dragging');
                }
            }, 0);
        });

        draggable.addEventListener('dragend', (e) => {
            if (dragSrcEl) {
                dragSrcEl.classList.remove('dragging');
            }
            if (customDragImage) {
                customDragImage.remove();
                customDragImage = null;
            }
            // Clean any residual highlighting class
            if (lastDragOverEl) {
                lastDragOverEl.classList.remove('drag-over-top', 'drag-over-bottom');
            }
            lastDragOverEl = null;
        });

        draggable.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const target = e.currentTarget;
            if (!target || target === dragSrcEl) return;

            // Optimization: Only remove class from the last hovered element, not all.
            if (lastDragOverEl && lastDragOverEl !== target) {
                lastDragOverEl.classList.remove('drag-over-top', 'drag-over-bottom');
            }
            lastDragOverEl = target;

            const rect = target.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            const deadZone = rect.height * 0.2;

            if (relativeY < rect.height / 2 - deadZone / 2) {
                target.classList.add('drag-over-top');
                target.classList.remove('drag-over-bottom');
            } else if (relativeY > rect.height / 2 + deadZone / 2) {
                target.classList.add('drag-over-bottom');
                target.classList.remove('drag-over-top');
            } else {
                target.classList.remove('drag-over-top', 'drag-over-bottom');
            }
        });

        // New event to clean up when the cursor leaves an element
        draggable.addEventListener('dragleave', (e) => {
            e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        draggable.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetEl = e.currentTarget;
            if (!dragSrcEl || dragSrcEl === targetEl) return;

            const isOverTop = targetEl.classList.contains('drag-over-top');
            targetEl.classList.remove('drag-over-top', 'drag-over-bottom');

            // DOM is visually updated here
            if (isOverTop) {
                dom.groupListContainer.insertBefore(dragSrcEl, targetEl);
            } else {
                dom.groupListContainer.insertBefore(dragSrcEl, targetEl.nextSibling);
            }

            const draggedId = parseInt(dragSrcEl.dataset.groupId, 10);
            state.pinnedGroupIds.add(draggedId);

            // --- START OF CORRECTION ---
            // Direct visual update for the pin button
            const pinBtn = dragSrcEl.querySelector('.pin-btn');
            if (pinBtn) {
                pinBtn.classList.add('active');
                pinBtn.setAttribute('data-i18n-title', 'unpinGroup');
                applyTranslations(pinBtn); // Ensures tooltip is updated
            }
            // --- END OF CORRECTION ---

            state.userDefinedOrder = [...dom.groupListContainer.querySelectorAll('.group-item')].map((item) =>
                parseInt(item.dataset.groupId, 10),
            );

            if (state.userDefinedOrder.length > 0) {
                const lastId = state.userDefinedOrder[state.userDefinedOrder.length - 1];
                if (state.pinnedGroupIds.has(lastId)) {
                    state.pinnedAtLastPositionId = lastId;
                } else {
                    state.pinnedAtLastPositionId = null;
                }
            } else {
                state.pinnedAtLastPositionId = null;
            }

            // Save the new order without re-rendering the whole list.
            await fn.saveState();
        });
    });
}

// Removed renderTabsForGroup for Svelte migration

export function updateCounters(tabItemEl) {
    // Update subgroup counter (if exists)
    const subGroupEl = tabItemEl.closest('.domain-subgroup');
    if (subGroupEl) {
        const subGroupTabs = subGroupEl.querySelectorAll('.tab-item');
        const seenInSubgroup = Array.from(subGroupTabs).filter((t) => t.classList.contains('seen')).length;
        const subGroupCountEl = subGroupEl.querySelector('.tab-count');
        if (subGroupCountEl) {
            subGroupCountEl.textContent = `${seenInSubgroup}/${subGroupTabs.length}`;
            subGroupCountEl.classList.toggle('all-seen', seenInSubgroup === subGroupTabs.length);
        }
    }

    // Update main group counter
    const groupEl = tabItemEl.closest('.group-item');
    if (groupEl) {
        const allTabsInGroup = groupEl.querySelectorAll('.tab-item');
        const seenInGroup = Array.from(allTabsInGroup).filter((t) => t.classList.contains('seen')).length;
        const groupCountEl = groupEl.querySelector('.group-tab-count');
        if (groupCountEl) {
            groupCountEl.textContent = `${seenInGroup}/${allTabsInGroup.length}`;
            groupCountEl.classList.toggle('all-seen', seenInGroup === allTabsInGroup.length);
        }
    }
}

// Removed createTabElement for Svelte migration

export async function toggleColorPopup(indicator, groupId) {
    const groupInfoMap = await getGroupInfoMap();
    const numericGroupId = parseInt(groupId, 10);
    const info = groupInfoMap.get(numericGroupId);

    const uneditableSpecialKeys = ['Chrome', 'Files', 'Extensions', 'Misc'];

    if (info && (info.type === 'rule' || (info.type === 'special' && uneditableSpecialKeys.includes(info.key)))) {
        showNotification('changeColorInRulesManager', true);
        return;
    }

    const isClosingSamePopup = state.currentColorPopup && state.lastClickedIndicator === indicator;

    if (state.currentColorPopup) {
        closeColorPopup();
    }
    if (state.currentDownloadModal) {
        fn.closeDownloadModal();
    }

    if (isClosingSamePopup) {
        return;
    }

    const popup = dom.colorPopupTemplate.content.cloneNode(true).firstElementChild;

    const availableColors = colors.filter((color) => color !== 'grey');
    availableColors.forEach((colorName) => {
        const item = dom.colorPopupItemTemplate.content.cloneNode(true).firstElementChild;
        item.style.backgroundColor = state.themeColors[colorName];
        item.dataset.color = colorName;
        item.setAttribute('aria-label', `Select ${colorName}`);
        item.addEventListener('click', () => changeGroupColor(groupId, colorName));
        popup.appendChild(item);
    });

    document.body.appendChild(popup);
    state.currentColorPopup = popup;
    state.lastClickedIndicator = indicator; // Save reference to the indicator that opened the popup
    positionColorPopup(indicator, popup);

    const colorItems = Array.from(popup.querySelectorAll('.color-popup-item'));
    const firstItem = colorItems[0];
    const lastItem = colorItems[colorItems.length - 1];

    if (firstItem) {
        firstItem.focus();
    }

    colorItems.forEach((item) => {
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.click();
            }

            if (e.key === 'Tab') {
                if (e.shiftKey && document.activeElement === firstItem) {
                    e.preventDefault();
                    lastItem.focus();
                } else if (!e.shiftKey && document.activeElement === lastItem) {
                    e.preventDefault();
                    firstItem.focus();
                }
            }
        });
    });

    popup.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeColorPopup();
        }
    });
}

export function positionColorPopup(indicator, popup) {
    const rect = indicator.getBoundingClientRect();
    const offset = 8;
    const topPosition = rect.top + window.scrollY + rect.height / 2 - popup.offsetHeight / 2;
    popup.style.top = `${topPosition}px`;
    let left = rect.right + window.scrollX + offset;
    if (left + popup.offsetWidth > window.innerWidth) {
        left = rect.left + window.scrollX - popup.offsetWidth - offset;
    }
    popup.style.left = `${left}px`;
}

export function closeColorPopup() {
    if (state.currentColorPopup) {
        const popupToRemove = state.currentColorPopup;
        const indicatorToFocus = state.lastClickedIndicator;

        state.currentColorPopup = null;
        state.lastClickedIndicator = null;

        popupToRemove.classList.add('hiding');
        popupToRemove.addEventListener(
            'animationend',
            () => {
                if (popupToRemove.parentNode) {
                    popupToRemove.parentNode.removeChild(popupToRemove);
                }
            },
            {
                once: true,
            },
        );

        if (indicatorToFocus) {
            indicatorToFocus.focus();

            const groupId = indicatorToFocus.closest('.group-item')?.dataset.groupId;
            if (groupId) {
                state.elementToFocusAfterRender = {
                    type: 'color-indicator',
                    groupId: groupId,
                };
            }
        }
    }
}

export async function moveSplitGroup(sourceGroupId) {
    const groupInfoMap = await getGroupInfoMap();
    let splitGroupId = null;

    // 1. Find "Split" group ID
    for (const [id, info] of groupInfoMap.entries()) {
        if (info.type === 'manual' && info.key === 'Split') {
            splitGroupId = id;
            break;
        }
    }

    // 2. If no "Split" group or same as source, do nothing
    if (!splitGroupId || splitGroupId === sourceGroupId) {
        return;
    }

    // 3. Pin both groups so their order is controllable
    state.pinnedGroupIds.add(splitGroupId);

    // 4. Get current visual order of groups from DOM
    const currentOrder = [...document.querySelectorAll('#groups-list .group-item')].map((el) =>
        parseInt(el.dataset.groupId, 10),
    );

    // 5. Remove "Split" group from current position
    const orderWithoutSplit = currentOrder.filter((id) => id !== splitGroupId);

    // 6. Find source group index
    const sourceIndex = orderWithoutSplit.indexOf(sourceGroupId);

    // 7. If source group found, insert "Split" group after it
    if (sourceIndex > -1) {
        orderWithoutSplit.splice(sourceIndex + 1, 0, splitGroupId);
        state.userDefinedOrder = orderWithoutSplit; // Update main order array
    } else {
        // Fallback: if source group wasn't in list for some reason,
        // simply add it along with "Split" group at end of current order.
        state.userDefinedOrder = orderWithoutSplit;
        if (!state.userDefinedOrder.includes(sourceGroupId)) {
            state.userDefinedOrder.push(sourceGroupId);
        }
        state.userDefinedOrder.push(splitGroupId);
    }

    // 8. Save new state and re-render list
    await fn.saveState();
    await renderGroups();
}

export async function changeGroupColor(groupId, newColor) {
    await chrome.tabGroups.update(parseInt(groupId, 10), {
        color: newColor,
    });

    closeColorPopup();
}

export async function handleRemoveDuplicates() {
    if (state.isBookmarksViewActive) {
        chrome.runtime.sendMessage({ action: 'removeDuplicateBookmarks' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error sending 'removeDuplicateBookmarks' message:", chrome.runtime.lastError.message);
                showNotification('errorCommunicatingWithService', true);
                return;
            }
            if (response && response.success && response.count > 0) {
                showNotification('duplicateBookmarksRemoved', false, [response.count]);

                // Animated removal logic instead of reloading view
                if (response.removedIds && response.removedIds.length > 0) {
                    response.removedIds.forEach((id) => {
                        const bookmarkElement = document.querySelector(`.bookmark-item[data-bookmark-id="${id}"]`);
                        if (bookmarkElement) {
                            animateAndRemove(bookmarkElement, false);
                        }
                    });
                }
                // Update counter after removing elements
                updateDuplicateCountBadge();
            } else {
                showNotification('noDuplicateBookmarksFound');
            }
        });
    } else {
        // Existing logic for tabs
        chrome.runtime.sendMessage(
            {
                action: 'removeDuplicateTabs',
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(`Error sending 'removeDuplicateTabs' message: ${chrome.runtime.lastError.message}`);
                    showNotification('errorCommunicatingWithService', true);
                } else {
                    if (response && response.count > 0) {
                        showNotification('duplicateTabsRemovedMessage', false, [response.count]);
                    }
                }
            },
        );
    }
}

/**
 * Updates an existing tab element with new data (title, favicon, audible, etc.)
 */
// Removed updateTabElement for Svelte migration
