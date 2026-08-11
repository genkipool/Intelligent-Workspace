<script>
    import { onMount } from 'svelte';
    import { i18nStore, t, tt } from '../../stores/i18nStore.js';
    import { themeStore } from '../../stores/themeStore.js';
    import Notification from '../../components/common/Notification.svelte';
    import DonationSection from '../../components/common/DonationSection.svelte';
    import FeedbackSection from '../../components/common/FeedbackSection.svelte';
    import FeatureItem from '../../components/common/FeatureItem.svelte';

    import icon128 from '../../../../assets/icons/icon128.png';
    import teamImg from '../../../../assets/images/about/team.png';
    import { initializeKeyboardNavigation } from '../../../utils/keyboardNav.js';

    onMount(async () => {
        await i18nStore.init();
        await themeStore.init();
        initializeKeyboardNavigation();
    });

    const ITEMS_PER_PAGE = 5;
    let currentPage = $state(1);

    // --- VERSION DATA ---
    const versionData = [
        {
            version: '1.0.0',
            dateKey: 'date_2025_07_20',
            features: [
                'feature_v100_geminiIntegration',
                'feature_v100_youtubeIntegration',
                'feature_v100_splitScreen',
                'feature_v100_fileDownloader',
                'feature_v100_openInPanel',
                'feature_v100_readerView',
                'feature_v100_compact_mode',
                'feature_v100_core_rule_management',
                'feature_v100_auto_tab_grouping',
                'feature_v100_i18n_support',
                'feature_v100_theme_support_basic',
                'feature_v100_manual_rule_reorder',
                'feature_v100_advanced_config',
                'feature_v100_status_prefixes',
                'feature_v100_autocollapse_timer',
                'feature_v100_notes_kanban',
                'feature_v100_text_snippets',
                'feature_v100_cookie_editor',
                'feature_v100_screenshot_tool',
                'feature_v100_screenshot_ocr',
                'feature_pauseGrouping',
                'feature_createRuleFromSubgroup',
                'feature_addSubgroupToExistingRule',
                'feature_collapseExpandAll',
                'feature_deleteEmptyGroups',
                'feature_saveSession',
                'feature_shortcutsOrphans',
                'feature_aiSidePanel',
                'feature_editDownloadAI',
                'feature_bookmark_create_folder',
                'feature_bookmark_edit',
                'feature_bookmark_create_rule',
                'feature_bookmark_add_to_rule',
                'feature_bookmark_open',
                'feature_bookmark_delete',
                'feature_bookmark_export_import',
                'feature_omnibar_floating',
                'feature_omnibar_snippets_docs',
                'feature_v100_pomodoro_dashboard',
                'feature_v100_agent_mode',
                'feature_v100_tutorial_system',
                'feature_v100_independent_pinning',
                'feature_v100_full_keyboard_accessibility',
                'feature_v100_bookmarks_drag_drop',
                'feature_geminiAttachFiles',
                'feature_geminiVoiceInput',
                'feature_findNextInPage',
                'feature_contextMenuPipPopup',
                'feature_listGroupPipPopup',
                'feature_navigationPipPopup',
                'feature_omnibarPipPopup',
                'feature_shortcuts_backup_restore_groups',
                'feature_omnibar_backup_search',
                'feature_v100_videoPip',
                'feature_v100_omnibar_ar_shortcut',
                'feature_v100_omnibar_ae_shortcut',
                'feature_v100_omnibar_are_shortcut',
                'feature_v100_omnibar_rl_shortcut',
                'feature_v100_dedup_add_to_rule',
            ],
        },
        {
            version: '0.9.9 (Beta)',
            dateKey: 'date_2025_07_02',
            features: [
                'feature_v099_listGroupView',
                'feature_v099_advancedSearch',
                'feature_v099_duplicateRemoval',
                'feature_v099_groupPinningHiding',
                'feature_v099_context_menu_management',
                'feature_v099_rule_search',
                'feature_v099_context_menu_toggles',
                'feature_v099_performance_tuning',
                'feature_v099_about_page',
                'feature_v099_final_fixes',
                'feature_v099_theme_scheduling',
            ],
        },
        {
            version: '0.9.8 (Beta)',
            dateKey: 'date_2025_06_14',
            features: [
                'feature_v098_groupReordering',
                'feature_v098_favicon_coloring',
                'feature_v098_ip_localhost_grouping',
                'feature_v098_final_ui_polish',
            ],
        },
        {
            version: '0.9.7 (Beta)',
            dateKey: 'date_2025_05_28',
            features: [
                'feature_v097_cluster_config_popup',
                'feature_v097_prefix_config',
                'feature_v097_misc_sort_option',
                'feature_v097_cloud_local_storage',
            ],
        },
        {
            version: '0.9.6 (Beta)',
            dateKey: 'date_2025_05_12',
            features: ['feature_v096_import_validation', 'feature_v096_tooltips'],
        },
        {
            version: '0.9.5 (Beta)',
            dateKey: 'date_2025_04_27',
            features: [
                'feature_v095_keyboard_nav_rules',
                'feature_v095_toggle_all_rules',
                'feature_v095_import_export_rules',
                'feature_v095_import_export_themes',
            ],
        },
        {
            version: '0.9.4 (Beta)',
            dateKey: 'date_2025_04_11',
            features: [
                'feature_v094_inline_url_editing',
                'feature_v094_rule_modal_ux',
                'feature_v094_dnd_reorder_themes',
            ],
        },
        {
            version: '0.9.3 (Beta)',
            dateKey: 'date_2025_03_27',
            features: ['feature_v093_rule_name_editing', 'feature_v093_real_time_validation'],
        },
        {
            version: '0.9.2 (Beta)',
            dateKey: 'date_2025_03_12',
            features: [
                'feature_v092_star_rules',
                'feature_v092_inline_color_change',
                'feature_v092_expand_collapse_urls',
                'feature_v092_inline_rename_themes',
            ],
        },
        {
            version: '0.9.1 (Beta)',
            dateKey: 'date_2025_02_26',
            features: ['feature_v091_popup_ux', 'feature_v091_feedback_links', 'feature_v091_theme_editor'],
        },
        {
            version: '0.9.0 (Beta)',
            dateKey: 'date_2025_02_11',
            features: ['feature_beta_proto', 'feature_beta_basic_grouping', 'feature_beta_manual_reorder'],
        },
    ];

    const totalPages = Math.ceil(versionData.length / ITEMS_PER_PAGE);
    let versionsToDisplay = $derived(
        versionData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    );

    function goToPrevPage() {
        if (currentPage > 1) currentPage--;
    }
    function goToNextPage() {
        if (currentPage < totalPages) currentPage++;
    }

    let expandedVersions = $state({});
    function toggleVersion(index) {
        expandedVersions[index] = !expandedVersions[index];
    }

    function goBack() {
        if (chrome && chrome.tabs) {
            chrome.tabs.query({ url: chrome.runtime.getURL('src/ui/pages/popup/popup.html') }, (popupTabs) => {
                chrome.tabs.query({ url: chrome.runtime.getURL('src/ui/pages/rules/rules.html') }, (rulesTabs) => {
                    if (rulesTabs.length > 0) {
                        chrome.tabs.update(rulesTabs[0].id, { active: true });
                        chrome.windows.update(rulesTabs[0].windowId, { focused: true });
                    } else if (popupTabs.length > 0) {
                        chrome.tabs.update(popupTabs[0].id, { active: true });
                        chrome.windows.update(popupTabs[0].windowId, { focused: true });
                    } else {
                        chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/pages/rules/rules.html') });
                    }
                    window.close();
                });
            });
        } else {
            window.history.back();
        }
    }
</script>

<div class="page-container">
    <Notification />
    <header class="header-main">
        <button
            type="button"
            onclick={goBack}
            class="back-button"
            title={$tt('backToMainPopup')}
            aria-label="Back to main popup"
        >
            <span class="material-icons-sharp" translate="no" aria-hidden="true">arrow_back_ios_new</span>
        </button>
        <h2>{$t('aboutApp')}</h2>
        <div class="header-spacer"></div>
    </header>

    <main class="content-area">
        <section class="intro-section card">
            <div class="intro-content">
                <img src={icon128} alt="Intelligent Workspace Logo" class="app-logo" />
                <div class="intro-text">
                    <h1>{$t('appName')}</h1>
                    <p class="app-tagline">{$t('appDescription')}</p>
                </div>
            </div>
        </section>

        <section class="version-history-section card">
            <div class="version-history-header">
                <h3>{$t('versionHistory')}</h3>
                <div class="pagination-controls-header">
                    <button
                        type="button"
                        onclick={goToPrevPage}
                        class="pagination-button"
                        title={$tt('previousVersions')}
                        disabled={currentPage === 1}
                    >
                        <span class="material-icons-sharp" aria-hidden="true">chevron_left</span>
                    </button>
                    <span class="page-indicator">{currentPage} / {totalPages}</span>
                    <button
                        type="button"
                        onclick={goToNextPage}
                        class="pagination-button"
                        title={$tt('nextVersions')}
                        disabled={currentPage === totalPages}
                    >
                        <span class="material-icons-sharp" aria-hidden="true">chevron_right</span>
                    </button>
                </div>
            </div>
            <div class="version-list">
                {#each versionsToDisplay as version, idx (version.version)}
                    <div class="version-item">
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div
                            class="version-header"
                            class:expanded={(currentPage === 1 && idx === 0) || expandedVersions[idx]}
                            onclick={() => toggleVersion(idx)}
                        >
                            <h4>Version {version.version}</h4>
                            <span class="version-date">{$t(version.dateKey)}</span>
                            <button type="button" class="toggle-details-btn" aria-label="Toggle version details">
                                <span class="material-icons-sharp">chevron_right</span>
                            </button>
                        </div>
                        <div
                            class="version-details"
                            class:expanded={(currentPage === 1 && idx === 0) || expandedVersions[idx]}
                        >
                            <div class="features-list-items">
                                {#each version.features as feature (feature)}
                                    <div class="feature-list-item">
                                        {#if feature.startsWith('feature_') || feature.startsWith('date_')}
                                            {$t(feature)}
                                        {:else}
                                            {feature}
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
            <div class="pagination-controls" style="display: {totalPages > 1 ? 'flex' : 'none'}">
                <button
                    type="button"
                    onclick={goToPrevPage}
                    class="pagination-button"
                    title={$tt('previousVersions')}
                    disabled={currentPage === 1}
                >
                    <span class="material-icons-sharp">chevron_left</span>
                    <span>{$t('previous')}</span>
                </button>
                <span class="page-indicator">{currentPage} / {totalPages}</span>
                <button
                    type="button"
                    onclick={goToNextPage}
                    class="pagination-button"
                    title={$tt('nextVersions')}
                    disabled={currentPage === totalPages}
                >
                    <span>{$t('next')}</span>
                    <span class="material-icons-sharp">chevron_right</span>
                </button>
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionManageRules')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="device_hub" textKey="featureAutoGrouping" />
                <FeatureItem isMaterial={true} iconName="rule" textKey="featureCustomRules" />
                <FeatureItem isMaterial={true} iconName="tune" textKey="featureAdvancedConfig" />
                <FeatureItem isMaterial={true} iconName="timer" textKey="featureAutoCollapse" />
                <FeatureItem isMaterial={true} iconName="pause_circle_outline" textKey="feature_pauseGrouping" />
                <FeatureItem isMaterial={true} iconName="label" textKey="featureStatusPrefixes" />
                <FeatureItem isMaterial={true} iconName="rule" textKey="featureContextMenu_rules" />
                <FeatureItem isMaterial={true} iconName="toggle_on" textKey="featureContextMenu_toggles" />
                <FeatureItem isMaterial={true} iconName="account_tree" textKey="feature_createRuleFromSubgroup" />
                <FeatureItem isMaterial={true} iconName="playlist_add" textKey="feature_addSubgroupToExistingRule" />
                <FeatureItem isMaterial={true} iconName="low_priority" textKey="feature_v100_manual_rule_reorder" />
                <FeatureItem isMaterial={true} iconName="search" textKey="feature_v099_rule_search" />
                <FeatureItem isMaterial={true} iconName="compress" textKey="featureCompactGrouping" />
                <FeatureItem isMaterial={true} iconName="import_export" textKey="featureImportExport" />
                <FeatureItem isMaterial={true} iconName="language" textKey="featureMultiLanguage" />
                <FeatureItem isMaterial={true} iconName="account_tree" textKey="featureDetailedClustering" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionListGroups')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="view_list" textKey="feature_listGroupView" />
                <FeatureItem isMaterial={true} iconName="manage_search" textKey="feature_advancedSearch" />
                <FeatureItem isMaterial={false} svgId="icon-duplicates" textKey="feature_duplicateRemoval" />
                <FeatureItem isMaterial={false} svgId="icon-split-screen" textKey="feature_splitScreen" />
                <FeatureItem isMaterial={false} svgId="icon-open-panel" textKey="feature_openInPanel" />
                <FeatureItem isMaterial={true} iconName="swap_vert" textKey="feature_v098_groupReordering" />
                <FeatureItem isMaterial={true} iconName="save" textKey="feature_backupGroup" />
                <FeatureItem isMaterial={true} iconName="visibility_off" textKey="feature_hideGroup" />
                <FeatureItem isMaterial={true} iconName="content_copy" textKey="feature_copyAllUrls" />
                <FeatureItem isMaterial={true} iconName="delete_sweep" textKey="feature_deleteGroupTabs" />
                <FeatureItem isMaterial={true} iconName="close" textKey="feature_closeTab" />
                <FeatureItem isMaterial={true} iconName="volume_off" textKey="feature_muteTab" />
                <FeatureItem isMaterial={true} iconName="qr_code" textKey="feature_showQrCode" />
                <FeatureItem isMaterial={true} iconName="screenshot" textKey="feature_v100_screenshot_tool" />
                <FeatureItem isMaterial={true} iconName="document_scanner" textKey="feature_v100_screenshot_ocr" />
                <FeatureItem isMaterial={true} iconName="edit_note" textKey="feature_v100_notes_kanban" />
                <FeatureItem isMaterial={true} iconName="unfold_less" textKey="feature_collapseExpandAll" />
                <FeatureItem isMaterial={true} iconName="delete_outline" textKey="feature_deleteEmptyGroups" />
                <FeatureItem isMaterial={true} iconName="history" textKey="feature_saveSession" />
                <FeatureItem isMaterial={true} iconName="find_in_page" textKey="feature_shortcutsOrphans" />
                <FeatureItem isMaterial={true} iconName="school" textKey="feature_tutorial_system" />
                <FeatureItem isMaterial={true} iconName="push_pin" textKey="feature_independent_pinning" />
                <FeatureItem isMaterial={true} iconName="keyboard_tab" textKey="feature_full_keyboard_accessibility" />
                <FeatureItem isMaterial={true} iconName="memory" textKey="feature_tab_discarding" />
                <FeatureItem isMaterial={true} iconName="find_replace" textKey="feature_findNextInPage" />
                <FeatureItem isMaterial={true} iconName="picture_in_picture_alt" textKey="feature_listGroupPipPopup" />
                <FeatureItem isMaterial={true} iconName="video_settings" textKey="feature_listGroupVideoPip" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionAIAssistant')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={false} svgId="icon-star" textKey="feature_geminiIntegration" />
                <FeatureItem isMaterial={true} iconName="subject" textKey="feature_summarizeWithGemini" />
                <FeatureItem isMaterial={true} iconName="record_voice_over" textKey="feature_geminiReadAloud" />
                <FeatureItem isMaterial={true} iconName="schedule" textKey="feature_scheduleGeminiQuery" />
                <FeatureItem isMaterial={true} iconName="vertical_split" textKey="feature_aiSidePanel" />
                <FeatureItem isMaterial={true} iconName="download" textKey="feature_editDownloadAI" />
                <FeatureItem isMaterial={true} iconName="psychology" textKey="feature_agent_mode" />
                <FeatureItem isMaterial={true} iconName="attach_file" textKey="feature_geminiAttachFiles" />
                <FeatureItem isMaterial={true} iconName="mic" textKey="feature_geminiVoiceInput" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionPomodoro')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="timer" textKey="feature_pomodoro_tracking" />
                <FeatureItem isMaterial={true} iconName="open_in_browser" textKey="feature_pomodoro_floating_timer" />
                <FeatureItem isMaterial={true} iconName="analytics" textKey="feature_pomodoro_stats" />
                <FeatureItem isMaterial={true} iconName="settings_suggest" textKey="feature_pomodoro_config" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionListBookmarks')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="bookmarks" textKey="feature_bookmarks_search" />
                <FeatureItem isMaterial={true} iconName="create_new_folder" textKey="feature_bookmark_create_folder" />
                <FeatureItem isMaterial={true} iconName="edit" textKey="feature_bookmark_edit" />
                <FeatureItem isMaterial={true} iconName="rule_folder" textKey="feature_bookmark_create_rule" />
                <FeatureItem isMaterial={true} iconName="add_link" textKey="feature_bookmark_add_to_rule" />
                <FeatureItem isMaterial={true} iconName="tab" textKey="feature_bookmark_open" />
                <FeatureItem isMaterial={true} iconName="delete" textKey="feature_bookmark_delete" />
                <FeatureItem isMaterial={true} iconName="import_export" textKey="feature_bookmark_export_import" />
                <FeatureItem isMaterial={true} iconName="drag_indicator" textKey="feature_bookmarks_drag_drop" />
                <FeatureItem isMaterial={true} iconName="bookmark_add" textKey="feature_addToBookmarks" />
                <FeatureItem isMaterial={true} iconName="bolt" textKey="feature_bookmarks_access" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionListHistory')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="manage_search" textKey="feature_history_search" />
                <FeatureItem isMaterial={true} iconName="delete_sweep" textKey="feature_history_delete" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionListRecentlyClosed')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="restore" textKey="feature_recently_closed_restore" />
                <FeatureItem isMaterial={true} iconName="format_list_bulleted" textKey="feature_recently_closed_list" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionListReading')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="chrome_reader_mode" textKey="feature_reading_list_access" />
                <FeatureItem isMaterial={false} svgId="icon-reader" textKey="feature_readerView" />
                <FeatureItem isMaterial={true} iconName="auto_stories" textKey="feature_changePageMode" />
                <FeatureItem isMaterial={true} iconName="smart_display" textKey="feature_youtubeIntegration" />
                <FeatureItem isMaterial={true} iconName="video_library" textKey="feature_videoPip" />
                <FeatureItem isMaterial={true} iconName="file_download" textKey="feature_fileDownloader" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionManageNavigationShortcuts')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="keyboard" textKey="featureKeyboardNavigation" />
                <FeatureItem isMaterial={true} iconName="touch_app" textKey="feature_keyboard_hints" />
                <FeatureItem
                    isMaterial={true}
                    iconName="keyboard_command_key"
                    textKey="feature_v095_keyboard_nav_rules"
                />
                <FeatureItem isMaterial={true} iconName="cookie" textKey="feature_v100_cookie_editor" />
                <FeatureItem isMaterial={true} iconName="text_snippet" textKey="feature_v100_text_snippets" />
                <FeatureItem isMaterial={true} iconName="download" textKey="feature_showDownloads" />
                <FeatureItem isMaterial={true} iconName="shortcut" textKey="feature_custom_site_shortcuts" />
                <FeatureItem isMaterial={true} iconName="bolt" textKey="feature_page_action_shortcuts" />
                <FeatureItem isMaterial={true} iconName="tab_unselected" textKey="feature_tab_management_shortcuts" />
                <FeatureItem isMaterial={true} iconName="contrast" textKey="feature_display_mode_shortcuts" />
                <FeatureItem
                    isMaterial={true}
                    iconName="settings_backup_restore"
                    textKey="feature_shortcuts_backup_reset"
                />
                <FeatureItem isMaterial={true} iconName="keyboard_alt" textKey="feature_omnibar_prefix_customization" />
                <FeatureItem isMaterial={true} iconName="shortcut" textKey="feature_navigationPipPopup" />
                <FeatureItem isMaterial={true} iconName="shortcut" textKey="feature_navigationVideoPip" />
                <FeatureItem isMaterial={true} iconName="open_in_new" textKey="feature_contextMenuPipPopup" />
                <FeatureItem isMaterial={true} iconName="video_settings" textKey="feature_contextMenuVideoPip" />
                <FeatureItem isMaterial={true} iconName="save" textKey="feature_shortcuts_backup_restore_groups" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionManageThemes')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="palette" textKey="feature_v091_theme_editor" />
                <FeatureItem isMaterial={true} iconName="schedule" textKey="feature_v099_theme_scheduling" />
                <FeatureItem isMaterial={true} iconName="import_export" textKey="feature_v095_import_export_themes" />
                <FeatureItem isMaterial={true} iconName="cloud_queue" textKey="feature_v097_cloud_local_storage" />
                <FeatureItem isMaterial={true} iconName="colorize" textKey="featureFaviconColoring" />
            </div>
        </section>

        <section class="features-section card">
            <h3>{$t('sectionOmnibar')}</h3>
            <div class="features-grid">
                <FeatureItem isMaterial={true} iconName="smart_toy" textKey="feature_ai_omnibar" />
                <FeatureItem isMaterial={true} iconName="keyboard_alt" textKey="feature_omnibar_prefixes" />
                <FeatureItem isMaterial={true} iconName="manage_search" textKey="feature_omnibar_search_notes" />
                <FeatureItem isMaterial={true} iconName="search" textKey="feature_omnibar_floating" />
                <FeatureItem isMaterial={true} iconName="text_fields" textKey="feature_omnibar_snippets_docs" />
                <FeatureItem isMaterial={true} iconName="workspaces" textKey="feature_omnibar_tab_groups" />
                <FeatureItem isMaterial={true} iconName="find_in_page" textKey="feature_omnibar_deep_search" />
                <FeatureItem isMaterial={true} iconName="psychology_alt" textKey="feature_omnibar_ai_agent" />
                <FeatureItem isMaterial={true} iconName="travel_explore" textKey="feature_omnibar_web_search" />
                <FeatureItem isMaterial={true} iconName="filter_list" textKey="feature_omnibar_tab_selector" />
                <FeatureItem isMaterial={true} iconName="history_edu" textKey="feature_omnibar_ai_history" />
                <FeatureItem isMaterial={true} iconName="photo_library" textKey="feature_omnibar_gallery" />
                <FeatureItem isMaterial={true} iconName="picture_in_picture_alt" textKey="feature_omnibarPipPopup" />
                <FeatureItem isMaterial={true} iconName="smart_display" textKey="feature_omnibarVideoPip" />
                <FeatureItem isMaterial={true} iconName="restore_page" textKey="feature_omnibar_backup_search" />
                <FeatureItem isMaterial={true} iconName="add_box" textKey="feature_v100_omnibar_ar_shortcut" />
                <FeatureItem isMaterial={true} iconName="playlist_add" textKey="feature_v100_omnibar_ae_shortcut" />
                <FeatureItem
                    isMaterial={true}
                    iconName="playlist_add_check"
                    textKey="feature_v100_omnibar_are_shortcut"
                />
                <FeatureItem isMaterial={true} iconName="rule" textKey="feature_v100_omnibar_rl_shortcut" />
                <FeatureItem isMaterial={true} iconName="cleaning_services" textKey="feature_v100_dedup_add_to_rule" />
            </div>
        </section>

        <div class="info-grid">
            <section class="permissions-section card">
                <h3>{$t('permissionsUsed')}</h3>
                <p>{$t('permissionsNotice')}</p>
                <p></p>
                <ul>
                    <li><strong translate="no">tabs:</strong> <span>{$t('permTabs')}</span></li>
                    <li><strong translate="no">tabGroups:</strong> <span>{$t('permTabGroups')}</span></li>
                    <li><strong translate="no">storage:</strong> <span>{$t('permStorage')}</span></li>
                    <li><strong translate="no">favicon:</strong> <span>{$t('permFavicon')}</span></li>
                    <li><strong translate="no">commands:</strong> <span>{$t('permCommandsDesc')}</span></li>
                    <li><strong translate="no">contextMenus:</strong> <span>{$t('permContextMenus')}</span></li>
                    <li><strong translate="no">notifications:</strong> <span>{$t('permNotifications')}</span></li>
                    <li><strong translate="no">sidePanel:</strong> <span>{$t('permSidePanel')}</span></li>
                    <li><strong translate="no">scripting:</strong> <span>{$t('permScripting')}</span></li>
                    <li><strong translate="no">downloads:</strong> <span>{$t('permDownloads')}</span></li>
                    <li><strong translate="no">system.display:</strong> <span>{$t('permSystemDisplay')}</span></li>
                    <li><strong translate="no">windows:</strong> <span>{$t('permWindows')}</span></li>
                    <li>
                        <strong translate="no">declarativeNetRequest:</strong>
                        <span>{$t('permDeclarativeNetRequest')}</span>
                    </li>
                    <li>
                        <strong translate="no">declarativeNetRequestWithHostAccess:</strong>
                        <span>{$t('permDeclarativeNetRequestWithHostAccess')}</span>
                    </li>
                    <li><strong translate="no">cookies:</strong> <span>{$t('permCookies')}</span></li>
                    <li><strong translate="no">history:</strong> <span>{$t('permHistory')}</span></li>
                    <li><strong translate="no">sessions:</strong> <span>{$t('permSessions')}</span></li>
                    <li><strong translate="no">bookmarks:</strong> <span>{$t('permBookmarks')}</span></li>
                    <li><strong translate="no">readingList:</strong> <span>{$t('permReadingList')}</span></li>
                    <li><strong translate="no">clipboardWrite:</strong> <span>{$t('permClipboardWrite')}</span></li>
                    <li><strong translate="no">alarms:</strong> <span>{$t('permAlarms')}</span></li>
                    <li><strong translate="no">offscreen:</strong> <span>{$t('permOffscreen')}</span></li>
                </ul>

                <p>{$t('privacyCommitment')}</p>
            </section>

            <section id="feedback-section" class="feedback-section card">
                <h3>{$t('teamTitle')}</h3>
                <div class="team-content">
                    <img src={teamImg} alt="Team Photo" class="team-photo" />
                    <div class="team-members">
                        <p class="team-member">
                            <strong>{$t('teamMember1Name')}</strong><span>{$t('teamMember1Role')}</span>
                        </p>
                        <p class="team-member">
                            <strong>{$t('teamMember2Name')}</strong><span>{$t('teamMember2Role')}</span>
                        </p>
                    </div>
                </div>
                <h3>{$t('feedbackSupport')}</h3>
                <p>{$t('feedbackDescText')}</p>
                <FeedbackSection variant="about" email="intelligent.tab.group@gmail.com" />
                <h3 class="donation-title">{$t('donation')}</h3>
                <p>{$t('donationDescText')}</p>
                <DonationSection variant="about" />
                <h3 class="acknowledgements-title">{$t('acknowledgements')}</h3>
                <p class="acknowledgements-text">
                    <span>{$t('ThanksDesc_nameThanksDesc_part1')}</span><span class="acknowledged-name"
                        >{$t('ThanksDesc_name')}</span
                    ><span class="acknowledged-end">{$t('ThanksDesc_end')}</span>
                </p>
                <p class="acknowledgements-text">
                    <span>{$t('ThanksDesc_nameThanksDesc_part2')}</span><span class="acknowledged-name"
                        >{$t('ThanksDesc_name')}</span
                    ><span>{$t('ThanksDesc_nameThanksDesc_part3')}</span>
                </p>
                <h3 class="rate-extension-title">{$t('rateExtensionTitle')}</h3>
                <p class="rate-extension-desc">{$t('rateExtensionDesc')}</p>
                <div class="rate-button-container">
                    <a
                        href="https://chromewebstore.google.com/category/extensions"
                        id="rate-store-link"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="rate-store-btn"
                    >
                        <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                        <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                        <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                        <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                        <span class="material-icons-sharp" translate="no" aria-hidden="true">star</span>
                        <span>{$t('rateExtensionBtn')}</span>
                    </a>
                </div>
            </section>
        </div>
    </main>

    <footer class="page-footer">
        <p>(c) <span id="current-year">{$t('nameOrganitation')}</span></p>
        <p><span>{$t('appName')}</span> - <span>{$t('tagline')}</span></p>
    </footer>
</div>
