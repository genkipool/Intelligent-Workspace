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
        sortValue: (row) => row.domain,
    },
    {
        id: 'category',
        labelKey: 'webActivityColCategory',
        descKey: 'webActivityColCategoryDesc',
        defaultVisible: true,
        align: 'left',
        editable: true,
        sortValue: (row) => row.category,
    },
    {
        id: 'visits',
        labelKey: 'webActivityColVisits',
        descKey: 'webActivityColVisitsDesc',
        defaultVisible: true,
        sortValue: (row) => row.visits,
    },
    {
        id: 'time',
        labelKey: 'webActivityColTime',
        descKey: 'webActivityColTimeDesc',
        defaultVisible: true,
        sortValue: (row) => row.seconds,
    },
    {
        id: 'share',
        labelKey: 'webActivityColShare',
        descKey: 'webActivityColShareDesc',
        defaultVisible: true,
        sortValue: (row) => row.seconds,
    },
    {
        id: 'perVisit',
        labelKey: 'webActivityColPerVisit',
        descKey: 'webActivityColPerVisitDesc',
        defaultVisible: true,
        sortValue: (row) => row.perVisit,
    },
    {
        id: 'sessions',
        labelKey: 'webActivityColSessions',
        descKey: 'webActivityColSessionsDesc',
        defaultVisible: false,
        sortValue: (row) => row.sessions,
    },
    {
        id: 'perDay',
        labelKey: 'webActivityColPerDay',
        descKey: 'webActivityColPerDayDesc',
        defaultVisible: false,
        sortValue: (row) => row.perDay,
    },
    {
        id: 'activeDays',
        labelKey: 'webActivityColActiveDays',
        descKey: 'webActivityColActiveDaysDesc',
        defaultVisible: false,
        sortValue: (row) => row.days,
    },
    {
        id: 'lastSeen',
        labelKey: 'webActivityColLastSeen',
        descKey: 'webActivityColLastSeenDesc',
        defaultVisible: false,
        sortValue: (row) => row.lastDay || '',
    },
    {
        id: 'limit',
        labelKey: 'webActivityColLimit',
        descKey: 'webActivityColLimitDesc',
        defaultVisible: true,
        align: 'left',
        editable: true,
    },
    {
        id: 'schedule',
        labelKey: 'webActivityColSchedule',
        descKey: 'webActivityColScheduleDesc',
        defaultVisible: true,
        align: 'left',
        editable: true,
    },
    {
        id: 'state',
        labelKey: 'webActivityColState',
        descKey: 'webActivityColStateDesc',
        defaultVisible: true,
    },
    {
        id: 'record',
        labelKey: 'webActivityColRecord',
        descKey: 'webActivityColRecordDesc',
        pinned: true,
        defaultVisible: true,
    },
];

/** Where the chosen columns and sort order are remembered between visits. */
export const SITE_TABLE_PREFS_KEY = 'wa:tablePrefs';

export const DEFAULT_TABLE_PREFS = {
    columns: SITE_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.id),
    // Longest first, which is the question the table is usually being asked.
    sortBy: 'time',
    sortDir: 'desc',
};

/** Fills in anything a stored preference is missing, and drops columns that no longer exist. */
export function normalizeTablePrefs(stored) {
    const known = new Set(SITE_COLUMNS.map((column) => column.id));
    const columns = Array.isArray(stored?.columns)
        ? stored.columns.map((id) => (id === 'actions' ? 'record' : id)).filter((id) => known.has(id))
        : null;
    const sortable = SITE_COLUMNS.find((column) => column.id === stored?.sortBy && column.sortValue);
    return {
        columns: columns?.length ? columns : DEFAULT_TABLE_PREFS.columns,
        sortBy: sortable ? stored.sortBy : DEFAULT_TABLE_PREFS.sortBy,
        sortDir: stored?.sortDir === 'asc' ? 'asc' : 'desc',
    };
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
