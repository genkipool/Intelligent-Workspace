<script>
    /**
     * The title and on/off switch at the top of a settings section.
     *
     * `toggleId` names the checkbox; its label is `<toggleId>-label`. The title text is
     * the English fallback, replaced by `applyTranslations` from `titleKey`. No <style>
     * here: the section rules are shared, and a scoped block would change which apply.
     */
    let { titleKey, title, toggleId, toggleTitle, checked, onchange } = $props();
</script>

<div class="section-header">
    <div class="section-header-alignment">
        <h2 class="section-title" data-i18n={titleKey}>{title}</h2>
        <label class="switch" id="{toggleId}-label" title={toggleTitle}>
            <input type="checkbox" id={toggleId} tabindex="0" aria-label={toggleTitle} {checked} {onchange} />
            <span class="slider"></span>
        </label>
    </div>
</div>
