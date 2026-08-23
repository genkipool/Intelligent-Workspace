<script>
    /**
     * [AI INSTRUCTION]
     * THE RECORD ITSELF: take it away, bring it back, or throw it out.
     *
     * The same three actions the header offers, spelled out. They live here as well
     * because this is where somebody comes looking for them, and because deleting
     * everything is not something to put in a toolbar next to "refresh".
     */
    import { t, tt } from '../../../stores/i18nStore.js';

    let { onExport, onImport, onClearAll, onRestoreDefaults, dayCount = 0, siteCount = 0 } = $props();

    let fileInput = $state(null);

    function handleFile(event) {
        const [file] = event.target.files || [];
        if (file) onImport(file);
        event.target.value = '';
    }
</script>

<div class="wa-set-block">
    <p class="wa-set-figure">{$t('webActivityDataFigures', [String(dayCount), String(siteCount)])}</p>

    <div class="wa-set-actions">
        <button class="btn" type="button" title={$tt('webActivityExport')} onclick={onExport}>
            <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-export"></use></svg>
            <span>{$t('pomodoroExport')}</span>
        </button>
        <button class="btn" type="button" title={$tt('webActivityImport')} onclick={() => fileInput.click()}>
            <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-import"></use></svg>
            <span>{$t('pomodoroImport')}</span>
        </button>
        <input
            bind:this={fileInput}
            type="file"
            accept=".json"
            style="display:none"
            onchange={handleFile}
            aria-hidden="true"
            tabindex="-1"
        />
        <!-- Between "bring it back" and "throw it out": it undoes settings, not data. -->
        <button class="btn" type="button" title={$tt('webActivityRestoreDefaults')} onclick={onRestoreDefaults}>
            <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-refresh"></use></svg>
            <span>{$t('webActivityRestoreDefaults')}</span>
        </button>
        <button class="btn wa-btn-danger" type="button" title={$tt('webActivityClearAll')} onclick={onClearAll}>
            <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-trash"></use></svg>
            <span>{$t('webActivityClearAll')}</span>
        </button>
    </div>
</div>
