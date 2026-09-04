import { applyTranslations } from '../../utils/i18n.js';
import { get } from 'svelte/store';
import {
    activeContextMenu,
    actionVisibilitySettings as actionVisibilitySettingsStore,
    bookmarkActionVisibilitySettings as bookmarkActionVisibilitySettingsStore,
} from '../stores/appStore.svelte.js';
export { activeContextMenu };
import { ACTION_GROUPS, BOOKMARK_ACTION_GROUPS, PAGE_MODES } from './constants.js';
import { applyPageMode } from './groupsService.js';
import { captureGroupTabsById, captureTabArea, handleScreenshotRequest } from './screenshotsService.js';
import { readAloudTargetOf, startReadAloud } from './readAloudService.js';

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

/**
 * One row of an overflow popup.
 *
 * Every branch below used to clone the template, poke three nodes and attach the
 * same click handler by hand; this is that, once. `i18n` labels a row that the
 * translation pass fills in, `text` one whose wording is already known.
 *
 * @param {HTMLElement} popupEl
 * @param {HTMLTemplateElement} itemTemplate
 * @param {string} iconHtml
 * @param {{i18n?: string, text?: string, count?: number|string|null}} options
 * @param {() => void} onClick
 */
function appendOverflowItem(popupEl, itemTemplate, iconHtml, options, onClick) {
    const item = itemTemplate.content.cloneNode(true).firstElementChild;
    item.querySelector('.overflow-item-icon').innerHTML = iconHtml;

    const textEl = item.querySelector('.overflow-item-text');
    if (options.i18n) textEl.setAttribute('data-i18n', options.i18n);
    else textEl.textContent = options.text || '';

    if (options.count !== null && options.count !== undefined && options.count !== '') {
        const counter = document.createElement('span');
        counter.className = 'context-menu-counter';
        counter.textContent = options.count;
        item.appendChild(counter);
    }

    item.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        onClick();
        closeOverflowMenu();
    });
    popupEl.appendChild(item);
    return item;
}

/** The whole document of the tab a card stands for — as one image, or as several. */
async function captureTabFullPage(tabItemEl, mode) {
    const tabId = parseInt(tabItemEl?.dataset?.tabId, 10);
    if (isNaN(tabId)) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return;
    // `_context` is what the card was rendered under — the group or the subgroup the
    // capture has to be filed in. Without it the image lands in the wrong gallery.
    await handleScreenshotRequest(tab, tabItemEl._context || { type: 'group', id: tab.groupId }, { mode });
}

/** The area picker, from a card that only knows the tab's id. */
async function captureTabAreaById(tabId) {
    if (isNaN(tabId)) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab) await captureTabArea(tab);
}

/** Every tab of the group a card stands for. */
function captureGroupFromCard(groupEl, options) {
    captureGroupTabsById(groupEl?.dataset?.groupId, options);
}

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
        '#downloads-view-container',
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
                const tabId = parseInt(contextElement.dataset.tabId, 10);
                // The same three ways to capture the camera's hover menu offers.
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    i18nKey: 'captureVisibleArea',
                    text: '',
                    count: null,
                    onClick: () => originalButton.click(),
                });
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    i18nKey: 'captureFullPageScroll',
                    text: '',
                    count: null,
                    onClick: () => captureTabFullPage(contextElement, 'fullPage'),
                });
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    i18nKey: 'captureFullPageSplit',
                    text: '',
                    count: null,
                    onClick: () => captureTabFullPage(contextElement, 'fullPageParts'),
                });
                if (!isNaN(tabId)) {
                    createMenuItem({
                        list,
                        itemTemplate,
                        iconHtml: iconHtml,
                        i18nKey: 'captureWebpageArea',
                        text: '',
                        count: null,
                        onClick: () => captureTabAreaById(tabId),
                    });
                }
            } else if (originalButton.classList.contains('capture-group-btn')) {
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    i18nKey: 'captureGroupTabsVisible',
                    text: '',
                    count: null,
                    onClick: () => originalButton.click(),
                });
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    i18nKey: 'captureGroupTabsFullPage',
                    text: '',
                    count: null,
                    onClick: () => captureGroupFromCard(contextElement, { mode: 'fullPage' }),
                });
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    i18nKey: 'captureGroupTabsFullPageParts',
                    text: '',
                    count: null,
                    onClick: () => captureGroupFromCard(contextElement, { mode: 'fullPageParts' }),
                });
            } else if (originalButton.classList.contains('gemini-summary-btn')) {
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml: iconHtml,
                    i18nKey: 'summarizeWithGemini',
                    text: '',
                    count: null,
                    onClick: () => originalButton.click(),
                });
                createMenuItem({
                    list,
                    itemTemplate,
                    iconHtml:
                        document.getElementById('tab-item-template')?.content.querySelector('.read-page-btn')
                            ?.innerHTML || iconHtml,
                    i18nKey: 'readPageAloud',
                    text: '',
                    count: null,
                    onClick: () => startReadAloud(readAloudTargetOf(contextElement)),
                });
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
                if (!isNaN(tabId)) {
                    PAGE_MODES.forEach(({ mode, i18n }) => {
                        createMenuItem({
                            list,
                            itemTemplate,
                            iconHtml: iconHtml,
                            i18nKey: i18n,
                            text: '',
                            count: null,
                            onClick: () => applyPageMode(tabId, mode, i18n),
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

    // The gallery badge is offered once per popup, no matter how many camera buttons
    // the card happens to carry.
    let galleryOffered = false;

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
            // The gallery badge has a row of its own further down; without this it
            // also came through here and the menu listed it twice.
            const isGalleryBadge = originalBtn.classList.contains('view-screenshots-btn');

            if (templateBtn && !isGalleryBadge) {
                const iconHTML = templateBtn.innerHTML;
                /** Shorthand for the common case: one row in this popup, this icon. */
                const addRow = (options, onClick, icon = iconHTML) =>
                    appendOverflowItem(popupEl, itemTemplate, icon, options, onClick);
                /** Rows that stand in for a button that is on the card but hidden. */
                const addProxyRow = (options) => addRow(options, () => originalBtn.click());

                if (actionKey === 'notes') {
                    const noteBadge = contextElement.querySelector('.note-count-badge:not(.hidden)');
                    const noteCount = noteBadge ? parseInt(noteBadge.textContent, 10) : 0;
                    const noteIcon =
                        document.getElementById('add-note-btn-template')?.content.querySelector('svg')?.outerHTML || '';

                    addRow({ i18n: 'createNote' }, () => originalBtn.click(), noteIcon);
                    if (noteCount > 0) {
                        addRow({ i18n: 'viewNotes', count: noteCount }, () => noteBadge.click(), noteIcon);
                    }
                } else if (originalBtn.classList.contains('screenshot-btn')) {
                    const tabId = parseInt(contextElement.dataset.tabId, 10);
                    // The three ways to capture one tab, the same three the camera's
                    // own hover menu offers.
                    addProxyRow({ i18n: 'captureVisibleArea' });
                    addRow({ i18n: 'captureFullPageScroll' }, () => captureTabFullPage(contextElement, 'fullPage'));
                    addRow({ i18n: 'captureFullPageSplit' }, () => captureTabFullPage(contextElement, 'fullPageParts'));
                    addRow({ i18n: 'captureWebpageArea' }, () => captureTabAreaById(tabId));
                } else if (originalBtn.classList.contains('capture-group-btn')) {
                    addProxyRow({ i18n: 'captureGroupTabsVisible' });
                    addRow({ i18n: 'captureGroupTabsFullPage' }, () =>
                        captureGroupFromCard(contextElement, { mode: 'fullPage' }),
                    );
                    addRow({ i18n: 'captureGroupTabsFullPageParts' }, () =>
                        captureGroupFromCard(contextElement, { mode: 'fullPageParts' }),
                    );
                } else if (actionKey === 'summary') {
                    const tabItemEl = contextElement.closest('.tab-item');
                    const readerIcon =
                        document.getElementById('tab-item-template')?.content.querySelector('.read-page-btn')
                            ?.innerHTML || iconHTML;

                    addProxyRow({ i18n: 'summarizeWithGemini' });
                    if (tabItemEl) {
                        addRow(
                            { i18n: 'readPageAloud' },
                            () => startReadAloud(readAloudTargetOf(tabItemEl)),
                            readerIcon,
                        );
                    }
                } else if (actionKey === 'themes') {
                    const tabItemEl = contextElement.closest('.tab-item');
                    if (tabItemEl) {
                        const tabId = parseInt(tabItemEl.dataset.tabId, 10);
                        PAGE_MODES.forEach(({ mode, i18n }) =>
                            addRow({ i18n }, () => applyPageMode(tabId, mode, i18n)),
                        );
                    }
                } else {
                    addProxyRow({ text: originalBtn.title });
                }
            }

            if (actionKey === 'capture' && !galleryOffered) {
                const galleryBtn = contextElement.querySelector('.view-screenshots-btn');
                if (galleryBtn && !galleryBtn.classList.contains('hidden')) {
                    galleryOffered = true;
                    const galleryIcon =
                        document.getElementById('view-screenshots-btn-template')?.content.querySelector('svg')
                            ?.outerHTML || '';
                    const badge = galleryBtn.querySelector('.screenshot-count-badge');
                    appendOverflowItem(
                        popupEl,
                        itemTemplate,
                        galleryIcon,
                        { i18n: 'viewScreenshots', count: badge ? badge.textContent : null },
                        () => galleryBtn.click(),
                    );
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
