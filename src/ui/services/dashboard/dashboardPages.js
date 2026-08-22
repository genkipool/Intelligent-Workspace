/**
 * [AI INSTRUCTION]
 * THE ONE PLACE THAT KNOWS WHERE THE DASHBOARD PAGES LIVE.
 *
 * Their paths were written out at every call site, so a page that moved had to be
 * found by grep. Add new dashboards here and open them with `openDashboard()`.
 */

export const DASHBOARD_PAGES = {
    pomodoro: 'src/ui/pages/pomodoro-dashboard/dashboard.html',
    webActivity: 'src/ui/pages/web-activity/web-activity.html',
};

/**
 * Brings the dashboard to the front, opening it only if it is not already there.
 *
 * Opening it blindly left a pile of identical tabs behind after a few visits, which
 * is easy to do from the popup, the pomodoro panel and the site table alike.
 *
 * @param {keyof typeof DASHBOARD_PAGES} page
 */
export async function openDashboard(page) {
    const url = chrome.runtime.getURL(DASHBOARD_PAGES[page]);
    try {
        const [existing] = await chrome.tabs.query({ url: `${url}*` });
        if (existing) {
            await chrome.tabs.update(existing.id, { active: true });
            await chrome.windows.update(existing.windowId, { focused: true });
            return existing;
        }
    } catch {
        // Falls through to opening a new tab.
    }
    return chrome.tabs.create({ url, active: true });
}
