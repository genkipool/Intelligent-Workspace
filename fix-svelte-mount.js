import fs from 'fs';
import path from 'path';

const files = [
    'src/ui/pages/popup/main.js',
    'src/ui/pages/about/main.js',
    'src/ui/pages/customize_hints/main.js',
    'src/ui/pages/pomodoro-dashboard/main.js',
    'src/ui/pages/listGroup/main.js',
    'src/ui/pages/rules/rules.js',
    'src/ui/pages/savedThemes/savedThemes.js',
    'src/ui/pages/offscreen/offscreen.js',
    'src/ui/pages/selection-preview/preview.js',
];

files.forEach((file) => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');

    // Check if it's already using mount
    if (content.includes("from 'svelte'")) return;

    // Pattern to match: const app = new ComponentName({ target: ... });
    const regex = /const\s+(\w+)\s*=\s*new\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\);/;

    if (regex.test(content)) {
        content = `import { mount } from 'svelte';\n` + content.replace(regex, `const $1 = mount($2, $3);`);
        fs.writeFileSync(file, content);
        console.log(`Fixed ${file}`);
    } else {
        console.log(`Could not find Svelte 4 instantiation in ${file}`);
    }
});
