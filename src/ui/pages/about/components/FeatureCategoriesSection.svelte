<script>
    import { t } from '../../../stores/i18nStore.js';
    import FeatureItem from '../../../components/common/FeatureItem.svelte';
</script>

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
        <FeatureItem isMaterial={true} iconName="inbox" textKey="featureSingleTabGrouping" />
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
        <FeatureItem isMaterial={true} iconName="cookie" textKey="feature_v100_cookie_editor" />
        <FeatureItem isMaterial={true} iconName="content_copy" textKey="feature_copyAllUrls" />
        <FeatureItem isMaterial={true} iconName="delete_sweep" textKey="feature_deleteGroupTabs" />
        <FeatureItem isMaterial={true} iconName="close" textKey="feature_closeTab" />
        <FeatureItem isMaterial={true} iconName="volume_off" textKey="feature_muteTab" />
        <FeatureItem isMaterial={true} iconName="qr_code" textKey="feature_showQrCode" />
        <FeatureItem isMaterial={true} iconName="screenshot" textKey="feature_v100_screenshot_tool" />
        <FeatureItem isMaterial={true} iconName="document_scanner" textKey="feature_v100_screenshot_ocr" />
        <FeatureItem isMaterial={true} iconName="edit_note" textKey="feature_v100_notes_kanban" />
        <FeatureItem isMaterial={true} iconName="attach_file" textKey="feature_v100_view_files" />
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
        <FeatureItem isMaterial={true} iconName="drive_file_rename_outline" textKey="feature_group_renaming" />
        <FeatureItem isMaterial={true} iconName="format_color_fill" textKey="feature_group_coloring" />
        <FeatureItem isMaterial={true} iconName="unfold_more" textKey="feature_group_collapsing" />
        <FeatureItem isMaterial={true} iconName="analytics" textKey="feature_group_statistics" />
        <FeatureItem isMaterial={true} iconName="drag_indicator" textKey="feature_list_dnd_reorder" />
    </div>
</section>

<section class="features-section card">
    <h3>{$t('sectionAIAssistant')}</h3>
    <div class="features-grid">
        <!-- icon-star does not exist in the sprite; icon-gemini is the one this feature is about. -->
        <FeatureItem isMaterial={false} svgId="icon-gemini" textKey="feature_geminiIntegration" />
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
        <FeatureItem isMaterial={true} iconName="dashboard" textKey="feature_v100_pomodoro_dashboard" />
        <FeatureItem isMaterial={true} iconName="settings_suggest" textKey="feature_pomodoro_config" />
    </div>
</section>

<section class="features-section card">
    <h3>{$t('sectionMusicPlayer')}</h3>
    <div class="features-grid">
        <FeatureItem isMaterial={true} iconName="library_music" textKey="feature_music_local_folder" />
        <FeatureItem isMaterial={true} iconName="play_circle" textKey="feature_music_playback" />
        <FeatureItem isMaterial={true} iconName="fast_forward" textKey="feature_music_seek" />
        <FeatureItem isMaterial={true} iconName="search" textKey="feature_music_search" />
        <FeatureItem isMaterial={true} iconName="queue_music" textKey="feature_music_playlist" />
        <FeatureItem isMaterial={true} iconName="headphones" textKey="feature_music_keeps_playing" />
        <FeatureItem isMaterial={true} iconName="radio" textKey="feature_radio_online_search" />
        <FeatureItem isMaterial={true} iconName="bookmark" textKey="feature_radio_saved_stations" />
        <FeatureItem isMaterial={true} iconName="playlist_add_check" textKey="feature_radio_batch_add" />
        <FeatureItem isMaterial={true} iconName="import_export" textKey="feature_radio_import_export" />
        <FeatureItem isMaterial={true} iconName="sync" textKey="feature_radio_sync" />
        <FeatureItem isMaterial={true} iconName="featured_play_list" textKey="feature_radio_unified_tabs" />
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
    </div>
</section>

<section class="features-section card">
    <h3>{$t('sectionWebReadingPlayer')}</h3>
    <div class="features-grid">
        <FeatureItem isMaterial={true} iconName="record_voice_over" textKey="feature_readerReadAloud" />
        <FeatureItem isMaterial={true} iconName="highlight" textKey="feature_readerWordTracking" />
        <FeatureItem isMaterial={true} iconName="opacity" textKey="feature_readerCustomOpacity" />
        <FeatureItem isMaterial={true} iconName="tune" textKey="feature_readerVoiceSettings" />
    </div>
</section>

<section class="features-section card">
    <h3>{$t('sectionListDownloads')}</h3>
    <div class="features-grid">
        <FeatureItem isMaterial={true} iconName="download" textKey="feature_downloads_manager" />
        <FeatureItem isMaterial={true} iconName="manage_search" textKey="feature_downloads_search" />
        <FeatureItem isMaterial={true} iconName="filter_list" textKey="feature_downloads_status_filter" />
        <FeatureItem isMaterial={true} iconName="calendar_month" textKey="feature_downloads_date_filter" />
        <FeatureItem isMaterial={true} iconName="folder_open" textKey="feature_downloads_open_folder" />
        <FeatureItem isMaterial={true} iconName="delete_sweep" textKey="feature_downloads_delete" />
        <FeatureItem isMaterial={true} iconName="file_download" textKey="feature_fileDownloader" />
    </div>
</section>

<section class="features-section card">
    <h3>{$t('sectionManageNavigationShortcuts')}</h3>
    <div class="features-grid">
        <FeatureItem isMaterial={true} iconName="keyboard" textKey="featureKeyboardNavigation" />
        <FeatureItem isMaterial={true} iconName="touch_app" textKey="feature_keyboard_hints" />
        <FeatureItem isMaterial={true} iconName="keyboard_command_key" textKey="feature_v095_keyboard_nav_rules" />
        <FeatureItem isMaterial={true} iconName="cookie" textKey="feature_v100_cookie_editor" />
        <FeatureItem isMaterial={true} iconName="text_snippet" textKey="feature_v100_text_snippets" />
        <FeatureItem isMaterial={true} iconName="data_object" textKey="feature_snippet_variables" />
        <FeatureItem isMaterial={true} iconName="text_format" textKey="feature_snippet_rich_text" />
        <FeatureItem isMaterial={true} iconName="format_clear" textKey="feature_snippet_plain_text" />
        <FeatureItem isMaterial={true} iconName="spellcheck" textKey="feature_snippet_realtime_validation" />
        <FeatureItem isMaterial={true} iconName="download" textKey="feature_showDownloads" />
        <FeatureItem isMaterial={true} iconName="shortcut" textKey="feature_custom_site_shortcuts" />
        <FeatureItem isMaterial={true} iconName="bolt" textKey="feature_page_action_shortcuts" />
        <FeatureItem isMaterial={true} iconName="tab_unselected" textKey="feature_tab_management_shortcuts" />
        <FeatureItem isMaterial={true} iconName="contrast" textKey="feature_display_mode_shortcuts" />
        <FeatureItem isMaterial={true} iconName="settings_backup_restore" textKey="feature_shortcuts_backup_reset" />
        <FeatureItem isMaterial={true} iconName="keyboard_alt" textKey="feature_omnibar_prefix_customization" />
        <FeatureItem isMaterial={true} iconName="video_library" textKey="feature_videoPip" />
        <FeatureItem isMaterial={true} iconName="shortcut" textKey="feature_navigationPipPopup" />
        <FeatureItem isMaterial={true} iconName="shortcut" textKey="feature_navigationVideoPip" />
        <FeatureItem isMaterial={true} iconName="open_in_new" textKey="feature_contextMenuPipPopup" />
        <FeatureItem isMaterial={true} iconName="video_settings" textKey="feature_contextMenuVideoPip" />
        <FeatureItem isMaterial={true} iconName="ads_click" textKey="feature_allowRightClick" />
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
        <FeatureItem isMaterial={true} iconName="swap_vert" textKey="feature_v094_dnd_reorder_themes" />
        <FeatureItem
            isMaterial={true}
            iconName="drive_file_rename_outline"
            textKey="feature_v092_inline_rename_themes"
        />
        <FeatureItem isMaterial={true} iconName="colorize" textKey="featureFaviconColoring" />
        <FeatureItem isMaterial={true} iconName="brightness_6" textKey="featureThemeCustomization" />
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
        <FeatureItem isMaterial={true} iconName="playlist_add_check" textKey="feature_v100_omnibar_are_shortcut" />
        <FeatureItem isMaterial={true} iconName="rule" textKey="feature_v100_omnibar_rl_shortcut" />
        <FeatureItem isMaterial={true} iconName="cleaning_services" textKey="feature_v100_dedup_add_to_rule" />
    </div>
</section>
