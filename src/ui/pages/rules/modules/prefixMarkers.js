/**
 * The rules a group marker has to follow, shared by the popup and the settings modal
 * so both behave the same way.
 *
 * A marker is a single character — an emoji counts as one however many code units it
 * takes — and no two markers may be equal, or the groups they mark become
 * indistinguishable.
 */

export const PREFIX_FIELDS = ['lock', 'openKey', 'loupe', 'checked', 'warning'];

/** Keeps the first character of what was typed, counting an emoji as one. */
export function firstCharacter(value) {
    const characters = [...(value || '')];
    return characters.length > 1 ? characters[0] : value;
}

/** The field names holding a marker that another field already uses. */
export function duplicateMarkerFields(prefixes) {
    const byMarker = new Map();
    for (const field of PREFIX_FIELDS) {
        const marker = (prefixes?.[field] || '').trim();
        if (!marker) continue;
        byMarker.set(marker, [...(byMarker.get(marker) || []), field]);
    }
    const clashing = new Set();
    for (const fields of byMarker.values()) {
        if (fields.length > 1) fields.forEach((field) => clashing.add(field));
    }
    return clashing;
}

export function hasDuplicateMarkers(prefixes) {
    return duplicateMarkerFields(prefixes).size > 0;
}
