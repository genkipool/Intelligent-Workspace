import { applyTranslations, showNotification } from '../../utils/i18n.js';
import { get } from 'svelte/store';
import {
    activeContextMenu,
    actionVisibilitySettings as actionVisibilitySettingsStore,
    bookmarkActionVisibilitySettings as bookmarkActionVisibilitySettingsStore,
} from '../stores/appStore.svelte.js';
export { activeContextMenu };
import { ACTION_GROUPS, BOOKMARK_ACTION_GROUPS, STORAGE_KEYS } from './constants.js';
import { renderGroups } from './groupsService.js';
import { withTabActivation } from './screenshotsService.js';
import { dataUrlToBlob } from './utils.js';

// Read from the appStore stores populated by loadActionVisibilitySettings().
function _actionVis() {
    return get(actionVisibilitySettingsStore) || {};
}
function _bookmarkActionVis() {
    return get(bookmarkActionVisibilitySettingsStore) || {};
}

let activeOverflowPopup = null;
let activeOverflowSource = null;
let activeOverflowTimeout = null;

export function closeOverflowMenu() {
    if (activeOverflowSource) {
        activeOverflowSource.classList.remove('active');
    }
    if (activeOverflowPopup) {
        activeOverflowPopup.remove();
        activeOverflowPopup = null;
        activeOverflowSource = null;
    }
    if (activeOverflowTimeout) {
        clearTimeout(activeOverflowTimeout);
        activeOverflowTimeout = null;
    }
    document.removeEventListener('click', closeMenuOnClickOutside);
    document.removeEventListener('scroll', handleScrollPositioning, { capture: true });
}

function scheduleHideOverflowMenu() {
    if (activeOverflowTimeout) {
        clearTimeout(activeOverflowTimeout);
    }
    activeOverflowTimeout = setTimeout(() => {
        closeOverflowMenu();
    }, 200);
}

function cancelHideOverflowMenu() {
    if (activeOverflowTimeout) {
        clearTimeout(activeOverflowTimeout);
        activeOverflowTimeout = null;
    }
}

function closeMenuOnClickOutside(event) {
    if (activeOverflowPopup && !activeOverflowPopup.contains(event.target) && !event.target.closest('.overflow-btn')) {
        closeOverflowMenu();
    }
}
let scrollPosRaf = null;
function handleScrollPositioning() {
    if (activeOverflowPopup && activeOverflowSource) {
        if (scrollPosRaf) cancelAnimationFrame(scrollPosRaf);
        scrollPosRaf = requestAnimationFrame(() => {
            if (!activeOverflowPopup || !activeOverflowSource) return;

            const rect = activeOverflowSource.getBoundingClientRect();

            if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
                closeOverflowMenu();
            } else {
                positionDetachedPopup(activeOverflowSource, activeOverflowPopup);
            }
        });
    }
}

function getVisibleScrollContainer() {
    const selectors = [
        '#groups-list',
        '#bookmarks-view-container',
        '#history-view-container',
        '#recent-view-container',
        '#reading-list-view-container',
        '#notes-view',
    ];
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && window.getComputedStyle(el).display !== 'none') {
            return el;
        }
    }
    return null;
}

function positionDetachedPopup(buttonEl, popupEl) {
    const rect = buttonEl.getBoundingClientRect();
    const popupWidth = popupEl.offsetWidth;
    const popupHeight = popupEl.offsetHeight;

    popupEl.style.position = 'fixed';
    popupEl.style.zIndex = '9999999';

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < popupHeight && spaceAbove > popupHeight) {
        popupEl.style.top = `${rect.top - popupHeight - 5}px`;
        popupEl.classList.add('popup-upwards');
    } else {
        popupEl.style.top = `${rect.bottom + 5}px`;
        popupEl.classList.remove('popup-upwards');
    }

    let leftPos = rect.right - popupWidth;
    if (leftPos < 10) {
        leftPos = 10;
    }
    popupEl.style.left = `${leftPos}px`;
}

export function createMenuItem({ list, itemTemplate, iconHtml, text, count, onClick, i18nKey }) {
    const menuItem = itemTemplate.content.cloneNode(true).firstElementChild;
    menuItem.querySelector('.context-menu-icon').innerHTML = iconHtml;
    const textEl = menuItem.querySelector('.context-menu-text');

    if (i18nKey) {
        textEl.setAttribute('data-i18n', i18nKey);
    } else {
        textEl.textContent = text;
    }

    const counterContainer = menuItem.querySelector('.context-menu-counter');

    if (count !== null && count > 0) {
        counterContainer.textContent = count;
        counterContainer.classList.remove('hidden');
    } else {
        counterContainer.classList.add('hidden');
    }

    menuItem.addEventListener('click', () => {
        onClick();
        const ctx = get(activeContextMenu);
        if (ctx) {
            ctx.remove();
            activeContextMenu.set(null);
        }
    });
    list.appendChild(menuItem);
}

export async function showContextMenu(event, contextElement) {
    const ctx = get(activeContextMenu);
    if (ctx) {
        ctx.remove();
        activeContextMenu.set(null);
    }

    const menuTemplate = document.getElementById('context-menu-template');
    const itemTemplate = document.getElementById('context-menu-item-template');

    const menuOverlay = menuTemplate.content.cloneNode(true).firstElementChild;
    const menu = menuOverlay.querySelector('.context-menu');
    const list = menu.querySelector('.context-menu-list');

    let actionsSelector;
    if (contextElement.classList.contains('group-item')) actionsSelector = '.group-actions';
    else if (contextElement.classList.contains('domain-subgroup')) actionsSelector = '.subgroup-actions';
    else if (contextElement.classList.contains('tab-item')) actionsSelector = '.tab-actions';
    else if (contextElement.classList.contains('bookmark-item')) actionsSelector = '.bookmark-actions';
    else if (contextElement.classList.contains('bookmark-folder')) actionsSelector = '.folder-actions';

    if (!actionsSelector) return;

    const actionsContainer = contextElement.querySelector(actionsSelector);

    if (actionsContainer) {
        actionsContainer.querySelectorAll('.action-btn').forEach((originalButton) => {
            if (originalButton.classList.contains('hidden')) return;

            if (originalButton.classList.contains('overflow-btn')) return;

            const svgIcon = originalButton.querySelector('svg');
            const iconHtml = svgIcon ? svgIcon.outerHTML : '';

            if (originalButton.classList.contains('screenshot-btn')) {
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    text: chrome.i18n.getMessage('captureFullPage') || 'Capture webpage',
                    count: null,
                    onClick: () => originalButton.click(),
                });

                const tabId = parseInt(contextElement.dataset.tabId, 10);
                if (!isNaN(tabId)) {
                    createMenuItem({
                        list,
                        itemTemplate,
                        iconHtml: iconHtml,
                        text: chrome.i18n.getMessage('captureWebpageArea') || 'Capture Web Area',
                        count: null,
                        onClick: async () => {
                            const tab = await chrome.tabs.get(tabId);
                            let areaDataUrl = null;
                            await withTabActivation(tab, () => {
                                return new Promise((resolve) => {
                                    const listener = (message) => {
                                        if (message.action === 'areaScreenshotProcessFinished') {
                                            chrome.runtime.onMessage.removeListener(listener);
                                            if (message.success) {
                                                areaDataUrl = message.dataUrl || null;
                                            } else {
                                                showNotification('errorTakingScreenshot', true);
                                            }
                                            renderGroups();
                                            resolve();
                                        }
                                    };
                                    chrome.runtime.onMessage.addListener(listener);
                                    chrome.runtime.sendMessage({ action: 'injectAreaSelector', tabId: tab.id });
                                });
                            });
                            if (areaDataUrl) {
                                try {
                                    const blob = await dataUrlToBlob(areaDataUrl);
                                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                                    showNotification('screenshotCopied');
                                } catch {
                                    showNotification('screenshotSavedNoCopy', true);
                                }
                            }
                        },
                    });
                }
            } else if (originalButton.classList.contains('view-notes-btn')) {
                const noteBadge = contextElement.querySelector('.note-count-badge:not(.hidden)');
                const noteCount = noteBadge ? parseInt(noteBadge.textContent, 10) : 0;

                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    text: chrome.i18n.getMessage('createNote'),
                    count: null,
                    onClick: () => originalButton.click(),
                });

                if (noteCount > 0) {
                    createMenuItem({
                        list,
                        itemTemplate,
                        iconHtml: iconHtml,
                        text: chrome.i18n.getMessage('viewNotes'),
                        count: noteCount,
                        onClick: () => noteBadge.click(),
                    });
                }
            } else if (originalButton.classList.contains('view-screenshots-btn')) {
                const screenshotBadge = contextElement.querySelector('.screenshot-count-badge:not(.hidden)');
                const screenshotCount = screenshotBadge ? parseInt(screenshotBadge.textContent, 10) : 0;

                if (screenshotCount > 0) {
                    createMenuItem({
                        list,
                        itemTemplate,
                        iconHtml: iconHtml,
                        text: chrome.i18n.getMessage('viewScreenshots'),
                        count: screenshotCount,
                        onClick: () => originalButton.click(),
                    });
                }
            } else if (originalButton.classList.contains('page-mode-btn')) {
                const tabId = parseInt(contextElement.dataset.tabId, 10);
                const pageModePopupTemplate = document.getElementById('page-mode-popup-template');
                if (pageModePopupTemplate && !isNaN(tabId)) {
                    pageModePopupTemplate.content.querySelectorAll('.page-mode-item').forEach((modeItem) => {
                        const mode = modeItem.dataset.mode;
                        const i18nKey = modeItem.getAttribute('data-i18n');

                        createMenuItem({
                            list,
                            itemTemplate,
                            iconHtml: iconHtml,
                            i18nKey: i18nKey,
                            text: '',
                            count: null,
                            onClick: () => {
                                const itemText = chrome.i18n.getMessage(i18nKey) || mode;
                                chrome.runtime.sendMessage(
                                    { action: 'setPageMode', mode: mode, scope: 'tab', tabId: tabId },
                                    (response) => {
                                        if (chrome.runtime.lastError || !response?.success) {
                                            showNotification('errorApplyingMode', true);
                                        } else {
                                            showNotification('modeAppliedSuccessfully', false, [itemText]);
                                            renderGroups();
                                        }
                                    },
                                );
                            },
                        });
                    });
                }
            } else {
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    text: originalButton.title,
                    count: null,
                    onClick: () => originalButton.click(),
                });
            }
        });
    }

    if (list.childElementCount === 0) return;
    document.body.appendChild(menuOverlay);
    activeContextMenu.set(menuOverlay);
    applyTranslations(menuOverlay);
}

export function createOverflowMenu(actionsContainer, templateId, contextElement) {
    let overflowContainer = actionsContainer.querySelector('.overflow-actions-container');
    const isNew = !overflowContainer;

    if (isNew) {
        const overflowTemplate = document.getElementById('overflow-actions-template');
        if (!overflowTemplate) return;
        overflowContainer = overflowTemplate.content.cloneNode(true).firstElementChild;
    }

    const isBookmarkViewContext = templateId.startsWith('bookmark-');
    const visSettings = isBookmarkViewContext ? _bookmarkActionVis() : _actionVis();
    const overflowKey = isBookmarkViewContext ? 'b-overflow' : 'overflow';

    const hasOtherHiddenActions = Object.entries(visSettings).some(([key, value]) => key !== overflowKey && !value);

    if (!hasOtherHiddenActions) {
        const existingOverflow = actionsContainer.querySelector('.overflow-actions-container');
        if (existingOverflow) existingOverflow.remove();
        return;
    }

    if (isNew) {
        overflowContainer.addEventListener('mouseenter', (event) => {
            cancelHideOverflowMenu();
            if (activeOverflowSource !== overflowContainer) {
                populateAndShowOverflowPopup(event, templateId, contextElement);
            }
        });

        overflowContainer.addEventListener('click', (event) => {
            event.stopPropagation();
            cancelHideOverflowMenu();
            if (activeOverflowPopup && activeOverflowSource === overflowContainer) {
                closeOverflowMenu();
            } else {
                populateAndShowOverflowPopup(event, templateId, contextElement);
            }
        });

        overflowContainer.addEventListener('mouseleave', (e) => {
            if (
                e.relatedTarget &&
                (actionsContainer.contains(e.relatedTarget) ||
                    (activeOverflowPopup && activeOverflowPopup.contains(e.relatedTarget)))
            ) {
                return;
            }
            scheduleHideOverflowMenu();
        });

        overflowContainer.addEventListener('mouseenter', cancelHideOverflowMenu);

        actionsContainer.addEventListener('mouseleave', (e) => {
            if (
                e.relatedTarget &&
                (actionsContainer.contains(e.relatedTarget) ||
                    overflowContainer.contains(e.relatedTarget) ||
                    (activeOverflowPopup && activeOverflowPopup.contains(e.relatedTarget)))
            ) {
                return;
            }
            scheduleHideOverflowMenu();
        });

        actionsContainer.addEventListener('mouseenter', () => {
            if (activeOverflowPopup && activeOverflowSource === overflowContainer) {
                cancelHideOverflowMenu();
            }
        });

        contextElement.addEventListener('mouseleave', (e) => {
            if (e.relatedTarget && activeOverflowPopup && activeOverflowPopup.contains(e.relatedTarget)) {
                return;
            }
            scheduleHideOverflowMenu();
        });

        contextElement.addEventListener('mouseover', (e) => {
            if (activeOverflowPopup && activeOverflowSource === overflowContainer) {
                if (!actionsContainer.contains(e.target) && !overflowContainer.contains(e.target)) {
                    scheduleHideOverflowMenu();
                }
            }
        });

        actionsContainer.appendChild(overflowContainer);
        applyTranslations(overflowContainer);
    }
}

export function populateAndShowOverflowPopup(event, templateId, contextElement) {
    const container = event.currentTarget;
    if (activeOverflowPopup && activeOverflowSource === container) return;

    const isBookmarkViewContext = templateId.startsWith('bookmark-');

    if (isBookmarkViewContext) {
        populateBookmarkOverflowPopup(container, templateId, contextElement);
    } else {
        populateGroupOverflowPopup(event, templateId, contextElement);
    }
}

export function populateGroupOverflowPopup(event, templateId, contextElement) {
    const container = event.currentTarget;
    if (activeOverflowPopup && activeOverflowSource === container) return;

    const popupTemplate = document.getElementById('overflow-popup-template');
    const itemTemplate = document.getElementById('overflow-popup-item-template');
    if (!popupTemplate || !itemTemplate) return;

    const popupEl = popupTemplate.content.cloneNode(true).firstElementChild;
    const actionTemplate = document.getElementById(templateId);
    if (!actionTemplate) return;

    const actionsContainer = contextElement.querySelector('.group-actions, .subgroup-actions, .tab-actions');
    if (!actionsContainer) return;

    const classToKey = {};
    Object.entries(ACTION_GROUPS).forEach(([key, info]) => {
        info.classes.forEach((cls) => (classToKey[cls] = key));
    });

    const buttons = actionsContainer.querySelectorAll('.action-btn');
    buttons.forEach((originalBtn) => {
        let actionKey = null;
        for (const cls of originalBtn.classList) {
            if (classToKey[cls]) {
                actionKey = classToKey[cls];
                break;
            }
        }

        if (!actionKey) return;

        const isHiddenInSettings = _actionVis()[actionKey] === false;

        if (isHiddenInSettings && !originalBtn.classList.contains('hidden')) {
            const btnSelector = ACTION_GROUPS[actionKey].classes.map((cls) => `.${cls}`).join(', ');
            const templateBtn = actionTemplate.content.querySelector(btnSelector) || originalBtn;

            if (templateBtn) {
                const iconHTML = templateBtn.innerHTML;

                if (actionKey === 'notes') {
                    const noteBadge = contextElement.querySelector('.note-count-badge:not(.hidden)');
                    const noteCount = noteBadge ? parseInt(noteBadge.textContent, 10) : 0;
                    const noteBtnTemplate = document.getElementById('add-note-btn-template');
                    if (noteBtnTemplate) {
                        const iconHtml = noteBtnTemplate.content.querySelector('svg')?.outerHTML || '';
                        const createNoteItem = itemTemplate.content.cloneNode(true).firstElementChild;
                        createNoteItem.querySelector('.overflow-item-icon').innerHTML = iconHtml;
                        createNoteItem.querySelector('.overflow-item-text').setAttribute('data-i18n', 'createNote');
                        createNoteItem.addEventListener('click', (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            originalBtn.click();
                            closeOverflowMenu();
                        });
                        popupEl.appendChild(createNoteItem);
                        if (noteCount > 0) {
                            const viewNotesItem = itemTemplate.content.cloneNode(true).firstElementChild;
                            viewNotesItem.querySelector('.overflow-item-icon').innerHTML = iconHtml;
                            viewNotesItem.querySelector('.overflow-item-text').setAttribute('data-i18n', 'viewNotes');
                            const counterSpan = document.createElement('span');
                            counterSpan.className = 'context-menu-counter';
                            counterSpan.textContent = noteCount;
                            viewNotesItem.appendChild(counterSpan);
                            viewNotesItem.addEventListener('click', (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                noteBadge.click();
                                closeOverflowMenu();
                            });
                            popupEl.appendChild(viewNotesItem);
                        }
                    }
                } else if (actionKey === 'capture' && contextElement.classList.contains('tab-item')) {
                    const tabId = parseInt(contextElement.dataset.tabId, 10);
                    const fullPageItem = itemTemplate.content.cloneNode(true).firstElementChild;
                    fullPageItem.querySelector('.overflow-item-icon').innerHTML = iconHTML;
                    fullPageItem.querySelector('.overflow-item-text').setAttribute('data-i18n', 'captureFullPage');
                    fullPageItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        originalBtn.click();
                        closeOverflowMenu();
                    });
                    popupEl.appendChild(fullPageItem);

                    const areaPageItem = itemTemplate.content.cloneNode(true).firstElementChild;
                    areaPageItem.querySelector('.overflow-item-icon').innerHTML = iconHTML;
                    areaPageItem.querySelector('.overflow-item-text').setAttribute('data-i18n', 'captureWebpageArea');
                    areaPageItem.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const tab = await chrome.tabs.get(tabId);
                        let areaDataUrl = null;
                        await withTabActivation(tab, () => {
                            return new Promise((resolve) => {
                                const listener = (message) => {
                                    if (message.action === 'areaScreenshotProcessFinished') {
                                        chrome.runtime.onMessage.removeListener(listener);
                                        if (message.success) {
                                            areaDataUrl = message.dataUrl || null;
                                        } else {
                                            showNotification('errorTakingScreenshot', true);
                                        }
                                        renderGroups();
                                        resolve();
                                    }
                                };
                                chrome.runtime.onMessage.addListener(listener);
                                chrome.runtime.sendMessage({ action: 'injectAreaSelector', tabId: tab.id });
                            });
                        });
                        if (areaDataUrl) {
                            try {
                                const blob = await dataUrlToBlob(areaDataUrl);
                                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                                showNotification('screenshotCopied');
                            } catch {
                                showNotification('screenshotSavedNoCopy', true);
                            }
                        }
                        closeOverflowMenu();
                    });
                    popupEl.appendChild(areaPageItem);
                } else if (actionKey === 'themes') {
                    const pageModePopupTemplate = document.getElementById('page-mode-popup-template');
                    const tabItemEl = contextElement.closest('.tab-item');
                    if (pageModePopupTemplate && tabItemEl) {
                        const tabId = parseInt(tabItemEl.dataset.tabId, 10);
                        pageModePopupTemplate.content.querySelectorAll('.page-mode-item').forEach((modeItem) => {
                            const popupItem = itemTemplate.content.cloneNode(true).firstElementChild;
                            popupItem.querySelector('.overflow-item-icon').innerHTML = iconHTML;
                            const i18nKey = modeItem.getAttribute('data-i18n');
                            const mode = modeItem.dataset.mode;
                            const textEl = popupItem.querySelector('.overflow-item-text');
                            textEl.setAttribute('data-i18n', i18nKey);
                            popupItem.addEventListener('click', (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (!isNaN(tabId)) {
                                    chrome.runtime.sendMessage(
                                        { action: 'setPageMode', mode: mode, scope: 'tab', tabId: tabId },
                                        (response) => {
                                            if (chrome.runtime.lastError || !response?.success)
                                                showNotification('errorApplyingMode', true);
                                            else {
                                                showNotification('modeAppliedSuccessfully', false, [
                                                    textEl.textContent,
                                                ]);
                                                renderGroups();
                                            }
                                        },
                                    );
                                }
                                closeOverflowMenu();
                            });
                            popupEl.appendChild(popupItem);
                        });
                    }
                } else {
                    const popupItem = itemTemplate.content.cloneNode(true).firstElementChild;
                    popupItem.querySelector('.overflow-item-icon').innerHTML = iconHTML;
                    popupItem.querySelector('.overflow-item-text').textContent = originalBtn.title;
                    popupItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        originalBtn.click();
                        closeOverflowMenu();
                    });
                    popupEl.appendChild(popupItem);
                }
            }

            if (actionKey === 'capture') {
                const galleryBtn = contextElement.querySelector('.view-screenshots-btn');
                if (galleryBtn && !galleryBtn.classList.contains('hidden')) {
                    const galleryTemplate = document.getElementById('view-screenshots-btn-template');
                    if (galleryTemplate) {
                        const iconHtml = galleryTemplate.content.querySelector('svg')?.outerHTML || '';
                        const popupItem = itemTemplate.content.cloneNode(true).firstElementChild;
                        popupItem.querySelector('.overflow-item-icon').innerHTML = iconHtml;
                        popupItem.querySelector('.overflow-item-text').setAttribute('data-i18n', 'viewScreenshots');
                        const badge = galleryBtn.querySelector('.screenshot-count-badge');
                        if (badge) {
                            const counterSpan = document.createElement('span');
                            counterSpan.className = 'context-menu-counter';
                            counterSpan.textContent = badge.textContent;
                            popupItem.appendChild(counterSpan);
                        }
                        popupItem.addEventListener('click', (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            galleryBtn.click();
                            closeOverflowMenu();
                        });
                        popupEl.appendChild(popupItem);
                    }
                }
            }
        }
    });

    if (popupEl.childElementCount > 1) {
        closeOverflowMenu();
        popupEl.classList.add('overflow-popup-detached');
        document.body.appendChild(popupEl);

        activeOverflowPopup = popupEl;
        activeOverflowSource = container;
        container.classList.add('active');

        positionDetachedPopup(container, popupEl);

        popupEl.addEventListener('mouseenter', cancelHideOverflowMenu);
        popupEl.addEventListener('mouseleave', (e) => {
            if (
                e.relatedTarget &&
                (actionsContainer.contains(e.relatedTarget) || container.contains(e.relatedTarget))
            ) {
                return;
            }
            scheduleHideOverflowMenu();
        });

        popupEl.addEventListener(
            'wheel',
            (e) => {
                const scrollContainer = getVisibleScrollContainer();
                if (scrollContainer) {
                    scrollContainer.scrollTop += e.deltaY;
                }
            },
            { passive: true },
        );

        setTimeout(() => {
            if (activeOverflowPopup === popupEl) {
                popupEl.classList.add('visible');
            }
        }, 0);

        applyTranslations(popupEl);
        document.addEventListener('click', closeMenuOnClickOutside);
        document.addEventListener('scroll', handleScrollPositioning, { capture: true, passive: true });
    }
}

export function initContextMenuEvents() {
    document.addEventListener('click', (event) => {
        const ctx = get(activeContextMenu);
        if (ctx && event.target === ctx) {
            ctx.remove();
            activeContextMenu.set(null);
        }
    });

    document.addEventListener(
        'click',
        (event) => {
            const isActionElement = event.target.closest(
                '.action-btn, .rule-actions-button, .color-indicator, .star-button, .drag-handle, .delete-cookie-btn, .group-actions, .subgroup-actions, .tab-actions, .entry-actions, .folder-actions, .in-folder-action-btn, .overflow-btn, .new-folder-cancel',
            );
            if (isActionElement && event.target.closest('summary')) {
                event.preventDefault();
            }
        },
        true,
    );

    document.addEventListener('contextmenu', (event) => {
        const ctx = get(activeContextMenu);
        if (ctx) {
            const newContextTarget = event.target.closest('.group-item, .domain-subgroup, .tab-item');
            if (!newContextTarget) {
                event.preventDefault();
                ctx.remove();
                activeContextMenu.set(null);
            }
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const ctx = get(activeContextMenu);
            if (ctx) {
                ctx.remove();
                activeContextMenu.set(null);
            }
        }
    });

    const groupsList = document.getElementById('groups-list');
    if (groupsList) {
        groupsList.addEventListener('contextmenu', (event) => {
            const contextElement = event.target.closest('.group-item, .domain-subgroup, .tab-item');
            if (contextElement) {
                event.preventDefault();
                showContextMenu(event, contextElement);
            }
        });
    }
}

export function populateBookmarkOverflowPopup(container, templateId, contextElement) {
    if (activeOverflowPopup && activeOverflowSource === container) return;

    const popupTemplate = document.getElementById('overflow-popup-template');
    const itemTemplate = document.getElementById('overflow-popup-item-template');
    if (!popupTemplate || !itemTemplate) return;

    const visSettings = _bookmarkActionVis();
    const actionGroups = BOOKMARK_ACTION_GROUPS;
    const overflowKey = 'b-overflow';

    const actionsContainer = contextElement.querySelector('.bookmark-actions, .folder-actions');
    if (!actionsContainer) return;

    const classToKey = {};
    Object.entries(actionGroups).forEach(([key, info]) => {
        info.classes.forEach((cls) => (classToKey[cls] = key));
    });

    const popupEl = popupTemplate.content.cloneNode(true).firstElementChild;
    const actionTemplate = document.getElementById(templateId);
    if (!actionTemplate) return;

    const buttons = actionsContainer.querySelectorAll('.action-btn');
    buttons.forEach((originalBtn) => {
        let actionKey = null;
        for (const cls of originalBtn.classList) {
            if (classToKey[cls]) {
                actionKey = classToKey[cls];
                break;
            }
        }

        if (!actionKey || actionKey === overflowKey) return;

        const isHiddenInSettings = visSettings[actionKey] === false;

        if (isHiddenInSettings && !originalBtn.classList.contains('hidden')) {
            const isRootFolder = ['1', '2', '3'].includes(contextElement.dataset.folderId);
            const isRestrictedAction = actionKey === 'b-edit' || actionKey === 'b-delete-folder';

            if (isRootFolder && isRestrictedAction) return;

            const btnSelector = actionGroups[actionKey].classes.map((cls) => `.${cls}`).join(', ');
            const templateBtn = actionTemplate.content.querySelector(btnSelector);

            if (templateBtn) {
                const popupItem = itemTemplate.content.cloneNode(true).firstElementChild;
                popupItem.querySelector('.overflow-item-icon').innerHTML = templateBtn.innerHTML;
                popupItem.querySelector('.overflow-item-text').textContent = originalBtn.title;

                popupItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    originalBtn.click();
                    closeOverflowMenu();
                });
                popupEl.appendChild(popupItem);
            }
        }
    });

    if (popupEl.childElementCount > 1) {
        closeOverflowMenu();
        popupEl.classList.add('overflow-popup-detached');
        document.body.appendChild(popupEl);

        activeOverflowPopup = popupEl;
        activeOverflowSource = container;
        container.classList.add('active');

        positionDetachedPopup(container, popupEl);

        popupEl.addEventListener('mouseenter', cancelHideOverflowMenu);
        popupEl.addEventListener('mouseleave', (e) => {
            if (
                e.relatedTarget &&
                (actionsContainer.contains(e.relatedTarget) || container.contains(e.relatedTarget))
            ) {
                return;
            }
            scheduleHideOverflowMenu();
        });

        popupEl.addEventListener(
            'wheel',
            (e) => {
                const scrollContainer = getVisibleScrollContainer();
                if (scrollContainer) {
                    scrollContainer.scrollTop += e.deltaY;
                }
            },
            { passive: true },
        );

        setTimeout(() => {
            if (activeOverflowPopup === popupEl) {
                popupEl.classList.add('visible');
            }
        }, 0);

        applyTranslations(popupEl);
        document.addEventListener('click', closeMenuOnClickOutside);
        document.addEventListener('scroll', handleScrollPositioning, { capture: true, passive: true });
    }
}
