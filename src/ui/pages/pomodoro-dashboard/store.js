import { writable, derived } from 'svelte/store';

export const allData = writable([]);
export const activePeriod = writable(0);
export const activeFolder = writable(null);
export const activeProject = writable(null);
export const activeTag = writable('');
export const sidebarQuery = writable('');
export const openFolders = writable(new Set());
export const closedFolders = writable(new Set());

export const filteredData = derived(
    [allData, activePeriod, activeFolder, activeProject, activeTag],
    ([$allData, $activePeriod, $activeFolder, $activeProject, $activeTag]) => {
        const now = Date.now();
        return $allData.filter((e) => {
            if ($activePeriod > 0 && e.savedAt < now - $activePeriod * 86400000) return false;
            if ($activePeriod === 1) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (e.savedAt < today.getTime()) return false;
            }
            if ($activeTag && (e.projectTag || '') !== $activeTag) return false;
            if ($activeProject) {
                if (e.projectName !== $activeProject) return false;
            } else if ($activeFolder !== null) {
                if ((e.projectFolder || '') !== $activeFolder) return false;
            }
            return true;
        });
    },
);
