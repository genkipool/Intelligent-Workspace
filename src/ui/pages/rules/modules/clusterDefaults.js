// Shape and defaults of the clustering configuration. The service worker's
// group-analyzer reads exactly this structure, so it must not drift.

export const DEFAULT_CLUSTER_CONFIG = {
    domainsEnabled: true,
    domainThreshold: 2,
    // Not part of the stored defaults, but the UI falls back to ?? false / ?? 2
    subdomainsEnabled: false,
    subdomainThreshold: 2,
    compactMode: {
        enabled: true,
        threshold: 12,
    },
    specialGroups: {
        chrome: { enabled: true, threshold: 1, name: 'Chrome:', color: 'blue', key: 'Chrome' },
        files: { enabled: true, threshold: 1, name: 'Files:', color: 'green', key: 'Files' },
        extensions: { enabled: true, threshold: 1, name: 'Extensions:', color: 'orange', key: 'Extensions' },
        misc: { enabled: true, threshold: 1, name: 'Misc', color: 'grey', key: 'Misc' },
        ipAddress: { enabled: true, threshold: 1, key: 'ipAddress' },
    },
};

// Merges the stored configuration with the defaults, preserving specialGroups
// key by key.
export function mergeClusterConfig(storedConfig = {}) {
    const mergedSpecialGroups = {};
    for (const key in DEFAULT_CLUSTER_CONFIG.specialGroups) {
        mergedSpecialGroups[key] = {
            ...DEFAULT_CLUSTER_CONFIG.specialGroups[key],
            ...(storedConfig.specialGroups?.[key] || {}),
        };
    }
    return {
        ...DEFAULT_CLUSTER_CONFIG,
        ...storedConfig,
        compactMode: {
            ...DEFAULT_CLUSTER_CONFIG.compactMode,
            ...(storedConfig.compactMode || {}),
        },
        specialGroups: mergedSpecialGroups,
    };
}

export function defaultClusterConfig() {
    return mergeClusterConfig({});
}

/**
 * Whether any grouping is active. The master switch is never independent: it only
 * reports whether something below it is on.
 */
export function isAnyClusterSwitchOn(config) {
    if (!config) return false;
    if (config.domainsEnabled || config.subdomainsEnabled || config.compactMode?.enabled) {
        return true;
    }
    const groups = config.specialGroups;
    if (groups) {
        for (const key in groups) {
            if (groups[key]?.enabled) return true;
        }
    }
    return false;
}

/**
 * Applies the master switch to every grouping. Turning it on restores domain
 * grouping (not subdomain, the two are exclusive) and all the special groups.
 *
 * @returns {object} A new configuration; the argument is left untouched.
 */
export function applyMasterSwitch(config, enabled) {
    const origGroups = config.specialGroups || {};
    const specialGroups = {};
    for (const key in origGroups) {
        specialGroups[key] = { ...origGroups[key], enabled };
    }
    return {
        ...config,
        compactMode: { ...config.compactMode, enabled },
        domainsEnabled: enabled,
        subdomainsEnabled: false,
        specialGroups,
    };
}

// The group markers the extension ships with. The service worker keeps the same set
// in its own state, and a reset has to land back on these rather than on empty
// fields, which is what "restore defaults" means everywhere else.
export const DEFAULT_USER_PREFIXES = {
    lock: '🔒',
    openKey: '🗝️',
    loupe: '🔍',
    checked: '',
    warning: '⚠️',
};

export function defaultUserPrefixes() {
    return { ...DEFAULT_USER_PREFIXES };
}
