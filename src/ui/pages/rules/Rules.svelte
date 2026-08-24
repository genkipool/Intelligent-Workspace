<script>
    import { onMount, onDestroy } from 'svelte';
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
    import SidePanelHeader from '../../components/common/SidePanelHeader.svelte';
    import RulesPopupHost from './popups/RulesPopupHost.svelte';
    import ImportPopup from './popups/ImportPopup.svelte';
    import ImportPanel from '../../components/common/ImportPanel.svelte';
    import RulesFooter from './RulesFooter.svelte';
    import { t, i18nStore, tt } from '../../stores/i18nStore.js';
    import { groupTabs, getSettings, saveSettings } from './modules/rules-api.js';
    import {
        defaultClusterConfig,
        mergeClusterConfig,
        isAnyClusterSwitchOn,
        applyMasterSwitch,
        defaultUserPrefixes,
    } from './modules/clusterDefaults.js';
    import { initializeActiveTheme } from '../../../utils/theme.js';
    import { showNotification } from '../../../utils/i18n.js';
    import { validateImportedRules, MAX_RULE_NAME_LENGTH } from './ruleValidation.js';
    import { duplicateMarkerFields } from './modules/prefixMarkers.js';

    let isLoading = $state(true);
    let isModalOpen = $state(false);
    let isSettingsOpen = $state(false);
    let modalMode = $state('add');
    let editingIndex = $state(-1);
    let ruleToEdit = $state(null);
    let rulePrefill = $state(null);

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

    // Loaded from the settings and kept in step with chrome.storage below. It has
    // to reach MiscSortPopup or the popup opens with nothing marked.
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
    // The button a popup belongs to. Kept instead of only its coordinates so the
    // popup can measure it again when the window is resized.
    let popupTrigger = $state(null);
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
            openRuleModalFromQuery();
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
            timerInactiveTime = Math.min(1440, Math.max(0, settings.inactiveCollapseTime ?? 1));
            timerActiveTime = Math.min(1440, Math.max(0, settings.activeCollapseTime ?? 15));
            miscSortOption = settings.miscGroupSortOption || 'start';
            // ruleStorageArea and discardingTimeMinutes live in chrome.storage.local
            const localData = await chrome.storage.local.get(['ruleStorageArea', 'discardingTimeMinutes']);
            storageMode = localData.ruleStorageArea || 'sync';
            discardingTime = Math.min(1440, Math.max(1, localData.discardingTimeMinutes ?? 60));
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
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'themeChanged' || request.action === 'languageChanged') {
                initializeActiveTheme();
                initializeRules();
            }
            // "Create a rule for this site" in the browser's context menu opens this
            // page and then sends the URL here. Nothing was listening, so the entry
            // opened the panel and stopped there.
            // The answer matters: it tells the browser side that this page was on
            // screen and dealt with it, so it does not have to send the panel here.
            if (request.action === 'create-rule-from-context' && request.url) {
                openRuleModalForUrl(request.url);
                sendResponse({ handled: true });
                return true;
            }
            // The "expand/collapse every rule" shortcut reaches this page as a
            // message; nothing was listening, so the shortcut did nothing.
            if (request.action === 'toggleAllExpand') {
                toggleExpandAll();
            }
        });

        window.addEventListener('scroll', updateScrollButtons, { passive: true });
        window.addEventListener('resize', updateScrollButtons, { passive: true });
        document.addEventListener('scroll', updateScrollButtons, { capture: true, passive: true });

        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                updateScrollButtons();
            });
            resizeObserver.observe(document.body);
        }

        setTimeout(updateScrollButtons, 100);
        setTimeout(updateScrollButtons, 300);
    });

    onDestroy(() => {
        window.removeEventListener('scroll', updateScrollButtons);
        window.removeEventListener('resize', updateScrollButtons);
        document.removeEventListener('scroll', updateScrollButtons, { capture: true });
        if (resizeObserver) resizeObserver.disconnect();
        if (scrollButtonsRaf) cancelAnimationFrame(scrollButtonsRaf);
    });

    $effect(() => {
        // Re-evaluate scroll buttons whenever rules, search query, tutorial, or screen mode changes
        $rulesStore;
        $searchQueryStore;
        showTutorial;
        isSmallScreen;
        updateScrollButtons();
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

    /**
     * Moves the rules between the synced account and this computer.
     *
     * Writing the setting was all this did, so the list kept showing whatever the old
     * area held and the choice looked like it had done nothing: the rules have to be
     * read again from the area that is now in charge, and the change announced.
     */
    async function switchStorageMode(detail) {
        const newMode = detail?.value;
        if (!newMode || newMode === storageMode) return;
        storageMode = newMode;
        await chrome.storage.local.set({ ruleStorageArea: newMode });
        await initializeRules();
        showTutorial = $rulesStore.length === 0;
        showNotification('storageModeSet', false, [newMode.toUpperCase()]);
        showNotification('storageChangeWarning', true);
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
        if (changes.ruleStorageArea) {
            const newArea = changes.ruleStorageArea.newValue || 'sync';
            if (newArea !== storageMode) {
                storageMode = newArea;
                initializeRules().then(() => {
                    showTutorial = $rulesStore.length === 0;
                });
            }
        }

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
        if (changes.inactiveCollapseTime !== undefined)
            timerInactiveTime = Math.min(1440, Math.max(0, changes.inactiveCollapseTime.newValue ?? 1));
        if (changes.activeCollapseTime !== undefined)
            timerActiveTime = Math.min(1440, Math.max(0, changes.activeCollapseTime.newValue ?? 15));
        if (changes.miscGroupSortOption !== undefined) miscSortOption = changes.miscGroupSortOption.newValue || 'start';
        if (changes.discardingTimeMinutes !== undefined)
            discardingTime = Math.min(1440, Math.max(1, changes.discardingTimeMinutes.newValue ?? 60));
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
        rulePrefill = null;
        isModalOpen = true;
    }

    /**
     * Suggests a rule name from a URL: the significant part of the hostname, capitalised.
     *
     * Trimmed to the length a name is allowed to be, so the suggestion never lands in
     * the form already failing validation.
     */
    function suggestRuleNameFromUrl(url) {
        try {
            const parts = new URL(url).hostname.replace(/^www\./, '').split('.');
            const mainPart = parts.length > 2 ? parts[parts.length - 2] : parts[0];
            const name = mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
            return name.slice(0, MAX_RULE_NAME_LENGTH);
        } catch {
            return '';
        }
    }

    /**
     * Opens the add-rule form already filled in.
     *
     * @param {{urls: string, name?: string}} prefill `urls` may hold several,
     *   one per line, which is what "create a rule from this folder" sends.
     */
    function openRuleModalPrefilled({ urls, name = '' }) {
        modalMode = 'add';
        ruleToEdit = null;
        rulePrefill = {
            name: (name || suggestRuleNameFromUrl(urls.split('\n')[0])).slice(0, MAX_RULE_NAME_LENGTH),
            urls,
            color: 'red',
        };
        isModalOpen = true;
    }

    /** Opens the add-rule form already filled in with a URL from the context menu. */
    function openRuleModalForUrl(url) {
        openRuleModalPrefilled({ urls: url });
    }

    /**
     * Opens the form when this page was reached with the request in its address.
     *
     * "Create a rule from this bookmark" and "…from this domain" navigate here with
     * `?action=create&url=…&name=…`. Nothing read those, so the page opened on the
     * rule list and the request was lost. The query is wiped afterwards so going
     * back or reloading does not open the form again.
     */
    function openRuleModalFromQuery() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('action') !== 'create') return;
        const urls = params.get('url');
        if (!urls) return;
        openRuleModalPrefilled({ urls, name: params.get('name') || '' });
        // Rebuilt rather than mutated: the request is dropped, anything else in the
        // address is kept.
        const rest = [...params.entries()]
            .filter(([key]) => !['action', 'url', 'name', 't'].includes(key))
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
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

    async function handleDeleteRule(detail) {
        const { index } = detail;
        const updatedRules = [...$rulesStore];
        const [deleted] = updatedRules.splice(index, 1);
        if (!deleted) return;
        await saveRulesToStorage(updatedRules);
        // The rule is gone, so the group it kept together stops being a group: its tabs
        // are released, exactly as the original does before saying goodbye to the rule.
        try {
            const groups = await chrome.tabGroups.query({ title: deleted.name });
            for (const group of groups) {
                const tabs = await chrome.tabs.query({ groupId: group.id });
                if (tabs.length) await chrome.tabs.ungroup(tabs.map((tab) => tab.id));
            }
        } catch (error) {
            console.error('Error releasing the tabs of the deleted rule:', error);
        }
        showNotification('ruleDeleted', false, [deleted.name]);
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
        const updatedRules = [...$rulesStore];
        const rule = updatedRules[index];
        if (!rule) return;
        const urls = (rule.urls || []).filter((u) => u !== url);
        // A rule with no URLs matches nothing and cannot be given one from the card, so
        // taking its last URL away takes the rule with it, as the original does.
        if (urls.length === 0) {
            handleDeleteRule({ index });
            return;
        }
        updatedRules[index] = { ...rule, urls };
        saveRulesToStorage(updatedRules);
        showNotification('itemDeleted', true, [url]);
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

        // "Expand all" is remembered across reloads, but a card can only be expanded
        // once it has measured itself and knows it has URLs to reveal. Applying the
        // saved state as each card reports in is what restores it — the original does
        // the same, per card, at render time.
        if (hasHiddenUrls && $isAllExpandedStore && !$expandedStatesStore.get(name)) {
            const restored = new SvelteMap($expandedStatesStore);
            restored.set(name, true);
            expandedStatesStore.set(restored);
        }
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
        // The setting was being read back on every load and never written, so the
        // list always came up collapsed no matter what the user had left it as.
        saveSettings({ isAllExpanded: newState });
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

    /**
     * Any change in Configure Groups re-syncs the master switch and regroups the tabs.
     * The caller already waited for the switch animation to finish, so there is
     * nothing left to stay out of the way of here.
     */
    async function onClusterChanged() {
        const enabled = isAnyClusterSwitchOn(clusterConfig);
        isClusterEnabled = enabled;

        const nextConfig = $state.snapshot(clusterConfig);
        await saveSettings({
            clusterConfig: nextConfig,
            clusteringEnabled: isClusterEnabled,
        });
        await groupTabs();
    }

    async function toggleSortGroups() {
        isSortGroupsEnabled = !isSortGroupsEnabled;
        await saveSettings({ sortGroupsAlphabetically: isSortGroupsEnabled });
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
        await saveSettings({ enableCollapseTimer: isCollapseTimerEnabled });
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

    function triggerFileInput() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        input.onchange = (e) => {
            const file = e.target.files?.[0];
            if (file) {
                processImportedFile(file);
            }
        };
        input.click();
    }

    function handleImport(detail) {
        importMode = detail.mode;
        showImportPopup = false;
        if (isSmallScreen) {
            showDragDropPanel = true;
        } else {
            showDragDropPanel = false;
            triggerFileInput();
        }
    }

    function handleCancelDragDrop() {
        showDragDropPanel = false;
    }

    /**
     * Imports rules from a file, refusing the file outright if anything in it fails
     * the checks a hand-typed rule has to pass.
     *
     * This used to write whatever the file parsed to straight into storage: a `null`
     * entry was enough to leave the rule list throwing while it rendered, and the
     * user saw nothing at all — the failures went to the console. Validation now runs
     * before storage is touched, and every failure is reported.
     */
    async function processImportedFile(file) {
        if (!file) return;

        let importedData;
        try {
            importedData = JSON.parse(await file.text());
        } catch (err) {
            console.error('Import error:', err);
            showNotification('errorImportingRulesInvalid', true);
            return;
        }

        const result = validateImportedRules(importedData, $rulesStore, importMode);

        if (result.errors && result.errors.length > 0) {
            for (const error of result.errors) {
                showNotification(error.message, true, error.params, true);
            }
        }

        if (!result.valid || !result.rules || result.rules.length === 0) {
            if (importMode === 'add' && (!result.errors || result.errors.length === 0)) {
                showNotification('noNewRulesAdded', true, [], true);
            }
            return;
        }

        const currentRules = importMode === 'overwrite' ? result.rules : [...$rulesStore, ...result.rules];
        await saveRulesToStorage(currentRules);
        showDragDropPanel = false;
        showNotification(
            importMode === 'overwrite' ? 'rulesImported' : 'rulesAdded',
            false,
            importMode === 'overwrite' ? [] : [result.rules.map((r) => r.name).join(', ')],
            true,
        );
    }

    function resetClusterDefaults() {
        clusterConfig = defaultClusterConfig();
        onClusterChanged();
    }

    /**
     * Writes the markers, unless two of them are the same.
     *
     * Saving a repeated marker leaves two groups indistinguishable, so the original
     * refused and said so; nothing was checking it here.
     */
    function savePrefixes() {
        if (duplicateMarkerFields($state.snapshot(userPrefixes)).size > 0) {
            showNotification('duplicatePrefixesError', true);
            return;
        }
        saveSettings({ userPrefixes: $state.snapshot(userPrefixes) });
    }

    function resetPrefixesDefaults() {
        // Restoring means going back to the markers the extension ships with, not
        // emptying every field.
        userPrefixes = defaultUserPrefixes();
        saveSettings({ userPrefixes: $state.snapshot(userPrefixes) });
        showNotification('prefixesReset');
    }

    function resetTimerDefaults() {
        // The times the extension ships with; zero is not the default, it is "never".
        timerInactiveTime = 1;
        timerActiveTime = 15;
        saveSettings({ inactiveCollapseTime: 1, activeCollapseTime: 15 });
        showNotification('timerSettingsReset');
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

    /**
     * The four navigation buttons of the header. The ids and classes are the ones this
     * page's stylesheet already targets, so moving the markup into a shared component
     * changes nothing that is rendered.
     */
    let headerActions = $derived([
        {
            id: 'pin-toggle',
            class: 'pin-button',
            pinned: isPinned,
            pressed: isPinned,
            // The only one of the four this page made focusable explicitly.
            tabindex: '0',
            icon: '#icon-pin',
            viewBox: '0 0 24 24',
            ariaLabel: $t('pinRulesPage') || 'Pin rules page',
            title: $tt(isPinned ? 'pinTooltipPinned' : 'pinTooltipUnpinned'),
            onclick: togglePin,
        },
        {
            id: 'list-groups-btn',
            class: 'buttom-list-group',
            icon: '#icon-list-group',
            viewBox: '0 0 512 512',
            ariaLabel: $t('listTabGroups') || 'List tab groups',
            title: $tt('listTabGroups') || 'List tab groups',
            onclick: listGroups,
        },
        {
            id: 'home-btn',
            class: 'home-button',
            icon: '#icon-home',
            viewBox: '2 2 20 20',
            ariaLabel: $t('backToHome') || 'Back to home',
            title: $tt('backToHome') || 'Back to home',
            onclick: goHome,
        },
        {
            class: 'back-button',
            icon: '#icon-back',
            viewBox: '0 0 24 24',
            ariaLabel: $t('backToMainPopup'),
            title: $tt('backToHome'),
            onclick: goBack,
        },
    ]);

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

    let scrollButtonsRaf = null;
    let resizeObserver = null;

    function getActiveScrollableInfo() {
        const rulesList = document.getElementById('rules-list');
        if (isSmallScreen && rulesList && rulesList.scrollHeight > rulesList.clientHeight) {
            return {
                target: rulesList,
                scrollTop: rulesList.scrollTop,
                scrollHeight: rulesList.scrollHeight,
                clientHeight: rulesList.clientHeight,
            };
        }
        return {
            target: window,
            scrollTop: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
            scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
            clientHeight: window.innerHeight || document.documentElement.clientHeight,
        };
    }

    function updateScrollButtons() {
        if (scrollButtonsRaf) cancelAnimationFrame(scrollButtonsRaf);
        scrollButtonsRaf = requestAnimationFrame(() => {
            const scrollButtons = document.getElementById('scroll-buttons');
            const scrollUpBtn = document.getElementById('scroll-up');
            const scrollDownBtn = document.getElementById('scroll-down');
            if (!scrollButtons || !scrollUpBtn || !scrollDownBtn) return;

            const info = getActiveScrollableInfo();
            const scrollableDistance = info.scrollHeight - info.clientHeight;

            if (scrollableDistance > 20) {
                scrollButtons.classList.add('visible');
                scrollUpBtn.style.display = info.scrollTop < 15 ? 'none' : 'flex';
                scrollDownBtn.style.display = info.scrollTop >= scrollableDistance - 15 ? 'none' : 'flex';
            } else {
                scrollButtons.classList.remove('visible');
            }
        });
    }

    function scrollToTop() {
        const info = getActiveScrollableInfo();
        if (info.target === window) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            info.target.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function scrollToBottom() {
        const info = getActiveScrollableInfo();
        if (info.target === window) {
            window.scrollTo({ top: info.scrollHeight, behavior: 'smooth' });
        } else {
            info.target.scrollTo({ top: info.scrollHeight, behavior: 'smooth' });
        }
    }

    function openFooterLink() {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/about/about.html') });
    }

    /**
     * Right-clicking a header button opens its popup and closes any other. Doing it
     * again on the same button closes that one too, so the same gesture puts it away.
     *
     * The popups ignore a secondary-button mousedown for this to work: mousedown
     * reaches them before contextmenu reaches this handler, so dismissing there would
     * always have closed the popup a moment before the check below could see it open.
     */
    function openPopupOnContextMenu(popupName, e) {
        e.preventDefault();
        const wasOpen = isPopupOpen(popupName);

        showClusterPopup = false;
        showSortGroupsPopup = false;
        showPrefixPopup = false;
        showTimerPopup = false;
        showAllRulesPopup = false;
        showStoragePopup = false;
        showColorPopup = false;
        showDiscardingPopup = false;
        if (wasOpen) return;

        popupTrigger = e.currentTarget;
        if (popupName === 'cluster') showClusterPopup = true;
        else if (popupName === 'sortGroups') showSortGroupsPopup = true;
        else if (popupName === 'prefixes') showPrefixPopup = true;
        else if (popupName === 'timer') showTimerPopup = true;
        else if (popupName === 'allRules') showAllRulesPopup = true;
        else if (popupName === 'storage') showStoragePopup = true;
        else if (popupName === 'color') showColorPopup = true;
        else if (popupName === 'discarding') showDiscardingPopup = true;
    }

    function isPopupOpen(popupName) {
        if (popupName === 'cluster') return showClusterPopup;
        if (popupName === 'sortGroups') return showSortGroupsPopup;
        if (popupName === 'prefixes') return showPrefixPopup;
        if (popupName === 'timer') return showTimerPopup;
        if (popupName === 'allRules') return showAllRulesPopup;
        if (popupName === 'storage') return showStoragePopup;
        if (popupName === 'color') return showColorPopup;
        if (popupName === 'discarding') return showDiscardingPopup;
        return false;
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="container">
    <div class="sticky-rules-header">
        <SidePanelHeader
            title={$t('manageRules') || 'Manage Rules'}
            titleId="header-main-title-rules"
            onTitleClick={toggleTutorial}
            actions={headerActions}
        />
        <menu class="main-menu">
            <div class="action-buttons">
                <button
                    id="add-rule"
                    class="action-button"
                    type="button"
                    tabindex="0"
                    translate="no"
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
                    translate="no"
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
                    translate="no"
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
                    translate="no"
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
        <button
            id="scroll-up"
            type="button"
            translate="no"
            onclick={scrollToTop}
            aria-label={$t('scrollToTop') || 'Scroll to top'}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-linecap="square" />
            </svg>
        </button>
        <button
            id="scroll-down"
            type="button"
            translate="no"
            onclick={scrollToBottom}
            aria-label={$t('scrollToBottom') || 'Scroll to bottom'}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M6 9L12 15L18 9" stroke="var(--text-color)" stroke-linecap="square" />
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
        fileInputId="rules-file-input"
        cancelButtonId="cancel-import-drop"
        cancelTitleKey="cancelImport"
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
        prefill={rulePrefill}
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
    {popupTrigger}
    bind:clusterConfig
    bind:userPrefixes
    bind:timerInactiveTime
    bind:timerActiveTime
    bind:discardingTime
    {selectedRuleColor}
    {storageMode}
    {miscSortOption}
    {onClusterChanged}
    onResetCluster={resetClusterDefaults}
    onSelectMiscSort={(detail) => {
        miscSortOption = detail.value;
        saveSettings({ miscGroupSortOption: detail.value });
    }}
    onResetPrefixes={resetPrefixesDefaults}
    onSavePrefixes={savePrefixes}
    onSaveTimer={() =>
        saveSettings({
            inactiveCollapseTime: Math.min(1440, Math.max(0, timerInactiveTime)),
            activeCollapseTime: Math.min(1440, Math.max(0, timerActiveTime)),
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
    onSelectStorage={switchStorageMode}
    onSaveDiscarding={() =>
        chrome.storage.local.set({
            discardingTimeMinutes: Math.min(1440, Math.max(1, discardingTime)),
            discardingEnabled: true,
        })}
    onResetDiscarding={resetDiscardingDefaults}
/>

<div id="drag-announcer" aria-live="assertive" class="visually-hidden"></div>

<ConfirmDialog />
