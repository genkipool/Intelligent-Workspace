<script>
    /**
     * [AI INSTRUCTION]
     * Standard, universally compatible select dropdown for dashboards.
     * Styled cleanly to match the theme with custom dropdown indicator.
     */
    let {
        value = '',
        /** `[{ value, label }]`. */
        options = [],
        ariaLabel = '',
        title = '',
        /** Narrower, for table cells where 170px would not fit. */
        compact = false,
        onchange,
    } = $props();

    function handleChange(event) {
        const next = event.currentTarget.value;
        onchange?.(next);
    }
</script>

<select
    class="tag-select"
    class:tag-select-compact={compact}
    {title}
    aria-label={ariaLabel}
    {value}
    onchange={handleChange}
>
    <button type="button">
        <selectedcontent></selectedcontent>
        <svg
            class="picker-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    </button>
    {#each options as option (option.value)}
        <option value={option.value} selected={option.value === value}>{option.label}</option>
    {/each}
</select>
