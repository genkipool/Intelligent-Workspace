<script>
    import { onMount, tick } from 'svelte';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    import DateField from '../../components/common/DateField.svelte';
    import TimeField from '../../components/common/TimeField.svelte';
    import ConfirmDialog from '../../components/common/ConfirmDialog.svelte';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import ThemeCard from './ThemeCard.svelte';
    import {
        initializeTranslations,
        showNotification,
        applyTranslations,
        getCurrentLang,
        loadMessages,
    } from '../../../utils/i18n.js';
    import { bindModalSaveButton } from '../../../utils/modal-save-close.js';
    import { initializeActiveTheme, applyCustomTheme, getActiveTheme, saveActiveTheme } from '../../../utils/theme.js';
    import { initializeKeyboardNavigation } from '../../../utils/keyboardNav.js';
    import { exportThemes, processAndSaveImportedThemes } from '../../../utils/importExport.js';
    import { prefetchUrl } from '../../services/prefetchService.js';
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
    let totalScheduleCount = $state(0);
    let scheduleEditorState = $state({ mode: 'add', themeName: null, scheduleIndex: -1 });

    let selectedDays = $state([]);
    let scheduleType = 'onetime'; // 'onetime' | 'repeating'
    let scheduleReminder = $state('');

    // Custom Datetime pickers state
    let startTimeTrigger = $state('00:00');
    let endTimeTrigger = $state('00:00');
    let startTimeOneTimeTrigger = $state('00:00');
    let endTimeOneTimeTrigger = $state('00:00');
    let startDateTrigger = $state('YYYY-MM-DD');
    let endDateTrigger = $state('YYYY-MM-DD');

    let scheduleError = $state('');

    // Popup states
    let calendarPopupVisible = $state(false);
    let timePopupVisible = $state(false);
    let currentCalendarTarget = $state('start');
    let activeTriggerType = null; // e.g. 'startTimeOneTime'
    let activeTriggerEl = null;

    let calCurrentDate = $state(new Date());
    let calSelectedStartDate = $state(null);
    let calSelectedEndDate = $state(null);

    let inputHour = $state('00');
    let inputMinute = $state('00');

    let calendarPopupStyle = $state('');
    let timePopupStyle = $state('');
    let calendarPopupEl = $state();
    let timePopupEl = $state();

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
                if (showScheduleModal) fetchSchedules(currentThemeForScheduling?.name);
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

    function closeThemeEditor() {
        showThemeEditor = false;
    }

    async function handleColorInput(e, key) {
        editorColors[key] = e.target.value;
        applyCustomTheme(editorColors);
        const previewTheme = { name: 'Theme Preview', colors: editorColors };
        await saveActiveTheme(previewTheme);
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
                await saveActiveTheme(currentThemes[editorState.themeIndex]);
                showNotification('themeUpdatedSuccessfully', false, [themeName]);
            }
        } else {
            const maxThemes = currentStorageArea === 'sync' ? MAX_SYNC_THEMES : MAX_LOCAL_THEMES;
            if (currentThemes.length >= maxThemes) {
                const storageTypeName = chrome.i18n.getMessage(
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
            await saveActiveTheme(newTheme);
            showNotification('customThemeSaved', false, [newThemeName]);
        }
        await fetchThemes();
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
        applyCustomTheme(editorColors);
        const previewTheme = { name: 'Theme Preview', colors: editorColors };
        await saveActiveTheme(previewTheme);
        chrome.runtime.sendMessage({ action: 'themeChanged' });
        showNotification('randomThemeApplied');
    }

    // --- Theme Item Actions ---
    async function handleActivate(e) {
        const { theme } = e;
        applyCustomTheme(theme.colors);
        saveActiveTheme(theme);
        showNotification('themeApplied', false, [theme.name]);
        chrome.runtime.sendMessage({ action: 'themeChanged' });
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
            currentThemes[index].name = newName;
            await storage.set({ savedThemes: currentThemes });

            const { schedules: scheds = {} } = await chrome.storage.local.get('schedules');
            if (scheds[oldName]) {
                scheds[newName] = scheds[oldName];
                delete scheds[oldName];
                await chrome.storage.local.set({ schedules: scheds });
            }
            showNotification('themeRenamed', false, [oldName, newName]);
            fetchThemes();
        }
    }

    async function handleDelete(e) {
        const { theme, index } = e;
        const storage = chrome.storage[currentStorageArea];
        let { savedThemes: currentThemes = [] } = await storage.get('savedThemes');
        currentThemes.splice(index, 1);
        await storage.set({ savedThemes: currentThemes });

        const { schedules: scheds = {} } = await chrome.storage.local.get('schedules');
        if (scheds[theme.name]) {
            delete scheds[theme.name];
            await chrome.storage.local.set({ schedules: scheds });
            chrome.runtime.sendMessage({ action: 'schedulesUpdated' });
        }
        showNotification('themeDeleted', false, [theme.name]);
        fetchThemes();
    }

    // --- Schedules ---
    async function openScheduleModalFor(themeName = null) {
        hidePopups();
        if (themeName) {
            currentThemeForScheduling = { name: themeName };
        } else {
            currentThemeForScheduling = null;
        }
        resetScheduleForm();
        await fetchSchedules(themeName);
        showScheduleModal = true;
        await tick();
        applyTranslations(document.getElementById('schedule-modal'));
    }

    async function fetchSchedules(themeNameFilter = null) {
        const { schedules: allSchedules = {} } = await chrome.storage.local.get('schedules');
        let count = 0;
        for (const tName in allSchedules) {
            if (Array.isArray(allSchedules[tName])) count += allSchedules[tName].length;
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
        scheduleReminder = '';
        startTimeTrigger = '00:00';
        endTimeTrigger = '00:00';
        startTimeOneTimeTrigger = '00:00';
        endTimeOneTimeTrigger = '00:00';
        startDateTrigger = 'YYYY-MM-DD';
        endDateTrigger = 'YYYY-MM-DD';
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
        const themeName = mode === 'edit' ? editThemeName : currentThemeForScheduling.name;
        const reminder = scheduleReminder.trim();
        let newSchedule;

        if (scheduleType === 'repeating') {
            if (startTimeTrigger === '00:00' && endTimeTrigger === '00:00') {
                scheduleError = chrome.i18n.getMessage('scheduleTimeMissing') || 'scheduleTimeMissing';
                return false;
            }
            newSchedule = {
                type: 'repeating',
                days: selectedDays,
                startTime: startTimeTrigger,
                endTime: endTimeTrigger,
                reminder,
                storageArea: currentStorageArea,
            };
        } else {
            if (startDateTrigger === 'YYYY-MM-DD' || endDateTrigger === 'YYYY-MM-DD') {
                scheduleError = chrome.i18n.getMessage('scheduleDateTimeMissing') || 'scheduleDateTimeMissing';
                return false;
            }
            const startDateTime = `${startDateTrigger}T${startTimeOneTimeTrigger}`;
            const endDateTime = `${endDateTrigger}T${endTimeOneTimeTrigger}`;
            if (new Date(startDateTime) >= new Date(endDateTime)) {
                scheduleError =
                    chrome.i18n.getMessage('scheduleEndBeforeStartDateTime') || 'scheduleEndBeforeStartDateTime';
                return false;
            }
            if (new Date(startDateTime) < new Date(Date.now() - 60000)) {
                scheduleError = chrome.i18n.getMessage('scheduleDateTimeInPast') || 'scheduleDateTimeInPast';
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
        showNotification(mode === 'add' ? 'scheduleAdded' : 'scheduleUpdated', false);
        return true;
    }

    async function handleDeleteSchedule(themeName, index) {
        const { schedules: allSchedules = {} } = await chrome.storage.local.get('schedules');
        if (!allSchedules[themeName]) return;
        allSchedules[themeName].splice(index, 1);
        if (allSchedules[themeName].length === 0) delete allSchedules[themeName];
        await chrome.storage.local.set({ schedules: allSchedules });
        chrome.runtime.sendMessage({ action: 'schedulesUpdated' });
        showNotification('scheduleDeleted', false);
        fetchSchedules(currentThemeForScheduling?.name);
    }

    async function handleEditSchedule(sch) {
        resetScheduleForm();
        scheduleEditorState = { mode: 'edit', themeName: sch.themeName, scheduleIndex: sch.originalIndex };
        if (sch.type === 'repeating') {
            selectedDays = [...sch.days];
            scheduleType = 'repeating';
            startTimeTrigger = sch.startTime;
            endTimeTrigger = sch.endTime;
        } else {
            scheduleType = 'onetime';
            const [sD, sT] = sch.startDateTime.split('T');
            const [eD, eT] = sch.endDateTime.split('T');
            startDateTrigger = sD;
            startTimeOneTimeTrigger = sT;
            endDateTrigger = eD;
            endTimeOneTimeTrigger = eT;
        }
        scheduleReminder = sch.reminder || '';
    }

    // The shared date field stores an empty string for "no date"; the page's own
    // schedule code still speaks the placeholder form.
    let startDateValue = $state('');
    let endDateValue = $state('');
    $effect(() => {
        startDateTrigger = startDateValue || 'YYYY-MM-DD';
        calSelectedStartDate = startDateValue ? new Date(`${startDateValue}T00:00`) : null;
    });
    $effect(() => {
        endDateTrigger = endDateValue || 'YYYY-MM-DD';
        calSelectedEndDate = endDateValue ? new Date(`${endDateValue}T00:00`) : null;
    });

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
            chrome.i18n.getMessage('daySun') || 'Sun',
            chrome.i18n.getMessage('dayMon') || 'Mon',
            chrome.i18n.getMessage('dayTue') || 'Tue',
            chrome.i18n.getMessage('dayWed') || 'Wed',
            chrome.i18n.getMessage('dayThu') || 'Thu',
            chrome.i18n.getMessage('dayFri') || 'Fri',
            chrome.i18n.getMessage('daySat') || 'Sat',
        ];
        const sorted = [...days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
        return sorted.map((d) => dNames[d]).join(', ');
    }

    // --- Popups (Calendar / Time) ---
    function hidePopups() {
        calendarPopupVisible = false;
        timePopupVisible = false;
        activeTriggerType = null;
        activeTriggerEl = null;
    }

    function updatePopupPosition() {
        if (!activeTriggerEl) return;
        const rect = activeTriggerEl.getBoundingClientRect();
        let el = calendarPopupVisible ? calendarPopupEl : timePopupVisible ? timePopupEl : null;
        if (!el) return;
        const popupWidth = el.offsetWidth;
        const popupHeight = el.offsetHeight;
        const padding = 5;
        let top = rect.bottom + padding;
        if (top + popupHeight > window.innerHeight) top = rect.top - popupHeight - padding;
        let left = rect.left;
        if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - padding;
        const style = `position: fixed; top: ${top}px; left: ${Math.max(padding, left)}px;`;
        if (calendarPopupVisible) calendarPopupStyle = style;
        else if (timePopupVisible) timePopupStyle = style;
    }

    function toggleCalendar(target, type, e) {
        if (calendarPopupVisible && activeTriggerType === type) {
            hidePopups();
            return;
        }
        hidePopups();
        currentCalendarTarget = target;
        activeTriggerType = type;
        activeTriggerEl = e.currentTarget;
        calendarPopupVisible = true;
        tick().then(updatePopupPosition);
    }

    function toggleTimePicker(type, currentVal, e) {
        if (timePopupVisible && activeTriggerType === type) {
            hidePopups();
            return;
        }
        hidePopups();
        activeTriggerType = type;
        activeTriggerEl = e.currentTarget;
        let [h, m] = currentVal.split(':');
        if (currentVal === '00:00') {
            const now = new Date();
            h = String(now.getHours()).padStart(2, '0');
            m = String(now.getMinutes()).padStart(2, '0');
        }
        inputHour = h || '00';
        inputMinute = m || '00';
        timePopupVisible = true;
        tick().then(updatePopupPosition);
    }

    function selectDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const formatted = `${y}-${m}-${day}`;
        if (currentCalendarTarget === 'start') {
            calSelectedStartDate = d;
            startDateTrigger = formatted;
        } else {
            calSelectedEndDate = d;
            endDateTrigger = formatted;
        }
        hidePopups();
        scheduleError = '';
    }

    function generateCalendarDays(currentDate, selectedDate) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const today = new Date();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let days = [];
        for (let i = 0; i < firstDay; i++) days.push({ empty: true });

        for (let day = 1; day <= daysInMonth; day++) {
            const isPast =
                year < today.getFullYear() ||
                (year === today.getFullYear() && month < today.getMonth()) ||
                (year === today.getFullYear() && month === today.getMonth() && day < today.getDate());
            const isToday = today.getMonth() === month && today.getFullYear() === year && day === today.getDate();
            const isSelected =
                selectedDate &&
                day === selectedDate.getDate() &&
                month === selectedDate.getMonth() &&
                year === selectedDate.getFullYear();

            days.push({ day, isPast, isToday, isSelected, dateObj: new Date(year, month, day) });
        }
        return days;
    }

    function updateTime() {
        let h = inputHour.replace(/\D/g, '');
        let m = inputMinute.replace(/\D/g, '');
        if (h !== '' && parseInt(h) > 23) h = '23';
        if (m !== '' && parseInt(m) > 59) m = '59';
        const display = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
        if (activeTriggerType === 'startOneTime') startTimeOneTimeTrigger = display;
        else if (activeTriggerType === 'endOneTime') endTimeOneTimeTrigger = display;
        else if (activeTriggerType === 'startRep') startTimeTrigger = display;
        else if (activeTriggerType === 'endRep') endTimeTrigger = display;
        scheduleError = '';
    }

    function handleTimeArrow(unit, dir) {
        if (unit === 'hour') {
            let val = parseInt(inputHour) || 0;
            val = dir === 'up' ? (val + 1) % 24 : (val - 1 + 24) % 24;
            inputHour = val.toString().padStart(2, '0');
        } else {
            let val = parseInt(inputMinute) || 0;
            val = dir === 'up' ? (val + 1) % 60 : (val - 1 + 60) % 60;
            inputMinute = val.toString().padStart(2, '0');
        }
        updateTime();
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
                        showNotification('themesImportedSuccessfully', false, [result.importedCount], true);
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

<svelte:window
    onresize={updatePopupPosition}
    onclick={(e) => {
        if (
            calendarPopupVisible &&
            calendarPopupEl &&
            !calendarPopupEl.contains(e.target) &&
            !e.target.closest('.custom-input-trigger')
        )
            hidePopups();
        if (timePopupVisible && timePopupEl && !timePopupEl.contains(e.target) && !e.target.closest('.time-trigger'))
            hidePopups();
    }}
/>

<!--
    The container is hidden rather than removed while the import panel is open:
    unmounting it would drop the text applied by applyTranslations() and the page
    would come back blank.
-->
<div
    class="container"
    style:display={showImportPanel ? 'none' : null}
    bind:this={mainContainerEl}
    onscroll={updatePopupPosition}
>
    <div class="sticky-header">
        <header class="header">
            <h1 data-i18n="savedThemes"></h1>
            <div class="header-actions">
                <button
                    id="storage-sync-btn"
                    class="storage-btn {currentStorageArea === 'sync' ? 'active' : ''}"
                    data-i18n-title="storageSyncSavedLimit"
                    onclick={() => setStorageArea('sync')}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        ><path
                            d="M12 16v-6m0 0-3 2m3-2 3 2m8 3a4 4 0 0 0-4.07-4A7.002 7.002 0 0 0 5.669 9.01 5 5 0 0 0 6 19h13a4 4 0 0 0 4-4"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        /></svg
                    >
                </button>
                <button
                    id="storage-local-btn"
                    class="storage-btn {currentStorageArea === 'local' ? 'active' : ''}"
                    data-i18n-title="storageLocalSavedLimit"
                    onclick={() => setStorageArea('local')}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        ><path
                            d="m13 7-1.116-2.231c-.32-.642-.481-.963-.72-1.198a2 2 0 0 0-.748-.462C10.1 3 9.74 3 9.022 3H5.2c-1.12 0-1.68 0-2.108.218a2 2 0 0 0-.874.874C2 4.52 2 5.08 2 6.2V7m0 0h15.2c1.68 0 2.52 0 3.162.327a3 3 0 0 1 1.311 1.311C22 9.28 22 10.12 22 11.8v4.4c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311C19.72 21 18.88 21 17.2 21H6.8c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311C2 18.72 2 17.88 2 16.2zm7 7 3 3m0 0 3-3m-3 3v-6"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        /></svg
                    >
                </button>
                <button
                    id="list-group-toggle"
                    class="rules-button"
                    data-i18n-title="listTabGroups"
                    onclick={() => navigateTo('../listGroup/listGroup.html')}
                >
                    <svg width="20" height="20" viewBox="0 0 512 512" fill="var(--text-color)"
                        ><path
                            d="M136 24H16v120h120Zm-32 88H48V56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm72-440.002h320v32H176zm0 88h256v32H176zm0 88h320v32H176zm0 88h256v32H176zm0 176h256v32H176zm0-88h320v32H176z"
                        /></svg
                    >
                </button>
                <button
                    id="rules-toggle"
                    class="rules-button"
                    data-i18n-title="openRulesPage"
                    onclick={() => navigateTo('../rules/rules.html')}
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-color)"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><circle cx="2.5" cy="4" r="1.5" fill="var(--text-color)"></circle><circle
                            cx="2.5"
                            cy="12"
                            r="1.5"
                            fill="var(--text-color)"
                        ></circle><circle cx="2.5" cy="20" r="1.5" fill="var(--text-color)"></circle><path
                            d="M9 4h13"
                            stroke-width="3"
                        ></path><path d="M9 12h13" stroke-width="3"></path><path d="M9 20h13" stroke-width="3"
                        ></path></svg
                    >
                </button>
                <button
                    id="home-btn"
                    class="home-button"
                    type="button"
                    data-i18n-title="backToHome"
                    onclick={() => navigateTo('../popup/popup.html')}
                >
                    <svg width="20" height="20" viewBox="2 2 20 20" fill="var(--text-color)"
                        ><path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="m12 3.188 9.45 7.087-.45 1.35h-.75v8.625H3.75v-8.625H3l-.45-1.35zm-6.75 6.937v8.625h13.5v-8.625L12 5.063z"
                        /></svg
                    >
                </button>
            </div>
        </header>
        <div class="theme-actions-container">
            <button
                id="create-theme-btn"
                class="theme-action"
                data-i18n="createThemeTitle"
                onclick={() => openThemeEditor('create')}
            ></button>
            <button
                id="view-all-schedules-btn"
                class="theme-action"
                data-i18n="scheduleThemes"
                onclick={() => openScheduleModalFor()}
            ></button>
            <button id="export-themes-btn" class="theme-action" data-i18n="export" onclick={exportAllThemes}></button>
            <button
                id="import-themes-btn"
                class="theme-action"
                data-i18n="import"
                onclick={() => (showImportPanel = true)}
            ></button>
        </div>
    </div>

    <main onscroll={updatePopupPosition}>
        <div id="saved-themes-grid" class="saved-themes-grid">
            {#if savedThemes.length === 0}
                <p id="no-saved-themes-message" class="no-themes-message" data-i18n="noSavedThemes"></p>
            {/if}
            {#each savedThemes as theme, i (theme.name + i)}
                <ThemeCard
                    {theme}
                    index={i}
                    isActive={activeTheme &&
                        activeTheme.name === theme.name &&
                        JSON.stringify(activeTheme.colors) === JSON.stringify(theme.colors)}
                    onactivate={handleActivate}
                    onrename={handleRename}
                    ondelete={handleDelete}
                    onedit={() => openThemeEditor('edit', theme, i)}
                    onschedule={() => openScheduleModalFor(theme.name)}
                    onitemdragstart={({ event }) => handleItemDragStart(event, i)}
                    ondrop={(e) => handleItemDrop(e, i)}
                    ondragover={(e) => e.preventDefault()}
                />
            {/each}
        </div>

        <div class="main-footer-wrapper">
            <footer class="storage-info-footer">
                <span id="storage-limits-info"
                    >{`Sync: ${syncThemesCount}/${MAX_SYNC_THEMES} | Local: ${localThemesCount}/${MAX_LOCAL_THEMES}`}</span
                >
            </footer>
            <a
                href="#"
                id="about-link-saved-themes"
                class="footer-link"
                onclick={(e) => {
                    e.preventDefault();
                    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/about/about.html') });
                }}
            >
                <footer class="footer">
                    <div>Intelligent Workspace v1.0.0</div>
                    <div class="color-dots">
                        {#each ['#5F6368', '#1A73E8', '#D93025', '#F9AB00', '#188038', '#D01884', '#A142F4', '#007B83', '#FA903E'] as color}
                            <div class="color-dot" style="background-color: {color};"></div>
                        {/each}
                    </div>
                    <div data-i18n="developedBy"></div>
                </footer>
            </a>
        </div>
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
{#if showThemeEditor}
    <div
        id="theme-editor-modal"
        class="modal-overlay"
        style="display: flex;"
        use:dismissOnBackdrop={() => closeThemeEditor()}
    >
        <div class="modal-content">
            <section class="section" style="border-bottom: none; padding-bottom: 0;">
                <div class="section-title">
                    <span
                        id="theme-editor-title"
                        class="createThemeTitle"
                        data-i18n={editorState.mode === 'edit' ? 'editThemeTitle' : 'createThemeTitle'}
                    ></span>
                    <button id="close-theme-editor-btn" class="close-button" onclick={closeThemeEditor}>x</button>
                </div>
                <div class="color-options">
                    {#each [{ id: 'bg-color', k: 'bgColor', l: 'bgColor' }, { id: 'bg-panel-color', k: 'bgPanelColor', l: 'bgPanelColor' }, { id: 'text-color', k: 'textColor', l: 'textColor' }, { id: 'text-on-color', k: 'textOnColor', l: 'textOnColor' }, { id: 'action-color', k: 'actionColor', l: 'actionColor' }, { id: 'interactive-color', k: 'interactiveColor', l: 'interactiveColor' }, { id: 'border-color', k: 'borderColor', l: 'borderColor' }, { id: 'error-color', k: 'errorColor', l: 'errorColor' }, { id: 'header-color', k: 'headerColor', l: 'headerColor' }] as colorInput}
                        <div class="color-option">
                            <label for={colorInput.id} data-i18n={colorInput.l}></label>
                            <input
                                type="color"
                                id={colorInput.id}
                                value={editorColors[colorInput.k]}
                                oninput={(e) => handleColorInput(e, colorInput.k)}
                            />
                        </div>
                    {/each}
                    <div class="color-option">
                        <label for="random-theme" data-i18n="randomTheme"></label>
                        <button
                            id="random-theme-btn"
                            class="button button-random"
                            data-i18n="randomTheme"
                            onclick={randomTheme}
                        ></button>
                    </div>
                </div>
                <button
                    id="save-edited-theme-btn"
                    class="button button-save"
                    type="button"
                    data-i18n={editorState.mode === 'edit' ? 'updateCustomTheme' : 'saveCustomTheme'}
                    onclick={saveEditedTheme}
                ></button>
            </section>
        </div>
    </div>
{/if}

<!-- SCHEDULE MODAL -->
{#if showScheduleModal}
    <div
        id="schedule-modal"
        class="modal-overlay"
        style="display: flex;"
        use:dismissOnBackdrop={() => (showScheduleModal = false)}
        onscroll={updatePopupPosition}
    >
        <div class="modal-content">
            <section class="section">
                <div class="section-title">
                    <span
                        id="schedule-modal-title"
                        class="createThemeTitle"
                        data-i18n={currentThemeForScheduling ? '' : 'scheduleThemes'}
                        >{currentThemeForScheduling ? currentThemeForScheduling.name : ''}</span
                    >
                    <button id="close-schedule-modal" class="close-button" onclick={() => (showScheduleModal = false)}
                        >x</button
                    >
                </div>
                <h3 class="titleSchedules">
                    <span data-i18n="existingSchedules"></span> (<span id="schedule-count">{totalScheduleCount}</span
                    >/7)
                </h3>
                <ul id="schedules-list">
                    {#each schedules as sch, i}
                        <li class="schedule-item" tabindex="0">
                            <span class="schedule-type-indicator"
                                >{sch.type === 'onetime'
                                    ? chrome.i18n.getMessage('scheduleTypeDate') || 'Date'
                                    : chrome.i18n.getMessage('scheduleTypeTime') || 'Time'}</span
                            >
                            <div class="schedule-details">
                                <span class="schedule-theme-name">{sch.themeName}</span>
                                <div class="schedule-time-details">
                                    {#if sch.type === 'onetime'}
                                        <div class="schedule-date-row">
                                            <span>{chrome.i18n.getMessage('scheduleFrom') || 'From:'}</span>
                                            <span>{formatDateTime(sch.startDateTime)}</span>
                                        </div>
                                        <div class="schedule-date-row">
                                            <span>{chrome.i18n.getMessage('scheduleTo') || 'To:'}</span>
                                            <span>{formatDateTime(sch.endDateTime)}</span>
                                        </div>
                                    {:else}
                                        <span>{getDayNames(sch.days)}: {sch.startTime} - {sch.endTime}</span>
                                    {/if}
                                </div>
                                {#if sch.reminder}
                                    <div class="schedule-reminder-text" title={sch.reminder}>{sch.reminder}</div>
                                {/if}
                            </div>
                            <button
                                class="edit-schedule-btn"
                                data-i18n-title="editSchedule"
                                aria-label="Edit schedule"
                                onclick={() => handleEditSchedule(sch)}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    ><path
                                        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path><path
                                        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 9.5-9.5z"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path></svg
                                >
                            </button>
                            <button
                                class="delete-schedule-btn"
                                data-i18n-title="deleteSchedule"
                                aria-label="Delete schedule"
                                onclick={() => handleDeleteSchedule(sch.themeName, sch.originalIndex)}>x</button
                            >
                        </li>
                    {/each}
                </ul>
                {#if schedules.length === 0}
                    <p id="no-schedules-message" data-i18n="noSchedulesFound"></p>
                {/if}

                {#if currentThemeForScheduling && (totalScheduleCount < MAX_GLOBAL_SCHEDULES || scheduleEditorState.mode === 'edit')}
                    <div id="add-schedule-section">
                        <h3
                            id="schedule-form-title"
                            data-i18n={scheduleEditorState.mode === 'edit' ? 'editScheduleTitle' : 'addNewSchedule'}
                        ></h3>

                        <div class="form-group">
                            <label data-i18n="daysOfWeek"></label>
                            <div id="schedule-days" class="days-selector">
                                {#each [{ d: 1, k: 'dayMon' }, { d: 2, k: 'dayTue' }, { d: 3, k: 'dayWed' }, { d: 4, k: 'dayThu' }, { d: 5, k: 'dayFri' }, { d: 6, k: 'daySat' }, { d: 0, k: 'daySun' }] as day}
                                    <button
                                        class={selectedDays.includes(day.d) ? 'selected' : ''}
                                        data-i18n={day.k}
                                        onclick={() => toggleDay(day.d)}
                                    ></button>
                                {/each}
                            </div>
                        </div>

                        {#if scheduleType === 'onetime'}
                            <div id="onetime-schedule-group" class="form-group">
                                <div class="datetime-row">
                                    <div class="field-container">
                                        <label data-i18n="startDateTime"></label>
                                        <DateField id="start-date-trigger" bind:value={startDateValue} />
                                    </div>
                                    <div class="field-container time-width">
                                        <label data-i18n="startTime"></label>
                                        <TimeField
                                            id="start-time-onetime-trigger"
                                            bind:value={startTimeOneTimeTrigger}
                                        />
                                    </div>
                                </div>
                                <div class="datetime-row">
                                    <div class="field-container">
                                        <label data-i18n="endDateTime"></label>
                                        <DateField id="end-date-trigger" bind:value={endDateValue} />
                                    </div>
                                    <div class="field-container time-width">
                                        <label data-i18n="endTime"></label>
                                        <TimeField id="end-time-onetime-trigger" bind:value={endTimeOneTimeTrigger} />
                                    </div>
                                </div>
                            </div>
                        {:else}
                            <div id="repeating-schedule-group" class="form-group">
                                <div class="time-range">
                                    <div class="start-time time">
                                        <label data-i18n="startTime"></label>
                                        <TimeField id="start-time-trigger" bind:value={startTimeTrigger} />
                                    </div>
                                    <div class="end-time time">
                                        <label data-i18n="endTime"></label>
                                        <TimeField id="end-time-trigger" bind:value={endTimeTrigger} />
                                    </div>
                                </div>
                            </div>
                        {/if}

                        <div class="form-group">
                            <label for="schedule-reminder" data-i18n="scheduleReminderLabel"></label>
                            <textarea
                                id="schedule-reminder"
                                maxlength="200"
                                data-i18n-placeholder="scheduleReminderPlaceholder"
                                bind:value={scheduleReminder}
                                oninput={() => (scheduleError = '')}
                            ></textarea>
                        </div>

                        <p class="schedule-storage-info" data-i18n="scheduleStorageInfo"></p>
                        <button
                            id="save-schedule-btn"
                            class="button {scheduleError ? 'error-state' : ''}"
                            data-i18n={scheduleEditorState.mode === 'edit' ? 'updateSchedule' : 'addSchedule'}
                            onclick={async (e) => {
                                const ok = await saveSchedule();
                                if (ok && (e.ctrlKey || e.metaKey)) {
                                    resetScheduleForm();
                                    fetchSchedules(currentThemeForScheduling?.name);
                                }
                            }}
                        ></button>
                        {#if scheduleError}
                            <div id="schedule-error" class="modal-error-message">{scheduleError}</div>
                        {/if}
                    </div>
                {/if}
            </section>
        </div>
    </div>
{/if}

<!-- CUSTOM CALENDAR COMPONENT -->
{#if calendarPopupVisible}
    <div id="custom-calendar-popup" class="custom-calendar" bind:this={calendarPopupEl} style={calendarPopupStyle}>
        <div class="calendar-header">
            <button
                id="cal-prev-btn"
                onclick={(e) => {
                    e.stopPropagation();
                    const now = new Date();
                    const prevMonth = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() - 1, 1);
                    if (
                        prevMonth.getFullYear() > now.getFullYear() ||
                        (prevMonth.getFullYear() === now.getFullYear() && prevMonth.getMonth() >= now.getMonth())
                    ) {
                        calCurrentDate = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() - 1, 1);
                    }
                }}>&lt;</button
            >
            <span id="cal-month-year"
                >{[
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
                ][calCurrentDate.getMonth()]}
                {calCurrentDate.getFullYear()}</span
            >
            <button
                id="cal-next-btn"
                onclick={(e) => {
                    e.stopPropagation();
                    calCurrentDate = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() + 1, 1);
                }}>&gt;</button
            >
        </div>
        <div class="calendar-weekdays">
            <span data-i18n="daySunInitial">D</span><span data-i18n="dayMonInitial">L</span><span
                data-i18n="dayTueInitial">M</span
            ><span data-i18n="dayWedInitial">X</span><span data-i18n="dayThuInitial">J</span><span
                data-i18n="dayFriInitial">V</span
            ><span data-i18n="daySatInitial">S</span>
        </div>
        <div id="calendar-days-grid" class="calendar-grid">
            {#each generateCalendarDays(calCurrentDate, currentCalendarTarget === 'start' ? calSelectedStartDate : calSelectedEndDate) as d}
                {#if d.empty}
                    <div class="calendar-day empty"></div>
                {:else if d.isPast}
                    <div class="calendar-day disabled" style="opacity: 0.3; cursor: not-allowed;">{d.day}</div>
                {:else}
                    <div
                        class="calendar-day {d.isToday ? 'today' : ''} {d.isSelected ? 'selected' : ''}"
                        onclick={(e) => {
                            e.stopPropagation();
                            selectDate(d.dateObj);
                        }}
                    >
                        {d.day}
                    </div>
                {/if}
            {/each}
        </div>
        <div class="calendar-footer">
            <button
                id="cal-clear-btn"
                data-i18n="reset"
                onclick={(e) => {
                    e.stopPropagation();
                    if (currentCalendarTarget === 'start') {
                        calSelectedStartDate = null;
                        startDateTrigger = 'YYYY-MM-DD';
                    } else {
                        calSelectedEndDate = null;
                        endDateTrigger = 'YYYY-MM-DD';
                    }
                    hidePopups();
                }}
            ></button>
        </div>
    </div>
{/if}

{#if timePopupVisible}
    <div id="custom-time-popup" class="custom-time-picker" bind:this={timePopupEl} style={timePopupStyle}>
        <div class="time-picker-main-row">
            <div class="time-arrows">
                <button
                    class="time-arrow-btn"
                    type="button"
                    onclick={(e) => {
                        e.stopPropagation();
                        handleTimeArrow('hour', 'up');
                    }}>▲</button
                >
                <button
                    class="time-arrow-btn"
                    type="button"
                    onclick={(e) => {
                        e.stopPropagation();
                        handleTimeArrow('hour', 'down');
                    }}>▼</button
                >
            </div>
            <div class="time-input-container">
                <input
                    type="text"
                    id="input-hour"
                    maxlength="2"
                    inputmode="numeric"
                    placeholder="00"
                    bind:value={inputHour}
                    oninput={updateTime}
                    onblur={() => {
                        if (!inputHour) inputHour = '00';
                        inputHour = inputHour.padStart(2, '0');
                        updateTime();
                    }}
                />
                <span>:</span>
                <input
                    type="text"
                    id="input-minute"
                    maxlength="2"
                    inputmode="numeric"
                    placeholder="00"
                    bind:value={inputMinute}
                    oninput={updateTime}
                    onblur={() => {
                        if (!inputMinute) inputMinute = '00';
                        inputMinute = inputMinute.padStart(2, '0');
                        updateTime();
                    }}
                />
            </div>
            <div class="time-arrows">
                <button
                    class="time-arrow-btn"
                    type="button"
                    onclick={(e) => {
                        e.stopPropagation();
                        handleTimeArrow('minute', 'up');
                    }}>▲</button
                >
                <button
                    class="time-arrow-btn"
                    type="button"
                    onclick={(e) => {
                        e.stopPropagation();
                        handleTimeArrow('minute', 'down');
                    }}>▼</button
                >
            </div>
        </div>
        <div class="time-picker-label" data-i18n="format24h">24h</div>
    </div>
{/if}

<ConfirmDialog />
