<script>
    import { onMount, tick } from 'svelte';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    import ConfirmDialog from '../../components/common/ConfirmDialog.svelte';
    import ThemeEditorModal from './components/ThemeEditorModal.svelte';
    import ThemeScheduleModal from './components/ThemeScheduleModal.svelte';
    import SavedThemesToolbar from './components/SavedThemesToolbar.svelte';
    import SavedThemesGrid from './components/SavedThemesGrid.svelte';
    import SavedThemesFooter from './components/SavedThemesFooter.svelte';
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
    // Writable $derived: they mirror the date fields, and the schedule loading and
    // reset paths below still assign them directly, which a $derived allows since
    // Svelte 5.25. Previously this was $state kept in sync by two $effect blocks.
    let startDateTrigger = $derived(startDateValue || 'YYYY-MM-DD');
    let endDateTrigger = $derived(endDateValue || 'YYYY-MM-DD');

    let scheduleError = $state('');

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
    // These effects also assigned to calSelectedStartDate / calSelectedEndDate, which
    // are declared nowhere and read nowhere: leftovers from the vanilla calendar that
    // the port never wired up. Assigning to an undeclared name inside a module throws,
    // so every date change raised "calSelectedStartDate is not defined".

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
    onFetchSchedules={fetchSchedules}
    {formatDateTime}
    {getDayNames}
/>

<ConfirmDialog />
