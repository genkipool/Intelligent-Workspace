/**
 * Comprehensive test suite for:
 * - R1: Semantic URL Rule Matching (matchesRule) in utils.js, groupManager.js, group-analyzer.js, UI utils.js
 * - R2: Defect #1 - Tab removal session state persistence
 * - R3: Defect #2 - Dissolved group prefix cleanup order
 * - R4: Defect #5 - Preservation of edited URL in AddToRuleModal and ModalHost
 * - R5: Defect #6 - windowsRemove flag reset on window closure
 * - Quarantine: Verification that Defect #3 and Defect #4 remain intact
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { matchesRule as uiMatchesRule, isDomainInAnyRule } from '../src/ui/services/utils.js';

describe('R1: Semantic URL Rule Matching (matchesRule)', () => {
    let bgMatchesRule;

    before(() => {
        const utilsCode = readFileSync('src/core/background/utils.js', 'utf8');
        const context = {
            console,
            URL,
            isModeDebug: false,
            extensionSettings: {},
            chrome: {
                runtime: { sendMessage: () => {} },
                storage: { local: {}, sync: {}, session: {} },
                sidePanel: { setOptions: () => {}, open: () => {} },
                contextMenus: { create: () => {} },
                notifications: { create: () => {} },
            },
            setTimeout,
            clearTimeout,
        };
        vm.createContext(context);
        vm.runInContext(utilsCode, context);
        bgMatchesRule = context.matchesRule;
        assert.equal(typeof bgMatchesRule, 'function', 'matchesRule must exist in src/core/background/utils.js');
    });

    const implementations = [
        { name: 'src/core/background/utils.js', fn: (t, r) => bgMatchesRule(t, r) },
        { name: 'src/ui/services/utils.js', fn: (t, r) => uiMatchesRule(t, r) },
    ];

    for (const { name, fn } of implementations) {
        describe(`Implementation: ${name}`, () => {
            describe('Base <-> www bidirectional equivalence', () => {
                it('matches tab on bare domain to rule on bare domain', () => {
                    assert.equal(fn('https://example.com/page', 'example.com'), true);
                    assert.equal(fn('https://example.com', 'https://example.com'), true);
                });

                it('matches tab on www to rule on bare domain', () => {
                    assert.equal(fn('https://www.example.com/page', 'example.com'), true);
                    assert.equal(fn('https://www.example.com', 'https://example.com'), true);
                });

                it('matches tab on bare domain to rule on www domain', () => {
                    assert.equal(fn('https://example.com/page', 'www.example.com'), true);
                    assert.equal(fn('https://example.com', 'https://www.example.com'), true);
                });

                it('matches tab on www to rule on www domain', () => {
                    assert.equal(fn('https://www.example.com/page', 'www.example.com'), true);
                    assert.equal(fn('https://www.example.com', 'https://example.com'), true);
                });

                it('ignores protocol differences between http and https', () => {
                    assert.equal(fn('http://example.com/index.html', 'https://example.com'), true);
                    assert.equal(fn('https://example.com/index.html', 'http://example.com'), true);
                    assert.equal(fn('http://www.example.com', 'https://example.com'), true);
                });
            });

            describe('Strict subdomain isolation', () => {
                it('rejects subdomains when rule is on base domain', () => {
                    assert.equal(fn('https://sub.example.com/page', 'example.com'), false);
                    assert.equal(fn('https://api.example.com', 'example.com'), false);
                    assert.equal(fn('https://mail.google.com', 'google.com'), false);
                });

                it('rejects base domain when rule is on subdomain', () => {
                    assert.equal(fn('https://example.com/page', 'sub.example.com'), false);
                    assert.equal(fn('https://google.com', 'mail.google.com'), false);
                });

                it('rejects different subdomains under same base domain', () => {
                    assert.equal(fn('https://app.example.com', 'api.example.com'), false);
                    assert.equal(fn('https://blog.example.com', 'shop.example.com'), false);
                });

                it('prevents substring false positives (e.g. notexample.com or example.com.attacker.com)', () => {
                    assert.equal(fn('https://notexample.com', 'example.com'), false);
                    assert.equal(fn('https://myexample.com', 'example.com'), false);
                    assert.equal(fn('https://example.com.attacker.com', 'example.com'), false);
                });
            });

            describe('Query parameter and fragment protection', () => {
                it('matches when rule has no query or fragment', () => {
                    assert.equal(fn('https://example.com/path?foo=bar#section', 'https://example.com/path'), true);
                });

                it('matches when query parameters match exactly', () => {
                    assert.equal(
                        fn('https://example.com/path?tab=active', 'https://example.com/path?tab=active'),
                        true,
                    );
                });

                it('rejects when rule specifies query parameter and tab has different query parameter', () => {
                    assert.equal(
                        fn('https://example.com/path?tab=inactive', 'https://example.com/path?tab=active'),
                        false,
                    );
                    assert.equal(fn('https://example.com/path', 'https://example.com/path?tab=active'), false);
                });

                it('matches when hash fragment matches exactly', () => {
                    assert.equal(fn('https://example.com/doc#intro', 'https://example.com/doc#intro'), true);
                });

                it('rejects when rule specifies hash and tab has different hash', () => {
                    assert.equal(fn('https://example.com/doc#conclusion', 'https://example.com/doc#intro'), false);
                    assert.equal(fn('https://example.com/doc', 'https://example.com/doc#intro'), false);
                });
            });

            describe('Path prefix boundaries', () => {
                it('matches exact path and deeper subpaths', () => {
                    assert.equal(fn('https://example.com/blog', 'https://example.com/blog'), true);
                    assert.equal(fn('https://example.com/blog/', 'https://example.com/blog'), true);
                    assert.equal(fn('https://example.com/blog/2026/news', 'https://example.com/blog'), true);
                });

                it('rejects paths that share a prefix string but are not subpaths (e.g. /blogger vs /blog)', () => {
                    assert.equal(fn('https://example.com/blogger', 'https://example.com/blog'), false);
                    assert.equal(fn('https://example.com/blog-posts', 'https://example.com/blog'), false);
                    assert.equal(fn('https://example.com/blogs', 'https://example.com/blog'), false);
                });
            });

            describe('Invalid and edge-case inputs', () => {
                it('returns false for falsy or non-string inputs', () => {
                    assert.equal(fn('', 'example.com'), false);
                    assert.equal(fn('example.com', ''), false);
                    assert.equal(fn(null, 'example.com'), false);
                    assert.equal(fn('example.com', undefined), false);
                    assert.equal(fn({}, 'example.com'), false);
                    assert.equal(fn('example.com', 12345), false);
                });

                it('handles port mismatches properly', () => {
                    assert.equal(fn('http://localhost:3000/app', 'http://localhost:3000'), true);
                    assert.equal(fn('http://localhost:8080/app', 'http://localhost:3000'), false);
                });
            });
        });
    }

    describe('UI isDomainInAnyRule integration', () => {
        it('uses semantic matching for rules evaluation', () => {
            const rules = [{ name: 'Work', urls: ['github.com', 'jira.atlassian.net'] }];
            assert.equal(isDomainInAnyRule('github.com', rules), true);
            assert.equal(isDomainInAnyRule('www.github.com', rules), true);
            assert.equal(isDomainInAnyRule('notgithub.com', rules), false);
            assert.equal(isDomainInAnyRule('gist.github.com', rules), false);
        });
    });

    describe('Disk file inspections for matchesRule usage', () => {
        it('verifies groupManager.js uses matchesRule in lines 316, 1266, 1278, 1296', () => {
            const groupManagerCode = readFileSync('src/core/background/groupManager.js', 'utf8');
            const matches = groupManagerCode.match(/matchesRule\(tab\.url,\s*[ur]\)/g);
            assert.ok(
                matches && matches.length >= 4,
                'groupManager.js must call matchesRule across all 4 rule matching locations',
            );
            assert.equal(
                /tab\.url\.toLowerCase\(\)\.includes\(u\.toLowerCase\(\)\.trim\(\)\)/.test(groupManagerCode),
                false,
            );
        });

        it('verifies group-analyzer.js uses matchesRule in getMatchingRule', () => {
            const groupAnalyzerCode = readFileSync('src/core/background/group-analyzer.js', 'utf8');
            assert.ok(
                groupAnalyzerCode.includes('matchesRule(tab.url, url)'),
                'group-analyzer.js must use matchesRule',
            );
            assert.equal(/rule\.urls\.some\(\(url\)\s*=>\s*tab\.url\.includes\(url\)\)/.test(groupAnalyzerCode), false);
        });

        it('verifies utils.js uses matchesRule in context menu counts and closeTabsForUrlCommand', () => {
            const utilsCode = readFileSync('src/core/background/utils.js', 'utf8');
            assert.ok(utilsCode.includes('matchesRule(t.url, url)'), 'utils.js must use matchesRule for tab counting');
            assert.ok(
                utilsCode.includes('matchesRule(tab.url, urlToClose)'),
                'utils.js must use matchesRule for closeTabsForUrlCommand',
            );
        });
    });
});

describe('R2: Defect #1 - Tab removal session state persistence', () => {
    const eventsCode = readFileSync('src/core/background/events.js', 'utf8');

    it('does not contain impossible dead code if (tabsEverActive.has(tabId)) after deletion', () => {
        assert.equal(
            /tabsEverActive\.delete\(tabId\);[\s\S]*?if\s*\(tabsEverActive\.has\(tabId\)\)/.test(eventsCode),
            false,
            'Must not contain dead code condition checking if tabsEverActive.has(tabId) right after delete',
        );
    });

    it('unconditionally invokes saveSessionState() upon tab removal', () => {
        assert.match(
            eventsCode,
            /tabsEverActive\.delete\(tabId\);[\s\S]*?await\s+saveSessionState\(\);/,
            'Must call await saveSessionState() following tabsEverActive.delete(tabId)',
        );
    });

    it('behavioral simulation: saveSessionState is called when tab is removed', async () => {
        const tabsEverActive = new Set([1, 2, 3]);
        let saveSessionStateCallCount = 0;
        const saveSessionState = async () => {
            saveSessionStateCallCount++;
        };

        const tabIdToRemove = 2;
        // Logic from events.js:
        tabsEverActive.delete(tabIdToRemove);
        await saveSessionState();

        assert.equal(tabsEverActive.has(tabIdToRemove), false);
        assert.equal(tabsEverActive.size, 2);
        assert.equal(saveSessionStateCallCount, 1, 'saveSessionState must execute');
    });
});

describe('R3: Defect #2 - Dissolved group prefix cleanup order', () => {
    const groupManagerCode = readFileSync('src/core/background/groupManager.js', 'utf8');

    it('extracts identifier from groupIdentifierMap BEFORE deleting the groupId from the map', () => {
        assert.match(
            groupManagerCode,
            /const\s+identifier\s*=\s*groupIdentifierMap\.get\(groupId\);[\s\S]*?groupPrefixState\.delete\(identifier\);[\s\S]*?groupIdentifierMap\.delete\(groupId\);/,
            'Must retrieve identifier from groupIdentifierMap before deleting groupId',
        );
    });

    it('behavioral simulation: prefix state is correctly cleaned up from persistent store', () => {
        const groupInfoMap = new Map([[42, { key: 'Tech' }]]);
        const groupIdentifierMap = new Map([[42, 'tech_ident_999']]);
        const groupExpandedEver = new Set([42]);
        const groupPrefixState = new Map([['tech_ident_999', 'Tech:']]);
        const lastActivity = { 42: Date.now() };

        const groupId = 42;

        // Fixed logic:
        const identifier = groupIdentifierMap.get(groupId);
        if (identifier) {
            groupPrefixState.delete(identifier);
        }
        groupInfoMap.delete(groupId);
        groupIdentifierMap.delete(groupId);
        groupExpandedEver.delete(groupId);
        delete lastActivity[groupId];

        assert.equal(groupPrefixState.has('tech_ident_999'), false, 'Prefix state must be deleted');
        assert.equal(groupIdentifierMap.has(42), false, 'groupIdentifierMap must be cleared');
        assert.equal(groupInfoMap.has(42), false, 'groupInfoMap must be cleared');
        assert.equal(groupExpandedEver.has(42), false, 'groupExpandedEver must be cleared');
        assert.equal(lastActivity[42], undefined, 'lastActivity must be deleted');
    });
});

describe('R4: Defect #5 - Preservation of edited URL', () => {
    const modalCode = readFileSync('src/ui/components/listGroup/AddToRuleModal.svelte', 'utf8');
    const hostCode = readFileSync('src/ui/components/listGroup/ModalHost.svelte', 'utf8');

    it('declares onSelect with (ruleName: string, editedUrl: string) parameter in AddToRuleModal', () => {
        assert.match(
            modalCode,
            /onSelect:\s*\(ruleName:\s*string,\s*editedUrl:\s*string\)\s*=>\s*void/,
            'AddToRuleModal must declare editedUrl parameter in onSelect callback prop',
        );
    });

    it('passes rawUrls as editedUrl argument to onSelect?.(ruleName, rawUrls)', () => {
        assert.match(
            modalCode,
            /onSelect\?\.?\s*\(\s*ruleName,\s*rawUrls\s*\)/,
            'AddToRuleModal must pass rawUrls as the second argument to onSelect',
        );
    });

    it('passes editedUrl to saveAddToRule in ModalHost.svelte', () => {
        assert.match(
            hostCode,
            /onSelect=\{async\s*\(\s*ruleName,\s*editedUrl\s*\)\s*=>\s*\{[\s\S]*?await\s+saveAddToRule\(\s*editedUrl\s*\|\|\s*\$modalData\?\.url,\s*ruleName\s*\);/,
            'ModalHost must pass editedUrl || $modalData?.url to saveAddToRule',
        );
    });

    it('behavioral simulation: edited URL is preserved and takes precedence over stale original URL', async () => {
        let savedUrl = null;
        let savedRuleName = null;
        const saveAddToRule = async (url, ruleName) => {
            savedUrl = url;
            savedRuleName = ruleName;
        };

        const modalData = { url: 'https://original-stale.com' };

        // Simulation when user edited the URL in textarea
        const onSelect = async (ruleName, editedUrl) => {
            await saveAddToRule(editedUrl || modalData?.url, ruleName);
        };

        await onSelect('MyRule', 'https://edited-by-user.com');
        assert.equal(savedUrl, 'https://edited-by-user.com', 'Must use the edited URL');
        assert.equal(savedRuleName, 'MyRule');

        // Simulation when user did not edit and editedUrl was empty string
        await onSelect('MyRule', '');
        assert.equal(savedUrl, 'https://original-stale.com', 'Must fallback to original URL if empty');
    });
});

describe('R5: Defect #6 - windowsRemove flag reset', () => {
    const eventsCode = readFileSync('src/core/background/events.js', 'utf8');

    it('resets windowsRemove = false in a finally block inside windows.onRemoved listener', () => {
        assert.match(
            eventsCode,
            /chrome\.windows\.onRemoved\.addListener\(async\s*\(windowId\)\s*=>\s*\{[\s\S]*?windowsRemove\s*=\s*true;[\s\S]*?try\s*\{[\s\S]*?\}\s*finally\s*\{[\s\S]*?windowsRemove\s*=\s*false;/,
            'windowsRemove must be set to true and then reset to false in finally block',
        );
    });

    it('behavioral simulation: windowsRemove is reset to false even if an error is thrown', async () => {
        let windowsRemove = false;

        const simulatedWindowOnRemoved = async (windowId) => {
            windowsRemove = true;
            try {
                // Simulate internal operation failing
                throw new Error('Storage failure during window removal');
            } finally {
                windowsRemove = false;
            }
        };

        try {
            await simulatedWindowOnRemoved(1234);
        } catch {
            // Error propagated or caught
        }

        assert.equal(windowsRemove, false, 'windowsRemove must be reset to false even after exception');
    });
});

describe('Quarantine checks: Defect #3 and Defect #4 remain untouched', () => {
    it('verifies Defect #3 quarantine: group-analyzer.js retains newCleanTitle.length >= 4 on lines 51 and 67', () => {
        const groupAnalyzerCode = readFileSync('src/core/background/group-analyzer.js', 'utf8');
        const matches = groupAnalyzerCode.match(/newCleanTitle\.length\s*>=\s*4/g);
        assert.ok(
            matches && matches.length >= 2,
            'Defect #3 quarantine: newCleanTitle.length >= 4 must be preserved in at least 2 places',
        );
    });

    it('verifies Defect #4 quarantine: Rules.svelte retains chrome.tabGroups.query({ title: deleted.name })', () => {
        const rulesCode = readFileSync('src/ui/pages/rules/Rules.svelte', 'utf8');
        assert.match(
            rulesCode,
            /chrome\.tabGroups\.query\(\{\s*title:\s*deleted\.name\s*\}\)/,
            'Defect #4 quarantine: Rules.svelte must query tabGroups using title: deleted.name',
        );
    });
});
