/**
 * [AI INSTRUCTION]
 * HOW FAR BACK A DASHBOARD OR A PANEL IS LOOKING.
 *
 * One list, because the chips are the same control wherever they appear and a period
 * that means "the last 30 days" on one screen cannot mean something else on another.
 * `0` is everything; `1` is *today*, measured from midnight rather than as a rolling
 * twenty-four hours — see `withinPeriod` in the pomodoro analytics, and
 * `daysInPeriod` in the web activity's.
 *
 * The panels get four of the five. A column a few hundred pixels wide fits four chips
 * on one line, and "3 months" and "all" say the same thing to anyone who has not been
 * running the extension since spring; the full tab keeps both.
 */
export const DASHBOARD_PERIODS = [
    { days: 1, labelKey: 'dashboardToday', titleKey: 'titleFilterToday' },
    { days: 7, labelKey: 'dashboard7Days', titleKey: 'titleFilter7Days' },
    { days: 30, labelKey: 'dashboard30Days', titleKey: 'titleFilter30Days' },
    { days: 90, labelKey: 'dashboard3Months', titleKey: 'titleFilter3Months' },
    { days: 0, labelKey: 'dashboardAllTime', titleKey: 'titleFilterAll' },
];

/** The four a side panel has room for. */
export const PANEL_PERIODS = DASHBOARD_PERIODS.filter((period) => period.days !== 90);
