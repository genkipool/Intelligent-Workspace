<script>
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
    aria-label={ariaLabel || title || 'Delete'}
    {disabled}
    onclick={handleClick}
>
    &times;
</button>
