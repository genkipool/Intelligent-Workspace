/**
 * Tests for Defect #9: Rule storage area persistence and synchronization.
 *
 * Verifies that StorageService resolves `ruleStorageArea` (sync vs local) for custom rules,
 * ensuring complete independence from `themeStorageArea`. When `ruleStorageArea` is 'local'
 * and `themeStorageArea` is 'sync', rules are read from and saved to `chrome.storage.local`,
 * and AI Assistant agent operations also respect `ruleStorageArea`.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

describe('Defect #9: StorageService ruleStorageArea synchronization', () => {
    let mockLocalStorage;
    let mockSyncStorage;
    let mockChrome;
    let context;
    let storageService;

    const createStorageMock = (store) => ({
        get: async (keys) => {
            if (typeof keys === 'string') {
                return { [keys]: store[keys] };
            }
            if (Array.isArray(keys)) {
                const result = {};
                for (const key of keys) {
                    if (key in store) result[key] = store[key];
                }
                return result;
            }
            if (keys && typeof keys === 'object') {
                const result = { ...keys };
                for (const key of Object.keys(keys)) {
                    if (key in store) result[key] = store[key];
                }
                return result;
            }
            return { ...store };
        },
        set: async (items) => {
            Object.assign(store, items);
        },
        remove: async (keys) => {
            const keyList = Array.isArray(keys) ? keys : [keys];
            for (const key of keyList) {
                delete store[key];
            }
        },
    });

    beforeEach(() => {
        mockLocalStorage = {};
        mockSyncStorage = {};

        mockChrome = {
            storage: {
                local: createStorageMock(mockLocalStorage),
                sync: createStorageMock(mockSyncStorage),
            },
            runtime: {
                sendMessage: () => {},
            },
            tabs: {
                query: async () => [],
            },
        };

        context = {
            console,
            chrome: mockChrome,
            setTimeout,
            clearTimeout,
            URL,
            isModeDebug: false,
            foldForSearch: (str) => String(str ?? '').toLowerCase(),
        };

        vm.createContext(context);
        const storageCode = readFileSync('src/core/services/storage.js', 'utf8');
        vm.runInContext(storageCode, context);
        storageService = context.StorageService;
    });

    describe('Storage area resolution (getRuleStorageArea vs getThemeStorageArea)', () => {
        it('resolves getRuleStorageArea to local when ruleStorageArea is "local"', async () => {
            mockLocalStorage.ruleStorageArea = 'local';
            const area = await storageService.getRuleStorageArea();
            assert.equal(area, mockChrome.storage.local);
        });

        it('resolves getRuleStorageArea to sync when ruleStorageArea is "sync"', async () => {
            mockLocalStorage.ruleStorageArea = 'sync';
            const area = await storageService.getRuleStorageArea();
            assert.equal(area, mockChrome.storage.sync);
        });

        it('defaults getRuleStorageArea to sync when ruleStorageArea is undefined', async () => {
            delete mockLocalStorage.ruleStorageArea;
            const area = await storageService.getRuleStorageArea();
            assert.equal(area, mockChrome.storage.sync);
        });

        it('resolves getThemeStorageArea independently of ruleStorageArea', async () => {
            mockLocalStorage.themeStorageArea = 'sync';
            mockLocalStorage.ruleStorageArea = 'local';

            const themeArea = await storageService.getThemeStorageArea();
            const ruleArea = await storageService.getRuleStorageArea();

            assert.equal(themeArea, mockChrome.storage.sync, 'Theme area should resolve to sync');
            assert.equal(ruleArea, mockChrome.storage.local, 'Rule area should resolve to local');
        });
    });

    describe('getCustomRules() and saveCustomRules() persistence routing', () => {
        it('reads and saves rules to local when ruleStorageArea="local" and themeStorageArea="sync"', async () => {
            mockLocalStorage.ruleStorageArea = 'local';
            mockLocalStorage.themeStorageArea = 'sync';
            mockLocalStorage.customRules = [{ name: 'LocalDev', urls: ['localhost'] }];
            mockSyncStorage.customRules = [{ name: 'StaleSync', urls: ['old.com'] }];

            // Verify getCustomRules reads from local
            const retrievedRules = await storageService.getCustomRules();
            assert.deepEqual(
                retrievedRules,
                [{ name: 'LocalDev', urls: ['localhost'] }],
                'getCustomRules must return rules from local storage',
            );

            // Verify saveCustomRules writes to local without mutating sync
            const updatedRules = [
                { name: 'LocalDev', urls: ['localhost'] },
                { name: 'Work', urls: ['jira.company.com'] },
            ];
            await storageService.saveCustomRules(updatedRules);

            assert.deepEqual(mockLocalStorage.customRules, updatedRules, 'Rules must be saved to local storage');
            assert.deepEqual(
                mockSyncStorage.customRules,
                [{ name: 'StaleSync', urls: ['old.com'] }],
                'Sync storage customRules must remain unaltered',
            );
        });

        it('reads and saves rules to sync when ruleStorageArea="sync" and themeStorageArea="local"', async () => {
            mockLocalStorage.ruleStorageArea = 'sync';
            mockLocalStorage.themeStorageArea = 'local';
            mockLocalStorage.customRules = [{ name: 'LocalRule', urls: ['ignore.local'] }];
            mockSyncStorage.customRules = [{ name: 'SyncRule', urls: ['sync.com'] }];

            const retrievedRules = await storageService.getCustomRules();
            assert.deepEqual(retrievedRules, [{ name: 'SyncRule', urls: ['sync.com'] }]);

            const newRules = [
                { name: 'SyncRule', urls: ['sync.com'] },
                { name: 'News', urls: ['bbc.com'] },
            ];
            await storageService.saveCustomRules(newRules);

            assert.deepEqual(mockSyncStorage.customRules, newRules, 'Rules must be saved to sync storage');
            assert.deepEqual(
                mockLocalStorage.customRules,
                [{ name: 'LocalRule', urls: ['ignore.local'] }],
                'Local storage customRules must remain unaltered',
            );
        });

        it('themes continue to route according to themeStorageArea without interference', async () => {
            mockLocalStorage.ruleStorageArea = 'local';
            mockLocalStorage.themeStorageArea = 'sync';
            mockLocalStorage.savedThemes = [{ id: 'local-theme', name: 'Dark Local' }];
            mockSyncStorage.savedThemes = [{ id: 'sync-theme', name: 'Neon Sync' }];

            const themes = await storageService.getSavedThemes();
            assert.deepEqual(themes, [{ id: 'sync-theme', name: 'Neon Sync' }], 'Themes should come from sync area');

            await storageService.saveSavedThemes([...themes, { id: 'new-theme', name: 'Ocean' }]);
            assert.equal(mockSyncStorage.savedThemes.length, 2);
            assert.equal(mockLocalStorage.savedThemes.length, 1, 'Local themes should remain untouched');
        });
    });

    describe('AI Assistant (agent-backend.js) rules integration', () => {
        let agentTools;

        beforeEach(() => {
            const agentCode = readFileSync('src/core/agent-backend.js', 'utf8');
            vm.runInContext(agentCode, context);
            agentTools = vm.runInContext('AGENT_TOOLS', context);
        });

        it('agentTools.getRules() reads from local storage when ruleStorageArea="local"', async () => {
            mockLocalStorage.ruleStorageArea = 'local';
            mockLocalStorage.themeStorageArea = 'sync';
            mockLocalStorage.customRules = [{ name: 'MyLocalRule', urls: ['local.dev'] }];
            mockSyncStorage.customRules = [{ name: 'StaleSyncRule', urls: ['stale.com'] }];

            const rulesJson = await agentTools.getRules();
            const rules = JSON.parse(rulesJson);

            assert.deepEqual(rules, [{ name: 'MyLocalRule', urls: ['local.dev'] }]);
        });

        it('agentTools.createRule() saves to local storage when ruleStorageArea="local"', async () => {
            mockLocalStorage.ruleStorageArea = 'local';
            mockLocalStorage.themeStorageArea = 'sync';
            mockLocalStorage.customRules = [{ name: 'Existing', urls: ['existing.com'] }];
            mockSyncStorage.customRules = [{ name: 'SyncBackup', urls: ['sync.com'] }];

            const result = await agentTools.createRule({
                name: 'Research',
                urls: ['arxiv.org', 'biorxiv.org'],
                color: 'blue',
            });

            assert.match(result, /Rule "Research" created/);
            assert.equal(mockLocalStorage.customRules.length, 2);
            assert.equal(mockLocalStorage.customRules[1].name, 'Research');
            assert.deepEqual(mockLocalStorage.customRules[1].urls, ['https://arxiv.org', 'https://biorxiv.org']);
            assert.equal(mockLocalStorage.customRules[1].color, 'blue');

            // Sync storage must remain completely unpolluted
            assert.deepEqual(
                mockSyncStorage.customRules,
                [{ name: 'SyncBackup', urls: ['sync.com'] }],
                'Sync storage must not be modified when ruleStorageArea is local',
            );
        });
    });
});
