<script>
    import {
        msg as localizedMsg,
        initializeTranslations,
        showNotification,
        applyTranslations,
        getCurrentLang,
        loadMessages,
        pluralKey,
    } from '../../../utils/i18n.js';
    import { onMount, tick } from 'svelte';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    import ConfirmDialog from '../../components/common/ConfirmDialog.svelte';
    import { confirmAction } from '../../stores/confirmStore.js';
    import ThemeEditorModal from './components/ThemeEditorModal.svelte';
    import ThemeScheduleModal from './components/ThemeScheduleModal.svelte';
    import SavedThemesToolbar from './components/SavedThemesToolbar.svelte';
    import SavedThemesGrid from './components/SavedThemesGrid.svelte';
    import SavedThemesFooter from './components/SavedThemesFooter.svelte';
    import { initializeActiveTheme, applyCustomTheme, getActiveTheme, saveActiveTheme } from '../../../utils/theme.js';
    import { initializeKeyboardNavigation } from '../../../utils/keyboardNav.js';
    import { exportThemes, processAndSaveImportedThemes } from '../../../utils/importExport.js';
    import { i18nStore } from '../../stores/i18nStore.js';
    import ImportPanel from '../../components/common/ImportPanel.svelte';

    const MAX_SYNC_THEMES = 20;
    const MAX_LOCAL_THEMES = 30;
    const MAX_GLOBAL_SCHEDULES = 7;

    let savedThemes = $state([]);
    let currentStorageArea = $state('sync');
    let activeTheme = $state(null);
    let syncThemesCount = $state(0);
    let localThemesCount = $state(0);

    // View States
    let showImportPanel = $state(false);
    let showThemeEditor = $state(false);
    let showScheduleModal = $state(false);

    // UI Refs
    let mainContainerEl = $state();

    // Theme Editor State
    let editorState = $state({ mode: 'create', themeIndex: -1, originalName: '' });
    let editorColors = $state({
        bgColor: '#cccccc',
        bgPanelColor: '#cccccc',
        textColor: '#000000',
        textOnColor: '#ffffff',
        actionColor: '#007B83',
        interactiveColor: '#007B83',
        borderColor: '#cccccc',
        errorColor: '#D93025',
        headerColor: '#007B83',
    });

    // Schedule Modal State
    let schedules = $state([]);
    let currentThemeForScheduling = $state(null);
    // What the list shows: the theme the dialog was opened for, or every theme. Kept
    // apart from the theme being edited, so editing one schedule from "Scheduled
    // Themes" no longer narrowed the list down to that theme.
    let scheduleListFilter = $state(null);
    let totalScheduleCount = $state(0);
    let scheduleEditorState = $state({ mode: 'add', themeName: null, scheduleIndex: -1 });

    let selectedDays = $state([]);
    // Picking a weekday turns the schedule into a repeating one, and the form then
    // asks only for the start and end time — a repeating schedule has no dates.
    // Declared plain, this switch was invisible to the form: it kept showing the
    // date fields of a one-off schedule while `saveSchedule`, which had already
    // switched, read the repeating times nobody could fill and refused to save,
    // saying start and end times were required with both on screen.
    let scheduleType = $state('onetime'); // 'onetime' | 'repeating'
    /**
     * "All day" for a weekday schedule: the theme is on from midnight to the last
     * minute of the day, so there are no hours to fill in.
     */
    let allDay = $state(false);
    let scheduleReminder = $state('');

    // Custom Datetime pickers state
    let startTimeTrigger = $state('00:00');
    let endTimeTrigger = $state('00:00');
    let startTimeOneTimeTrigger = $state('00:00');
    let endTimeOneTimeTrigger = $state('00:00');
    let startDateValue = $state('');
    let endDateValue = $state('');

    let scheduleError = $state('');

    // Switching between a one-off and a repeating schedule swaps in a different set
    // of fields, and their labels carry `data-i18n`, which is resolved by a pass that
    // only ran when the modal opened. The times of a repeating schedule therefore
    // appeared under two blank labels.
    // The repeating block swaps its fields around — the hours disappear when the
    // schedule covers the whole day — and whatever is mounted next carries untouched
    // `data-i18n` attributes, so the labels have to be filled in again each time.
    $effect(() => {
        scheduleType;
        allDay;
        scheduleEditorState.mode;
        if (!showScheduleModal) return;
        tick().then(() => applyTranslations(document.getElementById('schedule-modal')));
    });

    onMount(async () => {
        initNumberSpinnerArrows();
        const port = chrome.runtime.connect({ name: 'sidepanel-connection' });
        port.postMessage({ path: 'src/ui/pages/savedThemes/savedThemes.html' });
        chrome.runtime.sendMessage({
            action: 'sidePanelPathUpdated',
            path: 'src/ui/pages/savedThemes/savedThemes.html',
        });

        await initializeActiveTheme();
        await initializeTranslations();
        // Components on this page translate through the store ($t/$tt); without this
        // they would render empty strings.
        await i18nStore.init();

        await loadStoragePreference();
        await fetchThemes();

        initializeKeyboardNavigation();

        chrome.storage.onChanged.addListener((changes, areaName) => {
            const isLocalChangeRelevant = areaName === 'local' && (changes.activeTheme || changes.schedules);
            const isCurrentStorageChange = areaName === currentStorageArea && changes.savedThemes;
            if (isLocalChangeRelevant || isCurrentStorageChange) {
                fetchThemes();
                if (showScheduleModal) fetchSchedules(scheduleListFilter);
            }
        });

        applyTranslations(document.body);
    });

    async function loadStoragePreference() {
        const { themeStorageArea = 'sync' } = await chrome.storage.local.get('themeStorageArea');
        currentStorageArea = themeStorageArea;
    }

    async function setStorageArea(area) {
        if (currentStorageArea === area) return;
        currentStorageArea = area;
        await chrome.storage.local.set({ themeStorageArea: area });
        await fetchThemes();
    }

    async function fetchThemes() {
        const storage = chrome.storage[currentStorageArea];
        const { savedThemes: themes = [] } = await storage.get('savedThemes');
        savedThemes = themes;
        activeTheme = await getActiveTheme();

        const { savedThemes: syncT = [] } = await chrome.storage.sync.get('savedThemes');
        const { savedThemes: localT = [] } = await chrome.storage.local.get('savedThemes');
        syncThemesCount = syncT.length;
        localThemesCount = localT.length;

        await tick();
        applyTranslations(mainContainerEl);
    }

    // --- Footer actions ---
    /**
     * Navigates inside the current context. The `context=sidepanel` query matters:
     * without it the popup treats the visit as a fresh open and jumps to whatever
     * page is pinned instead of showing itself.
     */
    function navigateTo(path) {
        const target = path.includes('?') ? path : `${path}?context=sidepanel`;
        chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path });
        chrome.storage.local.set({ navSource: '../savedThemes/savedThemes.html?context=sidepanel' }).then(() => {
            window.location.href = target;
        });
    }

    // --- Theme editor ---
    const getFallbackColors = () => {
        const cs = getComputedStyle(document.documentElement);
        return {
            bgColor: cs.getPropertyValue('--bg-color').trim(),
            bgPanelColor: cs.getPropertyValue('--bg-panel-color').trim(),
            textColor: cs.getPropertyValue('--text-color').trim(),
            textOnColor: cs.getPropertyValue('--text-on-color').trim(),
            actionColor: cs.getPropertyValue('--action-color').trim(),
            interactiveColor: cs.getPropertyValue('--interactive-color').trim(),
            borderColor: cs.getPropertyValue('--border-color').trim(),
            errorColor: cs.getPropertyValue('--error-color').trim(),
            headerColor: cs.getPropertyValue('--header-color').trim(),
        };
    };

    async function openThemeEditor(mode, themeData = null, index = -1) {
        editorState = { mode, themeIndex: index, originalName: themeData ? themeData.name : '' };
        if (mode === 'edit' && themeData) {
            editorColors = { ...themeData.colors };
        } else {
            const active = await getActiveTheme();
            editorColors = active ? { ...active.colors } : getFallbackColors();
        }
        showThemeEditor = true;
        await tick();
        applyTranslations(document.getElementById('theme-editor-modal'));
    }

    /**
     * Closing puts back the theme that is really in use.
     *
     * Every colour dialled in the editor is painted on this page as a preview, and
     * leaving by the cross, by the backdrop or with Escape is not a decision to keep
     * it: the page used to stay dressed in a theme nobody had saved, which then looked
     * exactly like a theme that had been applied.
     */
    function closeThemeEditor() {
        showThemeEditor = false;
        initializeActiveTheme();
    }

    /**
     * Shows the colour being edited, on this page only.
     *
     * The preview used to be written into `activeTheme` and announced to every
     * page, so half-finished colours became the theme of the whole extension and
     * stayed that way. Painting the document here is enough to see the result, and
     * leaves the chosen theme untouched until the user actually applies one.
     */
    async function handleColorInput(e, key) {
        editorColors[key] = e.target.value;
        applyCustomTheme(editorColors);
    }

    /**
     * Makes a theme the chosen one: what this page shows, what the rest of the
     * extension is told about, and what deselecting it later comes back from.
     *
     * Shared by clicking a theme and by saving one, which now do the same thing —
     * saving a theme is choosing it, and the notice for it always said so.
     */
    async function selectTheme(theme) {
        // Remembered so deselecting or deleting the theme in use can go back to the
        // one before it; re-saving the theme already in use is not a change of theme.
        if (activeTheme && activeTheme.name !== theme.name) {
            await chrome.storage.local.set({ previousActiveTheme: activeTheme });
        }
        applyCustomTheme(theme.colors);
        await saveActiveTheme(theme);
        chrome.runtime.sendMessage({ action: 'themeChanged' });
    }

    async function saveEditedTheme() {
        const storage = chrome.storage[currentStorageArea];
        let { savedThemes: currentThemes = [] } = await storage.get('savedThemes');

        if (editorState.mode === 'edit') {
            if (currentThemes[editorState.themeIndex]) {
                const themeName = currentThemes[editorState.themeIndex].name;
                currentThemes[editorState.themeIndex].colors = editorColors;
                await storage.set({ savedThemes: currentThemes });
                // Updating a theme chooses it. Somebody who has just spent nine
                // colours on it is looking at the result and means to keep it, and
                // leaving it unchosen threw that away the moment the editor closed.
                await selectTheme(currentThemes[editorState.themeIndex]);
                showNotification('themeUpdatedSuccessfully', false, [themeName]);
            }
        } else {
            const maxThemes = currentStorageArea === 'sync' ? MAX_SYNC_THEMES : MAX_LOCAL_THEMES;
            if (currentThemes.length >= maxThemes) {
                const storageTypeName = localizedMsg(
                    currentStorageArea === 'sync' ? 'storageTypeSync' : 'storageTypeLocal',
                );
                showNotification('maxThemesReached', true, [maxThemes, storageTypeName]);
                closeThemeEditor();
                return;
            }

            const lang = await getCurrentLang();
            const messages = await loadMessages(lang);
            const defaultName = messages.themeDefaultName?.message || 'Theme';
            let nextThemeNumber = currentThemes.length + 1;
            let newThemeName;
            const existingNamesSet = new Set(currentThemes.map((t) => t.name.toLowerCase()));

            do {
                newThemeName = `${defaultName} ${nextThemeNumber}`;
                nextThemeNumber++;
            } while (existingNamesSet.has(newThemeName.toLowerCase()));

            const newTheme = { name: newThemeName, colors: editorColors };
            currentThemes.push(newTheme);
            await storage.set({ savedThemes: currentThemes });
            // Saving chooses it too, which is what the notice has always said:
            // "saved and applied".
            await selectTheme(newTheme);
            showNotification('customThemeSaved', false, [newThemeName]);
        }
        await fetchThemes();
        // Closing shows whatever is in use, which after saving is this very theme.
        closeThemeEditor();
    }

    async function randomTheme() {
        const rc = () =>
            `#${Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, '0')}`;
        editorColors = {
            actionColor: rc(),
            textColor: rc(),
            textOnColor: rc(),
            bgColor: rc(),
            bgPanelColor: rc(),
            borderColor: rc(),
            interactiveColor: rc(),
            errorColor: rc(),
            headerColor: rc(),
        };
        // Same as editing a colour by hand: a preview of this page, not a choice.
        applyCustomTheme(editorColors);
        showNotification('randomThemeApplied');
    }

    // --- Theme Item Actions ---
    /**
     * Drops the theme in use and goes back to the one chosen before it, or to the
     * default look when there was none. Shared by deselecting and by deleting,
     * which both leave the page without a theme to show.
     */
    async function revertToPreviousTheme(themeName) {
        const { previousActiveTheme } = await chrome.storage.local.get('previousActiveTheme');
        const fallback = previousActiveTheme && previousActiveTheme.name !== themeName ? previousActiveTheme : null;
        if (fallback) {
            await saveActiveTheme(fallback);
        } else {
            await chrome.storage.local.remove('activeTheme');
        }
        await chrome.storage.local.remove('previousActiveTheme');
        chrome.runtime.sendMessage({ action: 'themeChanged' });
        await initializeActiveTheme();
    }

    /**
     * Whether `theme` is the one in use. Sync and local can each hold a theme with the
     * same name, so the name alone is not enough: the colours must match too, the same
     * test the grid uses to mark the active card.
     */
    function isActiveTheme(theme) {
        return (
            !!activeTheme &&
            activeTheme.name === theme.name &&
            JSON.stringify(activeTheme.colors) === JSON.stringify(theme.colors)
        );
    }

    /**
     * Returns a predicate telling whether a schedule stored under a theme name belongs to
     * the theme of that name in the area being edited. Schedules record their area; old
     * ones without it are claimed only when the other area has no theme of that name, so
     * changing a local theme never touches a same-named sync theme's schedules.
     */
    async function scheduleBelongsHere(themeName) {
        const otherArea = currentStorageArea === 'sync' ? 'local' : 'sync';
        const { savedThemes: otherThemes = [] } = await chrome.storage[otherArea].get('savedThemes');
        const otherHasName = otherThemes.some((t) => t?.name === themeName);
        return (sch) => sch?.storageArea === currentStorageArea || (!sch?.storageArea && !otherHasName);
    }

    async function handleActivate(e) {
        const { theme } = e;
        // Clicking the theme already in use takes it off again.
        if (isActiveTheme(theme)) {
            await revertToPreviousTheme(theme.name);
            showNotification('themeDeselected', false, [theme.name]);
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            fetchThemes();
            return;
        }
        await selectTheme(theme);
        showNotification('themeApplied', false, [theme.name]);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        fetchThemes();
    }

    async function handleRename(e) {
        const { index, newName, oldName } = e;
        const otherNames = savedThemes.filter((_, i) => i !== index).map((t) => t.name.toLowerCase());
        if (otherNames.includes(newName.toLowerCase())) {
            showNotification('duplicateRuleNameInFile', true, [newName], true);
            fetchThemes(); // force re-render
            return;
        }

        const storage = chrome.storage[currentStorageArea];
        let { savedThemes: currentThemes = [] } = await storage.get('savedThemes');
        if (currentThemes[index]) {
            const wasActive = isActiveTheme(currentThemes[index]);
            currentThemes[index].name = newName;
            await storage.set({ savedThemes: currentThemes });

            // Only this area's schedules follow the new name; a same-named theme in the
            // other area keeps its own.
            const { schedules: scheds = {} } = await chrome.storage.local.get('schedules');
            if (Array.isArray(scheds[oldName])) {
                const belongs = await scheduleBelongsHere(oldName);
                const moving = scheds[oldName].filter(belongs);
                if (moving.length) {
                    const staying = scheds[oldName].filter((sch) => !belongs(sch));
                    scheds[newName] = [...(scheds[newName] || []), ...moving];
                    if (staying.length) scheds[oldName] = staying;
                    else delete scheds[oldName];
                    await chrome.storage.local.set({ schedules: scheds });
                    chrome.runtime.sendMessage({ action: 'schedulesUpdated' });
                }
            }
            // The theme in use is stored as a copy; without this it kept the old name, so
            // the card no longer showed as active and deselecting it misbehaved.
            if (wasActive) await saveActiveTheme(currentThemes[index]);
            showNotification('themeRenamed', false, [oldName, newName]);
            fetchThemes();
        }
    }

    async function handleDelete(e) {
        const { theme, index } = e;
        // One stray click on the cross took the theme and its schedules with no way back.
        const accepted = await confirmAction({
            messageKey: 'confirmDeleteTheme',
            params: [theme.name],
            confirmKey: 'delete',
        });
        if (!accepted) return;
        const storage = chrome.storage[currentStorageArea];
        let { savedThemes: currentThemes = [] } = await storage.get('savedThemes');
        currentThemes.splice(index, 1);
        await storage.set({ savedThemes: currentThemes });

        // Only this area's schedules go with the theme: sync and local can each hold a
        // theme of the same name, and deleting one must not unschedule the other.
        const { schedules: scheds = {} } = await chrome.storage.local.get('schedules');
        if (Array.isArray(scheds[theme.name])) {
            const belongs = await scheduleBelongsHere(theme.name);
            const remaining = scheds[theme.name].filter((sch) => !belongs(sch));
            if (remaining.length !== scheds[theme.name].length) {
                if (remaining.length) scheds[theme.name] = remaining;
                else delete scheds[theme.name];
                await chrome.storage.local.set({ schedules: scheds });
                chrome.runtime.sendMessage({ action: 'schedulesUpdated' });
            }
        }
        // A theme that no longer exists cannot stay in use: the look goes back to
        // the one chosen before it, or to the default when there was none.
        if (isActiveTheme(theme)) {
            await revertToPreviousTheme(theme.name);
        }

        showNotification('themeDeleted', false, [theme.name]);
        fetchThemes();
    }

    // --- Schedules ---
    async function openScheduleModalFor(themeName = null) {
        scheduleListFilter = themeName;
        currentThemeForScheduling = themeName ? { name: themeName } : null;
        resetScheduleForm();
        await fetchSchedules(themeName);
        showScheduleModal = true;
        await tick();
        applyTranslations(document.getElementById('schedule-modal'));
    }

    async function fetchSchedules(themeNameFilter = null) {
        const { schedules: allSchedules = {} } = await chrome.storage.local.get('schedules');
        // Only this storage area's schedules, the same ones the list shows.
        let count = 0;
        for (const tName in allSchedules) {
            if (!Array.isArray(allSchedules[tName])) continue;
            count += allSchedules[tName].filter(
                (sch) => !sch.storageArea || sch.storageArea === currentStorageArea,
            ).length;
        }
        totalScheduleCount = count;

        let s = [];
        if (themeNameFilter) {
            s = (allSchedules[themeNameFilter] || []).map((sch, i) => ({
                ...sch,
                originalIndex: i,
                themeName: themeNameFilter,
            }));
        } else {
            for (const [tName, tSchedules] of Object.entries(allSchedules)) {
                tSchedules.forEach((sch, i) => {
                    s.push({ ...sch, originalIndex: i, themeName: tName });
                });
            }
        }
        // Filter by current storage area
        schedules = s.filter((sch) => !sch.storageArea || sch.storageArea === currentStorageArea);
    }

    function resetScheduleForm() {
        selectedDays = [];
        scheduleType = 'onetime';
        allDay = false;
        scheduleReminder = '';
        startTimeTrigger = '00:00';
        endTimeTrigger = '00:00';
        startTimeOneTimeTrigger = '00:00';
        endTimeOneTimeTrigger = '00:00';
        startDateValue = '';
        endDateValue = '';
        scheduleError = '';
        scheduleEditorState = { mode: 'add', themeName: null, scheduleIndex: -1 };
    }

    function toggleDay(day) {
        if (selectedDays.includes(day)) {
            selectedDays = selectedDays.filter((d) => d !== day);
        } else {
            selectedDays = [...selectedDays, day];
        }
        scheduleType = selectedDays.length > 0 ? 'repeating' : 'onetime';
        scheduleError = '';
    }

    async function saveSchedule() {
        scheduleError = '';
        const { mode, themeName: editThemeName, scheduleIndex } = scheduleEditorState;
        const themeName = mode === 'edit' ? editThemeName : currentThemeForScheduling?.name;
        const reminder = scheduleReminder.trim();
        let newSchedule;

        if (scheduleType === 'repeating') {
            // "All day" fills the hours in itself, so there is nothing missing.
            if (allDay) {
                startTimeTrigger = '00:00';
                endTimeTrigger = '23:59';
            } else if (startTimeTrigger === '00:00' && endTimeTrigger === '00:00') {
                scheduleError = localizedMsg('scheduleTimeMissing') || 'scheduleTimeMissing';
                return false;
            }
            newSchedule = {
                type: 'repeating',
                allDay,
                // A plain array, not the reactive proxy: stored straight, it came back
                // out of chrome.storage as an object ({"0":1}) and the background
                // check does `schedule.days.includes(today)`, which then threw and
                // stopped every theme schedule from ever firing.
                days: [...$state.snapshot(selectedDays)],
                startTime: startTimeTrigger,
                endTime: endTimeTrigger,
                reminder,
                storageArea: currentStorageArea,
            };
        } else {
            if (!startDateValue || !endDateValue) {
                scheduleError = localizedMsg('scheduleDateTimeMissing') || 'scheduleDateTimeMissing';
                return false;
            }
            const startDateTime = `${startDateValue}T${startTimeOneTimeTrigger}`;
            const endDateTime = `${endDateValue}T${endTimeOneTimeTrigger}`;
            if (new Date(startDateTime) >= new Date(endDateTime)) {
                scheduleError = localizedMsg('scheduleEndBeforeStartDateTime') || 'scheduleEndBeforeStartDateTime';
                return false;
            }
            if (new Date(startDateTime) < new Date(Date.now() - 60000)) {
                scheduleError = localizedMsg('scheduleDateTimeInPast') || 'scheduleDateTimeInPast';
                return false;
            }
            newSchedule = { type: 'onetime', startDateTime, endDateTime, reminder, storageArea: currentStorageArea };
        }

        const { schedules: allSchedules = {} } = await chrome.storage.local.get('schedules');
        const themeSchedules = allSchedules[themeName] || [];
        if (mode === 'add') themeSchedules.push(newSchedule);
        else themeSchedules.splice(scheduleIndex, 1, newSchedule);
        allSchedules[themeName] = themeSchedules;
        await chrome.storage.local.set({ schedules: allSchedules });
        chrome.runtime.sendMessage({ action: 'schedulesUpdated' });
        // Both messages name the theme through $1; without the parameter the notice
        // read "Schedule added for theme $1".
        showNotification(mode === 'add' ? 'scheduleAdded' : 'scheduleUpdated', false, [themeName]);
        resetScheduleForm();
        leaveScheduleEditor();
        fetchSchedules(scheduleListFilter);
        return true;
    }

    /** Back to the dialog as it was opened, once the schedule being edited is done with. */
    function leaveScheduleEditor() {
        currentThemeForScheduling = scheduleListFilter ? { name: scheduleListFilter } : null;
    }

    async function handleDeleteSchedule(themeName, index) {
        const { schedules: allSchedules = {} } = await chrome.storage.local.get('schedules');
        if (!allSchedules[themeName]) return;
        // The indexes of this theme shift, so a schedule open in the editor would be
        // saved over the wrong one.
        if (scheduleEditorState.mode === 'edit' && scheduleEditorState.themeName === themeName) {
            resetScheduleForm();
            leaveScheduleEditor();
        }
        allSchedules[themeName].splice(index, 1);
        if (allSchedules[themeName].length === 0) delete allSchedules[themeName];
        await chrome.storage.local.set({ schedules: allSchedules });
        chrome.runtime.sendMessage({ action: 'schedulesUpdated' });
        showNotification('scheduleDeleted', false);
        fetchSchedules(scheduleListFilter);
    }

    async function handleEditSchedule(sch) {
        resetScheduleForm();
        currentThemeForScheduling = { name: sch.themeName };
        scheduleEditorState = { mode: 'edit', themeName: sch.themeName, scheduleIndex: sch.originalIndex };
        if (sch.type === 'repeating') {
            selectedDays = [...(sch.days || [])];
            scheduleType = 'repeating';
            startTimeTrigger = sch.startTime || '00:00';
            endTimeTrigger = sch.endTime || '00:00';
            allDay = sch.allDay === true || (sch.startTime === '00:00' && sch.endTime === '23:59');
        } else {
            scheduleType = 'onetime';
            const [sD, sT] = (sch.startDateTime || '').split('T');
            const [eD, eT] = (sch.endDateTime || '').split('T');
            startDateValue = sD || '';
            startTimeOneTimeTrigger = sT || '00:00';
            endDateValue = eD || '';
            endTimeOneTimeTrigger = eT || '00:00';
        }
        scheduleReminder = sch.reminder || '';
    }

    function formatDateTime(isoString) {
        const date = new Date(isoString);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min}`;
    }

    function getDayNames(days) {
        const dNames = [
            localizedMsg('daySun') || 'Sun',
            localizedMsg('dayMon') || 'Mon',
            localizedMsg('dayTue') || 'Tue',
            localizedMsg('dayWed') || 'Wed',
            localizedMsg('dayThu') || 'Thu',
            localizedMsg('dayFri') || 'Fri',
            localizedMsg('daySat') || 'Sat',
        ];
        const sorted = [...days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
        return sorted.map((d) => dNames[d]).join(', ');
    }

    // --- Drag and Drop Repositioning ---
    let draggedIndex = -1;
    function handleItemDragStart(e, idx) {
        draggedIndex = idx;
    }
    async function handleItemDrop(e, dropIdx) {
        if (draggedIndex !== -1 && draggedIndex !== dropIdx) {
            const storage = chrome.storage[currentStorageArea];
            let { savedThemes: currentThemes = [] } = await storage.get('savedThemes');
            const [item] = currentThemes.splice(draggedIndex, 1);
            currentThemes.splice(dropIdx, 0, item);
            await storage.set({ savedThemes: currentThemes });
            await fetchThemes();
        }
        draggedIndex = -1;
    }

    // --- Import / Export ---
    async function exportAllThemes() {
        const utils = { showNotification };
        await exportThemes(savedThemes, `itg-themes-${currentStorageArea}.json`, utils);
    }
    function handleThemeFileImport(file) {
        if (!file) return;
        if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
            showNotification('invalidJsonFile', true);
            return;
        }
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                const themesToImport = Array.isArray(importedData) ? importedData : [importedData];
                const storage = chrome.storage[currentStorageArea];
                const maxThemes = currentStorageArea === 'sync' ? MAX_SYNC_THEMES : MAX_LOCAL_THEMES;
                const utils = { showNotification, getCurrentLang, loadMessages };
                const result = await processAndSaveImportedThemes(themesToImport, storage, maxThemes, utils);
                if (result.success) {
                    if (result.importedCount === 1) {
                        const importedTheme = result.themes[0];
                        applyCustomTheme(importedTheme.colors);
                        saveActiveTheme(importedTheme);
                        showNotification('themeImportedAndSaved', false, [importedTheme.name], true);
                        chrome.runtime.sendMessage({ action: 'themeChanged' });
                    } else {
                        showNotification(
                            pluralKey('themesImportedSuccessfully', result.importedCount),
                            false,
                            [result.importedCount],
                            true,
                        );
                    }
                    await fetchThemes();
                }
            } catch (error) {
                console.error('Error importing:', error);
                showNotification('errorImportingThemesInvalidFormat', true, true);
            } finally {
                showImportPanel = false;
                tick().then(() => applyTranslations(mainContainerEl));
            }
        };
        reader.readAsText(file);
    }
</script>

<!--
    The container is hidden rather than removed while the import panel is open:
    unmounting it would drop the text applied by applyTranslations() and the page
    would come back blank.
-->
<div class="container" style:display={showImportPanel ? 'none' : null} bind:this={mainContainerEl}>
    <SavedThemesToolbar
        {currentStorageArea}
        onSetStorageArea={setStorageArea}
        onNavigate={navigateTo}
        onCreateTheme={() => openThemeEditor('create')}
        onOpenSchedule={() => openScheduleModalFor()}
        onExportThemes={exportAllThemes}
        onOpenImport={() => (showImportPanel = true)}
    />

    <main>
        <SavedThemesGrid
            {savedThemes}
            {activeTheme}
            onactivate={handleActivate}
            onrename={handleRename}
            ondelete={handleDelete}
            onedit={(theme, i) => openThemeEditor('edit', theme, i)}
            onschedule={(themeName) => openScheduleModalFor(themeName)}
            onitemdragstart={(event, i) => handleItemDragStart(event, i)}
            ondrop={(e, i) => handleItemDrop(e, i)}
        />

        <SavedThemesFooter
            {syncThemesCount}
            {localThemesCount}
            maxSyncThemes={MAX_SYNC_THEMES}
            maxLocalThemes={MAX_LOCAL_THEMES}
        />
    </main>
</div>
<ImportPanel
    show={showImportPanel}
    sectionId="drag-drop-panel"
    headerClass="header"
    headerTag="h1"
    titleKey="importTheme"
    titleClass="title-import-themes"
    cancelButtonId="cancel-import"
    cancelClass="button"
    dropTextKey="dragDropTheme"
    selectFileKey="selectThemeFile"
    fileInputId="theme-file-input"
    cancelTitleKey="cancelThemeImport"
    onback={() => (showImportPanel = false)}
    onfile={handleThemeFileImport}
/>

<!-- THEME EDITOR MODAL -->
<ThemeEditorModal
    show={showThemeEditor}
    {editorState}
    bind:editorColors
    onClose={() => closeThemeEditor()}
    onSave={saveEditedTheme}
    onRandom={randomTheme}
    onColorInput={handleColorInput}
/>

<!-- SCHEDULE MODAL -->
<ThemeScheduleModal
    show={showScheduleModal}
    {currentThemeForScheduling}
    {totalScheduleCount}
    {schedules}
    {scheduleEditorState}
    {selectedDays}
    {scheduleType}
    bind:allDay
    bind:scheduleReminder
    bind:startDateValue
    bind:endDateValue
    bind:startTimeTrigger
    bind:endTimeTrigger
    bind:startTimeOneTimeTrigger
    bind:endTimeOneTimeTrigger
    bind:scheduleError
    {MAX_GLOBAL_SCHEDULES}
    onClose={() => (showScheduleModal = false)}
    onEditSchedule={handleEditSchedule}
    onDeleteSchedule={handleDeleteSchedule}
    onToggleDay={toggleDay}
    onSaveSchedule={saveSchedule}
    onResetForm={resetScheduleForm}
    onFetchSchedules={() => fetchSchedules(scheduleListFilter)}
    {formatDateTime}
    {getDayNames}
/>

<ConfirmDialog />
