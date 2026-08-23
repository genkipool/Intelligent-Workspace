// @ts-nocheck
/**
 * [AI INSTRUCTION]
 * WHAT A CATEGORY IS CALLED, AND WHAT THE PICKERS OFFER.
 *
 * The buckets that ship with the extension are translated (`webActivityCategory_<id>`);
 * the ones the user adds are not, because their name is the user's own word. Every
 * place that draws a category — the sidebar, the filter, the table, the donut and the
 * settings page — needs the same answer, so it is worked out once here.
 *
 * Which id counts as the user's own, and how a typed name becomes an id, belongs to
 * `core/services/webActivitySchema.js`; this file only names and orders them.
 */
import '../../../core/services/webActivitySchema.js';

const WA = globalThis.ITG_WEB_ACTIVITY;

/** The user's categories, as `[{ id, label }]`, whatever the stored settings hold. */
export function customCategoriesOf(settings) {
    const list = settings?.customCategories;
    if (!Array.isArray(list)) return [];
    return list.filter((entry) => entry?.id && entry?.label).map((entry) => ({ id: entry.id, label: entry.label }));
}

/**
 * The name to show for a category id.
 *
 * @param {string} id
 * @param {Array<{id: string, label: string}>} custom
 * @param {(key: string, params?: any[]) => string} t
 */
export function categoryLabel(id, custom, t) {
    if (!id) return '';
    if (WA.isCustomCategory(id)) {
        const found = custom.find((entry) => entry.id === id);
        // A site can still be filed under a category that was later deleted. Showing
        // the raw slug is better than showing nothing, and it is a hint to go and
        // re-create it.
        return found ? found.label : id.slice(WA.CUSTOM_CATEGORY_PREFIX.length);
    }
    return t('webActivityCategory_' + id);
}

/**
 * The options for a category picker, with the built-in buckets and the user's own
 * under separate headings — but only when there are any of the user's own, so the
 * common case stays a plain list.
 *
 * @param {object} options
 * @param {Array<{id: string, label: string}>} options.custom
 * @param {(key: string, params?: any[]) => string} options.t
 * @param {Array<{value: string, label: string}>} [options.lead] Rows that come first
 *   and belong to no group: "all categories", or "detect automatically".
 * @param {string[]} [options.ids] The built-in ids to offer. Defaults to all of them.
 */
export function categoryOptions({ custom = [], t, lead = [], ids = WA.CATEGORIES }) {
    const builtIn = ids.map((id) => ({ value: id, label: t('webActivityCategory_' + id) }));
    if (!custom.length) return [...lead, ...builtIn];
    return [
        ...lead,
        { label: t('webActivityCategoryGroupBuiltIn'), options: builtIn },
        {
            label: t('webActivityCategoryGroupCustom'),
            options: custom.map((entry) => ({ value: entry.id, label: entry.label })),
        },
    ];
}
