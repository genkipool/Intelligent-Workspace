<script>
    import ClusterConfigPopup from './ClusterConfigPopup.svelte';
    import MiscSortPopup from './MiscSortPopup.svelte';
    import PrefixConfigPopup from './PrefixConfigPopup.svelte';
    import CollapseTimerPopup from './CollapseTimerPopup.svelte';
    import ColorPopup from './ColorPopup.svelte';
    import StorageConfigPopup from './StorageConfigPopup.svelte';
    import DiscardingConfigPopup from './DiscardingConfigPopup.svelte';

    let {
        showClusterPopup = $bindable(false),
        showSortGroupsPopup = $bindable(false),
        showPrefixPopup = $bindable(false),
        showTimerPopup = $bindable(false),
        showColorPopup = $bindable(false),
        showStoragePopup = $bindable(false),
        showDiscardingPopup = $bindable(false),
        popupPosition = { x: 0, y: 0 },
        clusterConfig = $bindable({}),
        userPrefixes = $bindable({}),
        timerInactiveTime = $bindable(1),
        timerActiveTime = $bindable(15),
        discardingTime = $bindable(60),
        selectedRuleColor = 'blue',
        storageMode = 'sync',
        miscSortOption = 'start',
        onClusterChanged = () => {},
        onResetCluster = () => {},
        onSelectMiscSort = () => {},
        onResetPrefixes = () => {},
        onSavePrefixes = () => {},
        onSaveTimer = () => {},
        onResetTimer = () => {},
        onSelectColor = () => {},
        onCloseColor = () => {},
        onSelectStorage = () => {},
        onSaveDiscarding = () => {},
        onResetDiscarding = () => {},
    } = $props();
</script>

<ClusterConfigPopup
    show={showClusterPopup}
    position={popupPosition}
    bind:clusterConfig
    onchange={onClusterChanged}
    onclose={() => (showClusterPopup = false)}
    onreset={onResetCluster}
/>
<MiscSortPopup
    show={showSortGroupsPopup}
    position={popupPosition}
    selected={miscSortOption}
    onclose={() => (showSortGroupsPopup = false)}
    onselect={onSelectMiscSort}
/>
<PrefixConfigPopup
    show={showPrefixPopup}
    position={popupPosition}
    bind:lock={userPrefixes.lock}
    bind:openKey={userPrefixes.openKey}
    bind:loupe={userPrefixes.loupe}
    bind:checked={userPrefixes.checked}
    bind:warning={userPrefixes.warning}
    onclose={() => {
        showPrefixPopup = false;
        onSavePrefixes();
    }}
    onreset={onResetPrefixes}
/>
<CollapseTimerPopup
    show={showTimerPopup}
    position={popupPosition}
    bind:inactiveTime={timerInactiveTime}
    bind:activeTime={timerActiveTime}
    onclose={() => {
        showTimerPopup = false;
        onSaveTimer();
    }}
    onreset={onResetTimer}
/>
<ColorPopup
    show={showColorPopup}
    position={popupPosition}
    selectedColor={selectedRuleColor}
    onclose={() => {
        showColorPopup = false;
        onCloseColor();
    }}
    onselect={(detail) => {
        showColorPopup = false;
        onSelectColor(detail);
    }}
/>
<StorageConfigPopup
    show={showStoragePopup}
    position={popupPosition}
    selectedMode={storageMode}
    onclose={() => (showStoragePopup = false)}
    onselect={onSelectStorage}
/>
<DiscardingConfigPopup
    show={showDiscardingPopup}
    position={popupPosition}
    bind:discardingTime
    onclose={() => {
        showDiscardingPopup = false;
        onSaveDiscarding();
    }}
    onreset={onResetDiscarding}
/>
