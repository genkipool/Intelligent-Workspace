<script>
    import { t, tt } from '../../../stores/i18nStore.js';

    let { rule, index, isExpanded = false, isLargeScreen = true, ontoggleActive, oneditRule, ondeleteRule } = $props();

    let uniqueId = $derived(`rule-active-switch-${index}`);

    function toggleActive(e) {
        ontoggleActive?.({ index, active: e.target.checked });
    }
</script>

<div id="ruleActions" class="rule-actions">
    {#if isLargeScreen}
        <button
            id="deployButton"
            class="deploy-btn rule-actions-button"
            type="button"
            tabindex="0"
            translate="no"
            aria-expanded={isExpanded}
            title={$tt(isExpanded ? 'collapseSection' : 'deploySection')}
        >
            <span class="svg-deploy">
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    style="color: var(--text-on-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-chevron-up"></use>
                </svg>
            </span>
        </button>
    {/if}
    <button
        id="editButton"
        class="edit-button rule-actions-button"
        type="button"
        tabindex="0"
        translate="no"
        title={$tt('editRule')}
        onclick={() => oneditRule?.({ index })}
    >
        <span class="text-edit text-action-button" title={$tt('editRule')}>{$t('editButton')}</span>
        <span class="svg-edit svg-action-button">
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                style="color: var(--text-on-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-edit"></use>
            </svg>
        </span>
    </button>
    <button
        id="deleteButton"
        class="delete-button rule-actions-button"
        type="button"
        tabindex="0"
        translate="no"
        title={$tt('deleteRule')}
        onclick={() => ondeleteRule?.({ index })}
    >
        <span class="text-delete text-action-button" title={$tt('deleteRule')}>{$t('deleteButton')}</span>
        <span class="svg-delete svg-action-button">
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                style="color: var(--text-on-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-delete"></use>
            </svg>
        </span>
    </button>
    <label class="switch-rule-actions" translate="no">
        <input
            class="switch-checkbox"
            type="checkbox"
            tabindex="0"
            id={uniqueId}
            checked={rule.active}
            onchange={toggleActive}
        />
        <span class="slider" translate="no" title={$tt(rule.active ? 'deactivateRule' : 'activateRule')}>
            <span class="switch-text-on" translate="no">on</span>
            <span class="switch-text-off" translate="no">off</span>
            <span class="switch-handle"><span class="switch-light"></span></span>
        </span>
    </label>
    <button
        type="button"
        class="svg-toggle-button rule-actions-button"
        tabindex="0"
        translate="no"
        title={$tt(rule.active ? 'deactivateRule' : 'activateRule')}
        aria-label={$t(rule.active ? 'deactivateRule' : 'activateRule')}
        aria-pressed={rule.active}
        onclick={() => ontoggleActive?.({ index, active: !rule.active })}
    >
        <span class="svg-toggle">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <text
                    class="svg-toggle-text"
                    x="50%"
                    y="55%"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill="var(--text-on-color)"
                    font-weight="bold"
                    translate="no">{rule.active ? 'ON' : 'OFF'}</text
                >
            </svg>
        </span>
    </button>
</div>
