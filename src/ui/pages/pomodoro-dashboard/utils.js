export const fmtDur = (secs) => {
    secs = Math.max(0, Math.round(secs));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

export const fmtH = (secs, i18n) => (secs / 3600).toFixed(1) + i18n('dashboardFocusH_abbrev');

export const fmtDate = (ts, lang) =>
    !ts
        ? '--'
        : new Date(ts).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
          });
export const fmtDateShort = (ts, lang) =>
    !ts ? '--' : new Date(ts).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: '2-digit', month: 'short' });
export const fmtTime = (ts, lang) =>
    !ts
        ? '--'
        : new Date(ts).toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

export const dayKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const effColor = (pct) => {
    if (pct >= 80) return 'color-mix(in srgb, var(--interactive-color) 90%, var(--text-on-color))';
    if (pct >= 60) return 'var(--interactive-color)';
    if (pct >= 40) return 'color-mix(in srgb, var(--interactive-color) 70%, var(--action-color))';
    return 'var(--error-color)';
};

export const PROJECT_COLORS = [
    'var(--interactive-color)',
    'var(--action-color)',
    'color-mix(in srgb, var(--interactive-color) 70%, var(--text-on-color))',
    'color-mix(in srgb, var(--action-color)      70%, var(--text-on-color))',
    'color-mix(in srgb, var(--interactive-color) 55%, var(--bg-color))',
    'color-mix(in srgb, var(--action-color)      55%, var(--bg-color))',
    'color-mix(in srgb, var(--error-color)       80%, var(--bg-panel-color))',
    'color-mix(in srgb, var(--interactive-color) 40%, var(--text-on-color))',
    'color-mix(in srgb, var(--action-color)      40%, var(--text-on-color))',
    'color-mix(in srgb, var(--interactive-color) 30%, var(--bg-color))',
    'color-mix(in srgb, var(--action-color)      30%, var(--bg-color))',
    'color-mix(in srgb, var(--error-color)       50%, var(--bg-panel-color))',
    'color-mix(in srgb, var(--interactive-color) 85%, var(--action-color))',
    'color-mix(in srgb, var(--action-color)      85%, var(--interactive-color))',
    'color-mix(in srgb, var(--interactive-color) 60%, var(--error-color))',
    'color-mix(in srgb, var(--action-color)      60%, var(--error-color))',
];
export const projColor = (idx) => PROJECT_COLORS[idx % PROJECT_COLORS.length];

export const cssVar = (v) => {
    const name = v.startsWith('var(') ? v.slice(4, -1) : v.startsWith('--') ? v : '--' + v;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name;
};
export const colorMix = (color, alpha) => {
    if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
    if (color.startsWith('rgb')) {
        return color
            .replace(/rgb\(|rgba\(/, 'rgba(')
            .replace(/\)$/, `,${alpha})`)
            .replace(/,[\d.]+\)$/, `,${alpha})`);
    }
    return color;
};

// DB
// Name, version and stores come from the one schema the whole extension shares.
// This file used to name them itself, pinned at version 6: the day the schema moved
// on, `indexedDB.open` refused to open the newer database and the dashboard showed
// nothing at all.
import '../../../core/services/dbSchema.js';

const { name: DB_NAME, version: DB_VER, stores: ITG_STORES } = globalThis.ITG_DB_SCHEMA;
const STORE = ITG_STORES.pomodoroStats;

export function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (event) =>
            globalThis.ITG_DB_SCHEMA.upgrade(event.target.result, event.target.transaction);
    });
}

export async function getAllStats() {
    let db;
    try {
        db = await openDb();
    } catch (err) {
        throw new Error(`DB Error: ${err.message || err}`);
    }
    if (!db.objectStoreNames.contains(STORE)) {
        db.close();
        return [];
    }
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction([STORE], 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = () => {
                db.close();
                resolve(req.result || []);
            };
            req.onerror = () => {
                db.close();
                reject(req.error);
            };
        } catch (err) {
            db.close();
            reject(err);
        }
    });
}

export const FOLDER_CLOSED_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M3 8.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C4.52 5 5.08 5 6.2 5h3.475c.489 0 .733 0 .963.055.204.05.4.13.579.24.201.123.374.296.72.642l.126.126c.346.346.519.519.72.642q.271.165.579.24c.23.055.474.055.963.055H17.8c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C21 8.52 21 9.08 21 10.2v5.6c0 1.12 0 1.68-.218 2.108a2 2 0 0 1-.874.874C19.48 19 18.92 19 17.8 19H6.2c-1.12 0-1.68 0-2.108-.218a2 2 0 0 1-.874-.874C3 17.48 3 16.92 3 15.8z"/></svg>`;
export const FOLDER_OPEN_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4 9V6.472a2 2 0 0 1 .211-.894L5 4h5l1 2h10a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2h-2"/><path d="M17.236 9H2.31a1 1 0 0 0-.965 1.263l2.254 8.263A2 2 0 0 0 5.528 20H19.69a1 1 0 0 0 .965-1.263l-2.455-9A1 1 0 0 0 17.236 9Z"/></svg>`;
export const CLOCK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
export const ALERT_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
