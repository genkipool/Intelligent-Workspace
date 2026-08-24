<script>
    /**
     * [AI INSTRUCTION]
     * THE SETTINGS PAGE OF THE WEB ACTIVITY DASHBOARD.
     *
     * It is a view of the same page, not a second one: the sidebar, the header and the
     * loaded payload stay where they are, and only the main column changes. That is
     * what lets a rule edited here show up in the log the moment the user goes back,
     * with no reload and no second copy of the data.
     *
     * The layout is deliberately flat — a head, a row of anchors, then sections
     * separated by a hairline. Settings are already a list of small decisions; putting
     * each one in a card of its own turns a page you can scan into a wall of boxes.
     */
    import { t, tt } from '../../../stores/i18nStore.js';

    import RulesSection from './RulesSection.svelte';
    import PasswordSection from './PasswordSection.svelte';
    import CategoriesSection from './CategoriesSection.svelte';
    import TrackingSection from './TrackingSection.svelte';
    import IgnoredSection from './IgnoredSection.svelte';
    import DataSection from './DataSection.svelte';

    let {
        /** Inside a dialog the header already names the page, so the hero goes. */
        compact = false,
        rules = [],
        settings = {},
        customCategories = [],
        categoryUsage = {},
        dayCount = 0,
        siteCount = 0,
        onEditLimit,
        onEditSchedule,
        onSaveLimit,
        onAddRule,
        onAddCategory,
        onRenameCategory,
        onDeleteCategory,
        onChangeSettings,
        onChangeBlockPassword,
        onIgnoreAdd,
        onIgnoreRemove,
        onExport,
        onImport,
        onClearAll,
        onRestoreDefaults,
    } = $props();
</script>

<div class="wa-settings" class:wa-settings-compact={compact}>
    {#if !compact}
        <header class="wa-set-hero">
            <div>
                <h1 class="wa-set-title">{$t('webActivitySettings')}</h1>
                <p class="wa-set-subtitle">{$t('webActivitySettingsSubtitle')}</p>
            </div>
        </header>
    {/if}

    <h2 class="wa-set-head" title={$tt('webActivitySettingsRulesHint')}>{$t('webActivitySettingsRules')}</h2>
    <section class="wa-set-section" id="wa-set-rules">
        <RulesSection {compact} rows={rules} {onEditLimit} {onEditSchedule} {onSaveLimit} onAdd={onAddRule} />
    </section>

    <!-- Under the rules because it is about the rules: what it guards is weakening
         one. -->
    <h2 class="wa-set-head" title={$tt('webActivitySettingsPassword')}>{$t('webActivitySettingsPassword')}</h2>
    <section class="wa-set-section" id="wa-set-password">
        <PasswordSection lock={settings.blockPassword} onChange={onChangeBlockPassword} />
    </section>

    <h2 class="wa-set-head" title={$tt('webActivitySettingsCategoriesHint')}>
        {$t('webActivitySettingsCategories')}
    </h2>
    <section class="wa-set-section" id="wa-set-categories">
        <CategoriesSection
            custom={customCategories}
            usage={categoryUsage}
            onAdd={onAddCategory}
            onRename={onRenameCategory}
            onDelete={onDeleteCategory}
        />
    </section>

    <h2 class="wa-set-head" title={$tt('webActivitySettingsTrackingHint')}>{$t('webActivitySettingsTracking')}</h2>
    <section class="wa-set-section" id="wa-set-tracking">
        <TrackingSection {settings} onChange={onChangeSettings} />
    </section>

    <h2 class="wa-set-head" title={$tt('webActivitySettingsIgnoredHint')}>{$t('webActivitySettingsIgnored')}</h2>
    <section class="wa-set-section" id="wa-set-ignored">
        <IgnoredSection
            domains={settings.ignoredDomains || []}
            columns={compact ? 2 : 3}
            onAdd={onIgnoreAdd}
            onRemove={onIgnoreRemove}
        />
    </section>

    <h2 class="wa-set-head" title={$tt('webActivitySettingsDataHint')}>{$t('webActivitySettingsData')}</h2>
    <section class="wa-set-section" id="wa-set-data">
        <DataSection {onExport} {onImport} {onClearAll} {onRestoreDefaults} {dayCount} {siteCount} />
    </section>
</div>
