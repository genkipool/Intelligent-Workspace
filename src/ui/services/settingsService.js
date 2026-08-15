import { getStorageArea } from './storage.js';
import { get } from 'svelte/store';

import { applyTranslations } from '../../utils/i18n.js';

import {
    deleteScreenshotFromDb,
    getAllScreenshotIdsFromDb,
    deleteGeminiEntryFromDb,
    getAllGeminiIdsFromDb,
    getAllNoteIdsFromDb,
    deleteNoteFromDb,
    getAllBackupsFromDb,
} from '../../utils/db.js';

import { STORAGE_KEYS, ACTION_GROUPS, BOOKMARK_ACTION_GROUPS } from './constants.js';

import { createOverflowMenu } from './contextMenuService.js';
import { renderHistoryView } from './viewsService.js';
import { applySearchAndFilter } from './searchService.js';

import { userDefinedOrder, pinnedGroupIds, hiddenGroupIds } from './groupsService.js';

import {
    isBookmarksViewActive,
    pinnedAtLastPositionId,
    visibilitySettings,
    actionVisibilitySettings,
    bookmarkActionVisibilitySettings,
    expandedGroupStates,
    expandedSubgroupStates,
    isAllExpanded,
    viewExpandStates,
    persistentNoteIds,
    backedUpGroupData,
    settings as settingsStore,
    searchToggles,
    splitScreenState,
    currentHistoryDateFilter,
} from '../stores/appStore.svelte.js';

export async function loadActionVisibilitySettings() {
    const defaultSettings = Object.keys(ACTION_GROUPS).reduce((acc, key) => {
        acc[key] = ['overflow', 'delete-group', 'delete-tab', 'copy'].includes(key);
        return acc;
    }, {});

    try {
        const storage = await getStorage();
        const data = await storage.get(STORAGE_KEYS.ACTION_VISIBILITY);
        if (data[STORAGE_KEYS.ACTION_VISIBILITY]) {
            actionVisibilitySettings.set({
                ...defaultSettings,
                ...data[STORAGE_KEYS.ACTION_VISIBILITY],
            });
        } else {
            actionVisibilitySettings.set(defaultSettings);
        }
    } catch (e) {
        console.error('Error loading action visibility settings:', e);
        actionVisibilitySettings.set(defaultSettings);
    }
}

export async function loadBookmarkActionVisibilitySettings() {
    const defaultSettings = Object.keys(BOOKMARK_ACTION_GROUPS).reduce((acc, key) => {
        acc[key] = ['b-overflow', 'b-delete', 'b-delete-folder', 'b-copy'].includes(key);
        return acc;
    }, {});

    try {
        const storage = await getStorage();
        const data = await storage.get(STORAGE_KEYS.BOOKMARK_ACTION_VISIBILITY);
        if (data[STORAGE_KEYS.BOOKMARK_ACTION_VISIBILITY]) {
            bookmarkActionVisibilitySettings.set({
                ...defaultSettings,
                ...data[STORAGE_KEYS.BOOKMARK_ACTION_VISIBILITY],
            });
        } else {
            bookmarkActionVisibilitySettings.set(defaultSettings);
        }
    } catch (e) {
        console.error('Error loading bookmark action visibility settings:', e);
        bookmarkActionVisibilitySettings.set(defaultSettings);
    }
}

export async function saveActionVisibilitySettings() {
    try {
        const storage = await getStorage();
        await storage.set({
            [STORAGE_KEYS.ACTION_VISIBILITY]: get(actionVisibilitySettings),
        });
    } catch (e) {
        console.error('Error saving action visibility settings:', e);
    }
}

export async function saveBookmarkActionVisibilitySettings() {
    try {
        const storage = await getStorage();
        await storage.set({
            [STORAGE_KEYS.BOOKMARK_ACTION_VISIBILITY]: get(bookmarkActionVisibilitySettings),
        });
    } catch (e) {
        console.error('Error saving bookmark action visibility settings:', e);
    }
}

export function applyActionVisibility() {
    if (!document.body) return;

    Object.keys(ACTION_GROUPS).forEach((key) => document.body.removeAttribute(`data-hide-action-${key}`));
    Object.keys(BOOKMARK_ACTION_GROUPS).forEach((key) => document.body.removeAttribute(`data-hide-${key}`));

    const isBookmarkView = get(isBookmarksViewActive);
    const settingsObject = isBookmarkView ? get(bookmarkActionVisibilitySettings) : get(actionVisibilitySettings);

    if (!isBookmarkView) {
        settingsObject['video-pip'] = settingsObject['pip'] === true;
    }

    Object.keys(settingsObject).forEach((actionKey) => {
        if (settingsObject[actionKey] === false) {
            const attributeName = isBookmarkView ? `data-hide-${actionKey}` : `data-hide-action-${actionKey}`;
            document.body.setAttribute(attributeName, 'true');
        }
    });

    const _actionVisibilityControlsPanel = document.getElementById('action-visibility-controls-panel');
    if (_actionVisibilityControlsPanel) {
        _actionVisibilityControlsPanel.querySelectorAll('.action-toggle-btn').forEach((btn) => {
            const actionKey = btn.dataset.actionKey;
            if (settingsObject.hasOwnProperty(actionKey)) {
                btn.setAttribute('aria-pressed', String(settingsObject[actionKey]));
            }
        });
    }

    updateOverflowButtonState();
    rebuildAllOverflowMenus();
}

export function rebuildAllOverflowMenus() {
    const isBookmarkView = get(isBookmarksViewActive);
    if (isBookmarkView) {
        document.querySelectorAll('.bookmark-folder').forEach((folderEl) => {
            const actions = folderEl.querySelector('.folder-actions');
            if (actions) createOverflowMenu(actions, 'bookmark-folder-template', folderEl);
        });
        document.querySelectorAll('.bookmark-item').forEach((bookmarkEl) => {
            const actions = bookmarkEl.querySelector('.bookmark-actions');
            if (actions) createOverflowMenu(actions, 'bookmark-item-template', bookmarkEl);
        });
    } else {
        document.querySelectorAll('.group-item').forEach((groupEl) => {
            const actions = groupEl.querySelector('.group-actions');
            if (actions) createOverflowMenu(actions, 'group-item-template', groupEl);
        });
        document.querySelectorAll('.domain-subgroup').forEach((subGroupEl) => {
            const actions = subGroupEl.querySelector('.subgroup-actions');
            if (actions) createOverflowMenu(actions, 'domain-subgroup-template', subGroupEl);
        });
        document.querySelectorAll('.tab-item').forEach((tabEl) => {
            const actions = tabEl.querySelector('.tab-actions');
            if (actions) createOverflowMenu(actions, 'tab-item-template', tabEl);
        });
    }
}

export async function syncIndexedDbWithSession() {
    console.log('Starting synchronization of IndexedDB with session memory...');

    try {
        const { [STORAGE_KEYS.PERSISTENT_SCREENSHOTS]: persistentScreenshotIdsArray = [] } =
            await chrome.storage.local.get(STORAGE_KEYS.PERSISTENT_SCREENSHOTS);
        const persistentScreenshotIds = new Set(persistentScreenshotIdsArray);

        const sessionData = await chrome.storage.session.get([
            STORAGE_KEYS.SCREENSHOTS,
            STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS,
            STORAGE_KEYS.NOTES,
        ]);

        const storedScreenshots = sessionData[STORAGE_KEYS.SCREENSHOTS] || {};
        const validSessionIds = new Set();
        for (const key in storedScreenshots) {
            const idArray = storedScreenshots[key];
            if (Array.isArray(idArray)) {
                for (const id of idArray) {
                    validSessionIds.add(id);
                }
            }
        }
        const allDbIds = await getAllScreenshotIdsFromDb();

        const orphanScreenshotIds = allDbIds.filter(
            (id) => !validSessionIds.has(id) && !persistentScreenshotIds.has(id),
        );

        if (orphanScreenshotIds.length > 0) {
            await Promise.all(orphanScreenshotIds.map((id) => deleteScreenshotFromDb(id)));
            console.log('Orphan screenshots deleted.');
        } else {
            console.log('Screenshots synchronized.');
        }

        const { [STORAGE_KEYS.PERSISTENT_GEMINI]: persistentGeminiIdsArray = [] } = await chrome.storage.local.get(
            STORAGE_KEYS.PERSISTENT_GEMINI,
        );
        const persistentGeminiIds = new Set(persistentGeminiIdsArray);

        const sessionConversationsList = sessionData[STORAGE_KEYS.GEMINI_SESSION_CONVERSATIONS] || [];
        const validGeminiIdsInSession = new Set(sessionConversationsList.flatMap((c) => c.entryIds));

        const allGeminiDbIds = await getAllGeminiIdsFromDb();

        const orphanGeminiIds = allGeminiDbIds.filter(
            (id) => !validGeminiIdsInSession.has(id) && !persistentGeminiIds.has(id),
        );

        if (orphanGeminiIds.length > 0) {
            await Promise.all(orphanGeminiIds.map((id) => deleteGeminiEntryFromDb(id)));
            console.log('Orphan Gemini conversations deleted.');
        } else {
            console.log('Gemini conversations synchronized.');
        }

        const persistentData = await chrome.storage.local.get(STORAGE_KEYS.PERSISTENT_NOTES);
        persistentNoteIds.set(new Set(persistentData[STORAGE_KEYS.PERSISTENT_NOTES] || []));

        const storedNotes = sessionData[STORAGE_KEYS.NOTES] || {};
        const validNoteIdsInSession = new Set();
        for (const key in storedNotes) {
            if (Array.isArray(storedNotes[key])) {
                storedNotes[key].forEach((id) => validNoteIdsInSession.add(id));
            }
        }
        const allDbNoteIds = await getAllNoteIdsFromDb();

        const currPersistentNoteIds = get(persistentNoteIds);
        const orphanNoteIds = allDbNoteIds.filter(
            (id) => !validNoteIdsInSession.has(id) && !currPersistentNoteIds.has(id),
        );

        if (orphanNoteIds.length > 0) {
            await Promise.all(orphanNoteIds.map((id) => deleteNoteFromDb(id)));
            console.log('Orphan notes deleted.');
        } else {
            console.log('Notes synchronized, no persistent or active notes were deleted.');
        }
    } catch (error) {
        console.error('Error during IndexedDB synchronization with session:', error);
    }
}

export function getStorage() {
    return getStorageArea('ruleStorageArea');
}

// renderGroups() reads the prefix, order, pin and hidden settings loaded here, so a
// render that gets in first paints names and an ordering that are corrected a moment
// later. Callers await this instead of racing it.
let statePromise = null;

/** Resolves once loadState() has run at least once. */
export function whenStateLoaded() {
    return statePromise ?? loadState();
}

export function loadState() {
    statePromise = doLoadState();
    return statePromise;
}

async function doLoadState() {
    try {
        const storage = await getStorage();
        const backups = await getAllBackupsFromDb();
        const backupMap = backups.reduce((acc, backup) => {
            acc[backup.group.id] = backup;
            return acc;
        }, {});
        backedUpGroupData.set(backupMap);

        const syncData = await storage.get([
            STORAGE_KEYS.ORDER,
            STORAGE_KEYS.PINS,
            STORAGE_KEYS.HIDDEN,
            STORAGE_KEYS.SETTINGS,
            STORAGE_KEYS.PINNED_AT_LAST,
            'enablePrefixes',
        ]);

        userDefinedOrder.set(Array.isArray(syncData[STORAGE_KEYS.ORDER]) ? syncData[STORAGE_KEYS.ORDER] : []);
        pinnedGroupIds.set(new Set(Array.isArray(syncData[STORAGE_KEYS.PINS]) ? syncData[STORAGE_KEYS.PINS] : []));
        hiddenGroupIds.set(new Set(Array.isArray(syncData[STORAGE_KEYS.HIDDEN]) ? syncData[STORAGE_KEYS.HIDDEN] : []));
        pinnedAtLastPositionId.set(syncData[STORAGE_KEYS.PINNED_AT_LAST] || null);
        settingsStore.update((s) => ({ ...s, enablePrefixes: syncData.enablePrefixes ?? true }));

        const listGroupSettings = syncData[STORAGE_KEYS.SETTINGS] || {};
        // The toolbar draws these three switches from the store; writing the attribute
        // by hand only lasted until the next render, which is how the assistant search
        // came back on after leaving the page.
        searchToggles.set({
            gemini: listGroupSettings.geminiSearchActive === true,
            web: listGroupSettings.webSearchActive !== false,
            regex: listGroupSettings.regexActive === true,
        });
    } catch (e) {
        console.error('Error loading state:', e);
        searchToggles.set({ gemini: false, web: true, regex: false });
        settingsStore.update((s) => ({ ...s, enablePrefixes: true }));
    }
}

export async function loadVisibilitySettings() {
    try {
        const storage = await getStorage();
        const data = await storage.get(STORAGE_KEYS.VISIBILITY);
        if (data[STORAGE_KEYS.VISIBILITY]) {
            visibilitySettings.update((v) => ({ ...v, ...data[STORAGE_KEYS.VISIBILITY] }));
        }
    } catch (e) {
        console.error('Error loading visibility settings:', e);
        visibilitySettings.set({
            showGroupActions: false,
            showSubgroupActions: false,
            showTabActions: false,
            showDomainHeaders: false,
        });
    }
}

export async function saveVisibilitySettings() {
    try {
        const storage = await getStorage();
        await storage.set({ [STORAGE_KEYS.VISIBILITY]: get(visibilitySettings) });
    } catch (e) {
        console.error('Error saving visibility settings:', e);
    }
}

export function applyVisibilitySettings() {
    if (!document.body) return;

    const _visibilitySettings = get(visibilitySettings);

    document.body.classList.toggle('show-group-actions', _visibilitySettings.showGroupActions);
    document.body.classList.toggle('show-subgroup-actions', _visibilitySettings.showSubgroupActions);
    document.body.classList.toggle('show-tab-actions', _visibilitySettings.showTabActions);
    document.body.classList.toggle('show-domain-headers', _visibilitySettings.showDomainHeaders);

    const _toggleGroupActionsBtn = document.getElementById('toggle-group-actions-btn');
    if (_toggleGroupActionsBtn) {
        const isPressed = _visibilitySettings.showGroupActions;
        _toggleGroupActionsBtn.setAttribute('aria-pressed', String(isPressed));
        _toggleGroupActionsBtn.setAttribute(
            'data-i18n-title',
            isPressed ? 'toggleGroupActionsTooltipActive' : 'toggleGroupActionsTooltip',
        );
    }
    const _toggleSubgroupActionsBtn = document.getElementById('toggle-subgroup-actions-btn');
    if (_toggleSubgroupActionsBtn) {
        const isPressed = _visibilitySettings.showSubgroupActions;
        _toggleSubgroupActionsBtn.setAttribute('aria-pressed', String(isPressed));
        if (!_toggleSubgroupActionsBtn.disabled) {
            _toggleSubgroupActionsBtn.setAttribute(
                'data-i18n-title',
                isPressed ? 'toggleSubgroupActionsTooltipActive' : 'toggleSubgroupActionsTooltip',
            );
        }
    }
    const _toggleTabActionsBtn = document.getElementById('toggle-tab-actions-btn');
    if (_toggleTabActionsBtn) {
        const isPressed = _visibilitySettings.showTabActions;
        _toggleTabActionsBtn.setAttribute('aria-pressed', String(isPressed));
        _toggleTabActionsBtn.setAttribute(
            'data-i18n-title',
            isPressed ? 'toggleTabActionsTooltipActive' : 'toggleTabActionsTooltip',
        );
    }
    const _toggleDomainHeadersBtn = document.getElementById('toggle-domain-headers-btn');
    if (_toggleDomainHeadersBtn) {
        const isPressed = _visibilitySettings.showDomainHeaders;
        _toggleDomainHeadersBtn.setAttribute('aria-pressed', String(isPressed));
        _toggleDomainHeadersBtn.setAttribute(
            'data-i18n-title',
            isPressed ? 'toggleSubgroupsTooltipActive' : 'toggleSubgroupsTooltip',
        );
    }

    document.body.classList.toggle('show-folder-actions', _visibilitySettings.showFolderActions);
    document.body.classList.toggle('show-child-folders', _visibilitySettings.showChildFolders);
    document.body.classList.toggle('show-child-folder-actions', _visibilitySettings.showChildFolderActions);
    document.body.classList.toggle('show-bookmark-actions', _visibilitySettings.showBookmarkActions);

    const toggleFolderActionsBtn = document.getElementById('toggle-folder-actions-btn');
    if (toggleFolderActionsBtn) {
        toggleFolderActionsBtn.setAttribute('aria-pressed', String(_visibilitySettings.showFolderActions));
    }
    const toggleChildFoldersBtn = document.getElementById('toggle-child-folders-btn');
    if (toggleChildFoldersBtn) {
        toggleChildFoldersBtn.setAttribute('aria-pressed', String(_visibilitySettings.showChildFolders));
    }
    const toggleChildFolderActionsBtn = document.getElementById('toggle-child-folder-actions-btn');
    if (toggleChildFolderActionsBtn) {
        toggleChildFolderActionsBtn.setAttribute('aria-pressed', String(_visibilitySettings.showChildFolderActions));
    }
    const toggleBookmarkActionsBtn = document.getElementById('toggle-bookmark-actions-btn');
    if (toggleBookmarkActionsBtn) {
        toggleBookmarkActionsBtn.setAttribute('aria-pressed', String(_visibilitySettings.showBookmarkActions));
    }

    updateSubgroupActionsButtonState();
    updateChildFolderActionsButtonState();
    applyTranslations();
}

export function updateSubgroupActionsButtonState() {
    const _toggleDomainHeadersBtn = document.getElementById('toggle-domain-headers-btn');
    const _toggleSubgroupActionsBtn = document.getElementById('toggle-subgroup-actions-btn');
    if (!_toggleDomainHeadersBtn || !_toggleSubgroupActionsBtn) return;

    const _visibilitySettings = get(visibilitySettings);

    if (_visibilitySettings.showDomainHeaders === false) {
        _toggleSubgroupActionsBtn.disabled = true;
        _toggleSubgroupActionsBtn.setAttribute('data-i18n-title', 'enableSubgroupsFirstTooltip');

        if (_visibilitySettings.showSubgroupActions === true) {
            visibilitySettings.update((v) => ({ ...v, showSubgroupActions: false }));
            _toggleSubgroupActionsBtn.setAttribute('aria-pressed', 'false');
            document.body.classList.remove('show-subgroup-actions');
            saveVisibilitySettings();
        }
    } else {
        _toggleSubgroupActionsBtn.disabled = false;
    }

    applyTranslations();
}

export function updateVisibilityPanelButtons() {
    const _visibilityControlsPanel = document.getElementById('visibility-controls-panel');
    if (!_visibilityControlsPanel) return;

    const groupViewButtons = [
        _visibilityControlsPanel.querySelector('#toggle-group-actions-btn'),
        _visibilityControlsPanel.querySelector('#toggle-domain-headers-btn'),
        _visibilityControlsPanel.querySelector('#toggle-subgroup-actions-btn'),
        _visibilityControlsPanel.querySelector('#toggle-tab-actions-btn'),
    ];

    const bookmarkViewButtons = [
        _visibilityControlsPanel.querySelector('#toggle-folder-actions-btn'),
        _visibilityControlsPanel.querySelector('#toggle-child-folders-btn'),
        _visibilityControlsPanel.querySelector('#toggle-child-folder-actions-btn'),
        _visibilityControlsPanel.querySelector('#toggle-bookmark-actions-btn'),
    ];

    const _isBookmarksViewActive = get(isBookmarksViewActive);
    groupViewButtons.forEach((btn) => {
        if (btn) btn.classList.toggle('hidden', _isBookmarksViewActive);
    });

    bookmarkViewButtons.forEach((btn) => {
        if (btn) btn.classList.toggle('hidden', !_isBookmarksViewActive);
    });
}

export function setupVisibilityControls() {
    const _toggleVisibilityControlsBtn = document.getElementById('toggle-visibility-controls-btn');
    const _visibilityControlsPanel = document.getElementById('visibility-controls-panel');
    if (!_toggleVisibilityControlsBtn || !_visibilityControlsPanel) return;

    const newBtn = _toggleVisibilityControlsBtn.cloneNode(true);
    _toggleVisibilityControlsBtn.parentNode.replaceChild(newBtn, _toggleVisibilityControlsBtn);
    const toggleBtn = newBtn;

    toggleBtn.addEventListener('click', () => {
        const isPanelVisible = !_visibilityControlsPanel.classList.contains('hidden');

        const _sortOptionBtns = document.querySelectorAll('.sort-option-btn');
        const _deleteOptionBtns = document.querySelectorAll('.delete-option-btn');
        const _actionVisibilityControlsPanel = document.getElementById('action-visibility-controls-panel');

        const isSortMode = _sortOptionBtns.length > 0 && !_sortOptionBtns[0].classList.contains('hidden');
        const isDeleteMode = _deleteOptionBtns.length > 0 && !_deleteOptionBtns[0].classList.contains('hidden');

        const isVisibilityMode = isPanelVisible && !isSortMode && !isDeleteMode;

        if (isVisibilityMode) {
            _visibilityControlsPanel.classList.add('hidden');
            if (_actionVisibilityControlsPanel) {
                _actionVisibilityControlsPanel.classList.add('hidden');
            }
        } else {
            setupActionVisibilityControls();

            _sortOptionBtns.forEach((btn) => btn.classList.add('hidden'));
            _deleteOptionBtns.forEach((btn) => btn.classList.add('hidden'));

            updateVisibilityPanelButtons();

            _visibilityControlsPanel.classList.remove('hidden');
            if (_actionVisibilityControlsPanel) {
                _actionVisibilityControlsPanel.classList.remove('hidden');
            }
        }
    });

    const handleToggle = (key) => {
        const _toggleSubgroupActionsBtn = document.getElementById('toggle-subgroup-actions-btn');
        if (key === 'showSubgroupActions' && _toggleSubgroupActionsBtn && _toggleSubgroupActionsBtn.disabled) {
            return;
        }
        visibilitySettings.update((v) => ({ ...v, [key]: !v[key] }));
        saveVisibilitySettings();
        applyVisibilitySettings();
    };

    const _toggleGroupActionsBtn = document.getElementById('toggle-group-actions-btn');
    if (_toggleGroupActionsBtn) {
        _toggleGroupActionsBtn.addEventListener('click', () => handleToggle('showGroupActions'));
    }
    const _toggleSubgroupActionsBtn = document.getElementById('toggle-subgroup-actions-btn');
    if (_toggleSubgroupActionsBtn) {
        _toggleSubgroupActionsBtn.addEventListener('click', () => handleToggle('showSubgroupActions'));
    }
    const _toggleTabActionsBtn = document.getElementById('toggle-tab-actions-btn');
    if (_toggleTabActionsBtn) {
        _toggleTabActionsBtn.addEventListener('click', () => handleToggle('showTabActions'));
    }
    const _toggleDomainHeadersBtn = document.getElementById('toggle-domain-headers-btn');
    if (_toggleDomainHeadersBtn) {
        _toggleDomainHeadersBtn.addEventListener('click', () => handleToggle('showDomainHeaders'));
    }

    const toggleFolderActionsBtn = document.getElementById('toggle-folder-actions-btn');
    if (toggleFolderActionsBtn) {
        toggleFolderActionsBtn.addEventListener('click', () => handleToggle('showFolderActions'));
    }
    const toggleChildFoldersBtn = document.getElementById('toggle-child-folders-btn');
    if (toggleChildFoldersBtn) {
        toggleChildFoldersBtn.addEventListener('click', () => handleToggle('showChildFolders'));
    }
    const toggleChildFolderActionsBtn = document.getElementById('toggle-child-folder-actions-btn');
    if (toggleChildFolderActionsBtn) {
        toggleChildFolderActionsBtn.addEventListener('click', () => handleToggle('showChildFolderActions'));
    }
    const toggleBookmarkActionsBtn = document.getElementById('toggle-bookmark-actions-btn');
    if (toggleBookmarkActionsBtn) {
        toggleBookmarkActionsBtn.addEventListener('click', () => handleToggle('showBookmarkActions'));
    }

    applyActionVisibility();
}

export function updateChildFolderActionsButtonState() {
    const toggleChildFoldersBtn = document.getElementById('toggle-child-folders-btn');
    const toggleChildFolderActionsBtn = document.getElementById('toggle-child-folder-actions-btn');

    if (!toggleChildFoldersBtn || !toggleChildFolderActionsBtn) return;

    const _visibilitySettings = get(visibilitySettings);

    if (_visibilitySettings.showChildFolders === false) {
        toggleChildFolderActionsBtn.disabled = true;
        toggleChildFolderActionsBtn.setAttribute('data-i18n-title', 'enableChildFoldersFirstTooltip');

        if (_visibilitySettings.showChildFolderActions === true) {
            visibilitySettings.update((v) => ({ ...v, showChildFolderActions: false }));
            toggleChildFolderActionsBtn.setAttribute('aria-pressed', 'false');
            document.body.classList.remove('show-child-folder-actions');
            saveVisibilitySettings();
        }
    } else {
        toggleChildFolderActionsBtn.disabled = false;
        const isPressed = _visibilitySettings.showChildFolderActions;
        toggleChildFolderActionsBtn.setAttribute(
            'data-i18n-title',
            isPressed ? 'toggleChildFolderActionsTooltipActive' : 'toggleChildFolderActionsTooltip',
        );
    }

    applyTranslations();
}

export function updateOverflowButtonState() {
    const _actionVisibilityControlsPanel = document.getElementById('action-visibility-controls-panel');
    if (!_actionVisibilityControlsPanel) return;

    const isBookmarkView = get(isBookmarksViewActive);
    const settingsObject = isBookmarkView ? get(bookmarkActionVisibilitySettings) : get(actionVisibilitySettings);
    const actionGroups = isBookmarkView ? BOOKMARK_ACTION_GROUPS : ACTION_GROUPS;
    const overflowKey = isBookmarkView ? 'b-overflow' : 'overflow';
    const overflowTooltip = actionGroups[overflowKey]?.tooltip || 'showOverflow';

    const overflowBtn = _actionVisibilityControlsPanel.querySelector(`[data-action-key="${overflowKey}"]`);
    if (!overflowBtn) return;

    const otherActionBtns = Array.from(
        _actionVisibilityControlsPanel.querySelectorAll(`.action-toggle-btn:not([data-action-key="${overflowKey}"])`),
    );

    const allOthersPressed = otherActionBtns.every((btn) => btn.getAttribute('aria-pressed') === 'true');

    if (allOthersPressed) {
        overflowBtn.disabled = true;
        overflowBtn.setAttribute('aria-pressed', 'false');
        overflowBtn.classList.add('is-disabled-by-rule');
        overflowBtn.setAttribute('data-i18n-title', 'overflowDisabledTooltip');

        const hideAttribute = isBookmarkView ? 'data-hide-b-overflow' : 'data-hide-action-overflow';
        document.body.setAttribute(hideAttribute, 'true');
    } else {
        overflowBtn.disabled = false;
        overflowBtn.classList.remove('is-disabled-by-rule');

        const isUserPreferenceOn = settingsObject[overflowKey] !== false;

        overflowBtn.setAttribute('aria-pressed', String(isUserPreferenceOn));
        overflowBtn.setAttribute('data-i18n-title', overflowTooltip);

        const hideAttribute = isBookmarkView ? 'data-hide-b-overflow' : 'data-hide-action-overflow';
        if (isUserPreferenceOn) {
            document.body.removeAttribute(hideAttribute);
        } else {
            document.body.setAttribute(hideAttribute, 'true');
        }
    }

    applyTranslations();
}

export function setupActionVisibilityControls() {
    const _actionVisibilityControlsPanel = document.getElementById('action-visibility-controls-panel');
    if (!_actionVisibilityControlsPanel) return;

    const isBookmarkView = get(isBookmarksViewActive);
    const actionGroups = isBookmarkView ? BOOKMARK_ACTION_GROUPS : ACTION_GROUPS;
    const settingsObject = isBookmarkView ? get(bookmarkActionVisibilitySettings) : get(actionVisibilitySettings);
    const saveFunction = isBookmarkView ? saveBookmarkActionVisibilitySettings : saveActionVisibilitySettings;

    const uniqueActions = new Map();

    const extractActionsFromTemplate = (templateId) => {
        const template = document.getElementById(templateId);
        if (!template) return;

        template.content.querySelectorAll('.action-btn').forEach((btn) => {
            const btnClass = Array.from(btn.classList).find((cls) => cls.endsWith('-btn') && cls !== 'action-btn');
            if (btnClass) {
                const actionKey = Object.keys(actionGroups).find((key) => actionGroups[key].classes.includes(btnClass));
                if (actionKey && !uniqueActions.has(actionKey)) {
                    uniqueActions.set(actionKey, btn.innerHTML);
                }
            }
        });
    };

    const templateIds = isBookmarkView
        ? ['bookmark-item-template', 'bookmark-folder-template', 'overflow-actions-template']
        : [
              'group-item-template',
              'domain-subgroup-template',
              'tab-item-template',
              'add-note-btn-template',
              'view-screenshots-btn-template',
              'overflow-actions-template',
          ];

    templateIds.forEach(extractActionsFromTemplate);
    _actionVisibilityControlsPanel.innerHTML = '';

    Object.keys(actionGroups).forEach((actionKey) => {
        if (actionKey === 'video-pip') return;
        const actionInfo = actionGroups[actionKey];

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'control-btn action-toggle-btn';

        const iconHTML = uniqueActions.get(actionKey);

        if (iconHTML) {
            toggleBtn.innerHTML = iconHTML;
        } else {
            toggleBtn.textContent = actionKey.substring(actionKey.startsWith('b-') ? 2 : 0, 5);
        }

        toggleBtn.dataset.actionKey = actionKey;
        toggleBtn.setAttribute('data-i18n-title', actionInfo.tooltip);

        const isPressed = settingsObject[actionKey] !== false;
        toggleBtn.setAttribute('aria-pressed', String(isPressed));

        toggleBtn.addEventListener('click', () => {
            const clickedActionKey = toggleBtn.dataset.actionKey;

            if (!isBookmarkView && (clickedActionKey === 'backup' || clickedActionKey === 'restore')) {
                const newState = !settingsObject[clickedActionKey];
                settingsObject['backup'] = newState;
                settingsObject['restore'] = newState;
            } else {
                settingsObject[clickedActionKey] = !settingsObject[clickedActionKey];
            }

            saveFunction();
            applyActionVisibility();
        });

        _actionVisibilityControlsPanel.appendChild(toggleBtn);
    });

    applyActionVisibility();
    applyTranslations();
}

export function updateSubButtonVisibility() {
    const _geminiToggleBtn = document.getElementById('gemini-toggle-btn');
    if (!_geminiToggleBtn) return;
}

export async function saveState() {
    try {
        const storage = await getStorage();
        await storage.set({
            [STORAGE_KEYS.ORDER]: get(userDefinedOrder),
            [STORAGE_KEYS.PINS]: Array.from(get(pinnedGroupIds)),
            [STORAGE_KEYS.HIDDEN]: Array.from(get(hiddenGroupIds)),
            [STORAGE_KEYS.PINNED_AT_LAST]: get(pinnedAtLastPositionId),
        });
    } catch (e) {
        console.error('Error saving state:', e);
    }
}

export async function saveListGroupSettings() {
    try {
        const storage = await getStorage();
        const toggles = get(searchToggles);

        const currentSettings = {
            webSearchActive: toggles.web,
            regexActive: toggles.regex,
            geminiSearchActive: toggles.gemini,
        };
        await storage.set({
            [STORAGE_KEYS.SETTINGS]: currentSettings,
        });
    } catch (e) {
        console.error('Error saving list group settings:', e);
    }
}

export async function loadSplitScreenState() {
    const data = await chrome.storage.session.get(STORAGE_KEYS.SPLIT_SCREEN);
    splitScreenState.set(
        data[STORAGE_KEYS.SPLIT_SCREEN] || {
            isActive: false,
            splitTabs: {},
        },
    );
}

export function initSettingsEvents() {
    const toggleViewPanelBtn = document.getElementById('toggle-view-panel-btn');
    const viewTogglePanel = document.getElementById('view-toggle-panel');
    if (toggleViewPanelBtn && viewTogglePanel) {
        toggleViewPanelBtn.addEventListener('click', () => {
            const isNowHidden = viewTogglePanel.classList.toggle('hidden');
            if (!isNowHidden && typeof window.closePomodoroPanel === 'function') {
                window.closePomodoroPanel(true);
            }
            if (isNowHidden) {
                document.getElementById('visibility-controls-panel')?.classList.add('hidden');
                document.getElementById('action-visibility-controls-panel')?.classList.add('hidden');
            }
        });
    }

    const historyDateFilterBtn = document.getElementById('history-date-filter-btn');
    const historyDateInput = document.getElementById('history-date-input');
    if (historyDateFilterBtn && historyDateInput) {
        historyDateFilterBtn.addEventListener('click', (e) => {
            try {
                historyDateInput.showPicker();
            } catch {
                historyDateInput.click();
            }
        });

        historyDateInput.addEventListener('change', async (e) => {
            const selectedDate = e.target.value;
            if (selectedDate) {
                const [year, month, day] = selectedDate.split('-').map(Number);
                const startDate = new Date(year, month - 1, day, 0, 0, 0);
                const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
                currentHistoryDateFilter.set({ start: startDate.getTime(), end: endDate.getTime() });
                historyDateFilterBtn.classList.add('active');
                historyDateFilterBtn.setAttribute('aria-pressed', 'true');
                historyDateFilterBtn.title =
                    chrome.i18n.getMessage('historyDateFilterTooltip', [selectedDate]) || `Filter: ${selectedDate}`;
                await renderHistoryView(startDate.getTime(), endDate.getTime());
            } else {
                currentHistoryDateFilter.set(null);
                historyDateFilterBtn.classList.remove('active');
                historyDateFilterBtn.setAttribute('aria-pressed', 'false');
                historyDateFilterBtn.removeAttribute('title');
                await renderHistoryView();
            }
        });
    }

    // The regex switch is wired in searchService.initSearchEvents(); a second listener
    // here flipped it back on the same click.
}
