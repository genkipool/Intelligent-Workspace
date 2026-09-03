/**
 * groupsService.js — Refactored from groups-renderer.js
 *
 * Contains ALL exported functions from groups-renderer.js with:
 * - state.X → store imports from appStore.svelte.js (via get())
 * - dom.X → direct document.getElementById/querySelector
 * - fn.X() → direct function imports
 * - chrome.i18n.getMessage → direct call
 * - STORAGE_KEYS from state.js
 */

import { get, writable } from 'svelte/store';

import { applyTranslations, showNotification, getCurrentLang, loadMessages } from '@/utils/i18n.js';

import {
    openModal,
    showQrCodeModal as showQrCodeModalStore,
    showCookieEditorModal as showCookieEditorModalStore,
} from '@/ui/stores/modalStore.js';

import { saveBackupToDb, deleteBackupFromDb } from '../../utils/db.js';

import { colors, noteConfig, screenshotConfig, PAGE_MODES } from './constants.js';
import { getGroupInfoMap, animateAndRemove, linkedGroupIds } from './utils.js';
import { exportCookies, processCookieFile } from '../../utils/importExport.js';

// Direct function imports (replacing fn.X())
import { showAddToRuleModal } from './bookmarksService.js';
import { openNoteModal, showNotesView } from './notesService.js';
import { clearAllContextDataUI, showScreenshotGallery } from './screenshotsService.js';
import { getStorage, loadState, saveState, whenStateLoaded } from './settingsService.js';
import { openUrlInPanel, toggleExpandAll, updateExpandAllButtonState } from './viewsService.js';
import { closeDownloadModal } from './downloadsService.js';
import { getReadAloudReadings, setAllReadAloudPaused } from './readAloudService.js';

// Store imports from appStore (replacing state.X)
import {
    currentMainView,
    isBookmarksViewActive,
    isGeminiViewActive,
    isNotesViewActive,
    currentNotesContext,
    isGalleryViewActive,
    isUrlViewActive,
    isPopupWindow,
    isProgrammaticActivation,
    isPerformingProgrammaticUpdate,
    elementToFocusAfterRender,
    backedUpGroupData,
    restoredGroupIds,
    currentColorPopup,
    currentDownloadModal,
    lastClickedIndicator,
    currentlyEditingInput,
    currentGalleryContext,
    expandedGroupStates,
    expandedSubgroupStates,
} from '../stores/appStore.svelte.js';

// Import themeColors from listGroupStore (not in appStore)
import { listGroupState } from '../stores/listGroupStore.js';

// ─── Local writable stores for state not in appStore ───

/** @type {import('svelte/store').Writable<number[]>} */
export const userDefinedOrder = writable([]);

/** @type {import('svelte/store').Writable<Set<number>>} */
export const pinnedGroupIds = writable(new Set());

/** @type {import('svelte/store').Writable<Set<number>>} */
export const hiddenGroupIds = writable(new Set());

/** @type {import('svelte/store').Writable<number|null>} */
export const pinnedAtLastPositionId = writable(null);

// ─── Exported Functions ───

/**
 * The hover menu an action button can carry.
 *
 * The page-mode button has always had one; the summary and the camera now need the
 * same thing, so the mechanics live here once. The caller only says what the rows
 * are: the mounting, the show/hide timing and the teardown are the same either way.
 *
 * The rows are built on every hover rather than once, because what they should say
 * depends on state that moves — which page mode is in force, whether the reader is
 * already talking.
 *
 * @param {HTMLElement} container The positioned wrapper the popup is appended to.
 * @param {() => Array<{label?: string, i18n?: string, active?: boolean, onSelect: () => void}>} buildItems
 */
export function createHoverActionPopup(container, buildItems) {
    if (!container || container.dataset.hoverPopupBound === 'true') return;
    container.dataset.hoverPopupBound = 'true';

    let popupEl = null;
    let hideTimeout;

    const removePopup = () => {
        if (!popupEl) return;
        const leaving = popupEl;
        popupEl = null;
        leaving.classList.remove('visible');
        setTimeout(() => leaving.remove(), 200);
    };

    const showPopup = () => {
        clearTimeout(hideTimeout);
        if (popupEl) return;

        const items = buildItems() || [];
        if (items.length === 0) return;

        popupEl = document.createElement('div');
        // The look is the page-mode menu's; `action-popup` is what the two share.
        popupEl.className = 'page-mode-popup action-popup';

        items.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'page-mode-item action-popup-item';
            row.setAttribute('role', 'button');
            row.tabIndex = 0;
            if (item.i18n) row.setAttribute('data-i18n', item.i18n);
            if (item.label) row.textContent = item.label;
            if (item.active) row.classList.add('active');
            row.addEventListener('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
                removePopup();
                item.onSelect();
            });
            popupEl.appendChild(row);
        });

        container.appendChild(popupEl);
        requestAnimationFrame(() => popupEl?.classList.add('visible'));
        applyTranslations(popupEl);
    };

    container.addEventListener('mouseenter', showPopup);
    container.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(removePopup, 200);
    });
}

/**
 * The reading modes of one tab, as the hover menu of its page-mode button.
 *
 * Kept as its own function because the mode that is in force has to be worked out
 * per tab, and because two other places (the overflow menu and the context menu)
 * send the very same message.
 */
export function createPageModePopup(container, tabEl, pageModes) {
    createHoverActionPopup(container, () => {
        const tabId = parseInt(tabEl.dataset.tabId, 10);
        const tabMode = pageModes.tabModes?.[tabId];
        const effectiveMode = tabMode !== undefined ? tabMode : pageModes.globalMode;

        return PAGE_MODES.map(({ mode, i18n }) => ({
            i18n,
            active: mode === effectiveMode,
            onSelect: () => applyPageMode(tabId, mode, i18n),
        }));
    });
}

/** Sends one page mode to one tab and reports back the way every caller expects. */
export function applyPageMode(tabId, mode, i18nKey) {
    if (isNaN(tabId)) return;
    chrome.runtime.sendMessage({ action: 'setPageMode', mode, scope: 'tab', tabId }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error sending setPageMode message:', chrome.runtime.lastError.message);
            showNotification('errorApplyingMode', true);
        } else if (response && response.success) {
            showNotification('modeAppliedSuccessfully', false, [chrome.i18n.getMessage(i18nKey) || mode]);
            renderGroups();
        }
    });
}

export function showQrCodeModal(url) {
    openModal(showQrCodeModalStore, { url });
}

export function isLikelyDomain(str) {
    return !str.includes(' ') && str.includes('.');
}

export async function getValidStandardTabs() {
    const allWindows = await chrome.windows.getAll({ populate: true });
    const validWindows = allWindows.filter((win) => win.type === 'normal' && !win.alwaysOnTop);
    return validWindows.flatMap((win) => win.tabs || []);
}

/** Whether the speaker button is currently offering to bring the sound back. */
export function isEverythingSilenced() {
    const btn = document.getElementById('mute-all-tabs-btn');
    return !!btn?.querySelector('.icon-speaker')?.classList.contains('hidden');
}

/**
 * Silences everything the browser is playing, or brings it all back.
 *
 * Both halves are needed on each pass: the tabs Chrome can mute, and the page
 * reader, whose voice never goes through a tab and has to be paused inside the page
 * it is reading. Leaving the reading out of the way back would make the button a
 * one-way trip — silence it once and it could never be resumed from here.
 */
export async function toggleMuteAllSources() {
    const btn = document.getElementById('mute-all-tabs-btn');
    if (!btn) return;
    const iconSpeaker = btn.querySelector('.icon-speaker');
    const iconMuted = btn.querySelector('.icon-speaker-muted');
    const allTabs = await getValidStandardTabs();

    if (isEverythingSilenced()) {
        const mutedTabs = allTabs.filter((t) => t.mutedInfo && t.mutedInfo.muted);
        for (const tab of mutedTabs) chrome.tabs.update(tab.id, { muted: false });
        await setAllReadAloudPaused(false);
        iconSpeaker.classList.remove('hidden');
        iconMuted.classList.add('hidden');
        btn.title = chrome.i18n.getMessage('muteAllTabs');
        syncAllTabIndicators(false);
    } else {
        const audibleTabs = allTabs.filter((t) => t.audible && !(t.mutedInfo && t.mutedInfo.muted));
        // Pausing the reader counts as silencing something, so a page being read out
        // loud is reason enough for the click to do anything at all.
        const pausedReadings = await setAllReadAloudPaused(true);
        if (audibleTabs.length === 0 && pausedReadings === 0) {
            updateMuteButtonState();
            return;
        }
        for (const tab of audibleTabs) chrome.tabs.update(tab.id, { muted: true });
        iconSpeaker.classList.add('hidden');
        iconMuted.classList.remove('hidden');
        btn.title = chrome.i18n.getMessage('unmuteAllTabs');
        syncAllTabIndicators(true);
    }
    setTimeout(() => updateMuteButtonState(), 300);
}

export async function updateMuteButtonState() {
    const btn = document.getElementById('mute-all-tabs-btn');
    if (!btn) return;
    const iconSpeaker = btn.querySelector('.icon-speaker');
    const iconMuted = btn.querySelector('.icon-speaker-muted');

    // Audio in any tab fires this while the assistant, the notes or any other view is
    // on screen, and those views do not own this button. Revealing it there made it
    // appear and vanish as the view routine hid it again, which is the flicker the
    // control strip showed every time a video was played or paused.
    const belongsToCurrentView =
        get(currentMainView) === 'groups' &&
        !get(isGeminiViewActive) &&
        !get(isNotesViewActive) &&
        !get(isGalleryViewActive) &&
        !get(isUrlViewActive);
    if (!belongsToCurrentView) {
        btn.classList.add('hidden');
        return;
    }

    const allTabs = await getValidStandardTabs();
    const audibleUnmuted = allTabs.filter((t) => t.audible && !(t.mutedInfo && t.mutedInfo.muted));
    const explicitlyMuted = allTabs.filter((t) => t.mutedInfo && t.mutedInfo.muted);

    // The page reader is a voice like any other as far as this button is concerned,
    // but Chrome knows nothing about it: speech synthesis does not go through the
    // tab's audio, so a tab being read out loud is never `audible`. The worker keeps
    // the list because the reader reports to it from inside the page.
    const readings = await getReadAloudReadings();
    const speaking = readings.filter((r) => !r.paused);

    const hasAudibleUnmuted = audibleUnmuted.length > 0 || speaking.length > 0;
    const hasMuted = explicitlyMuted.length > 0 || readings.length > speaking.length;

    if (!hasAudibleUnmuted && !hasMuted) {
        btn.classList.add('hidden');
        return;
    }

    btn.classList.remove('hidden');

    // With a reading in the mix the button silences more than tabs, so it says so.
    const hasReading = readings.length > 0;
    if (!hasAudibleUnmuted && hasMuted) {
        iconSpeaker.classList.add('hidden');
        iconMuted.classList.remove('hidden');
        btn.title = chrome.i18n.getMessage(hasReading ? 'unmuteAllSources' : 'unmuteAllTabs');
    } else {
        iconSpeaker.classList.remove('hidden');
        iconMuted.classList.add('hidden');
        btn.title = chrome.i18n.getMessage(hasReading ? 'muteAllSources' : 'muteAllTabs');
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

        const subGroup = createRuleTarget.closest('.domain-subgroup');
        const groupItem = createRuleTarget.closest('.group-item');
        const bookmarkFolder = createRuleTarget.closest('.bookmark-folder');
        const bookmarkItem = createRuleTarget.closest('.bookmark-item');

        let urlsArray = [];
        let ruleName = '';

        if (subGroup) {
            const tabs = subGroup.querySelectorAll('.tab-item');
            urlsArray = Array.from(tabs).map((t) => t.dataset.url);
            ruleName = subGroup.querySelector('.domain-title').textContent.trim();
        } else if (groupItem) {
            const tabs = groupItem.querySelectorAll('.tab-item');
            urlsArray = Array.from(tabs).map((t) => t.dataset.url);
            const titleEl = groupItem.querySelector('.group-title');
            ruleName = titleEl.dataset.baseName || titleEl.textContent.trim();
        } else if (bookmarkItem && !bookmarkItem.classList.contains('bookmark-folder')) {
            // Asked before the folder: a bookmark sits inside its folder's markup, so
            // checking the folder first named every single-bookmark rule after the
            // folder it happened to live in.
            urlsArray = [bookmarkItem.querySelector('.bookmark-title').title.split('\n')[1] || ''];
            ruleName = bookmarkItem.querySelector('.bookmark-title').textContent.trim();
        } else if (bookmarkFolder) {
            const bookmarks = bookmarkFolder.querySelectorAll('.bookmark-title');
            urlsArray = Array.from(bookmarks).map(
                (b) => b.title.split('\n')[1] || b.closest('.bookmark-item').dataset.url || '',
            );
            ruleName = bookmarkFolder.querySelector('.folder-name').textContent.trim();
        }

        const uniqueUrls = [...new Set(urlsArray)]
            .map((url) => url.trim())
            .filter((url) => url !== '')
            .join('\n');

        const cleanRuleName = ruleName.replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();

        if (uniqueUrls.length > 0) {
            const encodedUrl = encodeURIComponent(uniqueUrls);
            const encodedName = encodeURIComponent(cleanRuleName);

            const currentPage = window.location.pathname.split('/').pop();
            chrome.storage.local.set({ navSource: `../listGroup/${currentPage}?view=${get(currentMainView)}` }, () => {
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
            showAddToRuleModal(url, title);
        }
    }
}

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

export async function openCookieEditorModal(url) {
    const response = await chrome.runtime.sendMessage({ action: 'getCookiesForUrl', url });
    if (!response.success) {
        showNotification('errorFetchingCookies', true);
        console.error('Failed to fetch cookies:', response.error);
        return;
    }
    openModal(showCookieEditorModalStore, { url, cookies: response.cookies, originalCookies: response.cookies });
}

export async function saveCookieChanges(url, originalCookies, modalBody) {
    let currentCookies;
    if (Array.isArray(modalBody)) {
        currentCookies = modalBody;
    } else {
        const currentCookieElements = modalBody.querySelectorAll('.cookie-entry-card');
        currentCookies = [];
        currentCookieElements.forEach((card) => {
            currentCookies.push({
                name: card.querySelector('.cookie-name').textContent,
                value: card.querySelector('.cookie-value').value,
                domain: card.querySelector('.cookie-domain').value,
                path: card.querySelector('.cookie-path').value,
                secure: card.querySelector('.cookie-secure').checked,
                httpOnly: card.querySelector('.cookie-httponly').checked,
                sameSite: card.querySelector('.cookie-samesite').value,
                expirationDate: readCookieExpirationFromCard(card),
            });
        });
    }
    const currentCookiesMap = new Map(currentCookies.map((c) => [c.name + c.domain + c.path, c]));
    const originalCookiesMap = new Map(originalCookies.map((c) => [c.name + c.domain + c.path, c]));

    const promises = [];

    for (const [key, originalCookie] of originalCookiesMap.entries()) {
        if (!currentCookiesMap.has(key)) {
            promises.push(chrome.runtime.sendMessage({ action: 'removeCookie', url, cookie: originalCookie }));
        }
    }

    for (const [key, currentCookie] of currentCookiesMap.entries()) {
        const originalCookie = originalCookiesMap.get(key);
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
        const ungroupedTabs = await chrome.tabs.query({
            groupId: chrome.tabGroups.TAB_GROUP_ID_NONE,
        });
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

/**
 * Counts how many runs of `updateDuplicateCountBadge` have started.
 *
 * Both branches of that function reach their number asynchronously — the bookmark
 * one waits for the worker, the tab one for `chrome.tabs.query` — and several
 * callers fire it back to back while a view is being switched. Whichever answer
 * arrived last used to win, so opening the bookmarks view showed the tab count:
 * the bookmark total was written first and a later run, still on the tab branch,
 * overwrote it. A run only writes if it is still the most recent one.
 */
let duplicateBadgeRun = 0;

export async function updateDuplicateCountBadge() {
    const duplicateBadge = document.getElementById('duplicate-badge');
    const removeDuplicatesBtn = document.getElementById('remove-duplicates-btn');

    if (!duplicateBadge || !removeDuplicatesBtn) return;

    const run = ++duplicateBadgeRun;
    const isStale = () => run !== duplicateBadgeRun;

    const $isBookmarksViewActive = get(isBookmarksViewActive) || get(currentMainView) === 'bookmarks';
    const isGroupsViewActive =
        get(currentMainView) === 'groups' &&
        !get(isBookmarksViewActive) &&
        !get(isGeminiViewActive) &&
        !get(isNotesViewActive) &&
        !get(isGalleryViewActive) &&
        !get(isUrlViewActive);
    const isRelevantView = $isBookmarksViewActive || isGroupsViewActive;

    if (!isRelevantView) {
        duplicateBadge.classList.add('hidden');
        removeDuplicatesBtn.classList.add('hidden');
        return;
    }
    const tooltipKey = $isBookmarksViewActive ? 'removeDuplicateBookmarksTooltip' : 'removeDuplicateTabs';
    removeDuplicatesBtn.setAttribute('data-i18n-title', tooltipKey);
    applyTranslations(removeDuplicatesBtn);

    if ($isBookmarksViewActive) {
        chrome.runtime.sendMessage({ action: 'getDuplicateBookmarkCount' }, (response) => {
            if (isStale()) return;
            if (chrome.runtime.lastError) {
                console.error('Error getting duplicate bookmark count:', chrome.runtime.lastError.message);
                duplicateBadge.classList.add('hidden');
                removeDuplicatesBtn.classList.add('hidden');
                return;
            }

            const hasDuplicates = response && response.success && response.count > 0;

            if (hasDuplicates) {
                const duplicateCount = response.count;
                duplicateBadge.textContent = duplicateCount > 999 ? '999+' : String(duplicateCount);
                duplicateBadge.classList.remove('hidden');
                removeDuplicatesBtn.classList.remove('hidden');
            } else {
                duplicateBadge.classList.add('hidden');
                removeDuplicatesBtn.classList.add('hidden');
            }
        });
    } else {
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

            if (isStale()) return;
            if (duplicateCount > 0) {
                duplicateBadge.textContent = duplicateCount > 999 ? '999+' : String(duplicateCount);
                duplicateBadge.classList.remove('hidden');
                removeDuplicatesBtn.classList.remove('hidden');
            } else {
                duplicateBadge.classList.add('hidden');
                removeDuplicatesBtn.classList.add('hidden');
            }
        } catch (e) {
            console.error('Error updating duplicate tab count:', e);
            duplicateBadge.classList.add('hidden');
            removeDuplicatesBtn.classList.add('hidden');
        }
    }
}

export function scrollToActiveGroupIfNeeded() {
    if (document.hasFocus() || get(isUrlViewActive) || get(isGeminiViewActive)) {
        return;
    }

    const activeTabEl = document.querySelector('.tab-item.active');
    const scrollableContainer = document.getElementById('groups-list');

    if (!activeTabEl || !scrollableContainer) {
        return;
    }

    const parentGroup = activeTabEl.closest('details.group-item');
    if (!parentGroup) {
        return;
    }

    const parentSubgroup = activeTabEl.closest('details.domain-subgroup');

    if (parentSubgroup && !parentSubgroup.open) {
        parentSubgroup.open = true;
    }
    if (parentGroup && !parentGroup.open) {
        parentGroup.open = true;
    }

    // Opening the group above changed the layout, so the measuring waits for the next
    // frame — except that a page in a background tab gets no frames, and switching tabs
    // in the browser is exactly when this runs. A timeout keeps the list positioned for
    // when the panel comes back into view.
    const measureWhenLaidOut = (fn) => (document.hidden ? setTimeout(fn, 0) : requestAnimationFrame(fn));

    measureWhenLaidOut(() => {
        const containerRect = scrollableContainer.getBoundingClientRect();
        const tabRect = activeTabEl.getBoundingClientRect();

        const isTabVisible = tabRect.top >= containerRect.top && tabRect.bottom <= containerRect.bottom;

        if (isTabVisible) {
            return;
        }

        const tabScrollOffset = tabRect.top - containerRect.top + scrollableContainer.scrollTop;
        const groupRect = parentGroup.getBoundingClientRect();
        const groupScrollOffset = groupRect.top - containerRect.top + scrollableContainer.scrollTop;

        const visibleAreaHeight = scrollableContainer.clientHeight;

        let targetScrollTop;

        const contentHeightUntilTabBottom = tabScrollOffset + activeTabEl.offsetHeight - groupScrollOffset;

        if (contentHeightUntilTabBottom > visibleAreaHeight) {
            targetScrollTop = tabScrollOffset;
        } else {
            targetScrollTop = groupScrollOffset;
        }

        scrollableContainer.scrollTo({
            top: targetScrollTop,
            // A smooth scroll is animated frame by frame and a hidden page gets no
            // frames, so it would never actually move; jump straight there instead.
            behavior: document.hidden ? 'auto' : 'smooth',
        });
    });
}

export function renderNotesButton(actionsContainer, context, notesData) {
    const { type, id, secondaryId } = context;
    let totalNoteIds = new Set();

    if (type === 'group') {
        const groupKey = id === -100 ? 'g_ungrouped' : `g_${id}`;
        if (notesData[groupKey]) {
            notesData[groupKey].forEach((noteId) => totalNoteIds.add(noteId));
        }
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
            openNoteModal(context);
        });
        const copyBtn = actionsContainer.querySelector('.copy-group-urls-btn, .copy-subgroup-urls-btn');
        if (copyBtn) {
            actionsContainer.insertBefore(noteBtn, copyBtn);
        } else {
            actionsContainer.appendChild(noteBtn);
        }
        applyTranslations(noteBtn);
    }

    const deleteBtn = noteBtn.querySelector('.delete-notes-btn');
    if (deleteBtn && !deleteBtn.dataset.listenersBound) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await clearAllContextDataUI(context, noteConfig);
        });
        deleteBtn.dataset.listenersBound = 'true';
    }

    const noteCountBadge = noteBtn.querySelector('.note-count-badge');
    if (noteCountBadge && !noteCountBadge.dataset.listenersBound) {
        noteCountBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showNotesView(context);
        });
        noteCountBadge.dataset.listenersBound = 'true';
    }

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
        const subgroupPrefix = id === -100 ? 's_ungrouped_' : `s_${id}_`;
        for (const key in screenshotData) {
            if (key.startsWith(subgroupPrefix)) {
                screenshotData[key].forEach((screenshotId) => totalScreenshotIds.add(screenshotId));
            }
        }
    } else {
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
                showScreenshotGallery(type, id, secondaryId || title);
            });

            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'delete-screenshots-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = chrome.i18n.getMessage('deleteAllScreenshotsContext') || 'Eliminar todas las capturas';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                await clearAllContextDataUI({ type, id, secondaryId }, screenshotConfig);
            });
            galleryBtn.appendChild(deleteBtn);
            actionsContainer.prepend(galleryBtn);
            applyTranslations(galleryBtn);
        }

        galleryBtn.classList.remove('hidden');
        galleryBtn.querySelector('.screenshot-count-badge').textContent = screenshotCount;
    } else if (galleryBtn) {
        galleryBtn.remove();
    }
}

export function renderGroupTitle(groupTitleEl, group, groupInfoMap, groupPrefixState) {
    const info = groupInfoMap.get(group.id);
    let baseDisplayName;

    if (info) {
        if (info.type === 'manual' && info.key) {
            baseDisplayName = info.key.replace(/\u200B/g, '');
        } else if (info.title) {
            baseDisplayName = info.title.replace(/\u200B/g, '');
        } else {
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
    const $elementToFocusAfterRender = get(elementToFocusAfterRender);
    if ($elementToFocusAfterRender) {
        const { type, groupId } = $elementToFocusAfterRender;
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

        elementToFocusAfterRender.set(null);
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

            const mainSearchInput = document.getElementById('search-input');
            if (mainSearchInput) {
                mainSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
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

/**
 * The stored shape of a backed-up group.
 *
 * `order` keeps the urls in the order the group had when it was put away. Tabs brought
 * back one by one leave `tabs`, so this is what lets the card keep showing them in
 * their place instead of moving them.
 */
function buildBackupObject(groupData, title, index) {
    const tabs = groupData.tabs.map((t) => ({
        url: t.url,
        title: t.title,
        favIconUrl: t.favIconUrl,
        pinned: t.pinned,
    }));
    return {
        group: { ...groupData.group, title },
        tabs,
        order: tabs.map((t) => t.url),
        index: index >= 0 ? index : Infinity,
        createdAt: Date.now(),
    };
}

export async function handleBackupAllGroups() {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeGroupId = activeTab ? activeTab.groupId : -1;

    const allGroupDataRaw = await fetchData();
    const $backedUpGroupData = get(backedUpGroupData);
    // A group linked to a backup is already listed inside that backup's card, so it is
    // not a separate group to put away.
    const linked = linkedGroupIds($backedUpGroupData);
    const groupsToBackup = allGroupDataRaw.filter(
        (item) =>
            item.group.id !== activeGroupId &&
            !$backedUpGroupData.hasOwnProperty(item.group.id) &&
            !linked.has(item.group.id) &&
            item.group.id !== -100,
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

        const groupEl = originalIndex !== -1 ? allGroupEls[originalIndex] : null;
        const groupTitleEl = groupEl ? groupEl.querySelector('.group-title') : null;
        const originalTitle = groupTitleEl ? groupTitleEl.dataset.baseName : groupData.group.title;

        const backupObject = buildBackupObject(groupData, originalTitle, originalIndex);

        const currentBackedUp = get(backedUpGroupData);
        currentBackedUp[groupData.group.id] = backupObject;
        backedUpGroupData.set(currentBackedUp);
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
            await loadState();
            await renderGroups();
        }
    }
}

export async function handleRestoreAllGroups() {
    const $backedUpGroupData = get(backedUpGroupData);
    const groupIdsToRestore = Object.keys($backedUpGroupData).map((id) => parseInt(id, 10));

    if (groupIdsToRestore.length === 0) {
        showNotification('noGroupsToRestore', true);
        return;
    }

    for (const groupId of groupIdsToRestore) {
        await handleRestoreGroup(groupId, true, true);
    }

    showNotification('allGroupsRestored', false, [groupIdsToRestore.length]);

    await renderGroups();
}

export async function handleRestoreSingleTab(groupId, tabToRestore) {
    const $backedUpGroupData = get(backedUpGroupData);
    const backupData = $backedUpGroupData[groupId];
    if (!backupData) {
        console.error(`Backup data not found for group ${groupId}`);
        showNotification('errorRestoreGroup', true);
        return;
    }

    get(isProgrammaticActivation); // read to ensure store is observed
    isProgrammaticActivation.set(true);
    setTimeout(() => {
        isProgrammaticActivation.set(false);
    }, 1000);
    isPerformingProgrammaticUpdate.set(true);

    try {
        let targetGroupId = backupData.linkedGroupId;
        const newTab = await chrome.tabs.create({ url: tabToRestore.url, active: true });

        if (!targetGroupId) {
            const newGroupId = await chrome.tabs.group({ tabIds: [newTab.id] });
            await chrome.tabGroups.update(newGroupId, {
                title: backupData.group.title,
                color: backupData.group.color,
            });
            targetGroupId = newGroupId;
        } else {
            await chrome.tabs.group({ groupId: targetGroupId, tabIds: [newTab.id] });
        }

        const restoredIndex = backupData.tabs.findIndex(
            (t) => t.url === tabToRestore.url && t.title === tabToRestore.title,
        );
        const remaining = backupData.tabs.filter((_, index) => index !== restoredIndex);

        // The tab joins the list and leaves the backup in the same update: the row on
        // the card only changes state, it is never removed and rebuilt.
        const { groupStore } = await import('../stores/groupStore.js');
        groupStore.adoptRestoredTab(
            { ...backupData.group, id: targetGroupId },
            { ...newTab, url: newTab.url || tabToRestore.url, title: newTab.title || tabToRestore.title },
        );

        if (remaining.length === 0) {
            const currentRestored = get(restoredGroupIds);
            currentRestored.add(targetGroupId);
            restoredGroupIds.set(currentRestored);

            backedUpGroupData.update((all) =>
                Object.fromEntries(Object.entries(all).filter(([id]) => id !== String(groupId))),
            );

            await deleteBackupFromDb(groupId);
            showNotification('groupRestored', false, [backupData.group.title]);
        } else {
            // The card follows the store, so the remaining tabs and the counter update
            // themselves once the new value lands.
            const updated = { ...backupData, tabs: remaining, linkedGroupId: targetGroupId };
            backedUpGroupData.update((all) => ({ ...all, [groupId]: updated }));
            await saveBackupToDb(updated);
            showNotification('singleTabRestored', false, [tabToRestore.title]);
        }
    } catch (error) {
        console.error('Error during restoration of a single tab:', error);
        showNotification('errorRestoreTab', true);
        await renderGroups();
    } finally {
        isPerformingProgrammaticUpdate.set(false);
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

    const groupEl = allGroupEls.find((el) => parseInt(el.dataset.groupId, 10) === groupId);
    const groupTitleEl = groupEl ? groupEl.querySelector('.group-title') : null;
    const originalTitle = groupTitleEl ? groupTitleEl.dataset.baseName : groupData.group.title;

    const backupObject = buildBackupObject(groupData, originalTitle, originalIndex);

    const currentBackedUp = get(backedUpGroupData);
    currentBackedUp[groupId] = backupObject;
    backedUpGroupData.set(currentBackedUp);

    const tabIdsToRemove = groupData.tabs.map((t) => t.id);
    if (tabIdsToRemove.length > 0) {
        try {
            await Promise.all([saveBackupToDb(backupObject), chrome.tabs.remove(tabIdsToRemove)]);
            showNotification('groupBackedUp', false, [originalTitle]);
        } catch (e) {
            console.error('Error during backup:', e);
            const currentBackedUp2 = get(backedUpGroupData);
            delete currentBackedUp2[groupId];
            backedUpGroupData.set(currentBackedUp2);
            await deleteBackupFromDb(groupId);
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
                active: false,
                pinned: tabInfo.pinned || false,
            }),
        );
        const newTabs = await Promise.all(creationPromises);
        createdTabs.push(...newTabs);
        if (i + batchSize < tabsToCreate.length) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    return createdTabs;
}

export async function handleRestoreGroup(groupId, suppressNotification = false, skipRender = false) {
    const $backedUpGroupData = get(backedUpGroupData);
    const backupData = $backedUpGroupData[groupId];

    if (!backupData || !backupData.tabs || backupData.tabs.length === 0) {
        console.error(`Backup data for ID ${groupId} is invalid or empty.`);
        if (!suppressNotification) showNotification('errorRestoreGroup', true);
        return;
    }

    get(isProgrammaticActivation);
    isProgrammaticActivation.set(true);
    isPerformingProgrammaticUpdate.set(true);

    try {
        const createdTabs = await createTabsInBatches(backupData.tabs);

        const newTabIds = createdTabs.map((t) => t.id);
        const newGroupId = await chrome.tabs.group({ tabIds: newTabIds });
        await chrome.tabGroups.update(newGroupId, {
            title: backupData.group.title,
            color: backupData.group.color,
        });

        const currentRestored = get(restoredGroupIds);
        currentRestored.add(newGroupId);
        restoredGroupIds.set(currentRestored);

        backedUpGroupData.update((all) =>
            Object.fromEntries(Object.entries(all).filter(([id]) => id !== String(groupId))),
        );

        await deleteBackupFromDb(groupId);

        if (!suppressNotification) {
            showNotification('groupRestored', false, [backupData.group.title]);
        }
    } catch (e) {
        console.error('Error restoring group:', e);
        if (!suppressNotification) showNotification('errorRestoreGroup', true);
    } finally {
        isProgrammaticActivation.set(false);
        isPerformingProgrammaticUpdate.set(false);
        if (!skipRender) {
            await renderGroups();
        }
    }
}

let renderDebounceTimer = null;
let isRendering = false;
let pendingRender = false;

export async function renderGroups() {
    await whenStateLoaded();
    // Components own the rendering; this refreshes the stores that feed them,
    // debounced to coalesce bursts.
    if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
    renderDebounceTimer = setTimeout(async () => {
        renderDebounceTimer = null;
        if (isRendering) {
            pendingRender = true;
            return;
        }
        isRendering = true;
        try {
            const [{ groupStore }, { loadRenderContext }] = await Promise.all([
                import('../stores/groupStore.js'),
                import('../stores/renderContextStore.js'),
            ]);
            await Promise.all([groupStore.fetchGroups(), loadRenderContext()]);
            updateDuplicateCountBadge();
        } catch (e) {
            console.error('[renderGroups] refresh error:', e);
        } finally {
            isRendering = false;
            if (pendingRender) {
                pendingRender = false;
                renderGroups();
            }
        }
    }, 150);
}

export async function unGroupAndRemoveAllTabsInGroup(groupId) {
    try {
        const tabsInGroup = await chrome.tabs.query({
            groupId: parseInt(groupId, 10),
        });
        if (tabsInGroup.length > 0) {
            const tabIds = tabsInGroup.map((t) => t.id);
            await chrome.tabs.ungroup(tabIds);
            await chrome.tabs.remove(tabIds);
        }
    } catch (error) {
        console.error(`Error ungrouping and deleting tabs from group ${groupId}:`, error);
        showNotification('errorRemovingTabs', true);
    }
}

export async function fetchData() {
    const storage = await getStorage();
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

    // Groups holding tabs restored from a backup are not filtered out here: the list
    // needs their tabs to show them inside the backup card they came from, which is
    // where withBackups() places them.
    const groups = allGroupsRaw;

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

    const inputEl = document.createElement('input');
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

    currentlyEditingInput.set(inputEl);

    const saveChanges = async () => {
        inputEl.removeEventListener('blur', saveChanges);

        currentlyEditingInput.set(null);
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

        if (inputEl.parentNode) {
            inputEl.replaceWith(groupTitleEl);
        }

        if (focusAfterEdit) {
            elementToFocusAfterRender.set({ type: 'group-title', groupId: groupId });
        }
    };

    inputEl.addEventListener('blur', saveChanges);
    inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
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
            openUrlInPanel(url, context);
        }
        return true;
    }

    if (get(isPopupWindow)) {
        event.preventDefault();
        if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
            openUrlInPanel(url, context);
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
    const { listGroupStore } = await import('../stores/listGroupStore.js');
    await listGroupStore.actions.hideGroup(groupId);
}

export async function unhideGroup(groupId) {
    const { listGroupStore } = await import('../stores/listGroupStore.js');
    await listGroupStore.actions.unhideGroup(groupId);
}

export async function togglePinState(groupId) {
    const numericId = parseInt(groupId, 10);
    const currentPinned = get(pinnedGroupIds);
    const isCurrentlyPinned = currentPinned.has(numericId);

    if (isCurrentlyPinned) {
        currentPinned.delete(numericId);
        pinnedGroupIds.set(currentPinned);
        const currentPinnedAtLast = get(pinnedAtLastPositionId);
        if (currentPinnedAtLast === numericId) {
            pinnedAtLastPositionId.set(null);
        }
        const currentOrder = get(userDefinedOrder);
        const newOrder = currentOrder.filter((id) => id !== numericId);
        userDefinedOrder.set(newOrder);
        if (get(pinnedGroupIds).size === 0) {
            userDefinedOrder.set([]);
            pinnedAtLastPositionId.set(null);
        }
    } else {
        currentPinned.add(numericId);
        pinnedGroupIds.set(currentPinned);
        const groupListContainer = document.getElementById('groups-list');
        const currentGroupElements = [...groupListContainer.querySelectorAll('.group-item:not(.hidden)')];
        const currentOrderIds = currentGroupElements.map((item) => parseInt(item.dataset.groupId, 10));

        if (currentOrderIds.length > 0 && currentOrderIds[currentOrderIds.length - 1] === numericId) {
            pinnedAtLastPositionId.set(numericId);
        }

        userDefinedOrder.set(currentOrderIds);
    }

    await saveState();
    await renderGroups();
}

export function initDragAndDrop() {
    const groupListContainer = document.getElementById('groups-list');
    const draggables = [...groupListContainer.querySelectorAll('.group-item[draggable="true"]')];
    let dragSrcEl = null;
    let customDragImage = null;
    let lastDragOverEl = null;

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

            if (isOverTop) {
                groupListContainer.insertBefore(dragSrcEl, targetEl);
            } else {
                groupListContainer.insertBefore(dragSrcEl, targetEl.nextSibling);
            }

            const draggedId = parseInt(dragSrcEl.dataset.groupId, 10);
            const currentPinned = get(pinnedGroupIds);
            currentPinned.add(draggedId);
            pinnedGroupIds.set(currentPinned);

            const pinBtn = dragSrcEl.querySelector('.pin-btn');
            if (pinBtn) {
                pinBtn.classList.add('active');
                pinBtn.setAttribute('data-i18n-title', 'unpinGroup');
                applyTranslations(pinBtn);
            }

            const currentOrder = [...groupListContainer.querySelectorAll('.group-item')].map((item) =>
                parseInt(item.dataset.groupId, 10),
            );
            userDefinedOrder.set(currentOrder);

            if (currentOrder.length > 0) {
                const lastId = currentOrder[currentOrder.length - 1];
                if (get(pinnedGroupIds).has(lastId)) {
                    pinnedAtLastPositionId.set(lastId);
                } else {
                    pinnedAtLastPositionId.set(null);
                }
            } else {
                pinnedAtLastPositionId.set(null);
            }

            await saveState();
        });
    });
}

// Removed renderTabsForGroup for Svelte migration

export function updateCounters(tabItemEl) {
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

    const isClosingSamePopup = get(currentColorPopup) && get(lastClickedIndicator) === indicator;

    if (get(currentColorPopup)) {
        closeColorPopup();
    }
    if (get(currentDownloadModal)) {
        closeDownloadModal();
    }

    if (isClosingSamePopup) {
        return;
    }

    const colorPopupTemplate = document.getElementById('color-popup-template');
    const colorPopupItemTemplate = document.getElementById('color-popup-item-template');
    const popup = colorPopupTemplate.content.cloneNode(true).firstElementChild;

    const $listGroupState = get(listGroupState);
    const availableColors = colors.filter((color) => color !== 'grey');
    availableColors.forEach((colorName) => {
        const item = colorPopupItemTemplate.content.cloneNode(true).firstElementChild;
        item.style.backgroundColor = $listGroupState.themeColors[colorName];
        item.dataset.color = colorName;
        item.setAttribute('aria-label', `Select ${colorName}`);
        item.addEventListener('click', () => changeGroupColor(groupId, colorName));
        popup.appendChild(item);
    });

    document.body.appendChild(popup);
    currentColorPopup.set(popup);
    lastClickedIndicator.set(indicator);
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
    const $currentColorPopup = get(currentColorPopup);
    if ($currentColorPopup) {
        const popupToRemove = $currentColorPopup;
        const indicatorToFocus = get(lastClickedIndicator);

        currentColorPopup.set(null);
        lastClickedIndicator.set(null);

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
                elementToFocusAfterRender.set({
                    type: 'color-indicator',
                    groupId: groupId,
                });
            }
        }
    }
}

export async function moveSplitGroup(sourceGroupId) {
    const groupInfoMap = await getGroupInfoMap();
    let splitGroupId = null;

    for (const [id, info] of groupInfoMap.entries()) {
        if (info.type === 'manual' && info.key === 'Split') {
            splitGroupId = id;
            break;
        }
    }

    if (!splitGroupId || splitGroupId === sourceGroupId) {
        return;
    }

    const currentPinned = get(pinnedGroupIds);
    currentPinned.add(splitGroupId);
    pinnedGroupIds.set(currentPinned);

    const currentOrder = [...document.querySelectorAll('#groups-list .group-item')].map((el) =>
        parseInt(el.dataset.groupId, 10),
    );

    const orderWithoutSplit = currentOrder.filter((id) => id !== splitGroupId);

    const sourceIndex = orderWithoutSplit.indexOf(sourceGroupId);

    if (sourceIndex > -1) {
        orderWithoutSplit.splice(sourceIndex + 1, 0, splitGroupId);
        userDefinedOrder.set(orderWithoutSplit);
    } else {
        userDefinedOrder.set(orderWithoutSplit);
        const currentOrderVal = get(userDefinedOrder);
        if (!currentOrderVal.includes(sourceGroupId)) {
            currentOrderVal.push(sourceGroupId);
            userDefinedOrder.set(currentOrderVal);
        }
        const updatedOrder = get(userDefinedOrder);
        updatedOrder.push(splitGroupId);
        userDefinedOrder.set(updatedOrder);
    }

    await saveState();
    await renderGroups();
}

export async function changeGroupColor(groupId, newColor) {
    await chrome.tabGroups.update(parseInt(groupId, 10), {
        color: newColor,
    });

    listGroupState.update((s) => {
        s.renderedGroups = s.renderedGroups.map((g) => {
            if (g.id === parseInt(groupId, 10) || g.id === groupId) {
                return { ...g, color: newColor };
            }
            return g;
        });
        return s;
    });

    closeColorPopup();
}

export async function handleRemoveDuplicates() {
    if (get(isBookmarksViewActive)) {
        chrome.runtime.sendMessage({ action: 'removeDuplicateBookmarks' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error sending 'removeDuplicateBookmarks' message:", chrome.runtime.lastError.message);
                showNotification('errorCommunicatingWithService', true);
                return;
            }
            if (response && response.success && response.count > 0) {
                showNotification('duplicateBookmarksRemoved', false, [response.count]);

                if (response.removedIds && response.removedIds.length > 0) {
                    response.removedIds.forEach((id) => {
                        const bookmarkElement = document.querySelector(`.bookmark-item[data-bookmark-id="${id}"]`);
                        if (bookmarkElement) {
                            animateAndRemove(bookmarkElement, false);
                        }
                    });
                }
                updateDuplicateCountBadge();
            } else {
                showNotification('noDuplicateBookmarksFound');
            }
        });
    } else {
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

export function initGroupsEvents() {
    const backupAllBtn = document.getElementById('backup-all-btn');
    if (backupAllBtn) backupAllBtn.addEventListener('click', handleBackupAllGroups);

    const restoreAllBtn = document.getElementById('restore-all-btn');
    if (restoreAllBtn) restoreAllBtn.addEventListener('click', handleRestoreAllGroups);

    const removeDuplicatesBtn = document.getElementById('remove-duplicates-btn');
    if (removeDuplicatesBtn) removeDuplicatesBtn.addEventListener('click', handleRemoveDuplicates);

    const regroupBtn = document.getElementById('regroup-btn');
    if (regroupBtn) {
        regroupBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'regroupAllTabs' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('Possible service worker disconnection:', chrome.runtime.lastError.message);
                    return;
                }
                if (response && !response.success) {
                    console.error('Error in background:', response.error);
                    showNotification('errorCommunicatingWithService', true);
                }
            });
        });
    }

    document.addEventListener('click', (e) => {
        const popup = get(currentColorPopup);
        if (popup && !e.target.closest('.color-indicator, .color-popup')) {
            closeColorPopup();
        }
    });

    const groupsList = document.getElementById('groups-list');
    if (groupsList) groupsList.addEventListener('click', handleRuleActionClick);

    const muteAllTabsBtn = document.getElementById('mute-all-tabs-btn');
    if (muteAllTabsBtn) {
        muteAllTabsBtn.addEventListener('click', () => toggleMuteAllSources());

        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (changeInfo.audible !== undefined || changeInfo.mutedInfo !== undefined) {
                updateMuteButtonState();
                const tabEl = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
                if (tabEl) {
                    const indicator = tabEl.querySelector('.audible-indicator');
                    if (indicator) {
                        if (changeInfo.audible !== undefined) indicator.classList.toggle('hidden', !changeInfo.audible);
                        if (changeInfo.mutedInfo !== undefined) {
                            const isMuted = changeInfo.mutedInfo.muted;
                            indicator.classList.toggle('muted', isMuted);
                            updateAudibleIndicatorTooltip(indicator, isMuted);
                        }
                    }
                }
            }
        });

        chrome.tabs.onRemoved.addListener(() => updateMuteButtonState());

        // A reading starting, pausing or ending changes nothing Chrome reports about
        // the tab, so none of the listeners above would hear it. The worker's record
        // of which tabs are reading is the only thing that moves.
        chrome.storage.session.onChanged?.addListener((changes) => {
            if (changes.readAloudTabs) updateMuteButtonState();
        });
    }

    const expandAllBtn = document.getElementById('expand-all-btn');
    if (expandAllBtn) expandAllBtn.addEventListener('click', toggleExpandAll);

    document.addEventListener(
        'toggle',
        (event) => {
            const target = event.target;
            if (target.tagName === 'DETAILS' || target.classList.contains('group-item')) {
                if (target.classList.contains('group-item')) {
                    const groupId = parseInt(target.dataset.groupId, 10);
                    if (!isNaN(groupId)) {
                        expandedGroupStates.update((map) => {
                            map.set(groupId, target.open);
                            return map;
                        });
                    }
                }
                if (target.classList.contains('domain-subgroup')) {
                    const domain = target.querySelector('.domain-title')?.textContent;
                    const groupEl = target.closest('.group-item');
                    const groupId = groupEl?.dataset.groupId;
                    if (domain && groupId) {
                        expandedSubgroupStates.update((map) => {
                            map.set(`${groupId}_${domain}`, target.open);
                            return map;
                        });
                    }
                }
                updateExpandAllButtonState();
            }
        },
        true,
    );

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'restoreBackupTabFromOmnibar') {
            const { groupId, tabUrl, tabTitle } = message;
            const backupData = get(backedUpGroupData)[groupId];
            if (backupData) {
                const tabToRestore =
                    backupData.tabs.find((t) => t.url === tabUrl && t.title === tabTitle) || backupData.tabs[0];
                if (tabToRestore) {
                    handleRestoreSingleTab(groupId, tabToRestore);
                    sendResponse({ success: true });
                } else sendResponse({ success: false, error: 'Tab not found in backup' });
            } else sendResponse({ success: false, error: 'Backup not found' });
            return true;
        }

        if (message.action === 'backupAllGroupsFromBackground') {
            (async () => {
                try {
                    await handleBackupAllGroups();
                    sendResponse({ success: true });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        if (message.action === 'backupGroupsById') {
            (async () => {
                try {
                    await Promise.all((message.groupIds || []).map((id) => handleBackupGroup(id)));
                    sendResponse({ success: true, count: (message.groupIds || []).length });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        if (message.action === 'restoreAllGroupsFromBackground') {
            (async () => {
                try {
                    await handleRestoreAllGroups();
                    sendResponse({ success: true });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        if (message.action === 'groupsUpdatedFromBackground') renderGroups();

        if (message.action === 'pageModeChanged') renderGroups();

        // A note written from a page lands straight in the database, so the panel only
        // hears about it here: the counts on the cards and the list, if it is open.
        if (message.action === 'noteCreatedFromPage') {
            renderGroups();
            if (get(isNotesViewActive) && get(currentNotesContext)) {
                showNotesView(get(currentNotesContext));
            }
            return true;
        }

        if (message.action === 'areaScreenshotProcessFinished' || message.action === 'fullPageScreenshotFinished') {
            if (message.success) {
                renderGroups();
                if (get(isGalleryViewActive) && get(currentGalleryContext)) {
                    const ctx = get(currentGalleryContext);
                    showScreenshotGallery(ctx.type, ctx.id, ctx.secondaryId);
                }
            }
            return true;
        }
    });
}
