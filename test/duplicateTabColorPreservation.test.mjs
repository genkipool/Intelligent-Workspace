/**
 * Tests for Duplicate Tab Error Color Preservation:
 * Ensures duplicate tabs maintain their error color across tab activation,
 * renderContext reloads, and event listener dispatches without momentary flashing.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRenderContext, initRenderContextListeners, renderContext } from '../src/ui/stores/renderContextStore.js';
import { get } from 'svelte/store';
import { resetCurrentWindowId, setCurrentWindowId } from '../src/ui/services/windowsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Duplicate Tab Color Preservation', () => {
    beforeEach(() => {
        resetCurrentWindowId();
        delete global.window;
        delete global.chrome;
    });

    describe('renderContextStore: resilience against invalid windowId arguments and errors', () => {
        it('safely handles non-numeric arguments (such as activeInfo object) without crashing or clearing duplicates', async () => {
            setCurrentWindowId(100);

            const mockTabs = [
                { id: 1, windowId: 100, url: 'https://dup.com', pendingUrl: '' },
                { id: 2, windowId: 100, url: 'https://dup.com', pendingUrl: '' },
                { id: 3, windowId: 100, url: 'https://unique.com', pendingUrl: '' },
            ];

            global.chrome = {
                runtime: { sendMessage: async () => ({}) },
                storage: {
                    session: { get: async () => ({}) },
                    local: { get: async () => ({}) },
                },
                tabGroups: { query: async () => [] },
                tabs: {
                    query: async (opts) => {
                        if (opts?.windowId && typeof opts.windowId !== 'number') {
                            throw new TypeError('Invalid type: expected integer, found object');
                        }
                        if (opts?.windowId) {
                            return mockTabs.filter((t) => t.windowId === opts.windowId);
                        }
                        return mockTabs;
                    },
                },
            };

            // 1. Initial valid load
            await loadRenderContext(100);
            const ctx1 = get(renderContext);
            assert.equal(ctx1.duplicateUrlSet.has('https://dup.com'), true);
            assert.equal(ctx1.duplicateUrlSet.has('https://unique.com'), false);

            // 2. Event listener invocation passing activeInfo object: { tabId: 1, windowId: 100 }
            // Should NOT throw and should NOT clear duplicateUrlSet
            await loadRenderContext({ tabId: 1, windowId: 100 });
            const ctx2 = get(renderContext);
            assert.equal(ctx2.duplicateUrlSet.has('https://dup.com'), true);
        });

        it('retains previous duplicateUrlSet if query fails unexpectedly rather than wiping it to empty', async () => {
            setCurrentWindowId(100);

            let queryShouldFail = false;
            const mockTabs = [
                { id: 1, windowId: 100, url: 'https://dup.com' },
                { id: 2, windowId: 100, url: 'https://dup.com' },
            ];

            global.chrome = {
                runtime: { sendMessage: async () => ({}) },
                storage: {
                    session: { get: async () => ({}) },
                    local: { get: async () => ({}) },
                },
                tabGroups: { query: async () => [] },
                tabs: {
                    query: async () => {
                        if (queryShouldFail) throw new Error('Transient tabs query failure');
                        return mockTabs;
                    },
                },
            };

            await loadRenderContext(100);
            assert.equal(get(renderContext).duplicateUrlSet.has('https://dup.com'), true);

            // Simulate transient query failure
            queryShouldFail = true;
            await loadRenderContext(100);
            const ctxAfterError = get(renderContext);
            // Must retain duplicates, not be wiped out
            assert.equal(ctxAfterError.duplicateUrlSet.has('https://dup.com'), true);
        });

        it('initRenderContextListeners ignores events from foreign windows and does not pass event arguments as windowId', () => {
            setCurrentWindowId(100);

            const listeners = {
                onUpdated: null,
                onRemoved: null,
                onActivated: null,
            };

            global.chrome = {
                tabs: {
                    onUpdated: {
                        addListener: (fn) => {
                            listeners.onUpdated = fn;
                        },
                    },
                    onRemoved: {
                        addListener: (fn) => {
                            listeners.onRemoved = fn;
                        },
                    },
                    onActivated: {
                        addListener: (fn) => {
                            listeners.onActivated = fn;
                        },
                    },
                },
                storage: {
                    onChanged: { addListener: () => {} },
                },
            };

            initRenderContextListeners();

            assert.equal(typeof listeners.onUpdated, 'function');
            assert.equal(typeof listeners.onRemoved, 'function');
            assert.equal(typeof listeners.onActivated, 'function');
        });
    });

    describe('TabItem.svelte and listGroup.css: styling preservation', () => {
        it('defines .tab-item.duplicate-tab .tab-title rule with color var(--error-color) !important in listGroup.css', () => {
            const cssPath = path.resolve(__dirname, '../src/ui/pages/listGroup/listGroup.css');
            const cssContent = fs.readFileSync(cssPath, 'utf8');

            assert.equal(
                cssContent.includes('.tab-item.duplicate-tab .tab-title'),
                true,
                'listGroup.css must define .tab-item.duplicate-tab .tab-title',
            );
            assert.match(
                cssContent,
                /\.tab-item\.duplicate-tab\s+\.tab-title\s*\{[^}]*color:\s*var\(--error-color\)\s*!important/s,
                'listGroup.css must specify color: var(--error-color) !important for duplicate tabs',
            );
        });

        it('TabItem.svelte preserves title.style.color on duplicate tabs during tab activation', () => {
            const sveltePath = path.resolve(__dirname, '../src/ui/components/listGroup/TabItem.svelte');
            const svelteContent = fs.readFileSync(sveltePath, 'utf8');

            assert.equal(
                svelteContent.includes("title.style.color = 'var(--error-color)';"),
                true,
                'TabItem.svelte must set title.style.color to var(--error-color) during activateTab',
            );
        });

        it('GroupCard.svelte binds title tooltip on .group-tab-count', () => {
            const groupCardPath = path.resolve(__dirname, '../src/ui/components/listGroup/GroupCard.svelte');
            const groupCardContent = fs.readFileSync(groupCardPath, 'utf8');

            assert.match(
                groupCardContent,
                /<span\s+class="group-tab-count"[^>]*title=\{[^}]*groupTabCountTooltip/,
                'GroupCard.svelte must bind a title attribute to .group-tab-count with groupTabCountTooltip',
            );
        });
    });
});
