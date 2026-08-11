<script>
    import { t, tt } from '../../stores/i18nStore.js';

    /**
     * Reusable side import panel (rules, bookmarks, cookies, themes).
     *
     * A `section.section` with a header, a drop zone and the cancel action, so the
     * page stylesheets (`.section`, `.drop-zone`, `.title-import-*`…) style every
     * variant identically.
     */
    let {
        show = false,
        // Panels driven by the imperative services stay mounted and are toggled by
        // them through `style.display`; Svelte-driven ones use `show`.
        alwaysMounted = false,
        sectionId = 'drag-drop-panel',
        sectionClass = 'section',
        // Each page styles the panel header with its own class name.
        headerClass = 'header-main-menu',
        headerTag = 'span',
        titleKey = 'import',
        titleClass = 'title-import-rules',
        dropTextKey = 'dragDropRules',
        dropIcon = '📄',
        // Tooltip/aria label for the drop zone
        selectFileKey = 'selectRulesFile',
        fileInputId = 'import-file-input',
        accept = '.json',
        backButtonId = undefined,
        backTitleKey = 'backButton',
        // Some panels have no cancel action (e.g. cookies)
        showCancel = true,
        cancelButtonId = undefined,
        cancelClass = 'button-cancel-import-drop',
        cancelKey = 'cancel',
        cancelTitleKey = 'cancelThemeImport',
        onback,
        onfile,
    } = $props();

    let isDragging = $state(false);

    function openFileInput() {
        document.getElementById(fileInputId)?.click();
    }

    function handleFileChange(e) {
        const file = e.target.files?.[0];
        if (file) onfile?.(file);
        e.target.value = '';
    }

    function handleDragOver(e) {
        e.preventDefault();
        isDragging = true;
    }

    function handleDragLeave() {
        isDragging = false;
    }

    function handleDrop(e) {
        e.preventDefault();
        isDragging = false;
        const file = e.dataTransfer?.files?.[0];
        if (file) onfile?.(file);
    }
</script>

{#if show || alwaysMounted}
    <!-- The stylesheet declares the panel as display:none + flex-direction:column;
         revealing it means switching to flex, exactly like the original. -->
    <section id={sectionId} class={sectionClass} style="display: {alwaysMounted ? 'none' : 'flex'};">
        <div class={headerClass}>
            <svelte:element this={headerTag} class={titleClass}>{$t(titleKey)}</svelte:element>
            <button
                id={backButtonId}
                class="back-button"
                type="button"
                aria-label={$t('backToMainPopup')}
                title={$tt(backTitleKey)}
                onclick={() => onback?.()}
            >
                <!-- Drawn inline: not every page that uses this panel ships the icon sprite. -->
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-color)"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path d="M15 20l-8-8 8-8"></path>
                </svg>
            </button>
        </div>
        <div
            class="drop-zone"
            class:highlight={isDragging}
            tabindex="0"
            role="button"
            aria-label={$t(selectFileKey)}
            title={$tt(selectFileKey)}
            onclick={openFileInput}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openFileInput())}
            ondrop={handleDrop}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
        >
            <div class="drop-zone-content">
                <span class="drop-icon">{dropIcon}</span>
                <p>{$t(dropTextKey)}</p>
                <input
                    type="file"
                    id={fileInputId}
                    {accept}
                    style="display: none;"
                    tabindex="-1"
                    onchange={handleFileChange}
                />
            </div>
        </div>
        {#if showCancel}
            <div class="import-actions">
                <button
                    id={cancelButtonId}
                    class={cancelClass}
                    type="button"
                    tabindex="0"
                    title={$tt(cancelTitleKey)}
                    onclick={() => onback?.()}>{$t(cancelKey)}</button
                >
            </div>
        {/if}
    </section>
{/if}
