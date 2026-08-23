<script>
    import AnchoredPopup from './AnchoredPopup.svelte';
    import OptionButtons from '../components/OptionButtons.svelte';
    import { t } from '../../../stores/i18nStore.js';

    // `selected` marks the option currently in force. Without it the popup opened
    // with nothing highlighted, unlike the same list in the settings modal.
    let { show = false, trigger = null, selected = 'start', onclose, onselect } = $props();

    // Re-picking the option already in force is not filtered out the way the storage
    // popup filters its own: re-sorting is idempotent and costs nothing, whereas
    // switching storage area reloads every rule.
    function select(value) {
        onselect?.({ value });
    }
</script>

<AnchoredPopup {show} {trigger} {onclose} class="misc-sort-popup">
    <OptionButtons
        ariaPressed
        title={$t('miscSortTitle')}
        {selected}
        options={[
            { value: 'start', label: $t('miscSortStart') },
            { value: 'end', label: $t('miscSortEnd') },
            { value: 'alpha', label: $t('miscSortAlpha') },
        ]}
        onselect={select}
    />
</AnchoredPopup>
