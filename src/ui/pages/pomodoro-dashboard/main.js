import { mountPage } from '../../mountPage.js';
import '../../../styles/fonts.css';
import '../../../styles/themes.css';
import '../../../styles/dashboard.css';
import '../../../styles/select.css';
import '../../../styles/settings-page.css';

/**
 * [AI INSTRUCTION]
 * ONE PAGE, TWO SHAPES — AND ONLY ONE OF THEM IS LOADED.
 *
 * `dashboard.html` is both the pomodoro dashboard and the pomodoro side panel, the way
 * `web-activity.html` is. The two share nothing but the address, though: the dashboard
 * is nineteen cards and a dozen charts, the panel is the timer. So unlike that page,
 * which branches inside one component, this one branches before importing anything —
 * a side panel has no use for the charting engine, and making it wait for one is the
 * difference between the panel appearing and the panel arriving.
 */
const isPanel = new URLSearchParams(window.location.search).get('context') === 'sidepanel';

async function boot() {
    if (isPanel) {
        const [{ default: PomodoroSidePanel }] = await Promise.all([
            import('./panel/PomodoroSidePanel.svelte'),
            import('../../../styles/side-panel-shell.css'),
            import('../../../styles/pomodoro-panel.css'),
            import('./panel/pomodoroSidePanel.css'),
        ]);
        return mountPage(PomodoroSidePanel, { target: document.body });
    }

    // Defines globalThis.Chart, the bundled charting engine, which the dashboard reads
    // at module scope — so it has to land before the component does.
    await import('../../../lib/chart.local.js');
    const { default: Dashboard } = await import('./Dashboard.svelte');
    return mountPage(Dashboard, { target: document.body });
}

export default boot();
