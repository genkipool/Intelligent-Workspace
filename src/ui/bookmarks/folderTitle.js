import { msg } from '../../utils/i18n.js';

/*
 * Chrome names its own root folders ("Bookmarks bar", "Other bookmarks", "Mobile
 * bookmarks") in the browser's language. The extension may be set to another one, so
 * those three are named by their type and translated here; every other folder keeps
 * the name the user gave it.
 */
const ROOT_FOLDER_KEYS = {
    'bookmarks-bar': 'bookmarkBar',
    other: 'otherBookmarks',
    mobile: 'mobileBookmarks',
};
// Chrome before 134 has no `folderType`; there the root folders have fixed ids.
const ROOT_FOLDER_IDS = { 1: 'bookmarks-bar', 2: 'other', 3: 'mobile' };

/** The name to show for a bookmark folder, in the extension's language. */
export function bookmarkFolderTitle(node) {
    const type = node?.folderType || (node?.parentId === '0' ? ROOT_FOLDER_IDS[node.id] : undefined);
    const key = ROOT_FOLDER_KEYS[type];
    return (key && msg(key)) || node?.title || msg('untitledFolder');
}
