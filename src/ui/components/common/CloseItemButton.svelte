<script>
    /**
     * Reusable close / delete item button (X).
     *
     * In normal state it uses `var(--text-color)` with opacity, and on hover
     * turns into `var(--error-color)` without background, with a subtle scale.
     */
    let { title = '', ariaLabel = '', className = '', size = 14, disabled = false, onclick = () => {} } = $props();

    function handleClick(e) {
        e.stopPropagation();
        if (!disabled && onclick) {
            onclick(e);
        }
    }
</script>

<button
    type="button"
    class="close-item-btn {className}"
    {title}
    aria-label={ariaLabel || title || 'Close'}
    {disabled}
    onclick={handleClick}
>
    <svg width={size} height={size} aria-hidden="true" focusable="false">
        <use href="#icon-close-stroke"></use>
    </svg>
</button>

<style>
    .close-item-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent !important;
        border: none;
        color: var(--text-color);
        opacity: 0.6;
        cursor: pointer;
        padding: 2px 4px;
        flex-shrink: 0;
        line-height: 1;
        transition:
            opacity 0.15s ease,
            color 0.15s ease,
            transform 0.15s ease;
    }

    .close-item-btn:hover,
    .close-item-btn:focus-visible {
        color: var(--error-color);
        opacity: 1;
        transform: scale(1.15);
        outline: none;
    }

    .close-item-btn:disabled {
        opacity: 0.25;
        cursor: default;
        pointer-events: none;
    }
</style>
