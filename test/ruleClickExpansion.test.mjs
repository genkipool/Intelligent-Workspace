import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

describe('RuleCard click expansion behavior', () => {
    let dom;
    let window;
    let document;

    beforeEach(() => {
        dom = new JSDOM(
            `<!doctype html>
        <html>
            <body>
                <div id="card" class="rule-item" data-index="0">
                    <div class="rule-info">
                        <button class="star-button" type="button">Star</button>
                        <button class="drag-handle" type="button">Drag</button>
                        <span class="color-indicator"></span>
                        <h3 class="rule-name">Work</h3>
                        <button class="sort-domains-btn" type="button">Sort</button>
                        <button id="collapseSectionBtn" class="collapse-btn" type="button"><span class="svg-deploy"><svg width="28" height="28" viewBox="0 0 24 24"><use href="#icon-chevron-up"></use></svg></span></button>
                    </div>
                    <div class="rule-urls-container">
                        <div class="rule-urls-wrapper" data-url="example.com" data-url-index="0">
                            <a class="rule-urls" href="https://example.com">example.com</a>
                            <div class="icons-container">
                                <button class="edit-icon" type="button">Edit domain</button>
                                <button class="delete-icon" type="button">Delete domain</button>
                            </div>
                        </div>
                        <button id="expandUrlsBtn" class="expand-btn" type="button">^</button>
                    </div>
                    <div id="ruleActions" class="rule-actions">
                        <button id="deployButton" class="deploy-btn rule-actions-button" type="button">Deploy</button>
                        <button id="editButton" class="edit-button rule-actions-button" type="button">Edit</button>
                        <button id="deleteButton" class="delete-button rule-actions-button" type="button">Delete</button>
                        <label class="switch-rule-actions">
                            <input class="switch-checkbox" type="checkbox" />
                            <span class="slider"></span>
                        </label>
                        <button class="svg-toggle-button rule-actions-button" type="button">Toggle</button>
                    </div>
                </div>
            </body>
        </html>`,
            {
                url: 'https://example.com',
            },
        );
        window = dom.window;
        document = window.document;
    });

    /**
     * Mirrors handleCardClick logic from RuleCard.svelte
     */
    function createClickHandler({
        isLargeScreen = true,
        onToggleExpand = () => {},
        onDeleteRule = () => {},
        onEditRule = () => {},
    }) {
        const cardEl = document.getElementById('card');

        return function handleCardClick(e) {
            const target = e.target;

            if (target.closest('.rule-urls')) return;
            if (target.closest('.edit-icon')) {
                // editDomain
            } else if (target.closest('.delete-icon')) {
                // deleteDomain
            } else if (target.closest('.collapse-btn')) {
                onToggleExpand();
            } else if (target.closest('.star-button')) {
                // toggleStar
            } else if (target.closest('.expand-btn') || target.closest('.deploy-btn')) {
                onToggleExpand();
            } else if (target.closest('.edit-button')) {
                onEditRule();
            } else if (target.closest('.delete-button')) {
                onDeleteRule();
            } else if (target.closest('.color-indicator')) {
                // changeColor
            } else if (target.closest('.sort-domains-btn')) {
                // toggleSort
            } else if (target.closest('.rule-name')) {
                e.preventDefault();
                // copyRuleUrls
            } else if (target.closest('.rule-actions')) {
                // Action buttons are handled above; clicks on the toolbar itself never toggle the card.
                return;
            } else if (target.closest('.rule-urls-container')) {
                // Domain clicks and icon clicks are handled above; clicks on container background never toggle.
                return;
            } else if (!isLargeScreen) {
                // Narrow screens: expand when clicking non-interactive card header areas outside the actions toolbar.
                if (!target.closest('.drag-handle') && !target.closest('input') && !target.closest('textarea')) {
                    const actionsEl = cardEl?.querySelector('.rule-actions');
                    if (
                        actionsEl &&
                        typeof e.clientX === 'number' &&
                        typeof actionsEl.getBoundingClientRect === 'function'
                    ) {
                        const rect = actionsEl.getBoundingClientRect();
                        if (rect.left > 0 && e.clientX >= rect.left - 4) {
                            return;
                        }
                    }
                    onToggleExpand();
                }
            }
        };
    }

    it('clicking deleteButton calls onDeleteRule and does NOT toggle expand', () => {
        let expandCalled = false;
        let deleteCalled = false;

        const handler = createClickHandler({
            isLargeScreen: true,
            onToggleExpand: () => {
                expandCalled = true;
            },
            onDeleteRule: () => {
                deleteCalled = true;
            },
        });

        const deleteBtn = document.getElementById('deleteButton');
        handler({ target: deleteBtn, preventDefault: () => {} });

        assert.equal(deleteCalled, true, 'deleteRule must be called');
        assert.equal(expandCalled, false, 'toggleExpand must NOT be called when clicking deleteButton');
    });

    it('clicking slightly below deleteButton (on .rule-actions) does NOT toggle expand (desktop)', () => {
        let expandCalled = false;
        let deleteCalled = false;

        const handler = createClickHandler({
            isLargeScreen: true,
            onToggleExpand: () => {
                expandCalled = true;
            },
            onDeleteRule: () => {
                deleteCalled = true;
            },
        });

        const actionsToolbar = document.getElementById('ruleActions');
        handler({ target: actionsToolbar, preventDefault: () => {} });

        assert.equal(
            expandCalled,
            false,
            'toggleExpand must NOT be called when clicking below delete button on actions strip',
        );
        assert.equal(deleteCalled, false);
    });

    it('clicking deployButton toggles card expansion (desktop)', () => {
        let expandCalled = false;

        const handler = createClickHandler({
            isLargeScreen: true,
            onToggleExpand: () => {
                expandCalled = true;
            },
        });

        const deployBtn = document.getElementById('deployButton');
        handler({ target: deployBtn, preventDefault: () => {} });

        assert.equal(expandCalled, true, 'toggleExpand must be called when clicking deployButton');
    });

    it('clicking slightly below deleteButton on narrow screen does NOT toggle expand', () => {
        let expandCalled = false;
        let deleteCalled = false;

        const actionsEl = document.getElementById('ruleActions');
        actionsEl.getBoundingClientRect = () => ({
            left: 200,
            right: 320,
            top: 10,
            bottom: 38,
            width: 120,
            height: 28,
        });

        const handler = createClickHandler({
            isLargeScreen: false,
            onToggleExpand: () => {
                expandCalled = true;
            },
            onDeleteRule: () => {
                deleteCalled = true;
            },
        });

        // 1. Click directly on actionsEl (padding below deleteButton)
        handler({ target: actionsEl, clientX: 250, preventDefault: () => {} });
        assert.equal(expandCalled, false, 'must not expand when clicking on .rule-actions');

        // 2. Click on cardEl right below deleteButton (actions column coordinates)
        const cardEl = document.getElementById('card');
        handler({ target: cardEl, clientX: 250, preventDefault: () => {} });
        assert.equal(expandCalled, false, 'must not expand when clicking on cardEl in the actions column');
        assert.equal(deleteCalled, false, 'must not delete when clicking below deleteButton');
    });

    it('clicking on rule header on narrow screen toggles expand', () => {
        let expandCalled = false;

        const actionsEl = document.getElementById('ruleActions');
        actionsEl.getBoundingClientRect = () => ({
            left: 200,
            right: 320,
            top: 10,
            bottom: 38,
            width: 120,
            height: 28,
        });

        const handler = createClickHandler({
            isLargeScreen: false,
            onToggleExpand: () => {
                expandCalled = true;
            },
        });

        const ruleInfo = document.querySelector('.rule-info');
        handler({ target: ruleInfo, clientX: 50, preventDefault: () => {} });

        assert.equal(expandCalled, true, 'clicking on rule header outside actions must expand on narrow screen');
    });

    it('clicking inside rule-urls-container background does NOT toggle expand', () => {
        let expandCalled = false;

        const handler = createClickHandler({
            isLargeScreen: false,
            onToggleExpand: () => {
                expandCalled = true;
            },
        });

        const urlsContainer = document.querySelector('.rule-urls-container');
        handler({ target: urlsContainer, clientX: 50, preventDefault: () => {} });

        assert.equal(expandCalled, false, 'clicking in urls container background must not toggle expand');
    });

    it('clicking collapse-btn (or inside svg-deploy) triggers toggleExpand', () => {
        let expandCalled = false;

        const handler = createClickHandler({
            isLargeScreen: true,
            onToggleExpand: () => {
                expandCalled = true;
            },
        });

        const chevronSvg = document.querySelector('#collapseSectionBtn svg');
        handler({ target: chevronSvg, preventDefault: () => {} });
        assert.equal(expandCalled, true, 'clicking inside chevron svg must trigger toggleExpand');

        expandCalled = false;
        const collapseBtn = document.getElementById('collapseSectionBtn');
        handler({ target: collapseBtn, preventDefault: () => {} });
        assert.equal(expandCalled, true, 'clicking collapse-btn directly must trigger toggleExpand');
    });

    it('clicking expand-btn (^ button) triggers toggleExpand', () => {
        let expandCalled = false;

        const handler = createClickHandler({
            isLargeScreen: true,
            onToggleExpand: () => {
                expandCalled = true;
            },
        });

        const expandBtn = document.getElementById('expandUrlsBtn');
        handler({ target: expandBtn, preventDefault: () => {} });
        assert.equal(expandCalled, true, 'clicking ^ expand-btn must trigger toggleExpand');
    });
});
