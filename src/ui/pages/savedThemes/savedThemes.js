import { mountPage } from '../../mountPage.js';
import SavedThemes from './SavedThemes.svelte';

const app = mountPage(SavedThemes, {
    target: document.body,
});

export default app;
