// hint_common.js publishes window.HintCommon, which the page logic needs.
import '../../../utils/hint_common.js';
import { mountPage } from '../../mountPage.js';
import CustomizeHints from './CustomizeHints.svelte';
import '../../../styles/fonts.css';
import '../../../styles/themes.css';
import './customize_hints.css';

const app = mountPage(CustomizeHints, {
    target: document.body,
});

export default app;
