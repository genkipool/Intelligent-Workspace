<script>
    /**
     * A titled block of a dashboard. Every section on every dashboard is this shape —
     * a heading with an explanatory tooltip and a body — so the markup lives here.
     *
     * `sortId` turns it into something the page's `sortable` action can move: the id
     * it reports, and the grip in its heading that a drag has to start from. Without
     * one the section behaves exactly as it always did.
     */
    import { t, tt } from '../../stores/i18nStore.js';

    let { title, tooltip = '', sortId = null, children } = $props();
</script>

<section data-sort-id={sortId}>
    <div class="section-title" title={tooltip}>
        {#if sortId}
            <!-- The grip is the only thing a drag may start from; see
                 `actions/sortable.js` for why the section is not draggable outright. -->
            <span
                class="sort-grip"
                data-sort-handle
                role="button"
                tabindex="-1"
                aria-hidden="true"
                title={$tt('dashboardDragSection')}
                aria-label={$t('dashboardDragSection')}
            ></span>
        {/if}
        <span class="section-title-text">{title}</span>
    </div>
    {@render children()}
</section>
