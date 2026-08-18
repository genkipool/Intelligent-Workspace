/**
 * Playlist helpers for the music player.
 *
 * Everything here is pure: it turns a folder's files into a playlist, searches it
 * and formats times. No DOM, no audio, no stores, so the rules that decide what
 * counts as music live in one place and can be reused or tested on their own.
 */

/** Extensions the player accepts. Chrome can decode all of these. */
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac', 'weba', 'webm', 'mp4'];

const EXTENSION_RE = new RegExp(`\\.(${AUDIO_EXTENSIONS.join('|')})$`, 'i');

/**
 * Is this file something the player can play?
 *
 * The MIME type is checked first because it is what the browser will honour, and
 * the extension second because folders often hold files Chrome reports as empty.
 *
 * @param {File} file
 * @returns {boolean}
 */
export function isAudioFile(file) {
    if (!file || typeof file.name !== 'string') return false;
    if (typeof file.type === 'string' && file.type.startsWith('audio/')) return true;
    return EXTENSION_RE.test(file.name);
}

/**
 * The name to show for a track: the file name without its extension.
 *
 * @param {string} fileName
 * @returns {string}
 */
export function trackTitleFromFileName(fileName) {
    return String(fileName || '').replace(EXTENSION_RE, '');
}

/**
 * Cleans and normalizes folder path (removes leading/trailing slashes).
 *
 * @param {string} p
 * @returns {string}
 */
export function normalizeFolderPath(p) {
    return String(p || '')
        .trim()
        .replace(/^\/+|\/+$/g, '')
        .replace(/\/+/g, '/');
}

/**
 * Checks if two folder paths refer to the same folder (e.g. 'musica/musica2' ends with 'musica2' or viceversa).
 *
 * @param {string} folderA
 * @param {string} folderB
 * @returns {boolean}
 */
export function isSameOrSubfolderMatch(folderA, folderB) {
    const a = normalizeFolderPath(folderA).toLowerCase();
    const b = normalizeFolderPath(folderB).toLowerCase();
    if (!a || !b) return a === b;
    if (a === b) return true;
    return a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

/**
 * Finds the canonical existing folder name for a newly picked file/folder.
 * If 'musica/musica2' already exists and we upload 'musica2', it matches 'musica/musica2'.
 *
 * @param {string} newFolder
 * @param {Iterable<string>} existingFolders
 * @returns {string}
 */
export function resolveCanonicalFolder(newFolder, existingFolders) {
    const normalizedNew = normalizeFolderPath(newFolder);
    if (!normalizedNew) return '';
    for (const existing of existingFolders) {
        const normalizedExisting = normalizeFolderPath(existing);
        if (isSameOrSubfolderMatch(normalizedExisting, normalizedNew)) {
            // Prefer the longer/more specific existing path (e.g. 'musica/musica2' over 'musica2')
            return normalizedExisting.length >= normalizedNew.length ? normalizedExisting : normalizedNew;
        }
    }
    return normalizedNew;
}

/**
 * The folder a picked file came from, taken from the relative path or fallback folder name.
 *
 * @param {string|File} pathOrFile
 * @param {string} [defaultFolder='']
 * @returns {string}
 */
export function folderNameOf(pathOrFile, defaultFolder = '') {
    const rawPath = typeof pathOrFile === 'string' ? pathOrFile : pathOrFile?.webkitRelativePath || '';
    const parts = String(rawPath).split('/').filter(Boolean);
    if (parts.length > 1) {
        return normalizeFolderPath(parts.slice(0, -1).join('/'));
    }
    return normalizeFolderPath(defaultFolder);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Builds the playlist for a picked folder or files.
 *
 * Non-audio files are dropped, and what is left is sorted the way a file manager
 * would show it, so `track2` comes before `track10`.
 *
 * Entries may be plain `File`s — what a directory input hands over, path included —
 * or `{file, path}` pairs, which is how the File System Access API's walk reports
 * them, since files it produces carry no relative path of their own.
 *
 * @param {Iterable<File|{file: File, path: string}>} entries
 * @param {string} [defaultFolder='']
 * @returns {Array<{id: string, title: string, fileName: string, folder: string, path: string, size: number, file: File}>}
 */
export function buildPlaylist(entries, defaultFolder = '') {
    return Array.from(entries ?? [])
        .map((entry) => (entry instanceof File ? { file: entry, path: entry.webkitRelativePath } : entry))
        .filter((entry) => entry?.file && isAudioFile(entry.file))
        .map(({ file, path }, index) => {
            const folder = folderNameOf(path, defaultFolder);
            const fullPath = path || (folder ? `${folder}/${file.name}` : file.name);
            return {
                id: `${index}:${fullPath}`,
                title: trackTitleFromFileName(file.name),
                fileName: file.name,
                folder,
                path: fullPath,
                size: file.size ?? 0,
                file,
            };
        })
        .sort((a, b) => collator.compare(a.path, b.path))
        .map((track, index) => ({ ...track, index }));
}

/**
 * Groups tracks into folders for nested playlist display.
 * Tracks without a folder are grouped under an empty string `""` or `other`.
 *
 * @param {Array<object>} tracks
 * @returns {Array<{folder: string, tracks: Array<object>}>}
 */
export function groupTracksByFolder(tracks) {
    if (!tracks || tracks.length === 0) return [];
    const groupsMap = new Map();
    for (const track of tracks) {
        const folder = track.folder || '';
        if (!groupsMap.has(folder)) {
            groupsMap.set(folder, []);
        }
        groupsMap.get(folder).push(track);
    }
    return Array.from(groupsMap.entries()).map(([folder, folderTracks]) => ({
        folder,
        tracks: folderTracks,
    }));
}

/**
 * Searches the playlist by title, file name and folder.
 *
 * Every whitespace-separated word has to match somewhere, so "moon sonata" finds
 * a track no matter which order the words appear in.
 *
 * @param {Array<object>} tracks
 * @param {string} query
 * @returns {Array<object>}
 */
export function filterTracks(tracks, query) {
    const words = String(query || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return tracks;
    return tracks.filter((track) => {
        const haystack = `${track.title} ${track.fileName} ${track.folder}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
    });
}

/**
 * Seconds as `m:ss`, or `h:mm:ss` once the track runs past an hour.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

/**
 * Where a click on the progress bar points to, as a fraction of the track.
 *
 * @param {number} clientX pointer position
 * @param {DOMRect} rect the bar's box
 * @returns {number} between 0 and 1
 */
export function ratioFromPointer(clientX, rect) {
    if (!rect || !rect.width) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}
