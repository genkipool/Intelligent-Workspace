<script>
    /**
     * Rule import options dialog.
     *
     * Opened with `showModal()` so the browser paints the `::backdrop` that dims the
     * page, and the three buttons close it through `method="dialog"`.
     */
    import { t } from '../../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../../actions/dismissOnBackdrop.js';

    let { isOpen = false, onclose, onimport } = $props();

    let dialogEl = $state(null);

    $effect(() => {
        if (!dialogEl) return;
        if (isOpen && !dialogEl.open) dialogEl.showModal();
        else if (!isOpen && dialogEl.open) dialogEl.close();
    });

    function handleClose(e) {
        const value = e.currentTarget.returnValue;
        if (dialogEl) dialogEl.returnValue = '';
        if (value === 'add' || value === 'overwrite') onimport?.({ mode: value });
        onclose?.();
    }
</script>

<dialog
    bind:this={dialogEl}
    id="import-popup"
    class="import-modal"
    closedby="any"
    onclose={handleClose}
    use:dismissOnBackdrop={() => onclose?.()}
>
    <div class="modal-content-import">
        <h2 class="title-modal">{$t('importRules')}</h2>
        <p>{$t('importOptions')}</p>
        <!--
            These three submit on purpose. In a <form method="dialog"> submitting is
            what closes the dialog and copies the button's value into returnValue,
            which is the only thing handleClose above reads. Giving them
            type="button" would leave the dialog open and the import silently
            ignored — the bookmarks dialog looks the same but has real click
            listeners in bookmarksService, so there they are type="button".
        -->
        <form class="import-buttons" method="dialog">
            <button type="submit" class="import-button" id="add-rules" value="add" translate="no">{$t('add')}</button>
            <button type="submit" class="import-button" id="overwrite-rules" value="overwrite" translate="no"
                >{$t('overwrite')}</button
            >
            <button type="submit" class="import-button" id="cancel-import" value="cancel" translate="no"
                >{$t('cancel')}</button
            >
        </form>
    </div>
</dialog>
