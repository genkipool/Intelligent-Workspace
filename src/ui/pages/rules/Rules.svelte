<script>
    import { onMount } from 'svelte';
    import { initNumberSpinnerArrows } from '../../../utils/numberSpinner.js';
    import { initializeKeyboardNavigation } from '../../../utils/keyboardNav.js';
    import ConfirmDialog from '../../components/common/ConfirmDialog.svelte';
    import { SvelteSet, SvelteMap } from 'svelte/reactivity';
    import {
        rulesStore,
        initializeRules,
        saveRulesToStorage,
        expandedStatesStore,
        sortStatesStore,
        searchQueryStore,
        sortAlphaStore,
        isAllExpandedStore,
    } from './rulesStore.js';
    import RuleList from './RuleList.svelte';
    import RuleModal from './RuleModal.svelte';
    import SettingsModal from './SettingsModal.svelte';
    import Tutorial from './Tutorial.svelte';
    import RulesToolbar from './RulesToolbar.svelte';
    import RulesPopupHost from './popups/RulesPopupHost.svelte';
    import ImportPopup from './popups/ImportPopup.svelte';
    import ImportPanel from '../../components/common/ImportPanel.svelte';
    import RulesFooter from './RulesFooter.svelte';
    import { t, i18nStore, tt } from '../../stores/i18nStore.js';
    import { groupTabs, getRuleStorage, setRuleStorage, getSettings, saveSettings } from './modules/rules-api.js';
    import {
        defaultClusterConfig,
        mergeClusterConfig,
        isAnyClusterSwitchOn,
        applyMasterSwitch,
    } from './modules/clusterDefaults.js';
    import { initializeActiveTheme } from '../../../utils/theme.js';
    import { showNotification } from '../../../utils/i18n.js';
    import { ClusterPerfMonitor } from './modules/clusterPerf.js';

    let isLoading = $state(true);
    let isModalOpen = $state(false);
    let isSettingsOpen = $state(false);
    let modalMode = $state('add');
    let editingIndex = $state(-1);
    let ruleToEdit = $state(null);

    // Defaults shared with the background rule engine
    let isClusterEnabled = $state(true);
    let isSortGroupsEnabled = $state(true);
    let isPrefixesEnabled = $state(true);
    let isCollapseTimerEnabled = $state(false);
    let showImportPopup = $state(false);
    let showTutorial = $state(false);
    // Opening the guide from the title takes the list's place, as in the original; the
    // guide that opens by itself on an empty page sits under the "no rules" message.
    let tutorialReplacesList = $state(false);

    function toggleTutorial() {
        showTutorial = !showTutorial;
        tutorialReplacesList = showTutorial;
    }

    function hideTutorial() {
        showTutorial = false;
        tutorialReplacesList = false;
    }
    let storageMode = $state('sync');

    let miscSortOption = $state('start');
    let clusterConfig = $state(defaultClusterConfig());
    let userPrefixes = $state({ lock: '', openKey: '', loupe: '', checked: '', warning: '' });
    let timerInactiveTime = $state(1);
    let timerActiveTime = $state(15);
    let discardingTime = $state(60);

    let showClusterPopup = $state(false);
    let showSortGroupsPopup = $state(false);
    let showPrefixPopup = $state(false);
    let showTimerPopup = $state(false);
    let showAllRulesPopup = $state(false);
    let showStoragePopup = $state(false);
    let showColorPopup = $state(false);
    let colorTargetIndex = $state(-1);
    let selectedRuleColor = $derived(colorTargetIndex >= 0 ? $rulesStore[colorTargetIndex]?.color : 'blue');
    let showDiscardingPopup = $state(false);
    let popupPosition = $state({ x: 0, y: 0 });
    let isPinned = $state(false);

    // On screens ≤600px the footer moves inside #rules-list
    // (manageFooterPosition) and leaves it in #footer-container-large on large screens.
    let isSmallScreen = $state(window.matchMedia('(width <= 600px)').matches);
    $effect(() => {
        const mq = window.matchMedia('(width <= 600px)');
        const onChange = () => (isSmallScreen = mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    });

    let isAllExpanded = $derived($isAllExpandedStore);
    // Active when there are rules and all of them are enabled; disabled when there are none
    let isAllRulesActive = $derived($rulesStore.length > 0 && $rulesStore.every((r) => r.active));
    let hasRules = $derived($rulesStore.length > 0);
    let isAlphaSort = $derived($sortAlphaStore);
    $effect(() => {
        $searchQueryStore;
    });
    onMount(async () => {
        initNumberSpinnerArrows();
        try {
            // Arrow-key navigation and the centralised Escape handling live here; the
            // rules page was never wiring them up, so the keyboard did nothing.
            initializeKeyboardNavigation();
            await initializeActiveTheme();
            await i18nStore.init();
            await initializeRules();
            const settings = await getSettings([
                'clusteringEnabled',
                'sortGroupsAlphabetically',
                'enablePrefixes',
                'enableCollapseTimer',
                'clusterConfig',
                'userPrefixes',
                'inactiveCollapseTime',
                'activeCollapseTime',
                'miscGroupSortOption',
            ]);
            isClusterEnabled = settings.clusteringEnabled ?? true;
            isSortGroupsEnabled = settings.sortGroupsAlphabetically ?? true;
            isPrefixesEnabled = settings.enablePrefixes ?? true;
            isCollapseTimerEnabled = settings.enableCollapseTimer ?? false;
            clusterConfig = mergeClusterConfig(settings.clusterConfig || {});
            if (settings.userPrefixes) userPrefixes = { ...userPrefixes, ...settings.userPrefixes };
            timerInactiveTime = settings.inactiveCollapseTime ?? 1;
            timerActiveTime = settings.activeCollapseTime ?? 15;
            miscSortOption = settings.miscGroupSortOption || 'start';
            // ruleStorageArea and discardingTimeMinutes live in chrome.storage.local
            const localData = await chrome.storage.local.get(['ruleStorageArea', 'discardingTimeMinutes']);
            storageMode = localData.ruleStorageArea || 'sync';
            discardingTime = localData.discardingTimeMinutes ?? 60;
            // The quick guide opens by itself only while there are no rules yet; from
            // then on it is the Rules title and the "Rules" heading that summon it.
            showTutorial = $rulesStore.length === 0;
            tutorialReplacesList = false;
            const pinResult = await chrome.storage.local.get('isPinned');
            if (pinResult.isPinned !== undefined) isPinned = pinResult.isPinned;
        } catch (error) {
            console.error('Rules initialization error:', error);
        } finally {
            isLoading = false;
        }
        // Any button click other than the Rules title, the header, the scroll buttons
        // or the tutorial itself dismisses the tutorial.
        document.addEventListener('click', (event) => {
            if (!showTutorial) return;
            const isButtonClick = event.target.closest('button');
            if (!isButtonClick) return;
            if (
                event.target.closest(
                    '#header-main-title-rules, #rules-title-button, #tutorial-container, #scroll-buttons',
                )
            ) {
                return;
            }
            hideTutorial();
        });

        chrome.storage.onChanged.addListener(handleStorageChanged);
        chrome.runtime.onMessage.addListener((request) => {
            if (request.action === 'themeChanged' || request.action === 'languageChanged') {
                initializeActiveTheme();
                initializeRules();
            }
        });
    });

    // A plain click on the storage icon forces a sync; the configuration popup is
    // opened with a right click instead.
    let isSyncing = $state(false);

    async function forceSync() {
        if (storageMode !== 'sync' || isSyncing) return;
        isSyncing = true;
        try {
            const response = await chrome.runtime.sendMessage({ action: 'forceSync' });
            showNotification(
                response?.status === 'sync_complete' ? 'syncCompleted' : 'syncError',
                response?.status !== 'sync_complete',
            );
        } catch {
            showNotification('syncError', true);
        } finally {
            isSyncing = false;
        }
    }

    function handleStorageChanged(changes) {
        if (changes.customRules) {
            rulesStore.set(changes.customRules.newValue || []);
        }
        if (changes.clusteringEnabled !== undefined) isClusterEnabled = changes.clusteringEnabled.newValue;
        if (changes.sortGroupsAlphabetically !== undefined)
            isSortGroupsEnabled = changes.sortGroupsAlphabetically.newValue;
        if (changes.enablePrefixes !== undefined) isPrefixesEnabled = changes.enablePrefixes.newValue;
        if (changes.enableCollapseTimer !== undefined) isCollapseTimerEnabled = changes.enableCollapseTimer.newValue;
        if (changes.ruleStorageArea) storageMode = changes.ruleStorageArea.newValue;

        // The settings modal and these popups are two faces of the same settings, so
        // whatever one of them writes has to reach the other. Values identical to the
        // ones already held are skipped, which drops the echo of our own writes.
        if (changes.clusterConfig) {
            const incoming = mergeClusterConfig(changes.clusterConfig.newValue || {});
            if (JSON.stringify(incoming) !== JSON.stringify($state.snapshot(clusterConfig))) clusterConfig = incoming;
        }
        if (changes.userPrefixes) {
            const incoming = { ...userPrefixes, ...(changes.userPrefixes.newValue || {}) };
            if (JSON.stringify(incoming) !== JSON.stringify($state.snapshot(userPrefixes))) userPrefixes = incoming;
        }
        if (changes.inactiveCollapseTime !== undefined) timerInactiveTime = changes.inactiveCollapseTime.newValue ?? 1;
        if (changes.activeCollapseTime !== undefined) timerActiveTime = changes.activeCollapseTime.newValue ?? 15;
        if (changes.miscGroupSortOption !== undefined) miscSortOption = changes.miscGroupSortOption.newValue || 'start';
        if (changes.discardingTimeMinutes !== undefined) discardingTime = changes.discardingTimeMinutes.newValue ?? 60;
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            if (isModalOpen) isModalOpen = false;
            if (isSettingsOpen) isSettingsOpen = false;
            if (showImportPopup) showImportPopup = false;
            if (showClusterPopup) showClusterPopup = false;
            if (showSortGroupsPopup) showSortGroupsPopup = false;
            if (showPrefixPopup) showPrefixPopup = false;
            if (showTimerPopup) showTimerPopup = false;
            if (showAllRulesPopup) showAllRulesPopup = false;
            if (showStoragePopup) showStoragePopup = false;
            if (showColorPopup) showColorPopup = false;
            if (showDiscardingPopup) showDiscardingPopup = false;
        }
    }

    function openAddModal() {
        modalMode = 'add';
        ruleToEdit = null;
        isModalOpen = true;
    }

    function handleSaveRule(detail) {
        const newRule = detail;
        let updatedRules = [...$rulesStore];
        if (modalMode === 'add') {
            updatedRules.push(newRule);
        } else if (modalMode === 'edit') {
            updatedRules[editingIndex] = newRule;
        }
        saveRulesToStorage(updatedRules);
        isModalOpen = false;
    }

    function handleToggleStar(detail) {
        const { index } = detail;
        let updatedRules = [...$rulesStore];
        if (updatedRules[index]) {
            updatedRules[index].isStarred = !updatedRules[index].isStarred;
            saveRulesToStorage(updatedRules);
        }
    }

    function handleDeleteRule(detail) {
        const { index } = detail;
        let updatedRules = [...$rulesStore];
        updatedRules.splice(index, 1);
        saveRulesToStorage(updatedRules);
    }

    function handleEditRule(detail) {
        const { index } = detail;
        editingIndex = index;
        ruleToEdit = $rulesStore[index];
        modalMode = 'edit';
        isModalOpen = true;
    }

    async function handleToggleActive(detail) {
        const { index, active } = detail;
        let updatedRules = [...$rulesStore];
        if (updatedRules[index]) {
            updatedRules[index] = { ...updatedRules[index], active };
            rulesStore.set(updatedRules);
            await saveRulesToStorage(updatedRules);
        }
    }

    function handleToggleExpand(detail) {
        const { name } = detail;
        let updatedStates = new SvelteMap($expandedStatesStore);
        updatedStates.set(name, !updatedStates.get(name));
        expandedStatesStore.set(updatedStates);
    }

    /**
     * Saves the arrangement the list was showing when the card was dropped.
     *
     * `order` holds the stored positions of the cards on screen, in their new order. A
     * search may be hiding some rules, so the reordered ones are written back into the
     * slots they occupied and everything else stays where it was.
     */
    function handleReorderRule(detail) {
        const { order, movedIndex } = detail;
        if (!Array.isArray(order) || order.length === 0) return;

        const updatedRules = [...$rulesStore];
        const moved = updatedRules[movedIndex];
        const slots = [...order].sort((a, b) => a - b);
        const inNewOrder = order.map((i) => $rulesStore[i]);
        if (inNewOrder.some((rule) => !rule)) return;
        slots.forEach((slot, position) => {
            updatedRules[slot] = inNewOrder[position];
        });

        saveRulesToStorage(updatedRules);
        groupTabs();
        showNotification('ruleMoved', false, [moved?.name || '', order.indexOf(movedIndex) + 1]);
    }

    function handleDeleteDomain(detail) {
        const { index, url } = detail;
        let updatedRules = [...$rulesStore];
        if (updatedRules[index]) {
            updatedRules[index].urls = updatedRules[index].urls.filter((u) => u !== url);
            saveRulesToStorage(updatedRules);
        }
    }

    function handleEditDomain(detail) {
        const { index, url, newUrl } = detail;
        const updatedRules = [...$rulesStore];
        const rule = updatedRules[index];
        if (!rule) return;
        const urls = [...(rule.urls || [])];
        const at = urls.indexOf(url);
        if (at === -1) return;
        if (urls.includes(newUrl)) {
            showNotification('errorUrlAlreadyInRule', true, [rule.name]);
            return;
        }
        urls[at] = newUrl;
        updatedRules[index] = { ...rule, urls };
        saveRulesToStorage(updatedRules);
        groupTabs();
    }

    /** Renaming a rule has to carry its per-rule state (sort, expansion) to the new key. */
    function handleUpdateRuleName(detail) {
        const { index, newName } = detail;
        const updatedRules = [...$rulesStore];
        const rule = updatedRules[index];
        if (!rule || !newName || newName === rule.name) return;
        if (updatedRules.some((r, i) => i !== index && r.name === newName)) {
            showNotification('duplicateRuleName', true);
            return;
        }
        const oldName = rule.name;
        updatedRules[index] = { ...rule, name: newName };
        saveRulesToStorage(updatedRules);

        const sortStates = new SvelteMap($sortStatesStore);
        if (sortStates.has(oldName)) {
            sortStates.set(newName, sortStates.get(oldName));
            sortStates.delete(oldName);
            sortStatesStore.set(sortStates);
            saveSettings({ [`sortState_${newName}`]: sortStates.get(newName) });
        }
        const expanded = new SvelteMap($expandedStatesStore);
        if (expanded.has(oldName)) {
            expanded.set(newName, expanded.get(oldName));
            expanded.delete(oldName);
            expandedStatesStore.set(expanded);
        }
        groupTabs();
    }

    /** Per-rule URL order, remembered per rule name exactly as the original did. */
    function handleToggleSort(detail) {
        const rule = $rulesStore[detail.index];
        if (!rule) return;
        const newState = !$sortStatesStore.get(rule.name);
        const updated = new SvelteMap($sortStatesStore);
        updated.set(rule.name, newState);
        sortStatesStore.set(updated);
        saveSettings({ [`sortState_${rule.name}`]: newState });
    }

    // While searching, rules whose match sits in a hidden URL are expanded so the
    // highlighted term is visible; clearing the box restores the previous state.
    let preSearchExpandState = null;

    function handleSearch(e) {
        const term = e.target.value;
        searchQueryStore.set(term);
        if (term.trim()) hideTutorial();
        syncSearchExpansion(term.trim().toLowerCase());
    }

    function syncSearchExpansion(term) {
        const states = new SvelteMap($expandedStatesStore);

        if (term && preSearchExpandState === null) {
            preSearchExpandState = new SvelteMap(states);
        }

        if (term) {
            for (const rule of $rulesStore) {
                const urlMatch = (rule.urls || []).some((url) => url.toLowerCase().includes(term));
                const nameMatch = (rule.name || '').toLowerCase().includes(term);
                if (urlMatch && !nameMatch && (isSmallScreen || overflowingRules.has(rule.name))) {
                    states.set(rule.name, true);
                }
            }
            expandedStatesStore.set(states);
            return;
        }

        if (preSearchExpandState) {
            expandedStatesStore.set(new SvelteMap(preSearchExpandState));
            preSearchExpandState = null;
        }
    }

    function handleChangeColor(detail) {
        // Opens the colour picker over the indicator
        colorTargetIndex = detail.index;
        popupPosition = { x: detail.x || 0, y: detail.y || 0 };
        showColorPopup = true;
    }

    function toggleSortAlpha() {
        const newState = !$sortAlphaStore;
        sortAlphaStore.set(newState);
        saveSettings({ sortAlphaPreference: newState });
    }

    // On wide screens only rules whose URLs actually overflow can be expanded, so
    // "expand all" must ignore the ones that already show every URL — otherwise it
    // would open cards that have nothing to reveal. Each card reports its own
    // overflow state as it is measured.
    let overflowingRules = new SvelteSet();

    function handleOverflowChange({ name, hasHiddenUrls }) {
        if (hasHiddenUrls) overflowingRules.add(name);
        else overflowingRules.delete(name);
    }

    let expandableRuleNames = $derived(
        isSmallScreen
            ? $rulesStore.map((r) => r.name)
            : $rulesStore.filter((r) => overflowingRules.has(r.name)).map((r) => r.name),
    );

    let areAllExpanded = $derived(
        expandableRuleNames.length > 0 && expandableRuleNames.every((name) => $expandedStatesStore.get(name)),
    );

    function toggleExpandAll() {
        if (expandableRuleNames.length === 0) return;
        const newState = !areAllExpanded;
        const newMap = new SvelteMap($expandedStatesStore);
        for (const name of expandableRuleNames) newMap.set(name, newState);
        expandedStatesStore.set(newMap);
        isAllExpandedStore.set(newState);
    }

    export function yieldForAnimation(ms = 350) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /** The master switch turns every grouping on or off at once, smoothly without blocking the UI thread. */
    async function setClusterEnabled(enabled) {
        isClusterEnabled = enabled;

        // Apply config change
        const nextConfig = applyMasterSwitch($state.snapshot(clusterConfig), enabled);
        clusterConfig = nextConfig;

        // Save settings and trigger regrouping asynchronously without blocking the switch transition
        setTimeout(async () => {
            await saveSettings({
                clusterConfig: nextConfig,
                clusteringEnabled: enabled,
            });
            await groupTabs();
        }, 150);
    }

    function toggleCluster() {
        setClusterEnabled(!isClusterEnabled);
    }

    /** Any change in Configure Groups re-syncs the master switch and regroups the tabs. */
    async function onClusterChanged() {
        const enabled = isAnyClusterSwitchOn(clusterConfig);
        isClusterEnabled = enabled;

        setTimeout(async () => {
            const nextConfig = $state.snapshot(clusterConfig);
            await saveSettings({
                clusterConfig: nextConfig,
                clusteringEnabled: isClusterEnabled,
            });
            await groupTabs();
        }, 50);
    }

    async function toggleSortGroups() {
        isSortGroupsEnabled = !isSortGroupsEnabled;
        await saveSettings({ sortGroups: isSortGroupsEnabled });
    }

    async function togglePrefixes() {
        isPrefixesEnabled = !isPrefixesEnabled;
        await saveSettings({ enablePrefixes: isPrefixesEnabled });
        chrome.runtime.sendMessage({
            action: 'togglePrefixes',
            enabled: isPrefixesEnabled,
        });
    }

    async function toggleCollapseTimer() {
        isCollapseTimerEnabled = !isCollapseTimerEnabled;
        await saveSettings({ collapseTimer: isCollapseTimerEnabled });
    }

    async function toggleAllRules() {
        const newState = !isAllRulesActive;
        let updatedRules = $rulesStore.map((r) => ({ ...r, active: newState }));
        rulesStore.set(updatedRules);
        await saveRulesToStorage(updatedRules);
    }

    function openResize() {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/rules/rules.html') });
    }

    function openImportPopup() {
        showImportPopup = true;
    }

    let showDragDropPanel = $state(false);
    let importMode = $state('add'); // 'add' or 'overwrite'

    function handleImport(detail) {
        importMode = detail.mode;
        showImportPopup = false;
        showDragDropPanel = true;
    }

    function handleCancelDragDrop() {
        showDragDropPanel = false;
    }

    async function processImportedFile(file) {
        if (!file) return;
        try {
            const text = await file.text();
            const importedData = JSON.parse(text);
            const importedRules =
                importedData.customRules || importedData.rules || (Array.isArray(importedData) ? importedData : []);
            if (!Array.isArray(importedRules) || importedRules.length === 0) {
                console.error('No valid rules found in import file');
                return;
            }
            let currentRules = [...$rulesStore];
            if (importMode === 'overwrite') {
                currentRules = importedRules;
            } else {
                currentRules = [...currentRules, ...importedRules];
            }
            await saveRulesToStorage(currentRules);
            showDragDropPanel = false;
        } catch (err) {
            console.error('Import error:', err);
        }
    }

    function resetClusterDefaults() {
        clusterConfig = defaultClusterConfig();
        onClusterChanged();
    }

    function resetPrefixesDefaults() {
        userPrefixes = { lock: '', openKey: '', loupe: '', checked: '', warning: '' };
        saveSettings({ userPrefixes: userPrefixes });
    }

    function resetTimerDefaults() {
        timerInactiveTime = 0;
        timerActiveTime = 0;
        saveSettings({ inactiveCollapseTime: 0, activeCollapseTime: 0 });
    }

    function resetDiscardingDefaults() {
        discardingTime = 60;
        chrome.storage.local.set({ discardingTimeMinutes: 60 });
    }

    function exportRules() {
        const rules = $rulesStore;
        const data = JSON.stringify({ customRules: rules }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rules-export.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    async function togglePin() {
        const newState = !isPinned;
        try {
            if (newState) {
                await chrome.storage.local.set({ isListGroupPinned: false, isGeminiPinned: false });
            }
            await chrome.storage.local.set({ isPinned: newState });
            isPinned = newState;
            showNotification(newState ? 'rulesPagePinned' : 'rulesPageUnpinned');
        } catch (error) {
            console.error('Error saving pin state:', error);
        }
    }

    async function listGroups() {
        const currentPage = window.location.pathname.split('/').pop();
        await chrome.storage.local.set({ navSource: `../rules/${currentPage}?context=sidepanel` });
        window.location.href = '../listGroup/listGroup.html?context=sidepanel';
        chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: '../listGroup/listGroup.html' });
    }

    function goHome() {
        // Navigates within the same context (popup / side panel)
        window.location.href = '../popup/popup.html?context=sidepanel';
        chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: '../popup/popup.html' });
    }

    async function goBack() {
        const { navSource } = await chrome.storage.local.get('navSource');
        const currentPage = window.location.pathname.split('/').pop();
        await chrome.storage.local.set({ navSource: `../rules/${currentPage}?context=sidepanel` });
        if (navSource) {
            window.location.href = navSource;
        } else {
            window.location.href = '../popup/popup.html?context=sidepanel';
            chrome.runtime.sendMessage({ action: 'sidePanelPathUpdated', path: '../popup/popup.html' });
        }
    }

    function scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function scrollToBottom() {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }

    function openFooterLink() {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/about/about.html') });
    }

    function openPopupOnContextMenu(popupName, e) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = { x: rect.left, y: rect.bottom + 4 };
        popupPosition = pos;
        showClusterPopup = false;
        showSortGroupsPopup = false;
        showPrefixPopup = false;
        showTimerPopup = false;
        showAllRulesPopup = false;
        showStoragePopup = false;
        showColorPopup = false;
        showDiscardingPopup = false;
        if (popupName === 'cluster') showClusterPopup = true;
        else if (popupName === 'sortGroups') showSortGroupsPopup = true;
        else if (popupName === 'prefixes') showPrefixPopup = true;
        else if (popupName === 'timer') showTimerPopup = true;
        else if (popupName === 'allRules') showAllRulesPopup = true;
        else if (popupName === 'storage') showStoragePopup = true;
        else if (popupName === 'color') showColorPopup = true;
        else if (popupName === 'discarding') showDiscardingPopup = true;
    }

    function closeAllPopups() {
        showClusterPopup = false;
        showSortGroupsPopup = false;
        showPrefixPopup = false;
        showTimerPopup = false;
        showAllRulesPopup = false;
        showStoragePopup = false;
        showColorPopup = false;
        showDiscardingPopup = false;
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="container">
    <div class="sticky-rules-header">
        <header class="header-main-menu">
            <h1
                id="header-main-title-rules"
                class="header-main-title"
                style="cursor: pointer;"
                role="button"
                tabindex="0"
                onclick={toggleTutorial}
                onkeydown={(e) => e.key === 'Enter' && toggleTutorial()}
            >
                {$t('manageRules') || 'Manage Rules'}
            </h1>
            <button
                id="pin-toggle"
                class="pin-button"
                type="button"
                class:pinned={isPinned}
                aria-pressed={isPinned}
                onclick={togglePin}
                aria-label={$t('pinRulesPage') || 'Pin rules page'}
                title={$tt(isPinned ? 'pinTooltipPinned' : 'pinTooltipUnpinned')}
                tabindex="0"
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-pin"></use>
                </svg>
            </button>
            <button
                id="list-groups-btn"
                class="buttom-list-group"
                type="button"
                onclick={listGroups}
                aria-label={$t('listTabGroups') || 'List tab groups'}
                title={$tt('listTabGroups') || 'List tab groups'}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 512 512"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-list-group"></use>
                </svg>
            </button>
            <button
                id="home-btn"
                class="home-button"
                type="button"
                onclick={goHome}
                aria-label={$t('backToHome') || 'Back to home'}
                title={$tt('backToHome') || 'Back to home'}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="2 2 20 20"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-home"></use>
                </svg>
            </button>
            <button
                class="back-button"
                type="button"
                onclick={goBack}
                aria-label={$t('backToMainPopup')}
                title={$tt('backToHome')}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-back"></use>
                </svg>
            </button>
        </header>
        <menu class="main-menu">
            <div class="action-buttons">
                <button
                    id="add-rule"
                    class="action-button"
                    type="button"
                    tabindex="0"
                    onclick={openAddModal}
                    title={$tt('addRule') || 'Add Rule'}
                >
                    <span class="button-icon">
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            style="color: var(--text-color);"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <path
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                fill="none"
                                d="M4 12H20M12 4V20"
                            ></path>
                        </svg>
                    </span>
                    <span class="button-text">{$t('addRule') || 'Add Rule'}</span>
                </button>
                <button
                    id="export-rules"
                    class="action-button"
                    type="button"
                    tabindex="0"
                    onclick={exportRules}
                    title={$tt('exportRules') || 'Export rules'}
                >
                    <span class="button-icon">
                        <svg width="24" height="24" viewBox="0 0 1920 1920" aria-hidden="true" focusable="false">
                            <use href="#icon-export"></use>
                        </svg>
                    </span>
                    <span class="button-text">{$t('exportRules') || 'Export'}</span>
                </button>
                <button
                    id="import-rules"
                    class="action-button"
                    type="button"
                    tabindex="0"
                    onclick={openImportPopup}
                    title={$tt('importRules') || 'Import rules'}
                >
                    <span class="button-icon">
                        <svg width="24" height="24" viewBox="0 0 1920 1920" aria-hidden="true" focusable="false">
                            <use href="#icon-import"></use>
                        </svg>
                    </span>
                    <span class="button-text">{$t('importRules') || 'Import'}</span>
                </button>
                <button
                    id="settings-rules-btn"
                    class="action-button"
                    type="button"
                    tabindex="0"
                    title={$tt('settingsActions') || 'Settings'}
                    onclick={() => (isSettingsOpen = true)}
                >
                    <span class="button-icon">
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 32 32"
                            style="color: var(--text-color);"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <use href="#icon-settings"></use>
                        </svg>
                    </span>
                    <span class="button-text">{$t('settingsActions') || 'Settings'}</span>
                </button>
            </div>
        </menu>

        <RulesToolbar
            {showTutorial}
            {storageMode}
            {isSyncing}
            {isAlphaSort}
            {areAllExpanded}
            expandableRuleNamesCount={expandableRuleNames.length}
            bind:isClusterEnabled
            bind:isSortGroupsEnabled
            bind:isPrefixesEnabled
            bind:isCollapseTimerEnabled
            {isAllRulesActive}
            {hasRules}
            onToggleTutorial={toggleTutorial}
            onOpenResize={openResize}
            onForceSync={forceSync}
            onOpenContextMenu={openPopupOnContextMenu}
            onToggleSortAlpha={toggleSortAlpha}
            onToggleExpandAll={toggleExpandAll}
            onSearch={handleSearch}
            onToggleCluster={toggleCluster}
            onSetClusterEnabled={setClusterEnabled}
            onToggleSortGroups={toggleSortGroups}
            onTogglePrefixes={togglePrefixes}
            onToggleCollapseTimer={toggleCollapseTimer}
            onToggleAllRules={toggleAllRules}
        />
    </div>

    {#if isLoading}
        <section class="rules-loading">{$t('loading') || 'Loading...'}</section>
    {:else}
        <!--
            Same element as the original: the quick guide replaces the list while it is
            open, and it opens by itself when there are no rules yet.
        -->
        <section id="rules-list" class="rules-loading">
            {#if showTutorial}
                <Tutorial open={true} />
            {/if}
            <div id="rules-items-container" class:hidden={tutorialReplacesList}>
                <RuleList
                    {storageMode}
                    ontoggleStar={handleToggleStar}
                    ondeleteRule={handleDeleteRule}
                    oneditRule={handleEditRule}
                    ontoggleActive={handleToggleActive}
                    ontoggleExpand={handleToggleExpand}
                    onoverflowchange={handleOverflowChange}
                    onreorderRule={handleReorderRule}
                    ondeleteDomain={handleDeleteDomain}
                    oneditDomain={handleEditDomain}
                    onupdateRuleName={handleUpdateRuleName}
                    ontoggleSort={handleToggleSort}
                    onchangeColor={handleChangeColor}
                />
            </div>
            {#if isSmallScreen}
                <RulesFooter onOpenAbout={openFooterLink} />
            {/if}
        </section>
    {/if}

    <div id="scroll-buttons" class="scroll-buttons">
        <button id="scroll-up" type="button" onclick={scrollToTop} aria-label={$t('scrollToTop') || 'Scroll to top'}>
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                style="color: var(--text-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-chevron-up"></use>
            </svg>
        </button>
        <button
            id="scroll-down"
            type="button"
            onclick={scrollToBottom}
            aria-label={$t('scrollToBottom') || 'Scroll to bottom'}
        >
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                style="color: var(--text-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-chevron-down"></use>
            </svg>
        </button>
    </div>

    <ImportPopup isOpen={showImportPopup} onclose={() => (showImportPopup = false)} onimport={handleImport} />

    <ImportPanel
        show={showDragDropPanel}
        sectionId="drag-drop-panel"
        titleKey="importRules"
        titleClass="title-import-rules"
        dropTextKey="dragDropRules"
        dropIcon="📄"
        selectFileKey="selectRulesFile"
        fileInputId="theme-file-input"
        cancelButtonId="cancel-import-drop"
        cancelTitleKey="cancelThemeImport"
        onback={handleCancelDragDrop}
        onfile={processImportedFile}
    />

    <div id="footer-container-large">
        {#if !isSmallScreen}
            <RulesFooter onOpenAbout={openFooterLink} />
        {/if}
    </div>

    <!-- Inside .container so it inherits text-align:left -->
    <RuleModal
        isOpen={isModalOpen}
        mode={modalMode}
        rule={ruleToEdit}
        onclose={() => (isModalOpen = false)}
        onsave={handleSaveRule}
    />
</div>

<SettingsModal isOpen={isSettingsOpen} onclose={() => (isSettingsOpen = false)} />

<RulesPopupHost
    bind:showClusterPopup
    bind:showSortGroupsPopup
    bind:showPrefixPopup
    bind:showTimerPopup
    bind:showColorPopup
    bind:showStoragePopup
    bind:showDiscardingPopup
    {popupPosition}
    bind:clusterConfig
    bind:userPrefixes
    bind:timerInactiveTime
    bind:timerActiveTime
    bind:discardingTime
    {selectedRuleColor}
    {onClusterChanged}
    onResetCluster={resetClusterDefaults}
    onSelectMiscSort={(detail) => {
        miscSortOption = detail.value;
        saveSettings({ miscGroupSortOption: detail.value });
    }}
    onResetPrefixes={resetPrefixesDefaults}
    onSavePrefixes={() => saveSettings({ userPrefixes })}
    onSaveTimer={() =>
        saveSettings({
            inactiveCollapseTime: timerInactiveTime,
            activeCollapseTime: timerActiveTime,
            enableCollapseTimer: true,
        })}
    onResetTimer={resetTimerDefaults}
    onSelectColor={(detail) => {
        if (colorTargetIndex >= 0) {
            const updated = [...$rulesStore];
            if (updated[colorTargetIndex]) {
                updated[colorTargetIndex] = { ...updated[colorTargetIndex], color: detail.color };
                saveRulesToStorage(updated);
            }
        }
        colorTargetIndex = -1;
    }}
    onCloseColor={() => (colorTargetIndex = -1)}
    onSelectStorage={(detail) => {
        storageMode = detail.value;
        chrome.storage.local.set({ ruleStorageArea: detail.value });
    }}
    onSaveDiscarding={() =>
        chrome.storage.local.set({ discardingTimeMinutes: discardingTime, discardingEnabled: true })}
    onResetDiscarding={resetDiscardingDefaults}
/>

<div id="drag-announcer" aria-live="assertive" class="visually-hidden"></div>

<ConfirmDialog />
