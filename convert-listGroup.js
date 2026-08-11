import fs from 'fs';
import path from 'path';

const htmlPath = 'src/ui/listGroup/listGroup.html';
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract SVG defs
const defsMatch = html.match(/<svg style="display: none;" aria-hidden="true">([\s\S]*?)<\/svg>/);
if (defsMatch) {
    const iconsContent = `<svg style="display: none;" aria-hidden="true">${defsMatch[1]}</svg>`;
    fs.mkdirSync('src/ui/components', { recursive: true });
    fs.writeFileSync('src/ui/components/Icons.svelte', iconsContent);
    console.log('Created Icons.svelte');
}

// Extract body content
let bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
let bodyContent = bodyMatch ? bodyMatch[1] : html;

// Remove script tags and the extracted svg
bodyContent = bodyContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
bodyContent = bodyContent.replace(/<svg style="display: none;" aria-hidden="true">[\s\S]*?<\/svg>/, '<Icons />');

// Replace data-i18n attributes with Svelte translations
bodyContent = bodyContent.replace(
    /(<[^>]+)data-i18n="([^"]+)"([^>]*)>(.*?)(<\/[^>]+>)/g,
    (match, startTag, key, endTag, innerText, closeTag) => {
        return `${startTag}${endTag}>{$t('${key}')}${closeTag}`;
    },
);

bodyContent = bodyContent.replace(/(<[^>]+)data-i18n-title="([^"]+)"([^>]*>)/g, (match, startTag, key, endTag) => {
    return `${startTag}title="{$t('${key}')}"${endTag}`;
});

bodyContent = bodyContent.replace(/(<[^>]+)data-i18n-aria-label="([^"]+)"([^>]*>)/g, (match, startTag, key, endTag) => {
    return `${startTag}aria-label="{$t('${key}')}"${endTag}`;
});

// Remove inline onXXX attributes for now, as Svelte uses on:xxx
bodyContent = bodyContent.replace(/\bon[a-z]+="[^"]*"/gi, '');

const svelteContent = `<script>
    import { onMount } from 'svelte';
    import Icons from '../../components/Icons.svelte';
    import { i18nStore, t } from '../../stores/i18nStore.js';
    import { themeStore } from '../../stores/themeStore.js';
    import { listGroupStore } from '../../stores/listGroupStore.js';
    import { groupStore } from '../../stores/groupStore.js';

    onMount(async () => {
        await i18nStore.init();
        await themeStore.init();
        await listGroupStore.init();
        await groupStore.init();
        
        // Temporarily import the vanilla JS initialization to keep existing logic working
        // until we fully migrate groups-renderer.js to Svelte components.
        import('../../../ui/listGroup/listGroup.js').then(module => {
            // Vanilla JS takes over the DOM
        }).catch(err => console.error("Vanilla JS Error:", err));
    });
</script>

${bodyContent.trim()}
`;

fs.mkdirSync('src/ui/pages/listGroup', { recursive: true });
fs.writeFileSync('src/ui/pages/listGroup/ListGroup.svelte', svelteContent);

fs.writeFileSync(
    'src/ui/pages/listGroup/main.js',
    `
import ListGroup from './ListGroup.svelte';
import './listGroup.css';
import '../../styles/fonts.css';
import '../../styles/themes.css';
import '../../styles/hint_content.css';

const app = new ListGroup({
  target: document.body
});

export default app;
`,
);

fs.writeFileSync(
    'src/ui/pages/listGroup/listGroup.html',
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script type="module" src="./main.js"></script>
</head>
<body class="groups-view-active">
</body>
</html>
`,
);

console.log('ListGroup base converted successfully.');
