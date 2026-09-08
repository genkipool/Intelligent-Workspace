/**
 * toggleGrid.js — how the action-visibility toggles are laid out.
 *
 * The panel is a grid, so a row that runs out of buttons ends short of the panel's
 * width. How many columns it should have is a function of how many toggles the
 * current view offers, which is why it lives apart from the code that builds them.
 */

/** Past this the buttons get too narrow for their icons, so the grid wraps instead. */
const MAX_TOGGLES_PER_ROW = 11;

/**
 * The number of columns that leaves every row full.
 *
 * The toggles are spread over as few rows as they fit in, and then shared out
 * evenly, so the last row ends at the panel's edge like the others. The groups view
 * offers twenty-two toggles and keeps its two rows of eleven; the bookmarks view
 * offers ten and now gets ten columns instead of eleven, which is the empty cell
 * that used to leave its row short.
 *
 * @param {number} toggleCount
 * @returns {number} Columns, at least one.
 */
export function toggleGridColumns(toggleCount) {
    if (!(toggleCount > 0)) return 1;
    const rows = Math.ceil(toggleCount / MAX_TOGGLES_PER_ROW);
    return Math.ceil(toggleCount / rows);
}
