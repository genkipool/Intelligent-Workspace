<script>
    /**
     * Screenshot gallery container.
     *
     * The cards are built by screenshotsService from `gallery-item-template`, which
     * carries the pin, OCR, copy, download and delete actions.
     */
    import { listGroupState } from '../../stores/listGroupStore.js';

    let isVisible = $derived($listGroupState.isGalleryViewActive);
</script>

{#if isVisible}
    <div id="screenshot-gallery-view" class="active-view">
        <div class="gallery-grid"></div>
    </div>
{/if}
