<script>
    /**
     * [AI INSTRUCTION]
     * THE ROW UNDER EVERY SIDE-PANEL HEADER: a search field on the left, controls on
     * the right.
     *
     * The group list and the web activity panel each had their own copy of this row,
     * and they had drifted — the same row was centred in one and three pixels out in
     * the other, because both said `align-items: start` and the two children happened
     * to be different heights. That is the only kind of bug a duplicated container ever
     * produces, and the only cure is for there to be one of it.
     *
     * WHAT IS SHARED AND WHAT IS NOT. The geometry: the row, the gap, and the fact that
     * the field and the buttons sit on one centre line. What goes *in* it is the
     * caller's — the group list wires its buttons by id from plain JS and the panel
     * builds its own — so both are passed in as snippets and nothing here knows what
     * they are.
     *
     * WHY IT KEEPS THE OLD CLASS NAMES TOO. `search-and-controls` and
     * `controls-container` are load-bearing on both pages: stylesheets, the search
     * expand/collapse and the resize observer all reach for them. They stay. The
     * geometry moves to `itg-search-row`, which nothing else styles, and the selectors
     * below are written `div.itg-search-row` so a page rule on the legacy class cannot
     * quietly win against them.
     */
    let {
        /** The search field and whatever sits inside it. */
        search = undefined,
        /** The buttons on the right. */
        controls = undefined,
    } = $props();
</script>

<div class="itg-search-row search-and-controls">
    {#if search}{@render search()}{/if}
    <div class="itg-search-row-controls controls-container">
        {#if controls}{@render controls()}{/if}
    </div>
</div>

<style>
    div.itg-search-row {
        display: flex;
        /* One centre line. This is the whole point of the component: the field is about
           30px tall and the buttons about 36, so anything but `center` leaves them
           looking a few pixels out of true — which is exactly how they were. */
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        width: 100%;
        box-sizing: border-box;
        flex-shrink: 0;
    }

    div.itg-search-row-controls {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-grow: 0;
        flex-shrink: 0;
        /* The row's own gap holds it off the field; a margin here as well would count
           the space twice. */
        margin-left: auto;
    }
</style>
