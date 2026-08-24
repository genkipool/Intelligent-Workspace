// @ts-nocheck
/**
 * [AI INSTRUCTION]
 * WHERE A DASHBOARD REMEMBERS THE ORDER ITS OWNER PUT THINGS IN.
 *
 * Both dashboards let their sections be dragged into a different order, and the panels
 * inside a section rearranged among themselves. A panel never leaves its section: a
 * heat map among the streak counters would be a layout nobody asked for and one the
 * page has no shape for.
 *
 * One record per dashboard: `{ sections: [id...], panels: { [sectionId]: [id...] } }`.
 * Ids and not indices, so a dashboard that gains a section next release does not hand
 * everybody a shuffled page — see `applyOrder`.
 */

const STORAGE_KEY = 'dashboardLayouts';

const EMPTY = { sections: [], panels: {} };

/**
 * The stored order applied to the ids a page actually has.
 *
 * Anything the record does not mention keeps the place the page gave it, which is what
 * makes a new section appear where its author put it rather than at the end, and what
 * makes a removed one simply disappear instead of leaving a hole.
 *
 * @param {string[]} ids The order the page declares.
 * @param {string[]} [order] The order the user last left it in.
 */
export function applyOrder(ids, order) {
    if (!Array.isArray(order) || !order.length) return ids;
    const out = order.filter((id) => ids.includes(id));
    for (const id of ids) {
        if (out.includes(id)) continue;
        // Back where the page put it, as far as the shortened list allows.
        out.splice(Math.min(ids.indexOf(id), out.length), 0, id);
    }
    return out;
}

/** @param {'webActivity'|'pomodoro'} dashboard */
export async function loadLayout(dashboard) {
    try {
        const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);
        const layout = stored?.[dashboard];
        return {
            sections: Array.isArray(layout?.sections) ? layout.sections : [],
            panels: layout?.panels && typeof layout.panels === 'object' ? layout.panels : {},
        };
    } catch {
        // A layout that cannot be read is a layout the page was going to have anyway.
        return { ...EMPTY, panels: {} };
    }
}

async function write(dashboard, mutate) {
    try {
        const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);
        const all = stored && typeof stored === 'object' ? stored : {};
        const current = all[dashboard] || { sections: [], panels: {} };
        all[dashboard] = mutate({
            sections: Array.isArray(current.sections) ? current.sections : [],
            panels: current.panels && typeof current.panels === 'object' ? current.panels : {},
        });
        await chrome.storage.local.set({ [STORAGE_KEY]: all });
    } catch {
        // Nothing to tell the user: the page is already showing the new order.
    }
}

export function saveSectionOrder(dashboard, sections) {
    return write(dashboard, (layout) => ({ ...layout, sections: [...sections] }));
}

export function savePanelOrder(dashboard, sectionId, panels) {
    return write(dashboard, (layout) => ({
        ...layout,
        panels: { ...layout.panels, [sectionId]: [...panels] },
    }));
}

/**
 * Puts a container's children into `order`, for the dashboard that owns its DOM
 * outright rather than rendering it from a list.
 *
 * `insertBefore` on a node that is already in place is a no-op in every engine, so
 * this is safe to run after every repaint — which is exactly what the pomodoro
 * dashboard does, since it rebuilds its cards from scratch each time.
 *
 * @param {Element} container
 * @param {string[]} order
 * @param {string} [selector] Which children are movable.
 */
export function applyOrderToDom(container, order, selector = '[data-sort-id]') {
    if (!container || !Array.isArray(order) || !order.length) return;
    const byId = new Map(
        Array.from(container.children)
            .filter((el) => el.matches?.(selector))
            .map((el) => [el.dataset.sortId, el]),
    );
    for (const id of order) {
        const el = byId.get(id);
        if (el) container.appendChild(el);
    }
    // Anything the record does not mention stays after what it does, in page order.
    for (const [id, el] of byId) {
        if (!order.includes(id)) container.appendChild(el);
    }
}
