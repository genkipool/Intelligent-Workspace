/**
 * [AI INSTRUCTION]
 * NOTES HANDLER — a note made out of what is selected on a page.
 *
 * The panel's editor is the other way a note is written, and this is deliberately the
 * same note: same store, same fields, same session index, so one taken here opens and
 * edits there like any other.
 *
 * REUSE: where the note is filed comes from `getContentContextKey()`,
 * `getContentSessionKeys()` and `addToContentSessionIndex()` in utils.js — the rule the
 * captures follow too. Do not write the index by hand.
 *
 * Dependencies: saveNoteToDb() (from db.js), NOTES_STORAGE_KEY (from state.js),
 *               getI18nMsg() and the helpers above (from utils.js)
 */

/** What a note taken from a page is filed under; the panel offers the same list. */
const PAGE_NOTE_CATEGORY = 'Research';

/**
 * Read out of the page: what is selected, and the heading to call it by.
 *
 * It runs in the tab rather than in whoever asked, which is what lets the keyboard
 * command and the context menu share it — the menu never sees the page's heading, and
 * `info.selectionText` collapses the line breaks this keeps.
 */
function itgReadSelectionForNote() {
    const heading = document.querySelector('h1');
    return {
        // The line breaks of the selection are kept: they are what the note is split
        // into paragraphs along. A heading is one line by definition, so its own are
        // folded away.
        text: String(window.getSelection() || ''),
        heading: heading ? (heading.textContent || '').replace(/\s+/g, ' ').trim() : '',
    };
}

/** Plain text as the note editor stores it: a paragraph per line, nothing else. */
function selectionToNoteHtml(text) {
    const escape = (value) =>
        value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `<p>${escape(line)}</p>`)
        .join('');
}

/**
 * Writes a note out of the selection of one tab, or adds to the one already written.
 *
 * A second selection off the same page joins the first: the same heading in the same
 * context is the same note, and the new lines go under what is already there. An
 * article read in three goes leaves one note, not three.
 *
 * Whatever happens is said out loud in a tray notice. Neither caller has anywhere else
 * to report it — a context menu closes on the click, and a key pressed on a page has no
 * panel behind it.
 *
 * @param {{tabId?: number}} message The context menu names the tab it was opened on; a
 *   keyboard command comes from the tab itself.
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response: object) => void} sendResponse
 */
async function handleCreateNoteFromSelection(message, sender, sendResponse) {
    try {
        const tabId = message.tabId ?? sender?.tab?.id;
        const tab = tabId ? await chrome.tabs.get(tabId) : await resolveTabForScreenshot(sender);
        if (!tab?.id) throw new Error('No tab to take the note from');

        const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: itgReadSelectionForNote,
            world: 'ISOLATED',
        });
        // Whatever comes back from the page is read as text and nothing else, and it
        // is this side that decides whether there is anything there: a selection of
        // three spaces is not one.
        const selection = injection?.result || {};
        const text = String(selection.text || '').trim();
        const heading = String(selection.heading || '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!text) {
            notifyNote('noteNoSelection');
            sendResponse({ success: false, error: 'Nothing is selected' });
            return;
        }

        // The page's own heading is what the note is called; a page without one falls
        // back to the name the tab goes by.
        const title = heading || tab.title || '';
        const contextKey = getContentContextKey(tab);
        const timestamp = new Date().toISOString();
        const existing = title ? await findNoteByTitle(title, contextKey) : null;

        const note = existing
            ? { ...existing, content: `${existing.content || ''}${selectionToNoteHtml(text)}` }
            : {
                  id: Date.now() + Math.random(),
                  title,
                  content: selectionToNoteHtml(text),
                  category: PAGE_NOTE_CATEGORY,
                  contextKey,
                  type: 'text',
                  timestamp,
                  isPersistent: false,
              };
        note.modifiedTimestamp = timestamp;
        await saveNoteToDb(note);

        // Only the group: it is the key the note's own `contextKey` resolves back to,
        // and the panel files its notes the same way. One that was added to is listed
        // already, and the index refuses to list it twice.
        await addToContentSessionIndex(NOTES_STORAGE_KEY, [getContentSessionKeys(tab).group], note.id);

        chrome.runtime.sendMessage({ action: 'noteCreatedFromPage', noteId: note.id });
        notifyNote(existing ? 'noteAppended' : 'noteSaved', existing ? [title] : []);
        sendResponse({ success: true, noteId: note.id, appended: !!existing });
    } catch (error) {
        console.error('Error creating the note from the selection:', error);
        notifyNote('noteFromSelectionFailed');
        sendResponse({ success: false, error: error.message });
    }
}

/** The tray notice this handler puts up; the shape every other one uses. */
function notifyNote(key, params = []) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: '/assets/icons/icon128.png',
        title: 'Intelligent Tab Group',
        message: getI18nMsg(key, params),
    });
}
