<script>
    import { tt } from '../../stores/i18nStore.js';
    import { renderNotesButton, renderScreenshotButton } from '../../services/groupsService.js';
    import { createOverflowMenu } from '../../services/contextMenuService.js';
    import { actionVisibilitySettings } from '../../stores/appStore.svelte.js';

    let {
        group = {},
        groupEl = null,
        isBackup = false,
        isUngrouped = false,
        isPinned = false,
        info = {},
        noteContext = {},
        notesData = {},
        screenshotData = {},
        onbackup = () => {},
        onrestore = () => {},
        ontogglepin = () => {},
        onhide = () => {},
        oncopyurls = () => {},
        ondelete = () => {},
    } = $props();

    let groupActionsEl = $state(null);

    $effect(() => {
        if (!groupActionsEl) return;
        if (isBackup) {
            groupActionsEl.querySelector('.view-notes-btn')?.classList.add('hidden');
            groupActionsEl.querySelector('.view-screenshots-btn')?.classList.add('hidden');
            return;
        }
        renderNotesButton(groupActionsEl, noteContext, notesData || {});
        if (!isUngrouped) {
            renderScreenshotButton(
                groupActionsEl,
                { type: 'group', id: group.id, title: group.title },
                screenshotData || {},
            );
        }
    });

    $effect(() => {
        if (!groupActionsEl || !groupEl) return;
        $actionVisibilitySettings;
        createOverflowMenu(groupActionsEl, 'group-item-template', groupEl);
    });
</script>

<div class="group-actions" bind:this={groupActionsEl}>
    <div
        class="backup-btn action-btn"
        class:hidden={isBackup}
        role="button"
        tabindex="0"
        title={$tt('backupGroup')}
        onclick={onbackup}
    >
        <svg width="14" height="14"><use href="#icon-backup"></use></svg>
    </div>
    <div
        class="restore-btn action-btn"
        class:hidden={!isBackup}
        role="button"
        tabindex="0"
        title={$tt('restoreGroup')}
        onclick={onrestore}
    >
        <svg width="14" height="14"><use href="#icon-restore"></use></svg>
    </div>

    <div
        class="pin-btn action-btn"
        class:hidden={isUngrouped}
        class:active={isPinned}
        role="button"
        tabindex="0"
        title={$tt(isPinned ? 'unpinGroup' : 'pinGroup')}
        onclick={ontogglepin}
    >
        <svg width="14" height="14"><use href="#icon-pin"></use></svg>
    </div>
    <div
        class="hide-group-btn action-btn"
        class:hidden={isUngrouped || isBackup}
        role="button"
        tabindex="0"
        title={$tt('hideGroup')}
        onclick={onhide}
    >
        <svg width="14" height="14"><use href="#icon-eye"></use></svg>
    </div>

    <div
        class="create-rule-btn action-btn"
        class:hidden={isBackup || isUngrouped || info.type === 'special' || info.type === 'rule'}
        role="button"
        tabindex="0"
        title={$tt('createRuleFromSubgroup')}
    >
        <svg width="14" height="14"><use href="#icon-create-rule"></use></svg>
    </div>
    <div
        class="add-to-rule-btn action-btn"
        class:hidden={isBackup || isUngrouped}
        role="button"
        tabindex="0"
        title={$tt('addSubgroupToExistingRule')}
    >
        <svg width="14" height="14"><use href="#icon-add-to-rule"></use></svg>
    </div>

    <div
        class="copy-group-urls-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('copyAllUrls')}
        onclick={oncopyurls}
    >
        <svg width="14" height="14"><use href="#icon-copy"></use></svg>
    </div>
    <div
        class="delete-group-btn action-btn"
        role="button"
        tabindex="0"
        title={$tt('deleteGroupTabs')}
        onclick={ondelete}
    >
        <svg width="14" height="14"><use href="#icon-trash"></use></svg>
    </div>
</div>
