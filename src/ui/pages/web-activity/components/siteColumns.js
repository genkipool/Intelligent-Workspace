// @ts-nocheck
/**
 * [AI INSTRUCTION]
 * THE COLUMNS OF THE VISIT LOG, DEFINED ONCE.
 *
 * The header, the column picker, the sorting and the body all walk this same list, so
 * a new column is one entry here plus one branch in the table's cell snippet — never
 * four edits that have to agree.
 *
 * `sortValue` is what the column sorts on; columns without one are not sortable
 * because there is nothing sensible to compare (the editors and the actions).
 *
 * `weight` is the column's share of the table's width. The table is laid out with
 * `table-layout: fixed` so that every row fits on screen without a sideways scroll,
 * and a fixed layout needs to be told what each column is worth — left to itself it
 * sizes to the widest cell and pushes the table past the window. The weights are
 * normalised against whichever columns are actually on, so turning one off widens the
 * rest instead of leaving a gap.
 *
 * The numbers are the widths the browser gives each column when the table is allowed
 * to size itself — measured, not estimated. Eyeballing them meant the footer's own
 * total, the category select's chevron and the three controls in a rule cell were all
 * missed in turn, and something was cut short after every adjustment.
 *
 * They come to slightly more than the table has, and the shortfall is taken out of
 * the site column on purpose: a domain ends in an ellipsis with the whole of it in
 * the tooltip, which is a far better thing to lose than a figure or a category.
 *
 * A measured width is only as good as what was in the cell when it was measured, and
 * the shortfall is shared out among all of them — so a column sized to exactly what
 * it held on the day has nothing to give and cuts its content short in any window
 * narrow enough. Three of them are sized above their measurement for that reason: the
 * two duration columns for three-digit hours, which is what a year of history on a
 * daily site comes to, and the share for "100%".
 */

export const SITE_COLUMNS = [
    {
        id: 'site',
        labelKey: 'webActivityColSite',
        descKey: 'webActivityColSiteDesc',
        /** Always drawn: a row with no name is not a row. */
        pinned: true,
        defaultVisible: true,
        align: 'left',
        weight: 134,
        sortValue: (row) => row.domain,
    },
    {
        id: 'category',
        labelKey: 'webActivityColCategory',
        descKey: 'webActivityColCategoryDesc',
        defaultVisible: true,
        align: 'left',
        editable: true,
        weight: 141,
        sortValue: (row) => row.category,
    },
    {
        id: 'visits',
        labelKey: 'webActivityColVisits',
        descKey: 'webActivityColVisitsDesc',
        defaultVisible: true,
        weight: 74,
        sortValue: (row) => row.visits,
    },
    {
        id: 'time',
        labelKey: 'webActivityColTime',
        descKey: 'webActivityColTimeDesc',
        defaultVisible: true,
        weight: 116,
        sortValue: (row) => row.seconds,
    },
    {
        id: 'share',
        labelKey: 'webActivityColShare',
        descKey: 'webActivityColShareDesc',
        defaultVisible: true,
        weight: 64,
        sortValue: (row) => row.seconds,
    },
    {
        id: 'perVisit',
        labelKey: 'webActivityColPerVisit',
        descKey: 'webActivityColPerVisitDesc',
        defaultVisible: true,
        weight: 96,
        sortValue: (row) => row.perVisit,
    },
    {
        id: 'sessions',
        labelKey: 'webActivityColSessions',
        descKey: 'webActivityColSessionsDesc',
        defaultVisible: true,
        weight: 81,
        sortValue: (row) => row.sessions,
    },
    {
        id: 'perDay',
        labelKey: 'webActivityColPerDay',
        descKey: 'webActivityColPerDayDesc',
        defaultVisible: false,
        weight: 100,
        sortValue: (row) => row.perDay,
    },
    {
        id: 'activeDays',
        labelKey: 'webActivityColActiveDays',
        descKey: 'webActivityColActiveDaysDesc',
        defaultVisible: false,
        weight: 81,
        sortValue: (row) => row.days,
    },
    {
        id: 'lastSeen',
        labelKey: 'webActivityColLastSeen',
        descKey: 'webActivityColLastSeenDesc',
        defaultVisible: false,
        weight: 100,
        sortValue: (row) => row.lastDay || '',
    },
    {
        id: 'limit',
        labelKey: 'webActivityColLimit',
        descKey: 'webActivityColLimitDesc',
        defaultVisible: true,
        editable: true,
        weight: 107,
    },
    {
        id: 'weekly',
        labelKey: 'webActivityColWeekly',
        descKey: 'webActivityColWeeklyDesc',
        defaultVisible: false,
        editable: true,
        weight: 107,
    },
    {
        id: 'schedule',
        labelKey: 'webActivityColSchedule',
        descKey: 'webActivityColScheduleDesc',
        defaultVisible: true,
        editable: true,
        weight: 178,
    },
    {
        id: 'state',
        labelKey: 'webActivityColState',
        descKey: 'webActivityColStateDesc',
        defaultVisible: true,
        weight: 129,
    },
    {
        id: 'record',
        labelKey: 'webActivityColRecord',
        descKey: 'webActivityColRecordDesc',
        pinned: true,
        defaultVisible: true,
        weight: 79,
    },
];

/**
 * How many rows the log draws.
 *
 * The table is meant to be read at a glance, with every row and every column on
 * screen at once. Six months of browsing is thousands of sites, and a table that long
 * is not a table anyone reads — it is a scroll. The rows are sorted first, so the cap
 * always keeps the hundred that matter under whatever question the table is being
 * asked, and the footer keeps counting all of them.
 */
export const MAX_TABLE_ROWS = 100;

/** Where the chosen columns and sort order are remembered between visits. */
export const SITE_TABLE_PREFS_KEY = 'wa:tablePrefs';

export const DEFAULT_TABLE_PREFS = {
    columns: SITE_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.id),
    // Longest first, which is the question the table is usually being asked.
    sortBy: 'time',
    sortDir: 'desc',
};

/**
 * Fills in anything a stored preference is missing.
 *
 * The column set is deliberately *not* read back from storage. Nothing on the page
 * can change it — there is no picker — so a stored set can only ever be a snapshot of
 * what the defaults happened to be on the day it was written, and it silently hides
 * any column added since. That is how the log lost its sessions column. Only the sort
 * is a real preference, because only the sort can be changed.
 */
export function normalizeTablePrefs(stored) {
    const sortable = SITE_COLUMNS.find((column) => column.id === stored?.sortBy && column.sortValue);
    return {
        columns: DEFAULT_TABLE_PREFS.columns,
        sortBy: sortable ? stored.sortBy : DEFAULT_TABLE_PREFS.sortBy,
        sortDir: stored?.sortDir === 'asc' ? 'asc' : 'desc',
    };
}

/**
 * Each column's width as a percentage string, normalised over the columns on screen.
 * A column with no weight of its own counts as an average one.
 */
export function columnWidths(columns) {
    const weights = columns.map((column) => column.weight || 10);
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    return weights.map((weight) => ((weight / total) * 100).toFixed(3) + '%');
}

/**
 * The rows in the order the table should draw them.
 *
 * Ties fall back to time spent so the order is stable — sorting by category with a
 * dozen sites in `other` should still put the heaviest of them first.
 */
export function sortRows(rows, sortBy, sortDir) {
    const column = SITE_COLUMNS.find((entry) => entry.id === sortBy && entry.sortValue);
    if (!column) return rows;
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const left = column.sortValue(a);
        const right = column.sortValue(b);
        if (left < right) return -1 * direction;
        if (left > right) return 1 * direction;
        return b.seconds - a.seconds;
    });
}
