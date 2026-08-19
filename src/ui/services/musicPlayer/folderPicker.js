/**
 * Choosing the folder the player reads from.
 *
 * The obvious way — an `<input webkitdirectory>` — makes Chrome ask "upload N files
 * to this site?" before handing anything over, which is the wrong question for a
 * player that never uploads anything. The File System Access API asks for the folder
 * once, with no upload wording, so it is the path taken whenever it exists; the
 * input stays behind it as a fallback for browsers that lack it.
 */
import { isAudioFile } from './playlist.js';

/** Guards against a picked folder with a runaway tree. */
const MAX_DEPTH = 4;
const MAX_FILES = 2000;

/** Can this browser hand over a folder without the upload prompt? */
export function canPickDirectory() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Can this browser open a file picker via File System Access API? */
export function canPickFiles() {
    return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

/**
 * Asks for multiple audio files and returns them.
 *
 * @returns {Promise<{items: Array<{file: File, path: string}>, folder: string}|null>}
 */
export async function pickFiles() {
    let handles;
    try {
        handles = await window.showOpenFilePicker({
            id: 'itg-music-files',
            multiple: true,
            startIn: 'music',
            types: [
                {
                    description: 'Audio Files',
                    accept: {
                        'audio/*': [
                            '.mp3',
                            '.mpeg',
                            '.m4a',
                            '.aac',
                            '.ogg',
                            '.oga',
                            '.opus',
                            '.wav',
                            '.flac',
                            '.weba',
                            '.webm',
                            '.mp4',
                        ],
                    },
                },
            ],
        });
    } catch (error) {
        if (error?.name === 'AbortError') return null;
        throw error;
    }

    if (!handles || handles.length === 0) return null;

    const items = [];
    for (const handle of handles) {
        const file = await handle.getFile();
        if (isAudioFile(file)) {
            items.push({ file, path: file.name });
        }
    }
    return { items, folder: '' };
}

/**
 * Asks for a folder and returns the music inside it, subfolders included.
 *
 * @returns {Promise<{items: Array<{file: File, path: string}>, folder: string}|null>}
 *   `null` when the person closed the picker without choosing.
 */
export async function pickDirectory() {
    let handle;
    try {
        handle = await window.showDirectoryPicker({ id: 'itg-music', mode: 'read', startIn: 'music' });
    } catch (error) {
        // Closing the picker is an answer, not a failure.
        if (error?.name === 'AbortError') return null;
        throw error;
    }

    const items = [];
    await collect(handle, handle.name, items, 0);
    return { items, folder: handle.name };
}

/**
 * Walks a directory handle, keeping only what the player can decode.
 *
 * @param {FileSystemDirectoryHandle} directory
 * @param {string} prefix path shown to the reader, so search can match on folders
 * @param {Array} items collected so far
 * @param {number} depth
 */
async function collect(directory, prefix, items, depth) {
    for await (const entry of directory.values()) {
        if (items.length >= MAX_FILES) return;
        const path = `${prefix}/${entry.name}`;
        if (entry.kind === 'directory') {
            if (depth < MAX_DEPTH) await collect(entry, path, items, depth + 1);
            continue;
        }
        const file = await entry.getFile();
        if (isAudioFile(file)) items.push({ file, path });
    }
}
