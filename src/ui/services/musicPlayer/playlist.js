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
 * The folder a picked file came from, taken from the relative path the directory
 * input fills in. Falls back to an empty string for a plain multi-file pick.
 *
 * @param {File} file
 * @returns {string}
 */
export function folderNameOf(file) {
    const parts = String(file?.webkitRelativePath || '').split('/');
    return parts.length > 1 ? parts[0] : '';
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Builds the playlist for a picked folder.
 *
 * Non-audio files are dropped, and what is left is sorted the way a file manager
 * would show it, so `track2` comes before `track10`.
 *
 * Entries may be plain `File`s — what a directory input hands over, path included —
 * or `{file, path}` pairs, which is how the File System Access API's walk reports
 * them, since files it produces carry no relative path of their own.
 *
 * @param {Iterable<File|{file: File, path: string}>} entries
 * @returns {Array<{id: string, title: string, fileName: string, folder: string, path: string, size: number, file: File}>}
 */
export function buildPlaylist(entries) {
    return Array.from(entries ?? [])
        .map((entry) => (entry instanceof File ? { file: entry, path: entry.webkitRelativePath } : entry))
        .filter((entry) => entry?.file && isAudioFile(entry.file))
        .map(({ file, path }, index) => ({
            id: `${index}:${path || file.name}`,
            title: trackTitleFromFileName(file.name),
            fileName: file.name,
            folder: folderNameOf(path),
            path: path || file.name,
            size: file.size ?? 0,
            file,
        }))
        .sort((a, b) => collator.compare(a.path, b.path))
        .map((track, index) => ({ ...track, index }));
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
