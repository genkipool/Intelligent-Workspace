<script>
    /**
     * Notes view container.
     *
     * The entries themselves are built by notesService with renderNoteEntry(), which
     * produces the full card: archive, read-aloud, edit, copy and delete actions plus
     * the footer filters (category, context, type, stats and dates).
     */
    import { listGroupState } from '../../stores/listGroupStore.js';

    let isVisible = $derived($listGroupState.isNotesViewActive);
</script>

{#if isVisible}
    <div id="notes-view" class="active-view">
        <div id="notes-list-container"></div>
    </div>
{/if}
