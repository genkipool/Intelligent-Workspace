import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/ui/pages/listGroup/modules/groups-renderer.js', 'utf8');

// A crude way to remove these functions.
// We will replace them with empty functions or delete them entirely.
const funcs = [
    'createGroupElement',
    'renderTabsForGroup',
    'createTabElement',
    'updateGroupElement',
    'updateTabElement',
];

for (const func of funcs) {
    const startRegex = new RegExp(`export (async )?function ${func}\\s*\\([^)]*\\)\\s*\\{`);
    const match = content.match(startRegex);
    if (match) {
        let startIndex = match.index;
        let openBraces = 0;
        let endIndex = startIndex + match[0].length;
        openBraces = 1;

        while (openBraces > 0 && endIndex < content.length) {
            if (content[endIndex] === '{') openBraces++;
            if (content[endIndex] === '}') openBraces--;
            endIndex++;
        }

        // Remove the function
        content =
            content.substring(0, startIndex) +
            `// Removed ${func} for Svelte migration\n` +
            content.substring(endIndex);
    }
}

writeFileSync('src/ui/pages/listGroup/modules/groups-renderer.js', content);
