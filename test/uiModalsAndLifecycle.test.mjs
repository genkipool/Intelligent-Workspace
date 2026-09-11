/**
 * Tests for Defects #14, #15, #16, #17: UI Modals, Svelte 5 Event Handling, and Component Lifecycle.
 *
 * - Defect #14: ViewConversationsModal empty state message renders {noResultsMessage} directly without double $t().
 * - Defect #15: CookieEditorModal uses stable key in {#each} to prevent keystroke focus drop on edit.
 * - Defect #16: SaveConversationModal stops Enter key propagation and includes isSaving re-entrancy guard.
 * - Defect #17: Dashboard.svelte imports unmount from Svelte and cleans up imperative mounts in onDestroy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('Defects #14, #15, #16, #17: UI Modals and Lifecycle', () => {
    describe('Defect #14: ViewConversationsModal empty state translation', () => {
        const modalCode = readFileSync('src/ui/components/listGroup/ViewConversationsModal.svelte', 'utf8');

        it('derives noResultsMessage with $t() in script', () => {
            assert.match(
                modalCode,
                /let\s+noResultsMessage\s*=\s*\$derived\([\s\S]*?\$t\(['"]noSavedConversations['"]\)[\s\S]*?\$t\(['"]noConversationsFoundForSearch['"]\)/,
                'noResultsMessage should derive translated string using $t()',
            );
        });

        it('renders {noResultsMessage} directly in template without double $t()', () => {
            assert.match(
                modalCode,
                /<p class="no-conversations-msg">\{noResultsMessage\}<\/p>/,
                'Template must interpolate {noResultsMessage} directly',
            );
            assert.equal(
                modalCode.includes('{$t(noResultsMessage)}'),
                false,
                'Template must NEVER wrap already-translated noResultsMessage in $t()',
            );
        });

        it('behavioral simulation: double-translation bug causes empty string while direct rendering preserves text', () => {
            const mockDictionary = {
                noSavedConversations: { message: 'No hay conversaciones guardadas' },
                noConversationsFoundForSearch: { message: 'No se encontraron conversaciones' },
            };

            const translate = (key) => mockDictionary[key]?.message || '';

            function deriveNoResultsMessage(conversations, searchTerm) {
                const term = searchTerm.toLowerCase().trim();
                const filtered = term
                    ? conversations.filter((c) => c.title.toLowerCase().includes(term))
                    : conversations;

                return filtered.length === 0
                    ? conversations.length === 0
                        ? translate('noSavedConversations')
                        : translate('noConversationsFoundForSearch')
                    : '';
            }

            const msg1 = deriveNoResultsMessage([], '');
            assert.equal(msg1, 'No hay conversaciones guardadas');

            const buggedResult = translate(msg1);
            assert.equal(
                buggedResult,
                '',
                'Double-translating returns empty string because translated string is not a dictionary key',
            );

            assert.equal(msg1, 'No hay conversaciones guardadas', 'Direct rendering displays proper message');

            const msg2 = deriveNoResultsMessage([{ title: 'Meeting notes' }], 'shopping');
            assert.equal(msg2, 'No se encontraron conversaciones');
            assert.equal(translate(msg2), '', 'Double-translating filter message also returns empty string');

            const msg3 = deriveNoResultsMessage([{ title: 'Meeting notes' }], 'meeting');
            assert.equal(msg3, '', 'No empty message when search matches');
        });
    });

    describe('Defect #15: CookieEditorModal stable key in {#each}', () => {
        const modalCode = readFileSync('src/ui/components/listGroup/CookieEditorModal.svelte', 'utf8');

        it('does not concatenate mutable cookie fields (name + domain + path) in each key', () => {
            assert.equal(
                /cookie\.name\s*\+\s*cookie\.domain\s*\+\s*cookie\.path/.test(modalCode),
                false,
                'Must not concatenate mutable domain/path fields in each block key',
            );
        });

        it('uses stable key expression (cookie._uid ?? i) in {#each}', () => {
            assert.match(
                modalCode,
                /\{#each\s+filteredCookies\s+as\s+cookie,\s*i\s*\((?:cookie\._uid\s*\?\?\s*i|i)\)\}/,
                'Must use stable key in {#each}',
            );
            assert.match(modalCode, /withCookieUid/, 'Must use helper to assign stable _uid');
        });

        it('behavioral simulation: typing in domain or path preserves card identity and does not change key', () => {
            let uidCounter = 0;
            const withCookieUid = (c) => (c._uid ? c : { ...c, _uid: ++uidCounter });

            const initialCookies = [
                withCookieUid({ name: 'session_id', domain: 'example.com', path: '/', value: 'xyz' }),
                withCookieUid({ name: 'pref', domain: 'example.com', path: '/', value: 'dark' }),
            ];

            const initialKeys = initialCookies.map((c, i) => c._uid ?? i);

            let currentCookies = initialCookies;
            const updateCookie = (index, field, value) => {
                currentCookies = currentCookies.map((c, i) => (i === index ? { ...c, [field]: value } : c));
            };

            updateCookie(0, 'domain', 'example.co');
            const keysAfterTyping1 = currentCookies.map((c, i) => c._uid ?? i);
            assert.deepEqual(keysAfterTyping1, initialKeys, 'Key must remain stable after first keystroke');

            updateCookie(0, 'domain', 'example.org');
            const keysAfterTyping2 = currentCookies.map((c, i) => c._uid ?? i);
            assert.deepEqual(keysAfterTyping2, initialKeys, 'Key must remain stable after modifying domain');

            updateCookie(0, 'path', '/api');
            const keysAfterTyping3 = currentCookies.map((c, i) => c._uid ?? i);
            assert.deepEqual(keysAfterTyping3, initialKeys, 'Key must remain stable after modifying path');

            const oldKeyInitial = initialCookies[0].name + initialCookies[0].domain + initialCookies[0].path;
            const oldKeyMutated = currentCookies[0].name + currentCookies[0].domain + currentCookies[0].path;
            assert.notEqual(
                oldKeyInitial,
                oldKeyMutated,
                'Old key would change from example.com/ to example.org/api, destroying DOM element and dropping focus',
            );
        });

        it('strips _uid before calling onSave', () => {
            assert.match(
                modalCode,
                /function\s+cleanCookie\s*\(\s*cookie\s*\)\s*\{[\s\S]*?delete\s+copy\._uid;[\s\S]*?return\s+copy;[\s\S]*?\}/,
                'Must define cleanCookie to remove internal _uid property',
            );
            assert.match(
                modalCode,
                /onSave\(workingCookies\.map\(cleanCookie\)\)/,
                'Must strip internal _uid before sending cookies to onSave callback',
            );
        });
    });

    describe('Defect #16: SaveConversationModal Enter keydown propagation and isSaving guard', () => {
        const modalCode = readFileSync('src/ui/components/listGroup/SaveConversationModal.svelte', 'utf8');

        it('handleKeydown stops event propagation on Enter key', () => {
            assert.match(
                modalCode,
                /if\s*\(e\.key\s*===\s*['"]Enter['"]\)\s*\{[\s\S]*?e\.stopPropagation\(\);/,
                'handleKeydown must call e.stopPropagation() on Enter',
            );
        });

        it('handleKeydown stops event propagation on Escape key', () => {
            assert.match(
                modalCode,
                /if\s*\(e\.key\s*===\s*['"]Escape['"]\)\s*\{[\s\S]*?e\.stopPropagation\(\);/,
                'handleKeydown must call e.stopPropagation() on Escape',
            );
        });

        it('handleSave contains re-entrancy guard if (saving) return', () => {
            assert.match(
                modalCode,
                /async\s+function\s+handleSave\(\)\s*\{[\s\S]*?if\s*\((?:saving|isSaving)\)\s*return;/,
                'handleSave must guard against concurrent re-entrant execution',
            );
        });

        it('behavioral simulation: event propagation stopped and handleSave executes once under concurrent calls', async () => {
            let propagationStopped = false;
            let defaultPrevented = false;

            const fakeEvent = {
                key: 'Enter',
                preventDefault: () => {
                    defaultPrevented = true;
                },
                stopPropagation: () => {
                    propagationStopped = true;
                },
            };

            const handleKeydown = (e, onEnter) => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    onEnter();
                }
            };

            let saveInvoked = 0;
            handleKeydown(fakeEvent, () => {
                saveInvoked++;
            });

            assert.equal(defaultPrevented, true);
            assert.equal(propagationStopped, true);
            assert.equal(saveInvoked, 1);

            let saving = false;
            let onSaveCallCount = 0;

            const onSave = async (title) => {
                onSaveCallCount++;
                await new Promise((r) => setTimeout(r, 20));
            };

            const handleSave = async (title) => {
                if (saving) return;
                const trimmed = (title || '').trim();
                if (!trimmed) return;

                saving = true;
                try {
                    await onSave(trimmed);
                } finally {
                    saving = false;
                }
            };

            const p1 = handleSave('My Research Chat');
            const p2 = handleSave('My Research Chat');

            await Promise.all([p1, p2]);

            assert.equal(
                onSaveCallCount,
                1,
                'onSave must be invoked exactly once, preventing double saves and index splice corruption',
            );
        });
    });

    describe('Defect #17: Dashboard.svelte imperative mount reference cleanup', () => {
        const dashboardCode = readFileSync('src/ui/pages/pomodoro-dashboard/Dashboard.svelte', 'utf8');

        it('imports unmount from svelte alongside mount', () => {
            assert.match(
                dashboardCode,
                /import\s*\{[^}]*?\bmount\b[^}]*?\bunmount\b[^}]*?\}\s*from\s*['"]svelte['"]/,
                'Dashboard.svelte must import unmount from svelte',
            );
        });

        it('declares apps object for tracking mounted subcomponent instances', () => {
            assert.match(
                dashboardCode,
                /let\s+apps\s*=\s*\{[\s\S]*?tagFilter:[\s\S]*?kpiGrid:[\s\S]*?hourGrid:[\s\S]*?heatmap:[\s\S]*?donutStats:[\s\S]*?projectTable:[\s\S]*?timeline:[\s\S]*?webPhases:/,
                'apps dictionary must define all 8 subcomponents',
            );
        });

        it('defines unmountApp and unmountAllApps helper functions', () => {
            assert.match(dashboardCode, /function\s+unmountApp\s*\(\s*key\s*\)\s*\{[\s\S]*?unmount\(apps\[key\]\);/);
            assert.match(dashboardCode, /function\s+unmountAllApps\s*\(\s*\)\s*\{/);
        });

        it('calls unmountApp before remounting components', () => {
            assert.match(dashboardCode, /unmountApp\(['"]tagFilter['"]\);/);
            assert.match(dashboardCode, /unmountApp\(['"]kpiGrid['"]\);/);
            assert.match(dashboardCode, /unmountApp\(['"]hourGrid['"]\);/);
            assert.match(dashboardCode, /unmountApp\(['"]heatmap['"]\);/);
            assert.match(dashboardCode, /unmountApp\(['"]donutStats['"]\);/);
            assert.match(dashboardCode, /unmountApp\(['"]projectTable['"]\);/);
            assert.match(dashboardCode, /unmountApp\(['"]timeline['"]\);/);
            assert.match(dashboardCode, /unmountApp\(['"]webPhases['"]\);/);
        });

        it('calls unmountAllApps in onDestroy to eliminate memory leaks', () => {
            const destroyBlocks = [...dashboardCode.matchAll(/onDestroy\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\);/g)];
            const hasUnmountAll = destroyBlocks.some((block) => block[1].includes('unmountAllApps()'));
            assert.equal(hasUnmountAll, true, 'At least one onDestroy hook must invoke unmountAllApps()');
        });

        it('behavioral simulation: unmountApp and unmountAllApps cleanly unmount active instances', () => {
            const unmountedInstances = [];

            const fakeUnmount = (instance) => {
                unmountedInstances.push(instance);
            };

            const apps = {
                kpiGrid: { id: 'kpi-1' },
                heatmap: { id: 'heat-1' },
                timeline: { id: 'time-1' },
            };

            function unmountApp(key) {
                if (apps[key]) {
                    try {
                        fakeUnmount(apps[key]);
                    } catch (e) {
                        console.error(e);
                    }
                    apps[key] = null;
                }
            }

            function unmountAllApps() {
                for (const key of Object.keys(apps)) {
                    unmountApp(key);
                }
            }

            unmountApp('kpiGrid');
            assert.equal(apps.kpiGrid, null);
            assert.equal(unmountedInstances.length, 1);
            assert.equal(unmountedInstances[0].id, 'kpi-1');

            unmountAllApps();
            assert.equal(apps.heatmap, null);
            assert.equal(apps.timeline, null);
            assert.equal(unmountedInstances.length, 3);
            assert.deepEqual(
                unmountedInstances.map((x) => x.id),
                ['kpi-1', 'heat-1', 'time-1'],
            );
        });
    });
});
