const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');

const origPath = '/home/lrb85/Proyectos/Intelligent_Tab Group_v1_0_0/src/ui/rules/rules.html';
const svelteDir = '/home/lrb85/Proyectos/Intelligent_Tab_Group_Svelte/src/ui/pages/rules/';

const origHtml = fs.readFileSync(origPath, 'utf8');
const dom = new JSDOM(origHtml);
const document = dom.window.document;

// Get all original elements inside the body
const origElements = document.body.querySelectorAll('*');
const origIds = new Set();
const origClasses = new Set();

origElements.forEach((el) => {
    if (el.id) origIds.add(el.id);
    if (el.classList.length > 0) {
        el.classList.forEach((c) => origClasses.add(c));
    }
});

// Now parse Svelte files
function getSvelteFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getSvelteFiles(fullPath, fileList);
        } else if (fullPath.endsWith('.svelte')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

const svelteFiles = getSvelteFiles(svelteDir);
const svelteIds = new Set();
const svelteClasses = new Set();

const idRegex = /id=(?:"([^"]+)"|'([^']+)')/g;
const classRegex = /class=(?:"([^"]+)"|'([^']+)')/g;

for (const file of svelteFiles) {
    const content = fs.readFileSync(file, 'utf8');

    let match;
    while ((match = idRegex.exec(content)) !== null) {
        const id = match[1] || match[2];
        if (id && !id.includes('{')) svelteIds.add(id); // ignore dynamic ids
    }

    while ((match = classRegex.exec(content)) !== null) {
        const clsAttr = match[1] || match[2];
        if (clsAttr) {
            clsAttr.split(' ').forEach((c) => {
                if (c && !c.includes('{')) svelteClasses.add(c);
            });
        }
    }
}

// Compare
console.log('--- MISSING IDs IN SVELTE ---');
for (const id of origIds) {
    if (!svelteIds.has(id)) {
        console.log(id);
    }
}

console.log('\n--- MISSING CLASSES IN SVELTE ---');
for (const cls of origClasses) {
    if (!svelteClasses.has(cls)) {
        console.log(cls);
    }
}
