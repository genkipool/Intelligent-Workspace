import { mountPage } from '../../mountPage.js';
import Blocked from './Blocked.svelte';
import '../../../styles/fonts.css';
import '../../../styles/themes.css';
import '../../../styles/dashboard.css';
import '../../../styles/select.css';
import './webActivity.css';

// No charting engine here on purpose: this page stands between the user and the site
// they asked for, so it loads the least it can.
const app = mountPage(Blocked, {
    target: document.body,
});

export default app;
