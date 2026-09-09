/**
 * The two decisions behind folding a group card.
 *
 * Both used to live inside GroupCard, and both had grown a shortcut that took the fold
 * away from a card altogether. Stating them here keeps the card carrying the rules out
 * rather than holding them, and lets each one be checked on its own.
 */

/** The click landed on a control of the header: the card must not fold. */
export const FOLD_BLOCKED = 'blocked';
/** The click landed on the name: hold the fold back, a second click means rename. */
export const FOLD_DELAYED = 'delayed';
/** Nothing stands in the way: `<summary>` folds the card as it folds every other one. */
export const FOLD_NATIVE = 'native';

/**
 * What a click on a group's `<summary>` should do.
 *
 * A backup card and the ungrouped list were refused outright, which left the only two
 * cards that cannot be renamed as the only two that could never be folded by hand
 * either — the original folds them like any other. They have no rename gesture to
 * protect, so the summary folds them natively; every other card keeps the delayed fold
 * that lets the second click of a rename call the fold off.
 *
 * @param {Element|null} target the node the click landed on
 * @param {{ isBackup?: boolean, isUngrouped?: boolean }} [card]
 * @returns {typeof FOLD_BLOCKED | typeof FOLD_DELAYED | typeof FOLD_NATIVE}
 */
export function decideSummaryFold(target, { isBackup = false, isUngrouped = false } = {}) {
    if (target?.closest?.('.group-actions, .color-indicator, .group-title-input')) return FOLD_BLOCKED;
    if (!isBackup && !isUngrouped && target?.closest?.('.group-title')) return FOLD_DELAYED;
    return FOLD_NATIVE;
}

/**
 * Whether the card is drawn open.
 *
 * @param {boolean|undefined} storedState what the shared map remembers for this group
 * @param {boolean} viewDefault how the list draws a card it remembers nothing about
 * @returns {boolean}
 */
export function resolveGroupOpenState(storedState, viewDefault) {
    return storedState !== undefined ? storedState : viewDefault;
}

/**
 * The card that follows the active tab while the list is folded.
 *
 * With the list expanded there is nothing to follow: every card is open. Folded, the
 * group holding the tab you just moved to opens so you can see where you are, and the
 * one that just lost it shuts again behind you — but only the card this opened. One
 * you had already opened by hand is yours, and stays open when the tab moves on.
 *
 * Nothing happens the moment the list is folded, either: "collapse all" changes no
 * tab, so no card gains or loses one, and everything shuts as asked.
 *
 * @returns {{ next: (hasActiveTab: boolean, viewDefaultOpen: boolean, isOpen: boolean) => boolean|null }}
 *   `true` open the card, `false` shut it, `null` leave it as the user left it.
 */
export function createActiveTabFollow() {
    let heldActiveTab = false;
    let openedByFollow = false;

    return {
        next(hasActiveTab, viewDefaultOpen, isOpen) {
            const gained = hasActiveTab && !heldActiveTab;
            const lost = !hasActiveTab && heldActiveTab;
            // Recorded before the list is consulted, so folding it later knows which
            // card is already holding the tab and leaves it alone.
            heldActiveTab = hasActiveTab;

            if (viewDefaultOpen) {
                openedByFollow = false;
                return null;
            }
            if (gained) {
                // An open card owes this nothing: it was already showing its tabs.
                openedByFollow = !isOpen;
                return isOpen ? null : true;
            }
            if (lost && openedByFollow) {
                openedByFollow = false;
                return false;
            }
            return null;
        },
    };
}

/**
 * The domains to open when a group card is unfolded.
 *
 * Folding the list writes every domain shut as well, so unfolding one card by hand
 * opened it onto its domain headers and nothing else: the tabs sat behind a second
 * fold nobody had asked for, and only cards with more than one domain showed it —
 * which is why some groups looked broken and others did not.
 *
 * A card that already has a domain open is left exactly as its owner arranged it.
 *
 * @param {string[]} subGroupKeys the card's domains, by their key in the shared map
 * @param {(key: string) => boolean} isSubgroupOpen how each of them is drawn right now
 * @returns {string[]} the keys to open, empty when the card already shows something
 */
export function subgroupsToReveal(subGroupKeys, isSubgroupOpen) {
    if (subGroupKeys.length === 0) return [];
    if (subGroupKeys.some((key) => isSubgroupOpen(key))) return [];
    return subGroupKeys;
}
