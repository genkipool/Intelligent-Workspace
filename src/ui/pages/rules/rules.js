import { mountPage } from '../../mountPage.js';
import Rules from './Rules.svelte';
import '../../../styles/fonts.css';
import '../../../styles/themes.css';
import './rules.css';

const app = mountPage(Rules, {
    // .container must stay a direct child of <body>: an #app wrapper would break
    // the flex chain, since body is display:flex in rules.css.
    target: document.body,
});

export default app;
