<script>
    import { t } from '../../stores/i18nStore.js';

    let { iconName = '', textKey = '', isMaterial = true, svgId = '' } = $props();
</script>

<div class="feature-item">
    {#if isMaterial}
        <span class="material-icons-sharp feature-icon" translate="no">{iconName}</span>
    {:else}
        <span class="feature-icon">
            <svg class="feature-icon-img" aria-hidden="true" focusable="false">
                <use href="#{svgId}"></use>
            </svg>
        </span>
    {/if}
    <span>{$t(textKey)}</span>
</div>
