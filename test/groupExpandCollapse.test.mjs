/**
 * Expanding and collapsing the cards of the group list.
 *
 * Two shortcuts inside GroupCard used to take the fold away from a card: the group
 * holding the active tab reported itself expanded no matter what, so "collapse all"
 * shut it and the next read opened it again; and a backup card or the ungrouped list
 * refused the fold outright, leaving the only two cards that cannot be renamed as the
 * only two that could never be folded by hand. Both rules now live in
 * `groupExpansion.js`, and this is what they have to keep doing.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
    decideSummaryFold,
    resolveGroupOpenState,
    createActiveTabFollow,
    subgroupsToReveal,
    FOLD_BLOCKED,
    FOLD_DELAYED,
    FOLD_NATIVE,
} from '../src/ui/components/listGroup/groupExpansion.js';

describe('decideSummaryFold', () => {
    let dom;
    let document;

    beforeEach(() => {
        dom = new JSDOM(
            `<!doctype html>
        <html>
            <body>
                <details id="group" class="group-item" data-group-id="7">
                    <summary class="group-header">
                        <span class="color-indicator"></span>
                        <h3 class="group-title">Work</h3>
                        <span class="group-tab-count">1/3</span>
                        <div class="group-actions">
                            <div class="action-btn hide-group-btn"></div>
                        </div>
                    </summary>
                    <div class="tab-list-container"></div>
                </details>
            </body>
        </html>`,
            { url: 'https://example.com' },
        );
        document = dom.window.document;
    });

    /** Clicks the node the way the card's own `onclick` on the summary sees it. */
    function clickAsCard(selector, card) {
        const target = document.querySelector(selector);
        const summary = document.querySelector('.group-header');
        const handler = (e) => {
            const decision = decideSummaryFold(e.target, card);
            if (decision !== FOLD_NATIVE) e.preventDefault();
        };
        summary.addEventListener('click', handler);
        target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        summary.removeEventListener('click', handler);
        return document.getElementById('group').open;
    }

    it('a click on the actions or the colour dot never folds the card', () => {
        assert.equal(decideSummaryFold(document.querySelector('.hide-group-btn'), {}), FOLD_BLOCKED);
        assert.equal(decideSummaryFold(document.querySelector('.color-indicator'), {}), FOLD_BLOCKED);
        assert.equal(clickAsCard('.hide-group-btn', {}), false, 'the card must stay shut');
        assert.equal(clickAsCard('.color-indicator', {}), false, 'the card must stay shut');
    });

    it('a click on the name of a normal group holds the fold back for the rename gesture', () => {
        assert.equal(decideSummaryFold(document.querySelector('.group-title'), {}), FOLD_DELAYED);
        assert.equal(clickAsCard('.group-title', {}), false, 'the native fold is called off, the card waits');
    });

    it('a backup card folds on its name and on the rest of the header', () => {
        const card = { isBackup: true, isUngrouped: false };
        assert.equal(decideSummaryFold(document.querySelector('.group-title'), card), FOLD_NATIVE);
        assert.equal(clickAsCard('.group-title', card), true, 'a backup card must open like any other');
        assert.equal(clickAsCard('.group-tab-count', card), false, 'and shut again');
    });

    it('the ungrouped list folds on its name and on the rest of the header', () => {
        const card = { isBackup: false, isUngrouped: true };
        assert.equal(decideSummaryFold(document.querySelector('.group-title'), card), FOLD_NATIVE);
        assert.equal(clickAsCard('.group-title', card), true, 'the ungrouped list must open like any other');
        assert.equal(clickAsCard('.group-tab-count', card), false, 'and shut again');
    });

    it('the actions of a backup card or the ungrouped list still keep the fold away', () => {
        assert.equal(decideSummaryFold(document.querySelector('.hide-group-btn'), { isBackup: true }), FOLD_BLOCKED);
        assert.equal(
            decideSummaryFold(document.querySelector('.color-indicator'), { isUngrouped: true }),
            FOLD_BLOCKED,
        );
    });
});

describe('resolveGroupOpenState', () => {
    it('what the map remembers wins over the default of the view', () => {
        assert.equal(resolveGroupOpenState(false, true), false);
        assert.equal(resolveGroupOpenState(true, false), true);
    });

    it('a card the map knows nothing about is drawn the way the view is set', () => {
        assert.equal(resolveGroupOpenState(undefined, true), true);
        assert.equal(resolveGroupOpenState(undefined, false), false);
    });
});

/**
 * The button, the shared map and the cards, in the order the page runs them.
 *
 * `toggleExpandAll` writes one entry per visible card and then the default of the
 * view; every card reads its own entry, and the default only when it has none.
 */
describe('expand-all and collapse-all across the group list', () => {
    let expandedGroupStates;
    let viewExpandStates;

    /** The cards on screen, `activeTab` marking the one holding the active tab. */
    let cards;

    function openStateOf(groupId) {
        return resolveGroupOpenState(expandedGroupStates.get(groupId), viewExpandStates.groups);
    }

    function toggleExpandAll(currentlyAllExpanded) {
        const shouldExpand = !currentlyAllExpanded;
        for (const card of cards) expandedGroupStates.set(card.id, shouldExpand);
        viewExpandStates = { ...viewExpandStates, groups: shouldExpand };
        return shouldExpand;
    }

    beforeEach(() => {
        expandedGroupStates = new Map();
        viewExpandStates = { groups: true, bookmarks: true, gemini: true, notes: true };
        cards = [{ id: 1 }, { id: 2, activeTab: true }, { id: 3 }];
    });

    it('collapse-all shuts every card, the one holding the active tab included', () => {
        toggleExpandAll(true);
        for (const card of cards) {
            assert.equal(openStateOf(card.id), false, `group ${card.id} must be collapsed`);
        }
    });

    it('the card holding the active tab stays shut while the button is off', () => {
        toggleExpandAll(true);
        // Nothing re-reads the card into life: the map is the only voice, and the tab
        // moving to another group changes none of it.
        cards[1].activeTab = false;
        cards[2].activeTab = true;
        assert.equal(openStateOf(2), false, 'the group that held the tab stays collapsed');
        assert.equal(openStateOf(3), false, 'the group that now holds it does not spring open');
    });

    it('a card folded by hand does not reopen, and expand-all brings it back', () => {
        expandedGroupStates.set(2, false);
        assert.equal(openStateOf(2), false);
        toggleExpandAll(false);
        assert.equal(openStateOf(2), true);
    });

    it('a group arriving after collapse-all is drawn shut, like the rest', () => {
        toggleExpandAll(true);
        cards.push({ id: 4 });
        assert.equal(openStateOf(4), false, 'the newcomer follows the button, not the initial default');
    });

    it('a group arriving after expand-all is drawn open', () => {
        toggleExpandAll(true);
        toggleExpandAll(false);
        cards.push({ id: 5 });
        assert.equal(openStateOf(5), true);
    });
});

/**
 * The cards following the active tab while the list is folded.
 *
 * Each card runs its own `createActiveTabFollow`, exactly as GroupCard does, and the
 * answers are written into the shared map. Read together they are the accordion: the
 * group that receives the tab opens, the one that loses it shuts.
 */
describe('following the active tab with the list folded', () => {
    let expandedGroupStates;
    let viewExpandStates;
    let cards;

    function openStateOf(groupId) {
        return resolveGroupOpenState(expandedGroupStates.get(groupId), viewExpandStates.groups);
    }

    /** One pass of every card's effect, the way a render runs them. */
    function render() {
        for (const card of cards) {
            const next = card.follow.next(card.id === activeGroupId, viewExpandStates.groups, openStateOf(card.id));
            if (next !== null) expandedGroupStates.set(card.id, next);
        }
    }

    let activeGroupId;

    function activateTabIn(groupId) {
        activeGroupId = groupId;
        render();
    }

    function toggleExpandAll(currentlyAllExpanded) {
        const shouldExpand = !currentlyAllExpanded;
        for (const card of cards) expandedGroupStates.set(card.id, shouldExpand);
        viewExpandStates = { ...viewExpandStates, groups: shouldExpand };
        render();
    }

    beforeEach(() => {
        expandedGroupStates = new Map();
        viewExpandStates = { groups: true, bookmarks: true, gemini: true, notes: true };
        cards = [1, 2, 3].map((id) => ({ id, follow: createActiveTabFollow() }));
        activeGroupId = 1;
        // The list arrives expanded, with the active tab in group 1.
        render();
    });

    it('folding the list shuts every card, the one holding the active tab included', () => {
        toggleExpandAll(true);
        for (const card of cards) {
            assert.equal(openStateOf(card.id), false, `group ${card.id} must be collapsed`);
        }
    });

    it('the group receiving the active tab opens, and the one losing it shuts', () => {
        toggleExpandAll(true);
        activateTabIn(2);
        assert.equal(openStateOf(2), true, 'the group of the tab just activated opens');
        assert.equal(openStateOf(1), false, 'the group that held it stays shut');
        assert.equal(openStateOf(3), false);

        activateTabIn(3);
        assert.equal(openStateOf(3), true, 'the tab moves on and so does the open card');
        assert.equal(openStateOf(2), false, 'the card that lost the tab shuts behind it');
        assert.equal(openStateOf(1), false);
    });

    it('activating another tab of the same group changes nothing', () => {
        toggleExpandAll(true);
        activateTabIn(2);
        activateTabIn(2);
        assert.equal(openStateOf(2), true);
        assert.equal(openStateOf(1), false);
    });

    it('a card opened by hand is not shut when the tab moves away', () => {
        toggleExpandAll(true);
        // The user opens group 3 by hand; nothing followed the tab into it.
        expandedGroupStates.set(3, true);
        activateTabIn(3);
        activateTabIn(1);
        assert.equal(openStateOf(3), true, 'the fold the user asked for is theirs to undo');
        assert.equal(openStateOf(1), true, 'and the tab still opens the group it lands in');
    });

    it('with the list expanded nothing follows the tab', () => {
        activateTabIn(2);
        assert.equal(openStateOf(1), true, 'every card is open and stays open');
        assert.equal(openStateOf(2), true);
        // A card folded by hand stays folded while the tab moves in and out of it.
        expandedGroupStates.set(2, false);
        activateTabIn(3);
        activateTabIn(2);
        assert.equal(openStateOf(2), false);
    });

    it('unfolding the list again hands every card back to the button', () => {
        toggleExpandAll(true);
        activateTabIn(2);
        toggleExpandAll(false);
        for (const card of cards) {
            assert.equal(openStateOf(card.id), true, `group ${card.id} must be expanded`);
        }
        activateTabIn(3);
        assert.equal(openStateOf(2), true, 'no card is shut behind the tab any more');
    });
});

/**
 * Unfolding one card by hand while the list is folded.
 *
 * "Collapse all" shuts the domains too, so the card has to bring them back or it
 * opens onto its domain headers and no tabs at all — which only happened to the cards
 * with more than one domain, and is why some groups looked broken and others fine.
 */
describe('revealing the domains of a card opened by hand', () => {
    const keys = ['25534010_platform.claude.com', '25534010_claude.ai'];

    /** How the card reads a domain: what the map remembers, else the view's default. */
    function opennessFrom(stored, viewDefault) {
        return (key) => resolveGroupOpenState(stored.get(key), viewDefault);
    }

    it('a card whose domains are all shut opens every one of them', () => {
        const stored = new Map(keys.map((key) => [key, false]));
        assert.deepEqual(subgroupsToReveal(keys, opennessFrom(stored, false)), keys);
    });

    it('a card with the list folded and nothing remembered opens them too', () => {
        assert.deepEqual(subgroupsToReveal(keys, opennessFrom(new Map(), false)), keys);
    });

    it('a card that already shows a domain is left as its owner arranged it', () => {
        const stored = new Map([
            [keys[0], true],
            [keys[1], false],
        ]);
        assert.deepEqual(subgroupsToReveal(keys, opennessFrom(stored, false)), []);
    });

    it('with the list expanded there is nothing to bring back', () => {
        assert.deepEqual(subgroupsToReveal(keys, opennessFrom(new Map(), true)), []);
    });

    it('a card with a single domain has no second fold to undo', () => {
        assert.deepEqual(subgroupsToReveal([], opennessFrom(new Map(), false)), []);
    });
});

/**
 * The card reported open with no tabs under it.
 *
 * Folded list, one card unfolded by hand, and the group with two domains came up as
 * `<details class="group-item" open>` holding two `<details class="domain-subgroup">`
 * with no `open` between them: the domain headers showed and the tabs did not. The
 * card with a single domain, which draws its tabs flat, looked perfectly fine — which
 * is how this passed for a problem with big groups.
 *
 * The whole sequence is played here against the real DOM: fold the list, click the
 * summary, and count the tabs on screen.
 */
describe('unfolding a card by hand after collapse-all shows its tabs', () => {
    let dom;
    let document;
    let expandedGroupStates;
    let expandedSubgroupStates;
    let viewExpandStates;

    const TWO_DOMAINS = 25534010;
    const ONE_DOMAIN = 25534011;

    beforeEach(() => {
        dom = new JSDOM(
            `<!doctype html>
        <html>
            <body>
                <div id="groups-list">
                    <details class="group-item" data-group-id="${TWO_DOMAINS}" open>
                        <summary class="group-header"><h3 class="group-title">C</h3></summary>
                        <div class="tab-list-container">
                            <details class="domain-subgroup" data-domain="platform.claude.com" open>
                                <summary class="domain-header"><span class="domain-title">platform.claude.com</span></summary>
                                <div class="subgroup-tab-list"><div class="tab-item" data-tab-id="1"></div></div>
                            </details>
                            <details class="domain-subgroup" data-domain="claude.ai" open>
                                <summary class="domain-header"><span class="domain-title">claude.ai</span></summary>
                                <div class="subgroup-tab-list"><div class="tab-item" data-tab-id="2"></div></div>
                            </details>
                        </div>
                    </details>
                    <details class="group-item" data-group-id="${ONE_DOMAIN}" open>
                        <summary class="group-header"><h3 class="group-title">D</h3></summary>
                        <div class="tab-list-container"><div class="tab-item" data-tab-id="3"></div></div>
                    </details>
                </div>
            </body>
        </html>`,
            { url: 'https://example.com' },
        );
        document = dom.window.document;

        expandedGroupStates = new Map();
        expandedSubgroupStates = new Map();
        viewExpandStates = { groups: true, bookmarks: true, gemini: true, notes: true };

        for (const card of document.querySelectorAll('.group-item')) wireCard(card);
    });

    /** The card's own two handlers: the summary's click and the details' toggle. */
    function wireCard(card) {
        const groupId = Number(card.dataset.groupId);
        const subGroupKeys = [...card.querySelectorAll('.domain-subgroup')].map(
            (subgroup) => `${groupId}_${subgroup.querySelector('.domain-title').textContent}`,
        );

        card.querySelector('.group-header').addEventListener('click', (e) => {
            if (decideSummaryFold(e.target, {}) !== FOLD_NATIVE) e.preventDefault();
        });

        card.addEventListener('toggle', () => {
            const open = card.open;
            expandedGroupStates.set(groupId, open);
            if (!open) return;
            const keys = subgroupsToReveal(subGroupKeys, (key) =>
                resolveGroupOpenState(expandedSubgroupStates.get(key), viewExpandStates.groups),
            );
            for (const key of keys) expandedSubgroupStates.set(key, true);
            applySubgroups(card, groupId);
        });
    }

    /** What the Subgroup components redraw once the shared map has changed. */
    function applySubgroups(card, groupId) {
        for (const subgroup of card.querySelectorAll('.domain-subgroup')) {
            const key = `${groupId}_${subgroup.querySelector('.domain-title').textContent}`;
            subgroup.open = resolveGroupOpenState(expandedSubgroupStates.get(key), viewExpandStates.groups);
        }
    }

    /** The expand-all button, folding the list: cards and domains alike. */
    function collapseAll() {
        viewExpandStates = { ...viewExpandStates, groups: false };
        for (const card of document.querySelectorAll('.group-item')) {
            const groupId = Number(card.dataset.groupId);
            card.open = false;
            expandedGroupStates.set(groupId, false);
            for (const subgroup of card.querySelectorAll('.domain-subgroup')) {
                subgroup.open = false;
                expandedSubgroupStates.set(`${groupId}_${subgroup.querySelector('.domain-title').textContent}`, false);
            }
        }
    }

    async function clickHeaderOf(groupId) {
        const card = document.querySelector(`.group-item[data-group-id="${groupId}"]`);
        card.querySelector('.group-title').dispatchEvent(
            new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
        );
        // The name holds the fold back for the rename gesture; the card folds when the
        // wait is over, which is the moment this stands in for.
        card.open = !card.open;
        // `toggle` is queued rather than fired on the spot, and the card answers it.
        await new Promise((resolve) => setTimeout(resolve, 0));
        return card;
    }

    /** A tab is on screen only if every fold above it is open. */
    function visibleTabsOf(groupId) {
        const card = document.querySelector(`.group-item[data-group-id="${groupId}"]`);
        if (!card.open) return 0;
        return [...card.querySelectorAll('.tab-item')].filter((tab) => {
            const subgroup = tab.closest('.domain-subgroup');
            return !subgroup || subgroup.open;
        }).length;
    }

    it('a card with two domains shows its tabs, not just its domain headers', async () => {
        collapseAll();
        assert.equal(visibleTabsOf(TWO_DOMAINS), 0, 'the list starts folded');

        const card = await clickHeaderOf(TWO_DOMAINS);
        assert.equal(card.open, true, 'the card is open');
        assert.equal(visibleTabsOf(TWO_DOMAINS), 2, 'and both tabs are on screen');
        for (const subgroup of card.querySelectorAll('.domain-subgroup')) {
            assert.equal(subgroup.open, true, `domain ${subgroup.dataset.domain} must be open`);
        }
    });

    it('a card with a single domain keeps working as it always did', async () => {
        collapseAll();
        await clickHeaderOf(ONE_DOMAIN);
        assert.equal(visibleTabsOf(ONE_DOMAIN), 1);
    });

    it('folding the card again leaves nothing on screen', async () => {
        collapseAll();
        await clickHeaderOf(TWO_DOMAINS);
        await clickHeaderOf(TWO_DOMAINS);
        assert.equal(visibleTabsOf(TWO_DOMAINS), 0);
    });

    it('a domain folded by hand is not reopened behind the user', async () => {
        // The list is expanded; the user folds one domain and then the card over it.
        const card = document.querySelector(`.group-item[data-group-id="${TWO_DOMAINS}"]`);
        expandedSubgroupStates.set(`${TWO_DOMAINS}_claude.ai`, false);
        applySubgroups(card, TWO_DOMAINS);
        await clickHeaderOf(TWO_DOMAINS);
        await clickHeaderOf(TWO_DOMAINS);
        assert.equal(visibleTabsOf(TWO_DOMAINS), 1, 'the other domain is still folded, as left');
    });
});
