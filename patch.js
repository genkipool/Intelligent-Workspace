import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/ui/pages/listGroup/modules/groups-renderer.js', 'utf8');

// Replace the DOM logic in performRender
const startMarker =
    "const currentDomElements = [...dom.groupListContainer.children].filter(el => el.classList.contains('group-item'));";
const endMarker = 'state.restoredGroupIds.clear();';

const patchCode = `
        import { listGroupStore } from '../../stores/listGroupStore.js';
        listGroupStore.updateState({
            renderedGroups: finalGroupData,
            hiddenGroupsData: hiddenGroupData,
            renderContext: {
                groupInfoMap,
                groupPrefixState,
                seenTabIds,
                duplicateUrlSet,
                screenshotData,
                notesData,
                customRules,
                pageModes
            }
        });

        if (state.isInitialRender && state.viewExpandStates.groups) {
            finalGroupData.forEach(item => {
                const groupId = item.group.id;
                if (!isNaN(groupId)) {
                    state.expandedGroupStates.set(groupId, true);
                    const tabs = item.tabs || [];
                    const tabsByDomain = tabs.reduce((acc, tab) => {
                        try {
                            const domain = new URL(tab.url).hostname.replace(/^www\./, '');
                            (acc[domain] = acc[domain] || []).push(tab);
                        } catch (e) {
                            (acc['other'] = acc['other'] || []).push(tab);
                        }
                        return acc;
                    }, {});
                    Object.keys(tabsByDomain).forEach(domain => {
                        const subGroupKey = \`\${groupId}_\${domain}\`;
                        state.expandedSubgroupStates.set(subGroupKey, true);
                    });
                }
            });
        }
        state.isInitialRender = false;

        initDragAndDrop();
        fn.applySearchAndFilter();
        fn.updateExpandAllButtonState();
        updateDuplicateCountBadge();
        handleFocusAfterRender();
        scrollToActiveGroupIfNeeded();

        state.restoredGroupIds.clear();
`;

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker) + endMarker.length;

if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    content = content.substring(0, startIdx) + patchCode + content.substring(endIdx);
} else {
    console.error('Markers not found');
}

writeFileSync('src/ui/pages/listGroup/modules/groups-renderer.js', content);
