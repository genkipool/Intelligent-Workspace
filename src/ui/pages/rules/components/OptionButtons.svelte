<script>
    /**
     * A heading and a row of mutually exclusive `.option-button`s.
     *
     * The sort and storage settings each render this twice — once in the toolbar popup
     * and once in the settings modal — and all four copies were the same markup with
     * different labels. Only the wrapper differs (the popup is positioned, the section
     * is not), so the wrapper stays with the caller and this is the part they share.
     *
     * `options` is `[{ value, label, title }]`. `title` is optional: the storage
     * options explain themselves on hover, the sort options do not.
     */
    let {
        /** The `<h3>` above the row, already translated. */
        title = '',
        options = [],
        selected = null,
        /**
         * Whether the buttons announce themselves as pressed. The sort popup does this
         * and its twin in the modal does not; kept as a flag rather than switched on
         * everywhere so adopting this changed no rendered attribute.
         */
        ariaPressed = false,
        onselect = () => {},
    } = $props();
</script>

<h3>{title}</h3>
<div class="misc-sort-options-container">
    {#each options as option (option.value)}
        <button
            type="button"
            class="option-button"
            translate="no"
            data-value={option.value}
            class:selected={selected === option.value}
            aria-pressed={ariaPressed ? selected === option.value : undefined}
            title={option.title}
            onclick={() => onselect(option.value)}>{option.label}</button
        >
    {/each}
</div>
