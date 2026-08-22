<script>
    /**
     * [AI INSTRUCTION]
     * THE ONE GRID OF "LABEL ON TOP, BUTTON BELOW" ACTIONS.
     *
     * The popup shows two of these blocks and they were the same markup twice. Add a
     * new entry to the calling page's item list instead of copying the wrapper.
     *
     * Each item: { id, titleKey, labelKey, tooltipKey, icon, viewBox, svgAttrs?, onClick }
     * - `icon`      href into the page's own <defs> sprite, e.g. '#icon-rules'
     * - `svgAttrs`  per-icon presentation attributes (some sprites are strokes, some fills)
     *
     * `toggles` maps an item id to a snippet drawn beside its label, for the entries
     * that carry a switch. It is a separate prop because snippets only exist once the
     * caller's template runs, which is after its `<script>` has built the item list.
     */
    import { t, tt } from '../../stores/i18nStore.js';

    let { items = [], toggles = {} } = $props();
</script>

<div class="settings-rules-actions">
    {#each items as item (item.id)}
        <div class="button-wrapper">
            <div class="title-with-toggle">
                <div class="section-title">{$t(item.titleKey)}</div>
                {#if toggles[item.id]}{@render toggles[item.id]()}{/if}
            </div>
            <button
                id={item.id}
                class="button"
                type="button"
                tabindex="0"
                title={$tt(item.tooltipKey)}
                onclick={item.onClick}
            >
                <svg
                    width="16"
                    height="16"
                    viewBox={item.viewBox}
                    aria-hidden="true"
                    focusable="false"
                    {...item.svgAttrs}><use href={item.icon}></use></svg
                >
                <span>{$t(item.labelKey)}</span>
            </button>
        </div>
    {/each}
</div>
