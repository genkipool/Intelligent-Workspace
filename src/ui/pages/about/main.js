import { mountPage } from '../../mountPage.js';
import About from './About.svelte';
import '../../../styles/fonts.css';
import '../../../styles/themes.css';
import './about.css';

const app = mountPage(About, {
    target: document.body,
});

export default app;
