import { mountPage } from '../../mountPage.js';
import ListGroup from './ListGroup.svelte';
import '../../../styles/fonts.css';
import '../../../styles/themes.css';
import './listGroup.css';
import '../../../styles/pomodoro-panel.css';
import '../../content-renderer/content-renderer.css';
import '../../../styles/hint_content.css';
import '../../../utils/hint_common.js';
import '../../../utils/snippet-panel.js';
import { listGroupStore } from '../../stores/listGroupStore.js';

// Kicked off here rather than on mount: it is the page's first chrome.storage read
// and pays the subsystem's warm-up cost, so starting it now overlaps that with the
// translation fetch and the Svelte mount instead of running after them.
listGroupStore.init();

// The search bar is hidden by these view classes, which the boot only applies once it
// has switched views. Setting them from the URL first means the bar is already in its
// final state on the first painted frame instead of appearing a moment later.
const requestedView = new URLSearchParams(window.location.search).get('view') || 'groups';
document.body.classList.toggle('groups-view-active', requestedView === 'groups');

const app = mountPage(ListGroup, {
    target: document.body,
});

export default app;
