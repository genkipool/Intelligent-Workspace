<script>
    import { t } from '../../stores/i18nStore.js';

    let { open = false } = $props();
</script>

<div id="tutorial-container" class="tutorial-container">
    <details id="tutorial-details" {open}>
        <summary class="tutorial-summary">
            <div>
                <span>{$t('tutorialTitle') || 'Tutorial'}</span>
            </div>
            <span class="tutorial-prompt">{$t('tutorialPrompt') || 'Click to expand'}</span>
        </summary>
        <div class="tutorial-content">
            <h4>{$t('tutorialWelcomeTitle') || 'Welcome to Intelligent Tab Group!'}</h4>
            <p>{$t('tutorialWelcomeDesc') || 'This tutorial will guide you through the features of the rules page.'}</p>

            <h4>{$t('tutorialActionButtonsTitle') || 'Action Buttons'}</h4>
            <ul>
                <li>
                    <strong>{$t('addRule') || 'Add Rule'}{$t('colon') || ':'}</strong>
                    {$t('tutorialAddRule') || 'Create a new rule'}
                </li>
                <li>
                    <strong>{$t('exportRules') || 'Export Rules'}{$t('colon') || ':'}</strong>
                    {$t('tutorialExportRules') || 'Export your rules to a file'}
                </li>
                <li>
                    <strong>{$t('importRules') || 'Import Rules'}{$t('colon') || ':'}</strong>
                    {$t('tutorialImportRules') || 'Import rules from a file'}
                </li>
                <li>
                    <strong>{$t('settingsActions') || 'Settings'}{$t('colon') || ':'}</strong>
                    {$t('tutorialSettingsButton') || 'Open settings to configure various options'}
                </li>
            </ul>

            <h4>{$t('tutorialHeaderIconsTitle') || 'Header Icons'}</h4>
            <p>{$t('tutorialHeaderIconsDesc') || 'The header contains various icons to manage your rules.'}</p>
            <ul class="tutorial-icon-list">
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" style="color: var(--text-on-color);">
                                <use href="#icon-sync"></use>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconStorage') || 'Storage sync indicator'}</span>
                    </div>
                </li>
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" style="color: var(--text-on-color);">
                                <use href="#icon-local"></use>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconStorageLocal') || 'Local storage indicator'}</span>
                    </div>
                </li>
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" style="color: var(--text-on-color);">
                                <use href="#icon-sort"></use>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconSort') || 'Sort rules alphabetically'}</span>
                    </div>
                </li>
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg width="24" height="24" viewBox="0 0 32 32" style="color: var(--text-on-color);">
                                <use href="#icon-expand-all"></use>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconExpand') || 'Expand/collapse all rules'}</span>
                    </div>
                </li>
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="var(--text-on-color)"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconSearch') || 'Search rules'}</span>
                    </div>
                </li>
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg width="24" height="24" viewBox="0 0 512 512" style="color: var(--text-on-color);">
                                <use href="#icon-cluster"></use>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconCluster') || 'Cluster into groups'}</span>
                    </div>
                </li>
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg
                                width="24"
                                height="24"
                                viewBox="-51.2 -51.2 614.4 614.4"
                                style="color: var(--text-on-color); --icon-bg: var(--bg-panel-color);"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <use href="#icon-sort-groups"></use>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconSortGroups') || 'Sort groups alphabetically'}</span>
                    </div>
                </li>
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 512 512"
                                style="color: var(--text-on-color);"
                                transform="rotate(180)"
                            >
                                <use href="#icon-prefixes"></use>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconPrefixes') || 'Toggle group status flags'}</span>
                    </div>
                </li>
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg width="24" height="24" viewBox="0 0 512 512" style="color: var(--text-on-color);">
                                <use href="#icon-timer"></use>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconTimer') || 'Collapse timer'}</span>
                    </div>
                </li>
                <li>
                    <div class="tutorial-item-with-icon">
                        <span class="tutorial-list-icon">
                            <svg width="24" height="24" viewBox="0 0 38 38" style="color: var(--text-on-color);">
                                <use href="#icon-all-rules"></use>
                            </svg>
                        </span>
                        <span>{$t('tutorialHeaderIconAllRules') || 'Toggle all rules on/off'}</span>
                    </div>
                </li>
            </ul>

            <h4>{$t('tutorialRuleItemTitle') || 'Rule Items'}</h4>
            <p>{$t('tutorialRuleItemDesc') || 'Each rule has various interactive elements.'}</p>
            <ul>
                <li>
                    <strong>{$t('tutorialEditNameRule') || 'Edit Rule Name'}</strong>
                    {$t('tutorialEditNameRuleDesc') || 'Click the rule name to edit it.'}
                </li>
                <li>
                    <strong>{$t('tutorialOpenAllURLs') || 'Open All URLs'}</strong>
                    {$t('tutorialOpenAllURLsDesc') || 'Click to open all URLs in this rule.'}
                </li>
            </ul>

            <ul class="tutorial-icon-list">
                <li class="tutorial-item-with-icon">
                    <span class="tutorial-list-icon">
                        <svg
                            class="star-svg"
                            width="24"
                            height="24"
                            viewBox="0 0 100 100"
                            style="fill: var(--text-on-color);"
                        >
                            <use href="#icon-star"></use>
                        </svg>
                    </span>
                    <span class="tutorial-list-text">{$t('tutorialRuleStar') || 'Star/favorite this rule'}</span>
                </li>
                <li class="tutorial-item-with-icon">
                    <span class="tutorial-list-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" style="color: var(--text-on-color);">
                            <use href="#icon-drag"></use>
                        </svg>
                    </span>
                    <span class="tutorial-list-text">{$t('tutorialRuleDrag') || 'Drag to reorder'}</span>
                </li>
                <li class="tutorial-item-with-icon">
                    <span class="tutorial-icon-color-indicator"></span>
                    <span class="tutorial-list-text">{$t('tutorialRuleColor') || 'Cycle through colors'}</span>
                </li>
                <li class="tutorial-item-with-icon tutorial-sub-item">
                    <span class="tutorial-list-icon">
                        <svg width="24" height="24" viewBox="0 0 512 512" style="color: var(--text-on-color);">
                            <use href="#icon-url-edit"></use>
                        </svg>
                    </span>
                    <span class="tutorial-list-text">{$t('tutorialRuleURLEdit') || 'Edit URL'}</span>
                </li>
                <li class="tutorial-item-with-icon tutorial-sub-item">
                    <span class="tutorial-list-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" style="color: var(--text-on-color);">
                            <use href="#icon-trash"></use>
                        </svg>
                    </span>
                    <span class="tutorial-list-text">{$t('tutorialRuleURLDelete') || 'Delete URL'}</span>
                </li>
                <li class="tutorial-item-with-icon">
                    <span class="tutorial-list-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" style="color: var(--text-on-color);">
                            <use href="#icon-chevron-down"></use>
                        </svg>
                    </span>
                    <span class="tutorial-list-text">{$t('tutorialRuleDeploy') || 'Expand/collapse rule details'}</span>
                </li>
                <li class="tutorial-item-with-icon">
                    <span class="tutorial-list-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" style="color: var(--text-on-color);">
                            <use href="#icon-edit"></use>
                        </svg>
                    </span>
                    <span class="tutorial-list-text">{$t('tutorialRuleEdit') || 'Edit rule'}</span>
                </li>
                <li class="tutorial-item-with-icon">
                    <span class="tutorial-list-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" style="color: var(--text-on-color);">
                            <use href="#icon-delete"></use>
                        </svg>
                    </span>
                    <span class="tutorial-list-text">{$t('tutorialRuleDelete') || 'Delete rule'}</span>
                </li>
                <li class="tutorial-item-with-icon">
                    <span class="tutorial-icon-switch">
                        <span class="tutorial-icon-switch-handle"></span>
                    </span>
                    <span class="tutorial-list-text">{$t('tutorialRuleToggle') || 'Toggle rule on/off'}</span>
                </li>
            </ul>

            <h4>{$t('tutorialContextMenuTitle') || 'Context Menu'}</h4>
            <p>{$t('tutorialContextMenuDesc') || 'Right-click on a tab to access additional options.'}</p>
            <ul>
                <li>{$t('tutorialContextMenuItem1') || 'Add tab to a rule'}</li>
                <li>{$t('tutorialContextMenuItem2') || 'Create a new rule from this tab'}</li>
                <li>{$t('tutorialContextMenuItem3') || 'Move tab to a different group'}</li>
            </ul>
        </div>
    </details>
</div>
