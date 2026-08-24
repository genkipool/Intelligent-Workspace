<script>
    /**
     * [AI INSTRUCTION]
     * THE SELECT THE WHOLE EXTENSION SHOULD USE.
     *
     * One trigger, one themed drop-down, one scrollbar. The look lives in
     * `src/styles/select.css` rather than in a scoped block here, because the same
     * dress has to reach markup this component does not own: the navigation settings
     * page builds its pickers in plain DOM, and a scoped style would not touch them.
     * A page that uses this component loads that stylesheet from its `main.js`.
     *
     * Options may be flat (`[{ value, label }]`) or grouped
     * (`[{ label, options: [...] }]`), which is what lets a category list keep the
     * buckets that ship with the extension apart from the ones the user added.
     */
    let {
        value = '',
        /** `[{ value, label }]`, or `[{ label, options: [{ value, label }] }]` for groups. */
        options = [],
        ariaLabel = '',
        title = '',
        id = undefined,
        disabled = false,
        /** Narrower, for table cells where 170px would not fit. */
        compact = false,
        /** Fills the row it sits in, for forms and modals. */
        wide = false,
        onchange,
    } = $props();

    /** A group is anything that carries its own `options`; everything else is a row. */
    const groups = $derived(
        options.map((entry) => (Array.isArray(entry?.options) ? entry : { label: null, options: [entry], flat: true })),
    );

    /**
     * The selection is driven by hand rather than with `value={value}` on the element.
     *
     * A `value` on a `<select>` makes Svelte watch the whole subtree with a
     * MutationObserver and put the selection back whenever anything inside changes
     * (`init_select`). That is fine for a native drop-down, but this one is a
     * customizable select: picking an option makes Chrome rewrite the contents of
     * `<selectedcontent>`, which *is* a subtree change — so Svelte reverted the pick
     * in the microtask between `input` and `change`, and the `change` handler was
     * handed the old value. The filter simply never moved.
     */
    let selectEl = $state(null);
    /** Bumped on every pick so the sync below runs again even when the value did not. */
    let pickTick = $state(0);

    $effect(() => {
        pickTick;
        options;
        const next = value ?? '';
        if (selectEl && selectEl.value !== next) selectEl.value = next;
    });

    function handleChange(event) {
        const next = event.currentTarget.value;
        pickTick += 1;
        onchange?.(next);
    }
</script>

<select
    bind:this={selectEl}
    class="itg-select"
    class:itg-select-compact={compact}
    class:itg-select-wide={wide}
    {id}
    {title}
    {disabled}
    aria-label={ariaLabel}
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
    {#each groups as group, index (group.label ?? index)}
        {#if group.flat}
            {#each group.options as option (option.value)}
                <option value={option.value}>{option.label}</option>
            {/each}
        {:else}
            <optgroup label={group.label}>
                {#each group.options as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                {/each}
            </optgroup>
        {/if}
    {/each}
</select>
