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
import { isBareFramedView, isFramedView } from '../../services/panelViews.js';
import { getCurrentWindowId } from '../../services/windowsService.js';

// Kicked off here rather than on mount: it is the page's first chrome.storage read
// and pays the subsystem's warm-up cost, so starting it now overlaps that with the
// translation fetch and the Svelte mount instead of running after them.
listGroupStore.init();
getCurrentWindowId().catch(() => {});

// The search bar and the group toolbar are hidden by these view classes, which the boot
// only applies once it has switched views. Setting them from the URL first means both are
// already in their final state on the first painted frame instead of appearing a moment
// later — which for a framed view meant the whole group toolbar being drawn and then
// swept away, and read as the panel opening the group list on its way to the frame.
const requestedView = new URLSearchParams(window.location.search).get('view') || 'groups';
document.body.classList.toggle('groups-view-active', requestedView === 'groups');
document.body.classList.toggle('url-view-active', isFramedView(requestedView));
document.body.classList.toggle('bare-frame-view', isBareFramedView(requestedView));

const app = mountPage(ListGroup, {
    target: document.body,
});

export default app;
