import { writable, derived } from 'svelte/store';

/**
 * Formats bytes into a human-readable string (KB, MB, GB).
 * @param {number} bytes
 * @param {number} decimals
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Gets a clean filename from a download item.
 * @param {Object} item
 * @returns {string}
 */
export function getFilename(item) {
    if (item.filename) {
        return item.filename.replace(/\\/g, '/').split('/').pop() || 'download';
    }
    if (item.url) {
        try {
            const pathname = new URL(item.url).pathname;
            const name = pathname.split('/').pop();
            if (name) return decodeURIComponent(name);
        } catch {
            // ignore
        }
    }
    return 'download';
}

/**
 * Determines a category / file extension icon type for styling.
 * @param {string} filename
 * @param {string} mime
 * @returns {string} 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'archive' | 'code' | 'executable' | 'generic'
 */
export function getFileCategory(filename = '', mime = '') {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext) || mime.startsWith('image/')) {
        return 'image';
    }
    if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv'].includes(ext) || mime.startsWith('video/')) {
        return 'video';
    }
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext) || mime.startsWith('audio/')) {
        return 'audio';
    }
    if (ext === 'pdf' || mime === 'application/pdf') {
        return 'pdf';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'tgz'].includes(ext)) {
        return 'archive';
    }
    if (['doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'md'].includes(ext)) {
        return 'document';
    }
    if (
        [
            'js',
            'ts',
            'jsx',
            'tsx',
            'html',
            'css',
            'json',
            'py',
            'rs',
            'go',
            'c',
            'cpp',
            'java',
            'sh',
            'php',
            'xml',
            'yaml',
            'yml',
        ].includes(ext)
    ) {
        return 'code';
    }
    if (['exe', 'msi', 'deb', 'rpm', 'apk', 'dmg', 'pkg', 'appimage'].includes(ext)) {
        return 'executable';
    }
    return 'generic';
}

/**
 * Groups downloads by date (newest first).
 * @param {Array} items
 * @returns {Array} Array of groups { label, timestamp, items }
 */
export function groupDownloadsByDate(items) {
    const groups = new Map();

    items.forEach((item) => {
        const timeValue = item.startTime ? new Date(item.startTime).getTime() : Date.now();
        const date = new Date(timeValue);

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        const groupLabel = `${day}-${month}-${year}`;
        const groupKey = new Date(date).setHours(0, 0, 0, 0);

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                label: groupLabel,
                timestamp: groupKey,
                items: [],
            });
        }
        groups.get(groupKey).items.push(item);
    });

    return Array.from(groups.values()).sort((a, b) => b.timestamp - a.timestamp);
}

// ─── Reactive Stores ─────────────────────────────────────────────

const rawDownloads = writable([]);
export const downloadsLoaded = writable(false);
export const downloadsSearchQuery = writable('');
export const downloadsStatusFilter = writable('all'); // 'all' | 'in_progress' | 'complete' | 'interrupted'
export const downloadsDateFilter = writable(null); // { start: number, end: number } | null

/**
 * Filtered downloads based on search term, status tab, and date filter.
 */
const filteredDownloads = derived(
    [rawDownloads, downloadsSearchQuery, downloadsStatusFilter, downloadsDateFilter],
    ([$rawDownloads, $searchQuery, $statusFilter, $dateFilter]) => {
        let list = $rawDownloads;

        // Filter by date range (calendar)
        if ($dateFilter && $dateFilter.start && $dateFilter.end) {
            list = list.filter((item) => {
                const timeValue = item.startTime ? new Date(item.startTime).getTime() : 0;
                return timeValue >= $dateFilter.start && timeValue <= $dateFilter.end;
            });
        }

        // Filter by status tab
        if ($statusFilter === 'in_progress') {
            list = list.filter((item) => item.state === 'in_progress');
        } else if ($statusFilter === 'complete') {
            list = list.filter((item) => item.state === 'complete');
        } else if ($statusFilter === 'interrupted') {
            list = list.filter((item) => item.state === 'interrupted' || item.paused);
        }

        // Filter by search query
        if ($searchQuery && $searchQuery.trim() !== '') {
            const term = $searchQuery.trim().toLowerCase();
            list = list.filter((item) => {
                const name = getFilename(item).toLowerCase();
                const url = (item.url || '').toLowerCase();
                return name.includes(term) || url.includes(term);
            });
        }

        return list;
    },
);

/**
 * Grouped downloads store for view consumption.
 */
const groupedStore = derived(filteredDownloads, ($filtered) => groupDownloadsByDate($filtered));

/**
 * Summary stats for header chips.
 */
export const downloadStats = derived(rawDownloads, ($downloads) => {
    let inProgress = 0;
    let complete = 0;
    let interrupted = 0;

    $downloads.forEach((d) => {
        if (d.state === 'in_progress') inProgress++;
        else if (d.state === 'complete') complete++;
        else if (d.state === 'interrupted' || d.paused) interrupted++;
    });

    return {
        total: $downloads.length,
        inProgress,
        complete,
        interrupted,
    };
});

// ─── Live Event Listeners Setup ──────────────────────────────────

let listenersInitialized = false;

function initDownloadListeners() {
    if (listenersInitialized || typeof chrome === 'undefined' || !chrome.downloads) return;
    listenersInitialized = true;

    if (chrome.downloads.onCreated) {
        chrome.downloads.onCreated.addListener((downloadItem) => {
            rawDownloads.update((list) => {
                const index = list.findIndex((d) => d.id === downloadItem.id);
                if (index >= 0) {
                    const copy = [...list];
                    copy[index] = { ...copy[index], ...downloadItem };
                    return copy;
                }
                return [downloadItem, ...list];
            });
        });
    }

    if (chrome.downloads.onChanged) {
        chrome.downloads.onChanged.addListener((delta) => {
            rawDownloads.update((list) => {
                const index = list.findIndex((d) => d.id === delta.id);
                if (index === -1) return list;

                const copy = [...list];
                const item = { ...copy[index] };

                if (delta.filename) item.filename = delta.filename.current;
                if (delta.state) item.state = delta.state.current;
                if (delta.paused) item.paused = delta.paused.current;
                if (delta.canResume) item.canResume = delta.canResume.current;
                if (delta.error) item.error = delta.error.current;
                if (delta.bytesReceived) item.bytesReceived = delta.bytesReceived.current;
                if (delta.totalBytes) item.totalBytes = delta.totalBytes.current;
                if (delta.endTime) item.endTime = delta.endTime.current;
                if (delta.exists) item.exists = delta.exists.current;

                copy[index] = item;
                return copy;
            });
        });
    }

    if (chrome.downloads.onErased) {
        chrome.downloads.onErased.addListener((downloadId) => {
            rawDownloads.update((list) => list.filter((d) => d.id !== downloadId));
        });
    }
}

// ─── Exported Store & Methods ────────────────────────────────────

export const downloadsStore = {
    subscribe: groupedStore.subscribe,
    raw: rawDownloads,

    loadDownloads: async (query = '') => {
        initDownloadListeners();
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads?.search) {
                const searchQuery = {
                    orderBy: ['-startTime'],
                    limit: 500,
                };
                if (query && query.trim() !== '') {
                    searchQuery.query = [query.trim()];
                }
                const results = await new Promise((resolve) => {
                    chrome.downloads.search(searchQuery, (res) => {
                        resolve(res || []);
                    });
                });
                rawDownloads.set(results);
            } else {
                const response = await chrome.runtime.sendMessage({
                    action: 'getDownloads',
                    query,
                });
                if (response?.success && response.results) {
                    rawDownloads.set(response.results);
                } else {
                    rawDownloads.set([]);
                }
            }
        } catch (err) {
            console.error('[downloadsStore] Failed to load downloads:', err);
            rawDownloads.set([]);
        } finally {
            downloadsLoaded.set(true);
        }
    },

    pauseDownload: async (id) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads?.pause) {
                await new Promise((resolve) => chrome.downloads.pause(id, resolve));
            } else {
                await chrome.runtime.sendMessage({ action: 'pauseDownload', id });
            }
            rawDownloads.update((list) => list.map((d) => (d.id === id ? { ...d, paused: true, canResume: true } : d)));
        } catch (e) {
            console.error('[downloadsStore] Error pausing download:', e);
        }
    },

    resumeDownload: async (id) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads?.resume) {
                await new Promise((resolve) => chrome.downloads.resume(id, resolve));
            } else {
                await chrome.runtime.sendMessage({ action: 'resumeDownload', id });
            }
            rawDownloads.update((list) =>
                list.map((d) => (d.id === id ? { ...d, paused: false, state: 'in_progress' } : d)),
            );
        } catch (e) {
            console.error('[downloadsStore] Error resuming download:', e);
        }
    },

    cancelDownload: async (id) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads?.cancel) {
                await new Promise((resolve) => chrome.downloads.cancel(id, resolve));
            } else {
                await chrome.runtime.sendMessage({ action: 'cancelDownload', id });
            }
            rawDownloads.update((list) =>
                list.map((d) => (d.id === id ? { ...d, state: 'interrupted', error: 'USER_CANCELED' } : d)),
            );
        } catch (e) {
            console.error('[downloadsStore] Error cancelling download:', e);
        }
    },

    retryDownload: async (item) => {
        try {
            const filename = getFilename(item);
            const options = {
                url: item.url,
                filename: filename && filename !== 'download' ? filename : undefined,
            };
            if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
                await new Promise((resolve) => chrome.downloads.download(options, resolve));
            } else {
                await chrome.runtime.sendMessage({ action: 'retryDownload', url: item.url, filename });
            }
        } catch (e) {
            console.error('[downloadsStore] Error retrying download:', e);
        }
    },

    openFile: async (id) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads?.open) {
                chrome.downloads.open(id);
            } else {
                await chrome.runtime.sendMessage({ action: 'openDownload', id });
            }
        } catch (e) {
            console.warn('[downloadsStore] Fallback to show in folder:', e);
            downloadsStore.showInFolder(id);
        }
    },

    showInFolder: async (id) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads?.show) {
                chrome.downloads.show(id);
            } else {
                await chrome.runtime.sendMessage({ action: 'showDownloadFile', id });
            }
        } catch (e) {
            console.error('[downloadsStore] Error showing download in folder:', e);
        }
    },

    openDownloadsFolder: async () => {
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads?.showDefaultFolder) {
                chrome.downloads.showDefaultFolder();
            } else {
                await chrome.runtime.sendMessage({ action: 'openDownloadsFolder' });
            }
        } catch (e) {
            console.error('[downloadsStore] Error opening downloads folder:', e);
        }
    },

    eraseDownload: async (id) => {
        rawDownloads.update((list) => list.filter((d) => d.id !== id));
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads?.erase) {
                await new Promise((resolve) => chrome.downloads.erase({ id }, resolve));
            } else {
                await chrome.runtime.sendMessage({ action: 'eraseDownload', id });
            }
        } catch (e) {
            console.error('[downloadsStore] Error erasing download:', e);
        }
    },

    eraseGroup: async (groupItems) => {
        const ids = groupItems.map((i) => i.id);
        rawDownloads.update((list) => list.filter((d) => !ids.includes(d.id)));
        for (const id of ids) {
            try {
                if (typeof chrome !== 'undefined' && chrome.downloads?.erase) {
                    await new Promise((resolve) => chrome.downloads.erase({ id }, resolve));
                } else {
                    await chrome.runtime.sendMessage({ action: 'eraseDownload', id });
                }
            } catch (e) {
                console.error('[downloadsStore] Error erasing item from group:', e);
            }
        }
    },

    eraseAll: async () => {
        rawDownloads.set([]);
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads?.erase) {
                await new Promise((resolve) => chrome.downloads.erase({}, resolve));
            } else {
                await chrome.runtime.sendMessage({ action: 'eraseAllDownloads' });
            }
        } catch (e) {
            console.error('[downloadsStore] Error erasing all downloads:', e);
        }
    },
};
