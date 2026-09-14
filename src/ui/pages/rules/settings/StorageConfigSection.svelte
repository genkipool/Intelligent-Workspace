<script>
    import SettingsToggleSection from './SettingsToggleSection.svelte';
    import OptionButtons from '../components/OptionButtons.svelte';
    import { t, tt } from '../../../stores/i18nStore.js';

    let {
        allRulesActive = $bindable(false),
        ruleStorageArea = $bindable('sync'),
        ontoggleall = () => {},
        onsetstorage = () => {},
    } = $props();
</script>

<!--
    The switch here does not own its state: flipping it rewrites `active` on every
    stored rule and the row follows what came back, so it hands the event straight to
    `ontoggleall` rather than settling the binding itself.
-->
<SettingsToggleSection
    id="modal-storage-section"
    icon="#icon-all-rules"
    viewBox="0 0 48 48"
    iconClass="svg-settings-container all-rules-checks button-rules-header"
    iconTitle={$tt('configureStorageCtrlClick')}
    label={$t('toggleAllRules') || 'All Rules'}
    checked={allRulesActive}
    onchange={() => ontoggleall()}
>
    <div class="storage-config-popup misc-sort-popup">
        <OptionButtons
            title={$t('configureStorageTitle')}
            selected={ruleStorageArea}
            options={[
                { value: 'sync', label: $t('storageSync') || 'Sync', title: $tt('storageSyncDesc') || 'Sync storage' },
                {
                    value: 'local',
                    label: $t('storageLocal') || 'Local',
                    title: $tt('storageLocalDesc') || 'Local storage',
                },
            ]}
            onselect={onsetstorage}
        />
    </div>
</SettingsToggleSection>
