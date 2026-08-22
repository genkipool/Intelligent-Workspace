import { mountPage } from '../../mountPage.js';
// Defines globalThis.Chart, the bundled charting engine
import '../../../lib/chart.local.js';
import Dashboard from './Dashboard.svelte';
import '../../../styles/fonts.css';
import '../../../styles/themes.css';
import '../../../styles/dashboard.css';

const app = mountPage(Dashboard, {
    target: document.body,
});

export default app;
