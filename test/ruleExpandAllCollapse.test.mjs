import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('Rules expand-all and individual card collapse behavior', () => {
    let rules;
    let expandedStates;
    let isAllExpanded;
    let savedSettings;
    let overflowingRules;
    let initialRestoredRules;
    let isSmallScreen;

    function expandableRuleNames() {
        return isSmallScreen
            ? rules.map((r) => r.name)
            : rules.filter((r) => overflowingRules.has(r.name)).map((r) => r.name);
    }

    function areAllExpanded() {
        const names = expandableRuleNames();
        return names.length > 0 && names.every((name) => expandedStates.get(name));
    }

    function saveSettings(settings) {
        Object.assign(savedSettings, settings);
    }

    function toggleExpandAll() {
        const names = expandableRuleNames();
        if (names.length === 0) return;
        const newState = !areAllExpanded();
        for (const name of names) {
            expandedStates.set(name, newState);
            initialRestoredRules.add(name);
        }
        isAllExpanded = newState;
        saveSettings({ isAllExpanded: newState });
    }

    function handleToggleExpand(detail) {
        const { name } = detail;
        const nextState = !expandedStates.get(name);
        expandedStates.set(name, nextState);
        if (!nextState) {
            isAllExpanded = false;
            saveSettings({ isAllExpanded: false });
        } else {
            const names = expandableRuleNames();
            const allExpanded = names.length > 0 && names.every((ruleName) => expandedStates.get(ruleName));
            if (allExpanded) {
                isAllExpanded = true;
                saveSettings({ isAllExpanded: true });
            }
        }
    }

    function handleOverflowChange({ name, hasHiddenUrls }) {
        if (hasHiddenUrls) overflowingRules.add(name);
        else overflowingRules.delete(name);

        if (hasHiddenUrls && !initialRestoredRules.has(name)) {
            initialRestoredRules.add(name);
            if (isAllExpanded && !expandedStates.get(name)) {
                expandedStates.set(name, true);
            }
        }
    }

    beforeEach(() => {
        rules = [
            { name: 'Rule 1', urls: ['a.com', 'b.com', 'c.com'] },
            { name: 'Rule 2', urls: ['d.com', 'e.com'] },
        ];
        expandedStates = new Map();
        isAllExpanded = false;
        savedSettings = {};
        overflowingRules = new Set(['Rule 1', 'Rule 2']);
        initialRestoredRules = new Set(['Rule 1', 'Rule 2']);
        isSmallScreen = false;
    });

    it('toggleExpandAll expands all rules and sets isAllExpanded to true', () => {
        toggleExpandAll();
        assert.equal(expandedStates.get('Rule 1'), true);
        assert.equal(expandedStates.get('Rule 2'), true);
        assert.equal(isAllExpanded, true);
        assert.equal(areAllExpanded(), true);
        assert.equal(savedSettings.isAllExpanded, true);
    });

    it('after toggleExpandAll, collapsing an individual rule keeps it collapsed and resets isAllExpanded to false', () => {
        toggleExpandAll();
        assert.equal(isAllExpanded, true);

        // User clicks collapse button on Rule 1
        handleToggleExpand({ name: 'Rule 1' });

        assert.equal(expandedStates.get('Rule 1'), false, 'Rule 1 must be collapsed');
        assert.equal(expandedStates.get('Rule 2'), true, 'Rule 2 must remain expanded');
        assert.equal(isAllExpanded, false, 'isAllExpanded must be reset to false');
        assert.equal(areAllExpanded(), false, 'areAllExpanded must be false');
        assert.equal(savedSettings.isAllExpanded, false, 'savedSettings.isAllExpanded must be false');

        // Rule 1 finishes collapsing and reports overflow recalculation
        handleOverflowChange({ name: 'Rule 1', hasHiddenUrls: true });
        assert.equal(
            expandedStates.get('Rule 1'),
            false,
            'Rule 1 must NOT be re-expanded on subsequent overflow changes',
        );
    });

    it('manually re-expanding the collapsed rule sets isAllExpanded back to true when all are expanded', () => {
        toggleExpandAll();
        handleToggleExpand({ name: 'Rule 1' });
        assert.equal(isAllExpanded, false);

        // User clicks expand button on Rule 1
        handleToggleExpand({ name: 'Rule 1' });
        assert.equal(expandedStates.get('Rule 1'), true);
        assert.equal(isAllExpanded, true, 'isAllExpanded must be true when all rules are expanded again');
        assert.equal(areAllExpanded(), true);
        assert.equal(savedSettings.isAllExpanded, true);
    });

    it('calling toggleExpandAll when all are expanded collapses all rules', () => {
        toggleExpandAll();
        assert.equal(areAllExpanded(), true);

        // Click expand-all button again
        toggleExpandAll();
        assert.equal(expandedStates.get('Rule 1'), false);
        assert.equal(expandedStates.get('Rule 2'), false);
        assert.equal(isAllExpanded, false);
        assert.equal(areAllExpanded(), false);
        assert.equal(savedSettings.isAllExpanded, false);
    });

    it('initial load with saved isAllExpanded restores overflow rules once on initial mount', () => {
        // Fresh initial load
        expandedStates = new Map();
        initialRestoredRules = new Set();
        overflowingRules = new Set();
        isAllExpanded = true;

        // Rule 1 mounts and reports overflow
        handleOverflowChange({ name: 'Rule 1', hasHiddenUrls: true });
        assert.equal(expandedStates.get('Rule 1'), true, 'Rule 1 restored to expanded');

        // Rule 2 mounts and reports overflow
        handleOverflowChange({ name: 'Rule 2', hasHiddenUrls: true });
        assert.equal(expandedStates.get('Rule 2'), true, 'Rule 2 restored to expanded');

        // User now collapses Rule 1
        handleToggleExpand({ name: 'Rule 1' });
        assert.equal(expandedStates.get('Rule 1'), false, 'Rule 1 collapsed');
        assert.equal(isAllExpanded, false, 'isAllExpanded is false');

        // Subsequent overflow change does not re-expand Rule 1
        handleOverflowChange({ name: 'Rule 1', hasHiddenUrls: true });
        assert.equal(expandedStates.get('Rule 1'), false, 'Rule 1 remains collapsed');
    });
});
