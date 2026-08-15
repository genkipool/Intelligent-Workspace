/**
 * [AI INSTRUCTION]
 * SINGLE DEFINITION OF THE IndexedDB SCHEMA. Do not describe stores anywhere else.
 *
 * The same database, `Intelligent_Workspace`, is opened from two places: the service
 * worker (a classic script loaded with importScripts) and the pages (ES modules).
 * Because neither can import the other's format, the schema used to be written twice
 * — same version, same five stores, same indexes, copied by hand. They happened to
 * still agree, but a store added on one side only would make one context trigger an
 * upgrade the other does not expect.
 *
 * This file has no imports and no exports on purpose, so it works both ways:
 *   - worker: importScripts('/services/dbSchema.js')
 *   - pages:  import '../../core/services/dbSchema.js'   (side effect)
 * and publishes itself on globalThis.
 *
 * Bumping the version: raise ITG_DB_VERSION and make applyItgDbUpgrade able to reach
 * the new shape from any older one. onupgradeneeded runs once for the whole jump.
 */
const ITG_DB_SCHEMA = {
    name: 'Intelligent_Workspace',
    version: 6,
    stores: {
        screenshots: 'screenshots',
        conversations: 'geminiConversations',
        notes: 'notesStore',
        backups: 'backupsGroups',
        pomodoroStats: 'pomodoroStats',
    },

    /**
     * Creates whatever is missing. Called from onupgradeneeded in both contexts.
     * @param {IDBDatabase} db
     * @param {IDBTransaction|null} transaction - event.target.transaction
     */
    upgrade(db, transaction) {
        const s = ITG_DB_SCHEMA.stores;

        if (!db.objectStoreNames.contains(s.screenshots)) {
            db.createObjectStore(s.screenshots, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(s.conversations)) {
            db.createObjectStore(s.conversations, { keyPath: 'id' });
        }

        // Notes started out with autoIncrement and moved to an explicit id; an old
        // store with the previous shape is rebuilt.
        if (db.objectStoreNames.contains(s.notes)) {
            if (transaction) {
                const store = transaction.objectStore(s.notes);
                if (store.autoIncrement) {
                    db.deleteObjectStore(s.notes);
                    db.createObjectStore(s.notes, { keyPath: 'id' });
                }
            }
        } else {
            db.createObjectStore(s.notes, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(s.backups)) {
            // The group id is what identifies each backup.
            db.createObjectStore(s.backups, { keyPath: 'group.id' });
        }

        if (!db.objectStoreNames.contains(s.pomodoroStats)) {
            const pomoStore = db.createObjectStore(s.pomodoroStats, { keyPath: 'id' });
            pomoStore.createIndex('projectName', 'projectName', { unique: false });
            pomoStore.createIndex('savedAt', 'savedAt', { unique: false });
        }
    },
};

globalThis.ITG_DB_SCHEMA = ITG_DB_SCHEMA;
