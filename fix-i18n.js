const fs = require('fs');
let file = fs.readFileSync('src/ui/pages/listGroup/ListGroup.svelte', 'utf8');

file = file.replace(/data-i18n-placeholder="([^"]+)"/g, 'placeholder="{$t(\'$1\')}"');
file = file.replace(/<([^>]+)data-i18n="([^"]+)"([^>]*)>([^<]*)<\//g, "<$1$3>{$t('$2')}</");

fs.writeFileSync('src/ui/pages/listGroup/ListGroup.svelte', file);
console.log('Replaced placeholders and remaining data-i18n');
