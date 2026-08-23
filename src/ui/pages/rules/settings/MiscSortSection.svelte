<script>
    import SettingsToggleSection from './SettingsToggleSection.svelte';
    import OptionButtons from '../components/OptionButtons.svelte';
    import { t } from '../../../stores/i18nStore.js';

    let { isSortGroupsEnabled = $bindable(true), miscSortOption = $bindable('start'), onset = () => {} } = $props();

    function setMiscSort(option) {
        miscSortOption = option;
        onset(option);
    }
</script>

<SettingsToggleSection
    id="modal-sort-section"
    icon="#icon-sort-groups"
    viewBox="-51.2 -51.2 614.4 614.4"
    iconStyle="color: var(--text-color); --icon-bg: var(--bg-panel-color);"
    label={$t('toggleSortGroups') || 'Sort Groups'}
    bind:checked={isSortGroupsEnabled}
>
    <div class="misc-sort-popup">
        <OptionButtons
            title={$t('miscSortTitle')}
            selected={miscSortOption}
            options={[
                { value: 'start', label: $t('miscSortStart') || 'Start' },
                { value: 'end', label: $t('miscSortEnd') || 'End' },
                { value: 'alpha', label: $t('miscSortAlpha') || 'Alphabetical' },
            ]}
            onselect={setMiscSort}
        />
    </div>
</SettingsToggleSection>
