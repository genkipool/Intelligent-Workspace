import { mountPage } from '../../mountPage.js';
// Defines globalThis.Chart, the bundled charting engine.
import '../../../lib/chart.local.js';
import WebActivity from './WebActivity.svelte';
import '../../../styles/fonts.css';
import '../../../styles/themes.css';
import '../../../styles/dashboard.css';
import './webActivity.css';

const app = mountPage(WebActivity, {
    target: document.body,
});

export default app;
