/**
 * Registry of active ScrollButtons instances to allow non-Svelte services
 * and stores to trigger scroll button visibility recalculations without
 * directly importing Svelte components.
 */
export const scrollButtonInstances = [];

/** Makes every mounted pair look at its target again. */
export function updateScrollButtons() {
    for (const update of scrollButtonInstances) {
        try {
            update();
        } catch {}
    }
}
