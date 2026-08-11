import { mountPage } from '../../mountPage.js';
import Popup from './Popup.svelte';
import '../../../styles/fonts.css';
import '../../../styles/themes.css';
import './popup.css';

const app = mountPage(Popup, {
    target: document.body,
});

export default app;
