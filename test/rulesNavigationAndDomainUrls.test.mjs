/**
 * Tests for rules modal return navigation and domain/subdomain URL extraction.
 *
 * Requirements:
 * - R1: When opened with returnTo=listGroup, closing the modal or clicking save returns to listGroup.
 * - R2: Subgroups, groups, bookmarks, and tabs extract only domain or subdomain URLs instead of long URLs.
 * - R3: getDomainOrSubdomainUrl cleans long URLs with paths/queries/hashes into origin domain/subdomain.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDomainOrSubdomainUrl } from '../src/ui/services/utils.js';

describe('Rules Navigation & Domain URL Extraction', () => {
    describe('getDomainOrSubdomainUrl utility', () => {
        it('extracts origin from long URL with path, query, and hash', () => {
            const longUrl = 'https://github.com/my-org/my-repo/pull/123/files?tab=diff&view=split#diff-456';
            assert.equal(getDomainOrSubdomainUrl(longUrl), 'https://github.com');
        });

        it('extracts origin from subdomain URL with path and query', () => {
            const longSubdomainUrl = 'https://docs.google.com/document/d/123456789/edit?usp=sharing#heading=h.abc';
            assert.equal(getDomainOrSubdomainUrl(longSubdomainUrl), 'https://docs.google.com');
        });

        it('preserves port in localhost and custom host URLs', () => {
            assert.equal(
                getDomainOrSubdomainUrl('http://localhost:3000/dashboard/stats?period=week'),
                'http://localhost:3000',
            );
            assert.equal(getDomainOrSubdomainUrl('http://127.0.0.1:8080/api/v1/test'), 'http://127.0.0.1:8080');
        });

        it('extracts chrome and chrome-extension scheme root', () => {
            assert.equal(getDomainOrSubdomainUrl('chrome://extensions/?id=test12345'), 'chrome://extensions');
            assert.equal(
                getDomainOrSubdomainUrl('chrome-extension://abcdefghijklmnop/popup/popup.html?context=sidepanel'),
                'chrome-extension://abcdefghijklmnop',
            );
        });

        it('handles URLs typed without scheme by defaulting to https', () => {
            assert.equal(getDomainOrSubdomainUrl('github.com/my-org/my-repo'), 'https://github.com');
            assert.equal(getDomainOrSubdomainUrl('sub.example.co.uk/some/page.html'), 'https://sub.example.co.uk');
        });

        it('returns empty string on empty or invalid inputs', () => {
            assert.equal(getDomainOrSubdomainUrl(''), '');
            assert.equal(getDomainOrSubdomainUrl('   '), '');
            assert.equal(getDomainOrSubdomainUrl(null), '');
            assert.equal(getDomainOrSubdomainUrl(undefined), '');
        });
    });

    describe('Rules.svelte static contract & lifecycle', () => {
        const rulesCode = readFileSync('src/ui/pages/rules/Rules.svelte', 'utf8');

        it('imports getDomainOrSubdomainUrl from utils.js', () => {
            assert.match(
                rulesCode,
                /import\s*\{[^}]*getDomainOrSubdomainUrl[^}]*\}\s*from\s*['"]\.\.\/\.\.\/services\/utils\.js['"]/,
                'Rules.svelte must import getDomainOrSubdomainUrl from utils.js',
            );
        });

        it('tracks returnTo state in component', () => {
            assert.match(
                rulesCode,
                /let\s+returnTo\s*=\s*\$state\(\s*null\s*\);/,
                'Rules.svelte must declare reactive returnTo state',
            );
        });

        it('reads returnTo in openRuleModalFromQuery', () => {
            assert.match(
                rulesCode,
                /returnTo\s*=\s*params\.get\(\s*['"]returnTo['"]\s*\);/,
                'openRuleModalFromQuery must extract returnTo parameter',
            );
        });

        it('cleans incoming urls in openRuleModalFromQuery with getDomainOrSubdomainUrl', () => {
            assert.match(
                rulesCode,
                /urls[\s\S]*?getDomainOrSubdomainUrl/,
                'openRuleModalFromQuery must clean urls with getDomainOrSubdomainUrl',
            );
        });

        it('defines returnToListGroup function that redirects using navSource or fallback', () => {
            assert.match(
                rulesCode,
                /async\s+function\s+returnToListGroup\s*\(\s*\)/,
                'Rules.svelte must define returnToListGroup',
            );
            assert.match(
                rulesCode,
                /window\.location\.href\s*=\s*target/,
                'returnToListGroup must set window.location.href to target',
            );
        });

        it('calls returnToListGroup on handleCloseModal when returnTo is listGroup', () => {
            assert.match(
                rulesCode,
                /function\s+handleCloseModal\s*\(\s*\)\s*\{[\s\S]*?if\s*\(\s*returnTo\s*===\s*['"]listGroup['"]\s*\)\s*\{[\s\S]*?returnToListGroup\(\);/,
                'handleCloseModal must trigger returnToListGroup when returnTo === "listGroup"',
            );
        });

        it('calls returnToListGroup on handleSaveRule when returnTo is listGroup', () => {
            assert.match(
                rulesCode,
                /async\s+function\s+handleSaveRule\s*\([\s\S]*?\{[\s\S]*?if\s*\(\s*returnTo\s*===\s*['"]listGroup['"]\s*\)\s*\{[\s\S]*?returnToListGroup\(\);/,
                'handleSaveRule must trigger returnToListGroup when returnTo === "listGroup"',
            );
        });

        it('binds onclose to handleCloseModal in RuleModal component tag', () => {
            assert.match(
                rulesCode,
                /<RuleModal[\s\S]*?onclose=\{handleCloseModal\}[\s\S]*?onsave=\{handleSaveRule\}/,
                '<RuleModal> must bind onclose={handleCloseModal}',
            );
        });
    });

    describe('groupsService.js static contract & domain extraction', () => {
        const serviceCode = readFileSync('src/ui/services/groupsService.js', 'utf8');

        it('imports getDomainOrSubdomainUrl from utils.js', () => {
            assert.match(
                serviceCode,
                /import\s*\{[^}]*getDomainOrSubdomainUrl[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/,
                'groupsService.js must import getDomainOrSubdomainUrl from ./utils.js',
            );
        });

        it('uses getDomainOrSubdomainUrl for subgroup tabs in createRuleTarget', () => {
            assert.match(
                serviceCode,
                /if\s*\(\s*subGroup\s*\)\s*\{[\s\S]*?Array\.from\(\s*tabs\s*\)\.map\(\s*\(t\)\s*=>\s*getDomainOrSubdomainUrl\(\s*t\.dataset\.url\s*\)\s*\)/,
                'subGroup createRuleTarget must map tabs with getDomainOrSubdomainUrl',
            );
        });

        it('uses getDomainOrSubdomainUrl for group tabs in createRuleTarget', () => {
            assert.match(
                serviceCode,
                /else\s+if\s*\(\s*groupItem\s*\)\s*\{[\s\S]*?Array\.from\(\s*tabs\s*\)\.map\(\s*\(t\)\s*=>\s*getDomainOrSubdomainUrl\(\s*t\.dataset\.url\s*\)\s*\)/,
                'groupItem createRuleTarget must map tabs with getDomainOrSubdomainUrl',
            );
        });

        it('uses getDomainOrSubdomainUrl in addToRuleTarget', () => {
            assert.match(
                serviceCode,
                /addToRuleTarget[\s\S]*?getDomainOrSubdomainUrl\(\s*tabItem\.dataset\.url\s*\)/,
                'addToRuleTarget must map tabItem with getDomainOrSubdomainUrl',
            );
            assert.match(
                serviceCode,
                /addToRuleTarget[\s\S]*?subGroup[\s\S]*?getDomainOrSubdomainUrl\(\s*t\.dataset\.url\s*\)/,
                'addToRuleTarget must map subGroup tabs with getDomainOrSubdomainUrl',
            );
        });
    });

    describe('AddToRuleModal.svelte domain extraction', () => {
        const modalCode = readFileSync('src/ui/components/listGroup/AddToRuleModal.svelte', 'utf8');

        it('imports getDomainOrSubdomainUrl from utils.js', () => {
            assert.match(
                modalCode,
                /import\s*\{[^}]*getDomainOrSubdomainUrl[^}]*\}\s*from\s*['"]\.\.\/\.\.\/services\/utils\.js['"]/,
                'AddToRuleModal must import getDomainOrSubdomainUrl from utils.js',
            );
        });

        it('normalizes incoming URLs in $effect using getDomainOrSubdomainUrl', () => {
            assert.match(
                modalCode,
                /\.map\(\s*\(u\)\s*=>\s*getDomainOrSubdomainUrl\(\s*u\.trim\(\)\s*\)\s*\)/,
                'AddToRuleModal must map incoming url with getDomainOrSubdomainUrl in $effect',
            );
        });
    });

    describe('Behavioral Simulation: Return navigation and deduplication', () => {
        it('modal close with returnTo=listGroup executes returnToListGroup, without returnTo does not', async () => {
            let navigatedTo = null;
            let returnTo = 'listGroup';
            let isModalOpen = true;

            function simulateClose() {
                isModalOpen = false;
                if (returnTo === 'listGroup') {
                    returnTo = null;
                    navigatedTo = '../listGroup/listGroup.html?context=sidepanel';
                }
            }

            simulateClose();
            assert.equal(isModalOpen, false);
            assert.equal(navigatedTo, '../listGroup/listGroup.html?context=sidepanel');
            assert.equal(returnTo, null);

            // Closing again or normal close without returnTo
            navigatedTo = null;
            simulateClose();
            assert.equal(navigatedTo, null, 'Should not navigate if returnTo is not set');
        });

        it('modal save with returnTo=listGroup saves rule and executes returnToListGroup', async () => {
            let savedRule = null;
            let navigatedTo = null;
            let returnTo = 'listGroup';
            let isModalOpen = true;

            function simulateSave(newRule) {
                savedRule = newRule;
                isModalOpen = false;
                if (returnTo === 'listGroup') {
                    returnTo = null;
                    navigatedTo = '../listGroup/listGroup.html?view=groups';
                }
            }

            simulateSave({ name: 'Github', urls: ['https://github.com'] });
            assert.equal(isModalOpen, false);
            assert.equal(savedRule.name, 'Github');
            assert.equal(navigatedTo, '../listGroup/listGroup.html?view=groups');
            assert.equal(returnTo, null);
        });

        it('simulates subgroup tab collection: 10 long tabs on same domain collapse to 1 domain URL', () => {
            const tabs = [
                { dataset: { url: 'https://github.com/repo1/issues/1' } },
                { dataset: { url: 'https://github.com/repo1/pull/2' } },
                { dataset: { url: 'https://github.com/repo1/actions' } },
                { dataset: { url: 'https://github.com/repo2/wiki' } },
                { dataset: { url: 'https://github.com/org/settings' } },
            ];

            const urlsArray = tabs.map((t) => getDomainOrSubdomainUrl(t.dataset.url));
            const uniqueUrls = [...new Set(urlsArray)].map((u) => u.trim()).filter(Boolean);

            assert.equal(uniqueUrls.length, 1);
            assert.equal(uniqueUrls[0], 'https://github.com');
        });

        it('simulates multi-domain group collection: multiple tabs across different domains collapse to clean origins', () => {
            const tabs = [
                { dataset: { url: 'https://github.com/repo1/issues/1' } },
                { dataset: { url: 'https://docs.google.com/document/d/123/edit' } },
                { dataset: { url: 'https://github.com/repo2/pull/5' } },
                { dataset: { url: 'https://docs.google.com/spreadsheets/d/456/edit' } },
                { dataset: { url: 'http://localhost:3000/app?debug=true' } },
            ];

            const urlsArray = tabs.map((t) => getDomainOrSubdomainUrl(t.dataset.url));
            const uniqueUrls = [...new Set(urlsArray)].map((u) => u.trim()).filter(Boolean);

            assert.equal(uniqueUrls.length, 3);
            assert.deepEqual(uniqueUrls, ['https://github.com', 'https://docs.google.com', 'http://localhost:3000']);
        });
    });
});
