<script>
    import AnchoredPopup from './AnchoredPopup.svelte';
    import OptionButtons from '../components/OptionButtons.svelte';
    import { t, tt } from '../../../stores/i18nStore.js';

    let { show = false, trigger = null, selectedMode = 'sync', onclose, onselect } = $props();

    // Choosing does not close: switching area reloads the rules and raises two
    // notifications, and the popup staying up is what shows the selection moved.
    // It closes on a click outside or Escape.
    function select(value) {
        // Picking the mode already in use is not a change.
        if (value === selectedMode) return;
        onselect?.({ value });
    }
</script>

<AnchoredPopup {show} {trigger} {onclose} class="storage-config-popup misc-sort-popup">
    <OptionButtons
        title={$t('configureStorageTitle')}
        selected={selectedMode}
        options={[
            { value: 'sync', label: $t('storageSync'), title: $tt('storageSyncDesc') },
            { value: 'local', label: $t('storageLocal'), title: $tt('storageLocalDesc') },
        ]}
        onselect={select}
    />
</AnchoredPopup>
