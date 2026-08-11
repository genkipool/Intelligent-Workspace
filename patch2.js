import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/ui/pages/listGroup/modules/groups-renderer.js', 'utf8');

// remove the inline import
content = content.replace("        import { listGroupStore } from '../../stores/listGroupStore.js';", '');

// add the import at the top
if (!content.includes('import { listGroupStore }')) {
    content = content.replace(
        "import { fn } from './fn.js';",
        "import { fn } from './fn.js';\nimport { listGroupStore } from '../../stores/listGroupStore.js';",
    );
}

writeFileSync('src/ui/pages/listGroup/modules/groups-renderer.js', content);
