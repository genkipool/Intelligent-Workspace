<script>
    import { t } from '../../stores/i18nStore.js';

    let {
        title = '',
        ariaLabel = '',
        className = '',
        showOnParentHover = true,
        disabled = false,
        onclick = null,
    } = $props();

    function handleClick(e) {
        e.stopPropagation();
        e.preventDefault();
        if (!disabled && onclick) {
            onclick(e);
        }
    }
</script>

<button
    type="button"
    class="delete-badge-btn {className}"
    class:show-on-hover={showOnParentHover}
    {title}
    aria-label={ariaLabel || title || $t('delete') || 'Delete'}
    {disabled}
    onclick={handleClick}
>
    &times;
</button>
