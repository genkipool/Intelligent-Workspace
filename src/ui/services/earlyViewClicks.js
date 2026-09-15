/**
 * Clicks on the view controls that land while the page is still starting.
 *
 * The header is on screen well before `initializeAllEvents` wires its buttons and switches
 * to the view the page was opened for, and people reach for it at once: "list groups",
 * then the three dots that open the view panel, then bookmarks. Measured in the real side
 * panel with a real profile, clicking straight through lost the three-dots click three
 * times out of four (the button had no handler yet, so the panel never opened and the
 * bookmarks button was never there to click), and a click on a view button either reached
 * no handler or opened the view only for the start-up switch to put the group list back.
 *
 * Two kinds of click are kept:
 * - the panel toggle, only while it has no handler: once wired it has done its job, and
 *   repeating it would close the panel it just opened;
 * - the last view button, until start-up is over, since the start-up switch undoes it
 *   either way.
 * Both are replayed in the order they happened, toggles first, once start-up is done.
 */
const VIEW_BUTTON_IDS = new Set([
    'view-groups-btn',
    'list-groups-btn',
    'toggle-bookmarks-view-btn',
    'view-history-btn',
    'view-recent-btn',
    'view-reading-list-btn',
    'view-downloads-btn',
]);
const PANEL_TOGGLE_IDS = new Set(['toggle-view-panel-btn']);
const SELECTOR = [...VIEW_BUTTON_IDS, ...PANEL_TOGGLE_IDS].map((id) => `#${id}`).join(', ');

let capturing = false;
let controlsWired = false;
let lastViewId = null;
const earlyToggleIds = [];

function remember(event) {
    const button = event.target?.closest?.(SELECTOR);
    if (!button) return;
    if (VIEW_BUTTON_IDS.has(button.id)) lastViewId = button.id;
    else if (!controlsWired) earlyToggleIds.push(button.id);
}

/** Starts keeping the clicks. Called before the page is mounted. */
export function captureEarlyViewClicks() {
    if (capturing || typeof document === 'undefined') return;
    capturing = true;
    controlsWired = false;
    lastViewId = null;
    earlyToggleIds.length = 0;
    document.addEventListener('click', remember, true);
}

/** The buttons have their handlers from here on; a toggle clicked now needs no replay. */
export function markViewControlsWired() {
    controlsWired = true;
}

/** Stops keeping clicks and repeats the ones that were lost, now that the buttons work. */
export function replayEarlyViewClick() {
    if (!capturing) return;
    capturing = false;
    document.removeEventListener('click', remember, true);
    const toggles = earlyToggleIds.splice(0);
    const viewId = lastViewId;
    lastViewId = null;
    for (const id of toggles) document.getElementById(id)?.click();
    if (viewId) document.getElementById(viewId)?.click();
}
