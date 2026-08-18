<script>
    import { t, tt } from '../../../stores/i18nStore.js';

    const ITEMS_PER_PAGE = 5;
    let currentPage = $state(1);

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
                'feature_v100_view_files',
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
</script>

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
                <div class="version-details" class:expanded={(currentPage === 1 && idx === 0) || expandedVersions[idx]}>
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
