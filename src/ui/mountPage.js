import { mount } from 'svelte';
import { i18nStore } from './stores/i18nStore.js';
import { applyMirroredTheme } from '../utils/theme.js';

/** Never hold the page back on a font that fails to load. */
const FONT_TIMEOUT_MS = 500;

/**
 * Resolves once the UI font can actually be drawn with.
 *
 * The face is declared without `font-display`, so the browser leaves text blank until
 * it arrives — which used to show up as the labels landing a moment after the rest of
 * the page. `swap` is not the answer either: it paints a fallback face and re-lays the
 * text out, which is visible as the header shifting. Waiting here means the first
 * paint is the final one.
 */
function fontReady() {
    if (!document.fonts?.load) return Promise.resolve();
    return Promise.race([
        document.fonts.load('1em "Roboto Flex"').catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS)),
    ]);
}

/**
 * Mounts a page once everything its first paint needs is in memory.
 *
 * Unlike `chrome.i18n.getMessage()`, the dictionary is fetched asynchronously, so
 * mounting first painted the whole UI with empty labels and filled the text in a
 * moment later. Both waits here are short and run concurrently — and neither touches
 * the data the page goes on to load, which stays free to stream in behind the
 * rendered shell.
 */
export async function mountPage(Component, options = {}) {
    // Synchronous, so the very first paint already carries the user's palette.
    applyMirroredTheme();
    await Promise.all([i18nStore.init(), fontReady()]);
    return mount(Component, { target: document.body, ...options });
}
