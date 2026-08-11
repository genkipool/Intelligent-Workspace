const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.svelte')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('src/ui/pages');
files.forEach((file) => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // fix data-i18n-placeholder
    content = content.replace(/data-i18n-placeholder="([^"]+)"/g, 'placeholder="{$t(\'$1\')}"');
    // fix data-i18n="..."
    content = content.replace(/<([^>]+)data-i18n="([^"]+)"([^>]*)>([^<]*)<\//g, "<$1$3>{$t('$2')}</");

    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log('Fixed', file);
    }
});
