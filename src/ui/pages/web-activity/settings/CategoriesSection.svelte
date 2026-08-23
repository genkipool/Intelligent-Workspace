<script>
    /**
     * [AI INSTRUCTION]
     * THE CATEGORIES A SITE CAN BE FILED UNDER.
     *
     * The ones that ship with the extension are fixed and translated: they are what
     * the automatic detection knows how to recognise, and what the focus ratio is
     * built out of. The ones added here are the user's own words and are never
     * translated — a category called "Tesis" is called that in every language.
     *
     * A custom category is only ever applied by hand, from the log's own row, so
     * adding one here does nothing on its own; the count beside it says how many sites
     * have been moved into it, which is the honest measure of whether it is being used.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt } from '../../../stores/i18nStore.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let { custom = [], usage = {}, onAdd, onRename, onDelete } = $props();

    let draft = $state('');
    let error = $state('');
    /** The category being renamed, and the text in the box while it is. */
    let editingId = $state(null);
    let editingLabel = $state('');

    const nextId = $derived(WA.customCategoryId(draft));
    const isDuplicate = $derived(!!nextId && custom.some((entry) => entry.id === nextId));

    function submit() {
        const label = draft.trim();
        // Read out of the derived state *before* the box is cleared. `$derived` is
        // lazy: emptying `draft` first and reading `nextId` afterwards recomputes it
        // from the empty box and hands the caller a category with no id at all.
        const id = nextId;
        if (!label) return;
        if (!id) {
            error = $t('webActivityCategoryNameInvalid');
            return;
        }
        if (isDuplicate) {
            error = $t('webActivityCategoryExists');
            return;
        }
        error = '';
        draft = '';
        onAdd({ id, label });
    }

    function startRename(entry) {
        editingId = entry.id;
        editingLabel = entry.label;
    }

    function commitRename() {
        const label = editingLabel.trim();
        // The id never changes on a rename: sites are filed under it, and re-slugging
        // the new name would quietly orphan every one of them.
        if (label && label !== custom.find((entry) => entry.id === editingId)?.label) onRename(editingId, label);
        editingId = null;
    }
</script>

<div class="wa-set-block">
    <div class="wa-set-group">
        <h4 class="wa-set-subhead">{$t('webActivityCategoryGroupBuiltIn')}</h4>
        <p class="wa-set-note">{$t('webActivityCategoryBuiltInHint')}</p>
        <div class="wa-cat-chips">
            {#each WA.CATEGORIES as id (id)}
                <span class="tl-chip wa-cat-chip">
                    {$t('webActivityCategory_' + id)}
                    {#if usage[id]}<span class="wa-cat-count">{usage[id]}</span>{/if}
                </span>
            {/each}
        </div>
    </div>

    <div class="wa-set-group">
        <h4 class="wa-set-subhead">{$t('webActivityCategoryGroupCustom')}</h4>

        {#if !custom.length}
            <p class="wa-empty-line">{$t('webActivityCategoryCustomEmpty')}</p>
        {:else}
            <ul class="wa-cat-list">
                {#each custom as entry (entry.id)}
                    <li class="wa-cat-row">
                        {#if editingId === entry.id}
                            <input
                                class="wa-text-input wa-cat-input"
                                type="text"
                                maxlength="32"
                                bind:value={editingLabel}
                                aria-label={$t('webActivityCategoryRename')}
                                onblur={commitRename}
                                onkeydown={(e) => {
                                    if (e.key === 'Enter') commitRename();
                                    if (e.key === 'Escape') editingId = null;
                                }}
                            />
                        {:else}
                            <button
                                class="wa-cat-name"
                                type="button"
                                title={$tt('webActivityCategoryRename')}
                                onclick={() => startRename(entry)}
                            >
                                {entry.label}
                            </button>
                        {/if}
                        <span class="wa-cat-usage">
                            {!usage[entry.id]
                                ? $t('webActivityCategoryUnused')
                                : usage[entry.id] === 1
                                  ? $t('webActivityCategorySite')
                                  : $t('webActivityCategorySites', [String(usage[entry.id])])}
                        </span>
                        <button
                            class="wa-icon-btn wa-icon-btn-danger"
                            type="button"
                            title={$tt('webActivityCategoryDelete')}
                            aria-label={$t('webActivityCategoryDelete')}
                            onclick={() => onDelete(entry)}
                        >
                            <svg width="13" height="13" aria-hidden="true" focusable="false"
                                ><use href="#wa-trash"></use></svg
                            >
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}

        <div class="wa-inline-form">
            <input
                class="wa-text-input"
                type="text"
                maxlength="32"
                bind:value={draft}
                placeholder={$t('webActivityCategoryNamePlaceholder')}
                aria-label={$t('webActivityCategoryNew')}
                oninput={() => (error = '')}
                onkeydown={(e) => e.key === 'Enter' && submit()}
            />
            <button
                class="wa-add-btn"
                type="button"
                disabled={!draft.trim() || isDuplicate}
                title={$tt('webActivityCategoryNew')}
                onclick={submit}
            >
                <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-plus"></use></svg>
                <span>{$t('webActivityCategoryAdd')}</span>
            </button>
        </div>
        {#if error || isDuplicate}
            <p class="wa-field-warning">{error || $t('webActivityCategoryExists')}</p>
        {/if}
    </div>
</div>
