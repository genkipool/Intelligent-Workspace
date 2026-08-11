<script>
    /**
     * Rule import options dialog.
     *
     * Opened with `showModal()` so the browser paints the `::backdrop` that dims the
     * page, and the three buttons close it through `method="dialog"`.
     */
    import { t } from '../../../stores/i18nStore.js';

    let { isOpen = false, onclose, onimport } = $props();

    let dialogEl = $state(null);

    $effect(() => {
        if (!dialogEl) return;
        if (isOpen && !dialogEl.open) dialogEl.showModal();
        else if (!isOpen && dialogEl.open) dialogEl.close();
    });

    function handleClose(e) {
        const value = e.currentTarget.returnValue;
        if (value === 'add' || value === 'overwrite') onimport?.({ mode: value });
        onclose?.();
    }
</script>

<dialog bind:this={dialogEl} id="import-popup" class="import-modal" closedby="any" onclose={handleClose}>
    <div class="modal-content-import">
        <h2 class="title-modal">{$t('importRules')}</h2>
        <p>{$t('importOptions')}</p>
        <form class="import-buttons" method="dialog">
            <button class="import-button" id="add-rules" value="add">{$t('add')}</button>
            <button class="import-button" id="overwrite-rules" value="overwrite">{$t('overwrite')}</button>
            <button class="import-button" id="cancel-import" value="cancel">{$t('cancel')}</button>
        </form>
    </div>
</dialog>
